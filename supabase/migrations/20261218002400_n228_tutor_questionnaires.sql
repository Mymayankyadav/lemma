-- N228 (Owner): a quick questionnaire the tutor attaches to its reply (short answer, one choice or several choices).
-- The learner can open it, answer part of it, come back later and submit it; every answer is kept server-side.
-- The tutor reads the answers to judge the learner. Additive only: new tables and new functions.

-- A questionnaire's questions, checked whole. Each question has a stable id, a kind and a prompt; one-choice (mcq)
-- and several-choice (msq) questions carry 2–8 options; short-answer questions carry none.
create function public.tutor_questionnaire_valid(q jsonb) returns boolean
language plpgsql immutable set search_path='' as $valid$
declare item jsonb; ids text[]:='{}'; kind text; options jsonb;
begin
 if jsonb_typeof(q) is distinct from 'array' or jsonb_array_length(q) not between 1 and 10 then return false; end if;
 for item in select value from jsonb_array_elements(q) loop
  if jsonb_typeof(item) is distinct from 'object'
   or (item - array['id','kind','prompt','options'])<>'{}'
   or jsonb_typeof(item->'id') is distinct from 'string' or (item->>'id') !~ '^[a-z0-9_-]{1,24}$'
   or (item->>'id')=any(ids)
   or jsonb_typeof(item->'prompt') is distinct from 'string' or char_length(item->>'prompt') not between 1 and 1000
   or (item->>'prompt') !~ '[^[:space:]]' then return false; end if;
  ids:=ids||(item->>'id');
  kind:=item->>'kind'; options:=item->'options';
  if kind='short' then
   if item ? 'options' then return false; end if;
  elsif kind in ('mcq','msq') then
   if jsonb_typeof(options) is distinct from 'array' or jsonb_array_length(options) not between 2 and 8
    or exists(select 1 from jsonb_array_elements(options) o where jsonb_typeof(o) is distinct from 'string'
     or char_length(o #>> '{}') not between 1 and 300 or (o #>> '{}') !~ '[^[:space:]]') then return false; end if;
  else
   return false;
  end if;
 end loop;
 return true;
end $valid$;
revoke all on function public.tutor_questionnaire_valid(jsonb) from public, anon, authenticated, service_role;

-- The learner's answers, checked against the questions: short answers are text (up to 2000 characters), one choice is
-- an option index, several choices are distinct option indices. A missing key is an unanswered question.
create function public.tutor_questionnaire_answers_valid(q jsonb, a jsonb) returns boolean
language plpgsql immutable set search_path='' as $answers$
declare key text; value jsonb; question jsonb; n integer;
begin
 if jsonb_typeof(a) is distinct from 'object' or pg_column_size(a)>32768 then return false; end if;
 for key, value in select * from jsonb_each(a) loop
  select x into question from jsonb_array_elements(q) x where x->>'id'=key;
  if question is null then return false; end if;
  n:=coalesce(jsonb_array_length(question->'options'),0);
  if question->>'kind'='short' then
   if jsonb_typeof(value) is distinct from 'string' or char_length(value #>> '{}')>2000 then return false; end if;
  elsif question->>'kind'='mcq' then
   if jsonb_typeof(value) is distinct from 'number' or (value #>> '{}') !~ '^[0-9]+$' or (value #>> '{}')::integer>=n then return false; end if;
  else
   if jsonb_typeof(value) is distinct from 'array' or jsonb_array_length(value)>n
    or exists(select 1 from jsonb_array_elements(value) v where jsonb_typeof(v) is distinct from 'number'
     or (v #>> '{}') !~ '^[0-9]+$' or (v #>> '{}')::integer>=n)
    or (select count(distinct v #>> '{}') from jsonb_array_elements(value) v)<>jsonb_array_length(value) then return false; end if;
  end if;
 end loop;
 return true;
end $answers$;
revoke all on function public.tutor_questionnaire_answers_valid(jsonb,jsonb) from public, anon, authenticated, service_role;

-- Every question has an answer: text with a non-space character, a choice, or at least one of several choices.
create function public.tutor_questionnaire_complete(q jsonb, a jsonb) returns boolean
language sql immutable set search_path='' as $complete$
 select not exists(select 1 from jsonb_array_elements(q) x where not coalesce(
  case x->>'kind'
   when 'short' then coalesce(a->>(x->>'id'),'') ~ '[^[:space:]]'
   when 'mcq' then jsonb_typeof(a->(x->>'id'))='number'
   else jsonb_typeof(a->(x->>'id'))='array' and jsonb_array_length(a->(x->>'id'))>0 end,false))
$complete$;
revoke all on function public.tutor_questionnaire_complete(jsonb,jsonb) from public, anon, authenticated, service_role;

create table public.tutor_questionnaires (
 id uuid primary key,
 user_id uuid not null,
 turn_id uuid not null,
 title text not null check (char_length(title) between 1 and 120 and title ~ '[^[:space:]]'),
 purpose text not null default 'check' check (purpose in ('diagnose','check','practice','reflect','exit')),
 questions jsonb not null check (public.tutor_questionnaire_valid(questions)),
 created_at timestamptz not null default clock_timestamp(),
 unique(user_id,id),
 foreign key(user_id,turn_id) references public.tutor_turns(user_id,id) on delete cascade
);
create index tutor_questionnaires_turn on public.tutor_questionnaires(user_id,turn_id);

create table public.tutor_questionnaire_responses (
 questionnaire_id uuid primary key,
 user_id uuid not null,
 answers jsonb not null default '{}' check (jsonb_typeof(answers)='object'),
 version integer not null default 1 check (version>0),
 opened_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 submitted_at timestamptz,
 foreign key(user_id,questionnaire_id) references public.tutor_questionnaires(user_id,id) on delete cascade
);

alter table public.tutor_questionnaires enable row level security;
alter table public.tutor_questionnaire_responses enable row level security;
-- Browsers never write these tables directly (bug #1094): every read and write goes through the functions below.
revoke insert, update, delete, truncate on public.tutor_questionnaires, public.tutor_questionnaire_responses from anon, authenticated;

do $questionnaire_delete_guards$
declare name text;
begin
 if to_regprocedure('public.lemma_block_account_deletion_writes()') is not null then
  foreach name in array array['tutor_questionnaires','tutor_questionnaire_responses'] loop
   execute format('create trigger lemma_account_delete_write_guard before insert or update or delete on public.%I for each row execute function public.lemma_block_account_deletion_writes()',name);
  end loop;
 end if;
end $questionnaire_delete_guards$;

insert into lemma_export_private.additional_tables(table_name) values
 ('tutor_questionnaires'),('tutor_questionnaire_responses')
 on conflict(table_name) do nothing;

create function public.tutor_questionnaire_json(x public.tutor_questionnaires, r public.tutor_questionnaire_responses)
returns jsonb language sql stable set search_path='' as $json$
 select jsonb_build_object('id',x.id,'turnId',x.turn_id,'title',x.title,'purpose',x.purpose,'questions',x.questions,
  'createdAt',x.created_at,
  'state',case when r.questionnaire_id is null then 'unseen' when r.submitted_at is not null then 'complete' else 'started' end,
  'answers',coalesce(r.answers,'{}'::jsonb),'version',coalesce(r.version,0),
  'openedAt',r.opened_at,'updatedAt',r.updated_at,'submittedAt',r.submitted_at)
$json$;
revoke all on function public.tutor_questionnaire_json(public.tutor_questionnaires,public.tutor_questionnaire_responses) from public, anon, authenticated, service_role;

-- The owner's questionnaires on one checkpoint's tutor thread, newest turn last.
create function public.tutor_questionnaire_state(p_owner uuid, p_slug text, p_checkpoint uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $state$
declare u uuid:=auth.uid(); cp public.checkpoints%rowtype; h public.tutor_threads%rowtype;
begin
 if current_setting('role',true) is distinct from 'authenticated' or u is null or u is distinct from p_owner then
  raise exception 'Sign in to this account to open the tutor' using errcode='42501';
 end if;
 select c.* into cp from public.checkpoints c join public.projects p on p.id=c.project_id and p.user_id=c.user_id
 where c.id=p_checkpoint and c.user_id=u and p.slug=p_slug;
 if not found or exists(select 1 from public.account_deletion_requests d where d.user_id=u) then
  raise exception 'Checkpoint is unavailable' using errcode='42501';
 end if;
 select * into h from public.tutor_threads where user_id=u and checkpoint_id=cp.id;
 return coalesce((select jsonb_agg(public.tutor_questionnaire_json(x,r) order by t.sequence,x.created_at,x.id)
  from public.tutor_questionnaires x
  join public.tutor_turns t on t.user_id=x.user_id and t.id=x.turn_id
  left join public.tutor_questionnaire_responses r on r.user_id=x.user_id and r.questionnaire_id=x.id
  where x.user_id=u and t.thread_id=h.id),'[]'::jsonb);
end $state$;
revoke all on function public.tutor_questionnaire_state(uuid,text,uuid) from public, anon, service_role;
grant execute on function public.tutor_questionnaire_state(uuid,text,uuid) to authenticated;

-- The owner opens (p_answers null), saves or submits answers. p_expected_version is the version the learner's copy
-- was read at (0 before the first save). A stale or submitted copy is not overwritten: the current one comes back
-- with status 'conflict' or 'submitted' so nothing typed elsewhere is lost.
create function public.tutor_questionnaire_save(p_owner uuid, p_questionnaire uuid, p_expected_version integer,
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
revoke all on function public.tutor_questionnaire_save(uuid,uuid,integer,jsonb,boolean) from public, anon, service_role;
grant execute on function public.tutor_questionnaire_save(uuid,uuid,integer,jsonb,boolean) to authenticated;

-- The tutor (Lemma MCP with the owner's connector secret and the handoff's grant) attaches a questionnaire to a turn it
-- answered ('create', idempotent by id) or reads the thread's questionnaires with the learner's answers ('list').
create function public.tutor_questionnaire_connector(p_owner uuid, p_connector_hash text, p_grant_operation_id uuid, p_command jsonb)
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
revoke all on function public.tutor_questionnaire_connector(uuid,text,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.tutor_questionnaire_connector(uuid,text,uuid,jsonb) to service_role;
