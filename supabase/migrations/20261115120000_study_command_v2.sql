-- N51: additive columns for saved-study correction and task-linked blocks.
-- The complete audited command is appended in the same unmerged migration.
alter table public.study_entries
  add column approximate boolean not null default false,
  add column voided_at timestamptz;
alter table public.calendar_blocks add column task_id uuid;
alter table public.calendar_blocks add constraint calendar_blocks_task_owner_fk
  foreign key(user_id,task_id) references public.tasks(user_id,id)
  deferrable initially immediate;
create index calendar_blocks_owner_task on public.calendar_blocks(user_id,task_id)
  where task_id is not null;
