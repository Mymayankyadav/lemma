-- N44.2: validated owner command, receipt replay, reversible task conversion.
-- The validator also rejects caller-supplied provenance and owner fields.
create function public.parked_thoughts_validate_envelope(p jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $validate$
declare
  v_operation text;
  v_operation_id uuid;
  v_target jsonb;
  v_patch jsonb;
  v_allowed text[];
  v_bad text;
  v_link_key text;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;
  if p is null or pg_catalog.jsonb_typeof(p) is distinct from 'object' then
    raise exception 'Command envelope must be an object';
  end if;
  select k into v_bad from pg_catalog.jsonb_object_keys(p) as keys(k)
    where k <> all(array['operationId','schemaVersion','resource',
      'operation','target','expectedVersion','patch']) limit 1;
  if v_bad is not null then raise exception 'Unknown command field: %',v_bad; end if;
  if nullif(p->>'operationId','') is null then
    raise exception 'operationId is required';
  end if;
  v_operation_id := (p->>'operationId')::uuid;
  if pg_catalog.jsonb_typeof(p->'schemaVersion') is distinct from 'number'
     or p->>'schemaVersion' is distinct from '1' then
    raise exception 'schemaVersion must be 1';
  end if;
  if p->>'resource' is distinct from 'parked_thoughts' then
    raise exception 'Unsupported resource';
  end if;
  v_operation := p->>'operation';
  if v_operation is null or v_operation not in
    ('create','edit','dismiss','reopen','delete','convert_to_task') then
    raise exception 'Unsupported thought operation';
  end if;

  v_target := coalesce(p->'target','{}'::jsonb);
  if pg_catalog.jsonb_typeof(v_target) is distinct from 'object' then
    raise exception 'target must be an object';
  end if;
  select k into v_bad from pg_catalog.jsonb_object_keys(v_target) as keys(k)
    where k <> 'id' limit 1;
  if v_bad is not null then raise exception 'Unknown target field: %',v_bad; end if;
  -- When create supplies a target ID, it must be a typed UUID as on edits.
  if v_target?'id' and
    (pg_catalog.jsonb_typeof(v_target->'id') is distinct from 'string'
     or nullif(v_target->>'id','') is null) then
    raise exception 'target.id must be a UUID';
  end if;
  if v_operation <> 'create' and nullif(v_target->>'id','') is null then
    raise exception 'target.id is required';
  end if;
  if nullif(v_target->>'id','') is not null then
    perform (v_target->>'id')::uuid;
  end if;
  if v_operation = 'create' then
    if p?'expectedVersion' and
      (pg_catalog.jsonb_typeof(p->'expectedVersion') is distinct from 'number'
       or p->>'expectedVersion' is distinct from '0') then
      raise exception 'Create expectedVersion must be absent or zero';
    end if;
  else
    if pg_catalog.jsonb_typeof(p->'expectedVersion') is distinct from 'number'
       or p->>'expectedVersion' !~ '^[1-9][0-9]*$' then
      raise exception 'expectedVersion must be a positive integer';
    end if;
    if (p->>'expectedVersion')::numeric > 2147483647 then
      raise exception 'expectedVersion exceeds int4';
    end if;
  end if;

  v_patch := coalesce(p->'patch','{}'::jsonb);
  if pg_catalog.jsonb_typeof(v_patch) is distinct from 'object' then
    raise exception 'patch must be an object';
  end if;
  v_allowed := case v_operation
    when 'create' then array['text','study_entry_id']
    when 'edit' then array['text','study_entry_id']
    when 'convert_to_task' then array[
      'title','body','estimate_minutes','priority','due_kind',
      'due_date','due_at','position','subject_id','project_id','checkpoint_id']
    else array[]::text[] end;
  select k into v_bad from pg_catalog.jsonb_object_keys(v_patch) as keys(k)
    where k <> all(v_allowed) limit 1;
  if v_bad is not null then raise exception 'Unknown patch field: %',v_bad; end if;
  if v_operation='create' and not (v_patch?'text') then
    raise exception 'Thought text required';
  end if;
  if v_operation='edit' and v_patch='{}'::jsonb then
    raise exception 'Edit patch must not be empty';
  end if;
  if v_patch?'text' and
      (pg_catalog.jsonb_typeof(v_patch->'text') is distinct from 'string'
       or pg_catalog.length(pg_catalog.btrim(v_patch->>'text')) not between 1 and 4000) then
    raise exception 'Thought text must be 1–4000 characters';
  end if;
  if v_patch?'study_entry_id' and v_patch->>'study_entry_id' is not null then
    perform (v_patch->>'study_entry_id')::uuid;
  end if;
  if v_operation='convert_to_task' and
    (pg_catalog.jsonb_typeof(v_patch->'title') is distinct from 'string'
     or pg_catalog.length(pg_catalog.btrim(v_patch->>'title'))=0) then
    raise exception 'Task title required';
  end if;
  if v_operation='convert_to_task' and v_patch?'priority' and
    (pg_catalog.jsonb_typeof(v_patch->'priority') is distinct from 'string'
     or v_patch->>'priority' not in ('low','normal','high')) then
    raise exception 'Invalid task priority';
  end if;
  -- Validate caller-supplied UUID links before task conversion reaches
  -- the future transactional command; null clears an optional link.
  if v_operation='convert_to_task' then
    foreach v_link_key in array array['subject_id','project_id','checkpoint_id'] loop
      if v_patch?v_link_key and v_patch->v_link_key <> 'null'::jsonb then
        if pg_catalog.jsonb_typeof(v_patch->v_link_key) is distinct from 'string' then
          raise exception 'Task % must be a UUID', v_link_key;
        end if;
        perform (v_patch->>v_link_key)::uuid;
      end if;
    end loop;
  end if;
  -- Validation precedes fresh writes; the command additionally checks ownership,
  -- current versions and task constraints under transaction locks.
  return p;
end
$validate$;
revoke all on function public.parked_thoughts_validate_envelope(jsonb) from public,anon;
grant execute on function public.parked_thoughts_validate_envelope(jsonb)
  to authenticated,service_role;

-- The existing owner-SELECT-only RLS remains intact: authenticated callers
-- cannot bypass receipts with INSERT/UPDATE/DELETE even after permissive grants.
-- A definer writer performs strict auth.uid checks and is exposed through the
-- invoker command, matching the N42 deadline command's security boundary.
create trigger lemma_log_change after insert or update or delete
on public.parked_thoughts for each row execute function public.log_change();

create function public.parked_thoughts_write_owned(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $write$
declare
 v_owner uuid; v_operation_id uuid; v_op text; v_id uuid;
 v_patch jsonb; v_expected integer; v_old public.parked_thoughts%rowtype;
 v_new public.parked_thoughts%rowtype; v_task public.tasks%rowtype;
 v_stored jsonb; v_receipt jsonb; v_changed jsonb; v_action bigint;
 v_source text; v_key text; v_due_kind text;
begin
 v_owner:=(select auth.uid());
 if v_owner is null then raise exception 'Authentication required'; end if;
 if p is null or pg_catalog.jsonb_typeof(p) is distinct from 'object' then
  raise exception 'Command envelope must be an object'; end if;
 if pg_catalog.jsonb_typeof(p->'operationId') is distinct from 'string'
    or nullif(p->>'operationId','') is null then
  raise exception 'operationId is required'; end if;
 v_operation_id:=(p->>'operationId')::uuid;
 perform pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended(v_owner::text||':'||v_operation_id::text,0));
 select result into v_stored from public.command_receipts
  where user_id=v_owner and operation_id=v_operation_id;
 if found then
  if v_stored->'_request'=p then return v_stored-'_request'; end if;
  return pg_catalog.jsonb_build_object('operationId',v_operation_id,
   'status','conflict','changed','[]'::jsonb,'actionNo',null,
   'conflict',pg_catalog.jsonb_build_object(
    'reason','operationId reused with a different payload'));
 end if;

 -- Validate only first-time requests. The receipt branch above is intentionally
 -- before optimistic checks, so an uncertain outcome can be retried verbatim.
 perform public.parked_thoughts_validate_envelope(p);
 v_op:=p->>'operation';
 v_patch:=coalesce(p->'patch','{}'::jsonb);
 if v_op='create' then
  v_id:=coalesce(nullif(p->'target'->>'id','')::uuid,
                  pg_catalog.gen_random_uuid());
 else
  v_id:=(p->'target'->>'id')::uuid;
  v_expected:=(p->>'expectedVersion')::integer;
 end if;
 -- Only the authenticated, service-role MCP bridge may supply MCP provenance.
 -- Never trust caller-set lemma.source, owner, status or timestamps.
 v_source:=case when current_setting('role',true)='service_role'
                 then 'mcp' else 'app' end;
 perform pg_catalog.set_config('lemma.source',v_source,true);
 perform pg_catalog.set_config('lemma.tool','parked_thoughts',true);
 perform pg_catalog.set_config('lemma.summary',
  pg_catalog.left('Parked thought '||v_op,200),true);

 if v_op='create' then
  insert into public.parked_thoughts(
   id,user_id,study_entry_id,text,status,source)
  values(v_id,v_owner,(v_patch->>'study_entry_id')::uuid,
         v_patch->>'text','open',v_source)
  returning * into v_new;
 else
  select * into v_old from public.parked_thoughts
   where id=v_id and user_id=v_owner for update;
  if not found then raise exception 'Thought not found'; end if;
  if v_old.version is distinct from v_expected then
   v_receipt:=pg_catalog.jsonb_build_object(
    'operationId',v_operation_id,'status','conflict',
    'changed','[]'::jsonb,'actionNo',null,'current',pg_catalog.to_jsonb(v_old),
    'conflict',pg_catalog.jsonb_build_object(
     'expectedVersion',v_expected,'currentVersion',v_old.version));
  else
   if v_op in ('edit','dismiss','convert_to_task')
      and v_old.status<>'open' then
    raise exception 'Only open thoughts may be edited or resolved';
   end if;
   if v_op='reopen' and v_old.status<>'dismissed' then
    raise exception 'Only dismissed thoughts may reopen';
   end if;
   if v_op='edit' then
    update public.parked_thoughts set
      text=case when v_patch?'text' then v_patch->>'text' else text end,
      study_entry_id=case when v_patch?'study_entry_id'
        then (v_patch->>'study_entry_id')::uuid else study_entry_id end,
      version=version+1,updated_at=now(),source=v_source
     where user_id=v_owner and id=v_id returning * into v_new;
   elsif v_op='dismiss' then
    update public.parked_thoughts set status='dismissed',resolved_at=now(),
      version=version+1,updated_at=now(),source=v_source
     where user_id=v_owner and id=v_id returning * into v_new;
   elsif v_op='reopen' then
    update public.parked_thoughts set status='open',resolved_at=null,
      destination_kind=null,destination_id=null,
      version=version+1,updated_at=now(),source=v_source
     where user_id=v_owner and id=v_id returning * into v_new;
   elsif v_op='delete' then
    delete from public.parked_thoughts
     where id=v_id and user_id=v_owner returning * into v_new;
   elsif v_op='convert_to_task' then
    -- The task is created first, and the thought is linked in the same
    -- transaction. Any constraint or journal failure rolls both back.
    for v_key in select value from pg_catalog.unnest(
      array['title','body','due_kind','due_date','due_at']) as f(value)
    loop
     if v_patch?v_key and v_patch->v_key <> 'null'::jsonb
       and pg_catalog.jsonb_typeof(v_patch->v_key) <> 'string' then
      raise exception 'Task % must be a string',v_key;
     end if;
    end loop;
    if v_patch?'body' and v_patch->'body'='null'::jsonb then
     raise exception 'Task body must be a string'; end if;
    if v_patch?'estimate_minutes' and
      v_patch->'estimate_minutes'<>'null'::jsonb and (
       pg_catalog.jsonb_typeof(v_patch->'estimate_minutes')<>'number'
       or v_patch->>'estimate_minutes' !~ '^(0|[1-9][0-9]*)$'
       or (v_patch->>'estimate_minutes')::numeric>2147483647) then
     raise exception 'Invalid task estimate_minutes'; end if;
    if v_patch?'position' and (
       pg_catalog.jsonb_typeof(v_patch->'position')<>'number'
       or v_patch->>'position' !~ '^-?(0|[1-9][0-9]*)$'
       or (v_patch->>'position')::numeric not between -2147483648 and 2147483647) then
     raise exception 'Invalid task position'; end if;
    v_due_kind:=coalesce(v_patch->>'due_kind','none');
    if v_due_kind not in ('none','date','instant') then
     raise exception 'Invalid task due_kind'; end if;
    if v_patch?'due_date' and v_patch->'due_date'<>'null'::jsonb then
     if v_patch->>'due_date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception 'Invalid task due_date'; end if;
    end if;
    if v_patch?'due_at' and v_patch->'due_at'<>'null'::jsonb then
     if v_patch->>'due_at' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T' then
      raise exception 'Invalid task due_at'; end if;
    end if;
    insert into public.tasks(
      user_id,title,body,subject_id,project_id,checkpoint_id,
      estimate_minutes,priority,due_kind,due_date,due_at,position,status)
    values (
      v_owner,v_patch->>'title',coalesce(v_patch->>'body',''),
      (v_patch->>'subject_id')::uuid,
      (v_patch->>'project_id')::uuid,
      (v_patch->>'checkpoint_id')::uuid,
      (v_patch->>'estimate_minutes')::integer,
      coalesce(v_patch->>'priority','normal'),v_due_kind,
      (v_patch->>'due_date')::date,
      (v_patch->>'due_at')::timestamptz,
      coalesce((v_patch->>'position')::integer,0),'backlog')
    returning * into v_task;
    update public.parked_thoughts
     set status='converted',destination_kind='task',destination_id=v_task.id,
       resolved_at=now(),version=version+1,updated_at=now(),source=v_source
     where user_id=v_owner and id=v_id returning * into v_new;
   end if;
  end if;
 end if;
 if v_receipt is null then
  v_changed:=pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'resource','parked_thoughts','id',v_new.id,'version',v_new.version));
  if v_task.id is not null then
   v_changed:=v_changed||pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object('resource','tasks',
                                 'id',v_task.id,'version',v_task.version));
  end if;
  select no into v_action from public.actions
   where txid=pg_catalog.txid_current() and user_id=v_owner;
  if v_action is null then
   raise exception 'Parked thought mutation missing journal action';
  end if;
  v_receipt:=pg_catalog.jsonb_build_object(
   'operationId',v_operation_id,'status','ok','changed',v_changed,
   'actionNo',v_action,'thought',pg_catalog.to_jsonb(v_new));
  if v_task.id is not null then
   v_receipt:=v_receipt||pg_catalog.jsonb_build_object(
    'task',pg_catalog.to_jsonb(v_task));
  end if;
 end if;
 insert into public.command_receipts(user_id,operation_id,resource,result)
 values(v_owner,v_operation_id,'parked_thoughts',
        v_receipt||pg_catalog.jsonb_build_object('_request',p));
 return v_receipt;
end
$write$;

create function public.parked_thoughts_command(p jsonb) returns jsonb
language sql volatile security invoker set search_path='' as $command$
 select public.parked_thoughts_write_owned(p)
$command$;
revoke all on function public.parked_thoughts_write_owned(jsonb)
 from public,anon;
revoke all on function public.parked_thoughts_command(jsonb)
 from public,anon;
grant execute on function public.parked_thoughts_write_owned(jsonb)
 to authenticated,service_role;
grant execute on function public.parked_thoughts_command(jsonb)
 to authenticated,service_role;

-- The generic undo/MCP dispatcher already consumes these registries.
-- Do not replace existing functions or give client tables unaudited DML.
insert into public.lemma_undo_tables(table_name)
 values('parked_thoughts');
insert into public.lemma_command_resources(resource,command_fn,mcp_ok,"schema")
 values('parked_thoughts','parked_thoughts_command',true,
  '{"operations":["create","edit","dismiss","reopen","delete","convert_to_task"],
    "fields":["text","study_entry_id","title","body","estimate_minutes",
      "priority","due_kind","due_date","due_at","position",
      "subject_id","project_id","checkpoint_id"]}'::jsonb);
