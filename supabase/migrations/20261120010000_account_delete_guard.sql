-- N103: deletion requests are service-role only; active users may not add new
-- Storage objects after deletion begins or after their Auth user is removed.
create table public.account_deletion_requests(
 user_id uuid primary key references auth.users(id) on delete cascade,
 requested_at timestamptz not null default pg_catalog.clock_timestamp()
);
alter table public.account_deletion_requests enable row level security;
create policy account_deletion_owner_read on public.account_deletion_requests
 for select to authenticated using(user_id=(select auth.uid()));
grant select on public.account_deletion_requests to authenticated,service_role;
grant insert,update,delete on public.account_deletion_requests to service_role;
revoke insert,update,delete,truncate on public.account_deletion_requests
 from public,anon,authenticated;

create function public.lemma_begin_account_delete(p_owner uuid)
returns void language plpgsql security definer set search_path='' as $begin_delete$
begin
 if pg_catalog.current_setting('role',true) is distinct from 'service_role'
   or p_owner is null then
  raise exception 'Service role required for account deletion';end if;
 if not exists(select 1 from auth.users u where u.id=p_owner) then
  raise exception 'Account not found';end if;
 insert into public.account_deletion_requests(user_id) values(p_owner)
  on conflict(user_id) do nothing;
end
$begin_delete$;
revoke all on function public.lemma_begin_account_delete(uuid)
 from public,anon,authenticated;
grant execute on function public.lemma_begin_account_delete(uuid)
 to service_role;

-- Old JWTs can survive Auth deletion until their exp. A Storage RLS guard
-- must check Auth existence, not merely the now-cascaded deletion marker.
create function public.lemma_storage_owner_can_write()
returns boolean language sql stable security definer set search_path='' as $active$
 select (select auth.uid()) is not null
  and exists(select 1 from auth.users u where u.id=(select auth.uid()))
  and not exists(select 1 from public.account_deletion_requests d
    where d.user_id=(select auth.uid()))
$active$;
revoke all on function public.lemma_storage_owner_can_write()
 from public,anon,service_role;
grant execute on function public.lemma_storage_owner_can_write()
 to authenticated;

-- In real Supabase, storage.objects exists. PGlite's full migration tests do
-- not install Storage; keep the forward migration replayable there too.
do $guard_storage$
begin
 if pg_catalog.to_regclass('storage.objects') is not null then
  execute 'create policy lemma_account_storage_insert_guard on storage.objects
   as restrictive for insert to authenticated
   with check (public.lemma_storage_owner_can_write())';
  execute 'create policy lemma_account_storage_update_guard on storage.objects
   as restrictive for update to authenticated
   using (public.lemma_storage_owner_can_write())
   with check (public.lemma_storage_owner_can_write())';
 end if;
end
$guard_storage$;

-- The Auth user cannot be hard-deleted while non-cascading owner audit
-- references (notably actions.user_id) remain. Purge all *owner-keyed*
-- public rows before Auth deletion; never touch another account's records.
-- Leave the deletion marker until Auth's FK cascade removes it, so stale
-- JWTs cannot resume Storage writes during a partially-completed deletion.
create function public.lemma_purge_account_rows(p_owner uuid)
returns jsonb language plpgsql security definer set search_path='' as $purge$
declare
 t record;
 removed bigint;
 changed bigint;
 remaining bigint;
 pass integer:=0;
 total_removed bigint:=0;
begin
 if pg_catalog.current_setting('role',true) is distinct from 'service_role'
   or p_owner is null then
  raise exception 'Service role required for account cleanup';
 end if;
 if not exists(select 1 from public.account_deletion_requests d
   where d.user_id=p_owner) then
  raise exception 'Account deletion must be secured before cleanup';
 end if;
 -- Retry tables whose FK-referenced parents cannot be removed until a
 -- child has been removed. On no progress, fail rather than weaken any FK.
 loop
  pass:=pass+1;
  changed:=0;
  for t in
   select pg_catalog.format('%I.%I',n.nspname,c.relname) as qualified
   from pg_catalog.pg_class c
   join pg_catalog.pg_namespace n on n.oid=c.relnamespace
   join pg_catalog.pg_attribute a on a.attrelid=c.oid
   where n.nspname='public' and c.relkind in ('r','p')
    and a.attname='user_id' and a.attnum>0 and not a.attisdropped
    and c.relname<>'account_deletion_requests'
   order by c.relname
  loop
   begin
    execute 'delete from '||t.qualified||' where user_id=$1' using p_owner;
    get diagnostics removed=row_count;
    changed:=changed+removed;
    total_removed:=total_removed+removed;
   exception when foreign_key_violation then
    -- An FK-dependent row will be retried on the next pass.
    null;
   end;
  end loop;
  remaining:=0;
  for t in
   select pg_catalog.format('%I.%I',n.nspname,c.relname) as qualified
   from pg_catalog.pg_class c
   join pg_catalog.pg_namespace n on n.oid=c.relnamespace
   join pg_catalog.pg_attribute a on a.attrelid=c.oid
   where n.nspname='public' and c.relkind in ('r','p')
    and a.attname='user_id' and a.attnum>0 and not a.attisdropped
    and c.relname<>'account_deletion_requests'
   order by c.relname
  loop
   execute 'select count(*) from '||t.qualified||' where user_id=$1'
    into removed using p_owner;
   remaining:=remaining+removed;
  end loop;
  exit when remaining=0;
  if changed=0 or pass>=100 then
   raise exception 'Account rows remain blocked by foreign-key dependencies (% rows)',remaining;
  end if;
 end loop;
 return pg_catalog.jsonb_build_object('status','purged',
  'rowsRemoved',total_removed,'passes',pass);
end
$purge$;
revoke all on function public.lemma_purge_account_rows(uuid)
 from public,anon,authenticated;
grant execute on function public.lemma_purge_account_rows(uuid)
 to service_role;
