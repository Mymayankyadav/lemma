-- N163 (Owner: "Ok let's setup fcm"): a timer started, paused, resumed or finished from chat reaches the phone while
-- the app is closed. The app registers its Firebase Cloud Messaging token; every change of a running or paused study
-- entry queues one outbox row; the `push` Edge function (called by pg_net, retried by pg_cron) reads the entry as it is
-- now and sends the phone's timer state over FCM. Everything is additive. Where pg_net or the vault secret
-- `push_shared_secret` is missing (a fresh database, tests), the trigger still queues and the call is skipped.

-- The phone's FCM token: one row per device, owner-scoped; browsers can read their own rows and write only through
-- the two functions below.
create table public.device_push_tokens (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 device_key text not null check (char_length(device_key) between 8 and 64),
 token text not null check (char_length(token) between 20 and 4096),
 app_version text check (app_version is null or char_length(app_version) <= 40),
 created_at timestamptz not null default now(),
 last_seen_at timestamptz not null default now(),
 unique (user_id,device_key),
 unique (token)
);
alter table public.device_push_tokens enable row level security;
create policy device_push_tokens_owner_select on public.device_push_tokens for select to authenticated
 using (user_id = (select auth.uid()));
grant select on public.device_push_tokens to authenticated;
revoke insert,update,delete,truncate on public.device_push_tokens from anon,authenticated;
grant select,insert,update,delete on public.device_push_tokens to service_role;

-- The app announces its token (on start, and whenever Firebase issues a new one). A token belongs to one phone: if the
-- same token was registered by another account (the phone changed hands), that row goes.
create function public.register_push_token(p_key text,p_token text,p_app_version text default null)
returns jsonb language plpgsql security definer set search_path = '' as $register$
declare v_owner uuid := auth.uid();
begin
 if v_owner is null or pg_catalog.current_setting('role',true) <> 'authenticated' then
  raise exception 'Authenticated owner required'; end if;
 if p_key is null or pg_catalog.char_length(p_key) not between 8 and 64 then raise exception 'device key must be 8–64 characters'; end if;
 if p_token is null or pg_catalog.char_length(p_token) not between 20 and 4096 then raise exception 'token must be 20–4096 characters'; end if;
 delete from public.device_push_tokens where token = p_token and not (user_id = v_owner and device_key = p_key);
 insert into public.device_push_tokens(user_id,device_key,token,app_version)
  values(v_owner,p_key,p_token,pg_catalog.left(p_app_version,40))
  on conflict (user_id,device_key) do update set token = excluded.token,
   app_version = excluded.app_version,last_seen_at = pg_catalog.now();
 return pg_catalog.jsonb_build_object('registered',true);
end
$register$;
revoke all on function public.register_push_token(text,text,text) from public,anon,service_role;
grant execute on function public.register_push_token(text,text,text) to authenticated;

-- Sign-out removes this phone's token, so a signed-out phone is never sent the owner's timer.
create function public.unregister_push_token(p_key text)
returns jsonb language plpgsql security definer set search_path = '' as $unregister$
declare v_owner uuid := auth.uid(); v_count integer;
begin
 if v_owner is null or pg_catalog.current_setting('role',true) <> 'authenticated' then
  raise exception 'Authenticated owner required'; end if;
 delete from public.device_push_tokens where user_id = v_owner and device_key = p_key;
 get diagnostics v_count = row_count;
 return pg_catalog.jsonb_build_object('removed',v_count);
end
$unregister$;
revoke all on function public.unregister_push_token(text) from public,anon,service_role;
grant execute on function public.unregister_push_token(text) to authenticated;

-- What still has to be sent. Service role only; the app never sees it.
create table public.push_outbox (
 id bigint generated always as identity primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check (char_length(kind) between 1 and 20),
 entry_id uuid,
 entry_version integer,
 attempts smallint not null default 0,
 claimed_at timestamptz,
 sent_at timestamptz,
 failed_at timestamptz,
 note text check (note is null or char_length(note) <= 40),
 created_at timestamptz not null default now()
);
create index push_outbox_open on public.push_outbox (id) where sent_at is null and failed_at is null;
alter table public.push_outbox enable row level security;
revoke insert,update,delete,truncate on public.push_outbox from anon,authenticated;
grant select,insert,update,delete on public.push_outbox to service_role;

-- Ask the `push` function to drain the outbox. The URL is this project's own; the shared secret is the vault secret
-- `push_shared_secret` (created by the Owner, the same value as the function secret PUSH_SHARED_SECRET). Never raises:
-- a study command must not fail because a notification could not be sent.
create function public.push_kick() returns void language plpgsql security definer set search_path = '' as $kick$
declare v_secret text;
begin
 if pg_catalog.to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null
    or pg_catalog.to_regclass('vault.decrypted_secrets') is null then return; end if;
 execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into v_secret using 'push_shared_secret';
 if v_secret is null then return; end if;
 perform net.http_post(url := 'https://yemqnhnztlbyxmjxidis.supabase.co/functions/v1/push',
  headers := pg_catalog.jsonb_build_object('Content-Type','application/json','x-push-secret',v_secret),
  body := '{}'::jsonb,timeout_milliseconds := 5000);
exception when others then null;
end
$kick$;
revoke all on function public.push_kick() from public,anon,authenticated;
grant execute on function public.push_kick() to service_role;

-- One row per change that the phone must hear about: a running or paused entry that was created, started, paused,
-- resumed, moved to another phase or renamed, one that finished or was discarded, and one that was deleted.
create function public.push_enqueue_timer() returns trigger language plpgsql security definer set search_path = '' as $enqueue$
begin
 begin
  if tg_op = 'DELETE' then
   if old.status in ('running','paused') then
    insert into public.push_outbox(user_id,kind,entry_id,entry_version) values(old.user_id,'timer',old.id,old.version);
    perform public.push_kick();
   end if;
  elsif (tg_op = 'INSERT' and new.status in ('running','paused'))
    or (tg_op = 'UPDATE' and (
         (new.status in ('running','paused') and (old.status is distinct from new.status or old.phase is distinct from new.phase
           or old.phase_ends_at is distinct from new.phase_ends_at or old.intent is distinct from new.intent
           or old.cycle is distinct from new.cycle))
         or (old.status in ('running','paused') and new.status in ('saved','discarded')))) then
   insert into public.push_outbox(user_id,kind,entry_id,entry_version) values(new.user_id,'timer',new.id,new.version);
   perform public.push_kick();
  end if;
 exception when others then null;
 end;
 return null;
end
$enqueue$;
revoke all on function public.push_enqueue_timer() from public,anon,authenticated;
create trigger study_entries_push_timer after insert or update or delete on public.study_entries
 for each row execute function public.push_enqueue_timer();

-- The `push` function claims a batch: rows not yet sent, tried fewer than three times, not claimed in the last two
-- minutes. Service role only.
create function public.push_claim(p_limit integer default 20) returns setof public.push_outbox
language plpgsql security definer set search_path = '' as $claim$
begin
 if pg_catalog.current_setting('role',true) <> 'service_role' then raise exception 'Service role required'; end if;
 return query update public.push_outbox o set claimed_at = pg_catalog.now(),attempts = o.attempts + 1
  where o.id in (select p.id from public.push_outbox p
    where p.sent_at is null and p.failed_at is null and p.attempts < 3
     and (p.claimed_at is null or p.claimed_at < pg_catalog.now() - interval '2 minutes')
    order by p.id limit least(greatest(p_limit,1),50) for update skip locked)
  returning o.*;
end
$claim$;
revoke all on function public.push_claim(integer) from public,anon,authenticated;
grant execute on function public.push_claim(integer) to service_role;

-- Every minute: call the function again if something is still waiting (a send that failed), give up on rows older than
-- ten minutes (a timer message that late is stale), and forget finished rows after a week.
create function public.push_retry() returns void language plpgsql security definer set search_path = '' as $retry$
begin
 update public.push_outbox set failed_at = pg_catalog.now(),note = 'too old'
  where sent_at is null and failed_at is null and created_at < pg_catalog.now() - interval '10 minutes';
 delete from public.push_outbox where created_at < pg_catalog.now() - interval '7 days' and (sent_at is not null or failed_at is not null);
 if exists (select 1 from public.push_outbox where sent_at is null and failed_at is null and attempts < 3
     and (claimed_at is null or claimed_at < pg_catalog.now() - interval '2 minutes')) then
  perform public.push_kick();
 end if;
end
$retry$;
revoke all on function public.push_retry() from public,anon,authenticated;
grant execute on function public.push_retry() to service_role;

do $install_push_cron$
begin
 if exists (select 1 from pg_catalog.pg_available_extensions where name = 'pg_cron') then
  create extension if not exists pg_cron;
  perform cron.schedule('lemma-push-retry','* * * * *',
   'DO $push_tick$ BEGIN
     EXECUTE ''SET LOCAL ROLE service_role'';
     PERFORM public.push_retry();
    END $push_tick$;');
 end if;
end
$install_push_cron$;

-- pg_net is installed where the platform offers it; without it push_kick does nothing.
do $install_push_net$
begin
 if exists (select 1 from pg_catalog.pg_available_extensions where name = 'pg_net') then
  create extension if not exists pg_net;
 end if;
end
$install_push_net$;
