-- N42.1: additive owner-scoped deadlines and milestone records.
-- D8(b) command lifecycle, read-only project/checkpoint projections, registry,
-- undo and MCP parity are implemented by N42.2.
create table public.deadlines (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null constraint deadlines_title_valid
    check (pg_catalog.length(pg_catalog.btrim(title)) between 1 and 160),
  kind text not null constraint deadlines_kind_valid
    check (kind in ('exam','seminar','assignment','milestone','other')),
  due_kind text not null constraint deadlines_due_kind_valid
    check (due_kind in ('date','instant')),
  due_date date,
  due_at timestamptz,
  subject_id uuid,
  project_id uuid,
  checkpoint_id uuid,
  remaining_minutes integer,
  estimate_source text,
  status text not null default 'open'
    constraint deadlines_status_valid check (status in ('open','done','cancelled')),
  version integer not null default 1
    constraint deadlines_version_valid check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source text not null default 'app'
    constraint deadlines_source_valid check (source in ('app','mcp','worker')),
  unique (user_id,id),
  constraint deadlines_due_exclusive check (
    (due_kind='date' and due_date is not null and due_at is null) or
    (due_kind='instant' and due_date is null and due_at is not null)
  ),
  constraint deadlines_estimate_consistent check (
    (remaining_minutes is null and estimate_source is null) or
    (remaining_minutes is not null and remaining_minutes between 0 and 100000
      and estimate_source is not null and estimate_source in ('owner','derived'))
  ),
  foreign key (user_id,subject_id) references public.subjects(user_id,id)
    deferrable initially immediate,
  foreign key (user_id,project_id) references public.projects(user_id,id)
    deferrable initially immediate,
  foreign key (user_id,checkpoint_id) references public.checkpoints(user_id,id)
    deferrable initially immediate
);
create index deadlines_owner_date on public.deadlines(user_id,status,due_date,id)
  where due_kind='date';
create index deadlines_owner_instant on public.deadlines(user_id,status,due_at,id)
  where due_kind='instant';
alter table public.deadlines enable row level security;
create policy deadlines_owner on public.deadlines for all to authenticated
  using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
grant select,insert,update,delete on public.deadlines to authenticated,service_role;
create trigger deadlines_touch_updated_at before update on public.deadlines
  for each row execute function public.lemma_touch_updated_at();
create trigger deadlines_log_change after insert or update or delete on public.deadlines
  for each row execute function public.log_change();
