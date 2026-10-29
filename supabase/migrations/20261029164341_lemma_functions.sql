-- DB-1 data.md §5: transactional API and internal invoker helpers.
create function public.bootstrap() returns public.settings
language plpgsql security invoker set search_path = '' as $$
declare owner uuid := auth.uid(); result public.settings;
begin
 if owner is null then raise exception 'Sign in before initializing Lemma'; end if;
 insert into public.settings(user_id) values(owner) on conflict(user_id) do nothing;
 insert into public.styles(user_id,key,name,icon,instructions,position) values
 (owner,'socratic','Socratic','circle-help','Lead with questions. Reveal one idea at a time. Let the student do the reasoning and respond to their attempt before adding anything.',0),
 (owner,'examples','Examples first','list','Show one fully worked example, then a similar problem with steps faded, then one unaided. Fade support as accuracy rises.',1),
 (owner,'proof_lab','Proof workshop','pencil-line','The student drafts proofs; critique line by line. Name the gap and ask for the fix; never rewrite the proof for them.',2),
 (owner,'quiz','Quick quiz','zap','Rapid retrieval: short questions mixed from this and earlier checkpoints, immediate feedback, one-line explanations.',3),
 (owner,'visual','Visual','eye','Build intuition first with pictures in words, concrete examples and counterexamples, then formalize.',4),
 (owner,'lecture','Short lecture','book-open','Explain the idea in at most 150 words with one example, then check understanding with one question before moving on.',5)
 on conflict(user_id,key) do nothing;
 select * into strict result from public.settings where user_id=owner;
 return result;
end $$;

create function public.record_review(p_card uuid,p_rating int,p_confidence text,p_duration_ms int,p_next jsonb) returns bigint
language plpgsql security invoker set search_path = '' as $$
declare c public.cards; result bigint; previous jsonb;
begin
 select * into c from public.cards where id=p_card for update;
 if not found then raise exception 'Card not found'; end if;
 if jsonb_typeof(p_next) is distinct from 'object' or not (p_next ?& array['state','due','stability','difficulty','last_review','step','reps','lapses']) then
  raise exception 'A complete next card state is required';
 end if;
 previous := jsonb_build_object('state',c.state,'due',c.due,'stability',c.stability,'difficulty',c.difficulty,'last_review',c.last_review,'step',c.step,'reps',c.reps,'lapses',c.lapses);
 insert into public.reviews(user_id,card_id,rating,state_before,confidence,duration_ms,prev)
 values(c.user_id,c.id,p_rating,c.state,p_confidence,p_duration_ms,previous) returning id into result;
 update public.cards set state=(p_next->>'state')::smallint,due=(p_next->>'due')::timestamptz,
  stability=(p_next->>'stability')::real,difficulty=(p_next->>'difficulty')::real,last_review=(p_next->>'last_review')::timestamptz,
  step=(p_next->>'step')::int,reps=(p_next->>'reps')::int,lapses=(p_next->>'lapses')::int
 where id=c.id and user_id=c.user_id;
 return result;
end $$;

create function public.undo_review(p_review bigint) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare r public.reviews; c uuid; newest bigint;
begin
 select card_id into c from public.reviews where id=p_review;
 if not found then raise exception 'Review not found'; end if;
 -- Same lock order as record_review: card first, then review.
 perform 1 from public.cards where id=c for update;
 select * into r from public.reviews where id=p_review for update;
 select id into newest from public.reviews where card_id=c and user_id=r.user_id and undone_at is null order by id desc limit 1;
 if r.undone_at is not null or newest is distinct from r.id then raise exception 'Only the last answer can be undone'; end if;
 update public.cards set state=(r.prev->>'state')::smallint,due=(r.prev->>'due')::timestamptz,
  stability=(r.prev->>'stability')::real,difficulty=(r.prev->>'difficulty')::real,last_review=(r.prev->>'last_review')::timestamptz,
  step=(r.prev->>'step')::int,reps=(r.prev->>'reps')::int,lapses=(r.prev->>'lapses')::int where id=c and user_id=r.user_id;
 update public.reviews set undone_at=now() where id=r.id and user_id=r.user_id;
 return r.prev;
end $$;

create function public.lemma_slug(value text) returns text
language sql immutable security invoker set search_path = '' as $$
 select coalesce(nullif(trim(both '-' from regexp_replace(lower(value),'[^a-z0-9]+','-','g')),''),'concept')
$$;

create function public.lemma_ensure_concept(owner uuid,subject uuid,title text,description text default null) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare result uuid;
begin
 insert into public.concepts(user_id,subject_id,slug,name,blurb) values(owner,subject,public.lemma_slug(title),title,description)
 on conflict(user_id,subject_id,slug) do update set blurb=coalesce(excluded.blurb,concepts.blurb)
 returning id into result;
 return result;
end $$;

create function public.lemma_reconcile_cards(owner uuid,note uuid) returns void
language plpgsql security invoker set search_path = '' as $$
declare n public.notes; ordinals int[];
begin
 select * into strict n from public.notes where id=note and user_id=owner for update;
 if n.type='reverse' then ordinals:=array[1,2];
 elsif n.type='cloze' then
  select array_agg(distinct (m[1])::int order by (m[1])::int) into ordinals from regexp_matches(n.front,'\{\{c([1-9][0-9]*)::','g') m;
 else ordinals:=array[1]; end if;
 ordinals:=coalesce(ordinals,array[1]);
 delete from public.cards where note_id=note and user_id=owner and not(ord=any(ordinals));
 insert into public.cards(user_id,note_id,ord) select owner,note,unnest(ordinals) on conflict(note_id,ord) do nothing;
end $$;

create function public.lemma_add_checkpoint(owner uuid,project uuid,payload jsonb,sort_position real,assigned_code text) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare result uuid; source uuid;
begin
 if payload ? 'source' then
  select id into source from public.sources where user_id=owner and project_id=project and short=payload->>'source';
  if not found then raise exception 'Unknown source: %',payload->>'source'; end if;
 end if;
 insert into public.checkpoints(user_id,project_id,code,position,title,objective,criterion,steps,pages,source_id,recheck_prompt)
 values(owner,project,assigned_code,sort_position,payload->>'title',payload->>'objective',payload->>'criterion',payload->'steps',payload->>'pages',source,payload->>'recheck_prompt')
 returning id into result;
 return result;
end $$;

create function public.lemma_link_checkpoint(owner uuid,project uuid,checkpoint uuid,payload jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
declare subject uuid; value text; related uuid;
begin
 select subject_id into strict subject from public.projects where id=project and user_id=owner;
 for value in select jsonb_array_elements_text(coalesce(payload->'prereqs','[]')) loop
  select id into related from public.checkpoints where user_id=owner and project_id=project and code=value;
  if not found then raise exception 'Unknown prerequisite: %',value; end if;
  insert into public.checkpoint_prereqs(user_id,checkpoint_id,prereq_id) values(owner,checkpoint,related) on conflict do nothing;
 end loop;
 for value in select jsonb_array_elements_text(coalesce(payload->'concepts','[]')) loop
  related:=public.lemma_ensure_concept(owner,subject,value);
  insert into public.checkpoint_concepts(user_id,checkpoint_id,concept_id) values(owner,checkpoint,related) on conflict do nothing;
 end loop;
end $$;

create function public.lemma_plan_position(owner uuid,project uuid,after_code text,moving uuid default null) returns real
language plpgsql security invoker set search_path = '' as $$
declare before_pos real; after_pos real;
begin
 if after_code is null then
  select coalesce(max(position),0)+10 into before_pos from public.checkpoints where user_id=owner and project_id=project and id is distinct from moving;
  return before_pos;
 end if;
 select position into before_pos from public.checkpoints where user_id=owner and project_id=project and code=after_code and id is distinct from moving;
 if not found then raise exception 'Unknown insertion point: %',after_code; end if;
 select min(position) into after_pos from public.checkpoints where user_id=owner and project_id=project and position>before_pos and id is distinct from moving;
 if after_pos is null then return before_pos+10; end if;
 if after_pos-before_pos<0.001 then
  -- Preserve order when repeated midpoint inserts exhaust real precision.
  with ranked as (select id,row_number() over(order by position,code)*10 as pos from public.checkpoints where user_id=owner and project_id=project)
  update public.checkpoints c set position=r.pos from ranked r where c.id=r.id and c.user_id=owner;
  return public.lemma_plan_position(owner,project,after_code,moving);
 end if;
 return (before_pos+after_pos)/2;
end $$;

create function public.approve_proposal(p_id uuid,p_edit jsonb default null) returns jsonb
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

create function public.reject_proposal(p_id uuid) returns void
language plpgsql security invoker set search_path = '' as $$
begin
 update public.proposals set status='rejected',decided_at=now() where id=p_id and status='pending';
 if not found then raise exception 'Proposal not found or not pending'; end if;
end $$;

create function public.ping() returns timestamptz
language sql security definer set search_path = '' as $$ select now() $$;

create view public.v_due_cards with(security_invoker=true) as
 select c.user_id,c.id as card_id,n.id as note_id,n.no as note_no,c.ord,n.project_id,n.checkpoint_id,n.session_id,c.state,c.due
 from public.cards c join public.notes n on n.id=c.note_id and n.user_id=c.user_id where n.status='active';
revoke all on public.v_due_cards from public,anon;
grant select on public.v_due_cards to authenticated,service_role;
revoke execute on all functions in schema public from public,anon;
grant execute on all functions in schema public to authenticated,service_role;
grant execute on function public.ping() to anon;
