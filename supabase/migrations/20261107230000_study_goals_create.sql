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
  if tg_op='UPDATE' and
    pg_catalog.current_setting('lemma.tool',true) is distinct from 'undo' then
    new.version:=old.version+1;
    new.updated_at:=pg_catalog.clock_timestamp();
  end if;
  return new;
end
$overlap$;
create trigger study_goals_overlap before insert or update on public.study_goals
  for each row execute function public.study_goals_check_overlap();
create trigger lemma_log_change after insert or update or delete on public.study_goals
  for each row execute function public.log_change();



-- N45: complete owner lifecycle with receipt replay, optimistic versions,
-- generic undo and MCP. No authenticated table DML is permitted.
create function public.study_goals_command(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $command$
declare
 v_owner uuid; v_role text; v_operation text; v_op_id uuid;
 v_id uuid; v_expected integer; v_key text; v_src text; v_action bigint;
 v_target jsonb; v_patch jsonb; v_result jsonb; v_stored jsonb;
 v_before public.study_goals%rowtype; v_after public.study_goals%rowtype;
 v_candidate public.study_goals%rowtype;
begin
 v_owner:=(select auth.uid());
 v_role:=pg_catalog.current_setting('role',true);
 if v_owner is null or v_role not in ('authenticated','service_role') then
  raise exception 'Authentication required'; end if;
 if p is null or pg_catalog.jsonb_typeof(p) is distinct from 'object'
  or pg_catalog.jsonb_typeof(p->'operationId') is distinct from 'string'
  or nullif(p->>'operationId','') is null then
  raise exception 'Invalid study goal command envelope'; end if;
 v_op_id:=(p->>'operationId')::uuid;
 perform pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended(v_owner::text||':'||v_op_id::text,0));
 select result into v_stored from public.command_receipts
  where user_id=v_owner and operation_id=v_op_id;
 if found then
  if v_stored->'_request'=p then return v_stored-'_request'; end if;
  return pg_catalog.jsonb_build_object('operationId',v_op_id,'status','conflict',
   'changed','[]'::jsonb,'actionNo',null,
   'conflict',pg_catalog.jsonb_build_object(
     'reason','operationId reused with a different payload'));
 end if;
 select k into v_key from pg_catalog.jsonb_object_keys(p) as keys(k)
  where k<>all(array['operationId','schemaVersion','resource',
                      'operation','target','expectedVersion','patch']) limit 1;
 if v_key is not null then raise exception 'Unknown command field: %',v_key; end if;
 if pg_catalog.jsonb_typeof(p->'schemaVersion') is distinct from 'number'
   or p->>'schemaVersion' is distinct from '1'
   or p->>'resource' is distinct from 'study_goals' then
  raise exception 'Invalid study goal command metadata'; end if;
 v_operation:=p->>'operation';
 if v_operation not in ('create','update','archive','restore','delete')
   or v_operation is null then
  raise exception 'Unsupported study goal operation'; end if;
 v_target:=coalesce(p->'target','{}'::jsonb);
 v_patch:=coalesce(p->'patch','{}'::jsonb);
 if pg_catalog.jsonb_typeof(v_target) is distinct from 'object'
   or pg_catalog.jsonb_typeof(v_patch) is distinct from 'object' then
  raise exception 'Goal target and patch must be objects'; end if;
 select k into v_key from pg_catalog.jsonb_object_keys(v_target) as keys(k)
  where k<>'id' limit 1;
 if v_key is not null then raise exception 'Unknown target field: %',v_key; end if;
 select k into v_key from pg_catalog.jsonb_object_keys(v_patch) as keys(k)
  where k<>all(case when v_operation in ('create','update') then
   array['period','start_date','end_date','time_zone','subject_id',
         'project_id','target_minutes']
   else array[]::text[] end) limit 1;
 if v_key is not null then raise exception 'Unknown study goal patch field: %',v_key; end if;
 if v_operation in ('archive','restore','delete') and v_patch<>'{}'::jsonb then
  raise exception 'Goal transition patch must be empty'; end if;
 if v_operation='create' then
  if p?'expectedVersion' and
   (pg_catalog.jsonb_typeof(p->'expectedVersion') is distinct from 'number'
    or p->>'expectedVersion' is distinct from '0') then
   raise exception 'create expectedVersion must be absent or 0'; end if;
  if v_target ? 'id' and
    pg_catalog.jsonb_typeof(v_target->'id') is distinct from 'string' then
   raise exception 'create target.id must be a UUID'; end if;
  if not (v_patch?'period' and v_patch?'start_date' and
   v_patch?'end_date' and v_patch?'time_zone' and
   v_patch?'target_minutes') then
   raise exception 'Study goal create requires period, dates, zone and target'; end if;
  v_id:=coalesce(nullif(v_target->>'id','')::uuid,pg_catalog.gen_random_uuid());
 else
  if pg_catalog.jsonb_typeof(v_target->'id') is distinct from 'string'
    or nullif(v_target->>'id','') is null
    or pg_catalog.jsonb_typeof(p->'expectedVersion') is distinct from 'number'
    or p->>'expectedVersion' !~ '^[1-9][0-9]*$'
    or (p->>'expectedVersion')::numeric>2147483647 then
   raise exception 'Goal target id and positive expectedVersion required'; end if;
  v_id:=(v_target->>'id')::uuid;
  v_expected:=(p->>'expectedVersion')::integer;
  select * into v_before from public.study_goals
   where id=v_id and user_id=v_owner for update;
  if not found then raise exception 'Study goal not found for owner'; end if;
 end if;
 if v_operation in ('create','update') then
  if v_operation='update' and v_patch='{}'::jsonb then
   raise exception 'Goal update patch must not be empty'; end if;
  for v_key in select key from pg_catalog.jsonb_object_keys(v_patch) as keys(key)
   where key=any(array['period','start_date','end_date','time_zone']) loop
   if pg_catalog.jsonb_typeof(v_patch->v_key) is distinct from 'string' then
    raise exception 'Goal % must be a string',v_key; end if;
  end loop;
  for v_key in select key from pg_catalog.jsonb_object_keys(v_patch) as keys(key)
    where key=any(array['start_date','end_date']) loop
   if v_patch->>v_key !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception 'Goal dates require YYYY-MM-DD'; end if;
  end loop;
  if v_patch?'target_minutes' and
    (pg_catalog.jsonb_typeof(v_patch->'target_minutes') is distinct from 'number'
      or v_patch->>'target_minutes' !~ '^[1-9][0-9]*$'
      or (v_patch->>'target_minutes')::numeric>100000) then
   raise exception 'Goal target_minutes must be 1..100000 whole minutes'; end if;
  if v_patch?'subject_id' and
    pg_catalog.jsonb_typeof(v_patch->'subject_id') not in ('string','null') then
   raise exception 'Invalid goal subject_id'; end if;
  if v_patch?'project_id' and
    pg_catalog.jsonb_typeof(v_patch->'project_id') not in ('string','null') then
   raise exception 'Invalid goal project_id'; end if;
 end if;
 v_src:=case when v_role='service_role' then 'mcp' else 'app' end;
 perform pg_catalog.set_config('lemma.source',
  case when v_role='service_role' and
    pg_catalog.current_setting('lemma.source',true) in ('claude','chatgpt','other')
   then pg_catalog.current_setting('lemma.source',true)
   when v_role='service_role' then 'other'
   else 'app' end,true);
 if v_role<>'service_role' then
  -- Authenticated callers can set lemma.* GUCs: ignore them entirely.
  perform pg_catalog.set_config('lemma.tool','',true);
 end if;
 perform pg_catalog.set_config('lemma.summary',
  pg_catalog.left('Study goal '||v_operation,200),true);
 if v_operation<>'create' and v_before.version is distinct from v_expected then
  v_result:=pg_catalog.jsonb_build_object('operationId',v_op_id,
    'status','conflict','changed','[]'::jsonb,'actionNo',null,
    'current',pg_catalog.to_jsonb(v_before),
    'conflict',pg_catalog.jsonb_build_object(
      'expectedVersion',v_expected,'currentVersion',v_before.version));
 else
  if v_operation='create' then
   insert into public.study_goals(
    id,user_id,period,start_date,end_date,time_zone,subject_id,project_id,
    target_minutes,source)
   values(v_id,v_owner,v_patch->>'period',
    (v_patch->>'start_date')::date,(v_patch->>'end_date')::date,
    v_patch->>'time_zone',(v_patch->>'subject_id')::uuid,
    (v_patch->>'project_id')::uuid,(v_patch->>'target_minutes')::integer,v_src)
   returning * into v_after;
  elsif v_operation='update' then
   if v_before.archived_at is not null then
    raise exception 'Cannot update an archived goal'; end if;
   select * into v_candidate from
    pg_catalog.jsonb_populate_record(v_before,v_patch);
   update public.study_goals set
    period=v_candidate.period,start_date=v_candidate.start_date,
    end_date=v_candidate.end_date,time_zone=v_candidate.time_zone,
    subject_id=v_candidate.subject_id,project_id=v_candidate.project_id,
    target_minutes=v_candidate.target_minutes,source=v_src
   where id=v_id and user_id=v_owner returning * into v_after;
  elsif v_operation='archive' then
   if v_before.archived_at is not null then
    raise exception 'Goal already archived'; end if;
   update public.study_goals set archived_at=pg_catalog.clock_timestamp(),source=v_src
    where id=v_id and user_id=v_owner returning * into v_after;
  elsif v_operation='restore' then
   if v_before.archived_at is null then
    raise exception 'Only archived goals may be restored'; end if;
   -- Existing trigger rejects overlapping restored scopes and periods.
   update public.study_goals set archived_at=null,source=v_src
    where id=v_id and user_id=v_owner returning * into v_after;
  else
   delete from public.study_goals where id=v_id and user_id=v_owner
    returning * into v_after;
   v_after.version:=v_before.version+1;
  end if;
  select a.no into v_action from public.actions a
    where a.user_id=v_owner and a.txid=pg_catalog.txid_current();
  if v_action is null then raise exception 'Study goal mutation lacks journal action'; end if;
  v_result:=pg_catalog.jsonb_build_object('operationId',v_op_id,'status','ok',
   'actionNo',v_action,'changed',
   pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'id',v_after.id,'version',v_after.version)),
   'goal',pg_catalog.to_jsonb(v_after));
 end if;
 insert into public.command_receipts(user_id,operation_id,resource,result)
  values(v_owner,v_op_id,'study_goals',
   v_result||pg_catalog.jsonb_build_object('_request',p));
 return v_result;
end
$command$;
revoke all on function public.study_goals_command(jsonb) from public,anon;
grant execute on function public.study_goals_command(jsonb) to authenticated,service_role;
insert into public.lemma_undo_tables(table_name) values('study_goals');
insert into public.lemma_command_resources(resource,command_fn,mcp_ok,"schema")
values('study_goals','study_goals_command',true,
 '{"operations":["create","update","archive","restore","delete"],
   "fields":["period","start_date","end_date","time_zone","subject_id",
             "project_id","target_minutes"]}'::jsonb);
