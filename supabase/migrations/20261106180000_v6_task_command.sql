-- N22 / D7: one additive task command and reversible journal boundary.
-- Existing study commands and migrations are not modified.
create trigger lemma_log_change after insert or update or delete on public.tasks
  for each row execute function public.log_change();

-- D7 permits making only the tasks' existing foreign keys deferrable for undo.
do $task_fks$
declare c record;
begin
 for c in select conrelid::regclass as table_name, conname
  from pg_catalog.pg_constraint
  where contype = 'f' and not condeferrable
   and conrelid = 'public.tasks'::regclass
 loop
  execute format('alter table %s alter constraint %I deferrable initially immediate',
                 c.table_name, c.conname);
 end loop;
end $task_fks$;

-- D7: compatible undo_action body; ONLY 'tasks' appended to its two allowlists.
create or replace function public.undo_action(p_user uuid, p_no bigint, p_force boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  original public.actions%rowtype; c record; later text; inverse_no bigint;
  cols text; assignments text; extra text; changed integer; t text;
begin
  if p_user is null or (coalesce(current_setting('role',true),'') <> 'service_role'
      and auth.uid() is distinct from p_user) then
    raise exception 'Not authorized';
  end if;
  if exists(select 1 from public.actions where txid=txid_current()) then raise exception 'Undo must run in its own transaction'; end if;
  -- Block writers while checking conflicts and applying inverses. A concurrent write
  -- either completes before the check or starts after undo; failures roll back fully.
  foreach t in array array['settings','subjects','projects','sources','source_pages','concepts','concept_links','checkpoints','checkpoint_prereqs','checkpoint_concepts','styles','sessions','session_events','misconceptions','notes','cards','reviews','card_comments','proposals','diagnostics','study_entries','study_intervals','calendar_blocks','tasks'] loop
    execute format('lock table public.%I in share row exclusive mode',t);
  end loop;
  select * into original from public.actions where no=p_no and user_id=p_user for update;
  if not found then raise exception 'A% is not yours',p_no; end if;
  if original.undone_by is not null then raise exception 'A% is already undone (by A%)',p_no,original.undone_by; end if;
  select string_agg('A'||a.no, ', ' order by a.no desc) into later
  from public.actions a where a.user_id=p_user and a.no>p_no and a.undone_by is null
    and exists (select 1 from public.action_changes x join public.action_changes y
      on x.table_name=y.table_name and x.row_pk=y.row_pk
      where x.action_no=p_no and y.action_no=a.no);
  if later is not null then raise exception 'Undo % first',later; end if;
  perform set_config('lemma.source',coalesce(nullif(current_setting('lemma.source',true),''),'app'),true);
  perform set_config('lemma.tool','undo',true);
  perform set_config('lemma.summary',left('undo A'||p_no||': '||coalesce(original.summary,''),200),true);
  set constraints all deferred;
  for c in select * from public.action_changes where action_no=p_no order by seq desc loop
    -- Reject journal entries outside the fixed trigger set.
    if c.table_name <> all(array['settings','subjects','projects','sources','source_pages','concepts','concept_links','checkpoints','checkpoint_prereqs','checkpoint_concepts','styles','sessions','session_events','misconceptions','notes','cards','reviews','card_comments','proposals','diagnostics','study_entries','study_intervals','calendar_blocks','tasks']) then
      raise exception 'Unrecognized journal table';
    end if;
    if c.op='insert' then
      execute format('delete from public.%I t where to_jsonb(t) @> $1 and t.user_id=$2',c.table_name) using c.row_pk,p_user;
    elsif c.op='delete' then
      select string_agg(format('%I',a.attname),',' order by a.attnum) into cols
      from pg_catalog.pg_attribute a where a.attrelid=format('public.%I',c.table_name)::regclass
        and a.attnum>0 and not a.attisdropped and a.attgenerated='';
      execute format('insert into public.%I (%s) overriding system value select %s from jsonb_populate_record(null::public.%I,$1)', c.table_name,cols,cols,c.table_name) using c.old;
    else
      select string_agg(format('%1$I = r.%1$I',a.attname),',' order by a.attnum) into assignments
      from pg_catalog.pg_attribute a where a.attrelid=format('public.%I',c.table_name)::regclass
        and a.attnum>0 and not a.attisdropped and a.attgenerated='' and a.attidentity=''
        and c.old -> a.attname is distinct from c.new -> a.attname;
      if assignments is not null then
        execute format('update public.%I t set %s from jsonb_populate_record(null::public.%I,$1) r where to_jsonb(t) @> $2 and t.user_id=$3',c.table_name,assignments,c.table_name) using c.old,c.row_pk,p_user;
      end if;
    end if;
  end loop;
  select no into inverse_no from public.actions where txid=txid_current() and user_id=p_user;
  if inverse_no is null or inverse_no=p_no then raise exception 'Undo must run in its own transaction'; end if;
  select string_agg(table_name||' '||n, ', ') into extra from (
    select x.table_name,count(*) n from public.action_changes x
    where x.action_no=inverse_no and x.op='delete' and not exists (
      select 1 from public.action_changes y where y.action_no=p_no and y.table_name=x.table_name and y.row_pk=x.row_pk
    ) group by x.table_name) counts;
  if extra is not null and not p_force then raise exception 'Undo would also remove: %; undo those actions first or confirm',extra; end if;
  update public.actions set undoes=p_no where no=inverse_no;
  update public.actions set undone_by=inverse_no where no=p_no;
  if original.undoes is not null then update public.actions set undone_by=null where no=original.undoes and undone_by=p_no; end if;
  select count(*) into changed from public.action_changes where action_no=inverse_no;
  return jsonb_build_object('undone',p_no,'as',inverse_no,'changes',changed);
end $$;


-- Transactional, idempotent task writes scoped to the signed-in owner.
-- _request lives in the owner-RLS command receipt only; it is removed from
-- every public result so changed-payload retries cannot reuse another write.
create function public.task_command(p jsonb) returns jsonb
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

-- New invoker function may be invoked by signed-in owners only.
revoke all on function public.task_command(jsonb) from public,anon;
grant execute on function public.task_command(jsonb) to authenticated;

-- Connector owner is secret-authenticated by the MCP server; do not accept
-- user IDs in the chat tool. Mirror D6's owner-bound audit context.
create function public.mcp_task_command(p_user uuid,p_source text,p jsonb)
returns jsonb
language plpgsql security definer set search_path=''
as $mcp_task$
declare v_receipt jsonb;
begin
 if p_user is null or not exists (
  select 1 from public.settings where user_id=p_user
 ) then raise exception 'Owner not found'; end if;
 perform pg_catalog.set_config('lemma.source',p_source,true);
 perform pg_catalog.set_config('lemma.tool','study',true);
 perform pg_catalog.set_config('lemma.summary',
   pg_catalog.left(pg_catalog.concat('Task ',p ->> 'operation'),200),true);
 perform pg_catalog.set_config('request.jwt.claims',
   pg_catalog.jsonb_build_object('sub',p_user,'role','authenticated')::text,true);
 v_receipt := public.task_command(p);
 update public.settings set connector_last_seen_at=now(),
   connector_last_client=case when p_source in ('claude','chatgpt','other')
     then p_source else connector_last_client end
   where user_id=p_user;
 return v_receipt;
end
$mcp_task$;
revoke all on function public.mcp_task_command(uuid,text,jsonb)
 from public,anon,authenticated;
grant execute on function public.mcp_task_command(uuid,text,jsonb) to service_role;
