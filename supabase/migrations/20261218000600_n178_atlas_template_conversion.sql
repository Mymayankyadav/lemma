-- Keep the existing note/proposal transport enums valid. Typed v3 metadata is additive.
alter table public.notes add column atlas_kind text check(atlas_kind in ('definition','theorem','why','example','counterexample','proof','skeleton','technique','other'));

-- 11 §4 per-KC card limits (mirror of cards.ts cardLimit; a test compares them).
create function public.atlas_card_limit(kind text,tier text,confusable boolean,canonical boolean) returns int
language sql immutable set search_path='' as $fn$
 select case when tier='venture' then 0
  when kind='definition' then case when tier='core' and coalesce(confusable,false) then 2 else 1 end
  when kind='result' then case when tier='core' then 2 else 1 end
  when kind='example' then case when tier='core' and coalesce(canonical,false) then 1 else 0 end
  when kind='technique' then case when tier='core' then 1 else 0 end
  else 0 end $fn$;
revoke all on function public.atlas_card_limit(text,text,boolean,boolean) from public,anon,authenticated;

-- The same structural rules guard a template proposal and a conversion at approval (the TypeScript validator at drafting time is not trusted).
create function public.atlas_check_template_cp(cp jsonb) returns void
language plpgsql immutable set search_path='' as $fn$
declare kc_row jsonb;card_row jsonb;
begin
  if cp->>'kind' not in ('learn','milestone') or cp->>'tier' not in ('core','standard','venture') or not public.lemma_valid_steps(cp->'steps') then raise exception 'Invalid template checkpoint';end if;
 if coalesce(jsonb_array_length(cp->'kcs'),0) not between 1 and 6 then raise exception 'Template checkpoint needs 1-6 KCs';end if;
 if coalesce((cp->>'estimate')::numeric,0)<=0 or (cp->>'estimate')::numeric>2400 then raise exception 'Template checkpoint needs a sensible estimate';end if;
 if cp->'criterion'->>'kind' is distinct from 'holdout' or coalesce((cp->'criterion'->>'novel')::boolean,false) is not true or jsonb_array_length(coalesce(cp->'criterion'->'cued','[]'))>0 then raise exception 'Criterion must be an uncued novel holdout';end if;
 if coalesce(jsonb_array_length(cp->'practice'),0) not between 3 and 6 then raise exception 'Template checkpoint needs 3-6 practice items';end if;
 if coalesce(jsonb_array_length(cp->'close'->'questions'),0)<>3 then raise exception 'Close needs three recall questions';end if;
 -- Cards: few and structural. Each belongs to one of the checkpoint's KCs, respects that KC's limit, uses an allowed facet, answers in at most three lines, never "list all".
 for kc_row in select jsonb_array_elements(coalesce(cp->'kcs','[]')) loop
  if (select count(*) from jsonb_array_elements(coalesce(cp->'card_plan','[]')) x where x->>'concept_id'=kc_row->>'id')>public.atlas_card_limit(kc_row->>'kind',cp->>'tier',(kc_row->>'confusable')::boolean,(kc_row->>'canonical')::boolean) then raise exception 'Card limit exceeded for %',kc_row->>'id';end if;
 end loop;
 for card_row in select jsonb_array_elements(coalesce(cp->'card_plan','[]')) loop
  if not exists(select 1 from jsonb_array_elements(cp->'kcs') k2 where k2->>'id'=card_row->>'concept_id') then raise exception 'Card names a KC outside its checkpoint';end if;
  if card_row->>'facet' not in ('recall','understand','select') then raise exception 'Card facet must be recall, understand or select';end if;
  if coalesce(array_length(regexp_split_to_array(coalesce(card_row->>'back',''),E'\n'),1),0)>3 then raise exception 'Answer exceeds three lines';end if;
  if coalesce(card_row->>'front','') ~* '\mlist all\M' then raise exception 'No list-all cards';end if;
 end loop;
 end $fn$;
revoke all on function public.atlas_check_template_cp(jsonb) from public,anon,authenticated;

-- A conversion names its KCs by a local key (kcs[].id, falling back to the name); a template CP's kcs[].id is such a key or an existing concept id.
create function public.atlas_resolve_kc(u uuid,kcmap jsonb,k text) returns uuid
language plpgsql stable security definer set search_path='' as $fn$
declare r uuid;
begin
 if kcmap?k then return (kcmap->>k)::uuid;end if;
 begin select id into r from public.concepts where user_id=u and id=k::uuid;exception when invalid_text_representation then r:=null;end;
 if r is null then raise exception 'Unknown KC %',k;end if;
 return r;
end $fn$;
revoke all on function public.atlas_resolve_kc(uuid,jsonb,text) from public,anon,authenticated;

create function public.atlas_apply_approved_plan() returns trigger
language plpgsql security definer set search_path='' as $fn$
declare cp jsonb;c jsonb;k jsonb;kk jsonb;m jsonb;pre text;oldcp public.checkpoints;newid uuid;cid uuid;nid uuid;nextpos int;nextcode int;value jsonb;
 subj uuid;kcmap jsonb:='{}';cpmap jsonb:='{}';replaced uuid[]:='{}';key text;home uuid;kc_kind text;touched uuid[]:='{}';
begin
 if new.status<>'approved' or old.status='approved' then return new;end if;
 if new.payload?'atlas_template' then
  for cp in select jsonb_array_elements(new.payload->'atlas_template'->'checkpoints') loop
   if exists(select 1 from public.settings where user_id=new.user_id and atlas_migrated_at is not null) then perform public.atlas_check_template_cp(cp);end if;
   update public.checkpoints set template=cp where user_id=new.user_id and project_id=new.project_id and code=cp->>'id';
  end loop;
 end if;
 if not new.payload?'atlas_conversion' then return new;end if;
 value:=new.payload->'atlas_conversion';
 if value->>'schema' is distinct from 'plan_template_v1' then raise exception 'Invalid conversion schema';end if;
 if jsonb_typeof(value->'checkpoints')<>'array' or jsonb_typeof(value->'map')<>'object' or jsonb_typeof(value->'cards')<>'array' or jsonb_typeof(coalesce(value->'kcs','[]'))<>'array' then raise exception 'Conversion requires checkpoints, map, kcs and cards';end if;
 select subject_id into subj from public.projects where id=new.project_id and user_id=new.user_id;
 -- Approval-time structure checks on every template checkpoint (the draft-time TypeScript validator is not trusted).
 for cp in select jsonb_array_elements(value->'checkpoints') loop
  perform public.atlas_check_template_cp(cp);
 end loop;
 -- Knowledge components: reuse by id or by name, otherwise create. Existing KC kinds are never overwritten.
 for k in select jsonb_array_elements(coalesce(value->'kcs','[]')) loop
  key:=coalesce(nullif(k->>'id',''),k->>'name');
  if key is null or nullif(k->>'name','') is null then raise exception 'KC needs a name';end if;
  kc_kind:=coalesce(k->>'kind','topic');
  if kc_kind not in ('topic','definition','result','example','technique','heuristic','control','theme','notation') then raise exception 'Invalid KC kind %',kc_kind;end if;
  if nullif(k->>'concept_id','') is not null then
   select id into cid from public.concepts where user_id=new.user_id and id=(k->>'concept_id')::uuid;
   if cid is null then raise exception 'Unknown concept %',k->>'concept_id';end if;
  else
   select id into cid from public.concepts where user_id=new.user_id and subject_id=subj and lower(name)=lower(k->>'name') order by created_at limit 1;
   if cid is null then
    cid:=public.lemma_ensure_concept(new.user_id,subj,left(k->>'name',60));
    update public.concepts set kind=kc_kind where id=cid and user_id=new.user_id;
    home:=null;
    if nullif(k->>'home','') is not null then
     begin select id into home from public.concepts where user_id=new.user_id and id=(k->>'home')::uuid;exception when invalid_text_representation then home:=null;end;
     if home is null then select id into home from public.concepts where user_id=new.user_id and subject_id=subj and lower(name)=lower(k->>'home') and id<>cid limit 1;end if;
     if home is not null then update public.concepts set parent_id=home where id=cid and user_id=new.user_id and parent_id is null;end if;
    end if;
   end if;
  end if;
  kcmap:=kcmap||jsonb_build_object(key,cid::text);
 end loop;
 -- Verify preservation at approval time as well as at drafting time.
 for oldcp in select * from public.checkpoints where user_id=new.user_id and project_id=new.project_id for update loop
  m:=value->'map'->oldcp.id::text;
  if m is null then raise exception 'Conversion omits checkpoint %',oldcp.id;end if;
  if oldcp.status='demonstrated' then
   if coalesce((m->>'skipped')::boolean,false) or m->>'id' is distinct from oldcp.id::text then raise exception 'Done checkpoint cannot change';end if;
   select x into cp from jsonb_array_elements(value->'checkpoints') x where x->>'id'=oldcp.id::text;
   if cp is null or cp->>'title' is distinct from oldcp.title or cp->>'objective' is distinct from oldcp.objective or cp->'steps' is distinct from oldcp.steps then raise exception 'Done checkpoint must be preserved';end if;
  elsif coalesce((m->>'skipped')::boolean,false) then
   if nullif(m->>'reason','') is null then raise exception 'Skip needs a reason';end if;
   if oldcp.kind='cards' and m->>'reason'<>'template:cards-in-close' then raise exception 'Cards CP must move to Close';end if;
   update public.checkpoints set plan_state='skipped',deferred_reason=m->>'reason' where id=oldcp.id and user_id=new.user_id;
   replaced:=replaced||oldcp.id;
  elsif m->>'id' is distinct from oldcp.id::text then
   -- Mapped onto a different template checkpoint: that checkpoint is created below and the old one steps aside, keeping its history.
   if not exists(select 1 from jsonb_array_elements(value->'checkpoints') x where x->>'id'=m->>'id') then raise exception 'Mapping target missing for %',oldcp.id;end if;
   update public.checkpoints set plan_state='skipped',deferred_reason='template:replaced' where id=oldcp.id and user_id=new.user_id;
   replaced:=replaced||oldcp.id;
  end if;
 end loop;
 for cp in select jsonb_array_elements(value->'checkpoints') loop
  select id into newid from public.checkpoints where user_id=new.user_id and project_id=new.project_id and id::text=cp->>'id';
  if newid is not null then
   if (select status from public.checkpoints where id=newid)<>'demonstrated' then
    update public.checkpoints set template=cp,title=cp->>'title',objective=cp->>'objective',criterion=cp->'criterion'->>'text',steps=cp->'steps',tier=cp->>'tier',estimate_minutes=(cp->>'estimate')::int
     where id=newid and user_id=new.user_id;
    touched:=touched||newid;
   end if;
  else
   select coalesce(max(position),0)+1,coalesce(max(nullif(regexp_replace(code,'[^0-9]','','g'),'')::int),0)+1 into nextpos,nextcode from public.checkpoints where project_id=new.project_id;
   insert into public.checkpoints(user_id,project_id,code,position,title,objective,criterion,steps,kind,tier,estimate_minutes,template)
    values(new.user_id,new.project_id,'CP'||nextcode,nextpos,cp->>'title',cp->>'objective',cp->'criterion'->>'text',cp->'steps',cp->>'kind',cp->>'tier',(cp->>'estimate')::int,cp) returning id into newid;
   touched:=touched||newid;
  end if;
  cpmap:=cpmap||jsonb_build_object(cp->>'id',newid::text);
  if newid=any(touched) then
   for kk in select jsonb_array_elements(cp->'kcs') loop
    insert into public.checkpoint_concepts(user_id,checkpoint_id,concept_id) values(new.user_id,newid,public.atlas_resolve_kc(new.user_id,kcmap,kk->>'id')) on conflict do nothing;
   end loop;
  end if;
 end loop;
 -- Prerequisites: rewritten for every checkpoint this approval created or changed; done checkpoints keep theirs. Edges to replaced checkpoints are dropped.
 for cp in select jsonb_array_elements(value->'checkpoints') loop
  newid:=(cpmap->>(cp->>'id'))::uuid;
  continue when not newid=any(touched);
  delete from public.checkpoint_prereqs where user_id=new.user_id and checkpoint_id=newid;
  for pre in select jsonb_array_elements_text(coalesce(cp->'prereqs','[]')) loop
   if not cpmap?pre then raise exception 'Unknown prerequisite %',pre;end if;
   if (cpmap->>pre)::uuid<>newid then insert into public.checkpoint_prereqs(user_id,checkpoint_id,prereq_id) values(new.user_id,newid,(cpmap->>pre)::uuid) on conflict do nothing;end if;
  end loop;
 end loop;
 delete from public.checkpoint_prereqs where user_id=new.user_id and prereq_id=any(replaced);
 if exists(
  with recursive walk(start,node,path) as (
   select checkpoint_id,prereq_id,array[checkpoint_id] from public.checkpoint_prereqs where user_id=new.user_id and checkpoint_id in(select id from public.checkpoints where project_id=new.project_id)
   union all select w.start,p.prereq_id,w.path||w.node from walk w join public.checkpoint_prereqs p on p.checkpoint_id=w.node and p.user_id=new.user_id where not w.node=any(w.path)
  ) select 1 from walk where node=start) then raise exception 'Prerequisites contain a cycle';end if;
 -- Every reviewed or active card needs a decision; nothing is dropped silently.
 if exists(select 1 from public.notes n where n.user_id=new.user_id and n.project_id=new.project_id and n.status<>'deleted'
   and not exists(select 1 from jsonb_array_elements(value->'cards') x where x->>'id'=n.id::text)) then raise exception 'Missing card decision';end if;
 for c in select jsonb_array_elements(value->'cards') loop
  if c->>'action'='new' then
   insert into public.notes(user_id,project_id,front,back,kind,type,origin,atlas_kind)
    values(new.user_id,new.project_id,c->>'front',coalesce(c->>'back',''),case when c->>'kind'='skeleton' then 'proof' when c->>'kind'='technique' then 'other' else coalesce(c->>'kind','other') end,'basic','other',coalesce(c->>'kind','other')) returning id into nid;
   perform public.lemma_reconcile_cards(new.user_id,nid);
  else
   if not exists(select 1 from public.notes where user_id=new.user_id and project_id=new.project_id and id::text=c->>'id') then raise exception 'Unknown conversion card';end if;
   if c->>'action'='delete' then
    if exists(select 1 from public.cards where user_id=new.user_id and note_id::text=c->>'id' and reps>0) then raise exception 'Reviewed card cannot be deleted';end if;
    -- Even unreviewed cards are archived, retaining references and allowing exact undo.
    update public.notes set status='deleted' where user_id=new.user_id and id::text=c->>'id';
   elsif c->>'action'='suspend' then update public.notes set status='suspended' where user_id=new.user_id and id::text=c->>'id';
   elsif c->>'action'='revise' then update public.notes set front=coalesce(c->>'front',front),back=coalesce(c->>'back',back) where user_id=new.user_id and id::text=c->>'id';
   elsif c->>'action'<>'keep' then raise exception 'Invalid card conversion action';end if;
  end if;
 end loop;
 return new;
end $fn$;
create trigger atlas_apply_approved_plan after update of status on public.proposals for each row execute function public.atlas_apply_approved_plan();

create function public.atlas_conversion_command(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $fn$
declare u uuid:=auth.uid();op text:=p->>'operation';patch jsonb:=p->'patch';pr uuid;project_id uuid;receipt jsonb;opid uuid:=(p->>'operationId')::uuid;action_no bigint;
begin
 if u is null then raise exception 'Authentication required';end if;
 if opid is null or p->>'schemaVersion' is distinct from '1' then raise exception 'Invalid command envelope';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text||':'||opid::text,0));
 select result into receipt from public.command_receipts where user_id=u and operation_id=opid;
 if found then if receipt->'_request'=p then return receipt-'_request';else raise exception 'Operation conflict';end if;end if;
 if coalesce(current_setting('role',true),'')<>'service_role' then perform set_config('lemma.source','app',true);perform set_config('lemma.tool','atlas_conversion',true);end if;
 perform set_config('lemma.summary','Atlas conversion '||coalesce(op,''),true);
 if op='create' then
  if coalesce(current_setting('role',true),'')<>'service_role' then raise exception 'Tutor creates conversion drafts';end if;
  project_id:=(patch->>'project_id')::uuid;
  if not exists(select 1 from public.projects where id=project_id and user_id=u) then raise exception 'Project not found';end if;
  if patch->'conversion'->>'schema' is distinct from 'plan_template_v1' then raise exception 'Template conversion required';end if;
  insert into public.proposals(user_id,project_id,kind,payload,origin,reason) values(u,project_id,'plan_change',jsonb_build_object('ops','[]'::jsonb,'atlas_conversion',patch->'conversion'),'other','Atlas course conversion') returning id into pr;
 elsif op in ('approve','reject') then
  pr:=(p->'target'->>'id')::uuid;
  if not exists(select 1 from public.proposals where id=pr and user_id=u and payload?'atlas_conversion' and status='pending' and version=(p->>'expectedVersion')::int) then raise exception 'Conversion missing or version conflict';end if;
  if op='approve' then perform public.approve_proposal(pr);else perform public.reject_proposal(pr);end if;
 else raise exception 'Unsupported conversion operation';end if;
 select no into action_no from public.actions where user_id=u and txid=txid_current();
 receipt:=jsonb_build_object('operationId',opid,'status','ok','actionNo',action_no,'changed',jsonb_build_array(jsonb_build_object('resource','proposals','id',pr)));
 insert into public.command_receipts(user_id,operation_id,resource,result) values(u,opid,'plan_conversions',receipt||jsonb_build_object('_request',p));return receipt;
end $fn$;
revoke all on function public.atlas_conversion_command(jsonb) from public,anon;
grant execute on function public.atlas_conversion_command(jsonb) to authenticated,service_role;
insert into public.lemma_command_resources(resource,command_fn,mcp_ok,"schema") values('plan_conversions','atlas_conversion_command',true,'{"operations":["create","approve","reject"],"fields":["project_id","conversion"]}');
