-- N41.1: additive owner-scoped activity preset records. N41.2 owns
-- presets_command lifecycle and registry activation; the bounds match N55's
-- shared app validation contract, including a nonnegative position.
create table public.presets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  label text not null constraint presets_label_valid
    check (length(btrim(label)) between 1 and 120),
  subject_id uuid,
  project_id uuid,
  checkpoint_id uuid,
  mode text not null default 'pomodoro'
    constraint presets_mode_valid check (mode in ('pomodoro','flowtime','open')),
  focus_minutes integer not null default 25
    constraint presets_focus_valid check (focus_minutes between 1 and 480),
  break_minutes integer not null default 5
    constraint presets_break_valid check (break_minutes between 1 and 180),
  long_break_minutes integer not null default 15
    constraint presets_long_break_valid check (long_break_minutes between 1 and 240),
  cycles integer not null default 4
    constraint presets_cycles_valid check (cycles between 1 and 24),
  position integer not null default 0
    constraint presets_position_valid check (position >= 0),
  archived_at timestamptz,
  version integer not null default 1 constraint presets_version_valid check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source text not null default 'app'
    constraint presets_source_valid check (source in ('app','mcp','worker')),
  unique(user_id,id),
  foreign key(user_id,subject_id) references public.subjects(user_id,id)
    deferrable initially immediate,
  foreign key(user_id,project_id) references public.projects(user_id,id)
    deferrable initially immediate,
  foreign key(user_id,checkpoint_id) references public.checkpoints(user_id,id)
    deferrable initially immediate
);
create index presets_owner_order on public.presets(user_id,archived_at,position,id);

alter table public.presets enable row level security;
create policy presets_owner on public.presets for all to authenticated
  using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
grant select,insert,update,delete on public.presets to authenticated,service_role;

-- Keep the existing action history format for all raw writes from day one.
-- The registry insert is intentionally deferred to N41.2, when the reviewed
-- command function exists. An inert metadata entry must not route to a
-- missing function or change the D7 registry-seed acceptance before N41.2.
create trigger presets_log_change after insert or update or delete on public.presets
  for each row execute function public.log_change();
create trigger presets_touch_updated_at before update on public.presets
  for each row execute function public.lemma_touch_updated_at();
