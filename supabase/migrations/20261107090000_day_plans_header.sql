-- N46.1: owner-scoped dated plan header. N46.2 supplies children, journal,
-- version-checked commit/close/reopen commands and MCP/undo registration.
create table public.day_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  plan_date date not null,
  time_zone text not null check (char_length(btrim(time_zone)) between 1 and 80),
  intention text not null default '' check (char_length(intention) <= 1200),
  capacity_minutes integer not null default 0 check (capacity_minutes between 0 and 1440),
  availability jsonb not null default '{"sources":[]}'::jsonb
    check (jsonb_typeof(availability)='object'
      and coalesce(jsonb_typeof(availability -> 'sources')='array',false)),
  status text not null default 'draft'
    check (status in ('draft','previewed','committed','closed')),
  closed_at timestamptz,
  tomorrow_first_task_id uuid,
  ritual jsonb not null default '{}'::jsonb check (jsonb_typeof(ritual)='object'),
  version integer not null default 1 check (version>0),
  source text not null default 'app' check (source in ('app','mcp','worker')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id,id),
  constraint day_plans_one_per_owner_date unique (user_id,plan_date),
  constraint day_plans_closed_consistent check (
    (status='closed' and closed_at is not null) or
    (status<>'closed' and closed_at is null)
  ),
  constraint day_plans_tomorrow_task_owner_fk
    foreign key (user_id,tomorrow_first_task_id) references public.tasks(user_id,id)
    deferrable initially immediate
);
create index day_plans_owner_status_date on public.day_plans
  (user_id,status,plan_date,id);
alter table public.day_plans enable row level security;
-- Read-only staged schema: default Supabase DML grants must not bypass
-- command receipts, audit and undo which N46.2 installs together.
create policy day_plans_owner_select on public.day_plans for select
  to authenticated using (user_id=(select auth.uid()));
grant select on public.day_plans to authenticated;
