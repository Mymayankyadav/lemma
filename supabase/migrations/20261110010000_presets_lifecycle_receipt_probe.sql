-- N41.2.2.2.2.2.1: receipt probe for archive/restore/delete.
-- The following N41.2.2.2.2.2.2 command will call this *inside the same
-- transaction* before trying to lock a preset row. An exact delete retry must
-- replay its receipt even when the original row no longer exists.
-- Acquiring an advisory transaction lock here serializes operationId checks
-- with public.presets_command. Standalone probes are NOT durable reservations.
-- No preset DML, undo registration or registry activation is added here.
create function public.lemma_preset_lifecycle_receipt_probe(p jsonb)
returns jsonb language plpgsql volatile security invoker
set search_path = '' as $probe$
declare
  v_owner uuid;
  v_operation_id uuid;
  v_operation text;
  v_target jsonb;
  v_patch jsonb;
  v_bad text;
  v_expected numeric;
  v_stored jsonb;
  v_stored_resource text;
  v_conflict jsonb;
begin
  v_owner := (select auth.uid());
  if v_owner is null then raise exception 'Authentication required'; end if;
  if p is null or pg_catalog.jsonb_typeof(p) is distinct from 'object' then
    raise exception 'Lifecycle envelope must be an object';
  end if;
  select k into v_bad from pg_catalog.jsonb_object_keys(p) as keys(k)
    where k <> all(array['operationId','schemaVersion','resource',
      'operation','target','expectedVersion','patch']) limit 1;
  if v_bad is not null then
    raise exception 'Unknown lifecycle envelope field: %',v_bad;
  end if;
  if pg_catalog.jsonb_typeof(p->'operationId') is distinct from 'string' then
    raise exception 'operationId must be a UUID string';
  end if;
  v_operation_id := (p->>'operationId')::uuid;
  if pg_catalog.jsonb_typeof(p->'schemaVersion') is distinct from 'number'
    or p->>'schemaVersion' is distinct from '1' then
    raise exception 'schemaVersion must be 1';
  end if;
  if p->>'resource' is distinct from 'presets' then
    raise exception 'Unsupported lifecycle resource';
  end if;
  v_operation := p->>'operation';
  if v_operation is null or v_operation not in ('archive','restore','delete') then
    raise exception 'Unsupported preset lifecycle operation';
  end if;
  v_target := p->'target';
  if pg_catalog.jsonb_typeof(v_target) is distinct from 'object' then
    raise exception 'Lifecycle target must be an object';
  end if;
  select k into v_bad from pg_catalog.jsonb_object_keys(v_target) as keys(k)
    where k <> 'id' limit 1;
  if v_bad is not null then
    raise exception 'Unknown lifecycle target field: %',v_bad;
  end if;
  if pg_catalog.jsonb_typeof(v_target->'id') is distinct from 'string' then
    raise exception 'Lifecycle target.id must be a UUID';
  end if;
  perform (v_target->>'id')::uuid;
  if pg_catalog.jsonb_typeof(p->'expectedVersion') is distinct from 'number'
    or p->>'expectedVersion' !~ '^[1-9][0-9]*$' then
    raise exception 'Lifecycle expectedVersion must be a positive integer';
  end if;
  v_expected := (p->>'expectedVersion')::numeric;
  if v_expected > 2147483647 then
    raise exception 'Lifecycle expectedVersion exceeds int4';
  end if;
  v_patch := coalesce(p->'patch','{}'::jsonb);
  if pg_catalog.jsonb_typeof(v_patch) is distinct from 'object'
    or v_patch <> '{}'::jsonb then
    raise exception 'Lifecycle patch must be an empty object';
  end if;

  -- The operationId is owner-scoped. A concurrent caller of the old or new
  -- presets command uses the same advisory lock; no race across retries.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_owner::text||':'||v_operation_id::text,0)
  );
  select resource,result into v_stored_resource,v_stored
    from public.command_receipts
    where user_id=v_owner and operation_id=v_operation_id;
  if found then
    if v_stored_resource='presets' and v_stored->'_request'=p then
      return pg_catalog.jsonb_build_object(
        'operationId',v_operation_id::text,'status','replay',
        'receipt',v_stored-'_request');
    end if;
    v_conflict := pg_catalog.jsonb_build_object(
      'operationId',v_operation_id::text,
      'status','conflict','changed','[]'::jsonb,'actionNo',null,
      'conflict',pg_catalog.jsonb_build_object(
        'reason','operationId reused with a different payload'));
    return pg_catalog.jsonb_build_object(
      'operationId',v_operation_id::text,'status','conflict',
      'receipt',v_conflict);
  end if;
  -- No row lookup is allowed before the receipt probe. A new command's
  -- target existence/version/reference checks remain with the row-lock
  -- helper and N41.2.2.2.2.2.2's actual transaction.
  return pg_catalog.jsonb_build_object(
    'operationId',v_operation_id::text,'status','new');
end
$probe$;
revoke all on function public.lemma_preset_lifecycle_receipt_probe(jsonb)
  from public,anon;
grant execute on function public.lemma_preset_lifecycle_receipt_probe(jsonb)
  to authenticated,service_role;
