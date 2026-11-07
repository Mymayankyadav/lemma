-- N41.2.2.2.1: read-only, owner-bound lifecycle preview. The final command
-- must still lock/recheck the row and reference state in its write transaction.
-- This function enables NO new write permission or undo/MCP registration.
create function public.lemma_preset_lifecycle_preview(p jsonb) returns jsonb
language plpgsql stable security invoker set search_path = '' as $preview$
declare
  v_owner uuid;
  v_operation_id uuid;
  v_op text;
  v_id uuid;
  v_expected integer;
  v_target jsonb;
  v_patch jsonb;
  v_bad text;
  v_row public.presets%rowtype;
  v_referenced boolean := false;
begin
  v_owner := (select auth.uid());
  if v_owner is null then raise exception 'Authentication required'; end if;
  if p is null or pg_catalog.jsonb_typeof(p) is distinct from 'object' then
    raise exception 'Lifecycle envelope must be an object';
  end if;
  select k into v_bad from pg_catalog.jsonb_object_keys(p) as keys(k)
    where k <> all(array['operationId','schemaVersion','resource',
      'operation','target','expectedVersion','patch']) limit 1;
  if v_bad is not null then raise exception 'Unknown lifecycle envelope field: %',v_bad; end if;
  if nullif(p->>'operationId','') is null then
    raise exception 'operationId is required';
  end if;
  v_operation_id := (p->>'operationId')::uuid;
  if pg_catalog.jsonb_typeof(p->'schemaVersion') is distinct from 'number'
    or p->>'schemaVersion' is distinct from '1' then
    raise exception 'schemaVersion must be 1';
  end if;
  if p->>'resource' is distinct from 'presets' then
    raise exception 'Unsupported lifecycle resource';
  end if;
  v_op := p->>'operation';
  if v_op is null or v_op not in ('archive','restore','delete') then
    raise exception 'Unsupported preset lifecycle operation';
  end if;
  v_patch := coalesce(p->'patch','{}'::jsonb);
  if pg_catalog.jsonb_typeof(v_patch) is distinct from 'object'
    or v_patch <> '{}'::jsonb then
    raise exception 'Lifecycle patch must be an empty object';
  end if;
  v_target := p->'target';
  if pg_catalog.jsonb_typeof(v_target) is distinct from 'object' then
    raise exception 'Lifecycle target must be an object';
  end if;
  select k into v_bad from pg_catalog.jsonb_object_keys(v_target) as keys(k)
    where k <> 'id' limit 1;
  if v_bad is not null then raise exception 'Unknown lifecycle target field: %',v_bad; end if;
  if nullif(v_target->>'id','') is null then
    raise exception 'Lifecycle target.id required';
  end if;
  v_id := (v_target->>'id')::uuid;
  if pg_catalog.jsonb_typeof(p->'expectedVersion') is distinct from 'number'
    or p->>'expectedVersion' !~ '^[1-9][0-9]*$' then
    raise exception 'Lifecycle expectedVersion must be positive whole number';
  end if;
  if (p->>'expectedVersion')::numeric > 2147483647 then
    raise exception 'Lifecycle expectedVersion exceeds int4';
  end if;
  v_expected := (p->>'expectedVersion')::integer;
  select * into v_row from public.presets
    where user_id=v_owner and id=v_id;
  if not found then raise exception 'Preset not found'; end if;
  if v_row.version <> v_expected then
    return pg_catalog.jsonb_build_object(
      'operationId',v_operation_id::text,'status','conflict',
      'id',v_id,'currentVersion',v_row.version);
  end if;
  if v_op='delete' then
    v_referenced := public.lemma_preset_has_entry_ref(v_owner,v_id);
  end if;
  return pg_catalog.jsonb_build_object(
    'operationId',v_operation_id::text,'status','ok',
    'id',v_id,'currentVersion',v_row.version,
    'archived',v_row.archived_at is not null,
    'effectiveOperation',case when v_op='delete' and v_referenced
      then 'archive' else v_op end,
    'referencesStudyEntries',v_referenced);
end
$preview$;
revoke all on function public.lemma_preset_lifecycle_preview(jsonb) from public,anon;
grant execute on function public.lemma_preset_lifecycle_preview(jsonb)
  to authenticated,service_role;
