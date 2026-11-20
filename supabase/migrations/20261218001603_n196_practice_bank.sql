-- Maps an existing approved/scored local bank item version to a registered destination.
-- There is no seeded mapping and no enrollment or assignment side effect on a read.
create table public.atlas_practice_bank (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid not null, item_version int not null check(item_version>0), project_id uuid not null, concept_id uuid not null,
  facet text not null, context text not null check(length(btrim(context))>0), track text not null, policy text not null,
  bank text not null, rubric text not null, family text not null check(length(btrim(family))>0),
  form text not null check(form in ('whole','step','micro','recall','worked')), minutes real not null check(minutes>0 and minutes<'Infinity'::real),
  uncued boolean not null, novel boolean not null, native_order integer, expert_probabilities jsonb,
  scored_at timestamptz, registered_at timestamptz not null default clock_timestamp(), valid_until timestamptz not null,
  primary key(user_id,item_id,item_version),foreign key(user_id,item_id) references public.items(user_id,id) on delete cascade,
  foreign key(user_id,project_id) references public.projects(user_id,id) on delete cascade,
  foreign key(user_id,concept_id) references public.concepts(user_id,id) on delete cascade,
  check(valid_until>registered_at),check(expert_probabilities is null or jsonb_typeof(expert_probabilities)='object' and scored_at is not null)
);
create index atlas_practice_bank_owner_target on public.atlas_practice_bank(user_id,project_id,concept_id);
alter table public.atlas_practice_bank enable row level security;
revoke all on public.atlas_practice_bank from public,anon,authenticated;
grant select,insert,delete on public.atlas_practice_bank to service_role;
create trigger lemma_account_delete_write_guard before insert or update or delete on public.atlas_practice_bank
  for each row execute function public.lemma_block_account_deletion_writes();

create function public.lemma_practice_bank_snapshot(p_owner uuid,p_cutoff timestamptz) returns jsonb
language plpgsql stable security definer set search_path='' as $bank$
declare bank_items jsonb;
begin
  if current_setting('role',true) is distinct from 'service_role' then raise exception 'Verified owner required' using errcode='42501';end if;
  if p_cutoff>statement_timestamp() then raise exception 'Future cutoff';end if;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') into bank_items from (
    select b.item_id as id,b.item_version as "itemVersion",b.project_id as project,b.concept_id as concept,b.facet,b.context,b.track,b.policy,b.bank,b.rubric,b.family,
      b.form,b.minutes,b.uncued,b.novel,true as approved,b.registered_at as "registeredAt",b.native_order as "nativeOrder",
      b.scored_at as "expertAsOf",b.expert_probabilities as "expertProbabilities",i.b as difficulty,
      case when (select scheduling_algorithm from public.settings where user_id=p_owner)='legacy' then 'atlas80'
        else public.lemma_trial_arm(p_owner,b.track,b.policy,b.bank,b.rubric,e.anchors,p_cutoff) end as arm
    from public.atlas_practice_bank b join public.items i on i.user_id=b.user_id and i.id=b.item_id and i.version=b.item_version
    left join public.atlas_practice_trials t on t.track=b.track left join public.atlas_practice_enrollments e on e.trial=t.id and e.user_id=p_owner
    where b.user_id=p_owner and b.registered_at<=p_cutoff and p_cutoff<b.valid_until and i.status='active'
  ) r;
  return bank_items;
end
$bank$;
revoke all on function public.lemma_practice_bank_snapshot(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.lemma_practice_bank_snapshot(uuid,timestamptz) to service_role;

-- A delivery receipt records the question actually opened. Agenda previews, forecast reads and shadow runs do not write.
create table public.atlas_practice_exposures (
  user_id uuid not null references auth.users(id) on delete cascade, request_id uuid not null,
  trial uuid references public.atlas_practice_trials(id), assigned_arm text, actual_arm text not null,
  item_id uuid not null, item_version int not null, question_text text not null, served_at timestamptz not null,
  scope jsonb not null, item_details jsonb not null, native_probability double precision check(native_probability between 0 and 1),
  primary key(user_id,request_id),check((trial is null)=(assigned_arm is null))
);
alter table public.atlas_practice_exposures enable row level security;
revoke all on public.atlas_practice_exposures from public,anon,authenticated,service_role;
create trigger immutable_practice_exposure before update or delete on public.atlas_practice_exposures
  for each row execute function public.lemma_trial_immutable();
create trigger lemma_account_delete_write_guard before insert or update or delete on public.atlas_practice_exposures
  for each row execute function public.lemma_block_account_deletion_writes();

create function public.lemma_deliver_practice(p_owner uuid,p_request uuid,p_selection jsonb) returns jsonb
language plpgsql security definer set search_path='' as $deliver$
declare
  prior public.atlas_practice_exposures; exposure public.atlas_practice_exposures;
  scope jsonb:=p_selection->'scope'; now_at timestamptz:=public.lemma_trial_clock();
  enrollment record; permissible text:='atlas80'; wanted text:=p_selection->>'arm'; pick uuid; picked_version int; chosen record;
  stored public.command_receipts; response jsonb; request jsonb; uses_new boolean;
  unavailable constant jsonb:='{"status":"unavailable"}'::jsonb;
begin
  if current_setting('role',true) is distinct from 'service_role' or p_owner is null or p_request is null then
    raise exception 'Verified owner and request required' using errcode='42501';end if;
  if to_regprocedure('public.lemma_plan_released()') is null then return unavailable;end if;
  if not public.lemma_plan_released() then return unavailable;end if;
  select scheduling_algorithm is distinct from 'legacy' into uses_new from public.settings where user_id=p_owner for share;
  if uses_new is null then return unavailable;end if;
  -- Share the namespace and lock used by every app/MCP command. A question open
  -- cannot consume an operation ID which already performed another action.
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text||':'||p_request::text,0));
  request:=jsonb_build_object('schemaVersion',1,'resource','practice_questions','operation','open','operationId',p_request);
  select * into stored from public.command_receipts where user_id=p_owner and operation_id=p_request;
  select * into prior from public.atlas_practice_exposures where user_id=p_owner and request_id=p_request;
  if exists(select 1 from public.atlas_practice_scores where user_id=p_owner and operation_id=p_request) then
    raise exception 'operationId payload conflict';end if;
  if stored.operation_id is not null and (stored.resource<>'practice_questions' or stored.result->'_request' is distinct from request
    or prior.request_id is null) then raise exception 'operationId payload conflict';end if;
  if prior.request_id is not null and stored.operation_id is null then raise exception 'Question receipt is missing';end if;
  -- Simultaneous rollback, assignment or checkpoint changes serialize against a new exposure.
  -- Trial before controls is the same acquisition order as admission.
  if prior.request_id is not null then
    if not exists(select 1 from public.atlas_practice_bank b join public.items i
      on i.user_id=b.user_id and i.id=b.item_id and i.version=b.item_version
      where b.user_id=p_owner and b.item_id=prior.item_id and b.item_version=prior.item_version and i.status='active'
        and b.registered_at<=now_at and now_at<b.valid_until and b.project_id::text=prior.scope->>'project'
        and b.concept_id::text=prior.scope->>'concept' and b.facet=prior.scope->>'facet' and b.context=prior.scope->>'context'
        and b.track=prior.scope->>'track' and b.policy=prior.scope->>'policy' and b.bank=prior.scope->>'bank' and b.rubric=prior.scope->>'rubric'
        and jsonb_build_object('form',b.form,'family',b.family,'uncued',b.uncued,'novel',b.novel)=prior.item_details) then
      return unavailable;end if;
    if prior.actual_arm<>'atlas80' then
      if not uses_new then return unavailable;end if;
      select e.anchors,t.track,t.certificate into enrollment from public.atlas_practice_trials t
        join public.atlas_practice_enrollments e on e.trial=t.id and e.user_id=p_owner
        where t.id=prior.trial for share of t;
      perform 1 from public.atlas_practice_controls where singleton for share;
      if public.lemma_trial_arm(p_owner,enrollment.track,enrollment.certificate->>'policy',
        enrollment.certificate->>'bank',enrollment.certificate->>'rubric',enrollment.anchors,now_at)<>prior.actual_arm then
        return unavailable;end if;
    end if;
    exposure:=prior;
  elsif p_selection is not null then
    if scope->>'owner' is distinct from p_owner::text then return unavailable;end if;
    select e.trial,e.arm,e.anchors into enrollment from public.atlas_practice_trials t
      join public.atlas_practice_enrollments e on e.trial=t.id and e.user_id=p_owner
      where t.track=scope->>'track' for share of t;
    perform 1 from public.atlas_practice_controls where singleton for share;
    if enrollment.trial is not null and uses_new then
      permissible:=public.lemma_trial_arm(p_owner,scope->>'track',scope->>'policy',scope->>'bank',scope->>'rubric',enrollment.anchors,now_at);
    end if;
    exposure.actual_arm:=case when wanted=permissible then wanted else 'atlas80' end;
    pick:=(case when exposure.actual_arm='atlas80' then p_selection->>'nativeQuestionId' else p_selection->>'questionId' end)::uuid;
    picked_version:=(case when exposure.actual_arm='atlas80' then p_selection->>'nativeVersion' else p_selection->>'itemVersion' end)::int;
    select i.text,b.form,b.family,b.uncued,b.novel into chosen from public.atlas_practice_bank b
      join public.items i on i.user_id=b.user_id and i.id=b.item_id and i.version=b.item_version
      where b.user_id=p_owner and b.item_id=pick and b.item_version=picked_version and i.status='active'
        and b.registered_at<=now_at and now_at<b.valid_until and b.project_id::text=scope->>'project'
        and b.concept_id::text=scope->>'concept' and b.facet=scope->>'facet' and b.context=scope->>'context'
        and b.track=scope->>'track' and b.policy=scope->>'policy' and b.bank=scope->>'bank' and b.rubric=scope->>'rubric'
      for share of i,b;
    if not found then return unavailable;end if;
    insert into public.atlas_practice_exposures values(p_owner,p_request,enrollment.trial,enrollment.arm,exposure.actual_arm,
      pick,picked_version,chosen.text,now_at,scope,jsonb_build_object('form',chosen.form,'family',chosen.family,
        'uncued',chosen.uncued,'novel',chosen.novel),(case when exposure.actual_arm='atlas80' then p_selection->>'nativeItemProbability'
        else p_selection->>'native' end)::float8) returning * into exposure;
  else return unavailable;end if;
  response:=jsonb_build_object('status','available','question',exposure.question_text,'arm',exposure.actual_arm,
    'itemId',exposure.item_id,'itemVersion',exposure.item_version,'projectId',exposure.scope->>'project','requestId',exposure.request_id);
  if stored.operation_id is null then
    insert into public.command_receipts(user_id,operation_id,resource,result)
      values(p_owner,p_request,'practice_questions',response||jsonb_build_object('_request',request));
  end if;
  -- Reconstruct from the protected delivery, never a client-editable legacy receipt.
  return response;
end
$deliver$;
revoke all on function public.lemma_deliver_practice(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.lemma_deliver_practice(uuid,uuid,jsonb) to service_role;

-- One immutable acceptance per delivered question, independent of the shared
-- legacy receipt table's pending N197 privilege cutover. Undo affects the
-- canonical facts, while retrying the same accepted operation never re-adds them.
create table public.atlas_practice_scores (
  user_id uuid not null references auth.users(id) on delete cascade, request_id uuid not null, operation_id uuid not null,
  attempt_id bigint not null, action_no bigint not null, outcome jsonb not null, result jsonb not null,
  accepted_at timestamptz not null default clock_timestamp(),
  primary key(user_id,request_id),unique(user_id,operation_id)
);
alter table public.atlas_practice_scores enable row level security;
revoke all on public.atlas_practice_scores from public,anon,authenticated,service_role;
create trigger immutable_practice_score before update or delete on public.atlas_practice_scores
  for each row execute function public.lemma_trial_immutable();
create trigger lemma_account_delete_write_guard before insert or update or delete on public.atlas_practice_scores
  for each row execute function public.lemma_block_account_deletion_writes();

-- Only the authenticated transport may call this after the learner explicitly
-- confirms a score. No caller-supplied item, scope, grade time or actor is trusted.
create function public.lemma_record_practice(p_owner uuid,p_operation uuid,p_request uuid,p_outcome jsonb,p_source text default 'app') returns jsonb
language plpgsql security definer set search_path='' as $score$
declare
  exposure public.atlas_practice_exposures; accepted public.atlas_practice_scores; stored public.command_receipts;
  request jsonb; response jsonb; attempt bigint; action bigint; session uuid; occurred timestamptz;
  outcome text:=p_outcome->>'result'; hint integer; novelty text:=p_outcome->>'novelty'; minutes real; key text;
begin
  if current_setting('role',true) is distinct from 'service_role' or p_owner is null or p_operation is null or p_request is null then
    raise exception 'Verified owner, operation and question required' using errcode='42501';end if;
  if p_source is null or p_source not in ('app','claude','chatgpt','other') then raise exception 'Invalid practice source';end if;
  if p_operation=p_request or jsonb_typeof(p_outcome) is distinct from 'object' then raise exception 'Invalid practice outcome';end if;
  for key in select jsonb_object_keys(p_outcome) loop
    if key not in ('result','hintLevel','novelty','minutes','sessionId') then raise exception 'Unknown practice outcome field %',key;end if;
  end loop;
  if outcome is null or outcome not in ('ok','fail') or novelty is null or novelty not in ('novel','familiar','seen_solution')
    or jsonb_typeof(p_outcome->'hintLevel') is distinct from 'number'
    or (p_outcome->>'hintLevel')::numeric not between 0 and 4
    or (p_outcome->>'hintLevel')::numeric<>trunc((p_outcome->>'hintLevel')::numeric) then raise exception 'Invalid practice outcome';end if;
  hint:=(p_outcome->>'hintLevel')::integer;
  if p_outcome?'minutes' then
    if jsonb_typeof(p_outcome->'minutes') is distinct from 'number' then raise exception 'Invalid practice minutes';end if;
    minutes:=(p_outcome->>'minutes')::real;
    if not (minutes>=0 and minutes<'Infinity'::real) then raise exception 'Invalid practice minutes';end if;
  end if;
  if p_outcome?'sessionId' then
    if jsonb_typeof(p_outcome->'sessionId') is distinct from 'string' then raise exception 'Invalid practice session';end if;
    session:=(p_outcome->>'sessionId')::uuid;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text||':'||p_operation::text,0));
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text||':'||p_request::text,196));
  request:=jsonb_build_object('schemaVersion',1,'resource','practice_questions','operation','score','operationId',p_operation,
    'target',jsonb_build_object('id',p_request),'patch',p_outcome);
  select * into exposure from public.atlas_practice_exposures where user_id=p_owner and request_id=p_request;
  if not found then raise exception 'Question delivery not found' using errcode='42501';end if;
  select * into stored from public.command_receipts where user_id=p_owner and operation_id=p_operation;
  select * into accepted from public.atlas_practice_scores where user_id=p_owner and request_id=p_request;
  if accepted.request_id is not null then
    if accepted.operation_id=p_operation and accepted.outcome=p_outcome then return accepted.result;end if;
    raise exception 'Question already scored';
  end if;
  if stored.operation_id is not null or exists(select 1 from public.atlas_practice_scores where user_id=p_owner and operation_id=p_operation)
    or exists(select 1 from public.atlas_practice_exposures where user_id=p_owner and request_id=p_operation)
    then raise exception 'operationId payload conflict';end if;
  occurred:=clock_timestamp();
  if session is not null then
    perform 1 from public.sessions s where s.user_id=p_owner and s.id=session
      and s.project_id=(exposure.scope->>'project')::uuid and s.state='open' and s.started_at<=occurred for share;
    if not found then raise exception 'Practice session outside owner/project or not open yet' using errcode='42501';end if;
  end if;
  if occurred<=exposure.served_at then raise exception 'Outcome must follow question delivery';end if;
  -- The verified transport supplies provenance; outcome fields and session
  -- settings cannot promote a learner score into a tutor or worker action.
  perform set_config('lemma.source',p_source,true);
  perform set_config('lemma.tool','lemma_record_practice',true);
  perform set_config('lemma.summary','Record practice outcome',true);
  insert into public.attempts(user_id,occurred_at,session_id,project_id,item_id,item_kind,cued,context,minutes,legacy_outcome,grader,origin,weight,created_at,updated_at)
    values(p_owner,occurred,session,(exposure.scope->>'project')::uuid,exposure.item_id,
      case when exposure.item_details->>'form' in ('micro','recall') then exposure.item_details->>'form' else 'practice' end,
      case when (exposure.item_details->>'uncued')::boolean then '{}'::uuid[] else array[(exposure.scope->>'concept')::uuid] end,
      jsonb_build_object('practice_request_id',p_request,'item_version',exposure.item_version,'novelty',novelty),minutes,
      case outcome when 'ok' then 'pass' else 'fail' end,'learner','user',
      case novelty when 'familiar' then .5 when 'seen_solution' then .2 else 1 end,occurred,occurred) returning id into attempt;
  insert into public.attempt_tags(user_id,attempt_id,concept_id,facet,role,result,hint_level,confidence,created_at,updated_at)
    values(p_owner,attempt,(exposure.scope->>'concept')::uuid,exposure.scope->>'facet','target',outcome,hint,1,occurred,occurred);
  select a.no into action from public.actions a where a.user_id=p_owner and a.txid=txid_current();
  if action is null then raise exception 'Practice outcome lacks an undo journal';end if;
  response:=jsonb_build_object('status','ok','operationId',p_operation,'requestId',p_request,'attemptId',attempt::text,'actionNo',action);
  insert into public.atlas_practice_scores(user_id,request_id,operation_id,attempt_id,action_no,outcome,result)
    values(p_owner,p_request,p_operation,attempt,action,p_outcome,response);
  insert into public.command_receipts(user_id,operation_id,resource,result)
    values(p_owner,p_operation,'practice_questions',response||jsonb_build_object('_request',request));
  return response;
end
$score$;
revoke all on function public.lemma_record_practice(uuid,uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.lemma_record_practice(uuid,uuid,uuid,jsonb,text) to service_role;

-- N191's installer-owned private schema is safe to create before its exports
-- arrive. RLS and the absence of schema grants protect it; never rewrite ACLs
-- belonging to an earlier deployment or alter another feature's registrations.
create schema if not exists lemma_export_private;
create table if not exists lemma_export_private.additional_tables(
  table_name text primary key check(table_name~'^[a-z_][a-z0-9_]*$'),
  owner_column text not null default 'user_id' check(owner_column~'^[a-z_][a-z0-9_]*$'), redact_columns text[] not null default '{}'
);
alter table lemma_export_private.additional_tables enable row level security;
insert into lemma_export_private.additional_tables(table_name,redact_columns) values
  ('atlas_practice_enrollments',array['pair','position']),
  ('atlas_practice_outcomes','{}'),('atlas_practice_exposures','{}'),('atlas_practice_bank','{}'),('atlas_practice_scores','{}')
on conflict(table_name) do nothing;
