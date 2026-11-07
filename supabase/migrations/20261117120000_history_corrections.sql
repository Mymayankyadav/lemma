-- N91 initial additive provenance and scheduler parameter snapshots.
-- The PR is NOT READY until reversible correction/void commands are appended.
alter table public.session_events
 add column occurred_at timestamptz,
 add column superseded_by bigint,
 add column voided_at timestamptz,
 add column correction_reason text
  constraint session_events_correction_reason_check
  check(correction_reason is null or length(btrim(correction_reason)) between 1 and 1000),
 add column actor text
  constraint session_events_actor_check
  check(actor is null or length(btrim(actor)) between 1 and 120);

create table public.review_parameter_sets (
 id uuid primary key default pg_catalog.gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 scheduler_version text not null check(length(btrim(scheduler_version)) between 1 and 80),
 weights jsonb not null check(jsonb_typeof(weights)='array' and jsonb_array_length(weights)=21),
 settings jsonb not null check(jsonb_typeof(settings)='object'),
 captured_at timestamptz not null default now(),
 unique(user_id,id)
);
alter table public.review_parameter_sets enable row level security;
create policy review_parameter_sets_owner_read on public.review_parameter_sets
 for select to authenticated using(user_id=(select auth.uid()));
grant select on public.review_parameter_sets to authenticated,service_role;
-- Required: Supabase may grant browser writes to newly created tables.
revoke insert,update,delete,truncate on public.review_parameter_sets from anon,authenticated;
create trigger lemma_log_change after insert or update or delete
 on public.review_parameter_sets for each row execute function public.log_change();

alter table public.reviews
 add column scheduler_version text,
 add column params_id uuid,
 add column operation_id uuid,
 add constraint reviews_parameter_owner_fk
 foreign key(user_id,params_id) references public.review_parameter_sets(user_id,id)
 deferrable initially immediate;

insert into public.lemma_undo_tables(table_name)
 values('review_parameter_sets') on conflict do nothing;
