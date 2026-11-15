-- N165: reviewed additive bug-hunt corrections; ordered part 3.
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

