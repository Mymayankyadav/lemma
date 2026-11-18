-- Export post-cutover attempts and undo conversion approvals before running this manual rollback.
drop trigger if exists atlas_evidence_frozen on public.evidence;
drop trigger if exists atlas_apply_approved_plan on public.proposals;
drop function if exists public.atlas_freeze_evidence();
drop function if exists public.atlas_apply_approved_plan();
drop function if exists public.atlas_conversion_command(jsonb);
drop function if exists public.atlas_v2_activate(jsonb);
drop function if exists public.atlas_v2_migrate(jsonb);
drop function if exists public.atlas_command(jsonb);
-- N170: save_progress also registers the item a tutor poses (flag items). Text is fingerprinted by the connector (`fp`), so the
-- same question asked again, in any subject, is one item. Everything else is unchanged.
-- Replaces function: public.save_progress(uuid,uuid,uuid,jsonb), same signature and grants.
create or replace function public.save_progress(p_user_id uuid,p_project_id uuid,p_session_id uuid,p_payload jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
 session_row public.sessions; checkpoint_row public.checkpoints; event_row jsonb; event_checkpoint uuid;
 owner_settings public.settings; today date; new_level int; next_days int; event_count int:=0; next_step int;
 v_flag boolean; v_event_id bigint; v_concept uuid; v_level text; v_ekind text; v_conf real; v_cands int; v_subject uuid; v_recall boolean; v_minutes numeric; v_items boolean; v_item uuid;
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
 v_flag:=public.lemma_flag(p_user_id,'recheck_v2'); v_items:=public.lemma_flag(p_user_id,'items');
 if p_payload ? 'events' and (jsonb_typeof(p_payload->'events') is distinct from 'array' or jsonb_array_length(p_payload->'events')>10) then raise exception 'At most 10 events are allowed'; end if;
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
  if event_row ? 'checkpoint' then
   select id into event_checkpoint from public.checkpoints where code=event_row->>'checkpoint' and project_id=p_project_id and user_id=p_user_id;
   if not found then raise exception 'Unknown checkpoint: %',event_row->>'checkpoint'; end if;
  else event_checkpoint:=session_row.checkpoint_id; end if;
  -- Revalidate the session checkpoint as well; UUID ownership alone is insufficient.
  if event_checkpoint is not null then
   select * into checkpoint_row from public.checkpoints where id=event_checkpoint and project_id=p_project_id and user_id=p_user_id for update;
   if not found then raise exception 'Checkpoint does not belong to the session project'; end if;
  elsif event_row->>'kind' in ('evidence','recheck') and not v_flag then raise exception 'Evidence and rechecks need a checkpoint'; end if;
  insert into public.session_events(user_id,session_id,checkpoint_id,kind,body,outcome,hint_level)
   values(p_user_id,p_session_id,event_checkpoint,event_row->>'kind',event_row->>'text',event_row->>'outcome',(event_row->>'hint_level')::smallint)
   returning id into v_event_id;
  event_count:=event_count+1;
  -- N169: a graded event with an outcome is also one evidence row (never invented: a concept that cannot be resolved stays NULL).
  if v_flag and event_row->>'kind' in ('pretest','attempt','evidence','recheck','explanation') and event_row->>'outcome' is not null then
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
   if v_items and jsonb_typeof(event_row->'item')='string' and jsonb_typeof(event_row->'fp')='string' and char_length(event_row->>'fp') between 3 and 40 then
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
     jsonb_strip_nulls(jsonb_build_object('minutes_into_session',round(v_minutes),'local_hour',extract(hour from (now() at time zone owner_settings.time_zone)),'item',left(event_row->>'item',200),'fp',event_row->>'fp')));
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

drop function if exists public.atlas_store_attempt(uuid,uuid,uuid,uuid,bigint,jsonb);
delete from public.lemma_command_resources where resource in ('atlas_links','atlas_concepts','atlas_settings','instruction_events','plan_conversions');
delete from public.lemma_undo_tables where table_name in ('attempts','attempt_tags','instruction_events','atlas_links');
drop table public.attempt_tags,public.instruction_events,public.atlas_links,public.model_fits;
drop table public.attempts;
drop function public.atlas_attempt_append_only();
alter table public.concepts drop constraint concepts_family_owner_fk,drop column kind,drop column family_id;
alter table public.items drop constraint items_checkpoint_owner_fk,drop column cued,drop column item_kind,drop column b_sd,drop column est_minutes,drop column checkpoint_id;
alter table public.settings drop column atlas,drop column atlas_migrated_at;
alter table public.checkpoints drop column template;
alter table public.notes drop column facet,drop column atlas_kind;
alter table public.scheduler_runs drop column p_all,drop column p_core;
