-- N45.1: study goal records and a single safe, receipt-backed create path.
-- N45.2 will add lifecycle updates and registry-backed MCP/undo registration.
-- The authenticated role cannot insert/update/delete the table directly.
create function public.study_goal_valid_time_zone(p_zone text)
returns boolean language sql stable set search_path = '' as $tz$
  select p_zone is not null and pg_catalog.length(p_zone) between 1 and 100
    and exists(select 1 from pg_catalog.pg_timezone_names z where z.name=p_zone)
$tz$;

create table public.study_goals (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  period text not null constraint study_goals_period_check check(period in ('week','month','custom')),
  start_date date not null,
  end_date date not null,
  time_zone text not null constraint study_goals_time_zone_check
    check(public.study_goal_valid_time_zone(time_zone)),
  subject_id uuid,
  project_id uuid,
  target_minutes integer not null constraint study_goals_minutes_check
    check(target_minutes between 1 and 100000),
  archived_at timestamptz,
  version integer not null default 1 constraint study_goals_version_check check(version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source text not null default 'app' constraint study_goals_source_check
    check(source in ('app','mcp','worker')),
  constraint study_goals_date_range_check check(start_date<=end_date),
  unique(user_id,id),
  foreign key(user_id,subject_id) references public.subjects(user_id,id)
    deferrable initially immediate,
  foreign key(user_id,project_id) references public.projects(user_id,id)
    deferrable initially immediate
);
create index study_goals_owner_range on public.study_goals
  (user_id,period,start_date,end_date,id) where archived_at is null;
create index study_goals_owner_list on public.study_goals
  (user_id,archived_at,start_date,end_date,id);

alter table public.study_goals enable row level security;
create policy study_goals_owner_read on public.study_goals
  for select to authenticated using(user_id=(select auth.uid()));
grant select on public.study_goals to authenticated;
grant select,insert,update,delete on public.study_goals to service_role;

-- The scope includes nullable IDs; NULL means unscoped, not a wildcard.
-- Lock per owner, then check active inclusive date-range overlap. This also
-- protects the future N45.2 update/restore commands and service-role writes.
create function public.study_goals_check_overlap() returns trigger
language plpgsql security invoker set search_path = '' as $overlap$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('study-goals:'||new.user_id::text,0));
  if new.archived_at is null and exists(
    select 1 from public.study_goals g
    where g.user_id=new.user_id and g.id<>new.id
      and g.archived_at is null and g.period=new.period
      and g.subject_id is not distinct from new.subject_id
      and g.project_id is not distinct from new.project_id
      and g.start_date<=new.end_date and new.start_date<=g.end_date
  ) then
    raise exception 'Overlapping active goal for this owner, scope and period'
      using errcode='23514';
  end if;
  if tg_op='UPDATE' then
    new.version:=old.version+1;
    new.updated_at:=pg_catalog.clock_timestamp();
  end if;
  return new;
end
$overlap$;
create trigger study_goals_overlap before insert or update on public.study_goals
  for each row execute function public.study_goals_check_overlap();
create trigger study_goals_audit after insert or update or delete on public.study_goals
  for each row execute function public.log_change();

-- SECURITY DEFINER is needed because authenticated clients have SELECT-only
-- table privileges. Every write derives the owner from auth.uid(), restricts
-- the resource/fields and preserves the existing private D7 receipt/journal.
create function public.study_goals_command(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $command$
declare
  v_owner uuid; v_op_id uuid; v_id uuid; v_row public.study_goals%rowtype;
  v_patch jsonb; v_target jsonb; v_key text; v_action bigint;
  v_result jsonb; v_stored jsonb; v_source text;
begin
  v_owner:=auth.uid();
  if v_owner is null then raise exception 'Authentication required'; end if;
  if p is null or pg_catalog.jsonb_typeof(p) is distinct from 'object' then
    raise exception 'Command envelope must be an object';
  end if;
  if nullif(p->>'operationId','') is null then
    raise exception 'operationId is required';
  end if;
  v_op_id:=(p->>'operationId')::uuid;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_owner::text||':'||v_op_id::text,0));
  select r.result into v_stored from public.command_receipts r
    where r.user_id=v_owner and r.operation_id=v_op_id;
  if found then
    if v_stored->'_request'=p then return v_stored-'_request'; end if;
    return pg_catalog.jsonb_build_object(
      'operationId',v_op_id::text,'status','conflict',
      'changed','[]'::jsonb,'actionNo',null,
      'conflict',pg_catalog.jsonb_build_object(
        'reason','operationId reused with a different payload'));
  end if;

  select k into v_key from pg_catalog.jsonb_object_keys(p) as keys(k)
    where k<>all(array['operationId','schemaVersion','resource',
      'operation','target','expectedVersion','patch']) limit 1;
  if v_key is not null then raise exception 'Unknown command field: %',v_key; end if;
  if pg_catalog.jsonb_typeof(p->'schemaVersion') is distinct from 'number'
    or p->>'schemaVersion' is distinct from '1' then
    raise exception 'schemaVersion must be 1';
  end if;
  if p->>'resource' is distinct from 'study_goals'
    or p->>'operation' is distinct from 'create' then
    raise exception 'Unsupported study goal resource or operation';
  end if;
  if p?'expectedVersion' and p->>'expectedVersion' is distinct from '0' then
    raise exception 'create expectedVersion must be absent or 0';
  end if;
  v_patch:=p->'patch';
  if pg_catalog.jsonb_typeof(v_patch) is distinct from 'object' then
    raise exception 'patch must be an object';
  end if;
  select k into v_key from pg_catalog.jsonb_object_keys(v_patch) as keys(k)
    where k<>all(array['period','start_date','end_date','time_zone',
      'subject_id','project_id','target_minutes']) limit 1;
  if v_key is not null then raise exception 'Unknown study goal patch field: %',v_key; end if;
  if not (v_patch?'period' and v_patch?'start_date'
    and v_patch?'end_date' and v_patch?'time_zone'
    and v_patch?'target_minutes') then
    raise exception 'Study goal create requires period, dates, zone and target';
  end if;
  if pg_catalog.jsonb_typeof(v_patch->'target_minutes') is distinct from 'number'
    or v_patch->>'target_minutes' !~ '^[0-9]+$' then
    raise exception 'target_minutes must be whole minutes';
  end if;
  if pg_catalog.jsonb_typeof(v_patch->'start_date') is distinct from 'string'
    or pg_catalog.jsonb_typeof(v_patch->'end_date') is distinct from 'string'
    or v_patch->>'start_date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or v_patch->>'end_date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception 'Goal dates require YYYY-MM-DD';
  end if;
  v_target:=coalesce(p->'target','{}'::jsonb);
  if pg_catalog.jsonb_typeof(v_target) is distinct from 'object' then
    raise exception 'target must be an object';
  end if;
  select k into v_key from pg_catalog.jsonb_object_keys(v_target) as keys(k)
    where k<>'id' limit 1;
  if v_key is not null then raise exception 'Unknown target field: %',v_key; end if;
  v_id:=coalesce(nullif(v_target->>'id','')::uuid,pg_catalog.gen_random_uuid());
  -- N45.1 is an authenticated app-only create RPC: custom GUCs such as
  -- lemma.source are caller-settable, even inside a SECURITY DEFINER call.
  -- Force both the row and the existing action-log trigger to trusted app
  -- provenance; N45.2 will introduce registered MCP context separately.
  v_source:='app';
  perform pg_catalog.set_config('lemma.source','app',true);
  -- The same untrusted session can spoof action.tool and action.summary.
  -- Let the existing log_change trigger derive its factual app summary.
  perform pg_catalog.set_config('lemma.tool','',true);
  perform pg_catalog.set_config('lemma.summary','',true);
  insert into public.study_goals (
    id,user_id,period,start_date,end_date,time_zone,
    subject_id,project_id,target_minutes,source
  ) values (
    v_id,v_owner,v_patch->>'period',
    (v_patch->>'start_date')::date,(v_patch->>'end_date')::date,
    v_patch->>'time_zone',(v_patch->>'subject_id')::uuid,
    (v_patch->>'project_id')::uuid,(v_patch->>'target_minutes')::integer,
    v_source
  ) returning * into v_row;
  select a.no into v_action from public.actions a
    where a.user_id=v_owner and a.txid=pg_catalog.txid_current();
  if v_action is null then raise exception 'Study goal create has no journal action'; end if;
  v_result:=pg_catalog.jsonb_build_object(
    'operationId',v_op_id::text,'status','ok','actionNo',v_action,
    'changed',pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('id',v_row.id,'version',v_row.version)));
  insert into public.command_receipts(user_id,operation_id,resource,result)
    values(v_owner,v_op_id,'study_goals',
      v_result||pg_catalog.jsonb_build_object('_request',p));
  return v_result;
end
$command$;
revoke all on function public.study_goals_command(jsonb) from public,anon;
grant execute on function public.study_goals_command(jsonb) to authenticated;
