-- Typed attempt writer, called only inside save_progress's existing atomic owner transaction.
create function public.atlas_store_attempt(u uuid,p_project uuid,p_session uuid,p_checkpoint uuid,p_event bigint,e jsonb) returns bigint
language plpgsql security definer set search_path='' as $fn$
declare a jsonb:=coalesce(e->'attempt','{}');st jsonb;t jsonb;cid uuid;i uuid;aid bigint;v_facet text;v_role text;v_kind text;v_outcome text;dedup text;ids uuid[];v_conf real;hint int;
begin
 if coalesce(current_setting('role',true),'')<>'service_role' then raise exception 'Service role required';end if;
 if not exists(select 1 from public.sessions where user_id=u and id=p_session and project_id=p_project and state='open') then raise exception 'Owner session mismatch';end if;
 if not exists(select 1 from public.settings where user_id=u and atlas_migrated_at is not null) then raise exception 'Atlas v2 not migrated';end if;
 if p_checkpoint is not null and not exists(select 1 from public.checkpoints where user_id=u and id=p_checkpoint and project_id=p_project) then raise exception 'Checkpoint ownership mismatch';end if;
 if e->>'kind'='explanation' then
  for t in select value from jsonb_array_elements(coalesce(e->'concepts',case when e?'concept' then jsonb_build_array(e->>'concept') else '[]'::jsonb end)) loop
   select id into cid from public.concepts where user_id=u and (id::text=t#>>'{}' or slug=t#>>'{}');
   if cid is null then raise exception 'Unknown instruction concept';end if;
   insert into public.instruction_events(user_id,occurred_at,session_id,concept_id,origin,source_key) values(u,now(),p_session,cid,'tutor','event:'||p_event||':'||cid);
  end loop;
  if not e?'attempt' then return null;end if;
 end if;
 if not e?'attempt' and (e->>'outcome' is null or e->>'kind' not in ('pretest','attempt','evidence','recheck')) then return null;end if;
 if jsonb_typeof(a)<>'object' then raise exception 'attempt must be an object';end if;
 v_kind:=coalesce(a->>'kind',case e->>'kind' when 'pretest' then 'prepare' when 'recheck' then 'recheck' else 'legacy' end);
 v_outcome:=case e->>'outcome' when 'demonstrated' then 'pass' when 'failed' then 'fail' when 'partial' then 'partial' end;
 ids:=array(select jsonb_array_elements_text(coalesce(a->'cued','[]'))::uuid);
 if exists(select 1 from unnest(ids) x where not exists(select 1 from public.concepts where user_id=u and id=x)) then raise exception 'Unknown cue concept';end if;
 if a?'item' and (a->>'item')~'^[0-9a-fA-F-]{36}$' then
  select id into i from public.items where user_id=u and id=(a->>'item')::uuid;if i is null then raise exception 'Unknown item';end if;
 elsif length(coalesce(a->>'item',e->>'item'))>0 then
  insert into public.items(user_id,origin,text,fingerprint,cued,item_kind,created_by) values(u,'tutor_generated',left(coalesce(a->>'item',e->>'item'),2000),md5(lower(coalesce(a->>'item',e->>'item'))),ids,v_kind,'tutor')
   on conflict(user_id,fingerprint) do update set fingerprint=excluded.fingerprint returning id into i;
 end if;
 -- Same-save duplicates merge inside the transaction; separate saves are independent observations.
 dedup:=md5(jsonb_build_array(txid_current(),p_session,date_trunc('second',now()),case when e?'attempt' then a else e-'text'-'fp' end)::text);
 select id into aid from public.attempts where user_id=u and context->>'save_key'=dedup;
 if aid is not null then return aid;end if;
 insert into public.attempts(user_id,occurred_at,session_id,session_event_id,project_id,checkpoint_id,item_id,item_kind,cued,context,confidence_before,minutes,furthest_stage,legacy_outcome,plan_score,grader,origin,weight)
 values(u,now(),p_session,p_event,p_project,p_checkpoint,i,v_kind,ids,jsonb_build_object('save_key',dedup,'options',a->'options','novelty',coalesce(e->>'novelty','novel')),(a->>'confidence_before')::real,(a->>'minutes')::real,
  a->>'furthest_stage',case when e?'attempt' then null else v_outcome end,(a->>'plan_score')::smallint,'tutor','tutor',case coalesce(e->>'novelty','novel') when 'familiar' then .5 when 'seen_solution' then .2 when 'self_reported' then .2 else 1 end) returning id into aid;
 if e?'attempt' then
  if jsonb_typeof(a->'stages') is distinct from 'array' or jsonb_array_length(a->'stages')>4 then raise exception 'attempt.stages must contain at most four stages';end if;
  for st in select value from jsonb_array_elements(a->'stages') loop
   if st->>'stage' not in ('U','S','E','C') or st->>'result' not in ('ok','fail','not_reached') then raise exception 'Invalid stage';end if;
   if jsonb_typeof(st->'tags') is distinct from 'array' or jsonb_array_length(st->'tags') not between 1 and 12 then raise exception 'Stage needs 1–12 tags';end if;
   hint:=coalesce((st->>'hint')::int,0);if hint not between 0 and 4 then raise exception 'Invalid hint';end if;
   for t in select value from jsonb_array_elements(st->'tags') loop
    select id into cid from public.concepts where user_id=u and (id::text=coalesce(t->>'concept',t->>'concept_id') or slug=coalesce(t->>'concept',t->>'concept_id'));
    if cid is null then raise exception 'Unknown attempt concept';end if;
    v_facet:=t->>'facet';v_role:=coalesce(t->>'role','target');v_conf:=coalesce((t->>'confidence')::real,1);
    insert into public.attempt_tags(user_id,attempt_id,concept_id,facet,role,stage,result,hint_level,error_tag,confidence,demand)
     values(u,aid,cid,v_facet,v_role,st->>'stage',st->>'result',hint,case when st->'error'->>'concept' in (cid::text,t->>'concept') then st->'error'->>'tag' end,v_conf,case when v_role='incidental' then -1 else 0 end);
   end loop;
  end loop;
 else
  select id into cid from public.concepts where user_id=u and (id::text=e->>'concept' or slug=e->>'concept');
  if cid is null and p_checkpoint is not null then select case when count(*)=1 then (array_agg(concept_id))[1] end into cid from public.checkpoint_concepts where user_id=u and checkpoint_id=p_checkpoint;end if;
  if cid is not null then insert into public.attempt_tags(user_id,attempt_id,concept_id,facet,role,hint_level)
   values(u,aid,cid,coalesce(e->>'level',case when e->>'kind'='pretest' then 'recall' else 'use' end),case coalesce(e->>'role','primary') when 'primary' then 'target' when 'secondary' then 'required' else 'incidental' end,coalesce((e->>'hint_level')::smallint,0));end if;
 end if;
 return aid;
end $fn$;
revoke all on function public.atlas_store_attempt(uuid,uuid,uuid,uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.atlas_store_attempt(uuid,uuid,uuid,uuid,bigint,jsonb) to service_role;
