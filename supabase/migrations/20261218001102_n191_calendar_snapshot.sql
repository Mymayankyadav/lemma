-- Resolve moved occurrences before ordering by their real instant. A stable
-- identity tie-breaker matches the shared normalizer across series.
create function public.lemma_order_calendar_intervals(intervals jsonb) returns jsonb
language sql stable security invoker set search_path='' as $ordered$
  select coalesce(pg_catalog.jsonb_agg(e.item order by (e.item->>'startsAt')::timestamptz,
    (e.item->>'id') collate pg_catalog."C"),'[]'::jsonb)
  from pg_catalog.jsonb_array_elements(intervals) e(item)
$ordered$;
revoke all on function public.lemma_order_calendar_intervals(jsonb) from public,anon;
grant execute on function public.lemma_order_calendar_intervals(jsonb) to authenticated;

-- Rare transitions include half-hour folds and whole skipped dates. Enumerate
-- distinct real offsets around the wall instant, and round-trip each candidate.
-- PostgreSQL's default fold/gap choice is deliberately never silently accepted.
create function public.lemma_civil_instant(wall timestamp,zone_name text,fold integer)
returns timestamptz language sql stable security invoker set search_path='' as $civil$
  with probes as (
    select pg_catalog.timezone('UTC',wall)+n*interval '6 hours' as probe
    from pg_catalog.generate_series(-8,8) n
  ), offsets as (
    select distinct pg_catalog.timezone(zone_name,probe)-pg_catalog.timezone('UTC',probe) as off from probes
  ), candidates as (
    select pg_catalog.timezone('UTC',wall-off) as at from offsets
  ), exact as (
    select pg_catalog.array_agg(at order by at) a from candidates where pg_catalog.timezone(zone_name,at)=wall
  )
  select case when fold is null or fold in (0,1) then
    case when cardinality(a)=1 then a[1] when cardinality(a)=2 and fold is not null then a[fold+1] end end
  from exact
$civil$;
revoke all on function public.lemma_civil_instant(timestamp,text,integer) from public,anon;
grant execute on function public.lemma_civil_instant(timestamp,text,integer) to authenticated;

-- Resolve before filtering by horizon. An original date outside the interval
-- can move into it, and the latest exception can repair a missing DST time.
create function public.lemma_calendar_occurrences(
  block_id text,b jsonb,changes jsonb,cutoff timestamptz,horizon timestamptz
) returns jsonb language plpgsql stable security invoker set search_path='' as $occurrences$
declare
  rule jsonb:=b->'weekly_rule'; z text:=b->>'time_zone'; d date; changes_for_date jsonb;
  first_day date; last_day date; start_time time; end_time time; base_start timestamp; base_end timestamp;
  lo timestamptz; hi timestamptz; changed jsonb; rev integer; items jsonb:='[]'; item jsonb;
  days jsonb; from_date date; through_date date; before_min int:=(b->>'buffer_before_minutes')::int;
  after_min int:=(b->>'buffer_after_minutes')::int;
begin
  if horizon<=cutoff or horizon>cutoff+interval '365 days' then return null; end if;
  if coalesce(rule,'null'::jsonb)='null'::jsonb then
    lo:=(b->>'starts_at')::timestamptz; hi:=(b->>'ends_at')::timestamptz;
    if hi+after_min*interval '1 minute'>cutoff and lo-before_min*interval '1 minute'<horizon then
      items:=pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('id',block_id,'revision',(b->>'version')::int,
        'projectId',b->'project_id','startsAt',lo,'endsAt',hi,'bufferBeforeMinutes',before_min,'bufferAfterMinutes',after_min));
    end if;
    return items;
  end if;
  if z is null or z !~ '^[A-Za-z][A-Za-z0-9/_+-]*$' or not exists(
    select 1 from pg_catalog.pg_timezone_names tz where tz.name=z
  ) then return null; end if;
  first_day:=(rule->>'firstDate')::date; last_day:=(rule->>'lastDate')::date;
  days:=rule->'weekdays';
  if first_day is null or last_day is null or last_day<first_day or pg_catalog.jsonb_typeof(days) is distinct from 'array'
    or pg_catalog.jsonb_array_length(days)=0 or exists(select 1 from pg_catalog.jsonb_array_elements(days) day_value
      where pg_catalog.jsonb_typeof(day_value)<>'number' or day_value::text !~ '^[0-6]$') or coalesce(rule#>>'{start,time}','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    or coalesce(rule#>>'{end,time}','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    return null;
  end if;
  start_time:=(rule#>>'{start,time}')::time; end_time:=(rule#>>'{end,time}')::time;
  if start_time=end_time then return null; end if;
  from_date:=greatest(first_day,pg_catalog.timezone(z,cutoff)::date-2);
  through_date:=least(last_day,pg_catalog.timezone(z,horizon)::date+2);
  for d in
    select local_day from (
      select (from_date+n) as local_day from pg_catalog.generate_series(0,through_date-from_date) n
      where days @> pg_catalog.jsonb_build_array(extract(dow from from_date+n)::int)
      union
      select (entry->>'original_date')::date from pg_catalog.jsonb_array_elements(changes) entry
      where entry->>'series_id'=block_id and entry->>'original_zone'=z and entry->>'kind'='move'
        and (entry->>'starts_local')::timestamp<pg_catalog.timezone(z,horizon)+interval '2 days'
        and (entry->>'ends_local')::timestamp>pg_catalog.timezone(z,cutoff)-interval '2 days'
    ) candidates order by local_day
  loop
    if d not between first_day and last_day or not (days @> pg_catalog.jsonb_build_array(extract(dow from d)::int)) then
      return null;
    end if;
    with relevant as (
      select e from pg_catalog.jsonb_array_elements(changes) e
      where e->>'series_id'=block_id and e->>'original_zone'=z and (e->>'original_date')::date=d
    )
    select pg_catalog.jsonb_agg(distinct e) into changes_for_date from relevant
    where (e->>'revision')::int=(select max((e->>'revision')::int) from relevant);
    if pg_catalog.jsonb_array_length(changes_for_date)>1 then return null; end if;
    changed:=changes_for_date->0;
    if changed->>'kind'='cancel' then continue; end if;
    if changed is null then
      base_start:=d+start_time; base_end:=d+end_time+case when end_time<start_time then interval '1 day' else interval '0' end;
      lo:=public.lemma_civil_instant(base_start,z,(rule#>>'{start,fold}')::int);
      hi:=public.lemma_civil_instant(base_end,z,(rule#>>'{end,fold}')::int); rev:=0;
    else
      lo:=public.lemma_civil_instant((changed->>'starts_local')::timestamp,z,(changed->>'start_fold')::int);
      hi:=public.lemma_civil_instant((changed->>'ends_local')::timestamp,z,(changed->>'end_fold')::int);
      rev:=(changed->>'revision')::int;
    end if;
    if lo is null or hi is null or hi<=lo then return null; end if;
    if hi+after_min*interval '1 minute'>cutoff and lo-before_min*interval '1 minute'<horizon then
      item:=pg_catalog.jsonb_build_object('id',block_id||'/'||z||'/'||d::text,'seriesId',block_id,
        'originalZone',z,'originalDate',d,'revision',rev,'seriesVersion',(b->>'version')::int,
        'projectId',b->'project_id','startsAt',lo,'endsAt',hi,'bufferBeforeMinutes',before_min,'bufferAfterMinutes',after_min);
      items:=items||pg_catalog.jsonb_build_array(item);
    end if;
  end loop;
  return public.lemma_order_calendar_intervals(items);
exception when data_exception then return null;
end
$occurrences$;
revoke all on function public.lemma_calendar_occurrences(text,jsonb,jsonb,timestamptz,timestamptz) from public,anon;
grant execute on function public.lemma_calendar_occurrences(text,jsonb,jsonb,timestamptz,timestamptz) to authenticated;

create function public.lemma_calendar_snapshot(
  p_horizon_end timestamptz,p_as_of timestamptz default null,p_watermark pg_snapshot default null
) returns jsonb language plpgsql stable security invoker set search_path='' as $snapshot$
declare
  owner_id uuid:=auth.uid(); cutoff timestamptz:=coalesce(p_as_of,pg_catalog.statement_timestamp());
  mark pg_snapshot:=coalesce(p_watermark,pg_catalog.pg_current_snapshot()); entry record;
  config jsonb; changes jsonb; blocks jsonb; overrides jsonb; occurrences jsonb;
  base jsonb; fixed jsonb:='[]'; available jsonb:='[]'; z text; d date; first_day date; last_day date;
  minutes integer; cap jsonb; capacity_known boolean:=false; lo timestamptz; hi timestamptz;
  declared jsonb; window_entry jsonb; zone_day_start timestamptz; zone_day_end timestamptz;
begin
  if owner_id is null then raise exception 'Authenticated owner required' using errcode='42501'; end if;
  if p_horizon_end is null or not pg_catalog.isfinite(p_horizon_end) or not pg_catalog.isfinite(cutoff)
    or cutoff>pg_catalog.statement_timestamp() or p_horizon_end<=cutoff or p_horizon_end>cutoff+interval '365 days' then
    raise exception 'Invalid calendar horizon or cutoff' using errcode='22023'; end if;
  with latest as (
    select distinct on (h.source,h.source_key) h.source,h.source_key,h.input
    from public.calendar_input_history h where h.user_id=owner_id and h.known_at<=cutoff
      and pg_catalog.pg_visible_in_snapshot(h.writer_xid,mark)
    order by h.source,h.source_key,h.id desc
  )
  select (pg_catalog.jsonb_agg(input) filter(where source='settings'))->0,
    coalesce(pg_catalog.jsonb_agg(input) filter(where source='calendar_occurrence_changes'),'[]'),
    coalesce(pg_catalog.jsonb_object_agg(source_key,input) filter(where source='calendar_blocks' and input->>'status'='planned'),'{}'),
    coalesce(pg_catalog.jsonb_object_agg(input->>'on_date',input->'minutes') filter(where source='capacity_overrides'),'{}')
    into config,changes,blocks,overrides from latest where input is not null;
  z:=config->>'time_zone';
  base:=pg_catalog.jsonb_build_object('asOf',cutoff,'horizonEnd',p_horizon_end,'watermark',mark::text,'zone',z);
  for entry in select key,value from pg_catalog.jsonb_each(blocks) order by key loop
    occurrences:=public.lemma_calendar_occurrences(entry.key,entry.value,changes,cutoff,p_horizon_end);
    if occurrences is null then return base||'{"status":"blocked","reason":"unresolved-occurrence","fixed":[],"availability":null}'::jsonb; end if;
    if entry.value->>'kind'='busy' then fixed:=fixed||occurrences; else available:=available||occurrences; end if;
  end loop;
  if pg_catalog.jsonb_array_length(available)>0 and z is not null then
    declared:=available; available:='[]'; capacity_known:=true;
    for window_entry in select value from pg_catalog.jsonb_array_elements(declared) loop
      lo:=greatest((window_entry->>'startsAt')::timestamptz,cutoff);
      hi:=least((window_entry->>'endsAt')::timestamptz,p_horizon_end);
      first_day:=pg_catalog.timezone(z,lo)::date; last_day:=pg_catalog.timezone(z,hi)::date;
      for d in select first_day+n from pg_catalog.generate_series(0,last_day-first_day) n loop
        zone_day_start:=public.lemma_civil_instant(d::timestamp,z,0);
        zone_day_end:=public.lemma_civil_instant((d+1)::timestamp,z,0);
        if zone_day_start is null or zone_day_end is null then
          return base||'{"status":"blocked","reason":"unresolved-availability","fixed":[],"availability":null}'::jsonb;
        end if;
        cap:=config#>'{capacity,weekday_minutes}';
        if pg_catalog.jsonb_typeof(cap)='array' then cap:=cap->extract(dow from d)::int; end if;
        cap:=coalesce(overrides->d::text,cap);
        minutes:=case when pg_catalog.jsonb_typeof(cap)='number' and cap::text ~ '^[0-9]{1,4}$'
          then cap::text::int end;
        if minutes=0 or greatest(lo,zone_day_start)>=least(hi,zone_day_end) then continue; end if;
        available:=available||pg_catalog.jsonb_build_array(window_entry||pg_catalog.jsonb_build_object(
          'startsAt',greatest(lo,zone_day_start),'endsAt',least(hi,zone_day_end),'capacityMinutes',minutes,
          'capacityDate',d));
      end loop;
    end loop;
  elsif z is not null then
    first_day:=pg_catalog.timezone(z,cutoff)::date-1; last_day:=pg_catalog.timezone(z,p_horizon_end)::date;
    for d in select first_day+n from pg_catalog.generate_series(0,last_day-first_day) n loop
      cap:=config#>'{capacity,weekday_minutes}';
      if pg_catalog.jsonb_typeof(cap)='array' then cap:=cap->extract(dow from d)::int; end if;
      cap:=coalesce(overrides->d::text,cap);
      if pg_catalog.jsonb_typeof(cap) is distinct from 'number' or cap::text !~ '^\d{1,4}$' then continue; end if;
      minutes:=cap::text::int;
      if minutes not between 0 and 1440 then continue; end if;
      if d>=pg_catalog.timezone(z,cutoff)::date then capacity_known:=true; end if;
      if minutes=0 then continue; end if;
      lo:=public.lemma_civil_instant(d+(config#>>'{planning,window_start}')::time,z,null);
      hi:=public.lemma_civil_instant(d+(config#>>'{planning,window_end}')::time+
        case when config#>>'{planning,window_end}' < config#>>'{planning,window_start}' then interval '1 day' else interval '0' end,z,null);
      if lo is null or hi is null or hi<=lo then return base||'{"status":"blocked","reason":"unresolved-availability","fixed":[],"availability":null}'::jsonb; end if;
      if hi>cutoff and lo<p_horizon_end then
        available:=available||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('id','capacity/'||d::text,
          'startsAt',greatest(lo,cutoff),'endsAt',least(hi,p_horizon_end),'capacityMinutes',minutes,'capacityDate',d));
      end if;
    end loop;
  end if;
  return base||pg_catalog.jsonb_build_object('status','ok','fixed',public.lemma_order_calendar_intervals(fixed),
    'availability',case when pg_catalog.jsonb_array_length(available)>0 or capacity_known then public.lemma_order_calendar_intervals(available) end);
exception when invalid_datetime_format or invalid_parameter_value then
  if base is null then raise; end if;
  return base||'{"status":"blocked","reason":"invalid-calendar-input","fixed":[],"availability":null}'::jsonb;
end
$snapshot$;
revoke all on function public.lemma_calendar_snapshot(timestamptz,timestamptz,pg_snapshot) from public,anon;
grant execute on function public.lemma_calendar_snapshot(timestamptz,timestamptz,pg_snapshot) to authenticated;
