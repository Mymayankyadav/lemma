-- N181: Atlas v3 attempts follow their session event, as evidence already does (lemma_evidence_follow_event).
-- Voiding an event voids the attempts and instruction events written from it. Correcting an event (insert new + supersede
-- old) re-states each live attempt on the new event: an exact copy (stages and tags kept) when the outcome and hint level
-- are unchanged, otherwise an attempt carrying the corrected outcome (legacy_outcome, one tag per concept and facet,
-- no stage), so the model reads what the correction says. Every write is journalled in the correction's action
-- (attempts, attempt_tags and instruction_events are undo tables), so undo of the correction restores the attempts.
-- Additive: one new function and one new trigger; no existing row, function or policy changes.
create function public.atlas_attempts_follow_event() returns trigger
language plpgsql security definer set search_path='' as $follow$
declare v_new public.session_events%rowtype;a record;v_out text;v_id bigint;v_same boolean;
begin
 -- Before Atlas v3 (or after its rollback) there are no attempts to follow.
 if pg_catalog.to_regclass('public.attempts') is null then return null;end if;
 if new.voided_at is not null and old.voided_at is null then
  update public.attempts set voided_at=new.voided_at
   where user_id=new.user_id and session_event_id=new.id and voided_at is null;
  update public.instruction_events set voided_at=new.voided_at
   where user_id=new.user_id and voided_at is null and source_key like 'event:'||new.id||':%';
 elsif new.superseded_by is not null and old.superseded_by is null then
  select * into v_new from public.session_events where id=new.superseded_by and user_id=new.user_id;
  v_out:=case v_new.outcome when 'demonstrated' then 'pass' when 'partial' then 'partial' when 'failed' then 'fail' end;
  v_same:=v_new.outcome is not distinct from old.outcome and v_new.hint_level is not distinct from old.hint_level;
  for a in select * from public.attempts where user_id=new.user_id and session_event_id=new.id and voided_at is null and superseded_by is null order by id loop
   update public.attempts set voided_at=pg_catalog.clock_timestamp() where id=a.id;
   v_id:=null;
   if v_same then
    insert into public.attempts(user_id,occurred_at,session_id,session_event_id,project_id,checkpoint_id,item_id,item_kind,cued,context,
      confidence_before,minutes,furthest_stage,legacy_outcome,plan_score,grader,origin,weight)
     values(a.user_id,coalesce(v_new.occurred_at,v_new.created_at),a.session_id,v_new.id,a.project_id,a.checkpoint_id,a.item_id,a.item_kind,a.cued,
      a.context-'save_key'||pg_catalog.jsonb_build_object('corrected_from',a.id),a.confidence_before,a.minutes,a.furthest_stage,a.legacy_outcome,a.plan_score,a.grader,a.origin,a.weight)
     returning id into v_id;
    insert into public.attempt_tags(user_id,attempt_id,concept_id,facet,role,stage,result,hint_level,demand,error_tag,confidence)
     select user_id,v_id,concept_id,facet,role,stage,result,hint_level,demand,error_tag,confidence from public.attempt_tags where user_id=a.user_id and attempt_id=a.id order by id;
   elsif v_out is not null and v_new.kind in ('pretest','attempt','evidence','recheck','explanation') then
    insert into public.attempts(user_id,occurred_at,session_id,session_event_id,project_id,checkpoint_id,item_id,item_kind,cued,context,
      confidence_before,minutes,furthest_stage,legacy_outcome,plan_score,grader,origin,weight)
     values(a.user_id,coalesce(v_new.occurred_at,v_new.created_at),a.session_id,v_new.id,a.project_id,a.checkpoint_id,a.item_id,a.item_kind,a.cued,
      a.context-'save_key'||pg_catalog.jsonb_build_object('corrected_from',a.id),a.confidence_before,a.minutes,null,v_out,null,a.grader,a.origin,a.weight)
     returning id into v_id;
    -- One tag per concept and facet (the strongest role); concepts the attempt never reached stay out.
    insert into public.attempt_tags(user_id,attempt_id,concept_id,facet,role,stage,result,hint_level,demand,error_tag,confidence)
     select distinct on (concept_id,facet) user_id,v_id,concept_id,facet,role,null,null,coalesce(v_new.hint_level,0),demand,null,confidence
      from public.attempt_tags where user_id=a.user_id and attempt_id=a.id and result is distinct from 'not_reached'
      order by concept_id,facet,case role when 'target' then 0 when 'required' then 1 else 2 end,id;
   end if;
   if v_id is not null then update public.attempts set superseded_by=v_id where id=a.id;end if;
  end loop;
 end if;
 return null;
end
$follow$;
revoke all on function public.atlas_attempts_follow_event() from public,anon,authenticated;
create trigger atlas_attempts_follow after update of voided_at,superseded_by on public.session_events
 for each row execute function public.atlas_attempts_follow_event();
