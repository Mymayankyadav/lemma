-- Cover the composite owner/project FK used by diagnostic lookups and cascades.
create index diagnostics_project on public.diagnostics(user_id,project_id);
