-- A4a: record Undo as a new immutable fact; never delete an accepted review.
-- Existing review rows remain valid. Provenance is optional for legacy imports.
alter table public.review_events
  add column scheduling_provenance jsonb;
alter table public.review_events
  add constraint review_provenance_object_and_size check (
    scheduling_provenance is null
    or (jsonb_typeof(scheduling_provenance) = 'object'
        and octet_length(scheduling_provenance::text) <= 32768)
  );

create table public.review_retractions (
  user_id uuid not null default auth.uid(),
  retraction_id uuid not null,
  target_event_id uuid not null,
  reason text not null default 'undo' check (reason in ('undo','correction','reset')),
  recorded_at timestamptz not null default clock_timestamp(),
  primary key (user_id,retraction_id),
  unique (user_id,target_event_id),
  foreign key (user_id,target_event_id)
    references public.review_events(user_id,event_id) on delete restrict
);
create index review_retractions_by_target
  on public.review_retractions(user_id,target_event_id);
alter table public.review_retractions enable row level security;
revoke all on public.review_retractions from public,anon,authenticated;
grant select,insert on public.review_retractions to authenticated;
create policy retractions_select on public.review_retractions
  for select to authenticated using (user_id=(select auth.uid()));
create policy retractions_append on public.review_retractions
  for insert to authenticated with check (user_id=(select auth.uid()));

create function public.lemma_reject_retraction_changes() returns trigger
language plpgsql security invoker set search_path='' as $$
begin raise exception 'review_retractions are immutable'; end;
$$;
revoke all on function public.lemma_reject_retraction_changes()
  from public,anon,authenticated;
create trigger review_retractions_no_update
before update or delete on public.review_retractions
for each row execute function public.lemma_reject_retraction_changes();

do $$
begin
  if exists (select 1 from pg_publication where pubname='supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname='supabase_realtime'
        and schemaname='public' and tablename='review_retractions'
    )
  then
    alter publication supabase_realtime add table public.review_retractions;
  end if;
end $$;
