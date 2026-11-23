-- N226: additive Atlas owner command: safe level edits, empty-shell deletion,
-- atomic link reclassification and bounded all-or-nothing graph batches.
-- Does not call a provider LLM or grant direct browser DML.
create function public.atlas_guard_concept_evidence() returns trigger
language plpgsql security invoker set search_path='' as $guard$
begin
 -- Deleting a user/subject cascades from another trigger; this guard targets
 -- standalone Atlas deletions and merges, not account destruction.
 if pg_trigger_depth()>1 then return old;end if;
 if exists(select 1 from public.attempt_tags t where t.user_id=old.user_id and t.concept_id=old.id)
 or exists(select 1 from public.instruction_events t where t.user_id=old.user_id and t.concept_id=old.id)
 or exists(select 1 from public.assumptions t where t.user_id=old.user_id and t.concept_id=old.id)
 or exists(select 1 from public.recheck_decisions t where t.user_id=old.user_id and t.concept_id=old.id)
 or exists(select 1 from public.evidence t where t.user_id=old.user_id and t.concept_id=old.id)
 or exists(select 1 from public.atlas_links t where t.user_id=old.user_id and (t.from_id=old.id or t.to_id=old.id))
 or exists(select 1 from public.concept_aliases t where t.user_id=old.user_id and (t.concept_a=old.id or t.concept_b=old.id))
 or exists(select 1 from public.atlas_practice_bank t where t.user_id=old.user_id and t.concept_id=old.id)
 or exists(select 1 from public.concepts t where t.user_id=old.user_id and t.family_id=old.id)
 or exists(select 1 from public.items t where t.user_id=old.user_id and
   pg_catalog.strpos(t.concept_tags::text,old.id::text)>0)
 then raise exception 'Atlas merge/delete would lose concept evidence or identity; reassign every protected reference first';
 end if;
 return old;
end
$guard$;
revoke all on function public.atlas_guard_concept_evidence() from public,anon;
create trigger atlas_concept_evidence_guard before delete on public.concepts
 for each row execute function public.atlas_guard_concept_evidence();

create function public.atlas_graph_maintenance_command(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $atlas$
declare
 u uuid:=(select auth.uid());
 role_name text:=pg_catalog.current_setting('role',true);
 op text:=p->>'operation';
 opid uuid;
 patch jsonb:=coalesce(p->'patch','{}'::jsonb);
 target_id uuid;
 expected_version integer;
 current_concept public.concepts%rowtype;
 changed_concept public.concepts%rowtype;
 changed_count integer:=0;
 target_ref uuid;
 old_kind text;
 new_kind text;
 level_name text;
 new_rank integer;
 parent_rank integer;
 check_row jsonb;
 seen_ids uuid[]:='{}'::uuid[];
 previous jsonb;
 result jsonb;
 action_no bigint;
 bad_key text;
begin
 if u is null or role_name not in ('authenticated','service_role') then
  raise exception 'Authenticated Atlas owner required';
 end if;
 if p is null or pg_catalog.jsonb_typeof(p) is distinct from 'object'
 or p->>'schemaVersion' is distinct from '1'
 or p->>'resource' is distinct from 'atlas_graph_maintenance'
 or pg_catalog.jsonb_typeof(p->'operationId') is distinct from 'string'
 or pg_catalog.jsonb_typeof(p->'target') is distinct from 'object'
 or pg_catalog.jsonb_typeof(p->'target'->'id') is distinct from 'string'
 or pg_catalog.jsonb_typeof(p->'expectedVersion') is distinct from 'number'
 or pg_catalog.jsonb_typeof(patch) is distinct from 'object' then
  raise exception 'Invalid Atlas maintenance command envelope';
 end if;
 select key into bad_key from pg_catalog.jsonb_object_keys(p) as keys(key)
 where key not in ('operationId','schemaVersion','resource','operation','target','expectedVersion','patch') limit 1;
 if bad_key is not null then raise exception 'Unknown command envelope field %',bad_key;end if;
 select key into bad_key from pg_catalog.jsonb_object_keys(p->'target') as keys(key)
 where key<>'id' limit 1;
 if bad_key is not null then raise exception 'Atlas maintenance target accepts id only';end if;
 if (p->>'expectedVersion') !~ '^[1-9][0-9]*$'
 or (p->>'expectedVersion')::numeric>2147483647 then
  raise exception 'Positive expectedVersion required';
 end if;
 expected_version:=(p->>'expectedVersion')::integer;
 target_id:=(p->'target'->>'id')::uuid;
 opid:=(p->>'operationId')::uuid;
 if op not in ('set_level','delete_empty','reclassify_link','link_batch') then
  raise exception 'Unsupported Atlas maintenance operation';
 end if;
 if op='set_level' then
  select key into bad_key from pg_catalog.jsonb_object_keys(patch) as keys(key) where key<>'level' limit 1;
  if bad_key is not null or (select count(*) from pg_catalog.jsonb_object_keys(patch))<>1
  or pg_catalog.jsonb_typeof(patch->'level') is distinct from 'string' then raise exception 'set_level needs level';end if;
 elsif op='delete_empty' then
  if patch<>'{}'::jsonb then raise exception 'delete_empty accepts no fields';end if;
 elsif op='reclassify_link' then
  select key into bad_key from pg_catalog.jsonb_object_keys(patch) as keys(key)
  where key not in ('to_id','old_kind','new_kind') limit 1;
  if bad_key is not null or (select count(*) from pg_catalog.jsonb_object_keys(patch))<>3
  or pg_catalog.jsonb_typeof(patch->'to_id') is distinct from 'string'
  or pg_catalog.jsonb_typeof(patch->'old_kind') is distinct from 'string'
  or pg_catalog.jsonb_typeof(patch->'new_kind') is distinct from 'string' then
   raise exception 'reclassify_link requires to_id, old_kind, new_kind';end if;
 else
  if (select count(*) from pg_catalog.jsonb_object_keys(patch))<>1
  or pg_catalog.jsonb_typeof(patch->'links') is distinct from 'array'
  or pg_catalog.jsonb_array_length(patch->'links') not between 1 and 50 then
   raise exception 'link_batch requires 1 to 50 links';end if;
 end if;
 -- Existing Atlas commands take the same lock; a concurrent merge or batch
 -- cannot invalidate a checked concept before commit.
 perform pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('atlas-owner:'||u::text,0));
 select r.result into previous from public.command_receipts r
 where r.user_id=u and r.operation_id=opid;
 if found then
  if previous->'_request'=p then return previous-'_request';end if;
  return pg_catalog.jsonb_build_object('operationId',opid,'status','conflict',
   'reason','operationId reused with a different payload',
   'actionNo',null,'changed','[]'::jsonb);
 end if;
 select * into current_concept from public.concepts
 where user_id=u and id=target_id for update;
 if not found then raise exception 'Atlas source concept not found for owner';end if;
 if current_concept.version is distinct from expected_version then
  return pg_catalog.jsonb_build_object('operationId',opid,'status','conflict',
   'reason','Atlas source concept version conflict','currentVersion',current_concept.version,
   'actionNo',null,'changed','[]'::jsonb);
 end if;
 if role_name<>'service_role' then
  perform pg_catalog.set_config('lemma.source','app',true);
  perform pg_catalog.set_config('lemma.tool','atlas_graph_maintenance',true);
 end if;
 perform pg_catalog.set_config('lemma.summary','Atlas graph '||op,true);
 if op='set_level' then
  level_name:=patch->>'level';
  new_rank:=pg_catalog.array_position(array['cluster','galaxy','system','planet','moon'],level_name);
  if new_rank is null then raise exception 'Unknown Atlas level';end if;
  if current_concept.parent_id is not null then
   select pg_catalog.array_position(array['cluster','galaxy','system','planet','moon'],c.level)
   into parent_rank from public.concepts c where c.user_id=u and c.id=current_concept.parent_id;
   if parent_rank is null or parent_rank>=new_rank then
    raise exception 'New Atlas level must be below its parent';end if;
  end if;
  if exists(select 1 from public.concepts c where c.user_id=u and c.parent_id=target_id
   and pg_catalog.array_position(array['cluster','galaxy','system','planet','moon'],c.level)<=new_rank) then
   raise exception 'New Atlas level must remain above its direct children';end if;
  update public.concepts set level=level_name where id=target_id and user_id=u
   returning * into changed_concept;
  changed_count:=1;
 elsif op='delete_empty' then
  if exists(select 1 from public.concepts c where c.user_id=u and (c.parent_id=target_id or c.family_id=target_id))
  or exists(select 1 from public.concept_links l where l.user_id=u and (l.from_id=target_id or l.to_id=target_id))
  or exists(select 1 from public.checkpoint_concepts c where c.user_id=u and c.concept_id=target_id)
  or exists(select 1 from public.notes n where n.user_id=u and n.concept_id=target_id)
  or exists(select 1 from public.misconceptions m where m.user_id=u and m.concept_id=target_id)
  or exists(select 1 from public.practice_topics t where t.user_id=u and t.concept_id=target_id)
  or exists(select 1 from public.evidence e where e.user_id=u and e.concept_id=target_id)
  or exists(select 1 from public.attempt_tags t where t.user_id=u and t.concept_id=target_id)
  or exists(select 1 from public.instruction_events t where t.user_id=u and t.concept_id=target_id)
  or exists(select 1 from public.assumptions t where t.user_id=u and t.concept_id=target_id)
  or exists(select 1 from public.recheck_decisions t where t.user_id=u and t.concept_id=target_id)
  or exists(select 1 from public.atlas_links t where t.user_id=u and (t.from_id=target_id or t.to_id=target_id))
  or exists(select 1 from public.concept_aliases t where t.user_id=u and (t.concept_a=target_id or t.concept_b=target_id))
  or exists(select 1 from public.atlas_practice_bank t where t.user_id=u and t.concept_id=target_id)
  or exists(select 1 from public.items t where t.user_id=u and pg_catalog.strpos(t.concept_tags::text,target_id::text)>0) then
   raise exception 'Cannot delete a referenced Atlas idea; only empty shells can be removed';end if;
  delete from public.concepts where id=target_id and user_id=u;
  if not found then raise exception 'Atlas empty-shell deletion failed';end if;
  changed_count:=1;
 elsif op='reclassify_link' then
  target_ref:=(patch->>'to_id')::uuid;old_kind:=patch->>'old_kind';new_kind:=patch->>'new_kind';
  if target_ref=target_id or old_kind not in ('prereq','related')
    or new_kind not in ('prereq','related') or old_kind=new_kind then
   raise exception 'Invalid Atlas link reclassification';end if;
  if not exists(select 1 from public.concepts c where c.user_id=u and c.id=target_ref) then
   raise exception 'Atlas link target not found for owner';end if;
  update public.concept_links set kind=new_kind
   where user_id=u and from_id=target_id and to_id=target_ref and kind=old_kind;
  if not found then raise exception 'Atlas graph link not found with expected kind';end if;
  update public.concepts set name=name where user_id=u and id=target_id returning * into changed_concept;
  changed_count:=1;
 else
  for check_row in select value from pg_catalog.jsonb_array_elements(patch->'links') loop
   if pg_catalog.jsonb_typeof(check_row) is distinct from 'object'
    or (select count(*) from pg_catalog.jsonb_object_keys(check_row))<>2
    or not (check_row?'to_id' and check_row?'kind')
    or pg_catalog.jsonb_typeof(check_row->'to_id') is distinct from 'string'
    or pg_catalog.jsonb_typeof(check_row->'kind') is distinct from 'string' then
    raise exception 'Each Atlas batch link needs only to_id and kind';end if;
   target_ref:=(check_row->>'to_id')::uuid;new_kind:=check_row->>'kind';
   if new_kind not in ('prereq','related') or target_ref=target_id or target_ref=any(seen_ids)
   then raise exception 'Invalid or duplicate Atlas batch link';end if;
   if not exists(select 1 from public.concepts c where c.user_id=u and c.id=target_ref) then
    raise exception 'Atlas batch target not found for owner';end if;
   seen_ids:=pg_catalog.array_append(seen_ids,target_ref);
   insert into public.concept_links(user_id,from_id,to_id,kind)
    values(u,target_id,target_ref,new_kind);
   changed_count:=changed_count+1;
  end loop;
  update public.concepts set name=name where user_id=u and id=target_id returning * into changed_concept;
 end if;
 select a.no into action_no from public.actions a where a.user_id=u and a.txid=pg_catalog.txid_current();
 if action_no is null then raise exception 'Atlas graph mutation lacks undo journal action';end if;
 result:=pg_catalog.jsonb_build_object('operationId',opid,'status','ok','actionNo',action_no,
  'changed',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
   'resource','concepts','id',target_id,
   'version',case when op='delete_empty' then current_concept.version+1 else changed_concept.version end)),
  'affectedLinks',changed_count);
 insert into public.command_receipts(user_id,operation_id,resource,result)
 values(u,opid,'atlas_graph_maintenance',result||pg_catalog.jsonb_build_object('_request',p));
 return result;
end
$atlas$;
revoke all on function public.atlas_graph_maintenance_command(jsonb) from public,anon;
grant execute on function public.atlas_graph_maintenance_command(jsonb) to authenticated,service_role;
insert into public.lemma_command_resources(resource,command_fn,mcp_ok,"schema") values
 ('atlas_graph_maintenance','atlas_graph_maintenance_command',true,
 '{"operations":["set_level","delete_empty","reclassify_link","link_batch"],"fields":["level","to_id","old_kind","new_kind","links"]}'::jsonb);
