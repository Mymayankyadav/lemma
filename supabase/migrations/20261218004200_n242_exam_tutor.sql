-- The checkpoint store's non-null and unique checkpoint key is part of the
-- established contract. Sitting threads have their own store and use the same
-- owner and connector RPCs; no synthetic course data is needed.
create table public.exam_tutor_threads (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 project_id uuid not null,
 sitting_id uuid not null unique,
 last_sequence bigint not null default 0,
 listener_seen_at timestamptz,
 unique(user_id,id),
 unique(user_id,sitting_id,id),
 foreign key(user_id,project_id,sitting_id) references public.exam_sittings(user_id,project_id,id) on delete cascade
);
create table public.exam_tutor_turns (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 thread_id uuid not null,
 sequence bigint not null,
 operation_id uuid not null,
 version integer not null default 1,
 generation integer not null default 0,
 status text not null default 'pending' check(status in ('pending','completed','cancelled')),
 snapshot jsonb not null,
 reply jsonb,
 followups jsonb not null default '[]',
 attachments jsonb not null default '[]',
 deleted_messages jsonb not null default '[]',
 recovered_drafts jsonb not null default '[]',
 created_at timestamptz not null default clock_timestamp(),
 unique(user_id,id), unique(user_id,operation_id), unique(thread_id,sequence),
 foreign key(user_id,thread_id) references public.exam_tutor_threads(user_id,id) on delete cascade
);
create unique index exam_tutor_one_pending on public.exam_tutor_turns(thread_id) where status='pending';

create table public.exam_tutor_grants (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 turn_id uuid not null,
 operation_id uuid not null,
 token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
 expires_at timestamptz not null,
 revoked_at timestamptz,
 claim_id uuid,
 generation integer,
 lease_until timestamptz,
 replied boolean not null default false,
 unique(user_id,operation_id),
 foreign key(user_id,turn_id) references public.exam_tutor_turns(user_id,id) on delete cascade
);
create index exam_tutor_grants_turn on public.exam_tutor_grants(user_id,turn_id);
create table public.exam_tutor_questionnaires (
 id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 turn_id uuid not null,
 title text not null check(length(title) between 1 and 120),
 purpose text not null check(purpose in ('diagnose','check','practice','reflect','exit')),
 questions jsonb not null check(public.tutor_questionnaire_valid(questions)),
 answers jsonb not null default '{}',
 status text not null default 'ready' check(status in ('ready','started','submitted')),
 version integer not null default 0,
 created_at timestamptz not null default clock_timestamp(),
 opened_at timestamptz,
 submitted_at timestamptz,
 updated_at timestamptz,
 unique(user_id,id),
 foreign key(user_id,turn_id) references public.exam_tutor_turns(user_id,id) on delete cascade
);
create index exam_tutor_questionnaires_turn on public.exam_tutor_questionnaires(user_id,turn_id);
create table public.tutor_questionnaire_rows (
 user_id uuid not null references auth.users(id) on delete cascade,
 questionnaire_id uuid not null,
 question_id text not null check(length(question_id) between 1 and 40),
 sitting_id uuid not null,
 row_key text not null check(row_key ~ '^[a-z0-9][a-z0-9_-]{0,39}$'),
 blueprint_version integer not null check(blueprint_version>0),
 scoring_key text not null check(length(scoring_key) between 1 and 500),
 rubric_steps jsonb not null check(jsonb_typeof(rubric_steps)='array' and jsonb_array_length(rubric_steps)<=5),
 primary key(user_id,questionnaire_id,question_id),
 foreign key(user_id,questionnaire_id) references public.exam_tutor_questionnaires(user_id,id) on delete cascade
);
create index tutor_questionnaire_rows_sitting on public.tutor_questionnaire_rows(user_id,sitting_id);

do $guards$
declare name text;
begin
 foreach name in array array['exam_tutor_threads','exam_tutor_turns','exam_tutor_grants','exam_tutor_questionnaires','tutor_questionnaire_rows'] loop
  execute format('alter table public.%I enable row level security',name);
  execute format('create trigger lemma_account_delete_write_guard before insert or update or delete on public.%I for each row execute function public.lemma_block_account_deletion_writes()',name);
 end loop;
end
$guards$;
revoke all on public.exam_tutor_threads,public.exam_tutor_turns,public.exam_tutor_grants,public.exam_tutor_questionnaires,public.tutor_questionnaire_rows
 from public,anon,authenticated,service_role;
insert into lemma_export_private.additional_tables(table_name,redact_columns) values
 ('exam_tutor_threads','{}'),('exam_tutor_turns','{}'),('exam_tutor_grants','{token_hash}'),
 ('exam_tutor_questionnaires','{}'),('tutor_questionnaire_rows','{row_key,scoring_key,rubric_steps}');

create function public.lemma_exam_tutor_scope(p_owner uuid,p_slug text,p_sitting uuid) returns public.exam_sittings
language plpgsql stable set search_path='' as $$
declare s public.exam_sittings%rowtype;
begin
 if current_setting('role',true) is distinct from 'authenticated' or auth.uid() is distinct from p_owner or p_owner is null
    or exists(select 1 from public.account_deletion_requests where user_id=p_owner) then
  raise exception 'Exam tutor unavailable' using errcode='42501';
 end if;
 select x.* into s from public.exam_sittings x join public.projects p on p.user_id=x.user_id and p.id=x.project_id
  where x.user_id=p_owner and x.id=p_sitting and p.slug=p_slug and p.status<>'archived' and not p.system;
 if not found then raise exception 'Exam tutor unavailable' using errcode='42501'; end if;
 return s;
end
$$;

create function public.lemma_exam_tutor_turn(t public.exam_tutor_turns) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_strip_nulls(jsonb_build_object('id',t.id,'threadId',t.thread_id,'sequence',t.sequence,'version',t.version,
  'status',case t.status when 'pending' then 'awaiting-tutor' else t.status end,
  'snapshot',t.snapshot||case when t.attachments<>'[]' then jsonb_build_object('attachments',t.attachments) else '{}'::jsonb end,
  'createdAt',t.created_at,'finalReply',t.reply,
  'questionDeleted',case when t.deleted_messages @> jsonb_build_array(jsonb_build_object('kind','question','id',t.id)) then true end,
  'replyDeleted',case when t.deleted_messages @> jsonb_build_array(jsonb_build_object('kind','reply','id',t.reply->>'messageId')) then true end,
  'claimExpiresAt',(select max(g.lease_until) from public.exam_tutor_grants g where g.user_id=t.user_id and g.turn_id=t.id
    and g.generation=t.generation and g.revoked_at is null and g.lease_until>statement_timestamp())))
$$;

create function public.exam_tutor_thread_state(p_owner uuid,p_slug text,p_checkpoint uuid,p_before bigint,p_sitting uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare s public.exam_sittings; h public.exam_tutor_threads; items jsonb; first_sequence bigint; pending uuid;
begin
 s:=public.lemma_exam_tutor_scope(p_owner,p_slug,p_sitting);
 select * into h from public.exam_tutor_threads where user_id=p_owner and sitting_id=s.id;
 select jsonb_agg(public.lemma_exam_tutor_turn(t::public.exam_tutor_turns) order by t.sequence),min(t.sequence) into items,first_sequence
  from (select * from public.exam_tutor_turns where user_id=p_owner and thread_id=h.id
        and (p_before is null or sequence<p_before) order by sequence desc limit 40) t;
 select id into pending from public.exam_tutor_turns where user_id=p_owner and thread_id=h.id and status='pending';
 return jsonb_build_object('readAt',statement_timestamp(),'listenerSeenAt',h.listener_seen_at,
  'head',jsonb_build_object('threadId',h.id,'lastSequence',coalesce(h.last_sequence,0),'pendingTurnId',pending),
  'turns',coalesce(items,'[]'::jsonb),'before',case when first_sequence>1 then first_sequence end,
  'canSubmit',s.status in ('planned','active') and public.tutor_plan_released() and exists(select 1 from public.tutor_release_controls where capability='manual' and enabled),
  'canConnect',public.tutor_plan_released() and exists(select 1 from public.tutor_release_controls where capability='mcp' and enabled),
  'recoveredDrafts',coalesce((select jsonb_agg(d.value order by t.sequence,d.ordinality)
   from public.exam_tutor_turns t cross join lateral jsonb_array_elements(t.recovered_drafts) with ordinality d
   where t.user_id=p_owner and t.thread_id=h.id and t.sequence>=first_sequence and (p_before is null or t.sequence<p_before)),'[]'::jsonb));
end
$$;

create function public.lemma_exam_tutor_owner(p_owner uuid,p_slug text,p_sitting uuid,p jsonb,recover_only boolean)
returns jsonb language plpgsql set search_path='' as $$
declare
 s public.exam_sittings; h public.exam_tutor_threads; t public.exam_tutor_turns; g public.exam_tutor_grants;
 operation text:=p->>'operation'; opid uuid:=public.lemma_exam_uuid(p,'operationId');
 expected int:=public.lemma_exam_number(p,'expectedVersion',0,2147483647,true);
 req jsonb; result jsonb; snapshot jsonb; meta jsonb; body text; msg uuid; prop uuid; excerpt text; seconds int;
begin
 s:=public.lemma_exam_tutor_scope(p_owner,p_slug,p_sitting);
 if opid is null or pg_column_size(p)>65536 or operation is null then raise exception 'Invalid exam tutor command' using errcode='22023'; end if;
 perform public.lemma_exam_keys(p,array['operation','operationId','turnId','expectedVersion']||
  case operation when 'start' then array['question','localExcerpt','answerMeta'] when 'grant' then array['tokenHash']
   when 'manual' then array['messageId','body'] when 'revoke' then array['grantId']
   when 'suggest_card' then array['front','back'] else array[]::text[] end);
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text||':exam-tutor:'||p_sitting::text,0));
 req:=jsonb_build_object('scope',p_sitting,'v',1,'command',p);
 result:=public.lemma_trusted_receipt_begin(p_owner,opid,'exam_tutor',req);
 if result is not null then return result; end if;
 if recover_only then return jsonb_build_object('operationId',opid,'status','unconfirmed'); end if;
 if not public.tutor_plan_released() then raise exception 'Tutor is unavailable' using errcode='55000'; end if;
 select * into h from public.exam_tutor_threads where user_id=p_owner and sitting_id=p_sitting;
 if operation='start' then
  select x.status into s.status from public.exam_sittings x where x.user_id=p_owner and x.id=p_sitting for share;
  if not found or s.status not in ('planned','active') or not exists(select 1 from public.tutor_release_controls where capability='manual' and enabled) then
   raise exception 'This sitting is paused or closed. Resume it to start a tutor turn' using errcode='55000';
  end if;
  body:=public.lemma_exam_text(p,'question',1,2000);
  excerpt:=public.lemma_exam_text(p,'localExcerpt',0,1200);
  if p?'answerMeta' then
   meta:=p->'answerMeta';
   perform public.lemma_exam_keys(meta,array['seconds','overtime']);
   seconds:=public.lemma_exam_number(meta,'seconds',0,36000,true);
   if seconds is null then raise exception 'answerMeta.seconds is required' using errcode='22023'; end if;
   perform public.lemma_exam_boolean(meta,'overtime');
  end if;
  if expected is distinct from coalesce(h.last_sequence,0)::int or exists(select 1 from public.exam_tutor_turns
     where user_id=p_owner and thread_id=h.id and status='pending') then
   return public.lemma_trusted_receipt_finish(p_owner,opid,'exam_tutor',req,jsonb_build_object('operationId',opid,'status','turn-pending'));
  end if;
  if h.id is null then
   insert into public.exam_tutor_threads(user_id,project_id,sitting_id) values(p_owner,s.project_id,p_sitting) returning * into h;
  end if;
  snapshot:=jsonb_strip_nulls(jsonb_build_object('question',body,'selectedContext','[]'::jsonb,'answerMeta',meta,
   'localExcerpt',case when excerpt is not null then jsonb_build_object('kind','local-excerpt','text',excerpt) end));
  update public.exam_tutor_threads set last_sequence=last_sequence+1 where id=h.id returning * into h;
  insert into public.exam_tutor_turns(user_id,thread_id,sequence,operation_id,snapshot)
   values(p_owner,h.id,h.last_sequence,opid,snapshot) returning * into t;
  result:=jsonb_build_object('status','submitted','sequence',t.sequence);
 else
  select x.* into t from public.exam_tutor_turns x where x.user_id=p_owner and x.thread_id=h.id
   and x.id=public.lemma_exam_uuid(p,'turnId') for update;
  if not found then raise exception 'Turn is unavailable' using errcode='42501'; end if;
  if t.version is distinct from expected and not (operation='manual' and t.status='completed') then
   raise exception 'Turn changed' using errcode='40001';
  end if;
  case operation
   when 'grant' then
    if t.status<>'pending' or not exists(select 1 from public.tutor_release_controls where capability='mcp' and enabled)
       or coalesce(p->>'tokenHash','')!~'^[a-f0-9]{64}$' then raise exception 'Tutor grant unavailable' using errcode='42501'; end if;
    insert into public.exam_tutor_grants(user_id,turn_id,operation_id,token_hash,expires_at)
     values(p_owner,t.id,opid,p->>'tokenHash',clock_timestamp()+interval '1 day') returning * into g;
    result:=jsonb_build_object('status','granted','grantId',g.id,'expiresAt',g.expires_at);
   when 'revoke' then
    update public.exam_tutor_grants set revoked_at=clock_timestamp() where user_id=p_owner and turn_id=t.id
     and id=public.lemma_exam_uuid(p,'grantId');
    if not found then raise exception 'Grant unavailable' using errcode='42501'; end if;
    result:=jsonb_build_object('status','revoke');
   when 'manual' then
    msg:=public.lemma_exam_uuid(p,'messageId');
    body:=public.lemma_exam_text(p,'body',1,12000);
    if msg is null then raise exception 'messageId is required' using errcode='22023'; end if;
    if t.status='completed' then
     update public.exam_tutor_turns set recovered_drafts=recovered_drafts||jsonb_build_array(
      jsonb_build_object('draftId',opid,'messageId',msg,'turnId',t.id,'body',body)) where id=t.id;
     result:=jsonb_build_object('status','already-completed','draftId',opid);
    elsif t.status='pending' then
     update public.exam_tutor_turns set status='completed',version=version+1,
      reply=jsonb_build_object('turnId',t.id,'messageId',msg,'body',body,'citations','[]'::jsonb,'suggestions','[]'::jsonb,
       'provenance',jsonb_build_object('kind','manual-import','label','Imported by you'))
      where id=t.id returning * into t;
     result:=jsonb_build_object('status','completed','messageId',msg);
    else raise exception 'Turn changed' using errcode='40001'; end if;
   when 'suggest_card' then
    if t.status<>'completed' then raise exception 'Reply changed' using errcode='40001'; end if;
    perform set_config('lemma.source','app',true);
    perform set_config('lemma.tool','tutor_owner_command',true);
    perform set_config('lemma.summary','Draft a card from exam tutor',true);
    insert into public.proposals(user_id,project_id,kind,payload,reason,origin)
     values(p_owner,s.project_id,'card',jsonb_build_object('front',public.lemma_exam_text(p,'front',1,1500),
      'back',coalesce(public.lemma_exam_text(p,'back',0,3000),''),'direct',false),'From an exam tutor reply','other') returning id into prop;
    result:=jsonb_build_object('status','proposed','proposalId',prop);
   when 'cancel','switch' then
    if t.status<>'pending' then raise exception 'Turn changed' using errcode='40001'; end if;
    update public.exam_tutor_grants set revoked_at=clock_timestamp() where user_id=p_owner and turn_id=t.id and revoked_at is null;
    update public.exam_tutor_turns set version=version+1,generation=generation+1,status=case when operation='cancel' then 'cancelled' else status end
     where id=t.id returning * into t;
    result:=jsonb_build_object('status',operation);
   else raise exception 'Unsupported exam tutor owner operation' using errcode='22023';
  end case;
 end if;
 return public.lemma_trusted_receipt_finish(p_owner,opid,'exam_tutor',req,
  result||jsonb_build_object('operationId',opid,'turnId',t.id,'version',t.version));
end
$$;

create function public.exam_tutor_owner_command(p_owner uuid,p_slug text,p_checkpoint uuid,p_command jsonb,p_sitting uuid)
returns jsonb language sql security definer set search_path='' as $$
 select public.lemma_exam_tutor_owner(p_owner,p_slug,p_sitting,p_command,false)
$$;
create function public.exam_tutor_owner_receipt(p_owner uuid,p_slug text,p_checkpoint uuid,p_command jsonb,p_sitting uuid)
returns jsonb language sql security definer set search_path='' as $$
 select public.lemma_exam_tutor_owner(p_owner,p_slug,p_sitting,p_command,true)
$$;

-- The regular connector authenticates the current credential before calling
-- this private implementation. Each turn still requires its grant.
create function public.lemma_exam_tutor_grant(p_owner uuid,p_turn uuid,p_operation uuid,secret text,token text default null)
returns public.exam_tutor_grants language plpgsql stable set search_path='' as $$
declare g public.exam_tutor_grants;
begin
 select * into g from public.exam_tutor_grants x where x.user_id=p_owner and x.turn_id=p_turn
  and x.operation_id=p_operation and x.revoked_at is null and x.expires_at>clock_timestamp()
  and x.token_hash=coalesce(token,public.tutor_connector_verifier(secret,p_turn,p_operation));
 if not found then raise exception 'Tutor connector unavailable' using errcode='42501'; end if;
 return g;
end
$$;

create function public.lemma_exam_tutor_pending(p_owner uuid,secret text,p_thread uuid default null,p_after bigint default 0)
returns jsonb language sql stable set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',x.id::text||'.'||x.operation_id::text) order by x.created_at desc),'[]'::jsonb)
 from (select t.id,t.created_at,g.operation_id from public.exam_tutor_turns t
  cross join lateral (select x.operation_id from public.exam_tutor_grants x where x.user_id=t.user_id and x.turn_id=t.id
     and x.revoked_at is null and x.expires_at>statement_timestamp()
     and x.token_hash=public.tutor_connector_verifier(secret,t.id,x.operation_id)
    order by x.expires_at desc,x.id limit 1) g
  where t.user_id=p_owner and t.status='pending' and (p_thread is null or (t.thread_id=p_thread and t.sequence>p_after))
  order by t.created_at desc,t.id limit 10) x
$$;

create function public.lemma_exam_tutor_connector(p_owner uuid,secret text,p_grant_operation uuid,p jsonb,token text default null) returns jsonb
language plpgsql set search_path='' as $$
declare
 target_turn uuid:=public.lemma_exam_uuid(p,'turnId'); operation text:=p->>'operation';
 opid uuid; req jsonb; result jsonb; bound jsonb; prior_reply jsonb; snapshot jsonb;
 h public.exam_tutor_threads; t public.exam_tutor_turns; g public.exam_tutor_grants; s public.exam_sittings;
 lease timestamptz; stamp timestamptz:=clock_timestamp(); expected int;
 body text; question text; msg uuid; seconds int; reported text;
begin
 if pg_column_size(p)>65536 or operation not in ('get','claim','renew','reply','next') then
  raise exception 'Invalid exam tutor command' using errcode='22023';
 end if;
 select h0.* into strict h from public.exam_tutor_turns t0 join public.exam_tutor_threads h0
    on h0.id=t0.thread_id and h0.user_id=t0.user_id where t0.id=target_turn and t0.user_id=p_owner;
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text||':exam-tutor:'||h.sitting_id::text,0));
 select * into t from public.exam_tutor_turns where user_id=p_owner and id=target_turn for update;
 g:=public.lemma_exam_tutor_grant(p_owner,t.id,p_grant_operation,secret,token);
 -- A secret rotation cannot authorize access using an earlier key.
 if token is null then
  perform 1 from public.settings where user_id=p_owner and connector_secret=secret for share;
  if not found then raise exception 'Tutor connector unavailable' using errcode='42501'; end if;
 end if;
 if operation='next' then
  if t.status<>'completed' or not g.replied then raise exception 'Tutor connector unavailable' using errcode='42501'; end if;
  update public.exam_tutor_threads set listener_seen_at=stamp where id=h.id and user_id=p_owner
    and (listener_seen_at is null or listener_seen_at<stamp-interval '10 seconds');
  return public.lemma_exam_tutor_pending(p_owner,secret,h.id,t.sequence)->0;
 end if;
 if operation='get' then
  result:=jsonb_build_object('turnId',t.id,'version',t.version,'status',t.status);
  if t.status<>'pending' then return result||jsonb_build_object('examProjectId',h.project_id,
     'snapshot',jsonb_build_object('attachments',t.attachments)); end if;
  select * into strict s from public.exam_sittings where id=h.sitting_id and user_id=p_owner;
  select x.reply into prior_reply from public.exam_tutor_turns x where x.user_id=p_owner and x.thread_id=h.id
   and x.sequence<t.sequence and x.reply is not null order by x.sequence desc limit 1;
  select jsonb_agg(jsonb_build_object('questionnaireId',x.id,'questionId',b.question_id,'rowKey',b.row_key,
    'blueprintVersion',b.blueprint_version,'scoringKey',b.scoring_key,'rubricSteps',b.rubric_steps,'answer',x.answers->b.question_id,
    'deliveryRef',x.id::text||':'||b.question_id)
    order by x.submitted_at,x.id,b.question_id) into bound
  from public.tutor_questionnaire_rows b join public.exam_tutor_questionnaires x on x.user_id=b.user_id and x.id=b.questionnaire_id
  join public.exam_tutor_turns prior on prior.user_id=x.user_id and prior.id=x.turn_id
  where b.user_id=p_owner and b.sitting_id=h.sitting_id and prior.thread_id=h.id and prior.sequence between greatest(1,t.sequence-5) and t.sequence-1
   and x.submitted_at is not null and x.answers?b.question_id;
  snapshot:=t.snapshot;
  if t.attachments<>'[]' then snapshot:=snapshot||jsonb_build_object('attachments',t.attachments); end if;
  return result||jsonb_strip_nulls(jsonb_build_object('generation',t.generation,'snapshot',snapshot,'examSittingId',h.sitting_id,
   'examProjectId',h.project_id,'sittingStatus',s.status,'previousTutorQuestion',prior_reply->>'nextQuestion',
   'previousTimedSeconds',prior_reply->'timedSeconds','examQuestionnaireAnswers',bound,'hasAttachments',t.attachments<>'[]',
   'examAttachmentOwner',case when token is not null and t.attachments<>'[]' then p_owner end));
 end if;

 perform public.lemma_exam_keys(p,array['operation','operationId','turnId','expectedVersion']||
  case operation when 'renew' then array['claimId','generation']
   when 'reply' then array['claimId','generation','messageId','body','nextQuestion','timedSeconds','citations','suggestions','reportedHost']
   else array[]::text[] end);
 opid:=public.lemma_exam_uuid(p,'operationId');
 if opid is null then raise exception 'operationId is required' using errcode='22023'; end if;
 req:=jsonb_build_object('scope',h.sitting_id,'grantId',g.id,'v',1,'command',p);
 result:=public.lemma_trusted_receipt_begin(p_owner,opid,'exam_tutor',req);
 if result is not null then
  if operation='claim' and (g.claim_id::text is distinct from result->>'claimId' or t.status<>'pending' or g.lease_until<=stamp
    or g.generation<>t.generation) then raise exception 'The claim is no longer current' using errcode='42501'; end if;
  return result;
 end if;
 expected:=public.lemma_exam_number(p,'expectedVersion',1,2147483647,true);
 if operation='claim' then
  if t.status<>'pending' or expected is distinct from t.version then raise exception 'Turn changed' using errcode='40001'; end if;
  if exists(select 1 from public.exam_tutor_grants x where x.user_id=p_owner and x.turn_id=t.id and x.generation=t.generation
   and x.revoked_at is null and x.lease_until>stamp) then raise exception 'Another tutor is answering' using errcode='40001'; end if;
  update public.exam_tutor_turns set generation=generation+1,version=version+1 where id=t.id returning * into t;
  update public.exam_tutor_grants set claim_id=gen_random_uuid(),generation=t.generation,lease_until=least(stamp+interval '5 minutes',expires_at)
    where id=g.id returning * into g;
  result:=jsonb_build_object('status','claimed','claimId',g.claim_id,'generation',t.generation,'leaseUntil',g.lease_until);
 else
  if g.claim_id is null or g.claim_id is distinct from public.lemma_exam_uuid(p,'claimId') or g.generation is distinct from t.generation
     or g.generation is distinct from public.lemma_exam_number(p,'generation',1,2147483647,true)::integer
     or g.lease_until is null or g.lease_until<=stamp or g.replied then
   raise exception 'The claim is no longer current' using errcode='42501';
  end if;
  if operation='renew' then
   if t.status<>'pending' then raise exception 'Turn changed' using errcode='40001'; end if;
   update public.exam_tutor_grants set lease_until=least(stamp+interval '5 minutes',expires_at) where id=g.id returning lease_until into lease;
   result:=jsonb_build_object('status','renewed','claimId',g.claim_id,'generation',t.generation,'leaseUntil',lease);
  else
   body:=public.lemma_exam_text(p,'body',1,12000);
   msg:=public.lemma_exam_uuid(p,'messageId');
   reported:=public.lemma_exam_text(p,'reportedHost',0,100);
   question:=public.lemma_exam_text(p,'nextQuestion',0,12000);
   seconds:=public.lemma_exam_number(p,'timedSeconds',1,36000,true);
   if msg is null or (question is not null and (btrim(question)='' or strpos(body,question)=0)) then
    raise exception 'Reply needs a message ID and a verbatim next question, if supplied' using errcode='22023';
   end if;
   if coalesce(p->'citations','[]')<>'[]' or coalesce(p->'suggestions','[]')<>'[]' then
    raise exception 'Use source reads and proposal commands directly in the exam thread' using errcode='22023';
   end if;
   if t.status='completed' then
    update public.exam_tutor_turns set recovered_drafts=recovered_drafts||jsonb_build_array(
      jsonb_build_object('draftId',opid,'messageId',msg,'turnId',t.id,'body',body)) where id=t.id;
    update public.exam_tutor_grants set lease_until=null where id=g.id;
    result:=jsonb_build_object('status','already-completed','draftId',opid);
   else
    if t.status<>'pending' or expected is distinct from t.version then raise exception 'Turn changed' using errcode='40001'; end if;
    if exists (select 1 from jsonb_array_elements(t.followups) f where not (f->>'seen')::boolean) then
     raise exception 'The learner posted more messages while you were writing. Read the follow-ups before replying.' using errcode='P2281';
    end if;
    update public.exam_tutor_turns set status='completed',version=version+1,
     reply=jsonb_strip_nulls(jsonb_build_object('turnId',t.id,'messageId',msg,'body',body,'nextQuestion',question,'timedSeconds',seconds,
      'citations','[]'::jsonb,'suggestions','[]'::jsonb,'provenance',jsonb_build_object('kind','connector','reportedHost',reported,'hostVerified',false)))
     where id=t.id returning * into t;
    update public.exam_tutor_grants set replied=true,lease_until=null where id=g.id;
    result:=jsonb_build_object('status','completed','messageId',msg);
   end if;
  end if;
 end if;
 return public.lemma_trusted_receipt_finish(p_owner,opid,'exam_tutor',req,
   result||jsonb_build_object('operationId',opid,'turnId',t.id,'version',t.version));
end
$$;

create function public.exam_tutor_followup_state(p_owner uuid,p_slug text,p_checkpoint uuid,p_sitting uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform public.lemma_exam_tutor_scope(p_owner,p_slug,p_sitting);
 return coalesce((select jsonb_agg(x.value order by t.sequence,x.ordinality)
   from public.exam_tutor_threads h join public.exam_tutor_turns t on t.user_id=h.user_id and t.thread_id=h.id
   cross join lateral jsonb_array_elements(t.followups) with ordinality x
   where h.user_id=p_owner and h.sitting_id=p_sitting and not t.deleted_messages @>
     jsonb_build_array(jsonb_build_object('kind','followup','id',x.value->>'id'))),'[]'::jsonb);
end
$$;

create function public.exam_tutor_followup_add(p_owner uuid,p_slug text,p_checkpoint uuid,p_turn uuid,p_message uuid,p_body text,p_sitting uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.exam_tutor_turns; msg jsonb; body text:=regexp_replace(coalesce(p_body,''),'^[[:space:]]+|[[:space:]]+$','','g');
begin
 perform public.lemma_exam_tutor_scope(p_owner,p_slug,p_sitting);
 if not public.tutor_plan_released() or not exists(select 1 from public.tutor_release_controls where capability='manual' and enabled) then
  raise exception 'Tutor questions are unavailable' using errcode='55000';
 end if;
 if p_message is null or length(body) not between 1 and 2000 then raise exception 'A message of up to 2000 characters is required' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text||':exam-tutor:'||p_sitting::text,0));
 select t0.* into t from public.exam_tutor_turns t0 join public.exam_tutor_threads h on h.user_id=t0.user_id and h.id=t0.thread_id
  where h.user_id=p_owner and h.sitting_id=p_sitting and t0.id=p_turn for update of t0;
 if not found then raise exception 'Turn is unavailable' using errcode='42501'; end if;
 select f into msg from jsonb_array_elements(t.followups) f where f->>'id'=p_message::text;
 if found then
  if msg->>'body' is distinct from body then raise exception 'This message ID is already used' using errcode='23505'; end if;
 else
  if t.status<>'pending' then raise exception 'The tutor has already answered this question' using errcode='40001'; end if;
  if jsonb_array_length(t.followups)>=10 then raise exception 'Wait for the tutor to reply before posting more' using errcode='22023'; end if;
  msg:=jsonb_build_object('id',p_message,'turnId',p_turn,'body',body,'createdAt',clock_timestamp(),'seen',false);
  update public.exam_tutor_turns set followups=followups||jsonb_build_array(msg) where id=t.id;
 end if;
 return jsonb_build_object('status','saved','followup',msg);
end
$$;

create function public.lemma_exam_tutor_followups(p_owner uuid,p_hash text,p_grant_operation uuid,p jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare t public.exam_tutor_turns; h public.exam_tutor_threads; secret text; unseen int;
begin
 select connector_secret into secret from public.settings where user_id=p_owner
  and encode(sha256(convert_to(connector_secret,'UTF8')),'hex')=p_hash;
 if current_setting('role',true) is distinct from 'service_role' or secret is null or not public.tutor_plan_released()
   or not exists(select 1 from public.tutor_release_controls where capability='mcp' and enabled)
   or exists(select 1 from public.account_deletion_requests where user_id=p_owner) then
  raise exception 'Tutor connector unavailable' using errcode='42501';
 end if;
 select x.* into t from public.exam_tutor_turns x where x.user_id=p_owner and x.id=public.lemma_exam_uuid(p,'turnId');
 select * into h from public.exam_tutor_threads where user_id=p_owner and id=t.thread_id;
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text||':exam-tutor:'||h.sitting_id::text,0));
 perform public.lemma_exam_tutor_grant(p_owner,t.id,p_grant_operation,secret);
 perform 1 from public.settings where user_id=p_owner and connector_secret=secret for share;
 if not found then raise exception 'Tutor connector unavailable' using errcode='42501'; end if;
 select * into t from public.exam_tutor_turns where user_id=p_owner and id=t.id for update;
 select count(*) into unseen from jsonb_array_elements(t.followups) f where not (f->>'seen')::boolean;
 if p->>'markSeen'='true' and unseen>0 then
  update public.exam_tutor_turns set followups=(select jsonb_agg(f.value||'{"seen":true}'::jsonb order by f.ordinality)
    from jsonb_array_elements(t.followups) with ordinality f) where id=t.id returning * into t;
 end if;
 return jsonb_build_object('followups',t.followups,'unseen',unseen);
end
$$;

create function public.lemma_exam_questionnaire_json(x public.exam_tutor_questionnaires) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('id',x.id,'turnId',x.turn_id,'title',x.title,'purpose',x.purpose,'questions',x.questions,
   'createdAt',x.created_at,'state',case x.status when 'ready' then 'unseen' when 'submitted' then 'complete' else 'started' end,
   'answers',x.answers,'version',x.version,'openedAt',x.opened_at,'updatedAt',x.updated_at,'submittedAt',x.submitted_at)
$$;
create function public.exam_tutor_questionnaire_state(p_owner uuid,p_slug text,p_checkpoint uuid,p_sitting uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform public.lemma_exam_tutor_scope(p_owner,p_slug,p_sitting);
 return coalesce((select jsonb_agg(public.lemma_exam_questionnaire_json(x) order by t.sequence,x.created_at,x.id)
   from public.exam_tutor_threads h join public.exam_tutor_turns t on t.user_id=h.user_id and t.thread_id=h.id
   join public.exam_tutor_questionnaires x on x.user_id=t.user_id and x.turn_id=t.id
   where h.user_id=p_owner and h.sitting_id=p_sitting),'[]'::jsonb);
end
$$;
create function public.lemma_exam_questionnaire_save(p_owner uuid,p_id uuid,p_expected int,p_answers jsonb,p_submit boolean)
returns jsonb language plpgsql set search_path='' as $$
declare x public.exam_tutor_questionnaires; stamp timestamptz:=clock_timestamp(); merged jsonb;
begin
 select * into x from public.exam_tutor_questionnaires where user_id=p_owner and id=p_id for update;
 if not found then raise exception 'Questionnaire is unavailable' using errcode='42501'; end if;
 if x.status='submitted' then return jsonb_build_object('status','submitted','questionnaire',public.lemma_exam_questionnaire_json(x)); end if;
 if p_expected is distinct from x.version then return jsonb_build_object('status','conflict','questionnaire',public.lemma_exam_questionnaire_json(x)); end if;
 merged:=coalesce(p_answers,x.answers);
 if not public.tutor_questionnaire_answers_valid(x.questions,merged) then
  raise exception 'Answers do not match the questions' using errcode='22023';
 end if;
 if coalesce(p_submit,false) and not public.tutor_questionnaire_complete(x.questions,merged) then
  raise exception 'Answer every question before submitting' using errcode='22023';
 end if;
 if x.version=0 or p_answers is not null or p_submit then
  update public.exam_tutor_questionnaires set answers=merged,status=case when p_submit then 'submitted' else 'started' end,
   version=version+1,opened_at=coalesce(opened_at,stamp),updated_at=stamp,submitted_at=case when p_submit then stamp end
  where id=x.id returning * into x;
 end if;
 return jsonb_build_object('status',case when x.status='submitted' then 'submitted' else 'saved' end,
   'questionnaire',public.lemma_exam_questionnaire_json(x));
end
$$;

create function public.lemma_exam_questionnaire_connector(p_owner uuid,secret text,p_grant_operation uuid,p jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare
 t public.exam_tutor_turns; h public.exam_tutor_threads; s public.exam_sittings; x public.exam_tutor_questionnaires;
 g public.exam_tutor_grants;
 id_value uuid:=public.lemma_exam_uuid(p,'questionnaireId'); purpose_value text;
 title_value text; row_value jsonb; binding jsonb; steps jsonb; step_value jsonb; key_value text; question_value text;
 scoring text; bound_question_ids text[]:=array[]::text[]; stored jsonb; validated jsonb:='[]';
begin
 select * into strict t from public.exam_tutor_turns where user_id=p_owner and id=public.lemma_exam_uuid(p,'turnId');
 select * into strict h from public.exam_tutor_threads where user_id=p_owner and id=t.thread_id;
 g:=public.lemma_exam_tutor_grant(p_owner,t.id,p_grant_operation,secret);
 if p->>'operation'='list' then
  return jsonb_build_object('questionnaires',coalesce((select jsonb_agg(public.lemma_exam_questionnaire_json(q)
    order by q.created_at,q.id) from public.exam_tutor_questionnaires q where q.id in (
      select q0.id from public.exam_tutor_questionnaires q0 join public.exam_tutor_turns t0 on t0.user_id=q0.user_id and t0.id=q0.turn_id
      where t0.user_id=p_owner and t0.thread_id=h.id order by t0.sequence desc,q0.created_at desc limit 10)),'[]'::jsonb));
 end if;
 if t.status<>'completed' or not g.replied then
  raise exception 'Reply to the turn before attaching a questionnaire' using errcode='40001';
 end if;
 perform public.lemma_exam_keys(p,array['operation','turnId','questionnaireId','title','purpose','questions','examRows']);
 title_value:=public.lemma_exam_text(p,'title',1,120);
 purpose_value:=public.lemma_exam_enum(p,'purpose',array['diagnose','check','practice','reflect','exit'],'check');
 if id_value is null or not public.tutor_questionnaire_valid(p->'questions') then raise exception 'Invalid questionnaire' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text||':exam-tutor:'||h.sitting_id::text,0));
 perform 1 from public.settings where user_id=p_owner and connector_secret=secret for share;
 if not found then raise exception 'Tutor connector unavailable' using errcode='42501'; end if;
 g:=public.lemma_exam_tutor_grant(p_owner,t.id,p_grant_operation,secret);
 select * into strict s from public.exam_sittings where id=h.sitting_id and user_id=p_owner;
 if p?'examRows' then
  if purpose_value not in ('diagnose','check') or jsonb_typeof(p->'examRows') is distinct from 'array'
     or jsonb_array_length(p->'examRows') not between 1 and 10 then
   raise exception 'examRows requires 1–10 bindings on a diagnose or check questionnaire' using errcode='22023';
  end if;
  for binding in select value from jsonb_array_elements(p->'examRows') loop
   perform public.lemma_exam_keys(binding,array['questionId','rowKey','scoringKey','rubricSteps']);
   question_value:=public.lemma_exam_text(binding,'questionId',1,40);
   key_value:=public.lemma_exam_text(binding,'rowKey',1,40);
   scoring:=public.lemma_exam_text(binding,'scoringKey',1,500);
   steps:=coalesce(binding->'rubricSteps','[]');
   if question_value=any(bound_question_ids)
     or not (p->'questions')@>jsonb_build_array(jsonb_build_object('id',question_value)) then
    raise exception 'Questionnaire question is missing or already bound' using errcode='22023';
   end if;
   if jsonb_typeof(steps) is distinct from 'array' or jsonb_array_length(steps)>5 then
    raise exception 'rubricSteps must be an array of at most five strings' using errcode='22023';
   end if;
   for step_value in select value from jsonb_array_elements(steps) loop
    if jsonb_typeof(step_value)<>'string' or length(btrim(step_value#>>'{}')) not between 1 and 300 then
     raise exception 'A rubric step must be 1–300 characters' using errcode='22023';
    end if;
   end loop;
   validated:=validated||jsonb_build_array(jsonb_build_object('questionId',question_value,'rowKey',key_value,'scoringKey',scoring,'rubricSteps',steps));
   bound_question_ids:=array_append(bound_question_ids,question_value);
  end loop;
 end if;
 select * into x from public.exam_tutor_questionnaires where id=id_value;
 if found then
  select coalesce(jsonb_agg(jsonb_build_object('questionId',question_id,'rowKey',row_key,
   'scoringKey',scoring_key,'rubricSteps',rubric_steps)),'[]'::jsonb) into stored
  from public.tutor_questionnaire_rows where user_id=p_owner and questionnaire_id=id_value;
  if x.user_id=p_owner and x.turn_id=t.id and x.title=title_value and x.purpose=purpose_value and x.questions=p->'questions'
     and stored@>validated and validated@>stored then
   return jsonb_build_object('status','created','questionnaire',public.lemma_exam_questionnaire_json(x));
  end if;
  raise exception 'This questionnaire ID is already used' using errcode='23505';
 end if;
 if exists(select 1 from public.tutor_questionnaires where id=id_value) then
  raise exception 'This questionnaire ID is already used' using errcode='23505';
 end if;
 if (select count(*) from public.exam_tutor_questionnaires where user_id=p_owner and turn_id=t.id)>=2 then
  raise exception 'A reply can carry at most two questionnaires' using errcode='22023';
 end if;
 if exists(select 1 from jsonb_array_elements(validated) b where not s.blueprint@>jsonb_build_array(jsonb_build_object('key',b->>'rowKey'))) then
  raise exception 'Exam blueprint row not found' using errcode='22023';
 end if;
 insert into public.exam_tutor_questionnaires(id,user_id,turn_id,title,purpose,questions)
  values(id_value,p_owner,t.id,title_value,purpose_value,p->'questions') returning * into x;
 insert into public.tutor_questionnaire_rows(user_id,questionnaire_id,question_id,sitting_id,row_key,blueprint_version,scoring_key,rubric_steps)
  select p_owner,id_value,b->>'questionId',s.id,b->>'rowKey',s.blueprint_version,b->>'scoringKey',b->'rubricSteps'
  from jsonb_array_elements(validated) b;
 return jsonb_build_object('status','created','questionnaire',public.lemma_exam_questionnaire_json(x));
end
$$;

create function public.exam_tutor_delete_messages(p_owner uuid,p_slug text,p_checkpoint uuid,p_messages jsonb,p_sitting uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare message record; t public.exam_tutor_turns; entry jsonb;
begin
 perform public.lemma_exam_tutor_scope(p_owner,p_slug,p_sitting);
 if jsonb_typeof(p_messages) is distinct from 'array' or jsonb_array_length(p_messages) not between 1 and 100 then
  raise exception 'Select between 1 and 100 messages' using errcode='22023';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text||':exam-tutor:'||p_sitting::text,0));
 for message in select * from jsonb_to_recordset(p_messages) as item(kind text,id uuid) loop
  select i.* into t from public.exam_tutor_turns i join public.exam_tutor_threads h on h.user_id=i.user_id and h.id=i.thread_id
   where i.user_id=p_owner and h.sitting_id=p_sitting and case message.kind
    when 'question' then i.id=message.id when 'reply' then i.reply->>'messageId'=message.id::text
    when 'followup' then i.followups@>jsonb_build_array(jsonb_build_object('id',message.id)) else false end;
  if not found then raise exception 'One of the selected messages is unavailable' using errcode='42501'; end if;
  entry:=jsonb_build_array(jsonb_build_object('kind',message.kind,'id',message.id));
  update public.exam_tutor_turns set deleted_messages=deleted_messages||entry where id=t.id and not deleted_messages@>entry;
 end loop;
 return true;
end
$$;

create function public.exam_tutor_owner_ink_command(p_owner uuid,p_slug text,p_checkpoint uuid,p_command jsonb,p_attachments jsonb,p_sitting uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.exam_tutor_turns; a jsonb; attachment_id uuid; native record; result jsonb; existed boolean; metadata jsonb:='[]'; requested jsonb:='[]';
begin
 perform public.lemma_exam_tutor_scope(p_owner,p_slug,p_sitting);
 if p_command->>'operation' is distinct from 'start' or jsonb_typeof(p_attachments) is distinct from 'array'
   or jsonb_array_length(p_attachments) not between 1 and 3 or pg_column_size(p_attachments)>2048 then
  raise exception 'Invalid tutor images' using errcode='22023';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text||':exam-tutor:'||p_sitting::text,0));
 existed:=exists(select 1 from public.exam_tutor_turns where user_id=p_owner
   and operation_id=public.lemma_exam_uuid(p_command,'operationId'));
 result:=public.lemma_exam_tutor_owner(p_owner,p_slug,p_sitting,p_command,false);
 if result->>'status'<>'submitted' then return result; end if;
 select * into strict t from public.exam_tutor_turns where user_id=p_owner and id=(result->>'turnId')::uuid;
 if existed and t.attachments='[]' then
  raise exception 'The saved turn has different images' using errcode='22023';
 end if;
 for a in select value from jsonb_array_elements(p_attachments) loop
  perform public.lemma_exam_keys(a,array['id','mimeType','kind']);
  attachment_id:=public.lemma_exam_uuid(a,'id');
  if attachment_id is null or requested@>jsonb_build_array(a->'id') or not coalesce(a->>'kind' in ('drawing','photo'),false)
     or not coalesce(a->>'mimeType' in ('image/png','image/jpeg'),false) then raise exception 'Invalid tutor image' using errcode='22023'; end if;
  requested:=requested||jsonb_build_array(a->'id');
  if t.attachments<>'[]' then continue; end if;
  select o.metadata->>'mimetype' mime,(o.metadata->>'size')::integer bytes into native from storage.objects o
   where o.bucket_id='tutor-ink' and o.name=p_owner::text||'/'||attachment_id::text and o.owner_id=p_owner::text
    and o.created_at>statement_timestamp()-interval '24 hours';
  if not found or native.mime is distinct from a->>'mimeType' or native.bytes is null or native.bytes not between 1 and 1048576 then
   raise exception 'Tutor image is unavailable' using errcode='22023';
  end if;
  metadata:=metadata||jsonb_build_array(a||jsonb_build_object('byteSize',native.bytes));
 end loop;
 if t.attachments<>'[]' then
  if requested is distinct from (select jsonb_agg(o.value->'id' order by o.ordinality)
      from jsonb_array_elements(t.attachments) with ordinality o) then
   raise exception 'The saved turn has different images' using errcode='22023';
  end if;
 else
  update public.exam_tutor_turns set attachments=metadata where id=t.id;
 end if;
 return result;
end
$$;

-- Compatible replacements dispatch exam turns after the existing credential checks.
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
 exam_sitting uuid;
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
  if exists(select 1 from public.exam_tutor_turns where id=target_turn and user_id=p_owner) then
   return public.lemma_exam_tutor_connector(p_owner,secret,p_grant_operation_id,p_command);
  end if;
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
  if operation='next' then
   update public.tutor_threads
     set listener_seen_at=greatest(listener_seen_at,clock_timestamp())
     where id=anchor_thread and user_id=p_owner;
   return result->0;
  end if;
  -- The pending list contains only live grants from the authenticated connector.
  update public.tutor_threads h set listener_seen_at=greatest(h.listener_seen_at,clock_timestamp())
   where h.user_id=p_owner and exists(
    select 1 from jsonb_array_elements(coalesce(result,'[]'::jsonb)) handoff
     join public.tutor_turns t on t.id=split_part(handoff->>'id','.',1)::uuid
     where t.user_id=h.user_id and t.thread_id=h.id
   );
  return coalesce((select jsonb_agg(x.value order by x.ordinality)
    from (select * from jsonb_array_elements(public.lemma_exam_tutor_pending(p_owner,secret)||
      coalesce(result,'[]'::jsonb)) with ordinality limit 10) x),'[]'::jsonb);
 end if;

 result:=public.tutor_grant_command(verifier,p_command);
 -- The delegated command locks this settings row when it records activity.
 -- If a secret rotation won that race, roll back the delegated command.
 if not exists(select 1 from public.settings s where s.user_id=p_owner and s.connector_secret=secret) then
  raise exception 'Tutor connector unavailable' using errcode='42501';
 end if;
 if operation='get' then
  update public.tutor_threads h set listener_seen_at=greatest(h.listener_seen_at,clock_timestamp())
   from public.tutor_turns t where t.user_id=p_owner and t.id=target_turn and h.user_id=t.user_id and h.id=t.thread_id;
 end if;
 if operation='get' and result->>'status'='pending' then
  if to_regclass('public.tutor_turn_attachments') is not null then
   if exists(select 1 from public.tutor_turn_attachments a where a.user_id=p_owner and a.turn_id=target_turn) then
    result:=result||'{"hasAttachments":true}'::jsonb;
   end if;
  end if;
  select jsonb_build_object('code',cp.code,'title',cp.title) into checkpoint
  from public.tutor_turns t
  join public.tutor_threads h on h.id=t.thread_id and h.user_id=t.user_id
  join public.checkpoints cp on cp.id=h.checkpoint_id and cp.user_id=h.user_id
  where t.id=target_turn and t.user_id=p_owner;
  if checkpoint is not null then result:=result||jsonb_build_object('checkpoint',checkpoint); end if;
  select s.id into exam_sitting from public.tutor_turns t join public.tutor_threads h on h.id=t.thread_id and h.user_id=t.user_id
    join public.exam_sittings s on s.project_id=h.project_id and s.user_id=h.user_id where t.id=target_turn and t.user_id=p_owner and s.status='active';
  if exam_sitting is not null then result:=result||jsonb_build_object('examSittingId',exam_sitting); end if;
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

create or replace function public.tutor_questionnaire_connector(p_owner uuid, p_connector_hash text, p_grant_operation_id uuid, p_command jsonb)
returns jsonb language plpgsql security definer set search_path='' as $connector$
declare
 secret text; verifier text; anchor_grant uuid; target_turn uuid; t public.tutor_turns%rowtype;
 operation text:=p_command->>'operation'; x public.tutor_questionnaires%rowtype; r public.tutor_questionnaire_responses%rowtype;
 qid uuid; v_title text; v_purpose text;
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
 if p_grant_operation_id is null or jsonb_typeof(p_command) is distinct from 'object' or coalesce(operation,'') not in ('create','list')
  or pg_column_size(p_command)>65536 then
  raise exception 'Invalid tutor questionnaire command' using errcode='22023';
 end if;
 target_turn:=(p_command->>'turnId')::uuid;
 if exists(select 1 from public.exam_tutor_turns where id=target_turn and user_id=p_owner) then
  return public.lemma_exam_questionnaire_connector(p_owner,secret,p_grant_operation_id,p_command);
 end if;
 verifier:=public.tutor_connector_verifier(secret,target_turn,p_grant_operation_id);
 select g.id into anchor_grant from public.command_receipts rc
 join public.tutor_grants g on g.user_id=rc.user_id and g.id::text=rc.result->>'grantId'
 join public.tutor_grant_credentials c on c.grant_id=g.id
 where rc.user_id=p_owner and rc.operation_id=p_grant_operation_id and rc.resource='tutor'
  and rc.trusted_writer_version=1 and rc.result->>'status'='granted'
  and g.turn_id=target_turn and g.revoked_at is null and g.expires_at>clock_timestamp() and c.token_hash=verifier;
 if not found then raise exception 'Tutor connector unavailable' using errcode='42501'; end if;
 select * into t from public.tutor_turns where user_id=p_owner and id=target_turn;
 if not found then raise exception 'Tutor connector unavailable' using errcode='42501'; end if;

 if operation='list' then
  return jsonb_build_object('questionnaires',coalesce((select jsonb_agg(public.tutor_questionnaire_json(q,qr) order by o.sequence,q.created_at,q.id)
   from (select q0.* from public.tutor_questionnaires q0 join public.tutor_turns t0 on t0.user_id=q0.user_id and t0.id=q0.turn_id
    where q0.user_id=p_owner and t0.thread_id=t.thread_id order by t0.sequence desc,q0.created_at desc limit 10) q
   join public.tutor_turns o on o.user_id=q.user_id and o.id=q.turn_id
   left join public.tutor_questionnaire_responses qr on qr.user_id=q.user_id and qr.questionnaire_id=q.id),'[]'::jsonb));
 end if;

 -- create: only on a turn this grant answered.
 if (p_command - array['operation','turnId','questionnaireId','title','purpose','questions'])<>'{}' then
  raise exception 'Unexpected questionnaire fields' using errcode='22023';
 end if;
 if t.status<>'completed' or not exists(select 1 from public.tutor_attempts a where a.turn_id=t.id and a.user_id=p_owner
   and a.grant_id=anchor_grant and a.reason='reply') then
  raise exception 'Reply to the turn before attaching a questionnaire' using errcode='40001';
 end if;
 qid:=(p_command->>'questionnaireId')::uuid; v_title:=btrim(coalesce(p_command->>'title','')); v_purpose:=coalesce(p_command->>'purpose','check');
 if qid is null or jsonb_typeof(p_command->'title') is distinct from 'string'
  or (p_command ? 'purpose' and jsonb_typeof(p_command->'purpose') is distinct from 'string')
  or not public.tutor_questionnaire_valid(p_command->'questions') then
  raise exception 'Invalid questionnaire' using errcode='22023';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text||':questionnaire-turn:'||t.id::text,0));
 select * into x from public.tutor_questionnaires where id=qid;
 if found then
  if x.user_id=p_owner and x.turn_id=t.id and x.title=v_title and x.purpose=v_purpose
   and x.questions=p_command->'questions' then
   select * into r from public.tutor_questionnaire_responses where user_id=p_owner and questionnaire_id=x.id;
   return jsonb_build_object('status','created','questionnaire',public.tutor_questionnaire_json(x,r));
  end if;
  raise exception 'This questionnaire ID is already used' using errcode='23505';
 end if;
 if (select count(*) from public.tutor_questionnaires where user_id=p_owner and turn_id=t.id)>=2 then
  raise exception 'A reply can carry at most two questionnaires' using errcode='22023';
 end if;
 insert into public.tutor_questionnaires(id,user_id,turn_id,title,purpose,questions)
 values(qid,p_owner,t.id,v_title,v_purpose,p_command->'questions') returning * into x;
 return jsonb_build_object('status','created','questionnaire',public.tutor_questionnaire_json(x,null));
end $connector$;

create or replace function public.tutor_questionnaire_save(p_owner uuid, p_questionnaire uuid, p_expected_version integer,
 p_answers jsonb default null, p_submit boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $save$
declare u uuid:=auth.uid(); x public.tutor_questionnaires%rowtype; r public.tutor_questionnaire_responses%rowtype;
 stamp timestamptz:=clock_timestamp(); merged jsonb;
begin
 if current_setting('role',true) is distinct from 'authenticated' or u is null or u is distinct from p_owner then
  raise exception 'Sign in to this account to answer the questionnaire' using errcode='42501';
 end if;
 if exists(select 1 from public.account_deletion_requests d where d.user_id=u) then
  raise exception 'Questionnaire is unavailable' using errcode='42501';
 end if;
 if exists(select 1 from public.exam_tutor_questionnaires where user_id=u and id=p_questionnaire) then
  return public.lemma_exam_questionnaire_save(u,p_questionnaire,p_expected_version,p_answers,p_submit);
 end if;
 select * into x from public.tutor_questionnaires where user_id=u and id=p_questionnaire;
 if not found then raise exception 'Questionnaire is unavailable' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text||':questionnaire:'||x.id::text,0));
 select * into r from public.tutor_questionnaire_responses where user_id=u and questionnaire_id=x.id;
 if r.submitted_at is not null then
  return jsonb_build_object('status','submitted','questionnaire',public.tutor_questionnaire_json(x,r));
 end if;
 if p_expected_version is distinct from coalesce(r.version,0) then
  return jsonb_build_object('status','conflict','questionnaire',public.tutor_questionnaire_json(x,r));
 end if;
 merged:=coalesce(p_answers,r.answers,'{}'::jsonb);
 if not public.tutor_questionnaire_answers_valid(x.questions,merged) then
  raise exception 'Answers do not match the questions' using errcode='22023';
 end if;
 if coalesce(p_submit,false) and not public.tutor_questionnaire_complete(x.questions,merged) then
  raise exception 'Answer every question before submitting' using errcode='22023';
 end if;
 if r.questionnaire_id is null then
  insert into public.tutor_questionnaire_responses(questionnaire_id,user_id,answers,version,opened_at,updated_at,submitted_at)
  values(x.id,u,merged,1,stamp,stamp,case when p_submit then stamp end) returning * into r;
 elsif p_answers is not null or p_submit then
  update public.tutor_questionnaire_responses set answers=merged,version=version+1,updated_at=stamp,
   submitted_at=case when p_submit then stamp end
  where user_id=u and questionnaire_id=x.id returning * into r;
 end if;
 return jsonb_build_object('status',case when r.submitted_at is not null then 'submitted' else 'saved' end,
  'questionnaire',public.tutor_questionnaire_json(x,r));
end $save$;

create or replace function public.tutor_followup_connector(p_owner uuid, p_connector_hash text, p_grant_operation_id uuid, p_command jsonb)
returns jsonb language plpgsql security definer set search_path='' as $fconn$
declare
 secret text; verifier text; checkpoint uuid; target_turn uuid;
 mark_seen boolean;
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
 if p_grant_operation_id is null or jsonb_typeof(p_command) is distinct from 'object' or p_command->>'operation' is distinct from 'followups'
  or (p_command-array['operation','turnId','markSeen'])<>'{}' then
  raise exception 'Invalid tutor follow-up command' using errcode='22023';
 end if;
 target_turn:=(p_command->>'turnId')::uuid;
 if exists(select 1 from public.exam_tutor_turns where id=target_turn and user_id=p_owner) then
  return public.lemma_exam_tutor_followups(p_owner,p_connector_hash,p_grant_operation_id,p_command);
 end if;
 mark_seen:=coalesce((p_command->>'markSeen')::boolean,false);
 select h.checkpoint_id into checkpoint
 from public.tutor_turns t join public.tutor_threads h on h.user_id=t.user_id and h.id=t.thread_id
 where t.user_id=p_owner and t.id=target_turn;
 if not found then raise exception 'Tutor connector unavailable' using errcode='42501'; end if;
 if mark_seen then
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text||':tutor:'||checkpoint::text,0));
 end if;
 verifier:=public.tutor_connector_verifier(secret,target_turn,p_grant_operation_id);
 if not exists(select 1 from public.command_receipts rc
  join public.tutor_grants g on g.user_id=rc.user_id and g.id::text=rc.result->>'grantId'
  join public.tutor_grant_credentials c on c.grant_id=g.id
  where rc.user_id=p_owner and rc.operation_id=p_grant_operation_id and rc.resource='tutor'
   and rc.trusted_writer_version=1 and rc.result->>'status'='granted'
   and g.turn_id=target_turn and g.revoked_at is null and g.expires_at>clock_timestamp() and c.token_hash=verifier) then
  raise exception 'Tutor connector unavailable' using errcode='42501';
 end if;
 return public.tutor_read_followups(p_owner,target_turn,mark_seen);
end $fconn$;

create or replace function public.tutor_owner_grant_active(p_turn_id uuid,p_grant_id uuid,p_grant_operation_id uuid)
returns boolean language plpgsql stable security definer set search_path='' as $active$
declare owner_id uuid:=auth.uid();
begin
 return public.tutor_plan_released()
 and exists(select 1 from public.tutor_release_controls where capability='mcp' and enabled)
 and not exists(select 1 from public.account_deletion_requests d where d.user_id=owner_id)
 and (exists(select 1 from public.tutor_grants g
  join public.tutor_turns t on t.user_id=g.user_id and t.id=g.turn_id
  join public.tutor_grant_credentials c on c.grant_id=g.id
  join public.settings s on s.user_id=g.user_id
  join public.command_receipts r on r.user_id=g.user_id and r.operation_id=p_grant_operation_id
   and r.resource='tutor' and r.trusted_writer_version=1 and r.result->>'status'='granted'
   and r.result->>'grantId'=g.id::text
  where g.user_id=owner_id and g.id=p_grant_id and t.id=p_turn_id and t.status='pending'
   and g.revoked_at is null and g.expires_at>statement_timestamp()
   and c.token_hash=public.tutor_connector_verifier(s.connector_secret,t.id,p_grant_operation_id))
 or exists(select 1 from public.exam_tutor_grants g join public.exam_tutor_turns t on t.id=g.turn_id and t.user_id=g.user_id
   join public.settings s on s.user_id=g.user_id
   where g.user_id=owner_id and g.id=p_grant_id and g.turn_id=p_turn_id and g.operation_id=p_grant_operation_id
    and t.status='pending' and g.revoked_at is null and g.expires_at>statement_timestamp()
    and g.token_hash=public.tutor_connector_verifier(s.connector_secret,t.id,p_grant_operation_id)));
end $active$;

create or replace function public.tutor_ink_cleanup_candidates() returns text[]
language plpgsql stable security definer set search_path='' as $cleanup$
begin
 if to_regclass('storage.objects') is null then return '{}'::text[]; end if;
 return (select coalesce(array_agg(candidate.name),'{}')
 from (
  select s.name from storage.objects s
   where s.bucket_id='tutor-ink' and s.created_at<=statement_timestamp()-interval '24 hours'
    and not exists(select 1 from public.tutor_turn_attachments a where s.name=a.user_id::text||'/'||a.id::text)
    and not exists(select 1 from public.exam_tutor_turns t cross join lateral jsonb_array_elements(t.attachments) a
      where t.user_id::text=split_part(s.name,'/',1) and a->>'id'=split_part(s.name,'/',2))
   order by s.created_at,s.name limit 100
 ) candidate);
end $cleanup$;

revoke all on function public.lemma_exam_tutor_scope(uuid,text,uuid) from public,anon,authenticated,service_role;
revoke all on function public.lemma_exam_tutor_turn(public.exam_tutor_turns) from public,anon,authenticated,service_role;
revoke all on function public.exam_tutor_thread_state(uuid,text,uuid,bigint,uuid) from public,anon,authenticated,service_role;
grant execute on function public.exam_tutor_thread_state(uuid,text,uuid,bigint,uuid) to authenticated;
revoke all on function public.lemma_exam_tutor_owner(uuid,text,uuid,jsonb,boolean) from public,anon,authenticated,service_role;
revoke all on function public.exam_tutor_owner_command(uuid,text,uuid,jsonb,uuid) from public,anon,authenticated,service_role;
grant execute on function public.exam_tutor_owner_command(uuid,text,uuid,jsonb,uuid) to authenticated;
revoke all on function public.exam_tutor_owner_receipt(uuid,text,uuid,jsonb,uuid) from public,anon,authenticated,service_role;
grant execute on function public.exam_tutor_owner_receipt(uuid,text,uuid,jsonb,uuid) to authenticated;
revoke all on function public.lemma_exam_tutor_grant(uuid,uuid,uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function public.lemma_exam_tutor_pending(uuid,text,uuid,bigint) from public,anon,authenticated,service_role;
revoke all on function public.lemma_exam_tutor_connector(uuid,text,uuid,jsonb,text) from public,anon,authenticated,service_role;
revoke all on function public.exam_tutor_followup_state(uuid,text,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.exam_tutor_followup_state(uuid,text,uuid,uuid) to authenticated;
revoke all on function public.exam_tutor_followup_add(uuid,text,uuid,uuid,uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.exam_tutor_followup_add(uuid,text,uuid,uuid,uuid,text,uuid) to authenticated;
revoke all on function public.lemma_exam_tutor_followups(uuid,text,uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.lemma_exam_questionnaire_json(public.exam_tutor_questionnaires) from public,anon,authenticated,service_role;
revoke all on function public.exam_tutor_questionnaire_state(uuid,text,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.exam_tutor_questionnaire_state(uuid,text,uuid,uuid) to authenticated;
revoke all on function public.lemma_exam_questionnaire_save(uuid,uuid,int,jsonb,boolean) from public,anon,authenticated,service_role;
revoke all on function public.lemma_exam_questionnaire_connector(uuid,text,uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.exam_tutor_delete_messages(uuid,text,uuid,jsonb,uuid) from public,anon,authenticated,service_role;
grant execute on function public.exam_tutor_delete_messages(uuid,text,uuid,jsonb,uuid) to authenticated;
revoke all on function public.exam_tutor_owner_ink_command(uuid,text,uuid,jsonb,jsonb,uuid) from public,anon,authenticated,service_role;
grant execute on function public.exam_tutor_owner_ink_command(uuid,text,uuid,jsonb,jsonb,uuid) to authenticated;

-- The alternate bearer transport keeps its existing non-exam path.
create or replace function public.tutor_grant_active(p_token_hash text) returns boolean
language sql stable security definer set search_path='' as $active$
 select public.tutor_plan_released() and current_setting('role',true)='service_role'
 and exists(select 1 from public.tutor_release_controls where capability='mcp' and enabled)
 and (exists(select 1 from public.tutor_grant_credentials c join public.tutor_grants g on g.id=c.grant_id
            where c.token_hash=p_token_hash and g.revoked_at is null and g.expires_at>statement_timestamp())
  or exists(select 1 from public.exam_tutor_grants g where g.token_hash=p_token_hash
    and g.revoked_at is null and g.expires_at>statement_timestamp()
    and not exists(select 1 from public.account_deletion_requests d where d.user_id=g.user_id)))
$active$;

create or replace function public.tutor_grant_command(p_token_hash text,p_command jsonb)
returns jsonb language plpgsql security definer set search_path='' as $grant$
declare g public.tutor_grants%rowtype; cp uuid; result jsonb; exam_grant public.exam_tutor_grants;
begin
 if current_setting('role',true) is distinct from 'service_role' then raise exception 'Restricted tutor transport' using errcode='42501'; end if;
 select x.* into exam_grant from public.exam_tutor_grants x where x.token_hash=p_token_hash
   and x.revoked_at is null and x.expires_at>clock_timestamp() and x.turn_id=(p_command->>'turnId')::uuid;
 if found then
  if not public.tutor_plan_released() or not exists(select 1 from public.tutor_release_controls where capability='mcp' and enabled)
   or exists(select 1 from public.account_deletion_requests where user_id=exam_grant.user_id) then
   raise exception 'Tutor grant is unavailable' using errcode='42501';
  end if;
  return public.lemma_exam_tutor_connector(exam_grant.user_id,null,exam_grant.operation_id,p_command,p_token_hash);
 end if;
 select x.* into g from public.tutor_grant_credentials cred join public.tutor_grants x on x.id=cred.grant_id
 where cred.token_hash=p_token_hash and x.revoked_at is null and x.expires_at>clock_timestamp()
 and x.turn_id=(p_command->>'turnId')::uuid;
 if not found then raise exception 'Tutor grant is unavailable' using errcode='42501'; end if;
 select h.checkpoint_id into strict cp from public.tutor_turns t join public.tutor_threads h on h.id=t.thread_id
 where t.id=g.turn_id and t.user_id=g.user_id and h.user_id=g.user_id;
 -- The grant proves connector access, not a particular host's identity.
 perform set_config('lemma.source','other',true);
 perform set_config('lemma.tool','tutor_grant_command',true);
 perform set_config('lemma.summary','Tutor connector change',true);
 result:=public.tutor_apply(g.user_id,cp,null,g.id,p_command);
 -- Record only successfully authorized activity, using the grant-derived owner.
 -- The existing telemetry trigger excludes this bookkeeping from undo history.
 update public.settings set connector_last_seen_at=clock_timestamp(),connector_last_client='other' where user_id=g.user_id;
 return result;
end $grant$;

create or replace function public.tutor_grant_followups(p_token_hash text, p_turn uuid)
returns jsonb language plpgsql security definer set search_path='' as $grant$
declare turn_owner uuid; exam_id uuid; messages jsonb; unseen int;
begin
 perform public.tutor_grant_command(p_token_hash,jsonb_build_object('operation','get','turnId',p_turn));
 select t.user_id,h.sitting_id into turn_owner,exam_id from public.exam_tutor_turns t
   join public.exam_tutor_threads h on h.user_id=t.user_id and h.id=t.thread_id where t.id=p_turn;
 if found then
  perform pg_advisory_xact_lock(hashtextextended(turn_owner::text||':exam-tutor:'||exam_id::text,0));
  select followups into messages from public.exam_tutor_turns t where t.id=p_turn and t.user_id=turn_owner for update;
  select count(*) into unseen from jsonb_array_elements(messages) f where not (f->>'seen')::boolean;
  if unseen>0 then
   update public.exam_tutor_turns set followups=(select jsonb_agg(f.value||'{"seen":true}'::jsonb order by f.ordinality)
    from jsonb_array_elements(messages) with ordinality f)
   where id=p_turn returning followups into messages;
  end if;
  return jsonb_build_object('followups',messages,'unseen',unseen);
 end if;
 select user_id into strict turn_owner from public.tutor_turns where id=p_turn;
 return public.tutor_read_followups(turn_owner,p_turn,true);
end $grant$;
