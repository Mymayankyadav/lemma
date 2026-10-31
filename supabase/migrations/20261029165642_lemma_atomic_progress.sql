-- CONTRACT #220: all connector progress changes commit or roll back together.
create function public.save_progress(p_user_id uuid,p_project_id uuid,p_session_id uuid,p_payload jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
 session_row public.sessions; checkpoint_row public.checkpoints; event_row jsonb; event_checkpoint uuid;
 owner_settings public.settings; today date; new_level int; next_days int; event_count int:=0; next_step int;
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
  if jsonb_typeof(event_row->'text') is distinct from 'string' or char_length(event_row->>'text') not between 1 and 600 then raise exception 'Event text must be 1 to 600 characters'; end if;
  if event_row ? 'checkpoint' then
   select id into event_checkpoint from public.checkpoints where code=event_row->>'checkpoint' and project_id=p_project_id and user_id=p_user_id;
   if not found then raise exception 'Unknown checkpoint: %',event_row->>'checkpoint'; end if;
  else event_checkpoint:=session_row.checkpoint_id; end if;
  -- Revalidate the session checkpoint as well; UUID ownership alone is insufficient.
  if event_checkpoint is not null then
   select * into checkpoint_row from public.checkpoints where id=event_checkpoint and project_id=p_project_id and user_id=p_user_id for update;
   if not found then raise exception 'Checkpoint does not belong to the session project'; end if;
  elsif event_row->>'kind' in ('evidence','recheck') then raise exception 'Evidence and rechecks need a checkpoint'; end if;
  insert into public.session_events(user_id,session_id,checkpoint_id,kind,body,outcome,hint_level)
   values(p_user_id,p_session_id,event_checkpoint,event_row->>'kind',event_row->>'text',event_row->>'outcome',(event_row->>'hint_level')::smallint);
  event_count:=event_count+1;
  if event_row->>'kind'='evidence' and event_row->>'outcome'='demonstrated' then
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
revoke execute on function public.save_progress(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.save_progress(uuid,uuid,uuid,jsonb) to service_role;
