-- Store connector-authored follow-up questions with their accepted replies.
-- Existing final replies have no separate question to recover.
alter table public.tutor_replies add column next_question text
 check (next_question is null or (provenance='connector' and char_length(next_question) between 1 and 12000
  and next_question ~ '[^[:space:]]' and strpos(body,next_question)>0));

create or replace function public.tutor_apply(u uuid, cp_id uuid, target_slug text, actor_grant uuid, p jsonb,p_recover_only boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $apply$
declare
 op text:=p->>'operation'; opid uuid:=(p->>'operationId')::uuid;
 target_turn uuid:=(p->>'turnId')::uuid; expected integer:=(p->>'expectedVersion')::integer;
 cp public.checkpoints%rowtype; h public.tutor_threads%rowtype; t public.tutor_turns%rowtype;
 g public.tutor_grants%rowtype; a public.tutor_attempts%rowtype;
 stamp timestamptz; req jsonb; receipt jsonb; output jsonb; snapshot jsonb;
 citations jsonb; suggestions jsonb; suggestion jsonb; selected jsonb:='[]';
 excerpt text:=p->>'localExcerpt'; msg uuid:=(p->>'messageId')::uuid;
 source_selection jsonb; response text:=p->>'body'; question_text text:=p->>'nextQuestion';
 proposal uuid; revoked_grant uuid;
begin
 if jsonb_typeof(p) is distinct from 'object' or pg_column_size(p)>65536 or op is null then
  raise exception 'Invalid tutor operation' using errcode='22023';
 end if;
 -- A launch hold must still let the authenticated owner recover the receipt
 -- of a committed operation. Grants stay disabled and new writes remain held.
 if not public.tutor_plan_released() and (actor_grant is not null or
   to_regprocedure('public.lemma_trusted_receipt_begin(uuid,uuid,text,jsonb)') is null) then
  raise exception 'Tutor is unavailable' using errcode='55000';
 end if;
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
   when 'manual' then array['messageId','body'] when 'reply' then array['messageId','body','nextQuestion','claimId','generation','citations','suggestions','reportedHost']
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

 -- Used by a held/offline-recovery UI: checking an unknown acknowledgement
 -- must never submit a command that did not already commit.
 if p_recover_only then return jsonb_build_object('operationId',opid,'status','unconfirmed'); end if;

 if not public.tutor_plan_released() then raise exception 'Tutor is unavailable' using errcode='55000'; end if;

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
  if p?'nextQuestion' and (jsonb_typeof(p->'nextQuestion') is distinct from 'string'
   or char_length(question_text)>12000 or question_text !~ '[^[:space:]]' or strpos(response,question_text)=0) then
   raise exception 'The next question must appear verbatim in the reply' using errcode='22023'; end if;
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
   insert into public.tutor_replies(turn_id,id,user_id,body,provenance,reported_host,citations,next_question)
    values(t.id,msg,u,response,case op when 'manual' then 'manual' else 'connector' end,btrim(p->>'reportedHost'),citations,question_text);
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

create or replace function public.tutor_connector_command(
 p_owner uuid, p_connector_hash text, p_grant_operation_id uuid, p_command jsonb
) returns jsonb language plpgsql security definer set search_path='' as $connector$
declare
 secret text;
 target_turn uuid;
 anchor_grant uuid;
 anchor_thread uuid;
 anchor_sequence bigint;
 operation text:=p_command->>'operation';
 list_pending boolean:=p_command is null and p_grant_operation_id is null;
 result jsonb;
 verifier text;
 previous_question text;
 checkpoint jsonb;
begin
 if current_setting('role',true) is distinct from 'service_role' then
  raise exception 'Restricted tutor connector' using errcode='42501';
 end if;
 select s.connector_secret into secret from public.settings s
 where s.user_id=p_owner and encode(sha256(convert_to(s.connector_secret,'UTF8')),'hex')=p_connector_hash;
 if not found or not public.tutor_plan_released()
  or not exists(select 1 from public.tutor_release_controls where capability='mcp' and enabled)
  or exists(select 1 from public.account_deletion_requests d where d.user_id=p_owner) then
  raise exception 'Tutor connector unavailable' using errcode='42501';
 end if;

 if not list_pending then
  if p_grant_operation_id is null or jsonb_typeof(p_command) is distinct from 'object'
   or coalesce(operation,'') not in ('get','claim','renew','reply','next') then
   raise exception 'Invalid tutor connector command' using errcode='22023';
  end if;
  target_turn:=(p_command->>'turnId')::uuid;
  verifier:=public.tutor_connector_verifier(secret,target_turn,p_grant_operation_id);
  select g.id into anchor_grant from public.command_receipts r
  join public.tutor_grants g on g.user_id=r.user_id and g.id::text=r.result->>'grantId'
  join public.tutor_grant_credentials c on c.grant_id=g.id
  where r.user_id=p_owner and r.operation_id=p_grant_operation_id and r.resource='tutor'
   and r.trusted_writer_version=1 and r.result->>'status'='granted'
   and g.turn_id=target_turn and g.revoked_at is null and g.expires_at>clock_timestamp() and c.token_hash=verifier;
  if not found then raise exception 'Tutor connector unavailable' using errcode='42501'; end if;
  if operation='next' then
   select t.thread_id,t.sequence into anchor_thread,anchor_sequence
   from public.tutor_turns t join public.tutor_attempts a on a.turn_id=t.id and a.user_id=t.user_id
   where t.user_id=p_owner and t.id=target_turn and t.status='completed'
    and a.grant_id=anchor_grant and a.reason='reply';
   if not found then raise exception 'Tutor connector unavailable' using errcode='42501'; end if;
  end if;
 end if;

 if list_pending or operation='next' then
  select jsonb_agg(jsonb_build_object('id',p.turn_id::text||'.'||p.operation_id::text)
     order by p.created_at desc,p.turn_id)
  into result
  from (
   select available.* from (
    select distinct on (g.turn_id) g.turn_id,r.operation_id,g.created_at
    from public.tutor_grants g
    join public.tutor_turns t on t.id=g.turn_id and t.user_id=g.user_id
    join public.tutor_grant_credentials c on c.grant_id=g.id
    join public.command_receipts r on r.user_id=g.user_id and r.resource='tutor'
     and r.trusted_writer_version=1 and r.result->>'status'='granted' and r.result->>'grantId'=g.id::text
    where g.user_id=p_owner and g.revoked_at is null and g.expires_at>clock_timestamp() and t.status='pending'
     and (anchor_thread is null or (t.thread_id=anchor_thread and t.sequence>anchor_sequence))
     and c.token_hash=public.tutor_connector_verifier(secret,g.turn_id,r.operation_id)
    order by g.turn_id,g.created_at desc,g.id
   ) available order by available.created_at desc,available.turn_id limit 10
  ) p;
  if operation='next' then return result->0; end if;
  return coalesce(result,'[]'::jsonb);
 end if;

 result:=public.tutor_grant_command(verifier,p_command);
 -- The delegated command locks this settings row when it records activity.
 -- If a secret rotation won that race, roll back the delegated command.
 if not exists(select 1 from public.settings s where s.user_id=p_owner and s.connector_secret=secret) then
  raise exception 'Tutor connector unavailable' using errcode='42501';
 end if;
 if operation='get' and result->>'status'='pending' then
  select jsonb_build_object('code',cp.code,'title',cp.title) into checkpoint
  from public.tutor_turns t
  join public.tutor_threads h on h.id=t.thread_id and h.user_id=t.user_id
  join public.checkpoints cp on cp.id=h.checkpoint_id and cp.user_id=h.user_id
  where t.id=target_turn and t.user_id=p_owner;
  if checkpoint is not null then result:=result||jsonb_build_object('checkpoint',checkpoint); end if;
  -- Older clients and manual imports have no structured question. Keep their
  -- bounded final-paragraph hint and prefer the exact field whenever present.
  select coalesce(r.next_question,
   right(regexp_replace(rtrim(replace(r.body,chr(13),''), E' \t\n'), '(?s)^.*\n[[:blank:]]*\n',''),1500))
  into previous_question
  from public.tutor_turns target
  join public.tutor_turns prior on prior.user_id=target.user_id and prior.thread_id=target.thread_id
   and prior.sequence<target.sequence
  join public.tutor_replies r on r.user_id=prior.user_id and r.turn_id=prior.id
  where target.user_id=p_owner and target.id=target_turn
  order by prior.sequence desc limit 1;
  if nullif(btrim(previous_question),'') is not null then
   result:=result||jsonb_build_object('previousTutorQuestion',previous_question);
  end if;
 end if;
 return result;
end $connector$;
