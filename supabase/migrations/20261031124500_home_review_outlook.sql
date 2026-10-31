-- FIX-484b: one bounded, owner-scoped read supplies the Today due-deck
-- breakdown and seven-day forecast. No browser-side notes/cards table scans.
-- The existing deck_tree() RPC enforces the review quota and owner RLS.
create or replace function public.home_review_outlook()
returns jsonb
language sql stable security invoker set search_path = ''
as $$
  with prefs as (
    select s.user_id, s.time_zone, s.rollover_hour,
      ((now() at time zone s.time_zone)
       - make_interval(hours => s.rollover_hour))::date as today
    from public.settings s
    where s.user_id = (select auth.uid())
  ),
  calendar as (
    select (p.today + n)::date as day
    from prefs p cross join generate_series(0,6) n
  ),
  scheduled as (
    select greatest(
      p.today,
      ((c.due at time zone p.time_zone)
       - make_interval(hours => p.rollover_hour))::date
    ) as day
    from public.cards c
    join public.notes n on n.id = c.note_id and n.user_id = c.user_id
    join public.projects pr on pr.id = n.project_id and pr.user_id = n.user_id
    cross join prefs p
    where c.user_id = p.user_id
      and n.status = 'active'
      and pr.status <> 'archived' and pr.system = false
      and c.state <> 0 and c.due is not null
      and c.due < ((p.today + 7)::timestamp
        + make_interval(hours => p.rollover_hour)) at time zone p.time_zone
  ),
  counts as (
    select day, count(*)::integer as due
    from scheduled group by day
  )
  select jsonb_build_object(
    'decks', (select coalesce(jsonb_agg(item order by ordinal), '[]'::jsonb)
      from public.deck_tree() with ordinality as d(item,ordinal)),
    'forecast', (select coalesce(jsonb_agg(jsonb_build_object(
      'day', d.day, 'due', coalesce(c.due,0)
    ) order by d.day), '[]'::jsonb)
      from calendar d left join counts c on c.day = d.day)
  );
$$;
revoke all on function public.home_review_outlook() from public, anon;
grant execute on function public.home_review_outlook() to authenticated, service_role;

comment on function public.home_review_outlook() is
 'Bounded owner-scoped due-deck tree and seven-day forecast for Today, without transferring cards or reviews.';
