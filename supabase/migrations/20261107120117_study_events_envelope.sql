-- N50.2.1: read-only, owner-authenticated event command envelope validator.
-- N50.2.2 repeats stored-row, related-record, version and owner checks under
-- a transaction before it activates write policies, receipts, undo or MCP.
create function public.study_events_validate_envelope(p jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $validate$
declare
  op text; target jsonb; patch jsonb; allowed text[]; bad text;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  if p is null or pg_catalog.jsonb_typeof(p) is distinct from 'object' then
    raise exception 'Command envelope must be an object'; end if;
  select k into bad from pg_catalog.jsonb_object_keys(p) as keys(k)
    where k <> all(array['operationId','schemaVersion','resource',
      'operation','target','expectedVersion','patch']) limit 1;
  if bad is not null then raise exception 'Unknown command field: %',bad; end if;
  if pg_catalog.jsonb_typeof(p->'operationId') is distinct from 'string'
    or nullif(p->>'operationId','') is null then
    raise exception 'operationId must be a UUID'; end if;
  perform (p->>'operationId')::uuid;
  if pg_catalog.jsonb_typeof(p->'schemaVersion') is distinct from 'number'
    or p->>'schemaVersion' is distinct from '1' then
    raise exception 'schemaVersion must be 1'; end if;
  if p->>'resource' is distinct from 'study_events' then
    raise exception 'Unsupported event resource'; end if;
  op:=p->>'operation';
  if op is null or op not in ('record','edit','void','restore') then
    raise exception 'Unsupported event operation'; end if;
  target:=coalesce(p->'target','{}'::jsonb);
  if pg_catalog.jsonb_typeof(target) is distinct from 'object' then
    raise exception 'target must be an object'; end if;
  select k into bad from pg_catalog.jsonb_object_keys(target) as keys(k)
    where k<>'id' limit 1;
  if bad is not null then raise exception 'Unknown target field: %',bad; end if;
  if target?'id' then
    if pg_catalog.jsonb_typeof(target->'id') is distinct from 'string'
      or nullif(target->>'id','') is null then
      raise exception 'target.id must be a UUID'; end if;
    perform (target->>'id')::uuid;
  elsif op<>'record' then
    raise exception 'target.id required for versioned event';
  end if;
  if op='record' then
    if p?'expectedVersion' and
      (pg_catalog.jsonb_typeof(p->'expectedVersion') is distinct from 'number'
       or p->>'expectedVersion' is distinct from '0') then
      raise exception 'record expectedVersion must be absent or zero'; end if;
  else
    if pg_catalog.jsonb_typeof(p->'expectedVersion') is distinct from 'number'
      or p->>'expectedVersion' !~ '^[1-9][0-9]*$' then
      raise exception 'expectedVersion must be a positive integer'; end if;
    if (p->>'expectedVersion')::numeric>2147483647 then
      raise exception 'expectedVersion exceeds int4'; end if;
  end if;
  patch:=coalesce(p->'patch','{}'::jsonb);
  if pg_catalog.jsonb_typeof(patch) is distinct from 'object' then
    raise exception 'patch must be an object'; end if;
  allowed:=case when op in ('record','edit') then
    array['entry_id','kind','occurred_at','duration_minutes','note']
    else array[]::text[] end;
  select k into bad from pg_catalog.jsonb_object_keys(patch) as keys(k)
    where k <> all(allowed) limit 1;
  if bad is not null then raise exception 'Unknown event patch field: %',bad; end if;
  if op='record' and (not(patch?'entry_id') or not(patch?'kind')) then
    raise exception 'record requires entry_id and kind'; end if;
  if op='edit' and patch='{}'::jsonb then
    raise exception 'edit patch must not be empty'; end if;
  if patch?'entry_id' then
    if pg_catalog.jsonb_typeof(patch->'entry_id') is distinct from 'string'
      or nullif(patch->>'entry_id','') is null then
      raise exception 'entry_id must be a UUID'; end if;
    perform (patch->>'entry_id')::uuid;
  end if;
  if patch?'kind' and
    (pg_catalog.jsonb_typeof(patch->'kind') is distinct from 'string'
      or patch->>'kind' not in ('notice','drift','urge')) then
    raise exception 'Invalid event kind'; end if;
  if patch?'duration_minutes' and patch->'duration_minutes'<>'null'::jsonb then
    if pg_catalog.jsonb_typeof(patch->'duration_minutes') is distinct from 'number'
      or patch->>'duration_minutes' !~ '^[1-9][0-9]*$' then
      raise exception 'duration_minutes must be positive whole minutes'; end if;
    if (patch->>'duration_minutes')::numeric>100000 then
      raise exception 'duration_minutes exceeds 100000'; end if;
    if patch?'kind' and patch->>'kind'<>'drift' then
      raise exception 'Only drift may carry duration_minutes'; end if;
  end if;
  if patch?'occurred_at' then
    if pg_catalog.jsonb_typeof(patch->'occurred_at') is distinct from 'string'
      or patch->>'occurred_at' !~
        '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$' then
      raise exception 'occurred_at needs a timezone-aware ISO instant'; end if;
    perform (patch->>'occurred_at')::timestamptz;
  end if;
  if patch?'note' and patch->'note'<>'null'::jsonb and
    (pg_catalog.jsonb_typeof(patch->'note') is distinct from 'string'
      or pg_catalog.length(patch->>'note')>2000) then
    raise exception 'note must be at most 2000 characters'; end if;
  -- Partial edits are not authorized writes. N50.2.2 rechecks the current
  -- stored kind, owner, versions and related references transactionally.
  return p;
end
$validate$;
revoke all on function public.study_events_validate_envelope(jsonb) from public,anon;
grant execute on function public.study_events_validate_envelope(jsonb) to authenticated,service_role;
