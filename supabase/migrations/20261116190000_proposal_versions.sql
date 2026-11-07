-- N92: owner-bound proposal revision lineage and source-version citations.
-- Only the named existing approval signature is replaced compatibly below.
alter table public.proposals
 add column payload_version integer not null default 1
   check (payload_version between 1 and 2147483647),
 add column base_target_versions jsonb not null default '{}'::jsonb
   check (pg_catalog.jsonb_typeof(base_target_versions)='object'),
 add column group_id uuid,
 add column citations jsonb not null default '[]'::jsonb
   check (pg_catalog.jsonb_typeof(citations)='array'
     and pg_catalog.jsonb_array_length(citations)<=50),
 add column withdrawn_at timestamptz,
 add column revised_from uuid,
 add constraint proposals_revised_from_owner_fk
   foreign key(user_id,revised_from) references public.proposals(user_id,id)
   deferrable initially immediate;
create index proposals_owner_group on public.proposals(user_id,group_id,created_at,id)
 where group_id is not null;
create unique index proposals_one_direct_revision on public.proposals(user_id,revised_from)
 where revised_from is not null;

-- Explicit owner and version snapshot: no display-name comparison, stale target
-- cannot be approved after its source changed, and no resource names from caller
-- are interpolated unless in this fixed allow-list.
create function public.lemma_proposal_assert_versions(p_owner uuid,p_versions jsonb)
returns void language plpgsql security invoker set search_path='' as $expected$
declare v_table text; v_name text; v_id uuid; v_expected integer; v_actual integer;
 v_members jsonb; v_value jsonb;
begin
 if p_owner is null or pg_catalog.jsonb_typeof(p_versions) is distinct from 'object'
   or (select pg_catalog.count(*) from pg_catalog.jsonb_object_keys(p_versions))>3 then
   raise exception 'Invalid proposal expected-version snapshot'; end if;
 for v_table,v_members in select key,value from pg_catalog.jsonb_each(p_versions) loop
   if v_table not in ('projects','notes','checkpoints')
     or pg_catalog.jsonb_typeof(v_members) is distinct from 'object'
     or (select pg_catalog.count(*) from pg_catalog.jsonb_object_keys(v_members))>100 then
     raise exception 'Unknown or invalid proposal versioned resource'; end if;
   for v_name,v_value in select key,value from pg_catalog.jsonb_each(v_members) loop
     if v_name !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
       or pg_catalog.jsonb_typeof(v_value) is distinct from 'number'
       or v_value::text !~ '^[1-9][0-9]*$' or (v_value::text)::numeric>2147483647
       then raise exception 'Invalid proposal target version'; end if;
     v_id:=v_name::uuid;v_expected:=(v_value::text)::integer;
     execute pg_catalog.format(
       'select version from public.%I where id=$1 and user_id=$2 for share',v_table)
       into v_actual using v_id,p_owner;
     if v_actual is distinct from v_expected then
       raise exception 'Proposal target changed or is unavailable: % %',v_table,v_id
         using errcode='40001';
     end if;
   end loop;
 end loop;
end
$expected$;
revoke all on function public.lemma_proposal_assert_versions(uuid,jsonb) from public,anon;
grant execute on function public.lemma_proposal_assert_versions(uuid,jsonb)
 to authenticated,service_role;

-- Structured evidence: each (source UUID, source version, page label) is owner
-- verified when supplied. An old citation can remain historical after a source
-- version advances, but a newly forged or already-stale citation is refused.
create function public.lemma_proposal_citations_guard() returns trigger
language plpgsql security invoker set search_path='' as $citations$
declare v_item jsonb;v_source uuid;v_version integer;v_actual integer;v_page text;
begin
 for v_item in select value from pg_catalog.jsonb_array_elements(new.citations) as e(value)
 loop
   if pg_catalog.jsonb_typeof(v_item) is distinct from 'object'
     or exists(select 1 from pg_catalog.jsonb_object_keys(v_item) as k(key)
       where key not in ('source','version','page'))
     or (select count(*) from pg_catalog.jsonb_object_keys(v_item))<>3
     or pg_catalog.jsonb_typeof(v_item->'source') is distinct from 'string'
     or pg_catalog.jsonb_typeof(v_item->'version') is distinct from 'number'
     or (v_item->>'version') !~ '^[1-9][0-9]*$'
     or (v_item->>'version')::numeric>2147483647
     or pg_catalog.jsonb_typeof(v_item->'page') not in ('string','null')
     then raise exception 'Invalid proposal citation'; end if;
   v_source:=(v_item->>'source')::uuid;
   v_version:=(v_item->>'version')::integer;
   v_page:=v_item->>'page';
   if v_page is not null and pg_catalog.length(v_page)>120 then
     raise exception 'Citation page label too long'; end if;
   select s.version into v_actual from public.sources s
    where s.user_id=new.user_id and s.id=v_source for share;
   if v_actual is distinct from v_version then
     raise exception 'Citation source changed or is not owner-visible'
       using errcode='40001';
   end if;
 end loop;
 return new;
end
$citations$;
revoke all on function public.lemma_proposal_citations_guard() from public,anon;
create trigger proposals_citation_integrity
 before insert or update of citations on public.proposals
 for each row execute function public.lemma_proposal_citations_guard();

-- Authenticated callers may still edit the legacy proposal fields under owner
-- RLS. New provenance/version/lineage fields are command-managed and cannot be
-- supplied directly, including by spoofing a custom session GUC.
create function public.lemma_proposal_metadata_guard() returns trigger
language plpgsql security invoker set search_path='' as $guard$
begin
 if current_user in ('authenticated','anon') then
   if tg_op='INSERT' and (new.payload_version<>1 or
      new.base_target_versions<>'{}'::jsonb or new.group_id is not null
      or new.withdrawn_at is not null or new.revised_from is not null
      or new.citations<>'[]'::jsonb) then
     raise exception 'Proposal version metadata needs an authorized command';
   elsif tg_op='UPDATE' and (
      old.payload_version is distinct from new.payload_version
      or old.base_target_versions is distinct from new.base_target_versions
      or old.group_id is distinct from new.group_id
      or old.withdrawn_at is distinct from new.withdrawn_at
      or old.revised_from is distinct from new.revised_from
      or old.citations is distinct from new.citations) then
     raise exception 'Proposal version metadata needs an authorized command';
   end if;
 end if;
 return new;
end
$guard$;
revoke all on function public.lemma_proposal_metadata_guard() from public,anon;
create trigger proposals_version_metadata_guard before insert or update
 on public.proposals for each row execute function public.lemma_proposal_metadata_guard();

create function public.withdraw_proposal(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $withdraw$
declare v_owner uuid:=(select auth.uid());v_row public.proposals%rowtype;
begin
 if v_owner is null then raise exception 'Authentication required'; end if;
 select * into v_row from public.proposals
  where id=p_id and user_id=v_owner for update;
 if not found then raise exception 'Proposal not found for owner'; end if;
 if v_row.status<>'pending' or v_row.withdrawn_at is not null then
   raise exception 'Only an active pending proposal can be withdrawn'; end if;
 if pg_catalog.current_setting('role',true)<>'service_role' then
   perform pg_catalog.set_config('lemma.source','app',true);
   perform pg_catalog.set_config('lemma.tool','withdraw_proposal',true);
   perform pg_catalog.set_config('lemma.summary','Withdraw proposal',true);
 end if;
 update public.proposals set withdrawn_at=pg_catalog.clock_timestamp()
  where id=p_id and user_id=v_owner returning * into v_row;
 return pg_catalog.jsonb_build_object('id',v_row.id,'status',v_row.status,
   'withdrawnAt',v_row.withdrawn_at,'version',v_row.version);
end
$withdraw$;
revoke all on function public.withdraw_proposal(uuid) from public,anon;
grant execute on function public.withdraw_proposal(uuid) to authenticated,service_role;

-- One direct successor per proposal, independently tracked by payload_version.
-- Revision and withdrawal of its parent are atomic in one journal action.
create function public.revise_proposal(
 p_id uuid,p_payload jsonb,p_citations jsonb default null,
 p_base_versions jsonb default null
) returns jsonb
language plpgsql security definer set search_path='' as $revise$
declare v_owner uuid:=(select auth.uid());v_old public.proposals%rowtype;
 v_new public.proposals%rowtype;v_citations jsonb;v_base jsonb;
begin
 if v_owner is null then raise exception 'Authentication required'; end if;
 if pg_catalog.jsonb_typeof(p_payload) is distinct from 'object' then
   raise exception 'Revised proposal payload must be an object'; end if;
 if p_citations is not null and
   (pg_catalog.jsonb_typeof(p_citations) is distinct from 'array'
    or pg_catalog.jsonb_array_length(p_citations)>50) then
   raise exception 'Invalid revised citations'; end if;
 select * into v_old from public.proposals
  where id=p_id and user_id=v_owner for update;
 if not found then raise exception 'Proposal not found for owner'; end if;
 if v_old.status<>'pending' or v_old.payload_version>=2147483647 then
   raise exception 'Only a pending proposal can be revised'; end if;
 if exists(select 1 from public.proposals
   where user_id=v_owner and revised_from=p_id) then
   raise exception 'Proposal already has a revision'; end if;
 v_citations:=coalesce(p_citations,v_old.citations);
 v_base:=coalesce(p_base_versions,v_old.base_target_versions);
 perform public.lemma_proposal_assert_versions(v_owner,v_base);
 if pg_catalog.current_setting('role',true)<>'service_role' then
   perform pg_catalog.set_config('lemma.source','app',true);
   perform pg_catalog.set_config('lemma.tool','revise_proposal',true);
   perform pg_catalog.set_config('lemma.summary','Revise proposal',true);
 end if;
 insert into public.proposals(
   user_id,project_id,session_id,kind,payload,reason,origin,
   payload_version,base_target_versions,group_id,citations,revised_from)
 values(v_owner,v_old.project_id,v_old.session_id,v_old.kind,p_payload,
   v_old.reason,v_old.origin,v_old.payload_version+1,v_base,
   coalesce(v_old.group_id,v_old.id),v_citations,v_old.id)
 returning * into v_new;
 update public.proposals set withdrawn_at=pg_catalog.clock_timestamp()
  where id=v_old.id and user_id=v_owner;
 return pg_catalog.jsonb_build_object('id',v_new.id,'revisedFrom',v_old.id,
   'groupId',v_new.group_id,'payloadVersion',v_new.payload_version,
   'version',v_new.version);
end
$revise$;
revoke all on function public.revise_proposal(uuid,jsonb,jsonb,jsonb)
 from public,anon;
grant execute on function public.revise_proposal(uuid,jsonb,jsonb,jsonb)
 to authenticated,service_role;

create function public.reopen_proposal(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $reopen$
declare v_owner uuid:=(select auth.uid());v_row public.proposals%rowtype;
begin
 if v_owner is null then raise exception 'Authentication required'; end if;
 select * into v_row from public.proposals
  where id=p_id and user_id=v_owner for update;
 if not found then raise exception 'Proposal not found for owner'; end if;
 if v_row.status='approved' or
  (v_row.status='pending' and v_row.withdrawn_at is null) then
   raise exception 'Proposal is not withdrawn or rejected'; end if;
 if exists(select 1 from public.proposals
    where user_id=v_owner and revised_from=p_id
      and status='pending' and withdrawn_at is null) then
   raise exception 'A newer active revision supersedes this proposal'; end if;
 if pg_catalog.current_setting('role',true)<>'service_role' then
   perform pg_catalog.set_config('lemma.source','app',true);
   perform pg_catalog.set_config('lemma.tool','reopen_proposal',true);
   perform pg_catalog.set_config('lemma.summary','Reopen proposal',true);
 end if;
 update public.proposals set status='pending',withdrawn_at=null,
   decided_at=null,result=null where id=p_id and user_id=v_owner
   returning * into v_row;
 return pg_catalog.jsonb_build_object('id',v_row.id,
   'status',v_row.status,'version',v_row.version,'withdrawnAt',v_row.withdrawn_at);
end
$reopen$;
revoke all on function public.reopen_proposal(uuid) from public,anon;
grant execute on function public.reopen_proposal(uuid) to authenticated,service_role;

-- N38's existing version trigger, legacy approval effects and unchanged
-- single-owner transaction semantics stay intact.

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
 if p.status<>'pending' or p.withdrawn_at is not null then raise exception 'Proposal is not active and pending'; end if;
 select * into strict project_row from public.projects where id=p.project_id and user_id=p.user_id for update;
 -- Existing proposals with empty version expectations preserve legacy behavior.
 if p.base_target_versions <> '{}'::jsonb then
   perform public.lemma_proposal_assert_versions(p.user_id,p.base_target_versions);
 end if;
 -- Optional expected_versions is reserved metadata, not a card-edit field.
 if p_edit is not null and pg_catalog.jsonb_typeof(p_edit)='object'
    and p_edit ? 'expected_versions' then
   perform public.lemma_proposal_assert_versions(p.user_id,p_edit->'expected_versions');
   p_edit:=p_edit-'expected_versions';
   if p_edit='{}'::jsonb then p_edit:=null; end if;
 end if;
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



-- The original grant remains; this replacement has the same signature,
-- returns the same result, and adds only optional expected-version validation.
