-- N46.2.1: safe staged day-plan child records. N46.2.2 installs audited
-- preview/commit/closure commands, undo and MCP before client writes.
-- The existing calendar_blocks table has a globally unique id but did not
-- expose an owner+id unique key for a composite foreign key.
create unique index calendar_blocks_owner_id_day_plan_items_fk
  on public.calendar_blocks(user_id,id);

create table public.day_plan_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  plan_id uuid not null,
  task_id uuid not null,
  calendar_block_id uuid,
  disposition text not null default 'unplaced'
    constraint day_plan_items_disposition_check
    check (disposition in ('placed','unplaced','carried_over')),
  reason text constraint day_plan_items_reason_check
    check (reason is null or char_length(reason) <= 1200),
  position integer not null constraint day_plan_items_position_check
    check (position between 0 and 999999),
  version integer not null default 1 constraint day_plan_items_version_check
    check (version > 0),
  source text not null default 'app' constraint day_plan_items_source_check
    check (source in ('app','mcp','worker')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id,id),
  constraint day_plan_items_owner_position unique (user_id,plan_id,position),
  constraint day_plan_items_plan_owner_fk
    foreign key (user_id,plan_id) references public.day_plans(user_id,id)
    on delete no action deferrable initially immediate,
  constraint day_plan_items_task_owner_fk
    foreign key (user_id,task_id) references public.tasks(user_id,id)
    deferrable initially immediate,
  constraint day_plan_items_block_owner_fk
    foreign key (user_id,calendar_block_id)
    references public.calendar_blocks(user_id,id)
    on delete no action deferrable initially immediate
);
create index day_plan_items_owner_task on public.day_plan_items
  (user_id,task_id,plan_id);
alter table public.day_plan_items enable row level security;
-- Do not give authenticated roles INSERT/UPDATE/DELETE policies: an item
-- must not change without N46.2.2's receipt, action journal and undo.
create policy day_plan_items_owner_select on public.day_plan_items
  for select to authenticated using (user_id=(select auth.uid()));
grant select on public.day_plan_items to authenticated;
