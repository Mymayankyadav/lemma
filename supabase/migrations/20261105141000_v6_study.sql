-- N10: additive v6 study records. Existing objects are not modified.
create table public.study_entries (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 subject_id uuid, project_id uuid, checkpoint_id uuid, session_id uuid,
 intent text not null default '',
 source text not null check (source in ('timer','manual')),
 status text not null default 'draft' check (status in ('running','paused','draft','saved','discarded')),
 reflection text, rating smallint check (rating between 1 and 5),
 version integer not null default 1 check (version > 0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 saved_at timestamptz,
 unique (user_id,id),
 foreign key (user_id,subject_id) references public.subjects(user_id,id),
 foreign key (user_id,project_id) references public.projects(user_id,id),
 foreign key (user_id,checkpoint_id) references public.checkpoints(user_id,id),
 foreign key (user_id,session_id) references public.sessions(user_id,id)
);
create unique index study_entries_one_active_per_owner
 on public.study_entries(user_id) where status in ('running','paused');

create table public.study_intervals (
 id uuid primary key default gen_random_uuid(),
 entry_id uuid not null,
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 kind text not null check (kind in ('focus','break')),
 started_at timestamptz not null,
 ended_at timestamptz,
 check (ended_at is null or ended_at > started_at),
 foreign key (user_id,entry_id) references public.study_entries(user_id,id) on delete cascade
);
create index study_intervals_owner_started on public.study_intervals(user_id,started_at);

create table public.calendar_blocks (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 kind text not null check (kind in ('study','busy')),
 title text not null,
 starts_at timestamptz not null,
 ends_at timestamptz not null,
 time_zone text not null,
 status text not null default 'planned' check (status in ('planned','done','cancelled')),
 version integer not null default 1 check (version > 0),
 subject_id uuid, project_id uuid, checkpoint_id uuid, session_id uuid,
 check (ends_at > starts_at),
 foreign key (user_id,subject_id) references public.subjects(user_id,id),
 foreign key (user_id,project_id) references public.projects(user_id,id),
 foreign key (user_id,checkpoint_id) references public.checkpoints(user_id,id),
 foreign key (user_id,session_id) references public.sessions(user_id,id)
);
create index calendar_blocks_owner_starts on public.calendar_blocks(user_id,starts_at);

create table public.command_receipts (
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 operation_id uuid not null,
 resource text not null,
 result jsonb not null check (jsonb_typeof(result) = 'object'),
 created_at timestamptz not null default now(),
 primary key (user_id,operation_id)
);

alter table public.study_entries enable row level security;
alter table public.study_intervals enable row level security;
alter table public.calendar_blocks enable row level security;
alter table public.command_receipts enable row level security;

create policy study_entries_owner on public.study_entries for all to authenticated
 using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy study_intervals_owner on public.study_intervals for all to authenticated
 using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy calendar_blocks_owner on public.calendar_blocks for all to authenticated
 using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy command_receipts_owner on public.command_receipts for all to authenticated
 using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant select,insert,update,delete on public.study_entries,public.study_intervals,
 public.calendar_blocks,public.command_receipts to authenticated;
