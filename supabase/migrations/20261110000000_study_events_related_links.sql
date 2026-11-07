-- N50.2.2: optional owner-checked related links and receipt-backed lifecycle.
-- No unaudited authenticated table writes are enabled; commands use the journal.
-- A related reference is a historical association: a later deletion can
-- leave a dangling ID, which consumers must treat as unavailable.
alter table public.study_events
  add column related_kind text,
  add column related_id uuid,
  add constraint study_events_related_pair_check check(
    (related_kind is null and related_id is null)
    or (related_kind in ('task','calendar_block','study_entry')
      and related_id is not null)
  );
create index study_events_owner_related on public.study_events
  (user_id,related_kind,related_id) where related_id is not null;

create function public.study_events_related_owner_check() returns trigger
language plpgsql security invoker set search_path='' as $related$
begin
  if new.related_id is null then return new; end if;
  -- Lookup by composite owner and UUID. Each target's ID is unique and its
  -- owner cannot be supplied by an unauthenticated event envelope.
  if new.related_kind='task' then
    if not exists(select 1 from public.tasks t
      where t.id=new.related_id and t.user_id=new.user_id
      for share) then
      raise exception 'Related task not found for this owner' using errcode='23503';
    end if;
  elsif new.related_kind='calendar_block' then
    if not exists(select 1 from public.calendar_blocks b
      where b.id=new.related_id and b.user_id=new.user_id
      for share) then
      raise exception 'Related calendar block not found for this owner' using errcode='23503';
    end if;
  elsif new.related_kind='study_entry' then
    if not exists(select 1 from public.study_entries e
      where e.id=new.related_id and e.user_id=new.user_id
      for share) then
      raise exception 'Related study entry not found for this owner' using errcode='23503';
    end if;
  else
    raise exception 'Invalid related kind' using errcode='23514';
  end if;
  return new;
end
$related$;
create trigger study_events_related_owner before insert or update of
  related_kind,related_id,user_id on public.study_events
  for each row execute function public.study_events_related_owner_check();

-- Compatible replacement of N50.1's version/timestamp trigger for D8 undo:
-- generic undo_action writes the journalled old row, including its exact
-- version and updated_at. Only its trusted inverse path may preserve them.
-- Every ordinary app/MCP write must still advance version and updated_at.
create or replace function public.study_events_touch_version() returns trigger
language plpgsql security invoker set search_path='' as $touch_undo$
begin
 if pg_catalog.current_setting('lemma.tool',true)='undo' then
  return new;
 end if;
 new.version:=old.version+1;
 new.updated_at:=pg_catalog.clock_timestamp();
 return new;
end
$touch_undo$;


-- N50.2.2: owner-checked, journalled event command with exact receipts.
-- The N50.1 study_events_log trigger already journals every mutation. The
-- registry marker below is deliberately non-logging to avoid duplicate changes.
create function public.study_events_undo_registry_marker() returns trigger
language plpgsql security invoker set search_path='' as $marker$
begin
 if tg_op='DELETE' then return old; end if;
 return new;
end
$marker$;
revoke all on function public.study_events_undo_registry_marker()
 from public,anon,authenticated,service_role;
create trigger lemma_log_change after insert or update or delete
 on public.study_events for each row
 execute function public.study_events_undo_registry_marker();

create function public.study_events_write_owned(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $study_event_command$
declare
 v_owner uuid; v_id uuid; v_op_id uuid; v_op text; v_patch jsonb;
 v_check jsonb; v_related_kind text; v_related_id uuid;
 v_old public.study_events%rowtype; v_candidate public.study_events%rowtype;
 v_new public.study_events%rowtype; v_entry uuid; v_version integer;
 v_source text; v_action bigint; v_stored jsonb; v_receipt jsonb;
begin
 v_owner:=(select auth.uid());
 if v_owner is null then raise exception 'Authentication required'; end if;
 if p is null or pg_catalog.jsonb_typeof(p) is distinct from 'object' then
  raise exception 'Command envelope must be an object'; end if;
 v_patch:=coalesce(p->'patch','{}'::jsonb);
 if pg_catalog.jsonb_typeof(v_patch) is distinct from 'object' then
  raise exception 'patch must be an object'; end if;
 -- Related fields are new in N50.2.2, so run the original N50.2.1
 -- envelope validator on its original field set, without replacing it.
 if (v_patch?'related_kind')<>(v_patch?'related_id') then
  raise exception 'Related kind and ID must be supplied together'; end if;
 if v_patch?'related_kind' then
  if v_patch->'related_kind'='null'::jsonb
     and v_patch->'related_id'='null'::jsonb then
   v_related_kind:=null; v_related_id:=null;
  elsif pg_catalog.jsonb_typeof(v_patch->'related_kind')='string'
      and v_patch->>'related_kind' in ('task','calendar_block','study_entry')
      and pg_catalog.jsonb_typeof(v_patch->'related_id')='string' then
   v_related_kind:=v_patch->>'related_kind';
   v_related_id:=(v_patch->>'related_id')::uuid;
  else
   raise exception 'Invalid related kind or ID'; end if;
 end if;
 v_op:=p->>'operation';
 v_check:=pg_catalog.jsonb_set(p,'{patch}',
   (v_patch-'related_kind'-'related_id'),true);
 if v_op='edit' and (v_check->'patch')='{}'::jsonb then
  -- The existing validator rejects empty edits; the original related-only
  -- edit is nonempty, so this placeholder validates only the old field set.
  v_check:=pg_catalog.jsonb_set(v_check,'{patch}','{"note":null}'::jsonb,true);
 end if;
 perform public.study_events_validate_envelope(v_check);
 v_op_id:=(p->>'operationId')::uuid;
 perform pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended(v_owner::text||':'||v_op_id::text,0));
 select result into v_stored from public.command_receipts
   where user_id=v_owner and operation_id=v_op_id;
 if found then
  if v_stored->'_request'=p then return v_stored-'_request'; end if;
  return pg_catalog.jsonb_build_object('operationId',v_op_id,
   'status','conflict','changed','[]'::jsonb,'actionNo',null,
   'conflict',pg_catalog.jsonb_build_object('reason','operationId reused with a different payload'));
 end if;
 if pg_catalog.current_setting('role',true)='service_role' then
  v_source:='mcp';
 else
  v_source:='app';
  perform pg_catalog.set_config('lemma.source','app',true);
  perform pg_catalog.set_config('lemma.tool','study_events_command',true);
 end if;
 perform pg_catalog.set_config('lemma.summary',
  pg_catalog.left('Study event '||v_op,200),true);
 if v_op='record' then
  v_id:=coalesce((p->'target'->>'id')::uuid,pg_catalog.gen_random_uuid());
  v_entry:=(v_patch->>'entry_id')::uuid;
  if not exists(select 1 from public.study_entries e
   where e.id=v_entry and e.user_id=v_owner for share) then
   raise exception 'Study entry not found for owner'; end if;
  insert into public.study_events(
    id,user_id,entry_id,kind,occurred_at,duration_minutes,note,
    related_kind,related_id,source)
  values(v_id,v_owner,v_entry,v_patch->>'kind',
    coalesce((v_patch->>'occurred_at')::timestamptz,pg_catalog.clock_timestamp()),
    (v_patch->>'duration_minutes')::integer,v_patch->>'note',
    v_related_kind,v_related_id,v_source) returning * into v_new;
 else
  v_id:=(p->'target'->>'id')::uuid;
  v_version:=(p->>'expectedVersion')::integer;
  select * into v_old from public.study_events
   where id=v_id and user_id=v_owner for update;
  if not found then raise exception 'Study event not found for owner'; end if;
  if v_old.version is distinct from v_version then
   v_receipt:=pg_catalog.jsonb_build_object('operationId',v_op_id,
     'status','conflict','changed','[]'::jsonb,'actionNo',null,
     'conflict',pg_catalog.jsonb_build_object(
       'expectedVersion',v_version,'currentVersion',v_old.version));
  else
   if v_op='edit' then
    if v_old.voided_at is not null then
     raise exception 'Voided study event cannot be edited'; end if;
    select * into v_candidate from pg_catalog.jsonb_populate_record(v_old,v_patch);
    if v_candidate.kind<>'drift' and v_candidate.duration_minutes is not null then
     raise exception 'Only drift may carry duration_minutes'; end if;
    if not exists(select 1 from public.study_entries e
     where e.id=v_candidate.entry_id and e.user_id=v_owner for share) then
     raise exception 'Study entry not found for owner'; end if;
    update public.study_events e set
      entry_id=v_candidate.entry_id,kind=v_candidate.kind,
      occurred_at=v_candidate.occurred_at,
      duration_minutes=v_candidate.duration_minutes,note=v_candidate.note,
      related_kind=v_candidate.related_kind,related_id=v_candidate.related_id,
      source=v_source
    where e.id=v_id and e.user_id=v_owner returning * into v_new;
   elsif v_op='void' then
    if v_old.voided_at is not null then raise exception 'Study event already voided'; end if;
    update public.study_events e set
      voided_at=pg_catalog.clock_timestamp(),source=v_source
    where e.id=v_id and e.user_id=v_owner returning * into v_new;
   elsif v_op='restore' then
    if v_old.voided_at is null then raise exception 'Study event is not voided'; end if;
    -- Restoring a historical event must recheck its related owner link.
    -- Self-assigning these two columns invokes the existing owner trigger;
    -- a removed task/block/entry cannot be silently resurrected as live.
    update public.study_events e set
      voided_at=null,related_kind=e.related_kind,related_id=e.related_id,
      source=v_source
    where e.id=v_id and e.user_id=v_owner returning * into v_new;
   end if;
  end if;
 end if;
 if v_receipt is null then
  select a.no into v_action from public.actions a
   where a.txid=pg_catalog.txid_current() and a.user_id=v_owner;
  if v_action is null then raise exception 'Study event write missing action journal'; end if;
  v_receipt:=pg_catalog.jsonb_build_object(
   'operationId',v_op_id,'status','ok','actionNo',v_action,
   'changed',pg_catalog.jsonb_build_array(
     pg_catalog.jsonb_build_object('resource','study_events',
       'id',v_new.id,'version',v_new.version)));
 end if;
 insert into public.command_receipts(user_id,operation_id,resource,result)
 values(v_owner,v_op_id,'study_events',
    v_receipt||pg_catalog.jsonb_build_object('_request',p));
 return v_receipt;
end
$study_event_command$;

create function public.study_events_command(p jsonb) returns jsonb
language sql volatile security invoker set search_path='' as $command$
 select public.study_events_write_owned(p)
$command$;
revoke all on function public.study_events_write_owned(jsonb) from public,anon;
revoke all on function public.study_events_command(jsonb) from public,anon;
grant execute on function public.study_events_write_owned(jsonb) to authenticated,service_role;
grant execute on function public.study_events_command(jsonb) to authenticated,service_role;
insert into public.lemma_undo_tables(table_name) values('study_events');
insert into public.lemma_command_resources(resource,command_fn,mcp_ok,"schema")
values('study_events','study_events_command',true,
 '{"operations":["record","edit","void","restore"],
 "fields":["entry_id","kind","occurred_at","duration_minutes","note",
 "related_kind","related_id"]}'::jsonb);
