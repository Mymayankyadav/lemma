-- Checkpoint tutoring. The server owns all snapshots, leases, replies and receipts.
-- Empty controls disable new operations until the reviewed release enables them.
create table public.tutor_release_controls (
 capability text primary key check (capability in ('manual','mcp')),
 enabled boolean not null default false
);
create table public.tutor_threads (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 project_id uuid not null,
 checkpoint_id uuid not null,
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 last_sequence bigint not null default 0 check (last_sequence>=0),
 unique(user_id,id), unique(user_id,checkpoint_id),
 foreign key(user_id,project_id) references public.projects(user_id,id) on delete cascade,
 foreign key(user_id,checkpoint_id) references public.checkpoints(user_id,id) on delete cascade
);
create table public.tutor_turns (
 id uuid primary key default gen_random_uuid(), client_turn_id uuid not null, user_id uuid not null, thread_id uuid not null,
 sequence bigint not null check(sequence>0), version integer not null default 1,
 generation integer not null default 0, snapshot jsonb not null,
 status text not null default 'pending' check(status in ('pending','completed','cancelled')),
 created_at timestamptz not null default clock_timestamp(),
 unique(user_id,id), unique(user_id,client_turn_id), unique(thread_id,sequence),
 foreign key(user_id,thread_id) references public.tutor_threads(user_id,id) on delete cascade
);
create unique index tutor_one_pending on public.tutor_turns(thread_id) where status='pending';
create table public.tutor_grants (
 id uuid primary key default gen_random_uuid(), user_id uuid not null, turn_id uuid not null,
 created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null, revoked_at timestamptz,
 unique(user_id,id), unique(user_id,turn_id,id),
 foreign key(user_id,turn_id) references public.tutor_turns(user_id,id) on delete cascade
);
-- Keep verifier material out of every transcript, returned result and owner export.
create table public.tutor_grant_credentials (
 grant_id uuid primary key references public.tutor_grants(id) on delete cascade,
 token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$')
);
create table public.tutor_attempts (
 id uuid primary key default gen_random_uuid(), user_id uuid not null,
 turn_id uuid not null, grant_id uuid not null, generation integer not null,
 lease_until timestamptz not null, finished_at timestamptz, reason text,
 created_at timestamptz not null default clock_timestamp(),
 unique(turn_id,generation),
 foreign key(user_id,turn_id,grant_id) references public.tutor_grants(user_id,turn_id,id) on delete cascade
);
create table public.tutor_replies (
 turn_id uuid primary key, id uuid not null, user_id uuid not null, unique(user_id,id),
 body text not null check(char_length(body) between 1 and 12000),
 provenance text not null check(provenance in ('manual','connector')),
 reported_host text check(reported_host is null or (char_length(reported_host) between 1 and 100 and provenance='connector')),
 citations jsonb not null default '[]', created_at timestamptz not null default clock_timestamp(),
 foreign key(user_id,turn_id) references public.tutor_turns(user_id,id) on delete cascade
);
create table public.tutor_suggestions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null, turn_id uuid not null,
 proposal_id uuid not null, unique(proposal_id,turn_id),
 foreign key(user_id,turn_id) references public.tutor_turns(user_id,id) on delete cascade,
 foreign key(user_id,proposal_id) references public.proposals(user_id,id) on delete cascade
);
create table public.tutor_recovered_replies (
 id uuid not null, message_id uuid not null, user_id uuid not null, turn_id uuid not null, primary key(user_id,id),
 body text not null, created_at timestamptz not null default clock_timestamp(),
 foreign key(user_id,turn_id) references public.tutor_turns(user_id,id) on delete cascade
);
alter table public.tutor_release_controls enable row level security;
alter table public.tutor_threads enable row level security;
alter table public.tutor_turns enable row level security;
alter table public.tutor_grants enable row level security;
alter table public.tutor_grant_credentials enable row level security;
alter table public.tutor_attempts enable row level security;
alter table public.tutor_replies enable row level security;
alter table public.tutor_suggestions enable row level security;
alter table public.tutor_recovered_replies enable row level security;
revoke all on public.tutor_release_controls,public.tutor_threads,public.tutor_turns,public.tutor_grants,
 public.tutor_grant_credentials,public.tutor_attempts,public.tutor_replies,public.tutor_suggestions,
 public.tutor_recovered_replies from public,anon,authenticated,service_role;

-- Existing installations already have the account-deletion guard. On a fresh
-- database its later migration installs the same trigger on every owner table.
do $tutor_delete_guards$
declare name text;
begin
 if to_regprocedure('public.lemma_block_account_deletion_writes()') is not null then
  foreach name in array array['tutor_threads','tutor_turns','tutor_grants','tutor_attempts','tutor_replies','tutor_suggestions','tutor_recovered_replies'] loop
   execute format('create trigger lemma_account_delete_write_guard before insert or update or delete on public.%I for each row execute function public.lemma_block_account_deletion_writes()',name);
  end loop;
 end if;
end $tutor_delete_guards$;

-- Only owner-scoped, exportable records enter the existing snapshot registry.
-- These sealed tables have no study-journal triggers or generic write routes.
insert into public.lemma_undo_tables(table_name) values
 ('tutor_threads'),('tutor_turns'),('tutor_grants'),('tutor_attempts'),
 ('tutor_replies'),('tutor_suggestions'),('tutor_recovered_replies');

-- Private serializer. The host profile gets the pending question from its own turn;
-- only an authenticated owner can retrieve the thread, replies and recovery history.
create function public.tutor_turn_json(p_user uuid, p_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $dto$
 select jsonb_strip_nulls(jsonb_build_object(
  'id',t.id,'threadId',t.thread_id,'sequence',t.sequence,'version',t.version,
  'status',case t.status when 'pending' then 'awaiting-tutor' else t.status end,
  'snapshot',t.snapshot,'createdAt',t.created_at,
  'claimExpiresAt',(select a.lease_until from public.tutor_attempts a
   where a.turn_id=t.id and a.generation=t.generation and a.finished_at is null
   and a.lease_until>statement_timestamp()),
  'finalReply',case when r.id is not null then jsonb_build_object(
   'turnId',t.id,'messageId',r.id,'body',r.body,'citations',r.citations,
   'provenance',case r.provenance when 'manual' then '{"kind":"manual-import","label":"Imported by you"}'::jsonb
    else jsonb_build_object('kind','connector','reportedHost',r.reported_host,'hostVerified',false) end,
   'suggestions',coalesce((select jsonb_agg(jsonb_build_object('intentId',s.id,'kind',p.kind,
     'summary',p.reason,'sourceMessageId',r.id,'status',p.status,'proposalId',p.id) order by p.no)
    from public.tutor_suggestions s join public.proposals p on p.id=s.proposal_id and p.user_id=t.user_id
    where s.turn_id=t.id),'[]'::jsonb)) end))
 from public.tutor_turns t left join public.tutor_replies r on r.turn_id=t.id
 where t.user_id=p_user and t.id=p_id
$dto$;
revoke all on function public.tutor_turn_json(uuid,uuid) from public,anon,authenticated,service_role;

create function public.tutor_thread_state(p_owner uuid,p_slug text,p_checkpoint uuid,p_before bigint default null)
returns jsonb language plpgsql stable security definer set search_path='' as $state$
declare
 u uuid:=auth.uid(); cp public.checkpoints%rowtype; h public.tutor_threads%rowtype;
 items jsonb; first_sequence bigint; pending uuid;
begin
 if current_setting('role',true) is distinct from 'authenticated' or u is null or u is distinct from p_owner then
  raise exception 'Sign in to this account to open the tutor' using errcode='42501';
 end if;
 select c.* into cp from public.checkpoints c join public.projects p on p.id=c.project_id and p.user_id=c.user_id
 where c.id=p_checkpoint and c.user_id=u and p.slug=p_slug;
 if not found or exists(select 1 from public.account_deletion_requests d where d.user_id=u) then raise exception 'Checkpoint is unavailable' using errcode='42501'; end if;
 select * into h from public.tutor_threads where user_id=u and checkpoint_id=cp.id;
 select jsonb_agg(public.tutor_turn_json(u,x.id) order by x.sequence),min(x.sequence) into items,first_sequence
 from (select id,sequence from public.tutor_turns where thread_id=h.id and (p_before is null or sequence<p_before)
  order by sequence desc limit 40) x;
 select id into pending from public.tutor_turns where thread_id=h.id and status='pending';
 return jsonb_build_object(
  'head',jsonb_build_object('threadId',h.id,'lastSequence',coalesce(h.last_sequence,0),'pendingTurnId',pending),
  'turns',coalesce(items,'[]'::jsonb),'before',case when first_sequence>1 then first_sequence end,
  'canSubmit',public.lemma_plan_released() and exists(select 1 from public.tutor_release_controls where capability='manual' and enabled),
  'canConnect',public.lemma_plan_released() and exists(select 1 from public.tutor_release_controls where capability='mcp' and enabled),
  'recoveredDrafts',coalesce((select jsonb_agg(jsonb_build_object('draftId',d.id,'messageId',d.message_id,'turnId',d.turn_id,'body',d.body) order by d.created_at)
   from public.tutor_recovered_replies d join public.tutor_turns t on t.id=d.turn_id
   where t.thread_id=h.id and t.sequence>=first_sequence and (p_before is null or t.sequence<p_before)),'[]'::jsonb));
end $state$;
revoke all on function public.tutor_thread_state(uuid,text,uuid,bigint) from public,anon,service_role;
grant execute on function public.tutor_thread_state(uuid,text,uuid,bigint) to authenticated;

-- The owner previews one bounded page excerpt of the checkpoint's linked source.
-- This function has no service or grant entry point.
create function public.tutor_source_preview(p_owner uuid,p_slug text,p_checkpoint uuid,p_page integer)
returns jsonb language plpgsql stable security definer set search_path='' as $page$
declare u uuid:=auth.uid(); selection jsonb;
begin
 if current_setting('role',true) is distinct from 'authenticated' or u is null or u is distinct from p_owner
  or not public.lemma_plan_released() or exists(select 1 from public.account_deletion_requests d where d.user_id=u) then
  raise exception 'Authenticated tutor owner required' using errcode='42501'; end if;
 select jsonb_build_object('kind','source','refId',s.id,'version',pg.version::text,'page',pg.page,'excerpt',left(pg.body,1000))
  into selection from public.checkpoints c join public.projects proj on proj.id=c.project_id and proj.user_id=u
  join public.sources s on s.id=c.source_id and s.project_id=c.project_id and s.user_id=u
  join public.source_pages pg on pg.source_id=s.id and pg.user_id=u and pg.page=p_page
  where c.user_id=u and c.id=p_checkpoint and proj.slug=p_slug and s.status='ready' and btrim(pg.body)<>'';
 if not found then raise exception 'Linked source page unavailable' using errcode='22023'; end if;
 return selection;
end $page$;
revoke all on function public.tutor_source_preview(uuid,text,uuid,integer) from public,anon,service_role;
grant execute on function public.tutor_source_preview(uuid,text,uuid,integer) to authenticated;

-- A suggestion creates a pending proposal. The normal owner review still
-- owns the approval. No direct mode, arbitrary resource, source or cross-project link.
create function public.tutor_add_suggestion(p_user uuid,p_turn uuid,p_project uuid,p_cp public.checkpoints,p jsonb)
returns uuid language plpgsql security invoker set search_path='' as $suggest$
declare
 proposal uuid; reason text:=p->>'summary'; kind text:=p->>'kind'; payload jsonb; item jsonb; base_versions jsonb:='{}';
begin
 if jsonb_typeof(p) is distinct from 'object' or reason is null or (reason) !~ '[^[:space:]]' or length(reason)>300 then
  raise exception 'Suggestion needs a bounded summary' using errcode='22023';
 end if;
  if kind='card' and (p-array['kind','summary','front','back'])='{}' then
   if jsonb_typeof(p->'front') is distinct from 'string' or (p->>'front') !~ '[^[:space:]]' or length(p->>'front')>1500
    or jsonb_typeof(p->'back') is distinct from 'string' or length(p->>'back')>3000 then raise exception 'Invalid proposed card'; end if;
   payload:=jsonb_build_object('front',p->>'front','back',p->>'back','type','basic','kind','other','checkpoint',p_cp.code);
  elsif kind='plan' and (p-array['kind','summary','checkpoints'])='{}' then
   if jsonb_typeof(p->'checkpoints') is distinct from 'array' or jsonb_array_length(p->'checkpoints') not between 1 and 5 then
    raise exception 'Propose one to five checkpoints' using errcode='22023'; end if;
   payload:=jsonb_build_object('ops','[]'::jsonb);
   for item in select value from jsonb_array_elements(p->'checkpoints') loop
    if jsonb_typeof(item) is distinct from 'object' or (item-array['title','objective','criterion','steps'])<>'{}'
     or jsonb_typeof(item->'title') is distinct from 'string' or length(btrim(item->>'title')) not between 1 and 80
     or jsonb_typeof(item->'objective') is distinct from 'string' or length(btrim(item->>'objective')) not between 1 and 400
     or jsonb_typeof(item->'criterion') is distinct from 'string' or length(btrim(item->>'criterion')) not between 1 and 400
     or item->'steps' is null or not public.lemma_valid_steps(item->'steps') then raise exception 'Invalid proposed checkpoint' using errcode='22023'; end if;
    payload:=jsonb_set(payload,'{ops}',(payload->'ops')||jsonb_build_object('op','add','title',btrim(item->>'title'),
     'objective',btrim(item->>'objective'),'criterion',btrim(item->>'criterion'),'steps',item->'steps'));
   end loop;
   kind:='plan_change';
  elsif kind='change' and (p-array['kind','summary','objective','version'])='{}' then
   if jsonb_typeof(p->'objective') is distinct from 'string' or (p->>'objective') !~ '[^[:space:]]' or length(p->>'objective')>400
    or (p->>'version')::integer is distinct from p_cp.version then raise exception 'Invalid checkpoint change'; end if;
   payload:=jsonb_build_object('ops',jsonb_build_array(jsonb_build_object('op','update','code',p_cp.code,'objective',p->>'objective')));
   base_versions:=jsonb_build_object('checkpoints',jsonb_build_object(p_cp.id::text,p_cp.version));
   kind:='plan_change';
  else raise exception 'Unsupported study suggestion' using errcode='22023'; end if;
  insert into public.proposals(user_id,project_id,kind,payload,reason,origin,base_target_versions) values(p_user,p_project,kind,payload,reason,'other',base_versions) returning id into proposal;
 insert into public.tutor_suggestions(user_id,turn_id,proposal_id) values(p_user,p_turn,proposal);
 return proposal;
end $suggest$;
revoke all on function public.tutor_add_suggestion(uuid,uuid,uuid,public.checkpoints,jsonb) from public,anon,authenticated,service_role;

-- Called only from the session and grant boundaries below. Serialize a checkpoint
-- across transports, then use the shared owner-wide operation receipt transaction.
create function public.tutor_apply(u uuid, cp_id uuid, target_slug text, actor_grant uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path='' as $apply$
declare
 op text:=p->>'operation'; opid uuid:=(p->>'operationId')::uuid;
 target_turn uuid:=(p->>'turnId')::uuid; expected integer:=(p->>'expectedVersion')::integer;
 cp public.checkpoints%rowtype; h public.tutor_threads%rowtype; t public.tutor_turns%rowtype;
 g public.tutor_grants%rowtype; a public.tutor_attempts%rowtype;
 stamp timestamptz; req jsonb; receipt jsonb; output jsonb; snapshot jsonb;
 citations jsonb; suggestions jsonb; suggestion jsonb; selected jsonb:='[]';
 excerpt text:=p->>'localExcerpt'; msg uuid:=(p->>'messageId')::uuid;
 source_selection jsonb; response text:=p->>'body'; proposal uuid; revoked_grant uuid;
begin
 if jsonb_typeof(p) is distinct from 'object' or pg_column_size(p)>65536 or op is null then
  raise exception 'Invalid tutor operation' using errcode='22023';
 end if;
 if not public.lemma_plan_released() then raise exception 'Tutor is unavailable' using errcode='55000'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text||':tutor:'||cp_id::text,0));
 select c.* into cp from public.checkpoints c join public.projects proj on proj.id=c.project_id and proj.user_id=c.user_id
 where c.id=cp_id and c.user_id=u and (target_slug is null or proj.slug=target_slug) for share of c,proj;
 if not found or exists(select 1 from public.account_deletion_requests d where d.user_id=u) then raise exception 'Checkpoint is unavailable' using errcode='42501'; end if;
 select * into h from public.tutor_threads where user_id=u and checkpoint_id=cp.id;
 if op<>'start' then
  select x.* into t from public.tutor_turns x where x.user_id=u and x.thread_id=h.id and x.id=target_turn;
  if not found then raise exception 'Turn is unavailable' using errcode='42501'; end if;
 end if;
 stamp:=clock_timestamp();
 if actor_grant is not null then
  if op not in ('get','claim','renew','reply')
   or not exists(select 1 from public.tutor_release_controls where capability='mcp' and enabled) then
   raise exception 'Tutor transport is unavailable' using errcode='42501';
  end if;
  select x.* into g from public.tutor_grants x where x.id=actor_grant and x.user_id=u and x.turn_id=t.id
   and x.revoked_at is null and x.expires_at>stamp;
  if not found then raise exception 'Tutor grant is unavailable' using errcode='42501'; end if;
  if op='get' then
   if t.status='pending' then return jsonb_build_object('turnId',t.id,'version',t.version,
    'generation',t.generation,'status',t.status,'snapshot',t.snapshot); end if;
   return jsonb_build_object('turnId',t.id,'version',t.version,'status',t.status);
  end if;
  if op in ('renew','reply') then
   select x.* into a from public.tutor_attempts x where x.id=(p->>'claimId')::uuid
    and x.grant_id=g.id and x.turn_id=t.id and x.generation=t.generation and x.generation=(p->>'generation')::integer;
   if not found or (op='renew' and a.finished_at is not null) then raise exception 'The claim is no longer current' using errcode='42501'; end if;
   -- A completed attempt can recover its committed receipt. A valid host racing
   -- a manual import may still save a recoverable copy within its original lease.
   if not (a.finished_at is not null and a.reason in ('reply','manual-recovered')) and
      (a.lease_until<=stamp or (a.finished_at is not null and a.reason<>'manual')) then
    raise exception 'Claim expired. Claim the turn again.' using errcode='42501';
   end if;
  end if;
 elsif op not in ('start','manual','grant','revoke','switch','cancel','suggest_card') then
  raise exception 'Unsupported owner operation' using errcode='42501';
 end if;
 if (p-array['operation','operationId','turnId','expectedVersion']-
  case op when 'start' then array['question','localExcerpt','objective','source'] when 'grant' then array['tokenHash']
   when 'manual' then array['messageId','body'] when 'reply' then array['messageId','body','claimId','generation','citations','suggestions','reportedHost']
   when 'renew' then array['claimId','generation'] when 'revoke' then array['grantId']
   when 'suggest_card' then array['front','back'] else array[]::text[] end)<>'{}' then
  raise exception 'Unexpected tutor command fields' using errcode='22023'; end if;
 if opid is null then raise exception 'An operation ID is required' using errcode='22023'; end if;
 req:=jsonb_build_object('scope',cp.id,'actorGrant',actor_grant,'v',1,'command',p);
 receipt:=public.lemma_trusted_receipt_begin(u,opid,'tutor',req);
 if receipt is not null then
  if op='claim' and receipt->>'status'='claimed' and not exists(
    select 1 from public.tutor_attempts x where x.id=(receipt->>'claimId')::uuid and x.grant_id=actor_grant
     and x.generation=t.generation and x.finished_at is null and x.lease_until>stamp) then
    raise exception 'The claim is no longer current' using errcode='42501'; end if;
  return receipt;
 end if;

 if op='reply' and a.finished_at is not null and a.reason in ('reply','manual-recovered') then
  raise exception 'This claim has already submitted its reply' using errcode='40001'; end if;
 if op='start' then
  if not exists(select 1 from public.tutor_release_controls where capability='manual' and enabled) then
   raise exception 'Tutor questions are unavailable' using errcode='55000'; end if;
  if jsonb_typeof(p->'question') is distinct from 'string' or (p->>'question') !~ '[^[:space:]]' or length(p->>'question')>2000
   or (p?'localExcerpt' and (jsonb_typeof(p->'localExcerpt') is distinct from 'string' or (excerpt) !~ '[^[:space:]]'
    or length(excerpt)+regexp_count(excerpt,U&'[\+010000-\+10FFFF]')>1200)) then
   raise exception 'Invalid question or selected excerpt' using errcode='22023'; end if;
  if p?'objective' then
   if jsonb_typeof(p->'objective') is distinct from 'string' or p->>'objective' is distinct from cp.objective
    then raise exception 'Checkpoint objective changed; review it again' using errcode='40001'; end if;
   selected:=jsonb_build_array(jsonb_build_object('kind','checkpoint','refId',cp.id,'version',cp.version::text,'excerpt',cp.objective));
  end if;
  if p?'source' then
   source_selection:=public.tutor_source_preview(u,target_slug,cp.id,(p->'source'->>'page')::integer);
   if source_selection is distinct from p->'source' then raise exception 'Source page changed; preview it again' using errcode='40001'; end if;
   selected:=selected||jsonb_build_array(source_selection);
  end if;
  if expected is distinct from coalesce(h.last_sequence,0)::integer or exists(
    select 1 from public.tutor_turns x where x.thread_id=h.id and x.status='pending') then
   return public.lemma_trusted_receipt_finish(u,opid,'tutor',req,jsonb_build_object('operationId',opid,'status','turn-pending')); end if;
  if h.id is null then
   insert into public.tutor_threads(user_id,project_id,checkpoint_id) values(u,cp.project_id,cp.id) returning * into h;
  end if;
  snapshot:=jsonb_build_object('question',p->>'question','selectedContext',selected);
  if excerpt is not null then snapshot:=snapshot||jsonb_build_object('localExcerpt',jsonb_build_object('kind','local-excerpt','text',excerpt)); end if;
  update public.tutor_threads set last_sequence=last_sequence+1,updated_at=stamp where id=h.id returning * into h;
  insert into public.tutor_turns(client_turn_id,user_id,thread_id,sequence,snapshot)
   values(opid,u,h.id,h.last_sequence,snapshot) returning * into t;
  output:=jsonb_build_object('status','submitted','sequence',t.sequence);

 elsif op='grant' then
  if not exists(select 1 from public.tutor_release_controls where capability='mcp' and enabled) then
   raise exception 'Tutor connector is unavailable' using errcode='55000'; end if;
  if t.status<>'pending' or expected is distinct from t.version then raise exception 'Turn changed' using errcode='40001'; end if;
  if (p->>'tokenHash') is null or (p->>'tokenHash') !~ '^[a-f0-9]{64}$' then raise exception 'Invalid grant' using errcode='22023'; end if;
  insert into public.tutor_grants(user_id,turn_id,expires_at) values(u,t.id,stamp+interval '1 day') returning * into g;
  insert into public.tutor_grant_credentials(grant_id,token_hash) values(g.id,p->>'tokenHash');
  output:=jsonb_build_object('status','granted','grantId',g.id,'expiresAt',stamp+interval '1 day');

 elsif op in ('switch','revoke','cancel') then
  if expected is distinct from t.version then raise exception 'Turn changed' using errcode='40001'; end if;
  if op='revoke' then
   update public.tutor_grants set revoked_at=stamp where id=(p->>'grantId')::uuid and user_id=u and tutor_grants.turn_id=t.id
    returning id into revoked_grant;
   if not found then raise exception 'Grant unavailable' using errcode='42501'; end if;
   update public.tutor_attempts set finished_at=stamp,reason='revoked' where tutor_attempts.grant_id=revoked_grant and finished_at is null;
  else
   if t.status<>'pending' then raise exception 'Turn changed' using errcode='40001'; end if;
   update public.tutor_grants set revoked_at=stamp where tutor_grants.turn_id=t.id and revoked_at is null;
   update public.tutor_attempts set finished_at=stamp,reason=op where tutor_attempts.turn_id=t.id and finished_at is null;
   update public.tutor_turns set generation=generation+1,version=version+1,status=case when op='cancel' then 'cancelled' else status end
    where id=t.id returning * into t;
  end if;
  output:=jsonb_build_object('status',op);

 elsif op='claim' then
  if t.status<>'pending' or expected is distinct from t.version then raise exception 'Turn changed' using errcode='40001'; end if;
  if exists(select 1 from public.tutor_attempts x where x.turn_id=t.id and x.finished_at is null and x.lease_until>stamp) then
   raise exception 'Another tutor is answering' using errcode='40001'; end if;
  update public.tutor_attempts set finished_at=stamp,reason='expired' where tutor_attempts.turn_id=t.id and finished_at is null;
  update public.tutor_turns set version=version+1,generation=generation+1 where id=t.id returning * into t;
  insert into public.tutor_attempts(user_id,turn_id,grant_id,generation,lease_until) values(u,t.id,g.id,t.generation,
   least(stamp+interval '5 minutes',g.expires_at)) returning * into a;
  output:=jsonb_build_object('status','claimed','claimId',a.id,'generation',a.generation,'leaseUntil',a.lease_until);

 elsif op='renew' then
  if t.status<>'pending' or a.finished_at is not null or a.lease_until<=stamp then raise exception 'Claim expired' using errcode='40001'; end if;
  update public.tutor_attempts set lease_until=least(stamp+interval '5 minutes',g.expires_at) where id=a.id returning * into a;
  output:=jsonb_build_object('status','renewed','claimId',a.id,'generation',a.generation,'leaseUntil',a.lease_until);

 elsif op in ('manual','reply') then
  if msg is null or jsonb_typeof(p->'body') is distinct from 'string' or (response) !~ '[^[:space:]]' or length(response)>12000 then
   raise exception 'A valid reply is required' using errcode='22023'; end if;
  if t.status='completed' then
   insert into public.tutor_recovered_replies(id,message_id,user_id,turn_id,body) values(opid,msg,u,t.id,response);
   if op='reply' then update public.tutor_attempts set reason='manual-recovered' where id=a.id; end if;
   output:=jsonb_build_object('status','already-completed','draftId',opid);
  else
   if t.status<>'pending' or expected is distinct from t.version then raise exception 'Turn changed' using errcode='40001'; end if;
   if op='reply' and (a.finished_at is not null or a.lease_until<=stamp) then raise exception 'Claim expired' using errcode='42501'; end if;
   citations:=coalesce(p->'citations','[]'); suggestions:=coalesce(p->'suggestions','[]');
   if jsonb_typeof(citations)<>'array' or jsonb_typeof(suggestions)<>'array'
    or jsonb_array_length(citations)>8 or jsonb_array_length(suggestions)>4 then raise exception 'Invalid reply attachments'; end if;
   if op='manual' and (citations<>'[]' or suggestions<>'[]') then raise exception 'Manual imports accept text only'; end if;
   if exists(select 1 from jsonb_array_elements(citations) x where not exists(
    select 1 from jsonb_array_elements(t.snapshot->'selectedContext') s where (s-'excerpt')=x)) then
    raise exception 'Citation was not selected' using errcode='22023'; end if;
   if p?'reportedHost' and (jsonb_typeof(p->'reportedHost') is distinct from 'string' or length(btrim(p->>'reportedHost')) not between 1 and 100)
    then raise exception 'Invalid reported host' using errcode='22023'; end if;
   insert into public.tutor_replies(turn_id,id,user_id,body,provenance,reported_host,citations)
    values(t.id,msg,u,response,case op when 'manual' then 'manual' else 'connector' end,btrim(p->>'reportedHost'),citations);
   for suggestion in select value from jsonb_array_elements(suggestions) loop
    perform public.tutor_add_suggestion(u,t.id,cp.project_id,cp,suggestion);
   end loop;
   update public.tutor_attempts set finished_at=stamp,reason=op where tutor_attempts.turn_id=t.id and finished_at is null;
   update public.tutor_turns set status='completed',version=version+1 where id=t.id returning * into t;
   output:=jsonb_build_object('status','completed','messageId',msg);
  end if;

 elsif op='suggest_card' then
  if t.status<>'completed' or expected is distinct from t.version then raise exception 'Reply changed' using errcode='40001'; end if;
  proposal:=public.tutor_add_suggestion(u,t.id,cp.project_id,cp,jsonb_build_object('kind','card','summary','From a reviewed tutor reply',
   'front',p->'front','back',p->'back'));
  output:=jsonb_build_object('status','proposed','proposalId',proposal);
 end if;
 if op<>'start' then update public.tutor_threads set updated_at=stamp where id=h.id; end if;
 output:=output||jsonb_build_object('operationId',opid,'turnId',t.id,'version',t.version);
 return public.lemma_trusted_receipt_finish(u,opid,'tutor',req,output);
end $apply$;
revoke all on function public.tutor_apply(uuid,uuid,text,uuid,jsonb) from public,anon,authenticated,service_role;

create function public.tutor_owner_command(p_owner uuid,p_slug text,p_checkpoint uuid,p_command jsonb)
returns jsonb language plpgsql security definer set search_path='' as $owner$
declare u uuid:=auth.uid();
begin
 if current_setting('role',true) is distinct from 'authenticated' or u is null or u is distinct from p_owner or p_slug is null then
  raise exception 'Authenticated owner required' using errcode='42501'; end if;
 return public.tutor_apply(u,p_checkpoint,p_slug,null,p_command);
end $owner$;
revoke all on function public.tutor_owner_command(uuid,text,uuid,jsonb) from public,anon,service_role;
grant execute on function public.tutor_owner_command(uuid,text,uuid,jsonb) to authenticated;

create function public.tutor_grant_command(p_token_hash text,p_command jsonb)
returns jsonb language plpgsql security definer set search_path='' as $grant$
declare g public.tutor_grants%rowtype; cp uuid;
begin
 if current_setting('role',true) is distinct from 'service_role' then raise exception 'Restricted tutor transport' using errcode='42501'; end if;
 select x.* into g from public.tutor_grant_credentials cred join public.tutor_grants x on x.id=cred.grant_id
 where cred.token_hash=p_token_hash and x.revoked_at is null and x.expires_at>clock_timestamp()
 and x.turn_id=(p_command->>'turnId')::uuid;
 if not found then raise exception 'Tutor grant is unavailable' using errcode='42501'; end if;
 select h.checkpoint_id into strict cp from public.tutor_turns t join public.tutor_threads h on h.id=t.thread_id
 where t.id=g.turn_id and t.user_id=g.user_id and h.user_id=g.user_id;
 return public.tutor_apply(g.user_id,cp,null,g.id,p_command);
end $grant$;
revoke all on function public.tutor_grant_command(text,jsonb) from public,anon,authenticated;
grant execute on function public.tutor_grant_command(text,jsonb) to service_role;

create function public.tutor_grant_active(p_token_hash text) returns boolean
language sql stable security definer set search_path='' as $active$
 select public.lemma_plan_released() and current_setting('role',true)='service_role'
 and exists(select 1 from public.tutor_release_controls where capability='mcp' and enabled)
 and exists(select 1 from public.tutor_grant_credentials c join public.tutor_grants g on g.id=c.grant_id
            where c.token_hash=p_token_hash and g.revoked_at is null and g.expires_at>statement_timestamp())
$active$;
revoke all on function public.tutor_grant_active(text) from public,anon,authenticated;
grant execute on function public.tutor_grant_active(text) to service_role;
