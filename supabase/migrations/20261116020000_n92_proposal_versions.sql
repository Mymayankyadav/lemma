-- N92: versioned proposal history, structured citations, and reversible lifecycle.
-- The old approve_proposal signature is deliberately untouched until its
-- optional expected-target-version guard receives independent compatibility tests.
create function public.proposal_citations_valid(p jsonb) returns boolean
 language sql immutable set search_path='' as $validate$
 select pg_catalog.jsonb_typeof(p)='array'
  and pg_catalog.jsonb_array_length(p)<=100
  and not exists(
   select 1 from pg_catalog.jsonb_array_elements(p) c
   where pg_catalog.jsonb_typeof(c)<>'object'
    or c ?& array['source','version','page'] is false
    or pg_catalog.jsonb_typeof(c->'source')<>'string'
    or (c->>'source') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or pg_catalog.jsonb_typeof(c->'version')<>'number'
    or (c->>'version') !~ '^[1-9][0-9]*$'
    or (c->>'version')::numeric>2147483647
    or pg_catalog.jsonb_typeof(c->'page')<>'string'
    or pg_catalog.length(pg_catalog.btrim(c->>'page')) not between 1 and 100
    or exists(select 1 from pg_catalog.jsonb_object_keys(c) k
       where k not in ('source','version','page'))
  )
 $validate$;
alter table public.proposals
 add column payload_version integer not null default 1
   constraint proposal_payload_version_positive check(payload_version>0),
 add column base_target_versions jsonb not null default '{}'::jsonb
   constraint proposal_base_versions_object check(jsonb_typeof(base_target_versions)='object'),
 add column group_id uuid,
 add column citations jsonb not null default '[]'::jsonb
   constraint proposal_citations_valid_check check(public.proposal_citations_valid(citations)),
 add column withdrawn_at timestamptz,
 add column revised_from uuid;
alter table public.proposals add constraint proposals_owner_revision
 foreign key(user_id,revised_from) references public.proposals(user_id,id)
 deferrable initially immediate;
alter table public.proposals add constraint proposals_not_own_revision
 check(revised_from is null or revised_from <> id);
create unique index proposals_one_revision_per_origin
 on public.proposals(user_id,revised_from) where revised_from is not null;
create index proposals_owner_group on public.proposals(user_id,group_id,created_at,id)
 where group_id is not null;
create index proposals_owner_withdrawn on public.proposals(user_id,withdrawn_at,id)
 where withdrawn_at is not null;

-- Track payload changes independently from N38's row version: disposition
-- transitions cannot silently rewrite the proposal body.
create function public.proposal_payload_touch_version() returns trigger
 language plpgsql security invoker set search_path='' as $touch$
 begin
  if new.payload is distinct from old.payload then
   new.payload_version:=old.payload_version+1;
  elsif pg_catalog.current_setting('lemma.tool',true) <> 'undo' then
   new.payload_version:=old.payload_version;
  end if;
  return new;
 end $touch$;
create trigger y_proposal_payload_version before update on public.proposals
 for each row execute function public.proposal_payload_touch_version();

create function public.withdraw_proposal(p_id uuid,p_expected_version integer,p_reason text)
 returns public.proposals language plpgsql security definer set search_path='' as $withdraw$
 declare v public.proposals; v_role text;
 begin
  v_role:=pg_catalog.current_setting('role',true);
  if v_role not in ('authenticated','service_role') or auth.uid() is null then
   raise exception 'Authenticated owner required'; end if;
  if p_reason is null or pg_catalog.length(pg_catalog.btrim(p_reason)) not between 1 and 300
   then raise exception 'Withdrawal requires a reason'; end if;
  select * into v from public.proposals where id=p_id and user_id=auth.uid() for update;
  if not found then raise exception 'Proposal not found for owner';end if;
  if v.version is distinct from p_expected_version then raise exception 'Stale proposal version';end if;
  if v.status<>'pending' or v.withdrawn_at is not null then
   raise exception 'Only pending proposals may be withdrawn';end if;
  perform pg_catalog.set_config('lemma.source',case when v_role='service_role'
   then coalesce(nullif(pg_catalog.current_setting('lemma.source',true),''),'other') else 'app' end,true);
  perform pg_catalog.set_config('lemma.tool','proposal-withdraw',true);
  perform pg_catalog.set_config('lemma.summary',pg_catalog.left('Withdraw proposal: '||p_reason,200),true);
  update public.proposals set status='rejected',withdrawn_at=pg_catalog.clock_timestamp(),
   decided_at=pg_catalog.clock_timestamp(),result=pg_catalog.jsonb_build_object('withdrawal_reason',p_reason)
   where id=v.id and user_id=v.user_id returning * into v;
  return v;
 end $withdraw$;
revoke all on function public.withdraw_proposal(uuid,integer,text) from public,anon;
grant execute on function public.withdraw_proposal(uuid,integer,text) to authenticated,service_role;

create function public.reopen_proposal(p_id uuid,p_expected_version integer)
 returns public.proposals language plpgsql security definer set search_path='' as $reopen$
 declare v public.proposals;v_role text;
 begin
  v_role:=pg_catalog.current_setting('role',true);
  if v_role not in ('authenticated','service_role') or auth.uid() is null then
   raise exception 'Authenticated owner required';end if;
  select * into v from public.proposals where id=p_id and user_id=auth.uid() for update;
  if not found then raise exception 'Proposal not found for owner';end if;
  if v.version is distinct from p_expected_version then raise exception 'Stale proposal version';end if;
  if v.withdrawn_at is null or v.status<>'rejected' then
   raise exception 'Only withdrawn proposals may be reopened';end if;
  if exists(select 1 from public.proposals where user_id=v.user_id and revised_from=v.id)
   then raise exception 'A revised successor must be resolved first';end if;
  perform pg_catalog.set_config('lemma.source',case when v_role='service_role'
   then coalesce(nullif(pg_catalog.current_setting('lemma.source',true),''),'other') else 'app' end,true);
  perform pg_catalog.set_config('lemma.tool','proposal-reopen',true);
  perform pg_catalog.set_config('lemma.summary','Reopen withdrawn proposal',true);
  update public.proposals set status='pending',withdrawn_at=null,decided_at=null,result=null
   where id=v.id and user_id=v.user_id returning * into v;
  return v;
 end $reopen$;
revoke all on function public.reopen_proposal(uuid,integer) from public,anon;
grant execute on function public.reopen_proposal(uuid,integer) to authenticated,service_role;

create function public.revise_proposal(p_id uuid,p_expected_version integer,
 p_payload jsonb,p_citations jsonb default '[]'::jsonb)
 returns public.proposals language plpgsql security definer set search_path='' as $revise$
 declare v public.proposals;result public.proposals;v_role text;
 begin
  v_role:=pg_catalog.current_setting('role',true);
  if v_role not in ('authenticated','service_role') or auth.uid() is null then
   raise exception 'Authenticated owner required';end if;
  if pg_catalog.jsonb_typeof(p_payload) is distinct from 'object'
   or not public.proposal_citations_valid(p_citations) then
   raise exception 'Invalid revision body or citations';end if;
  select * into v from public.proposals where id=p_id and user_id=auth.uid() for update;
  if not found then raise exception 'Proposal not found for owner';end if;
  select * into result from public.proposals where user_id=v.user_id and revised_from=v.id;
  if found then
   if result.payload=p_payload and result.citations=p_citations then return result;end if;
   raise exception 'Proposal already has a different revision';
  end if;
  if v.version is distinct from p_expected_version then raise exception 'Stale proposal version';end if;
  if v.status='approved' then raise exception 'Approved proposal cannot be revised';end if;
  perform pg_catalog.set_config('lemma.source',case when v_role='service_role'
   then coalesce(nullif(pg_catalog.current_setting('lemma.source',true),''),'other') else 'app' end,true);
  perform pg_catalog.set_config('lemma.tool','proposal-revise',true);
  perform pg_catalog.set_config('lemma.summary','Revise proposal',true);
  if v.status='pending' then
   update public.proposals set status='rejected',withdrawn_at=pg_catalog.clock_timestamp(),
    decided_at=pg_catalog.clock_timestamp(),result='{"revised":true}'::jsonb
    where id=v.id and user_id=v.user_id;
  elsif v.withdrawn_at is null then
   raise exception 'Only pending or withdrawn proposals may be revised';
  end if;
  insert into public.proposals(user_id,project_id,session_id,kind,payload,reason,
     status,origin,group_id,citations,base_target_versions,revised_from)
   values(v.user_id,v.project_id,v.session_id,v.kind,p_payload,v.reason,
     'pending',v.origin,coalesce(v.group_id,v.id),p_citations,v.base_target_versions,v.id)
   returning * into result;
  return result;
 end $revise$;
revoke all on function public.revise_proposal(uuid,integer,jsonb,jsonb) from public,anon;
grant execute on function public.revise_proposal(uuid,integer,jsonb,jsonb) to authenticated,service_role;
