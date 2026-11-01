-- FIX #679: optimize NOTIF-1b X cold candidate read; no table/data rewrite.
-- Down: drop index public.cards_notify_owner_note_due_cover; drop function public.notify_candidates(uuid,timestamptz); then
-- reapply 20261101123100_notify_candidates.sql to restore its original body
-- and service_role-only EXECUTE grant. No tables or data are changed.
-- Cover the card-first sibling deduplication with a single owner-scoped
-- index scan. The existing (user_id,note_id) index lacks state/due/id and
-- forces heap fetches for every candidate in a 30,000-card cold import.
-- This index does not change the query result or permissions.
create index if not exists cards_notify_owner_note_due_cover
  on public.cards(user_id,note_id) include (state,due,id);

create or replace function public.notify_candidates(p_user uuid,p_now timestamptz)
-- The 30k-card X snapshot must not use one cards_note_id_owner probe per note.
-- Owner-scoped hash joins keep the bounded read stable even before auto-ANALYZE
-- has refreshed estimates after a bulk import. The setting is function-local.
returns jsonb language sql stable security definer set search_path = ''
  set enable_nestloop = off as $facts$
with
prefs as (
  select s.user_id,s.time_zone,s.rollover_hour,s.reviews_per_day,s.new_per_day,
    ((p_now at time zone s.time_zone)-make_interval(hours=>s.rollover_hour))::date as today,
    ((date_trunc('day',(p_now at time zone s.time_zone)-make_interval(hours=>s.rollover_hour))
      +make_interval(hours=>s.rollover_hour)) at time zone s.time_zone) as day_start,
    ((date_trunc('day',(p_now at time zone s.time_zone)-make_interval(hours=>s.rollover_hour))
      +interval '1 day'+make_interval(hours=>s.rollover_hour)) at time zone s.time_zone) as day_end
  from public.settings s where s.user_id=p_user
),
visible_projects as (
  select p.id,p.user_id,p.slug,p.title,p.target_date,p.status
  from public.projects p join prefs f on f.user_id=p.user_id
  where p.user_id=p_user and p.system=false and p.status<>'archived'
),
reviewed as (
  select count(*)::integer total,
    count(*) filter(where r.state_before=0)::integer fresh
  from public.reviews r cross join prefs f
  where r.user_id=p_user and r.undone_at is null and r.reviewed_at>=f.day_start
),
-- Deduplicate eligible sibling cards in a narrow owner-scoped scan before
-- joining 30k note/project rows. All siblings share the same note visibility.
due_candidates as (
  select n.id note_id,n.no,c.state,c.due,c.id card_id
  from (
    select distinct on (c.note_id) c.note_id,c.user_id,c.state,c.due,c.id
    from public.cards c cross join prefs f
    where c.user_id=p_user and (c.state=0 or c.due<f.day_end)
    order by c.note_id,
      case when c.state=0 then 1 else 0 end,
      case when c.state in (1,3) and c.due<=p_now then 0 else 1 end,
      c.due,c.id
  ) c
  join public.notes n on n.id=c.note_id and n.user_id=c.user_id
  join visible_projects pr on pr.id=n.project_id and pr.user_id=n.user_id
  where n.user_id=p_user and n.status='active'
),
-- The daily quota can never consume more than reviews_per_day + new_per_day
-- distinct notes. Keep the complete due_candidates set for exact backlog, but
-- apply the expensive priority windows only to the bounded first 2,200.
top_due as (
  select c.* from due_candidates c
  order by case when c.state=0 then 2
      when c.state in (1,3) and c.due<=p_now then 0 else 1 end,
    c.due,c.no,c.card_id
  limit (select least(reviews_per_day+new_per_day,2200) from prefs)
),
prioritized as (
  select c.*,
    row_number() over(order by
      case when c.state=0 then 2 when c.state in (1,3) and c.due<=p_now then 0 else 1 end,
      c.due,c.no,c.card_id) seq,
    sum(case when c.state=0 then 1 else 0 end) over(order by
      case when c.state=0 then 2 when c.state in (1,3) and c.due<=p_now then 0 else 1 end,
      c.due,c.no,c.card_id) fresh_seq
  from top_due c
),
quota as (
  select p.*,row_number() over(order by p.seq) review_seq
  from prioritized p cross join prefs f cross join reviewed r
  where p.state<>0 or p.fresh_seq<=greatest(f.new_per_day-r.fresh,0)
),
due_totals as (
  select count(*) filter(where q.review_seq<=greatest(f.reviews_per_day-r.total,0))::integer count,
    (select count(*)::integer from due_candidates) backlog
  from quota q cross join prefs f cross join reviewed r
),
answer_speed as (
  select coalesce(percentile_cont(0.5) within group(order by r.duration_ms),25000)::numeric ms
  from public.reviews r
  where r.user_id=p_user and r.undone_at is null and r.duration_ms>0
    and r.reviewed_at>=p_now-interval '30 days'
),
tomorrow_primary as (
  -- First represent distinct projects, using one indexed checkpoint lookup per
  -- active project. With 60 projects / 2,400 tomorrow checkpoints this avoids
  -- ranking and sorting all 2,400 rows merely to show 20 compact K2 entries.
  select c.code,c.title,c.current_step,c.steps,pr.slug,pr.title project,
    c.due_on,c.position,c.id checkpoint_id
  from visible_projects pr cross join prefs f
  join lateral (
    select c.code,c.title,c.current_step,c.steps,c.due_on,c.position,c.id
    from public.checkpoints c
    where c.user_id=p_user and c.project_id=pr.id
      and c.status<>'demonstrated' and c.due_on=f.today+1
      and (c.status='in_progress' or not exists (
        select 1 from public.checkpoint_prereqs edge
        join public.checkpoints prerequisite on prerequisite.id=edge.prereq_id and prerequisite.user_id=edge.user_id
        where edge.user_id=p_user and edge.checkpoint_id=c.id and prerequisite.status<>'demonstrated'
      ))
    order by c.position,c.id
    limit 1
  ) c on true
  where pr.status='active'
  order by pr.slug
  limit 20
),
tomorrow_extras as (
  -- If fewer than twenty projects qualify, fill remaining slots with their
  -- other checkpoints. The LIMIT is zero in the 60-project stress fixture.
  select c.code,c.title,c.current_step,c.steps,pr.slug,pr.title project,
    c.due_on,c.position,c.id checkpoint_id
  from public.checkpoints c
  join visible_projects pr on pr.id=c.project_id and pr.user_id=c.user_id
  cross join prefs f
  where c.user_id=p_user and pr.status='active'
    and c.status<>'demonstrated' and c.due_on=f.today+1
    and not exists(select 1 from tomorrow_primary first where first.checkpoint_id=c.id)
    and (c.status='in_progress' or not exists (
      select 1 from public.checkpoint_prereqs edge
      join public.checkpoints prerequisite on prerequisite.id=edge.prereq_id and prerequisite.user_id=edge.user_id
      where edge.user_id=p_user and edge.checkpoint_id=c.id and prerequisite.status<>'demonstrated'
    ))
  order by pr.slug,c.position,c.id
  limit (select greatest(20-count(*),0) from tomorrow_primary)
),
tomorrow_rows as (
  select 0 priority,first.* from tomorrow_primary first
  union all
  select 1 priority,extra.* from tomorrow_extras extra
),
tomorrow_json as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'slug',slug,'project',project,'code',code,'title',title,
    'step',current_step,'steps',jsonb_array_length(steps))
    order by priority,due_on,slug,position,checkpoint_id),'[]'::jsonb) items
  from tomorrow_rows
),
late_ranked as (
  select c.code,c.title,c.current_step,c.steps,c.due_on,pr.slug,pr.title project,
    pr.target_date,f.today,
    row_number() over(partition by pr.id order by c.due_on,c.position,c.id) project_rank
  from public.checkpoints c
  join visible_projects pr on pr.id=c.project_id and pr.user_id=c.user_id
  cross join prefs f
  where c.user_id=p_user and pr.status='active'
    and c.status<>'demonstrated' and c.due_on<=f.today-3
),
late_json as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'slug',slug,'project',project,'code',code,'title',title,
    'dueOn',due_on,'daysLate',today-due_on,'targetDate',target_date)
    order by due_on,slug),'[]'::jsonb) items
  from (select * from late_ranked where project_rank=1 order by due_on,slug limit 20) selected
),
past_target_json as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'slug',slug,'project',project,'lastDueOn',last_due,'targetDate',target_date)
    order by target_date,slug),'[]'::jsonb) items
  from (
    select pr.slug,pr.title project,pr.target_date,max(c.due_on) last_due
    from visible_projects pr join public.checkpoints c on c.user_id=p_user and c.project_id=pr.id
    where pr.status='active' and pr.target_date is not null and c.status<>'demonstrated'
    group by pr.id,pr.slug,pr.title,pr.target_date
    having max(c.due_on)>pr.target_date
    order by pr.target_date,pr.slug limit 20
  ) selected
),
paused as (
  select jsonb_build_object('slug',pr.slug,'project',pr.title,'number',s.number,
    'step',coalesce(s.resume_step,1),'steps',coalesce(jsonb_array_length(c.steps),1),
    'question',s.resume_question,'checkpointTitle',c.title,'lastActivityAt',s.last_activity_at) item
  from public.sessions s join visible_projects pr on pr.id=s.project_id and pr.user_id=s.user_id
  left join public.checkpoints c on c.id=s.checkpoint_id and c.user_id=s.user_id
  where s.user_id=p_user and s.state='open' and s.last_activity_at<=p_now-interval '18 hours'
  order by s.last_activity_at desc,s.id limit 1
),
last_tutor as (
  select max(sent_at) sent_at from public.notifications
  where user_id=p_user and kind='tutor' and sent_at is not null
),
pending as (
  select p.id,p.no,p.kind,p.origin,p.created_at,pr.title project,
    row_number() over(order by p.created_at,p.no) rn
  from public.proposals p join visible_projects pr on pr.id=p.project_id and pr.user_id=p.user_id
  cross join last_tutor t
  where p.user_id=p_user and p.status='pending'
    and (t.sent_at is null or p.created_at>t.sent_at)
),
pending_counts as (
  select count(*) filter(where kind='card')::integer card,
    count(*) filter(where kind='card_edit')::integer card_edit,
    count(*) filter(where kind='plan')::integer plan,
    count(*) filter(where kind='plan_change')::integer plan_change,
    max(created_at) newest
  from pending
),
pending_bounded as (
  select coalesce(jsonb_agg(no order by rn),'[]'::jsonb) numbers,
    coalesce(jsonb_agg(no order by rn) filter(where kind='card'),'[]'::jsonb) card_numbers,
    coalesce(jsonb_agg(id order by rn) filter(where kind='card'),'[]'::jsonb) card_ids,
    coalesce(jsonb_agg(distinct origin),'[]'::jsonb) origins,
    coalesce(jsonb_agg(distinct project),'[]'::jsonb) projects
  from pending where rn<=50
),
ended_session as (
  select jsonb_build_object('slug',pr.slug,'number',s.number,'summary',s.summary,
    'endedAt',s.ended_at) item
  from public.sessions s join visible_projects pr on pr.id=s.project_id and pr.user_id=s.user_id
  cross join last_tutor t
  where s.user_id=p_user and s.state='ended' and s.summary is not null
    and (t.sent_at is null or s.ended_at>t.sent_at)
  order by s.ended_at desc,s.id limit 1
),
study_events as (
  select r.reviewed_at at time zone f.time_zone - make_interval(hours=>f.rollover_hour) local_at,
    r.reviewed_at at_time,1 review
  from public.reviews r cross join prefs f
  where r.user_id=p_user and r.undone_at is null
  union all
  select e.created_at at time zone f.time_zone - make_interval(hours=>f.rollover_hour),
    e.created_at,0
  from public.session_events e cross join prefs f where e.user_id=p_user
),
study_summary as (
  select max(at_time) last_at,
    count(distinct local_at::date) filter(where at_time>=p_now-interval '7 days')::integer days_studied,
    count(*) filter(where review=1 and at_time>=p_now-interval '7 days')::integer week_reviews
  from study_events
),
week_demonstrated as (
  select coalesce(jsonb_agg(code order by demonstrated_at,code),'[]'::jsonb) items
  from (select c.code,c.demonstrated_at from public.checkpoints c
    join visible_projects pr on pr.id=c.project_id and pr.user_id=c.user_id
    where c.user_id=p_user and c.status='demonstrated'
      and c.demonstrated_at>=p_now-interval '7 days'
    order by c.demonstrated_at,c.code limit 20) selected
),
week_next as (
  select jsonb_build_object('code',c.code,'title',c.title,'dueOn',c.due_on) item
  from public.checkpoints c join visible_projects pr on pr.id=c.project_id and pr.user_id=c.user_id
  where c.user_id=p_user and c.status<>'demonstrated'
  order by c.due_on nulls last,c.position,c.id limit 1
),
devices as (
  select count(*) filter(where disabled_at is null)::integer enabled,
    max(last_seen_at) filter(where disabled_at is null) last_seen_at
  from public.push_devices where user_id=p_user
),
history as (
  select count(*) filter(where sent_at>=f.day_start and kind not in ('confirm','test'))::integer sent_today,
    max(sent_at) filter(where kind not in ('confirm','test')) last_sent_at
  from public.notifications n cross join prefs f
  where n.user_id=p_user
),
last_by_key as (
  select coalesce(jsonb_object_agg(key,sent_at),'{}'::jsonb) items
  from (select key,max(sent_at) sent_at from public.notifications
    where user_id=p_user and sent_at is not null and kind not in ('test','confirm')
    group by key order by max(sent_at) desc,key limit 50) selected
),
dismiss_recent as (
  select k.kind,n.action,
    row_number() over(partition by k.kind order by n.action_at desc,n.id desc) seq
  from (values ('due'),('behind'),('resume'),('rhythm')) as k(kind)
  left join lateral (
    select action,action_at,id from public.notifications
    where user_id=p_user and kind=k.kind and action_at is not null
      and action_at>=p_now-interval '30 days'
    order by action_at desc,id desc limit 3
  ) n on true
),
dismiss_streaks as (
  select kind,count(*) filter(where action='dismiss' and interruptions=0)::integer n
  from (
    select kind,action,
      sum(case when action='dismiss' then 0 else 1 end)
        over(partition by kind order by seq rows between unbounded preceding and current row) interruptions
    from dismiss_recent
  ) streak group by kind
),
dismiss_json as (
  select coalesce(jsonb_object_agg(kind,n),'{}'::jsonb) items from dismiss_streaks
)
select jsonb_build_object(
  'tz',f.time_zone,'rollover',f.rollover_hour,'today',f.today,
  'localTime',to_char(p_now at time zone f.time_zone,'HH24:MI'),
  'studiedToday',coalesce(s.last_at>=f.day_start,false),
  'lastStudyAt',s.last_at,
  'quietDays',case when s.last_at is null then 0
    else greatest(f.today-((s.last_at at time zone f.time_zone)
      -make_interval(hours=>f.rollover_hour))::date,0) end,
  'due',jsonb_build_object('count',d.count,'backlog',d.backlog,
    'minutes',ceil(d.count*speed.ms/60000)::integer),
  'tomorrow',tomorrow.items,'late',late.items,'pastTarget',past.items,
  'paused',(select item from paused),'live',exists(
    select 1 from public.sessions sess
    join visible_projects pr on pr.id=sess.project_id and pr.user_id=sess.user_id
    where sess.user_id=p_user and sess.state='open' and sess.last_activity_at>p_now-interval '10 minutes'),
  'tutor',jsonb_build_object(
    'pending',jsonb_build_object('card',pc.card,'card_edit',pc.card_edit,
      'plan',pc.plan,'plan_change',pc.plan_change),
    'numbers',pb.numbers,'cardNumbers',pb.card_numbers,'cardIds',pb.card_ids,
    'newestAt',pc.newest,'origins',pb.origins,'projects',pb.projects,
    'answeredNotes',(select count(*)::integer from public.card_comments cc cross join last_tutor lt
      where cc.user_id=p_user and cc.status='addressed'
        and (lt.sent_at is null or cc.resolved_at>lt.sent_at)),
    'endedSession',(select item from ended_session)),
  'week',jsonb_build_object('daysStudied',s.days_studied,'reviews',s.week_reviews,
    'demonstrated',wd.items,'next',(select item from week_next)),
  'devices',jsonb_build_object('enabled',dev.enabled,'lastSeenAt',dev.last_seen_at),
  'history',jsonb_build_object('sentToday',h.sent_today,'lastSentAt',h.last_sent_at,
    'lastByKey',lk.items,'dismissStreak',dd.items)
)
from prefs f cross join reviewed r cross join due_totals d cross join answer_speed speed
cross join tomorrow_json tomorrow cross join late_json late cross join past_target_json past
cross join pending_counts pc cross join pending_bounded pb cross join study_summary s
cross join week_demonstrated wd cross join devices dev cross join history h
cross join last_by_key lk cross join dismiss_json dd;
$facts$;
revoke all on function public.notify_candidates(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.notify_candidates(uuid,timestamptz) to service_role;

