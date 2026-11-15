-- N165: reviewed additive bug-hunt corrections; ordered part 10.
create or replace function public.device_commands_command(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $dc$
declare
 v_owner uuid := auth.uid(); v_operation_id uuid; v_operation text; v_patch jsonb; v_target jsonb; v_bad text;
 v_stored jsonb; v_result jsonb; v_device public.app_devices%rowtype; v_row public.device_commands%rowtype;
 v_entry public.study_entries%rowtype; v_kind text; v_payload jsonb; v_minutes integer; v_expected integer; v_source text;
begin
 if v_owner is null or pg_catalog.current_setting('role',true) not in ('authenticated','service_role') then
  raise exception 'Authentication required'; end if;
 if p is null or pg_catalog.jsonb_typeof(p) is distinct from 'object' then raise exception 'Command envelope must be an object'; end if;
 if nullif(p->>'operationId','') is null then raise exception 'operationId is required'; end if;
 v_operation_id := (p->>'operationId')::uuid;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text||':'||v_operation_id::text,0));
 select result into v_stored from public.command_receipts where user_id = v_owner and operation_id = v_operation_id;
 if found then
  if v_stored->'_request' = p then return v_stored - '_request'; end if;
  return pg_catalog.jsonb_build_object('operationId',v_operation_id,'status','conflict','changed','[]'::jsonb,
   'actionNo',null,'conflict',pg_catalog.jsonb_build_object('reason','operationId reused with a different payload'));
 end if;
 select key into v_bad from pg_catalog.jsonb_object_keys(p) as keys(key)
  where key <> all(array['operationId','schemaVersion','resource','operation','target','expectedVersion','patch']) limit 1;
 if v_bad is not null then raise exception 'Unknown command field: %',v_bad; end if;
 if pg_catalog.jsonb_typeof(p->'schemaVersion') is distinct from 'number' or p->>'schemaVersion' is distinct from '1' then
  raise exception 'schemaVersion must be 1'; end if;
 if p->>'resource' is distinct from 'device_commands' then raise exception 'Unsupported resource'; end if;
 v_operation := p->>'operation';
 if v_operation is null or v_operation not in ('send','cancel') then raise exception 'Unsupported device command operation'; end if;
 v_patch := coalesce(p->'patch','{}'::jsonb); v_target := coalesce(p->'target','{}'::jsonb);
 if pg_catalog.jsonb_typeof(v_patch) is distinct from 'object' or pg_catalog.jsonb_typeof(v_target) is distinct from 'object' then
  raise exception 'patch and target must be objects'; end if;
 select key into v_bad from pg_catalog.jsonb_object_keys(v_patch) as keys(key)
  where key <> all(case v_operation when 'send' then array['device_id','kind','payload','expires_in_minutes'] else array[]::text[] end) limit 1;
 if v_bad is not null then raise exception 'Unknown device command patch field: %',v_bad; end if;
 v_source := case when pg_catalog.current_setting('role',true) = 'service_role'
   and pg_catalog.current_setting('lemma.source',true) in ('claude','chatgpt','other') then pg_catalog.current_setting('lemma.source',true) else 'app' end;

 if v_operation = 'send' then
  select * into v_device from public.app_devices where user_id = v_owner and id = nullif(v_patch->>'device_id','')::uuid;
  if not found then raise exception 'Device not found for owner'; end if;
  v_kind := v_patch->>'kind'; v_payload := coalesce(v_patch->'payload','{}'::jsonb);
  if v_kind is null or v_kind not in ('open','timer') then raise exception 'kind must be open or timer'; end if;
  if pg_catalog.jsonb_typeof(v_payload) is distinct from 'object' then raise exception 'payload must be an object'; end if;
  if v_kind = 'open' then
   select key into v_bad from pg_catalog.jsonb_object_keys(v_payload) as keys(key) where key <> all(array['screen','record']) limit 1;
   if v_bad is not null then raise exception 'Unknown open payload field: %',v_bad; end if;
   if (v_payload ? 'screen') = (v_payload ? 'record') then raise exception 'open needs exactly one of screen or record'; end if;
   if v_payload ? 'screen' and (pg_catalog.jsonb_typeof(v_payload->'screen') is distinct from 'string'
     or v_payload->>'screen' <> all(array['today','paths','review','calendar','tasks','progress','log','focus','inbox','settings','atlas','cards'])) then
    raise exception 'Unknown screen'; end if;
   if v_payload ? 'record' and (pg_catalog.jsonb_typeof(v_payload->'record') is distinct from 'object'
     or v_payload->'record'->>'type' is null or v_payload->'record'->>'type' <> all(array['task','path','checkpoint'])
     or v_payload->'record'->>'id' !~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$'
     or (select count(*) from pg_catalog.jsonb_object_keys(v_payload->'record')) <> 2) then
    raise exception 'record needs a type (task, path or checkpoint) and a UUID id'; end if;
  else
   select key into v_bad from pg_catalog.jsonb_object_keys(v_payload) as keys(key) where key <> all(array['action','intent']) limit 1;
   if v_bad is not null then raise exception 'Unknown timer payload field: %',v_bad; end if;
   if pg_catalog.jsonb_typeof(v_payload->'action') is distinct from 'string'
     or v_payload->>'action' <> all(array['start','pause','resume','break','next_phase','save','discard']) then
    raise exception 'timer action must be start, pause, resume, break, next_phase, save or discard'; end if;
   if v_payload ? 'intent' and (v_payload->>'action' <> 'start' or pg_catalog.jsonb_typeof(v_payload->'intent') is distinct from 'string'
     or pg_catalog.char_length(v_payload->>'intent') not between 1 and 200) then
    raise exception 'intent is only for start (1..200 characters)'; end if;
  end if;
  if v_kind='timer' and v_payload->>'action'<>'start' then
   select * into v_entry from public.study_entries where user_id=v_owner and status in ('running','paused') order by created_at desc limit 1;
   if not found then raise exception 'No active timer to target'; end if;
   v_payload:=v_payload||jsonb_build_object('entryId',v_entry.id,'entryVersion',v_entry.version);
  end if;
  v_minutes := coalesce((v_patch->>'expires_in_minutes')::integer,2);
  if v_minutes not between 1 and 10 then raise exception 'expires_in_minutes must be 1..10'; end if;
  if (select count(*) from public.device_commands c where c.user_id = v_owner and c.device_id = v_device.id
     and c.status in ('pending','delivered') and c.expires_at > pg_catalog.now()) >= 20 then
   raise exception 'This device already has 20 commands waiting'; end if;
  insert into public.device_commands(user_id,device_id,kind,payload,source,expires_at)
   values(v_owner,v_device.id,v_kind,v_payload,v_source,pg_catalog.now() + pg_catalog.make_interval(mins => v_minutes))
   returning * into v_row;
  v_result := pg_catalog.jsonb_build_object('operationId',v_operation_id,'status','ok',
   'changed',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('id',v_row.id,'version',v_row.version)),
   'actionNo',null,'command_id',v_row.id,'expires_at',v_row.expires_at,
   'device_seen_minutes_ago',floor(extract(epoch from (pg_catalog.now() - v_device.last_seen_at)) / 60)::integer,
   'next','Read get(what=device_commands, id) until status is applied or rejected; a device that is closed leaves it pending until it expires.');
 else
  if nullif(v_target->>'id','') is null then raise exception 'target.id required'; end if;
  if pg_catalog.jsonb_typeof(p->'expectedVersion') is distinct from 'number' or p->>'expectedVersion' !~ '^[1-9][0-9]*$' then
   raise exception 'expectedVersion must be a positive integer'; end if;
  v_expected := (p->>'expectedVersion')::integer;
  select * into v_row from public.device_commands where id = (v_target->>'id')::uuid and user_id = v_owner for update;
  if not found then raise exception 'Device command not found'; end if;
  if v_row.version <> v_expected then
   v_result := pg_catalog.jsonb_build_object('operationId',v_operation_id,'status','conflict','changed','[]'::jsonb,'actionNo',null,
    'current',pg_catalog.jsonb_build_object('id',v_row.id,'status',v_row.status,'version',v_row.version),
    'conflict',pg_catalog.jsonb_build_object('expectedVersion',v_expected,'currentVersion',v_row.version));
  else
   if v_row.status not in ('pending','delivered') then raise exception 'Only a waiting command can be cancelled'; end if;
   update public.device_commands set status = 'cancelled',reason = 'cancelled from chat',version = version + 1
    where id = v_row.id returning * into v_row;
   v_result := pg_catalog.jsonb_build_object('operationId',v_operation_id,'status','ok',
    'changed',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('id',v_row.id,'version',v_row.version)),'actionNo',null);
  end if;
 end if;
 insert into public.command_receipts(user_id,operation_id,resource,result)
  values(v_owner,v_operation_id,'device_commands',v_result || pg_catalog.jsonb_build_object('_request',p));
 return v_result;
end
$dc$;

