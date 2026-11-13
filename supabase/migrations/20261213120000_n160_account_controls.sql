-- N160 (areas 26, 29): test notifications and the account and connection controls
-- that need an explicit confirmation. A confirmable action first returns a
-- short-lived token (`request`) and runs only when the same token comes back
-- (`confirm`) inside 5 minutes; a token is single-use and belongs to one owner
-- and one action. Account deletion is NOT here: it keeps the app's guarded flow.
create table public.account_confirmations (
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 action text not null check (action in ('disconnect_connector','disable_devices')),
 token uuid not null default gen_random_uuid(),
 expires_at timestamptz not null,
 used_at timestamptz,
 created_at timestamptz not null default now(),
 primary key (user_id,action)
);
alter table public.account_confirmations enable row level security;
-- No browser policy and no browser grant: tokens are read and written only by the command.
revoke insert,update,delete,truncate,select on public.account_confirmations from anon,authenticated;
grant select,insert,update,delete on public.account_confirmations to service_role;

create function public.account_controls_command(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $controls$
declare
 v_owner uuid := auth.uid(); v_operation_id uuid; v_operation text; v_patch jsonb; v_bad text;
 v_stored jsonb; v_result jsonb; v_action text; v_row public.account_confirmations%rowtype;
 v_n integer := 0; v_device uuid; v_key text; v_id bigint; v_changed jsonb := '[]'::jsonb; v_action_no bigint;
begin
 if v_owner is null or pg_catalog.current_setting('role',true) not in ('authenticated','service_role') then
  raise exception 'Authentication required'; end if;
 if p is null or pg_catalog.jsonb_typeof(p) is distinct from 'object' then
  raise exception 'Command envelope must be an object'; end if;
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
  where key <> all(array['operationId','schemaVersion','resource','operation','patch']) limit 1;
 if v_bad is not null then raise exception 'Unknown command field: %',v_bad; end if;
 if pg_catalog.jsonb_typeof(p->'schemaVersion') is distinct from 'number' or p->>'schemaVersion' is distinct from '1' then
  raise exception 'schemaVersion must be 1'; end if;
 if p->>'resource' is distinct from 'account_controls' then raise exception 'Unsupported resource'; end if;
 v_operation := p->>'operation';
 if v_operation is null or v_operation not in ('request','confirm','test_notification') then
  raise exception 'Unsupported account control operation'; end if;
 v_patch := coalesce(p->'patch','{}'::jsonb);
 if pg_catalog.jsonb_typeof(v_patch) is distinct from 'object' then raise exception 'patch must be an object'; end if;
 select key into v_bad from pg_catalog.jsonb_object_keys(v_patch) as keys(key)
  where key <> all(case v_operation when 'request' then array['action'] when 'confirm' then array['action','token']
   else array['device_id'] end) limit 1;
 if v_bad is not null then raise exception 'Unknown account control patch field: %',v_bad; end if;
 if pg_catalog.current_setting('role',true) <> 'service_role' then
  perform pg_catalog.set_config('lemma.source','app',true);
  perform pg_catalog.set_config('lemma.tool','account_controls_command',true);
  perform pg_catalog.set_config('lemma.summary',pg_catalog.left('Account control '||v_operation,200),true);
 end if;

 if v_operation = 'request' then
  v_action := v_patch->>'action';
  if v_action is null or v_action not in ('disconnect_connector','disable_devices') then
   raise exception 'action must be disconnect_connector or disable_devices'; end if;
  insert into public.account_confirmations(user_id,action,token,expires_at)
   values(v_owner,v_action,pg_catalog.gen_random_uuid(),pg_catalog.now() + interval '5 minutes')
   on conflict (user_id,action) do update set token = excluded.token,expires_at = excluded.expires_at,
    used_at = null,created_at = pg_catalog.now()
   returning * into v_row;
  v_result := pg_catalog.jsonb_build_object('operationId',v_operation_id,'status','ok','changed','[]'::jsonb,
   'actionNo',null,'confirm',pg_catalog.jsonb_build_object('action',v_action,'token',v_row.token,
    'expires_at',v_row.expires_at,'effect',case v_action
     when 'disconnect_connector' then 'This chat connection stops working at once. The owner copies the new connector link from Lemma Settings to reconnect.'
     else 'Every registered phone and browser stops receiving notifications until it is restored in Settings.' end),
   'next','Tell the owner exactly what will happen and ask them to confirm. Only after they say yes, call confirm with this token.');
 elsif v_operation = 'confirm' then
  v_action := v_patch->>'action';
  select * into v_row from public.account_confirmations where user_id = v_owner and action = v_action for update;
  if not found or v_row.used_at is not null or v_row.token::text is distinct from v_patch->>'token'
    or v_row.expires_at < pg_catalog.now() then
   raise exception 'Confirmation is missing, used, expired or for another action; request it again'; end if;
  update public.account_confirmations set used_at = pg_catalog.now() where user_id = v_owner and action = v_action;
  if v_action = 'disconnect_connector' then
   -- The new link is never returned here: only the owner reads it, in Settings.
   update public.settings set connector_secret = pg_catalog.encode(extensions.gen_random_bytes(24),'hex')
    where user_id = v_owner;
   v_n := 1;
  else
   update public.push_devices set disabled_at = pg_catalog.now(),disabled_reason = 'removed',version = version + 1
    where user_id = v_owner and disabled_at is null;
   get diagnostics v_n = row_count;
  end if;
  select no into v_action_no from public.actions where txid = pg_catalog.txid_current() and user_id = v_owner;
  v_result := pg_catalog.jsonb_build_object('operationId',v_operation_id,'status','ok','changed','[]'::jsonb,
   'actionNo',v_action_no,'done',v_action,'affected',v_n);
 else
  if v_patch ? 'device_id' then
   v_device := (v_patch->>'device_id')::uuid;
   if not exists(select 1 from public.push_devices where user_id = v_owner and id = v_device and disabled_at is null) then
    raise exception 'Device not found for owner'; end if;
  end if;
  v_key := 'test:'||(p->>'operationId');
  insert into public.notifications(user_id,kind,key,title,body,url,facts,due_at)
   values(v_owner,'test',v_key,'Lemma test','This notification was sent from chat.','/',
    case when v_device is null then '{}'::jsonb else pg_catalog.jsonb_build_object('device_id',v_device) end,
    pg_catalog.now())
   returning id into v_id;
  v_result := pg_catalog.jsonb_build_object('operationId',v_operation_id,'status','ok',
   'changed',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('id',v_id,'version',1)),
   'actionNo',null,'notification_id',v_id,
   'next','Delivery is confirmed when get(what=notifications, id) shows status sent.');
 end if;
 insert into public.command_receipts(user_id,operation_id,resource,result)
  values(v_owner,v_operation_id,'account_controls',v_result || pg_catalog.jsonb_build_object('_request',p));
 return v_result;
end
$controls$;
revoke all on function public.account_controls_command(jsonb) from public,anon;
grant execute on function public.account_controls_command(jsonb) to authenticated,service_role;

insert into public.lemma_command_resources(resource,command_fn,mcp_ok,"schema") values
 ('account_controls','account_controls_command',true,
  '{"operations":["request","confirm","test_notification"],"fields":["action","token","device_id"]}'::jsonb);
