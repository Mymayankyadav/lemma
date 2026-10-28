-- KNOWLEDGE-01 K2b. Accepted text/Markdown excerpts only; no binary upload/OCR.
-- Existing learning_sources/learning_sections remain intact. Immutable accepted
-- snapshots, not legacy mutable rows, are canonical for version-pinned citations.
create table public.knowledge_source_versions (
  user_id uuid not null,
  context_id uuid not null,
  context_revision bigint not null check (context_revision>0),
  source_id uuid not null,
  revision bigint not null check (revision>0),
  title text not null,
  source_type text not null,
  citation jsonb not null,
  request_id uuid not null,
  payload_hash text not null,
  accepted_at timestamptz not null default clock_timestamp(),
  primary key (user_id,source_id,revision),
  unique (user_id,request_id),
  foreign key (user_id,context_id) references public.study_context_files(user_id,id) on delete restrict,
  foreign key (user_id,source_id) references public.learning_sources(user_id,id) on delete restrict,
  check (octet_length(title) between 1 and 512),
  check (source_type in ('book','class_notes','paper','web','manual')),
  check (jsonb_typeof(citation)='object' and octet_length(citation::text)<=4096)
);
create index knowledge_sources_by_context on public.knowledge_source_versions
  (user_id,context_id,source_id,revision desc);

create table public.knowledge_section_versions (
  user_id uuid not null,
  source_id uuid not null,
  source_revision bigint not null,
  section_id uuid not null,
  locator text not null,
  title text not null default '',
  text_content text not null,
  text_sha256 text not null,
  primary key (user_id,source_id,source_revision,section_id),
  foreign key (user_id,source_id,source_revision)
    references public.knowledge_source_versions(user_id,source_id,revision) on delete restrict,
  check (octet_length(locator) between 1 and 256),
  check (octet_length(title)<=256),
  check (char_length(text_content)<=2000 and octet_length(text_content)<=8000),
  check (text_sha256 ~ '^[0-9a-f]{64}$')
);
-- Composite index backs stable, UUID-keyed pagination inside ONE pinned revision.
create index knowledge_section_page on public.knowledge_section_versions
  (user_id,source_id,source_revision,section_id);

alter table public.knowledge_source_versions enable row level security;
alter table public.knowledge_section_versions enable row level security;
revoke all on public.knowledge_source_versions from public,anon,authenticated;
revoke all on public.knowledge_section_versions from public,anon,authenticated;
grant select on public.knowledge_source_versions,public.knowledge_section_versions to authenticated;
create policy knowledge_versions_owner_read on public.knowledge_source_versions
  for select to authenticated using (user_id=(select auth.uid()));
create policy knowledge_sections_owner_read on public.knowledge_section_versions
  for select to authenticated using (user_id=(select auth.uid()));

create function public.lemma_reject_knowledge_snapshot_change() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  raise exception 'accepted_knowledge_is_immutable';
end;
$$;
revoke all on function public.lemma_reject_knowledge_snapshot_change() from public,anon,authenticated;
create trigger knowledge_source_versions_immutable before update or delete
  on public.knowledge_source_versions for each row
  execute function public.lemma_reject_knowledge_snapshot_change();
create trigger knowledge_section_versions_immutable before update or delete
  on public.knowledge_section_versions for each row
  execute function public.lemma_reject_knowledge_snapshot_change();

-- Client invokes this only after an explicit student acceptance action.
-- No tutor write endpoint or implicit proposal promotion is introduced.
create function lemma_private.commit_knowledge_source(
  p_context_id uuid, p_expected_context_revision bigint,
  p_source_id uuid, p_expected_source_revision bigint,
  p_request_id uuid, p_title text, p_source_type text,
  p_citation jsonb, p_sections jsonb
) returns bigint language plpgsql security definer set search_path='' as $$
declare
  v_uid uuid := auth.uid();
  v_context_revision bigint;
  v_previous public.knowledge_source_versions%rowtype;
  v_prior public.knowledge_source_versions%rowtype;
  v_source public.learning_sources%rowtype;
  v_hash text;
  v_next bigint;
  v_item jsonb;
  v_section uuid;
  v_existing_source uuid;
  v_seen uuid[] := '{}';
  v_locator text;
  v_section_title text;
  v_text text;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  if p_context_id is null or p_source_id is null or p_request_id is null
    or p_expected_context_revision is null or p_expected_context_revision<1
    or p_expected_source_revision is null or p_expected_source_revision<0
    or p_title is null or octet_length(btrim(p_title))=0 or octet_length(p_title)>512
    or p_source_type is null or p_source_type not in ('book','class_notes','paper','web','manual')
    or p_citation is null or pg_catalog.jsonb_typeof(p_citation)<>'object'
    or octet_length(p_citation::text)>4096
    or p_sections is null or pg_catalog.jsonb_typeof(p_sections)<>'array'
    or pg_catalog.jsonb_array_length(p_sections) not between 1 and 24
    or octet_length(p_sections::text)>230000 then
    raise exception 'invalid_knowledge_payload';
  end if;
  -- Validate all sections before creating any new rows. Per-item JSON size
  -- bounds the maximum escaped response and prevents oversized citations.
  for v_item in select value from pg_catalog.jsonb_array_elements(p_sections) loop
    if pg_catalog.jsonb_typeof(v_item)<>'object'
      or pg_catalog.jsonb_typeof(v_item->'section_id')<>'string'
      or (v_item->>'section_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or pg_catalog.jsonb_typeof(v_item->'locator')<>'string'
      or pg_catalog.jsonb_typeof(v_item->'title')<>'string'
      or pg_catalog.jsonb_typeof(v_item->'text')<>'string'
      or octet_length(v_item::text)>9000 then
      raise exception 'invalid_knowledge_section';
    end if;
    v_section := (v_item->>'section_id')::uuid;
    v_locator := v_item->>'locator';
    v_section_title := v_item->>'title';
    v_text := v_item->>'text';
    if v_section=any(v_seen) or octet_length(v_locator) not between 1 and 256
       or octet_length(v_section_title)>256 or char_length(v_text)>2000
       or octet_length(v_text)>8000 then
      raise exception 'invalid_knowledge_section';
    end if;
    v_seen := pg_catalog.array_append(v_seen,v_section);
  end loop;
  v_hash := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    pg_catalog.jsonb_build_array(p_context_id,p_expected_context_revision,
      p_source_id,p_expected_source_revision,p_title,p_source_type,p_citation,p_sections)::text,
    'UTF8')),'hex');
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_uid::text||':knowledge:'||p_source_id::text,0));
  select * into v_prior from public.knowledge_source_versions
    where user_id=v_uid and request_id=p_request_id;
  if found then
    if v_prior.source_id<>p_source_id or v_prior.payload_hash<>v_hash then
      raise exception 'idempotency_key_reused';
    end if;
    return v_prior.revision;
  end if;
  -- Lock the accepted context revision: concurrent edits cannot make the
  -- source reference stale before the acceptance transaction commits.
  select revision into v_context_revision from public.study_context_files
    where user_id=v_uid and id=p_context_id for share;
  if not found then raise exception 'knowledge_context_not_found'; end if;
  if v_context_revision<>p_expected_context_revision then
    raise exception 'stale_context_revision';
  end if;
  select * into v_previous from public.knowledge_source_versions
    where user_id=v_uid and source_id=p_source_id order by revision desc limit 1;
  if not found then
    if p_expected_source_revision<>0 then raise exception 'stale_source_revision'; end if;
    v_next := 1;
    -- Reuse a legacy owner source if present; never rewrite its contents.
    select * into v_source from public.learning_sources
      where user_id=v_uid and id=p_source_id for update;
    if not found then
      insert into public.learning_sources(user_id,id,title,source_type,citation)
        values(v_uid,p_source_id,p_title,p_source_type,p_citation);
    end if;
  else
    if v_previous.context_id<>p_context_id then
      raise exception 'knowledge_context_mismatch';
    end if;
    if v_previous.revision<>p_expected_source_revision then
      raise exception 'stale_source_revision';
    end if;
    v_next := v_previous.revision+1;
  end if;
  insert into public.knowledge_source_versions(
    user_id,context_id,context_revision,source_id,revision,
    title,source_type,citation,request_id,payload_hash)
  values(v_uid,p_context_id,p_expected_context_revision,p_source_id,v_next,
    p_title,p_source_type,p_citation,p_request_id,v_hash);
  -- Give new sections stable IDs in the existing source/section inventory,
  -- but do not overwrite any legacy text or accepted earlier snapshot.
  for v_item in select value from pg_catalog.jsonb_array_elements(p_sections) loop
    v_section := (v_item->>'section_id')::uuid;
    v_locator := v_item->>'locator';
    v_section_title := v_item->>'title';
    v_text := v_item->>'text';
    select source_id into v_existing_source from public.learning_sections
      where user_id=v_uid and id=v_section;
    if found then
      if v_existing_source<>p_source_id then raise exception 'section_source_mismatch'; end if;
    else
      insert into public.learning_sections(user_id,id,source_id,locator,title,text_content)
        values(v_uid,v_section,p_source_id,v_locator,v_section_title,v_text);
    end if;
    insert into public.knowledge_section_versions(
      user_id,source_id,source_revision,section_id,locator,title,text_content,text_sha256)
    values(v_uid,p_source_id,v_next,v_section,v_locator,v_section_title,v_text,
      pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(v_text,'UTF8')),'hex'));
  end loop;
  return v_next;
end;
$$;
revoke all on function lemma_private.commit_knowledge_source(
  uuid,bigint,uuid,bigint,uuid,text,text,jsonb,jsonb) from public,anon;
grant execute on function lemma_private.commit_knowledge_source(
  uuid,bigint,uuid,bigint,uuid,text,text,jsonb,jsonb) to authenticated;

create function public.commit_knowledge_source(
  p_context_id uuid, p_expected_context_revision bigint,
  p_source_id uuid, p_expected_source_revision bigint,
  p_request_id uuid, p_title text, p_source_type text,
  p_citation jsonb, p_sections jsonb
) returns bigint language sql security invoker set search_path='' as $$
  select lemma_private.commit_knowledge_source(p_context_id,p_expected_context_revision,
    p_source_id,p_expected_source_revision,p_request_id,p_title,p_source_type,
    p_citation,p_sections)
$$;
revoke all on function public.commit_knowledge_source(
  uuid,bigint,uuid,bigint,uuid,text,text,jsonb,jsonb) from public,anon;
grant execute on function public.commit_knowledge_source(
  uuid,bigint,uuid,bigint,uuid,text,text,jsonb,jsonb) to authenticated;

-- Return at most six excerpts from ONE explicitly pinned accepted revision.
-- Never fetch entire collection to truncate on the client. Section UUID is
-- the stable cursor; digest is over the exact accepted text bytes.
create function lemma_private.get_knowledge_excerpts(
  p_context_id uuid, p_source_id uuid, p_source_revision bigint,
  p_after_section_id uuid default null, p_limit integer default 6
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_uid uuid := auth.uid();
  v_source public.knowledge_source_versions%rowtype;
  v_items jsonb;
  v_count integer;
  v_packet jsonb;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  if p_context_id is null or p_source_id is null or p_source_revision is null
    or p_source_revision<1 or p_limit is null or p_limit not between 1 and 6 then
    raise exception 'invalid_knowledge_read';
  end if;
  select * into v_source from public.knowledge_source_versions
    where user_id=v_uid and context_id=p_context_id
      and source_id=p_source_id and revision=p_source_revision;
  if not found then raise exception 'knowledge_source_not_found'; end if;
  select count(*),
    coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'section_id',section_id,'locator',locator,'title',title,
      'text',text_content,'sha256',text_sha256) order by section_id)
      filter (where rn<=p_limit),'[]'::jsonb)
  into v_count,v_items
  from (
    select *,pg_catalog.row_number() over(order by section_id) rn
    from public.knowledge_section_versions
    where user_id=v_uid and source_id=p_source_id and source_revision=p_source_revision
      and (p_after_section_id is null or section_id>p_after_section_id)
    order by section_id limit (p_limit+1)
  ) page;
  v_packet := pg_catalog.jsonb_build_object(
    'context_id',v_source.context_id,'context_revision',v_source.context_revision,
    'source_id',v_source.source_id,'source_revision',v_source.revision,
    'title',v_source.title,'source_type',v_source.source_type,
    'citation',v_source.citation,'excerpts',v_items,
    'has_more',v_count>p_limit);
  if octet_length(v_packet::text)>65536 then
    raise exception 'knowledge_response_too_large';
  end if;
  return v_packet;
end;
$$;
revoke all on function lemma_private.get_knowledge_excerpts(uuid,uuid,bigint,uuid,integer)
  from public,anon;
grant execute on function lemma_private.get_knowledge_excerpts(uuid,uuid,bigint,uuid,integer)
  to authenticated;
create function public.get_knowledge_excerpts(
  p_context_id uuid, p_source_id uuid, p_source_revision bigint,
  p_after_section_id uuid default null, p_limit integer default 6
) returns jsonb language sql security invoker set search_path='' as $$
  select lemma_private.get_knowledge_excerpts(
    p_context_id,p_source_id,p_source_revision,p_after_section_id,p_limit)
$$;
revoke all on function public.get_knowledge_excerpts(uuid,uuid,bigint,uuid,integer)
  from public,anon;
grant execute on function public.get_knowledge_excerpts(uuid,uuid,bigint,uuid,integer)
  to authenticated;
notify pgrst,'reload schema';
