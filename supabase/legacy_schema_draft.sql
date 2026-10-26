-- Lemma schema 0.5 (to be applied to the NEW Lemma Supabase project, never Carrel).
-- Development migration draft. Phase 2 wiring/integration tests are not completed yet.
-- Never distribute secret/service_role keys. Frontend always uses a publishable key + RLS.

create table if not exists public.notes (
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  id text not null,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  deck text generated always as (data->>'deck') stored,
  modified bigint generated always as ((data->>'modified')::bigint) stored,
  deleted boolean not null default false,
  revision bigint not null default 1,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists notes_user_updated on public.notes(user_id, updated_at, id);

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  revision bigint not null default 1,
  updated_at timestamptz not null default now()
);

-- Canonical idempotent review events will eventually replace concurrent overwrites
-- of embedded notes[].log. Existing log representation remains compatible.
create table if not exists public.review_events (
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  event_id uuid not null,
  note_id text not null,
  ordinal text not null,
  occurred_at bigint not null,
  grade smallint not null check (grade between 1 and 4),
  state_before smallint not null check (state_before between 0 and 3),
  duration_ms integer not null default 0,
  kind smallint not null default 0,
  device_id text,
  recorded_at timestamptz not null default now(),
  primary key (user_id, event_id),
  foreign key (user_id, note_id) references public.notes(user_id, id)
);
create index if not exists reviews_note_time on public.review_events(user_id, note_id, occurred_at);

-- Source references and extracted sections are PRIVATE per user.
create table if not exists public.learning_sources (
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  id uuid not null,
  title text not null,
  source_type text not null check (source_type in ('book','class_notes','paper','web','manual')),
  citation jsonb not null default '{}'::jsonb,
  storage_path text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create table if not exists public.learning_sections (
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  id uuid not null,
  source_id uuid not null,
  locator text not null,
  title text not null default '',
  text_content text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, source_id) references public.learning_sources(user_id, id) on delete cascade
);
create index if not exists sections_source on public.learning_sections(user_id, source_id);

create table if not exists public.study_plans (
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  id uuid not null,
  title text not null,
  objective text not null default '',
  plan jsonb not null default '{}'::jsonb,
  revision bigint not null default 1,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create table if not exists public.learning_sessions (
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  id uuid not null,
  plan_id uuid,
  topic text not null,
  state text not null default 'active' check (state in ('active','paused','completed')),
  current_objective text not null default '',
  progress jsonb not null default '{}'::jsonb,
  revision bigint not null default 1,
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, plan_id) references public.study_plans(user_id, id)
);

-- Append-only events allow reconstruction without trusting a lossy prose summary.
create table if not exists public.learning_events (
  seq bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  event_id uuid not null,
  session_id uuid not null,
  event_type text not null check (event_type in (
    'objective','question','attempt','hint','feedback','misconception','proof_step',
    'mastery_evidence','source_read','flashcard_link','session_note')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, event_id),
  foreign key (user_id, session_id) references public.learning_sessions(user_id, id)
);
create index if not exists events_session_seq on public.learning_events(user_id, session_id, seq);

create table if not exists public.tutor_handoffs (
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  session_id uuid not null,
  revision bigint not null default 1,
  from_model text,
  summary jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, session_id),
  foreign key (user_id, session_id) references public.learning_sessions(user_id, id) on delete cascade
);
create table if not exists public.learning_card_links (
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  note_id text not null,
  session_id uuid not null,
  relation text not null check (relation in ('learned','misconception','generated','reviewed')),
  metadata jsonb not null default '{}'::jsonb,
  primary key (user_id, note_id, session_id, relation),
  foreign key (user_id, note_id) references public.notes(user_id, id),
  foreign key (user_id, session_id) references public.learning_sessions(user_id, id)
);

create or replace function public.lemma_touch_updated_at()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin new.updated_at := clock_timestamp(); return new; end;
$$;
revoke all on function public.lemma_touch_updated_at() from public;

do $$
declare t text;
begin
  foreach t in array array['notes','profiles','learning_sources','learning_sections','study_plans',
    'learning_sessions','tutor_handoffs'] loop
    execute format('drop trigger if exists lemma_touch on public.%I', t);
    execute format('create trigger lemma_touch before update on public.%I for each row execute function public.lemma_touch_updated_at()', t);
  end loop;
end $$;

-- All tables are private. Use user-scoped RLS even when accessed from a client SDK.
do $$
declare t text;
begin
  foreach t in array array['notes','profiles','review_events','learning_sources','learning_sections',
    'study_plans','learning_sessions','learning_events','tutor_handoffs','learning_card_links'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists lemma_owner on public.%I', t);
    execute format('create policy lemma_owner on public.%I for all to authenticated '
      || 'using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- Phase 2 uses Postgres Changes for low-volume single-user realtime syncing.
-- Supabase currently recommends Broadcast for greater scale; can migrate later.
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['notes','profiles','review_events','learning_events',
      'learning_sessions','tutor_handoffs'] loop
      if not exists (
        select 1 from pg_publication_tables where pubname = 'supabase_realtime'
        and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
