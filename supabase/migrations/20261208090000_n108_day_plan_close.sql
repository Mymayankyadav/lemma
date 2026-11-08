-- N108: compatible extension of the N107 owner-scoped plan command.
-- Existing operations and their receipts are unchanged. Close validates all
-- carried task IDs and owner links before one journalled multi-record write.
create or replace function public.day_plans_command(p jsonb) returns jsonb
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
 -- N107: old N46.2 operations retain their exact implementation below.
 if p->>'operation'='commit_placements' then
  return public.lemma_day_plans_atomic_commit(p);
 end if;
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
   when v_op='close' then array['ritual','tomorrow_first_task_id','carry_over']
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
   -- Legacy ritual-only close semantics remain unchanged. The N108
   -- canonical transition (even an explicit empty carry_over selection)
   -- must never close a future owner-local day.
   if (v_patch ? 'carry_over' or v_patch ? 'tomorrow_first_task_id')
    and v_plan.plan_date > pg_catalog.timezone(v_plan.time_zone,
       pg_catalog.clock_timestamp())::date then
    raise exception 'Future day plans cannot close';
   end if;
   if v_patch ? 'tomorrow_first_task_id' then
    if pg_catalog.jsonb_typeof(v_patch->'tomorrow_first_task_id')
      not in ('string','null') then
     raise exception 'Invalid tomorrow first task';
    end if;
    if v_patch->>'tomorrow_first_task_id' is not null and
      not exists(select 1 from public.tasks t where t.user_id=v_owner
       and t.id=(v_patch->>'tomorrow_first_task_id')::uuid) then
     raise exception 'Tomorrow first task is not owned';
    end if;
   end if;
   if v_patch ? 'carry_over' then
    if pg_catalog.jsonb_typeof(v_patch->'carry_over') is distinct from 'array'
      or pg_catalog.jsonb_array_length(v_patch->'carry_over') > 500 then
     raise exception 'Invalid carry_over list';
    end if;
    v_seen:='{}';
    for v_item in select value from pg_catalog.jsonb_array_elements(v_patch->'carry_over') x(value) loop
     if pg_catalog.jsonb_typeof(v_item)='string' then
      v_task:=(v_item#>>'{}')::uuid;
      v_reason:='Carried over to tomorrow';
     elsif pg_catalog.jsonb_typeof(v_item)='object' then
      if exists(select 1 from pg_catalog.jsonb_object_keys(v_item) x(key)
        where key not in ('task_id','reason'))
       or pg_catalog.jsonb_typeof(v_item->'task_id') is distinct from 'string'
       or pg_catalog.jsonb_typeof(v_item->'reason') is distinct from 'string' then
       raise exception 'Invalid carry_over task descriptor';
      end if;
      v_task:=(v_item->>'task_id')::uuid;
      v_reason:=v_item->>'reason';
     else
      raise exception 'Invalid carry_over task';
     end if;
     if v_reason is null or pg_catalog.length(pg_catalog.btrim(v_reason))=0
       or pg_catalog.length(v_reason)>1200 then
      raise exception 'Carry-over reason required (max 1200)';
     end if;
     if v_task::text=any(v_seen) then raise exception 'Duplicate carry-over task';end if;
     v_seen:=pg_catalog.array_append(v_seen,v_task::text);
     if not exists(select 1 from public.tasks t where t.user_id=v_owner and t.id=v_task)
       or not exists(select 1 from public.day_plan_items i where
        i.user_id=v_owner and i.plan_id=v_id and i.task_id=v_task) then
      raise exception 'Carry-over task must belong to this owner plan';
     end if;
    end loop;
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
    tomorrow_first_task_id=case when v_patch ? 'tomorrow_first_task_id'
      then (v_patch->>'tomorrow_first_task_id')::uuid else tomorrow_first_task_id end,
    version=version+1,updated_at=pg_catalog.clock_timestamp(),source=v_src
    where user_id=v_owner and id=v_id returning * into v_plan;
   if v_patch ? 'carry_over' then
    for v_item in select value from pg_catalog.jsonb_array_elements(v_patch->'carry_over') x(value) loop
     v_task:=case when pg_catalog.jsonb_typeof(v_item)='string'
      then (v_item#>>'{}')::uuid else (v_item->>'task_id')::uuid end;
     v_reason:=case when pg_catalog.jsonb_typeof(v_item)='string'
      then 'Carried over to tomorrow' else v_item->>'reason' end;
     update public.day_plan_items set disposition='carried_over',
      calendar_block_id=null,reason=v_reason,
      version=version+1,updated_at=pg_catalog.clock_timestamp(),source=v_src
      where user_id=v_owner and plan_id=v_id and task_id=v_task;
    end loop;
   end if;
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
  if v_op='preview' or (v_op='close' and v_patch ? 'carry_over') then
   select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'resource','day_plan_items','id',i.id,'version',i.version)
    order by i.position),'[]'::jsonb) into v_item_changed
    from public.day_plan_items i where i.user_id=v_owner and i.plan_id=v_plan.id
     and (v_op='preview' or i.task_id in (
      select case when pg_catalog.jsonb_typeof(value)='string'
       then (value#>>'{}')::uuid else (value->>'task_id')::uuid end
      from pg_catalog.jsonb_array_elements(v_patch->'carry_over') x(value)));
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


-- Mirror the N107 registry upsert (one metadata row, no owner data write).
insert into public.lemma_command_resources(resource,command_fn,mcp_ok,"schema")
values('day_plans','day_plans_command',true,
 '{"operations":["create","update","preview","commit","close","reopen","commit_placements"],
   "fields":["plan_date","time_zone","intention","capacity_minutes","availability",
     "tomorrow_first_task_id","ritual","items","carry_over"]}'::jsonb)
on conflict(resource) do update set "schema"=excluded."schema";
