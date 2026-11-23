-- N226: close Atlas graph operation gaps with owner-checked, journalled MCP commands.
-- All schema additions are additive. No existing registry entry or migration is replaced.

-- A merge must never cascade-delete a source's learning facts. Empty source nodes
-- may still be merged; facts-bearing duplicates use approved aliases instead.
create function public.lemma_guard_concept_evidence_delete()
returns trigger language plpgsql security definer set search_path='' as $guard$
begin
 -- Auth account deletion cascades from the already-deleted auth.users row. A
 -- normal Atlas merge/delete has an extant owner and must pass this guard.
 -- Explicit owner-account purges run with a transaction-bound marker that
 -- only the service-role cleanup function can set. Do not block that cleanup
 -- while its auth.users row is still present (N191); ordinary merges have no marker.
 if pg_catalog.current_setting('role',true)='service_role' and exists(
    select 1 from public.account_deletion_requests d
    where d.user_id=old.user_id
      and d.cleanup_txid=pg_catalog.txid_current()
      and d.cleanup_pid=pg_catalog.pg_backend_pid()) then
   return old;
 end if;
 if pg_catalog.pg_trigger_depth()>1 and
    not exists(select 1 from auth.users where id=old.user_id) then
   return old;
 end if;
 if exists(select 1 from public.attempts a where a.user_id=old.user_id and old.id=any(a.cued))
 or exists(select 1 from public.items i where i.user_id=old.user_id and old.id=any(i.cued))
 or exists(select 1 from public.attempt_tags where user_id=old.user_id and concept_id=old.id)
 or exists(select 1 from public.instruction_events where user_id=old.user_id and concept_id=old.id)
 or exists(select 1 from public.assumptions where user_id=old.user_id and concept_id=old.id)
 or exists(select 1 from public.recheck_decisions where user_id=old.user_id and concept_id=old.id)
 or exists(select 1 from public.evidence where user_id=old.user_id and concept_id=old.id)
 or exists(select 1 from public.atlas_links where user_id=old.user_id and (from_id=old.id or to_id=old.id))
 or exists(select 1 from public.concept_aliases where user_id=old.user_id and (concept_a=old.id or concept_b=old.id))
 or exists(select 1 from public.atlas_practice_bank where user_id=old.user_id and concept_id=old.id)
 or exists(select 1 from public.rechecks where user_id=old.user_id and class_id=old.id)
 or exists(select 1 from public.concepts where user_id=old.user_id and family_id=old.id and id<>old.id)
 or exists(select 1 from public.items where user_id=old.user_id and concept_tags::text like '%'||old.id::text||'%')
 then
   raise exception 'Atlas concept has learning evidence or semantic links; preserve the source and create an alias instead of merging';
 end if;
 return old;
end;
$guard$;
revoke all on function public.lemma_guard_concept_evidence_delete() from public,anon;
create trigger zz_atlas_preserve_evidence before delete on public.concepts
 for each row execute function public.lemma_guard_concept_evidence_delete();

create function public.atlas_graph_edits_command(p jsonb)
returns jsonb language plpgsql security definer set search_path='' as $command$
declare
 v_owner uuid:=(select auth.uid());
 v_role text:=pg_catalog.current_setting('role',true);
 v_op text:=p->>'operation';
 v_opid uuid;
 v_target uuid;
 v_expected integer;
 v_patch jsonb:=coalesce(p->'patch','{}'::jsonb);
 v_bad text;
 v_level text;
 v_rank int;
 v_from uuid;
 v_to uuid;
 v_from_version integer;
 v_to_version integer;
 v_actual integer;
 v_old_kind text;
 v_new_kind text;
 v_edge jsonb;
 v_edges jsonb;
 v_sources uuid[]:=array[]::uuid[];
 v_pairs text[]:=array[]::text[];
 v_pair text;
 v_changed jsonb:='[]'::jsonb;
 v_result jsonb;
 v_prior jsonb;
 v_action bigint;
 v_count int;
begin
 if v_owner is null or v_role not in ('authenticated','service_role') then
   raise exception 'Authenticated owner required';
 end if;
 if p is null or pg_catalog.jsonb_typeof(p) is distinct from 'object'
   or p->>'schemaVersion' is distinct from '1'
   or p->>'resource' is distinct from 'atlas_graph_edits'
   or pg_catalog.jsonb_typeof(p->'operationId') is distinct from 'string'
   or v_op not in ('change_level','delete_empty','reclassify_link','link_batch')
 then raise exception 'Invalid Atlas graph edit envelope';end if;
 select key into v_bad from pg_catalog.jsonb_object_keys(p) as keys(key)
  where key not in ('schemaVersion','resource','operation','operationId','target','expectedVersion','patch') limit 1;
 if v_bad is not null then raise exception 'Unknown graph edit field %',v_bad;end if;
 if pg_catalog.jsonb_typeof(v_patch) is distinct from 'object' then
   raise exception 'Graph edit patch must be an object';end if;
 v_opid:=(p->>'operationId')::uuid;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('atlas-owner:'||v_owner::text,0));
 select result into v_prior from public.command_receipts
  where user_id=v_owner and operation_id=v_opid;
 if found then
  if v_prior->'_request'=p then return v_prior-'_request';end if;
  return pg_catalog.jsonb_build_object('operationId',v_opid,'status','conflict',
    'reason','operationId reused with a different payload','actionNo',null,'changed','[]'::jsonb);
 end if;
 if v_role<>'service_role' then
  perform pg_catalog.set_config('lemma.source','app',true);
  perform pg_catalog.set_config('lemma.tool','atlas_graph_edits',true);
 end if;
 perform pg_catalog.set_config('lemma.summary',pg_catalog.left('Atlas graph '||v_op,200),true);

 if v_op<>'link_batch' then
  if pg_catalog.jsonb_typeof(p->'target'->'id') is distinct from 'string'
    or (p->>'expectedVersion') !~ '^[1-9][0-9]*$'
    or (p->>'expectedVersion')::numeric>2147483647 then
    raise exception 'Target concept and positive expectedVersion required';
  end if;
  v_target:=(p->'target'->>'id')::uuid;
  v_expected:=(p->>'expectedVersion')::integer;
  select version into v_actual from public.concepts
    where user_id=v_owner and id=v_target for update;
  if not found then raise exception 'Concept not found for owner';end if;
  if v_actual<>v_expected then raise exception 'Atlas concept version conflict';end if;
 elsif p?'target' or p?'expectedVersion' then
  raise exception 'Link batch requires per-edge versions rather than a target or expectedVersion';
 end if;

 if v_op='change_level' then
  select key into v_bad from pg_catalog.jsonb_object_keys(v_patch) as keys(key)
    where key<>'level' limit 1;
  if v_bad is not null or not(v_patch?'level') then
    raise exception 'Change level requires only level';end if;
  v_level:=v_patch->>'level';
  v_rank:=case v_level when 'cluster' then 1 when 'galaxy' then 2
     when 'system' then 3 when 'planet' then 4 when 'moon' then 5 else 0 end;
  if v_rank=0 then raise exception 'Unknown Atlas level';end if;
  if exists (
    select 1 from public.concepts c join public.concepts par on par.id=c.parent_id
    where c.user_id=v_owner and c.id=v_target and par.user_id=v_owner
    and (case par.level when 'cluster' then 1 when 'galaxy' then 2
      when 'system' then 3 when 'planet' then 4 when 'moon' then 5 end)>=v_rank
  ) then raise exception 'Atlas level must be below parent level';end if;
  if exists (
    select 1 from public.concepts child where child.user_id=v_owner
    and child.parent_id=v_target and
      (case child.level when 'cluster' then 1 when 'galaxy' then 2
       when 'system' then 3 when 'planet' then 4 when 'moon' then 5 end)<=v_rank
  ) then raise exception 'Atlas level must be above child levels';end if;
  update public.concepts set level=v_level where user_id=v_owner and id=v_target
    returning version into v_actual;
  v_changed:=pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object('resource','concepts','id',v_target,'version',v_actual));

 elsif v_op='delete_empty' then
  if v_patch<>'{}'::jsonb then raise exception 'Delete empty takes no patch';end if;
  if exists(select 1 from public.concepts where user_id=v_owner and parent_id=v_target)
  or exists(select 1 from public.concept_links where user_id=v_owner and (from_id=v_target or to_id=v_target))
  or exists(select 1 from public.checkpoint_concepts where user_id=v_owner and concept_id=v_target)
  or exists(select 1 from public.notes where user_id=v_owner and concept_id=v_target)
  or exists(select 1 from public.misconceptions where user_id=v_owner and concept_id=v_target)
  or exists(select 1 from public.practice_topics where user_id=v_owner and concept_id=v_target)
  then raise exception 'Concept is not empty; remove references through approved commands first';end if;
  -- The evidence-preserving BEFORE DELETE trigger checks the other Atlas facts.
  delete from public.concepts where user_id=v_owner and id=v_target;
  if not found then raise exception 'Concept no longer exists';end if;
  v_changed:=pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object('resource','concepts','id',v_target,'deleted',true));

 elsif v_op='reclassify_link' then
  select key into v_bad from pg_catalog.jsonb_object_keys(v_patch) as keys(key)
    where key not in ('to_id','from_kind','to_kind') limit 1;
  if v_bad is not null or not(v_patch?'to_id' and v_patch?'from_kind' and v_patch?'to_kind') then
    raise exception 'Reclassify needs to_id, from_kind, to_kind';end if;
  v_to:=(v_patch->>'to_id')::uuid;
  v_old_kind:=v_patch->>'from_kind';
  v_new_kind:=v_patch->>'to_kind';
  if v_target=v_to or v_old_kind not in ('prereq','related') or
     v_new_kind not in ('prereq','related') or v_old_kind=v_new_kind then
    raise exception 'Invalid concept link reclassification';end if;
  if not exists(select 1 from public.concepts where user_id=v_owner and id=v_to) then
    raise exception 'Target link concept not found for owner';end if;
  update public.concept_links set kind=v_new_kind where user_id=v_owner
   and from_id=v_target and to_id=v_to and kind=v_old_kind;
  if not found then raise exception 'Original concept link not found';end if;
  -- The prerequisite cycle trigger validates this UPDATE atomically.
  update public.concepts set name=name where user_id=v_owner and id=v_target
   returning version into v_actual;
  v_changed:=pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object('resource','concepts','id',v_target,'version',v_actual));

 else
  select key into v_bad from pg_catalog.jsonb_object_keys(v_patch) as keys(key)
   where key<>'links' limit 1;
  v_edges:=v_patch->'links';
  if v_bad is not null or pg_catalog.jsonb_typeof(v_edges) is distinct from 'array'
    or pg_catalog.jsonb_array_length(v_edges) not between 1 and 50 then
    raise exception 'Link batch requires 1..50 links and no other patch fields';end if;
  -- Validate all pairs and both endpoint versions before writing anything.
  for v_edge in select value from pg_catalog.jsonb_array_elements(v_edges) loop
    if pg_catalog.jsonb_typeof(v_edge) is distinct from 'object' then
      raise exception 'Link batch entries must be objects';end if;
    select key into v_bad from pg_catalog.jsonb_object_keys(v_edge) as keys(key)
     where key not in ('from_id','to_id','kind','from_version','to_version') limit 1;
    if v_bad is not null or not(v_edge?'from_id' and v_edge?'to_id' and v_edge?'kind'
       and v_edge?'from_version' and v_edge?'to_version') then
      raise exception 'Invalid link batch entry fields';end if;
    v_from:=(v_edge->>'from_id')::uuid;
    v_to:=(v_edge->>'to_id')::uuid;
    v_new_kind:=v_edge->>'kind';
    if v_from=v_to or v_new_kind not in ('prereq','related') then
      raise exception 'Invalid prerequisite or related link';end if;
    if (v_edge->>'from_version') !~ '^[1-9][0-9]*$' or
       (v_edge->>'to_version') !~ '^[1-9][0-9]*$' or
       (v_edge->>'from_version')::numeric>2147483647 or
       (v_edge->>'to_version')::numeric>2147483647 then
      raise exception 'Positive endpoint versions required';end if;
    v_from_version:=(v_edge->>'from_version')::integer;
    v_to_version:=(v_edge->>'to_version')::integer;
    select version into v_actual from public.concepts where user_id=v_owner and id=v_from for update;
    if not found or v_actual<>v_from_version then
      raise exception 'Link source missing or version conflict';end if;
    select version into v_actual from public.concepts where user_id=v_owner and id=v_to for update;
    if not found or v_actual<>v_to_version then
      raise exception 'Link destination missing or version conflict';end if;
    v_pair:=v_from::text||':'||v_to::text;
    if v_pair=any(v_pairs) then raise exception 'Duplicate pair within link batch';end if;
    v_pairs:=pg_catalog.array_append(v_pairs,v_pair);
    if not(v_from=any(v_sources)) then
      v_sources:=pg_catalog.array_append(v_sources,v_from);
    end if;
  end loop;
  -- Every INSERT runs the existing prerequisite cycle trigger. Any bad link
  -- rolls the entire SQL command, its audit writes and all other links back.
  for v_edge in select value from pg_catalog.jsonb_array_elements(v_edges) loop
    insert into public.concept_links(user_id,from_id,to_id,kind)
     values(v_owner,(v_edge->>'from_id')::uuid,(v_edge->>'to_id')::uuid,v_edge->>'kind');
  end loop;
  foreach v_from in array v_sources loop
    update public.concepts set name=name where user_id=v_owner and id=v_from
      returning version into v_actual;
    v_changed:=v_changed||pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('resource','concepts','id',v_from,'version',v_actual));
  end loop;
 end if;

 select no into v_action from public.actions where user_id=v_owner and txid=pg_catalog.txid_current();
 if v_action is null then raise exception 'Atlas graph edit lacks undo journal';end if;
 v_result:=pg_catalog.jsonb_build_object('operationId',v_opid,'status','ok',
   'actionNo',v_action,'changed',v_changed);
 insert into public.command_receipts(user_id,operation_id,resource,result)
  values(v_owner,v_opid,'atlas_graph_edits',v_result||pg_catalog.jsonb_build_object('_request',p));
 return v_result;
end;
$command$;
revoke all on function public.atlas_graph_edits_command(jsonb) from public,anon;
grant execute on function public.atlas_graph_edits_command(jsonb) to authenticated,service_role;
insert into public.lemma_command_resources(resource,command_fn,mcp_ok,"schema")
 values('atlas_graph_edits','atlas_graph_edits_command',true,
 '{"operations":["change_level","delete_empty","reclassify_link","link_batch"],"fields":["level","to_id","from_kind","to_kind","links"]}'::jsonb);
