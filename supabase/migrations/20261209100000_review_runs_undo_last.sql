-- bug #1299 (N119): undo the last graded answer of a durable v6 review run.
-- One atomic command: the card's scheduling is restored through the existing
-- public.undo_review(p_review) (only the newest answer of that card can be undone),
-- and the run steps back to that item so it can be graded again.
-- Additive: a new function with the review_runs envelope and the command_receipts
-- retry rules of public.review_runs_command; no existing object is changed.
create function public.review_runs_undo_last(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $review_runs_undo_last$
declare
  v_owner uuid; v_role text; v_source text; v_operation_id uuid;
  v_target jsonb; v_patch jsonb; v_bad text; v_id uuid; v_expected integer;
  v_run public.review_runs%rowtype; v_item public.review_run_items%rowtype;
  v_receipt jsonb; v_stored jsonb; v_action bigint;
begin
  v_owner := (select auth.uid());
  v_role := pg_catalog.current_setting('role',true);
  if v_owner is null or v_role <> 'authenticated' then
    raise exception 'Authentication required';
  end if;
  if p is null or pg_catalog.jsonb_typeof(p) is distinct from 'object' then
    raise exception 'Command envelope must be an object';
  end if;
  if nullif(p->>'operationId','') is null then raise exception 'operationId required'; end if;
  v_operation_id := (p->>'operationId')::uuid;
  -- Every retry for this owner serializes before the receipt lookup.
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
  if p->>'operation' is distinct from 'undo_last' then
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
    where key <> 'item_id' limit 1;
  if v_bad is not null then raise exception 'Unknown patch field: %',v_bad; end if;
  if pg_catalog.jsonb_typeof(v_target->'id') is distinct from 'string'
      or nullif(v_target->>'id','') is null then raise exception 'target.id required'; end if;
  if pg_catalog.jsonb_typeof(v_patch->'item_id') is distinct from 'string'
      or nullif(v_patch->>'item_id','') is null then raise exception 'patch.item_id required'; end if;
  if pg_catalog.jsonb_typeof(p->'expectedVersion') is distinct from 'number'
      or (p->>'expectedVersion') !~ '^[1-9][0-9]*$' then
    raise exception 'expectedVersion must be positive integer';
  end if;

  -- Only the app undoes answers; provenance is never taken from the caller (bug #1051).
  v_source := 'app';
  perform pg_catalog.set_config('lemma.source','app',true);
  perform pg_catalog.set_config('lemma.tool','review_runs_undo_last',true);
  perform pg_catalog.set_config('lemma.summary','Review run undo last answer',true);

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
  else
    if v_run.status not in ('running','exhausted') or v_run.position<1 then
      raise exception 'No answer to undo in this run';
    end if;
    select * into v_item from public.review_run_items
      where user_id=v_owner and run_id=v_run.id
        and id=(v_patch->>'item_id')::uuid for update;
    if not found or v_item.position<>v_run.position-1 or v_item.state<>'graded'
        or v_item.review_id is null then
      raise exception 'Only the last graded item can be undone';
    end if;
    if not exists(select 1 from public.reviews r where r.id=v_item.review_id
        and r.user_id=v_owner and r.card_id=v_item.card_id and r.undone_at is null) then
      raise exception 'The answer was already undone or is not this owner''s';
    end if;
    -- Ownership is proven above; undo_review restores the card's previous schedule
    -- and refuses when a newer answer for the card exists.
    perform public.undo_review(v_item.review_id);
    update public.review_run_items set state='pending',review_id=null,
      version=version+1,updated_at=pg_catalog.now(),source=v_source
    where user_id=v_owner and id=v_item.id returning * into v_item;
    update public.review_runs set position=position-1,revealed=false,status='running',
      ended_at=null,version=version+1,updated_at=pg_catalog.now(),source=v_source
    where id=v_run.id and user_id=v_owner returning * into v_run;
  end if;
  if v_receipt is null then
    select a.no into v_action from public.actions a
      where a.txid=pg_catalog.txid_current() and a.user_id=v_owner;
    if v_action is null then raise exception 'Review-run write has no action journal'; end if;
    v_receipt := pg_catalog.jsonb_build_object('operationId',v_operation_id,
      'status','ok','actionNo',v_action,
      'changed',pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('resource','review_runs','id',v_run.id,'version',v_run.version),
        pg_catalog.jsonb_build_object('resource','review_run_items','id',v_item.id,'version',v_item.version)),
      'run',pg_catalog.to_jsonb(v_run),'item',pg_catalog.to_jsonb(v_item));
  end if;
  insert into public.command_receipts(user_id,operation_id,resource,result)
    values(v_owner,v_operation_id,'review_runs',
      v_receipt||pg_catalog.jsonb_build_object('_request',p));
  return v_receipt;
end
$review_runs_undo_last$;

revoke all on function public.review_runs_undo_last(jsonb) from public,anon,service_role;
grant execute on function public.review_runs_undo_last(jsonb) to authenticated;
