-- N246: validated exam context travels through both legacy and versioned progress.
alter table public.session_events add column learning_context jsonb
 check (learning_context is null or jsonb_typeof(learning_context)='object');
alter table public.exam_attempts add column evidence_id bigint,
 add constraint exam_attempt_evidence_owner_fk foreign key(user_id,evidence_id)
  references public.evidence(user_id,id) on delete set null (evidence_id) deferrable;
create index exam_attempts_evidence_fk on public.exam_attempts(user_id,evidence_id) where evidence_id is not null;
create index evidence_exam_delivery on public.evidence
  (user_id,project_id,(ctx->>'sittingId'),(ctx->>'rowKey'),(ctx->>'deliveryRef'),id desc)
  where ctx->>'mode'='exam' and voided_at is null;

create function public.lemma_exam_event_context(p_owner uuid,p_project uuid,p jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare sitting uuid; row_key text; delivery_ref text;
begin
 if p is null then return '{}'::jsonb; end if;
 if jsonb_typeof(p) is distinct from 'object'
    or (p-array['sitting','row','delivery_ref','criterion_met'])<>'{}'::jsonb
    or jsonb_typeof(p->'sitting') is distinct from 'string'
    or jsonb_typeof(p->'row') is distinct from 'string'
    or not coalesce((p->>'row') ~ '^[a-z0-9][a-z0-9_-]{0,39}$',false)
    or (p?'delivery_ref' and (jsonb_typeof(p->'delivery_ref') is distinct from 'string'
       or length(btrim(p->>'delivery_ref')) not between 1 and 200))
    or (p?'criterion_met' and jsonb_typeof(p->'criterion_met') is distinct from 'boolean') then
  raise exception 'exam needs a sitting UUID, blueprint row key, and optional delivery_ref and criterion_met' using errcode='22023';
 end if;
 sitting:=public.lemma_exam_uuid(p,'sitting');
 row_key:=p->>'row';
 delivery_ref:=btrim(p->>'delivery_ref');
 if not exists(select 1 from public.exam_sittings s where s.user_id=p_owner and s.project_id=p_project and s.id=sitting
   and s.blueprint @> jsonb_build_array(jsonb_build_object('key',row_key))) then
  raise exception 'Exam sitting or blueprint row not found in this project' using errcode='22023';
 end if;
 return jsonb_strip_nulls(jsonb_build_object('mode','exam','sittingId',sitting,'rowKey',row_key,'deliveryRef',delivery_ref));
end
$$;
revoke all on function public.lemma_exam_event_context(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.lemma_exam_event_context(uuid,uuid,jsonb) to service_role;

-- The Atlas writer still owns Atlas attempts. A service-written exam mirror
-- has a matching event/owner/project and exists for the exam and history views.
create or replace function public.atlas_freeze_evidence() returns trigger
language plpgsql security invoker set search_path='' as $freeze$
declare undoing boolean:=pg_catalog.current_setting('lemma.tool',true)='undo'
 and current_user not in ('anon','authenticated','service_role');
begin
 if pg_catalog.pg_trigger_depth()>1 then
  if TG_OP='DELETE' then return old; end if;
  return new;
 end if;
 if TG_OP='DELETE' and pg_catalog.current_setting('role',true)='service_role' then
  if public.lemma_evidence_purge_active(old.user_id) then return old; end if;
 end if;
 if exists(select 1 from public.settings where user_id=coalesce(new.user_id,old.user_id) and atlas_migrated_at is not null) then
  if TG_OP='DELETE' and undoing and old.ctx->>'mode'='exam' then return old; end if;
  if TG_OP='INSERT' and (pg_catalog.current_setting('role',true)='service_role' or undoing) and new.ctx->>'mode'='exam'
    and new.origin='tutor' and exists(select 1 from public.session_events e join public.sessions s on s.id=e.session_id
       where e.id=new.session_event_id and e.user_id=new.user_id and s.user_id=new.user_id
         and s.project_id=new.project_id and e.session_id=new.session_id)
    and (undoing or public.lemma_exam_event_context(new.user_id,new.project_id,jsonb_strip_nulls(jsonb_build_object(
      'sitting',new.ctx->>'sittingId','row',new.ctx->>'rowKey','delivery_ref',new.ctx->>'deliveryRef')))=
      (select jsonb_object_agg(key,value) from jsonb_each(new.ctx) where key in ('mode','sittingId','rowKey','deliveryRef'))) then
   return new;
  end if;
  raise exception 'Evidence is frozen after Atlas cutover';
 end if;
 if TG_OP='DELETE' then return old; end if;
 return new;
end
$freeze$;

create function public.lemma_exam_find_evidence(p_owner uuid,p_project uuid,p_sitting uuid,p_row text,p_delivery text)
returns bigint language sql stable security definer set search_path='' as $$
 select e.id from public.evidence e
 where e.user_id=p_owner and e.project_id=p_project and e.ctx->>'mode'='exam' and e.voided_at is null
  and e.ctx->>'sittingId'=p_sitting::text and e.ctx->>'rowKey'=p_row and e.ctx->>'deliveryRef'=p_delivery
 order by e.id desc limit 1
$$;
revoke all on function public.lemma_exam_find_evidence(uuid,uuid,uuid,text,text) from public,anon,authenticated,service_role;
create function public.lemma_exam_attempt_evidence() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.delivery_ref is not null then
  perform pg_advisory_xact_lock(hashtextextended('exam-evidence:'||
   jsonb_build_array(new.user_id,new.sitting_id,new.row_key,new.delivery_ref)::text,0));
 end if;
 new.evidence_id:=public.lemma_exam_find_evidence(new.user_id,new.project_id,new.sitting_id,new.row_key,new.delivery_ref);
 return new;
end
$$;
revoke all on function public.lemma_exam_attempt_evidence() from public,anon,authenticated,service_role;
create trigger exam_attempt_find_evidence before insert or update of delivery_ref on public.exam_attempts
 for each row execute function public.lemma_exam_attempt_evidence();

create function public.lemma_exam_evidence_follow() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.ctx->>'mode'='exam' and new.ctx->>'deliveryRef' is not null and new.voided_at is null then
  perform pg_advisory_xact_lock(hashtextextended('exam-evidence:'||
   jsonb_build_array(new.user_id,new.ctx->>'sittingId',new.ctx->>'rowKey',new.ctx->>'deliveryRef')::text,0));
  update public.exam_attempts a set evidence_id=new.id
   where a.user_id=new.user_id and a.project_id=new.project_id and a.sitting_id=(new.ctx->>'sittingId')::uuid
    and a.row_key=new.ctx->>'rowKey' and a.delivery_ref=new.ctx->>'deliveryRef'
    and (a.evidence_id is null or exists(select 1 from public.evidence e where e.id=a.evidence_id and e.voided_at is not null));
 end if;
 return null;
end
$$;
revoke all on function public.lemma_exam_evidence_follow() from public,anon,authenticated,service_role;
create trigger exam_evidence_follow after insert on public.evidence
 for each row execute function public.lemma_exam_evidence_follow();

-- Same signature, grants, ordinary event behavior and output as N173.
create or replace function public.save_progress(p_user_id uuid,p_project_id uuid,p_session_id uuid,p_payload jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
 session_row public.sessions; checkpoint_row public.checkpoints; event_row jsonb; event_checkpoint uuid;
 owner_settings public.settings; today date; new_level int; next_days int; event_count int:=0; next_step int;
 exam_ctx jsonb; learning_ctx jsonb;
 v_flag boolean; v_event_id bigint; v_concept uuid; v_level text; v_ekind text; v_conf real; v_cands int; v_subject uuid; v_recall boolean; v_minutes numeric; v_items boolean; v_item uuid; v_atlas boolean;
begin
 if p_user_id is null then raise exception 'Owner is required'; end if;
 if auth.uid() is not null and auth.uid() is distinct from p_user_id then raise exception 'Owner mismatch'; end if;
 if jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'Progress must be an object'; end if;
 if exists(select 1 from jsonb_object_keys(p_payload) field where field not in ('step','events','misconception','resolved','next_question')) then raise exception 'Unknown progress field'; end if;
 perform 1 from public.projects where id=p_project_id and user_id=p_user_id for update;
 if not found then raise exception 'Project not found for owner'; end if;
 select * into session_row from public.sessions where id=p_session_id and project_id=p_project_id and user_id=p_user_id for update;
 if not found then raise exception 'Session not found for project and owner'; end if;
 if session_row.state<>'open' then raise exception 'Session is already ended'; end if;
 select * into strict owner_settings from public.settings where user_id=p_user_id;
 today:=((now() at time zone owner_settings.time_zone)-make_interval(hours=>owner_settings.rollover_hour))::date;
 v_atlas:=owner_settings.atlas_migrated_at is not null;
 v_flag:=v_atlas or public.lemma_flag(p_user_id,'recheck_v2'); v_items:=public.lemma_flag(p_user_id,'items');
 if p_payload ? 'events' and (jsonb_typeof(p_payload->'events') is distinct from 'array' or jsonb_array_length(p_payload->'events')>10) then raise exception 'At most 10 events are allowed'; end if;
 -- Only a structured attempt needs the migration; `concepts` on an explanation is ignored until then (the legacy writer never read it), so a save is never lost to it.
 if not v_atlas and exists(select 1 from jsonb_array_elements(coalesce(p_payload->'events','[]')) x where jsonb_typeof(x)='object' and x?'attempt') then raise exception 'Atlas v2 not migrated';end if;
 if p_payload ? 'step' then
  if jsonb_typeof(p_payload->'step') is distinct from 'number' or (p_payload->>'step') !~ '^[1-8]$' then raise exception 'Step must be an integer from 1 to 8'; end if;
  next_step:=(p_payload->>'step')::int;
  select * into checkpoint_row from public.checkpoints where id=session_row.checkpoint_id and project_id=p_project_id and user_id=p_user_id for update;
  if not found then raise exception 'A step needs the session checkpoint'; end if;
  if next_step>jsonb_array_length(checkpoint_row.steps) then raise exception 'Step exceeds checkpoint length'; end if;
  update public.checkpoints set current_step=next_step where id=checkpoint_row.id and user_id=p_user_id;
 end if;
 for event_row in select jsonb_array_elements(coalesce(p_payload->'events','[]')) loop
  if jsonb_typeof(event_row) is distinct from 'object' or (event_row->>'kind') is null or event_row->>'kind' not in ('pretest','attempt','hint','explanation','evidence','recheck','note') then raise exception 'Invalid event kind'; end if;
  if event_row ? 'level' and event_row->>'level' not in ('recall','use','understand','transfer') then raise exception 'Invalid level'; end if;
  if event_row ? 'role' and event_row->>'role' not in ('primary','secondary','used') then raise exception 'Invalid role'; end if;
  if event_row ? 'novelty' and event_row->>'novelty' not in ('novel','familiar','seen_solution','self_reported') then raise exception 'Invalid novelty'; end if;
  if event_row ? 'recall' and jsonb_typeof(event_row->'recall') is distinct from 'boolean' then raise exception 'recall must be true or false'; end if;
  if event_row ? 'concept' and (jsonb_typeof(event_row->'concept') is distinct from 'string' or char_length(event_row->>'concept') not between 1 and 60) then raise exception 'Invalid concept'; end if;
  if jsonb_typeof(event_row->'text') is distinct from 'string' or char_length(event_row->>'text') not between 1 and 600 then raise exception 'Event text must be 1 to 600 characters'; end if;
  exam_ctx:='{}';
  if event_row?'exam' then
   exam_ctx:=public.lemma_exam_event_context(p_user_id,p_project_id,event_row->'exam');
  end if;
  if exam_ctx<>'{}' and event_row->>'kind'='evidence' and event_row->>'outcome'='demonstrated'
     and event_row#>'{exam,criterion_met}' is distinct from 'true'::jsonb then
   raise exception 'An exam probe does not demonstrate a checkpoint; record an attempt or explicitly confirm criterion_met' using errcode='22023';
  end if;
  if event_row ? 'checkpoint' then
   select id into event_checkpoint from public.checkpoints where code=event_row->>'checkpoint' and project_id=p_project_id and user_id=p_user_id;
   if not found then raise exception 'Unknown checkpoint: %',event_row->>'checkpoint'; end if;
  else event_checkpoint:=session_row.checkpoint_id; end if;
  -- Revalidate the session checkpoint as well; UUID ownership alone is insufficient.
  if event_checkpoint is not null then
   select * into checkpoint_row from public.checkpoints where id=event_checkpoint and project_id=p_project_id and user_id=p_user_id for update;
   if not found then raise exception 'Checkpoint does not belong to the session project'; end if;
  elsif event_row->>'kind' in ('evidence','recheck') and not v_flag then raise exception 'Evidence and rechecks need a checkpoint'; end if;
  learning_ctx:=case when exam_ctx<>'{}' then exam_ctx
    when event_row->>'outcome' is not null and event_row->>'kind' in ('pretest','attempt','evidence','recheck','explanation')
      then '{"mode":"study"}'::jsonb end;
  if learning_ctx is not null then
   learning_ctx:=learning_ctx||jsonb_strip_nulls(jsonb_build_object('novelty',event_row->>'novelty'));
  end if;
  insert into public.session_events(user_id,session_id,checkpoint_id,kind,body,outcome,hint_level,learning_context)
   values(p_user_id,p_session_id,event_checkpoint,event_row->>'kind',event_row->>'text',event_row->>'outcome',
    (event_row->>'hint_level')::smallint,learning_ctx)
   returning id into v_event_id;
  event_count:=event_count+1;
  -- N169: a graded event with an outcome is also one evidence row (never invented: a concept that cannot be resolved stays NULL).
  if v_atlas then
   perform public.atlas_store_attempt(p_user_id,p_project_id,p_session_id,event_checkpoint,v_event_id,event_row);
  end if;
  if ((v_flag and not v_atlas) or exam_ctx<>'{}') and event_row->>'kind' in ('pretest','attempt','evidence','recheck','explanation') and event_row->>'outcome' is not null then
   v_recall:=coalesce((event_row->>'recall')::boolean,false); v_concept:=null; v_conf:=1;
   select p.subject_id into v_subject from public.projects p where p.id=p_project_id and p.user_id=p_user_id;
   if event_row ? 'concept' then
    select c.id into v_concept from public.concepts c where c.user_id=p_user_id and (c.id::text=event_row->>'concept' or c.slug=event_row->>'concept')
     order by (c.subject_id is not distinct from v_subject) desc,c.id limit 1;
    if v_concept is null then raise exception 'Unknown concept: %',event_row->>'concept'; end if;
   elsif event_checkpoint is not null then
    select count(*) into v_cands from public.checkpoint_concepts cc where cc.user_id=p_user_id and cc.checkpoint_id=event_checkpoint;
    if v_cands=1 then
     select cc.concept_id into v_concept from public.checkpoint_concepts cc where cc.user_id=p_user_id and cc.checkpoint_id=event_checkpoint; v_conf:=0.7;
    end if;
   end if;
   v_level:=coalesce(event_row->>'level',case when v_recall or event_row->>'kind'='pretest' then 'recall'
     when event_row->>'kind'='explanation' then 'understand' else 'use' end);
   v_ekind:=case when v_recall then 'recall' else event_row->>'kind' end;
   v_minutes:=extract(epoch from (now()-session_row.started_at))/60;
   v_item:=null;
   if v_items and not v_atlas and jsonb_typeof(event_row->'item')='string' and jsonb_typeof(event_row->'fp')='string' and char_length(event_row->>'fp') between 3 and 40 then
    insert into public.items(user_id,origin,text,concept_tags,fingerprint,created_by)
     values(p_user_id,'tutor_generated',left(event_row->>'item',2000),
      case when v_concept is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object('concept_id',v_concept,'level',v_level,'role',coalesce(event_row->>'role','primary'))) end,
      event_row->>'fp','tutor')
     on conflict(user_id,fingerprint) do update set fingerprint=excluded.fingerprint returning id into v_item;
   end if;
   insert into public.evidence(user_id,occurred_at,session_id,session_event_id,project_id,checkpoint_id,concept_id,item_id,level,role,outcome,hint_level,novelty,kind,origin,confidence,ctx)
    values(p_user_id,now(),p_session_id,v_event_id,p_project_id,event_checkpoint,v_concept,v_item,v_level,coalesce(event_row->>'role','primary'),
     case event_row->>'outcome' when 'demonstrated' then 'pass' when 'failed' then 'fail' else 'partial' end,
     coalesce((event_row->>'hint_level')::smallint,0),coalesce(event_row->>'novelty','novel'),v_ekind,'tutor',v_conf,
     jsonb_strip_nulls(jsonb_build_object('minutes_into_session',round(v_minutes),'local_hour',extract(hour from (now() at time zone owner_settings.time_zone)),'item',left(event_row->>'item',200),'fp',event_row->>'fp'))||exam_ctx);
  end if;
  if event_row->>'kind'='evidence' and event_row->>'outcome'='demonstrated' and v_flag then
   -- recheck_v2: demonstrating a checkpoint never schedules a recheck; only evidence does.
   update public.checkpoints set status='demonstrated',demonstrated_at=now(),current_step=jsonb_array_length(steps),self_reported=false
    where id=event_checkpoint and user_id=p_user_id;
  elsif v_flag then
   null;
  elsif event_row->>'kind'='evidence' and event_row->>'outcome'='demonstrated' then
   update public.checkpoints set status='demonstrated',demonstrated_at=now(),current_step=jsonb_array_length(steps),
    recheck_level=0,recheck_due=today+3,needs_revisit=false where id=event_checkpoint and user_id=p_user_id;
  elsif event_row->>'kind'='recheck' then
   if checkpoint_row.status<>'demonstrated' then raise exception 'Only demonstrated checkpoints can be rechecked'; end if;
   if event_row->>'outcome'='demonstrated' then
    new_level:=least(4,checkpoint_row.recheck_level+1);
    next_days:=case new_level when 1 then 10 when 2 then 30 when 3 then 90 else null end;
    update public.checkpoints set recheck_level=new_level,recheck_due=today+next_days where id=event_checkpoint and user_id=p_user_id;
   elsif event_row->>'outcome' in ('partial','failed') then
    update public.checkpoints set needs_revisit=true,recheck_level=0,recheck_due=today+1 where id=event_checkpoint and user_id=p_user_id;
   else raise exception 'A recheck needs an outcome'; end if;
  end if;
 end loop;
 if p_payload ? 'misconception' then
  if jsonb_typeof(p_payload->'misconception') is distinct from 'string' or char_length(p_payload->>'misconception') not between 1 and 120 then raise exception 'Misconception must be 1 to 120 characters'; end if;
  insert into public.misconceptions(user_id,project_id,label) values(p_user_id,p_project_id,p_payload->>'misconception')
   on conflict(project_id,(lower(label))) do update set times=misconceptions.times+1,last_seen_at=now(),resolved_at=null;
  insert into public.session_events(user_id,session_id,checkpoint_id,kind,body)
   values(p_user_id,p_session_id,session_row.checkpoint_id,'misconception',p_payload->>'misconception');
  event_count:=event_count+1;
 end if;
 if p_payload ? 'resolved' then
  if jsonb_typeof(p_payload->'resolved') is distinct from 'string' or char_length(p_payload->>'resolved') not between 1 and 120 then raise exception 'Resolved label must be 1 to 120 characters'; end if;
  update public.misconceptions set resolved_at=now() where user_id=p_user_id and project_id=p_project_id and lower(label)=lower(p_payload->>'resolved');
 end if;
 if p_payload ? 'next_question' and (jsonb_typeof(p_payload->'next_question') is distinct from 'string' or char_length(p_payload->>'next_question')>300) then raise exception 'Next question must be at most 300 characters'; end if;
 update public.sessions set resume_step=coalesce(next_step,resume_step),resume_question=case when p_payload ? 'next_question' then p_payload->>'next_question' else resume_question end,
  last_activity_at=now() where id=p_session_id and project_id=p_project_id and user_id=p_user_id;
 update public.projects set last_activity_at=now() where id=p_project_id and user_id=p_user_id;
 return jsonb_build_object('step',coalesce(next_step,session_row.resume_step),'events',event_count);
end $$;

-- Carry mode through the existing correction and void workflow.
create or replace function public.correct_session_event(p jsonb) returns jsonb
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
    outcome,hint_level,occurred_at,actor,correction_reason,learning_context)
   values(v_owner,v_old.session_id,v_old.checkpoint_id,
    coalesce(v_patch->>'kind',v_old.kind),
    coalesce(v_patch->>'body',v_old.body),
    case when v_patch?'outcome' then v_patch->>'outcome' else v_old.outcome end,
    case when v_patch?'hintLevel' then (v_patch->>'hintLevel')::smallint
      else v_old.hint_level end,
    case when v_patch?'occurredAt' then (v_patch->>'occurredAt')::timestamptz
      else coalesce(v_old.occurred_at,v_old.created_at) end,
    v_actor,v_reason,v_old.learning_context)
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
