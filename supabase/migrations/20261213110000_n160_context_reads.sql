-- N160 (areas 2, 24, 27): owner-bound reads for the chat connector. The app reads
-- these numbers through its own RPCs; the connector has no signed-in session, so
-- this service-role-only function sets the owner for one transaction and calls
-- the same reviewed functions. Read-only; a name outside the list is refused.
-- The owner export of N95 for the connector: the same page, keyset and owner
-- filter as lemma_export_page, with the owner given by the server (service role only).
create function public.lemma_export_page_for(
 p_owner uuid,p_table text default null,p_cursor text default null,p_limit integer default 100
) returns jsonb language plpgsql stable security definer set search_path='' as $export$
declare
 v_owner uuid:=p_owner;
 v_pk text;
 v_pk_columns integer;
 v_rows jsonb:='[]'::jsonb;
 v_next text;
 v_after jsonb;
begin
 if pg_catalog.current_setting('role',true) is distinct from 'service_role'
    or v_owner is null then raise exception 'Service role and owner required';end if;
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
revoke all on function public.lemma_export_page_for(uuid,text,text,integer)
 from public,anon,authenticated,service_role;
grant execute on function public.lemma_export_page_for(uuid,text,text,integer) to service_role;

create function public.mcp_read(p_user uuid,p_what text,p_args jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $read$
declare
 v_s public.settings%rowtype; v_today date; v_tz text; v_ds timestamp; v_de timestamptz; v_ws integer;
 v_we integer; v_free pg_catalog.int4multirange; v_r pg_catalog.int4range; v_busy record;
 v_now integer; v_total integer := 0; v_left integer := 0; v_days integer;
 v_page jsonb; v_tasks jsonb; v_blocks jsonb; v_timer jsonb; v_deadlines jsonb; v_home jsonb;
begin
 if pg_catalog.current_setting('role',true) <> 'service_role' then raise exception 'Service role required'; end if;
 if p_user is null then raise exception 'Owner required'; end if;
 select * into v_s from public.settings where user_id = p_user;
 if not found then raise exception 'Owner not found'; end if;
 if p_args is null or pg_catalog.jsonb_typeof(p_args) is distinct from 'object' then raise exception 'args must be an object'; end if;
 perform pg_catalog.set_config('request.jwt.claims',
  pg_catalog.jsonb_build_object('sub',p_user,'role','authenticated')::text,true);
 if p_what = 'progress' then
  v_days := coalesce((p_args->>'days')::integer,30);
  if v_days not between 1 and 365 then raise exception 'days must be 1..365'; end if;
  return pg_catalog.jsonb_build_object('what','progress','days',v_days,'report',public.insights(v_days));
 elsif p_what = 'export' then
  v_page := public.lemma_export_page_for(p_user,nullif(p_args->>'table',''),nullif(p_args->>'cursor',''),
   coalesce((p_args->>'limit')::integer,100));
  return pg_catalog.jsonb_build_object('what','export','page',v_page);
 elsif p_what <> 'today' then
  raise exception 'Unknown read';
 end if;

 v_tz := v_s.time_zone; v_today := public.task_series_today(p_user);
 v_ds := v_today::timestamp; v_de := (v_ds + interval '1 day') at time zone v_tz;
 select coalesce(pg_catalog.jsonb_agg(t order by t->>'due_date' nulls last,t->>'priority_rank',t->>'title'),'[]'::jsonb) into v_tasks from (
  select pg_catalog.jsonb_build_object('id',k.id,'title',k.title,'priority',k.priority,
    'priority_rank',case k.priority when 'high' then 0 when 'normal' then 1 else 2 end,'status',k.status,
    'due_kind',k.due_kind,'due_date',coalesce(k.due_date,(k.due_at at time zone v_tz)::date),'due_at',k.due_at,
    'estimate_minutes',k.estimate_minutes,'version',k.version,'series_id',k.series_id,
    'overdue',coalesce(k.due_date,(k.due_at at time zone v_tz)::date) < v_today) as t
  from public.tasks k where k.user_id = p_user and k.status in ('backlog','in_progress')
   and (k.status = 'in_progress' or coalesce(k.due_date,(k.due_at at time zone v_tz)::date) <= v_today)
  order by coalesce(k.due_date,(k.due_at at time zone v_tz)::date) nulls last limit 50) q;
 select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',b.id,'title',b.title,'kind',b.kind,
   'status',b.status,'starts_at',b.starts_at,'ends_at',b.ends_at,'task_id',b.task_id,'version',b.version)
   order by b.starts_at),'[]'::jsonb) into v_blocks
  from public.calendar_blocks b where b.user_id = p_user and b.status <> 'cancelled'
   and b.ends_at > (v_ds at time zone v_tz) and b.starts_at < v_de;
 select pg_catalog.jsonb_build_object('id',e.id,'status',e.status,'intent',e.intent,'mode',e.mode,'version',e.version,
   'intervals',(select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('kind',i.kind,
     'started_at',i.started_at,'ended_at',i.ended_at) order by i.started_at),'[]'::jsonb)
     from public.study_intervals i where i.user_id = p_user and i.entry_id = e.id))
  into v_timer from public.study_entries e where e.user_id = p_user and e.status in ('running','paused')
  order by e.created_at desc limit 1;
 select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',d.id,'title',d.title,'kind',d.kind,
   'due_date',coalesce(d.due_date,(d.due_at at time zone v_tz)::date),'remaining_minutes',d.remaining_minutes,
   'version',d.version) order by coalesce(d.due_date,(d.due_at at time zone v_tz)::date)),'[]'::jsonb) into v_deadlines
  from public.deadlines d where d.user_id = p_user and d.status = 'open'
   and coalesce(d.due_date,(d.due_at at time zone v_tz)::date) <= v_today + 14;
 -- Free time: the working window minus every live block, and what is left of it from now on.
 v_ws := split_part(v_s.planning->>'window_start',':',1)::integer * 60 + split_part(v_s.planning->>'window_start',':',2)::integer;
 v_we := split_part(v_s.planning->>'window_end',':',1)::integer * 60 + split_part(v_s.planning->>'window_end',':',2)::integer;
 v_free := pg_catalog.int4multirange(pg_catalog.int4range(v_ws,v_we));
 for v_busy in select b.starts_at at time zone v_tz as ls,b.ends_at at time zone v_tz as le
   from public.calendar_blocks b where b.user_id = p_user and b.status <> 'cancelled'
    and b.ends_at > (v_ds at time zone v_tz) and b.starts_at < v_de loop
  v_free := v_free - pg_catalog.int4multirange(pg_catalog.int4range(
   greatest(0,floor(extract(epoch from (v_busy.ls - v_ds)) / 60)::integer),
   least(1440,ceil(extract(epoch from (v_busy.le - v_ds)) / 60)::integer)));
 end loop;
 v_now := least(1440,greatest(0,ceil(extract(epoch from ((pg_catalog.now() at time zone v_tz) - v_ds)) / 60)::integer));
 for v_r in select unnest(v_free) loop
  v_total := v_total + (upper(v_r) - lower(v_r));
  v_left := v_left + greatest(0,upper(v_r) - greatest(lower(v_r),v_now));
 end loop;
 begin v_home := public.home_summary(); exception when others then v_home := null; end;
 return pg_catalog.jsonb_build_object('what','today','date',v_today,'time_zone',v_tz,
  'tasks',v_tasks,'blocks',v_blocks,'timer',v_timer,'deadlines',v_deadlines,
  'availability',pg_catalog.jsonb_build_object('window_start',v_s.planning->>'window_start',
   'window_end',v_s.planning->>'window_end','free_minutes',v_total,'free_minutes_remaining',v_left),
  'reviews',v_home,'review_budget',v_s.review_budget);
end
$read$;
revoke all on function public.mcp_read(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.mcp_read(uuid,text,jsonb) to service_role;
