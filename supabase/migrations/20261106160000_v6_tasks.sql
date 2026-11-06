-- N21: additive, owner-scoped v6 task backlog. The table is not yet wired to UI/MCP.
-- A due date is a civil date; a due instant is an absolute timestamp. Never silently
-- treat either as the other (the due_kind check enforces one and only one).
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (length(btrim(title)) > 0),
  body text not null default '',
  subject_id uuid,
  project_id uuid,
  checkpoint_id uuid,
  estimate_minutes integer check (estimate_minutes is null or estimate_minutes >= 0),
  priority text not null default 'normal' check (priority in ('low','normal','high')),
  due_kind text not null default 'none' check (due_kind in ('none','date','instant')),
  due_date date,
  due_at timestamptz,
  position integer not null default 0,
  status text not null default 'backlog'
    check (status in ('backlog','in_progress','completed','cancelled')),
  completed_at timestamptz,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id,id),
  foreign key (user_id,subject_id) references public.subjects(user_id,id),
  foreign key (user_id,project_id) references public.projects(user_id,id),
  foreign key (user_id,checkpoint_id) references public.checkpoints(user_id,id),
  constraint tasks_due_kind_matches_value check (
    (due_kind='none' and due_date is null and due_at is null) or
    (due_kind='date' and due_date is not null and due_at is null) or
    (due_kind='instant' and due_date is null and due_at is not null)
  ),
  constraint tasks_completion_consistent check (
    (status='completed') = (completed_at is not null)
  )
);

create index tasks_owner_status_position on public.tasks (user_id,status,position);
alter table public.tasks enable row level security;
create policy tasks_owner_select on public.tasks for select to authenticated
  using (user_id = (select auth.uid()));
create policy tasks_owner_insert on public.tasks for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy tasks_owner_update on public.tasks for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy tasks_owner_delete on public.tasks for delete to authenticated
  using (user_id = (select auth.uid()));
grant select,insert,update,delete on public.tasks to authenticated;
