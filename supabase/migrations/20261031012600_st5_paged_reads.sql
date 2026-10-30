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
    'sourceTitles', src.titles
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
    select coalesce(jsonb_agg(item order by item->>'lastActivityAt' desc nulls last, item->>'id'), '[]'::jsonb) as items
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
