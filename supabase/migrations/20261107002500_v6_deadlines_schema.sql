-- N42.1 D8(b): owner-scoped deadlines and milestones storage, undo-ready.
-- The transactional deadlines_command and read projection are N42.2.
create table public.deadlines (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 title text not null check (length(btrim(title)) between 1 and 200),
 kind text not null default 'other' check (kind in ('exam','seminar','assignment','milestone','other')),
 due_date date,
 due_at timestamptz,
 subject_id uuid, project_id uuid, checkpoint_id uuid,
 remaining_minutes integer check (remaining_minutes is null or remaining_minutes between 0 and 1000000),
 estimate_source text check (estimate_source is null or estimate_source in ('owner','derived')),
 status text not null default 'open' check (status in ('open','done','cancelled')),
 version integer not null default 1 check (version>0),
 source text not null default 'app' check (source in ('app','mcp','worker')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(user_id,id),
 constraint deadlines_exactly_one_due check ((due_date is null) <> (due_at is null)),
 constraint deadlines_estimate_provenance check ((remaining_minutes is null) = (estimate_source is null)),
 constraint deadlines_subject_owner_fk foreign key(user_id,subject_id) references public.subjects(user_id,id) deferrable initially immediate,
 constraint deadlines_project_owner_fk foreign key(user_id,project_id) references public.projects(user_id,id) deferrable initially immediate,
 constraint deadlines_checkpoint_owner_fk foreign key(user_id,checkpoint_id) references public.checkpoints(user_id,id) deferrable initially immediate
);
create index deadlines_owner_status_due on public.deadlines(user_id,status,due_date,due_at,id);
alter table public.deadlines enable row level security;
create policy deadlines_owner_select on public.deadlines for select to authenticated using (user_id=(select auth.uid()));
create policy deadlines_owner_insert on public.deadlines for insert to authenticated with check (user_id=(select auth.uid()));
create policy deadlines_owner_update on public.deadlines for update to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create policy deadlines_owner_delete on public.deadlines for delete to authenticated using (user_id=(select auth.uid()));
grant select,insert,update,delete on public.deadlines to authenticated;
create trigger lemma_log_change after insert or update or delete on public.deadlines
 for each row execute function public.log_change();
insert into public.lemma_undo_tables(table_name) values('deadlines');
