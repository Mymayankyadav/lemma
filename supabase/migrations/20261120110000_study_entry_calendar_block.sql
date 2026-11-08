-- N106: optional owner-composite calendar-block link on a study entry.
-- Existing drafts/saved timers remain valid with a NULL association.
create unique index if not exists calendar_blocks_user_id_id_unique
 on public.calendar_blocks(user_id,id);
alter table public.study_entries
 add column calendar_block_id uuid,
 add constraint study_entries_calendar_block_owner_fk
  foreign key(user_id,calendar_block_id)
  references public.calendar_blocks(user_id,id)
  on delete set null (calendar_block_id)
  deferrable initially immediate;
create index study_entries_owner_calendar_block
 on public.study_entries(user_id,calendar_block_id)
 where calendar_block_id is not null;
