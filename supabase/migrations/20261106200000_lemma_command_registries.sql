-- N36.1 / D8(a): registry seed. Commands and undo keep their existing
-- signatures/implementations until N36.2 installs the reviewed dispatcher.
-- Both registries are metadata only; no owner data is copied or updated.
create table public.lemma_undo_tables (
  table_name text primary key,
  constraint lemma_undo_tables_identifier check (table_name ~ '^[a-z_][a-z0-9_]*$')
);
alter table public.lemma_undo_tables enable row level security;
-- No owner SELECT/INSERT/UPDATE/DELETE policies: these security-definer
-- registry lookups are for reviewed database functions, not client writes.

insert into public.lemma_undo_tables (table_name) values
  ('settings'),
  ('subjects'),
  ('projects'),
  ('sources'),
  ('source_pages'),
  ('concepts'),
  ('concept_links'),
  ('checkpoints'),
  ('checkpoint_prereqs'),
  ('checkpoint_concepts'),
  ('styles'),
  ('sessions'),
  ('session_events'),
  ('misconceptions'),
  ('notes'),
  ('cards'),
  ('reviews'),
  ('card_comments'),
  ('proposals'),
  ('diagnostics'),
  ('study_entries'),
  ('study_intervals'),
  ('calendar_blocks'),
  ('tasks');

create table public.lemma_command_resources (
  resource text primary key,
  command_fn text not null,
  mcp_ok boolean not null default true,
  "schema" jsonb not null,
  constraint lemma_command_resource_identifier check (resource ~ '^[a-z_][a-z0-9_]*$'),
  constraint lemma_command_function_identifier check (command_fn ~ '^[a-z_][a-z0-9_]*$'),
  constraint lemma_command_schema_object check (jsonb_typeof("schema") = 'object')
);
alter table public.lemma_command_resources enable row level security;
-- N36.2 will resolve command_fn only from these registry rows and call it
-- using schema-qualified identifier quoting. Never accept function names
-- from a caller-supplied envelope.

insert into public.lemma_command_resources (resource, command_fn, mcp_ok, "schema") values
  ('study_entries', 'study_command', true, '{"operations":["create","update","delete","start","pause","resume","break","save","discard"],"fields":["intent","source","reflection","rating","subject_id","project_id","checkpoint_id","session_id"]}'::jsonb),
  ('study_intervals', 'study_command', true, '{"operations":["create","update","delete"],"fields":["entry_id","kind","started_at","ended_at"]}'::jsonb),
  ('calendar_blocks', 'study_command', true, '{"operations":["create","update","delete"],"fields":["kind","title","starts_at","ends_at","time_zone","status","subject_id","project_id","checkpoint_id","session_id"]}'::jsonb),
  ('tasks', 'task_command', true, '{"operations":["create","update","delete"],"fields":["title","body","subject_id","project_id","checkpoint_id","estimate_minutes","priority","due_kind","due_date","due_at","position","status"]}'::jsonb);
