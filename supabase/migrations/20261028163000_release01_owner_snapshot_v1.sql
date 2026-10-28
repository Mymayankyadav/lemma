-- RELEASE-01 R2e: one owner-scoped read-only snapshot of all 19 workspace tables.
-- Forward-only; depends on the TUTOR-01 receipts migration. No data writes.
-- STABLE reads under the calling statement's snapshot, rather than 19
-- independently paginated client requests. SECURITY INVOKER retains RLS.
-- Returned raw rows must still be sealed/validated by the client, and do not
-- constitute an authorized restore, authenticated signature, or backup UI.
create function public.capture_account_workspace_snapshot()
returns jsonb
language plpgsql stable security invoker
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_name text;
  v_rows jsonb;
  v_tables jsonb := '{}'::jsonb;
  v_total bigint := 0;
  v_bytes bigint := 0;
  v_payload jsonb;
begin
  if v_user is null then
    raise exception 'authentication_required';
  end if;
  -- This fixed inventory must be updated together with the release archive
  -- validator when a new owner-scoped table is introduced. Never silently
  -- return a partial backup.
  foreach v_name in array array[
    'client_mutation_receipts',
    'knowledge_section_versions',
    'knowledge_source_versions',
    'learning_card_links',
    'learning_events',
    'learning_sections',
    'learning_sessions',
    'learning_sources',
    'notes',
    'profiles',
    'review_events',
    'review_retractions',
    'study_checkpoints',
    'study_context_files',
    'study_context_revisions',
    'study_plan_versions',
    'study_plans',
    'tutor_handoff_receipts',
    'tutor_handoffs'
  ] loop
    execute pg_catalog.format(
      'select coalesce(jsonb_agg(to_jsonb(q)), ''[]''::jsonb) ' ||
      'from (select * from public.%I where user_id = $1 limit 100001) q',
      v_name
    ) into v_rows using v_user;
    if pg_catalog.jsonb_array_length(v_rows) > 100000 then
      raise exception 'workspace_snapshot_row_limit';
    end if;
    v_total := v_total + pg_catalog.jsonb_array_length(v_rows);
    if v_total > 200000 then
      raise exception 'workspace_snapshot_row_limit';
    end if;
    v_bytes := v_bytes + pg_catalog.octet_length(v_rows::text);
    if v_bytes > 64 * 1024 * 1024 then
      raise exception 'workspace_snapshot_byte_limit';
    end if;
    v_tables := v_tables || pg_catalog.jsonb_build_object(v_name,v_rows);
  end loop;
  v_payload := pg_catalog.jsonb_build_object(
    'app','lemma', 'schemaVersion',1, 'scope','account-workspace-raw',
    'capture','stable-calling-statement-snapshot',
    'ownerId',v_user,
    'capturedAt',pg_catalog.transaction_timestamp(),
    'tables',v_tables
  );
  if pg_catalog.octet_length(v_payload::text) > 64 * 1024 * 1024 then
    raise exception 'workspace_snapshot_byte_limit';
  end if;
  return v_payload;
end;
$$;

revoke all on function public.capture_account_workspace_snapshot() from public, anon;
grant execute on function public.capture_account_workspace_snapshot() to authenticated;
