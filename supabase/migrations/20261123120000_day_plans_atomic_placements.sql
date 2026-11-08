-- N107 atomic planner batch, no browser-controlled owner or partial commits.
-- This function is invoked only from the compatible day_plans_command wrapper.
create function public.lemma_day_plans_atomic_commit(p jsonb)
returns jsonb language plpgsql security definer set search_path='' as $atomic$
declare
 own uuid:=(select auth.uid()); r text:=pg_catalog.current_setting('role',true);
 oid uuid; old jsonb; days jsonb; d jsonb; s jsonb; placed jsonb; u jsonb;
 plan public.day_plans%rowtype; block public.calendar_blocks%rowtype;
 item public.day_plan_items%rowtype; changed jsonb:='[]'::jsonb;
 plans jsonb:='[]'::jsonb; blocks jsonb:='[]'::jsonb;
 seen_dates text[]:='{}'; seen_src text[]; seen_pos integer[];
 windows jsonb:='[]'::jsonb; t uuid; v integer; actual integer;
 date_value date; zone text; a timestamptz; b timestamptz; position integer;
 source_name text; bad text; issue text; count_placements integer:=0;
 actor_source text; action_no bigint; response jsonb;
begin
 if own is null or r not in ('authenticated','service_role') then
  raise exception 'Owner authentication required';end if;
 if pg_catalog.jsonb_typeof(p) is distinct from 'object'
  or p->>'schemaVersion' is distinct from '1'
  or p->>'resource' is distinct from 'day_plans'
  or p->>'operation' is distinct from 'commit_placements'
  or pg_catalog.jsonb_typeof(p->'operationId') is distinct from 'string'
  or pg_catalog.jsonb_typeof(p->'patch') is distinct from 'object'
  then raise exception 'Invalid atomic planner command';end if;
 select key into bad from pg_catalog.jsonb_object_keys(p) x(key)
  where key<>all(array['schemaVersion','resource','operation','operationId','patch','target']) limit 1;
 if bad is not null or coalesce(p->'target','{}'::jsonb)<>'{}'::jsonb then
  raise exception 'Atomic command rejects target and unknown fields';end if;
 oid:=(p->>'operationId')::uuid;
 perform pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended(own::text||':'||oid::text,0));
 select result into old from public.command_receipts
  where user_id=own and operation_id=oid;
 if found then
  if old->'_request'=p then return old-'_request';end if;
  return pg_catalog.jsonb_build_object('status','conflict','operationId',oid,
   'changed','[]'::jsonb,'actionNo',null,
   'conflict',pg_catalog.jsonb_build_object('reason','operationId reused with changed payload'));
 end if;
 days:=p->'patch'->'days';
 if (select count(*) from pg_catalog.jsonb_object_keys(p->'patch'))<>1
  or pg_catalog.jsonb_typeof(days) is distinct from 'array'
  or pg_catalog.jsonb_array_length(days) not between 1 and 31 then
  raise exception 'Atomic command needs 1..31 complete days';end if;
 perform pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('atomic-planner:'||own::text,0));

 -- Preflight the entire batch under source locks before writing any record.
 for d in select value from pg_catalog.jsonb_array_elements(days) x(value) loop
  if pg_catalog.jsonb_typeof(d) is distinct from 'object' then
   raise exception 'Invalid atomic day';end if;
  select key into bad from pg_catalog.jsonb_object_keys(d) x(key)
   where key<>all(array['plan_date','time_zone','plan_id','expected_version',
     'intention','capacity_minutes','sources','placements','unplaced']) limit 1;
  if bad is not null or (d->>'plan_date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
   or pg_catalog.jsonb_typeof(d->'time_zone') is distinct from 'string'
   or not exists(select 1 from pg_catalog.pg_timezone_names
    where name=d->>'time_zone') then
   raise exception 'Invalid atomic plan date or zone';end if;
  date_value:=(d->>'plan_date')::date;zone:=d->>'time_zone';
  if date_value::text=any(seen_dates) then raise exception 'Duplicate batch date';end if;
  seen_dates:=pg_catalog.array_append(seen_dates,date_value::text);
  if (d?'intention' and (pg_catalog.jsonb_typeof(d->'intention') is distinct from 'string'
    or pg_catalog.length(d->>'intention')>1200)) or
   (d?'capacity_minutes' and (pg_catalog.jsonb_typeof(d->'capacity_minutes') is distinct from 'number'
    or (d->>'capacity_minutes') !~ '^(0|[1-9][0-9]*)$'
    or (d->>'capacity_minutes')::numeric>1440)) then
   raise exception 'Invalid plan intention or capacity';end if;
  if (d?'plan_id') <> (d?'expected_version') then
   raise exception 'Plan ID/version must be paired';end if;
  if d?'plan_id' then
   if pg_catalog.jsonb_typeof(d->'plan_id') is distinct from 'string'
    or (d->>'expected_version') !~ '^[1-9][0-9]*$'
    or (d->>'expected_version')::numeric>2147483647 then
    raise exception 'Invalid plan CAS version';end if;
   select * into plan from public.day_plans
    where user_id=own and id=(d->>'plan_id')::uuid for update;
   if not found or plan.plan_date<>date_value
    or plan.version<>(d->>'expected_version')::integer
    or plan.status not in ('draft','previewed') then
    issue:='Plan missing, closed or changed since preview';exit;end if;
  else
   if exists(select 1 from public.day_plans where user_id=own
    and plan_date=date_value for update) then
    issue:='Plan date already belongs to an existing plan';exit;end if;
  end if;
  if pg_catalog.jsonb_typeof(d->'sources') is distinct from 'array'
   or pg_catalog.jsonb_array_length(d->'sources')>1000
   or pg_catalog.jsonb_typeof(d->'placements') is distinct from 'array'
   or pg_catalog.jsonb_array_length(d->'placements')>500
   or pg_catalog.jsonb_typeof(coalesce(d->'unplaced','[]'::jsonb)) is distinct from 'array'
   or pg_catalog.jsonb_array_length(coalesce(d->'unplaced','[]'::jsonb))>500 then
   raise exception 'Invalid bounded planner day';end if;
  seen_src:='{}';seen_pos:='{}';
  for s in select value from pg_catalog.jsonb_array_elements(d->'sources') x(value) loop
   if pg_catalog.jsonb_typeof(s) is distinct from 'object'
    or (select count(*) from pg_catalog.jsonb_object_keys(s))<>3
    or s->>'resource' not in ('tasks','calendar_blocks','study_entries')
    or pg_catalog.jsonb_typeof(s->'id') is distinct from 'string'
    or (s->>'version') !~ '^[1-9][0-9]*$'
    or (s->>'version')::numeric>2147483647 then
    raise exception 'Invalid source version descriptor';end if;
   t:=(s->>'id')::uuid;source_name:=s->>'resource';v:=(s->>'version')::integer;
   if (source_name||':'||t::text)=any(seen_src) then
    raise exception 'Duplicate source in day';end if;
   seen_src:=pg_catalog.array_append(seen_src,source_name||':'||t::text);
   actual:=null;
   if source_name='tasks' then
    select version into actual from public.tasks
     where id=t and user_id=own for share;
   elsif source_name='calendar_blocks' then
    select version into actual from public.calendar_blocks
     where id=t and user_id=own for share;
   else
    select version into actual from public.study_entries
     where id=t and user_id=own and status='saved' for share;
   end if;
   if actual is distinct from v then
    issue:='Stale or foreign source: '||source_name;exit;end if;
  end loop;
  if issue is not null then exit;end if;
  for placed in select value from pg_catalog.jsonb_array_elements(d->'placements') x(value) loop
   if pg_catalog.jsonb_typeof(placed) is distinct from 'object'
    or exists(select 1 from pg_catalog.jsonb_object_keys(placed) x(key)
      where key<>all(array['task_id','title','starts_at','ends_at','position']))
    or pg_catalog.jsonb_typeof(placed->'task_id') is distinct from 'string'
    or pg_catalog.jsonb_typeof(placed->'title') is distinct from 'string'
    or pg_catalog.length(pg_catalog.btrim(placed->>'title')) not between 1 and 500
    or pg_catalog.jsonb_typeof(placed->'starts_at') is distinct from 'string'
    or pg_catalog.jsonb_typeof(placed->'ends_at') is distinct from 'string'
    or (placed->>'position') !~ '^(0|[1-9][0-9]*)$'
    or (placed->>'position')::numeric>2147483647 then
    raise exception 'Invalid atomic placement';end if;
   t:=(placed->>'task_id')::uuid;position:=(placed->>'position')::integer;
   if not ('tasks:'||t::text)=any(seen_src) then
    raise exception 'Placement task version not captured';end if;
   if position=any(seen_pos) then raise exception 'Duplicate item position';end if;
   seen_pos:=pg_catalog.array_append(seen_pos,position);
   a:=(placed->>'starts_at')::timestamptz;b:=(placed->>'ends_at')::timestamptz;
   if b<=a or b>a+interval '24 hours' or
    pg_catalog.timezone(zone,a)::date<>date_value then
    raise exception 'Invalid placement time or civil day';end if;
   count_placements:=count_placements+1;
   if count_placements>500 then raise exception 'Batch placement limit exceeded';end if;
   if exists(select 1 from pg_catalog.jsonb_array_elements(windows) w(value)
      where (w.value->>'a')::timestamptz<b
       and (w.value->>'b')::timestamptz>a) or
    exists(select 1 from public.calendar_blocks cb
      where cb.user_id=own and cb.status<>'cancelled'
       and cb.starts_at<b and cb.ends_at>a) or
    exists(select 1 from public.study_intervals i
      join public.study_entries e on e.id=i.entry_id and e.user_id=i.user_id
      where e.user_id=own and e.status='saved' and i.kind='focus'
       and i.started_at<b and i.ended_at>a) then
    issue:='Planner placement collides with a block or saved focus';exit;end if;
   windows:=windows||pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object('a',a,'b',b));
  end loop;
  if issue is not null then exit;end if;
  for u in select value from pg_catalog.jsonb_array_elements(
    coalesce(d->'unplaced','[]'::jsonb)) x(value) loop
   if pg_catalog.jsonb_typeof(u) is distinct from 'object'
    or exists(select 1 from pg_catalog.jsonb_object_keys(u) x(key)
      where key<>all(array['task_id','reason','position']))
    or pg_catalog.jsonb_typeof(u->'task_id') is distinct from 'string'
    or pg_catalog.jsonb_typeof(u->'reason') is distinct from 'string'
    or pg_catalog.length(pg_catalog.btrim(u->>'reason')) not between 1 and 1200
    or (u->>'position') !~ '^(0|[1-9][0-9]*)$'
    or (u->>'position')::numeric>2147483647 then
    raise exception 'Invalid unplaced task';end if;
   t:=(u->>'task_id')::uuid;position:=(u->>'position')::integer;
   if not ('tasks:'||t::text)=any(seen_src) or position=any(seen_pos) then
    raise exception 'Unplaced task version or position invalid';end if;
   seen_pos:=pg_catalog.array_append(seen_pos,position);
  end loop;
 end loop;
 if issue is not null then
  return pg_catalog.jsonb_build_object('status','conflict','operationId',oid,
   'changed','[]'::jsonb,'actionNo',null,
   'conflict',pg_catalog.jsonb_build_object('reason',issue));
 end if;
 actor_source:=case when r='service_role' then 'mcp' else 'app' end;
 perform pg_catalog.set_config('lemma.source',
   case when r='service_role' and pg_catalog.current_setting('lemma.source',true)
    in ('claude','chatgpt','other','system')
    then pg_catalog.current_setting('lemma.source',true)
   when r='service_role' then 'other' else 'app' end,true);
 perform pg_catalog.set_config('lemma.tool','day_plans_command',true);
 perform pg_catalog.set_config('lemma.summary','Atomic planner placement batch',true);
 -- Phase 2: each inserted/updated/deleted row shares one txid action.
 for d in select value from pg_catalog.jsonb_array_elements(days) x(value) loop
  date_value:=(d->>'plan_date')::date;zone:=d->>'time_zone';
  if d?'plan_id' then
   delete from public.day_plan_items
    where user_id=own and plan_id=(d->>'plan_id')::uuid;
   update public.day_plans set status='committed',closed_at=null,
    time_zone=zone,intention=coalesce(d->>'intention',''),
    capacity_minutes=coalesce((d->>'capacity_minutes')::integer,0),
    availability=pg_catalog.jsonb_build_object('sources',d->'sources'),
    version=version+1,updated_at=pg_catalog.clock_timestamp(),source=actor_source
    where user_id=own and id=(d->>'plan_id')::uuid returning * into plan;
  else
   insert into public.day_plans(user_id,plan_date,time_zone,intention,
    capacity_minutes,availability,status,source)
   values(own,date_value,zone,coalesce(d->>'intention',''),
    coalesce((d->>'capacity_minutes')::integer,0),
    pg_catalog.jsonb_build_object('sources',d->'sources'),'committed',actor_source)
   returning * into plan;
  end if;
  plans:=plans||pg_catalog.jsonb_build_array(pg_catalog.to_jsonb(plan));
  changed:=changed||pg_catalog.jsonb_build_array(
   pg_catalog.jsonb_build_object('resource','day_plans','id',plan.id,'version',plan.version));
  for placed in select value from pg_catalog.jsonb_array_elements(d->'placements') x(value) loop
   insert into public.calendar_blocks(user_id,kind,title,starts_at,ends_at,
     time_zone,task_id,status)
   values(own,'study',placed->>'title',
     (placed->>'starts_at')::timestamptz,
     (placed->>'ends_at')::timestamptz,zone,
     (placed->>'task_id')::uuid,'planned') returning * into block;
   blocks:=blocks||pg_catalog.jsonb_build_array(block.id);
   changed:=changed||pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object('resource','calendar_blocks',
      'id',block.id,'version',block.version));
   insert into public.day_plan_items(user_id,plan_id,task_id,calendar_block_id,
    disposition,reason,position,source)
   values(own,plan.id,(placed->>'task_id')::uuid,block.id,
    'placed',null,(placed->>'position')::integer,actor_source) returning * into item;
   changed:=changed||pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object('resource','day_plan_items','id',item.id,'version',item.version));
  end loop;
  for u in select value from pg_catalog.jsonb_array_elements(
     coalesce(d->'unplaced','[]'::jsonb)) x(value) loop
   insert into public.day_plan_items(user_id,plan_id,task_id,calendar_block_id,
     disposition,reason,position,source)
   values(own,plan.id,(u->>'task_id')::uuid,null,'unplaced',
     u->>'reason',(u->>'position')::integer,actor_source) returning * into item;
   changed:=changed||pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object('resource','day_plan_items','id',item.id,'version',item.version));
  end loop;
 end loop;
 select no into action_no from public.actions
  where user_id=own and txid=pg_catalog.txid_current();
 if action_no is null then raise exception 'Atomic commit missing audit action';end if;
 response:=pg_catalog.jsonb_build_object('status','ok','operationId',oid,
  'actionNo',action_no,'changed',changed,'plans',plans,'blockIds',blocks);
 insert into public.command_receipts(user_id,operation_id,resource,result)
  values(own,oid,'day_plans',
    response||pg_catalog.jsonb_build_object('_request',p));
 return response;
end
$atomic$;
revoke all on function public.lemma_day_plans_atomic_commit(jsonb)
 from public,anon,authenticated,service_role;

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

-- The existing registry entry gains only the atomic planner operation.
insert into public.lemma_command_resources(resource,command_fn,mcp_ok,"schema")
values('day_plans','day_plans_command',true,
 '{"operations":["create","update","preview","commit","close","reopen","commit_placements"],
   "fields":["plan_date","time_zone","intention","capacity_minutes","availability",
    "tomorrow_first_task_id","ritual","items"]}'::jsonb)
on conflict(resource) do update set "schema"=excluded."schema";
