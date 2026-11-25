-- Optional versioned ranking inputs and retry receipts for one tutoring turn.
create function public.tutor_aid_ranking_valid(r jsonb) returns boolean
language plpgsql immutable set search_path='' as $valid$
declare
 h jsonb; s jsonb; d jsonb; b jsonb; key text; parent text; canonical text; pattern text;
 alias text; hint_ids jsonb:='{}'; entry_ids jsonb:='{}'; binders jsonb:='{}'; seen text[];
 id_pattern constant text:='^[A-Za-z0-9][A-Za-z0-9_.:-]*$';
 phrase_pattern constant text:='^[[:alpha:]][[:alpha:]̀-ͯ[:digit:] ,.;!?''’‐‑-]*$';
 symbol_pattern constant text:='^([A-Za-zα-ωΑ-Ω]|\\[A-Za-z]+)(_[A-Za-z0-9]|_\{[A-Za-z0-9]+\})?$';
begin
 if r is null then return true; end if;
 if jsonb_typeof(r) is distinct from 'object' or r->'version' is distinct from '1'::jsonb
    or r - array['version','hints','declaredSymbols'] <> '{}' or pg_column_size(r)>16384 then return false; end if;
 if (r ? 'hints' and jsonb_typeof(r->'hints') is distinct from 'array')
    or (r ? 'declaredSymbols' and jsonb_typeof(r->'declaredSymbols') is distinct from 'array') then return false; end if;
 if jsonb_array_length(r->'hints')>32 or jsonb_array_length(r->'declaredSymbols')>32 then return false; end if;
 for h in select value from jsonb_array_elements(r->'hints') loop
  if jsonb_typeof(h) is distinct from 'object' or h - array['id','entry','kind','aliases','priority','role','scope'] <> '{}'
     or jsonb_typeof(h->'id') is distinct from 'string' or char_length(h->>'id')>64 or (h->>'id') !~ id_pattern
     or coalesce(h->>'priority','') not in ('prefer','neutral','deemphasize')
     or coalesce(h->>'role','') not in ('given','learner','neutral','alternative','goal') then return false; end if;
  pattern:=case h->>'kind' when 'word' then '^[[:alpha:]][[:alpha:]̀-ͯ''’‐‑-]*$' when 'phrase' then phrase_pattern
    when 'symbol' then '^(([A-Za-z]|\\[A-Za-z]+)(_[A-Za-z0-9]|_\{[A-Za-z0-9]+\})?|[=<>+*/α-ωΑ-Ω←-⇿∀-⋿-])$' end;
  if pattern is null or jsonb_typeof(h->'entry') is distinct from 'string' or char_length(h->>'entry')>80
     or (h->>'entry') !~ pattern or not public.tutor_answer_aid_list(h->'aliases',8,80,pattern) then return false; end if;
  key:=h->>'id';
  canonical:=(h->>'kind')||':'||case when h->>'kind'='symbol' then h->>'entry' else
    lower(trim(regexp_replace(normalize(h->>'entry', NFKC),' +',' ','g'))) end;
  if (hint_ids ? key and hint_ids->>key<>canonical) or (entry_ids ? canonical and entry_ids->>canonical<>key) then return false; end if;
  hint_ids:=hint_ids||jsonb_build_object(key,canonical);
  entry_ids:=entry_ids||jsonb_build_object(canonical,key);
  if h ? 'scope' then
   s:=h->'scope';
   if jsonb_typeof(s) is distinct from 'object' or s - array['subject','step','mode','prefixes','phraseStates'] <> '{}'
      or (s ? 'mode' and coalesce(s->>'mode','') not in ('prose','equation'))
      or not public.tutor_answer_aid_list(s->'prefixes',12,32,'^[[:alpha:]̀-ͯ[:digit:]\\{}^_()+*/=<>.,''’ ‐‑-]+$')
      or not public.tutor_answer_aid_list(s->'phraseStates',12,80,phrase_pattern) then return false; end if;
   foreach key in array array['subject','step'] loop
    if s ? key and (jsonb_typeof(s->key) is distinct from 'string' or char_length(s->>key)>80 or (s->>key) !~ id_pattern)
      then return false; end if;
   end loop;
  end if;
 end loop;
 for h in select value from jsonb_array_elements(r->'hints') loop
  key:=h->>'id';
  for alias in select value from jsonb_array_elements_text(h->'aliases') loop
   canonical:=(h->>'kind')||':'||case when h->>'kind'='symbol' then alias else
     lower(trim(regexp_replace(normalize(alias, NFKC),' +',' ','g'))) end;
   if entry_ids ? canonical and entry_ids->>canonical<>key then return false; end if;
   entry_ids:=entry_ids||jsonb_build_object(canonical,key);
  end loop;
 end loop;
 for d in select value from jsonb_array_elements(r->'declaredSymbols') loop
  if jsonb_typeof(d) is distinct from 'object' or d - array['symbol','role','ambient','domain','codomain','binder'] <> '{}'
     or coalesce(d->>'role','') not in ('set','map','ambient','bound','unknown')
     or (d->>'role'='bound' and not d ? 'binder') or not d ? 'symbol' then return false; end if;
  foreach key in array array['symbol','ambient','domain','codomain'] loop
   if d ? key and (jsonb_typeof(d->key) is distinct from 'string' or char_length(d->>key)>24 or (d->>key) !~ symbol_pattern)
     then return false; end if;
  end loop;
  if d ? 'binder' then
   b:=d->'binder';
   if jsonb_typeof(b) is distinct from 'object' or b - array['id','parent'] <> '{}'
      or jsonb_typeof(b->'id') is distinct from 'string' or char_length(b->>'id')>64 or (b->>'id') !~ id_pattern
      or (b ? 'parent' and (jsonb_typeof(b->'parent') is distinct from 'string' or char_length(b->>'parent')>64 or (b->>'parent') !~ id_pattern))
      then return false; end if;
   key:=b->>'id'; parent:=b->>'parent';
   if binders ? key and binders->>key is distinct from parent then return false; end if;
   binders:=binders||jsonb_build_object(key,parent);
  end if;
 end loop;
 for key in select jsonb_object_keys(binders) loop
  seen:='{}';
  while key is not null loop
   if key=any(seen) or not binders ? key then return false; end if;
   seen:=array_append(seen,key);
   key:=binders->>key;
  end loop;
 end loop;
 return true;
end $valid$;
revoke all on function public.tutor_aid_ranking_valid(jsonb) from public, anon, authenticated, service_role;

alter table public.tutor_answer_aids
 add column ranking jsonb check (public.tutor_aid_ranking_valid(ranking)),
 add column grant_id uuid;

create table public.tutor_answer_aid_operations (
 id uuid not null,
 user_id uuid not null,
 turn_id uuid not null,
 grant_id uuid not null,
 request jsonb not null,
 receipt jsonb not null,
 previous jsonb,
 created_at timestamptz not null default clock_timestamp(),
 primary key (user_id,id),
 foreign key(user_id,turn_id) references public.tutor_turns(user_id,id) on delete cascade
);
alter table public.tutor_answer_aid_operations enable row level security;
do $delete_guard$
begin
 if to_regprocedure('public.lemma_block_account_deletion_writes()') is not null then
  create trigger lemma_account_delete_write_guard before insert or update or delete on public.tutor_answer_aid_operations
   for each row execute function public.lemma_block_account_deletion_writes();
 end if;
end $delete_guard$;
create index tutor_answer_aid_operations_turn_idx on public.tutor_answer_aid_operations(user_id,turn_id);
revoke insert, update, delete, truncate on public.tutor_answer_aid_operations from anon, authenticated;
insert into lemma_export_private.additional_tables(table_name) values ('tutor_answer_aid_operations') on conflict(table_name) do nothing;

create or replace function public.tutor_answer_aid_json(x public.tutor_answer_aids) returns jsonb
language sql stable set search_path='' as $json$
 select jsonb_build_object('id',x.id,'turnId',x.turn_id,'level',x.level,'wording',x.wording,'terms',x.terms,'symbols',x.symbols,
  'withhold',x.withhold,'version',x.version,'createdAt',x.created_at,'updatedAt',x.updated_at)
  ||case when x.ranking is null then '{}'::jsonb else jsonb_build_object('ranking',x.ranking) end
  ||case when x.grant_id is null then '{}'::jsonb else jsonb_build_object('grantId',x.grant_id) end
$json$;

create or replace function public.tutor_answer_aid_connector(p_owner uuid, p_connector_hash text, p_grant_operation_id uuid, p_command jsonb)
returns jsonb language plpgsql security definer set search_path='' as $connector$
declare
 secret text; verifier text; anchor_grant uuid; target_turn uuid; t public.tutor_turns%rowtype;
 operation text:=p_command->>'operation'; x public.tutor_answer_aids%rowtype; aid uuid; patch jsonb;
 v_level text; v_wording jsonb; v_terms jsonb; v_symbols jsonb; v_withhold jsonb; v_ranking jsonb;
 prior public.tutor_answer_aid_operations%rowtype;
 original public.tutor_answer_aid_operations%rowtype;
 before_change jsonb; result jsonb; scope jsonb; current_exists boolean; expected integer;
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
 if p_grant_operation_id is null or jsonb_typeof(p_command) is distinct from 'object' or coalesce(operation,'') not in ('set','undo','list')
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
  select jsonb_strip_nulls(jsonb_build_object(
    'subject',nullif(trim(both '-' from regexp_replace(lower(s.name),'[^a-z0-9]+','-','g')),''),
    'step',cp.code||':'||cp.current_step)) into scope
  from public.tutor_threads h
  join public.checkpoints cp on cp.id=h.checkpoint_id and cp.user_id=h.user_id
  join public.projects p on p.id=h.project_id and p.user_id=h.user_id
  left join public.subjects s on s.id=p.subject_id and (s.user_id=p_owner or s.user_id is null)
  where h.id=t.thread_id and h.user_id=p_owner;
  return jsonb_build_object('scope',coalesce(scope,'{}'::jsonb),'answerAids',coalesce((select jsonb_agg(public.tutor_answer_aid_json(q) order by o.sequence,q.created_at,q.id)
   from (select q0.* from public.tutor_answer_aids q0 join public.tutor_turns t0 on t0.user_id=q0.user_id and t0.id=q0.turn_id
    where q0.user_id=p_owner and t0.thread_id=t.thread_id order by t0.sequence desc,q0.created_at desc limit 10) q
   join public.tutor_turns o on o.user_id=q.user_id and o.id=q.turn_id),'[]'::jsonb));
 end if;

 if t.status<>'completed' or not exists(select 1 from public.tutor_attempts a where a.turn_id=t.id and a.user_id=p_owner
   and a.grant_id=anchor_grant and a.reason='reply') then
  raise exception 'Reply to the turn before attaching answer aids' using errcode='40001';
 end if;
 aid:=(p_command->>'aidId')::uuid;
 if aid is null then raise exception 'Missing answer aid operation ID' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text||':answer-aid-turn:'||t.id::text,0));
 select * into prior from public.tutor_answer_aid_operations where user_id=p_owner and id=aid;
 if found then
  if prior.turn_id<>t.id or prior.grant_id<>anchor_grant or prior.request<>p_command then
   raise exception 'This answer aid operation ID is already used' using errcode='23505';
  end if;
  return prior.receipt;
 end if;
 select * into x from public.tutor_answer_aids where user_id=p_owner and turn_id=t.id;
 current_exists:=found;
 if exists(select 1 from public.tutor_answer_aids where id=aid and (user_id<>p_owner or turn_id<>t.id)) then
  raise exception 'This answer aid ID is already used' using errcode='23505';
 end if;
 if operation='set' then
  patch:=p_command - array['operation','turnId','aidId','expectedVersion'];
  v_ranking:=patch->'ranking';
  if not public.tutor_answer_aid_valid(patch - 'ranking') or not public.tutor_aid_ranking_valid(v_ranking) then
   raise exception 'Invalid answer aids' using errcode='22023';
  end if;
 else
  if (p_command - array['operation','turnId','aidId','undoOperationId','expectedVersion'])<>'{}' or not p_command ? 'expectedVersion' then
   raise exception 'Invalid answer aid undo' using errcode='22023';
  end if;
  select * into original from public.tutor_answer_aid_operations
   where user_id=p_owner and turn_id=t.id and grant_id=anchor_grant and id=(p_command->>'undoOperationId')::uuid;
  if not found or not current_exists or original.receipt->>'status'<>'set'
     or original.receipt->>'changed'<>'true' or (original.receipt->'answerAid'->>'version')::integer<>x.version then
   raise exception 'The answer aids changed; read them before retrying' using errcode='40001';
  end if;
  -- Undo the first aid to an empty aid with a new version. Keep the version
  -- monotonic and keep retries of the original operation inert.
  patch:=coalesce(original.previous,'{"level":"none"}'::jsonb);
  v_ranking:=patch->'ranking';
 end if;
 if p_command ? 'expectedVersion' then
  if jsonb_typeof(p_command->'expectedVersion') is distinct from 'number' then
   raise exception 'Invalid answer aid version' using errcode='22023';
  end if;
  expected:=(p_command->>'expectedVersion')::integer;
  if expected<>coalesce(x.version,0) then
   raise exception 'The answer aids changed; read them before retrying' using errcode='40001';
  end if;
 end if;
 v_level:=coalesce(patch->>'level','scaffold'); v_wording:=coalesce(patch->'wording','[]'::jsonb); v_terms:=coalesce(patch->'terms','[]'::jsonb);
 v_symbols:=coalesce(patch->'symbols','[]'::jsonb); v_withhold:=coalesce(patch->'withhold','[]'::jsonb);
 if current_exists then
  if operation='set' and x.level=v_level and x.wording=v_wording and x.terms=v_terms and x.symbols=v_symbols
     and x.withhold=v_withhold and x.ranking is not distinct from v_ranking and x.grant_id is not distinct from anchor_grant then
   result:=jsonb_build_object('status','set','changed',false,'answerAid',public.tutor_answer_aid_json(x));
  else
   before_change:=public.tutor_answer_aid_json(x) - array['id','turnId','version','createdAt','updatedAt','grantId'];
   update public.tutor_answer_aids set level=v_level,wording=v_wording,terms=v_terms,symbols=v_symbols,withhold=v_withhold,
    ranking=v_ranking,grant_id=anchor_grant,version=version+1,updated_at=clock_timestamp() where id=x.id returning * into x;
  end if;
 else
  insert into public.tutor_answer_aids(id,user_id,turn_id,level,wording,terms,symbols,withhold,ranking,grant_id)
   values(aid,p_owner,t.id,v_level,v_wording,v_terms,v_symbols,v_withhold,v_ranking,anchor_grant) returning * into x;
 end if;
 result:=coalesce(result,jsonb_build_object('status',case when operation='undo' then 'undone' else 'set' end,
  'changed',true,'answerAid',public.tutor_answer_aid_json(x)));
 insert into public.tutor_answer_aid_operations(id,user_id,turn_id,grant_id,request,receipt,previous)
  values(aid,p_owner,t.id,anchor_grant,p_command,result,before_change);
 return result;
end $connector$;

-- Match browser UTF-16 offsets exactly. Supplementary characters advance two units.
create function public.tutor_accepted_spans_valid(question text, spans jsonb) returns boolean
language plpgsql immutable set search_path='' as $spans$
declare
 item jsonb; offsets integer[]:=array[0]; at integer:=0; i integer; lo integer; hi integer;
 begin_unit integer; end_unit integer:=0; masked text;
begin
 if question is null or char_length(question)>2000 or jsonb_typeof(spans) is distinct from 'array'
    or pg_column_size(spans)>16384 then return false; end if;
 if jsonb_array_length(spans) not between 1 and 32 then return false; end if;
 for i in 1..char_length(question) loop
  at:=at+case when ascii(substr(question,i,1))>65535 then 2 else 1 end;
  offsets:=array_append(offsets,at);
 end loop;
 masked:=regexp_replace(question,'\[\[lemma-image:[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}\]\]',repeat(' ',52),'gi');
 for item in select value from jsonb_array_elements(spans) loop
  if jsonb_typeof(item) is distinct from 'object' or item-array['start','end','text','source','aidId','aidVersion']<>'{}'
   or jsonb_typeof(item->'start') is distinct from 'number' or (item->>'start') !~ '^[0-9]{1,4}$'
   or jsonb_typeof(item->'end') is distinct from 'number' or (item->>'end') !~ '^[0-9]{1,4}$'
   or jsonb_typeof(item->'text') is distinct from 'string' or (item->>'text') !~ '[^[:space:]]'
   or coalesce(item->>'source','') not in ('word','phrase','symbol','equation','neural','ngram','personal','tutor') then return false; end if;
  begin_unit:=(item->>'start')::integer;
  lo:=array_position(offsets,begin_unit);
  hi:=array_position(offsets,(item->>'end')::integer);
  if lo is null or hi is null or lo>=hi or begin_unit<end_unit or (item->>'end')::integer-begin_unit>2000
   or (item->>'text') is distinct from substr(question,lo,hi-lo)
   or substr(question,lo,hi-lo) is distinct from substr(masked,lo,hi-lo) then return false; end if;
  if item ? 'aidId' or item ? 'aidVersion' then
   if jsonb_typeof(item->'aidId') is distinct from 'string'
    or (item->>'aidId') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    or jsonb_typeof(item->'aidVersion') is distinct from 'number'
    or (item->>'aidVersion') !~ '^[0-9]{1,10}$'
    or (item->>'aidVersion')::numeric not between 1 and 2147483647 then return false; end if;
  end if;
  end_unit:=(item->>'end')::integer;
 end loop;
 return true;
end $spans$;
revoke all on function public.tutor_accepted_spans_valid(text,jsonb) from public, anon, authenticated, service_role;

-- Preserve the existing owner/ink submission and receipt contracts. Add the
-- provenance to a new turn in the same transaction, before a grant can read it.
create function public.tutor_owner_assisted_start(
 p_owner uuid,p_slug text,p_checkpoint uuid,p_command jsonb,p_attachments jsonb,p_spans jsonb
) returns jsonb language plpgsql security definer set search_path='' as $submit$
declare u uuid:=auth.uid(); opid uuid; previous uuid; saved jsonb; result jsonb;
begin
 if current_setting('role',true) is distinct from 'authenticated' or u is null or u is distinct from p_owner then
  raise exception 'Authenticated tutor owner required' using errcode='42501';
 end if;
 if p_command->>'operation' is distinct from 'start' or not public.tutor_accepted_spans_valid(p_command->>'question',p_spans) then
  raise exception 'Invalid accepted suggestion spans' using errcode='22023';
 end if;
 opid:=(p_command->>'operationId')::uuid;
 perform pg_advisory_xact_lock(hashtextextended(u::text||':tutor:'||p_checkpoint::text,0));
 select id,snapshot->'acceptedSpans' into previous,saved from public.tutor_turns where user_id=u and client_turn_id=opid;
 result:=case when p_attachments is null
  then public.tutor_owner_command(u,p_slug,p_checkpoint,p_command)
  else public.tutor_owner_ink_command(u,p_slug,p_checkpoint,p_command,p_attachments) end;
 if result->>'status' is distinct from 'submitted' then return result; end if;
 if previous is not null then
  if saved is distinct from p_spans then raise exception 'This turn has different suggestion provenance' using errcode='22023'; end if;
 else
  update public.tutor_turns set snapshot=snapshot||jsonb_build_object('acceptedSpans',p_spans)
   where user_id=u and id=(result->>'turnId')::uuid;
 end if;
 return result;
end $submit$;
revoke all on function public.tutor_owner_assisted_start(uuid,text,uuid,jsonb,jsonb,jsonb) from public, anon, service_role;
grant execute on function public.tutor_owner_assisted_start(uuid,text,uuid,jsonb,jsonb,jsonb) to authenticated;
