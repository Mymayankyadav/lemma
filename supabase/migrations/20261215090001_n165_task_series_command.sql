-- N165: reviewed additive bug-hunt corrections; ordered part 2.
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

