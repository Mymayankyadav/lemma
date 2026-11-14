-- N164: what the buttons, the browser path and Settings' "Send a test" need. Everything is additive; the two service
-- functions are service-role only, request_notify_test is for the signed-in owner.

-- A Web Push result for one of the owner's browsers: success clears the failure count, a gone endpoint is disabled,
-- and a third failure in a row disables it as failing.
create function public.notify_web_record(p_user uuid,p_device uuid,p_result text) returns void
language plpgsql security definer set search_path = '' as $webrecord$
begin
 if pg_catalog.current_setting('role',true) <> 'service_role' then raise exception 'Service role required'; end if;
 if p_result not in ('sent','gone','retry','failed') then raise exception 'result must be sent, gone, retry or failed'; end if;
 if p_result = 'sent' then
  update public.push_devices set last_ok_at = pg_catalog.now(),failures = 0 where id = p_device and user_id = p_user;
 elsif p_result = 'gone' then
  update public.push_devices set disabled_at = pg_catalog.now(),disabled_reason = 'gone'
   where id = p_device and user_id = p_user and disabled_at is null;
 else
  update public.push_devices set failures = failures + 1,
   disabled_at = case when failures + 1 >= 3 then pg_catalog.now() else disabled_at end,
   disabled_reason = case when failures + 1 >= 3 then 'failing' else disabled_reason end
   where id = p_device and user_id = p_user and disabled_at is null;
 end if;
end
$webrecord$;
revoke all on function public.notify_web_record(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.notify_web_record(uuid,uuid,text) to service_role;

-- Settings' "Send a test reminder": queue one test row for the signed-in owner and ask the function to deliver it now.
-- At most one a minute. The tick's claim delivers it like any other queued reminder.
create function public.request_notify_test() returns jsonb
language plpgsql security definer set search_path = '' as $requesttest$
declare v_owner uuid := auth.uid(); v_id bigint;
begin
 if v_owner is null or pg_catalog.current_setting('role',true) <> 'authenticated' then
  raise exception 'Authenticated owner required'; end if;
 if exists (select 1 from public.notifications where user_id = v_owner and kind = 'test' and created_at > pg_catalog.now() - interval '1 minute') then
  raise exception 'A test reminder was sent a moment ago. Try again in a minute.'; end if;
 insert into public.notifications(user_id,kind,key,title,body,url,due_at)
  values(v_owner,'test','test:'||pg_catalog.gen_random_uuid()::text,'Reminders are on',
   'This is a test from Lemma. Reminders arrive here while the app is closed.','#/settings',pg_catalog.now())
  returning id into v_id;
 perform public.push_tick_kick();
 return pg_catalog.jsonb_build_object('id',v_id);
end
$requesttest$;
revoke all on function public.request_notify_test() from public,anon,service_role;
grant execute on function public.request_notify_test() to authenticated;
