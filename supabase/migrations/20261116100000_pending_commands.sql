-- N53: owner-scoped, bounded pending decisions. All writes are performed
-- by the reviewed command functions below, never by client table mutations.
create table public.pending_commands (
 id uuid primary key default pg_catalog.gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 operation_id uuid not null,
 resource text not null check(resource ~ '^[a-z_][a-z0-9_]*$'),
 payload jsonb not null check(pg_catalog.jsonb_typeof(payload)='object'),
 not_before timestamptz not null,
 undo_until timestamptz not null,
 status text not null default 'scheduled' check
   (status in ('scheduled','executing','succeeded','failed','cancelled')),
 result jsonb,
 error_class text,
 version integer not null default 1 check(version>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(user_id,id),
 unique(user_id,operation_id),
 constraint pending_commands_undo_window check(undo_until>not_before),
 constraint pending_commands_result_object check(result is null or
   pg_catalog.jsonb_typeof(result)='object')
);
create index pending_commands_due on public.pending_commands
 (not_before,id) where status='scheduled';
create index pending_commands_owner_created on public.pending_commands
 (user_id,created_at desc,id);
alter table public.pending_commands enable row level security;
create policy pending_commands_owner_select on public.pending_commands
 for select to authenticated using(user_id=(select auth.uid()));
grant select on public.pending_commands to authenticated;
grant select,insert,update,delete on public.pending_commands to service_role;
