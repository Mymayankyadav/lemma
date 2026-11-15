-- N165: reviewed additive bug-hunt corrections; ordered part 12.
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
    if p->>'resource'='study_entries' and p->>'operation' in
      ('create_manual','correct','split','void','restore',
       'take_lease','next_phase','exclude_minutes') then
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
                   'status','subject_id','project_id','checkpoint_id','session_id','task_id'] end)
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
      subject_id,project_id,checkpoint_id,session_id,task_id
    ) values (
      v_id,v_owner,v_patch ->> 'kind',v_patch ->> 'title',
      (v_patch ->> 'starts_at')::timestamptz,(v_patch ->> 'ends_at')::timestamptz,
      v_patch ->> 'time_zone',coalesce(v_patch ->> 'status','planned'),
      (v_patch ->> 'subject_id')::uuid,(v_patch ->> 'project_id')::uuid,
      (v_patch ->> 'checkpoint_id')::uuid,(v_patch ->> 'session_id')::uuid,
      (v_patch ->> 'task_id')::uuid
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
        task_id = v_new.task_id,
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
    values(v_owner,v_operation_id,v_resource,v_receipt);
  return v_receipt;
end
$study$;

