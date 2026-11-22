-- N224 / X1: owner-scoped proposal creation for ChatGPT/Claude through the existing MCP study command.
-- No model API key, new credential, scheduler, or implicit approval is introduced.
-- Preserve the existing atlas_command implementation for approve/reject and other Atlas resources.
create function public.atlas_links_mcp_command(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $atlas_links_mcp$
declare
 v_owner uuid := (select auth.uid());
 v_role text := pg_catalog.current_setting('role',true);
 v_op text := p->>'operation';
 v_opid uuid;
 v_patch jsonb := coalesce(p->'patch','{}'::jsonb);
 v_bad text;
 v_from uuid;
 v_to uuid;
 v_kind text;
 v_conf real;
 v_reason text;
 v_from_hash text;
 v_to_hash text;
 v_from_version integer;
 v_to_version integer;
 v_current_from integer;
 v_current_to integer;
 v_row public.atlas_links%rowtype;
 v_previous jsonb;
 v_result jsonb;
 v_action bigint;
begin
 -- Decisions keep their original audited owner-bound implementation and receipts.
 if v_op is distinct from 'create' then raise exception 'Only proposed-link creation is supported';end if;
 if v_owner is null or v_role not in ('authenticated','service_role') then
   raise exception 'Authenticated owner required';
 end if;
 if p is null or pg_catalog.jsonb_typeof(p) is distinct from 'object'
     or p->>'schemaVersion' is distinct from '1'
     or p->>'resource' is distinct from 'atlas_link_proposals'
     or pg_catalog.jsonb_typeof(p->'operationId') is distinct from 'string' then
   raise exception 'Invalid Atlas link command envelope';
 end if;
 select key into v_bad from pg_catalog.jsonb_object_keys(p) as keys(key)
 where key not in ('schemaVersion','resource','operation','operationId','target','expectedVersion','patch') limit 1;
 if v_bad is not null then raise exception 'Unknown command field %',v_bad; end if;
 if p?'target' and p->'target'<>'{}'::jsonb then
   raise exception 'Creating a proposal cannot target an existing record';
 end if;
 if p?'expectedVersion' and p->>'expectedVersion'<>'0' then
   raise exception 'Proposal create expectedVersion must be 0';
 end if;
 if pg_catalog.jsonb_typeof(v_patch) is distinct from 'object' then
   raise exception 'Atlas link patch must be an object';
 end if;
 select key into v_bad from pg_catalog.jsonb_object_keys(v_patch) as keys(key)
 where key not in ('from_id','to_id','kind','confidence','rationale','from_hash','to_hash','from_version','to_version') limit 1;
 if v_bad is not null then raise exception 'Unknown Atlas link field %',v_bad; end if;
 if (select count(*) from pg_catalog.jsonb_object_keys(v_patch))<7
     or not (v_patch?'from_id' and v_patch?'to_id' and v_patch?'kind'
             and v_patch?'confidence' and v_patch?'rationale' and v_patch?'from_version' and v_patch?'to_version') then
   raise exception 'Proposal requires from_id, to_id, kind, confidence, rationale and endpoint versions';
 end if;
 if pg_catalog.jsonb_typeof(v_patch->'from_id') is distinct from 'string'
     or pg_catalog.jsonb_typeof(v_patch->'to_id') is distinct from 'string'
     or pg_catalog.jsonb_typeof(v_patch->'kind') is distinct from 'string'
     or pg_catalog.jsonb_typeof(v_patch->'confidence') is distinct from 'number'
     or pg_catalog.jsonb_typeof(v_patch->'rationale') is distinct from 'string'
     or pg_catalog.jsonb_typeof(v_patch->'from_version') is distinct from 'number'
     or pg_catalog.jsonb_typeof(v_patch->'to_version') is distinct from 'number' then
   raise exception 'Invalid Atlas link value types';
 end if;
 v_from := (v_patch->>'from_id')::uuid;
 v_to := (v_patch->>'to_id')::uuid;
 if (v_patch->>'from_version') !~ '^[1-9][0-9]*
 v_kind := v_patch->>'kind';
 v_conf := (v_patch->>'confidence')::real;
 v_reason := pg_catalog.btrim(v_patch->>'rationale');
 if v_from=v_to then raise exception 'Atlas link cannot relate a concept to itself'; end if;
 if v_kind not in ('equivalent','generalises','instance_of','uses_technique','contrasts','analogous','part_of') then
   raise exception 'Invalid typed Atlas link kind';
 end if;
 if not (v_conf between 0 and 1) then
   raise exception 'Confidence must be a finite number from 0 to 1';
 end if;
 if pg_catalog.char_length(v_reason) not between 1 and 200 or
     pg_catalog.array_length(pg_catalog.regexp_split_to_array(v_reason,'[[:space:]]+'),1)>20 then
   raise exception 'A nonempty rationale of at most 20 words and 200 characters is required';
 end if;
 if (v_patch?'from_hash')<>(v_patch?'to_hash') then
   raise exception 'Both concept content hashes must be supplied together';
 end if;
 if v_patch?'from_hash' then
   if pg_catalog.jsonb_typeof(v_patch->'from_hash') is distinct from 'string'
       or pg_catalog.jsonb_typeof(v_patch->'to_hash') is distinct from 'string'
       or (v_patch->>'from_hash') !~ '^[0-9a-f]{1,8}$'
       or (v_patch->>'to_hash') !~ '^[0-9a-f]{1,8}$' then
     raise exception 'Invalid concept content hash';
   end if;
   v_from_hash := v_patch->>'from_hash';
   v_to_hash := v_patch->>'to_hash';
 end if;

 v_opid := (p->>'operationId')::uuid;
 -- Serialize same-owner graph edits; do not allow a race with a concept merge.
 perform pg_catalog.pg_advisory_xact_lock(
   pg_catalog.hashtextextended('atlas-owner:'||v_owner::text,0));
 select result into v_previous from public.command_receipts
 where user_id=v_owner and operation_id=v_opid;
 if found then
   if v_previous->'_request'=p then return v_previous-'_request';end if;
   return pg_catalog.jsonb_build_object('status','conflict','operationId',v_opid,
     'reason','operationId reused with a different payload','actionNo',null,'changed','[]'::jsonb);
 end if;
 select version into v_current_from from public.concepts
 where user_id=v_owner and id=v_from for update;
 if not found then raise exception 'Atlas link source not found for owner';end if;
 select version into v_current_to from public.concepts
 where user_id=v_owner and id=v_to for update;
 if not found then raise exception 'Atlas link target not found for owner';end if;
 if v_current_from<>v_from_version or v_current_to<>v_to_version then
   raise exception 'Concept version conflict: refresh graph before proposing';end if;
 if exists(select 1 from public.atlas_links l
   where l.user_id=v_owner and l.kind=v_kind and
    ((l.from_id=v_from and l.to_id=v_to) or
     (v_kind in ('equivalent','analogous','contrasts') and l.from_id=v_to and l.to_id=v_from))) then
   raise exception 'Typed Atlas relationship already exists; review it rather than duplicating it';
 end if;

 if v_role<>'service_role' then
   perform pg_catalog.set_config('lemma.source','app',true);
   perform pg_catalog.set_config('lemma.tool','atlas_links_mcp',true);
 end if;
 perform pg_catalog.set_config('lemma.summary','Atlas link proposal',true);
 insert into public.atlas_links(user_id,from_id,to_id,kind,status,origin,confidence,rationale,from_hash,to_hash)
 values(v_owner,v_from,v_to,v_kind,'proposed',
   case when v_role='service_role' then 'tutor' else 'user' end,
   v_conf,v_reason,v_from_hash,v_to_hash)
 returning * into v_row;

 select no into v_action from public.actions
 where user_id=v_owner and txid=pg_catalog.txid_current();
 if v_action is null then raise exception 'Atlas proposal lacks undoable audit action';end if;
 v_result := pg_catalog.jsonb_build_object('operationId',v_opid,'status','ok',
   'actionNo',v_action,'changed',pg_catalog.jsonb_build_array(
   pg_catalog.jsonb_build_object('resource','atlas_links','id',v_row.id,'version',v_row.version)),
   'proposal',pg_catalog.jsonb_build_object('id',v_row.id,'status',v_row.status,'kind',v_row.kind));
 insert into public.command_receipts(user_id,operation_id,resource,result)
 values(v_owner,v_opid,'atlas_link_proposals',v_result||pg_catalog.jsonb_build_object('_request',p));
 return v_result;
end
$atlas_links_mcp$;

revoke all on function public.atlas_links_mcp_command(jsonb) from public,anon;
grant execute on function public.atlas_links_mcp_command(jsonb) to authenticated,service_role;
-- Additive-only registry entry: atlas_links approval and rejection remain unchanged.
insert into public.lemma_command_resources(resource,command_fn,mcp_ok,"schema")
 values('atlas_link_proposals','atlas_links_mcp_command',true,
 '{"operations":["create"],"fields":["from_id","to_id","kind","confidence","rationale","from_hash","to_hash","from_version","to_version"]}'::jsonb);
