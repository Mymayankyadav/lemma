-- N165: reviewed additive bug-hunt corrections; ordered part 22.
-- Export pages read an immutable snapshot made by one SELECT, so children and parents share the same MVCC view.
create table public.owner_export_snapshots(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),data jsonb not null);
alter table public.owner_export_snapshots enable row level security;
revoke insert,update,delete,truncate on public.owner_export_snapshots from anon,authenticated;
create function public.begin_owner_export() returns uuid language plpgsql security definer set search_path='' as $begin$
declare u uuid:=auth.uid(); statement text; snapshot jsonb; result uuid;
begin
 if u is null or current_setting('role',true)<>'authenticated' then raise exception 'Authenticated owner required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text||':export',0));
 delete from public.owner_export_snapshots where user_id=u;
 select 'select jsonb_object_agg(name,rows) from ('||string_agg(format('select %L::text name,(select coalesce(jsonb_agg(to_jsonb(t)-''connector_secret''),''[]''::jsonb) from public.%I t where user_id=$1) rows',table_name,table_name),' union all ' order by table_name)||') snapshot'
 into statement from public.lemma_undo_tables;
 execute statement into snapshot using u;
 insert into public.owner_export_snapshots(user_id,data) values(u,snapshot) returning id into result;return result;
end $begin$;
create function public.owner_export_page(p_snapshot uuid,p_table text default null,p_offset integer default 0,p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path='' as $page$
declare snapshot jsonb; rows jsonb; total int;
begin
 if auth.uid() is null or current_setting('role',true)<>'authenticated' then raise exception 'Authenticated owner required'; end if;
 if p_offset is null or p_limit is null or p_offset<0 or p_limit not between 1 and 100 then raise exception 'Invalid page'; end if;
 select data into snapshot from public.owner_export_snapshots where id=p_snapshot and user_id=auth.uid() and created_at>now()-interval '15 minutes';
 if not found then raise exception 'Export expired; start again'; end if;
 if p_table is null then select coalesce(jsonb_agg(jsonb_build_object('table_name',key) order by key),'[]'::jsonb) into rows from jsonb_object_keys(snapshot) key;
 else if not(snapshot?p_table) then raise exception 'Resource not in snapshot'; end if;rows:=snapshot->p_table;end if;
 total:=jsonb_array_length(rows);
 select coalesce(jsonb_agg(value order by ord),'[]'::jsonb) into rows from jsonb_array_elements(rows) with ordinality t(value,ord) where ord>p_offset and ord<=p_offset+p_limit;
 return jsonb_build_object('rows',rows,'nextCursor',case when p_offset+p_limit<total then (p_offset+p_limit)::text else null end);
end $page$;
create function public.end_owner_export(p_snapshot uuid) returns void language plpgsql security definer set search_path='' as $end$
begin
 if auth.uid() is null or current_setting('role',true)<>'authenticated' then raise exception 'Authenticated owner required'; end if;
 delete from public.owner_export_snapshots where id=p_snapshot and user_id=auth.uid();
end $end$;
revoke all on function public.begin_owner_export(),public.owner_export_page(uuid,text,integer,integer),public.end_owner_export(uuid) from public,anon,service_role;
grant execute on function public.begin_owner_export(),public.owner_export_page(uuid,text,integer,integer),public.end_owner_export(uuid) to authenticated;

create function public.prune_owner_export_snapshots() returns void language plpgsql security definer set search_path='' as $prune$
begin
 if current_setting('role',true)<>'service_role' then raise exception 'Service role required'; end if;
 delete from public.owner_export_snapshots where created_at<now()-interval '15 minutes';
end $prune$;
revoke all on function public.prune_owner_export_snapshots() from public,anon,authenticated;
grant execute on function public.prune_owner_export_snapshots() to service_role;
do $export_cleanup$
begin
 if exists(select 1 from pg_catalog.pg_extension where extname='pg_cron') then
  perform cron.schedule('lemma-export-expiry','*/15 * * * *','set local role service_role; select public.prune_owner_export_snapshots();');
 end if;
end $export_cleanup$;
