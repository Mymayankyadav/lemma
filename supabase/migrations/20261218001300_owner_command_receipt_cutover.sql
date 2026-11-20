-- Protected receipt cutover, applied after the N165 invoker functions. Existing
-- receipts and ordinary legacy commands keep a NULL provenance version.
-- Fail on a pre-existing marker: its historical write authority is unknown.
alter table public.command_receipts add column trusted_writer_version smallint;

-- These four RPCs need the caller's ordinary RLS visibility plus INSERT on
-- the four legacy receipt columns. No client can log in or set this role.
do $writer$
begin
  if not exists (select 1 from pg_roles where rolname = 'lemma_legacy_receipt_writer') then
    create role lemma_legacy_receipt_writer nologin inherit nobypassrls;
  end if;
  if exists (select 1 from pg_roles where rolname = 'lemma_legacy_receipt_writer'
      and (rolcanlogin or rolbypassrls or rolsuper or rolcreaterole or rolcreatedb
           or rolreplication or not rolinherit))
    or exists (select 1 from pg_auth_members
      where member = 'lemma_legacy_receipt_writer'::regrole
        and roleid <> 'authenticated'::regrole)
    or pg_has_role('authenticated', 'lemma_legacy_receipt_writer', 'MEMBER')
    or pg_has_role('anon', 'lemma_legacy_receipt_writer', 'MEMBER')
    or exists (select 1 from pg_class
      where relowner = 'lemma_legacy_receipt_writer'::regrole
        and relkind in ('r','p') and relnamespace = 'public'::regnamespace) then
    raise exception 'Unsafe legacy receipt writer role configuration';
  end if;
end;
$writer$;

grant authenticated to lemma_legacy_receipt_writer with inherit true, set false;
-- Keep the migration owner able to maintain the four RPCs in future releases.
grant lemma_legacy_receipt_writer to current_user with inherit false, set true;
grant create on schema public to lemma_legacy_receipt_writer;
grant insert (user_id, operation_id, resource, result)
  on public.command_receipts to lemma_legacy_receipt_writer;

-- Preserve the N22 command body and its SQL identity. Pin the app journal source
-- before the existing domain write; service dispatch retains its attribution.
create or replace function public.task_command(p jsonb) returns jsonb
language plpgsql security invoker set search_path = ''
as $task$
declare
 v_owner uuid; v_operation_id uuid; v_operation text; v_patch jsonb;
 v_target jsonb; v_id uuid; v_expected integer; v_bad text;
 v_old public.tasks%rowtype; v_new public.tasks%rowtype;
 v_receipt jsonb; v_stored jsonb; v_action_no bigint; v_changed jsonb;
begin
 v_owner := (select auth.uid());
 if v_owner is null then raise exception 'Authentication required'; end if;
 if p is null or pg_catalog.jsonb_typeof(p) <> 'object' then
  raise exception 'Command envelope must be an object';
 end if;
 if nullif(p ->> 'operationId','') is null then
  raise exception 'operationId is required';
 end if;
 v_operation_id := (p ->> 'operationId')::uuid;

 perform pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended(v_owner::text||':'||v_operation_id::text,0)
 );
 select result into v_stored from public.command_receipts
  where user_id=v_owner and operation_id=v_operation_id;
 if found then
  if v_stored -> '_request' = p then return v_stored - '_request'; end if;
  return pg_catalog.jsonb_build_object(
   'operationId',v_operation_id::text,'status','conflict',
   'changed','[]'::jsonb,'actionNo',null,
   'conflict',pg_catalog.jsonb_build_object('reason','operationId reused with a different payload')
  );
 end if;

 select k into v_bad from pg_catalog.jsonb_object_keys(p) as t(k)
  where k <> all(array['operationId','schemaVersion','resource','operation',
                       'target','expectedVersion','patch']) limit 1;
 if v_bad is not null then raise exception 'Unknown command field: %',v_bad; end if;
 if pg_catalog.jsonb_typeof(p -> 'schemaVersion') is distinct from 'number'
    or p ->> 'schemaVersion' is distinct from '1' then
  raise exception 'schemaVersion must be 1';
 end if;
 if p ->> 'resource' is distinct from 'tasks' then
  raise exception 'Unsupported resource';
 end if;
 v_operation := p ->> 'operation';
 if v_operation is null or v_operation not in ('create','update','delete') then
  raise exception 'Unsupported task operation';
 end if;
 -- Only the service dispatcher authenticates a connector source. App callers
 -- get an operation-only audit summary after the operation allowlist above.
 if pg_catalog.current_setting('role',true) is distinct from 'service_role' then
  perform pg_catalog.set_config('lemma.source','app',true);
  perform pg_catalog.set_config('lemma.tool','task_command',true);
  perform pg_catalog.set_config('lemma.summary','Task '||v_operation,true);
 end if;
 v_patch := coalesce(p -> 'patch','{}'::jsonb);
 if pg_catalog.jsonb_typeof(v_patch) is distinct from 'object' then
  raise exception 'patch must be an object';
 end if;
 select k into v_bad from pg_catalog.jsonb_object_keys(v_patch) as t(k)
  where k <> all(case when v_operation='delete' then array[]::text[]
    else array['title','body','subject_id','project_id','checkpoint_id',
               'estimate_minutes','priority','due_kind','due_date','due_at',
               'position','status'] end) limit 1;
 if v_bad is not null then raise exception 'Unknown task patch field: %',v_bad; end if;
 v_target := coalesce(p -> 'target','{}'::jsonb);
 if pg_catalog.jsonb_typeof(v_target) is distinct from 'object' then
  raise exception 'target must be an object';
 end if;
 select k into v_bad from pg_catalog.jsonb_object_keys(v_target) as t(k)
  where k <> 'id' limit 1;
 if v_bad is not null then raise exception 'Unknown target field: %',v_bad; end if;

 if v_operation='create' then
  if p ? 'expectedVersion' and p ->> 'expectedVersion' is distinct from '0' then
   raise exception 'create expectedVersion must be absent or 0';
  end if;
  v_id := coalesce(nullif(v_target ->> 'id','')::uuid,pg_catalog.gen_random_uuid());
  insert into public.tasks (
    id,user_id,title,body,subject_id,project_id,checkpoint_id,
    estimate_minutes,priority,due_kind,due_date,due_at,position,
    status,completed_at
  ) values (
    v_id,v_owner,v_patch ->> 'title',coalesce(v_patch ->> 'body',''),
    (v_patch ->> 'subject_id')::uuid,(v_patch ->> 'project_id')::uuid,
    (v_patch ->> 'checkpoint_id')::uuid,
    (v_patch ->> 'estimate_minutes')::integer,
    coalesce(v_patch ->> 'priority','normal'),
    coalesce(v_patch ->> 'due_kind','none'),
    (v_patch ->> 'due_date')::date,(v_patch ->> 'due_at')::timestamptz,
    coalesce((v_patch ->> 'position')::integer,0),
    coalesce(v_patch ->> 'status','backlog'),
    case when v_patch ->> 'status'='completed' then now() else null end
  ) returning * into v_new;
  v_changed := pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object('id',v_new.id,'version',v_new.version)
  );
 else
  if nullif(v_target ->> 'id','') is null then raise exception 'target.id required'; end if;
  if pg_catalog.jsonb_typeof(p -> 'expectedVersion') is distinct from 'number'
     or p ->> 'expectedVersion' !~ '^[1-9][0-9]*$' then
   raise exception 'expectedVersion must be a positive integer';
  end if;
  v_id := (v_target ->> 'id')::uuid;
  v_expected := (p ->> 'expectedVersion')::integer;
  select * into v_old from public.tasks
    where user_id=v_owner and id=v_id for update;
  if not found then raise exception 'Task not found'; end if;
  if v_old.version is distinct from v_expected then
   v_receipt := pg_catalog.jsonb_build_object(
    'operationId',v_operation_id::text,'status','conflict',
    'changed','[]'::jsonb,'actionNo',null,
    'current',pg_catalog.to_jsonb(v_old),
    'conflict',pg_catalog.jsonb_build_object(
      'expectedVersion',v_expected,'currentVersion',v_old.version)
   );
  elsif v_operation='delete' then
   delete from public.tasks where user_id=v_owner and id=v_id;
   v_changed := pg_catalog.jsonb_build_array(
     pg_catalog.jsonb_build_object('id',v_old.id,'version',v_old.version)
   );
  else
   select * into v_new from pg_catalog.jsonb_populate_record(v_old,v_patch);
   update public.tasks set
    title=v_new.title,body=v_new.body,subject_id=v_new.subject_id,
    project_id=v_new.project_id,checkpoint_id=v_new.checkpoint_id,
    estimate_minutes=v_new.estimate_minutes,priority=v_new.priority,
    due_kind=v_new.due_kind,due_date=v_new.due_date,due_at=v_new.due_at,
    position=v_new.position,status=v_new.status,
    completed_at=case when v_new.status='completed'
                   then coalesce(v_old.completed_at,now()) else null end,
    version=version+1,updated_at=now()
   where id=v_id and user_id=v_owner returning * into v_new;
   v_changed := pg_catalog.jsonb_build_array(
     pg_catalog.jsonb_build_object('id',v_new.id,'version',v_new.version)
   );
  end if;
 end if;
 if v_receipt is null then
  select a.no into v_action_no from public.actions a
    where a.txid=pg_catalog.txid_current() and a.user_id=v_owner;
  if v_action_no is null then raise exception 'Task write has no journal action'; end if;
  v_receipt := pg_catalog.jsonb_build_object(
   'operationId',v_operation_id::text,'status','ok',
   'changed',v_changed,'actionNo',v_action_no
  );
 end if;
 insert into public.command_receipts(user_id,operation_id,resource,result)
 values(v_owner,v_operation_id,'tasks',v_receipt ||
  pg_catalog.jsonb_build_object('_request',p));
 return v_receipt;
end
$task$;

do $legacy_rpcs$
declare
  migration_owner name := current_user;
  rpc record;
begin
  for rpc in select p.oid::regprocedure as signature, pg_get_userbyid(p.proowner) as previous_owner
    from pg_proc p where p.oid in ('public.task_command(jsonb)'::regprocedure,
      'public.presets_command(jsonb)'::regprocedure, 'public.notify_command(jsonb)'::regprocedure,
      'public.edit_note_atomic(uuid,integer,jsonb,uuid)'::regprocedure)
  loop
    execute format('alter function %s security definer', rpc.signature);
    execute format('alter function %s owner to lemma_legacy_receipt_writer', rpc.signature);
    -- Old SECURITY DEFINER MCP dispatchers could execute these functions as
    -- their owner. Keep that right even for a non-superuser migration owner.
    set local role lemma_legacy_receipt_writer;
    execute format('grant execute on function %s to %I', rpc.signature, rpc.previous_owner);
    execute format('set local role %I', migration_owner);
  end loop;
end;
$legacy_rpcs$;
revoke create on schema public from lemma_legacy_receipt_writer;

-- The study command's trusted dispatcher checks timer leases, locks the
-- operation ID, and journals the mutation. Elevating a directly callable timer
-- helper would change what the existing current_user-based timer guards see.
-- Preserve its existing invoker implementation for the dispatcher's trusted
-- context. Direct callers of the old signature enter through the same checks.
create schema lemma_receipt_dispatch;
revoke all on schema lemma_receipt_dispatch from public, anon, authenticated, service_role;
alter function public.study_command_lifecycle(jsonb, uuid, uuid) set schema lemma_receipt_dispatch;
alter function public.study_command_correction(jsonb, uuid, uuid) set schema lemma_receipt_dispatch;
alter function public.lemma_study_timer_command(jsonb, uuid, uuid) set schema lemma_receipt_dispatch;
revoke all on all functions in schema lemma_receipt_dispatch from public, anon, authenticated, service_role;

create function public.study_command_lifecycle(p jsonb, v_owner uuid, v_operation_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $lifecycle$
declare
  result jsonb;
begin
  if pg_catalog.has_schema_privilege('lemma_receipt_dispatch', 'USAGE') then
    return lemma_receipt_dispatch.study_command_lifecycle(p, v_owner, v_operation_id);
  end if;
  if v_owner is null or v_owner is distinct from auth.uid() or v_operation_id is null
    or (p ? 'operationId' and (p->>'operationId')::uuid is distinct from v_operation_id)
    or p->>'resource' is null or p->>'resource' not in ('study_entries', 'study_intervals')
    or p->>'operation' is null or p->>'operation' not in
       ('create','update','delete','start','pause','resume','break','save','discard') then
    raise exception 'Invalid owner-bound study lifecycle envelope';
  end if;
  result := public.study_command(jsonb_build_object('schemaVersion', 1, 'operationId', v_operation_id) || p);
  -- The direct lifecycle helper historically left journal numbering to its caller.
  if result->>'status' = 'ok' then
    return jsonb_set(result, '{actionNo}', 'null'::jsonb);
  end if;
  return result;
end;
$lifecycle$;

create function public.study_command_correction(p jsonb, v_owner uuid, v_operation_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $correction$
begin
  if pg_catalog.has_schema_privilege('lemma_receipt_dispatch', 'USAGE') then
    return lemma_receipt_dispatch.study_command_correction(p, v_owner, v_operation_id);
  end if;
  if v_owner is null or v_owner is distinct from auth.uid() or v_operation_id is null
    or (p->>'operationId')::uuid is distinct from v_operation_id
    or p->'schemaVersion' is distinct from '1'::jsonb
    or p->>'resource' is distinct from 'study_entries'
    or p->>'operation' is null or p->>'operation' not in ('create_manual','correct','split','void','restore') then
    raise exception 'Invalid v2 command envelope';
  end if;
  return public.study_command(p);
end;
$correction$;

create function public.lemma_study_timer_command(p jsonb, p_owner uuid, p_operation_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $timer$
begin
  if pg_catalog.has_schema_privilege('lemma_receipt_dispatch', 'USAGE') then
    return lemma_receipt_dispatch.lemma_study_timer_command(p, p_owner, p_operation_id);
  end if;
  if p_owner is null or p_owner is distinct from auth.uid() or p_operation_id is null
    or (p->>'operationId')::uuid is distinct from p_operation_id
    or p->'schemaVersion' is distinct from '1'::jsonb
    or p->>'resource' is distinct from 'study_entries'
    or p->>'operation' is null or p->>'operation' not in ('take_lease','next_phase','exclude_minutes') then
    raise exception 'Invalid owner-bound timer command envelope';
  end if;
  return public.study_command(p);
end;
$timer$;

revoke all on function public.study_command_lifecycle(jsonb,uuid,uuid),
  public.study_command_correction(jsonb,uuid,uuid), public.lemma_study_timer_command(jsonb,uuid,uuid)
  from public, anon;
grant execute on function public.study_command_lifecycle(jsonb,uuid,uuid),
  public.study_command_correction(jsonb,uuid,uuid), public.lemma_study_timer_command(jsonb,uuid,uuid)
  to authenticated, service_role;

do $dispatcher$
declare
  dispatcher_owner name;
begin
  select pg_get_userbyid(proowner) into strict dispatcher_owner
  from pg_proc where oid = 'public.lemma_study_command_v2_compat(jsonb)'::regprocedure and prosecdef;
  execute format('grant usage on schema lemma_receipt_dispatch to %I', dispatcher_owner);
  execute format('grant execute on all functions in schema lemma_receipt_dispatch to %I', dispatcher_owner);
  -- A separately authorized installer owns the new public entry points. The
  -- historical dispatcher must be able to call each of those wrappers first.
  execute format('grant execute on function public.study_command_lifecycle(jsonb,uuid,uuid),
    public.study_command_correction(jsonb,uuid,uuid), public.lemma_study_timer_command(jsonb,uuid,uuid) to %I', dispatcher_owner);
end;
$dispatcher$;

-- Grants at the relation and column level are independent. A project may have
-- explicit column grants in addition to Supabase's table defaults.
revoke insert, update, delete, truncate, trigger on public.command_receipts from public, anon, authenticated;
do $columns$
declare
  columns text;
begin
  select string_agg(quote_ident(attname), ', ' order by attnum) into columns
    from pg_attribute where attrelid = 'public.command_receipts'::regclass and attnum > 0 and not attisdropped;
  execute format('revoke insert (%1$s), update (%1$s) on public.command_receipts from public, anon, authenticated', columns);
  if exists (select 1 from pg_roles r
    where (pg_has_role('authenticated',r.oid,'SET') or pg_has_role('anon',r.oid,'SET'))
      and (has_any_column_privilege(r.oid, 'public.command_receipts', 'INSERT,UPDATE')
        or has_table_privilege(r.oid, 'public.command_receipts', 'DELETE,TRUNCATE,TRIGGER')
        or has_schema_privilege(r.oid, 'lemma_receipt_dispatch', 'USAGE'))) then
    raise exception 'Client write or dispatch privileges remain after receipt cutover';
  end if;
  if has_schema_privilege('service_role', 'lemma_receipt_dispatch', 'USAGE') then
    raise exception 'Service callers must use the owner-bound study dispatcher';
  end if;
  if has_table_privilege('lemma_legacy_receipt_writer', 'public.command_receipts', 'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER')
    or has_column_privilege('lemma_legacy_receipt_writer', 'public.command_receipts', 'trusted_writer_version', 'INSERT,UPDATE')
    or has_schema_privilege('lemma_legacy_receipt_writer', 'public', 'CREATE') then
    raise exception 'Legacy receipt writer has broader privileges than required';
  end if;
end;
$columns$;
