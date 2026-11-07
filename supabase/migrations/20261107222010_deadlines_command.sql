-- N42.2.2: fully audited deadline lifecycle and registry-backed undo/MCP.
-- Existing owner-SELECT-only RLS and absence of authenticated table DML grants
-- are retained. Only the owner-checked function can perform writes.
create function public.deadlines_write_owned(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $deadline_write$
declare
 v_owner uuid; v_op_id uuid; v_op text; v_patch jsonb; v_target jsonb;
 v_bad text; v_id uuid; v_expected integer; v_prev public.deadlines%rowtype;
 v_candidate public.deadlines%rowtype; v_new public.deadlines%rowtype;
 v_receipt jsonb; v_stored jsonb; v_changed jsonb; v_action bigint;
 v_kind text; v_due_kind text; v_src text; v_state text;
begin
 -- The public security-invoker wrapper (and any direct call to this helper)
 -- must be bound to a genuine signed-in owner. Never accept user_id in p.
 v_owner := (select auth.uid());
 if v_owner is null then raise exception 'Authentication required'; end if;
 if p is null or pg_catalog.jsonb_typeof(p) is distinct from 'object' then
  raise exception 'Deadline command envelope must be an object'; end if;
 if pg_catalog.jsonb_typeof(p->'operationId') is distinct from 'string'
    or nullif(p->>'operationId','') is null then
  raise exception 'operationId is required UUID'; end if;
 v_op_id:=(p->>'operationId')::uuid;
 perform pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended(v_owner::text||':'||v_op_id::text,0));
 select r.result into v_stored from public.command_receipts r
  where r.user_id=v_owner and r.operation_id=v_op_id;
 if found then
  if v_stored->'_request'=p then return v_stored-'_request'; end if;
  return pg_catalog.jsonb_build_object('operationId',v_op_id,'status','conflict',
    'changed','[]'::jsonb,'actionNo',null,
    'conflict',pg_catalog.jsonb_build_object(
       'reason','operationId reused with a different payload'));
 end if;
 select k into v_bad from pg_catalog.jsonb_object_keys(p) as keys(k)
  where k<>all(array['operationId','schemaVersion','resource',
                    'operation','target','expectedVersion','patch']) limit 1;
 if v_bad is not null then raise exception 'Unknown deadline command field: %',v_bad; end if;
 if pg_catalog.jsonb_typeof(p->'schemaVersion') is distinct from 'number'
    or p->>'schemaVersion' is distinct from '1' then
  raise exception 'schemaVersion must be 1'; end if;
 if p->>'resource' is distinct from 'deadlines' then
  raise exception 'Unsupported deadline resource'; end if;
 v_op:=p->>'operation';
 if v_op is null or v_op not in (
   'create','update','complete','reopen','cancel','restore','delete') then
  raise exception 'Unsupported deadline operation'; end if;
 v_target:=coalesce(p->'target','{}'::jsonb);
 if pg_catalog.jsonb_typeof(v_target) is distinct from 'object' then
  raise exception 'target must be an object'; end if;
 select k into v_bad from pg_catalog.jsonb_object_keys(v_target) as keys(k)
  where k<>'id' limit 1;
 if v_bad is not null then raise exception 'Unknown deadline target field: %',v_bad; end if;
 if v_target?'id' then
  if pg_catalog.jsonb_typeof(v_target->'id') is distinct from 'string'
     or nullif(v_target->>'id','') is null then
   raise exception 'target.id must be a UUID'; end if;
  v_id:=(v_target->>'id')::uuid;
 elsif v_op='create' then
  v_id:=pg_catalog.gen_random_uuid();
 else raise exception 'target.id required'; end if;
 if v_op='create' then
  if p?'expectedVersion' and
     (pg_catalog.jsonb_typeof(p->'expectedVersion') is distinct from 'number'
      or p->>'expectedVersion' is distinct from '0') then
   raise exception 'Create expectedVersion must be absent or zero'; end if;
 else
  if pg_catalog.jsonb_typeof(p->'expectedVersion') is distinct from 'number'
     or p->>'expectedVersion' !~ '^[1-9][0-9]*$' then
   raise exception 'expectedVersion must be a positive whole number'; end if;
  if (p->>'expectedVersion')::numeric>2147483647 then
   raise exception 'expectedVersion exceeds int4'; end if;
  v_expected:=(p->>'expectedVersion')::integer;
 end if;
 v_patch:=coalesce(p->'patch','{}'::jsonb);
 if pg_catalog.jsonb_typeof(v_patch) is distinct from 'object' then
  raise exception 'patch must be an object'; end if;
 select k into v_bad from pg_catalog.jsonb_object_keys(v_patch) as keys(k)
  where k<>all(case when v_op in ('create','update') then
    array['title','kind','due_kind','due_date','due_at','subject_id',
      'project_id','checkpoint_id','remaining_minutes','estimate_source']
    else array[]::text[] end) limit 1;
 if v_bad is not null then raise exception 'Unknown deadline patch field: %',v_bad; end if;
 if v_op='create' and
    (not(v_patch?'title') or not(v_patch?'kind')
     or not(v_patch?'due_kind')) then
  raise exception 'Create requires title, kind and due_kind'; end if;
 if v_op='update' and v_patch='{}'::jsonb then
  raise exception 'Update patch must not be empty'; end if;
 if v_patch?'title' and
    (pg_catalog.jsonb_typeof(v_patch->'title') is distinct from 'string'
     or pg_catalog.length(pg_catalog.btrim(v_patch->>'title')) not between 1 and 160) then
  raise exception 'Invalid deadline title'; end if;
 if v_patch?'kind' and
    (pg_catalog.jsonb_typeof(v_patch->'kind') is distinct from 'string'
     or v_patch->>'kind' not in ('exam','seminar','assignment','milestone','other')) then
  raise exception 'Invalid deadline kind'; end if;
 if v_patch?'due_kind' and
    (pg_catalog.jsonb_typeof(v_patch->'due_kind') is distinct from 'string'
     or v_patch->>'due_kind' not in ('date','instant')) then
  raise exception 'Invalid deadline due_kind'; end if;
 if v_patch?'due_date' and v_patch->'due_date'<>'null'::jsonb then
  if pg_catalog.jsonb_typeof(v_patch->'due_date') is distinct from 'string'
     or v_patch->>'due_date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
   raise exception 'Invalid civil deadline date'; end if;
  begin
   perform (v_patch->>'due_date')::date;
  exception when datetime_field_overflow or invalid_datetime_format then
   raise exception 'Invalid civil deadline date';
  end;
 end if;
 if v_patch?'due_at' and v_patch->'due_at'<>'null'::jsonb then
  if pg_catalog.jsonb_typeof(v_patch->'due_at') is distinct from 'string'
     or v_patch->>'due_at' !~
      '^[0-9]{4}-(0[1-9]|1[0-2])-([0-2][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]([.][0-9]{1,6})?(Z|[+-](0[0-9]|1[0-3]):[0-5][0-9]|[+-]14:00)$' then
   raise exception 'Invalid deadline instant: finite ISO timezone required'; end if;
  perform (v_patch->>'due_at')::timestamptz;
 end if;
 for v_bad in select value from pg_catalog.unnest(
   array['subject_id','project_id','checkpoint_id']) as attrs(value)
 loop
  if v_patch?v_bad and v_patch->v_bad<>'null'::jsonb then
   if pg_catalog.jsonb_typeof(v_patch->v_bad) is distinct from 'string'
      or nullif(v_patch->>v_bad,'') is null then
    raise exception 'Invalid link UUID: %',v_bad; end if;
   perform (v_patch->>v_bad)::uuid;
  end if;
 end loop;
 if v_patch?'remaining_minutes' and v_patch->'remaining_minutes'<>'null'::jsonb then
  if pg_catalog.jsonb_typeof(v_patch->'remaining_minutes') is distinct from 'number'
     or v_patch->>'remaining_minutes' !~ '^(0|[1-9][0-9]*)$' then
   raise exception 'Invalid estimate minutes'; end if;
  if (v_patch->>'remaining_minutes')::numeric>100000 then
   raise exception 'Estimate minutes out of range'; end if;
 end if;
 if v_patch?'estimate_source' and v_patch->'estimate_source'<>'null'::jsonb
    and (pg_catalog.jsonb_typeof(v_patch->'estimate_source') is distinct from 'string'
         or v_patch->>'estimate_source' not in ('owner','derived')) then
  raise exception 'Invalid estimate source'; end if;
 -- MCP dispatcher provides trusted owner/provider context, ordinary callers
 -- always get app provenance even if they pre-set arbitrary session GUCs.
 if coalesce(current_setting('role',true),'')='service_role' then
  v_src:='mcp';
 else
  v_src:='app';
  perform pg_catalog.set_config('lemma.source','app',true);
  perform pg_catalog.set_config('lemma.tool','deadlines',true);
 end if;
 perform pg_catalog.set_config('lemma.summary',
   pg_catalog.left('Deadline '||v_op,200),true);
 if v_op='create' then
  insert into public.deadlines(
    id,user_id,title,kind,due_kind,due_date,due_at,subject_id,project_id,
    checkpoint_id,remaining_minutes,estimate_source,status,source
  ) values(
    v_id,v_owner,v_patch->>'title',v_patch->>'kind',
    v_patch->>'due_kind',(v_patch->>'due_date')::date,
    (v_patch->>'due_at')::timestamptz,
    (v_patch->>'subject_id')::uuid,(v_patch->>'project_id')::uuid,
    (v_patch->>'checkpoint_id')::uuid,
    (v_patch->>'remaining_minutes')::integer,v_patch->>'estimate_source',
    'open',v_src
  ) returning * into v_new;
  v_changed:=pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object('id',v_new.id,'version',v_new.version));
 else
  select * into v_prev from public.deadlines d
   where d.id=v_id and d.user_id=v_owner for update;
  if not found then raise exception 'Deadline not found for owner'; end if;
  if v_prev.version is distinct from v_expected then
   v_receipt:=pg_catalog.jsonb_build_object('operationId',v_op_id,
      'status','conflict','changed','[]'::jsonb,'actionNo',null,
      'current',pg_catalog.to_jsonb(v_prev),
      'conflict',pg_catalog.jsonb_build_object(
        'expectedVersion',v_expected,'currentVersion',v_prev.version));
  else
   if v_op='update' and v_prev.status<>'open' then
    raise exception 'Only open deadlines can be edited'; end if;
   if v_op='complete' and v_prev.status<>'open' then
    raise exception 'Only open deadlines can be completed'; end if;
   if v_op='reopen' and v_prev.status<>'done' then
    raise exception 'Only completed deadlines can be reopened'; end if;
   if v_op='cancel' and v_prev.status not in ('open','done') then
    raise exception 'Only active deadlines can be cancelled'; end if;
   if v_op='restore' and v_prev.status<>'cancelled' then
    raise exception 'Only cancelled deadlines can be restored'; end if;
   if v_op='delete' then
    delete from public.deadlines d
     where d.id=v_id and d.user_id=v_owner;
    v_changed:=pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('id',v_id,'version',v_prev.version+1));
   else
    if v_op='update' then
     select * into v_candidate from pg_catalog.jsonb_populate_record(v_prev,v_patch);
     v_state:=v_prev.status;
    else
     v_candidate:=v_prev;
     v_state:=case when v_op='complete' then 'done'
         when v_op='cancel' then 'cancelled' else 'open' end;
    end if;
    update public.deadlines d set
      title=v_candidate.title,kind=v_candidate.kind,
      due_kind=v_candidate.due_kind,due_date=v_candidate.due_date,
      due_at=v_candidate.due_at,subject_id=v_candidate.subject_id,
      project_id=v_candidate.project_id,checkpoint_id=v_candidate.checkpoint_id,
      remaining_minutes=v_candidate.remaining_minutes,
      estimate_source=v_candidate.estimate_source,
      status=v_state,source=v_src,version=d.version+1
    where d.id=v_id and d.user_id=v_owner returning * into v_new;
    v_changed:=pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('id',v_new.id,'version',v_new.version));
   end if;
  end if;
 end if;
 if v_receipt is null then
  select a.no into v_action from public.actions a
   where a.txid=pg_catalog.txid_current() and a.user_id=v_owner;
  if v_action is null then
   raise exception 'Deadline mutation lacks a reversible journal action'; end if;
  v_receipt:=pg_catalog.jsonb_build_object('operationId',v_op_id,
    'status','ok','changed',v_changed,'actionNo',v_action);
 end if;
 insert into public.command_receipts(user_id,operation_id,resource,result)
 values (v_owner,v_op_id,'deadlines',
  v_receipt||pg_catalog.jsonb_build_object('_request',p));
 return v_receipt;
end
$deadline_write$;

-- A public RPC whose security context stays with the caller. The private
-- write helper checks the same auth.uid and all links; no direct owner DML.
create function public.deadlines_command(p jsonb) returns jsonb
language sql volatile security invoker set search_path='' as $command$
 select public.deadlines_write_owned(p)
$command$;
revoke all on function public.deadlines_write_owned(jsonb) from public,anon;
revoke all on function public.deadlines_command(jsonb) from public,anon;
grant execute on function public.deadlines_write_owned(jsonb) to authenticated,service_role;
grant execute on function public.deadlines_command(jsonb) to authenticated,service_role;

-- The existing definer dispatcher and registry-driven undo need only this
-- reviewed metadata; no changes to mcp_command or undo_action are necessary.
insert into public.lemma_undo_tables(table_name) values('deadlines');
insert into public.lemma_command_resources(resource,command_fn,mcp_ok,"schema")
 values ('deadlines','deadlines_command',true,
 '{"operations":["create","update","complete","reopen","cancel","restore","delete"],
 "fields":["title","kind","due_kind","due_date","due_at","subject_id",
 "project_id","checkpoint_id","remaining_minutes","estimate_source"]}'::jsonb);

-- The pre-existing deadlines_log_change trigger already records each row
-- exactly once. This AFTER guard runs later by trigger-name order and verifies
-- the registry's canonical lemma_log_change trigger contract, without logging
-- a second change or manufacturing a duplicate action.
create function public.deadlines_require_journal() returns trigger
language plpgsql security definer set search_path='' as $check_journal$
declare
 v_id uuid;
 v_owner uuid;
begin
 if tg_op='DELETE' then
  v_id:=old.id; v_owner:=old.user_id;
 else
  v_id:=new.id; v_owner:=new.user_id;
 end if;
 if not exists (
  select 1 from public.actions a
    join public.action_changes c on c.action_no=a.no
    where a.txid=pg_catalog.txid_current() and a.user_id=v_owner
      and c.table_name='deadlines'
      and c.row_pk->>'id'=v_id::text
 ) then
  raise exception 'Deadline change missing its journal record';
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end
$check_journal$;
revoke all on function public.deadlines_require_journal()
 from public,anon,authenticated,service_role;
create trigger lemma_log_change
 after insert or update or delete on public.deadlines
 for each row execute function public.deadlines_require_journal();
