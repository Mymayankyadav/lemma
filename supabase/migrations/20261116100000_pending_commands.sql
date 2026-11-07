-- N53: owner-scoped, bounded pending decisions. All writes are performed
-- by the reviewed command functions below, never by client table mutations.
create table public.pending_commands (
 id uuid primary key default pg_catalog.gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 operation_id uuid not null,
 resource text not null check(resource ~ '^[a-z_][a-z0-9_]*$'),
 payload jsonb not null check(pg_catalog.jsonb_typeof(payload)='object'),
 not_before timestamptz not null,
 undo_until timestamptz not null,
 status text not null default 'scheduled' check
   (status in ('scheduled','executing','succeeded','failed','cancelled')),
 result jsonb,
 error_class text,
 version integer not null default 1 check(version>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(user_id,id),
 unique(user_id,operation_id),
 constraint pending_commands_undo_window check(undo_until>not_before),
 constraint pending_commands_result_object check(result is null or
   pg_catalog.jsonb_typeof(result)='object')
);
create index pending_commands_due on public.pending_commands
 (not_before,id) where status='scheduled';
create index pending_commands_owner_created on public.pending_commands
 (user_id,created_at desc,id);
alter table public.pending_commands enable row level security;
create policy pending_commands_owner_select on public.pending_commands
 for select to authenticated using(user_id=(select auth.uid()));
grant select on public.pending_commands to authenticated;
grant select,insert,update,delete on public.pending_commands to service_role;

-- Keep a stable owner operationId for every scheduled execution, even across
-- timeout/retry. Command receipts use a DIFFERENT id for schedule/extend/cancel.
alter table public.pending_commands add constraint pending_command_registered_resource_fk
 foreign key(resource) references public.lemma_command_resources(resource);

create function public.pending_command(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $pending$
declare
 v_owner uuid; v_control_id uuid; v_op text; v_resource text;
 v_payload jsonb; v_schema jsonb; v_before timestamptz;
 v_until timestamptz; v_id uuid; v_expected integer; v_bad text;
 v_current public.pending_commands%rowtype;
 v_stored jsonb; v_receipt jsonb; v_version integer;
begin
 -- The caller's verified auth claim, not anything inside p, is the owner.
 if pg_catalog.current_setting('role',true)<>'authenticated' then
  raise exception 'Authenticated owner required'; end if;
 v_owner:=(select auth.uid());
 if v_owner is null then raise exception 'Owner required'; end if;
 if p is null or pg_catalog.jsonb_typeof(p) is distinct from 'object' then
  raise exception 'Pending command must be an object'; end if;
 select key into v_bad from pg_catalog.jsonb_object_keys(p) as fields(key)
  where key<>all(array['schemaVersion','operationId','operation','target',
    'expectedVersion','resource','payload','notBefore','undoUntil']) limit 1;
 if v_bad is not null then raise exception 'Unknown pending command field'; end if;
 if pg_catalog.jsonb_typeof(p->'schemaVersion') is distinct from 'number'
    or p->>'schemaVersion'<>'1'
    or pg_catalog.jsonb_typeof(p->'operationId') is distinct from 'string' then
  raise exception 'Invalid pending command envelope'; end if;
 v_control_id:=(p->>'operationId')::uuid;
 v_op:=p->>'operation';
 if v_op not in ('schedule','extend','cancel') or v_op is null then
  raise exception 'Unknown pending operation'; end if;
 perform pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended(v_owner::text||':'||v_control_id::text,0));
 select r.result into v_stored from public.command_receipts r
  where r.user_id=v_owner and r.operation_id=v_control_id;
 if found then
  if v_stored->'_request'=p then return v_stored-'_request'; end if;
  return pg_catalog.jsonb_build_object('operationId',v_control_id,
    'status','conflict','changed','[]'::jsonb,'actionNo',null,
    'conflict',pg_catalog.jsonb_build_object('reason','operationId reused'));
 end if;
 if v_op='schedule' then
  if p?'target' or p?'expectedVersion' then
   raise exception 'Schedule has no target/version'; end if;
  v_resource:=p->>'resource';
  v_payload:=p->'payload';
  if pg_catalog.jsonb_typeof(v_payload) is distinct from 'object'
     or pg_catalog.jsonb_typeof(v_payload->'operationId') is distinct from 'string'
     or pg_catalog.jsonb_typeof(v_payload->'schemaVersion') is distinct from 'number'
     or v_payload->>'schemaVersion'<>'1'
     or v_payload->>'resource' is distinct from v_resource
     or v_payload->>'operation' is null
     or v_payload ?| array['user_id','userId','ownerId','p_user'] then
   raise exception 'Invalid owner-free command payload'; end if;
  -- Prevent a control receipt from consuming the intended execution receipt.
  if (v_payload->>'operationId')::uuid=v_control_id then
   raise exception 'Control and execution operation IDs must differ'; end if;
  select r."schema" into v_schema from public.lemma_command_resources r
   where r.resource=v_resource and r.mcp_ok;
  if not found or not(v_schema->'operations' ? (v_payload->>'operation')) then
   raise exception 'Unregistered or disabled command operation'; end if;
  if exists(select 1 from public.command_receipts r
    where r.user_id=v_owner and r.operation_id=(v_payload->>'operationId')::uuid)
    then raise exception 'Execution operationId already used'; end if;
 else
  if p?'resource' or p?'payload' then
   raise exception 'Control operation cannot change the command payload'; end if;
  if pg_catalog.jsonb_typeof(p->'target') is distinct from 'object'
     or pg_catalog.jsonb_typeof(p->'target'->'id') is distinct from 'string'
     or (select pg_catalog.count(*) from pg_catalog.jsonb_object_keys(p->'target'))<>1 then
   raise exception 'Target UUID required'; end if;
  v_id:=(p->'target'->>'id')::uuid;
  if pg_catalog.jsonb_typeof(p->'expectedVersion') is distinct from 'number'
     or p->>'expectedVersion' !~ '^[1-9][0-9]*$'
     or (p->>'expectedVersion')::numeric>2147483647 then
   raise exception 'Positive expectedVersion required'; end if;
  v_expected:=(p->>'expectedVersion')::integer;
  select * into v_current from public.pending_commands
   where id=v_id and user_id=v_owner for update;
  if not found then raise exception 'Pending command not found'; end if;
 end if;
 if v_op='cancel' then
  if p?'notBefore' or p?'undoUntil' then
   raise exception 'Cancel takes no timestamps'; end if;
 else
  if v_op='schedule' and (not(p?'notBefore') or not(p?'undoUntil')) then
    raise exception 'Schedule requires both timestamps'; end if;
  if v_op='extend' and not(p?'notBefore' or p?'undoUntil') then
    raise exception 'Extend requires a new timestamp'; end if;
  if p?'notBefore' then
    if pg_catalog.jsonb_typeof(p->'notBefore') is distinct from 'string'
       or p->>'notBefore' !~
        '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$'
       then raise exception 'notBefore must include an ISO offset'; end if;
    v_before:=(p->>'notBefore')::timestamptz;
  else v_before:=v_current.not_before; end if;
  if p?'undoUntil' then
    if pg_catalog.jsonb_typeof(p->'undoUntil') is distinct from 'string'
       or p->>'undoUntil' !~
        '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$'
       then raise exception 'undoUntil must include an ISO offset'; end if;
    v_until:=(p->>'undoUntil')::timestamptz;
  else v_until:=v_current.undo_until; end if;
  if v_before<pg_catalog.clock_timestamp() or v_until<=v_before then
   raise exception 'Invalid future execution/undo window'; end if;
  if v_op='extend' and (v_before<v_current.not_before or
      v_until<v_current.undo_until) then
   raise exception 'Extend cannot shorten an existing window'; end if;
 end if;
 if v_op='schedule' then
  insert into public.pending_commands(
   user_id,operation_id,resource,payload,not_before,undo_until)
   values(v_owner,(v_payload->>'operationId')::uuid,v_resource,
     v_payload,v_before,v_until) returning id,version into v_id,v_version;
 else
  if v_current.version<>v_expected or v_current.status<>'scheduled' then
   v_receipt:=pg_catalog.jsonb_build_object('operationId',v_control_id,
    'status','conflict','actionNo',null,'changed','[]'::jsonb,
    'conflict',pg_catalog.jsonb_build_object(
     'reason',case when v_current.status<>'scheduled' then 'already final or executing'
       else 'stale version' end,
     'currentVersion',v_current.version,'currentStatus',v_current.status));
  else
   update public.pending_commands set
     not_before=case when v_op='extend' then v_before else not_before end,
     undo_until=case when v_op='extend' then v_until else undo_until end,
     status=case when v_op='cancel' then 'cancelled' else status end,
     version=version+1,updated_at=pg_catalog.clock_timestamp()
    where id=v_id and user_id=v_owner returning version into v_version;
  end if;
 end if;
 if v_receipt is null then
  v_receipt:=pg_catalog.jsonb_build_object('operationId',v_control_id,
   'status','ok','actionNo',null,
   'changed',pg_catalog.jsonb_build_array(
     pg_catalog.jsonb_build_object('id',v_id,'version',v_version)));
 end if;
 insert into public.command_receipts(user_id,operation_id,resource,result)
  values(v_owner,v_control_id,'pending_commands',
    v_receipt||pg_catalog.jsonb_build_object('_request',p));
 return v_receipt;
end
$pending$;
revoke all on function public.pending_command(jsonb) from public,anon,service_role;
grant execute on function public.pending_command(jsonb) to authenticated;

-- The service-role tick is the ONLY executor. SKIP LOCKED prevents a second
-- concurrent tick from running a claimed row. The execution receipt's stable
-- operationId makes a recovered retry safe, even following an uncertain ack.
create function public.lemma_run_due_commands()
returns jsonb language plpgsql security definer set search_path='' as $worker$
declare
 v_row public.pending_commands%rowtype;
 v_receipt jsonb; v_done integer:=0; v_failed integer:=0;
 v_claims text; v_source text; v_tool text; v_summary text; v_class text;
begin
 if pg_catalog.current_setting('role',true)<>'service_role' then
  raise exception 'Service role required'; end if;
 v_claims:=pg_catalog.current_setting('request.jwt.claims',true);
 v_source:=pg_catalog.current_setting('lemma.source',true);
 v_tool:=pg_catalog.current_setting('lemma.tool',true);
 v_summary:=pg_catalog.current_setting('lemma.summary',true);
 for v_row in
  select * from public.pending_commands
   where status='scheduled' and not_before<=pg_catalog.clock_timestamp()
   order by not_before,id for update skip locked limit 20
 loop
  begin
   update public.pending_commands set status='executing',
     version=version+1,updated_at=pg_catalog.clock_timestamp()
    where id=v_row.id and user_id=v_row.user_id;
   -- The registry maps resources to reviewed command functions. Caller
   -- payload never supplies a function name or an owner ID.
   v_receipt:=public.mcp_command(v_row.user_id,'other',v_row.payload);
   if v_receipt->>'status'='ok' and
      pg_catalog.jsonb_typeof(v_receipt->'changed')='array' then
    update public.pending_commands set status='succeeded',
      result=v_receipt,error_class=null,
      version=version+1,updated_at=pg_catalog.clock_timestamp()
     where id=v_row.id and user_id=v_row.user_id;
    v_done:=v_done+1;
   else
    update public.pending_commands set status='failed',
      result=case when pg_catalog.jsonb_typeof(v_receipt)='object'
        then v_receipt else null end,
      error_class='command_conflict',
      version=version+1,updated_at=pg_catalog.clock_timestamp()
     where id=v_row.id and user_id=v_row.user_id;
    v_failed:=v_failed+1;
   end if;
  exception when others then
   -- The per-row subtransaction rolls back any partially executed command.
   -- Never persist internal SQL messages (may include private owner data).
   get stacked diagnostics v_class = returned_sqlstate;
   update public.pending_commands set status='failed',result=null,
     error_class=pg_catalog.left(v_class,5),
     version=version+1,updated_at=pg_catalog.clock_timestamp()
    where id=v_row.id and user_id=v_row.user_id;
   v_failed:=v_failed+1;
  end;
  perform pg_catalog.set_config('request.jwt.claims',
   coalesce(v_claims,''),true);
  perform pg_catalog.set_config('lemma.source',
   coalesce(v_source,''),true);
  perform pg_catalog.set_config('lemma.tool',
   coalesce(v_tool,''),true);
  perform pg_catalog.set_config('lemma.summary',
   coalesce(v_summary,''),true);
 end loop;
 return pg_catalog.jsonb_build_object('executed',v_done,'failed',v_failed,
   'processed',v_done+v_failed);
end
$worker$;
revoke all on function public.lemma_run_due_commands() from public,anon,authenticated;
grant execute on function public.lemma_run_due_commands() to service_role;
