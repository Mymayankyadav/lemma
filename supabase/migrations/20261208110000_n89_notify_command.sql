-- N89: registered owner-scoped notification controls without exposing transport secrets.
-- Device subscriptions remain browser-only. Only holds enter the undo journal.
alter table public.push_devices
  add column version integer not null default 1 check (version > 0);
alter table public.notify_holds
  add column version integer not null default 1 check (version > 0);

-- Out-of-band browser registration, notification actions and worker writes also
-- advance the owner-visible version. Explicit version writes (including undo)
-- keep their chosen value.
create function public.notify_version_touch() returns trigger
language plpgsql security invoker set search_path = '' as $touch$
begin
  if new.version = old.version then new.version := old.version + 1; end if;
  return new;
end $touch$;
create trigger notify_device_version before update of
  label,platform,last_seen_at,last_ok_at,failures,disabled_at,disabled_reason,
  endpoint,p256dh,auth on public.push_devices
  for each row execute function public.notify_version_touch();
create trigger notify_hold_version before update of "until" on public.notify_holds
  for each row execute function public.notify_version_touch();
revoke all on function public.notify_version_touch() from public,anon,authenticated,service_role;

-- Unlike push_devices, the hold row has no transport credentials. Its
-- user_id/scope composite primary key is supported by the standard journal.
create trigger lemma_log_change after insert or update or delete
  on public.notify_holds for each row execute function public.log_change();
insert into public.lemma_undo_tables(table_name) values ('notify_holds');

create function public.notify_command(p jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $notify$
declare
  v_owner uuid := auth.uid();
  v_operation_id uuid;
  v_resource text;
  v_operation text;
  v_patch jsonb;
  v_target jsonb;
  v_bad text;
  v_expected integer;
  v_device public.push_devices%rowtype;
  v_hold public.notify_holds%rowtype;
  v_changed jsonb;
  v_safe jsonb;
  v_result jsonb;
  v_stored jsonb;
  v_action bigint;
  v_scope text;
  v_until timestamptz;
begin
  if v_owner is null then raise exception 'Authentication required'; end if;
  if p is null or pg_catalog.jsonb_typeof(p) is distinct from 'object' then
    raise exception 'Command envelope must be an object';
  end if;
  if nullif(p->>'operationId','') is null then
    raise exception 'operationId is required';
  end if;
  v_operation_id := (p->>'operationId')::uuid;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_owner::text||':'||v_operation_id::text,0));
  select result into v_stored from public.command_receipts
    where user_id=v_owner and operation_id=v_operation_id;
  if found then
    if v_stored->'_request'=p then return v_stored-'_request'; end if;
    return pg_catalog.jsonb_build_object(
      'operationId',v_operation_id,'status','conflict',
      'changed','[]'::jsonb,'actionNo',null,
      'conflict',pg_catalog.jsonb_build_object(
        'reason','operationId reused with a different payload'));
  end if;
  select key into v_bad from pg_catalog.jsonb_object_keys(p) as keys(key)
    where key <> all(array['operationId','schemaVersion','resource','operation',
      'target','expectedVersion','patch']) limit 1;
  if v_bad is not null then raise exception 'Unknown command field: %',v_bad; end if;
  if pg_catalog.jsonb_typeof(p->'schemaVersion') is distinct from 'number'
     or p->>'schemaVersion' is distinct from '1' then
    raise exception 'schemaVersion must be 1';
  end if;
  v_resource:=p->>'resource';
  v_operation:=p->>'operation';
  if (v_resource='push_devices' and v_operation in ('rename','disable','restore'))
    or (v_resource='notify_holds' and v_operation in ('create','update','delete')) then
    null;
  else
    raise exception 'Unsupported notification resource or operation';
  end if;
  v_patch:=coalesce(p->'patch','{}'::jsonb);
  v_target:=coalesce(p->'target','{}'::jsonb);
  if pg_catalog.jsonb_typeof(v_patch) is distinct from 'object'
     or pg_catalog.jsonb_typeof(v_target) is distinct from 'object' then
    raise exception 'patch and target must be objects';
  end if;
  select key into v_bad from pg_catalog.jsonb_object_keys(v_target) as keys(key)
    where key <> 'id' limit 1;
  if v_bad is not null then raise exception 'Unknown target field: %',v_bad; end if;
  select key into v_bad from pg_catalog.jsonb_object_keys(v_patch) as keys(key)
    where key <> all(case
      when v_resource='push_devices' and v_operation='rename' then array['label']
      when v_resource='notify_holds' and v_operation='create' then array['scope','until']
      when v_resource='notify_holds' and v_operation='update' then array['until']
      else array[]::text[] end)
    limit 1;
  if v_bad is not null then raise exception 'Unknown notification patch field: %',v_bad; end if;
  if coalesce(current_setting('role',true),'') <> 'service_role' then
    perform pg_catalog.set_config('lemma.source','app',true);
    perform pg_catalog.set_config('lemma.tool','notify_command',true);
    perform pg_catalog.set_config('lemma.summary',
      pg_catalog.left(v_resource||' '||v_operation,200),true);
  end if;

  if v_resource='push_devices' then
    if nullif(v_target->>'id','') is null then raise exception 'target.id required'; end if;
    if pg_catalog.jsonb_typeof(p->'expectedVersion') is distinct from 'number'
      or p->>'expectedVersion' !~ '^[1-9][0-9]*$' then
      raise exception 'expectedVersion must be positive integer';
    end if;
    v_expected:=(p->>'expectedVersion')::integer;
    select * into v_device from public.push_devices
      where id=(v_target->>'id')::uuid and user_id=v_owner for update;
    if not found then raise exception 'Device not found for owner'; end if;
    if v_device.version<>v_expected then
      v_safe:=pg_catalog.jsonb_build_object(
        'id',v_device.id,'version',v_device.version,'label',v_device.label,
        'platform',v_device.platform,'disabled_at',v_device.disabled_at,
        'disabled_reason',v_device.disabled_reason);
      v_result:=pg_catalog.jsonb_build_object(
        'operationId',v_operation_id,'status','conflict',
        'changed','[]'::jsonb,'actionNo',null,'current',v_safe,
        'conflict',pg_catalog.jsonb_build_object(
          'expectedVersion',v_expected,'currentVersion',v_device.version));
    else
      if v_operation='rename' then
        if pg_catalog.jsonb_typeof(v_patch->'label') is distinct from 'string'
          or pg_catalog.char_length(v_patch->>'label') not between 1 and 40 then
          raise exception 'Device label must contain 1..40 characters';
        end if;
        update public.push_devices set label=v_patch->>'label',version=version+1
          where id=v_device.id and user_id=v_owner returning * into v_device;
      elsif v_operation='disable' then
        if v_patch<>'{}'::jsonb then raise exception 'disable patch must be empty'; end if;
        update public.push_devices set
          disabled_at=pg_catalog.now(),disabled_reason='removed',version=version+1
          where id=v_device.id and user_id=v_owner returning * into v_device;
      else
        if v_patch<>'{}'::jsonb then raise exception 'restore patch must be empty'; end if;
        update public.push_devices set
          disabled_at=null,disabled_reason=null,version=version+1
          where id=v_device.id and user_id=v_owner returning * into v_device;
      end if;
      -- Deliberately never serialize the row: endpoint/p256dh/auth are secrets,
      -- and no device trigger may write the old row into action_changes.
      v_changed:=pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('id',v_device.id,'version',v_device.version));
      v_safe:=pg_catalog.jsonb_build_object(
        'id',v_device.id,'version',v_device.version,'label',v_device.label,
        'platform',v_device.platform,'disabled_at',v_device.disabled_at,
        'disabled_reason',v_device.disabled_reason);
      v_result:=pg_catalog.jsonb_build_object(
        'operationId',v_operation_id,'status','ok',
        'changed',v_changed,'actionNo',null,'current',v_safe);
    end if;
  else
    if v_operation='create' then
      if p ? 'expectedVersion' and p->>'expectedVersion' is distinct from '0' then
        raise exception 'create expectedVersion must be absent or 0';
      end if;
      if v_target<>'{}'::jsonb then raise exception 'Hold create cannot supply target'; end if;
      if pg_catalog.jsonb_typeof(v_patch->'scope') is distinct from 'string'
        or pg_catalog.char_length(v_patch->>'scope') not between 1 and 120 then
        raise exception 'Hold scope must contain 1..120 characters';
      end if;
      if pg_catalog.jsonb_typeof(v_patch->'until') is distinct from 'string' then
        raise exception 'Hold until must be an ISO timestamp';
      end if;
      v_scope:=v_patch->>'scope';
      v_until:=(v_patch->>'until')::timestamptz;
      insert into public.notify_holds(user_id,scope,"until")
        values(v_owner,v_scope,v_until) returning * into v_hold;
    else
      if pg_catalog.jsonb_typeof(v_target->'id') is distinct from 'string'
        or pg_catalog.char_length(v_target->>'id') not between 1 and 120 then
        raise exception 'Hold target.id must be the scope';
      end if;
      if pg_catalog.jsonb_typeof(p->'expectedVersion') is distinct from 'number'
        or p->>'expectedVersion' !~ '^[1-9][0-9]*$' then
        raise exception 'expectedVersion must be positive integer';
      end if;
      v_expected:=(p->>'expectedVersion')::integer;
      v_scope:=v_target->>'id';
      select * into v_hold from public.notify_holds
        where user_id=v_owner and scope=v_scope for update;
      if not found then raise exception 'Hold not found for owner'; end if;
      if v_hold.version<>v_expected then
        v_result:=pg_catalog.jsonb_build_object(
          'operationId',v_operation_id,'status','conflict',
          'changed','[]'::jsonb,'actionNo',null,
          'current',pg_catalog.jsonb_build_object(
            'id',v_hold.scope,'version',v_hold.version,'scope',v_hold.scope,
            'until',v_hold."until"),
          'conflict',pg_catalog.jsonb_build_object(
            'expectedVersion',v_expected,'currentVersion',v_hold.version));
      elsif v_operation='update' then
        if pg_catalog.jsonb_typeof(v_patch->'until') is distinct from 'string' then
          raise exception 'Hold update needs an ISO timestamp';
        end if;
        v_until:=(v_patch->>'until')::timestamptz;
        update public.notify_holds set "until"=v_until,version=version+1
          where user_id=v_owner and scope=v_scope returning * into v_hold;
      else
        if v_patch<>'{}'::jsonb then raise exception 'delete patch must be empty'; end if;
        delete from public.notify_holds where user_id=v_owner and scope=v_scope
          returning * into v_hold;
        v_hold.version:=v_hold.version+1;
      end if;
    end if;
    if v_result is null then
      select no into v_action from public.actions
        where txid=pg_catalog.txid_current() and user_id=v_owner;
      if v_action is null then raise exception 'Hold write has no undo action'; end if;
      v_result:=pg_catalog.jsonb_build_object(
        'operationId',v_operation_id,'status','ok',
        'changed',pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object('id',v_hold.scope,'version',v_hold.version)),
        'actionNo',v_action);
    end if;
  end if;
  insert into public.command_receipts(user_id,operation_id,resource,result)
    values(v_owner,v_operation_id,v_resource,
      v_result||pg_catalog.jsonb_build_object('_request',p));
  return v_result;
end $notify$;
revoke all on function public.notify_command(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.notify_command(jsonb) to authenticated,service_role;

insert into public.lemma_command_resources(resource,command_fn,mcp_ok,"schema") values
 ('push_devices','notify_command',true,
  '{"operations":["rename","disable","restore"],"fields":["label"]}'::jsonb),
 ('notify_holds','notify_command',true,
  '{"operations":["create","update","delete"],"fields":["scope","until"]}'::jsonb);
