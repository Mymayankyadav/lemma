-- N46.2.1: safe staged day-plan child records. N46.2.2 installs audited
-- preview/commit/closure commands, undo and MCP before client writes.
-- The existing calendar_blocks table has a globally unique id but did not
-- expose an owner+id unique key for a composite foreign key.
create unique index calendar_blocks_owner_id_day_plan_items_fk
  on public.calendar_blocks(user_id,id);

create table public.day_plan_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  plan_id uuid not null,
  task_id uuid not null,
  calendar_block_id uuid,
  disposition text not null default 'unplaced'
    constraint day_plan_items_disposition_check
    check (disposition in ('placed','unplaced','carried_over')),
  reason text constraint day_plan_items_reason_check
    check (reason is null or char_length(reason) <= 1200),
  -- Preserve N60.1's disposition invariants at the storage boundary.
  -- Unplaced/carried-over work cannot reserve a block or omit its reason.
  constraint day_plan_items_disposition_context_check
    check (disposition = 'placed' or
      (calendar_block_id is null and reason is not null
       and reason ~ '[^[:space:]]')),
  -- Match the N60.1 public model: any nonnegative int4 is a valid stable position.
  position integer not null constraint day_plan_items_position_check
    check (position between 0 and 2147483647),
  version integer not null default 1 constraint day_plan_items_version_check
    check (version > 0),
  source text not null default 'app' constraint day_plan_items_source_check
    check (source in ('app','mcp','worker')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id,id),
  constraint day_plan_items_owner_position unique (user_id,plan_id,position),
  constraint day_plan_items_plan_owner_fk
    foreign key (user_id,plan_id) references public.day_plans(user_id,id)
    on delete no action deferrable initially immediate,
  constraint day_plan_items_task_owner_fk
    foreign key (user_id,task_id) references public.tasks(user_id,id)
    deferrable initially immediate,
  constraint day_plan_items_block_owner_fk
    foreign key (user_id,calendar_block_id)
    references public.calendar_blocks(user_id,id)
    on delete no action deferrable initially immediate
);
create index day_plan_items_owner_task on public.day_plan_items
  (user_id,task_id,plan_id);
alter table public.day_plan_items enable row level security;
-- Do not give authenticated roles INSERT/UPDATE/DELETE policies: an item
-- must not change without N46.2.2's receipt, action journal and undo.
create policy day_plan_items_owner_select on public.day_plan_items
  for select to authenticated using (user_id=(select auth.uid()));
grant select on public.day_plan_items to authenticated;


-- N46.2 completes the staged schema in the same unapplied forward migration.
-- Authenticated clients retain owner-only SELECT: only this owner-checked
-- SECURITY DEFINER command can write plans/placements.
create trigger lemma_log_change after insert or update or delete on public.day_plans
 for each row execute function public.log_change();
create trigger lemma_log_change after insert or update or delete on public.day_plan_items
 for each row execute function public.log_change();

create function public.day_plans_command(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $day_plans$
declare
 v_owner uuid; v_role text; v_src text; v_operation_id uuid; v_op text;
 v_target jsonb; v_patch jsonb; v_id uuid; v_bad text;
 v_expected integer; v_plan public.day_plans%rowtype;
 v_candidate public.day_plans%rowtype; v_result jsonb; v_stored jsonb;
 v_action bigint; v_changed jsonb; v_avail jsonb; v_items jsonb;
 v_item jsonb; v_source_item jsonb; v_seen text[]:='{}';
 v_resource text; v_source_id uuid; v_version integer; v_actual integer;
 v_task uuid; v_block uuid; v_disposition text; v_reason text;
 v_position integer; v_key text; v_item_changed jsonb;
begin
 v_owner:=(select auth.uid());
 v_role:=pg_catalog.current_setting('role',true);
 if v_owner is null or v_role not in ('authenticated','service_role') then
  raise exception 'Authentication required';
 end if;
 if p is null or pg_catalog.jsonb_typeof(p) is distinct from 'object'
    or pg_catalog.jsonb_typeof(p->'operationId') is distinct from 'string'
    or nullif(p->>'operationId','') is null then
  raise exception 'Invalid day-plan command envelope';
 end if;
 v_operation_id:=(p->>'operationId')::uuid;
 perform pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended(v_owner::text||':'||v_operation_id::text,0));
 select result into v_stored from public.command_receipts
  where user_id=v_owner and operation_id=v_operation_id;
 if found then
  if v_stored->'_request'=p then return v_stored-'_request'; end if;
  return pg_catalog.jsonb_build_object('operationId',v_operation_id,
   'status','conflict','changed','[]'::jsonb,'actionNo',null,
   'conflict',pg_catalog.jsonb_build_object('reason','operationId reused with a different payload'));
 end if;
 select key into v_bad from pg_catalog.jsonb_object_keys(p) as t(key)
  where key <> all(array['operationId','schemaVersion','resource','operation',
    'target','expectedVersion','patch']) limit 1;
 if v_bad is not null or pg_catalog.jsonb_typeof(p->'schemaVersion')
   is distinct from 'number' or p->>'schemaVersion' is distinct from '1'
   or p->>'resource' is distinct from 'day_plans' then
  raise exception 'Invalid day-plan command metadata';
 end if;
 v_op:=p->>'operation';
 if v_op is null or v_op not in ('create','update','preview','commit','close','reopen') then
  raise exception 'Unsupported day-plan operation';
 end if;
 v_target:=coalesce(p->'target','{}'::jsonb);
 v_patch:=coalesce(p->'patch','{}'::jsonb);
 if pg_catalog.jsonb_typeof(v_target) is distinct from 'object'
    or pg_catalog.jsonb_typeof(v_patch) is distinct from 'object' then
  raise exception 'Day-plan target and patch must be objects';
 end if;
 select key into v_bad from pg_catalog.jsonb_object_keys(v_target) as t(key)
  where key <> 'id' limit 1;
 if v_bad is not null then raise exception 'Unknown day-plan target field'; end if;
 select key into v_bad from pg_catalog.jsonb_object_keys(v_patch) as t(key)
  where key <> all(case
   when v_op='create' then array['plan_date','time_zone','intention',
    'capacity_minutes','availability','tomorrow_first_task_id','ritual']
   when v_op='update' then array['time_zone','intention',
    'capacity_minutes','availability','tomorrow_first_task_id','ritual']
   when v_op='preview' then array['availability','items']
   when v_op='close' then array['ritual']
   else array[]::text[] end) limit 1;
 if v_bad is not null then raise exception 'Unknown day-plan patch field: %',v_bad; end if;
 if v_op='create' then
  if v_target <> '{}'::jsonb or
   (p ? 'expectedVersion' and p->>'expectedVersion' is distinct from '0') then
   raise exception 'Day-plan create must have no target or positive version';
  end if;
 else
  if pg_catalog.jsonb_typeof(v_target->'id') is distinct from 'string'
    or pg_catalog.jsonb_typeof(p->'expectedVersion') is distinct from 'number'
    or (p->>'expectedVersion') !~ '^[1-9][0-9]*$' then
   raise exception 'Day-plan target id and expectedVersion required';
  end if;
  v_id:=(v_target->>'id')::uuid;
  v_expected:=(p->>'expectedVersion')::integer;
  select * into v_plan from public.day_plans
   where user_id=v_owner and id=v_id for update;
  if not found then raise exception 'Day plan not found for owner'; end if;
 end if;
 v_src:=case when v_role='service_role' then 'mcp' else 'app' end;
 if v_role<>'service_role' then
  perform pg_catalog.set_config('lemma.source','app',true);
  perform pg_catalog.set_config('lemma.tool','day_plans_command',true);
 end if;
 perform pg_catalog.set_config('lemma.summary',
  pg_catalog.left('Day plan '||v_op,200),true);
 if v_op<>'create' and v_plan.version is distinct from v_expected then
  v_result:=pg_catalog.jsonb_build_object('operationId',v_operation_id,
   'status','conflict','changed','[]'::jsonb,'actionNo',null,
   'conflict',pg_catalog.jsonb_build_object('expectedVersion',v_expected,
    'currentVersion',v_plan.version));
 else
  if v_op in ('create','update') then
   if v_op='create' and (
    pg_catalog.jsonb_typeof(v_patch->'plan_date') is distinct from 'string'
    or (v_patch->>'plan_date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or pg_catalog.jsonb_typeof(v_patch->'time_zone') is distinct from 'string') then
    raise exception 'Plan date and time_zone required';
   end if;
   if (v_patch ? 'time_zone') and
     (pg_catalog.jsonb_typeof(v_patch->'time_zone') is distinct from 'string'
     or pg_catalog.length(pg_catalog.btrim(v_patch->>'time_zone')) not between 1 and 80
     or not exists (select 1 from pg_catalog.pg_timezone_names
       where name=v_patch->>'time_zone')) then
    raise exception 'Invalid day-plan time zone';
   end if;
   if (v_patch ? 'intention') and
     (pg_catalog.jsonb_typeof(v_patch->'intention') is distinct from 'string'
     or pg_catalog.length(v_patch->>'intention')>1200) then
    raise exception 'Invalid day-plan intention';
   end if;
   if (v_patch ? 'capacity_minutes') and
     (pg_catalog.jsonb_typeof(v_patch->'capacity_minutes') is distinct from 'number'
      or (v_patch->>'capacity_minutes') !~ '^(0|[1-9][0-9]*)$'
      or (v_patch->>'capacity_minutes')::numeric>1440) then
    raise exception 'Invalid day-plan capacity';
   end if;
   if (v_patch ? 'ritual') and
    pg_catalog.jsonb_typeof(v_patch->'ritual') is distinct from 'object' then
    raise exception 'Invalid day-plan ritual';
   end if;
   if (v_patch ? 'tomorrow_first_task_id') and
     pg_catalog.jsonb_typeof(v_patch->'tomorrow_first_task_id') not in ('string','null')
     then raise exception 'Invalid day-plan task link'; end if;
   if v_op='update' and v_plan.status not in ('draft','previewed') then
    raise exception 'Only draft/previewed plans may be updated';
   end if;
  elsif v_op='preview' and (
    v_plan.status not in ('draft','previewed') or
    pg_catalog.jsonb_typeof(v_patch->'items') is distinct from 'array' or
    pg_catalog.jsonb_array_length(v_patch->'items')>500 or not (v_patch ? 'availability')) then
    raise exception 'Preview requires draft plan, source snapshot and item array';
  elsif v_op='commit' and v_plan.status<>'previewed' then
   raise exception 'Only a previewed plan can commit';
  elsif v_op='close' then
   if v_plan.status<>'committed' or
    ((v_patch ? 'ritual') and
      pg_catalog.jsonb_typeof(v_patch->'ritual') is distinct from 'object') then
    raise exception 'Only committed plans may close with a JSON ritual';
   end if;
  elsif v_op='reopen' and v_plan.status<>'closed' then
   raise exception 'Only closed plans can reopen';
  end if;

  if v_op in ('create','update','preview','commit') then
   v_avail:=case when v_op='commit' then v_plan.availability
    when v_patch ? 'availability' then v_patch->'availability'
    when v_op='update' then '{"sources":[]}'::jsonb
    else '{"sources":[]}'::jsonb end;
   if pg_catalog.jsonb_typeof(v_avail) is distinct from 'object' or
    (select pg_catalog.count(*) from pg_catalog.jsonb_object_keys(v_avail))<>1
    or pg_catalog.jsonb_typeof(v_avail->'sources') is distinct from 'array' or
    pg_catalog.jsonb_array_length(v_avail->'sources')>1000 then
    raise exception 'Invalid day-plan source snapshot';
   end if;
   v_seen:='{}';
   for v_source_item in select value from pg_catalog.jsonb_array_elements(v_avail->'sources') as t(value)
   loop
    if pg_catalog.jsonb_typeof(v_source_item) is distinct from 'object' or
     (select pg_catalog.count(*) from pg_catalog.jsonb_object_keys(v_source_item))<>3 or
     v_source_item->>'resource' not in ('tasks','calendar_blocks') or
     pg_catalog.jsonb_typeof(v_source_item->'id') is distinct from 'string' or
     pg_catalog.jsonb_typeof(v_source_item->'version') is distinct from 'number' or
     (v_source_item->>'version') !~ '^[1-9][0-9]*$' then
     raise exception 'Invalid day-plan source descriptor';
    end if;
    v_resource:=v_source_item->>'resource';
    v_source_id:=(v_source_item->>'id')::uuid;
    v_version:=(v_source_item->>'version')::integer;
    v_key:=v_resource||':'||v_source_id::text;
    if v_key=any(v_seen) then raise exception 'Duplicate day-plan source'; end if;
    v_seen:=pg_catalog.array_append(v_seen,v_key);
    v_actual:=null;
    if v_resource='tasks' then
     select version into v_actual from public.tasks
      where user_id=v_owner and id=v_source_id for share;
    else
     select version into v_actual from public.calendar_blocks
      where user_id=v_owner and id=v_source_id for share;
    end if;
    if v_actual is distinct from v_version then
     raise exception 'Stale or foreign day-plan source: %',v_resource;
    end if;
   end loop;
  end if;

  if v_op='preview' then
   v_items:=v_patch->'items';
   -- Verify every candidate against the *validated* captured snapshot
   -- before deleting any old preview items in this same transaction.
   v_seen:='{}';
   for v_item in select value from pg_catalog.jsonb_array_elements(v_items) as t(value)
   loop
    if pg_catalog.jsonb_typeof(v_item) is distinct from 'object' or
      exists(select 1 from pg_catalog.jsonb_object_keys(v_item) as t(key)
       where key <> all(array['task_id','calendar_block_id','disposition','reason','position'])) or
      pg_catalog.jsonb_typeof(v_item->'task_id') is distinct from 'string' or
      pg_catalog.jsonb_typeof(v_item->'position') is distinct from 'number' or
      (v_item->>'position') !~ '^(0|[1-9][0-9]*)$' or
      (v_item->>'position')::numeric>2147483647 or
      v_item->>'disposition' not in ('placed','unplaced','carried_over') then
      raise exception 'Invalid day-plan item';
    end if;
    v_task:=(v_item->>'task_id')::uuid;
    v_position:=(v_item->>'position')::integer;
    v_block:=nullif(v_item->>'calendar_block_id','')::uuid;
    v_disposition:=v_item->>'disposition';
    v_reason:=v_item->>'reason';
    if (v_item ? 'calendar_block_id' and
      pg_catalog.jsonb_typeof(v_item->'calendar_block_id') not in ('string','null'))
      or (v_item ? 'reason' and
      pg_catalog.jsonb_typeof(v_item->'reason') not in ('string','null'))
      or (v_reason is not null and pg_catalog.length(v_reason)>1200)
      or (v_disposition<>'placed' and
      (v_block is not null or nullif(pg_catalog.btrim(v_reason),'') is null)) then
     raise exception 'Invalid day-plan item disposition';
    end if;
    if ('position:'||v_position::text)=any(v_seen) then
     raise exception 'Duplicate day-plan item position';
    end if;
    v_seen:=pg_catalog.array_append(v_seen,'position:'||v_position::text);
    if not exists(select 1 from pg_catalog.jsonb_array_elements(v_avail->'sources') as s(value)
      where value->>'resource'='tasks' and value->>'id'=v_task::text) or
     (v_block is not null and not exists(
       select 1 from pg_catalog.jsonb_array_elements(v_avail->'sources') as s(value)
        where value->>'resource'='calendar_blocks'
         and value->>'id'=v_block::text)) then
     raise exception 'Day-plan item absent from source snapshot';
    end if;
   end loop;
  end if;

  if v_op='create' then
   insert into public.day_plans(user_id,plan_date,time_zone,intention,
     capacity_minutes,availability,tomorrow_first_task_id,ritual,source)
   values(v_owner,(v_patch->>'plan_date')::date,v_patch->>'time_zone',
     coalesce(v_patch->>'intention',''),
     coalesce((v_patch->>'capacity_minutes')::integer,0),v_avail,
     (v_patch->>'tomorrow_first_task_id')::uuid,
     coalesce(v_patch->'ritual','{}'::jsonb),v_src) returning * into v_plan;
  elsif v_op='update' then
   select * into v_candidate from pg_catalog.jsonb_populate_record(v_plan,v_patch);
   delete from public.day_plan_items where user_id=v_owner and plan_id=v_id;
   update public.day_plans set time_zone=v_candidate.time_zone,
    intention=v_candidate.intention,capacity_minutes=v_candidate.capacity_minutes,
    availability=v_avail,tomorrow_first_task_id=v_candidate.tomorrow_first_task_id,
    ritual=v_candidate.ritual,status='draft',closed_at=null,
    version=version+1,updated_at=pg_catalog.clock_timestamp(),source=v_src
    where user_id=v_owner and id=v_id returning * into v_plan;
  elsif v_op='preview' then
   delete from public.day_plan_items where user_id=v_owner and plan_id=v_id;
   for v_item in select value from pg_catalog.jsonb_array_elements(v_items) as t(value)
   loop
    insert into public.day_plan_items(user_id,plan_id,task_id,
     calendar_block_id,disposition,reason,position,source)
    values(v_owner,v_id,(v_item->>'task_id')::uuid,
     (v_item->>'calendar_block_id')::uuid,v_item->>'disposition',
     v_item->>'reason',(v_item->>'position')::integer,v_src);
   end loop;
   update public.day_plans set availability=v_avail,status='previewed',
    version=version+1,updated_at=pg_catalog.clock_timestamp(),source=v_src
    where user_id=v_owner and id=v_id returning * into v_plan;
  elsif v_op='commit' then
   update public.day_plans set status='committed',
    version=version+1,updated_at=pg_catalog.clock_timestamp(),source=v_src
    where user_id=v_owner and id=v_id returning * into v_plan;
  elsif v_op='close' then
   update public.day_plans set status='closed',
    closed_at=pg_catalog.clock_timestamp(),
    ritual=coalesce(v_patch->'ritual',ritual),
    version=version+1,updated_at=pg_catalog.clock_timestamp(),source=v_src
    where user_id=v_owner and id=v_id returning * into v_plan;
  elsif v_op='reopen' then
   update public.day_plans set status='committed',closed_at=null,
    version=version+1,updated_at=pg_catalog.clock_timestamp(),source=v_src
    where user_id=v_owner and id=v_id returning * into v_plan;
  end if;
  select no into v_action from public.actions
   where txid=pg_catalog.txid_current() and user_id=v_owner;
  if v_action is null then raise exception 'Day-plan write has no journal action'; end if;
  v_changed:=pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
   'resource','day_plans','id',v_plan.id,'version',v_plan.version));
  if v_op='preview' then
   select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'resource','day_plan_items','id',i.id,'version',i.version)
    order by i.position),'[]'::jsonb) into v_item_changed
    from public.day_plan_items i where i.user_id=v_owner and i.plan_id=v_plan.id;
   v_changed:=v_changed||v_item_changed;
  end if;
  v_result:=pg_catalog.jsonb_build_object('operationId',v_operation_id,
   'status','ok','actionNo',v_action,'changed',v_changed,
   'plan',pg_catalog.to_jsonb(v_plan));
 end if;
 insert into public.command_receipts(user_id,operation_id,resource,result)
  values(v_owner,v_operation_id,'day_plans',
   v_result||pg_catalog.jsonb_build_object('_request',p));
 return v_result;
end
$day_plans$;
revoke all on function public.day_plans_command(jsonb) from public,anon;
grant execute on function public.day_plans_command(jsonb) to authenticated,service_role;
insert into public.lemma_undo_tables(table_name)
 values('day_plans'),('day_plan_items');
insert into public.lemma_command_resources(resource,command_fn,mcp_ok,"schema")
 values('day_plans','day_plans_command',true,
 '{"operations":["create","update","preview","commit","close","reopen"],
 "fields":["plan_date","time_zone","intention","capacity_minutes","availability",
 "tomorrow_first_task_id","ritual","items"]}'::jsonb);
