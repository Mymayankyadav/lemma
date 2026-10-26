
create table public.notes (
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 id text not null check (length(id) between 1 and 256),
 data jsonb not null check (jsonb_typeof(data)='object'),
 deleted_at timestamptz,
 revision bigint not null default 1 check (revision>0),
 updated_at timestamptz not null default clock_timestamp(),
 primary key(user_id,id)
);
create index notes_changed_idx on public.notes(user_id,updated_at,id);
create table public.profiles (
 user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
 data jsonb not null default '{}'::jsonb check (jsonb_typeof(data)='object'),
 revision bigint not null default 1 check (revision>0),
 updated_at timestamptz not null default clock_timestamp()
);
create table public.review_events (
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 event_id uuid not null,
 note_id text not null,
 ordinal integer not null check (ordinal>=0),
 occurred_at_ms bigint not null check (occurred_at_ms>0),
 grade smallint not null check (grade between 1 and 4),
 state_before smallint not null check (state_before between 0 and 3),
 duration_ms integer not null default 0 check (duration_ms>=0),
 kind smallint not null default 0 check (kind in (0,1)),
 device_id text,
 recorded_at timestamptz not null default clock_timestamp(),
 primary key(user_id,event_id),
 foreign key(user_id,note_id) references public.notes(user_id,id)
);
create index reviews_by_note_idx on public.review_events(user_id,note_id,occurred_at_ms,event_id);
create index reviews_added_idx on public.review_events(user_id,recorded_at,event_id);
create table public.learning_sources (
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 id uuid not null default gen_random_uuid(),
 title text not null check (length(title)>0),
 source_type text not null check(source_type in ('book','class_notes','paper','web','manual')),
 citation jsonb not null default '{}'::jsonb,
 storage_path text,
 metadata jsonb not null default '{}'::jsonb,
 updated_at timestamptz not null default clock_timestamp(),
 primary key(user_id,id)
);
create table public.learning_sections (
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 id uuid not null default gen_random_uuid(),
 source_id uuid not null,
 locator text not null,
 title text not null default '',
 text_content text not null default '',
 metadata jsonb not null default '{}'::jsonb,
 updated_at timestamptz not null default clock_timestamp(),
 primary key(user_id,id),
 foreign key(user_id,source_id) references public.learning_sources(user_id,id) on delete cascade
);
create index source_sections_idx on public.learning_sections(user_id,source_id,locator);
create table public.learning_card_links (
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 note_id text not null,
 session_id uuid not null,
 relation text not null check(relation in ('learned','misconception','generated','reviewed')),
 metadata jsonb not null default '{}'::jsonb,
 primary key(user_id,note_id,session_id,relation),
 foreign key(user_id,note_id) references public.notes(user_id,id),
 foreign key(user_id,session_id) references public.learning_sessions(user_id,id)
);
do $$
declare t text;
begin
 foreach t in array array['notes','profiles','review_events','learning_sources','learning_sections','learning_card_links'] loop
   execute format('alter table public.%I enable row level security',t);
   execute format('revoke all on public.%I from anon, authenticated',t);
 end loop;
 foreach t in array array['notes','profiles','learning_sources','learning_sections','learning_card_links'] loop
  execute format('grant select,insert,update,delete on public.%I to authenticated',t);
  execute format('create policy owner_select on public.%I for select to authenticated using (user_id=(select auth.uid()))',t);
  execute format('create policy owner_insert on public.%I for insert to authenticated with check(user_id=(select auth.uid()))',t);
  execute format('create policy owner_update on public.%I for update to authenticated using (user_id=(select auth.uid())) with check(user_id=(select auth.uid()))',t);
  execute format('create policy owner_delete on public.%I for delete to authenticated using (user_id=(select auth.uid()))',t);
 end loop;
end $$;
grant select,insert on public.review_events to authenticated;
create policy reviews_read on public.review_events for select to authenticated using(user_id=(select auth.uid()));
create policy reviews_append on public.review_events for insert to authenticated with check(user_id=(select auth.uid()));
-- Immutable ledger, including through privileged roles unless trigger itself is intentionally removed.
create function public.lemma_reject_review_changes() returns trigger
language plpgsql security invoker set search_path='' as $$
begin raise exception 'review_events are immutable'; end;
$$;
revoke all on function public.lemma_reject_review_changes() from public,anon,authenticated;
create trigger review_events_no_update before update or delete on public.review_events
for each row execute function public.lemma_reject_review_changes();
-- A realtime message is a hint to refresh; clients MUST also pull on resume/reconnect.
do $$
declare t text;
begin
 if exists (select 1 from pg_publication where pubname='supabase_realtime') then
  foreach t in array array['notes','profiles','review_events','study_plans','study_plan_versions',
      'study_checkpoints','learning_events','learning_sessions','tutor_handoffs'] loop
   if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
    execute format('alter publication supabase_realtime add table public.%I',t);
   end if;
  end loop;
 end if;
end $$;

