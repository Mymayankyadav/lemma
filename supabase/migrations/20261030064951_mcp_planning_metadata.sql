-- Persist optional DB-3 metadata through the existing owner-scoped approval path.
-- CREATE OR REPLACE retains signatures, invoker security and existing grants.
create or replace function public.lemma_add_checkpoint(owner uuid,project uuid,payload jsonb,sort_position real,assigned_code text) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare result uuid; source uuid;
begin
 if payload ? 'source' then
  select id into source from public.sources where user_id=owner and project_id=project and short=payload->>'source';
  if not found then raise exception 'Unknown source: %',payload->>'source'; end if;
 end if;
 insert into public.checkpoints(user_id,project_id,code,position,title,objective,criterion,steps,pages,source_id,recheck_prompt,stage)
 values(owner,project,assigned_code,sort_position,payload->>'title',payload->>'objective',payload->>'criterion',payload->'steps',payload->>'pages',source,payload->>'recheck_prompt',payload->>'stage')
 returning id into result;
 return result;
end $$;

create or replace function public.approve_proposal(p_id uuid,p_edit jsonb default null) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
 p public.proposals; project_row public.projects; payload jsonb; item jsonb; related_item jsonb; operation jsonb;
 c public.checkpoints; note public.notes; target uuid; concept uuid; related uuid; source uuid; cp uuid;
 new_code text; value text; next_code int; letter int; idx int:=0; count_concepts int:=0; approval_result jsonb;
 resolved bigint[]; sort_position real;
begin
 select * into p from public.proposals where id=p_id for update;
 if not found then raise exception 'Proposal not found'; end if;
 if p.status<>'pending' then raise exception 'Proposal is not pending'; end if;
 select * into strict project_row from public.projects where id=p.project_id and user_id=p.user_id for update;
 payload:=p.payload;
 if p.kind='card' then
  if p_edit is not null then
   if jsonb_typeof(p_edit)<>'object' or exists(select 1 from jsonb_object_keys(p_edit) k where k not in ('front','back','type')) then raise exception 'Only front, back and type may be edited'; end if;
   payload:=payload || p_edit;
  end if;
  if payload ? 'checkpoint' then
   select id into cp from public.checkpoints where user_id=p.user_id and project_id=p.project_id and code=payload->>'checkpoint';
   if not found then raise exception 'Unknown checkpoint: %',payload->>'checkpoint'; end if;
  end if;
  if payload ? 'source' then
   select id into source from public.sources where user_id=p.user_id and project_id=p.project_id and short=payload->>'source';
   if not found then raise exception 'Unknown source: %',payload->>'source'; end if;
  end if;
  if payload ? 'concept' then concept:=public.lemma_ensure_concept(p.user_id,project_row.subject_id,payload->>'concept'); end if;
  insert into public.notes(user_id,project_id,checkpoint_id,session_id,concept_id,source_id,page_label,kind,type,front,back,tags,origin)
   values(p.user_id,p.project_id,cp,p.session_id,concept,source,payload->>'page',coalesce(payload->>'kind','other'),coalesce(payload->>'type','basic'),
    payload->>'front',coalesce(payload->>'back',''),array(select jsonb_array_elements_text(coalesce(payload->'tags','[]'))),p.origin)
   returning * into note;
  perform public.lemma_reconcile_cards(p.user_id,note.id);
  approval_result:=jsonb_build_object('note_no',note.no);
 elsif p.kind='card_edit' then
  select * into note from public.notes where no=(payload->>'note_no')::bigint and user_id=p.user_id and project_id=p.project_id for update;
  if not found then raise exception 'Note not found'; end if;
  update public.notes set front=case when payload ? 'front' then payload->>'front' else front end,
   back=case when payload ? 'back' then payload->>'back' else back end,
   type=case when payload ? 'type' then payload->>'type' else type end where id=note.id and user_id=p.user_id;
  perform public.lemma_reconcile_cards(p.user_id,note.id);
  with changed as (
   update public.card_comments set status='addressed',resolved_at=now(),resolved_by_proposal=p.id
    where user_id=p.user_id and note_id=note.id and no in (select resolved_no::bigint from jsonb_array_elements_text(coalesce(payload->'resolves','[]')) as ids(resolved_no))
    returning no
  ) select coalesce(array_agg(no order by no),'{}'::bigint[]) into resolved from changed;
  approval_result:=jsonb_build_object('note_no',note.no,'resolved',to_jsonb(resolved));
 elsif p.kind='plan' then
  if exists(select 1 from public.checkpoints where project_id=p.project_id and user_id=p.user_id) then raise exception 'This project already has a plan; propose changes instead'; end if;
  if jsonb_typeof(payload->'checkpoints') is distinct from 'array' or jsonb_array_length(payload->'checkpoints')=0 then raise exception 'A plan needs checkpoints'; end if;
  for item in select jsonb_array_elements(coalesce(payload->'concepts','[]')) loop
   concept:=public.lemma_ensure_concept(p.user_id,project_row.subject_id,item->>'name',item->>'blurb');
   if item ? 'topic' then
    update public.concepts set topic=item->>'topic' where id=concept and user_id=p.user_id;
   end if;
   count_concepts:=count_concepts+1;
   for value in select jsonb_array_elements_text(coalesce(item->'prereqs','[]')) loop
    related:=public.lemma_ensure_concept(p.user_id,project_row.subject_id,value);
    insert into public.concept_links(user_id,from_id,to_id,kind) values(p.user_id,related,concept,'prereq') on conflict do nothing;
   end loop;
   for value in select jsonb_array_elements_text(coalesce(item->'related','[]')) loop
    related:=public.lemma_ensure_concept(p.user_id,project_row.subject_id,value);
    insert into public.concept_links(user_id,from_id,to_id,kind) values(p.user_id,concept,related,'related') on conflict do nothing;
   end loop;
  end loop;
  for item in select jsonb_array_elements(payload->'checkpoints') loop
   idx:=idx+1;
   cp:=public.lemma_add_checkpoint(p.user_id,p.project_id,item,idx*10,coalesce(item->>'code','CP'||idx));
  end loop;
  idx:=0;
  for item in select jsonb_array_elements(payload->'checkpoints') loop
   idx:=idx+1;
   select id into strict cp from public.checkpoints where project_id=p.project_id and user_id=p.user_id and code=coalesce(item->>'code','CP'||idx);
   perform public.lemma_link_checkpoint(p.user_id,p.project_id,cp,item);
  end loop;
  update public.projects set status='active' where id=p.project_id and user_id=p.user_id;
  approval_result:=jsonb_build_object('checkpoints',idx,'concepts',count_concepts);
 elsif p.kind='plan_change' then
  if jsonb_typeof(payload->'ops') is distinct from 'array' then raise exception 'Plan changes need an ops array'; end if;
  for operation in select jsonb_array_elements(payload->'ops') loop
   if operation->>'op'='add' then
    new_code:=operation->>'code';
    if new_code is null and operation ? 'after' then
     for letter in 97..122 loop
      new_code:=substring(operation->>'after' from '^CP[0-9]+')||chr(letter);
      exit when not exists(select 1 from public.checkpoints where user_id=p.user_id and project_id=p.project_id and code=new_code);
      new_code:=null;
     end loop;
     if new_code is null then raise exception 'No free checkpoint suffix'; end if;
    elsif new_code is null then
     select coalesce(max((substring(code from '^CP([0-9]+)'))::int),0)+1 into next_code from public.checkpoints where project_id=p.project_id and user_id=p.user_id;
     new_code:='CP'||next_code;
    end if;
    sort_position:=public.lemma_plan_position(p.user_id,p.project_id,operation->>'after');
    cp:=public.lemma_add_checkpoint(p.user_id,p.project_id,operation,sort_position,new_code);
    perform public.lemma_link_checkpoint(p.user_id,p.project_id,cp,operation);
   else
    select * into c from public.checkpoints where user_id=p.user_id and project_id=p.project_id and code=operation->>'code' for update;
    if not found then raise exception 'Unknown checkpoint: %',operation->>'code'; end if;
    case operation->>'op'
     when 'update' then
      update public.checkpoints set
       stage=case when operation ? 'stage' then operation->>'stage' else stage end,
       title=case when operation ? 'title' then operation->>'title' else title end,
       objective=case when operation ? 'objective' then operation->>'objective' else objective end,
       criterion=case when operation ? 'criterion' then operation->>'criterion' else criterion end,
       steps=case when operation ? 'steps' then operation->'steps' else steps end,
       current_step=case when operation ? 'steps' then least(current_step,jsonb_array_length(operation->'steps')) else current_step end,
       pages=case when operation ? 'pages' then operation->>'pages' else pages end,
       recheck_prompt=case when operation ? 'recheck_prompt' then operation->>'recheck_prompt' else recheck_prompt end,
       needs_revisit=needs_revisit or (status='demonstrated' and operation ? 'criterion' and criterion is distinct from operation->>'criterion')
      where id=c.id and user_id=p.user_id;
     when 'remove' then
      if c.status<>'not_started' or exists(select 1 from public.session_events where user_id=p.user_id and checkpoint_id=c.id)
       or exists(select 1 from public.notes where user_id=p.user_id and checkpoint_id=c.id) then raise exception 'Only an untouched checkpoint can be removed'; end if;
      delete from public.checkpoints where id=c.id and user_id=p.user_id;
     when 'move' then
      if not (operation ? 'after') then raise exception 'A move needs an insertion point'; end if;
      sort_position:=public.lemma_plan_position(p.user_id,p.project_id,operation->>'after',c.id);
      update public.checkpoints set position=sort_position where id=c.id and user_id=p.user_id;
     when 'prereq_add', 'prereq_remove' then
      select id into related from public.checkpoints where user_id=p.user_id and project_id=p.project_id and code=operation->>'prereq';
      if not found then raise exception 'Unknown prerequisite: %',operation->>'prereq'; end if;
      if operation->>'op'='prereq_add' then
       insert into public.checkpoint_prereqs(user_id,checkpoint_id,prereq_id) values(p.user_id,c.id,related) on conflict do nothing;
      else delete from public.checkpoint_prereqs where user_id=p.user_id and checkpoint_id=c.id and prereq_id=related; end if;
     else raise exception 'Unknown plan operation: %',operation->>'op';
    end case;
   end if;
   idx:=idx+1;
  end loop;
  approval_result:=jsonb_build_object('applied',idx);
 end if;
 if p.kind in ('plan','plan_change') and exists(
  with recursive walk as (
   select e.checkpoint_id,e.prereq_id,array[e.checkpoint_id,e.prereq_id] path,false cycle
   from public.checkpoint_prereqs e join public.checkpoints checkpoint_row on checkpoint_row.id=e.checkpoint_id and checkpoint_row.user_id=e.user_id
   where e.user_id=p.user_id and checkpoint_row.project_id=p.project_id
   union all
   select w.checkpoint_id,e.prereq_id,w.path||e.prereq_id,e.prereq_id=any(w.path)
   from walk w join public.checkpoint_prereqs e on e.checkpoint_id=w.prereq_id and e.user_id=p.user_id where not w.cycle
  ) select 1 from walk where cycle
 ) then raise exception 'Checkpoint prerequisites must not contain a cycle'; end if;
 update public.proposals set status='approved',decided_at=now(),result=approval_result where id=p.id and user_id=p.user_id;
 return approval_result;
end $$;

