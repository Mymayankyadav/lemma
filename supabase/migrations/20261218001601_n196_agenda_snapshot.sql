-- Read-only Edge adapter. One statement snapshot supplies the clock, calendar,
-- complete versioned evidence, and owner-bound native inputs. Nothing here is callable by a client.
create function public.lemma_agenda_snapshot(p_owner uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $agenda$
declare
  cutoff timestamptz := statement_timestamp();
  horizon timestamptz := cutoff + interval '7 days';
  watermark text := pg_current_snapshot()::text;
  calendar jsonb; evidence jsonb := '[]'; page jsonb; after_id bigint := 0;
  owner_settings jsonb; zone text; native jsonb := '{}'; items jsonb; name text; projection text; owned_query text;
  task_rows jsonb; reserved jsonb; spent jsonb; durations jsonb; attendance jsonb; bank_rows jsonb:='[]'; forecast_enabled boolean:=false; prelogged jsonb:='[]'; occupied boolean;
begin
  if current_setting('role',true) is distinct from 'service_role' or p_owner is null then
    raise exception 'Verified owner required' using errcode='42501'; end if;
  select jsonb_build_object('atlas',s.atlas,'capacity',s.capacity,'planning',s.planning,
    'time_zone',s.time_zone,'review_budget',s.review_budget,'scheduling_algorithm',to_jsonb(s)->'scheduling_algorithm'),
    s.time_zone into strict owner_settings,zone from public.settings s where s.user_id=p_owner;
  if to_regprocedure('public.lemma_planning_snapshot_mcp(uuid,text,jsonb)') is null then
    return jsonb_build_object('asOf',cutoff,'watermark',watermark,'reason','Evidence foundation unavailable');
  end if;
  calendar:=public.lemma_planning_snapshot_mcp(p_owner,'calendar',jsonb_build_object(
    'p_as_of',cutoff,'p_watermark',watermark,'p_horizon_end',horizon));
  if calendar->>'status' is distinct from 'ok' then return jsonb_build_object(
    'asOf',cutoff,'watermark',watermark,'reason','Calendar snapshot unavailable'); end if;
  for i in 1..16 loop
    page:=public.lemma_planning_snapshot_mcp(p_owner,'evidence',jsonb_build_object(
      'p_as_of',cutoff,'p_watermark',watermark,'p_after',after_id,'p_limit',500));
    if (page->>'asOf')::timestamptz is distinct from cutoff or page->>'watermark' is distinct from watermark then
      raise exception 'Inconsistent evidence snapshot'; end if;
    evidence:=evidence||(page->'events'); exit when page->>'nextAfter' is null;
    after_id:=(page->>'nextAfter')::bigint;
    if i=16 then return jsonb_build_object('asOf',cutoff,'watermark',watermark,'reason','Evidence exceeds snapshot limit'); end if;
  end loop;
  -- Every identifier/projection below is a constant in the migration. Project
  -- only the model's numerical/identity inputs and the names used for decisions.
  for name,projection,owned_query in select * from (values
    ('projects','id,last_study_on,share_weight,time_confirmed','projects where user_id=$1 and not system and status<>''archived'' order by id'),
    ('checkpoints','id,project_id,title,position,status,plan_state,tier,estimate_minutes,kind,self_reported,demonstrated_at','checkpoints where user_id=$1 order by project_id,position,id'),
    ('cpConcepts','checkpoint_id,concept_id','checkpoint_concepts where user_id=$1 order by checkpoint_id,concept_id'),
    ('prereqs','checkpoint_id,prereq_id','checkpoint_prereqs where user_id=$1 order by checkpoint_id,prereq_id'),
    ('concepts','id,name,kind,subject_id,parent_id,family_id,slug','concepts where user_id=$1 order by id'),
    ('sessions','id,started_at,checkpoint_id,project_id,minutes','sessions where user_id=$1 and started_at<=$2 order by started_at,id'),
    ('modelFits','id::text as id,fitted_at,params','model_fits where user_id=$1 and fitted_at<=$2 order by fitted_at desc,id desc limit 1'),
    ('atlasLinks','id,from_id,to_id,kind,status','atlas_links where user_id=$1 order by id'),
    ('items','id,b,b_sd','items where user_id=$1 order by id'),
    ('assumptions','concept_id,level,revoked_at','assumptions where user_id=$1 order by id'),
    ('notes','id,concept_id,project_id,created_at,atlas_kind','notes where user_id=$1 and created_at<=$2 order by id'),
    ('cards','id,note_id,stability,difficulty,last_review','cards where user_id=$1 and created_at<=$2 order by id'),
    ('reviews','id::text as id,card_id,reviewed_at,rating','reviews where user_id=$1 and reviewed_at<=$2 and undone_at is null order by reviewed_at,id'),
    ('busy','id,kind,status,starts_at,ends_at','calendar_blocks where user_id=$1 and status<>''cancelled'' order by starts_at,id'),
    ('studyEntries','id,calendar_block_id,status','study_entries where user_id=$1 and status=''saved'' order by id')
  ) as fields(name,projection,owned_query) loop
    execute format('select coalesce(jsonb_agg(to_jsonb(row)),''[]''::jsonb) from (select %s from public.%s) row',
      projection,owned_query) into items using p_owner,cutoff;
    native:=native||jsonb_build_object(name,items);
  end loop;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') into task_rows from (
    select t.id,t.title,t.project_id,t.estimate_minutes,t.priority,
      case when t.due_kind='instant' then t.due_at
           when t.due_kind='date' then (t.due_date+1)::timestamp at time zone zone end deadline
    from public.tasks t where t.user_id=p_owner and t.status in ('backlog','in_progress')) r;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.starts_at,r.task_id),'[]') into reserved from (
    select b.task_id,b.starts_at,b.ends_at from public.calendar_blocks b join public.tasks t on t.id=b.task_id and t.user_id=b.user_id
    where b.user_id=p_owner and b.task_id is not null and b.status='planned' and b.ends_at>cutoff and b.starts_at<horizon
      and t.status in ('backlog','in_progress')
    union
    select d.task_id,b.starts_at,b.ends_at from public.day_plan_items d
    join public.day_plans p on p.user_id=d.user_id and p.id=d.plan_id
    join public.tasks t on t.user_id=d.user_id and t.id=d.task_id and t.status in ('backlog','in_progress')
    join public.calendar_blocks b on b.user_id=d.user_id and b.id=d.calendar_block_id
    where d.user_id=p_owner and p.status='committed' and d.disposition='placed'
      and b.status='planned' and b.ends_at>cutoff and b.starts_at<horizon) r;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.at,r.id),'[]') into durations from (
    select cp.id,cp.demonstrated_at as at,cp.estimate_minutes as estimated,sum(s.minutes) as actual
    from public.checkpoints cp join public.sessions s on s.user_id=cp.user_id and s.checkpoint_id=cp.id
    where cp.user_id=p_owner and cp.status='demonstrated' and cp.demonstrated_at<=cutoff and not cp.self_reported
      and cp.estimate_minutes>0 and s.state='ended' and s.last_activity_at<=cutoff and not s.abandoned
    group by cp.id having sum(s.minutes)>0 order by at desc,cp.id desc limit 24) r;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.at,r.id),'[]') into attendance from (
    select b.id,b.ends_at as at,b.status='done' or exists(select 1 from public.study_entries e
      where e.user_id=b.user_id and e.calendar_block_id=b.id and e.status='saved' and e.saved_at<=cutoff) as kept
    from public.calendar_blocks b where b.user_id=p_owner and b.kind='study' and b.status<>'cancelled' and b.ends_at<=cutoff
    order by b.ends_at desc,b.id desc limit 24) r;
  -- A civil day's cap covers all its project windows together. Merge overlaps before counting saved focus time.
  with day as (select (cutoff at time zone zone)::date as d),
    ranges as (select range_agg(tstzrange(greatest(i.started_at,day.d::timestamp at time zone zone),least(i.ended_at,cutoff),'[)')) as used
      from public.study_intervals i join public.study_entries e on e.id=i.entry_id and e.user_id=i.user_id cross join day
      where i.user_id=p_owner and i.kind='focus' and e.status='saved' and e.saved_at<=cutoff and i.ended_at is not null
        and i.started_at<cutoff and i.ended_at>day.d::timestamp at time zone zone),
    minutes as (select coalesce(sum(extract(epoch from (upper(span)-lower(span)))/60.),0) as used
      from ranges cross join lateral unnest(ranges.used) span)
    select jsonb_build_object(day.d::text,minutes.used) into spent from day,minutes;
  select exists(select 1 from public.study_entries e where e.user_id=p_owner and e.status in ('running','paused'))
    into occupied;
  -- A bank/monitor outage cannot invalidate the legal calendar recommendation.
  if to_regprocedure('public.lemma_practice_bank_snapshot(uuid,timestamptz)') is not null then
    begin
      select c.forecast_enabled into forecast_enabled from public.atlas_practice_controls c where c.singleton;
      bank_rows:=public.lemma_practice_bank_snapshot(p_owner,cutoff);
      select coalesce(jsonb_agg(to_jsonb(r) order by r.at,r."requestId"),'[]') into prelogged from (
        select request_id as "requestId",item_id as "itemId",item_version as version,served_at as at,scope,item_details as details,native_probability as native
        from public.atlas_practice_exposures where user_id=p_owner and served_at<cutoff and native_probability is not null) r;
    exception when others then bank_rows:='[]';forecast_enabled:=false;end;
  end if;
  return jsonb_build_object('asOf',cutoff,'watermark',watermark,'calendar',calendar,'evidence',evidence,
    'rows',native||jsonb_build_object('settings',owner_settings),'tasks',task_rows,'reservations',reserved,
    'history',durations||attendance,'occupied',occupied,'spentByDate',spent,'practiceBank',bank_rows,'forecastEnabled',coalesce(forecast_enabled,false),'prelogged',prelogged);
end
$agenda$;
revoke all on function public.lemma_agenda_snapshot(uuid) from public,anon,authenticated;
grant execute on function public.lemma_agenda_snapshot(uuid) to service_role;
