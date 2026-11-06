-- N11.2 study lifecycle. Replaces the command function compatibly.
-- The calendar_blocks branch below is retained from N11.1.
create function public.study_command_lifecycle(p jsonb, v_owner uuid, v_operation_id uuid)
returns jsonb language plpgsql security invoker set search_path = ''
as $lifecycle$
declare
 r text := p->>'resource';
 op text := p->>'operation';
 patch jsonb := coalesce(p->'patch','{}'::jsonb);
 target uuid := nullif(p#>>'{target,id}','')::uuid;
 expected integer;
 entry public.study_entries%rowtype;
 interval_row public.study_intervals%rowtype;
 changed uuid;
 ver integer;
 receipt jsonb;
 bad text;
 ts timestamptz := clock_timestamp();
begin
 if r not in ('study_entries','study_intervals') or r is null then raise exception 'Unsupported resource: %',r; end if;
 if jsonb_typeof(patch) <> 'object' then raise exception 'patch must be an object'; end if;
 if op not in ('create','update','delete','start','pause','resume','break','save','discard') or op is null then raise exception 'Unsupported operation: %',op; end if;
 -- source and entry_id identify the record at creation and cannot change later.
 -- Deletion consumes no patch; never acknowledge keys that the write ignores.
 if r='study_entries' then
   select k into bad from jsonb_object_keys(patch) t(k)
    where k <> all(case op
      when 'create' then array['intent','source','subject_id','project_id','checkpoint_id','session_id','reflection','rating']
      when 'delete' then array[]::text[]
      else array['intent','subject_id','project_id','checkpoint_id','session_id','reflection','rating']
    end) limit 1;
 else
   select k into bad from jsonb_object_keys(patch) t(k)
    where k <> all(case op
      when 'create' then array['entry_id','kind','started_at','ended_at']
      when 'delete' then array[]::text[]
      else array['kind','started_at','ended_at']
    end) limit 1;
 end if;
 if bad is not null then raise exception 'Unknown patch field: %',bad; end if;
 if op='create' then
   if p ? 'expectedVersion' and p->>'expectedVersion' <> '0' then raise exception 'create expectedVersion must be absent or 0'; end if;
   changed:=coalesce(target,gen_random_uuid());
   if r='study_entries' then
     insert into public.study_entries(id,user_id,intent,source,subject_id,project_id,checkpoint_id,session_id,reflection,rating)
     values(changed,v_owner,coalesce(patch->>'intent',''),patch->>'source',(patch->>'subject_id')::uuid,
       (patch->>'project_id')::uuid,(patch->>'checkpoint_id')::uuid,(patch->>'session_id')::uuid,
       patch->>'reflection',(patch->>'rating')::smallint) returning version into ver;
   else
     select * into entry from public.study_entries
       where id=(patch->>'entry_id')::uuid and user_id=v_owner for update;
     if not found then raise exception 'Study entry not found'; end if;
     if entry.status in ('saved','discarded') then raise exception 'Terminal study entry'; end if;
     if (patch->>'started_at')::timestamptz > ts then raise exception 'Future interval start'; end if;
     if (patch->>'ended_at')::timestamptz > ts then raise exception 'Future interval end'; end if;
     if (patch->>'ended_at') is null and exists(select 1 from public.study_intervals where entry_id=entry.id and user_id=v_owner and ended_at is null) then raise exception 'Open interval exists'; end if;
     insert into public.study_intervals(id,user_id,entry_id,kind,started_at,ended_at)
     values(changed,v_owner,(patch->>'entry_id')::uuid,patch->>'kind',
       (patch->>'started_at')::timestamptz,(patch->>'ended_at')::timestamptz);
     update public.study_entries set version=version+1,updated_at=ts where id=entry.id and user_id=v_owner returning version into ver;
   end if;
 else
   if target is null then raise exception 'target.id required'; end if;
   if jsonb_typeof(p->'expectedVersion') is distinct from 'number' then raise exception 'expectedVersion required'; end if;
   expected:=(p->>'expectedVersion')::integer;
   if expected < 1 then raise exception 'expectedVersion must be positive'; end if;
   if r='study_intervals' then
     if op not in ('update','delete') then raise exception 'Unsupported interval operation: %',op; end if;
     select * into interval_row from public.study_intervals where id=target and user_id=v_owner for update;
     if not found then raise exception 'Study interval not found'; end if;
     select * into entry from public.study_entries where id=interval_row.entry_id and user_id=v_owner for update;
     if not found then raise exception 'Study entry not found'; end if;
     if entry.status in ('saved','discarded') then raise exception 'Terminal study entry'; end if;
     if expected <> entry.version then
       receipt:=jsonb_build_object('operationId',v_operation_id,'status','conflict','changed','[]'::jsonb,'actionNo',null,
         'current',to_jsonb(interval_row),'conflict',jsonb_build_object('expectedVersion',expected,'currentVersion',entry.version));
     elsif op='delete' then
       delete from public.study_intervals where id=target and user_id=v_owner;
     else
       if (case when patch ? 'started_at' then (patch->>'started_at')::timestamptz else interval_row.started_at end) > ts then raise exception 'Future interval start'; end if;
       if (case when patch ? 'ended_at' then (patch->>'ended_at')::timestamptz else interval_row.ended_at end) > ts then raise exception 'Future interval end'; end if;
       if patch ? 'ended_at' and patch->'ended_at' = 'null'::jsonb and exists(select 1 from public.study_intervals where entry_id=entry.id and user_id=v_owner and id<>target and ended_at is null) then raise exception 'Open interval exists'; end if;
       update public.study_intervals set
         kind=case when patch ? 'kind' then patch->>'kind' else kind end,
         started_at=case when patch ? 'started_at' then (patch->>'started_at')::timestamptz else started_at end,
         ended_at=case when patch ? 'ended_at' then (patch->>'ended_at')::timestamptz else ended_at end
       where id=target and user_id=v_owner;
     end if;
     if receipt is null then
       update public.study_entries set version=version+1,updated_at=ts where id=entry.id and user_id=v_owner returning version into ver;
     end if;
     changed:=target;
   else
     select * into entry from public.study_entries where id=target and user_id=v_owner for update;
     if not found then raise exception 'Study entry not found'; end if;
     if entry.version <> expected then
       receipt:=jsonb_build_object('operationId',v_operation_id,'status','conflict','changed','[]'::jsonb,'actionNo',null,
         'current',to_jsonb(entry),'conflict',jsonb_build_object('expectedVersion',expected,'currentVersion',entry.version));
     else
       if entry.status in ('saved','discarded') then raise exception 'Terminal study entry'; end if;
       if op='start' and entry.status <> 'draft' then raise exception 'Invalid start transition'; end if;
       if op in ('pause','break') and entry.status <> 'running' then raise exception 'Invalid pause transition'; end if;
       if op='resume' and entry.status <> 'paused' then raise exception 'Invalid resume transition'; end if;
       if op='save' and entry.status not in ('running','paused','draft') then raise exception 'Invalid save transition'; end if;
       if op in ('pause','break','resume','save') and exists(select 1 from public.study_intervals where entry_id=target and user_id=v_owner and ended_at is null and started_at>=ts) then raise exception 'Future open interval'; end if;
       if op in ('pause','break','resume','save','discard') then
         update public.study_intervals set ended_at=ts
         where entry_id=target and user_id=v_owner and ended_at is null and started_at<ts;
       end if;
       if op='save' and exists(select 1 from public.study_intervals where entry_id=target and user_id=v_owner and ended_at is null) then raise exception 'Open interval remains'; end if;
       if op='discard' then
         delete from public.study_intervals where entry_id=target and user_id=v_owner;
       end if;
       if op in ('start','resume','break') then
         if exists(select 1 from public.study_intervals where entry_id=target and user_id=v_owner and ended_at is null) then
           raise exception 'Open interval exists';
         end if;
         insert into public.study_intervals(entry_id,user_id,kind,started_at)
         values(target,v_owner,case when op='break' then 'break' else 'focus' end,ts);
       end if;
       if op='delete' then
         delete from public.study_entries where id=target and user_id=v_owner;
         ver:=expected+1;
       else
         update public.study_entries set
           intent=case when patch ? 'intent' then patch->>'intent' else intent end,
           reflection=case when patch ? 'reflection' then patch->>'reflection' else reflection end,
           rating=case when patch ? 'rating' then (patch->>'rating')::smallint else rating end,
           subject_id=case when patch ? 'subject_id' then (patch->>'subject_id')::uuid else subject_id end,
           project_id=case when patch ? 'project_id' then (patch->>'project_id')::uuid else project_id end,
           checkpoint_id=case when patch ? 'checkpoint_id' then (patch->>'checkpoint_id')::uuid else checkpoint_id end,
           session_id=case when patch ? 'session_id' then (patch->>'session_id')::uuid else session_id end,
           status=case op when 'start' then 'running' when 'resume' then 'running'
             when 'pause' then 'paused' when 'break' then 'paused'
             when 'save' then 'saved' when 'discard' then 'discarded' else status end,
           saved_at=case when op='save' then ts else saved_at end,
           updated_at=ts,version=version+1
         where id=target and user_id=v_owner returning version into ver;
       end if;
       changed:=target;
     end if;
   end if;
 end if;
 if receipt is null then
   receipt:=jsonb_build_object('operationId',v_operation_id,'status','ok',
      'changed',jsonb_build_array(jsonb_build_object('id',changed,'version',ver)),'actionNo',null);
 end if;
 insert into public.command_receipts(user_id,operation_id,resource,result)
 values(v_owner,v_operation_id,r,receipt);
 return receipt;
end
$lifecycle$;
grant execute on function public.study_command_lifecycle(jsonb,uuid,uuid) to authenticated;

-- N11.1: calendar_blocks create/update command foundation (first split slice).
-- N11.2 covers study lifecycle; N11.3 will add deletion/undo journaling.
-- Security invoker and explicit auth.uid() checks preserve N10 owner RLS.
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
  if found then return v_receipt; end if;

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
  if v_resource in ('study_entries','study_intervals') then
    return public.study_command_lifecycle(p,v_owner,v_operation_id);
  end if;
  if v_resource is distinct from 'calendar_blocks' then
    raise exception 'Unsupported resource: %', v_resource;
  end if;
  if v_operation not in ('create', 'update') or v_operation is null then
    raise exception 'Unsupported operation: %', v_operation;
  end if;
  v_patch := p -> 'patch';
  if pg_catalog.jsonb_typeof(v_patch) is distinct from 'object' then
    raise exception 'patch must be an object';
  end if;
  select k into v_bad from pg_catalog.jsonb_object_keys(v_patch) as t(k)
    where k <> all(array['kind','title','starts_at','ends_at','time_zone',
                        'status','subject_id','project_id','checkpoint_id','session_id'])
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
      subject_id,project_id,checkpoint_id,session_id
    ) values (
      v_id,v_owner,v_patch ->> 'kind',v_patch ->> 'title',
      (v_patch ->> 'starts_at')::timestamptz,(v_patch ->> 'ends_at')::timestamptz,
      v_patch ->> 'time_zone',coalesce(v_patch ->> 'status','planned'),
      (v_patch ->> 'subject_id')::uuid,(v_patch ->> 'project_id')::uuid,
      (v_patch ->> 'checkpoint_id')::uuid,(v_patch ->> 'session_id')::uuid
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
      -- The existing row supplies omitted keys; explicit null stays null.
      -- The allow-list forbids owner, ID, and version edits.
      select * into v_new from pg_catalog.jsonb_populate_record(v_block, v_patch);
      update public.calendar_blocks set
        kind = v_new.kind, title = v_new.title,
        starts_at = v_new.starts_at, ends_at = v_new.ends_at,
        time_zone = v_new.time_zone, status = v_new.status,
        subject_id = v_new.subject_id, project_id = v_new.project_id,
        checkpoint_id = v_new.checkpoint_id, session_id = v_new.session_id,
        version = version + 1
      where id = v_id and user_id = v_owner
      returning * into v_block;
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
  insert into public.command_receipts(user_id,operation_id,resource,result)
    values(v_owner,v_operation_id,v_resource,v_receipt);
  return v_receipt;
end
$study$;

grant execute on function public.study_command(jsonb) to authenticated;
