-- N91: additive immutable history metadata. Correction commands are intentionally
-- not deployed until their owner re-derivation and replay tests are complete.
alter table public.session_events
  add column occurred_at timestamptz,
  add column superseded_by bigint,
  add column voided_at timestamptz,
  add column correction_reason text
    constraint session_event_correction_reason_bounds check
      (correction_reason is null or char_length(correction_reason) between 1 and 600),
  add column actor text
    constraint session_event_actor_check check
      (actor is null or actor in ('app','mcp','worker'));

alter table public.session_events
  add constraint session_events_owner_id_unique unique (user_id,id);
alter table public.session_events
  add constraint session_events_supersedes_owned
  foreign key(user_id,superseded_by) references public.session_events(user_id,id)
  deferrable initially immediate;
alter table public.session_events
  add constraint session_events_not_self_superseded check
    (superseded_by is null or superseded_by <> id);
create index session_events_owner_event_time on public.session_events
  (user_id,checkpoint_id,occurred_at,created_at,id)
  where voided_at is null and superseded_by is null;

-- Every row snapshots the exact scheduler configuration used for a history
-- correction. Historical review rows may remain unparameterized; never infer
-- weights from the current settings.
create table public.review_parameter_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  scheduler_version text not null
    constraint review_parameter_version_bounds check (char_length(scheduler_version) between 1 and 80),
  params jsonb not null
    constraint review_parameter_params_object check(jsonb_typeof(params)='object'),
  captured_at timestamptz not null default now(),
  unique (user_id,id)
);
create index review_parameter_sets_owner_time
  on public.review_parameter_sets(user_id,captured_at,id);
alter table public.review_parameter_sets enable row level security;
create policy review_parameter_sets_owner_read on public.review_parameter_sets
  for select to authenticated using(user_id=(select auth.uid()));
grant select on public.review_parameter_sets to authenticated, service_role;
grant insert,update,delete on public.review_parameter_sets to service_role;
revoke insert,update,delete,truncate on public.review_parameter_sets from anon,authenticated;
create trigger lemma_log_change after insert or update or delete
 on public.review_parameter_sets for each row execute function public.log_change();
insert into public.lemma_undo_tables(table_name) values ('review_parameter_sets');

alter table public.reviews
  add column scheduler_version text,
  add column params_id uuid,
  add column operation_id uuid;
alter table public.reviews
  add constraint reviews_scheduler_version_bounds check
    (scheduler_version is null or char_length(scheduler_version) between 1 and 80);
alter table public.reviews
  add constraint reviews_owner_parameter_set foreign key(user_id,params_id)
    references public.review_parameter_sets(user_id,id)
    deferrable initially immediate;
create unique index reviews_owner_operation_id on public.reviews(user_id,operation_id)
  where operation_id is not null;

comment on column public.session_events.occurred_at is
  'Correction event instant; legacy effective instant is coalesce(occurred_at,created_at).';
comment on column public.reviews.params_id is
  'Immutable owner-scoped scheduler parameter snapshot; NULL means historically unrecorded.';
