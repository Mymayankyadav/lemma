-- N160 (areas 7 and 8): plan a week or a month, then replan what was missed.
-- A plan distributes open tasks and deadline effort over the dates of a period
-- inside the learner's working hours, around blocks that already exist, with
-- the gap between blocks and the longest run from settings.planning. A global
-- study goal gives each day a target load first; work that does not fit under
-- the targets is placed in a second pass up to the window or the daily cap.
-- `preview` writes nothing. `create` stores a draft. `commit` writes ordinary
-- calendar blocks for the placements the owner confirmed (and only those).
-- `replan` cancels this plan's unfinished past blocks and the ones a new busy
-- block now overlaps, and places the missing minutes again. Additive only.
create table public.period_plans (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 period text not null check (period in ('week','month')),
 start_date date not null,
 end_date date not null,
 time_zone text not null,
 status text not null default 'draft' check (status in ('draft','committed','archived')),
 daily_cap_minutes integer check (daily_cap_minutes is null or daily_cap_minutes between 15 and 1440),
 exclude_task_ids uuid[] not null default '{}' check (cardinality(exclude_task_ids) <= 200),
 placements jsonb not null default '[]' check (jsonb_typeof(placements) = 'array'),
 unplaced jsonb not null default '[]' check (jsonb_typeof(unplaced) = 'array'),
 committed_at timestamptz,
 version integer not null default 1 check (version > 0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (user_id,id),
 constraint period_plans_range check (end_date >= start_date and end_date - start_date <= 31),
 constraint period_plans_committed_consistent check ((status = 'committed') = (committed_at is not null) or status = 'archived')
);
create index period_plans_owner_range on public.period_plans (user_id,start_date,end_date);
alter table public.period_plans enable row level security;
create policy period_plans_owner_select on public.period_plans for select to authenticated
 using (user_id = (select auth.uid()));
grant select on public.period_plans to authenticated;
revoke insert,update,delete,truncate on public.period_plans from anon,authenticated;
grant select,insert,update,delete on public.period_plans to service_role;
create trigger lemma_log_change after insert or update or delete on public.period_plans
 for each row execute function public.log_change();
insert into public.lemma_undo_tables(table_name) values ('period_plans');

-- The distribution itself: pure over the owner's rows, writes nothing.
create function public.period_plan_compute(
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
    'due',coalesce(t.due_date,(t.due_at at time zone p_tz)::date)) as item,
   coalesce(t.due_date,(t.due_at at time zone p_tz)::date) as due,
   case t.priority when 'high' then 0 when 'normal' then 1 else 2 end as rank,t.position as pos,t.title as title
  from public.tasks t where t.user_id = p_user and t.status in ('backlog','in_progress')
   and not (t.id = any(p_exclude))
   and (coalesce(t.due_date,(t.due_at at time zone p_tz)::date) is null
        or coalesce(t.due_date,(t.due_at at time zone p_tz)::date) <= p_end)
  union all
  select pg_catalog.jsonb_build_object('title',d.title,'task_id',null,'deadline_id',d.id,
    'minutes',case when greatest(coalesce(d.due_date,(d.due_at at time zone p_tz)::date),p_from) <= p_end
      then d.remaining_minutes
      else ceil(d.remaining_minutes::numeric * v_days
        / greatest(1,coalesce(d.due_date,(d.due_at at time zone p_tz)::date) - p_from + 1))::integer end,
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
    loop
     exit when v_rem[v_k] <= 0;
     v_room := v_cap - v_load[v_i];
     exit when v_room < least(15,v_rem[v_k]);
     v_lo := null;
     for v_r in select unnest(v_free[v_i]) loop
      if upper(v_r) - lower(v_r) >= least(15,v_rem[v_k]) then v_lo := lower(v_r); v_hi := upper(v_r); exit; end if;
     end loop;
     exit when v_lo is null;
     v_chunk := least(v_rem[v_k],v_hi - v_lo,v_run,v_room);
     v_place := v_place || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'id',pg_catalog.gen_random_uuid(),'date',v_day,'minutes',v_chunk,
      'starts_at',((v_day::timestamp + pg_catalog.make_interval(mins => v_lo)) at time zone p_tz),
      'ends_at',((v_day::timestamp + pg_catalog.make_interval(mins => v_lo + v_chunk)) at time zone p_tz),
      'title',v_item->>'title','task_id',v_item->'task_id','deadline_id',v_item->'deadline_id',
      'block_id',null));
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
revoke all on function public.period_plan_compute(uuid,date,date,date,text,integer,uuid[])
 from public,anon,authenticated,service_role;

-- Write the blocks of confirmed placements; returns the placements with block ids.
create function public.period_plan_write_blocks(p_user uuid,p_tz text,p_placements jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $write$
declare v_out jsonb := '[]'::jsonb; v_p jsonb; v_block uuid; v_task public.tasks%rowtype;
begin
 for v_p in select value from pg_catalog.jsonb_array_elements(p_placements) loop
  v_task := null;
  if v_p->>'task_id' is not null then
   select * into v_task from public.tasks where user_id = p_user and id = (v_p->>'task_id')::uuid;
  end if;
  insert into public.calendar_blocks(user_id,kind,title,starts_at,ends_at,time_zone,status,subject_id,project_id,checkpoint_id,task_id)
  values(p_user,'study',pg_catalog.left(v_p->>'title',200),(v_p->>'starts_at')::timestamptz,(v_p->>'ends_at')::timestamptz,
   p_tz,'planned',v_task.subject_id,v_task.project_id,v_task.checkpoint_id,v_task.id) returning id into v_block;
  v_out := v_out || pg_catalog.jsonb_build_array(v_p || pg_catalog.jsonb_build_object('block_id',v_block));
 end loop;
 return v_out;
end
$write$;
revoke all on function public.period_plan_write_blocks(uuid,text,jsonb)
 from public,anon,authenticated,service_role;

create function public.period_plans_command(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $plans$
declare
 v_owner uuid := auth.uid();
 v_operation_id uuid; v_operation text; v_patch jsonb; v_target jsonb; v_bad text;
 v_expected integer; v_id uuid; v_today date; v_tz text; v_stored jsonb; v_result jsonb;
 v_old public.period_plans%rowtype; v_new public.period_plans%rowtype;
 v_period text; v_start date; v_end date; v_cap integer; v_exclude uuid[]; v_calc jsonb;
 v_confirm text[]; v_keep jsonb; v_written jsonb; v_action bigint; v_dropped integer := 0;
 v_pl jsonb; v_bl record; v_cancelled integer := 0;
begin
 if v_owner is null or pg_catalog.current_setting('role',true) not in ('authenticated','service_role') then
  raise exception 'Authentication required'; end if;
 if p is null or pg_catalog.jsonb_typeof(p) is distinct from 'object' then
  raise exception 'Command envelope must be an object'; end if;
 if nullif(p->>'operationId','') is null then raise exception 'operationId is required'; end if;
 v_operation_id := (p->>'operationId')::uuid;
 perform pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended(v_owner::text||':'||v_operation_id::text,0));
 select result into v_stored from public.command_receipts where user_id = v_owner and operation_id = v_operation_id;
 if found then
  if v_stored->'_request' = p then return v_stored - '_request'; end if;
  return pg_catalog.jsonb_build_object('operationId',v_operation_id,'status','conflict',
   'changed','[]'::jsonb,'actionNo',null,
   'conflict',pg_catalog.jsonb_build_object('reason','operationId reused with a different payload'));
 end if;
 select key into v_bad from pg_catalog.jsonb_object_keys(p) as keys(key)
  where key <> all(array['operationId','schemaVersion','resource','operation','target','expectedVersion','patch']) limit 1;
 if v_bad is not null then raise exception 'Unknown command field: %',v_bad; end if;
 if pg_catalog.jsonb_typeof(p->'schemaVersion') is distinct from 'number' or p->>'schemaVersion' is distinct from '1' then
  raise exception 'schemaVersion must be 1'; end if;
 if p->>'resource' is distinct from 'period_plans' then raise exception 'Unsupported resource'; end if;
 v_operation := p->>'operation';
 if v_operation is null or v_operation not in ('create','update','preview','commit','replan','archive') then
  raise exception 'Unsupported period plan operation'; end if;
 v_patch := coalesce(p->'patch','{}'::jsonb); v_target := coalesce(p->'target','{}'::jsonb);
 if pg_catalog.jsonb_typeof(v_patch) is distinct from 'object' or pg_catalog.jsonb_typeof(v_target) is distinct from 'object' then
  raise exception 'patch and target must be objects'; end if;
 select key into v_bad from pg_catalog.jsonb_object_keys(v_target) as keys(key) where key <> 'id' limit 1;
 if v_bad is not null then raise exception 'Unknown target field: %',v_bad; end if;
 select key into v_bad from pg_catalog.jsonb_object_keys(v_patch) as keys(key)
  where key <> all(case v_operation
   when 'create' then array['period','start_date','daily_cap_minutes','exclude_task_ids']
   when 'preview' then array['period','start_date','daily_cap_minutes','exclude_task_ids']
   when 'update' then array['daily_cap_minutes','exclude_task_ids']
   when 'commit' then array['placement_ids']
   when 'replan' then array['daily_cap_minutes']
   else array['cancel_blocks'] end) limit 1;
 if v_bad is not null then raise exception 'Unknown period plan patch field: %',v_bad; end if;
 if pg_catalog.current_setting('role',true) <> 'service_role' then
  perform pg_catalog.set_config('lemma.source','app',true);
  perform pg_catalog.set_config('lemma.tool','period_plans_command',true);
  perform pg_catalog.set_config('lemma.summary',pg_catalog.left('Period plan '||v_operation,200),true);
 end if;
 v_today := public.task_series_today(v_owner);
 select time_zone into v_tz from public.settings where user_id = v_owner;
 if v_today is null then raise exception 'Owner settings not found'; end if;

 if v_operation in ('create','preview') then
  v_period := v_patch->>'period';
  if v_period is null or v_period not in ('week','month') then raise exception 'period must be week or month'; end if;
  if pg_catalog.jsonb_typeof(v_patch->'start_date') is distinct from 'string' then raise exception 'start_date is required'; end if;
  v_start := (v_patch->>'start_date')::date;
  v_end := case v_period when 'week' then v_start + 6 else ((v_start + interval '1 month')::date - 1) end;
 end if;
 if v_operation in ('update','commit','replan','archive') then
  if nullif(v_target->>'id','') is null then raise exception 'target.id required'; end if;
  if pg_catalog.jsonb_typeof(p->'expectedVersion') is distinct from 'number' or p->>'expectedVersion' !~ '^[1-9][0-9]*$' then
   raise exception 'expectedVersion must be a positive integer'; end if;
  v_id := (v_target->>'id')::uuid; v_expected := (p->>'expectedVersion')::integer;
  select * into v_old from public.period_plans where id = v_id and user_id = v_owner for update;
  if not found then raise exception 'Period plan not found'; end if;
  if v_old.version <> v_expected then
   v_result := pg_catalog.jsonb_build_object('operationId',v_operation_id,'status','conflict','changed','[]'::jsonb,
    'actionNo',null,'current',pg_catalog.to_jsonb(v_old),
    'conflict',pg_catalog.jsonb_build_object('expectedVersion',v_expected,'currentVersion',v_old.version));
  end if;
 end if;
 if v_patch ? 'daily_cap_minutes' then
  if pg_catalog.jsonb_typeof(v_patch->'daily_cap_minutes') not in ('number','null') then raise exception 'daily_cap_minutes must be a number'; end if;
  v_cap := (v_patch->>'daily_cap_minutes')::integer;
 end if;
 if v_patch ? 'exclude_task_ids' then
  if pg_catalog.jsonb_typeof(v_patch->'exclude_task_ids') is distinct from 'array' then raise exception 'exclude_task_ids must be an array'; end if;
  select coalesce(pg_catalog.array_agg(value::uuid),'{}') into v_exclude
   from (select value #>> '{}' as value from pg_catalog.jsonb_array_elements(v_patch->'exclude_task_ids')) q;
 end if;

 if v_result is null then
  if v_operation = 'preview' then
   v_calc := public.period_plan_compute(v_owner,v_start,v_end,greatest(v_start,v_today),v_tz,v_cap,coalesce(v_exclude,'{}'));
   -- Read-only: no row, receipt or journal action is written.
   return pg_catalog.jsonb_build_object('operationId',v_operation_id,'status','ok','changed','[]'::jsonb,
    'actionNo',null,'period',v_period,'start_date',v_start,'end_date',v_end) || v_calc;
  elsif v_operation = 'create' then
   v_calc := public.period_plan_compute(v_owner,v_start,v_end,greatest(v_start,v_today),v_tz,v_cap,coalesce(v_exclude,'{}'));
   insert into public.period_plans(user_id,period,start_date,end_date,time_zone,daily_cap_minutes,exclude_task_ids,placements,unplaced)
   values(v_owner,v_period,v_start,v_end,v_tz,v_cap,coalesce(v_exclude,'{}'),v_calc->'placements',v_calc->'unplaced')
   returning * into v_new;
  elsif v_operation = 'update' then
   if v_old.status <> 'draft' then raise exception 'Only a draft can be edited; replan a committed plan'; end if;
   v_cap := case when v_patch ? 'daily_cap_minutes' then v_cap else v_old.daily_cap_minutes end;
   v_exclude := case when v_patch ? 'exclude_task_ids' then v_exclude else v_old.exclude_task_ids end;
   v_calc := public.period_plan_compute(v_owner,v_old.start_date,v_old.end_date,greatest(v_old.start_date,v_today),v_old.time_zone,v_cap,v_exclude);
   update public.period_plans set daily_cap_minutes = v_cap,exclude_task_ids = v_exclude,
    placements = v_calc->'placements',unplaced = v_calc->'unplaced',version = version + 1,updated_at = pg_catalog.now()
   where id = v_id and user_id = v_owner returning * into v_new;
  elsif v_operation = 'commit' then
   if v_old.status <> 'draft' then raise exception 'Only a draft can be committed'; end if;
   if pg_catalog.jsonb_typeof(v_patch->'placement_ids') is distinct from 'array'
     or pg_catalog.jsonb_array_length(v_patch->'placement_ids') = 0 then
    raise exception 'placement_ids must list the placements the owner confirmed'; end if;
   select pg_catalog.array_agg((e #>> '{}')) into v_confirm from pg_catalog.jsonb_array_elements(v_patch->'placement_ids') e;
   if exists(select 1 from unnest(v_confirm) c where c not in (select x->>'id' from pg_catalog.jsonb_array_elements(v_old.placements) x)) then
    raise exception 'Unknown placement id'; end if;
   select coalesce(pg_catalog.jsonb_agg(x),'[]'::jsonb) into v_keep from pg_catalog.jsonb_array_elements(v_old.placements) x
    where (x->>'id') = any(v_confirm);
   if exists(select 1 from pg_catalog.jsonb_array_elements(v_keep) x
     where (x->>'starts_at')::timestamptz < pg_catalog.now()) then
    raise exception 'A confirmed placement already started; replan the draft first'; end if;
   if exists(select 1 from pg_catalog.jsonb_array_elements(v_keep) x join public.calendar_blocks b
      on b.user_id = v_owner and b.status <> 'cancelled'
      and b.starts_at < (x->>'ends_at')::timestamptz and b.ends_at > (x->>'starts_at')::timestamptz) then
    raise exception 'A confirmed placement now overlaps a block; update the draft first'; end if;
   v_written := public.period_plan_write_blocks(v_owner,v_old.time_zone,v_keep);
   update public.period_plans set status = 'committed',committed_at = pg_catalog.now(),placements = v_written,
    version = version + 1,updated_at = pg_catalog.now() where id = v_id and user_id = v_owner returning * into v_new;
  elsif v_operation = 'replan' then
   if v_old.status <> 'committed' then raise exception 'Only a committed plan can be replanned'; end if;
   v_cap := case when v_patch ? 'daily_cap_minutes' then v_cap else v_old.daily_cap_minutes end;
   -- Cancel this plan's blocks that were missed (past, still planned) or that a
   -- newer busy block now overlaps, then place the missing minutes again.
   for v_bl in select b.id from public.calendar_blocks b
     where b.user_id = v_owner and b.status = 'planned'
      and b.id in (select (x->>'block_id')::uuid from pg_catalog.jsonb_array_elements(v_old.placements) x where x->>'block_id' is not null)
      and (b.ends_at <= pg_catalog.now()
       or exists(select 1 from public.calendar_blocks o where o.user_id = v_owner and o.id <> b.id
          and o.status <> 'cancelled' and o.starts_at < b.ends_at and o.ends_at > b.starts_at
          and o.id not in (select (x->>'block_id')::uuid from pg_catalog.jsonb_array_elements(v_old.placements) x where x->>'block_id' is not null)))
     for update loop
    update public.calendar_blocks set status = 'cancelled',version = version + 1 where id = v_bl.id and user_id = v_owner;
    v_cancelled := v_cancelled + 1;
   end loop;
   v_calc := public.period_plan_compute(v_owner,v_old.start_date,v_old.end_date,greatest(v_old.start_date,v_today),v_old.time_zone,v_cap,v_old.exclude_task_ids);
   v_written := public.period_plan_write_blocks(v_owner,v_old.time_zone,v_calc->'placements');
   update public.period_plans set daily_cap_minutes = v_cap,
    placements = v_old.placements || v_written,unplaced = v_calc->'unplaced',
    version = version + 1,updated_at = pg_catalog.now() where id = v_id and user_id = v_owner returning * into v_new;
  else
   if v_old.status = 'archived' then raise exception 'Plan is already archived'; end if;
   if coalesce((v_patch->>'cancel_blocks')::boolean,false) then
    update public.calendar_blocks set status = 'cancelled',version = version + 1
     where user_id = v_owner and status = 'planned' and ends_at > pg_catalog.now()
      and id in (select (x->>'block_id')::uuid from pg_catalog.jsonb_array_elements(v_old.placements) x where x->>'block_id' is not null);
    get diagnostics v_cancelled = row_count;
   end if;
   update public.period_plans set status = 'archived',version = version + 1,updated_at = pg_catalog.now()
    where id = v_id and user_id = v_owner returning * into v_new;
  end if;
  select no into v_action from public.actions where txid = pg_catalog.txid_current() and user_id = v_owner;
  if v_action is null then raise exception 'Period plan write has no undo action'; end if;
  v_result := pg_catalog.jsonb_build_object('operationId',v_operation_id,'status','ok',
   'changed',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('id',v_new.id,'version',v_new.version)),
   'actionNo',v_action,'placements',pg_catalog.jsonb_array_length(v_new.placements),
   'unplaced',v_new.unplaced,'cancelled_blocks',v_cancelled);
 end if;
 insert into public.command_receipts(user_id,operation_id,resource,result)
  values(v_owner,v_operation_id,'period_plans',v_result || pg_catalog.jsonb_build_object('_request',p));
 return v_result;
end
$plans$;
revoke all on function public.period_plans_command(jsonb) from public,anon;
grant execute on function public.period_plans_command(jsonb) to authenticated,service_role;

insert into public.lemma_command_resources(resource,command_fn,mcp_ok,"schema") values
 ('period_plans','period_plans_command',true,
  '{"operations":["create","update","preview","commit","replan","archive"],"fields":["period","start_date","end_date","status","daily_cap_minutes","exclude_task_ids","placements","unplaced","committed_at"]}'::jsonb);
