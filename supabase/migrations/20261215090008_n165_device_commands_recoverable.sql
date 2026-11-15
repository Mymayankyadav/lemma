-- N165: reviewed additive bug-hunt corrections; ordered part 9.
create function public.device_commands_recoverable(p_device uuid)
returns setof public.device_commands language plpgsql security definer set search_path = '' as $for$
declare v_owner uuid := auth.uid();
begin
 if current_setting('role',true)<>'service_role' then perform set_config('lemma.source','app',true);perform set_config('lemma.tool','device_commands_recoverable',true);perform set_config('lemma.summary','device_commands_recoverable',true);end if;
 if v_owner is null or pg_catalog.current_setting('role',true) <> 'authenticated' then
  raise exception 'Authenticated owner required'; end if;
 update public.app_devices set last_seen_at = pg_catalog.now() where user_id = v_owner and id = p_device;
 update public.device_commands set status = 'expired',reason = 'expired before the device ran it',
  version = version + 1
  where user_id = v_owner and device_id = p_device and status in ('pending','delivered')
   and expires_at <= pg_catalog.now();
 return query select * from public.device_commands c where c.user_id = v_owner and c.device_id = p_device
  and c.status in ('pending','delivered') and c.expires_at > pg_catalog.now() order by c.created_at limit 10;
end
$for$;

revoke all on function public.device_commands_recoverable(uuid) from public,anon,service_role;grant execute on function public.device_commands_recoverable(uuid) to authenticated;

