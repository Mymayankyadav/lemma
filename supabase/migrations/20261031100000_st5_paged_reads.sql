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
