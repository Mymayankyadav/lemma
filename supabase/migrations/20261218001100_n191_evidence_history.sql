-- N169 evidence has an immutable observation and mutable void/supersede
-- markers. Undo can physically remove a replacement. Journal the accepted
-- transitions beside that existing writer, including corrections and inverses.
create table public.evidence_revisions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid,
  source text not null check (source in ('evidence','attempts','attempt_tags','instruction_events')),
  fact_id bigint not null,
  revision integer not null check (revision > 0),
  kind text not null check (kind in ('record','void')),
  occurred_at timestamptz not null,
  reported_at timestamptz not null,
  known_at timestamptz not null,
  writer_xid xid8 not null,
  fact jsonb,
  superseded_by bigint,
  unique(user_id,source,fact_id,revision),
  check ((kind='record' and fact is not null and pg_catalog.jsonb_typeof(fact)='object')
      or (kind='void' and fact is null)),
  foreign key(user_id,project_id) references public.projects(user_id,id) on delete cascade
);
create index evidence_revisions_owner_page on public.evidence_revisions(user_id,id);
create index evidence_revisions_project_page on public.evidence_revisions(user_id,project_id,id);
create index evidence_revisions_transaction on public.evidence_revisions(user_id,writer_xid);
alter table public.evidence_revisions enable row level security;
create policy evidence_revisions_owner_read on public.evidence_revisions for select to authenticated
  using (user_id=(select auth.uid()));
revoke insert,update,delete,truncate on public.evidence_revisions from anon,authenticated;
grant select on public.evidence_revisions to authenticated,service_role;
create trigger lemma_account_delete_write_guard before insert or update or delete on public.evidence_revisions
  for each row execute function public.lemma_block_account_deletion_writes();

-- Register with the existing owner export. The revisions themselves are not
-- journal undo targets: undo changes the source evidence and appends an inverse.
insert into public.lemma_undo_tables(table_name) values ('evidence_revisions');

-- Preserve native fact columns for the offline parity oracle. IDs that may
-- exceed JavaScript integer precision cross the JSON boundary as strings.
create function public.lemma_evidence_payload(r jsonb) returns jsonb
language sql immutable security invoker set search_path='' as $fact$
  select (r-array['user_id','created_at','updated_at','updated_source','voided_at','superseded_by','version'])
    || pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'id',r->>'id','attempt_id',r->>'attempt_id',
      'session_event_id',r->>'session_event_id','source_evidence_id',r->>'source_evidence_id'))
$fact$;
revoke all on function public.lemma_evidence_payload(jsonb) from public,anon,authenticated,service_role;

create function public.lemma_capture_evidence_revision() returns trigger
language plpgsql security definer set search_path='' as $capture$
declare
  r jsonb; previous jsonb; owner_id uuid; project uuid; session uuid;
  fact_key bigint; successor bigint; occurred timestamptz; accepted timestamptz;
  report_time timestamptz; next_revision integer; active boolean;
  prior_project uuid; prior_kind text; prior_occurred timestamptz;
  writer xid8 := pg_catalog.pg_current_xact_id();
begin
  if TG_OP='DELETE' then r:=pg_catalog.to_jsonb(old);
  else r:=pg_catalog.to_jsonb(new); end if;
  if TG_OP='UPDATE' then
    previous:=pg_catalog.to_jsonb(old);
    -- Bookkeeping-only row versions do not add observations.
    if (previous-array['version','updated_at','updated_source']) =
       (r-array['version','updated_at','updated_source']) then return null; end if;
  end if;
  owner_id:=(r->>'user_id')::uuid; fact_key:=(r->>'id')::bigint;
  project:=(r->>'project_id')::uuid; session:=(r->>'session_id')::uuid;
  successor:=(r->>'superseded_by')::bigint; occurred:=(r->>'occurred_at')::timestamptz;

  if TG_TABLE_NAME='attempt_tags' then
    select a.project_id,a.occurred_at into project,occurred from public.attempts a
      where a.user_id=owner_id and a.id=(r->>'attempt_id')::bigint;
    if not found and TG_OP='DELETE' then
      -- A cascading removal can already have removed the parent. Use only
      -- this owner's earlier, committed tag scope for the inverse.
      select h.project_id,h.occurred_at into project,occurred from public.evidence_revisions h
        where h.user_id=owner_id and h.source=TG_TABLE_NAME and h.fact_id=fact_key
        order by h.revision desc limit 1;
      if not found then return null; end if;
    end if;
  elsif TG_TABLE_NAME='instruction_events' and session is not null then
    select s.project_id into project from public.sessions s where s.user_id=owner_id and s.id=session;
  end if;
  if TG_OP='DELETE' and (exists(select 1 from public.account_deletion_requests where user_id=owner_id)
    or not exists (select 1 from auth.users where id=owner_id)
    or (project is not null and not exists (
      select 1 from public.projects where user_id=owner_id and id=project
    ))) then return null; end if;
  if TG_OP<>'DELETE' and r->>'session_event_id' is not null and not exists (
    select 1 from public.session_events se join public.sessions ss on ss.user_id=se.user_id and ss.id=se.session_id
    where se.user_id=owner_id and se.id=(r->>'session_event_id')::bigint and (session is null or se.session_id=session)
      and (project is null or ss.project_id=project)
  ) then
    -- Atlas retains the previously accepted event ID when its session is
    -- deleted. FK triggers can clear the session before deleting its events.
    -- Only retain the unchanged reference on the same owner's detached fact.
    if (TG_OP='UPDATE' and session is null and previous->>'user_id'=r->>'user_id'
      and previous->>'session_event_id'=r->>'session_event_id'
      and (project is null or previous->>'project_id'=r->>'project_id')
      and not exists(select 1 from public.session_events se join public.sessions ss on ss.id=se.session_id
        where se.id=(r->>'session_event_id')::bigint)) is not true then
      raise exception 'Evidence event outside its owner/session' using errcode='23503';
    end if;
  end if;
  if TG_TABLE_NAME='evidence' and TG_OP<>'DELETE' and successor is not null and not exists (
    select 1 from public.evidence e where e.user_id=owner_id and e.id=successor
  ) then raise exception 'Evidence successor outside its owner' using errcode='23503'; end if;

  -- Writes to an individual canonical row already serialize. A transaction's
  -- revisions share a known time. The read watermark additionally excludes
  -- transactions that had not committed when a decision observed its snapshot.
  select h.known_at into accepted from public.evidence_revisions h
    where h.user_id=owner_id and h.writer_xid=writer limit 1;
  accepted:=coalesce(accepted,pg_catalog.clock_timestamp());
  report_time:=case when TG_OP='INSERT' then (r->>'created_at')::timestamptz else accepted end;
  select h.revision+1,h.project_id,h.kind,h.occurred_at into next_revision,prior_project,prior_kind,prior_occurred
    from public.evidence_revisions h where h.user_id=owner_id and h.source=TG_TABLE_NAME and h.fact_id=fact_key
    order by h.revision desc limit 1;
  next_revision:=coalesce(next_revision,1);
  active:=TG_OP<>'DELETE' and r->>'voided_at' is null and successor is null;
  -- A canonical link can change without removing the owner's fact. Close its
  -- former project lineage first so a scoped reader sees the departure. The
  -- next global revision describes the surviving record under its new scope.
  if prior_kind='record' and prior_project is not null and prior_project is distinct from project
    and exists(select 1 from public.projects where user_id=owner_id and id=prior_project) then
    insert into public.evidence_revisions
      (user_id,project_id,source,fact_id,revision,kind,occurred_at,reported_at,known_at,writer_xid)
    values(owner_id,prior_project,TG_TABLE_NAME,fact_key,next_revision,'void',prior_occurred,accepted,accepted,writer);
    if not active then return null; end if;
    next_revision:=next_revision+1;
  end if;
  insert into public.evidence_revisions
    (user_id,project_id,source,fact_id,revision,kind,occurred_at,reported_at,known_at,writer_xid,fact,superseded_by)
  values(owner_id,project,TG_TABLE_NAME,fact_key,next_revision,case when active then 'record' else 'void' end,
    occurred,report_time,accepted,writer,case when active then public.lemma_evidence_payload(r) end,successor);
  return null;
end
$capture$;
revoke all on function public.lemma_capture_evidence_revision() from public,anon,authenticated,service_role;
create trigger lemma_evidence_revision after insert or update or delete on public.evidence
  for each row execute function public.lemma_capture_evidence_revision();
create trigger lemma_evidence_revision after insert or update or delete on public.attempts
  for each row execute function public.lemma_capture_evidence_revision();
create trigger lemma_evidence_revision after insert or update or delete on public.attempt_tags
  for each row execute function public.lemma_capture_evidence_revision();
create trigger lemma_evidence_revision after insert or update or delete on public.instruction_events
  for each row execute function public.lemma_capture_evidence_revision();

-- Existing rows first become known at baseline capture. The trigger creation
-- holds all four source table locks through the transaction. Atlas attempts
-- retain source_evidence_id so a converted historical observation can be
-- identified across representations without counting it twice.
create function public.lemma_seed_evidence_rows(p_owner uuid,p_source text,p_after bigint,p_limit integer)
returns jsonb language sql volatile security invoker set search_path='' as $seed$
with facts as not materialized (
  select 'evidence' source,e.user_id,e.project_id,e.id,e.occurred_at,e.created_at,
    e.voided_at is null and e.superseded_by is null active,e.superseded_by,pg_catalog.to_jsonb(e) r
    from public.evidence e
  union all
  select 'attempts',a.user_id,a.project_id,a.id,a.occurred_at,a.created_at,
    a.voided_at is null and a.superseded_by is null,a.superseded_by,pg_catalog.to_jsonb(a)
    from public.attempts a
  union all
  select 'attempt_tags',t.user_id,a.project_id,t.id,a.occurred_at,t.created_at,true,null,pg_catalog.to_jsonb(t)
    from public.attempt_tags t join public.attempts a on a.user_id=t.user_id and a.id=t.attempt_id
  union all
  select 'instruction_events',i.user_id,s.project_id,i.id,i.occurred_at,i.created_at,
    i.voided_at is null,null,pg_catalog.to_jsonb(i)
    from public.instruction_events i left join public.sessions s on s.user_id=i.user_id and s.id=i.session_id
), page as materialized (
  select * from facts where (p_owner is null or user_id=p_owner) and (p_source is null or source=p_source) and id>p_after
    order by user_id,source,id limit p_limit
), accepted as (
insert into public.evidence_revisions
  (user_id,project_id,source,fact_id,revision,kind,occurred_at,reported_at,known_at,writer_xid,fact,superseded_by)
select user_id,project_id,source,id,1,case when active then 'record' else 'void' end,
  occurred_at,created_at,statement_timestamp(),pg_catalog.pg_current_xact_id(),
  case when active then public.lemma_evidence_payload(r) end,superseded_by from page
  where not exists(select 1 from public.evidence_revisions h where h.user_id=page.user_id and h.source=page.source and h.fact_id=page.id)
  on conflict(user_id,source,fact_id,revision) do nothing returning id
)
select pg_catalog.jsonb_build_object('captured',(select count(*) from accepted),'cursor',(select max(id)::text from page))
$seed$;
revoke all on function public.lemma_seed_evidence_rows(uuid,text,bigint,integer) from public,anon,authenticated,service_role;
select public.lemma_seed_evidence_rows(null,null,0,null);

-- Repair/import reconciliation uses a bounded, resumable source cursor. The
-- same row can be visited again without changing its recorded first knowledge.
create function public.lemma_seed_evidence_page(p_owner uuid,p_source text,p_after bigint default 0,p_limit integer default 200)
returns jsonb language plpgsql security definer set search_path='' as $page$
begin
  if pg_catalog.current_setting('role',true) is distinct from 'service_role' or p_owner is null
    or not exists(select 1 from public.settings where user_id=p_owner) then
    raise exception 'Authenticated service owner required' using errcode='42501'; end if;
  if p_source is null or p_source not in ('evidence','attempts','attempt_tags','instruction_events')
    or p_limit is null or p_limit not between 1 and 500 or p_after is null or p_after<0 then
    raise exception 'Invalid evidence reconciliation page' using errcode='22023'; end if;
  return public.lemma_seed_evidence_rows(p_owner,p_source,p_after,p_limit);
end
$page$;
revoke all on function public.lemma_seed_evidence_page(uuid,text,bigint,integer) from public,anon,authenticated;
grant execute on function public.lemma_seed_evidence_page(uuid,text,bigint,integer) to service_role;

create function public.lemma_evidence_snapshot(
  p_project_id uuid default null, p_as_of timestamptz default null,
  p_watermark pg_snapshot default null, p_after bigint default 0, p_limit integer default 200
) returns jsonb language plpgsql stable security invoker set search_path='' as $snapshot$
declare
  owner_id uuid := auth.uid();
  cutoff timestamptz := coalesce(p_as_of,pg_catalog.statement_timestamp());
  watermark pg_snapshot := coalesce(p_watermark,pg_catalog.pg_current_snapshot());
  events jsonb; next_after text;
begin
  if owner_id is null then raise exception 'Authenticated owner required' using errcode='42501'; end if;
  if p_project_id is not null and not exists (
    select 1 from public.projects where user_id=owner_id and id=p_project_id
  ) then raise exception 'Project unavailable' using errcode='42501'; end if;
  if p_limit is null or p_limit not between 1 and 500 or p_after is null or p_after<0
    or (p_after>0 and (p_watermark is null or p_as_of is null))
    or not pg_catalog.isfinite(cutoff) or cutoff>pg_catalog.statement_timestamp() then
    raise exception 'Invalid evidence snapshot cursor or cutoff' using errcode='22023';
  end if;
  with fetched as materialized (
    select r.* from public.evidence_revisions r
    where r.user_id=owner_id and (p_project_id is null or r.project_id=p_project_id)
      and r.id>p_after and r.occurred_at<=cutoff and r.reported_at<=cutoff and r.known_at<=cutoff
      and pg_catalog.pg_visible_in_snapshot(r.writer_xid,watermark)
    order by r.id limit p_limit+1
  ), page as (select * from fetched order by id limit p_limit)
  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object('ownerId',owner_id,'eventId',id::text,'source',source,
      'lineageId',fact_id::text,'revision',revision,'occurredAt',occurred_at,
      'reportedAt',reported_at,'knownAt',known_at,'kind',kind)
      || case when kind='record' then pg_catalog.jsonb_build_object('payload',fact) else '{}'::jsonb end
    order by id),'[]'::jsonb),
    case when (select count(*) from fetched)>p_limit then max(id)::text end
  into events,next_after from page;
  return pg_catalog.jsonb_build_object('asOf',cutoff,'watermark',watermark::text,
    'events',events,'nextAfter',next_after);
end
$snapshot$;
revoke all on function public.lemma_evidence_snapshot(uuid,timestamptz,pg_snapshot,bigint,integer)
  from public,anon;
grant execute on function public.lemma_evidence_snapshot(uuid,timestamptz,pg_snapshot,bigint,integer)
  to authenticated;

-- The canonical account purge deletes owner-keyed tables directly under its
-- protected backend/transaction marker. Migrated legacy evidence previously
-- rejected that authorised deletion before Auth could complete its cascade.
create function public.lemma_evidence_purge_active(p_owner uuid) returns boolean
language sql stable security definer set search_path='' as $purge$
  select pg_catalog.current_setting('role',true)='service_role' and exists (
    select 1 from public.account_deletion_requests d where d.user_id=p_owner
      and d.cleanup_pid=pg_catalog.pg_backend_pid() and d.cleanup_txid=pg_catalog.txid_current())
$purge$;
revoke all on function public.lemma_evidence_purge_active(uuid) from public,anon,authenticated;
grant execute on function public.lemma_evidence_purge_active(uuid) to service_role;

create or replace function public.atlas_freeze_evidence() returns trigger
language plpgsql security invoker set search_path='' as $freeze$
begin
  if pg_catalog.pg_trigger_depth()>1 then
    if TG_OP='DELETE' then return old; end if;
    return new;
  end if;
  if TG_OP='DELETE' and pg_catalog.current_setting('role',true)='service_role' then
    if public.lemma_evidence_purge_active(old.user_id) then return old; end if;
  end if;
  if exists(select 1 from public.settings where user_id=coalesce(new.user_id,old.user_id) and atlas_migrated_at is not null) then
    raise exception 'Evidence is frozen after Atlas cutover';
  end if;
  if TG_OP='DELETE' then return old; end if;
  return new;
end
$freeze$;
