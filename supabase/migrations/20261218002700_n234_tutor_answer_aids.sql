-- N234 (Owner: "since tutor is aware of questions he can provide lot safe phrases that can act like boiler plate"):
-- the tutor attaches answer aids to a reply it gave: wording phrases, terms, symbols and a list of terms to withhold.
-- Lemma's keyboard uses them to shape its suggestion strip while the learner writes the next answer.
-- Additive only: one new table and new functions. Nothing existing is changed.

-- Whether a jsonb value is an array of distinct, non-blank strings within the bounds. An absent list is valid.
create function public.tutor_answer_aid_list(l jsonb, max_items integer, max_chars integer, pattern text) returns boolean
language plpgsql immutable set search_path='' as $list$
begin
 if l is null then return true; end if;
 if jsonb_typeof(l) is distinct from 'array' or jsonb_array_length(l)>max_items then return false; end if;
 if exists(select 1 from jsonb_array_elements(l) e where jsonb_typeof(e) is distinct from 'string'
   or char_length(e #>> '{}') not between 1 and max_chars or (e #>> '{}') !~ '[^[:space:]]' or (e #>> '{}') !~ pattern) then return false; end if;
 return (select count(distinct lower(e #>> '{}')) from jsonb_array_elements(l) e)=jsonb_array_length(l);
end $list$;
revoke all on function public.tutor_answer_aid_list(jsonb,integer,integer,text) from public, anon, authenticated, service_role;

-- A tutor's answer aids, checked whole. Wording is prose scaffolding (no maths markup); a term or wording phrase may not
-- contain a withheld term.
create function public.tutor_answer_aid_valid(p jsonb) returns boolean
language plpgsql immutable set search_path='' as $valid$
begin
 if jsonb_typeof(p) is distinct from 'object' or pg_column_size(p)>16384
  or (p - array['level','wording','terms','symbols','withhold'])<>'{}' then return false; end if;
 if p ? 'level' and (jsonb_typeof(p->'level') is distinct from 'string' or p->>'level' not in ('scaffold','light','none')) then return false; end if;
 if not public.tutor_answer_aid_list(p->'wording',24,80,'^[^$\\^_={}<>]+$')
  or not public.tutor_answer_aid_list(p->'terms',40,40,'^[A-Za-z][A-Za-z -]*$')
  or not public.tutor_answer_aid_list(p->'symbols',16,24,'^[A-Za-z0-9\\{}^_()+*/=<>.,'' -]+$')
  or not public.tutor_answer_aid_list(p->'withhold',24,40,'^[A-Za-z][A-Za-z -]*$') then return false; end if;
 if exists(select 1 from jsonb_array_elements_text(coalesce(p->'wording','[]'::jsonb)||coalesce(p->'terms','[]'::jsonb)) w(v)
   cross join jsonb_array_elements_text(coalesce(p->'withhold','[]'::jsonb)) h(v)
   where position(lower(h.v) in lower(w.v))>0) then return false; end if;
 return true;
end $valid$;
revoke all on function public.tutor_answer_aid_valid(jsonb) from public, anon, authenticated, service_role;

create table public.tutor_answer_aids (
 id uuid primary key,
 user_id uuid not null,
 turn_id uuid not null,
 level text not null default 'scaffold' check (level in ('scaffold','light','none')),
 wording jsonb not null default '[]',
 terms jsonb not null default '[]',
 symbols jsonb not null default '[]',
 withhold jsonb not null default '[]',
 version integer not null default 1 check (version>0),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 unique(user_id,id),
 unique(user_id,turn_id),
 foreign key(user_id,turn_id) references public.tutor_turns(user_id,id) on delete cascade,
 check (public.tutor_answer_aid_valid(jsonb_build_object('level',level,'wording',wording,'terms',terms,'symbols',symbols,'withhold',withhold)))
);
alter table public.tutor_answer_aids enable row level security;
-- Browsers never write this table directly (bug #1094): reads and writes go through the functions below.
revoke insert, update, delete, truncate on public.tutor_answer_aids from anon, authenticated;

do $answer_aid_delete_guard$
begin
 if to_regprocedure('public.lemma_block_account_deletion_writes()') is not null then
  create trigger lemma_account_delete_write_guard before insert or update or delete on public.tutor_answer_aids
   for each row execute function public.lemma_block_account_deletion_writes();
 end if;
end $answer_aid_delete_guard$;

insert into lemma_export_private.additional_tables(table_name) values ('tutor_answer_aids') on conflict(table_name) do nothing;

create function public.tutor_answer_aid_json(x public.tutor_answer_aids) returns jsonb
language sql stable set search_path='' as $json$
 select jsonb_build_object('id',x.id,'turnId',x.turn_id,'level',x.level,'wording',x.wording,'terms',x.terms,'symbols',x.symbols,
  'withhold',x.withhold,'version',x.version,'createdAt',x.created_at,'updatedAt',x.updated_at)
$json$;
revoke all on function public.tutor_answer_aid_json(public.tutor_answer_aids) from public, anon, authenticated, service_role;

-- The owner's answer aids on one checkpoint's tutor thread, oldest turn first.
create function public.tutor_answer_aid_state(p_owner uuid, p_slug text, p_checkpoint uuid)
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
 return coalesce((select jsonb_agg(public.tutor_answer_aid_json(x) order by t.sequence,x.created_at,x.id)
  from public.tutor_answer_aids x join public.tutor_turns t on t.user_id=x.user_id and t.id=x.turn_id
  where x.user_id=u and t.thread_id=h.id),'[]'::jsonb);
end $state$;
revoke all on function public.tutor_answer_aid_state(uuid,text,uuid) from public, anon, service_role;
grant execute on function public.tutor_answer_aid_state(uuid,text,uuid) to authenticated;

-- The tutor (Lemma MCP with the owner's connector secret and the handoff's grant) sets the answer aids on a turn it
-- answered ('set': creates, or replaces the turn's aids with the next version; idempotent) or reads the thread's aids ('list').
create function public.tutor_answer_aid_connector(p_owner uuid, p_connector_hash text, p_grant_operation_id uuid, p_command jsonb)
returns jsonb language plpgsql security definer set search_path='' as $connector$
declare
 secret text; verifier text; anchor_grant uuid; target_turn uuid; t public.tutor_turns%rowtype;
 operation text:=p_command->>'operation'; x public.tutor_answer_aids%rowtype; aid uuid; patch jsonb;
 v_level text; v_wording jsonb; v_terms jsonb; v_symbols jsonb; v_withhold jsonb;
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
 if p_grant_operation_id is null or jsonb_typeof(p_command) is distinct from 'object' or coalesce(operation,'') not in ('set','list')
  or pg_column_size(p_command)>32768 then
  raise exception 'Invalid tutor answer aid command' using errcode='22023';
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
  return jsonb_build_object('answerAids',coalesce((select jsonb_agg(public.tutor_answer_aid_json(q) order by o.sequence,q.created_at,q.id)
   from (select q0.* from public.tutor_answer_aids q0 join public.tutor_turns t0 on t0.user_id=q0.user_id and t0.id=q0.turn_id
    where q0.user_id=p_owner and t0.thread_id=t.thread_id order by t0.sequence desc,q0.created_at desc limit 10) q
   join public.tutor_turns o on o.user_id=q.user_id and o.id=q.turn_id),'[]'::jsonb));
 end if;

 -- set: only on a turn this grant answered.
 if (p_command - array['operation','turnId','aidId','level','wording','terms','symbols','withhold'])<>'{}' then
  raise exception 'Unexpected answer aid fields' using errcode='22023';
 end if;
 if t.status<>'completed' or not exists(select 1 from public.tutor_attempts a where a.turn_id=t.id and a.user_id=p_owner
   and a.grant_id=anchor_grant and a.reason='reply') then
  raise exception 'Reply to the turn before attaching answer aids' using errcode='40001';
 end if;
 aid:=(p_command->>'aidId')::uuid;
 patch:=p_command - array['operation','turnId','aidId'];
 if aid is null or not public.tutor_answer_aid_valid(patch) then
  raise exception 'Invalid answer aids' using errcode='22023';
 end if;
 v_level:=coalesce(patch->>'level','scaffold'); v_wording:=coalesce(patch->'wording','[]'::jsonb); v_terms:=coalesce(patch->'terms','[]'::jsonb);
 v_symbols:=coalesce(patch->'symbols','[]'::jsonb); v_withhold:=coalesce(patch->'withhold','[]'::jsonb);
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text||':answer-aid-turn:'||t.id::text,0));
 if exists(select 1 from public.tutor_answer_aids where id=aid and (user_id<>p_owner or turn_id<>t.id)) then
  raise exception 'This answer aid ID is already used' using errcode='23505';
 end if;
 select * into x from public.tutor_answer_aids where user_id=p_owner and turn_id=t.id;
 if found then
  if x.level=v_level and x.wording=v_wording and x.terms=v_terms and x.symbols=v_symbols and x.withhold=v_withhold then
   return jsonb_build_object('status','set','answerAid',public.tutor_answer_aid_json(x));
  end if;
  update public.tutor_answer_aids set level=v_level,wording=v_wording,terms=v_terms,symbols=v_symbols,withhold=v_withhold,
   version=version+1,updated_at=clock_timestamp() where id=x.id returning * into x;
  return jsonb_build_object('status','set','answerAid',public.tutor_answer_aid_json(x));
 end if;
 insert into public.tutor_answer_aids(id,user_id,turn_id,level,wording,terms,symbols,withhold)
 values(aid,p_owner,t.id,v_level,v_wording,v_terms,v_symbols,v_withhold) returning * into x;
 return jsonb_build_object('status','set','answerAid',public.tutor_answer_aid_json(x));
end $connector$;
revoke all on function public.tutor_answer_aid_connector(uuid,text,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.tutor_answer_aid_connector(uuid,text,uuid,jsonb) to service_role;
