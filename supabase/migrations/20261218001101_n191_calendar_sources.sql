-- Existing one-off blocks keep their absolute intervals. A weekly block uses
-- its stable block id/zone, inclusive first/last dates, weekdays (Sunday=0)
-- and start/end objects containing HH:MM and an optional fold 0 or 1.
alter table public.calendar_blocks
  add column weekly_rule jsonb check (weekly_rule is null or jsonb_typeof(weekly_rule)='object'),
  add column buffer_before_minutes integer not null default 0 check (buffer_before_minutes between 0 and 1440),
  add column buffer_after_minutes integer not null default 0 check (buffer_after_minutes between 0 and 1440);
create unique index calendar_blocks_owner_identity on public.calendar_blocks(user_id,id);

-- A repeated delivery of an identical latest revision is harmless. Competing
-- latest revisions remain visible for explicit reconciliation rather than
-- silently letting the last arrival win.
create table public.calendar_occurrence_changes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  series_id uuid not null, original_date date not null, original_zone text not null,
  revision integer not null check (revision>0),
  kind text not null check (kind in ('cancel','move')),
  starts_local timestamp, ends_local timestamp,
  start_fold smallint check (start_fold in (0,1)), end_fold smallint check (end_fold in (0,1)),
  check ((kind='cancel' and starts_local is null and ends_local is null and start_fold is null and end_fold is null)
      or (kind='move' and starts_local is not null and ends_local is not null)),
  foreign key(user_id,series_id) references public.calendar_blocks(user_id,id) on delete cascade
);
create index calendar_occurrence_changes_identity
  on public.calendar_occurrence_changes(user_id,series_id,original_zone,original_date,revision);
alter table public.calendar_occurrence_changes enable row level security;
create policy calendar_changes_read on public.calendar_occurrence_changes for select to authenticated
  using (user_id=(select auth.uid()));
create policy calendar_changes_append on public.calendar_occurrence_changes for insert to authenticated
  with check (user_id=(select auth.uid()));
revoke insert,update,delete,truncate on public.calendar_occurrence_changes from anon,authenticated;
grant select,insert on public.calendar_occurrence_changes to authenticated,service_role;
create function public.lemma_validate_calendar_exception() returns trigger
language plpgsql security invoker set search_path='' as $validate$
declare block public.calendar_blocks;
begin
  select * into block from public.calendar_blocks b where b.user_id=new.user_id and b.id=new.series_id;
  if not found or block.weekly_rule is null or block.time_zone<>new.original_zone
    or new.original_date not between (block.weekly_rule->>'firstDate')::date and (block.weekly_rule->>'lastDate')::date
    or not coalesce((block.weekly_rule->'weekdays') @> pg_catalog.jsonb_build_array(extract(dow from new.original_date)::int),false)
    or new.starts_local is distinct from pg_catalog.date_trunc('minute',new.starts_local)
    or new.ends_local is distinct from pg_catalog.date_trunc('minute',new.ends_local) then
    raise exception 'Invalid calendar occurrence identity' using errcode='22023';
  end if;
  return new;
end
$validate$;
revoke all on function public.lemma_validate_calendar_exception() from public,anon,authenticated,service_role;
create trigger validate_calendar_exception before insert on public.calendar_occurrence_changes
  for each row execute function public.lemma_validate_calendar_exception();
create trigger lemma_account_delete_write_guard before insert or update or delete on public.calendar_occurrence_changes
  for each row execute function public.lemma_block_account_deletion_writes();
create trigger lemma_log_change after insert or update or delete on public.calendar_occurrence_changes
  for each row execute function public.log_change();

-- Only projections needed for scheduling enter the historical snapshot. Never
-- store titles, connector credentials or unrelated settings in this table.
create table public.calendar_input_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('calendar_blocks','calendar_occurrence_changes','capacity_overrides','settings')),
  source_key uuid not null, known_at timestamptz not null,
  writer_xid xid8 not null, input jsonb
);
create index calendar_history_last_input on public.calendar_input_history(user_id,source,source_key,id desc);
create index calendar_history_transaction on public.calendar_input_history(user_id,writer_xid);
alter table public.calendar_input_history enable row level security;
create policy calendar_history_read on public.calendar_input_history for select to authenticated
  using (user_id=(select auth.uid()));
revoke insert,update,delete,truncate on public.calendar_input_history from anon,authenticated;
grant select on public.calendar_input_history to authenticated,service_role;
create trigger lemma_account_delete_write_guard before insert or update or delete on public.calendar_input_history
  for each row execute function public.lemma_block_account_deletion_writes();
insert into public.lemma_undo_tables(table_name) values ('calendar_occurrence_changes'),('calendar_input_history');

create function public.lemma_calendar_projection(source text, r jsonb) returns jsonb
language sql immutable security invoker set search_path='' as $project$
  select case when source='settings' then pg_catalog.jsonb_build_object(
    'time_zone',r->'time_zone','capacity',pg_catalog.jsonb_build_object('weekday_minutes',r#>'{capacity,weekday_minutes}'),
    'planning',pg_catalog.jsonb_build_object('window_start',r#>'{planning,window_start}','window_end',r#>'{planning,window_end}'))
    else pg_catalog.jsonb_object_agg(key,value) end from pg_catalog.jsonb_each(r)
  where key=any(case source
    when 'settings' then array['time_zone','planning','capacity']
    when 'capacity_overrides' then array['on_date','minutes']
    when 'calendar_occurrence_changes' then array['series_id','original_zone','original_date','revision','kind','starts_local','ends_local','start_fold','end_fold']
    when 'calendar_blocks' then array['kind','status','version','time_zone','project_id','starts_at','ends_at','weekly_rule','buffer_before_minutes','buffer_after_minutes']
    end)
$project$;
revoke all on function public.lemma_calendar_projection(text,jsonb) from public,anon,authenticated,service_role;

create function public.lemma_capture_calendar_input() returns trigger
language plpgsql security definer set search_path='' as $capture$
declare r jsonb; input jsonb; owner_id uuid; accepted timestamptz; writer xid8:=pg_catalog.pg_current_xact_id();
begin
  if TG_OP='DELETE' then r:=pg_catalog.to_jsonb(old);
  else r:=pg_catalog.to_jsonb(new); input:=public.lemma_calendar_projection(TG_TABLE_NAME,r); end if;
  owner_id:=(r->>'user_id')::uuid;
  if TG_OP='UPDATE' and input=public.lemma_calendar_projection(TG_TABLE_NAME,pg_catalog.to_jsonb(old)) then
    return null;
  end if;
  if TG_OP='DELETE' and (not exists(select 1 from auth.users where id=owner_id)
    or exists(select 1 from public.account_deletion_requests where user_id=owner_id)) then return null; end if;
  select h.known_at into accepted from public.calendar_input_history h where h.user_id=owner_id and h.writer_xid=writer limit 1;
  insert into public.calendar_input_history(user_id,source,source_key,known_at,writer_xid,input)
    values(owner_id,TG_TABLE_NAME,coalesce((r->>'id')::uuid,owner_id),
      coalesce(accepted,pg_catalog.clock_timestamp()),writer,input);
  return null;
end
$capture$;
revoke all on function public.lemma_capture_calendar_input() from public,anon,authenticated,service_role;
create trigger lemma_calendar_revision after insert or update or delete on public.calendar_blocks
  for each row execute function public.lemma_capture_calendar_input();
create trigger lemma_calendar_revision after insert or update or delete on public.capacity_overrides
  for each row execute function public.lemma_capture_calendar_input();
create trigger lemma_calendar_revision after insert or update or delete on public.calendar_occurrence_changes
  for each row execute function public.lemma_capture_calendar_input();
create trigger lemma_calendar_revision after insert or update or delete on public.settings
  for each row execute function public.lemma_capture_calendar_input();

with initial as (
  select user_id,id source_key,'calendar_blocks' source,pg_catalog.to_jsonb(b) r from public.calendar_blocks b
  union all select user_id,id,'capacity_overrides',pg_catalog.to_jsonb(c) from public.capacity_overrides c
  union all select user_id,user_id,'settings',pg_catalog.to_jsonb(s) from public.settings s
)
insert into public.calendar_input_history(user_id,source,source_key,known_at,writer_xid,input)
  select user_id,source,source_key,pg_catalog.statement_timestamp(),pg_catalog.pg_current_xact_id(),
    public.lemma_calendar_projection(source,r) from initial;
