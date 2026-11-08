-- N54 (in progress): owner change-feed journal projection and bounded cursor read.
-- Watch the existing action_changes trigger stream rather than installing an
-- extra write trigger on every owner table. A later undo registry insertion
-- automatically becomes visible without changing this migration.
create table public.owner_changes (
 cursor bigint generated always as identity primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 resource text not null,
 record_id text not null,
 version integer not null check(version>0),
 op text not null check(op in ('insert','update','delete')),
 tombstone boolean not null,
 committed_at timestamptz not null default pg_catalog.clock_timestamp()
);
create index owner_changes_owner_cursor on public.owner_changes(user_id,cursor);
create index owner_changes_retention on public.owner_changes(committed_at,cursor);
alter table public.owner_changes enable row level security;
create policy owner_changes_owner_select on public.owner_changes
 for select to authenticated using(user_id=(select auth.uid()));
grant select on public.owner_changes to authenticated,service_role;

create table public.owner_change_retention (
 user_id uuid primary key references auth.users(id) on delete cascade,
 pruned_through_cursor bigint not null default 0 check(pruned_through_cursor>=0)
);
alter table public.owner_change_retention enable row level security;
create policy owner_change_retention_owner_select on public.owner_change_retention
 for select to authenticated using(user_id=(select auth.uid()));
grant select on public.owner_change_retention to authenticated,service_role;
-- New tables are SELECT-only for browser roles, even if the project-wide
-- default grants later change. RLS remains a second, independent boundary.
revoke insert,update,delete,truncate on public.owner_changes,
 public.owner_change_retention from anon,authenticated;

-- The action journal is written in the original domain transaction. Filter
-- through lemma_undo_tables so a newly registered table automatically emits
-- changes, without depending on a table name hard-coded in this function.
create function public.lemma_owner_changes_log() returns trigger
language plpgsql security definer set search_path='' as $feed$
declare
 v_owner uuid;
 v_record text;
 v_version integer;
 v_source jsonb;
begin
 if not exists(select 1 from public.lemma_undo_tables t
   where t.table_name=new.table_name) then return new; end if;
 select a.user_id into v_owner from public.actions a where a.no=new.action_no;
 if v_owner is null then raise exception 'Owner change has no action owner'; end if;
 perform pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('owner_changes:'||v_owner::text,0));
 v_source:=case when new.op='delete' then new.old else new.new end;
 -- The journal owns many legacy keys (text, bigint and composites), not
 -- only UUIDs. Preserve a simple ID verbatim; serialize a composite PK.
 -- UUID casting here must never abort another resource's journal write.
 v_record:=coalesce(nullif(new.row_pk->>'id',''),new.row_pk::text);
 v_version:=coalesce(nullif(v_source->>'version','')::integer,1);
 insert into public.owner_changes(user_id,resource,record_id,version,op,tombstone)
  values(v_owner,new.table_name,v_record,v_version,new.op,new.op='delete');
 return new;
end
$feed$;
revoke all on function public.lemma_owner_changes_log() from public,anon;
create trigger lemma_owner_changes_after_journal
 after insert on public.action_changes for each row
 execute function public.lemma_owner_changes_log();

create function public.changes_since(p_cursor bigint default 0,p_limit integer default 50)
returns jsonb language plpgsql stable security invoker set search_path='' as $changes$
declare
 v_owner uuid; v_rows jsonb; v_next bigint; v_watermark bigint;
begin
 v_owner:=(select auth.uid());
 if v_owner is null then raise exception 'Authentication required'; end if;
 if p_cursor is null or p_cursor<0 or p_limit is null or p_limit not between 1 and 100
 then raise exception 'Invalid change feed cursor or page limit'; end if;
 select coalesce(pruned_through_cursor,0) into v_watermark
  from public.owner_change_retention where user_id=v_owner;
 v_watermark:=coalesce(v_watermark,0);
 select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(page) order by page.cursor),
    '[]'::jsonb),max(page.cursor)
  into v_rows,v_next
 from (select cursor,resource,record_id,version,op,tombstone,committed_at
       from public.owner_changes
       where user_id=v_owner and cursor>p_cursor order by cursor limit p_limit) page;
 return pg_catalog.jsonb_build_object(
   'changes',v_rows,'nextCursor',coalesce(v_next,p_cursor),
   -- Cursor zero also needs a full projection reset after pruning:
   -- an initial subscriber cannot reconstruct already-expired history.
   'reset',p_cursor<v_watermark);
end
$changes$;
revoke all on function public.changes_since(bigint,integer) from public,anon;
grant execute on function public.changes_since(bigint,integer) to authenticated,service_role;

-- Callable from the existing notify scheduling tick once integrated. Keep
-- each invocation bounded: a large backlog must not monopolize the tick.
-- The service-only watermark advances in the SAME transaction as the delete.
create function public.lemma_prune_owner_changes()
returns integer language plpgsql security definer set search_path='' as $prune$
declare v_owner uuid;v_last bigint;v_count integer:=0;v_deleted integer;
begin
 if pg_catalog.current_setting('role',true)<>'service_role' then
  raise exception 'Only the scheduled service role may prune change history';
 end if;
 -- At most eight owners and 500 expired rows each per call. Subsequent ticks
 -- continue from the remaining rows and maintain a monotonic owner watermark.
 for v_owner in
  select distinct user_id from public.owner_changes
  where committed_at<pg_catalog.clock_timestamp()-interval '30 days'
  order by user_id limit 8
 loop
  perform pg_catalog.pg_advisory_xact_lock(
   pg_catalog.hashtextextended('owner_changes:'||v_owner::text,0));
  select max(cursor) into v_last from (
   select cursor from public.owner_changes
   where user_id=v_owner
    and committed_at<pg_catalog.clock_timestamp()-interval '30 days'
   order by cursor limit 500
  ) expired;
  if v_last is null then continue;end if;
  delete from public.owner_changes
   where user_id=v_owner and cursor<=v_last
    and committed_at<pg_catalog.clock_timestamp()-interval '30 days';
  get diagnostics v_deleted=row_count;
  v_count:=v_count+v_deleted;
  insert into public.owner_change_retention(user_id,pruned_through_cursor)
    values(v_owner,v_last)
    on conflict(user_id) do update set
     pruned_through_cursor=greatest(
      owner_change_retention.pruned_through_cursor,excluded.pruned_through_cursor);
 end loop;
 return v_count;
end
$prune$;
revoke all on function public.lemma_prune_owner_changes() from public,anon,authenticated;
grant execute on function public.lemma_prune_owner_changes() to service_role;

-- Owner decision (#1147, #1216): production has no notify Edge entrypoint, so
-- the scheduled retention caller is the database itself. Same pattern as
-- lemma-run-due-commands (20261116100000_pending_commands.sql): pg_cron runs
-- the job as its creator (postgres), which switches to service_role for this
-- one transaction and calls the bounded, owner-scoped prune. Disposable
-- databases without pg_cron skip scheduling; tests run the exact job command.
do $install_owner_changes_prune_cron$
begin
 if exists (
  select 1 from pg_catalog.pg_available_extensions
   where name='pg_cron'
 ) then
  create extension if not exists pg_cron;
  perform cron.schedule('lemma-prune-owner-changes','41 2 * * *',
   'DO $owner_changes_prune$ BEGIN
     EXECUTE ''SET LOCAL ROLE service_role'';
     PERFORM public.lemma_prune_owner_changes();
    END $owner_changes_prune$;');
 end if;
end
$install_owner_changes_prune_cron$;
