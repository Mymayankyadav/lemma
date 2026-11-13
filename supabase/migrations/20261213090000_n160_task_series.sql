-- N160: recurring tasks and their background scheduler. Additive only.
-- A series is a rule (daily, weekdays, weekly, monthly or every N days) that
-- generates ordinary public.tasks rows 14 days ahead. Generated rows are plain
-- tasks, so every existing screen and the tasks MCP path show them unchanged.
create table public.task_series (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 title text not null check (char_length(btrim(title)) between 1 and 200),
 body text not null default '' check (char_length(body) <= 4000),
 subject_id uuid,
 project_id uuid,
 checkpoint_id uuid,
 estimate_minutes integer check (estimate_minutes is null or estimate_minutes >= 0),
 priority text not null default 'normal' check (priority in ('low','normal','high')),
 freq text not null check (freq in ('daily','weekdays','weekly','monthly','custom')),
 interval_n integer not null default 1 check (interval_n between 1 and 365),
 by_weekday smallint[] not null default '{}'
  check (by_weekday <@ array[1,2,3,4,5,6,7]::smallint[]),
 by_monthday smallint check (by_monthday is null or by_monthday between 1 and 31),
 start_date date not null,
 until_date date,
 skipped_dates date[] not null default '{}' check (cardinality(skipped_dates) <= 400),
 status text not null default 'active' check (status in ('active','stopped')),
 stopped_at timestamptz,
 materialized_through date,
 version integer not null default 1 check (version > 0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (user_id,id),
 foreign key (user_id,subject_id) references public.subjects(user_id,id) deferrable initially immediate,
 foreign key (user_id,project_id) references public.projects(user_id,id) deferrable initially immediate,
 foreign key (user_id,checkpoint_id) references public.checkpoints(user_id,id) deferrable initially immediate,
 constraint task_series_rule_shape check (
  (freq in ('daily','weekdays') and interval_n = 1 and by_weekday = '{}' and by_monthday is null) or
  (freq = 'weekly' and by_monthday is null) or
  (freq = 'monthly' and by_weekday = '{}') or
  (freq = 'custom' and by_weekday = '{}' and by_monthday is null)),
 constraint task_series_until_after_start check (until_date is null or until_date >= start_date),
 constraint task_series_stopped_consistent check ((status = 'stopped') = (stopped_at is not null))
);
create index task_series_due on public.task_series (user_id,materialized_through) where status = 'active';
alter table public.task_series enable row level security;
create policy task_series_owner_select on public.task_series for select to authenticated
 using (user_id = (select auth.uid()));
grant select on public.task_series to authenticated;
-- Browsers must not write series directly: every change is a command.
revoke insert,update,delete,truncate on public.task_series from anon,authenticated;
grant select,insert,update,delete on public.task_series to service_role;

-- An occurrence is an ordinary task that remembers its series and civil date.
-- Neither column is in the task command's patch whitelist, so only the series
-- command and the scheduler set them. The unique index makes generation
-- idempotent: two ticks, a retry or an undo/redo can never duplicate a date.
alter table public.tasks add column series_id uuid;
alter table public.tasks add column occurrence_date date;
alter table public.tasks add constraint tasks_series_fk
 foreign key (user_id,series_id) references public.task_series(user_id,id)
 deferrable initially immediate;
alter table public.tasks add constraint tasks_series_pair
 check ((series_id is null) = (occurrence_date is null));
create unique index tasks_series_occurrence on public.tasks (series_id,occurrence_date)
 where series_id is not null;

create trigger lemma_log_change after insert or update or delete on public.task_series
 for each row execute function public.log_change();
insert into public.lemma_undo_tables(table_name) values ('task_series');

-- The learner's civil today (rollover hour included), as the app computes it.
create function public.task_series_today(p_user uuid) returns date
language sql stable security definer set search_path = '' as $today$
 select ((pg_catalog.now() at time zone s.time_zone)
  - pg_catalog.make_interval(hours => s.rollover_hour))::date
 from public.settings s where s.user_id = p_user
$today$;
revoke all on function public.task_series_today(uuid) from public,anon,authenticated,service_role;

-- The schedule itself: every date in (p_after, p_through] the rule lands on.
-- Pure and bounded (at most 800 days per call). Skips are applied by callers.
create function public.task_series_dates(
 p_freq text,p_interval integer,p_weekdays smallint[],p_monthday smallint,
 p_start date,p_until date,p_after date,p_through date
) returns setof date
language plpgsql stable set search_path = '' as $dates$
declare
 d date; lo date; hi date; v_wd integer[]; v_hit boolean;
 v_months integer; v_dim integer; v_first date;
begin
 lo := greatest(p_after + 1,p_start);
 hi := least(p_through,coalesce(p_until,p_through));
 if hi > lo + 800 then hi := lo + 800; end if;
 v_wd := case when pg_catalog.cardinality(p_weekdays) = 0
  then array[pg_catalog.date_part('isodow',p_start)::integer]
  else p_weekdays::integer[] end;
 d := lo;
 while d <= hi loop
  v_hit := case p_freq
   when 'daily' then true
   when 'weekdays' then pg_catalog.date_part('isodow',d)::integer <= 5
   when 'custom' then ((d - p_start) % p_interval) = 0
   when 'weekly' then
    ((((d - (pg_catalog.date_part('isodow',d)::integer - 1))
      - (p_start - (pg_catalog.date_part('isodow',p_start)::integer - 1))) / 7) % p_interval) = 0
    and pg_catalog.date_part('isodow',d)::integer = any(v_wd)
   when 'monthly' then false
   else false end;
  if p_freq = 'monthly' then
   v_months := ((pg_catalog.date_part('year',d)::integer * 12 + pg_catalog.date_part('month',d)::integer)
    - (pg_catalog.date_part('year',p_start)::integer * 12 + pg_catalog.date_part('month',p_start)::integer));
   v_first := d - (pg_catalog.date_part('day',d)::integer - 1);
   v_dim := pg_catalog.date_part('day',((v_first + interval '1 month')::date - 1))::integer;
   v_hit := (v_months % p_interval) = 0
    and pg_catalog.date_part('day',d)::integer
     = least(coalesce(p_monthday::integer,pg_catalog.date_part('day',p_start)::integer),v_dim);
  end if;
  if v_hit then return next d; end if;
  d := d + 1;
 end loop;
 return;
end
$dates$;
revoke all on function public.task_series_dates(text,integer,smallint[],smallint,date,date,date,date)
 from public,anon,authenticated,service_role;

-- Generate one occurrence. Returns 1 when a row was created, 0 when that date
-- already has one (a retry, a second tick or an undo that restored it).
create function public.task_series_insert_occurrence(p_series public.task_series,p_date date)
returns integer language plpgsql security definer set search_path = '' as $occ$
declare v_n integer;
begin
 insert into public.tasks(user_id,title,body,subject_id,project_id,checkpoint_id,
  estimate_minutes,priority,due_kind,due_date,status,series_id,occurrence_date)
 values(p_series.user_id,p_series.title,p_series.body,p_series.subject_id,
  p_series.project_id,p_series.checkpoint_id,p_series.estimate_minutes,
  p_series.priority,'date',p_date,'backlog',p_series.id,p_date)
 on conflict (series_id,occurrence_date) where series_id is not null do nothing;
 get diagnostics v_n = row_count;
 return v_n;
end
$occ$;
revoke all on function public.task_series_insert_occurrence(public.task_series,date)
 from public,anon,authenticated,service_role;

-- Fill the series from yesterday (never the past: a daily task is not made
-- overdue for days the app was closed) up to 14 days after the learner's today.
create function public.task_series_materialize(p_series_id uuid,p_today date)
returns integer language plpgsql security definer set search_path = '' as $mat$
declare
 s public.task_series%rowtype; v_from date; v_to date; d date; v_made integer := 0;
begin
 select * into s from public.task_series where id = p_series_id for update;
 if not found or s.status <> 'active' then return 0; end if;
 v_to := least(p_today + 14,coalesce(s.until_date,p_today + 14));
 v_from := greatest(coalesce(s.materialized_through,s.start_date - 1),p_today - 1);
 if v_to <= v_from then return 0; end if;
 for d in select x from public.task_series_dates(s.freq,s.interval_n,s.by_weekday,
   s.by_monthday,s.start_date,s.until_date,v_from,v_to) x loop
  if d = any(s.skipped_dates) then continue; end if;
  v_made := v_made + public.task_series_insert_occurrence(s,d);
 end loop;
 update public.task_series set materialized_through = v_to where id = s.id;
 return v_made;
end
$mat$;
revoke all on function public.task_series_materialize(uuid,date)
 from public,anon,authenticated,service_role;

create function public.task_series_command(p jsonb) returns jsonb
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
revoke all on function public.task_series_command(jsonb) from public,anon;
grant execute on function public.task_series_command(jsonb) to authenticated,service_role;

insert into public.lemma_command_resources(resource,command_fn,mcp_ok,"schema") values
 ('task_series','task_series_command',true,
  '{"operations":["create","update","skip","unskip","stop","resume"],"fields":["title","body","subject_id","project_id","checkpoint_id","estimate_minutes","priority","freq","interval_n","by_weekday","by_monthday","start_date","until_date","skipped_dates","status","materialized_through"]}'::jsonb);

-- Background scheduler. One tick serves ONE owner (log_change allows one owner
-- per transaction) and fills every active, due series of theirs. Rows are
-- claimed with SKIP LOCKED and dates are unique per series, so two overlapping
-- ticks, a retried tick or a tick racing a command can never create a date twice.
create function public.lemma_run_task_series() returns jsonb
language plpgsql security definer set search_path = '' as $worker$
declare
 v_owner uuid; v_today date; v_row record; v_made integer := 0; v_series integer := 0;
begin
 if pg_catalog.current_setting('role',true) <> 'service_role' then
  raise exception 'Service role required'; end if;
 select ts.user_id into v_owner
  from public.task_series ts
  where ts.status = 'active'
   and coalesce(ts.materialized_through,ts.start_date - 1) < public.task_series_today(ts.user_id) + 14
   and (ts.until_date is null or coalesce(ts.materialized_through,ts.start_date - 1) < ts.until_date)
   and exists(select 1 from public.settings st where st.user_id = ts.user_id)
  order by ts.user_id limit 1;
 if v_owner is null then
  return pg_catalog.jsonb_build_object('owners',0,'series',0,'generated',0); end if;
 v_today := public.task_series_today(v_owner);
 perform pg_catalog.set_config('lemma.source','system',true);
 perform pg_catalog.set_config('lemma.tool','task_series_scheduler',true);
 perform pg_catalog.set_config('lemma.summary','Recurring tasks generated',true);
 for v_row in
  select ts.id from public.task_series ts
   where ts.user_id = v_owner and ts.status = 'active'
    and coalesce(ts.materialized_through,ts.start_date - 1) < v_today + 14
    and (ts.until_date is null or coalesce(ts.materialized_through,ts.start_date - 1) < ts.until_date)
   order by ts.id for update skip locked
 loop
  v_made := v_made + public.task_series_materialize(v_row.id,v_today);
  v_series := v_series + 1;
 end loop;
 return pg_catalog.jsonb_build_object('owners',1,'series',v_series,'generated',v_made);
end
$worker$;
revoke all on function public.lemma_run_task_series() from public,anon,authenticated;
grant execute on function public.lemma_run_task_series() to service_role;

-- Same install pattern as lemma-run-due-commands: only where pg_cron exists;
-- the job switches to service_role for its own transaction.
do $install_task_series_cron$
begin
 if exists (select 1 from pg_catalog.pg_available_extensions where name = 'pg_cron') then
  create extension if not exists pg_cron;
  perform cron.schedule('lemma-run-task-series','*/10 * * * *',
   'DO $series_tick$ BEGIN
     EXECUTE ''SET LOCAL ROLE service_role'';
     PERFORM public.lemma_run_task_series();
    END $series_tick$;');
 end if;
end
$install_task_series_cron$;
