-- N91: additive history metadata and journalled owner correction commands.
alter table public.session_events
  add column occurred_at timestamptz,
  add column superseded_by bigint,
  add column voided_at timestamptz,
  add column correction_reason text
    constraint session_event_correction_reason_bounds check
      (correction_reason is null or char_length(correction_reason) between 1 and 600),
  add column actor text
    constraint session_event_actor_check check
      (actor is null or actor in ('app','mcp','worker'));

alter table public.session_events
  add constraint session_events_owner_id_unique unique (user_id,id);
alter table public.session_events
  add constraint session_events_supersedes_owned
  foreign key(user_id,superseded_by) references public.session_events(user_id,id)
  deferrable initially immediate;
alter table public.session_events
  add constraint session_events_not_self_superseded check
    (superseded_by is null or superseded_by <> id);
create index session_events_owner_event_time on public.session_events
  (user_id,checkpoint_id,occurred_at,created_at,id)
  where voided_at is null and superseded_by is null;

-- Every row snapshots the exact scheduler configuration used for a history
-- correction. Historical review rows may remain unparameterized; never infer
-- weights from the current settings.
create table public.review_parameter_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  scheduler_version text not null
    constraint review_parameter_version_bounds check (char_length(scheduler_version) between 1 and 80),
  params jsonb not null
    constraint review_parameter_params_object check(jsonb_typeof(params)='object'),
  captured_at timestamptz not null default now(),
  unique (user_id,id)
);
create index review_parameter_sets_owner_time
  on public.review_parameter_sets(user_id,captured_at,id);
alter table public.review_parameter_sets enable row level security;
create policy review_parameter_sets_owner_read on public.review_parameter_sets
  for select to authenticated using(user_id=(select auth.uid()));
grant select on public.review_parameter_sets to authenticated, service_role;
grant insert,update,delete on public.review_parameter_sets to service_role;
revoke insert,update,delete,truncate on public.review_parameter_sets from anon,authenticated;
create trigger lemma_log_change after insert or update or delete
 on public.review_parameter_sets for each row execute function public.log_change();
insert into public.lemma_undo_tables(table_name) values ('review_parameter_sets');

alter table public.reviews
  add column scheduler_version text,
  add column params_id uuid,
  add column operation_id uuid;
alter table public.reviews
  add constraint reviews_scheduler_version_bounds check
    (scheduler_version is null or char_length(scheduler_version) between 1 and 80);
alter table public.reviews
  add constraint reviews_owner_parameter_set foreign key(user_id,params_id)
    references public.review_parameter_sets(user_id,id)
    deferrable initially immediate;
create unique index reviews_owner_operation_id on public.reviews(user_id,operation_id)
  where operation_id is not null;

comment on column public.session_events.occurred_at is
  'Correction event instant; legacy effective instant is coalesce(occurred_at,created_at).';
comment on column public.reviews.params_id is
  'Immutable owner-scoped scheduler parameter snapshot; NULL means historically unrecorded.';


-- Re-derive only from owner-active evidence, in effective event-time order.
-- An incomplete/voided checkpoint has no demonstrated fact to advertise.
create function public.lemma_rederive_checkpoint_evidence(p_owner uuid,p_id uuid)
returns void language plpgsql security definer set search_path='' as $derive$
declare v_cp public.checkpoints%rowtype;v_settings public.settings%rowtype;
 v_event public.session_events%rowtype;v_status text:='not_started';
 v_demonstrated timestamptz;v_due date;v_level int:=0;v_revisit boolean:=false;v_day date;
begin
 select * into v_cp from public.checkpoints
   where id=p_id and user_id=p_owner for update;
 if not found then raise exception 'Checkpoint not found for owner';end if;
 select * into v_settings from public.settings where user_id=p_owner;
 for v_event in select * from public.session_events
  where user_id=p_owner and checkpoint_id=p_id and voided_at is null
   and superseded_by is null and kind in('evidence','recheck')
  order by coalesce(occurred_at,created_at),id loop
  v_day:=((coalesce(v_event.occurred_at,v_event.created_at)
    at time zone coalesce(v_settings.time_zone,'UTC'))
    -make_interval(hours=>coalesce(v_settings.rollover_hour,4)))::date;
  if v_event.kind='evidence' and v_event.outcome='demonstrated' then
   v_status:='demonstrated';v_demonstrated:=coalesce(v_event.occurred_at,v_event.created_at);
   v_level:=0;v_due:=v_day+3;v_revisit:=false;
  elsif v_event.kind='recheck' and v_status='demonstrated' then
   if v_event.outcome='demonstrated' then
    v_level:=least(4,v_level+1);
    v_due:=case v_level when 1 then v_day+10 when 2 then v_day+30
      when 3 then v_day+90 else null end;v_revisit:=false;
   elsif v_event.outcome in('partial','failed') then
    v_level:=0;v_due:=v_day+1;v_revisit:=true;
   end if;
  end if;
 end loop;
 update public.checkpoints set status=v_status,demonstrated_at=v_demonstrated,
  recheck_level=v_level,recheck_due=v_due,needs_revisit=v_revisit,
  current_step=case when v_status='demonstrated'
    then pg_catalog.jsonb_array_length(steps) else 0 end
 where id=p_id and user_id=p_owner;
end $derive$;
revoke all on function public.lemma_rederive_checkpoint_evidence(uuid,uuid)
 from public,anon,authenticated;

-- The correction RPC is also the registered MCP command: both operations are
-- owner-bound, journalled, idempotent and work without a caller-supplied owner.
create function public.correct_session_event(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $event$
declare v_owner uuid:=auth.uid();v_role text:=pg_catalog.current_setting('role',true);
 v_op text;v_operation uuid;v_id bigint;v_old public.session_events%rowtype;
 v_new public.session_events%rowtype;v_patch jsonb;v_reason text;v_actor text;
 v_previous jsonb;v_result jsonb;v_action bigint;v_field text;
begin
 if v_owner is null or v_role not in ('authenticated','service_role') then
  raise exception 'Authenticated owner required';end if;
 if pg_catalog.jsonb_typeof(p) is distinct from 'object'
   or p->>'resource' is distinct from 'session_event_corrections'
   or p->>'schemaVersion' is distinct from '1'
   or pg_catalog.jsonb_typeof(p->'operationId') is distinct from 'string' then
  raise exception 'Invalid history command envelope';end if;
 v_op:=p->>'operation';
 if v_op not in('correct','void') or v_op is null then
  raise exception 'Unsupported event correction operation';end if;
 v_operation:=(p->>'operationId')::uuid;
 if (p->'target'->>'id') !~ '^[1-9][0-9]*$' then
  raise exception 'Positive event ID required';end if;
 v_id:=(p->'target'->>'id')::bigint;
 v_patch:=coalesce(p->'patch','{}'::jsonb);
 if pg_catalog.jsonb_typeof(v_patch) is distinct from 'object' then
  raise exception 'Correction patch must be an object';end if;
 select key into v_field from pg_catalog.jsonb_object_keys(v_patch) as fields(key)
  where key not in('reason','kind','body','outcome','hintLevel','occurredAt') limit 1;
 if v_field is not null or (v_op='void' and v_patch-'reason'<>'{}'::jsonb) then
  raise exception 'Unsupported correction field';end if;
 v_reason:=pg_catalog.btrim(v_patch->>'reason');
 if v_reason is null or pg_catalog.length(v_reason) not between 1 and 600 then
  raise exception 'Correction reason required';end if;
 if v_op='correct' and v_patch-'reason'='{}'::jsonb then
  raise exception 'Correct needs a changed event field';end if;
 perform pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended(v_owner::text||':'||v_operation::text,0));
 select result into v_previous from public.command_receipts
   where user_id=v_owner and operation_id=v_operation;
 if found then
  if v_previous->'_request'=p then return v_previous-'_request';end if;
  return pg_catalog.jsonb_build_object('status','conflict','operationId',v_operation,
   'reason','Changed payload with reused operationId','changed','[]'::jsonb);
 end if;
 select * into v_old from public.session_events
  where id=v_id and user_id=v_owner for update;
 if not found then raise exception 'Session event not found for owner';end if;
 if v_old.voided_at is not null or v_old.superseded_by is not null then
  raise exception 'Event already corrected or voided';end if;
 v_actor:=case when v_role='service_role' then 'mcp' else 'app' end;
 if v_role<>'service_role' then
  perform pg_catalog.set_config('lemma.source','app',true);
 end if;
 perform pg_catalog.set_config('lemma.tool','correct_session_event',true);
 perform pg_catalog.set_config('lemma.summary',pg_catalog.left('Correct session evidence: '||v_reason,200),true);
 if v_op='correct' then
  insert into public.session_events(user_id,session_id,checkpoint_id,kind,body,
    outcome,hint_level,occurred_at,actor,correction_reason)
   values(v_owner,v_old.session_id,v_old.checkpoint_id,
    coalesce(v_patch->>'kind',v_old.kind),
    coalesce(v_patch->>'body',v_old.body),
    case when v_patch?'outcome' then v_patch->>'outcome' else v_old.outcome end,
    case when v_patch?'hintLevel' then (v_patch->>'hintLevel')::smallint
      else v_old.hint_level end,
    case when v_patch?'occurredAt' then (v_patch->>'occurredAt')::timestamptz
      else coalesce(v_old.occurred_at,v_old.created_at) end,
    v_actor,v_reason)
   returning * into v_new;
  update public.session_events set superseded_by=v_new.id,
    correction_reason=v_reason,actor=v_actor where id=v_old.id and user_id=v_owner;
 else
  update public.session_events set voided_at=pg_catalog.clock_timestamp(),
    correction_reason=v_reason,actor=v_actor where id=v_old.id and user_id=v_owner;
 end if;
 -- Ordinary notes must not overwrite independently recorded checkpoint progress.
 if v_old.checkpoint_id is not null and
   (v_old.kind in ('evidence','recheck') or
    (v_op='correct' and v_new.kind in ('evidence','recheck'))) then
  perform public.lemma_rederive_checkpoint_evidence(v_owner,v_old.checkpoint_id);
 end if;
 select no into v_action from public.actions
  where txid=pg_catalog.txid_current() and user_id=v_owner;
 if v_action is null then raise exception 'Missing correction action';end if;
 v_result:=pg_catalog.jsonb_build_object('status','ok','operationId',v_operation,
   'actionNo',v_action,'changed',pg_catalog.jsonb_build_array(
     pg_catalog.jsonb_build_object('resource','session_events','id',v_old.id),
     pg_catalog.jsonb_build_object('resource','session_events','id',
       coalesce(v_new.id,v_old.id))),
   'revisedEventId',v_new.id);
 insert into public.command_receipts(user_id,operation_id,resource,result)
  values(v_owner,v_operation,'session_event_corrections',
    v_result||pg_catalog.jsonb_build_object('_request',p));
 return v_result;
end $event$;
revoke all on function public.correct_session_event(jsonb) from public,anon;
grant execute on function public.correct_session_event(jsonb)
 to authenticated,service_role;
create function public.void_session_event(p jsonb) returns jsonb
language sql security invoker set search_path='' as $void$
 select public.correct_session_event(p||'{"operation":"void"}'::jsonb)
$void$;
revoke all on function public.void_session_event(jsonb) from public,anon;
grant execute on function public.void_session_event(jsonb)
 to authenticated,service_role;

-- Explicit replacement of the card's schedule is disclosed and snapshotted
-- with the correction: legacy review logs lack historical FSRS parameters,
-- so blindly replaying with today's weights would fabricate a schedule.
create function public.correct_review(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $review$
declare v_owner uuid:=auth.uid();v_role text:=pg_catalog.current_setting('role',true);
 v_op text;v_operation uuid;v_id bigint;v_old public.reviews%rowtype;
 v_card public.cards%rowtype;v_patch jsonb;v_reason text;v_state jsonb;
 v_param uuid;v_previous jsonb;v_result jsonb;v_action bigint;v_field text;
begin
 if v_owner is null or v_role not in('authenticated','service_role') then
  raise exception 'Authenticated owner required';end if;
 if pg_catalog.jsonb_typeof(p) is distinct from 'object'
  or p->>'resource' is distinct from 'review_corrections'
  or p->>'schemaVersion' is distinct from '1'
  or pg_catalog.jsonb_typeof(p->'operationId') is distinct from 'string' then
  raise exception 'Invalid review command envelope';end if;
 v_op:=p->>'operation';
 if v_op not in('correct','void') or v_op is null then
  raise exception 'Unsupported review operation';end if;
 v_operation:=(p->>'operationId')::uuid;
 if (p->'target'->>'id') !~ '^[1-9][0-9]*$' then
  raise exception 'Positive review ID required';end if;
 v_id:=(p->'target'->>'id')::bigint;
 v_patch:=coalesce(p->'patch','{}'::jsonb);
 if pg_catalog.jsonb_typeof(v_patch) is distinct from 'object' then
  raise exception 'Review patch must be an object';end if;
 select key into v_field from pg_catalog.jsonb_object_keys(v_patch) as fields(key)
  where key not in('reason','replacementState','schedulerParams',
   'rating','reviewedAt','confidence','durationMs') limit 1;
 if v_field is not null or
   (v_op='void' and v_patch-'{reason,replacementState,schedulerParams}'::text[] <> '{}'::jsonb)
  then raise exception 'Unsupported review correction field';end if;
 v_reason:=pg_catalog.btrim(v_patch->>'reason');
 v_state:=v_patch->'replacementState';
 if v_reason is null or pg_catalog.length(v_reason) not between 1 and 600
  or pg_catalog.jsonb_typeof(v_state) is distinct from 'object'
  or not (v_state ?& array['state','due','stability','difficulty',
    'last_review','step','reps','lapses'])
  or (select pg_catalog.count(*) from pg_catalog.jsonb_object_keys(v_state))<>8
  then raise exception 'Reason and complete disclosed replacement state required';end if;
 if v_patch?'schedulerParams' and
  pg_catalog.jsonb_typeof(v_patch->'schedulerParams') is distinct from 'object'
  then raise exception 'Scheduler parameter snapshot must be an object';end if;
 perform pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended(v_owner::text||':'||v_operation::text,0));
 select result into v_previous from public.command_receipts
   where user_id=v_owner and operation_id=v_operation;
 if found then
  if v_previous->'_request'=p then return v_previous-'_request';end if;
  return pg_catalog.jsonb_build_object('status','conflict','operationId',v_operation,
   'reason','Changed payload with reused operationId','changed','[]'::jsonb);
 end if;
 select * into v_old from public.reviews
   where id=v_id and user_id=v_owner for update;
 if not found then raise exception 'Review not found for owner';end if;
 if v_old.undone_at is not null then raise exception 'Review already voided';end if;
 select * into v_card from public.cards
   where id=v_old.card_id and user_id=v_owner for update;
 if not found then raise exception 'Card not found for owner';end if;
 if v_role<>'service_role' then
  perform pg_catalog.set_config('lemma.source','app',true);
 end if;
 perform pg_catalog.set_config('lemma.tool','correct_review',true);
 perform pg_catalog.set_config('lemma.summary',pg_catalog.left('Correct review: '||v_reason,200),true);
 insert into public.review_parameter_sets(user_id,scheduler_version,params)
  values(v_owner,'manual-replacement-v1',
   pg_catalog.jsonb_build_object('method','disclosed_replacement',
    'reason',v_reason,'priorReviewId',v_id,
    'schedulerParams',coalesce(v_patch->'schedulerParams','{}'::jsonb),
    'replacementState',v_state))
  returning id into v_param;
 update public.reviews set
  rating=case when v_op='correct' and v_patch?'rating'
    then (v_patch->>'rating')::smallint else rating end,
  reviewed_at=case when v_op='correct' and v_patch?'reviewedAt'
    then (v_patch->>'reviewedAt')::timestamptz else reviewed_at end,
  confidence=case when v_op='correct' and v_patch?'confidence'
    then v_patch->>'confidence' else confidence end,
  duration_ms=case when v_op='correct' and v_patch?'durationMs'
    then (v_patch->>'durationMs')::integer else duration_ms end,
  undone_at=case when v_op='void' then pg_catalog.clock_timestamp()
    else undone_at end,
  scheduler_version='manual-replacement-v1',params_id=v_param,
  operation_id=v_operation where id=v_id and user_id=v_owner;
 update public.cards set
  state=(v_state->>'state')::smallint,
  due=(v_state->>'due')::timestamptz,
  stability=(v_state->>'stability')::real,
  difficulty=(v_state->>'difficulty')::real,
  last_review=(v_state->>'last_review')::timestamptz,
  step=(v_state->>'step')::integer,
  reps=(v_state->>'reps')::integer,lapses=(v_state->>'lapses')::integer
 where id=v_card.id and user_id=v_owner;
 select no into v_action from public.actions
  where txid=pg_catalog.txid_current() and user_id=v_owner;
 if v_action is null then raise exception 'Missing review correction action';end if;
 v_result:=pg_catalog.jsonb_build_object('status','ok','operationId',v_operation,
   'actionNo',v_action,'changed',pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object('resource','reviews','id',v_id),
    pg_catalog.jsonb_build_object('resource','cards','id',v_card.id)),
   'parameterSnapshotId',v_param,'method','disclosed_replacement');
 insert into public.command_receipts(user_id,operation_id,resource,result)
  values(v_owner,v_operation,'review_corrections',
    v_result||pg_catalog.jsonb_build_object('_request',p));
 return v_result;
end $review$;
revoke all on function public.correct_review(jsonb) from public,anon;
grant execute on function public.correct_review(jsonb) to authenticated,service_role;
create function public.void_review(p jsonb) returns jsonb
language sql security invoker set search_path='' as $void$
 select public.correct_review(p||'{"operation":"void"}'::jsonb)
$void$;
revoke all on function public.void_review(jsonb) from public,anon;
grant execute on function public.void_review(jsonb) to authenticated,service_role;

insert into public.lemma_command_resources(resource,command_fn,mcp_ok,"schema")
 values
 ('session_event_corrections','correct_session_event',true,
 '{"operations":["correct","void"],"fields":["kind","body","outcome","hintLevel","occurredAt","reason"]}'::jsonb),
 ('review_corrections','correct_review',true,
 '{"operations":["correct","void"],"fields":["reason","rating","reviewedAt","confidence","durationMs","replacementState","schedulerParams"]}'::jsonb);
