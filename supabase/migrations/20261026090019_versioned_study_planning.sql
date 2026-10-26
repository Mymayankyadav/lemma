-- Mirrored from applied migration 20261026090019 (versioned_study_planning).
-- Supabase project: yemqnhnztlbyxmjxidis
create table public.study_context_files (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  title text not null,
  context_markdown text not null default '',
  source_refs jsonb not null default '[]'::jsonb,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create table public.study_plan_versions (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  plan_id uuid not null,
  revision bigint not null check (revision > 0),
  context_id uuid,
  context_revision bigint,
  snapshot jsonb not null,
  creation_kind text not null default 'amendment' check (creation_kind in ('initial','amendment','restore')),
  change_summary text not null default '',
  author_model text,
  created_at timestamptz not null default now(),
  primary key (user_id, plan_id, revision),
  foreign key (user_id, plan_id) references public.study_plans(user_id, id) on delete cascade,
  foreign key (user_id, context_id) references public.study_context_files(user_id, id)
);
create table public.study_checkpoints (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  plan_id uuid not null,
  checkpoint_id text not null check (length(checkpoint_id) between 1 and 160),
  title text not null,
  status text not null default 'not_started' check (status in ('not_started','in_progress','blocked','demonstrated','review_due','needs_reassessment')),
  last_evidence_event_id uuid,
  progress_details jsonb not null default '{}'::jsonb,
  plan_revision bigint not null default 1 check (plan_revision > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, plan_id, checkpoint_id),
  foreign key (user_id, plan_id) references public.study_plans(user_id, id) on delete cascade,
  foreign key (user_id, last_evidence_event_id) references public.learning_events(user_id, event_id)
);
create index study_checkpoints_by_status_idx on public.study_checkpoints(user_id, plan_id, status);
alter table public.study_context_files enable row level security;
alter table public.study_plan_versions enable row level security;
alter table public.study_checkpoints enable row level security;
revoke all on public.study_context_files, public.study_plan_versions, public.study_checkpoints from anon, authenticated;
grant select, insert, update, delete on public.study_context_files to authenticated;
grant select, insert on public.study_plan_versions to authenticated;
grant select, insert, update, delete on public.study_checkpoints to authenticated;
create policy contexts_select_own on public.study_context_files for select to authenticated using (user_id = (select auth.uid()));
create policy contexts_insert_own on public.study_context_files for insert to authenticated with check (user_id = (select auth.uid()));
create policy contexts_update_own on public.study_context_files for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy contexts_delete_own on public.study_context_files for delete to authenticated using (user_id = (select auth.uid()));
create policy plan_versions_select_own on public.study_plan_versions for select to authenticated using (user_id = (select auth.uid()));
create policy plan_versions_insert_own on public.study_plan_versions for insert to authenticated with check (user_id = (select auth.uid()));
create policy checkpoints_select_own on public.study_checkpoints for select to authenticated using (user_id = (select auth.uid()));
create policy checkpoints_insert_own on public.study_checkpoints for insert to authenticated with check (user_id = (select auth.uid()));
create policy checkpoints_update_own on public.study_checkpoints for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy checkpoints_delete_own on public.study_checkpoints for delete to authenticated using (user_id = (select auth.uid()));
