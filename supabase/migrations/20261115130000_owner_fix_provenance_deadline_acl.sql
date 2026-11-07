-- Owner fixes (rules PR): bugs #1051 and #1094.
--
-- #1051 Compatibly replaces presets_command(jsonb) from 20261110020000: same signature, grants,
-- receipt lock and behaviour, except that provenance (presets.source and the action journal's
-- source/tool/summary) is trusted only from a service-role caller. An authenticated client that
-- pre-sets lemma.source can no longer label its own writes as MCP or worker writes. Same
-- pattern as deadlines_command and practice commands.
create or replace function public.presets_command(p jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $presets$
declare
  v_owner uuid; v_op_id uuid; v_op text; v_patch jsonb; v_target jsonb;
  v_id uuid; v_expected integer; v_bad text; v_old public.presets%rowtype;
  v_new public.presets%rowtype; v_result jsonb; v_stored jsonb;
  v_action bigint; v_changed jsonb; v_source text; v_lock jsonb; v_effective text;
begin
  v_owner := (select auth.uid());
  if v_owner is null then raise exception 'Authentication required'; end if;
  if p is null or pg_catalog.jsonb_typeof(p) is distinct from 'object' then
    raise exception 'Command envelope must be an object';
  end if;
  if nullif(p->>'operationId','') is null then
    raise exception 'operationId is required';
  end if;
  v_op_id := (p->>'operationId')::uuid;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_owner::text||':'||v_op_id::text,0)
  );
  select result into v_stored from public.command_receipts
    where user_id=v_owner and operation_id=v_op_id;
  if found then
    if v_stored->'_request'=p then return v_stored-'_request'; end if;
    return pg_catalog.jsonb_build_object(
      'operationId',v_op_id::text,'status','conflict',
      'changed','[]'::jsonb,'actionNo',null,
      'conflict',pg_catalog.jsonb_build_object(
        'reason','operationId reused with a different payload'));
  end if;

  select k into v_bad from pg_catalog.jsonb_object_keys(p) as keys(k)
    where k <> all(array['operationId','schemaVersion','resource','operation',
      'target','expectedVersion','patch']) limit 1;
  if v_bad is not null then raise exception 'Unknown command field: %',v_bad; end if;
  if pg_catalog.jsonb_typeof(p->'schemaVersion') is distinct from 'number'
     or p->>'schemaVersion' is distinct from '1' then
    raise exception 'schemaVersion must be 1';
  end if;
  if p->>'resource' is distinct from 'presets' then
    raise exception 'Unsupported resource';
  end if;
  v_op := p->>'operation';
  if v_op is null or v_op not in ('create','update','reorder','archive','restore','delete') then
    raise exception 'Unsupported preset operation';
  end if;
  -- bug #1051: lemma.source/tool/summary are session settings any caller can pre-set. Only a
  -- service-role caller (the mcp_command dispatcher or a worker, which authenticated users
  -- cannot become) may supply provenance; everyone else is always 'app', in the row and in the
  -- journal (log_change() reads the same settings), whatever they set beforehand.
  if coalesce(pg_catalog.current_setting('role',true),'')='service_role' then
    v_source := case
      when pg_catalog.current_setting('lemma.source',true) in ('worker','system')
        then 'worker'
      when pg_catalog.current_setting('lemma.source',true) in ('mcp','claude','chatgpt','other')
        then 'mcp'
      else 'app'
    end;
  else
    v_source := 'app';
    perform pg_catalog.set_config('lemma.source','app',true);
    perform pg_catalog.set_config('lemma.tool','presets',true);
    perform pg_catalog.set_config('lemma.summary',pg_catalog.left('Preset '||v_op,200),true);
  end if;
  if v_op in ('archive','restore','delete') then
    -- N41.2.2.2.2.1 lock helper: validates the exact lifecycle envelope (empty patch, target.id,
    -- positive int4 expectedVersion), takes the owner row lock FOR UPDATE inside this transaction,
    -- and decides version and study-entry references only after the lock. Never a foreign row.
    v_lock := public.lemma_preset_lifecycle_lock(p);
    v_id := (v_lock->>'id')::uuid;
    if v_lock->>'status'='conflict' then
      select * into v_old from public.presets where id=v_id and user_id=v_owner;
      v_result := pg_catalog.jsonb_build_object(
        'operationId',v_op_id::text,'status','conflict',
        'changed','[]'::jsonb,'actionNo',null,
        'current',pg_catalog.to_jsonb(v_old),
        'conflict',pg_catalog.jsonb_build_object(
          'expectedVersion',(p->>'expectedVersion')::integer,
          'currentVersion',(v_lock->>'currentVersion')::integer));
    else
      v_effective := v_lock->>'effectiveOperation';
      if v_effective='archive' then
        if (v_lock->>'archived')::boolean then
          if v_op='delete' then
            raise exception 'Preset is referenced by study entries and already archived';
          end if;
          raise exception 'Preset is already archived';
        end if;
        update public.presets set archived_at=pg_catalog.now(),
          version=version+1,source=v_source
          where id=v_id and user_id=v_owner returning * into v_new;
        v_changed := pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object('id',v_new.id,'version',v_new.version));
      elsif v_effective='restore' then
        if not (v_lock->>'archived')::boolean then
          raise exception 'Preset is not archived';
        end if;
        update public.presets set archived_at=null,
          version=version+1,source=v_source
          where id=v_id and user_id=v_owner returning * into v_new;
        v_changed := pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object('id',v_new.id,'version',v_new.version));
      else
        -- Unreferenced: physical delete. The journal keeps the old row, so undo restores it.
        delete from public.presets where id=v_id and user_id=v_owner
          returning * into v_old;
        if not found then raise exception 'Preset not found'; end if;
        v_changed := pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object('id',v_old.id,'version',v_old.version,'deleted',true));
      end if;
    end if;
  else
  v_patch := coalesce(p->'patch','{}'::jsonb);
  if pg_catalog.jsonb_typeof(v_patch) is distinct from 'object' then
    raise exception 'patch must be an object';
  end if;
  select k into v_bad from pg_catalog.jsonb_object_keys(v_patch) as keys(k)
    where k <> all(case v_op
      when 'reorder' then array['position']
      when 'create' then array['label','subject_id','project_id',
        'checkpoint_id','mode','focus_minutes','break_minutes',
        'long_break_minutes','cycles','position']
      else array['label','subject_id','project_id','checkpoint_id',
        'mode','focus_minutes','break_minutes','long_break_minutes','cycles']
    end) limit 1;
  if v_bad is not null then raise exception 'Unknown preset patch field: %',v_bad; end if;
  if (v_op='create' and not (v_patch?'label'))
    or (v_op<>'create' and v_patch='{}'::jsonb) then
    raise exception 'Preset patch is empty or missing label';
  end if;
  v_target := coalesce(p->'target','{}'::jsonb);
  if pg_catalog.jsonb_typeof(v_target) is distinct from 'object' then
    raise exception 'target must be an object';
  end if;
  select k into v_bad from pg_catalog.jsonb_object_keys(v_target) as keys(k)
    where k <> 'id' limit 1;
  if v_bad is not null then raise exception 'Unknown target field: %',v_bad; end if;
  if v_op='create' then
    if p?'expectedVersion' and p->>'expectedVersion' is distinct from '0' then
      raise exception 'create expectedVersion must be absent or 0';
    end if;
    v_id := coalesce(nullif(v_target->>'id','')::uuid,pg_catalog.gen_random_uuid());
    insert into public.presets(
      id,user_id,label,subject_id,project_id,checkpoint_id,mode,
      focus_minutes,break_minutes,long_break_minutes,cycles,position,source
    ) values (
      v_id,v_owner,v_patch->>'label',
      (v_patch->>'subject_id')::uuid,(v_patch->>'project_id')::uuid,
      (v_patch->>'checkpoint_id')::uuid,
      coalesce(v_patch->>'mode','pomodoro'),
      coalesce((v_patch->>'focus_minutes')::integer,25),
      coalesce((v_patch->>'break_minutes')::integer,5),
      coalesce((v_patch->>'long_break_minutes')::integer,15),
      coalesce((v_patch->>'cycles')::integer,4),
      coalesce((v_patch->>'position')::integer,0),v_source
    ) returning * into v_new;
    v_changed := pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('id',v_new.id,'version',v_new.version));
  else
    if nullif(v_target->>'id','') is null then
      raise exception 'target.id required';
    end if;
    if pg_catalog.jsonb_typeof(p->'expectedVersion') is distinct from 'number'
      or p->>'expectedVersion' !~ '^[1-9][0-9]*$' then
      raise exception 'expectedVersion must be positive integer';
    end if;
    v_expected := (p->>'expectedVersion')::integer;
    v_id := (v_target->>'id')::uuid;
    select * into v_old from public.presets
      where id=v_id and user_id=v_owner for update;
    if not found then raise exception 'Preset not found'; end if;
    if v_old.version is distinct from v_expected then
      v_result := pg_catalog.jsonb_build_object(
        'operationId',v_op_id::text,'status','conflict',
        'changed','[]'::jsonb,'actionNo',null,
        'current',pg_catalog.to_jsonb(v_old),
        'conflict',pg_catalog.jsonb_build_object(
          'expectedVersion',v_expected,'currentVersion',v_old.version));
    elsif v_op='reorder' then
      update public.presets
        set position=(v_patch->>'position')::integer,
          version=version+1,source=v_source
        where id=v_id and user_id=v_owner returning * into v_new;
    else
      select * into v_new from pg_catalog.jsonb_populate_record(v_old,v_patch);
      update public.presets set
        label=v_new.label,subject_id=v_new.subject_id,
        project_id=v_new.project_id,checkpoint_id=v_new.checkpoint_id,
        mode=v_new.mode,focus_minutes=v_new.focus_minutes,
        break_minutes=v_new.break_minutes,long_break_minutes=v_new.long_break_minutes,
        cycles=v_new.cycles,version=version+1,source=v_source
        where id=v_id and user_id=v_owner returning * into v_new;
    end if;
    if v_result is null then
      v_changed := pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('id',v_new.id,'version',v_new.version));
    end if;
  end if;
  end if;
  if v_result is null then
    select no into v_action from public.actions
      where txid=pg_catalog.txid_current() and user_id=v_owner;
    if v_action is null then raise exception 'Preset write has no journal action'; end if;
    v_result := pg_catalog.jsonb_build_object(
      'operationId',v_op_id::text,'status','ok',
      'changed',v_changed,'actionNo',v_action);
    if v_effective is not null then
      v_result := v_result||pg_catalog.jsonb_build_object('effectiveOperation',v_effective);
    end if;
  end if;
  insert into public.command_receipts(user_id,operation_id,resource,result)
    values(v_owner,v_op_id,'presets',
      v_result||pg_catalog.jsonb_build_object('_request',p));
  return v_result;
end
$presets$;

-- #1094 Defense in depth promised by N42.1: browsers may read their own deadlines (owner RLS) but
-- never write the table directly. Writes go only through the security-definer
-- deadlines_write_owned() via deadlines_command(). Row-level security already blocks direct writes
-- (no write policy exists); this removes the default table privileges too.
revoke insert, update, delete, truncate, references, trigger on public.deadlines from anon, authenticated;
revoke select on public.deadlines from anon;
