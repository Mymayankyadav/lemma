-- A durable concurrency token also advances when legacy writers or undo
-- touch the session. Ignore client-supplied versions on both initial writes
-- and later updates.
alter table public.sessions add column progress_version integer not null default 1 check (progress_version>0);
create function public.lemma_session_progress_version() returns trigger
language plpgsql security invoker set search_path='' as $version$
begin
  if TG_OP='INSERT' then new.progress_version:=1; else new.progress_version:=old.progress_version+1; end if;
  return new;
end
$version$;
revoke all on function public.lemma_session_progress_version() from public,anon,authenticated,service_role;
create trigger z_progress_version before insert or update on public.sessions
  for each row execute function public.lemma_session_progress_version();

-- The generic study connector has already validated its credential and bound
-- auth.uid() to that owner. Revalidate all target links before returning a
-- receipt. The narrow tutor connector has its own smaller grant surface.
create function public.lemma_session_progress_command(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $command$
declare
  owner_id uuid:=auth.uid(); op uuid; target_id uuid; project uuid; expected integer;
  session_row public.sessions; saved jsonb; result jsonb; action_number bigint;
begin
  if pg_catalog.current_setting('role',true) is distinct from 'service_role' or owner_id is null then
    raise exception 'Authenticated service required' using errcode='42501';
  end if;
  if pg_catalog.jsonb_typeof(p) is distinct from 'object' or (p->>'schemaVersion') is distinct from '1'
    or (p->>'resource') is distinct from 'session_progress' or (p->>'operation') is distinct from 'save'
    or pg_catalog.jsonb_typeof(p->'patch') is distinct from 'object'
    or pg_catalog.jsonb_typeof(p->'expectedVersion') is distinct from 'number'
    or coalesce(p->>'expectedVersion','') !~ '^[1-9][0-9]{0,8}$'
    or (p#>>'{target,id}') is null or (p->>'operationId') is null
    or exists(select 1 from pg_catalog.jsonb_object_keys(p) k where k not in
      ('schemaVersion','operationId','resource','operation','patch','target','expectedVersion'))
    or (p->'target')- 'id' <> '{}'::jsonb then raise exception 'Invalid session progress envelope' using errcode='22023'; end if;
  op:=(p->>'operationId')::uuid; target_id:=(p#>>'{target,id}')::uuid; expected:=(p->>'expectedVersion')::int;
  select s.project_id into project from public.sessions s where s.user_id=owner_id and s.id=target_id;
  if not found then raise exception 'Session unavailable' using errcode='42501'; end if;
  saved:=public.lemma_trusted_receipt_begin(owner_id,op,'session_progress',p);
  -- All canonical paths use project, then session. Revalidate in case the
  -- target moved or was removed while another delivery held the command lock.
  perform 1 from public.projects where user_id=owner_id and id=project for update;
  if not found then raise exception 'Project unavailable' using errcode='42501'; end if;
  select * into session_row from public.sessions s where s.user_id=owner_id and s.id=target_id and s.project_id=project for update;
  if not found then raise exception 'Session unavailable' using errcode='42501'; end if;
  if saved is not null then return saved; end if;
  if not public.lemma_plan_released() then raise exception 'Session progress ingress unavailable' using errcode='55000'; end if;
  if session_row.state<>'open' or session_row.progress_version<>expected then
    return pg_catalog.jsonb_build_object('operationId',op,'status','conflict');
  end if;
  result:=public.save_progress(owner_id,project,target_id,p->'patch');
  select s.progress_version into expected from public.sessions s where s.user_id=owner_id and s.id=target_id;
  select a.no into action_number from public.actions a where a.user_id=owner_id and a.txid=pg_catalog.txid_current();
  if action_number is null then raise exception 'Progress change has no journal action'; end if;
  return public.lemma_trusted_receipt_finish(owner_id,op,'session_progress',p,
    pg_catalog.jsonb_build_object('operationId',op,'status','ok','actionNo',action_number,'sessionId',target_id,
      'projectId',project,'version',expected,'step',result->'step','events',result->'events'));
end
$command$;
revoke all on function public.lemma_session_progress_command(jsonb) from public,anon,authenticated;
grant execute on function public.lemma_session_progress_command(jsonb) to service_role;

-- mcp_command executes a registered function with its historical definer's
-- permissions. A later authorized installer may own the new command.
do $dispatcher_acl$
declare dispatcher_owner name;
begin
  select pg_catalog.pg_get_userbyid(p.proowner) into strict dispatcher_owner from pg_catalog.pg_proc p
    where p.oid='public.mcp_command(uuid,text,jsonb)'::pg_catalog.regprocedure and p.prosecdef;
  if pg_catalog.pg_has_role('anon',dispatcher_owner,'SET') or pg_catalog.pg_has_role('anon',dispatcher_owner,'USAGE')
    or pg_catalog.pg_has_role('authenticated',dispatcher_owner,'SET') or pg_catalog.pg_has_role('authenticated',dispatcher_owner,'USAGE') then
    raise exception 'Verified dispatcher must use a server-owned role';
  end if;
  execute pg_catalog.format('grant execute on function public.lemma_session_progress_command(jsonb) to %I',dispatcher_owner);
end
$dispatcher_acl$;
insert into public.lemma_command_resources(resource,command_fn,mcp_ok,"schema")
  values('session_progress','lemma_session_progress_command',true,
    '{"operations":["save"],"fields":["step","events","misconception","resolved","next_question"]}'::jsonb);

-- Both signed browser reads and credential-authenticated MCP reads execute the
-- same owner filters. Accept only named parameters for the chosen read.
create function public.lemma_planning_snapshot_mcp(p_owner uuid,p_kind text,p_args jsonb) returns jsonb
language plpgsql security definer set search_path='' as $mcp$
declare saved_claims text:=pg_catalog.current_setting('request.jwt.claims',true); response jsonb;
begin
  if pg_catalog.current_setting('role',true) is distinct from 'service_role' or p_owner is null
    or not exists(select 1 from public.settings where user_id=p_owner) then
    raise exception 'Authenticated service owner required' using errcode='42501'; end if;
  if pg_catalog.jsonb_typeof(p_args) is distinct from 'object' then raise exception 'Invalid read' using errcode='22023'; end if;
  perform pg_catalog.set_config('request.jwt.claims',pg_catalog.jsonb_build_object('sub',p_owner,'role','authenticated')::text,true);
  if p_kind='evidence' and p_args-array['p_project_id','p_as_of','p_watermark','p_after','p_limit']='{}'::jsonb then
    response:=public.lemma_evidence_snapshot((p_args->>'p_project_id')::uuid,(p_args->>'p_as_of')::timestamptz,
      (p_args->>'p_watermark')::pg_snapshot,coalesce((p_args->>'p_after')::bigint,0),coalesce((p_args->>'p_limit')::integer,200));
  elsif p_kind='calendar' and p_args-array['p_horizon_end','p_as_of','p_watermark']='{}'::jsonb then
    response:=public.lemma_calendar_snapshot((p_args->>'p_horizon_end')::timestamptz,
      (p_args->>'p_as_of')::timestamptz,(p_args->>'p_watermark')::pg_snapshot);
  else raise exception 'Unknown planning read' using errcode='22023'; end if;
  perform pg_catalog.set_config('request.jwt.claims',coalesce(saved_claims,''),true);
  return response;
end
$mcp$;
revoke all on function public.lemma_planning_snapshot_mcp(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.lemma_planning_snapshot_mcp(uuid,text,jsonb) to service_role;

-- PostgreSQL can report RESTRICT (23001) as well as NO ACTION (23503)
-- before a later child table is visited. Keep the existing purge control,
-- dependency retries, journal cleanup and progress checks.
create or replace function public.lemma_purge_account_rows(p_owner uuid)
returns jsonb language plpgsql security definer set search_path='' as $purge$
declare
 t record;
 removed bigint;
 changed bigint;
 remaining bigint;
 pass integer:=0;
 total_removed bigint:=0;
begin
 if pg_catalog.current_setting('role',true) is distinct from 'service_role'
   or p_owner is null then
  raise exception 'Service role required for account cleanup';
 end if;
 if not exists(select 1 from public.account_deletion_requests d
   where d.user_id=p_owner) then
  raise exception 'Account deletion must be secured before cleanup';
 end if;
 -- The marker row lock serializes concurrent purges. The backend/XID pair
 -- authorizes root DELETE only for this actual cleanup transaction, not MCP.
 update public.account_deletion_requests
  set cleanup_txid=pg_catalog.txid_current(),cleanup_pid=pg_catalog.pg_backend_pid()
  where user_id=p_owner;
 -- Retry tables whose FK-referenced parents cannot be removed until a
 -- child has been removed. On no progress, fail rather than weaken any FK.
 loop
  pass:=pass+1;
  changed:=0;
  -- action_changes has no user_id, and its FK to actions is RESTRICT.
  -- Delete ONLY details whose action belongs to this owner before attempting
  -- the parent audit rows. Keep another owner's action details untouched.
  delete from public.action_changes c
   using public.actions a
   where c.action_no=a.no and a.user_id=p_owner;
  get diagnostics removed=row_count;
  changed:=changed+removed;
  total_removed:=total_removed+removed;
  for t in
   select pg_catalog.format('%I.%I',n.nspname,c.relname) as qualified
   from pg_catalog.pg_class c
   join pg_catalog.pg_namespace n on n.oid=c.relnamespace
   join pg_catalog.pg_attribute a on a.attrelid=c.oid
   where n.nspname='public' and c.relkind in ('r','p')
    and a.attname='user_id' and a.attnum>0 and not a.attisdropped
    and c.relname<>'account_deletion_requests'
   order by c.relname
  loop
   begin
    execute 'delete from '||t.qualified||' where user_id=$1' using p_owner;
    get diagnostics removed=row_count;
    changed:=changed+removed;
    total_removed:=total_removed+removed;
   exception when foreign_key_violation or restrict_violation then
    -- An FK-dependent row will be retried on the next pass.
    null;
   end;
  end loop;
  remaining:=0;
  for t in
   select pg_catalog.format('%I.%I',n.nspname,c.relname) as qualified
   from pg_catalog.pg_class c
   join pg_catalog.pg_namespace n on n.oid=c.relnamespace
   join pg_catalog.pg_attribute a on a.attrelid=c.oid
   where n.nspname='public' and c.relkind in ('r','p')
    and a.attname='user_id' and a.attnum>0 and not a.attisdropped
    and c.relname<>'account_deletion_requests'
   order by c.relname
  loop
   execute 'select count(*) from '||t.qualified||' where user_id=$1'
    into removed using p_owner;
   remaining:=remaining+removed;
  end loop;
  exit when remaining=0;
  if changed=0 or pass>=100 then
   raise exception 'Account rows remain blocked by foreign-key dependencies (% rows)',remaining;
  end if;
 end loop;
 update public.account_deletion_requests
  set cleanup_txid=null,cleanup_pid=null where user_id=p_owner;
 return pg_catalog.jsonb_build_object('status','purged',
  'rowsRemoved',total_removed,'passes',pass);
end
$purge$;

-- Replaces function: public.lemma_export_page(text,text,integer), same owner,
-- ACL, keyset and DTO as N95. The extra resource registry is private.
create or replace function public.lemma_export_page(p_table text default null,p_cursor text default null,p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path='' as $export$
declare owner_id uuid:=auth.uid();
begin
  if pg_catalog.current_setting('role',true) is distinct from 'authenticated' or owner_id is null
    then raise exception 'Authenticated owner required'; end if;
  return lemma_export_private.keyset_page(owner_id,p_table,p_cursor,p_limit);
end
$export$;

-- Replaces function: public.lemma_export_page_for(uuid,text,text,integer),
-- retaining the N160 service dispatcher's independently verified owner.
create or replace function public.lemma_export_page_for(p_owner uuid,p_table text default null,p_cursor text default null,p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path='' as $export$
begin
  if pg_catalog.current_setting('role',true) is distinct from 'service_role' or p_owner is null
    then raise exception 'Service role and owner required'; end if;
  return lemma_export_private.keyset_page(p_owner,p_table,p_cursor,p_limit);
end
$export$;

-- Replaces function: public.begin_owner_export(), preserving N165's owner
-- lock, single-statement snapshot, authenticated role and existing page API.
create or replace function public.begin_owner_export() returns uuid
language plpgsql security definer set search_path='' as $begin$
declare owner_id uuid:=auth.uid(); result uuid;
begin
  if pg_catalog.current_setting('role',true) is distinct from 'authenticated' or owner_id is null
    then raise exception 'Authenticated owner required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id::text||':export',0));
  delete from public.owner_export_snapshots where user_id=owner_id;
  insert into public.owner_export_snapshots(user_id,data)
    values(owner_id,lemma_export_private.snapshot_data(owner_id)) returning id into result;
  return result;
end
$begin$;

-- CREATE OR REPLACE keeps a historical function's original role and grants.
-- Let just those definer roles resolve and execute their private implementation.
do $export_owners$
declare api record;
begin
  for api in select distinct pg_catalog.pg_get_userbyid(p.proowner) role_name,
    case when p.oid='public.begin_owner_export()'::regprocedure then 'snapshot_data(uuid)'
      else 'keyset_page(uuid,text,text,integer)' end helper
    from pg_catalog.pg_proc p where p.oid in ('public.begin_owner_export()'::regprocedure,
      'public.lemma_export_page(text,text,integer)'::regprocedure,
      'public.lemma_export_page_for(uuid,text,text,integer)'::regprocedure)
  loop
    if api.role_name in ('anon','authenticated','service_role') then raise exception 'Unexpected export definer'; end if;
    execute pg_catalog.format('grant usage on schema lemma_export_private to %I',api.role_name);
    execute pg_catalog.format('grant execute on function lemma_export_private.%s to %I',api.helper,api.role_name);
  end loop;
end
$export_owners$;
