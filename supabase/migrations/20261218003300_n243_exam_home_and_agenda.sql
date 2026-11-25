-- Keep the Today transfer bounded even on a 60-row blueprint. Classification uses
-- the same cutoffs and exam-before-course ordering as the shared Path planner.
create function public.exam_home_rows(p_sitting uuid,p_as_of timestamptz) returns jsonb
language sql stable security invoker set search_path='' as $$
 with sitting as (
   select s.* from public.exam_sittings s where s.id=p_sitting and s.user_id=(select auth.uid())
 ), rows as (
   select r.*,s.user_id,s.project_id,s.activated_at,s.ledger from sitting s cross join lateral jsonb_array_elements(s.blueprint) with ordinality r(row,ord)
 ), attempts as (
   select a.* from public.exam_attempts a join sitting s on s.user_id=a.user_id and s.id=a.sitting_id
   where a.voided_at is null and a.occurred_at<=p_as_of order by a.occurred_at desc,a.id desc limit 500
 ), course as (
   select e.* from sitting s cross join lateral jsonb_to_recordset(public.exam_row_evidence(s.user_id,s.id,p_as_of))
     as e(concept text,occurred_at timestamptz,outcome text,hint_level int,novelty text)
 ), observations as (
   select a.row_key k,a.occurred_at at,true exam,coalesce(a.marks_awarded/nullif(a.marks_possible,0),
     case a.outcome when 'correct' then 1 when 'partial' then .5 else 0 end) credit,
     a.independence='independent' and a.hint_level=0 and a.novelty<>'seen_solution' independent,
     (a.confidence='low' and lower(coalesce(r.row->>'format',''))='mcq') guess
   from attempts a join rows r on r.row->>'key'=a.row_key where a.outcome in ('correct','partial','incorrect') and a.independence<>'reading'
   union all
   select r.row->>'key',c.occurred_at,false,case c.outcome when 'pass' then 1 when 'partial' then .5 else 0 end,
     c.hint_level=0 and c.novelty<>'seen_solution',false
   from rows r join course c on r.row->'concepts' ? c.concept where c.outcome in ('pass','partial','fail') and c.novelty<>'self_reported'
 ), independent as (
   select o.* from observations o where independent and (exam or not exists(
     select from observations e where e.k=o.k and e.at=o.at and e.exam))
 ), dates as (
   select r.*,v.instant,v.current_read from rows r cross join lateral(values (p_as_of,true),(r.activated_at,false)) v(instant,current_read)
 ), classified as (
   select d.*,((row->>'marks')::numeric * coalesce((row->>'chance')::numeric,1)) w,
     case when latest.at is null then case when exists(select from observations o where o.k=d.row->>'key'
       and o.at<=instant and not o.independent and o.credit>0) then 'shaky' else 'unseen' end
       when recent.success and recent.failure then 'conflicting' when latest.credit<.4 then 'gap'
       when latest.credit>=.8 and not latest.guess and latest.at>=instant-(case when latest.exam then interval '14 days' else interval '7 days' end) then 'secure'
       when latest.credit>=.8 and not latest.guess and latest.at<instant-interval '21 days' then 'stale' else 'shaky' end status
   from dates d left join lateral(select i.* from independent i where i.k=d.row->>'key' and i.at<=instant
     order by i.at desc,i.exam desc limit 1) latest on true
   left join lateral(select bool_or(credit>=.8 and not guess) success,bool_or(credit<.4) failure from independent i
     where i.k=d.row->>'key' and i.at between instant-interval '7 days' and instant) recent on true
 ), now_rows as (
   select c.*,w*(1-case status when 'secure' then .7 when 'gap' then .1 when 'stale' then .4 when 'shaky' then .35 when 'conflicting' then .25 else .15 end) exposure
   from classified c where current_read
 ), changed as (
   select n.row->>'title' title,cp.code,n.status from now_rows n join classified old on old.ord=n.ord and not old.current_read
   join public.checkpoints cp on cp.user_id=n.user_id and cp.project_id=n.project_id and (n.row->'checkpoints' ? cp.code or exists(
     select from public.checkpoint_concepts cc join public.concepts c on c.id=cc.concept_id and c.user_id=n.user_id
     where cc.checkpoint_id=cp.id and n.row->'concepts' ? c.slug))
   where n.activated_at is not null and
     (case n.status when 'secure' then 3 when 'shaky' then 2 when 'stale' then 1 when 'conflicting' then 1 else 0 end)>
     (case old.status when 'secure' then 3 when 'shaky' then 2 when 'stale' then 1 when 'conflicting' then 1 else 0 end)
   order by (n.status='secure') desc,n.w desc,n.ord,cp.position limit 1
 )
 select jsonb_build_object('coverage',jsonb_build_object('accounted',coalesce(sum(w),0),'secure',coalesce(sum(w) filter(where status='secure'),0),
    'deferred',coalesce(sum(w) filter(where ledger->(row->>'key')->>'disposition'='defer'),0)),
    'topRows',coalesce((select jsonb_agg(jsonb_build_object('row',jsonb_build_object('key',row->>'key','title',row->>'title','marks',row->'marks',
      'concepts',row->'concepts','checkpoints',row->'checkpoints'),'exposure',exposure) order by exposure desc,ord)
      from (select * from now_rows where coalesce(ledger->(row->>'key')->>'disposition','') not in ('defer','skip') and status<>'secure'
        order by exposure desc,ord limit 3) targets),'[]'::jsonb),
    'deferredCount',count(*) filter(where ledger->(row->>'key')->>'disposition'='defer'),
    'whatChanged',coalesce((select title||case when status='secure' then ' is independently covered.' else ' has new exam evidence ('||status||').' end||' Use it in '||code||'.' from changed),'Exam prep evidence is in your history.'),
    'nextStudy',(select jsonb_build_object('code',c.code,'label',c.title) from public.checkpoints c join sitting s on c.user_id=s.user_id and c.project_id=s.project_id
      where c.status in ('in_progress','not_started') and c.plan_state='active' order by (c.status='in_progress') desc,c.position,c.id limit 1))
 from now_rows;
$$;
revoke all on function public.exam_home_rows(uuid,timestamptz) from public,anon,service_role;
grant execute on function public.exam_home_rows(uuid,timestamptz) to authenticated;

-- Today reads summaries alongside its ordinary data in a single request. The learner
-- opens a Path for prompts, evidence and full blueprint details.
create function public.exam_home_summary() returns jsonb language sql stable security invoker set search_path='' as $$
 with selected as (
   select distinct on (s.project_id) s.*,p.slug,(s.status='finished' and (statement_timestamp() at time zone st.time_zone - make_interval(hours=>st.rollover_hour))::date >
     coalesce(p.last_study_on,(p.deadline_at at time zone st.time_zone)::date,p.target_date)) as course_past_deadline from public.exam_sittings s
   join public.projects p on (p.id,p.user_id)=(s.project_id,s.user_id)
   join public.settings st on st.user_id=s.user_id
   where s.user_id=(select auth.uid()) and not p.system and p.status<>'archived'
     and ((s.status in ('planned','active') and s.starts_at<=now()+interval '7 days')
       or (s.status='paused' and s.paused_at>=now()-interval '3 days')
       or (s.status='finished' and s.finished_at>=now()-interval '14 days'))
   order by s.project_id,case s.status when 'active' then 0 when 'planned' then 1 else 2 end,
     coalesce(s.finished_at,s.paused_at) desc nulls last,s.starts_at,s.id
 ), upcoming as (
   select * from selected order by case status when 'active' then 0 when 'planned' then 1 else 2 end,
     starts_at,project_id limit 8
 ), compact as (
   select s.starts_at,s.id,jsonb_build_object('id',s.id,'project_id',s.project_id,'slug',s.slug,'title',s.title,'status',s.status,'coursePastDeadline',coalesce(s.course_past_deadline,false),
     'starts_at',s.starts_at,'time_zone',s.time_zone,'study_minutes',s.study_minutes,'version',s.version,'bookmark',s.bookmark,
     'finished_at',s.finished_at,'paused_at',s.paused_at,'card_mode',s.card_mode,'phase',s.phase,'blueprint_version',s.blueprint_version,
     'total_marks',s.total_marks,'last_study_at',s.last_study_at,
     'ideaCount',(select count(*) from public.card_ideas i where i.user_id=s.user_id and i.sitting_id=s.id and i.status in ('saved','drafted'))) || public.exam_home_rows(s.id,statement_timestamp()) item
   from upcoming s
 )
 select public.home_summary()||jsonb_build_object('exam',jsonb_build_object('sittings',
    coalesce((select jsonb_agg(item order by starts_at,id) from compact),'[]'::jsonb)));
$$;
revoke all on function public.exam_home_summary() from public,anon;
grant execute on function public.exam_home_summary() to authenticated;

-- Approval owns creation of the note. Adopt its exact owner/project result in the
-- same transaction, preserving both the pending proposal link and its undo history.
create function public.exam_card_idea_approval() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.kind='card' and new.status='approved' and old.status is distinct from new.status then
    update public.card_ideas i set status='linked',note_id=n.id,resolved_at=new.decided_at
    from public.notes n where i.user_id=new.user_id and i.project_id=new.project_id and i.proposal_id=new.id and i.status='drafted'
      and n.user_id=i.user_id and n.project_id=i.project_id and n.no=(new.result->>'note_no')::bigint;
  end if;
  return new;
end $$;
revoke all on function public.exam_card_idea_approval() from public,anon,authenticated,service_role;
create trigger exam_card_idea_approval after update of status on public.proposals for each row
  when (old.status is distinct from new.status and new.kind='card') execute function public.exam_card_idea_approval();

-- The owner adapter reads this under a single statement snapshot and clock. Only
-- fields used by the planner are returned. Projects with no active exam have no entry.
create function public.exam_agenda_inputs(p_owner uuid,p_as_of timestamptz) returns jsonb
language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('sitting',(to_jsonb(s)-array['user_id','sources','result_note','bookmark','plan_note','next_question']),
   'attempts',coalesce((select jsonb_agg(to_jsonb(a) order by a.occurred_at desc,a.id desc)
     from (select t.id,t.row_key,t.occurred_at,t.outcome,t.independence,t.hint_level,t.novelty,t.marks_awarded,t.marks_possible,t.confidence,t.timed,t.seconds
       from public.exam_attempts t where t.user_id=s.user_id and t.sitting_id=s.id and t.voided_at is null and t.occurred_at<=p_as_of
       order by t.occurred_at desc,t.id desc limit 500) a),'[]'::jsonb),
   'evidence',public.exam_row_evidence(p_owner,s.id,p_as_of)) order by s.starts_at,s.id),'[]'::jsonb)
 from public.exam_sittings s join public.projects p on (p.id,p.user_id)=(s.project_id,s.user_id)
 where s.user_id=p_owner and current_setting('role',true)='service_role' and s.status='active'
   and p.status<>'archived' and not p.system;
$$;
revoke all on function public.exam_agenda_inputs(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.exam_agenda_inputs(uuid,timestamptz) to service_role;

create or replace function public.lemma_agenda_snapshot(p_owner uuid) returns jsonb
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
  -- Match loggedMinutes: clip to the owner day, remove per-entry drift, merge
  -- overlapping focus, then remove the union of saved breaks.
  with civil_day as (select (cutoff at time zone zone)::date as d),
    day as (select d,d::timestamp at time zone zone as starts from civil_day),
    entry_ranges as (
      select e.id,e.excluded_intervals,
        range_agg(tstzrange(greatest(i.started_at,day.starts),least(i.ended_at,cutoff),'[)'))
          filter(where i.kind='focus') as focus,
        range_agg(tstzrange(greatest(i.started_at,day.starts),least(i.ended_at,cutoff),'[)'))
          filter(where i.kind='break') as breaks
      from public.study_intervals i join public.study_entries e on e.id=i.entry_id and e.user_id=i.user_id
      cross join day
      where i.user_id=p_owner and e.status='saved' and e.saved_at<=cutoff
        and i.ended_at is not null and i.started_at<cutoff and i.ended_at>day.starts
      group by e.id,e.excluded_intervals
    ),
    entry_focus as (
      select r.focus - coalesce(drift.cuts,'{}'::tstzmultirange) as focus
      from entry_ranges r cross join lateral (
        select range_agg(tstzrange(span.starts,span.ends,'[)')) as cuts
        from jsonb_array_elements(r.excluded_intervals) e(value)
        cross join lateral (select
          case when pg_input_is_valid(e.value->>'from','timestamptz') then (e.value->>'from')::timestamptz end starts,
          case when pg_input_is_valid(e.value->>'to','timestamptz') then (e.value->>'to')::timestamptz end ends
        ) span
        where isfinite(span.starts) and isfinite(span.ends) and span.starts<span.ends
      ) drift
      where r.focus is not null
    ),
    ranges as (
      select coalesce((select range_agg(focus) from entry_focus),'{}'::tstzmultirange)
           - coalesce((select range_agg(breaks) from entry_ranges),'{}'::tstzmultirange) as used
    ),
    minutes as (
      select coalesce(sum(extract(epoch from (upper(span)-lower(span)))/60.),0) as used
      from ranges cross join lateral unnest(ranges.used) span
    )
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
    'rows',native||jsonb_build_object('settings',owner_settings,'examInputs',public.exam_agenda_inputs(p_owner,cutoff)),'tasks',task_rows,'reservations',reserved,
    'history',durations||attendance,'occupied',occupied,'spentByDate',spent,'practiceBank',bank_rows,'forecastEnabled',coalesce(forecast_enabled,false),'prelogged',prelogged);
end
$agenda$;
