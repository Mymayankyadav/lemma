-- N95: owner-scoped, read-only export via the private undo registry.
-- Stable keysets use the actual primary-key columns, including composite keys.
create function public.lemma_export_page(
 p_table text default null,p_cursor text default null,p_limit integer default 100
) returns jsonb language plpgsql stable security definer set search_path='' as $export$
declare
 v_owner uuid:=auth.uid();
 v_pk text;
 v_pk_columns integer;
 v_rows jsonb:='[]'::jsonb;
 v_next text;
 v_after jsonb;
begin
 if pg_catalog.current_setting('role',true) is distinct from 'authenticated'
    or v_owner is null then raise exception 'Authenticated owner required';end if;
 if p_limit is null or p_limit not between 1 and 100 then
   raise exception 'Export page limit must be 1..100';end if;
 if p_table is null then
   select coalesce(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object('table_name',page.table_name)
      order by page.table_name),'[]'::jsonb),max(page.table_name)
     into v_rows,v_next from (
       select table_name from public.lemma_undo_tables
       where p_cursor is null or table_name>p_cursor
       order by table_name limit p_limit
     ) page;
   return pg_catalog.jsonb_build_object('rows',v_rows,'nextCursor',v_next);
 end if;
 if p_table !~ '^[a-z_][a-z0-9_]*$'
  or not exists(select 1 from public.lemma_undo_tables
                where table_name=p_table) then
  raise exception 'Resource not registered for owner export';end if;
 if p_cursor is not null then
  v_after:=p_cursor::jsonb;
  if pg_catalog.jsonb_typeof(v_after) is distinct from 'array' then
    raise exception 'Malformed owner export cursor';end if;
 end if;
 -- Quoted identifiers come from the catalog, never from the caller.
 select pg_catalog.string_agg(pg_catalog.format('t.%I',a.attname),','
   order by k.ord),pg_catalog.count(*)::integer
 into v_pk,v_pk_columns
 from pg_catalog.pg_index i
 join pg_catalog.pg_class t on t.oid=i.indrelid
 join pg_catalog.pg_namespace n on n.oid=t.relnamespace
 cross join lateral pg_catalog.unnest(i.indkey)
   with ordinality as k(attnum,ord)
 join pg_catalog.pg_attribute a on a.attrelid=t.oid and a.attnum=k.attnum
 where n.nspname='public' and t.relname=p_table and i.indisprimary;
 if v_pk is null or v_pk_columns=0 then
  raise exception 'Registered resource lacks a primary key';end if;
 if not exists(select 1 from pg_catalog.pg_attribute a
  join pg_catalog.pg_class t on t.oid=a.attrelid
  join pg_catalog.pg_namespace n on n.oid=t.relnamespace
  where n.nspname='public' and t.relname=p_table
  and a.attname='user_id' and not a.attisdropped) then
  raise exception 'Registered resource lacks owner column';end if;
 if v_after is not null and pg_catalog.jsonb_array_length(v_after)<>v_pk_columns then
  raise exception 'Export cursor arity mismatch';end if;
 execute pg_catalog.format($query$
  with page as (
   select pg_catalog.to_jsonb(t)-'connector_secret' as payload,
          pg_catalog.jsonb_build_array(%1$s) as keyset
   from public.%2$I t
   where t.user_id=$1 and
    ($2::jsonb is null or pg_catalog.jsonb_build_array(%1$s)>$2::jsonb)
   order by keyset limit $3
  )
  select coalesce(pg_catalog.jsonb_agg(payload order by keyset),'[]'::jsonb),
    (select keyset::text from page order by keyset desc limit 1)
  from page
 $query$,v_pk,p_table)
 into v_rows,v_next using v_owner,v_after,p_limit;
 return pg_catalog.jsonb_build_object('rows',v_rows,'nextCursor',v_next);
end
$export$;
-- No browser grant on the private registry; function is authenticated-only.
revoke all on function public.lemma_export_page(text,text,integer)
 from public,anon,service_role;
grant execute on function public.lemma_export_page(text,text,integer)
 to authenticated;
