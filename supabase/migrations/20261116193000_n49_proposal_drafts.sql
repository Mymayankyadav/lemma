-- N49: owner-versioned proposal drafts. A saved draft is NOT approval.
create table public.proposal_drafts(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 proposal_id uuid not null,
 target_id uuid,
 base_proposal_version integer not null check(base_proposal_version>0),
 base_versions jsonb not null default '{}'::jsonb check(jsonb_typeof(base_versions)='object'),
 payload jsonb not null check(jsonb_typeof(payload)='object'),
 draft_version integer not null default 1 check(draft_version>0),
 status text not null default 'draft' check(status in ('draft','saved','submitted','discarded')),
 edited_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 unique(user_id,id),
 foreign key(user_id,proposal_id) references public.proposals(user_id,id)
  deferrable initially immediate
);
create index proposal_drafts_owner_list on public.proposal_drafts
 (user_id,edited_at desc,id);
create index proposal_drafts_proposal on public.proposal_drafts(user_id,proposal_id,status);
alter table public.proposal_drafts enable row level security;
create policy proposal_drafts_owner_read on public.proposal_drafts
 for select to authenticated using(user_id=(select auth.uid()));
grant select on public.proposal_drafts to authenticated,service_role;
grant insert,update,delete on public.proposal_drafts to service_role;
revoke insert,update,delete,truncate on public.proposal_drafts from anon,authenticated;
create trigger lemma_log_change after insert or update or delete on public.proposal_drafts
 for each row execute function public.log_change();
insert into public.lemma_undo_tables(table_name) values('proposal_drafts');

create function public.proposal_drafts_command(p jsonb) returns jsonb
 language plpgsql security definer set search_path='' as $draft$
 declare
  owner uuid:=(select auth.uid());v_role text:=pg_catalog.current_setting('role',true);
  op text;oid uuid;draft public.proposal_drafts%rowtype;proposal public.proposals%rowtype;
  expected integer;patch jsonb;v_target jsonb;v_id uuid;
  previous jsonb;reply jsonb;v_action bigint;bad_field text;v_status text;
 begin
  if owner is null or v_role not in ('authenticated','service_role') then
   raise exception 'Authenticated owner required';end if;
  if pg_catalog.jsonb_typeof(p) is distinct from 'object' or
    p->>'resource' is distinct from 'proposal_drafts' or
    p->>'schemaVersion' is distinct from '1' or
    pg_catalog.jsonb_typeof(p->'operationId') is distinct from 'string' then
   raise exception 'Invalid proposal draft envelope';end if;
  select k into bad_field from pg_catalog.jsonb_object_keys(p) as keys(k)
   where k not in ('schemaVersion','resource','operationId','operation',
      'target','expectedVersion','patch') limit 1;
  if bad_field is not null then raise exception 'Unexpected draft command field %',bad_field;end if;
  oid:=(p->>'operationId')::uuid;
  op:=p->>'operation';
  if op not in ('create','save','submit','discard') or op is null then
   raise exception 'Unsupported draft operation';end if;
  v_target:=coalesce(p->'target','{}'::jsonb);
  patch:=coalesce(p->'patch','{}'::jsonb);
  if pg_catalog.jsonb_typeof(v_target) is distinct from 'object' or
     pg_catalog.jsonb_typeof(patch) is distinct from 'object' then
   raise exception 'Draft target and patch must be objects';end if;
  select k into bad_field from pg_catalog.jsonb_object_keys(patch) as keys(k)
   where k not in ('proposal_id','target_id','payload','base_versions') limit 1;
  if bad_field is not null then raise exception 'Unexpected draft patch field %',bad_field;end if;
  if op <> 'create' and patch ?| array['proposal_id','target_id','base_versions'] then
   raise exception 'Draft links and base versions are immutable';end if;
  if op='discard' and patch<>'{}'::jsonb then
   raise exception 'Discard has no patch';end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner::text||':'||oid::text,0));
  select result into previous from public.command_receipts
   where user_id=owner and operation_id=oid;
  if found then
   if previous->'_request'=p then return previous-'_request';end if;
   return pg_catalog.jsonb_build_object('status','conflict','operationId',oid,
     'reason','operationId reused with changed payload','actionNo',null,'changed','[]'::jsonb);
  end if;
  perform pg_catalog.set_config('lemma.source',
   case when v_role='service_role' and pg_catalog.current_setting('lemma.source',true)
     in ('claude','chatgpt','other') then pg_catalog.current_setting('lemma.source',true)
    when v_role='service_role' then 'other' else 'app' end,true);
  perform pg_catalog.set_config('lemma.tool',case when v_role='service_role' then 'study' else 'proposal-drafts' end,true);
  perform pg_catalog.set_config('lemma.summary',pg_catalog.left('Proposal draft '||op,200),true);
  if op='create' then
   if patch->>'proposal_id' is null or
     pg_catalog.jsonb_typeof(patch->'payload') is distinct from 'object' then
    raise exception 'Create needs proposal_id and full payload';end if;
   select * into proposal from public.proposals
    where id=(patch->>'proposal_id')::uuid and user_id=owner for share;
   if not found or proposal.status<>'pending' or proposal.withdrawn_at is not null then
    raise exception 'Active owner proposal required';end if;
   if patch ? 'target_id' and patch->>'target_id' is not null then
    -- Polymorphic target IDs cannot use one FK: verify against the bounded
    -- owner-only resource set, never accept an arbitrary foreign UUID.
    if not (
     exists(select 1 from public.projects where id=(patch->>'target_id')::uuid
       and user_id=owner for share) or
     exists(select 1 from public.notes where id=(patch->>'target_id')::uuid
       and user_id=owner for share) or
     exists(select 1 from public.checkpoints where id=(patch->>'target_id')::uuid
       and user_id=owner for share)
    ) then raise exception 'Draft target not found for owner'; end if;
   end if;
   if patch?'base_versions' then
    perform public.lemma_proposal_assert_versions(owner,patch->'base_versions');
   end if;
   insert into public.proposal_drafts(user_id,proposal_id,target_id,
     base_proposal_version,base_versions,payload)
    values(owner,proposal.id,(patch->>'target_id')::uuid,proposal.version,
      coalesce(patch->'base_versions',proposal.base_target_versions),
      patch->'payload') returning * into draft;
  else
   if pg_catalog.jsonb_typeof(v_target->'id') is distinct from 'string'
      or (p->>'expectedVersion') !~ '^[1-9][0-9]*$' then
    raise exception 'Draft target and positive expectedVersion required';end if;
   v_id:=(v_target->>'id')::uuid;
   expected:=(p->>'expectedVersion')::integer;
   select * into draft from public.proposal_drafts
    where id=v_id and user_id=owner for update;
   if not found then raise exception 'Draft not found for owner';end if;
   if draft.draft_version <> expected then
    reply:=pg_catalog.jsonb_build_object('status','conflict','operationId',oid,
      'reason','Stale draft version','currentVersion',draft.draft_version,
      'actionNo',null,'changed','[]'::jsonb);
   elsif draft.status not in ('draft','saved') then
    raise exception 'Draft is terminal'; 
   elsif op='discard' then
    update public.proposal_drafts set status='discarded',draft_version=draft_version+1,
      edited_at=pg_catalog.clock_timestamp() where id=draft.id and user_id=owner
      returning * into draft;
   elsif op='save' then
    if pg_catalog.jsonb_typeof(patch->'payload') is distinct from 'object' then
     raise exception 'Save needs a complete payload';end if;
    update public.proposal_drafts set payload=patch->'payload',status='saved',
     draft_version=draft_version+1,edited_at=pg_catalog.clock_timestamp()
     where id=draft.id and user_id=owner returning * into draft;
   elsif op='submit' then
    if patch<>'{}'::jsonb then raise exception 'Submit uses previously saved payload';end if;
    select * into proposal from public.proposals
     where id=draft.proposal_id and user_id=owner for update;
    if not found or proposal.status<>'pending' or proposal.withdrawn_at is not null then
     raise exception 'Owner proposal is no longer pending';end if;
    if proposal.version<>draft.base_proposal_version then
     raise exception 'Proposal changed since draft creation';end if;
    perform public.lemma_proposal_assert_versions(owner,draft.base_versions);
    -- Submit edits pending proposal only. Approval remains an independent
    -- owner decision through approve_proposal and is never implied here.
    update public.proposals set payload=draft.payload,
      payload_version=payload_version+1
     where id=proposal.id and user_id=owner;
    update public.proposal_drafts set status='submitted',draft_version=draft_version+1,
     edited_at=pg_catalog.clock_timestamp() where id=draft.id and user_id=owner
     returning * into draft;
   end if;
  end if;
  if reply is null then
   select no into v_action from public.actions
     where user_id=owner and txid=pg_catalog.txid_current();
   if v_action is null then raise exception 'Draft command has no audit action';end if;
   reply:=pg_catalog.jsonb_build_object('status','ok','operationId',oid,
     'actionNo',v_action,'changed',pg_catalog.jsonb_build_array(
       pg_catalog.jsonb_build_object('id',draft.id,'version',draft.draft_version)),
     'draft',pg_catalog.to_jsonb(draft));
  end if;
  insert into public.command_receipts(user_id,operation_id,resource,result)
   values(owner,oid,'proposal_drafts',
      reply||pg_catalog.jsonb_build_object('_request',p));
  return reply;
 end $draft$;
revoke all on function public.proposal_drafts_command(jsonb) from public,anon;
grant execute on function public.proposal_drafts_command(jsonb) to authenticated,service_role;
insert into public.lemma_command_resources(resource,command_fn,mcp_ok,"schema")
 values('proposal_drafts','proposal_drafts_command',true,
 '{"operations":["create","save","submit","discard"],
   "fields":["proposal_id","target_id","base_versions","payload"]}'::jsonb);
