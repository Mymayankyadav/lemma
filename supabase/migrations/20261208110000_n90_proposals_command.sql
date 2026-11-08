-- N90: registered MCP proposal transitions through the existing N92 functions.
create function public.proposals_command(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $n90$
declare
 owner_id uuid:=(select auth.uid());
 caller_role text:=pg_catalog.current_setting('role',true);
 oid uuid; op text; target_id uuid; expected integer;
 patch jsonb:=coalesce(p->'patch','{}'::jsonb);
 target jsonb:=coalesce(p->'target','{}'::jsonb);
 before_row public.proposals%rowtype;
 stored jsonb; reply jsonb; transition jsonb; changed jsonb;
 action_no bigint; previous_version integer; field text;
begin
 if owner_id is null or caller_role not in ('authenticated','service_role')
  then raise exception 'Authentication required';end if;
 if p is null or pg_catalog.jsonb_typeof(p) is distinct from 'object'
  or pg_catalog.jsonb_typeof(p->'operationId') is distinct from 'string'
  or p->>'resource' is distinct from 'proposals'
  or pg_catalog.jsonb_typeof(p->'schemaVersion') is distinct from 'number'
  or p->>'schemaVersion' is distinct from '1'
  then raise exception 'Invalid proposal command envelope';end if;
 oid:=(p->>'operationId')::uuid;
 perform pg_catalog.pg_advisory_xact_lock(
   pg_catalog.hashtextextended(owner_id::text||':'||oid::text,0));
 select result into stored from public.command_receipts
  where user_id=owner_id and operation_id=oid;
 if found then
  if stored->'_request'=p then return stored-'_request';end if;
  return pg_catalog.jsonb_build_object('operationId',oid,'status','conflict',
   'changed','[]'::jsonb,'actionNo',null,'conflict',
   pg_catalog.jsonb_build_object('reason','operationId reused with a different payload'));
 end if;
 select key into field from pg_catalog.jsonb_object_keys(p) as t(key)
  where key not in ('schemaVersion','operationId','resource','operation',
    'target','expectedVersion','patch') limit 1;
 if field is not null then raise exception 'Unknown proposal command field: %',field;end if;
 op:=p->>'operation';
 if op not in ('withdraw','revise','reopen') or op is null
  then raise exception 'Unsupported proposal operation';end if;
 if pg_catalog.jsonb_typeof(target) is distinct from 'object'
  or pg_catalog.jsonb_typeof(target->'id') is distinct from 'string'
  or pg_catalog.jsonb_typeof(patch) is distinct from 'object'
  then raise exception 'Proposal target and object patch required';end if;
 select key into field from pg_catalog.jsonb_object_keys(target) as t(key)
  where key <> 'id' limit 1;
 if field is not null then raise exception 'Unknown proposal target field';end if;
 select key into field from pg_catalog.jsonb_object_keys(patch) as t(key)
  where op <> 'revise' or key not in ('payload','citations','base_target_versions') limit 1;
 if field is not null then raise exception 'Unknown proposal patch field: %',field;end if;
 if op='revise' and
  (pg_catalog.jsonb_typeof(patch->'payload') is distinct from 'object'
   or (patch?'citations' and pg_catalog.jsonb_typeof(patch->'citations') is distinct from 'array')
   or (patch?'base_target_versions' and
      pg_catalog.jsonb_typeof(patch->'base_target_versions') is distinct from 'object'))
  then raise exception 'Invalid revision payload and snapshots';end if;
 if pg_catalog.jsonb_typeof(p->'expectedVersion') is distinct from 'number'
  or p->>'expectedVersion' !~ '^[1-9][0-9]*$'
  or (p->>'expectedVersion')::numeric > 2147483647
  then raise exception 'Positive expectedVersion required';end if;
 expected:=(p->>'expectedVersion')::integer;
 target_id:=(target->>'id')::uuid;
 select * into before_row from public.proposals
  where id=target_id and user_id=owner_id for update;
 if not found then raise exception 'Proposal not found for owner';end if;
 if before_row.version <> expected then
  reply:=pg_catalog.jsonb_build_object('operationId',oid,'status','conflict',
   'actionNo',null,'changed','[]'::jsonb,
   'conflict',pg_catalog.jsonb_build_object('expectedVersion',expected,
     'currentVersion',before_row.version));
 else
  perform pg_catalog.set_config('lemma.source',
   case when caller_role='service_role' and
      pg_catalog.current_setting('lemma.source',true) in ('chatgpt','claude','other','system')
    then pg_catalog.current_setting('lemma.source',true)
    when caller_role='service_role' then 'other' else 'app' end,true);
  perform pg_catalog.set_config('lemma.tool','proposals_command',true);
  perform pg_catalog.set_config('lemma.summary',
    pg_catalog.left('Proposal '||op,200),true);
  if op='withdraw' then
   transition:=public.withdraw_proposal(target_id);
  elsif op='reopen' then
   transition:=public.reopen_proposal(target_id);
  else
   transition:=public.revise_proposal(target_id,patch->'payload',
     patch->'citations',patch->'base_target_versions');
  end if;
  select version into previous_version from public.proposals
   where user_id=owner_id and id=target_id;
  changed:=pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
   'resource','proposals','id',target_id,'version',previous_version));
  if op='revise' then
   changed:=changed || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'resource','proposals','id',transition->>'id',
    'version',(transition->>'version')::integer));
  end if;
  select no into action_no from public.actions
   where user_id=owner_id and txid=pg_catalog.txid_current();
  if action_no is null then raise exception 'Proposal transition has no journal action';end if;
  reply:=pg_catalog.jsonb_build_object('operationId',oid,'status','ok',
   'actionNo',action_no,'changed',changed,'proposal',transition);
 end if;
 insert into public.command_receipts(user_id,operation_id,resource,result)
 values(owner_id,oid,'proposals',reply||pg_catalog.jsonb_build_object('_request',p));
 return reply;
end
$n90$;
revoke all on function public.proposals_command(jsonb) from public,anon;
grant execute on function public.proposals_command(jsonb) to authenticated,service_role;

insert into public.lemma_command_resources(resource,command_fn,mcp_ok,"schema")
values('proposals','proposals_command',true,
 '{"operations":["withdraw","revise","reopen"],
 "fields":["project_id","session_id","kind","payload","reason","status",
 "origin","payload_version","base_target_versions","group_id","citations",
 "withdrawn_at","revised_from"]}'::jsonb)
on conflict(resource) do update set "schema"=excluded."schema";
