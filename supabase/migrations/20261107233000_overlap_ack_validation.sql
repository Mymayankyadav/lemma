-- N47.2: owner-scoped envelope validation and audited overlap lifecycle.
-- Existing N47.1 tables and migrations are unchanged.
create function public.overlap_ack_validate_envelope(p jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $validate$
declare
  v_op text;
  v_op_id uuid;
  v_target jsonb;
  v_patch jsonb;
  v_expected numeric;
  v_fields text[];
  v_bad text;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  if p is null or pg_catalog.jsonb_typeof(p) is distinct from 'object' then
    raise exception 'Command envelope must be an object';
  end if;
  select k into v_bad from pg_catalog.jsonb_object_keys(p) keys(k)
    where k <> all(array['operationId','schemaVersion','resource',
      'operation','target','patch','expectedVersion']) limit 1;
  if v_bad is not null then raise exception 'Unknown command field: %',v_bad; end if;
  if pg_catalog.jsonb_typeof(p->'operationId') is distinct from 'string' then
    raise exception 'operationId must be a UUID';
  end if;
  v_op_id := (p->>'operationId')::uuid;
  if pg_catalog.jsonb_typeof(p->'schemaVersion') is distinct from 'number'
    or p->>'schemaVersion' is distinct from '1' then
    raise exception 'schemaVersion must be 1';
  end if;
  if p->>'resource' is distinct from 'overlap_acknowledgements' then
    raise exception 'Unsupported resource';
  end if;
  v_op:=p->>'operation';
  if v_op is null or v_op not in ('create','update','delete') then
    raise exception 'Unsupported acknowledgement operation';
  end if;
  v_target:=coalesce(p->'target','{}'::jsonb);
  if pg_catalog.jsonb_typeof(v_target) is distinct from 'object' then
    raise exception 'target must be an object';
  end if;
  select k into v_bad from pg_catalog.jsonb_object_keys(v_target) keys(k)
    where k<>'id' limit 1;
  if v_bad is not null then raise exception 'Unknown target field: %',v_bad; end if;
  -- A supplied create target must obey the same UUID shape as update/delete.
  -- Omitting target.id on create remains valid for server-generated IDs.
  if v_target?'id' then
    if pg_catalog.jsonb_typeof(v_target->'id') is distinct from 'string' then
      raise exception 'target.id must be a UUID';
    end if;
    perform (v_target->>'id')::uuid;
  end if;
  if v_op='create' then
    if p?'expectedVersion' and
      (pg_catalog.jsonb_typeof(p->'expectedVersion') is distinct from 'number'
       or p->>'expectedVersion' is distinct from '0') then
      raise exception 'Create expectedVersion must be zero or absent';
    end if;
  else
    if pg_catalog.jsonb_typeof(v_target->'id') is distinct from 'string' then
      raise exception 'target.id must be a UUID';
    end if;
    perform (v_target->>'id')::uuid;
    if pg_catalog.jsonb_typeof(p->'expectedVersion') is distinct from 'number'
      or p->>'expectedVersion' !~ '^[1-9][0-9]*$' then
      raise exception 'expectedVersion must be a positive integer';
    end if;
    v_expected:=(p->>'expectedVersion')::numeric;
    if v_expected>2147483647 then
      raise exception 'expectedVersion exceeds int4';
    end if;
  end if;

  v_patch:=coalesce(p->'patch','{}'::jsonb);
  if pg_catalog.jsonb_typeof(v_patch) is distinct from 'object' then
    raise exception 'patch must be an object';
  end if;
  v_fields:=case when v_op='delete' then array[]::text[]
    else array['participants','starts_at','ends_at','reason',
      'disposition','attributed_to'] end;
  select k into v_bad from pg_catalog.jsonb_object_keys(v_patch) keys(k)
    where k<>all(v_fields) limit 1;
  if v_bad is not null then raise exception 'Unknown patch field: %',v_bad; end if;
  if v_op='create' and
     (not (v_patch?'participants') or not (v_patch?'starts_at')
      or not (v_patch?'ends_at') or not (v_patch?'disposition')) then
    raise exception 'Create requires participants, starts_at, ends_at and disposition';
  end if;
  if v_op='update' and v_patch='{}'::jsonb then
    raise exception 'Update patch must not be empty';
  end if;
  -- Temporal fields must be real instants. A complete window must be
  -- nonempty, even on update; partial update checks use stored context later.
  if v_patch?'starts_at' then
    if pg_catalog.jsonb_typeof(v_patch->'starts_at') is distinct from 'string'
       or (v_patch->>'starts_at') !~ '^[0-9]{4}-(0[1-9]|1[0-2])-([0-2][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]([.][0-9]{1,6})?(Z|[+-](0[0-9]|1[0-3]):[0-5][0-9]|[+-]14:00)$' then
      raise exception 'starts_at must be an instant';
    end if;
    perform (v_patch->>'starts_at')::timestamptz;
  end if;
  if v_patch?'ends_at' then
    if pg_catalog.jsonb_typeof(v_patch->'ends_at') is distinct from 'string'
       or (v_patch->>'ends_at') !~ '^[0-9]{4}-(0[1-9]|1[0-2])-([0-2][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]([.][0-9]{1,6})?(Z|[+-](0[0-9]|1[0-3]):[0-5][0-9]|[+-]14:00)$' then
      raise exception 'ends_at must be an instant';
    end if;
    perform (v_patch->>'ends_at')::timestamptz;
  end if;
  if v_patch?'starts_at' and v_patch?'ends_at' and
    (v_patch->>'starts_at')::timestamptz >= (v_patch->>'ends_at')::timestamptz then
    raise exception 'Acknowledged window must be nonempty';
  end if;
  if v_patch?'participants' and not public.overlap_ack_participants_valid(v_patch->'participants') then
    raise exception 'Participants must be 2-10 unique, versioned block/entry references';
  end if;
  if v_patch?'reason' and v_patch->'reason'<>'null'::jsonb and
    (pg_catalog.jsonb_typeof(v_patch->'reason') is distinct from 'string'
     or pg_catalog.length(v_patch->>'reason')>600) then
    raise exception 'reason exceeds 600 characters or is not a string';
  end if;
  if v_patch?'disposition' and (
    pg_catalog.jsonb_typeof(v_patch->'disposition') is distinct from 'string'
    or v_patch->>'disposition' not in ('keep_both','attribute_to')
  ) then
    raise exception 'Invalid disposition';
  end if;
  -- A partial update cannot yet check participant membership against the
  -- stored row, but every supplied non-null choice must already be well-typed.
  if v_patch?'attributed_to' and v_patch->'attributed_to'<>'null'::jsonb then
    if pg_catalog.jsonb_typeof(v_patch->'attributed_to') is distinct from 'object'
      or pg_catalog.jsonb_typeof(v_patch->'attributed_to'->'kind') is distinct from 'string'
      or v_patch->'attributed_to'->>'kind' not in ('block','entry')
      or pg_catalog.jsonb_typeof(v_patch->'attributed_to'->'id') is distinct from 'string'
      or nullif(v_patch->'attributed_to'->>'id','') is null then
      raise exception 'Invalid attribution choice';
    end if;
    select k into v_bad
      from pg_catalog.jsonb_object_keys(v_patch->'attributed_to') as keys(k)
      where k<>all(array['kind','id']) limit 1;
    if v_bad is not null then raise exception 'Invalid attribution choice'; end if;
    perform (v_patch->'attributed_to'->>'id')::uuid;
  end if;
  -- A complete update patch must be self-consistent, just like create.
  -- Partial updates need the stored row and are checked by N47.2.3.
  -- Treat explicit JSON null as a cleared optional attribution. The N47.1
  -- helper expects SQL NULL for keep_both; attribute_to still needs a participant.
  if (v_op='create' or (v_op='update'
    and v_patch?'participants' and v_patch?'disposition'
    and v_patch?'attributed_to'))
    and not public.overlap_ack_choice_valid(
      v_patch->'participants',v_patch->>'disposition',
      nullif(v_patch->'attributed_to','null'::jsonb)
    ) then
    raise exception 'Attribution must match an acknowledged participant';
  end if;
  -- Current participant ownership/version checks are enforced by the
  -- N47.1 guard trigger in N47.2.3's write transaction, not by this helper.
  return p;
end
$validate$;
revoke all on function public.overlap_ack_validate_envelope(jsonb) from public,anon;
grant execute on function public.overlap_ack_validate_envelope(jsonb) to authenticated,service_role;


-- The N47.1 guard must not rewrite historical versions during generic undo.
-- Outside the verified undo_action path its original participant checks and
-- monotonic version/timestamp semantics are unchanged.
create or replace function public.overlap_ack_guard() returns trigger
language plpgsql security invoker set search_path='' as $overlap_guard$
begin
  if pg_catalog.current_setting('lemma.tool',true)='undo' then
    return new;
  end if;
  if public.overlap_ack_is_stale(new.user_id,new.participants) then
    raise exception 'Overlap participants are missing, not owned or stale';
  end if;
  if tg_op='UPDATE' then
    new.version:=old.version+1;
    new.updated_at:=pg_catalog.clock_timestamp();
  end if;
  return new;
end
$overlap_guard$;

-- N47.1 already installed one AFTER audit trigger named overlap_ack_log.
-- Do not create another log trigger: every row mutation must journal once.
create function public.overlap_ack_write_owned(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $overlap_command$
declare
  v_owner uuid; v_role text; v_source text;
  v_op_id uuid; v_op text; v_target jsonb; v_patch jsonb;
  v_row_id uuid; v_expected integer; v_old public.overlap_acknowledgements%rowtype;
  v_new public.overlap_acknowledgements%rowtype;
  v_stored jsonb; v_receipt jsonb; v_changed jsonb; v_action bigint;
  v_participants jsonb; v_disposition text; v_choice jsonb;
  v_starts timestamptz; v_ends timestamptz; v_reason text;
  v_part jsonb; v_part_id uuid; v_version integer;
begin
  v_owner:=(select auth.uid());
  v_role:=pg_catalog.current_setting('role',true);
  if v_owner is null or v_role not in ('authenticated','service_role') then
    raise exception 'Authentication required';
  end if;
  if p is null or pg_catalog.jsonb_typeof(p) is distinct from 'object'
     or pg_catalog.jsonb_typeof(p->'operationId') is distinct from 'string' then
    raise exception 'Invalid overlap command envelope or operationId';
  end if;
  v_op_id:=(p->>'operationId')::uuid;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_owner::text||':'||v_op_id::text,0));
  select r.result into v_stored from public.command_receipts r
    where r.user_id=v_owner and r.operation_id=v_op_id;
  if found then
    if v_stored->'_request'=p then return v_stored-'_request'; end if;
    return pg_catalog.jsonb_build_object('operationId',v_op_id,
      'status','conflict','changed','[]'::jsonb,'actionNo',null,
      'conflict',pg_catalog.jsonb_build_object(
        'reason','operationId reused with a different payload'));
  end if;
  -- Never trust client owner/source/version keys. The invoker validator
  -- rejects extra envelope fields, malformed target IDs and invalid shapes.
  perform public.overlap_ack_validate_envelope(p);
  v_op:=p->>'operation';
  v_target:=coalesce(p->'target','{}'::jsonb);
  v_patch:=coalesce(p->'patch','{}'::jsonb);
  v_source:=case when v_role='service_role' then 'mcp' else 'app' end;
  if v_role<>'service_role' then
    perform pg_catalog.set_config('lemma.source','app',true);
    perform pg_catalog.set_config('lemma.tool','overlap_acknowledgements_command',true);
  end if;
  perform pg_catalog.set_config('lemma.summary',
    pg_catalog.left('Overlap acknowledgement '||v_op,200),true);

  if v_op='create' then
    v_row_id:=coalesce((v_target->>'id')::uuid,pg_catalog.gen_random_uuid());
    v_participants:=v_patch->'participants';
    v_disposition:=v_patch->>'disposition';
    v_choice:=nullif(v_patch->'attributed_to','null'::jsonb);
    v_starts:=(v_patch->>'starts_at')::timestamptz;
    v_ends:=(v_patch->>'ends_at')::timestamptz;
    v_reason:=v_patch->>'reason';
  else
    v_row_id:=(v_target->>'id')::uuid;
    v_expected:=(p->>'expectedVersion')::integer;
    select * into v_old from public.overlap_acknowledgements a
      where a.id=v_row_id and a.user_id=v_owner for update;
    if not found then raise exception 'Overlap acknowledgement not found for owner'; end if;
    if v_old.version is distinct from v_expected then
      v_receipt:=pg_catalog.jsonb_build_object('operationId',v_op_id,
        'status','conflict','changed','[]'::jsonb,'actionNo',null,
        'conflict',pg_catalog.jsonb_build_object(
          'expectedVersion',v_expected,'currentVersion',v_old.version));
    elsif v_op='update' then
      v_participants:=case when v_patch?'participants'
        then v_patch->'participants' else v_old.participants end;
      v_disposition:=case when v_patch?'disposition'
        then v_patch->>'disposition' else v_old.disposition end;
      v_choice:=case when v_patch?'attributed_to'
        then nullif(v_patch->'attributed_to','null'::jsonb)
        else v_old.attributed_to end;
      v_starts:=case when v_patch?'starts_at'
        then (v_patch->>'starts_at')::timestamptz else v_old.starts_at end;
      v_ends:=case when v_patch?'ends_at'
        then (v_patch->>'ends_at')::timestamptz else v_old.ends_at end;
      v_reason:=case when v_patch?'reason' then v_patch->>'reason'
        else v_old.reason end;
    end if;
  end if;
  if v_receipt is null then
    if v_op<>'delete' then
      if not public.overlap_ack_participants_valid(v_participants)
         or not public.overlap_ack_choice_valid(v_participants,v_disposition,v_choice)
         or v_starts is null or v_ends is null or v_starts>=v_ends then
        raise exception 'Invalid overlap participants, attribution or time window';
      end if;
      -- Hold participant row locks through the DML; a concurrently changed
      -- version cannot validate and then slip into a committed acknowledgement.
      for v_part in select value from pg_catalog.jsonb_array_elements(v_participants)
        as parts(value) order by value->>'kind',value->>'id'
      loop
        v_part_id:=(v_part->>'id')::uuid;
        v_version:=null;
        if v_part->>'kind'='block' then
          select b.version into v_version from public.calendar_blocks b
            where b.user_id=v_owner and b.id=v_part_id for share;
        else
          select e.version into v_version from public.study_entries e
            where e.user_id=v_owner and e.id=v_part_id for share;
        end if;
        if not found or v_version is distinct from (v_part->>'version')::integer then
          raise exception 'Overlap participants are missing, not owned or stale';
        end if;
      end loop;
      if v_op='create' then
        insert into public.overlap_acknowledgements(
          id,user_id,participants,starts_at,ends_at,reason,
          disposition,attributed_to,source
        ) values(v_row_id,v_owner,v_participants,v_starts,v_ends,v_reason,
          v_disposition,v_choice,v_source)
        returning * into v_new;
      else
        update public.overlap_acknowledgements a set
          participants=v_participants,starts_at=v_starts,ends_at=v_ends,
          reason=v_reason,disposition=v_disposition,attributed_to=v_choice,
          source=v_source
        where a.id=v_row_id and a.user_id=v_owner
        returning * into v_new;
      end if;
      v_changed:=pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('id',v_row_id,'version',v_new.version));
    else
      delete from public.overlap_acknowledgements a
        where a.id=v_row_id and a.user_id=v_owner;
      v_changed:=pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('id',v_row_id,'version',v_old.version+1));
    end if;
    select a.no into v_action from public.actions a
      where a.txid=pg_catalog.txid_current() and a.user_id=v_owner;
    if v_action is null then
      raise exception 'Overlap mutation has no reversible action journal';
    end if;
    v_receipt:=pg_catalog.jsonb_build_object('operationId',v_op_id,
      'status','ok','changed',v_changed,'actionNo',v_action);
  end if;
  insert into public.command_receipts(user_id,operation_id,resource,result)
    values(v_owner,v_op_id,'overlap_acknowledgements',
      v_receipt||pg_catalog.jsonb_build_object('_request',p));
  return v_receipt;
end
$overlap_command$;

-- The public browser entrypoint is an invoker RPC, not direct row DML.
create function public.overlap_acknowledgements_command(p jsonb) returns jsonb
language sql volatile security invoker set search_path='' as $call$
  select public.overlap_ack_write_owned(p)
$call$;
revoke all on function public.overlap_ack_write_owned(jsonb) from public,anon;
revoke all on function public.overlap_acknowledgements_command(jsonb) from public,anon;
grant execute on function public.overlap_ack_write_owned(jsonb) to authenticated,service_role;
grant execute on function public.overlap_acknowledgements_command(jsonb) to authenticated,service_role;

-- Existing overlap_ack_log is the single audit trigger; undo_action and
-- mcp_command consume only these registry rows, with no generic replacements.
insert into public.lemma_undo_tables(table_name) values('overlap_acknowledgements');
insert into public.lemma_command_resources(resource,command_fn,mcp_ok,"schema")
  values('overlap_acknowledgements','overlap_acknowledgements_command',true,
    '{"operations":["create","update","delete"],"fields":["participants","starts_at","ends_at","reason","disposition","attributed_to"]}'::jsonb);
