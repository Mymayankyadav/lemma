-- N225 / X1: owner-scoped proposal creation for ChatGPT/Claude through the existing MCP study command.
-- No model API key, new credential, scheduler, or implicit approval is introduced.
-- Preserve the existing atlas_command implementation for approve/reject and other Atlas resources.
-- Computed field on concepts. MCP reads and proposal writes use the same hash,
-- with the Atlas FNV-1a format over UTF-16 code units.
create function public.content_hash(public.concepts)
returns text language plpgsql immutable set search_path='' as $atlas_hash$
declare
 -- Match ECMAScript String.trim whitespace and line terminators for blurbs.
 v_trim_chars constant text := U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
 v_name text;
 v_text text;
 v_ch text;
 v_cp integer;
 v_unit integer;
 v_hash bigint := 2166136261;
 v_i integer;
begin
 v_name := pg_catalog.btrim(pg_catalog.regexp_replace(
   pg_catalog.lower(pg_catalog.normalize(coalesce(($1).name,''),'NFKC')),
   '[^[:alnum:]]+',' ','g'));
 v_text := v_name||'|'||pg_catalog.btrim(coalesce(($1).blurb,''),v_trim_chars);
 for v_i in 1..pg_catalog.char_length(v_text) loop
   v_ch := pg_catalog.substr(v_text,v_i,1);
   v_cp := pg_catalog.ascii(v_ch);
   if v_cp>65535 then
     v_unit := 55296 + ((v_cp-65536)/1024);
     v_hash := ((v_hash # v_unit::bigint)*16777619)%4294967296;
     v_unit := 56320 + ((v_cp-65536)%1024);
   else
     v_unit := v_cp;
   end if;
   v_hash := ((v_hash # v_unit::bigint)*16777619)%4294967296;
 end loop;
 return pg_catalog.to_hex(v_hash);
end
$atlas_hash$;

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
 v_stored_from_hash text;
 v_stored_to_hash text;
 v_old public.atlas_links%rowtype;
 v_expected_rejected integer;
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
 where key not in ('from_id','to_id','kind','confidence','rationale','from_hash','to_hash','from_version','to_version','expected_rejected_version') limit 1;
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
 if (v_patch->>'from_version') !~ '^[1-9][0-9]*$'
    or (v_patch->>'to_version') !~ '^[1-9][0-9]*$'
    or (v_patch->>'from_version')::numeric>2147483647
    or (v_patch->>'to_version')::numeric>2147483647 then
   raise exception 'Positive endpoint versions required';end if;
 v_from_version := (v_patch->>'from_version')::integer;
 v_to_version := (v_patch->>'to_version')::integer;
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
 if not (v_patch?'from_hash' and v_patch?'to_hash') then
   raise exception 'Both concept content hashes are required';
 end if;
 if true then
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
 select c.version,public.content_hash(c) into v_current_from,v_stored_from_hash from public.concepts c
 where c.user_id=v_owner and c.id=v_from for update;
 if not found then raise exception 'Atlas link source not found for owner';end if;
 select c.version,public.content_hash(c) into v_current_to,v_stored_to_hash from public.concepts c
 where c.user_id=v_owner and c.id=v_to for update;
 if not found then raise exception 'Atlas link target not found for owner';end if;
 if v_current_from<>v_from_version or v_current_to<>v_to_version then
   raise exception 'Concept version conflict: refresh graph before proposing';end if;
 if v_stored_from_hash<>v_from_hash or v_stored_to_hash<>v_to_hash then
   raise exception 'Concept content hash mismatch: refresh graph before proposing';end if;
 -- Legacy uniqueness is directional. Check both orientations before
 -- selecting a rejected row, so approved reverse links cannot be hidden.
 if exists(select 1 from public.atlas_links l
   where l.user_id=v_owner and l.kind=v_kind
     and l.status in ('proposed','approved')
     and ((l.from_id=v_from and l.to_id=v_to) or
       (v_kind in ('equivalent','analogous','contrasts') and l.from_id=v_to and l.to_id=v_from)))
 then raise exception 'Typed Atlas relationship already exists; review it rather than duplicating it';end if;
 select * into v_old from public.atlas_links l
 where l.user_id=v_owner and l.kind=v_kind and l.status='rejected'
 and ((l.from_id=v_from and l.to_id=v_to) or
  (v_kind in ('equivalent','analogous','contrasts') and l.from_id=v_to and l.to_id=v_from))
 order by case when l.from_id=v_from then 0 else 1 end limit 1 for update;
 if found then
   if v_old.status<>'rejected' then
     raise exception 'Typed Atlas relationship already exists; review it rather than duplicating it';
   end if;
   if pg_catalog.jsonb_typeof(v_patch->'expected_rejected_version') is distinct from 'number'
      or (v_patch->>'expected_rejected_version') !~ '^[1-9][0-9]*$'
      or (v_patch->>'expected_rejected_version')::numeric>2147483647
      or (v_patch->>'expected_rejected_version')::integer<>v_old.version then
     raise exception 'Rejected proposal version conflict: refresh before resubmission';
   end if;
   if v_old.from_id=v_from then
     if v_old.from_hash is not distinct from v_from_hash and
        v_old.to_hash is not distinct from v_to_hash then
       raise exception 'Rejected proposal unchanged: edit concept content before resubmission';
     end if;
   elsif v_old.from_hash is not distinct from v_to_hash and
         v_old.to_hash is not distinct from v_from_hash then
     raise exception 'Rejected proposal unchanged: edit concept content before resubmission';
   end if;
 elsif v_patch?'expected_rejected_version' then
   raise exception 'No rejected proposal to resubmit';
 end if;

 if v_role<>'service_role' then
   perform pg_catalog.set_config('lemma.source','app',true);
   perform pg_catalog.set_config('lemma.tool','atlas_links_mcp',true);
 end if;
 perform pg_catalog.set_config('lemma.summary','Atlas link proposal',true);
 if v_old.id is not null then
   -- The rejected version is retained in the undoable action journal.
   update public.atlas_links set status='proposed',confidence=v_conf,rationale=v_reason,
     from_hash=case when from_id=v_from then v_from_hash else v_to_hash end,
     to_hash=case when to_id=v_to then v_to_hash else v_from_hash end,
     origin=case when v_role='service_role' then 'tutor' else 'user' end
   where id=v_old.id and user_id=v_owner and version=v_old.version
   returning * into v_row;
 else
   insert into public.atlas_links(user_id,from_id,to_id,kind,status,origin,confidence,rationale,from_hash,to_hash)
   values(v_owner,v_from,v_to,v_kind,'proposed',
     case when v_role='service_role' then 'tutor' else 'user' end,
     v_conf,v_reason,v_from_hash,v_to_hash)
   returning * into v_row;
 end if;

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
end;
$atlas_links_mcp$;

revoke all on function public.content_hash(public.concepts) from public,anon;
grant execute on function public.content_hash(public.concepts) to authenticated,service_role;
revoke all on function public.atlas_links_mcp_command(jsonb) from public,anon;
grant execute on function public.atlas_links_mcp_command(jsonb) to authenticated,service_role;
-- Additive-only registry entry: atlas_links approval and rejection remain unchanged.
insert into public.lemma_command_resources(resource,command_fn,mcp_ok,"schema")
 values('atlas_link_proposals','atlas_links_mcp_command',true,
 '{"operations":["create"],"fields":["from_id","to_id","kind","confidence","rationale","from_hash","to_hash","from_version","to_version","expected_rejected_version"]}'::jsonb);
