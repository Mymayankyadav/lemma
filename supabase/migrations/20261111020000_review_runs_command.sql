-- N48.2: owner-bound durable review-run lifecycle. N48.1 tables remain intact.
-- Clients may SELECT the two tables, but may mutate them only via this
-- SECURITY DEFINER command (no authenticated DML grants or DML policies).
-- Review grades themselves always use the existing review path.
create trigger lemma_log_change after insert or update or delete on public.review_runs
  for each row execute function public.log_change();
create trigger lemma_log_change after insert or update or delete on public.review_run_items
  for each row execute function public.log_change();

-- A committed grade receipt may be consumed by at most one queued item.
create unique index review_run_items_one_review on public.review_run_items(review_id)
  where review_id is not null;

create function public.review_runs_command(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $review_runs_command$
declare
  v_owner uuid; v_role text; v_source text; v_operation_id uuid; v_op text;
  v_target jsonb; v_patch jsonb; v_bad text; v_id uuid; v_expected integer;
  v_run public.review_runs%rowtype; v_item public.review_run_items%rowtype;
  v_receipt jsonb; v_stored jsonb; v_action bigint; v_changed jsonb := '[]'::jsonb;
  v_settings_version integer; v_scheduler text; v_filters jsonb;
  v_decks text[]; v_card_budget integer; v_minute_budget integer;
  v_session uuid; v_concept text; v_include_new boolean; v_new_only boolean;
  v_candidate record; v_items integer := 0; v_total integer; v_card_version integer;
  v_review_id bigint; v_advance_kind text; v_reason text;
begin
  v_owner := (select auth.uid());
  v_role := pg_catalog.current_setting('role',true);
  if v_owner is null or v_role not in ('authenticated','service_role') then
    raise exception 'Authentication required';
  end if;
  if p is null or pg_catalog.jsonb_typeof(p) is distinct from 'object' then
    raise exception 'Command envelope must be an object';
  end if;
  if nullif(p->>'operationId','') is null then raise exception 'operationId required'; end if;
  v_operation_id := (p->>'operationId')::uuid;
  -- Every retry for this authenticated owner serializes before receipt lookup.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_owner::text||':'||v_operation_id::text,0));
  select result into v_stored from public.command_receipts
    where user_id=v_owner and operation_id=v_operation_id;
  if found then
    if v_stored->'_request'=p then return v_stored-'_request'; end if;
    return pg_catalog.jsonb_build_object('operationId',v_operation_id,'status','conflict',
      'changed','[]'::jsonb,'actionNo',null,
      'conflict',pg_catalog.jsonb_build_object('reason','operationId reused with a different payload'));
  end if;

  select key into v_bad from pg_catalog.jsonb_object_keys(p) as t(key)
    where key <> all(array['operationId','schemaVersion','resource','operation',
      'target','expectedVersion','patch']) limit 1;
  if v_bad is not null then raise exception 'Unknown command field: %',v_bad; end if;
  if pg_catalog.jsonb_typeof(p->'schemaVersion') is distinct from 'number'
      or p->>'schemaVersion' is distinct from '1' then
    raise exception 'schemaVersion must be 1';
  end if;
  if p->>'resource' is distinct from 'review_runs' then raise exception 'Invalid resource'; end if;
  v_op := p->>'operation';
  if v_op is null or v_op not in ('start','pause','resume','advance','abandon','complete') then
    raise exception 'Unsupported review-run operation';
  end if;
  v_target := coalesce(p->'target','{}'::jsonb);
  v_patch := coalesce(p->'patch','{}'::jsonb);
  if pg_catalog.jsonb_typeof(v_target) is distinct from 'object'
      or pg_catalog.jsonb_typeof(v_patch) is distinct from 'object' then
    raise exception 'target and patch must be objects';
  end if;
  select key into v_bad from pg_catalog.jsonb_object_keys(v_target) as t(key)
    where key <> 'id' limit 1;
  if v_bad is not null then raise exception 'Unknown target field: %',v_bad; end if;
  select key into v_bad from pg_catalog.jsonb_object_keys(v_patch) as t(key)
    where key <> all(case v_op
      when 'start' then array['filters','selected_deck_ids','card_budget','minute_budget',
        'scheduler_version','settings_version']
      when 'advance' then array['kind','item_id','review_id','reason']
      else array[]::text[] end) limit 1;
  if v_bad is not null then raise exception 'Unknown patch field: %',v_bad; end if;

  -- The RPC itself is the exclusive audited writer. An authenticated client
  -- must not be able to forge MCP provenance by setting lemma.source.
  v_source := case when v_role='service_role' then 'mcp' else 'app' end;
  perform pg_catalog.set_config('lemma.source',
    case when v_role='service_role' and
      pg_catalog.current_setting('lemma.source',true) in ('claude','chatgpt','other','system')
      then pg_catalog.current_setting('lemma.source',true)
      when v_role='service_role' then 'other' else 'app' end,true);
  perform pg_catalog.set_config('lemma.tool','review_runs_command',true);
  perform pg_catalog.set_config('lemma.summary',
    pg_catalog.left('Review run '||v_op,200),true);

  if v_op='start' then
    if v_target <> '{}'::jsonb then raise exception 'start target must be empty'; end if;
    if p ? 'expectedVersion' and p->>'expectedVersion' is distinct from '0' then
      raise exception 'start expectedVersion must be absent or zero';
    end if;
    if pg_catalog.jsonb_typeof(v_patch->'scheduler_version') is distinct from 'string'
        or pg_catalog.length(pg_catalog.btrim(v_patch->>'scheduler_version')) not between 1 and 80
        or pg_catalog.jsonb_typeof(v_patch->'settings_version') is distinct from 'number'
        or (v_patch->>'settings_version') !~ '^[1-9][0-9]*$' then
      raise exception 'Scheduler and positive settings versions required';
    end if;
    v_scheduler := v_patch->>'scheduler_version';
    v_settings_version := (v_patch->>'settings_version')::integer;
    if not exists (select 1 from public.settings s
      where s.user_id=v_owner and s.version=v_settings_version for share) then
      raise exception 'Settings version changed';
    end if;
    v_filters := coalesce(v_patch->'filters','{}'::jsonb);
    if pg_catalog.jsonb_typeof(v_filters) is distinct from 'object'
        or pg_catalog.octet_length(v_filters::text)>8192
        or not public.lemma_review_filters_safe_json(v_filters) then
      raise exception 'Invalid review filters';
    end if;
    select key into v_bad from pg_catalog.jsonb_object_keys(v_filters) as t(key)
      where key <> all(array['sessionId','conceptSlug','includeNew','newOnly']) limit 1;
    if v_bad is not null then raise exception 'Unsupported filter: %',v_bad; end if;
    if v_filters ? 'sessionId' and pg_catalog.jsonb_typeof(v_filters->'sessionId')
        not in ('string','null') then raise exception 'Invalid session filter'; end if;
    if v_filters ? 'conceptSlug' and pg_catalog.jsonb_typeof(v_filters->'conceptSlug')
        not in ('string','null') then raise exception 'Invalid concept filter'; end if;
    if v_filters ? 'includeNew' and pg_catalog.jsonb_typeof(v_filters->'includeNew')
        is distinct from 'boolean' then raise exception 'Invalid includeNew filter'; end if;
    if v_filters ? 'newOnly' and pg_catalog.jsonb_typeof(v_filters->'newOnly')
        is distinct from 'boolean' then raise exception 'Invalid newOnly filter'; end if;
    v_session := nullif(v_filters->>'sessionId','')::uuid;
    v_concept := nullif(v_filters->>'conceptSlug','');
    v_include_new := coalesce((v_filters->>'includeNew')::boolean,true);
    v_new_only := coalesce((v_filters->>'newOnly')::boolean,false);
    if v_new_only and not v_include_new then raise exception 'Contradictory review filters'; end if;
    if pg_catalog.jsonb_typeof(coalesce(v_patch->'selected_deck_ids','[]'::jsonb))
        is distinct from 'array' or
       exists (select 1 from pg_catalog.jsonb_array_elements(
         coalesce(v_patch->'selected_deck_ids','[]'::jsonb)) as x(value)
         where pg_catalog.jsonb_typeof(x.value) is distinct from 'string') then
      raise exception 'Deck IDs must be strings';
    end if;
    select coalesce(pg_catalog.array_agg(x.deck order by x.ord),'{}'::text[])
      into v_decks from pg_catalog.jsonb_array_elements_text(
        coalesce(v_patch->'selected_deck_ids','[]'::jsonb))
        with ordinality as x(deck,ord);
    if not public.lemma_review_deck_keys_valid(v_decks) then
      raise exception 'Invalid or duplicated deck IDs';
    end if;
    if v_patch ? 'card_budget' and (pg_catalog.jsonb_typeof(v_patch->'card_budget')
      is distinct from 'number' or (v_patch->>'card_budget') !~ '^(0|[1-9][0-9]*)$') then
      raise exception 'Invalid card budget';
    end if;
    if v_patch ? 'minute_budget' and (pg_catalog.jsonb_typeof(v_patch->'minute_budget')
      is distinct from 'number' or (v_patch->>'minute_budget') !~ '^(0|[1-9][0-9]*)$') then
      raise exception 'Invalid minute budget';
    end if;
    v_card_budget := coalesce((v_patch->>'card_budget')::integer,20);
    v_minute_budget := coalesce((v_patch->>'minute_budget')::integer,20);
    if v_card_budget not between 0 and 2000 or v_minute_budget not between 0 and 1440 then
      raise exception 'Review budgets out of bounds';
    end if;
    insert into public.review_runs(user_id,filters,selected_deck_ids,card_budget,
      minute_budget,scheduler_version,settings_version,source)
    values(v_owner,v_filters,v_decks,v_card_budget,v_minute_budget,
      v_scheduler,v_settings_version,v_source) returning * into v_run;

    -- Preserve review_items owner/quota order. The selector has no per-card
    -- duration estimate, so use a deterministic planning reservation of ONE
    -- minute per card; this limits queue slots, not actual time spent.
    -- Card and minute budgets are independent caps; zero means empty queue.
    if v_minute_budget>0 and v_card_budget>0 then
      for v_candidate in
        select c.id,c.version from public.review_items(
          v_decks,v_session,v_concept,v_include_new,v_new_only)
          with ordinality as chosen(value,rank)
        join public.cards c on c.id=(chosen.value->>'cardId')::uuid
          and c.user_id=v_owner
        order by chosen.rank limit least(v_card_budget,v_minute_budget)
      loop
        insert into public.review_run_items(user_id,run_id,position,card_id,
          expected_card_version,source)
        values(v_owner,v_run.id,v_items,v_candidate.id,v_candidate.version,v_source);
        v_items := v_items+1;
      end loop;
    end if;
    if v_items=0 then
      update public.review_runs set status='exhausted',ended_at=pg_catalog.now(),
        version=version+1,updated_at=pg_catalog.now()
      where user_id=v_owner and id=v_run.id returning * into v_run;
    end if;
  else
    if pg_catalog.jsonb_typeof(v_target->'id') is distinct from 'string'
        or nullif(v_target->>'id','') is null then raise exception 'target.id required'; end if;
    if pg_catalog.jsonb_typeof(p->'expectedVersion') is distinct from 'number'
        or (p->>'expectedVersion') !~ '^[1-9][0-9]*$' then
      raise exception 'expectedVersion must be positive integer';
    end if;
    v_id := (v_target->>'id')::uuid;
    v_expected := (p->>'expectedVersion')::integer;
    select * into v_run from public.review_runs
      where user_id=v_owner and id=v_id for update;
    if not found then raise exception 'Review run not found'; end if;
    if v_run.version is distinct from v_expected then
      v_receipt := pg_catalog.jsonb_build_object(
        'operationId',v_operation_id,'status','conflict',
        'changed','[]'::jsonb,'actionNo',null,'current',pg_catalog.to_jsonb(v_run),
        'conflict',pg_catalog.jsonb_build_object('expectedVersion',v_expected,
          'currentVersion',v_run.version));
    elsif v_op='advance' then
      if v_run.status<>'running' then raise exception 'Run must be running'; end if;
      if pg_catalog.jsonb_typeof(v_patch->'item_id') is distinct from 'string'
          or pg_catalog.jsonb_typeof(v_patch->'kind') is distinct from 'string' then
        raise exception 'advance requires kind and item_id';
      end if;
      v_advance_kind := v_patch->>'kind';
      if v_advance_kind not in ('graded','stale') then
        raise exception 'Invalid advance kind';
      end if;
      select * into v_item from public.review_run_items
        where user_id=v_owner and run_id=v_run.id
          and id=(v_patch->>'item_id')::uuid for update;
      if not found or v_item.position<>v_run.position or v_item.state<>'pending' then
        raise exception 'Only the pending current item may advance';
      end if;
      select c.version into v_card_version from public.cards c
        where c.user_id=v_owner and c.id=v_item.card_id for share;
      if v_advance_kind='graded' then
        if v_patch ? 'reason' or
          pg_catalog.jsonb_typeof(v_patch->'review_id') not in ('string','number')
          or (v_patch->>'review_id') !~ '^[1-9][0-9]*$' then
          raise exception 'Grade requires a positive review receipt';
        end if;
        v_review_id := (v_patch->>'review_id')::bigint;
        if not exists(select 1 from public.reviews r where
            r.id=v_review_id and r.user_id=v_owner and r.card_id=v_item.card_id
            and r.undone_at is null and r.reviewed_at>=v_run.started_at)
            or v_card_version is null
            or v_card_version<=v_item.expected_card_version then
          raise exception 'Grade must be a new, committed owner review for this card';
        end if;
        update public.review_run_items set state='graded',review_id=v_review_id,
          version=version+1,updated_at=pg_catalog.now(),source=v_source
        where user_id=v_owner and id=v_item.id returning * into v_item;
      else
        if v_patch ? 'review_id' or
          pg_catalog.jsonb_typeof(v_patch->'reason') is distinct from 'string' or
          pg_catalog.length(pg_catalog.btrim(v_patch->>'reason')) not between 1 and 200
          then raise exception 'Stale item requires a short reason'; end if;
        if v_card_version is not null and v_card_version=v_item.expected_card_version then
          raise exception 'Card is still at its snapshotted version'; end if;
        v_reason := pg_catalog.btrim(v_patch->>'reason');
        update public.review_run_items set state='stale',stale_reason=v_reason,
          version=version+1,updated_at=pg_catalog.now(),source=v_source
        where user_id=v_owner and id=v_item.id returning * into v_item;
      end if;
      select pg_catalog.count(*)::integer into v_total from public.review_run_items
        where user_id=v_owner and run_id=v_run.id;
      update public.review_runs set position=position+1,revealed=false,
        status=case when position+1>=v_total then 'exhausted' else 'running' end,
        ended_at=case when position+1>=v_total then pg_catalog.now() else null end,
        version=version+1,updated_at=pg_catalog.now(),source=v_source
        where id=v_run.id and user_id=v_owner returning * into v_run;
    else
      if v_patch<>'{}'::jsonb then raise exception 'Unexpected patch for transition'; end if;
      if (v_op='pause' and v_run.status<>'running') or
         (v_op='resume' and v_run.status<>'paused') or
         (v_op='complete' and v_run.status<>'running') or
         (v_op='abandon' and v_run.status not in ('running','paused')) then
        raise exception 'Invalid review-run transition';
      end if;
      update public.review_runs set
        status=case v_op
          when 'pause' then 'paused' when 'resume' then 'running'
          when 'complete' then 'completed' else 'abandoned' end,
        paused_at=case when v_op='pause' then pg_catalog.now() else null end,
        ended_at=case when v_op in ('complete','abandon') then pg_catalog.now() else null end,
        version=version+1,updated_at=pg_catalog.now(),source=v_source
      where id=v_run.id and user_id=v_owner returning * into v_run;
    end if;
  end if;
  if v_receipt is null then
    select a.no into v_action from public.actions a
      where a.txid=pg_catalog.txid_current() and a.user_id=v_owner;
    if v_action is null then raise exception 'Review-run write has no action journal'; end if;
    v_changed := pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('resource','review_runs','id',v_run.id,
        'version',v_run.version));
    if v_op='advance' then
      v_changed := v_changed||pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('resource','review_run_items','id',v_item.id,
          'version',v_item.version));
    end if;
    v_receipt := pg_catalog.jsonb_build_object('operationId',v_operation_id,
      'status','ok','changed',v_changed,'actionNo',v_action,
      'run',pg_catalog.to_jsonb(v_run),'itemCount',case when v_op='start' then v_items else null end);
    if v_op='advance' then
      v_receipt := v_receipt||pg_catalog.jsonb_build_object('item',pg_catalog.to_jsonb(v_item));
    end if;
  end if;
  insert into public.command_receipts(user_id,operation_id,resource,result)
    values(v_owner,v_operation_id,'review_runs',
      v_receipt||pg_catalog.jsonb_build_object('_request',p));
  return v_receipt;
end
$review_runs_command$;

revoke all on function public.review_runs_command(jsonb) from public,anon,service_role;
grant execute on function public.review_runs_command(jsonb) to authenticated,service_role;
insert into public.lemma_undo_tables(table_name)
  values('review_runs'),('review_run_items');
insert into public.lemma_command_resources(resource,command_fn,mcp_ok,"schema")
  values('review_runs','review_runs_command',true,
    '{"operations":["start","pause","resume","advance","abandon","complete"],"fields":["filters","selected_deck_ids","card_budget","minute_budget","scheduler_version","settings_version","kind","item_id","review_id","reason"]}'::jsonb);
