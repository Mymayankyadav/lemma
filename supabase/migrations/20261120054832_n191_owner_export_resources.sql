-- Immutable learner records are exportable without making them undo targets.
-- This non-exposed schema can also be installed by a dependent feature first.
create schema if not exists lemma_export_private;
create table if not exists lemma_export_private.additional_tables (
  table_name text primary key check (table_name ~ '^[a-z_][a-z0-9_]*$'),
  owner_column text not null default 'user_id' check (owner_column ~ '^[a-z_][a-z0-9_]*$'),
  redact_columns text[] not null default '{}'
);
alter table lemma_export_private.additional_tables enable row level security;

-- A registered journalled table keeps its usual owner filter and redactions.
-- A reviewed extra registration may use another owner FK and hide more fields.
create view lemma_export_private.resources as
  select u.table_name,'user_id'::text owner_column,array['connector_secret']::text[] redact_columns
  from public.lemma_undo_tables u
  where not exists (select 1 from lemma_export_private.additional_tables x where x.table_name=u.table_name)
  union all
  select x.table_name,x.owner_column,array['connector_secret']::text[] || x.redact_columns
  from lemma_export_private.additional_tables x;

-- The existing browser and service functions each authenticate their own caller
-- before delegating the same keyset logic. Client roles cannot call this helper.
create function lemma_export_private.keyset_page(p_owner uuid,p_table text,p_cursor text,p_limit integer)
returns jsonb language plpgsql stable security definer set search_path='' as $page$
declare
  resource lemma_export_private.resources%rowtype;
  keys text;
  key_count integer;
  after_key jsonb;
  rows jsonb;
  next_key text;
begin
  if p_owner is null then raise exception 'Owner required'; end if;
  if p_limit is null or p_limit not between 1 and 100 then raise exception 'Export page limit must be 1..100'; end if;
  if p_table is null then
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('table_name',r.table_name)
      order by r.table_name),'[]'::jsonb),max(r.table_name) into rows,next_key
    from (select table_name from lemma_export_private.resources
      where p_cursor is null or table_name>p_cursor order by table_name limit p_limit) r;
  else
    select * into resource from lemma_export_private.resources where table_name=p_table;
    if not found then raise exception 'Resource not registered for owner export'; end if;
    if p_cursor is not null then
      after_key:=p_cursor::jsonb;
      if pg_catalog.jsonb_typeof(after_key) is distinct from 'array' then raise exception 'Malformed owner export cursor'; end if;
    end if;
    select pg_catalog.string_agg(pg_catalog.format('t.%I',a.attname),',' order by k.ord),count(*)::integer
      into keys,key_count
    from pg_catalog.pg_index i join pg_catalog.pg_class c on c.oid=i.indrelid
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    cross join lateral pg_catalog.unnest(i.indkey) with ordinality k(attnum,ord)
    join pg_catalog.pg_attribute a on a.attrelid=c.oid and a.attnum=k.attnum
    where n.nspname='public' and c.relname=resource.table_name and i.indisprimary and k.ord<=i.indnkeyatts;
    if keys is null then raise exception 'Registered resource lacks a primary key'; end if;
    if not exists (select 1 from pg_catalog.pg_attribute a
      join pg_catalog.pg_class c on c.oid=a.attrelid join pg_catalog.pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname=resource.table_name and a.attname=resource.owner_column and not a.attisdropped)
      then raise exception 'Registered resource lacks owner column'; end if;
    if after_key is not null and pg_catalog.jsonb_array_length(after_key)<>key_count then raise exception 'Export cursor arity mismatch'; end if;
    execute pg_catalog.format($query$
      with page as (
        select pg_catalog.to_jsonb(t)-$4::text[] payload,pg_catalog.jsonb_build_array(%1$s) keyset
        from public.%2$I t where t.%3$I=$1
          and ($2::jsonb is null or pg_catalog.jsonb_build_array(%1$s)>$2::jsonb)
        order by keyset limit $3
      )
      select coalesce(pg_catalog.jsonb_agg(payload order by keyset),'[]'::jsonb),
        (select keyset::text from page order by keyset desc limit 1) from page
      $query$,keys,resource.table_name,resource.owner_column)
      into rows,next_key using p_owner,after_key,p_limit,resource.redact_columns;
  end if;
  return pg_catalog.jsonb_build_object('rows',rows,'nextCursor',next_key);
end
$page$;
revoke all on function lemma_export_private.keyset_page(uuid,text,text,integer) from public,anon,authenticated,service_role;

-- One SELECT captures every participating table at the same MVCC snapshot.
create function lemma_export_private.snapshot_data(p_owner uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $snapshot$
declare statement text; snapshot jsonb;
begin
  if p_owner is null then raise exception 'Owner required'; end if;
  select 'select jsonb_object_agg(name,rows) from ('||pg_catalog.string_agg(pg_catalog.format(
    'select %L::text name,(select coalesce(jsonb_agg(to_jsonb(t)-%L::text[]),''[]''::jsonb) from public.%I t where t.%I=$1) rows',
    table_name,redact_columns,table_name,owner_column),' union all ' order by table_name)||') snapshot'
    into statement from lemma_export_private.resources;
  execute statement into snapshot using p_owner;
  return snapshot;
end
$snapshot$;
revoke all on function lemma_export_private.snapshot_data(uuid) from public,anon,authenticated,service_role;
