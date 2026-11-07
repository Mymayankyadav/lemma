-- N49 initial forward-only owner draft storage.
-- This PR remains NOT READY until the complete idempotent audited command,
-- submit conflict checks and MCP/undo paths are appended.
create table public.proposal_drafts (
 id uuid primary key default pg_catalog.gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 proposal_id uuid not null,
 target_id uuid not null,
 base_versions jsonb not null check(jsonb_typeof(base_versions)='object'
   and base_versions ? 'proposal' and base_versions ? 'target'),
 payload jsonb not null check(jsonb_typeof(payload)='object'),
 draft_version integer not null default 1 check(draft_version between 1 and 2147483647),
 status text not null default 'draft'
  check(status in ('draft','saved','submitted','discarded')),
 edited_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(user_id,id),
 constraint proposal_drafts_owner_proposal_fk
  foreign key(user_id,proposal_id) references public.proposals(user_id,id)
  deferrable initially immediate
);
create index proposal_drafts_owner_proposal_status
 on public.proposal_drafts(user_id,proposal_id,status,edited_at desc,id);
alter table public.proposal_drafts enable row level security;
create policy proposal_drafts_owner_select on public.proposal_drafts for select
 to authenticated using(user_id=(select auth.uid()));
grant select on public.proposal_drafts to authenticated,service_role;
-- This table is command-managed, never writable directly by browsers.
revoke insert,update,delete,truncate on public.proposal_drafts from anon,authenticated;
create trigger lemma_log_change after insert or update or delete
 on public.proposal_drafts for each row execute function public.log_change();
insert into public.lemma_undo_tables(table_name) values('proposal_drafts')
 on conflict do nothing;
