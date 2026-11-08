-- N105.1: owner-bound Atlas graph command, one audited action per write.
-- The existing concepts and link triggers provide action journal/undo storage.
create function public.lemma_concept_prereq_cycle_guard() returns trigger
language plpgsql security invoker set search_path='' as $guard$
declare cycle_found boolean;
begin
 if new.kind<>'prereq' then return new; end if;
 if new.from_id=new.to_id then
  raise exception 'Atlas prerequisite cannot link a concept to itself';end if;
 with recursive reach(id,path) as (
  select new.to_id,array[new.to_id]
  union all
  select e.to_id,r.path||e.to_id
  from reach r join public.concept_links e
   on e.from_id=r.id and e.user_id=new.user_id and e.kind='prereq'
  where not e.to_id=any(r.path)
 )
 select exists(select 1 from reach where id=new.from_id) into cycle_found;
 if cycle_found then raise exception 'Atlas prerequisite would create a dependency cycle';end if;
 return new;
end
$guard$;
revoke all on function public.lemma_concept_prereq_cycle_guard() from public,anon;
create trigger concepts_prerequisite_acyclic before insert or update on public.concept_links
 for each row execute function public.lemma_concept_prereq_cycle_guard();

create function public.concepts_command(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $command$
declare
 v_owner uuid:=(select auth.uid());
 v_role text:=pg_catalog.current_setting('role',true);
 v_op text;v_op_id uuid;v_target jsonb;v_patch jsonb;
 v_id uuid;v_other_id uuid;v_expected integer;v_keep_version integer;
 v_concept public.concepts%rowtype;v_other public.concepts%rowtype;
 v_after public.concepts%rowtype;v_edge record;
 v_bad text;v_previous jsonb;v_result jsonb;v_impact jsonb;
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
  if v_op='preview_merge' then
   return pg_catalog.jsonb_build_object('status','ok','operationId',v_op_id,
     'actionNo',null,'changed','[]'::jsonb,'impact',v_impact,
     'sourceVersion',v_concept.version,'keepVersion',v_other.version);
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
revoke all on function public.concepts_command(jsonb) from public,anon;
grant execute on function public.concepts_command(jsonb) to authenticated,service_role;
insert into public.lemma_command_resources(resource,command_fn,mcp_ok,"schema")
 values('concepts','concepts_command',true,
 '{"operations":["create","update","reparent","link","unlink","preview_merge","merge"],
   "fields":["subject_id","name","blurb","parent_id","slug","other_id","kind","keep_id","keep_version"]}'::jsonb);
