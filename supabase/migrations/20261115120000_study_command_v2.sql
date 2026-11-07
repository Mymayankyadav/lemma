-- N51: additive columns for saved-study correction and task-linked blocks.
-- The complete audited command is appended in the same unmerged migration.
alter table public.study_entries
  add column approximate boolean not null default false,
  add column voided_at timestamptz;
alter table public.calendar_blocks add column task_id uuid;
alter table public.calendar_blocks add constraint calendar_blocks_task_owner_fk
  foreign key(user_id,task_id) references public.tasks(user_id,id)
  deferrable initially immediate;
create index calendar_blocks_owner_task on public.calendar_blocks(user_id,task_id)
  where task_id is not null;


-- All new operations are owner-scoped, transactional and tracked by the existing
-- receipt, action journal and registry-backed undo boundary. Older lifecycle
-- helper functions stay untouched; only study_command dispatch is extended.
create function public.study_command_correction(
 p jsonb, v_owner uuid, v_operation_id uuid
) returns jsonb language plpgsql security invoker set search_path='' as $v2$
declare
 v_op text := p->>'operation';
 v_patch jsonb := coalesce(p->'patch','{}'::jsonb);
 v_target jsonb := coalesce(p->'target','{}'::jsonb);
 v_id uuid; v_new_id uuid; v_expected integer; v_bad text;
 v_old public.study_entries%rowtype; v_new public.study_entries%rowtype;
 v_interval jsonb; v_row public.study_intervals%rowtype;
 v_start timestamptz; v_end timestamptz; v_split timestamptz;
 v_ranges tstzrange[] := array[]::tstzrange[];
 v_action bigint; v_receipt jsonb; v_stored jsonb; v_changed jsonb;
 v_now timestamptz := pg_catalog.clock_timestamp();
begin
 if v_owner is null or (select auth.uid()) is distinct from v_owner then
  raise exception 'Authentication required';
 end if;
 -- This helper is executable by the same owner role as study_command, so it
 -- independently enforces the public envelope, retry and audit boundary.
 if p is null or pg_catalog.jsonb_typeof(p) is distinct from 'object'
   or pg_catalog.jsonb_typeof(p->'operationId') is distinct from 'string'
   or (p->>'operationId')::uuid is distinct from v_operation_id
   or v_operation_id is null
   or pg_catalog.jsonb_typeof(p->'schemaVersion') is distinct from 'number'
   or p->>'schemaVersion' is distinct from '1' then
    raise exception 'Invalid v2 command envelope'; end if;
 select k into v_bad from pg_catalog.jsonb_object_keys(p) as keys(k)
  where k<>all(array['operationId','schemaVersion','resource',
                       'operation','target','expectedVersion','patch']) limit 1;
 if v_bad is not null then raise exception 'Unknown command field: %',v_bad; end if;
 perform pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended(v_owner::text||':'||v_operation_id::text,0));
 select result into v_stored from public.command_receipts
  where user_id=v_owner and operation_id=v_operation_id;
 if found then
  if v_stored->'_request'=p then return v_stored-'_request'; end if;
  return pg_catalog.jsonb_build_object(
    'operationId',v_operation_id,'status','conflict',
    'changed','[]'::jsonb,'actionNo',null,
    'conflict',pg_catalog.jsonb_build_object(
      'reason','operationId reused with a different payload'));
 end if;
 perform pg_catalog.set_config('lemma.source',
   case when current_setting('role',true)='service_role'
     and pg_catalog.current_setting('lemma.source',true) in
       ('claude','chatgpt','other','system')
        then pg_catalog.current_setting('lemma.source',true)
     when current_setting('role',true)='service_role' then 'other'
     else 'app' end,true);
 if p->>'resource' is distinct from 'study_entries'
   or v_op not in ('create_manual','correct','split','void','restore') then
  raise exception 'Unsupported saved-study operation';
 end if;
 if pg_catalog.jsonb_typeof(v_target) is distinct from 'object'
   or pg_catalog.jsonb_typeof(v_patch) is distinct from 'object' then
  raise exception 'target and patch must be objects';
 end if;
 select k into v_bad from pg_catalog.jsonb_object_keys(v_target) as t(k)
   where k<>'id' limit 1;
 if v_bad is not null then raise exception 'Unknown target field: %',v_bad; end if;
 select k into v_bad from pg_catalog.jsonb_object_keys(v_patch) as t(k)
   where k<>all(case when v_op in ('create_manual','correct') then
     array['intent','subject_id','project_id','checkpoint_id','session_id',
           'rating','reflection','intervals']
     when v_op='split' then array['at']
     else array[]::text[] end) limit 1;
 if v_bad is not null then raise exception 'Unknown patch field: %',v_bad; end if;
 if v_op='create_manual' then
  if p?'expectedVersion' and
    (pg_catalog.jsonb_typeof(p->'expectedVersion') is distinct from 'number'
      or p->>'expectedVersion' is distinct from '0') then
    raise exception 'create_manual expectedVersion must be 0 or absent'; end if;
  if v_target?'id' and pg_catalog.jsonb_typeof(v_target->'id') is distinct from 'string'
    then raise exception 'target.id must be a UUID'; end if;
  v_id:=coalesce(nullif(v_target->>'id','')::uuid,pg_catalog.gen_random_uuid());
 else
  if pg_catalog.jsonb_typeof(v_target->'id') is distinct from 'string'
    or nullif(v_target->>'id','') is null then
    raise exception 'target.id required'; end if;
  v_id:=(v_target->>'id')::uuid;
  if pg_catalog.jsonb_typeof(p->'expectedVersion') is distinct from 'number'
    or p->>'expectedVersion' !~ '^[1-9][0-9]*$'
    or (p->>'expectedVersion')::numeric>2147483647 then
    raise exception 'expectedVersion must be a positive int32'; end if;
  v_expected:=(p->>'expectedVersion')::integer;
 end if;
 if v_op in ('void','restore') and v_patch<>'{}'::jsonb then
  raise exception 'Status transition patch must be empty'; end if;
 if v_op='correct' and v_patch='{}'::jsonb then
  raise exception 'Correction patch must not be empty'; end if;
 if v_op='split' then
  if pg_catalog.jsonb_typeof(v_patch->'at') is distinct from 'string'
    or v_patch->>'at' !~
      '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$' then
    raise exception 'split.at must be an explicit-offset ISO instant'; end if;
  v_split:=(v_patch->>'at')::timestamptz;
 end if;
 -- An interval correction is a replacement of the complete interval set.
 -- Check every supplied interval before touching any row, including cross-kind
 -- overlaps. tstzrange [) permits adjacent intervals with no phantom gap.
 if v_op='create_manual' and not (v_patch?'intervals') then
  raise exception 'Manual entry needs intervals'; end if;
 if v_patch?'intervals' then
  if pg_catalog.jsonb_typeof(v_patch->'intervals') is distinct from 'array'
    or pg_catalog.jsonb_array_length(v_patch->'intervals') not between 1 and 1000 then
    raise exception 'Provide 1–1000 closed intervals'; end if;
  for v_interval in select value from pg_catalog.jsonb_array_elements(
    v_patch->'intervals') as elems(value) loop
    if pg_catalog.jsonb_typeof(v_interval) is distinct from 'object' then
      raise exception 'Interval must be an object'; end if;
    select k into v_bad from pg_catalog.jsonb_object_keys(v_interval) as t(k)
      where k<>all(array['kind','started_at','ended_at']) limit 1;
    if v_bad is not null then raise exception 'Unknown interval field: %',v_bad; end if;
    if v_interval->>'kind' not in ('focus','break')
       or pg_catalog.jsonb_typeof(v_interval->'started_at') is distinct from 'string'
       or pg_catalog.jsonb_typeof(v_interval->'ended_at') is distinct from 'string'
       or v_interval->>'started_at' !~
        '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$'
       or v_interval->>'ended_at' !~
        '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$' then
      raise exception 'Invalid interval kind or timezone-aware instants'; end if;
    v_start:=(v_interval->>'started_at')::timestamptz;
    v_end:=(v_interval->>'ended_at')::timestamptz;
    if v_end<=v_start or v_end>v_now then
      raise exception 'Closed interval must have end after start, not in future'; end if;
    if exists(select 1 from pg_catalog.unnest(v_ranges) as spans(span)
      where spans.span && pg_catalog.tstzrange(v_start,v_end,'[)')) then
      raise exception 'Overlapping corrected intervals are not allowed'; end if;
    v_ranges:=pg_catalog.array_append(v_ranges,
      pg_catalog.tstzrange(v_start,v_end,'[)'));
  end loop;
 end if;
 if v_op='create_manual' then
  insert into public.study_entries(
    id,user_id,source,status,approximate,intent,subject_id,project_id,
    checkpoint_id,session_id,reflection,rating,saved_at)
   values(v_id,v_owner,'manual','saved',true,
    coalesce(v_patch->>'intent',''),
    (v_patch->>'subject_id')::uuid,(v_patch->>'project_id')::uuid,
    (v_patch->>'checkpoint_id')::uuid,(v_patch->>'session_id')::uuid,
    v_patch->>'reflection',(v_patch->>'rating')::smallint,v_now)
   returning * into v_new;
 else
  select * into v_old from public.study_entries
   where user_id=v_owner and id=v_id for update;
  if not found then raise exception 'Study entry not found'; end if;
  if v_expected is distinct from v_old.version then
    v_receipt:=pg_catalog.jsonb_build_object(
     'operationId',v_operation_id,'status','conflict',
     'changed','[]'::jsonb,'actionNo',null,'current',pg_catalog.to_jsonb(v_old),
     'conflict',pg_catalog.jsonb_build_object(
       'expectedVersion',v_expected,'currentVersion',v_old.version));
  else
   if v_op in ('correct','split','void') and
      (v_old.status<>'saved' or v_old.voided_at is not null) then
      raise exception 'Only unvoided saved entries may be corrected, split or voided';
   end if;
   if v_op='restore' and (v_old.status<>'discarded' or v_old.voided_at is null) then
      raise exception 'Only voided entries may be restored'; end if;
   if v_op='correct' then
    update public.study_entries set
      intent=case when v_patch?'intent' then v_patch->>'intent' else intent end,
      subject_id=case when v_patch?'subject_id' then (v_patch->>'subject_id')::uuid else subject_id end,
      project_id=case when v_patch?'project_id' then (v_patch->>'project_id')::uuid else project_id end,
      checkpoint_id=case when v_patch?'checkpoint_id' then (v_patch->>'checkpoint_id')::uuid else checkpoint_id end,
      session_id=case when v_patch?'session_id' then (v_patch->>'session_id')::uuid else session_id end,
      reflection=case when v_patch?'reflection' then v_patch->>'reflection' else reflection end,
      rating=case when v_patch?'rating' then (v_patch->>'rating')::smallint else rating end,
      version=version+1,updated_at=v_now
     where id=v_id and user_id=v_owner returning * into v_new;
   elsif v_op='split' then
    -- Preserve the exact union of durations by partitioning closed spans at
    -- the requested absolute instant, never at a guessed civil midnight.
    if not exists(select 1 from public.study_intervals
      where user_id=v_owner and entry_id=v_id and started_at<v_split)
     or not exists(select 1 from public.study_intervals
      where user_id=v_owner and entry_id=v_id and ended_at>v_split)
     or exists(select 1 from public.study_intervals
      where user_id=v_owner and entry_id=v_id and ended_at is null) then
      raise exception 'Split instant must leave nonempty closed time on both sides';
    end if;
    insert into public.study_entries(
      user_id,source,status,approximate,intent,subject_id,project_id,
      checkpoint_id,session_id,reflection,rating,saved_at)
    values(v_owner,v_old.source,'saved',v_old.approximate,
      v_old.intent,v_old.subject_id,v_old.project_id,v_old.checkpoint_id,
      v_old.session_id,v_old.reflection,v_old.rating,v_old.saved_at)
    returning * into v_new;
    v_new_id:=v_new.id;
    for v_row in select * from public.study_intervals
      where user_id=v_owner and entry_id=v_id
      order by started_at,id for update loop
      if v_row.started_at >= v_split then
        update public.study_intervals set entry_id=v_new_id
          where id=v_row.id and user_id=v_owner;
      elsif v_row.ended_at>v_split then
        update public.study_intervals set ended_at=v_split
          where id=v_row.id and user_id=v_owner;
        insert into public.study_intervals(user_id,entry_id,kind,started_at,ended_at)
        values(v_owner,v_new_id,v_row.kind,v_split,v_row.ended_at);
      end if;
    end loop;
    update public.study_entries set version=version+1,updated_at=v_now
     where user_id=v_owner and id=v_id returning * into v_old;
   elsif v_op='void' then
    update public.study_entries set status='discarded',voided_at=v_now,
      version=version+1,updated_at=v_now
      where user_id=v_owner and id=v_id returning * into v_new;
   else
    update public.study_entries set status='saved',voided_at=null,
      version=version+1,updated_at=v_now
      where user_id=v_owner and id=v_id returning * into v_new;
   end if;
  end if;
 end if;
 if v_receipt is null then
   if v_op in ('create_manual','correct') and v_patch?'intervals' then
     if v_op='correct' then
       delete from public.study_intervals where entry_id=v_id and user_id=v_owner;
     end if;
     for v_interval in select value from pg_catalog.jsonb_array_elements(
       v_patch->'intervals') as elems(value) loop
       insert into public.study_intervals(user_id,entry_id,kind,started_at,ended_at)
       values(v_owner,v_id,v_interval->>'kind',
         (v_interval->>'started_at')::timestamptz,
         (v_interval->>'ended_at')::timestamptz);
     end loop;
   end if;
   select no into v_action from public.actions
     where txid=pg_catalog.txid_current() and user_id=v_owner;
   if v_action is null then raise exception 'Study correction lacks a journal action'; end if;
   if v_op='split' then
      v_changed:=pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('id',v_old.id,'version',v_old.version),
        pg_catalog.jsonb_build_object('id',v_new.id,'version',v_new.version));
   else
      v_changed:=pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('id',v_new.id,'version',v_new.version));
   end if;
   v_receipt:=pg_catalog.jsonb_build_object(
      'operationId',v_operation_id,'status','ok',
      'changed',v_changed,'actionNo',v_action);
 end if;
 insert into public.command_receipts(user_id,operation_id,resource,result)
 values(v_owner,v_operation_id,'study_entries',
   v_receipt||pg_catalog.jsonb_build_object('_request',p));
 return v_receipt;
end
$v2$;
revoke all on function public.study_command_correction(jsonb,uuid,uuid)
 from public,anon;
grant execute on function public.study_command_correction(jsonb,uuid,uuid)
 to authenticated,service_role;

-- Keep N11.1/N11.2 command envelope, receipt replay and conflict semantics.
create or replace function public.study_command(p jsonb)
returns jsonb
language plpgsql security invoker set search_path = ''
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
begin
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
    return v_receipt;
  end if;

  select k into v_bad from pg_catalog.jsonb_object_keys(p) as t(k)
    where k <> all(array['operationId','schemaVersion','resource',
                        'operation','target','expectedVersion','patch'])
    limit 1;
  if v_bad is not null then raise exception 'Unknown command field: %', v_bad; end if;
  if pg_catalog.jsonb_typeof(p -> 'schemaVersion') is distinct from 'number'
      or p ->> 'schemaVersion' is distinct from '1' then
    raise exception 'schemaVersion must be 1';
  end if;
  v_resource := p ->> 'resource';
  v_operation := p ->> 'operation';
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
