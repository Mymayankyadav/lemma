-- NOTIF-1a: independently mergeable base tables, owner RLS and device cap.
-- NOTIF-1b will add the atomic action/candidate RPCs specified in notifications.md §6c–6d.
alter table public.settings add column notify jsonb
  constraint settings_notify_object_check check (
    notify is null or (jsonb_typeof(notify)='object' and pg_column_size(notify)<=4096)
  );

create table public.push_devices (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 endpoint text not null unique check (endpoint ~ '^https://' and char_length(endpoint)<=1000),
 p256dh text not null check (p256dh ~ '^[A-Za-z0-9_-]+$' and char_length(p256dh)<=200),
 auth text not null check (auth ~ '^[A-Za-z0-9_-]+$' and char_length(auth)<=50),
 label text not null check (char_length(label) between 1 and 40),
 platform text not null check (platform in ('android_app','android_web','desktop','ios','other')),
 last_seen_at timestamptz,
 last_ok_at timestamptz,
 failures integer not null default 0 check (failures>=0),
 disabled_at timestamptz,
 disabled_reason text check (disabled_reason in ('gone','removed','failing'))
);
create index push_devices_owner_enabled on public.push_devices(user_id) where disabled_at is null;

create function public.push_devices_cap() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.disabled_at is null and (tg_op='INSERT' or old.disabled_at is not null) then
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('push_devices:'||new.user_id::text));
  -- BEFORE INSERT fires even for an ON CONFLICT UPDATE. Let the conflict
  -- handler reuse that endpoint; the UPDATE trigger checks re-enabling.
  if tg_op='INSERT' and exists(select 1 from public.push_devices where endpoint=new.endpoint) then
   return new;
  end if;
  if (select count(*) from public.push_devices
      where user_id=new.user_id and disabled_at is null and id<>new.id)>=10 then
   raise exception 'You have 10 devices with reminders. Remove one first.';
  end if;
 end if;
 return new;
end $$;
create trigger push_devices_cap before insert or update of disabled_at on public.push_devices
 for each row execute function public.push_devices_cap();
revoke all on function public.push_devices_cap() from public,anon,authenticated,service_role;

-- The browser registers an endpoint atomically; a foreign owner's endpoint is never claimed.
create function public.upsert_push_device(
 p_endpoint text,p_p256dh text,p_auth text,p_label text,p_platform text
) returns public.push_devices
language plpgsql security definer set search_path='' as $upsert$
declare result public.push_devices%rowtype; uid uuid;
begin
 uid:=auth.uid();
 if uid is null then raise exception 'Not authorized'; end if;
 insert into public.push_devices(user_id,endpoint,p256dh,auth,label,platform)
 values(uid,p_endpoint,p_p256dh,p_auth,p_label,p_platform)
 on conflict(endpoint) do update set
  p256dh=excluded.p256dh,auth=excluded.auth,label=excluded.label,
  platform=excluded.platform,disabled_at=null,disabled_reason=null
 where push_devices.user_id=excluded.user_id
 returning * into result;
 if not found then
  raise exception 'This browser gets reminders for another Lemma account.';
 end if;
 return result;
end $upsert$;
revoke all on function public.upsert_push_device(text,text,text,text,text) from public,anon,service_role;
grant execute on function public.upsert_push_device(text,text,text,text,text) to authenticated;

create table public.notifications (
 id bigint generated always as identity primary key,
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 kind text not null check (kind in ('due','deadline','behind','resume','tutor','digest','plan','rhythm','confirm','test')),
 key text not null check (char_length(key) between 1 and 200),
 project_id uuid,
 title text not null check (char_length(title)<=48),
 body text not null check (char_length(body)<=140),
 url text not null,
 actions jsonb not null default '[]'::jsonb check (jsonb_typeof(actions)='array'),
 facts jsonb not null default '{}'::jsonb check (jsonb_typeof(facts)='object' and pg_column_size(facts)<=2048),
 due_at timestamptz not null,
 status text not null default 'queued' check (status in ('queued','sent','skipped','suppressed','failed')),
 reason text check (reason in ('resolved','cap','spacing','active','quiet','kind_off','mode','no_device','push_error')),
 sent_at timestamptz,
 opened_at timestamptz,
 action text,
 action_at timestamptz,
 unique(user_id,key),
 foreign key(user_id,project_id) references public.projects(user_id,id) on delete set null(project_id) deferrable initially immediate
);
create index notifications_due_queued on public.notifications(user_id,due_at) where status='queued';
create index notifications_sent_recent on public.notifications(user_id,sent_at desc);

create table public.notify_holds (
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 scope text not null check (char_length(scope) between 1 and 120),
 "until" timestamptz not null,
 created_at timestamptz not null default now(),
 primary key(user_id,scope)
);

alter table public.push_devices enable row level security;
alter table public.notifications enable row level security;
alter table public.notify_holds enable row level security;
revoke all on public.push_devices,public.notifications,public.notify_holds from public,anon,authenticated;
grant select,insert,update,delete on public.push_devices,public.notify_holds to authenticated,service_role;
grant select on public.notifications to authenticated;
grant select,insert,update,delete on public.notifications to service_role;
grant usage,select on sequence public.notifications_id_seq to service_role;
create policy owner_all on public.push_devices for all to authenticated
 using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy owner_all on public.notify_holds for all to authenticated
 using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy owner_read on public.notifications for select to authenticated
 using(user_id=(select auth.uid()));

-- These three plumbing tables intentionally have no log_change() trigger.
-- Down for NOTIF-1a (after NOTIF-1b's functions have been removed):
-- drop function if exists public.upsert_push_device(text,text,text,text,text);
-- drop trigger if exists push_devices_cap on public.push_devices;
-- drop function if exists public.push_devices_cap();
-- drop table if exists public.notify_holds,public.notifications,public.push_devices;
-- alter table public.settings drop column if exists notify;
