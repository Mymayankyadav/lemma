-- N38: additive optimistic versions and provenance for existing mutable rows.
-- No existing row is modified by this migration; old rows receive the column
-- default version=1 and keep updated_source=NULL until their first write.
-- Existing app, MCP and undo writers do not need to send these columns.
create function public.lemma_record_version() returns trigger
language plpgsql security invoker set search_path = '' as $version$
declare
  actor text;
begin
  -- Ignore any caller-supplied version or provenance on UPDATE. Every update,
  -- including an otherwise no-op update and undo, advances exactly once.
  new.version := old.version + 1;
  new.updated_at := pg_catalog.clock_timestamp();
  actor := nullif(pg_catalog.current_setting('lemma.source', true), '');
  new.updated_source := case
    when actor in ('worker', 'system') then 'worker'
    when actor in ('claude', 'chatgpt', 'other', 'mcp') then 'mcp'
    else 'app'
  end;
  return new;
end
$version$;

do $record_versions$
declare
  tbl text;
begin
  foreach tbl in array array[
    'settings','subjects','projects','sources','source_pages','concepts',
    'checkpoints','styles','notes','cards','proposals','card_comments',
    'diagnostics','misconceptions'
  ] loop
    execute pg_catalog.format(
      'alter table public.%I add column version integer not null default 1 check (version > 0), add column updated_source text check (updated_source in (''app'', ''mcp'', ''worker''))',
      tbl
    );
    -- These four tables already have updated_at and their existing
    -- touch_updated_at trigger. New BEFORE trigger is named 'z_' to run after it.
    if tbl <> all(array['settings','projects','checkpoints','notes']) then
      execute pg_catalog.format(
        'alter table public.%I add column updated_at timestamptz not null default now()',
        tbl
      );
    end if;
    execute pg_catalog.format(
      'create trigger z_record_version before update on public.%I for each row execute function public.lemma_record_version()',
      tbl
    );
  end loop;
end
$record_versions$;
