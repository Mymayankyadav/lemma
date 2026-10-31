-- FIX #475: count tutor transcriptions in PostgreSQL instead of fetching
-- every source_pages row (300,000 rows / 301 requests in profile X).
-- Security invoker + auth.uid() + source/page user_id equality preserve RLS.
create index if not exists source_pages_transcribed_owner_source
  on public.source_pages(user_id, source_id)
  where transcribed_at is not null;

create or replace function public.source_transcription_stats(p_project_id uuid)
returns table(source_id uuid, transcribed integer, needs_check integer)
language sql stable security invoker set search_path = ''
as $$
  select s.id as source_id,
         count(sp.page)::integer as transcribed,
         count(sp.page) filter (where sp.confidence = 'check')::integer as needs_check
  from public.sources s
  left join public.source_pages sp
    on sp.user_id = s.user_id
   and sp.source_id = s.id
   and sp.transcribed_at is not null
  where s.user_id = (select auth.uid())
    and s.project_id = p_project_id
  group by s.id
  order by s.id;
$$;

revoke all on function public.source_transcription_stats(uuid) from public, anon;
grant execute on function public.source_transcription_stats(uuid) to authenticated, service_role;

comment on function public.source_transcription_stats(uuid) is
  'One owner-scoped row per project source; includes zero-count sources and never transfers page text or provenance rows.';
