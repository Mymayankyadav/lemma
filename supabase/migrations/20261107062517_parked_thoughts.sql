-- N44.1 / D8(b): parked thought storage, intentionally read-only to clients.
-- N44.2 adds the versioned transaction, task conversion, journal and undo;
-- granting writes before that command exists would bypass the audit boundary.
create table public.parked_thoughts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  study_entry_id uuid,
  text text not null check (char_length(btrim(text)) between 1 and 4000),
  status text not null default 'open'
    check (status in ('open','dismissed','converted')),
  destination_kind text check (destination_kind is null or destination_kind='task'),
  destination_id uuid,
  resolved_at timestamptz,
  version integer not null default 1 check (version>0),
  source text not null default 'app' check (source in ('app','mcp','worker')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id,id),
  constraint parked_thoughts_entry_owner_fk
    foreign key (user_id,study_entry_id) references public.study_entries(user_id,id)
    on delete set null (study_entry_id) deferrable initially immediate,
  constraint parked_thoughts_task_owner_fk
    foreign key (user_id,destination_id) references public.tasks(user_id,id)
    deferrable initially immediate,
  constraint parked_thoughts_resolution_valid check (
    (status='open' and destination_kind is null and destination_id is null and resolved_at is null)
    or (status='dismissed' and destination_kind is null and destination_id is null and resolved_at is not null)
    or (status='converted' and destination_kind is not distinct from 'task' and destination_id is not null and resolved_at is not null)
  )
);
create index parked_thoughts_owner_status on public.parked_thoughts
  (user_id,status,created_at,id);
alter table public.parked_thoughts enable row level security;
-- An owner's SELECT is safe. There is deliberately no write policy:
-- default Supabase grants cannot make unaudited client writes succeed.
create policy parked_thoughts_owner_select on public.parked_thoughts for select
  to authenticated using (user_id=(select auth.uid()));
grant select on public.parked_thoughts to authenticated;
