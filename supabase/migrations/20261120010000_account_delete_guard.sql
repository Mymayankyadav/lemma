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
