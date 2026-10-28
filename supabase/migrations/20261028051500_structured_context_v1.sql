-- KNOWLEDGE-01 K2c: canonical structured accepted context v1, additive only.
-- Preserve legacy Markdown and all existing immutable snapshots. No auto-proposals.
alter table public.study_context_files add column accepted_json jsonb;
alter table public.study_context_revisions add column accepted_json jsonb;
alter table public.study_context_files add constraint context_structured_shape
  check (accepted_json is null or (
    pg_catalog.jsonb_typeof(accepted_json)='object'
    and accepted_json->'schema_version'='1'::jsonb
    and octet_length(accepted_json::text)<=32768));
alter table public.study_context_revisions add constraint context_revision_structured_shape
  check (accepted_json is null or (
    pg_catalog.jsonb_typeof(accepted_json)='object'
    and accepted_json->'schema_version'='1'::jsonb
    and octet_length(accepted_json::text)<=32768));

-- Retain the original K2a RPC for *legacy* Markdown contexts. Prevent it from
-- silently overwriting a newer structured accepted revision. Old idempotent
-- request replay still resolves before the new guard (no extra writes).
create or replace function lemma_private.commit_study_context(
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
    -- Markdown-only writes may not silently supersede a structured accepted context.
    if v_old.accepted_json is not null then
      raise exception 'structured_context_requires_v1_write';
    end if;
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
end;
$$;


create function lemma_private.commit_structured_study_context(
  p_context_id uuid, p_expected_revision bigint, p_request_id uuid,
  p_title text, p_context_markdown text, p_payload jsonb
) returns bigint language plpgsql security definer set search_path='' as $$
declare
  v_uid uuid := auth.uid();
  v_old public.study_context_files%rowtype;
  v_prior public.study_context_revisions%rowtype;
  v_next bigint;
  v_hash text;
  v_key text;
  v_field text;
  v_item jsonb;
  v_source_id uuid;
  v_source_revision bigint;
  v_event_id uuid;
  v_verified boolean;
  v_source_refs jsonb;
  v_canonical jsonb;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  if p_context_id is null or p_request_id is null or p_expected_revision is null
    or p_expected_revision<0 or p_title is null
    or octet_length(btrim(p_title))=0 or octet_length(p_title)>512
    or p_context_markdown is null or octet_length(p_context_markdown)>65536
    or p_payload is null or pg_catalog.jsonb_typeof(p_payload)<>'object'
    or octet_length(p_payload::text)>32768
    or pg_catalog.jsonb_typeof(p_payload->'schema_version')<>'number'
    or p_payload->'schema_version'<>'1'::jsonb then
    raise exception 'invalid_structured_context';
  end if;
  for v_key in select pg_catalog.jsonb_object_keys(p_payload) loop
    if v_key not in ('schema_version','goals','background','notation',
      'learning_preferences','source_refs','constraints',
      'recent_evidence_refs','planning_requests','summary') then
      raise exception 'invalid_structured_context';
    end if;
  end loop;
  if p_payload ? 'summary' and
    (pg_catalog.jsonb_typeof(p_payload->'summary')<>'string'
      or octet_length(p_payload->>'summary')>4096) then
    raise exception 'invalid_structured_context';
  end if;
  for v_field in select unnest(array['goals','notation','learning_preferences',
      'constraints','planning_requests']) loop
    if p_payload ? v_field then
      if pg_catalog.jsonb_typeof(p_payload->v_field)<>'array'
        or pg_catalog.jsonb_array_length(p_payload->v_field)>16 then
        raise exception 'invalid_structured_context';
      end if;
      for v_item in select value from pg_catalog.jsonb_array_elements(p_payload->v_field) loop
        if pg_catalog.jsonb_typeof(v_item)<>'string'
          or octet_length(v_item #>> '{}')>512
          or octet_length(btrim(v_item #>> '{}'))=0 then
          raise exception 'invalid_structured_context';
        end if;
      end loop;
    end if;
  end loop;
  if p_payload ? 'background' then
    if pg_catalog.jsonb_typeof(p_payload->'background')<>'array'
      or pg_catalog.jsonb_array_length(p_payload->'background')>20 then
      raise exception 'invalid_structured_context';
    end if;
    for v_item in select value from pg_catalog.jsonb_array_elements(p_payload->'background') loop
      if pg_catalog.jsonb_typeof(v_item)<>'object'
        or pg_catalog.jsonb_typeof(v_item->'statement')<>'string'
        or octet_length(v_item->>'statement') not between 1 and 1024
        or v_item->>'evidence_status' not in ('self_reported','demonstrated') then
        raise exception 'invalid_structured_background';
      end if;
      for v_key in select pg_catalog.jsonb_object_keys(v_item) loop
        if v_key not in ('statement','evidence_status','evidence_event_id') then
          raise exception 'invalid_structured_background';
        end if;
      end loop;
      if v_item->>'evidence_status'='demonstrated' then
        if pg_catalog.jsonb_typeof(v_item->'evidence_event_id')<>'string'
          or (v_item->>'evidence_event_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
          raise exception 'invalid_structured_background';
        end if;
      elsif v_item ? 'evidence_event_id' then
        raise exception 'invalid_structured_background';
      end if;
    end loop;
  end if;
  for v_field in select unnest(array['source_refs','recent_evidence_refs']) loop
    if p_payload ? v_field and (
      pg_catalog.jsonb_typeof(p_payload->v_field)<>'array'
      or pg_catalog.jsonb_array_length(p_payload->v_field)>20) then
      raise exception 'invalid_structured_context';
    end if;
  end loop;
  -- Normalize omitted optional arrays and summary, producing one canonical
  -- versioned packet regardless of tutor client JSON key order.
  v_canonical := pg_catalog.jsonb_build_object(
    'schema_version',1,'goals',coalesce(p_payload->'goals','[]'::jsonb),
    'background',coalesce(p_payload->'background','[]'::jsonb),
    'notation',coalesce(p_payload->'notation','[]'::jsonb),
    'learning_preferences',coalesce(p_payload->'learning_preferences','[]'::jsonb),
    'source_refs',coalesce(p_payload->'source_refs','[]'::jsonb),
    'constraints',coalesce(p_payload->'constraints','[]'::jsonb),
    'recent_evidence_refs',coalesce(p_payload->'recent_evidence_refs','[]'::jsonb),
    'planning_requests',coalesce(p_payload->'planning_requests','[]'::jsonb),
    'summary',coalesce(p_payload->'summary','""'::jsonb));
  if octet_length(v_canonical::text)>32768 then
    raise exception 'invalid_structured_context';
  end if;
  v_source_refs := v_canonical->'source_refs';
  -- Same serialization lock as legacy context CAS; no blind overwrite.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_uid::text || ':context:' || p_context_id::text,0));
  v_hash := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    pg_catalog.jsonb_build_array(p_context_id,p_expected_revision,
      p_title,p_context_markdown,v_canonical)::text,'UTF8')),'hex');
  select * into v_prior from public.study_context_revisions
    where user_id=v_uid and request_id=p_request_id;
  if found then
    if v_prior.context_id<>p_context_id or v_prior.payload_hash<>v_hash
      or v_prior.accepted_json is null then
      raise exception 'idempotency_key_reused';
    end if;
    return v_prior.revision;
  end if;
  select * into v_old from public.study_context_files
    where user_id=v_uid and id=p_context_id for update;
  if not found then
    if p_expected_revision<>0 then raise exception 'stale_context_revision'; end if;
    v_next := 1;
  else
    if v_old.revision<>p_expected_revision then raise exception 'stale_context_revision'; end if;
    v_next := v_old.revision+1;
  end if;
  -- Validate all references before inserts/updates; referenced source revisions
  -- must already be accepted in THIS owner/context and never be guessed by title.
  for v_item in select value from pg_catalog.jsonb_array_elements(v_source_refs) loop
    if pg_catalog.jsonb_typeof(v_item)<>'object'
      or pg_catalog.jsonb_typeof(v_item->'source_id')<>'string'
      or (v_item->>'source_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or pg_catalog.jsonb_typeof(v_item->'revision')<>'number'
      or (v_item->>'revision') !~ '^[1-9][0-9]{0,11}$'
      or pg_catalog.jsonb_object_length(v_item)<>2 then
      raise exception 'invalid_structured_source_ref';
    end if;
    v_source_id := (v_item->>'source_id')::uuid;
    v_source_revision := (v_item->>'revision')::bigint;
    if not exists (select 1 from public.knowledge_source_versions s
        where s.user_id=v_uid and s.context_id=p_context_id
          and s.source_id=v_source_id and s.revision=v_source_revision
          and s.context_revision<=p_expected_revision) then
      raise exception 'structured_source_not_accepted';
    end if;
  end loop;
  -- "demonstrated" requires an actual owner/context-scoped mastery event,
  -- not an unsupported tutor assertion.
  for v_item in select value from pg_catalog.jsonb_array_elements(v_canonical->'background') loop
    if v_item->>'evidence_status'='demonstrated' then
      v_event_id:=(v_item->>'evidence_event_id')::uuid;
      select exists (
        select 1 from public.learning_events e
        join public.learning_sessions l on l.user_id=e.user_id and l.id=e.session_id
        join public.study_plan_versions v on v.user_id=l.user_id and v.plan_id=l.plan_id
        where e.user_id=v_uid and e.event_id=v_event_id
          and e.event_type='mastery_evidence'
          and v.context_id=p_context_id and v.context_revision<=p_expected_revision
      ) into v_verified;
      if not v_verified then raise exception 'structured_evidence_not_found'; end if;
    end if;
  end loop;
  for v_item in select value from pg_catalog.jsonb_array_elements(v_canonical->'recent_evidence_refs') loop
    if pg_catalog.jsonb_typeof(v_item)<>'string'
      or (v_item #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'invalid_structured_evidence_ref';
    end if;
    v_event_id := (v_item #>> '{}')::uuid;
    if not exists (
      select 1 from public.learning_events e
      join public.learning_sessions l on l.user_id=e.user_id and l.id=e.session_id
      join public.study_plan_versions v on v.user_id=l.user_id and v.plan_id=l.plan_id
      where e.user_id=v_uid and e.event_id=v_event_id
        and v.context_id=p_context_id and v.context_revision<=p_expected_revision
    ) then raise exception 'structured_evidence_not_found'; end if;
  end loop;
  if v_old.id is null then
    insert into public.study_context_files
      (user_id,id,title,context_markdown,source_refs,revision,accepted_json,updated_at)
    values(v_uid,p_context_id,p_title,p_context_markdown,v_source_refs,1,v_canonical,clock_timestamp());
  else
    if not exists (select 1 from public.study_context_revisions
        where user_id=v_uid and context_id=p_context_id and revision=v_old.revision) then
      insert into public.study_context_revisions
        (user_id,context_id,revision,title,context_markdown,source_refs,origin,accepted_json)
      values(v_uid,p_context_id,v_old.revision,v_old.title,v_old.context_markdown,
        v_old.source_refs,'legacy_current_baseline',v_old.accepted_json);
    end if;
    update public.study_context_files
       set title=p_title,context_markdown=p_context_markdown,
         source_refs=v_source_refs,accepted_json=v_canonical,
         revision=v_next,updated_at=clock_timestamp()
     where user_id=v_uid and id=p_context_id;
  end if;
  insert into public.study_context_revisions
    (user_id,context_id,revision,title,context_markdown,source_refs,
      request_id,payload_hash,origin,accepted_json)
  values(v_uid,p_context_id,v_next,p_title,p_context_markdown,v_source_refs,
    p_request_id,v_hash,'accepted_write',v_canonical);
  return v_next;
end;
$$;
revoke all on function lemma_private.commit_structured_study_context(
  uuid,bigint,uuid,text,text,jsonb) from public,anon;
grant execute on function lemma_private.commit_structured_study_context(
  uuid,bigint,uuid,text,text,jsonb) to authenticated;
create function public.commit_structured_study_context(
  p_context_id uuid, p_expected_revision bigint, p_request_id uuid,
  p_title text, p_context_markdown text, p_payload jsonb
) returns bigint language sql security invoker set search_path='' as $$
  select lemma_private.commit_structured_study_context(
    p_context_id,p_expected_revision,p_request_id,p_title,p_context_markdown,p_payload)
$$;
revoke all on function public.commit_structured_study_context(uuid,bigint,uuid,text,text,jsonb)
  from public,anon;
grant execute on function public.commit_structured_study_context(uuid,bigint,uuid,text,text,jsonb)
  to authenticated;

-- Bounded accepted-context packet (one context revision, no whole collections).
create function lemma_private.get_accepted_study_context(
 p_context_id uuid,p_revision bigint default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_uid uuid := auth.uid();
 v_current public.study_context_files%rowtype;
 v_historical public.study_context_revisions%rowtype;
 v_payload jsonb;
begin
 if v_uid is null then raise exception 'authentication_required'; end if;
 if p_context_id is null or (p_revision is not null and p_revision<1) then
   raise exception 'invalid_context_read';
 end if;
 select * into v_current from public.study_context_files
   where user_id=v_uid and id=p_context_id;
 if not found then raise exception 'knowledge_context_not_found'; end if;
 if p_revision is null or p_revision=v_current.revision then
   v_payload := pg_catalog.jsonb_build_object(
     'context_id',v_current.id,'revision',v_current.revision,
     'title',v_current.title,'context_markdown',v_current.context_markdown,
     'source_refs',v_current.source_refs,'accepted_json',v_current.accepted_json);
 else
   select * into v_historical from public.study_context_revisions
     where user_id=v_uid and context_id=p_context_id and revision=p_revision;
   if not found then raise exception 'context_revision_unavailable'; end if;
   v_payload := pg_catalog.jsonb_build_object(
     'context_id',v_historical.context_id,'revision',v_historical.revision,
     'title',v_historical.title,'context_markdown',v_historical.context_markdown,
     'source_refs',v_historical.source_refs,'accepted_json',v_historical.accepted_json);
 end if;
 v_payload := v_payload || pg_catalog.jsonb_build_object(
   'format',case when v_payload->'accepted_json'='null'::jsonb
     then 'legacy_markdown' else 'structured_v1' end);
 if octet_length(v_payload::text)>110000 then
   raise exception 'context_response_too_large';
 end if;
 return v_payload;
end;
$$;
revoke all on function lemma_private.get_accepted_study_context(uuid,bigint) from public,anon;
grant execute on function lemma_private.get_accepted_study_context(uuid,bigint) to authenticated;
create function public.get_accepted_study_context(
 p_context_id uuid,p_revision bigint default null
) returns jsonb language sql security invoker set search_path='' as $$
  select lemma_private.get_accepted_study_context(p_context_id,p_revision)
$$;
revoke all on function public.get_accepted_study_context(uuid,bigint) from public,anon;
grant execute on function public.get_accepted_study_context(uuid,bigint) to authenticated;
notify pgrst,'reload schema';
