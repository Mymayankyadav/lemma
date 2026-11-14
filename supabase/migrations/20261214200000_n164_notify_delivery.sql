-- N164.1 (Owner: "Ok let's setup fcm", scope "Timer and all notify kinds"): the delivery tick for reminders. The `push`
-- Edge function runs the existing, tested runNotifyTick on a schedule; these are its database operations, all
-- service-role only. Rows of public.notifications are the queue: 'queued' rows whose due_at has passed are claimed
-- once (at most once: a claimed row is marked 'sent' before it is sent and 'failed' if nothing could be delivered).
-- Everything is additive.

-- Owners who turned reminders on and have somewhere to deliver them (an FCM token or a browser).
create function public.notify_enabled_owners(p_limit integer default 200) returns setof uuid
language plpgsql stable security definer set search_path = '' as $owners$
begin
 if pg_catalog.current_setting('role',true) <> 'service_role' then raise exception 'Service role required'; end if;
 return query select s.user_id from public.settings s
  where s.notify is not null and s.notify->>'enabled' = 'true'
   and (exists (select 1 from public.device_push_tokens t where t.user_id = s.user_id)
     or exists (select 1 from public.push_devices d where d.user_id = s.user_id and d.disabled_at is null))
  order by s.user_id limit least(greatest(p_limit,1),500);
end
$owners$;
revoke all on function public.notify_enabled_owners(integer) from public,anon,authenticated;
grant execute on function public.notify_enabled_owners(integer) to service_role;

-- Queue the reminders the rules decided to send. One row per (owner, key): a key already used is not queued again.
-- p_rows: [{kind,key,title,body,url,facts?}]; returns how many rows were new.
create function public.notify_queue(p_user uuid,p_rows jsonb) returns integer
language plpgsql security definer set search_path = '' as $queue$
declare v_row jsonb; v_count integer := 0; v_new integer;
begin
 if pg_catalog.current_setting('role',true) <> 'service_role' then raise exception 'Service role required'; end if;
 if p_user is null or p_rows is null or pg_catalog.jsonb_typeof(p_rows) <> 'array' or pg_catalog.jsonb_array_length(p_rows) > 50 then
  raise exception 'p_rows must be an array of at most 50 reminders'; end if;
 for v_row in select * from pg_catalog.jsonb_array_elements(p_rows) loop
  if pg_catalog.jsonb_typeof(v_row) <> 'object' then raise exception 'each reminder must be an object'; end if;
  insert into public.notifications(user_id,kind,key,title,body,url,facts,due_at)
   values(p_user,v_row->>'kind',v_row->>'key',v_row->>'title',v_row->>'body',v_row->>'url',
    coalesce(v_row->'facts','{}'::jsonb),pg_catalog.now())
   on conflict (user_id,key) do nothing;
  get diagnostics v_new = row_count;
  v_count := v_count + v_new;
 end loop;
 return v_count;
end
$queue$;
revoke all on function public.notify_queue(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.notify_queue(uuid,jsonb) to service_role;

-- Claim due 'queued' rows (a queued test or confirmation counts too) and mark them 'sent' before they are sent, so two
-- overlapping ticks can never send one row twice. notify_record turns a row nothing could deliver into 'failed'.
-- An explicit result type, not `setof public.notifications`: a function that returns a table's row type depends on the table.
create function public.notify_claim(p_user uuid,p_limit integer default 10)
returns table(id bigint,kind text,key text,title text,body text,url text,facts jsonb,status text,sent_at timestamptz)
language plpgsql security definer set search_path = '' as $claim$
begin
 if pg_catalog.current_setting('role',true) <> 'service_role' then raise exception 'Service role required'; end if;
 return query update public.notifications n set status = 'sent',sent_at = pg_catalog.now()
  where n.id in (select q.id from public.notifications q
    where q.user_id = p_user and q.status = 'queued' and q.due_at <= pg_catalog.now()
    order by q.due_at,q.id limit least(greatest(p_limit,1),50) for update skip locked)
  returning n.id,n.kind,n.key,n.title,n.body,n.url,n.facts,n.status,n.sent_at;
end
$claim$;
revoke all on function public.notify_claim(uuid,integer) from public,anon,authenticated;
grant execute on function public.notify_claim(uuid,integer) to service_role;

create function public.notify_record(p_user uuid,p_id bigint,p_reason text) returns void
language plpgsql security definer set search_path = '' as $record$
begin
 if pg_catalog.current_setting('role',true) <> 'service_role' then raise exception 'Service role required'; end if;
 if p_reason not in ('no_device','push_error') then raise exception 'reason must be no_device or push_error'; end if;
 update public.notifications set status = 'failed',reason = p_reason,sent_at = null
  where id = p_id and user_id = p_user and status = 'sent';
end
$record$;
revoke all on function public.notify_record(uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.notify_record(uuid,bigint,text) to service_role;

-- Ask the `push` function to run one reminder tick (same URL and vault secret as push_kick).
create function public.push_tick_kick() returns void language plpgsql security definer set search_path = '' as $tickkick$
declare v_secret text;
begin
 if pg_catalog.to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null
    or pg_catalog.to_regclass('vault.decrypted_secrets') is null then return; end if;
 execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into v_secret using 'push_shared_secret';
 if v_secret is null then return; end if;
 perform net.http_post(url := 'https://yemqnhnztlbyxmjxidis.supabase.co/functions/v1/push',
  headers := pg_catalog.jsonb_build_object('Content-Type','application/json','x-push-secret',v_secret),
  body := '{"tick":true}'::jsonb,timeout_milliseconds := 25000);
exception when others then null;
end
$tickkick$;
revoke all on function public.push_tick_kick() from public,anon,authenticated;
grant execute on function public.push_tick_kick() to service_role;

-- Every five minutes, only for databases with pg_cron. Skipped when nobody has reminders on.
do $install_notify_tick$
begin
 if exists (select 1 from pg_catalog.pg_available_extensions where name = 'pg_cron') then
  create extension if not exists pg_cron;
  perform cron.schedule('lemma-notify-tick','*/5 * * * *',
   'DO $notify_tick$ BEGIN
     EXECUTE ''SET LOCAL ROLE service_role'';
     IF EXISTS (SELECT 1 FROM public.settings WHERE notify->>''enabled'' = ''true'') THEN PERFORM public.push_tick_kick(); END IF;
    END $notify_tick$;');
 end if;
end
$install_notify_tick$;
