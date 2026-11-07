-- N47.2.2: reusable, owner-authenticated envelope validation for
-- overlap acknowledgement commands. No DML or table policy changes.
-- N47.2.3 installs the auditable command, undo registration and MCP mapping.
create function public.overlap_ack_validate_envelope(p jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $validate$
declare
  v_op text;
  v_op_id uuid;
  v_target jsonb;
  v_patch jsonb;
  v_expected numeric;
  v_fields text[];
  v_bad text;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  if p is null or pg_catalog.jsonb_typeof(p) is distinct from 'object' then
    raise exception 'Command envelope must be an object';
  end if;
  select k into v_bad from pg_catalog.jsonb_object_keys(p) keys(k)
    where k <> all(array['operationId','schemaVersion','resource',
      'operation','target','patch','expectedVersion']) limit 1;
  if v_bad is not null then raise exception 'Unknown command field: %',v_bad; end if;
  if pg_catalog.jsonb_typeof(p->'operationId') is distinct from 'string' then
    raise exception 'operationId must be a UUID';
  end if;
  v_op_id := (p->>'operationId')::uuid;
  if pg_catalog.jsonb_typeof(p->'schemaVersion') is distinct from 'number'
    or p->>'schemaVersion' is distinct from '1' then
    raise exception 'schemaVersion must be 1';
  end if;
  if p->>'resource' is distinct from 'overlap_acknowledgements' then
    raise exception 'Unsupported resource';
  end if;
  v_op:=p->>'operation';
  if v_op is null or v_op not in ('create','update','delete') then
    raise exception 'Unsupported acknowledgement operation';
  end if;
  v_target:=coalesce(p->'target','{}'::jsonb);
  if pg_catalog.jsonb_typeof(v_target) is distinct from 'object' then
    raise exception 'target must be an object';
  end if;
  select k into v_bad from pg_catalog.jsonb_object_keys(v_target) keys(k)
    where k<>'id' limit 1;
  if v_bad is not null then raise exception 'Unknown target field: %',v_bad; end if;
  if v_op='create' then
    if p?'expectedVersion' and
      (pg_catalog.jsonb_typeof(p->'expectedVersion') is distinct from 'number'
       or p->>'expectedVersion' is distinct from '0') then
      raise exception 'Create expectedVersion must be zero or absent';
    end if;
  else
    if pg_catalog.jsonb_typeof(v_target->'id') is distinct from 'string' then
      raise exception 'target.id must be a UUID';
    end if;
    perform (v_target->>'id')::uuid;
    if pg_catalog.jsonb_typeof(p->'expectedVersion') is distinct from 'number'
      or p->>'expectedVersion' !~ '^[1-9][0-9]*$' then
      raise exception 'expectedVersion must be a positive integer';
    end if;
    v_expected:=(p->>'expectedVersion')::numeric;
    if v_expected>2147483647 then
      raise exception 'expectedVersion exceeds int4';
    end if;
  end if;

  v_patch:=coalesce(p->'patch','{}'::jsonb);
  if pg_catalog.jsonb_typeof(v_patch) is distinct from 'object' then
    raise exception 'patch must be an object';
  end if;
  v_fields:=case when v_op='delete' then array[]::text[]
    else array['participants','starts_at','ends_at','reason',
      'disposition','attributed_to'] end;
  select k into v_bad from pg_catalog.jsonb_object_keys(v_patch) keys(k)
    where k<>all(v_fields) limit 1;
  if v_bad is not null then raise exception 'Unknown patch field: %',v_bad; end if;
  if v_op='create' and
     (not (v_patch?'participants') or not (v_patch?'starts_at')
      or not (v_patch?'ends_at') or not (v_patch?'disposition')) then
    raise exception 'Create requires participants, starts_at, ends_at and disposition';
  end if;
  if v_op='update' and v_patch='{}'::jsonb then
    raise exception 'Update patch must not be empty';
  end if;
  if v_patch?'participants' and not public.overlap_ack_participants_valid(v_patch->'participants') then
    raise exception 'Participants must be 2-10 unique, versioned block/entry references';
  end if;
  if v_patch?'reason' and v_patch->'reason'<>'null'::jsonb and
    (pg_catalog.jsonb_typeof(v_patch->'reason') is distinct from 'string'
     or pg_catalog.length(v_patch->>'reason')>600) then
    raise exception 'reason exceeds 600 characters or is not a string';
  end if;
  if v_patch?'disposition' and (
    pg_catalog.jsonb_typeof(v_patch->'disposition') is distinct from 'string'
    or v_patch->>'disposition' not in ('keep_both','attribute_to')
  ) then
    raise exception 'Invalid disposition';
  end if;
  if v_op='create' and not public.overlap_ack_choice_valid(
      v_patch->'participants',v_patch->>'disposition',v_patch->'attributed_to'
    ) then
    raise exception 'Attribution must match an acknowledged participant';
  end if;
  -- Current participant ownership/version checks are enforced by the
  -- N47.1 guard trigger in N47.2.3's write transaction, not by this helper.
  return p;
end
$validate$;
revoke all on function public.overlap_ack_validate_envelope(jsonb) from public,anon;
grant execute on function public.overlap_ack_validate_envelope(jsonb) to authenticated,service_role;
