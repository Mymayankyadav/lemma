-- N103: deletion requests are service-role only; active users may not add new
-- Storage objects after deletion begins or after their Auth user is removed.
create table public.account_deletion_requests(
 user_id uuid primary key references auth.users(id) on delete cascade,
 requested_at timestamptz not null default pg_catalog.clock_timestamp(),
 cleanup_txid bigint,
 cleanup_pid integer,
 constraint account_deletion_cleanup_pair_check
  check ((cleanup_txid is null)=(cleanup_pid is null))
);
alter table public.account_deletion_requests enable row level security;
create policy account_deletion_owner_read on public.account_deletion_requests
 for select to authenticated using(user_id=(select auth.uid()));
grant select on public.account_deletion_requests to authenticated,service_role;
-- Private write access is exclusive to trusted SECURITY DEFINER routines.
-- MCP service-role requests cannot forge a cleanup window through PostgREST.
revoke insert,update,delete,truncate on public.account_deletion_requests
 from public,anon,authenticated,service_role;

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
 -- The marker row lock serializes concurrent purges. The backend/XID pair
 -- authorizes root DELETE only for this actual cleanup transaction, not MCP.
 update public.account_deletion_requests
  set cleanup_txid=pg_catalog.txid_current(),cleanup_pid=pg_catalog.pg_backend_pid()
  where user_id=p_owner;
 -- Retry tables whose FK-referenced parents cannot be removed until a
 -- child has been removed. On no progress, fail rather than weaken any FK.
 loop
  pass:=pass+1;
  changed:=0;
  -- action_changes has no user_id, and its FK to actions is RESTRICT.
  -- Delete ONLY details whose action belongs to this owner before attempting
  -- the parent audit rows. Keep another owner's action details untouched.
  delete from public.action_changes c
   using public.actions a
   where c.action_no=a.no and a.user_id=p_owner;
  get diagnostics removed=row_count;
  changed:=changed+removed;
  total_removed:=total_removed+removed;
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
 update public.account_deletion_requests
  set cleanup_txid=null,cleanup_pid=null where user_id=p_owner;
 return pg_catalog.jsonb_build_object('status','purged',
  'rowsRemoved',total_removed,'passes',pass);
end
$purge$;
revoke all on function public.lemma_purge_account_rows(uuid)
 from public,anon,authenticated;
grant execute on function public.lemma_purge_account_rows(uuid)
 to service_role;


-- Close the other-tab race: Storage RLS is not enough. Once a service role has
-- registered the deletion marker, NO role may insert or update an owner-keyed
-- public row for that owner: neither a live authenticated JWT nor the MCP
-- connector, which writes as service_role through mcp_commit, mcp_command and
-- mcp_seen. A write after the owner purge would create fresh actions or
-- action_changes rows and block Auth hard deletion.
-- DELETE cannot stay open to MCP: the existing AFTER DELETE log_change trigger
-- inserts new actions/action_changes and can block Auth hard deletion after
-- the sweep. Permit only root DELETEs inside the marked owner's trusted purge
-- window, plus nested FK cascades during Auth deletion. No caller GUC lifts it.
create function public.lemma_block_account_deletion_writes()
returns trigger language plpgsql security definer set search_path='' as $db_write_guard$
declare
 caller text:=pg_catalog.current_setting('role',true);
 blocked boolean:=false;
begin
 if TG_OP='DELETE' then
  blocked:=exists(select 1 from public.account_deletion_requests d
   where d.user_id=old.user_id and not (
    (pg_catalog.pg_trigger_depth()>1 and not exists (
      select 1 from auth.users u where u.id=old.user_id)) or
    (caller='service_role' and d.cleanup_txid is not null
     and d.cleanup_pid is not null
     and d.cleanup_txid=pg_catalog.txid_current()
     and d.cleanup_pid=pg_catalog.pg_backend_pid())));
 elsif pg_catalog.pg_trigger_depth()=1 then
  blocked:=exists(select 1 from public.account_deletion_requests d
   where d.user_id=new.user_id
    or (TG_OP='UPDATE' and d.user_id=old.user_id));
 end if;
 if blocked then
  raise exception 'Account deletion is in progress' using errcode='42501';
 end if;
 if TG_OP='DELETE' then return old; end if;
 return new;
end
$db_write_guard$;
revoke all on function public.lemma_block_account_deletion_writes()
 from public,anon,authenticated,service_role;

-- Every current owner-keyed base table gets a guard, including the private
-- action journal. Future owner-keyed tables must include this guard if added
-- before N103 is deployed; no RLS or existing trigger is weakened.
do $owner_write_guards$
declare table_info record;
begin
 for table_info in
  select n.nspname as schema_name,c.relname as table_name
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  join pg_catalog.pg_attribute a on a.attrelid=c.oid
  where n.nspname='public' and c.relkind='r'
   and a.attname='user_id' and a.attnum>0 and not a.attisdropped
   and c.relname<>'account_deletion_requests'
 loop
  execute pg_catalog.format(
   'create trigger lemma_account_delete_write_guard before insert or update or delete on %I.%I for each row execute function public.lemma_block_account_deletion_writes()',
   table_info.schema_name,table_info.table_name);
 end loop;
end
$owner_write_guards$;
