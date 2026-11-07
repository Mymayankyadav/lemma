-- N50.1: owner-scoped notice/drift/urge study events.
-- N50.2 adds related-record references, full commands, undo and MCP routing.
-- Authenticated clients have SELECT-only RLS; direct writes do not get a
-- policy before the reviewed versioned, receipt-backed command exists.
create table public.study_events (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  entry_id uuid not null,
  kind text not null constraint study_events_kind_check
    check(kind in ('notice','drift','urge')),
  occurred_at timestamptz not null default now(),
  duration_minutes integer constraint study_events_duration_check
    check(duration_minutes is null or
      (kind='drift' and duration_minutes between 1 and 100000)),
  note text constraint study_events_note_check
    check(note is null or pg_catalog.length(note)<=2000),
  voided_at timestamptz,
  version integer not null default 1 constraint study_events_version_check
    check(version>0),
  source text not null default 'app' constraint study_events_source_check
    check(source in ('app','mcp','worker')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,id),
  foreign key(user_id,entry_id) references public.study_entries(user_id,id)
    deferrable initially immediate
);
create index study_events_owner_entry_time on public.study_events
  (user_id,entry_id,occurred_at,id);
create index study_events_owner_active on public.study_events
  (user_id,occurred_at,id) where voided_at is null;

alter table public.study_events enable row level security;
create policy study_events_owner_read on public.study_events
  for select to authenticated using(user_id=(select auth.uid()));
grant select on public.study_events to authenticated;
grant select,insert,update,delete on public.study_events to service_role;

create function public.study_events_touch_version() returns trigger
language plpgsql security invoker set search_path='' as $touch$
begin
  new.version:=old.version+1;
  new.updated_at:=pg_catalog.clock_timestamp();
  return new;
end
$touch$;
create trigger study_events_touch before update on public.study_events
  for each row execute function public.study_events_touch_version();
create trigger study_events_log after insert or update or delete on public.study_events
  for each row execute function public.log_change();
