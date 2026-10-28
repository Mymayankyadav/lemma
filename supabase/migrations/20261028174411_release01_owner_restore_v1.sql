-- RELEASE-01: consented same-owner restore into an EMPTY workspace only.
-- No existing history is updated/deleted. A failed insert rolls back every row.
-- Operational receipts live outside the public learning-data inventory.
create table lemma_private.workspace_restore_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  archive_hash text not null,
  result jsonb not null,
  primary key(user_id,request_id)
);
alter table lemma_private.workspace_restore_receipts enable row level security;
revoke all on lemma_private.workspace_restore_receipts from public,anon,authenticated;

-- A private definer is necessary to INSERT immutable histories whose direct
-- writes are intentionally revoked. The fixed inventory, uid checks, empty
-- destination and real constraints apply to every call, including dry runs.
create function lemma_private.restore_account_workspace(
  p_archive jsonb, p_request_id uuid, p_dry_run boolean, p_confirm boolean
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_uid uuid := auth.uid();
  v_names text[] := array[
    'notes','profiles','client_mutation_receipts','study_plans',
    'study_context_files','study_context_revisions','learning_sources',
    'learning_sections','knowledge_source_versions','knowledge_section_versions',
    'study_plan_versions','learning_sessions','learning_events',
    'study_checkpoints','tutor_handoffs','tutor_handoff_receipts',
    'review_events','review_retractions','learning_card_links'
  ];
  v_name text; v_rows jsonb; v_keys text[]; v_columns text[];
  v_total bigint := 0; v_exists boolean; v_hash text; v_versions jsonb;
  v_prior lemma_private.workspace_restore_receipts%rowtype;
  v_result jsonb; v_max bigint; v_last bigint;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  if p_confirm is distinct from true or p_request_id is null or p_dry_run is null then
    raise exception 'explicit_restore_confirmation_required';
  end if;
  if p_archive is null or pg_catalog.octet_length(p_archive::text)>64*1024*1024
     or p_archive->>'app' is distinct from 'lemma'
     or p_archive->>'version' is distinct from '2'
     or p_archive->>'scope' is distinct from 'account-workspace'
     or p_archive->>'capture' is distinct from 'transactional'
     or p_archive->>'ownerId' is distinct from v_uid::text
     or pg_catalog.jsonb_typeof(p_archive->'tables') is distinct from 'object' then
    raise exception 'invalid_archive_or_owner';
  end if;
  select pg_catalog.jsonb_agg(version order by version) into v_versions
    from supabase_migrations.schema_migrations;
  if p_archive->'migrations' is distinct from v_versions then
    raise exception 'archive_schema_version_mismatch';
  end if;
  select array_agg(k order by k) into v_keys
    from pg_catalog.jsonb_object_keys(p_archive->'tables') k;
  if v_keys is distinct from (select array_agg(n order by n) from unnest(v_names) n) then
    raise exception 'incomplete_archive_inventory';
  end if;
  -- Bound lock waits; a restore cannot wait indefinitely behind live traffic.
  perform pg_catalog.set_config('lock_timeout','5s',true);
  -- Deterministic table lock order serializes restores with normal RPC/direct
  -- writes, closing the empty-check/insert race across ALL 19 tables.
  for v_name in select unnest(v_names) order by 1 loop
    execute pg_catalog.format('lock table public.%I in share row exclusive mode',v_name);
  end loop;
  v_hash := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_archive::text,'UTF8')),'hex');
  select * into v_prior from lemma_private.workspace_restore_receipts
    where user_id=v_uid and request_id=p_request_id;
  if found then
    if v_prior.archive_hash<>v_hash then raise exception 'restore_request_payload_mismatch'; end if;
    return v_prior.result;
  end if;
  foreach v_name in array v_names loop
    v_rows := p_archive->'tables'->v_name;
    if pg_catalog.jsonb_typeof(v_rows) is distinct from 'array' then
      raise exception 'invalid_archive_table';
    end if;
    v_total := v_total+pg_catalog.jsonb_array_length(v_rows);
    if pg_catalog.jsonb_array_length(v_rows)>100000 or v_total>200000 then
      raise exception 'archive_row_limit';
    end if;
    select array_agg(a.attname::text order by a.attname) into v_columns
      from pg_catalog.pg_attribute a
      where a.attrelid=pg_catalog.to_regclass('public.'||v_name)
        and a.attnum>0 and not a.attisdropped;
    -- No silently dropped fields or invented defaults. Snapshot rows must
    -- include exactly the actual database columns and the authenticated owner.
    if exists(select 1 from pg_catalog.jsonb_array_elements(v_rows) r
      where pg_catalog.jsonb_typeof(r) is distinct from 'object'
        or r->>'user_id' is distinct from v_uid::text
        or (select array_agg(k order by k) from pg_catalog.jsonb_object_keys(r) k)
          is distinct from v_columns) then
      raise exception 'archive_row_columns_or_owner_mismatch';
    end if;
    execute pg_catalog.format('select exists(select 1 from public.%I where user_id=$1)',v_name)
      into v_exists using v_uid;
    if v_exists then raise exception 'restore_destination_not_empty'; end if;
  end loop;
  -- Use a subtransaction even for preflight so PK/unique/FK/check/trigger
  -- validation is REAL. The dry-run exception rolls back all candidate rows.
  begin
    foreach v_name in array v_names loop
      execute pg_catalog.format('insert into public.%I overriding system value select * from jsonb_populate_recordset(null::public.%I,$1)',v_name,v_name)
        using p_archive->'tables'->v_name;
    end loop;
    if p_dry_run then raise exception using errcode='P0201',message='restore_dry_run_rollback'; end if;
  exception when sqlstate 'P0201' then
    return pg_catalog.jsonb_build_object('status','validated','ownerId',v_uid,
      'requestId',p_request_id,'rows',v_total,'tables',19);
  end;
  -- Preserve exact global event sequence IDs. Reject PK collisions rather than
  -- reassign history. Advance the generator only (never move it backwards).
  select max(seq) into v_max from public.learning_events;
  select last_value into v_last from public.learning_events_seq_seq;
  if v_max is not null and v_max>v_last then
    perform pg_catalog.setval('public.learning_events_seq_seq',v_max,true);
  end if;
  v_result:=pg_catalog.jsonb_build_object('status','restored','ownerId',v_uid,
    'requestId',p_request_id,'rows',v_total,'tables',19);
  insert into lemma_private.workspace_restore_receipts values(v_uid,p_request_id,v_hash,v_result);
  return v_result;
end;
$$;
revoke all on function lemma_private.restore_account_workspace(jsonb,uuid,boolean,boolean) from public,anon,authenticated;
grant execute on function lemma_private.restore_account_workspace(jsonb,uuid,boolean,boolean) to authenticated;
create function public.restore_account_workspace(
  p_archive jsonb, p_request_id uuid, p_dry_run boolean, p_confirm boolean
) returns jsonb language sql security invoker set search_path='' as $$
  select lemma_private.restore_account_workspace(p_archive,p_request_id,p_dry_run,p_confirm);
$$;
revoke all on function public.restore_account_workspace(jsonb,uuid,boolean,boolean) from public,anon;
grant execute on function public.restore_account_workspace(jsonb,uuid,boolean,boolean) to authenticated;
