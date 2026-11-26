-- N239: preserve saved tutoring, bind review corrections to their observed
-- schedule, and expose N226's protected Atlas dependencies before confirmation.
-- Created with the Supabase CLI; assigned an unused later timestamp before
-- publication because this definition depends on the future-dated N226 chain.

create function public.lemma_guard_checkpoint_tutor_delete()
returns trigger language plpgsql security definer set search_path='' as $guard$
begin
 -- Only the established service-role account purge or auth-user cascade may
 -- remove a transcript. Ordinary plan edits must preserve its checkpoint.
 if pg_catalog.current_setting('role',true)='service_role' and exists(
   select 1 from public.account_deletion_requests d where d.user_id=old.user_id
    and d.cleanup_txid=pg_catalog.txid_current() and d.cleanup_pid=pg_catalog.pg_backend_pid()) then
  return old;
 end if;
 if pg_catalog.pg_trigger_depth()>1 and not exists(select 1 from auth.users where id=old.user_id) then
  return old;
 end if;
 -- Public tutor writes hold the checkpoint FOR SHARE. Also lock an existing
 -- empty thread so a privileged first-turn insertion cannot race its cascade.
 perform 1 from public.tutor_threads h where h.user_id=old.user_id and h.checkpoint_id=old.id for update;
 if exists(select 1 from public.tutor_threads h where h.user_id=old.user_id and h.checkpoint_id=old.id
   and (h.last_sequence>0 or exists(select 1 from public.tutor_turns t where t.user_id=h.user_id and t.thread_id=h.id))) then
  raise exception 'Checkpoint has a saved tutor conversation; preserve or archive it instead of removing it';
 end if;
 return old;
end $guard$;
revoke all on function public.lemma_guard_checkpoint_tutor_delete() from public,anon;
create trigger zz_checkpoint_preserve_tutor before delete on public.checkpoints
 for each row execute function public.lemma_guard_checkpoint_tutor_delete();

-- Private helper: counts every dependency protected by N226. It is callable
-- only from owner-checked definer commands; it exposes no cross-owner read API.
create function public.lemma_n239_concept_dependencies(p_owner uuid,p_concept uuid)
returns jsonb language sql stable security invoker set search_path='' as $dependencies$
 select pg_catalog.jsonb_build_object(
  'attemptTags',(select count(*) from public.attempt_tags where user_id=p_owner and concept_id=p_concept),
  'instructionEvents',(select count(*) from public.instruction_events where user_id=p_owner and concept_id=p_concept),
  'assumptions',(select count(*) from public.assumptions where user_id=p_owner and concept_id=p_concept),
  'recheckDecisions',(select count(*) from public.recheck_decisions where user_id=p_owner and concept_id=p_concept),
  'legacyEvidence',(select count(*) from public.evidence where user_id=p_owner and concept_id=p_concept),
  'typedLinks',(select count(*) from public.atlas_links where user_id=p_owner and (from_id=p_concept or to_id=p_concept)),
  'aliases',(select count(*) from public.concept_aliases where user_id=p_owner and (concept_a=p_concept or concept_b=p_concept)),
  'practiceBank',(select count(*) from public.atlas_practice_bank where user_id=p_owner and concept_id=p_concept),
  'rechecks',(select count(*) from public.rechecks where user_id=p_owner and class_id=p_concept),
  'familyReferences',(select count(*) from public.concepts where user_id=p_owner and family_id=p_concept and id<>p_concept),
  'itemTags',(select count(*) from public.items where user_id=p_owner and concept_tags::text like '%'||p_concept::text||'%'),
  'cuedAttempts',(select count(*) from public.attempts where user_id=p_owner and p_concept=any(cued)),
  'cuedItems',(select count(*) from public.items where user_id=p_owner and p_concept=any(cued)))
$dependencies$;
revoke all on function public.lemma_n239_concept_dependencies(uuid,uuid) from public,anon,authenticated,service_role;

-- The privileged connector supplies its authenticated owner. Read the target
-- review and current card schedule/version in one database snapshot; callers
-- must preserve this version while preparing their disclosed replacement.
create function public.n239_mcp_review_correction_snapshot(p_user uuid,p_review bigint)
returns jsonb language plpgsql stable security definer set search_path='' as $snapshot$
declare v_result jsonb;
begin
 if pg_catalog.current_setting('role',true) is distinct from 'service_role' then
  raise exception 'Service role required';
 end if;
 if p_user is null or p_review is null or p_review<1 then
  raise exception 'Owner and positive review ID required';
 end if;
 select pg_catalog.jsonb_build_object(
  'review',pg_catalog.jsonb_build_object(
   'id',r.id::text,'cardId',r.card_id,'rating',r.rating,'reviewedAt',r.reviewed_at,
   'confidence',r.confidence,'durationMs',r.duration_ms,'undoneAt',r.undone_at,
   'schedulerVersion',r.scheduler_version,'parameterSnapshotId',r.params_id),
  'card',pg_catalog.jsonb_build_object('id',c.id,'version',c.version,
   'schedule',pg_catalog.jsonb_build_object(
    'state',c.state,'due',c.due,'stability',c.stability,'difficulty',c.difficulty,
    'last_review',c.last_review,'step',c.step,'reps',c.reps,'lapses',c.lapses)),
  'expectedVersion',c.version,'readAt',pg_catalog.statement_timestamp())
 into v_result from public.reviews r join public.cards c
  on c.id=r.card_id and c.user_id=r.user_id
 where r.id=p_review and r.user_id=p_user and c.user_id=p_user;
 if not found then raise exception 'Review not found for owner';end if;
 return v_result;
end $snapshot$;
revoke all on function public.n239_mcp_review_correction_snapshot(uuid,bigint) from public,anon,authenticated;
grant execute on function public.n239_mcp_review_correction_snapshot(uuid,bigint) to service_role;

create or replace function public.correct_review(p jsonb) returns jsonb
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
 -- Read the owner-bound target first, then use the same card-first lock
 -- order as grading. Recheck the review after acquiring the card lock.
 select * into v_old from public.reviews
   where id=v_id and user_id=v_owner;
 if not found then raise exception 'Review not found for owner';end if;
 select * into v_card from public.cards
   where id=v_old.card_id and user_id=v_owner for update;
 if not found then raise exception 'Card not found for owner';end if;
 select * into v_old from public.reviews
   where id=v_id and user_id=v_owner for update;
 if not found then raise exception 'Review not found for owner';end if;
 if v_old.card_id is distinct from v_card.id then
  raise exception 'Review changed while preparing correction; read it again' using errcode='40001';
 end if;
 if v_old.undone_at is not null then raise exception 'Review already voided';end if;
 -- The replacement schedule belongs to the card version inspected when it
 -- was prepared. Never substitute a fresh version for a stale replacement.
 if pg_catalog.jsonb_typeof(p->'expectedVersion') is distinct from 'number'
   or (p->>'expectedVersion') !~ '^[1-9][0-9]*$'
   or (p->>'expectedVersion')::numeric>2147483647 then
  raise exception 'Positive card expectedVersion required for review correction';
 end if;
 if (p->>'expectedVersion')::integer<>v_card.version then
  return pg_catalog.jsonb_build_object('status','conflict','operationId',v_operation,
   'reason','Card version changed; reread the complete review history and recompute the replacement state',
   'currentVersion',v_card.version,'actionNo',null,'changed','[]'::jsonb);
 end if;
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
grant execute on function public.correct_review(jsonb) to authenticated,service_role;

create or replace function public.concepts_command(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $command$
declare
 v_owner uuid:=(select auth.uid());
 v_role text:=pg_catalog.current_setting('role',true);
 v_op text;v_op_id uuid;v_target jsonb;v_patch jsonb;
 v_id uuid;v_other_id uuid;v_expected integer;v_keep_version integer;
 v_concept public.concepts%rowtype;v_other public.concepts%rowtype;
 v_after public.concepts%rowtype;v_edge record;
 v_bad text;v_previous jsonb;v_result jsonb;v_impact jsonb;v_protected jsonb;v_allowed boolean;
 v_slug text;v_action bigint;v_from uuid;v_to uuid;v_kind text;
begin
 if v_owner is null or v_role not in ('authenticated','service_role') then
  raise exception 'Authenticated owner required';end if;
 if p is null or pg_catalog.jsonb_typeof(p) is distinct from 'object'
  or p->>'schemaVersion' is distinct from '1'
  or p->>'resource' is distinct from 'concepts'
  or pg_catalog.jsonb_typeof(p->'operationId') is distinct from 'string' then
  raise exception 'Invalid Atlas command envelope';end if;
 select key into v_bad from pg_catalog.jsonb_object_keys(p) as keys(key)
  where key not in ('schemaVersion','resource','operation','operationId','target','expectedVersion','patch') limit 1;
 if v_bad is not null then raise exception 'Unknown Atlas command field %',v_bad;end if;
 v_op_id:=(p->>'operationId')::uuid;
 v_op:=p->>'operation';
 if v_op not in ('create','update','reparent','link','unlink','preview_merge','merge') or v_op is null then
  raise exception 'Unsupported Atlas operation';end if;
 v_target:=coalesce(p->'target','{}'::jsonb);
 v_patch:=coalesce(p->'patch','{}'::jsonb);
 if pg_catalog.jsonb_typeof(v_target) is distinct from 'object'
   or pg_catalog.jsonb_typeof(v_patch) is distinct from 'object' then
  raise exception 'Atlas target and patch must be objects';end if;
 select key into v_bad from pg_catalog.jsonb_object_keys(v_target) as keys(key)
  where key<>'id' limit 1;
 if v_bad is not null then raise exception 'Unknown Atlas target field %',v_bad;end if;
 -- Serialize all graph edits for one owner, including parallel merge/link attempts.
 perform pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('atlas-owner:'||v_owner::text,0));
 select result into v_previous from public.command_receipts r
  where r.user_id=v_owner and r.operation_id=v_op_id;
 if found then
  if v_previous->'_request'=p then return v_previous-'_request';end if;
  return pg_catalog.jsonb_build_object('status','conflict','operationId',v_op_id,
   'reason','operationId reused with a different payload','actionNo',null,'changed','[]'::jsonb);
 end if;
 if v_op='create' then
  select key into v_bad from pg_catalog.jsonb_object_keys(v_patch) as keys(key)
   where key not in ('subject_id','name','blurb','parent_id','slug') limit 1;
  if v_bad is not null then raise exception 'Unknown create field %',v_bad;end if;
  if v_patch->>'subject_id' is null or v_patch->>'name' is null then
   raise exception 'Atlas create requires subject_id and name';end if;
  if p?'expectedVersion' and p->>'expectedVersion'<>'0' then
   raise exception 'Create expectedVersion must be 0';end if;
 else
  if pg_catalog.jsonb_typeof(v_target->'id') is distinct from 'string' then
   raise exception 'Atlas target ID required';end if;
  v_id:=(v_target->>'id')::uuid;
  select * into v_concept from public.concepts
   where id=v_id and user_id=v_owner for update;
  if not found then raise exception 'Atlas concept not found for owner';end if;
  if v_op not in ('preview_merge') then
   if (p->>'expectedVersion') !~ '^[1-9][0-9]*$' or
     (p->>'expectedVersion')::numeric>2147483647 then
    raise exception 'Positive Atlas expectedVersion required';end if;
   v_expected:=(p->>'expectedVersion')::integer;
  end if;
 end if;
 if v_op in ('link','unlink') then
  select key into v_bad from pg_catalog.jsonb_object_keys(v_patch) as keys(key)
   where key not in ('other_id','kind') limit 1;
  if v_bad is not null then raise exception 'Unknown Atlas link field %',v_bad;end if;
  v_other_id:=(v_patch->>'other_id')::uuid;
  v_kind:=v_patch->>'kind';
  if v_other_id is null or v_kind not in ('prereq','related') or v_kind is null then
   raise exception 'Atlas link requires other_id and kind';end if;
 elsif v_op in ('merge','preview_merge') then
  select key into v_bad from pg_catalog.jsonb_object_keys(v_patch) as keys(key)
   where key not in ('keep_id','keep_version') limit 1;
  if v_bad is not null then raise exception 'Unknown Atlas merge field %',v_bad;end if;
  v_other_id:=(v_patch->>'keep_id')::uuid;
  if v_other_id is null or v_other_id=v_concept.id then
   raise exception 'Merge requires a different kept concept';end if;
 elsif v_op='update' then
  select key into v_bad from pg_catalog.jsonb_object_keys(v_patch) as keys(key)
   where key not in ('name','blurb') limit 1;
  if v_bad is not null or v_patch='{}'::jsonb then
   raise exception 'Atlas update accepts only name or blurb';end if;
 elsif v_op='reparent' then
  if not(v_patch?'parent_id') or
   (select count(*) from pg_catalog.jsonb_object_keys(v_patch))<>1 then
   raise exception 'Atlas reparent requires only parent_id';end if;
 end if;
 if v_op in ('link','unlink','merge','preview_merge') then
  select * into v_other from public.concepts
   where id=v_other_id and user_id=v_owner for update;
  if not found then raise exception 'Referenced Atlas concept not found for owner';end if;
 end if;
 if v_op in ('merge','preview_merge') then
  if v_concept.subject_id<>v_other.subject_id then
   raise exception 'Cannot merge concepts from different subjects';end if;
  v_impact:=pg_catalog.jsonb_build_object(
    'childConcepts',(select count(*) from public.concepts where user_id=v_owner and parent_id=v_concept.id),
    'incomingPrerequisites',(select count(*) from public.concept_links
      where user_id=v_owner and kind='prereq' and to_id=v_concept.id),
    'outgoingPrerequisites',(select count(*) from public.concept_links
      where user_id=v_owner and kind='prereq' and from_id=v_concept.id),
    'relatedConcepts',(select count(*) from public.concept_links
      where user_id=v_owner and kind='related' and (from_id=v_concept.id or to_id=v_concept.id)),
    'notesAndCards',(select count(*) from public.notes where user_id=v_owner and concept_id=v_concept.id),
    'checkpointRefs',(select count(*) from public.checkpoint_concepts where user_id=v_owner and concept_id=v_concept.id));
  v_protected:=public.lemma_n239_concept_dependencies(v_owner,v_concept.id);
  v_allowed:=not exists(select 1 from pg_catalog.jsonb_each_text(v_protected) e where e.value::bigint>0);
  if v_op='preview_merge' then
   return pg_catalog.jsonb_build_object('status','ok','operationId',v_op_id,
     'actionNo',null,'changed','[]'::jsonb,'impact',v_impact,
     'sourceVersion',v_concept.version,'keepVersion',v_other.version,
     'mergeAllowed',v_allowed,'protectedDependencies',v_protected);
  end if;
  if not v_allowed then
   raise exception 'Atlas concept has learning evidence or semantic links; preserve the source and create an alias instead of merging'
    using detail=v_protected::text;
  end if;
  if (v_patch->>'keep_version') !~ '^[1-9][0-9]*$' or
    (v_patch->>'keep_version')::numeric>2147483647 then
   raise exception 'Merge requires positive kept-concept version';end if;
  v_keep_version:=(v_patch->>'keep_version')::integer;
 end if;
 if v_op<>'create' and v_concept.version is distinct from v_expected then
  v_result:=pg_catalog.jsonb_build_object('status','conflict','operationId',v_op_id,
   'reason','Atlas concept version changed','currentVersion',v_concept.version,
   'actionNo',null,'changed','[]'::jsonb);
 elsif v_op='merge' and v_other.version is distinct from v_keep_version then
  v_result:=pg_catalog.jsonb_build_object('status','conflict','operationId',v_op_id,
   'reason','Kept concept version changed','currentVersion',v_other.version,
   'actionNo',null,'changed','[]'::jsonb);
 else
  -- Authenticated clients may set custom lemma GUCs: provenance is never trusted
  -- unless the checked service role dispatched this command through MCP.
  perform pg_catalog.set_config('lemma.source',
   case when v_role='service_role' and
      pg_catalog.current_setting('lemma.source',true) in ('claude','chatgpt','other')
     then pg_catalog.current_setting('lemma.source',true)
    when v_role='service_role' then 'other'
    else 'app' end,true);
  perform pg_catalog.set_config('lemma.tool','atlas',true);
  perform pg_catalog.set_config('lemma.summary',
   pg_catalog.left('Atlas '||v_op,200),true);
  if v_op='create' then
   v_slug:=coalesce(nullif(v_patch->>'slug',''),
    pg_catalog.btrim(pg_catalog.regexp_replace(
      pg_catalog.lower(v_patch->>'name'),'[^a-z0-9]+','-','g'),'-'));
   if v_slug is null or v_slug='' then raise exception 'Atlas slug requires ASCII letters or digits';end if;
   insert into public.concepts(user_id,subject_id,slug,name,blurb,parent_id)
    values(v_owner,(v_patch->>'subject_id')::uuid,v_slug,v_patch->>'name',
     v_patch->>'blurb',(v_patch->>'parent_id')::uuid)
    returning * into v_after;
  elsif v_op='update' then
   update public.concepts set
    name=case when v_patch?'name' then v_patch->>'name' else name end,
    blurb=case when v_patch?'blurb' then v_patch->>'blurb' else blurb end
   where id=v_id and user_id=v_owner returning * into v_after;
  elsif v_op='reparent' then
   update public.concepts set parent_id=(v_patch->>'parent_id')::uuid
   where id=v_id and user_id=v_owner returning * into v_after;
  elsif v_op in ('link','unlink') then
   if v_other.id=v_concept.id then raise exception 'Concept cannot link to itself';end if;
   if v_op='link' then
    insert into public.concept_links(user_id,from_id,to_id,kind)
     values(v_owner,v_concept.id,v_other.id,v_kind);
   else
    delete from public.concept_links where user_id=v_owner and
     from_id=v_concept.id and to_id=v_other.id and kind=v_kind;
    if not found then raise exception 'Atlas graph link not found';end if;
   end if;
   update public.concepts set name=name where id=v_concept.id and user_id=v_owner
    returning * into v_after;
  else
   -- Move kept concept out from beneath the deleted node first. Deferred
   -- hierarchy checks validate the final graph, not transient rewiring.
   if v_other.parent_id=v_concept.id then
    update public.concepts set parent_id=
     case when v_concept.parent_id=v_other.id then null else v_concept.parent_id end
    where id=v_other.id and user_id=v_owner;
   end if;
   update public.concepts set parent_id=v_other.id
    where user_id=v_owner and parent_id=v_concept.id and id<>v_other.id;
   -- Insert new references before removing old ones, with same-owner FK checks.
   -- Cycle guard rejects dependency rewiring that would create a loop.
   for v_edge in select * from public.concept_links
      where user_id=v_owner and (from_id=v_concept.id or to_id=v_concept.id)
   loop
    v_from:=case when v_edge.from_id=v_concept.id then v_other.id else v_edge.from_id end;
    v_to:=case when v_edge.to_id=v_concept.id then v_other.id else v_edge.to_id end;
    if v_from<>v_to then
     insert into public.concept_links(user_id,from_id,to_id,kind)
      values(v_owner,v_from,v_to,v_edge.kind) on conflict(from_id,to_id) do nothing;
    end if;
   end loop;
   insert into public.checkpoint_concepts(user_id,checkpoint_id,concept_id)
    select v_owner,checkpoint_id,v_other.id from public.checkpoint_concepts
    where user_id=v_owner and concept_id=v_concept.id
    on conflict(checkpoint_id,concept_id) do nothing;
   delete from public.checkpoint_concepts
    where user_id=v_owner and concept_id=v_concept.id;
   update public.notes set concept_id=v_other.id
    where user_id=v_owner and concept_id=v_concept.id;
   update public.misconceptions set concept_id=v_other.id
    where user_id=v_owner and concept_id=v_concept.id;
   update public.practice_topics set concept_id=v_other.id
    where user_id=v_owner and concept_id=v_concept.id;
   delete from public.concepts where user_id=v_owner and id=v_concept.id;
   update public.concepts set name=name where id=v_other.id and user_id=v_owner
    returning * into v_after;
  end if;
  select no into v_action from public.actions where user_id=v_owner
   and txid=pg_catalog.txid_current();
  if v_action is null then raise exception 'Atlas command lacks an undoable audit action';end if;
  v_result:=pg_catalog.jsonb_build_object('status','ok','operationId',v_op_id,
   'actionNo',v_action,'changed',pg_catalog.jsonb_build_array(
     pg_catalog.jsonb_build_object('resource','concepts','id',v_after.id,'version',v_after.version)),
   'concept',pg_catalog.to_jsonb(v_after));
  if v_op='merge' then v_result:=v_result||
   pg_catalog.jsonb_build_object('impact',v_impact,'mergedId',v_concept.id);end if;
 end if;
 insert into public.command_receipts(user_id,operation_id,resource,result)
  values(v_owner,v_op_id,'concepts',v_result||pg_catalog.jsonb_build_object('_request',p));
 return v_result;
end
$command$;
grant execute on function public.concepts_command(jsonb) to authenticated,service_role;
