-- FIX #524: default Cards search excludes soft-deleted notes BEFORE paging.
-- Explicit note_status='deleted' remains available for deliberate inspection.
-- Replaces the same signature and preserves SECURITY INVOKER, RLS, and grants.
-- Rollback: reapply the original function definition from
-- 20261031012600_st5_paged_reads.sql (no table or data changes).
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
    and (n.status <> 'deleted' or p_note_status = 'deleted')
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

