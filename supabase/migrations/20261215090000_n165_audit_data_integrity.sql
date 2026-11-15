-- N165: additive corrections for the Owner-authorized consolidated bug-hunt PR.
-- Existing deployed migrations are unchanged. Replacement signatures/ownership are documented in the PR.


create or replace function public.task_series_materialize(p_series_id uuid,p_today date)
returns integer language plpgsql security definer set search_path = '' as $mat$
declare
 s public.task_series%rowtype; v_from date; v_to date; d date; v_made integer := 0;
begin
 select * into s from public.task_series where id = p_series_id for update;
 if not found or s.status <> 'active' then return 0; end if;
 v_to := least(p_today + 14,coalesce(s.until_date,p_today + 14));
 v_from := greatest(coalesce(s.materialized_through,s.start_date - 1),p_today - 1);
 if v_to <= v_from then
  update public.task_series set materialized_through=greatest(coalesce(materialized_through,v_to),v_to) where id=s.id;
  return 0; end if;
 for d in select x from public.task_series_dates(s.freq,s.interval_n,s.by_weekday,
   s.by_monthday,s.start_date,s.until_date,v_from,v_to) x loop
  if d = any(s.skipped_dates) then continue; end if;
  v_made := v_made + public.task_series_insert_occurrence(s,d);
 end loop;
 update public.task_series set materialized_through = v_to where id = s.id;
 return v_made;
end
$mat$;

create or replace function public.task_series_command(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $series$
declare
 v_owner uuid := auth.uid();
 v_operation_id uuid; v_operation text; v_patch jsonb; v_target jsonb; v_bad text;
 v_expected integer; v_id uuid; v_today date; v_date date;
 v_old public.task_series%rowtype; v_new public.task_series%rowtype;
 v_made integer := 0; v_sched boolean; v_action bigint;
 v_stored jsonb; v_result jsonb; v_keep boolean;
begin
 if v_owner is null or pg_catalog.current_setting('role',true) not in ('authenticated','service_role') then
  raise exception 'Authentication required'; end if;
 if p is null or pg_catalog.jsonb_typeof(p) is distinct from 'object' then
  raise exception 'Command envelope must be an object'; end if;
 if nullif(p->>'operationId','') is null then raise exception 'operationId is required'; end if;
 v_operation_id := (p->>'operationId')::uuid;
 perform pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended(v_owner::text||':'||v_operation_id::text,0));
 select result into v_stored from public.command_receipts
  where user_id = v_owner and operation_id = v_operation_id;
 if found then
  if v_stored->'_request' = p then return v_stored - '_request'; end if;
  return pg_catalog.jsonb_build_object('operationId',v_operation_id,'status','conflict',
   'changed','[]'::jsonb,'actionNo',null,
   'conflict',pg_catalog.jsonb_build_object('reason','operationId reused with a different payload'));
 end if;
 select key into v_bad from pg_catalog.jsonb_object_keys(p) as keys(key)
  where key <> all(array['operationId','schemaVersion','resource','operation',
   'target','expectedVersion','patch']) limit 1;
 if v_bad is not null then raise exception 'Unknown command field: %',v_bad; end if;
 if pg_catalog.jsonb_typeof(p->'schemaVersion') is distinct from 'number'
  or p->>'schemaVersion' is distinct from '1' then raise exception 'schemaVersion must be 1'; end if;
 if p->>'resource' is distinct from 'task_series' then raise exception 'Unsupported resource'; end if;
 v_operation := p->>'operation';
 if v_operation is null or v_operation not in
  ('create','update','skip','unskip','stop','resume') then
  raise exception 'Unsupported task series operation'; end if;
 v_patch := coalesce(p->'patch','{}'::jsonb);
 v_target := coalesce(p->'target','{}'::jsonb);
 if pg_catalog.jsonb_typeof(v_patch) is distinct from 'object'
  or pg_catalog.jsonb_typeof(v_target) is distinct from 'object' then
  raise exception 'patch and target must be objects'; end if;
 select key into v_bad from pg_catalog.jsonb_object_keys(v_target) as keys(key)
  where key <> 'id' limit 1;
 if v_bad is not null then raise exception 'Unknown target field: %',v_bad; end if;
 select key into v_bad from pg_catalog.jsonb_object_keys(v_patch) as keys(key)
  where key <> all(case
   when v_operation in ('create','update') then array['title','body','subject_id',
    'project_id','checkpoint_id','estimate_minutes','priority','freq','interval_n',
    'by_weekday','by_monthday','start_date','until_date']
   when v_operation in ('skip','unskip') then array['date']
   when v_operation = 'stop' then array['keep_future']
   else array[]::text[] end) limit 1;
 if v_bad is not null then raise exception 'Unknown task series patch field: %',v_bad; end if;
 if v_patch ? 'title' and (pg_catalog.jsonb_typeof(v_patch->'title') is distinct from 'string'
   or pg_catalog.char_length(pg_catalog.btrim(v_patch->>'title')) not between 1 and 200) then
  raise exception 'Series title must contain 1..200 characters'; end if;
 if v_patch ? 'by_weekday' and (pg_catalog.jsonb_typeof(v_patch->'by_weekday') is distinct from 'array'
   or exists(select 1 from pg_catalog.jsonb_array_elements(v_patch->'by_weekday') e
    where (e #>> '{}') !~ '^[1-7]$')) then
  raise exception 'by_weekday must list ISO weekdays 1 (Monday) to 7 (Sunday)'; end if;
 if pg_catalog.current_setting('role',true) <> 'service_role' then
  perform pg_catalog.set_config('lemma.source','app',true);
  perform pg_catalog.set_config('lemma.tool','task_series_command',true);
  perform pg_catalog.set_config('lemma.summary',
   pg_catalog.left('Recurring task '||v_operation,200),true);
 end if;
 v_today := public.task_series_today(v_owner);
 if v_today is null then raise exception 'Owner settings not found'; end if;

 if v_operation = 'create' then
  if p ? 'expectedVersion' and p->>'expectedVersion' is distinct from '0' then
   raise exception 'create expectedVersion must be absent or 0'; end if;
  select * into v_new from pg_catalog.jsonb_populate_record(null::public.task_series,v_patch);
  v_id := coalesce(nullif(v_target->>'id','')::uuid,pg_catalog.gen_random_uuid());
  insert into public.task_series(id,user_id,title,body,subject_id,project_id,checkpoint_id,
   estimate_minutes,priority,freq,interval_n,by_weekday,by_monthday,start_date,until_date)
  values(v_id,v_owner,v_new.title,coalesce(v_new.body,''),v_new.subject_id,v_new.project_id,
   v_new.checkpoint_id,v_new.estimate_minutes,coalesce(v_new.priority,'normal'),v_new.freq,
   coalesce(v_new.interval_n,1),
   coalesce((select pg_catalog.array_agg(w order by w) from (select distinct w
     from pg_catalog.unnest(v_new.by_weekday) w) q),'{}'::smallint[]),
   v_new.by_monthday,coalesce(v_new.start_date,v_today),v_new.until_date)
  returning * into v_new;
  v_made := public.task_series_materialize(v_new.id,v_today);
  select * into v_new from public.task_series where id = v_new.id;
 else
  if nullif(v_target->>'id','') is null then raise exception 'target.id required'; end if;
  if pg_catalog.jsonb_typeof(p->'expectedVersion') is distinct from 'number'
   or p->>'expectedVersion' !~ '^[1-9][0-9]*$' then
   raise exception 'expectedVersion must be a positive integer'; end if;
  v_id := (v_target->>'id')::uuid;
  v_expected := (p->>'expectedVersion')::integer;
  select * into v_old from public.task_series where id = v_id and user_id = v_owner for update;
  if not found then raise exception 'Task series not found'; end if;
  if v_old.version <> v_expected then
   v_result := pg_catalog.jsonb_build_object('operationId',v_operation_id,'status','conflict',
    'changed','[]'::jsonb,'actionNo',null,'current',pg_catalog.to_jsonb(v_old),
    'conflict',pg_catalog.jsonb_build_object('expectedVersion',v_expected,
     'currentVersion',v_old.version));
  elsif v_operation = 'update' then
   select * into v_new from pg_catalog.jsonb_populate_record(v_old,v_patch);
   v_sched := (v_old.freq,v_old.interval_n,v_old.by_weekday,v_old.by_monthday,
    v_old.start_date,v_old.until_date) is distinct from
    (v_new.freq,v_new.interval_n,v_new.by_weekday,v_new.by_monthday,
     v_new.start_date,v_new.until_date);
   update public.task_series set title = v_new.title,body = v_new.body,
    subject_id = v_new.subject_id,project_id = v_new.project_id,
    checkpoint_id = v_new.checkpoint_id,estimate_minutes = v_new.estimate_minutes,
    priority = v_new.priority,freq = v_new.freq,interval_n = v_new.interval_n,
    by_weekday = coalesce((select pg_catalog.array_agg(w order by w) from (select distinct w
      from pg_catalog.unnest(v_new.by_weekday) w) q),'{}'::smallint[]),
    by_monthday = v_new.by_monthday,start_date = v_new.start_date,
    until_date = v_new.until_date,version = version + 1,updated_at = pg_catalog.now()
   where id = v_id and user_id = v_owner returning * into v_new;
   -- Open occurrences from today on follow the edit; finished ones never change.
   update public.tasks set title = v_new.title,body = v_new.body,
    subject_id = v_new.subject_id,project_id = v_new.project_id,
    checkpoint_id = v_new.checkpoint_id,estimate_minutes = v_new.estimate_minutes,
    priority = v_new.priority,version = version + 1,updated_at = pg_catalog.now()
   where user_id = v_owner and series_id = v_id and occurrence_date >= v_today
    and status in ('backlog','in_progress')
    and (title,body,subject_id,project_id,checkpoint_id,estimate_minutes,priority)
     is distinct from (v_new.title,v_new.body,v_new.subject_id,v_new.project_id,
      v_new.checkpoint_id,v_new.estimate_minutes,v_new.priority);
   if v_sched then
    -- Untouched future occurrences that the new rule no longer lands on go away
    -- (undo restores them); dates it still lands on keep their task.
    delete from public.tasks where user_id = v_owner and series_id = v_id
     and status = 'backlog' and occurrence_date > v_today
     and occurrence_date <> all(array(select x from public.task_series_dates(v_new.freq,
      v_new.interval_n,v_new.by_weekday,v_new.by_monthday,v_new.start_date,
      v_new.until_date,v_today,v_today + 800) x));
    update public.task_series set materialized_through = v_today - 1 where id = v_id;
    v_made := public.task_series_materialize(v_id,v_today);
   end if;
   select * into v_new from public.task_series where id = v_id;
  elsif v_operation in ('skip','unskip') then
   if pg_catalog.jsonb_typeof(v_patch->'date') is distinct from 'string' then
    raise exception 'date is required'; end if;
   v_date := (v_patch->>'date')::date;
   if v_operation = 'skip' then
    if v_date = any(v_old.skipped_dates) then raise exception 'Date is already skipped'; end if;
    if not exists(select 1 from public.task_series_dates(v_old.freq,v_old.interval_n,
     v_old.by_weekday,v_old.by_monthday,v_old.start_date,v_old.until_date,v_date - 1,v_date)) then
     raise exception 'Date is not an occurrence of this series'; end if;
    update public.task_series set skipped_dates = pg_catalog.array_append(skipped_dates,v_date),
     version = version + 1,updated_at = pg_catalog.now()
     where id = v_id and user_id = v_owner returning * into v_new;
    update public.tasks set status = 'cancelled',version = version + 1,updated_at = pg_catalog.now()
     where user_id = v_owner and series_id = v_id and occurrence_date = v_date
      and status in ('backlog','in_progress');
   else
    if not (v_date = any(v_old.skipped_dates)) then raise exception 'Date is not skipped'; end if;
    update public.task_series set skipped_dates = pg_catalog.array_remove(skipped_dates,v_date),
     version = version + 1,updated_at = pg_catalog.now()
     where id = v_id and user_id = v_owner returning * into v_new;
    update public.tasks set status = 'backlog',version = version + 1,updated_at = pg_catalog.now()
     where user_id = v_owner and series_id = v_id and occurrence_date = v_date
      and status = 'cancelled';
    if v_new.status = 'active' and v_date >= v_today
     and v_date <= coalesce(v_new.materialized_through,v_date - 1) then
     v_made := public.task_series_insert_occurrence(v_new,v_date);
    end if;
   end if;
  elsif v_operation = 'stop' then
   if v_old.status = 'stopped' then raise exception 'Series is already stopped'; end if;
   v_keep := coalesce((v_patch->>'keep_future')::boolean,false);
   update public.task_series set status = 'stopped',stopped_at = pg_catalog.now(),
    version = version + 1,updated_at = pg_catalog.now()
    where id = v_id and user_id = v_owner returning * into v_new;
   if not v_keep then
    update public.calendar_blocks b set status='cancelled',version=version+1
     where b.user_id=v_owner and b.status='planned' and b.task_id in
      (select t.id from public.tasks t where t.user_id=v_owner and t.series_id=v_id and t.status='backlog' and t.occurrence_date>v_today);
    update public.tasks t set status='cancelled',version=version+1 where t.user_id=v_owner and t.series_id=v_id
     and t.status='backlog' and t.occurrence_date>v_today and exists(select 1 from public.calendar_blocks b where b.user_id=v_owner and b.task_id=t.id);
    delete from public.tasks where user_id = v_owner and series_id = v_id
     and status = 'backlog' and occurrence_date > v_today;
   end if;
  else
   if v_old.status = 'active' then raise exception 'Series is not stopped'; end if;
   update public.task_series set status = 'active',stopped_at = null,
    materialized_through = v_today - 1,version = version + 1,updated_at = pg_catalog.now()
    where id = v_id and user_id = v_owner returning * into v_new;
   v_made := public.task_series_materialize(v_id,v_today);
   select * into v_new from public.task_series where id = v_id;
  end if;
 end if;
 if v_result is null then
  select no into v_action from public.actions
   where txid = pg_catalog.txid_current() and user_id = v_owner;
  if v_action is null then raise exception 'Task series write has no undo action'; end if;
  v_result := pg_catalog.jsonb_build_object('operationId',v_operation_id,'status','ok',
   'changed',pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object('id',v_new.id,'version',v_new.version)),
   'actionNo',v_action,
   'generated',v_made,'through',v_new.materialized_through);
 end if;
 insert into public.command_receipts(user_id,operation_id,resource,result)
  values(v_owner,v_operation_id,'task_series',
   v_result || pg_catalog.jsonb_build_object('_request',p));
 return v_result;
end
$series$;

alter table public.calendar_blocks add column deadline_id uuid, add constraint calendar_blocks_deadline_owner_fkey foreign key(user_id,deadline_id) references public.deadlines(user_id,id);
create index calendar_blocks_deadline_owner on public.calendar_blocks(user_id,deadline_id) where deadline_id is not null;

create or replace function public.period_plan_compute(
 p_user uuid,p_start date,p_end date,p_from date,p_tz text,
 p_cap integer,p_exclude uuid[]
) returns jsonb
language plpgsql stable security definer set search_path = '' as $compute$
declare
 v_plan jsonb; v_ws integer; v_we integer; v_gap integer; v_run integer;
 v_days integer; v_i integer; v_day date; v_busy record;
 v_free pg_catalog.int4multirange[]; v_load integer[]; v_target integer[];
 v_goal integer; v_item jsonb; v_items jsonb; v_rem integer[]; v_n integer; v_k integer;
 v_pass integer; v_cap integer; v_room integer; v_chunk integer; v_lo integer; v_hi integer;
 v_r pg_catalog.int4range; v_place jsonb := '[]'::jsonb; v_unplaced jsonb := '[]'::jsonb;
 v_due date; v_from_ts timestamptz; v_s integer; v_e integer; v_ds timestamp;
begin
 select s.planning into v_plan from public.settings s where s.user_id = p_user;
 if v_plan is null then raise exception 'Owner settings not found'; end if;
 v_ws := (split_part(v_plan->>'window_start',':',1)::integer * 60) + split_part(v_plan->>'window_start',':',2)::integer;
 v_we := (split_part(v_plan->>'window_end',':',1)::integer * 60) + split_part(v_plan->>'window_end',':',2)::integer;
 v_gap := coalesce((v_plan->>'gap_minutes')::integer,0);
 v_run := coalesce((v_plan->>'max_consecutive_minutes')::integer,120);
 if v_we <= v_ws then raise exception 'Working window must end after it starts'; end if;
 v_from_ts := (p_from::timestamp) at time zone p_tz;
 if p_from > p_end then return pg_catalog.jsonb_build_object('placements','[]'::jsonb,'unplaced','[]'::jsonb,
  'planned_minutes',0,'goal_minutes',0); end if;
 v_days := p_end - p_from + 1;

 -- Global goals (no subject or Path) that overlap the period set each day's target.
 select coalesce(sum(ceil(g.target_minutes::numeric / (g.end_date - g.start_date + 1))),0)::integer into v_goal
  from public.study_goals g where g.user_id = p_user and g.archived_at is null
   and g.subject_id is null and g.project_id is null
   and g.start_date <= p_end and g.end_date >= p_from;

 -- Free minutes of each day: the window minus existing blocks (padded by the gap).
 for v_i in 0 .. v_days - 1 loop
  v_day := p_from + v_i; v_ds := v_day::timestamp;
  v_free[v_i] := pg_catalog.int4multirange(pg_catalog.int4range(v_ws,v_we));
  v_load[v_i] := 0;
  v_target[v_i] := case when v_goal > 0 then v_goal else null end;
  if v_day = (pg_catalog.now() at time zone p_tz)::date then
   -- Time that has already passed today is not free.
   v_e := ceil(extract(epoch from ((pg_catalog.now() at time zone p_tz) - v_ds)) / 60)::integer;
   v_free[v_i] := v_free[v_i] - pg_catalog.int4multirange(pg_catalog.int4range(0,least(1440,v_e)));
  end if;
  for v_busy in select b.starts_at at time zone p_tz as ls,b.ends_at at time zone p_tz as le
   from public.calendar_blocks b where b.user_id = p_user and b.status <> 'cancelled'
    and b.ends_at > (v_ds at time zone p_tz) and b.starts_at < ((v_ds + interval '1 day') at time zone p_tz) loop
   v_s := greatest(0,floor(extract(epoch from (v_busy.ls - v_ds)) / 60)::integer - v_gap);
   v_e := least(1440,ceil(extract(epoch from (v_busy.le - v_ds)) / 60)::integer + v_gap);
   if v_e > v_s then v_free[v_i] := v_free[v_i] - pg_catalog.int4multirange(pg_catalog.int4range(v_s,v_e)); end if;
  end loop;
 end loop;

 -- Work items, most urgent first: tasks (remaining estimate) and deadline effort.
 select coalesce(pg_catalog.jsonb_agg(x.item order by x.due nulls last,x.rank,x.pos,x.title),'[]'::jsonb) into v_items from (
  select pg_catalog.jsonb_build_object('title',t.title,'task_id',t.id,'deadline_id',null,
    'minutes',greatest(0,coalesce(t.estimate_minutes,30) - coalesce((
      select sum(extract(epoch from (b.ends_at - b.starts_at)) / 60)::integer from public.calendar_blocks b
       where b.user_id = p_user and b.task_id = t.id and b.status = 'planned' and b.ends_at >= v_from_ts),0)),
    'version',t.version,'due_at',t.due_at,'due',coalesce(t.due_date,(t.due_at at time zone p_tz)::date)) as item,
   coalesce(t.due_date,(t.due_at at time zone p_tz)::date) as due,
   case t.priority when 'high' then 0 when 'normal' then 1 else 2 end as rank,t.position as pos,t.title as title
  from public.tasks t where t.user_id = p_user and t.status in ('backlog','in_progress')
   and not (t.id = any(p_exclude))
   and (coalesce(t.due_date,(t.due_at at time zone p_tz)::date) is null
        or coalesce(t.due_date,(t.due_at at time zone p_tz)::date) <= p_end)
  union all
  select pg_catalog.jsonb_build_object('title',d.title,'task_id',null,'deadline_id',d.id,
    'version',d.version,'due_at',d.due_at,'minutes',greatest(0,(case when greatest(coalesce(d.due_date,(d.due_at at time zone p_tz)::date),p_from) <= p_end
      then d.remaining_minutes
      else ceil(d.remaining_minutes::numeric * v_days
        / greatest(1,coalesce(d.due_date,(d.due_at at time zone p_tz)::date) - p_from + 1))::integer end) - coalesce((
       select sum(extract(epoch from (b.ends_at-b.starts_at))/60)::integer from public.calendar_blocks b
       where b.user_id=p_user and b.status='planned' and b.ends_at>=v_from_ts and
        (b.deadline_id=d.id or b.id in (select (x->>'block_id')::uuid from public.period_plans pp cross join lateral jsonb_array_elements(pp.placements) x
          where pp.user_id=p_user and x->>'deadline_id'=d.id::text and x->>'block_id' is not null))),0)),
    'due',coalesce(d.due_date,(d.due_at at time zone p_tz)::date)),
   coalesce(d.due_date,(d.due_at at time zone p_tz)::date),-1,0,d.title
  from public.deadlines d where d.user_id = p_user and d.status = 'open' and d.remaining_minutes > 0
 ) x;
 v_n := pg_catalog.jsonb_array_length(v_items);
 for v_k in 0 .. v_n - 1 loop v_rem[v_k] := (v_items->v_k->>'minutes')::integer; end loop;

 -- Pass 1 fills each day to its goal target; pass 2 fills up to the window or cap.
 for v_pass in 1 .. 2 loop
  for v_k in 0 .. v_n - 1 loop
   v_item := v_items->v_k;
   v_due := (v_item->>'due')::date;
   for v_i in 0 .. v_days - 1 loop
    exit when v_rem[v_k] <= 0;
    v_day := p_from + v_i;
    continue when v_due is not null and v_day > greatest(v_due,p_from);
    v_cap := case when v_pass = 1 and v_target[v_i] is not null then v_target[v_i]
                  else coalesce(p_cap,1440) end;
    if v_pass = 1 and v_target[v_i] is null then v_cap := coalesce(p_cap,1440); end if;
    v_cap:=least(v_cap,coalesce(p_cap,1440));
    loop
     exit when v_rem[v_k] <= 0;
     v_room := v_cap - v_load[v_i];
     exit when v_room < least(15,v_rem[v_k]);
     v_lo := null;
     for v_r in select unnest(v_free[v_i]) loop
      if v_item->>'due_at' is not null then
       v_r:=v_r * int4range(-1000000,greatest(-1000000,least(1000000,floor(extract(epoch from ((v_item->>'due_at')::timestamptz at time zone p_tz-v_day::timestamp))/60)::integer)));
       if isempty(v_r) then continue; end if;
      end if;
      if upper(v_r) - lower(v_r) >= least(15,v_rem[v_k]) then v_lo := lower(v_r); v_hi := upper(v_r); exit; end if;
     end loop;
     exit when v_lo is null;
     v_chunk := least(v_rem[v_k],v_hi - v_lo,v_run,v_room);
     v_place := v_place || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'id',pg_catalog.gen_random_uuid(),'date',v_day,'minutes',v_chunk,
      'starts_at',((v_day::timestamp + pg_catalog.make_interval(mins => v_lo)) at time zone p_tz),
      'ends_at',((v_day::timestamp + pg_catalog.make_interval(mins => v_lo + v_chunk)) at time zone p_tz),
      'title',v_item->>'title','task_id',v_item->'task_id','deadline_id',v_item->'deadline_id',
      'source_version',v_item->'version','block_id',null));
     v_free[v_i] := v_free[v_i] - pg_catalog.int4multirange(pg_catalog.int4range(v_lo,least(1440,v_lo + v_chunk + v_gap)));
     v_load[v_i] := v_load[v_i] + v_chunk;
     v_rem[v_k] := v_rem[v_k] - v_chunk;
    end loop;
   end loop;
  end loop;
 end loop;
 for v_k in 0 .. v_n - 1 loop
  if v_rem[v_k] > 0 then
   v_unplaced := v_unplaced || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'title',v_items->v_k->>'title','task_id',v_items->v_k->'task_id','deadline_id',v_items->v_k->'deadline_id',
    'minutes',v_rem[v_k],'reason','not enough free time before its date'));
  end if;
 end loop;
 select coalesce(pg_catalog.jsonb_agg(p order by p->>'starts_at'),'[]'::jsonb) into v_place
  from pg_catalog.jsonb_array_elements(v_place) p;
 return pg_catalog.jsonb_build_object('placements',v_place,'unplaced',v_unplaced,
  'planned_minutes',(select coalesce(sum((p->>'minutes')::integer),0) from pg_catalog.jsonb_array_elements(v_place) p),
  'goal_minutes',coalesce(v_goal,0));
end
$compute$;

create or replace function public.period_plan_write_blocks(p_user uuid,p_tz text,p_placements jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $write$
declare v_out jsonb := '[]'::jsonb; v_p jsonb; v_block uuid; v_task public.tasks%rowtype; v_deadline public.deadlines%rowtype;
begin
 for v_p in select value from pg_catalog.jsonb_array_elements(p_placements) loop
  v_task := null;v_deadline:=null;
  if v_p->>'task_id' is not null then
   select * into v_task from public.tasks where user_id = p_user and id = (v_p->>'task_id')::uuid for update;
   if not found or v_task.status not in ('backlog','in_progress') or
    (v_p->>'source_version' is not null and v_task.version<>(v_p->>'source_version')::integer) then raise exception 'Task changed after plan preview'; end if;
  end if;
  if v_p->>'deadline_id' is not null then
   select * into v_deadline from public.deadlines where user_id=p_user and id=(v_p->>'deadline_id')::uuid for update;
   if not found or v_deadline.status<>'open' or v_deadline.remaining_minutes<=0 or
    (v_p->>'source_version' is not null and v_deadline.version<>(v_p->>'source_version')::integer) then raise exception 'Deadline changed after plan preview'; end if;
   if v_deadline.due_at is not null and (v_p->>'ends_at')::timestamptz>v_deadline.due_at then raise exception 'Placement exceeds deadline'; end if;
  end if;
  insert into public.calendar_blocks(user_id,kind,title,starts_at,ends_at,time_zone,status,subject_id,project_id,checkpoint_id,task_id,deadline_id)
  values(p_user,'study',pg_catalog.left(v_p->>'title',200),(v_p->>'starts_at')::timestamptz,(v_p->>'ends_at')::timestamptz,
   p_tz,'planned',coalesce(v_task.subject_id,v_deadline.subject_id),coalesce(v_task.project_id,v_deadline.project_id),v_task.checkpoint_id,v_task.id,v_deadline.id) returning id into v_block;
  v_out := v_out || pg_catalog.jsonb_build_array(v_p || pg_catalog.jsonb_build_object('block_id',v_block));
 end loop;
 return v_out;
end
$write$;

create or replace function public.record_review(p_card uuid,p_rating int,p_confidence text,p_duration_ms int,p_next jsonb) returns bigint
language plpgsql security invoker set search_path = '' as $$
declare c public.cards; result bigint; previous jsonb;
begin
 if current_setting('role',true)<>'service_role' then perform set_config('lemma.source','app',true);perform set_config('lemma.tool','record_review',true);perform set_config('lemma.summary','record_review',true);end if;
 select * into c from public.cards where id=p_card for update;
 if not found then raise exception 'Card not found'; end if;
 if c.user_id is distinct from auth.uid() then raise exception 'Card not found'; end if;
 if p_next?'expected_version' and (p_next->>'expected_version')::integer<>c.version then raise exception 'Card version conflict'; end if;
 if (p_next->>'reps')::integer<>c.reps+1 then raise exception 'Card version conflict: stale scheduler state'; end if;
 if jsonb_typeof(p_next) is distinct from 'object' or not (p_next ?& array['state','due','stability','difficulty','last_review','step','reps','lapses']) then
  raise exception 'A complete next card state is required';
 end if;
 previous := jsonb_build_object('state',c.state,'due',c.due,'stability',c.stability,'difficulty',c.difficulty,'last_review',c.last_review,'step',c.step,'reps',c.reps,'lapses',c.lapses);
 insert into public.reviews(user_id,card_id,rating,state_before,confidence,duration_ms,prev)
 values(c.user_id,c.id,p_rating,c.state,p_confidence,p_duration_ms,previous) returning id into result;
 update public.cards set state=(p_next->>'state')::smallint,due=(p_next->>'due')::timestamptz,
  stability=(p_next->>'stability')::real,difficulty=(p_next->>'difficulty')::real,last_review=(p_next->>'last_review')::timestamptz,
  step=(p_next->>'step')::int,reps=(p_next->>'reps')::int,lapses=(p_next->>'lapses')::int
 where id=c.id and user_id=c.user_id;
 return result;
end $$;

create or replace function public.undo_review(p_review bigint) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare r public.reviews; c uuid; newest bigint; v_expected integer; v_current integer;
begin
 if current_setting('role',true)<>'service_role' then perform set_config('lemma.source','app',true);perform set_config('lemma.tool','undo_review',true);perform set_config('lemma.summary','undo_review',true);end if;
 select card_id into c from public.reviews where id=p_review;
 if not found then raise exception 'Review not found'; end if;
 -- Same lock order as record_review: card first, then review.
 perform 1 from public.cards where id=c for update;
 select * into r from public.reviews where id=p_review for update;
 select id into newest from public.reviews where card_id=c and user_id=r.user_id and undone_at is null order by id desc limit 1;
 if r.undone_at is not null or newest is distinct from r.id then raise exception 'Only the last answer can be undone'; end if;
 select (ch.new->>'version')::integer into v_expected from public.action_changes ch
  where ch.table_name='cards' and ch.row_pk->>'id'=c::text and ch.action_no in
   (select a.action_no from public.action_changes a where a.table_name='reviews' and a.row_pk->>'id'=r.id::text and a.op='insert')
  order by ch.seq desc limit 1;
 select version into v_current from public.cards where id=c and user_id=r.user_id;
 if v_expected is null or v_current<>v_expected then raise exception 'Card changed after this answer; undo the newer change first'; end if;
 update public.cards set state=(r.prev->>'state')::smallint,due=(r.prev->>'due')::timestamptz,
  stability=(r.prev->>'stability')::real,difficulty=(r.prev->>'difficulty')::real,last_review=(r.prev->>'last_review')::timestamptz,
  step=(r.prev->>'step')::int,reps=(r.prev->>'reps')::int,lapses=(r.prev->>'lapses')::int where id=c and user_id=r.user_id;
 update public.reviews set undone_at=now() where id=r.id and user_id=r.user_id;
 return r.prev;
end $$;

create or replace function public.review_runs_undo_last(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $review_runs_undo_last$
declare
  v_owner uuid; v_role text; v_source text; v_operation_id uuid;
  v_target jsonb; v_patch jsonb; v_bad text; v_id uuid; v_expected integer;
  v_run public.review_runs%rowtype; v_item public.review_run_items%rowtype;
  v_receipt jsonb; v_stored jsonb; v_action bigint;
begin
  v_owner := (select auth.uid());
  v_role := pg_catalog.current_setting('role',true);
  if v_owner is null or v_role <> 'authenticated' then
    raise exception 'Authentication required';
  end if;
  if p is null or pg_catalog.jsonb_typeof(p) is distinct from 'object' then
    raise exception 'Command envelope must be an object';
  end if;
  if nullif(p->>'operationId','') is null then raise exception 'operationId required'; end if;
  v_operation_id := (p->>'operationId')::uuid;
  -- Every retry for this owner serializes before the receipt lookup.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_owner::text||':'||v_operation_id::text,0));
  select result into v_stored from public.command_receipts
    where user_id=v_owner and operation_id=v_operation_id;
  if found then
    if v_stored->'_request'=p then return v_stored-'_request'; end if;
    return pg_catalog.jsonb_build_object('operationId',v_operation_id,'status','conflict',
      'changed','[]'::jsonb,'actionNo',null,
      'conflict',pg_catalog.jsonb_build_object('reason','operationId reused with a different payload'));
  end if;

  select key into v_bad from pg_catalog.jsonb_object_keys(p) as t(key)
    where key <> all(array['operationId','schemaVersion','resource','operation',
      'target','expectedVersion','patch']) limit 1;
  if v_bad is not null then raise exception 'Unknown command field: %',v_bad; end if;
  if pg_catalog.jsonb_typeof(p->'schemaVersion') is distinct from 'number'
      or p->>'schemaVersion' is distinct from '1' then
    raise exception 'schemaVersion must be 1';
  end if;
  if p->>'resource' is distinct from 'review_runs' then raise exception 'Invalid resource'; end if;
  if p->>'operation' is distinct from 'undo_last' then
    raise exception 'Unsupported review-run operation';
  end if;
  v_target := coalesce(p->'target','{}'::jsonb);
  v_patch := coalesce(p->'patch','{}'::jsonb);
  if pg_catalog.jsonb_typeof(v_target) is distinct from 'object'
      or pg_catalog.jsonb_typeof(v_patch) is distinct from 'object' then
    raise exception 'target and patch must be objects';
  end if;
  select key into v_bad from pg_catalog.jsonb_object_keys(v_target) as t(key)
    where key <> 'id' limit 1;
  if v_bad is not null then raise exception 'Unknown target field: %',v_bad; end if;
  select key into v_bad from pg_catalog.jsonb_object_keys(v_patch) as t(key)
    where key <> 'item_id' limit 1;
  if v_bad is not null then raise exception 'Unknown patch field: %',v_bad; end if;
  if pg_catalog.jsonb_typeof(v_target->'id') is distinct from 'string'
      or nullif(v_target->>'id','') is null then raise exception 'target.id required'; end if;
  if pg_catalog.jsonb_typeof(v_patch->'item_id') is distinct from 'string'
      or nullif(v_patch->>'item_id','') is null then raise exception 'patch.item_id required'; end if;
  if pg_catalog.jsonb_typeof(p->'expectedVersion') is distinct from 'number'
      or (p->>'expectedVersion') !~ '^[1-9][0-9]*$' then
    raise exception 'expectedVersion must be positive integer';
  end if;

  -- Only the app undoes answers; provenance is never taken from the caller (bug #1051).
  v_source := 'app';
  perform pg_catalog.set_config('lemma.source','app',true);
  perform pg_catalog.set_config('lemma.tool','review_runs_undo_last',true);
  perform pg_catalog.set_config('lemma.summary','Review run undo last answer',true);

  v_id := (v_target->>'id')::uuid;
  v_expected := (p->>'expectedVersion')::integer;
  select * into v_run from public.review_runs
    where user_id=v_owner and id=v_id for update;
  if not found then raise exception 'Review run not found'; end if;
  if v_run.version is distinct from v_expected then
    v_receipt := pg_catalog.jsonb_build_object(
      'operationId',v_operation_id,'status','conflict',
      'changed','[]'::jsonb,'actionNo',null,'current',pg_catalog.to_jsonb(v_run),
      'conflict',pg_catalog.jsonb_build_object('expectedVersion',v_expected,
        'currentVersion',v_run.version));
  else
    if v_run.status not in ('running','exhausted') or v_run.position<1 then
      raise exception 'No answer to undo in this run';
    end if;
    select * into v_item from public.review_run_items
      where user_id=v_owner and run_id=v_run.id
        and id=(v_patch->>'item_id')::uuid for update;
    if not found or v_item.position<>v_run.position-1 or v_item.state<>'graded'
        or v_item.review_id is null then
      raise exception 'Only the last graded item can be undone';
    end if;
    if not exists(select 1 from public.reviews r where r.id=v_item.review_id
        and r.user_id=v_owner and r.card_id=v_item.card_id and r.undone_at is null) then
      raise exception 'The answer was already undone or is not this owner''s';
    end if;
    -- Ownership is proven above; undo_review restores the card's previous schedule
    -- and refuses when a newer answer for the card exists.
    perform public.undo_review(v_item.review_id);
    update public.review_run_items set state='pending',review_id=null,
      expected_card_version=(select version from public.cards where id=v_item.card_id and user_id=v_owner),
      version=version+1,updated_at=pg_catalog.now(),source=v_source
    where user_id=v_owner and id=v_item.id returning * into v_item;
    update public.review_runs set position=position-1,revealed=false,status='running',
      ended_at=null,version=version+1,updated_at=pg_catalog.now(),source=v_source
    where id=v_run.id and user_id=v_owner returning * into v_run;
  end if;
  if v_receipt is null then
    select a.no into v_action from public.actions a
      where a.txid=pg_catalog.txid_current() and a.user_id=v_owner;
    if v_action is null then raise exception 'Review-run write has no action journal'; end if;
    v_receipt := pg_catalog.jsonb_build_object('operationId',v_operation_id,
      'status','ok','actionNo',v_action,
      'changed',pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('resource','review_runs','id',v_run.id,'version',v_run.version),
        pg_catalog.jsonb_build_object('resource','review_run_items','id',v_item.id,'version',v_item.version)),
      'run',pg_catalog.to_jsonb(v_run),'item',pg_catalog.to_jsonb(v_item));
  end if;
  insert into public.command_receipts(user_id,operation_id,resource,result)
    values(v_owner,v_operation_id,'review_runs',
      v_receipt||pg_catalog.jsonb_build_object('_request',p));
  return v_receipt;
end
$review_runs_undo_last$;

create or replace function public.approve_proposal(p_id uuid,p_edit jsonb default null) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
 p public.proposals; project_row public.projects; payload jsonb; item jsonb; related_item jsonb; operation jsonb;
 c public.checkpoints; note public.notes; target uuid; concept uuid; related uuid; source uuid; cp uuid;
 new_code text; value text; next_code int; letter int; idx int:=0; count_concepts int:=0; approval_result jsonb;
 resolved bigint[]; sort_position real; reserved text[];
begin
 if current_setting('role',true)<>'service_role' then perform set_config('lemma.source','app',true);perform set_config('lemma.tool','approve_proposal',true);perform set_config('lemma.summary','approve_proposal',true);end if;
 select * into p from public.proposals where id=p_id for update;
 if not found then raise exception 'Proposal not found'; end if;
 if p.status<>'pending' or p.withdrawn_at is not null then raise exception 'Proposal is not active and pending'; end if;
 select * into strict project_row from public.projects where id=p.project_id and user_id=p.user_id for update;
 if p.base_target_versions <> '{}'::jsonb then
   perform public.lemma_proposal_assert_versions(p.user_id,p.base_target_versions);
 end if;
 if p_edit is not null and pg_catalog.jsonb_typeof(p_edit)='object'
    and p_edit ? 'expected_versions' then
   perform public.lemma_proposal_assert_versions(p.user_id,p_edit->'expected_versions');
   p_edit:=p_edit-'expected_versions';
   if p_edit='{}'::jsonb then p_edit:=null; end if;
 end if;
 payload:=p.payload;
 if p.kind='card' then
  if p_edit is not null then
   if jsonb_typeof(p_edit)<>'object' or exists(select 1 from jsonb_object_keys(p_edit) k where k not in ('front','back','type','kind')) then raise exception 'Only front, back, type and kind may be edited'; end if;
   payload:=payload || p_edit;
  end if;
  if payload ? 'checkpoint' then
   select id into cp from public.checkpoints where user_id=p.user_id and project_id=p.project_id and code=payload->>'checkpoint';
   if not found then raise exception 'Unknown checkpoint: %',payload->>'checkpoint'; end if;
  end if;
  if payload ? 'source' then
   select id into source from public.sources where user_id=p.user_id and project_id=p.project_id and short=payload->>'source';
   if not found then raise exception 'Unknown source: %',payload->>'source'; end if;
  end if;
  if payload ? 'concept' then concept:=public.lemma_ensure_concept(p.user_id,project_row.subject_id,payload->>'concept'); end if;
  insert into public.notes(user_id,project_id,checkpoint_id,session_id,concept_id,source_id,page_label,kind,type,front,back,tags,origin)
   values(p.user_id,p.project_id,cp,p.session_id,concept,source,payload->>'page',coalesce(payload->>'kind','other'),coalesce(payload->>'type','basic'),
    payload->>'front',coalesce(payload->>'back',''),array(select jsonb_array_elements_text(coalesce(payload->'tags','[]'))),p.origin)
   returning * into note;
  perform public.lemma_reconcile_cards(p.user_id,note.id);
  approval_result:=jsonb_build_object('note_no',note.no);
 elsif p.kind='card_edit' then
  if p_edit is not null then
   if jsonb_typeof(p_edit)<>'object' or exists(select 1 from jsonb_object_keys(p_edit) k where k not in ('front','back','type','kind')) then raise exception 'Invalid card edit'; end if;
   payload:=payload||p_edit;
  end if;
  select * into note from public.notes where no=(payload->>'note_no')::bigint and user_id=p.user_id and project_id=p.project_id for update;
  if not found then raise exception 'Note not found'; end if;
  update public.notes set front=case when payload ? 'front' then payload->>'front' else front end,
   back=case when payload ? 'back' then payload->>'back' else back end,
   type=case when payload ? 'type' then payload->>'type' else type end,kind=case when payload?'kind' then payload->>'kind' else kind end where id=note.id and user_id=p.user_id;
  perform public.lemma_reconcile_cards(p.user_id,note.id);
  with changed as (
   update public.card_comments set status='addressed',resolved_at=now(),resolved_by_proposal=p.id
    where user_id=p.user_id and note_id=note.id and no in (select resolved_no::bigint from jsonb_array_elements_text(coalesce(payload->'resolves','[]')) as ids(resolved_no))
    returning no
  ) select coalesce(array_agg(no order by no),'{}'::bigint[]) into resolved from changed;
  approval_result:=jsonb_build_object('note_no',note.no,'resolved',to_jsonb(resolved));
 elsif p.kind='plan' then
  if exists(select 1 from public.checkpoints where project_id=p.project_id and user_id=p.user_id) then raise exception 'This project already has a plan; propose changes instead'; end if;
  if jsonb_typeof(payload->'checkpoints') is distinct from 'array' or jsonb_array_length(payload->'checkpoints')=0 then raise exception 'A plan needs checkpoints'; end if;
  for item in select jsonb_array_elements(coalesce(payload->'concepts','[]')) loop
   concept:=public.lemma_ensure_concept(p.user_id,project_row.subject_id,item->>'name',item->>'blurb');
   if item ? 'topic' then
    update public.concepts set topic=item->>'topic' where id=concept and user_id=p.user_id;
   end if;
   count_concepts:=count_concepts+1;
   for value in select jsonb_array_elements_text(coalesce(item->'prereqs','[]')) loop
    related:=public.lemma_ensure_concept(p.user_id,project_row.subject_id,value);
    insert into public.concept_links(user_id,from_id,to_id,kind) values(p.user_id,related,concept,'prereq') on conflict do nothing;
   end loop;
   for value in select jsonb_array_elements_text(coalesce(item->'related','[]')) loop
    related:=public.lemma_ensure_concept(p.user_id,project_row.subject_id,value);
    insert into public.concept_links(user_id,from_id,to_id,kind) values(p.user_id,concept,related,'related') on conflict do nothing;
   end loop;
  end loop;
  for item in select jsonb_array_elements(payload->'checkpoints') loop
   idx:=idx+1;
   cp:=public.lemma_add_checkpoint(p.user_id,p.project_id,item,idx*10,coalesce(item->>'code','CP'||idx));
  end loop;
  idx:=0;
  for item in select jsonb_array_elements(payload->'checkpoints') loop
   idx:=idx+1;
   select id into strict cp from public.checkpoints where project_id=p.project_id and user_id=p.user_id and code=coalesce(item->>'code','CP'||idx);
   perform public.lemma_link_checkpoint(p.user_id,p.project_id,cp,item);
  end loop;
  update public.projects set status='active' where id=p.project_id and user_id=p.user_id;
  approval_result:=jsonb_build_object('checkpoints',idx,'concepts',count_concepts);
 elsif p.kind='plan_change' then
  if jsonb_typeof(payload->'ops') is distinct from 'array' then raise exception 'Plan changes need an ops array'; end if;
  select array_agg(code) into reserved from (
   select code from public.checkpoints where user_id=p.user_id and project_id=p.project_id
   union select x->>'code' from jsonb_array_elements(payload->'ops') x where x->>'op'='add' and x->>'code' is not null) codes;
  reserved:=coalesce(reserved,'{}'::text[]);
  for item in select jsonb_array_elements(coalesce(payload->'concepts','[]')) loop
   concept:=public.lemma_ensure_concept(p.user_id,project_row.subject_id,item->>'name',item->>'blurb');
   for value in select jsonb_array_elements_text(coalesce(item->'prereqs','[]')) loop
    related:=public.lemma_ensure_concept(p.user_id,project_row.subject_id,value);
    insert into public.concept_links(user_id,from_id,to_id,kind) values(p.user_id,related,concept,'prereq') on conflict do nothing;
   end loop;
   for value in select jsonb_array_elements_text(coalesce(item->'related','[]')) loop
    related:=public.lemma_ensure_concept(p.user_id,project_row.subject_id,value);
    insert into public.concept_links(user_id,from_id,to_id,kind) values(p.user_id,concept,related,'related') on conflict do nothing;
   end loop;
  end loop;
  for operation in select jsonb_array_elements(payload->'ops') loop
   if operation->>'op'='add' then
    new_code:=operation->>'code';
    if new_code is null and operation ? 'after' then
     for letter in 97..122 loop
      new_code:=substring(operation->>'after' from '^CP[0-9]+')||chr(letter);
      exit when not(new_code=any(reserved));
      new_code:=null;
     end loop;
     if new_code is null then raise exception 'No free checkpoint suffix'; end if;
    elsif new_code is null then
     select n into next_code from generate_series(1,999) n where not(('CP'||n)=any(reserved)) order by n limit 1;
     new_code:='CP'||next_code;
    end if;
    reserved:=array_append(reserved,new_code);
    sort_position:=public.lemma_plan_position(p.user_id,p.project_id,operation->>'after');
    cp:=public.lemma_add_checkpoint(p.user_id,p.project_id,operation,sort_position,new_code);
    perform public.lemma_link_checkpoint(p.user_id,p.project_id,cp,operation);
   else
    select * into c from public.checkpoints where user_id=p.user_id and project_id=p.project_id and code=operation->>'code' for update;
    if not found then raise exception 'Unknown checkpoint: %',operation->>'code'; end if;
    case operation->>'op'
     when 'update' then
      update public.checkpoints set
       stage=case when operation ? 'stage' then operation->>'stage' else stage end,
       title=case when operation ? 'title' then operation->>'title' else title end,
       objective=case when operation ? 'objective' then operation->>'objective' else objective end,
       criterion=case when operation ? 'criterion' then operation->>'criterion' else criterion end,
       steps=case when operation ? 'steps' then operation->'steps' else steps end,
       current_step=case when operation ? 'steps' then least(current_step,jsonb_array_length(operation->'steps')) else current_step end,
       pages=case when operation ? 'pages' then operation->>'pages' else pages end,
       recheck_prompt=case when operation ? 'recheck_prompt' then operation->>'recheck_prompt' else recheck_prompt end,
       needs_revisit=needs_revisit or (status='demonstrated' and operation ? 'criterion' and criterion is distinct from operation->>'criterion')
      where id=c.id and user_id=p.user_id;
     when 'remove' then
      if c.status<>'not_started' or exists(select 1 from public.session_events where user_id=p.user_id and checkpoint_id=c.id)
       or exists(select 1 from public.notes where user_id=p.user_id and checkpoint_id=c.id) then raise exception 'Only an untouched checkpoint can be removed'; end if;
      delete from public.checkpoints where id=c.id and user_id=p.user_id;
     when 'move' then
      if not (operation ? 'after') then raise exception 'A move needs an insertion point'; end if;
      reserved:=array_append(reserved,new_code);
    sort_position:=public.lemma_plan_position(p.user_id,p.project_id,operation->>'after',c.id);
      update public.checkpoints set position=sort_position where id=c.id and user_id=p.user_id;
     when 'prereq_add', 'prereq_remove' then
      select id into related from public.checkpoints where user_id=p.user_id and project_id=p.project_id and code=operation->>'prereq';
      if not found then raise exception 'Unknown prerequisite: %',operation->>'prereq'; end if;
      if operation->>'op'='prereq_add' then
       insert into public.checkpoint_prereqs(user_id,checkpoint_id,prereq_id) values(p.user_id,c.id,related) on conflict do nothing;
      else delete from public.checkpoint_prereqs where user_id=p.user_id and checkpoint_id=c.id and prereq_id=related; end if;
     else raise exception 'Unknown plan operation: %',operation->>'op';
    end case;
   end if;
   idx:=idx+1;
  end loop;
  approval_result:=jsonb_build_object('applied',idx);
 end if;
 if p.kind in ('plan','plan_change') and exists(
  with recursive walk as (
   select e.checkpoint_id,e.prereq_id,array[e.checkpoint_id,e.prereq_id] path,false cycle
   from public.checkpoint_prereqs e join public.checkpoints checkpoint_row on checkpoint_row.id=e.checkpoint_id and checkpoint_row.user_id=e.user_id
   where e.user_id=p.user_id and checkpoint_row.project_id=p.project_id
   union all
   select w.checkpoint_id,e.prereq_id,w.path||e.prereq_id,e.prereq_id=any(w.path)
   from walk w join public.checkpoint_prereqs e on e.checkpoint_id=w.prereq_id and e.user_id=p.user_id where not w.cycle
  ) select 1 from walk where cycle
 ) then raise exception 'Checkpoint prerequisites must not contain a cycle'; end if;
 update public.proposals set status='approved',decided_at=now(),result=approval_result where id=p.id and user_id=p.user_id;
 return approval_result;
end $$;

alter table public.device_commands add column delivery_claim uuid;

create function public.device_commands_recoverable(p_device uuid)
returns setof public.device_commands language plpgsql security definer set search_path = '' as $for$
declare v_owner uuid := auth.uid();
begin
 if current_setting('role',true)<>'service_role' then perform set_config('lemma.source','app',true);perform set_config('lemma.tool','device_commands_recoverable',true);perform set_config('lemma.summary','device_commands_recoverable',true);end if;
 if v_owner is null or pg_catalog.current_setting('role',true) <> 'authenticated' then
  raise exception 'Authenticated owner required'; end if;
 update public.app_devices set last_seen_at = pg_catalog.now() where user_id = v_owner and id = p_device;
 update public.device_commands set status = 'expired',reason = 'expired before the device ran it',
  version = version + 1
  where user_id = v_owner and device_id = p_device and status in ('pending','delivered')
   and expires_at <= pg_catalog.now();
 return query select * from public.device_commands c where c.user_id = v_owner and c.device_id = p_device
  and c.status in ('pending','delivered') and c.expires_at > pg_catalog.now() order by c.created_at limit 10;
end
$for$;

revoke all on function public.device_commands_recoverable(uuid) from public,anon,service_role;grant execute on function public.device_commands_recoverable(uuid) to authenticated;

create or replace function public.device_commands_command(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $dc$
declare
 v_owner uuid := auth.uid(); v_operation_id uuid; v_operation text; v_patch jsonb; v_target jsonb; v_bad text;
 v_stored jsonb; v_result jsonb; v_device public.app_devices%rowtype; v_row public.device_commands%rowtype;
 v_entry public.study_entries%rowtype; v_kind text; v_payload jsonb; v_minutes integer; v_expected integer; v_source text;
begin
 if v_owner is null or pg_catalog.current_setting('role',true) not in ('authenticated','service_role') then
  raise exception 'Authentication required'; end if;
 if p is null or pg_catalog.jsonb_typeof(p) is distinct from 'object' then raise exception 'Command envelope must be an object'; end if;
 if nullif(p->>'operationId','') is null then raise exception 'operationId is required'; end if;
 v_operation_id := (p->>'operationId')::uuid;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text||':'||v_operation_id::text,0));
 select result into v_stored from public.command_receipts where user_id = v_owner and operation_id = v_operation_id;
 if found then
  if v_stored->'_request' = p then return v_stored - '_request'; end if;
  return pg_catalog.jsonb_build_object('operationId',v_operation_id,'status','conflict','changed','[]'::jsonb,
   'actionNo',null,'conflict',pg_catalog.jsonb_build_object('reason','operationId reused with a different payload'));
 end if;
 select key into v_bad from pg_catalog.jsonb_object_keys(p) as keys(key)
  where key <> all(array['operationId','schemaVersion','resource','operation','target','expectedVersion','patch']) limit 1;
 if v_bad is not null then raise exception 'Unknown command field: %',v_bad; end if;
 if pg_catalog.jsonb_typeof(p->'schemaVersion') is distinct from 'number' or p->>'schemaVersion' is distinct from '1' then
  raise exception 'schemaVersion must be 1'; end if;
 if p->>'resource' is distinct from 'device_commands' then raise exception 'Unsupported resource'; end if;
 v_operation := p->>'operation';
 if v_operation is null or v_operation not in ('send','cancel') then raise exception 'Unsupported device command operation'; end if;
 v_patch := coalesce(p->'patch','{}'::jsonb); v_target := coalesce(p->'target','{}'::jsonb);
 if pg_catalog.jsonb_typeof(v_patch) is distinct from 'object' or pg_catalog.jsonb_typeof(v_target) is distinct from 'object' then
  raise exception 'patch and target must be objects'; end if;
 select key into v_bad from pg_catalog.jsonb_object_keys(v_patch) as keys(key)
  where key <> all(case v_operation when 'send' then array['device_id','kind','payload','expires_in_minutes'] else array[]::text[] end) limit 1;
 if v_bad is not null then raise exception 'Unknown device command patch field: %',v_bad; end if;
 v_source := case when pg_catalog.current_setting('role',true) = 'service_role'
   and pg_catalog.current_setting('lemma.source',true) in ('claude','chatgpt','other') then pg_catalog.current_setting('lemma.source',true) else 'app' end;

 if v_operation = 'send' then
  select * into v_device from public.app_devices where user_id = v_owner and id = nullif(v_patch->>'device_id','')::uuid;
  if not found then raise exception 'Device not found for owner'; end if;
  v_kind := v_patch->>'kind'; v_payload := coalesce(v_patch->'payload','{}'::jsonb);
  if v_kind is null or v_kind not in ('open','timer') then raise exception 'kind must be open or timer'; end if;
  if pg_catalog.jsonb_typeof(v_payload) is distinct from 'object' then raise exception 'payload must be an object'; end if;
  if v_kind = 'open' then
   select key into v_bad from pg_catalog.jsonb_object_keys(v_payload) as keys(key) where key <> all(array['screen','record']) limit 1;
   if v_bad is not null then raise exception 'Unknown open payload field: %',v_bad; end if;
   if (v_payload ? 'screen') = (v_payload ? 'record') then raise exception 'open needs exactly one of screen or record'; end if;
   if v_payload ? 'screen' and (pg_catalog.jsonb_typeof(v_payload->'screen') is distinct from 'string'
     or v_payload->>'screen' <> all(array['today','paths','review','calendar','tasks','progress','log','focus','inbox','settings','atlas','cards'])) then
    raise exception 'Unknown screen'; end if;
   if v_payload ? 'record' and (pg_catalog.jsonb_typeof(v_payload->'record') is distinct from 'object'
     or v_payload->'record'->>'type' is null or v_payload->'record'->>'type' <> all(array['task','path','checkpoint'])
     or v_payload->'record'->>'id' !~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$'
     or (select count(*) from pg_catalog.jsonb_object_keys(v_payload->'record')) <> 2) then
    raise exception 'record needs a type (task, path or checkpoint) and a UUID id'; end if;
  else
   select key into v_bad from pg_catalog.jsonb_object_keys(v_payload) as keys(key) where key <> all(array['action','intent']) limit 1;
   if v_bad is not null then raise exception 'Unknown timer payload field: %',v_bad; end if;
   if pg_catalog.jsonb_typeof(v_payload->'action') is distinct from 'string'
     or v_payload->>'action' <> all(array['start','pause','resume','break','next_phase','save','discard']) then
    raise exception 'timer action must be start, pause, resume, break, next_phase, save or discard'; end if;
   if v_payload ? 'intent' and (v_payload->>'action' <> 'start' or pg_catalog.jsonb_typeof(v_payload->'intent') is distinct from 'string'
     or pg_catalog.char_length(v_payload->>'intent') not between 1 and 200) then
    raise exception 'intent is only for start (1..200 characters)'; end if;
  end if;
  if v_kind='timer' and v_payload->>'action'<>'start' then
   select * into v_entry from public.study_entries where user_id=v_owner and status in ('running','paused') order by created_at desc limit 1;
   if not found then raise exception 'No active timer to target'; end if;
   v_payload:=v_payload||jsonb_build_object('entryId',v_entry.id,'entryVersion',v_entry.version);
  end if;
  v_minutes := coalesce((v_patch->>'expires_in_minutes')::integer,2);
  if v_minutes not between 1 and 10 then raise exception 'expires_in_minutes must be 1..10'; end if;
  if (select count(*) from public.device_commands c where c.user_id = v_owner and c.device_id = v_device.id
     and c.status in ('pending','delivered') and c.expires_at > pg_catalog.now()) >= 20 then
   raise exception 'This device already has 20 commands waiting'; end if;
  insert into public.device_commands(user_id,device_id,kind,payload,source,expires_at)
   values(v_owner,v_device.id,v_kind,v_payload,v_source,pg_catalog.now() + pg_catalog.make_interval(mins => v_minutes))
   returning * into v_row;
  v_result := pg_catalog.jsonb_build_object('operationId',v_operation_id,'status','ok',
   'changed',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('id',v_row.id,'version',v_row.version)),
   'actionNo',null,'command_id',v_row.id,'expires_at',v_row.expires_at,
   'device_seen_minutes_ago',floor(extract(epoch from (pg_catalog.now() - v_device.last_seen_at)) / 60)::integer,
   'next','Read get(what=device_commands, id) until status is applied or rejected; a device that is closed leaves it pending until it expires.');
 else
  if nullif(v_target->>'id','') is null then raise exception 'target.id required'; end if;
  if pg_catalog.jsonb_typeof(p->'expectedVersion') is distinct from 'number' or p->>'expectedVersion' !~ '^[1-9][0-9]*$' then
   raise exception 'expectedVersion must be a positive integer'; end if;
  v_expected := (p->>'expectedVersion')::integer;
  select * into v_row from public.device_commands where id = (v_target->>'id')::uuid and user_id = v_owner for update;
  if not found then raise exception 'Device command not found'; end if;
  if v_row.version <> v_expected then
   v_result := pg_catalog.jsonb_build_object('operationId',v_operation_id,'status','conflict','changed','[]'::jsonb,'actionNo',null,
    'current',pg_catalog.jsonb_build_object('id',v_row.id,'status',v_row.status,'version',v_row.version),
    'conflict',pg_catalog.jsonb_build_object('expectedVersion',v_expected,'currentVersion',v_row.version));
  else
   if v_row.status not in ('pending','delivered') then raise exception 'Only a waiting command can be cancelled'; end if;
   update public.device_commands set status = 'cancelled',reason = 'cancelled from chat',version = version + 1
    where id = v_row.id returning * into v_row;
   v_result := pg_catalog.jsonb_build_object('operationId',v_operation_id,'status','ok',
    'changed',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('id',v_row.id,'version',v_row.version)),'actionNo',null);
  end if;
 end if;
 insert into public.command_receipts(user_id,operation_id,resource,result)
  values(v_owner,v_operation_id,'device_commands',v_result || pg_catalog.jsonb_build_object('_request',p));
 return v_result;
end
$dc$;

create function public.device_command_claim(p_id uuid,p_claim uuid) returns jsonb
language plpgsql security definer set search_path='' as $claim$
declare u uuid:=auth.uid(); r public.device_commands%rowtype;
begin
 if current_setting('role',true)<>'service_role' then perform set_config('lemma.source','app',true);perform set_config('lemma.tool','device_command_claim',true);perform set_config('lemma.summary','device_command_claim',true);end if;
 if u is null or current_setting('role',true)<>'authenticated' or p_claim is null then raise exception 'Authenticated claim required'; end if;
 select * into r from public.device_commands where user_id=u and id=p_id for update;
 if not found then raise exception 'Device command not found'; end if;
 if r.status not in ('pending','delivered') or r.expires_at<=now() then return jsonb_build_object('accepted',false,'status',r.status); end if;
 if r.status='delivered' then return jsonb_build_object('accepted',coalesce(r.delivery_claim=p_claim,false),'status',r.status); end if;
 update public.device_commands set status='delivered',delivery_claim=p_claim,delivered_at=now(),version=version+1 where id=p_id and user_id=u;
 return jsonb_build_object('accepted',true,'status','delivered');
end $claim$;
revoke all on function public.device_command_claim(uuid,uuid) from public,anon,service_role;
grant execute on function public.device_command_claim(uuid,uuid) to authenticated;

create or replace function public.lemma_study_command_v2_compat(p jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $study$
declare
  v_owner uuid;
  v_operation_id uuid;
  v_resource text;
  v_operation text;
  v_patch jsonb;
  v_target jsonb;
  v_id uuid;
  v_expected integer;
  v_block public.calendar_blocks%rowtype;
  v_new public.calendar_blocks%rowtype;
  v_receipt jsonb;
  v_bad text;
  v_action_no bigint;
  v_timer_conflict jsonb;
begin
  v_owner := (select auth.uid());
  if v_owner is null then raise exception 'Authentication required'; end if;
  if p is null or pg_catalog.jsonb_typeof(p) <> 'object' then
    raise exception 'Command envelope must be an object';
  end if;
  if not (p ? 'operationId') or nullif(p ->> 'operationId', '') is null then
    raise exception 'operationId is required';
  end if;
  v_operation_id := (p ->> 'operationId')::uuid;

  -- Serialize concurrent retries by authenticated owner + operation ID.
  -- A lost acknowledgement replays the stored result before any version check.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_owner::text || ':' || v_operation_id::text, 0)
  );
  select r.result into v_receipt from public.command_receipts r
    where r.user_id = v_owner and r.operation_id = v_operation_id;
  if found then
    -- N51 receipts carry their exact request, unlike older v1 receipts.
    -- Keep the legacy replay shape untouched while detecting changed-payload
    -- operationId reuse on correction/split/void/restore/manual commands.
    if v_receipt ? '_request' then
      if v_receipt->'_request'=p then return v_receipt-'_request'; end if;
      return pg_catalog.jsonb_build_object('operationId',v_operation_id,
        'status','conflict','changed','[]'::jsonb,'actionNo',null,
        'conflict',pg_catalog.jsonb_build_object(
          'reason','operationId reused with a different payload'));
    end if;
    -- An N51 action cannot claim the operationId of an earlier v1 action.
    -- Old v1 replay itself remains byte-for-byte compatible.
    if p->>'resource'='study_entries' and p->>'operation' in
      ('create_manual','correct','split','void','restore',
       'take_lease','next_phase','exclude_minutes') then
      return pg_catalog.jsonb_build_object('operationId',v_operation_id,
        'status','conflict','changed','[]'::jsonb,'actionNo',null,
        'conflict',pg_catalog.jsonb_build_object(
          'reason','operationId already belongs to a legacy command'));
    end if;
    return v_receipt;
  end if;

  select k into v_bad from pg_catalog.jsonb_object_keys(p) as t(k)
    where k <> all(array['operationId','schemaVersion','resource',
                        'operation','target','expectedVersion','patch',
                        'device','leaseVersion','at'])
    limit 1;
  if v_bad is not null then raise exception 'Unknown command field: %', v_bad; end if;
  if pg_catalog.jsonb_typeof(p -> 'schemaVersion') is distinct from 'number'
      or p ->> 'schemaVersion' is distinct from '1' then
    raise exception 'schemaVersion must be 1';
  end if;
  if p?'at' and ((p->>'at')::timestamptz>clock_timestamp() or
    (p->>'at')::timestamptz<clock_timestamp()-interval '7 days' or
    p->>'resource'<>'study_entries' or p->>'operation' not in ('pause','resume','break','save','next_phase')) then
    raise exception 'Invalid historical timer timestamp'; end if;
  v_resource := p ->> 'resource';
  v_operation := p ->> 'operation';
  -- N52 adds an owner/device guard for legacy writes, without changing
  -- their command grammar, journal, receipt or optimistic version behavior.
  v_timer_conflict:=public.lemma_study_timer_lease_conflict(p,v_owner);
  if v_timer_conflict is not null then return v_timer_conflict; end if;
  if v_resource in ('study_entries','study_intervals') then
    perform pg_catalog.set_config('lemma.tool','study',true);
  end if;
  if v_resource='study_entries' and v_operation in
       ('take_lease','next_phase','exclude_minutes') then
    return public.lemma_study_timer_command(p,v_owner,v_operation_id);
  end if;
  if v_resource='study_entries' and v_operation in
       ('create_manual','correct','split','void','restore') then
    -- Only new operations go to the v2 helper. All existing N11 lifecycle
    -- operations continue through their original function unchanged.
    perform pg_catalog.set_config('lemma.source',
      case when current_setting('role',true)='service_role' and
         pg_catalog.current_setting('lemma.source',true) in
          ('claude','chatgpt','other','system')
        then pg_catalog.current_setting('lemma.source',true)
        when current_setting('role',true)='service_role' then 'other'
        else 'app' end,true);
    return public.study_command_correction(p,v_owner,v_operation_id);
  end if;
  if v_resource in ('study_entries','study_intervals') then
    v_receipt := public.study_command_lifecycle(p,v_owner,v_operation_id);
    -- The N11.2 helper already persisted this receipt; attach the journal action.
    if v_receipt ->> 'status' = 'ok' then
      select a.no into v_action_no from public.actions a
        where a.txid = pg_catalog.txid_current() and a.user_id = v_owner;
      if v_action_no is null then raise exception 'Study change has no journal action'; end if;
      v_receipt := pg_catalog.jsonb_set(v_receipt, '{actionNo}', pg_catalog.to_jsonb(v_action_no));
      update public.command_receipts set result = v_receipt
        where user_id = v_owner and operation_id = v_operation_id;
    end if;
    return v_receipt;
  end if;
  if v_resource is distinct from 'calendar_blocks' then
    raise exception 'Unsupported resource: %', v_resource;
  end if;
  if v_operation not in ('create', 'update', 'delete') or v_operation is null then
    raise exception 'Unsupported operation: %', v_operation;
  end if;
  v_patch := case when v_operation = 'delete' then coalesce(p -> 'patch', '{}'::jsonb) else p -> 'patch' end;
  if pg_catalog.jsonb_typeof(v_patch) is distinct from 'object' then
    raise exception 'patch must be an object';
  end if;
  select k into v_bad from pg_catalog.jsonb_object_keys(v_patch) as t(k)
    where k <> all(case when v_operation = 'delete' then array[]::text[]
        else array['kind','title','starts_at','ends_at','time_zone',
                   'status','subject_id','project_id','checkpoint_id','session_id','task_id'] end)
    limit 1;
  if v_bad is not null then raise exception 'Unknown patch field: %', v_bad; end if;

  v_target := coalesce(p -> 'target','{}'::jsonb);
  if pg_catalog.jsonb_typeof(v_target) is distinct from 'object' then
    raise exception 'target must be an object';
  end if;
  select k into v_bad from pg_catalog.jsonb_object_keys(v_target) as t(k)
    where k <> 'id' limit 1;
  if v_bad is not null then raise exception 'Unknown target field: %', v_bad; end if;

  if v_operation = 'create' then
    if p ? 'expectedVersion' and (p ->> 'expectedVersion') is distinct from '0' then
      raise exception 'create expectedVersion must be absent or 0';
    end if;
    v_id := coalesce(nullif(v_target ->> 'id', '')::uuid, pg_catalog.gen_random_uuid());
    insert into public.calendar_blocks(
      id,user_id,kind,title,starts_at,ends_at,time_zone,status,
      subject_id,project_id,checkpoint_id,session_id,task_id
    ) values (
      v_id,v_owner,v_patch ->> 'kind',v_patch ->> 'title',
      (v_patch ->> 'starts_at')::timestamptz,(v_patch ->> 'ends_at')::timestamptz,
      v_patch ->> 'time_zone',coalesce(v_patch ->> 'status','planned'),
      (v_patch ->> 'subject_id')::uuid,(v_patch ->> 'project_id')::uuid,
      (v_patch ->> 'checkpoint_id')::uuid,(v_patch ->> 'session_id')::uuid,
      (v_patch ->> 'task_id')::uuid
    ) returning * into v_block;
  else
    if nullif(v_target ->> 'id','') is null then
      raise exception 'target.id required for update';
    end if;
    if pg_catalog.jsonb_typeof(p -> 'expectedVersion') is distinct from 'number' then
      raise exception 'expectedVersion required for update';
    end if;
    v_id := (v_target ->> 'id')::uuid;
    v_expected := (p ->> 'expectedVersion')::integer;
    select * into v_block from public.calendar_blocks
      where id = v_id and user_id = v_owner for update;
    if not found then raise exception 'Calendar block not found'; end if;
    if v_block.version is distinct from v_expected then
      v_receipt := pg_catalog.jsonb_build_object(
        'operationId',v_operation_id::text,'status','conflict',
        'changed',pg_catalog.jsonb_build_array(),'actionNo',null,
        'current',pg_catalog.to_jsonb(v_block),
        'conflict',pg_catalog.jsonb_build_object(
          'expectedVersion',v_expected,'currentVersion',v_block.version)
      );
    else
      if v_operation = 'delete' then
        delete from public.calendar_blocks where id = v_id and user_id = v_owner;
        v_block.version := v_block.version + 1;
      else
      -- The existing row supplies omitted keys; explicit null stays null.
      -- The allow-list forbids owner, ID, and version edits.
      select * into v_new from pg_catalog.jsonb_populate_record(v_block, v_patch);
      update public.calendar_blocks set
        kind = v_new.kind, title = v_new.title,
        starts_at = v_new.starts_at, ends_at = v_new.ends_at,
        time_zone = v_new.time_zone, status = v_new.status,
        subject_id = v_new.subject_id, project_id = v_new.project_id,
        checkpoint_id = v_new.checkpoint_id, session_id = v_new.session_id,
        task_id = v_new.task_id,
        version = version + 1
      where id = v_id and user_id = v_owner
      returning * into v_block;
      end if;
    end if;
  end if;

  if v_receipt is null then
    v_receipt := pg_catalog.jsonb_build_object(
      'operationId',v_operation_id::text,'status','ok',
      'changed',pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('id',v_block.id,'version',v_block.version)
      ),
      'actionNo',null
    );
  end if;
  if v_receipt ->> 'status' = 'ok' then
    select a.no into v_action_no from public.actions a
      where a.txid = pg_catalog.txid_current() and a.user_id = v_owner;
    if v_action_no is null then raise exception 'Calendar change has no journal action'; end if;
    v_receipt := pg_catalog.jsonb_set(v_receipt, '{actionNo}', pg_catalog.to_jsonb(v_action_no));
  end if;
  insert into public.command_receipts(user_id,operation_id,resource,result)
    values(v_owner,v_operation_id,v_resource,v_receipt);
  return v_receipt;
end
$study$;

create or replace function public.study_command_lifecycle(p jsonb, v_owner uuid, v_operation_id uuid)
returns jsonb language plpgsql security invoker set search_path = ''
as $lifecycle$
declare
 r text := p->>'resource';
 op text := p->>'operation';
 patch jsonb := coalesce(p->'patch','{}'::jsonb);
 target uuid := nullif(p#>>'{target,id}','')::uuid;
 expected integer;
 entry public.study_entries%rowtype;
 interval_row public.study_intervals%rowtype;
 changed uuid;
 ver integer;
 receipt jsonb;
 bad text;
 ts timestamptz := coalesce((p->>'at')::timestamptz,clock_timestamp());
begin
 if current_setting('role',true)<>'service_role' then perform set_config('lemma.source','app',true);perform set_config('lemma.tool','study',true);perform set_config('lemma.summary','study',true);end if;
 if p?'at' and (r<>'study_entries' or op not in ('pause','resume','break','save') or ts>clock_timestamp() or ts<clock_timestamp()-interval '7 days') then
  raise exception 'Invalid historical timer timestamp'; end if;
 if r not in ('study_entries','study_intervals') or r is null then raise exception 'Unsupported resource: %',r; end if;
 if jsonb_typeof(patch) <> 'object' then raise exception 'patch must be an object'; end if;
 if op not in ('create','update','delete','start','pause','resume','break','save','discard') or op is null then raise exception 'Unsupported operation: %',op; end if;
 -- source and entry_id identify the record at creation and cannot change later.
 -- Deletion consumes no patch; never acknowledge keys that the write ignores.
 if r='study_entries' then
   select k into bad from jsonb_object_keys(patch) t(k)
    where k <> all(case op
      when 'create' then array['intent','source','subject_id','project_id','checkpoint_id','session_id','reflection','rating','calendar_block_id','preset_id']
      when 'delete' then array[]::text[]
      else array['intent','subject_id','project_id','checkpoint_id','session_id','reflection','rating']
    end) limit 1;
 else
   select k into bad from jsonb_object_keys(patch) t(k)
    where k <> all(case op
      when 'create' then array['entry_id','kind','started_at','ended_at']
      when 'delete' then array[]::text[]
      else array['kind','started_at','ended_at']
    end) limit 1;
 end if;
 if bad is not null then raise exception 'Unknown patch field: %',bad; end if;
 if op='create' then
   if p ? 'expectedVersion' and p->>'expectedVersion' <> '0' then raise exception 'create expectedVersion must be absent or 0'; end if;
   changed:=coalesce(target,gen_random_uuid());
   if r='study_entries' then
     -- N109: the same owner checks guard MCP-created drafts before any write.
     if (patch ? 'calendar_block_id' and
       pg_catalog.jsonb_typeof(patch->'calendar_block_id') not in ('string','null'))
       or (patch ? 'preset_id' and
       pg_catalog.jsonb_typeof(patch->'preset_id') not in ('string','null')) then
       raise exception 'Invalid study draft link type';
     end if;
     if patch->>'calendar_block_id' is not null and
       not exists(select 1 from public.calendar_blocks b
        where b.user_id=v_owner and b.id=(patch->>'calendar_block_id')::uuid
         and b.kind='study') then
       raise exception 'Linked calendar block must be an owned study block';
     end if;
     if patch->>'preset_id' is not null and
       not exists(select 1 from public.presets a
        where a.user_id=v_owner and a.id=(patch->>'preset_id')::uuid
         and a.archived_at is null) then
       raise exception 'Linked preset must be owned and active';
     end if;
     insert into public.study_entries(id,user_id,intent,source,subject_id,project_id,checkpoint_id,session_id,reflection,rating,calendar_block_id,preset_id)
     values(changed,v_owner,coalesce(patch->>'intent',''),patch->>'source',(patch->>'subject_id')::uuid,
       (patch->>'project_id')::uuid,(patch->>'checkpoint_id')::uuid,(patch->>'session_id')::uuid,
       patch->>'reflection',(patch->>'rating')::smallint,
       (patch->>'calendar_block_id')::uuid,(patch->>'preset_id')::uuid) returning version into ver;
   else
     select * into entry from public.study_entries
       where id=(patch->>'entry_id')::uuid and user_id=v_owner for update;
     if not found then raise exception 'Study entry not found'; end if;
     if entry.status in ('saved','discarded') then raise exception 'Terminal study entry'; end if;
     if (patch->>'started_at')::timestamptz > ts then raise exception 'Future interval start'; end if;
     if (patch->>'ended_at')::timestamptz > ts then raise exception 'Future interval end'; end if;
     if (patch->>'ended_at') is null and exists(select 1 from public.study_intervals where entry_id=entry.id and user_id=v_owner and ended_at is null) then raise exception 'Open interval exists'; end if;
     insert into public.study_intervals(id,user_id,entry_id,kind,started_at,ended_at)
     values(changed,v_owner,(patch->>'entry_id')::uuid,patch->>'kind',
       (patch->>'started_at')::timestamptz,(patch->>'ended_at')::timestamptz);
     update public.study_entries set version=version+1,updated_at=ts where id=entry.id and user_id=v_owner returning version into ver;
   end if;
 else
   if target is null then raise exception 'target.id required'; end if;
   if jsonb_typeof(p->'expectedVersion') is distinct from 'number' then raise exception 'expectedVersion required'; end if;
   expected:=(p->>'expectedVersion')::integer;
   if expected < 1 then raise exception 'expectedVersion must be positive'; end if;
   if r='study_intervals' then
     if op not in ('update','delete') then raise exception 'Unsupported interval operation: %',op; end if;
     select * into interval_row from public.study_intervals where id=target and user_id=v_owner for update;
     if not found then raise exception 'Study interval not found'; end if;
     select * into entry from public.study_entries where id=interval_row.entry_id and user_id=v_owner for update;
     if not found then raise exception 'Study entry not found'; end if;
     if entry.status in ('saved','discarded') then raise exception 'Terminal study entry'; end if;
     if expected <> entry.version then
       receipt:=jsonb_build_object('operationId',v_operation_id,'status','conflict','changed','[]'::jsonb,'actionNo',null,
         'current',to_jsonb(interval_row),'conflict',jsonb_build_object('expectedVersion',expected,'currentVersion',entry.version));
     elsif op='delete' then
       delete from public.study_intervals where id=target and user_id=v_owner;
     else
       if (case when patch ? 'started_at' then (patch->>'started_at')::timestamptz else interval_row.started_at end) > ts then raise exception 'Future interval start'; end if;
       if (case when patch ? 'ended_at' then (patch->>'ended_at')::timestamptz else interval_row.ended_at end) > ts then raise exception 'Future interval end'; end if;
       if patch ? 'ended_at' and patch->'ended_at' = 'null'::jsonb and exists(select 1 from public.study_intervals where entry_id=entry.id and user_id=v_owner and id<>target and ended_at is null) then raise exception 'Open interval exists'; end if;
       update public.study_intervals set
         kind=case when patch ? 'kind' then patch->>'kind' else kind end,
         started_at=case when patch ? 'started_at' then (patch->>'started_at')::timestamptz else started_at end,
         ended_at=case when patch ? 'ended_at' then (patch->>'ended_at')::timestamptz else ended_at end
       where id=target and user_id=v_owner;
     end if;
     if receipt is null then
       update public.study_entries set version=version+1,updated_at=ts where id=entry.id and user_id=v_owner returning version into ver;
     end if;
     changed:=target;
   else
     select * into entry from public.study_entries where id=target and user_id=v_owner for update;
     if not found then raise exception 'Study entry not found'; end if;
     if p?'at' and exists(select 1 from public.study_intervals where user_id=v_owner and entry_id=target and (started_at>=ts or ended_at>ts)) then raise exception 'Action predates recorded timer history'; end if;
     if entry.version <> expected then
       receipt:=jsonb_build_object('operationId',v_operation_id,'status','conflict','changed','[]'::jsonb,'actionNo',null,
         'current',to_jsonb(entry),'conflict',jsonb_build_object('expectedVersion',expected,'currentVersion',entry.version));
     else
       if entry.status in ('saved','discarded') then raise exception 'Terminal study entry'; end if;
       if op='start' and entry.status <> 'draft' then raise exception 'Invalid start transition'; end if;
       if op in ('pause','break') and entry.status <> 'running' then raise exception 'Invalid pause transition'; end if;
       if op='resume' and entry.status <> 'paused' then raise exception 'Invalid resume transition'; end if;
       if op='save' and entry.status not in ('running','paused','draft') then raise exception 'Invalid save transition'; end if;
       if op in ('pause','break','resume','save') and exists(select 1 from public.study_intervals where entry_id=target and user_id=v_owner and ended_at is null and started_at>=ts) then raise exception 'Future open interval'; end if;
       if op in ('pause','break','resume','save','discard') then
         update public.study_intervals set ended_at=ts
         where entry_id=target and user_id=v_owner and ended_at is null and started_at<ts;
       end if;
       if op='save' and exists(select 1 from public.study_intervals where entry_id=target and user_id=v_owner and ended_at is null) then raise exception 'Open interval remains'; end if;
       if op='discard' then
         delete from public.study_intervals where entry_id=target and user_id=v_owner;
       end if;
       if op in ('start','resume','break') then
         if exists(select 1 from public.study_intervals where entry_id=target and user_id=v_owner and ended_at is null) then
           raise exception 'Open interval exists';
         end if;
         insert into public.study_intervals(entry_id,user_id,kind,started_at)
         values(target,v_owner,case when op='break' then 'break' else 'focus' end,ts);
       end if;
       if op='delete' then
         delete from public.study_entries where id=target and user_id=v_owner;
         ver:=expected+1;
       else
         update public.study_entries set
           intent=case when patch ? 'intent' then patch->>'intent' else intent end,
           reflection=case when patch ? 'reflection' then patch->>'reflection' else reflection end,
           rating=case when patch ? 'rating' then (patch->>'rating')::smallint else rating end,
           subject_id=case when patch ? 'subject_id' then (patch->>'subject_id')::uuid else subject_id end,
           project_id=case when patch ? 'project_id' then (patch->>'project_id')::uuid else project_id end,
           checkpoint_id=case when patch ? 'checkpoint_id' then (patch->>'checkpoint_id')::uuid else checkpoint_id end,
           session_id=case when patch ? 'session_id' then (patch->>'session_id')::uuid else session_id end,
           status=case op when 'start' then 'running' when 'resume' then 'running'
             when 'pause' then 'paused' when 'break' then 'paused'
             when 'save' then 'saved' when 'discard' then 'discarded' else status end,
           saved_at=case when op='save' then ts else saved_at end,
           updated_at=ts,version=version+1
         where id=target and user_id=v_owner returning version into ver;
       end if;
       changed:=target;
     end if;
   end if;
 end if;
 if receipt is null then
   receipt:=jsonb_build_object('operationId',v_operation_id,'status','ok',
      'changed',jsonb_build_array(jsonb_build_object('id',changed,'version',ver)),'actionNo',null);
 end if;
 insert into public.command_receipts(user_id,operation_id,resource,result)
 values(v_owner,v_operation_id,r,receipt);
 return receipt;
end
$lifecycle$;

create or replace function public.lemma_study_timer_command(
  p jsonb, p_owner uuid, p_operation_id uuid
) returns jsonb language plpgsql security invoker set search_path='' as $timer$
declare
 v_op text:=p->>'operation';
 v_patch jsonb:=coalesce(p->'patch','{}'::jsonb);
 v_id uuid; v_expected integer; v_bad text;
 v_row public.study_entries%rowtype;
 v_after public.study_entries%rowtype;
 v_open public.study_intervals%rowtype;
 v_now timestamptz:=coalesce((p->>'at')::timestamptz,pg_catalog.clock_timestamp());
 v_device text; v_minutes integer; v_lease_version integer;
 v_new_phase text; v_duration integer; v_ratio numeric;
 v_remaining numeric; v_piece numeric; v_start timestamptz;
 v_focus_cutoff timestamptz; v_previous_exclusion_end timestamptz;
 v_focus tstzmultirange; v_removed tstzmultirange;
 v_slice record; v_reason text; v_segments jsonb:='[]'::jsonb;
 v_action bigint; v_receipt jsonb; v_stored jsonb;
begin
 if p?'at' and (v_op<>'next_phase' or v_now>clock_timestamp() or v_now<clock_timestamp()-interval '7 days') then
  raise exception 'Invalid historical phase timestamp'; end if;
 if p_owner is null or (select auth.uid()) is distinct from p_owner or
    p_operation_id is null or (p->>'operationId')::uuid is distinct from p_operation_id
    or p->>'resource' is distinct from 'study_entries'
    or v_op not in ('take_lease','next_phase','exclude_minutes') or
    pg_catalog.jsonb_typeof(p->'schemaVersion') is distinct from 'number'
    or p->>'schemaVersion' is distinct from '1' then
    raise exception 'Invalid owner-bound timer command envelope';
 end if;
 if pg_catalog.jsonb_typeof(coalesce(p->'target','{}'::jsonb)) is distinct from 'object'
    or pg_catalog.jsonb_typeof(v_patch) is distinct from 'object'
    or pg_catalog.jsonb_typeof(p->'target'->'id') is distinct from 'string' then
    raise exception 'Timer command needs a target ID and object patch';
 end if;
 select key into v_bad from pg_catalog.jsonb_object_keys(p) as keys(key)
   where key<>all(array['operationId','schemaVersion','resource',
      'operation','target','expectedVersion','patch','device','leaseVersion','at']) limit 1;
 if v_bad is not null then raise exception 'Unknown timer command field: %',v_bad; end if;
 select key into v_bad from pg_catalog.jsonb_object_keys(p->'target') as keys(key)
   where key<>'id' limit 1;
 if v_bad is not null then raise exception 'Unknown target field: %',v_bad; end if;
 select key into v_bad from pg_catalog.jsonb_object_keys(v_patch) as keys(key)
   where key<>all(case v_op
      when 'take_lease' then array['device','lease_minutes']
      when 'next_phase' then array['device','lease_version','energy']
      else array['device','lease_version','minutes','reason'] end) limit 1;
 if v_bad is not null then raise exception 'Unknown timer patch field: %',v_bad; end if;
 if pg_catalog.jsonb_typeof(p->'expectedVersion') is distinct from 'number'
    or p->>'expectedVersion' !~ '^[1-9][0-9]*$'
    or (p->>'expectedVersion')::numeric>2147483647 then
    raise exception 'Timer expectedVersion must be positive int32';
 end if;
 v_id:=(p->'target'->>'id')::uuid;
 v_expected:=(p->>'expectedVersion')::integer;
 -- The outer study_command has already acquired the owner/operationId
 -- advisory lock; a direct helper call must serialize identically too.
 perform pg_catalog.pg_advisory_xact_lock(
   pg_catalog.hashtextextended(p_owner::text||':'||p_operation_id::text,0));
 select r.result into v_stored from public.command_receipts r
   where r.user_id=p_owner and r.operation_id=p_operation_id;
 if found then
   if v_stored->'_request'=p then return v_stored-'_request'; end if;
   return pg_catalog.jsonb_build_object('operationId',p_operation_id,
     'status','conflict','changed','[]'::jsonb,'actionNo',null,
     'conflict',pg_catalog.jsonb_build_object('reason',
       'operationId reused with a different payload'));
 end if;
 select * into v_row from public.study_entries e
   where e.id=v_id and e.user_id=p_owner for update;
 if not found then raise exception 'Study timer entry not found for owner'; end if;
 if v_row.version is distinct from v_expected then
   v_receipt:=pg_catalog.jsonb_build_object(
     'operationId',p_operation_id,'status','conflict',
     'changed','[]'::jsonb,'actionNo',null,
     'current',pg_catalog.to_jsonb(v_row),
     'conflict',pg_catalog.jsonb_build_object('expectedVersion',
       v_expected,'currentVersion',v_row.version));
 else
   -- Only the server/connector can select privileged journal provenance.
   perform pg_catalog.set_config('lemma.source',
     case when pg_catalog.current_setting('role',true)='service_role'
       and pg_catalog.current_setting('lemma.source',true) in
          ('chatgpt','claude','other','system')
       then pg_catalog.current_setting('lemma.source',true)
       when pg_catalog.current_setting('role',true)='service_role' then 'other'
       else 'app' end,true);
   perform pg_catalog.set_config('lemma.tool','study',true);
   perform pg_catalog.set_config('lemma.summary',
     pg_catalog.left('Study timer '||v_op,200),true);
   if v_op='take_lease' then
     if v_row.status not in ('draft','running','paused') then
       raise exception 'Terminal entries cannot acquire a timer lease'; end if;
     if pg_catalog.jsonb_typeof(v_patch->'device') is distinct from 'string'
       or pg_catalog.length(pg_catalog.btrim(v_patch->>'device')) not between 1 and 120
       then raise exception 'Timer device token required'; end if;
     if v_patch?'lease_minutes' and
       (pg_catalog.jsonb_typeof(v_patch->'lease_minutes') is distinct from 'number'
        or v_patch->>'lease_minutes' !~ '^[1-9][0-9]*$'
        or (v_patch->>'lease_minutes')::numeric>30) then
       raise exception 'Timer lease minutes must be 1–30'; end if;
     v_device:=v_patch->>'device';
     v_minutes:=coalesce((v_patch->>'lease_minutes')::integer,2);
     -- An explicit take_lease can take over a live lease; it advances both
     -- generations so an older device cannot accidentally mutate thereafter.
     update public.study_entries set
       lease_device=v_device,lease_version=lease_version+1,
       lease_expires_at=v_now+pg_catalog.make_interval(mins=>v_minutes),
       updated_at=v_now,version=version+1
       where id=v_id and user_id=p_owner returning * into v_after;
   else
     if v_op='next_phase' and v_row.status not in ('running','paused') then
       raise exception 'Phase transition requires an active timer'; end if;
     if v_op='exclude_minutes' and v_row.status not in
          ('running','paused','saved') then
       raise exception 'Only active or saved focus can be excluded'; end if;
     if (v_row.lease_device is not null
       and v_row.lease_expires_at>clock_timestamp()
       and v_row.status in ('running','paused')) or v_op='next_phase' then
       -- A phase change always needs a current lease. Exclusion of already
       -- saved history does not, but active sessions respect the device.
       if pg_catalog.jsonb_typeof(v_patch->'device') is distinct from 'string'
          or v_patch->>'device' is distinct from v_row.lease_device
          or pg_catalog.jsonb_typeof(v_patch->'lease_version') is distinct from 'number'
          or v_patch->>'lease_version' !~ '^[1-9][0-9]*$'
          or (v_patch->>'lease_version')::numeric>2147483647 then
         return pg_catalog.jsonb_build_object('operationId',p_operation_id,
           'status','conflict','changed','[]'::jsonb,'actionNo',null,
           'conflict',pg_catalog.jsonb_build_object('reason',
            'active timer lease required'));
       end if;
       if v_row.lease_expires_at is null or v_row.lease_expires_at<=clock_timestamp() or
         (v_patch->>'lease_version')::integer<>v_row.lease_version then
         return pg_catalog.jsonb_build_object('operationId',p_operation_id,
           'status','conflict','changed','[]'::jsonb,'actionNo',null,
           'conflict',pg_catalog.jsonb_build_object('reason',
             'timer lease expired or generation changed'));
       end if;
     end if;
     if v_op='next_phase' then
       if v_patch?'energy' and
         (v_patch->'energy'<>'null'::jsonb and
          (pg_catalog.jsonb_typeof(v_patch->'energy') is distinct from 'string'
           or v_patch->>'energy' not in ('low','steady','high'))) then
         raise exception 'Invalid timer energy'; end if;
       -- Every transition closes the sole open interval and atomically
       -- opens its successor. No independent unjournalled interval mutation.
       select * into v_open from public.study_intervals i
         where i.entry_id=v_id and i.user_id=p_owner and i.ended_at is null
         for update;
       if not found then raise exception 'A timer phase needs one open interval'; end if;
       if v_open.started_at>=v_now then raise exception 'Timer interval start is in future'; end if;
       if v_row.phase='focus' then
         if v_open.kind<>'focus' then raise exception 'Focus phase requires focus interval'; end if;
         v_new_phase:=case when v_row.mode='pomodoro'
             and mod(v_row.cycle,coalesce((v_row.config->>'cycles')::integer,4))=0
           then 'long_break' else 'break' end;
         v_duration:=case when v_row.mode='pomodoro'
           then case when v_new_phase='long_break'
             then coalesce((v_row.config->>'long_break_minutes')::integer,15)
             else coalesce((v_row.config->>'break_minutes')::integer,5) end
           when v_row.mode='flowtime' then
             greatest(1,least(180,pg_catalog.ceil(
               pg_catalog.date_part('epoch',(v_now-v_open.started_at))/60 *
               coalesce((v_row.config->>'flowtime_break_ratio')::numeric,0.2)
             )::integer))
           else null end;
         update public.study_intervals set ended_at=v_now
           where user_id=p_owner and id=v_open.id;
         insert into public.study_intervals(entry_id,user_id,kind,started_at)
           values(v_id,p_owner,'break',v_now);
         update public.study_entries set
           phase=v_new_phase,status='paused',
           phase_ends_at=case when v_duration is not null
             then v_now+pg_catalog.make_interval(mins=>v_duration)
             else null end,
           energy=case when v_patch?'energy' then v_patch->>'energy' else energy end,
           version=version+1,updated_at=v_now
           where id=v_id and user_id=p_owner returning * into v_after;
       elsif v_row.phase in ('break','long_break') then
         if v_open.kind<>'break' then raise exception 'Break phase requires break interval'; end if;
         update public.study_intervals set ended_at=v_now
           where user_id=p_owner and id=v_open.id;
         insert into public.study_intervals(entry_id,user_id,kind,started_at)
           values(v_id,p_owner,'focus',v_now);
         update public.study_entries set
           phase='focus',status='running',cycle=cycle+1,
           phase_ends_at=case when mode='pomodoro'
             then v_now+pg_catalog.make_interval(
               mins=>coalesce((config->>'focus_minutes')::integer,25))
             else null end,
           energy=case when v_patch?'energy' then v_patch->>'energy' else energy end,
           version=version+1,updated_at=v_now
           where id=v_id and user_id=p_owner returning * into v_after;
       else raise exception 'Unknown timer phase'; end if;
     else
       -- Accurately remove the last N unexcluded minutes from focus as
       -- disjoint, reasoned absolute-time spans. Multiranges union any
       -- overlapping focus records before subtraction and subtraction
       -- protects earlier exclusions from double-counting.
       if pg_catalog.jsonb_typeof(v_patch->'minutes') is distinct from 'number'
         or v_patch->>'minutes' !~ '^[1-9][0-9]*$'
         or (v_patch->>'minutes')::numeric>1440 then
         raise exception 'Excluded minutes must be 1–1440'; end if;
       if pg_catalog.jsonb_typeof(v_patch->'reason') is distinct from 'string'
         or pg_catalog.length(pg_catalog.btrim(v_patch->>'reason')) not between 1 and 200
         then raise exception 'Exclusion reason required'; end if;
       v_remaining:=(v_patch->>'minutes')::numeric*60;
       v_reason:=pg_catalog.btrim(v_patch->>'reason');
       -- Integer-minute deductions must not consume a tiny new tail that
       -- accrued between two commands while the same focus interval runs.
       -- Otherwise back-to-back exclusions fragment into millisecond spans.
       -- Count new focus after a complete minute has accrued, while keeping
       -- completed intervals at their exact timestamps.
       v_focus_cutoff:=v_now;
       if v_row.status='running' then
         select max((e.value->>'to')::timestamptz)
           into v_previous_exclusion_end
           from pg_catalog.jsonb_array_elements(
             v_row.excluded_intervals) as e(value);
         if v_previous_exclusion_end is not null
           and v_previous_exclusion_end<=v_now
           and v_previous_exclusion_end>v_now-interval '1 minute' then
           v_focus_cutoff:=v_previous_exclusion_end;
         end if;
       end if;
       select coalesce(pg_catalog.range_agg(
           pg_catalog.tstzrange(i.started_at,
             least(coalesce(i.ended_at,v_focus_cutoff),v_focus_cutoff),'[)')),
          '{}'::tstzmultirange)
         into v_focus from public.study_intervals i
         where i.entry_id=v_id and i.user_id=p_owner and i.kind='focus'
           and i.started_at<v_focus_cutoff
           and (i.ended_at is null or i.ended_at>i.started_at);
       select coalesce(pg_catalog.range_agg(
            pg_catalog.tstzrange((e.value->>'from')::timestamptz,
              (e.value->>'to')::timestamptz,'[)')),
          '{}'::tstzmultirange)
         into v_removed from pg_catalog.jsonb_array_elements(
           v_row.excluded_intervals) as e(value);
       for v_slice in
         select pg_catalog.lower(segment.span) as starts_at,
                pg_catalog.upper(segment.span) as ends_at
           from pg_catalog.unnest(v_focus-v_removed) as segment(span)
           order by ends_at desc,starts_at desc
       loop
         exit when v_remaining<=0;
         v_piece:=least(v_remaining,
             pg_catalog.date_part('epoch',(v_slice.ends_at-v_slice.starts_at)));
         if v_piece<=0 then continue; end if;
         v_start:=v_slice.ends_at-v_piece*interval '1 second';
         v_segments:=v_segments||pg_catalog.jsonb_build_array(
           pg_catalog.jsonb_build_object(
             'from',v_start,'to',v_slice.ends_at,'reason',v_reason));
         v_remaining:=v_remaining-v_piece;
       end loop;
       if v_remaining>0 then
         raise exception 'Not enough unexcluded focus minutes'; end if;
       update public.study_entries set
         excluded_intervals=excluded_intervals||v_segments,
         version=version+1,updated_at=v_now
         where id=v_id and user_id=p_owner returning * into v_after;
     end if;
   end if;
   select no into v_action from public.actions a
     where a.txid=pg_catalog.txid_current() and a.user_id=p_owner;
   if v_action is null then raise exception 'Timer mutation lacks action journal'; end if;
   v_receipt:=pg_catalog.jsonb_build_object('operationId',p_operation_id,
     'status','ok','changed',pg_catalog.jsonb_build_array(
       pg_catalog.jsonb_build_object('id',v_after.id,'version',v_after.version)),
     'actionNo',v_action,'entry',pg_catalog.to_jsonb(v_after));
 end if;
 insert into public.command_receipts(user_id,operation_id,resource,result)
   values(p_owner,p_operation_id,'study_entries',
     v_receipt||pg_catalog.jsonb_build_object('_request',p));
 return v_receipt;
end
$timer$;

create or replace function public.review_items(
  p_decks text[] default '{}'::text[],
  p_session_id uuid default null,
  p_concept_slug text default null,
  p_include_new boolean default true,
  p_new_only boolean default false
)
returns setof jsonb
language sql stable security invoker set search_path = ''
as $$
  with prefs as (
    select s.user_id, s.reviews_per_day, s.new_per_day,
      ((date_trunc('day', now() at time zone s.time_zone
          - make_interval(hours => s.rollover_hour))
        + make_interval(hours => s.rollover_hour))
        at time zone s.time_zone) as day_start,
      ((date_trunc('day', now() at time zone s.time_zone
          - make_interval(hours => s.rollover_hour))
        + interval '1 day' + make_interval(hours => s.rollover_hour))
        at time zone s.time_zone) as day_end
    from public.settings s where s.user_id = (select auth.uid())
  ),
  answered as (
    select count(*)::integer as total,
      count(*) filter (where r.state_before = 0)::integer as fresh
    from public.reviews r cross join prefs s
    where r.user_id = s.user_id and r.undone_at is null
      and r.reviewed_at >= s.day_start and r.reviewed_at <= now()
  ),
  candidates as (
    select distinct on (n.id) n.id as note_id, n.no, c.id as card_id,
      c.state, c.due
    from public.cards c
    join public.notes n on n.id = c.note_id and n.user_id = c.user_id
    join public.projects p on p.id = n.project_id and p.user_id = n.user_id
    cross join prefs s
    where c.user_id = s.user_id and n.status = 'active'
      and p.status <> 'archived' and p.system = false
      and (c.state = 0 or c.due < s.day_end)
      -- Filter the eligible set before DISTINCT ON, ranking, and both quotas.
      and (p_new_only is not true or c.state = 0)
      and (p_include_new is not false or c.state <> 0)
      and (p_session_id is null or n.session_id = p_session_id)
      and (p_concept_slug is null or exists (
        select 1 from public.concepts concept_filter
        where concept_filter.id = n.concept_id
          and concept_filter.user_id = n.user_id
          and concept_filter.slug = p_concept_slug
      ))
      and (coalesce(cardinality(p_decks), 0) = 0
        or 'project:' || p.slug = any(p_decks)
        or exists (
          select 1 from public.checkpoints cp_filter
          where cp_filter.id = n.checkpoint_id
            and cp_filter.user_id = n.user_id
            and 'cp:' || p.slug || ':' || cp_filter.code = any(p_decks)
        ))
    order by n.id, case when c.state = 0 then 1 else 0 end,
      case when c.state in (1,3) and c.due <= now() then 0 else 1 end,
      c.due, c.id
  ),
  prioritized as (
    select c.*,
      row_number() over (order by
        case when c.state = 0 then 2
             when c.state in (1,3) and c.due <= now() then 0
             else 1 end,
        c.due, c.no, c.card_id) as seq,
      sum(case when c.state = 0 then 1 else 0 end) over (order by
        case when c.state = 0 then 2
             when c.state in (1,3) and c.due <= now() then 0
             else 1 end,
        c.due, c.no, c.card_id) as fresh_seq
    from candidates c
  ),
  quota as (
    select p.*,
      row_number() over (order by p.seq) as review_seq
    from prioritized p cross join prefs s cross join answered a
    where p.state <> 0 or p.fresh_seq <= greatest(s.new_per_day - a.fresh, 0)
  ),
  selected as (
    select q.* from quota q cross join prefs s cross join answered a
    where q.review_seq <= greatest(s.reviews_per_day - a.total, 0)
  )
  select jsonb_build_object(
    'version',c.version,'cardId', c.id, 'noteId', n.id, 'noteNo', n.no, 'ord', c.ord,
    'type', n.type, 'kind', n.kind, 'front', n.front, 'back', n.back,
    'projectSlug', p.slug, 'glyph', coalesce(sub.glyph, '∫'),
    'checkpointCode', cp.code, 'checkpointTitle', cp.title,
    'sessionNumber', sess.number, 'sourceShort', src.short,
    'pageLabel', n.page_label,
    'state', jsonb_build_object(
      'state', c.state, 'due', c.due, 'stability', c.stability,
      'difficulty', c.difficulty, 'lastReview', c.last_review,
      'step', c.step, 'reps', c.reps, 'lapses', c.lapses
    )
  )
  from selected sel
  join public.cards c on c.id = sel.card_id and c.user_id = (select auth.uid())
  join public.notes n on n.id = sel.note_id and n.user_id = c.user_id
  join public.projects p on p.id = n.project_id and p.user_id = n.user_id
  left join public.subjects sub on sub.id = p.subject_id and sub.user_id = p.user_id
  left join public.checkpoints cp on cp.id = n.checkpoint_id and cp.user_id = n.user_id
  left join public.sessions sess on sess.id = n.session_id and sess.user_id = n.user_id
  left join public.sources src on src.id = n.source_id and src.user_id = n.user_id
  order by sel.review_seq;
$$;
-- The note and its card variants are one optimistic, journalled transaction. No compensating card deletion in the client.
create function public.edit_note_atomic(p_id uuid,p_expected integer,p_patch jsonb,p_operation uuid) returns jsonb
language plpgsql security invoker set search_path='' as $note$
declare u uuid:=auth.uid(); n public.notes%rowtype; stored jsonb; result jsonb; request jsonb; a bigint;
begin
 if u is null or current_setting('role',true)<>'authenticated' then raise exception 'Authenticated owner required'; end if;
 if p_operation is null or p_expected is null or p_expected<1 or jsonb_typeof(p_patch) is distinct from 'object' or
  exists(select 1 from jsonb_object_keys(p_patch) k where k not in ('front','back','type','kind','tags')) then raise exception 'Invalid note edit'; end if;
 request:=jsonb_build_object('id',p_id,'expected',p_expected,'patch',p_patch);
 perform pg_advisory_xact_lock(hashtextextended(u::text||':'||p_operation::text,0));
 select r.result into stored from public.command_receipts r where r.user_id=u and r.operation_id=p_operation;
 if found then
  if stored->'_request'=request then return stored-'_request'; end if;
  raise exception 'operationId reused with different note edit';
 end if;
 select * into n from public.notes where id=p_id and user_id=u for update;
 if not found then raise exception 'Note not found'; end if;
 if n.version<>p_expected then return jsonb_build_object('status','conflict'); end if;
 perform set_config('lemma.source','app',true);perform set_config('lemma.tool','edit_note_atomic',true);perform set_config('lemma.summary','Edit note and card variants',true);
 update public.notes set
  front=case when p_patch?'front' then p_patch->>'front' else front end,
  back=case when p_patch?'back' then p_patch->>'back' else back end,
  type=case when p_patch?'type' then p_patch->>'type' else type end,
  kind=case when p_patch?'kind' then p_patch->>'kind' else kind end,
  tags=case when p_patch?'tags' then array(select jsonb_array_elements_text(p_patch->'tags')) else tags end
  where id=p_id and user_id=u returning * into n;
 perform public.lemma_reconcile_cards(u,p_id);
 select no into a from public.actions where user_id=u and txid=txid_current();
 result:=jsonb_build_object('status','ok','version',n.version,'actionNo',a);
 insert into public.command_receipts(user_id,operation_id,resource,result) values(u,p_operation,'notes',result||jsonb_build_object('_request',request));
 return result;
end $note$;
revoke all on function public.edit_note_atomic(uuid,integer,jsonb,uuid) from public,anon,service_role;
grant execute on function public.edit_note_atomic(uuid,integer,jsonb,uuid) to authenticated;

-- Merge only changed reminder keys under the UPDATE row lock, preserving other devices' independent choices.
create function public.patch_notify_settings(p_patch jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $prefs$
declare u uuid:=auth.uid(); r jsonb;
begin
 if u is null or current_setting('role',true)<>'authenticated' then raise exception 'Authenticated owner required'; end if;
 if jsonb_typeof(p_patch) is distinct from 'object' then raise exception 'Reminder patch must be an object'; end if;
 perform set_config('lemma.source','app',true);perform set_config('lemma.tool','patch_notify_settings',true);perform set_config('lemma.summary','Edit reminder preferences',true);
 update public.settings s set notify=public.lemma_v6_settings_merge(coalesce(s.notify,'{}'),p_patch)
  where s.user_id=u returning to_jsonb(s) into r;
 if r is null then raise exception 'Owner settings not found'; end if;
 return r;
end $prefs$;
revoke all on function public.patch_notify_settings(jsonb) from public,anon,service_role;
grant execute on function public.patch_notify_settings(jsonb) to authenticated;

-- A transport failure is not evidence that import failed. Delete only a still-incomplete version and fingerprint.
create function public.abort_source_import(p_id uuid,p_sha text,p_version integer) returns boolean
language plpgsql security invoker set search_path='' as $abort$
declare u uuid:=auth.uid(); removed uuid;
begin
 if u is null or current_setting('role',true)<>'authenticated' then raise exception 'Authenticated owner required'; end if;
 perform set_config('lemma.source','app',true);perform set_config('lemma.tool','abort_source_import',true);perform set_config('lemma.summary','Abort incomplete source import',true);
 delete from public.sources where id=p_id and user_id=u and sha256=p_sha and version=p_version
  and status in ('uploading','extracting') returning id into removed;
 return removed is not null;
end $abort$;
revoke all on function public.abort_source_import(uuid,text,integer) from public,anon,service_role;
grant execute on function public.abort_source_import(uuid,text,integer) to authenticated;

-- A durable phone action ID is the receipt ID. Only this receipt lineage can rebase an offline chain.
create function public.replay_timer_action(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $replay$
declare u uuid:=auth.uid(); a uuid:=(p->>'id')::uuid; e public.study_entries%rowtype;
 prior jsonb; result jsonb; op text:=p->>'action'; device text:=p->>'device';
 at_time timestamptz:=to_timestamp((p->>'at')::numeric/1000); base int:=(p->>'version')::int;
 inner_id uuid:=md5((p->>'id')||':timer')::uuid; envelope jsonb; open_kind text;
begin
 if u is null or current_setting('role',true)<>'authenticated' then raise exception 'Authenticated owner required'; end if;
 if jsonb_typeof(p) is distinct from 'object' or jsonb_typeof(p->'version') is distinct from 'number' or
   jsonb_typeof(p->'at') is distinct from 'number' or at_time is null or base is null or op is null or a is null or op not in ('pause','resume','break','finish','save','thought') or
   length(device) not between 1 and 120 or device is null or base<1 or
   (op<>'thought' and (at_time>clock_timestamp() or at_time<clock_timestamp()-interval '7 days')) then raise exception 'Invalid native action'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text||':'||a::text,0));
 select r.result into result from public.command_receipts r where r.user_id=u and r.operation_id=a;
 if found then
  if result->'_request' is distinct from p then raise exception 'Native action ID reused'; end if;
  return result-'_request';
 end if;
 perform set_config('lemma.source','app',true);perform set_config('lemma.tool','replay_timer_action',true);perform set_config('lemma.summary','Replay native timer action',true);
 if op='thought' then
  result:=public.parked_thoughts_command(jsonb_build_object('operationId',inner_id,'schemaVersion',1,
   'resource','parked_thoughts','operation','create','patch',jsonb_build_object('text',p->>'text','study_entry_id',(select id from public.study_entries where user_id=u and id=(p->>'entryId')::uuid))));
  result:=result||jsonb_build_object('outcome','applied');
 else
  select * into e from public.study_entries where id=(p->>'entryId')::uuid and user_id=u for update;
  if not found or e.status not in ('running','paused') then return jsonb_build_object('outcome','skipped'); end if;
  if e.version<>base and not exists(select 1 from public.command_receipts r where r.user_id=u and
    r.result#>>'{_native,entryId}'=e.id::text and r.result#>>'{_native,device}'=device and
    (r.result#>>'{_native,base}')::int=base and (r.result#>>'{_native,version}')::int=e.version and
    (r.result#>>'{_native,at}')::numeric<=(p->>'at')::numeric) then
    return jsonb_build_object('outcome','skipped'); end if;
  if e.lease_device is not null and e.lease_expires_at>clock_timestamp() and e.lease_device<>device then
    return jsonb_build_object('outcome','skipped'); end if;
  if exists(select 1 from public.study_intervals where user_id=u and entry_id=e.id and
     (started_at>at_time or ended_at>at_time)) then raise exception 'Action predates recorded timer history'; end if;
  select kind into open_kind from public.study_intervals where user_id=u and entry_id=e.id and ended_at is null;
  if op='finish' then op:=case when e.status='running' and open_kind='focus' then 'pause' else null end; end if;
  if op is not null then
   if op='break' or (op='resume' and open_kind='break') then
    op:='next_phase';
    if e.lease_device is null or e.lease_expires_at<=clock_timestamp() then
     perform public.study_command(jsonb_build_object('operationId',md5(a::text||':lease')::uuid,'schemaVersion',1,
      'resource','study_entries','operation','take_lease','target',jsonb_build_object('id',e.id),
      'expectedVersion',e.version,'patch',jsonb_build_object('device',device)));
     select * into e from public.study_entries where id=e.id and user_id=u;
    end if;
   end if;
   envelope:=jsonb_build_object('operationId',inner_id,'schemaVersion',1,'resource','study_entries',
    'operation',op,'target',jsonb_build_object('id',e.id),'expectedVersion',e.version,'at',at_time,
    'device',device,'leaseVersion',e.lease_version,'patch',case when op='next_phase' then
      jsonb_build_object('device',device,'lease_version',e.lease_version) else '{}'::jsonb end);
   result:=public.study_command(envelope);
   if result->>'status'<>'ok' then return jsonb_build_object('outcome','skipped'); end if;
  end if;
  select * into e from public.study_entries where id=e.id and user_id=u;
  result:=jsonb_build_object('outcome',case when p->>'action'='finish' then 'finish' else 'applied' end,
   'version',e.version,'_native',jsonb_build_object('entryId',e.id,'base',base,'version',e.version,'at',p->'at','device',device));
 end if;
 insert into public.command_receipts(user_id,operation_id,resource,result) values(u,a,'study_entries',result||jsonb_build_object('_request',p));
 return result;
end $replay$;
revoke all on function public.replay_timer_action(jsonb) from public,anon,service_role;
grant execute on function public.replay_timer_action(jsonb) to authenticated;

-- Delivery claims expire. A transient transport failure is retried with a bounded backoff, never recorded as sent.
alter table public.notifications add column delivery_claimed_at timestamptz, add column delivery_attempts integer not null default 0;
create or replace function public.notify_claim(p_user uuid,p_limit integer default 10)
returns table(id bigint,kind text,key text,title text,body text,url text,facts jsonb,status text,sent_at timestamptz)
language plpgsql security definer set search_path='' as $claim$
begin
 if current_setting('role',true)<>'service_role' then raise exception 'Service role required'; end if;
 return query update public.notifications n set delivery_claimed_at=now(),delivery_attempts=delivery_attempts+1
 where n.id in(select q.id from public.notifications q where q.user_id=p_user and q.status='queued' and q.due_at<=now()
  and (q.delivery_claimed_at is null or q.delivery_claimed_at<now()-interval '2 minutes') and q.delivery_attempts<8
  and not exists(select 1 from public.notify_holds h where h.user_id=q.user_id and h."until">now() and
   (h.scope in ('all',q.kind) or h.scope=q.facts->>'scope' or h.scope=q.key))
  order by q.due_at,q.id limit least(greatest(p_limit,1),50) for update skip locked)
 returning n.id,n.kind,n.key,n.title,n.body,n.url,n.facts,n.status,n.sent_at;
end $claim$;
create or replace function public.notify_record(p_user uuid,p_id bigint,p_reason text) returns void
language plpgsql security definer set search_path='' as $record$
begin
 if current_setting('role',true)<>'service_role' then raise exception 'Service role required'; end if;
 if p_reason not in ('sent','no_device','push_error') then raise exception 'Invalid delivery result'; end if;
 update public.notifications set
 status=case when p_reason='sent' then 'sent' when delivery_attempts>=8 then 'failed' else 'queued' end,
 sent_at=case when p_reason='sent' then now() else null end,
 reason=case when p_reason='sent' then null else p_reason end,
 due_at=case when p_reason='sent' then due_at else now()+make_interval(secs=>least(3600,30*(2^least(delivery_attempts,7))::int)) end,
 delivery_claimed_at=null where user_id=p_user and id=p_id and status='queued' and delivery_claimed_at is not null;
end $record$;

-- Export pages read an immutable snapshot made by one SELECT, so children and parents share the same MVCC view.
create table public.owner_export_snapshots(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),data jsonb not null);
alter table public.owner_export_snapshots enable row level security;
revoke insert,update,delete,truncate on public.owner_export_snapshots from anon,authenticated;
create function public.begin_owner_export() returns uuid language plpgsql security definer set search_path='' as $begin$
declare u uuid:=auth.uid(); statement text; snapshot jsonb; result uuid;
begin
 if u is null or current_setting('role',true)<>'authenticated' then raise exception 'Authenticated owner required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text||':export',0));
 delete from public.owner_export_snapshots where user_id=u;
 select 'select jsonb_object_agg(name,rows) from ('||string_agg(format('select %L::text name,(select coalesce(jsonb_agg(to_jsonb(t)-''connector_secret''),''[]''::jsonb) from public.%I t where user_id=$1) rows',table_name,table_name),' union all ' order by table_name)||') snapshot'
 into statement from public.lemma_undo_tables;
 execute statement into snapshot using u;
 insert into public.owner_export_snapshots(user_id,data) values(u,snapshot) returning id into result;return result;
end $begin$;
create function public.owner_export_page(p_snapshot uuid,p_table text default null,p_offset integer default 0,p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path='' as $page$
declare snapshot jsonb; rows jsonb; total int;
begin
 if auth.uid() is null or current_setting('role',true)<>'authenticated' then raise exception 'Authenticated owner required'; end if;
 if p_offset is null or p_limit is null or p_offset<0 or p_limit not between 1 and 100 then raise exception 'Invalid page'; end if;
 select data into snapshot from public.owner_export_snapshots where id=p_snapshot and user_id=auth.uid() and created_at>now()-interval '15 minutes';
 if not found then raise exception 'Export expired; start again'; end if;
 if p_table is null then select coalesce(jsonb_agg(jsonb_build_object('table_name',key) order by key),'[]'::jsonb) into rows from jsonb_object_keys(snapshot) key;
 else if not(snapshot?p_table) then raise exception 'Resource not in snapshot'; end if;rows:=snapshot->p_table;end if;
 total:=jsonb_array_length(rows);
 select coalesce(jsonb_agg(value order by ord),'[]'::jsonb) into rows from jsonb_array_elements(rows) with ordinality t(value,ord) where ord>p_offset and ord<=p_offset+p_limit;
 return jsonb_build_object('rows',rows,'nextCursor',case when p_offset+p_limit<total then (p_offset+p_limit)::text else null end);
end $page$;
create function public.end_owner_export(p_snapshot uuid) returns void language plpgsql security definer set search_path='' as $end$
begin
 if auth.uid() is null or current_setting('role',true)<>'authenticated' then raise exception 'Authenticated owner required'; end if;
 delete from public.owner_export_snapshots where id=p_snapshot and user_id=auth.uid();
end $end$;
revoke all on function public.begin_owner_export(),public.owner_export_page(uuid,text,integer,integer),public.end_owner_export(uuid) from public,anon,service_role;
grant execute on function public.begin_owner_export(),public.owner_export_page(uuid,text,integer,integer),public.end_owner_export(uuid) to authenticated;

create function public.prune_owner_export_snapshots() returns void language plpgsql security definer set search_path='' as $prune$
begin
 if current_setting('role',true)<>'service_role' then raise exception 'Service role required'; end if;
 delete from public.owner_export_snapshots where created_at<now()-interval '15 minutes';
end $prune$;
revoke all on function public.prune_owner_export_snapshots() from public,anon,authenticated;
grant execute on function public.prune_owner_export_snapshots() to service_role;
do $export_cleanup$
begin
 if exists(select 1 from pg_catalog.pg_extension where extname='pg_cron') then
  perform cron.schedule('lemma-export-expiry','*/15 * * * *','set local role service_role; select public.prune_owner_export_snapshots();');
 end if;
end $export_cleanup$;
