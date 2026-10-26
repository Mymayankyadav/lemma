-- Mirrored from applied migration 20261026085028 (initial_learning_state).
-- Supabase project: yemqnhnztlbyxmjxidis
create table if not exists public.study_plans (
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 id uuid not null default gen_random_uuid(), title text not null, objective text not null default '',
 plan jsonb not null default '{}'::jsonb, revision bigint not null default 1,
 updated_at timestamptz not null default now(), primary key(user_id,id)
);
create table if not exists public.learning_sessions (
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 id uuid not null default gen_random_uuid(), plan_id uuid, topic text not null,
 state text not null default 'active' check(state in ('active','paused','completed')),
 current_objective text not null default '', progress jsonb not null default '{}'::jsonb,
 revision bigint not null default 1, updated_at timestamptz not null default now(),
 primary key(user_id,id),
 foreign key(user_id,plan_id) references public.study_plans(user_id,id)
);
create table if not exists public.learning_events (
 seq bigint generated always as identity primary key,
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 event_id uuid not null default gen_random_uuid(), session_id uuid not null,
 event_type text not null check(event_type in ('objective','question','attempt','hint','feedback','misconception','proof_step','mastery_evidence','source_read','flashcard_link','session_note')),
 payload jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(),
 unique(user_id,event_id), foreign key(user_id,session_id) references public.learning_sessions(user_id,id)
);
create index if not exists learning_events_session_idx on public.learning_events(user_id,session_id,seq);
create table if not exists public.tutor_handoffs (
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 session_id uuid not null, revision bigint not null default 1,
 from_model text, summary jsonb not null default '{}'::jsonb,
 updated_at timestamptz not null default now(),
 primary key(user_id,session_id),
 foreign key(user_id,session_id) references public.learning_sessions(user_id,id) on delete cascade
);
do $$ declare t text; begin
 foreach t in array array['study_plans','learning_sessions','learning_events','tutor_handoffs'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('create policy lemma_owner on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',t);
 end loop;
end $$;
