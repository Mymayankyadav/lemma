-- NOTIF-7a: additive one-shot Review N read. The ordinary review_items
-- RPC and its daily review cap are unchanged. No tables, grants or RLS
-- policies are modified; this function is read-only and security invoker.
-- Explicit owner filtering is retained at prefs, candidates and final joins.
create or replace function public.notification_review_items(
  p_count integer,
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
      -- Apply all requested filters before sibling selection, ranking,
      -- new-card quota and the final N bound. A post-LIMIT filter can
      -- otherwise return zero cards for a deck with five due cards.
      and (p_new_only is not true or c.state = 0)
      and (p_include_new is not false or c.state <> 0)
      and (p_session_id is null or n.session_id = p_session_id)
      and (p_concept_slug is null or exists (
        select 1 from public.concepts concept_filter
        where concept_filter.id = n.concept_id
          and concept_filter.user_id = n.user_id
          and concept_filter.slug = p_concept_slug
      ))
      and (coalesce(cardinality(p_decks), 0) = 0
        or 'project:' || p.slug = any(p_decks)
        or exists (
          select 1 from public.checkpoints cp_filter
          where cp_filter.id = n.checkpoint_id
            and cp_filter.user_id = n.user_id
            and 'cp:' || p.slug || ':' || cp_filter.code = any(p_decks)
        ))
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
    select q.* from quota q
    -- A notification explicitly requests a bounded one-shot round, not a
    -- persistent change to the owner's reviews_per_day setting. The earlier
    -- quota CTE still applies the separate new_per_day safety cap.
    where q.review_seq <= least(greatest(coalesce(p_count, 1), 1), 50)
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
  order by sel.review_seq;
$$;
revoke all on function public.notification_review_items(integer,text[],uuid,text,boolean,boolean) from public, anon;
grant execute on function public.notification_review_items(integer,text[],uuid,text,boolean,boolean) to authenticated, service_role;
