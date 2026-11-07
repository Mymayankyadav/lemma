-- N53: owner-queued delayed commands. This is one unapplied additive migration.
-- The target command runs through the existing D8 registry, not SQL supplied
-- by the owner; pending state changes are intentionally not themselves
-- action-journalled (cancel/extend have their own exact operation receipts).
-- This prevents generic undo of the *executed* resource command from
-- inadvertently rescheduling an already consumed queue row.
create table public.pending_commands (
 id uuid primary key default pg_catalog.gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 operation_id uuid not null,
 resource text not null references public.lemma_command_resources(resource),
 payload jsonb not null check (pg_catalog.jsonb_typeof(payload)='object'),
 not_before timestamptz not null,
 undo_until timestamptz,
 status text not null default 'scheduled'
  check (status in ('scheduled','executing','succeeded','failed','cancelled')),
 result jsonb,
 error_class text check(error_class is null or pg_catalog.length(error_class)<=80),
 executed_action_no bigint,
 attempts integer not null default 0 check(attempts between 0 and 100),
 version integer not null default 1 check(version>0),
 source text not null default 'app' check(source in ('app','mcp','worker')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (user_id,id),
 unique (user_id,operation_id),
 constraint pending_undo_window_check check(undo_until is null or undo_until>=not_before),
 constraint pending_terminal_check check (
  (status='succeeded' and result is not null and executed_action_no is not null)
  or (status='failed' and error_class is not null)
  or (status not in ('succeeded','failed') and error_class is null)
 )
);
create index pending_due_idx on public.pending_commands(not_before,id)
 where status='scheduled';
create index pending_owner_updated_idx on public.pending_commands(user_id,updated_at,id);
alter table public.pending_commands enable row level security;
create policy pending_owner_read on public.pending_commands for select
 to authenticated using(user_id=(select auth.uid()));
-- Every authenticated write is only via pending_command, never table DML.
grant select on public.pending_commands to authenticated;

-- Reject ambiguous local timestamps, invalid offsets and infinity. The
-- timestamp must be an explicit absolute ISO instant, not a session-local wall clock.
create function public.lemma_pending_instant(p jsonb) returns timestamptz
language plpgsql stable security invoker set search_path='' as $instant$
begin
 if pg_catalog.jsonb_typeof(p) is distinct from 'string'
  or (p#>>'{}') !~
  '^[0-9]{4}-(0[1-9]|1[0-2])-([0-2][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]([.][0-9]{1,6})?(Z|[+-](0[0-9]|1[0-3]):[0-5][0-9]|[+-]14:00)$'
 then raise exception 'Expected finite timezone-aware pending instant'; end if;
 return (p#>>'{}')::timestamptz;
end
$instant$;
revoke all on function public.lemma_pending_instant(jsonb) from public,anon;

-- The owner's schedule/extend/cancel envelope has its OWN operationId, which
-- must differ from the nested operationId later consumed by mcp_command.
create function public.pending_command(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $pending$
declare
 v_owner uuid; v_role text; v_op text; v_operation uuid; v_id uuid;
 v_patch jsonb; v_target jsonb; v_payload jsonb; v_resource text;
 v_nested_operation uuid; v_due timestamptz; v_undo timestamptz;
 v_row public.pending_commands%rowtype; v_result jsonb; v_stored jsonb;
 v_bad text; v_expected integer; v_version integer;
begin
 v_owner:=(select auth.uid());
 v_role:=pg_catalog.current_setting('role',true);
 if v_owner is null or v_role not in ('authenticated','service_role') then
  raise exception 'Authentication required';
 end if;
 if p is null or pg_catalog.jsonb_typeof(p) is distinct from 'object'
  or pg_catalog.jsonb_typeof(p->'operationId') is distinct from 'string' then
  raise exception 'Invalid pending command envelope'; end if;
 v_operation:=(p->>'operationId')::uuid;
 perform pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended(v_owner::text||':'||v_operation::text,0));
 select result into v_stored from public.command_receipts
  where user_id=v_owner and operation_id=v_operation;
 if found then
  if v_stored->'_request'=p then return v_stored-'_request'; end if;
  return pg_catalog.jsonb_build_object('operationId',v_operation,'status','conflict',
   'actionNo',null,'conflict',pg_catalog.jsonb_build_object(
   'reason','operationId reused with a different payload'));
 end if;
 select key into v_bad from pg_catalog.jsonb_object_keys(p) as keys(key)
  where key<>all(array['operationId','schemaVersion','resource','operation',
  'target','expectedVersion','patch']) limit 1;
 if v_bad is not null or pg_catalog.jsonb_typeof(p->'schemaVersion')
  is distinct from 'number' or p->>'schemaVersion' is distinct from '1'
  or p->>'resource' is distinct from 'pending_commands' then
  raise exception 'Invalid pending command metadata'; end if;
 v_op:=p->>'operation';
 if v_op is null or v_op not in ('schedule','extend','cancel') then
  raise exception 'Unsupported pending operation'; end if;
 v_patch:=coalesce(p->'patch','{}'::jsonb);
 v_target:=coalesce(p->'target','{}'::jsonb);
 if pg_catalog.jsonb_typeof(v_patch) is distinct from 'object'
  or pg_catalog.jsonb_typeof(v_target) is distinct from 'object'
 then raise exception 'Pending target and patch must be objects'; end if;
 select key into v_bad from pg_catalog.jsonb_object_keys(v_target) as keys(key)
  where key<>'id' limit 1;
 if v_bad is not null then raise exception 'Unknown pending target field'; end if;
 select key into v_bad from pg_catalog.jsonb_object_keys(v_patch) as keys(key)
  where key<>all(case when v_op='schedule' then
   array['resource','payload','not_before','undo_until']
   when v_op='extend' then array['not_before','undo_until']
   else array[]::text[] end) limit 1;
 if v_bad is not null then raise exception 'Unknown pending patch field'; end if;
 if v_op='schedule' then
  if v_target<>'{}'::jsonb
    or (p?'expectedVersion' and p->>'expectedVersion' is distinct from '0') then
   raise exception 'Schedule target must be empty and version absent/zero'; end if;
  if pg_catalog.jsonb_typeof(v_patch->'resource') is distinct from 'string'
    or pg_catalog.jsonb_typeof(v_patch->'payload') is distinct from 'object'
    then raise exception 'A registered resource and payload are required'; end if;
  v_resource:=v_patch->>'resource'; v_payload:=v_patch->'payload';
  if not exists(select 1 from public.lemma_command_resources r
    where r.resource=v_resource and r.mcp_ok) then
   raise exception 'Target command resource is not registered for MCP'; end if;
  if v_payload->>'resource' is distinct from v_resource
    or pg_catalog.jsonb_typeof(v_payload->'schemaVersion') is distinct from 'number'
    or v_payload->>'schemaVersion' is distinct from '1'
    or pg_catalog.jsonb_typeof(v_payload->'operationId') is distinct from 'string'
    or v_payload->>'operation' is null
    or exists(select 1 from pg_catalog.jsonb_object_keys(v_payload) as keys(key)
      where key<>all(array['operationId','schemaVersion','resource',
        'operation','target','expectedVersion','patch']))
  then raise exception 'Invalid nested registered command envelope'; end if;
  v_nested_operation:=(v_payload->>'operationId')::uuid;
  if v_nested_operation=v_operation then
   raise exception 'Queue and executed operationIds must differ'; end if;
  v_due:=public.lemma_pending_instant(v_patch->'not_before');
  if v_patch?'undo_until' and v_patch->'undo_until'<>'null'::jsonb then
   v_undo:=public.lemma_pending_instant(v_patch->'undo_until');
  end if;
  if v_undo is not null and v_undo<v_due then
   raise exception 'Undo window cannot close before the scheduled time'; end if;
  select * into v_row from public.pending_commands
    where user_id=v_owner and operation_id=v_nested_operation for update;
  if found then
   v_result:=pg_catalog.jsonb_build_object('operationId',v_operation,
    'status','conflict','actionNo',null,
    'conflict',pg_catalog.jsonb_build_object('reason','Target operation already queued'));
  else
   insert into public.pending_commands(user_id,operation_id,resource,payload,
     not_before,undo_until,source)
    values(v_owner,v_nested_operation,v_resource,v_payload,v_due,v_undo,
      case when v_role='service_role' then 'mcp' else 'app' end)
    returning * into v_row;
  end if;
 else
  if pg_catalog.jsonb_typeof(v_target->'id') is distinct from 'string'
    or pg_catalog.jsonb_typeof(p->'expectedVersion') is distinct from 'number'
    or (p->>'expectedVersion') !~ '^[1-9][0-9]*$' then
   raise exception 'Pending id and expectedVersion required'; end if;
  v_id:=(v_target->>'id')::uuid;
  v_expected:=(p->>'expectedVersion')::integer;
  select * into v_row from public.pending_commands
    where user_id=v_owner and id=v_id for update;
  if not found then raise exception 'Pending command not found for owner'; end if;
  if v_row.version is distinct from v_expected then
   v_result:=pg_catalog.jsonb_build_object('operationId',v_operation,
    'status','conflict','actionNo',null,
    'conflict',pg_catalog.jsonb_build_object(
     'expectedVersion',v_expected,'currentVersion',v_row.version));
  elsif v_row.status<>'scheduled' then
   raise exception 'Only scheduled commands may be extended or cancelled';
  elsif v_op='extend' then
   if not (v_patch?'not_before') then
    raise exception 'Extend needs a new not_before'; end if;
   v_due:=public.lemma_pending_instant(v_patch->'not_before');
   if v_due<=v_row.not_before then
    raise exception 'Extend must move to a later instant'; end if;
   v_undo:=v_row.undo_until;
   if v_patch?'undo_until' then
    v_undo:=case when v_patch->'undo_until'='null'::jsonb then null
      else public.lemma_pending_instant(v_patch->'undo_until') end;
   end if;
   if v_undo is not null and v_undo<v_due then
    raise exception 'Undo window cannot close before the scheduled time'; end if;
   update public.pending_commands
     set not_before=v_due,undo_until=v_undo,
       version=version+1,updated_at=pg_catalog.clock_timestamp()
    where user_id=v_owner and id=v_id returning * into v_row;
  else
   update public.pending_commands
     set status='cancelled',version=version+1,
      updated_at=pg_catalog.clock_timestamp()
    where user_id=v_owner and id=v_id returning * into v_row;
  end if;
 end if;
 if v_result is null then
  v_result:=pg_catalog.jsonb_build_object('operationId',v_operation,
   'status','ok','actionNo',null,'pending',pg_catalog.to_jsonb(v_row));
 end if;
 insert into public.command_receipts(user_id,operation_id,resource,result)
  values(v_owner,v_operation,'pending_commands',
   v_result||pg_catalog.jsonb_build_object('_request',p));
 return v_result;
end
$pending$;
revoke all on function public.pending_command(jsonb) from public,anon;
grant execute on function public.pending_command(jsonb) to authenticated,service_role;

-- At most ONE owner per database transaction: D6's action journal has a
-- unique txid and forbids multi-owner writes. A caller may make repeated RPC
-- calls (each an independent transaction) to drain bounded due work.
-- SKIP LOCKED prevents two tick workers from claiming the same scheduled row.
create function public.lemma_run_due_commands() returns jsonb
language plpgsql security definer set search_path='' as $runner$
declare
 v_job public.pending_commands%rowtype;
 v_receipt jsonb; v_kind text; v_error text;
begin
 if pg_catalog.current_setting('role',true) is distinct from 'service_role' then
  raise exception 'Service role required for pending executor'; end if;
 select * into v_job from public.pending_commands
  where status='scheduled' and not_before<=pg_catalog.now()
  order by not_before,id limit 1 for update skip locked;
 if not found then
  return pg_catalog.jsonb_build_object('processed',0,'succeeded',0,'failed',0);
 end if;
 update public.pending_commands set status='executing',attempts=attempts+1,
  version=version+1,updated_at=pg_catalog.clock_timestamp()
  where id=v_job.id;
 begin
  v_receipt:=public.mcp_command(v_job.user_id,'system',v_job.payload);
  if v_receipt->>'status'='ok' and
    pg_catalog.jsonb_typeof(v_receipt->'actionNo')='number' then
   update public.pending_commands set status='succeeded',result=v_receipt,
    executed_action_no=(v_receipt->>'actionNo')::bigint,error_class=null,
    version=version+1,updated_at=pg_catalog.clock_timestamp()
    where id=v_job.id;
   return pg_catalog.jsonb_build_object('processed',1,'succeeded',1,'failed',0);
  end if;
  v_kind:=case when v_receipt->>'status'='conflict' then 'conflict'
    else 'invalid_receipt' end;
 exception when others then
  v_kind:=sqlstate;
 end;
 update public.pending_commands set status='failed',
  result=pg_catalog.jsonb_build_object('status','failed','errorClass',v_kind),
  error_class=v_kind,version=version+1,
  updated_at=pg_catalog.clock_timestamp() where id=v_job.id;
 return pg_catalog.jsonb_build_object('processed',1,'succeeded',0,'failed',1);
end
$runner$;
revoke all on function public.lemma_run_due_commands()
 from public,anon,authenticated;
grant execute on function public.lemma_run_due_commands() to service_role;
