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
insert into public.lemma_undo_tables(table_name) values ('calendar_occurrence_changes');
insert into lemma_export_private.additional_tables(table_name) values ('calendar_input_history');

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

-- Extend only the calendar branch of the existing study dispatcher. Existing
-- study/interval commands and legacy calendar receipts retain their exact path.
create or replace function public.lemma_study_command_v2_compat(p jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $study$
declare
  v_owner uuid;
  v_operation_id uuid;
  v_resource text;
  v_operation text;
  v_patch jsonb;
  v_target jsonb;
  v_id uuid;
  v_expected integer;
  v_block public.calendar_blocks%rowtype;
  v_new public.calendar_blocks%rowtype;
  v_receipt jsonb;
  v_bad text;
  v_action_no bigint;
  v_timer_conflict jsonb;
begin
 if current_setting('role',true)<>'service_role' then perform set_config('lemma.source','app',true);perform set_config('lemma.tool','study',true);perform set_config('lemma.summary','study',true);end if;
  v_owner := (select auth.uid());
  if v_owner is null then raise exception 'Authentication required'; end if;
  if p is null or pg_catalog.jsonb_typeof(p) <> 'object' then
    raise exception 'Command envelope must be an object';
  end if;
  if not (p ? 'operationId') or nullif(p ->> 'operationId', '') is null then
    raise exception 'operationId is required';
  end if;
  v_operation_id := (p ->> 'operationId')::uuid;

  -- Serialize concurrent retries by authenticated owner + operation ID.
  -- A lost acknowledgement replays the stored result before any version check.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_owner::text || ':' || v_operation_id::text, 0)
  );
  select r.result into v_receipt from public.command_receipts r
    where r.user_id = v_owner and r.operation_id = v_operation_id;
  if found then
    -- N51 receipts carry their exact request, unlike older v1 receipts.
    -- Keep the legacy replay shape untouched while detecting changed-payload
    -- operationId reuse on correction/split/void/restore/manual commands.
    if v_receipt ? '_request' then
      if v_receipt->'_request'=p then return v_receipt-'_request'; end if;
      return pg_catalog.jsonb_build_object('operationId',v_operation_id,
        'status','conflict','changed','[]'::jsonb,'actionNo',null,
        'conflict',pg_catalog.jsonb_build_object(
          'reason','operationId reused with a different payload'));
    end if;
    -- An N51 action cannot claim the operationId of an earlier v1 action.
    -- Old v1 replay itself remains byte-for-byte compatible.
    if (p->>'resource'='calendar_blocks' and coalesce(p->'patch','{}'::jsonb) ?|
        array['weekly_rule','buffer_before_minutes','buffer_after_minutes']) or
       (p->>'resource'='study_entries' and p->>'operation' in
      ('create_manual','correct','split','void','restore',
       'take_lease','next_phase','exclude_minutes')) then
      return pg_catalog.jsonb_build_object('operationId',v_operation_id,
        'status','conflict','changed','[]'::jsonb,'actionNo',null,
        'conflict',pg_catalog.jsonb_build_object(
          'reason','operationId already belongs to a legacy command'));
    end if;
    return v_receipt;
  end if;

  select k into v_bad from pg_catalog.jsonb_object_keys(p) as t(k)
    where k <> all(array['operationId','schemaVersion','resource',
                        'operation','target','expectedVersion','patch',
                        'device','leaseVersion','at'])
    limit 1;
  if v_bad is not null then raise exception 'Unknown command field: %', v_bad; end if;
  if pg_catalog.jsonb_typeof(p -> 'schemaVersion') is distinct from 'number'
      or p ->> 'schemaVersion' is distinct from '1' then
    raise exception 'schemaVersion must be 1';
  end if;
  if p?'at' and ((p->>'at')::timestamptz>clock_timestamp() or
    (p->>'at')::timestamptz<clock_timestamp()-interval '7 days' or
    p->>'resource'<>'study_entries' or p->>'operation' not in ('pause','resume','break','save','next_phase')) then
    raise exception 'Invalid historical timer timestamp'; end if;
  v_resource := p ->> 'resource';
  v_operation := p ->> 'operation';
  -- N52 adds an owner/device guard for legacy writes, without changing
  -- their command grammar, journal, receipt or optimistic version behavior.
  v_timer_conflict:=public.lemma_study_timer_lease_conflict(p,v_owner);
  if v_timer_conflict is not null then return v_timer_conflict; end if;
  if v_resource in ('study_entries','study_intervals') then
    perform pg_catalog.set_config('lemma.tool','study',true);
  end if;
  if v_resource='study_entries' and v_operation in
       ('take_lease','next_phase','exclude_minutes') then
    return public.lemma_study_timer_command(p,v_owner,v_operation_id);
  end if;
  if v_resource='study_entries' and v_operation in
       ('create_manual','correct','split','void','restore') then
    -- Only new operations go to the v2 helper. All existing N11 lifecycle
    -- operations continue through their original function unchanged.
    perform pg_catalog.set_config('lemma.source',
      case when current_setting('role',true)='service_role' and
         pg_catalog.current_setting('lemma.source',true) in
          ('claude','chatgpt','other','system')
        then pg_catalog.current_setting('lemma.source',true)
        when current_setting('role',true)='service_role' then 'other'
        else 'app' end,true);
    return public.study_command_correction(p,v_owner,v_operation_id);
  end if;
  if v_resource in ('study_entries','study_intervals') then
    v_receipt := public.study_command_lifecycle(p,v_owner,v_operation_id);
    -- The N11.2 helper already persisted this receipt; attach the journal action.
    if v_receipt ->> 'status' = 'ok' then
      select a.no into v_action_no from public.actions a
        where a.txid = pg_catalog.txid_current() and a.user_id = v_owner;
      if v_action_no is null then raise exception 'Study change has no journal action'; end if;
      v_receipt := pg_catalog.jsonb_set(v_receipt, '{actionNo}', pg_catalog.to_jsonb(v_action_no));
      update public.command_receipts set result = v_receipt
        where user_id = v_owner and operation_id = v_operation_id;
    end if;
    return v_receipt;
  end if;
  if v_resource is distinct from 'calendar_blocks' then
    raise exception 'Unsupported resource: %', v_resource;
  end if;
  if v_operation not in ('create', 'update', 'delete') or v_operation is null then
    raise exception 'Unsupported operation: %', v_operation;
  end if;
  v_patch := case when v_operation = 'delete' then coalesce(p -> 'patch', '{}'::jsonb) else p -> 'patch' end;
  if pg_catalog.jsonb_typeof(v_patch) is distinct from 'object' then
    raise exception 'patch must be an object';
  end if;
  select k into v_bad from pg_catalog.jsonb_object_keys(v_patch) as t(k)
    where k <> all(case when v_operation = 'delete' then array[]::text[]
        else array['kind','title','starts_at','ends_at','time_zone',
                   'status','subject_id','project_id','checkpoint_id','session_id','task_id',
                   'weekly_rule','buffer_before_minutes','buffer_after_minutes'] end)
    limit 1;
  if v_bad is not null then raise exception 'Unknown patch field: %', v_bad; end if;

  v_target := coalesce(p -> 'target','{}'::jsonb);
  if pg_catalog.jsonb_typeof(v_target) is distinct from 'object' then
    raise exception 'target must be an object';
  end if;
  select k into v_bad from pg_catalog.jsonb_object_keys(v_target) as t(k)
    where k <> 'id' limit 1;
  if v_bad is not null then raise exception 'Unknown target field: %', v_bad; end if;

  if v_operation = 'create' then
    if p ? 'expectedVersion' and (p ->> 'expectedVersion') is distinct from '0' then
      raise exception 'create expectedVersion must be absent or 0';
    end if;
    v_id := coalesce(nullif(v_target ->> 'id', '')::uuid, pg_catalog.gen_random_uuid());
    insert into public.calendar_blocks(
      id,user_id,kind,title,starts_at,ends_at,time_zone,status,
      subject_id,project_id,checkpoint_id,session_id,task_id,
      weekly_rule,buffer_before_minutes,buffer_after_minutes
    ) values (
      v_id,v_owner,v_patch ->> 'kind',v_patch ->> 'title',
      (v_patch ->> 'starts_at')::timestamptz,(v_patch ->> 'ends_at')::timestamptz,
      v_patch ->> 'time_zone',coalesce(v_patch ->> 'status','planned'),
      (v_patch ->> 'subject_id')::uuid,(v_patch ->> 'project_id')::uuid,
      (v_patch ->> 'checkpoint_id')::uuid,(v_patch ->> 'session_id')::uuid,
      (v_patch ->> 'task_id')::uuid,
      nullif(v_patch->'weekly_rule','null'::jsonb),
      coalesce((v_patch->>'buffer_before_minutes')::integer,0),
      coalesce((v_patch->>'buffer_after_minutes')::integer,0)
    ) returning * into v_block;
  else
    if nullif(v_target ->> 'id','') is null then
      raise exception 'target.id required for update';
    end if;
    if pg_catalog.jsonb_typeof(p -> 'expectedVersion') is distinct from 'number' then
      raise exception 'expectedVersion required for update';
    end if;
    v_id := (v_target ->> 'id')::uuid;
    v_expected := (p ->> 'expectedVersion')::integer;
    select * into v_block from public.calendar_blocks
      where id = v_id and user_id = v_owner for update;
    if not found then raise exception 'Calendar block not found'; end if;
    if v_block.version is distinct from v_expected then
      v_receipt := pg_catalog.jsonb_build_object(
        'operationId',v_operation_id::text,'status','conflict',
        'changed',pg_catalog.jsonb_build_array(),'actionNo',null,
        'current',pg_catalog.to_jsonb(v_block),
        'conflict',pg_catalog.jsonb_build_object(
          'expectedVersion',v_expected,'currentVersion',v_block.version)
      );
    else
      if v_operation = 'delete' then
        delete from public.calendar_blocks where id = v_id and user_id = v_owner;
        v_block.version := v_block.version + 1;
      else
      -- The existing row supplies omitted keys; explicit null stays null.
      -- The allow-list forbids owner, ID, and version edits.
      select * into v_new from pg_catalog.jsonb_populate_record(v_block, v_patch);
      update public.calendar_blocks set
        kind = v_new.kind, title = v_new.title,
        starts_at = v_new.starts_at, ends_at = v_new.ends_at,
        time_zone = v_new.time_zone, status = v_new.status,
        subject_id = v_new.subject_id, project_id = v_new.project_id,
        checkpoint_id = v_new.checkpoint_id, session_id = v_new.session_id,
        task_id = v_new.task_id, weekly_rule = v_new.weekly_rule,
        buffer_before_minutes = v_new.buffer_before_minutes,
        buffer_after_minutes = v_new.buffer_after_minutes,
        version = version + 1
      where id = v_id and user_id = v_owner
      returning * into v_block;
      end if;
    end if;
  end if;

  if v_receipt is null then
    v_receipt := pg_catalog.jsonb_build_object(
      'operationId',v_operation_id::text,'status','ok',
      'changed',pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('id',v_block.id,'version',v_block.version)
      ),
      'actionNo',null
    );
  end if;
  if v_receipt ->> 'status' = 'ok' then
    select a.no into v_action_no from public.actions a
      where a.txid = pg_catalog.txid_current() and a.user_id = v_owner;
    if v_action_no is null then raise exception 'Calendar change has no journal action'; end if;
    v_receipt := pg_catalog.jsonb_set(v_receipt, '{actionNo}', pg_catalog.to_jsonb(v_action_no));
  end if;
  insert into public.command_receipts(user_id,operation_id,resource,result)
    values(v_owner,v_operation_id,v_resource,case when v_patch ?|
      array['weekly_rule','buffer_before_minutes','buffer_after_minutes']
      then v_receipt||pg_catalog.jsonb_build_object('_request',p) else v_receipt end);
  return v_receipt;
end
$study$;


-- The write boundary validates structure; an unresolved DST occurrence remains
-- representable so an explicit move/cancellation can repair it before admission.
create function public.lemma_validate_calendar_rule() returns trigger
language plpgsql security invoker set search_path='' as $rule$
declare r jsonb:=new.weekly_rule; boundary jsonb; first_day date; last_day date;
begin
  if r is not null then
    if pg_catalog.jsonb_typeof(r) is distinct from 'object'
      or exists(select 1 from pg_catalog.jsonb_object_keys(r) k where k not in
        ('firstDate','lastDate','weekdays','start','end','seriesId','zone'))
      or (r?'seriesId' and r->>'seriesId' is distinct from new.id::text)
      or (r?'zone' and r->>'zone' is distinct from new.time_zone)
      or not exists(select 1 from pg_catalog.pg_timezone_names z where z.name=new.time_zone)
      or coalesce(r->>'firstDate','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      or coalesce(r->>'lastDate','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      or pg_catalog.jsonb_typeof(r->'weekdays') is distinct from 'array' then
      raise exception 'Invalid weekly calendar rule' using errcode='22023';
    end if;
    first_day:=(r->>'firstDate')::date; last_day:=(r->>'lastDate')::date;
    if first_day<date '0100-01-01' or last_day<first_day or last_day-first_day>=366
      or pg_catalog.jsonb_array_length(r->'weekdays') not between 1 and 7
      or exists(select 1 from pg_catalog.jsonb_array_elements(r->'weekdays') d
        where pg_catalog.jsonb_typeof(d)<>'number' or d::text !~ '^[0-6]$')
      or (select count(distinct d) from pg_catalog.jsonb_array_elements(r->'weekdays') d)
        <>pg_catalog.jsonb_array_length(r->'weekdays') then
      raise exception 'Invalid weekly calendar dates or weekdays' using errcode='22023';
    end if;
    foreach boundary in array array[r->'start',r->'end'] loop
      if pg_catalog.jsonb_typeof(boundary) is distinct from 'object'
        or coalesce(boundary->>'time','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        or exists(select 1 from pg_catalog.jsonb_object_keys(boundary) k where k not in ('time','fold'))
        or (boundary?'fold' and (pg_catalog.jsonb_typeof(boundary->'fold') is distinct from 'number'
          or boundary->>'fold' not in ('0','1'))) then
        raise exception 'Invalid weekly calendar time or fold' using errcode='22023';
      end if;
    end loop;
    if r#>>'{start,time}'=r#>>'{end,time}' then
      raise exception 'Weekly calendar interval must be nonempty' using errcode='22023';
    end if;
  end if;
  if TG_OP='UPDATE' and exists(select 1 from public.calendar_occurrence_changes c
    where c.user_id=new.user_id and c.series_id=new.id and
      (r is null or c.original_zone<>new.time_zone or c.original_date not between first_day and last_day
       or not ((r->'weekdays') @> pg_catalog.jsonb_build_array(extract(dow from c.original_date)::int)))) then
    raise exception 'Existing occurrence changes require their original series identity' using errcode='22023';
  end if;
  return new;
exception when invalid_datetime_format or datetime_field_overflow then
  raise exception 'Invalid weekly calendar date' using errcode='22023';
end
$rule$;
revoke all on function public.lemma_validate_calendar_rule() from public,anon,authenticated,service_role;
create trigger lemma_calendar_rule before insert or update of weekly_rule,time_zone on public.calendar_blocks
  for each row execute function public.lemma_validate_calendar_rule();

-- Append a new immutable exception revision through the same owner/operation
-- receipt and journal conventions as the calendar commands. expectedVersion is
-- the previously observed revision of this series/zone/date (zero initially).
create function public.calendar_occurrence_changes_command(p jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $command$
declare
  owner_id uuid:=auth.uid(); opid uuid; patch jsonb; target jsonb; receipt jsonb;
  row_id uuid; series uuid; block public.calendar_blocks; expected integer; latest integer;
  original date; zone_name text; version integer; kind text; lo timestamp; hi timestamp;
  lo_fold smallint; hi_fold smallint; real_lo timestamptz; real_hi timestamptz; action_no bigint;
begin
  if owner_id is null or current_setting('role',true) not in ('authenticated','service_role') then
    raise exception 'Authenticated owner required' using errcode='42501';
  end if;
  if current_setting('role',true)<>'service_role' then
    perform pg_catalog.set_config('lemma.source','app',true);
    perform pg_catalog.set_config('lemma.tool','calendar_occurrence_changes_command',true);
    perform pg_catalog.set_config('lemma.summary','Calendar occurrence change',true);
  end if;
  if p is null or pg_catalog.jsonb_typeof(p) is distinct from 'object'
    or p->>'schemaVersion' is distinct from '1' or pg_catalog.jsonb_typeof(p->'schemaVersion') is distinct from 'number'
    or p->>'resource' is distinct from 'calendar_occurrence_changes' or p->>'operation' is distinct from 'create'
    or coalesce(p->>'operationId','')='' then raise exception 'Invalid calendar occurrence command' using errcode='22023'; end if;
  opid:=(p->>'operationId')::uuid;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id::text||':'||opid::text,0));
  select result into receipt from public.command_receipts where user_id=owner_id and operation_id=opid;
  if found then
    if receipt->'_request'=p then return receipt-'_request'; end if;
    return pg_catalog.jsonb_build_object('operationId',opid,'status','conflict','changed','[]'::jsonb,'actionNo',null,
      'conflict',pg_catalog.jsonb_build_object('reason','operationId reused with a different payload'));
  end if;
  patch:=p->'patch'; target:=coalesce(p->'target','{}'::jsonb);
  if pg_catalog.jsonb_typeof(patch) is distinct from 'object' or pg_catalog.jsonb_typeof(target) is distinct from 'object'
    or exists(select 1 from pg_catalog.jsonb_object_keys(p) k where k not in
      ('schemaVersion','resource','operation','operationId','patch','target','expectedVersion'))
    or exists(select 1 from pg_catalog.jsonb_object_keys(target) k where k<>'id')
    or exists(select 1 from pg_catalog.jsonb_object_keys(patch) k where k not in
      ('series_id','original_date','original_zone','revision','kind','starts_local','ends_local','start_fold','end_fold'))
    or (p?'expectedVersion' and (pg_catalog.jsonb_typeof(p->'expectedVersion') is distinct from 'number'
      or p->>'expectedVersion' !~ '^[0-9]+$'))
    or pg_catalog.jsonb_typeof(patch->'revision') is distinct from 'number' or patch->>'revision' !~ '^[1-9][0-9]*$'
    or coalesce(patch->>'original_date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or patch->>'kind' is null or patch->>'kind' not in ('cancel','move') then
    raise exception 'Invalid calendar occurrence fields' using errcode='22023';
  end if;
  series:=(patch->>'series_id')::uuid; original:=(patch->>'original_date')::date;
  zone_name:=patch->>'original_zone'; expected:=coalesce((p->>'expectedVersion')::integer,0);
  version:=(patch->>'revision')::integer; kind:=patch->>'kind';
  select * into block from public.calendar_blocks where user_id=owner_id and id=series for update;
  if not found then raise exception 'Calendar series not found' using errcode='42501'; end if;
  select coalesce(max(revision),0) into latest from public.calendar_occurrence_changes
    where user_id=owner_id and series_id=series and original_date=original and original_zone=zone_name;
  if expected<>latest or version<>latest+1 then
    receipt:=pg_catalog.jsonb_build_object('operationId',opid,'status','conflict','changed','[]'::jsonb,'actionNo',null,
      'conflict',pg_catalog.jsonb_build_object('expectedVersion',expected,'currentVersion',latest));
  else
    if kind='move' then
      if coalesce(patch->>'starts_local','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}(:00(\.0+)?)?$'
        or coalesce(patch->>'ends_local','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}(:00(\.0+)?)?$'
        or exists(select 1 from pg_catalog.jsonb_each(patch) x where x.key in ('start_fold','end_fold')
          and x.value<>'null'::jsonb and (pg_catalog.jsonb_typeof(x.value)<>'number' or x.value::text not in ('0','1'))) then
        raise exception 'Invalid moved calendar time' using errcode='22023';
      end if;
      lo:=(patch->>'starts_local')::timestamp; hi:=(patch->>'ends_local')::timestamp;
      lo_fold:=(patch->>'start_fold')::smallint; hi_fold:=(patch->>'end_fold')::smallint;
      real_lo:=public.lemma_civil_instant(lo,zone_name,lo_fold);
      real_hi:=public.lemma_civil_instant(hi,zone_name,hi_fold);
      if real_lo is null or real_hi is null or real_hi<=real_lo then
        raise exception 'Moved occurrence requires resolved DST times and a positive interval' using errcode='22023';
      end if;
    elsif coalesce(patch->>'starts_local',patch->>'ends_local',patch->>'start_fold',patch->>'end_fold') is not null then
      raise exception 'Cancellation cannot contain moved times' using errcode='22023';
    end if;
    row_id:=coalesce((target->>'id')::uuid,pg_catalog.gen_random_uuid());
    insert into public.calendar_occurrence_changes(id,user_id,series_id,original_date,original_zone,revision,kind,
      starts_local,ends_local,start_fold,end_fold)
      values(row_id,owner_id,series,original,zone_name,version,kind,lo,hi,lo_fold,hi_fold);
    select no into action_no from public.actions where user_id=owner_id and txid=pg_catalog.txid_current();
    if action_no is null then raise exception 'Calendar occurrence change has no journal action'; end if;
    receipt:=pg_catalog.jsonb_build_object('operationId',opid,'status','ok','actionNo',action_no,
      'changed',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('id',row_id,'version',version)));
  end if;
  insert into public.command_receipts(user_id,operation_id,resource,result)
    values(owner_id,opid,'calendar_occurrence_changes',receipt||pg_catalog.jsonb_build_object('_request',p));
  return receipt;
end
$command$;
revoke all on function public.calendar_occurrence_changes_command(jsonb) from public,anon;
grant execute on function public.calendar_occurrence_changes_command(jsonb) to authenticated,service_role;

-- Extend the existing metadata row with only the new supported fields, using
-- the established additive registration upsert (N109); retain its other fields.
insert into public.lemma_command_resources(resource,command_fn,mcp_ok,"schema")
select resource,command_fn,mcp_ok,pg_catalog.jsonb_set("schema",'{fields}',("schema"->'fields')||(
  select coalesce(pg_catalog.jsonb_agg(field),'[]'::jsonb)
  from unnest(array['weekly_rule','buffer_before_minutes','buffer_after_minutes']) field
  where not (("schema"->'fields') ? field)))
from public.lemma_command_resources where resource='calendar_blocks'
on conflict(resource) do update set "schema"=excluded."schema";
insert into public.lemma_command_resources(resource,command_fn,mcp_ok,"schema") values
 ('calendar_occurrence_changes','calendar_occurrence_changes_command',true,
  '{"operations":["create"],"fields":["series_id","original_date","original_zone","revision","kind","starts_local","ends_local","start_fold","end_fold"]}'::jsonb);
