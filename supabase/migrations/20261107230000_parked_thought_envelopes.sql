-- N44.2.1: owner-bound envelope validator, no write path is opened yet.
-- N44.2.2 will use this validator in its command transaction and will
-- atomically activate audited writes, undo and the MCP registry.
create function public.parked_thoughts_validate_envelope(p jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $validate$
declare
  v_operation text;
  v_operation_id uuid;
  v_target jsonb;
  v_patch jsonb;
  v_allowed text[];
  v_bad text;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;
  if p is null or pg_catalog.jsonb_typeof(p) is distinct from 'object' then
    raise exception 'Command envelope must be an object';
  end if;
  select k into v_bad from pg_catalog.jsonb_object_keys(p) as keys(k)
    where k <> all(array['operationId','schemaVersion','resource',
      'operation','target','expectedVersion','patch']) limit 1;
  if v_bad is not null then raise exception 'Unknown command field: %',v_bad; end if;
  if nullif(p->>'operationId','') is null then
    raise exception 'operationId is required';
  end if;
  v_operation_id := (p->>'operationId')::uuid;
  if pg_catalog.jsonb_typeof(p->'schemaVersion') is distinct from 'number'
     or p->>'schemaVersion' is distinct from '1' then
    raise exception 'schemaVersion must be 1';
  end if;
  if p->>'resource' is distinct from 'parked_thoughts' then
    raise exception 'Unsupported resource';
  end if;
  v_operation := p->>'operation';
  if v_operation is null or v_operation not in
    ('create','edit','dismiss','reopen','delete','convert_to_task') then
    raise exception 'Unsupported thought operation';
  end if;

  v_target := coalesce(p->'target','{}'::jsonb);
  if pg_catalog.jsonb_typeof(v_target) is distinct from 'object' then
    raise exception 'target must be an object';
  end if;
  select k into v_bad from pg_catalog.jsonb_object_keys(v_target) as keys(k)
    where k <> 'id' limit 1;
  if v_bad is not null then raise exception 'Unknown target field: %',v_bad; end if;
  if v_operation <> 'create' and nullif(v_target->>'id','') is null then
    raise exception 'target.id is required';
  end if;
  if nullif(v_target->>'id','') is not null then
    perform (v_target->>'id')::uuid;
  end if;
  if v_operation = 'create' then
    if p?'expectedVersion' and
      (pg_catalog.jsonb_typeof(p->'expectedVersion') is distinct from 'number'
       or p->>'expectedVersion' is distinct from '0') then
      raise exception 'Create expectedVersion must be absent or zero';
    end if;
  else
    if pg_catalog.jsonb_typeof(p->'expectedVersion') is distinct from 'number'
       or p->>'expectedVersion' !~ '^[1-9][0-9]*$' then
      raise exception 'expectedVersion must be a positive integer';
    end if;
    if (p->>'expectedVersion')::numeric > 2147483647 then
      raise exception 'expectedVersion exceeds int4';
    end if;
  end if;

  v_patch := coalesce(p->'patch','{}'::jsonb);
  if pg_catalog.jsonb_typeof(v_patch) is distinct from 'object' then
    raise exception 'patch must be an object';
  end if;
  v_allowed := case v_operation
    when 'create' then array['text','study_entry_id']
    when 'edit' then array['text','study_entry_id']
    when 'convert_to_task' then array[
      'title','description','priority','due_date','due_at',
      'subject_id','project_id','checkpoint_id']
    else array[]::text[] end;
  select k into v_bad from pg_catalog.jsonb_object_keys(v_patch) as keys(k)
    where k <> all(v_allowed) limit 1;
  if v_bad is not null then raise exception 'Unknown patch field: %',v_bad; end if;
  if v_operation='create' and not (v_patch?'text') then
    raise exception 'Thought text required';
  end if;
  if v_operation='edit' and v_patch='{}'::jsonb then
    raise exception 'Edit patch must not be empty';
  end if;
  if v_patch?'text' and
      (pg_catalog.jsonb_typeof(v_patch->'text') is distinct from 'string'
       or pg_catalog.length(pg_catalog.btrim(v_patch->>'text')) not between 1 and 4000) then
    raise exception 'Thought text must be 1–4000 characters';
  end if;
  if v_patch?'study_entry_id' and v_patch->>'study_entry_id' is not null then
    perform (v_patch->>'study_entry_id')::uuid;
  end if;
  if v_operation='convert_to_task' and
    (pg_catalog.jsonb_typeof(v_patch->'title') is distinct from 'string'
     or pg_catalog.length(pg_catalog.btrim(v_patch->>'title'))=0) then
    raise exception 'Task title required';
  end if;
  -- No table access or mutation. Owner existence/version checks and
  -- task_command-equivalent conversion validation remain in N44.2.2.
  return p;
end
$validate$;
revoke all on function public.parked_thoughts_validate_envelope(jsonb) from public,anon;
grant execute on function public.parked_thoughts_validate_envelope(jsonb)
  to authenticated,service_role;
