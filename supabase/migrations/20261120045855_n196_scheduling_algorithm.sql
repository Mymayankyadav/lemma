-- An unset preference follows the current release default. Older settings
-- clients can keep updating their planning JSON without changing this choice.
alter table public.settings
  add column scheduling_algorithm text
  check (scheduling_algorithm in ('new', 'legacy'));
