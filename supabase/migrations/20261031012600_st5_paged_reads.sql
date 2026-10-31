-- ST-5: bounded, owner-scoped reads for the Paths library and card search.
-- Invoker rights + auth.uid() preserve the existing RLS boundary. No table rewrites.

create index if not exists st5_notes_owner_no
  on public.notes(user_id, no desc);
create index if not exists st5_notes_owner_project
  on public.notes(user_id, project_id);
create index if not exists st5_cards_note_due
  on public.cards(note_id, due);
create index if not exists st5_comments_note_open
  on public.card_comments(note_id) where status = 'open';
create index if not exists st5_checkpoints_project_position
  on public.checkpoints(project_id, position);
create index if not exists st5_sessions_project_ended
  on public.sessions(project_id) where state = 'ended';

-- One bounded JSON summary per project. No full notes, cards, sessions, or
-- checkpoint tables are sent to the browser. Archived projects remain visible
-- in Paths; system projects remain hidden.
create or replace function public.project_summaries()
returns setof jsonb
language sql stable security invoker set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id,
    'slug', p.slug,
    'title', p.title,
    'subject', jsonb_build_object(
      'id', coalesce(s.id::text, 'unassigned'),
      'name', coalesce(s.name, 'Unassigned'),
      'glyph', coalesce(s.glyph, '∫'),
      'hue', coalesce(s.hue, 'slate'),
      'position', coalesce(s.position, 9999)
    ),
    'status', p.status,
    'pinned', p.pinned,
    'system', p.system,
    'targetDate', p.target_date,
    'targetLabel', p.target_label,
    'done', cp.done_count,
    'total', cp.total_count,
    'current', case when cur.id is null then null else jsonb_build_object(
      'code', cur.code, 'title', cur.title,
      'step', cur.current_step, 'stepsTotal', jsonb_array_length(cur.steps)
    ) end,
    'lastActivityAt', p.last_activity_at,
    'cardsCount', nc.card_count,
    'sessionsCount', sc.session_count,
    'sourcesCount', src.source_count,
    'sourceTitles', src.titles,
    -- ST-5/A2: bounded stage groups for Paths' mini Metro, without an N+1
    -- checkpoint fetch. Missing stages become neutral consecutive groups of 8.
    'stageProgress', stage_summary.items,
    'scheduleHeadline', case
      when cp.total_count = 0 then null
      when cp.done_count = cp.total_count then 'Complete'
      when stage_summary.overdue_count > 0
        then stage_summary.overdue_count::text || ' overdue'
      when p.target_date < current_date then 'Target passed'
      when stage_summary.scheduled_count > 0 or p.target_date is not null
        then 'Dates planned'
      else null
    end
  )
  from public.projects p
  left join public.subjects s
    on s.id = p.subject_id and s.user_id = p.user_id
  cross join lateral (
    select count(*)::integer as total_count,
           count(*) filter (where status = 'demonstrated')::integer as done_count
    from public.checkpoints c
    where c.project_id = p.id and c.user_id = p.user_id
  ) cp
  cross join lateral (
    select coalesce(jsonb_agg(jsonb_build_object(
      'label', coalesce(g.stage, case
        when g.first_code = g.last_code then g.first_code
        else g.first_code || '–' || g.last_code end),
      'firstCode', g.first_code, 'lastCode', g.last_code,
      'done', g.done_count, 'total', g.total_count,
      'overdue', g.overdue_count,
      'schedule', case
        when g.done_count = g.total_count then 'complete'
        when g.overdue_count > 0 then 'behind'
        when g.scheduled_count > 0 then 'dated'
        else 'unscheduled'
      end
    ) order by g.first_position, g.group_key), '[]'::jsonb) as items,
      coalesce(sum(g.overdue_count), 0)::integer as overdue_count,
      coalesce(sum(g.scheduled_count), 0)::integer as scheduled_count
    from (
      select r.group_key, max(r.stage) as stage,
        min(r.position) as first_position,
        (array_agg(r.code order by r.position, r.id))[1] as first_code,
        (array_agg(r.code order by r.position desc, r.id desc))[1] as last_code,
        count(*)::integer as total_count,
        count(*) filter (where r.status = 'demonstrated')::integer as done_count,
        count(*) filter (where r.due_on is not null)::integer as scheduled_count,
        count(*) filter (where r.status <> 'demonstrated'
          and r.due_on < current_date)::integer as overdue_count
      from (
        select c.id, c.code, c.position, c.status, c.due_on,
          nullif(btrim(c.stage), '') as stage,
          case when nullif(btrim(c.stage), '') is null
            then 'auto:' || ((row_number() over (
              partition by (nullif(btrim(c.stage), '') is null)
              order by c.position, c.id
            ) - 1) / 8)::text
            else 'stage:' || btrim(c.stage)
          end as group_key
        from public.checkpoints c
        where c.project_id = p.id and c.user_id = p.user_id
      ) r
      group by r.group_key
    ) g
  ) stage_summary
  left join lateral (
    select c.id, c.code, c.title, c.current_step, c.steps
    from public.checkpoints c
    where c.project_id = p.id and c.user_id = p.user_id
      and (
        c.status = 'in_progress'
        or (
          c.status = 'not_started'
          and not exists (
            select 1 from public.checkpoint_prereqs pre
            join public.checkpoints parent
              on parent.id = pre.prereq_id and parent.user_id = p.user_id
            where pre.checkpoint_id = c.id
              and pre.user_id = p.user_id
              and parent.status <> 'demonstrated'
          )
        )
      )
    order by case when c.status = 'in_progress' then 0 else 1 end, c.position, c.id
    limit 1
  ) cur on true
  cross join lateral (
    select count(*)::integer as card_count
    from public.notes n
    join public.cards c on c.note_id = n.id and c.user_id = p.user_id
    where n.project_id = p.id and n.user_id = p.user_id and n.status = 'active'
  ) nc
  cross join lateral (
    select count(*)::integer as session_count
    from public.sessions sess
    where sess.project_id = p.id and sess.user_id = p.user_id and sess.state = 'ended'
  ) sc
  cross join lateral (
    select count(*)::integer as source_count,
           coalesce(jsonb_agg(src.title order by src.position, src.id), '[]'::jsonb) as titles
    from public.sources src
    where src.project_id = p.id and src.user_id = p.user_id
  ) src
  where p.user_id = (select auth.uid()) and p.system = false
  order by p.last_activity_at desc nulls last, p.id;
$$;
revoke all on function public.project_summaries() from public, anon;
grant execute on function public.project_summaries() to authenticated, service_role;

-- The existing searchCards contract returns at most 100 results, but its old
-- implementation downloaded every owner note/card/comment to search locally.
-- This RPC searches on the server, caps each page at 50, and returns only the
-- display fields. Literal substring matching preserves the old search semantics
-- even for %, _, and other LIKE metacharacters.
create or replace function public.search_cards_page(
  p_query text default '',
  p_slug text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns setof jsonb
language sql stable security invoker set search_path = ''
as $$
  select jsonb_build_object(
    'noteNo', n.no,
    'front', n.front,
    'type', n.type,
    'kind', n.kind,
    'projectSlug', p.slug,
    'glyph', coalesce(s.glyph, '∫'),
    'checkpointCode', cp.code,
    'due', (select min(c.due) from public.cards c
            where c.note_id = n.id and c.user_id = n.user_id),
    'status', n.status,
    'openComments', (select count(*)::integer from public.card_comments cc
                     where cc.note_id = n.id and cc.user_id = n.user_id
                       and cc.status = 'open')
  )
  from public.notes n
  join public.projects p on p.id = n.project_id and p.user_id = n.user_id
  left join public.subjects s on s.id = p.subject_id and s.user_id = n.user_id
  left join public.checkpoints cp on cp.id = n.checkpoint_id and cp.user_id = n.user_id
  where n.user_id = (select auth.uid())
    and (p_slug is null or p.slug = p_slug)
    and (
      nullif(btrim(p_query), '') is null
      or strpos(lower(n.front), lower(btrim(p_query))) > 0
      or strpos(lower(n.back), lower(btrim(p_query))) > 0
    )
  order by n.no desc
  limit least(greatest(coalesce(p_limit, 50), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0);
$$;
revoke all on function public.search_cards_page(text,text,integer,integer) from public, anon;
grant execute on function public.search_cards_page(text,text,integer,integer) to authenticated, service_role;


-- Today: one owner-scoped, bounded response instead of fetching every review,
-- card, note, session, event and proposal to compute the dashboard.
-- All time boundaries use the owner's study day (timezone + rollover hour).
create or replace function public.home_summary()
returns jsonb
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
  library as (
    select value as item from public.project_summaries() as value
  ),
  project_json as (
    select coalesce(jsonb_agg(item - 'sourceTitles' order by item->>'lastActivityAt' desc nulls last, item->>'id'), '[]'::jsonb) as items
    from library where item->>'status' <> 'archived'
  ),
  visible as (
    select item from library where item->>'status' <> 'archived'
  ),
  active as (
    select sess.project_id, sess.checkpoint_id, sess.number,
      sess.resume_step, sess.resume_question, sess.last_activity_at
    from public.sessions sess
    join public.projects p on p.id = sess.project_id and p.user_id = sess.user_id
    where sess.user_id = (select auth.uid()) and sess.state <> 'ended'
      and p.system = false and p.status <> 'archived'
    order by sess.last_activity_at desc, sess.id
    limit 1
  ),
  target as (
    select v.item, a.number, a.resume_step, a.resume_question,
      a.last_activity_at as session_activity, a.checkpoint_id
    from visible v
    left join active a on (v.item->>'id')::uuid = a.project_id
    order by case when a.project_id is null then 1 else 0 end,
      v.item->>'lastActivityAt' desc nulls last, v.item->>'id'
    limit 1
  ),
  resume_json as (
    select case when t.item is null then null::jsonb else jsonb_build_object(
      'projectSlug', t.item->>'slug',
      'projectTitle', t.item->>'title',
      'glyph', t.item->'subject'->>'glyph',
      'checkpointCode', cp.code,
      'checkpointTitle', cp.title,
      'step', coalesce(t.resume_step, cp.current_step, 0),
      'stepsTotal', coalesce(jsonb_array_length(cp.steps), 0),
      'question', t.resume_question,
      'objective', cp.objective,
      'pausedAt', coalesce(t.session_activity, (t.item->>'lastActivityAt')::timestamptz),
      'sessionNumber', t.number
    ) end as resume
    from (select 1) one
    left join target t on true
    left join lateral (
      select c.code, c.title, c.current_step, c.steps, c.objective
      from public.checkpoints c
      where c.user_id = (select auth.uid())
        and c.project_id = (t.item->>'id')::uuid
        and (c.id = t.checkpoint_id
             or c.code = t.item->'current'->>'code')
      order by case when c.id = t.checkpoint_id then 0 else 1 end
      limit 1
    ) cp on true
  ),
  answered as (
    select count(*)::integer as total,
      count(*) filter (where r.state_before = 0)::integer as fresh
    from public.reviews r
    cross join prefs s
    where r.user_id = s.user_id and r.undone_at is null
      and r.reviewed_at >= s.day_start
  ),
  eligible as (
    select c.note_id, c.id, c.state, c.due
    from public.cards c
    join public.notes n on n.id = c.note_id and n.user_id = c.user_id
    join public.projects p on p.id = n.project_id and p.user_id = n.user_id
    cross join prefs s
    where c.user_id = s.user_id and n.status = 'active'
      and p.status <> 'archived' and p.system = false
      and (c.state = 0 or c.due < s.day_end)
  ),
  due_notes as (
    select distinct on (e.note_id) e.note_id
    from eligible e
    where e.state <> 0
    order by e.note_id, case when e.state in (1,3) and e.due <= now() then 0 else 1 end,
      e.due, e.id
  ),
  fresh_notes as (
    select count(distinct e.note_id)::integer as total
    from eligible e where e.state = 0
      and not exists (select 1 from due_notes d where d.note_id = e.note_id)
  ),
  due_count as (
    select least(
      greatest(s.reviews_per_day - a.total, 0),
      (select count(*) from due_notes)
        + least(greatest(s.new_per_day - a.fresh, 0), f.total)
    )::integer as total
    from prefs s cross join answered a cross join fresh_notes f
  )
  select jsonb_build_object(
    'projects', p.items,
    'resume', r.resume,
    'due', coalesce((select total from due_count), 0),
    'pendingProposals', (
      select count(*)::integer from public.proposals x
      where x.user_id = (select auth.uid()) and x.status = 'pending'
    )
  )
  from project_json p cross join resume_json r;
$$;
revoke all on function public.home_summary() from public, anon;
grant execute on function public.home_summary() to authenticated, service_role;


-- The deck tree needs only owner-scoped daily due counts, never card bodies,
-- histories, source pages or whole checkpoint tables in the browser.
-- Preserve sibling-safe selection, learning priority and daily new/review caps.
create or replace function public.deck_tree()
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
      and r.reviewed_at >= s.day_start
  ),
  candidates as (
    select distinct on (n.id) n.id as note_id, n.project_id, n.checkpoint_id,
      n.no, c.state, c.due, c.id as card_id
    from public.cards c
    join public.notes n on n.id = c.note_id and n.user_id = c.user_id
    join public.projects p on p.id = n.project_id and p.user_id = n.user_id
    cross join prefs s
    where c.user_id = s.user_id and n.status = 'active'
      and p.status <> 'archived' and p.system = false
      and (c.state = 0 or c.due < s.day_end)
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
    select q.project_id, q.checkpoint_id
    from quota q cross join prefs s cross join answered a
    where q.review_seq <= greatest(s.reviews_per_day - a.total, 0)
  ),
  counts as (
    select project_id, checkpoint_id, count(*)::integer as due
    from selected group by project_id, checkpoint_id
  ),
  library as (
    select item from public.project_summaries() as p(item)
    where item->>'status' <> 'archived'
  )
  select jsonb_build_object(
    'key', 'project:' || (l.item->>'slug'),
    'label', l.item->>'title',
    'glyph', l.item->'subject'->>'glyph',
    'level', 0,
    'due', coalesce(total.due, 0),
    'children', cp.children
  )
  from library l
  cross join lateral (
    select coalesce(jsonb_agg(jsonb_build_object(
      'key', 'cp:' || (l.item->>'slug') || ':' || c.code,
      'label', c.title,
      'glyph', l.item->'subject'->>'glyph',
      'level', 1,
      'due', coalesce(cnt.due, 0),
      'children', '[]'::jsonb
    ) order by c.position, c.id), '[]'::jsonb) as children
    from public.checkpoints c
    left join counts cnt on cnt.project_id = c.project_id and cnt.checkpoint_id = c.id
    where c.user_id = (select auth.uid()) and c.project_id = (l.item->>'id')::uuid
      -- Only due checkpoints belong in the deck picker. Returning all 100
      -- checkpoints for each of 60 projects would recreate the whole-table
      -- download that ST-5 replaces; orphan cards remain at project level.
      and coalesce(cnt.due, 0) > 0
  ) cp
  cross join lateral (
    select count(*)::integer as due from selected s
    where s.project_id = (l.item->>'id')::uuid
  ) total
  order by l.item->>'lastActivityAt' desc nulls last, l.item->>'id';
$$;
revoke all on function public.deck_tree() from public, anon;
grant execute on function public.deck_tree() to authenticated, service_role;


-- Insights: aggregate at the database rather than sending every review,
-- session, event, note and card to the browser. The response is bounded to
-- 90 daily buckets, 28 checkpoint buckets, three confidence rows, and one
-- row per subject regardless of the number of historical reviews.
-- All dates use the owner's configured study-day rollover.
create index if not exists st5_reviews_owner_time
  on public.reviews(user_id, reviewed_at desc) where undone_at is null;
create index if not exists st5_sessions_owner_time
  on public.sessions(user_id, started_at desc) where state = 'ended';
create index if not exists st5_events_owner_time
  on public.session_events(user_id, created_at desc)
  where kind in ('evidence','recheck') and outcome is not null;

create or replace function public.insights(p_days integer default 30)
returns jsonb
language sql stable security invoker set search_path = ''
as $$
with prefs as (
  select s.user_id, s.time_zone, s.rollover_hour,
    ((now() at time zone s.time_zone)
      - make_interval(hours => s.rollover_hour))::date as today,
    least(greatest(coalesce(p_days,30),1),90) as days
  from public.settings s
  where s.user_id = (select auth.uid())
),
calendar as (
  select d.day::date as day
  from prefs p
  cross join lateral generate_series(
    p.today - (p.days - 1), p.today, interval '1 day'
  ) as d(day)
),
review_rows as (
  select r.rating, r.confidence,
    ((r.reviewed_at at time zone p.time_zone)
      - make_interval(hours => p.rollover_hour))::date as day
  from public.reviews r
  cross join prefs p
  where r.user_id = p.user_id and r.undone_at is null
    and r.reviewed_at <= now()
    and r.reviewed_at >= ((p.today - (p.days - 1))::timestamp
      + make_interval(hours => p.rollover_hour)) at time zone p.time_zone
),
daily_reviews as (
  select d.day, count(r.rating)::integer as total,
    count(*) filter (where r.rating = 1)::integer as again,
    count(*) filter (where r.rating = 2)::integer as hard,
    count(*) filter (where r.rating = 3)::integer as good,
    count(*) filter (where r.rating = 4)::integer as easy,
    count(*) filter (where r.rating > 1)::integer as right_count
  from calendar d
  left join review_rows r on r.day = d.day
  group by d.day
),
confidence_counts as (
  select x.confidence, count(r.rating)::integer as total,
    count(*) filter (where r.rating > 1)::integer as right_count
  from (values ('sure'),('unsure'),('guess')) as x(confidence)
  left join review_rows r on r.confidence = x.confidence
  group by x.confidence
),
session_rows as (
  select s.project_id, coalesce(s.minutes,0) as minutes
  from public.sessions s
  cross join prefs p
  where s.user_id = p.user_id and s.state = 'ended'
    and s.started_at <= now()
    and s.started_at >= ((p.today - (p.days - 1))::timestamp
      + make_interval(hours => p.rollover_hour)) at time zone p.time_zone
),
subject_minutes as (
  select sub.id, sub.name, sub.glyph, sub.hue, sub.position,
    sum(sess.minutes)::integer as minutes
  from session_rows sess
  join public.projects pr on pr.id = sess.project_id
    and pr.user_id = (select auth.uid())
  join public.subjects sub on sub.id = pr.subject_id
    and sub.user_id = pr.user_id
  group by sub.id, sub.name, sub.glyph, sub.hue, sub.position
),
checkpoint_days as (
  select d.day,
    count(*) filter (
      where e.kind = 'evidence' and e.outcome = 'demonstrated'
    )::integer as demonstrated,
    count(*) filter (
      where e.kind = 'recheck' and e.outcome is not null
    )::integer as rechecked
  from (
    select (p.today - n)::date as day
    from prefs p cross join generate_series(0,27) as n
  ) d
  left join (
    select e.kind, e.outcome,
      ((e.created_at at time zone p.time_zone)
        - make_interval(hours => p.rollover_hour))::date as day
    from public.session_events e
    cross join prefs p
    where e.user_id = p.user_id
      and e.kind in ('evidence','recheck') and e.outcome is not null
      and e.created_at <= now()
      and e.created_at >= ((p.today - 27)::timestamp
        + make_interval(hours => p.rollover_hour)) at time zone p.time_zone
  ) e on e.day = d.day
  group by d.day
),
top_misconception as (
  select jsonb_build_object(
    'label', m.label, 'times', m.times, 'conceptName', c.name
  ) as item
  from public.misconceptions m
  left join public.concepts c on c.id = m.concept_id
    and c.user_id = m.user_id
  where m.user_id = (select auth.uid())
  order by m.times desc, m.label, m.id
  limit 1
)
select jsonb_build_object(
  'days', p.days,
  'reviews', (select count(*)::integer from review_rows),
  'right', (select count(*)::integer from review_rows where rating > 1),
  'reviewDays', (select coalesce(jsonb_agg(jsonb_build_object(
    'date', d.day, 'count', d.total, 'again', d.again, 'hard', d.hard,
    'good', d.good, 'easy', d.easy, 'right', d.right_count
  ) order by d.day), '[]'::jsonb) from daily_reviews d),
  'calibration', (select coalesce(jsonb_agg(jsonb_build_object(
    'confidence', c.confidence, 'total', c.total, 'right', c.right_count
  ) order by case c.confidence when 'sure' then 0 when 'unsure' then 1 else 2 end),
    '[]'::jsonb) from confidence_counts c),
  'sessions', (select count(*)::integer from session_rows),
  'minutes', (select coalesce(sum(minutes),0)::integer from session_rows),
  'typicalSession', (select percentile_cont(0.5)
    within group (order by minutes) from session_rows),
  'subjectMinutes', (select coalesce(jsonb_agg(jsonb_build_object(
    'subject', jsonb_build_object(
      'id', s.id, 'name', s.name, 'glyph', s.glyph, 'hue', s.hue,
      'position', s.position
    ), 'minutes', s.minutes
  ) order by s.minutes desc, s.name), '[]'::jsonb) from subject_minutes s),
  'checkpointDays', (select coalesce(jsonb_agg(jsonb_build_object(
    'date', d.day, 'demonstrated', d.demonstrated, 'rechecked', d.rechecked
  ) order by d.day), '[]'::jsonb) from checkpoint_days d),
  'mostRevisited', (select item from top_misconception)
)
from prefs p;
$$;
revoke all on function public.insights(integer) from public, anon;
grant execute on function public.insights(integer) to authenticated, service_role;


-- ST-5/D6: filter before pagination, so pages never contain sparse results
-- or leak other owners' cards. The legacy search_cards_page RPC remains intact.
create index if not exists st5_notes_owner_checkpoint
  on public.notes(user_id, checkpoint_id);
create index if not exists st5_cards_note_state
  on public.cards(note_id, state);

create or replace function public.search_cards_filtered_page(
  p_query text default '',
  p_slug text default null,
  p_checkpoint text default null,
  p_state integer default null,
  p_note_status text default null,
  p_has_open_comments boolean default null,
  p_offset integer default 0
)
returns setof jsonb
language sql stable security invoker set search_path = ''
as $$
  select jsonb_build_object(
    'noteNo', n.no,
    'front', n.front,
    'type', n.type,
    'kind', n.kind,
    'projectSlug', p.slug,
    'glyph', coalesce(s.glyph, '∫'),
    'checkpointCode', cp.code,
    'due', (select min(c.due) from public.cards c
            where c.note_id = n.id and c.user_id = n.user_id),
    'status', n.status,
    'openComments', (select count(*)::integer from public.card_comments cc
                     where cc.note_id = n.id and cc.user_id = n.user_id
                       and cc.status = 'open')
  )
  from public.notes n
  join public.projects p on p.id = n.project_id and p.user_id = n.user_id
  left join public.subjects s on s.id = p.subject_id and s.user_id = n.user_id
  left join public.checkpoints cp on cp.id = n.checkpoint_id and cp.user_id = n.user_id
  where n.user_id = (select auth.uid())
    and (p_slug is null or p.slug = p_slug)
    and (p_checkpoint is null or cp.code = p_checkpoint)
    and (p_note_status is null or n.status = p_note_status)
    and (p_state is null or exists (
      select 1 from public.cards c
      where c.note_id = n.id and c.user_id = n.user_id and c.state = p_state
    ))
    and (p_has_open_comments is null or p_has_open_comments = exists (
      select 1 from public.card_comments cc
      where cc.note_id = n.id and cc.user_id = n.user_id and cc.status = 'open'
    ))
    and (
      nullif(btrim(p_query), '') is null
      or strpos(lower(n.front), lower(btrim(p_query))) > 0
      or strpos(lower(n.back), lower(btrim(p_query))) > 0
    )
  order by n.no desc
  limit 50 offset greatest(coalesce(p_offset, 0), 0);
$$;
revoke all on function public.search_cards_filtered_page(text,text,text,integer,text,boolean,integer) from public, anon;
grant execute on function public.search_cards_filtered_page(text,text,text,integer,text,boolean,integer) to authenticated, service_role;


-- ST-5/E1: the Review screen must not download all cards, notes, historical
-- reviews, sessions, concepts and sources to build a capped daily queue.
-- Apply daily quotas and sibling deduplication before joining card bodies.
-- Optional deck/session/concept filters are applied *after* the daily quota,
-- matching the existing dueToday + filterReviewItems contract.
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
    'cardId', c.id, 'noteId', n.id, 'noteNo', n.no, 'ord', c.ord,
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
  left join public.concepts concept on concept.id = n.concept_id and concept.user_id = n.user_id
  where (p_new_only is not true or c.state = 0)
    and (p_include_new is not false or c.state <> 0)
    and (p_session_id is null or n.session_id = p_session_id)
    and (p_concept_slug is null or concept.slug = p_concept_slug)
    and (coalesce(cardinality(p_decks), 0) = 0
      or 'project:' || p.slug = any(p_decks)
      or 'cp:' || p.slug || ':' || cp.code = any(p_decks))
  order by sel.review_seq;
$$;
revoke all on function public.review_items(text[],uuid,text,boolean,boolean) from public, anon;
grant execute on function public.review_items(text[],uuid,text,boolean,boolean) to authenticated, service_role;
