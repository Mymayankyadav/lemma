-- Keep the existing note/proposal transport enums valid. Typed v3 metadata is additive.
alter table public.notes add column atlas_kind text check(atlas_kind in ('definition','theorem','why','example','counterexample','proof','skeleton','technique','other'));

create function public.atlas_apply_approved_plan() returns trigger
language plpgsql security definer set search_path='' as $fn$
declare cp jsonb;c jsonb;k jsonb;m jsonb;oldcp public.checkpoints;newid uuid;cid uuid;nid uuid;nextpos int;value jsonb;
begin
 if new.status<>'approved' or old.status='approved' then return new;end if;
 if new.payload?'atlas_template' then
  for cp in select jsonb_array_elements(new.payload->'atlas_template'->'checkpoints') loop
   update public.checkpoints set template=cp where user_id=new.user_id and project_id=new.project_id and code=cp->>'id';
  end loop;
 end if;
 if not new.payload?'atlas_conversion' then return new;end if;
 value:=new.payload->'atlas_conversion';
 if value->>'schema' is distinct from 'plan_template_v1' then raise exception 'Invalid conversion schema';end if;
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
  end if;
 end loop;
 for cp in select jsonb_array_elements(value->'checkpoints') loop
  if cp->>'kind' not in ('learn','milestone') or cp->>'tier' not in ('core','standard','venture') or not public.lemma_valid_steps(cp->'steps') then raise exception 'Invalid template checkpoint';end if;
  select id into newid from public.checkpoints where user_id=new.user_id and project_id=new.project_id and id::text=cp->>'id';
  if newid is not null then
   update public.checkpoints set template=cp,title=cp->>'title',objective=cp->>'objective',criterion=cp->'criterion'->>'text',steps=cp->'steps',tier=cp->>'tier',estimate_minutes=(cp->>'estimate')::int
    where id=newid and user_id=new.user_id and status<>'demonstrated';
  else
   select coalesce(max(position),0)+1 into nextpos from public.checkpoints where project_id=new.project_id;
   insert into public.checkpoints(user_id,project_id,code,position,title,objective,criterion,steps,kind,tier,estimate_minutes,template)
    values(new.user_id,new.project_id,'CP'||nextpos,nextpos,cp->>'title',cp->>'objective',cp->'criterion'->>'text',cp->'steps',cp->>'kind',cp->>'tier',(cp->>'estimate')::int,cp) returning id into newid;
  end if;
 end loop;
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
declare u uuid:=auth.uid();op text:=p->>'operation';patch jsonb:=p->'patch';pr uuid;project_id uuid;receipt jsonb;operation_id uuid:=(p->>'operationId')::uuid;action_no bigint;
begin
 if u is null then raise exception 'Authentication required';end if;
 if operation_id is null or p->>'schemaVersion' is distinct from '1' then raise exception 'Invalid command envelope';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text||':'||operation_id::text,0));
 select result into receipt from public.command_receipts where user_id=u and operation_id=atlas_conversion_command.operation_id;
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
 receipt:=jsonb_build_object('operationId',operation_id,'status','ok','actionNo',action_no,'changed',jsonb_build_array(jsonb_build_object('resource','proposals','id',pr)));
 insert into public.command_receipts(user_id,operation_id,resource,result) values(u,operation_id,'plan_conversions',receipt||jsonb_build_object('_request',p));return receipt;
end $fn$;
revoke all on function public.atlas_conversion_command(jsonb) from public,anon;
grant execute on function public.atlas_conversion_command(jsonb) to authenticated,service_role;
insert into public.lemma_command_resources(resource,command_fn,mcp_ok,"schema") values('plan_conversions','atlas_conversion_command',true,'{"operations":["create","approve","reject"],"fields":["project_id","conversion"]}');
