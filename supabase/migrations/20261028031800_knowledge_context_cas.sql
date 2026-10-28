-- KNOWLEDGE-01 K2a: owner-only, revision-checked accepted context Markdown.
-- Additive only. Existing context rows are retained; their *current* value is
-- captured as a labelled legacy baseline on their first explicit CAS edit.
-- No historical revisions are invented for older rows.
create table public.study_context_revisions (
  user_id uuid not null,
  context_id uuid not null,
  revision bigint not null check (revision > 0),
  title text not null,
  context_markdown text not null,
  source_refs jsonb not null,
  request_id uuid,
  payload_hash text,
  origin text not null check (origin in ('accepted_write','legacy_current_baseline')),
  created_at timestamptz not null default clock_timestamp(),
  primary key (user_id,context_id,revision),
  unique (user_id,request_id),
  foreign key (user_id,context_id) references public.study_context_files(user_id,id) on delete restrict,
  -- Legacy rows may exceed new write caps; never truncate or reject their
  -- historical current snapshot. Only the CAS RPC enforces new-write limits.
  check ((origin='legacy_current_baseline' and request_id is null and payload_hash is null)
    or (origin='accepted_write' and request_id is not null and payload_hash is not null))
);
create index study_context_revisions_recent on public.study_context_revisions
  (user_id,context_id,revision desc);
alter table public.study_context_revisions enable row level security;
revoke all on public.study_context_revisions from public,anon,authenticated;
grant select on public.study_context_revisions to authenticated;
create policy context_revisions_owner_read on public.study_context_revisions
  for select to authenticated using (user_id=(select auth.uid()));

-- No client may bypass revision history by directly editing/deleting current
-- accepted state. Existing read policies and study-plan context FK are intact.
revoke insert,update,delete on public.study_context_files from authenticated;
grant select on public.study_context_files to authenticated;

create function public.lemma_reject_context_revision_change() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  raise exception 'accepted_context_revisions_are_immutable';
end
$$;
revoke all on function public.lemma_reject_context_revision_change()
  from public,anon,authenticated;
create trigger study_context_revisions_immutable
before update or delete on public.study_context_revisions
for each row execute function public.lemma_reject_context_revision_change();

create function lemma_private.commit_study_context(
  p_context_id uuid,
  p_expected_revision bigint,
  p_request_id uuid,
  p_title text,
  p_context_markdown text
) returns bigint
language plpgsql security definer set search_path='' as $$
declare
  v_uid uuid := auth.uid();
  v_old public.study_context_files%rowtype;
  v_prior public.study_context_revisions%rowtype;
  v_next bigint;
  v_hash text;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  if p_context_id is null or p_request_id is null
     or p_expected_revision is null or p_expected_revision < 0
     or p_title is null or octet_length(btrim(p_title))=0
     or octet_length(p_title)>512
     or p_context_markdown is null
     or octet_length(p_context_markdown)>65536 then
    raise exception 'invalid_context_payload';
  end if;
  v_hash := md5(pg_catalog.jsonb_build_array(
    p_context_id,p_expected_revision,p_title,p_context_markdown)::text);
  -- This lock serializes first-create and concurrent updates by one owner
  -- while leaving other owners' contexts independent.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_uid::text || ':context:' || p_context_id::text,0));
  select * into v_prior from public.study_context_revisions
    where user_id=v_uid and request_id=p_request_id;
  if found then
    if v_prior.context_id <> p_context_id or v_prior.payload_hash <> v_hash then
      raise exception 'idempotency_key_reused';
    end if;
    return v_prior.revision;
  end if;

  select * into v_old from public.study_context_files
    where user_id=v_uid and id=p_context_id for update;
  if not found then
    if p_expected_revision<>0 then raise exception 'stale_context_revision'; end if;
    v_next := 1;
    insert into public.study_context_files
      (user_id,id,title,context_markdown,source_refs,revision,updated_at)
      values (v_uid,p_context_id,p_title,p_context_markdown,'[]'::jsonb,1,clock_timestamp());
  else
    if v_old.revision<>p_expected_revision then raise exception 'stale_context_revision'; end if;
    -- Pre-K2 contexts had only their latest row, not a revision ledger.
    -- Capture precisely that row once before altering it; do not infer older history.
    if not exists (select 1 from public.study_context_revisions
      where user_id=v_uid and context_id=p_context_id and revision=v_old.revision) then
      insert into public.study_context_revisions
        (user_id,context_id,revision,title,context_markdown,source_refs,origin)
        values (v_uid,p_context_id,v_old.revision,v_old.title,
          v_old.context_markdown,v_old.source_refs,'legacy_current_baseline');
    end if;
    v_next := v_old.revision+1;
    update public.study_context_files
      set title=p_title,context_markdown=p_context_markdown,
        revision=v_next,updated_at=clock_timestamp()
      where user_id=v_uid and id=p_context_id;
  end if;
  insert into public.study_context_revisions
    (user_id,context_id,revision,title,context_markdown,source_refs,request_id,payload_hash,origin)
    select v_uid,p_context_id,v_next,p_title,p_context_markdown,
      source_refs,p_request_id,v_hash,'accepted_write'
    from public.study_context_files where user_id=v_uid and id=p_context_id;
  return v_next;
end
$$;
revoke all on function lemma_private.commit_study_context(uuid,bigint,uuid,text,text)
  from public,anon;
grant execute on function lemma_private.commit_study_context(uuid,bigint,uuid,text,text)
  to authenticated;

create function public.commit_study_context(
  p_context_id uuid,
  p_expected_revision bigint,
  p_request_id uuid,
  p_title text,
  p_context_markdown text
) returns bigint language sql security invoker set search_path='' as $$
  select lemma_private.commit_study_context(
    p_context_id,p_expected_revision,p_request_id,p_title,p_context_markdown)
$$;
revoke all on function public.commit_study_context(uuid,bigint,uuid,text,text)
  from public,anon;
grant execute on function public.commit_study_context(uuid,bigint,uuid,text,text)
  to authenticated;
notify pgrst,'reload schema';
