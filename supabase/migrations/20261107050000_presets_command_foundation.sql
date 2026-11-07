-- N41.2.1: owner-scoped, receipt-backed preset creation and editing.
-- N41.2.2 extends this invoker command with lifecycle operations and registers it
-- with the reviewed command/undo registries. Never route an incomplete command.
create function public.presets_command(p jsonb) returns jsonb
language plpgsql security invoker set search_path = ''
as $preset$
declare
  v_owner uuid;
  v_operation_id uuid;
  v_operation text;
  v_patch jsonb;
  v_target jsonb;
  v_id uuid;
  v_expected integer;
  v_bad text;
  v_old public.presets%rowtype;
  v_new public.presets%rowtype;
  v_stored jsonb;
  v_receipt jsonb;
  v_changed jsonb;
  v_action_no bigint;
  v_source text;
begin
  v_owner := (select auth.uid());
  if v_owner is null then raise exception 'Authentication required'; end if;
  if p is null or pg_catalog.jsonb_typeof(p) is distinct from 'object' then
    raise exception 'Command envelope must be an object';
  end if;
  if nullif(p ->> 'operationId','') is null then
    raise exception 'operationId is required';
  end if;
  v_operation_id := (p ->> 'operationId')::uuid;
  -- A retried operation must not race its first write.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_owner::text||':'||v_operation_id::text,0)
  );
  select r.result into v_stored from public.command_receipts r
    where r.user_id=v_owner and r.operation_id=v_operation_id;
  if found then
    if v_stored -> '_request' = p then return v_stored - '_request'; end if;
    return pg_catalog.jsonb_build_object(
      'operationId',v_operation_id::text,'status','conflict',
      'changed','[]'::jsonb,'actionNo',null,
      'conflict',pg_catalog.jsonb_build_object(
        'reason','operationId reused with a different payload')
    );
  end if;

  select k into v_bad from pg_catalog.jsonb_object_keys(p) as t(k)
    where k <> all(array['operationId','schemaVersion','resource',
      'operation','target','expectedVersion','patch']) limit 1;
  if v_bad is not null then raise exception 'Unknown command field: %',v_bad; end if;
  if pg_catalog.jsonb_typeof(p -> 'schemaVersion') is distinct from 'number'
      or p ->> 'schemaVersion' is distinct from '1' then
    raise exception 'schemaVersion must be 1';
  end if;
  if p ->> 'resource' is distinct from 'presets' then
    raise exception 'Unsupported resource';
  end if;
  v_operation := p ->> 'operation';
  if v_operation is null or v_operation not in ('create','update') then
    raise exception 'Unsupported preset operation';
  end if;

  v_patch := coalesce(p -> 'patch','{}'::jsonb);
  if pg_catalog.jsonb_typeof(v_patch) is distinct from 'object' then
    raise exception 'patch must be an object';
  end if;
  select k into v_bad from pg_catalog.jsonb_object_keys(v_patch) as t(k)
    where k <> all(case when v_operation='create' then
      array['label','subject_id','project_id','checkpoint_id','mode',
        'focus_minutes','break_minutes','long_break_minutes','cycles','position']
    else
      array['label','subject_id','project_id','checkpoint_id','mode',
        'focus_minutes','break_minutes','long_break_minutes','cycles']
    end) limit 1;
  if v_bad is not null then raise exception 'Unknown preset patch field: %',v_bad; end if;
  if v_operation='update' and v_patch='{}'::jsonb then
    raise exception 'Preset update is empty';
  end if;
  -- Do not silently cast a string or fraction into a numeric configuration.
  select k into v_bad from pg_catalog.jsonb_object_keys(v_patch) as t(k)
    where k in ('focus_minutes','break_minutes','long_break_minutes','cycles','position')
      and (pg_catalog.jsonb_typeof(v_patch -> k) is distinct from 'number'
        or v_patch ->> k !~ '^(0|[1-9][0-9]*)$') limit 1;
  if v_bad is not null then raise exception 'Invalid preset integer field: %',v_bad; end if;
  v_target := coalesce(p -> 'target','{}'::jsonb);
  if pg_catalog.jsonb_typeof(v_target) is distinct from 'object' then
    raise exception 'target must be an object';
  end if;
  select k into v_bad from pg_catalog.jsonb_object_keys(v_target) as t(k)
    where k <> 'id' limit 1;
  if v_bad is not null then raise exception 'Unknown target field: %',v_bad; end if;
  v_source := case
    when coalesce(pg_catalog.current_setting('role',true),'')='service_role' then 'mcp'
    else 'app' end;

  if v_operation='create' then
    if p ? 'expectedVersion' and p ->> 'expectedVersion' is distinct from '0' then
      raise exception 'create expectedVersion must be absent or 0';
    end if;
    v_id := coalesce(nullif(v_target ->> 'id','')::uuid,pg_catalog.gen_random_uuid());
    insert into public.presets (
      id,user_id,label,subject_id,project_id,checkpoint_id,mode,
      focus_minutes,break_minutes,long_break_minutes,cycles,position,source
    ) values (
      v_id,v_owner,v_patch ->> 'label',
      (v_patch ->> 'subject_id')::uuid,(v_patch ->> 'project_id')::uuid,
      (v_patch ->> 'checkpoint_id')::uuid,
      coalesce(v_patch ->> 'mode','pomodoro'),
      coalesce((v_patch ->> 'focus_minutes')::integer,25),
      coalesce((v_patch ->> 'break_minutes')::integer,5),
      coalesce((v_patch ->> 'long_break_minutes')::integer,15),
      coalesce((v_patch ->> 'cycles')::integer,4),
      coalesce((v_patch ->> 'position')::integer,0),v_source
    ) returning * into v_new;
  else
    if nullif(v_target ->> 'id','') is null then
      raise exception 'target.id required';
    end if;
    if pg_catalog.jsonb_typeof(p -> 'expectedVersion') is distinct from 'number'
      or p ->> 'expectedVersion' !~ '^[1-9][0-9]*$' then
      raise exception 'expectedVersion must be a positive integer';
    end if;
    v_id := (v_target ->> 'id')::uuid;
    v_expected := (p ->> 'expectedVersion')::integer;
    select * into v_old from public.presets
      where id=v_id and user_id=v_owner for update;
    if not found then raise exception 'Preset not found'; end if;
    if v_old.version is distinct from v_expected then
      v_receipt := pg_catalog.jsonb_build_object(
        'operationId',v_operation_id::text,'status','conflict',
        'changed','[]'::jsonb,'actionNo',null,
        'current',pg_catalog.to_jsonb(v_old),
        'conflict',pg_catalog.jsonb_build_object(
          'expectedVersion',v_expected,'currentVersion',v_old.version)
      );
    else
      -- Only approved mutable fields are copied from the patch. In particular,
      -- user_id, id, archive status, position, version and provenance are owned
      -- by the server, never by a caller-supplied JSON field.
      select * into v_new from pg_catalog.jsonb_populate_record(v_old,v_patch);
      update public.presets set
        label=v_new.label,subject_id=v_new.subject_id,
        project_id=v_new.project_id,checkpoint_id=v_new.checkpoint_id,
        mode=v_new.mode,focus_minutes=v_new.focus_minutes,
        break_minutes=v_new.break_minutes,long_break_minutes=v_new.long_break_minutes,
        cycles=v_new.cycles,version=version+1,source=v_source,updated_at=now()
      where id=v_id and user_id=v_owner returning * into v_new;
    end if;
  end if;
  if v_receipt is null then
    select a.no into v_action_no from public.actions a
      where a.txid=pg_catalog.txid_current() and a.user_id=v_owner;
    if v_action_no is null then raise exception 'Preset write has no journal action'; end if;
    v_changed := pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'id',v_new.id,'version',v_new.version));
    v_receipt := pg_catalog.jsonb_build_object(
      'operationId',v_operation_id::text,'status','ok',
      'changed',v_changed,'actionNo',v_action_no
    );
  end if;
  insert into public.command_receipts(user_id,operation_id,resource,result)
    values(v_owner,v_operation_id,'presets',v_receipt ||
      pg_catalog.jsonb_build_object('_request',p));
  return v_receipt;
end
$preset$;
revoke all on function public.presets_command(jsonb) from public,anon;
grant execute on function public.presets_command(jsonb) to authenticated;
