-- N160 (area 28): chat controls the connected app. The app registers itself as a
-- device; chat sends one short-lived command to one device (open a screen or a
-- record, or a timer control); the app runs it with the same functions its own
-- buttons call and reports back `delivered`, then `applied` or `rejected`.
-- Nothing here reaches the operating system: permission prompts stay on the device.
create table public.app_devices (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 device_key text not null check (char_length(device_key) between 8 and 64),
 label text not null check (char_length(btrim(label)) between 1 and 40),
 platform text not null check (platform in ('web','android')),
 last_seen_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 version integer not null default 1 check (version > 0),
 unique (user_id,id),
 unique (user_id,device_key)
);
alter table public.app_devices enable row level security;
create policy app_devices_owner_select on public.app_devices for select to authenticated
 using (user_id = (select auth.uid()));
grant select on public.app_devices to authenticated;
revoke insert,update,delete,truncate on public.app_devices from anon,authenticated;
grant select,insert,update,delete on public.app_devices to service_role;

create table public.device_commands (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 device_id uuid not null,
 kind text not null check (kind in ('open','timer')),
 payload jsonb not null check (jsonb_typeof(payload) = 'object' and pg_column_size(payload) <= 1024),
 status text not null default 'pending'
  check (status in ('pending','delivered','applied','rejected','expired','cancelled')),
 reason text check (reason is null or char_length(reason) <= 200),
 source text not null default 'app' check (source in ('app','claude','chatgpt','other')),
 expires_at timestamptz not null,
 delivered_at timestamptz,
 applied_at timestamptz,
 version integer not null default 1 check (version > 0),
 created_at timestamptz not null default now(),
 unique (user_id,id),
 foreign key (user_id,device_id) references public.app_devices(user_id,id) on delete cascade
);
create index device_commands_pending on public.device_commands (user_id,device_id,created_at)
 where status in ('pending','delivered');
alter table public.device_commands enable row level security;
create policy device_commands_owner_select on public.device_commands for select to authenticated
 using (user_id = (select auth.uid()));
grant select on public.device_commands to authenticated;
revoke insert,update,delete,truncate on public.device_commands from anon,authenticated;
grant select,insert,update,delete on public.device_commands to service_role;
-- Live delivery: the app subscribes to its own rows (RLS applies); polling is the fallback.
do $realtime$
begin
 if exists(select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime') then
  alter publication supabase_realtime add table public.device_commands;
 end if;
end
$realtime$;

-- The app announces itself: one row per browser or phone, found again by its own key.
create function public.register_app_device(p_key text,p_label text,p_platform text)
returns jsonb language plpgsql security definer set search_path = '' as $register$
declare v_owner uuid := auth.uid(); v_row public.app_devices%rowtype;
begin
 if v_owner is null or pg_catalog.current_setting('role',true) <> 'authenticated' then
  raise exception 'Authenticated owner required'; end if;
 insert into public.app_devices(user_id,device_key,label,platform)
  values(v_owner,p_key,pg_catalog.btrim(p_label),p_platform)
  on conflict (user_id,device_key) do update set last_seen_at = pg_catalog.now(),
   label = excluded.label,platform = excluded.platform,
   version = case when public.app_devices.label is distinct from excluded.label
     or public.app_devices.platform is distinct from excluded.platform
     then public.app_devices.version + 1 else public.app_devices.version end
  returning * into v_row;
 return pg_catalog.jsonb_build_object('id',v_row.id,'label',v_row.label,'platform',v_row.platform);
end
$register$;
revoke all on function public.register_app_device(text,text,text) from public,anon,service_role;
grant execute on function public.register_app_device(text,text,text) to authenticated;

-- What this device should run now. Expired commands are closed here, never run.
create function public.device_commands_for(p_device uuid)
returns setof public.device_commands language plpgsql security definer set search_path = '' as $for$
declare v_owner uuid := auth.uid();
begin
 if v_owner is null or pg_catalog.current_setting('role',true) <> 'authenticated' then
  raise exception 'Authenticated owner required'; end if;
 update public.app_devices set last_seen_at = pg_catalog.now() where user_id = v_owner and id = p_device;
 update public.device_commands set status = 'expired',reason = 'expired before the device ran it',
  version = version + 1
  where user_id = v_owner and device_id = p_device and status in ('pending','delivered')
   and expires_at <= pg_catalog.now();
 return query select * from public.device_commands c where c.user_id = v_owner and c.device_id = p_device
  and c.status = 'pending' and c.expires_at > pg_catalog.now() order by c.created_at limit 10;
end
$for$;
revoke all on function public.device_commands_for(uuid) from public,anon,service_role;
grant execute on function public.device_commands_for(uuid) to authenticated;

-- The device's report: delivered, then applied or rejected. Late reports are refused.
create function public.device_command_report(p_id uuid,p_stage text,p_reason text default null)
returns jsonb language plpgsql security definer set search_path = '' as $report$
declare v_owner uuid := auth.uid(); v_row public.device_commands%rowtype;
begin
 if v_owner is null or pg_catalog.current_setting('role',true) <> 'authenticated' then
  raise exception 'Authenticated owner required'; end if;
 if p_stage not in ('delivered','applied','rejected') then raise exception 'stage must be delivered, applied or rejected'; end if;
 if p_reason is not null and pg_catalog.char_length(p_reason) > 200 then raise exception 'reason is too long'; end if;
 select * into v_row from public.device_commands where id = p_id and user_id = v_owner for update;
 if not found then raise exception 'Device command not found'; end if;
 if v_row.status in ('applied','rejected','expired','cancelled') then
  return pg_catalog.jsonb_build_object('status',v_row.status,'accepted',false); end if;
 if v_row.expires_at <= pg_catalog.now() then
  update public.device_commands set status = 'expired',reason = 'expired before the device ran it',version = version + 1 where id = p_id;
  return pg_catalog.jsonb_build_object('status','expired','accepted',false); end if;
 if p_stage = 'delivered' and v_row.status <> 'pending' then
  return pg_catalog.jsonb_build_object('status',v_row.status,'accepted',false); end if;
 update public.device_commands set status = p_stage,
  reason = case when p_stage = 'rejected' then coalesce(p_reason,'rejected by the device') else null end,
  delivered_at = coalesce(delivered_at,pg_catalog.now()),
  applied_at = case when p_stage = 'applied' then pg_catalog.now() else applied_at end,
  version = version + 1
  where id = p_id returning * into v_row;
 return pg_catalog.jsonb_build_object('status',v_row.status,'accepted',true);
end
$report$;
revoke all on function public.device_command_report(uuid,text,text) from public,anon,service_role;
grant execute on function public.device_command_report(uuid,text,text) to authenticated;

create function public.device_commands_command(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $dc$
declare
 v_owner uuid := auth.uid(); v_operation_id uuid; v_operation text; v_patch jsonb; v_target jsonb; v_bad text;
 v_stored jsonb; v_result jsonb; v_device public.app_devices%rowtype; v_row public.device_commands%rowtype;
 v_kind text; v_payload jsonb; v_minutes integer; v_expected integer; v_source text;
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
revoke all on function public.device_commands_command(jsonb) from public,anon;
grant execute on function public.device_commands_command(jsonb) to authenticated,service_role;

insert into public.lemma_command_resources(resource,command_fn,mcp_ok,"schema") values
 ('device_commands','device_commands_command',true,
  '{"operations":["send","cancel"],"fields":["device_id","kind","payload","status","reason","expires_at","delivered_at","applied_at"]}'::jsonb);
