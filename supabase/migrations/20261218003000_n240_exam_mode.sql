-- N240: owner-scoped exam prep, scored responses and retrieval ideas.
create table public.exam_sittings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null,
  title text not null check (length(title) between 1 and 120),
  starts_at timestamptz,
  time_zone text not null,
  duration_minutes integer check (duration_minutes between 5 and 600),
  study_minutes integer check (study_minutes between 0 and 20000),
  study_minutes_set_at timestamptz,
  activation_study_minutes integer check (activation_study_minutes between 0 and 20000),
  last_study_at timestamptz,
  objective text not null check (objective in ('expected_marks','pass_threshold')),
  pass_marks numeric check (pass_marks between 0 and 10000),
  total_marks numeric check (total_marks > 0 and total_marks <= 10000),
  format text check (length(format) <= 1000),
  sources jsonb not null check (jsonb_typeof(sources) = 'array' and jsonb_array_length(sources) <= 20),
  blueprint jsonb not null check (jsonb_typeof(blueprint) = 'array' and jsonb_array_length(blueprint) <= 60),
  blueprint_version integer not null default 1 check (blueprint_version > 0),
  ledger jsonb not null default '{}' check (jsonb_typeof(ledger) = 'object'),
  status text not null check (status in ('planned','active','paused','finished','cancelled')),
  phase text not null check (phase in ('map','screen','teach','verify')),
  card_mode text not null check (card_mode in ('later','now','quiet')),
  bookmark jsonb check (jsonb_typeof(bookmark) = 'object'),
  plan_note text check (length(plan_note) <= 600),
  next_question text check (length(next_question) <= 600),
  activated_at timestamptz,
  paused_at timestamptz,
  finished_at timestamptz,
  happened boolean,
  result_marks numeric check (result_marks between 0 and 10000),
  result_note text check (length(result_note) <= 300),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, project_id, id),
  foreign key (user_id, project_id) references public.projects(user_id,id) on delete cascade deferrable,
  check ((status = 'finished') = (finished_at is not null)),
  check ((status = 'finished') = (happened is not null)),
  check (objective <> 'pass_threshold' or pass_marks is not null),
  check ((study_minutes is null) = (study_minutes_set_at is null))
);
create unique index exam_sittings_one_active on public.exam_sittings(project_id) where status = 'active';
create index exam_sittings_owner_project on public.exam_sittings(user_id,project_id,status,starts_at,id);

create table public.exam_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  sitting_id uuid not null,
  project_id uuid not null,
  row_key text not null check (row_key ~ '^[a-z0-9][a-z0-9_-]{0,39}$'),
  blueprint_version integer not null check (blueprint_version > 0),
  kind text not null check (kind in ('probe','practice','verify','review','recap')),
  prompt text check (length(prompt) <= 2000),
  delivery text not null check (delivery in ('chat','questionnaire','practice_question','paper','other')),
  delivery_ref text check (length(delivery_ref) <= 200),
  outcome text not null check (outcome in ('correct','partial','incorrect','unscorable','skipped','timeout','exposure')),
  marks_awarded numeric check (marks_awarded between 0 and 1000),
  marks_possible numeric check (marks_possible > 0 and marks_possible <= 1000),
  independence text not null check (independence in ('independent','hinted','after_recap','reading')),
  hint_level smallint not null check (hint_level between 0 and 4),
  novelty text not null check (novelty in ('novel','familiar','seen_solution')),
  timed boolean not null,
  seconds integer check (seconds between 0 and 36000),
  scoring text not null check (scoring in ('tutor','learner','rubric')),
  confidence text not null check (confidence in ('high','medium','low')),
  learner_confirmed boolean not null,
  concept text check (length(concept) between 1 and 60),
  level text check (level in ('recall','use','understand','transfer')),
  session_id uuid,
  note text check (length(note) <= 300),
  occurred_at timestamptz not null,
  corrected_at timestamptz,
  corrected_reason text check (length(corrected_reason) between 1 and 200),
  voided_at timestamptz,
  void_reason text check (length(void_reason) between 1 and 200),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (user_id, project_id, sitting_id) references public.exam_sittings(user_id,project_id,id) on delete cascade deferrable,
  foreign key (user_id, session_id) references public.sessions(user_id,id) on delete set null (session_id) deferrable,
  check ((outcome = 'exposure') = (independence = 'reading')),
  check (outcome <> 'exposure' or marks_awarded is null),
  check (marks_awarded <= marks_possible),
  check ((corrected_at is null) = (corrected_reason is null)),
  check ((voided_at is null) = (void_reason is null))
);
create unique index exam_attempts_live_delivery on public.exam_attempts(sitting_id,delivery_ref)
  where voided_at is null and delivery_ref is not null;
create index exam_attempts_owner_sitting on public.exam_attempts(user_id,sitting_id,occurred_at desc,id);
create index exam_attempts_sitting_fk on public.exam_attempts(user_id,project_id,sitting_id);
create index exam_attempts_session_fk on public.exam_attempts(user_id,session_id) where session_id is not null;

create table public.card_ideas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null,
  sitting_id uuid,
  target text not null check (length(target) between 3 and 300),
  target_key text not null check (length(target_key) > 0),
  concept text check (length(concept) between 1 and 60),
  level text check (level in ('recall','use','understand','transfer')),
  reason text check (length(reason) <= 300),
  front text check (length(front) <= 1500),
  back text check (length(back) <= 3000),
  evidence jsonb not null check (jsonb_typeof(evidence) = 'array' and jsonb_array_length(evidence) <= 20),
  sightings integer not null default 1 check (sightings > 0),
  status text not null check (status in ('saved','drafted','linked','dismissed')),
  proposal_id uuid,
  note_id uuid,
  conversion_key uuid not null default gen_random_uuid(),
  resolved_at timestamptz,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (user_id, project_id) references public.projects(user_id,id) on delete cascade deferrable,
  foreign key (user_id, project_id, sitting_id) references public.exam_sittings(user_id,project_id,id) on delete set null (sitting_id) deferrable,
  foreign key (user_id, proposal_id) references public.proposals(user_id,id) on delete set null (proposal_id) deferrable,
  foreign key (user_id, note_id) references public.notes(user_id,id) on delete set null (note_id) deferrable
);
create unique index card_ideas_open_target on public.card_ideas(project_id,target_key)
  where status in ('saved','drafted');
create index card_ideas_owner_project on public.card_ideas(user_id,project_id,status,id);
create index card_ideas_owner_sitting on public.card_ideas(user_id,sitting_id,status,id) where sitting_id is not null;
create index card_ideas_proposal_fk on public.card_ideas(user_id,proposal_id) where proposal_id is not null;
create index card_ideas_note_fk on public.card_ideas(user_id,note_id) where note_id is not null;

do $acl$
declare t text;
begin
  foreach t in array array['exam_sittings','exam_attempts','card_ideas'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy exam_owner_read on public.%I for select to authenticated using (user_id=(select auth.uid()))', t);
    execute format('create trigger lemma_log_change after insert or update or delete on public.%I for each row execute function public.log_change()', t);
    execute format('create trigger lemma_account_delete_write_guard before insert or update or delete on public.%I for each row execute function public.lemma_block_account_deletion_writes()', t);
  end loop;
end
$acl$;
revoke insert, update, delete, truncate on public.exam_sittings from anon, authenticated;
revoke insert, update, delete, truncate on public.exam_attempts from anon, authenticated;
revoke insert, update, delete, truncate on public.card_ideas from anon, authenticated;
revoke references, trigger on public.exam_sittings, public.exam_attempts, public.card_ideas from public, anon, authenticated;
grant select on public.exam_sittings, public.exam_attempts, public.card_ideas to authenticated;
grant select, insert, update, delete on public.exam_sittings, public.exam_attempts, public.card_ideas to service_role;

insert into public.lemma_undo_tables(table_name)
values ('exam_sittings'), ('exam_attempts'), ('card_ideas');

create function public.lemma_exam_keys(p jsonb, allowed text[]) returns void
language plpgsql immutable set search_path='' as $$
declare bad text;
begin
  if jsonb_typeof(p) is distinct from 'object' then
    raise exception 'Expected a patch object' using errcode='22023';
  end if;
  select key into bad from jsonb_object_keys(p) as fields(key) where not key=any(allowed) order by key limit 1;
  if bad is not null then
    raise exception 'Unknown patch field: % (allowed: %)', bad, array_to_string(allowed,', ') using errcode='22023';
  end if;
end
$$;

create function public.lemma_exam_text(p jsonb, k text, lo int, hi int) returns text
language plpgsql immutable set search_path='' as $$
declare v text:=p->>k;
begin
  if v is null then
    if lo>0 then raise exception '% is required', k using errcode='22023'; end if;
    return null;
  end if;
  if jsonb_typeof(p->k)<>'string' or length(v)>hi or length(btrim(v))<lo then
    raise exception '% must be text of %–% characters', k,lo,hi using errcode='22023';
  end if;
  return v;
end
$$;

create function public.lemma_exam_number(p jsonb,k text,lo numeric,hi numeric,
  is_int boolean default false, is_exclusive boolean default false) returns numeric
language plpgsql immutable set search_path='' as $$
declare v numeric;
begin
  if p->>k is null then return null; end if;
  if jsonb_typeof(p->k)<>'number' then
    raise exception '% must be a number', k using errcode='22023';
  end if;
  v:=(p->>k)::numeric;
  if v<lo or v>hi or (is_exclusive and v=lo) or (is_int and v<>trunc(v)) then
    if is_exclusive then
      raise exception '% must be above % and at most %',k,lo,hi using errcode='22023';
    end if;
    raise exception '% must be %between % and %', k, case when is_int then 'an integer ' else '' end, lo, hi using errcode='22023';
  end if;
  return v;
end
$$;

create function public.lemma_exam_boolean(p jsonb, k text) returns boolean
language plpgsql immutable set search_path='' as $$
begin
  if p->>k is null then return null; end if;
  if jsonb_typeof(p->k)<>'boolean' then raise exception '% must be a boolean',k using errcode='22023'; end if;
  return (p->>k)::boolean;
end
$$;

create function public.lemma_exam_enum(p jsonb, k text, allowed text[], fallback text default null) returns text
language plpgsql immutable set search_path='' as $$
declare v text:=p->>k;
begin
  if v is null then return fallback; end if;
  if not v=any(allowed) then
    raise exception '% must be one of: %', k,array_to_string(allowed,', ') using errcode='22023';
  end if;
  return v;
end
$$;

create function public.lemma_exam_uuid(p jsonb, k text) returns uuid
language plpgsql immutable set search_path='' as $$
begin
  return (p->>k)::uuid;
exception when invalid_text_representation then
  raise exception '% must be a UUID', k using errcode='22023';
end
$$;

create function public.lemma_exam_time(p jsonb, k text, zone text) returns timestamptz
language plpgsql stable set search_path='' as $$
declare v text:=p->>k;
begin
  if v is null then return null; end if;
  if v ~ '^\d{4}-\d{2}-\d{2}$' then
    return (v::date + time '09:00') at time zone zone;
  elsif v ~ '^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?([Zz]|[+-]\d{2}(:?\d{2})?)$' then
    return v::timestamptz;
  elsif v ~ '^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?$' then
    return v::timestamp at time zone zone;
  end if;
  raise exception '% must be an ISO date or date-time', k using errcode='22023';
exception when invalid_datetime_format or datetime_field_overflow then
  raise exception '% must be a valid ISO date or date-time', k using errcode='22023';
end
$$;

create function public.lemma_exam_normalize(v text) returns text
language sql immutable strict set search_path='' as $$
  select btrim(regexp_replace(translate(lower(v),'$'||chr(92),''),U&'[[:space:]\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+',' ','g'))
$$;

create function public.lemma_exam_blueprint(p jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare
  row_value jsonb;
  member jsonb;
  k text;
  f text;
  marks numeric;
  lo numeric;
  hi numeric;
  keys text[]:=array[]::text[];
begin
  if jsonb_typeof(p) is distinct from 'array' then
    raise exception 'blueprint must be an array of at most 60 rows' using errcode='22023';
  end if;
  if jsonb_array_length(p)>60 then
    raise exception 'blueprint must be an array of at most 60 rows' using errcode='22023';
  end if;
  for row_value in select value from jsonb_array_elements(p) loop
    k:=coalesce(row_value->>'key','(missing key)');
    begin
      perform public.lemma_exam_keys(row_value,array['key','title','marks','marks_low','marks_high','chance',
        'compulsory','provisional','section','format','difficulty','level','minutes','concepts','checkpoints','prereqs','source','note']);
      if jsonb_typeof(row_value->'key') is distinct from 'string' or k !~ '^[a-z0-9][a-z0-9_-]{0,39}$' then
        raise exception 'key must start with a lowercase letter or digit and use 1–40 characters from a-z, 0-9, _ or -' using errcode='22023';
      end if;
      if k=any(keys) then raise exception 'duplicate key %',k using errcode='22023'; end if;
      keys:=array_append(keys,k);
      perform public.lemma_exam_text(row_value,'title',1,200);
      marks:=public.lemma_exam_number(row_value,'marks',0,1000,false,true);
      if marks is null then raise exception 'marks is required' using errcode='22023'; end if;
      lo:=public.lemma_exam_number(row_value,'marks_low',0,1000);
      hi:=public.lemma_exam_number(row_value,'marks_high',0,1000);
      if lo>marks or hi<marks then
        raise exception 'marks range must satisfy 0 <= marks_low <= marks <= marks_high <= 1000' using errcode='22023';
      end if;
      perform public.lemma_exam_number(row_value,'chance',0,1,false,true);
      perform public.lemma_exam_number(row_value,'minutes',0,600,false,true);
      perform public.lemma_exam_boolean(row_value,'compulsory');
      perform public.lemma_exam_boolean(row_value,'provisional');
      perform public.lemma_exam_enum(row_value,'level',array['recall','use','understand','transfer']);
      foreach f in array array['section','format','difficulty','source','note'] loop
        perform public.lemma_exam_text(row_value,f,0,case when f in ('source','note') then 300 else 40 end);
      end loop;
      foreach f in array array['concepts','checkpoints','prereqs'] loop
        continue when not row_value?f;
        if jsonb_typeof(row_value->f) is distinct from 'array' or jsonb_array_length(row_value->f)>8 then
          raise exception '% must be an array of at most 8 strings',f using errcode='22023';
        end if;
        for member in select value from jsonb_array_elements(row_value->f) loop
          if jsonb_typeof(member)<>'string' or length(btrim(member#>>'{}')) not between 1 and 60 then
            raise exception '% entries must be strings of 1–60 characters',f using errcode='22023';
          end if;
        end loop;
      end loop;
    exception when invalid_parameter_value then
      raise exception 'blueprint row %: %', left(k,40),SQLERRM using errcode='22023';
    end;
  end loop;
  for row_value in select value from jsonb_array_elements(p) loop
    k:=row_value->>'key';
    for f in select value from jsonb_array_elements_text(coalesce(row_value->'prereqs','[]'::jsonb)) loop
      if f=k or not f=any(keys) then
        raise exception 'blueprint row %: unknown prerequisite % (must name a different blueprint row)',k,f using errcode='22023';
      end if;
    end loop;
  end loop;
  return p;
end
$$;

create function public.lemma_exam_sources(p jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare source_value jsonb; entry record;
begin
  if jsonb_typeof(p) is distinct from 'array' or jsonb_array_length(p)>20 then
    raise exception 'sources must be an array of at most 20 objects' using errcode='22023';
  end if;
  for source_value in select value from jsonb_array_elements(p) loop
    perform public.lemma_exam_keys(source_value,array['source','pages','note','year']);
    for entry in select * from jsonb_each(source_value) loop
      if jsonb_typeof(entry.value) not in ('string','number') or length(btrim(entry.value#>>'{}')) not between 1 and 200 then
        raise exception 'sources.% must be text or a number of 1–200 characters',entry.key using errcode='22023';
      end if;
    end loop;
  end loop;
  return p;
end
$$;

create function public.lemma_exam_dispositions(p jsonb, ledger jsonb, blueprint jsonb, at_time timestamptz) returns jsonb
language plpgsql stable set search_path='' as $$
declare
  row_value jsonb;
  k text;
  disposition text;
  reason text;
  reopen text;
  entry jsonb;
begin
  if jsonb_typeof(p) is distinct from 'array' or jsonb_array_length(p) not between 1 and 30 then
    raise exception 'rows must contain 1–30 dispositions' using errcode='22023';
  end if;
  for row_value in select value from jsonb_array_elements(p) loop
    perform public.lemma_exam_keys(row_value,array['key','disposition','reason','reopen']);
    k:=public.lemma_exam_text(row_value,'key',1,40);
    if not blueprint @> jsonb_build_array(jsonb_build_object('key',k)) then
      raise exception 'Unknown blueprint row key: %',k using errcode='22023';
    end if;
    disposition:=public.lemma_exam_enum(row_value,'disposition',array['probe','teach','practice','skip','defer','pin','none']);
    if disposition is null then raise exception 'disposition is required' using errcode='22023'; end if;
    reason:=nullif(btrim(public.lemma_exam_text(row_value,'reason',0,300)),'');
    reopen:=nullif(btrim(public.lemma_exam_text(row_value,'reopen',0,200)),'');
    if disposition in ('skip','defer') and reason is null then
      raise exception '% disposition for % requires a reason',disposition,k using errcode='22023';
    end if;
    if disposition='defer' and reopen is null then
      raise exception 'defer disposition for % requires a reopen condition',k using errcode='22023';
    end if;
    if disposition='none' then
      ledger:=ledger-k;
    else
      entry:=jsonb_strip_nulls(jsonb_build_object('disposition',disposition,'reason',reason,'reopen',reopen));
      if (ledger->k)-'at' is distinct from entry then
        ledger:=jsonb_set(ledger,array[k],entry||jsonb_build_object('at',at_time));
      end if;
    end if;
  end loop;
  return ledger;
end
$$;

create function public.lemma_exam_project(owner_id uuid,p jsonb) returns uuid
language plpgsql stable set search_path='' as $$
declare
  slug_value text:=public.lemma_exam_text(p,'project',0,40);
  project_value uuid:=public.lemma_exam_uuid(p,'project_id');
  result uuid;
begin
  if slug_value is null and project_value is null then
    raise exception 'project or project_id is required' using errcode='22023';
  end if;
  select id into result from public.projects
    where user_id=owner_id and status<>'archived' and not system
      and (project_value is null or id=project_value) and (slug_value is null or slug=slug_value);
  if not found then raise exception 'Project not found' using errcode='22023'; end if;
  return result;
end
$$;

create function public.lemma_exam_bookmark(owner_id uuid,project_value uuid,at_time timestamptz) returns jsonb
language plpgsql stable set search_path='' as $$
declare
  cp public.checkpoints%rowtype;
  ss public.sessions%rowtype;
begin
  select * into cp from public.checkpoints
    where user_id=owner_id and project_id=project_value and status='in_progress'
    order by position,id limit 1;
  if cp.id is null then
    select * into ss from public.sessions where user_id=owner_id and project_id=project_value
      order by last_activity_at desc,number desc limit 1;
    select * into cp from public.checkpoints
      where user_id=owner_id and project_id=project_value and id=ss.checkpoint_id;
  end if;
  if cp.id is not null then
    select * into ss from public.sessions
      where user_id=owner_id and project_id=project_value and checkpoint_id=cp.id
      order by last_activity_at desc,number desc limit 1;
  end if;
  if cp.id is null then return jsonb_build_object('capturedAt',at_time); end if;
  return jsonb_strip_nulls(jsonb_build_object('checkpoint',cp.code,'title',cp.title,
    'step',coalesce(ss.resume_step,cp.current_step),'steps',jsonb_array_length(cp.steps),
    'status',cp.status,'session',ss.number,'question',ss.resume_question,'capturedAt',at_time));
end
$$;

create function public.lemma_exam_begin(p jsonb,owner_id uuid, resource_name text, tool_name text, operations text[]) returns jsonb
language plpgsql set search_path='' as $$
declare
  role_name text:=coalesce(current_setting('role',true),'');
  opid uuid;
  prior jsonb;
begin
  if owner_id is null or role_name not in ('authenticated','service_role') then
    raise exception 'Authenticated owner required' using errcode='42501';
  end if;
  perform public.lemma_exam_keys(p,array['schemaVersion','resource','operation','operationId','target','expectedVersion','patch']);
  if p->'schemaVersion' is distinct from '1'::jsonb or p->>'resource' is distinct from resource_name
      or not coalesce((p->>'operation')=any(operations),false) then
    raise exception 'Invalid % command envelope (operations: %)',resource_name,array_to_string(operations,', ') using errcode='22023';
  end if;
  opid:=public.lemma_exam_uuid(p,'operationId');
  if opid is null then raise exception 'operationId (UUID) is required' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text||':'||opid::text,0));
  select result into prior from public.command_receipts where user_id=owner_id and operation_id=opid;
  if found then
    if prior->'_request'=p then return prior-'_request'; end if;
    return jsonb_build_object('operationId',opid,'status','conflict','reason','operationId reused with a different payload',
      'conflict',jsonb_build_object('reason','operationId reused with a different payload'),'actionNo',null,'changed','[]'::jsonb);
  end if;
  if p?'target' then perform public.lemma_exam_keys(p->'target',array['id']); end if;
  -- The three resources share one owner lock: saving, activating and recording
  -- inspect each other's state before writing. Unique indexes are the backstop.
  perform pg_advisory_xact_lock(hashtextextended('exam-owner:'||owner_id::text,0));
  if role_name<>'service_role' then
    perform set_config('lemma.source','app',true);
    perform set_config('lemma.tool',tool_name,true);
    perform set_config('lemma.summary',resource_name||' '||(p->>'operation'),true);
  end if;
  return null;
end
$$;

create function public.lemma_exam_finish(p jsonb,owner_id uuid,result jsonb,
  changed_id uuid default null,changed_version int default null) returns jsonb
language plpgsql set search_path='' as $$
declare
  action_no bigint;
  opid uuid:=(p->>'operationId')::uuid;
begin
  if changed_id is not null then
    select no into action_no from public.actions where user_id=owner_id and txid=txid_current();
    if not found then raise exception 'Exam update is missing its journal action'; end if;
  end if;
  result:=jsonb_build_object('operationId',opid,'status','ok','actionNo',action_no,
    'changed',case when changed_id is null then '[]'::jsonb
      else jsonb_build_array(jsonb_build_object('id',changed_id,'version',changed_version)) end)||result;
  insert into public.command_receipts(user_id,operation_id,resource,result)
    values(owner_id,opid,p->>'resource',result||jsonb_build_object('_request',p));
  return result;
end
$$;

create function public.lemma_exam_conflict(p jsonb,owner_id uuid,row_value jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare
  expected int:=public.lemma_exam_number(p,'expectedVersion',1,2147483647,true);
  actual int:=(row_value->>'version')::int;
begin
  if expected is null then raise exception 'expectedVersion is required' using errcode='22023'; end if;
  if expected=actual then return null; end if;
  return public.lemma_exam_finish(p,owner_id,jsonb_build_object('status','conflict',
    'current',row_value-array['user_id','conversion_key'],
    'conflict',jsonb_build_object('expectedVersion',expected,'currentVersion',actual)));
end
$$;

create function public.lemma_exam_version() returns trigger
language plpgsql set search_path='' as $$
begin
  new.version:=old.version+1;
  new.updated_at:=clock_timestamp();
  return new;
end
$$;
create trigger z_exam_version before update on public.exam_sittings for each row execute function public.lemma_exam_version();
create trigger z_exam_version before update on public.exam_attempts for each row execute function public.lemma_exam_version();
create trigger z_exam_version before update on public.card_ideas for each row execute function public.lemma_exam_version();

create function public.exam_sitting_command(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  owner_id uuid:=(select auth.uid());
  op text:=p->>'operation';
  patch jsonb:=coalesce(p->'patch','{}'::jsonb);
  target_id uuid;
  prior jsonb;
  old_row public.exam_sittings%rowtype;
  next_row public.exam_sittings%rowtype;
  active_row public.exam_sittings%rowtype;
  fields text[]:=array['title','starts_at','time_zone','duration_minutes','study_minutes','last_study_at',
    'objective','pass_marks','total_marks','format','sources','blueprint','phase','card_mode','plan_note','next_question'];
  at_time timestamptz:=clock_timestamp();
  activate_now boolean:=false;
  receipt jsonb;
begin
  prior:=public.lemma_exam_begin(p,owner_id,'exam_sittings','exam_sitting_command',
    array['create','update','set_disposition','activate','pause','finish','reopen','cancel']);
  if prior is not null then return prior; end if;
  target_id:=public.lemma_exam_uuid(p->'target','id');
  -- Undo takes a table lock before locking rows. Use the same order.
  lock table public.exam_sittings in row exclusive mode;

  if op='create' then
    perform public.lemma_exam_keys(patch,fields||array['project','project_id','activate']);
    next_row.id:=coalesce(target_id,gen_random_uuid());
    next_row.user_id:=owner_id;
    next_row.project_id:=public.lemma_exam_project(owner_id,patch);
    next_row.title:=public.lemma_exam_text(patch,'title',1,120);
    next_row.time_zone:=coalesce((select time_zone from public.settings where user_id=owner_id),'UTC');
    next_row.objective:='expected_marks';
    next_row.sources:='[]';
    next_row.blueprint:='[]';
    next_row.blueprint_version:=1;
    next_row.ledger:='{}';
    next_row.status:='planned';
    next_row.phase:='map';
    next_row.card_mode:='later';
    next_row.version:=1;
    next_row.created_at:=at_time;
    next_row.updated_at:=at_time;
    activate_now:=coalesce(public.lemma_exam_boolean(patch,'activate'),false);
  else
    select * into old_row from public.exam_sittings where id=target_id and user_id=owner_id for update;
    if not found then raise exception 'Exam sitting not found' using errcode='22023'; end if;
    prior:=public.lemma_exam_conflict(p,owner_id,to_jsonb(old_row));
    if prior is not null then return prior; end if;
    next_row:=old_row;
    if op='update' then
      perform public.lemma_exam_keys(patch,case when old_row.status in ('finished','cancelled')
        then array['title','plan_note','next_question','result_marks','result_note'] else fields||array['result_marks','result_note'] end);
    elsif op='reopen' then
      perform public.lemma_exam_keys(patch,array['starts_at','time_zone']);
      if old_row.status not in ('finished','cancelled') then
        raise exception 'Only a finished or cancelled sitting can be reopened' using errcode='22023';
      end if;
      next_row.status:='paused';
      next_row.paused_at:=at_time;
      next_row.finished_at:=null;
      next_row.happened:=null;
      next_row.result_marks:=null;
      next_row.result_note:=null;
    elsif old_row.status in ('finished','cancelled') then
      raise exception 'Exam sitting is %; reopen it first',old_row.status using errcode='22023';
    elsif op='set_disposition' then
      perform public.lemma_exam_keys(patch,array['rows']);
      next_row.ledger:=public.lemma_exam_dispositions(patch->'rows',old_row.ledger,old_row.blueprint,at_time);
    elsif op='activate' then
      perform public.lemma_exam_keys(patch,array['study_minutes','next_question']);
      if old_row.status not in ('planned','paused') then
        raise exception 'Only a planned or paused sitting can be activated' using errcode='22023';
      end if;
      activate_now:=true;
    elsif op='pause' then
      perform public.lemma_exam_keys(patch,array['next_question','plan_note']);
      if old_row.status<>'active' then raise exception 'Only an active sitting can be paused' using errcode='22023'; end if;
      next_row.status:='paused';
      next_row.paused_at:=at_time;
    elsif op='finish' then
      perform public.lemma_exam_keys(patch,array['happened','result_marks','result_note']);
      next_row.happened:=public.lemma_exam_boolean(patch,'happened');
      if next_row.happened is null then
        raise exception 'happened (did the exam take place? ask the learner) is required' using errcode='22023';
      end if;
      next_row.status:='finished';
      next_row.finished_at:=at_time;
    else
      perform public.lemma_exam_keys(patch,array[]::text[]);
      next_row.status:='cancelled';
    end if;
  end if;

  if patch?'title' then next_row.title:=public.lemma_exam_text(patch,'title',1,120); end if;
  if patch?'time_zone' then next_row.time_zone:=public.lemma_exam_text(patch,'time_zone',0,200); end if;
  if (op='create' or patch?'time_zone') and
    not exists (select 1 from pg_timezone_names where name=next_row.time_zone) then
    raise exception 'time_zone must be an IANA zone such as Asia/Kolkata' using errcode='22023';
  end if;
  if patch?'starts_at' then next_row.starts_at:=public.lemma_exam_time(patch,'starts_at',next_row.time_zone); end if;
  if patch?'last_study_at' then next_row.last_study_at:=public.lemma_exam_time(patch,'last_study_at',next_row.time_zone); end if;
  if patch?'duration_minutes' then next_row.duration_minutes:=public.lemma_exam_number(patch,'duration_minutes',5,600,true); end if;
  if patch?'study_minutes' then
    next_row.study_minutes:=public.lemma_exam_number(patch,'study_minutes',0,20000,true);
    if next_row.study_minutes is distinct from old_row.study_minutes then
      next_row.study_minutes_set_at:=case when next_row.study_minutes is not null then at_time end;
    end if;
  end if;
  if patch?'objective' then next_row.objective:=public.lemma_exam_enum(patch,'objective',array['expected_marks','pass_threshold'],'expected_marks'); end if;
  if patch?'pass_marks' then next_row.pass_marks:=public.lemma_exam_number(patch,'pass_marks',0,10000); end if;
  if patch?'total_marks' then next_row.total_marks:=public.lemma_exam_number(patch,'total_marks',0,10000,false,true); end if;
  if patch?'format' then next_row.format:=public.lemma_exam_text(patch,'format',0,1000); end if;
  if patch?'sources' then next_row.sources:=public.lemma_exam_sources(patch->'sources'); end if;
  if patch?'blueprint' then
    next_row.blueprint:=public.lemma_exam_blueprint(patch->'blueprint');
    if op='update' and next_row.blueprint is distinct from old_row.blueprint then
      next_row.blueprint_version:=old_row.blueprint_version+1;
      select coalesce(jsonb_object_agg(l.key,l.value),'{}'::jsonb) into next_row.ledger
        from jsonb_each(old_row.ledger) l
        where next_row.blueprint @> jsonb_build_array(jsonb_build_object('key',l.key));
    end if;
  end if;
  if patch?'phase' then next_row.phase:=public.lemma_exam_enum(patch,'phase',array['map','screen','teach','verify'],'map'); end if;
  if patch?'card_mode' then next_row.card_mode:=public.lemma_exam_enum(patch,'card_mode',array['later','now','quiet'],'later'); end if;
  if patch?'plan_note' then next_row.plan_note:=public.lemma_exam_text(patch,'plan_note',0,600); end if;
  if patch?'next_question' then next_row.next_question:=public.lemma_exam_text(patch,'next_question',0,600); end if;
  if patch?'result_marks' then next_row.result_marks:=public.lemma_exam_number(patch,'result_marks',0,10000); end if;
  if patch?'result_note' then next_row.result_note:=public.lemma_exam_text(patch,'result_note',0,300); end if;
  if next_row.objective='pass_threshold' and next_row.pass_marks is null then
    raise exception 'pass_marks is required when objective is pass_threshold' using errcode='22023';
  end if;

  if activate_now then
    select * into active_row from public.exam_sittings
      where user_id=owner_id and project_id=next_row.project_id and status='active';
    if found then
      raise exception 'Exam sitting "%" (%) is already active; pause it first',active_row.title,active_row.id using errcode='22023';
    end if;
    next_row.status:='active';
    next_row.activated_at:=at_time;
    next_row.paused_at:=null;
    next_row.activation_study_minutes:=next_row.study_minutes;
    next_row.bookmark:=public.lemma_exam_bookmark(owner_id,next_row.project_id,at_time);
  end if;

  if op='create' then
    insert into public.exam_sittings select (next_row).* on conflict (id) do nothing returning * into next_row;
    if not found then raise exception 'Sitting id is unavailable' using errcode='22023'; end if;
  elsif next_row is distinct from old_row then
    update public.exam_sittings set
      (title,starts_at,time_zone,duration_minutes,study_minutes,study_minutes_set_at,activation_study_minutes,
       last_study_at,objective,pass_marks,total_marks,format,sources,blueprint,blueprint_version,ledger,status,phase,
       card_mode,bookmark,plan_note,next_question,activated_at,paused_at,finished_at,happened,result_marks,result_note)=
      (next_row.title,next_row.starts_at,next_row.time_zone,next_row.duration_minutes,next_row.study_minutes,
       next_row.study_minutes_set_at,next_row.activation_study_minutes,next_row.last_study_at,next_row.objective,
       next_row.pass_marks,next_row.total_marks,next_row.format,next_row.sources,next_row.blueprint,
       next_row.blueprint_version,next_row.ledger,next_row.status,next_row.phase,next_row.card_mode,next_row.bookmark,
       next_row.plan_note,next_row.next_question,next_row.activated_at,next_row.paused_at,next_row.finished_at,
       next_row.happened,next_row.result_marks,next_row.result_note)
      where id=target_id and user_id=owner_id returning * into next_row;
  end if;
  receipt:=jsonb_build_object('id',next_row.id,'version',next_row.version,'sittingStatus',next_row.status,
    'blueprintVersion',next_row.blueprint_version,'bookmark',next_row.bookmark);
  if old_row.version=next_row.version then
    return public.lemma_exam_finish(p,owner_id,receipt||jsonb_build_object('unchanged',true));
  end if;
  return public.lemma_exam_finish(p,owner_id,receipt,next_row.id,next_row.version);
end
$$;

create function public.lemma_exam_session(owner_id uuid, project_value uuid, p jsonb) returns uuid
language plpgsql stable set search_path='' as $$
declare
  session_value uuid:=public.lemma_exam_uuid(p,'session_id');
  session_number text:=p->>'session';
  result uuid;
begin
  if session_value is null and session_number is null then return null; end if;
  if session_number is not null then
    if session_number !~ '^S?[1-9][0-9]{0,9}$' or ltrim(session_number,'S')::numeric>2147483647 then
      raise exception 'session must be a session number such as S14 or 14' using errcode='22023';
    end if;
    session_number:=ltrim(session_number,'S');
  end if;
  select id into result from public.sessions where user_id=owner_id and project_id=project_value
    and (session_number is null or number=session_number::int)
    and (session_value is null or id=session_value);
  if not found then raise exception 'Session not found in this project' using errcode='22023'; end if;
  return result;
end
$$;

create function public.exam_attempt_command(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  owner_id uuid:=(select auth.uid());
  op text:=p->>'operation';
  patch jsonb:=coalesce(p->'patch','{}'::jsonb);
  target_id uuid;
  prior jsonb;
  sitting public.exam_sittings%rowtype;
  old_row public.exam_attempts%rowtype;
  next_row public.exam_attempts%rowtype;
  duplicate_row public.exam_attempts%rowtype;
  blueprint_row jsonb;
  score_keys text[]:=array['outcome','marks_awarded','marks_possible','independence','hint_level','novelty',
    'timed','seconds','scoring','confidence','learner_confirmed','concept','level','note'];
  at_time timestamptz:=clock_timestamp();
  result jsonb;
begin
  prior:=public.lemma_exam_begin(p,owner_id,'exam_attempts','exam_attempt_command',array['record','correct','void','restore']);
  if prior is not null then return prior; end if;
  target_id:=public.lemma_exam_uuid(p->'target','id');
  lock table public.exam_attempts in row exclusive mode;

  if op='record' then
    perform public.lemma_exam_keys(patch,score_keys||array['sitting_id','row_key','kind','prompt','delivery','delivery_ref','session','session_id','occurred_at']);
    next_row.sitting_id:=public.lemma_exam_uuid(patch,'sitting_id');
    if next_row.sitting_id is null then raise exception 'sitting_id is required' using errcode='22023'; end if;
    select * into sitting from public.exam_sittings where user_id=owner_id and id=next_row.sitting_id for share;
    if not found then raise exception 'Exam sitting not found' using errcode='22023'; end if;
    if sitting.status in ('finished','cancelled') then
      raise exception 'Exam sitting is %; reopen it to record attempts',sitting.status using errcode='22023';
    end if;
    next_row.row_key:=public.lemma_exam_text(patch,'row_key',1,40);
    select row_value into blueprint_row from jsonb_array_elements(sitting.blueprint) as rows(row_value)
      where row_value->>'key'=next_row.row_key;
    if not found then raise exception 'Unknown blueprint row key: %',next_row.row_key using errcode='22023'; end if;

    next_row.id:=coalesce(target_id,gen_random_uuid());
    next_row.user_id:=owner_id;
    next_row.project_id:=sitting.project_id;
    next_row.blueprint_version:=sitting.blueprint_version;
    next_row.kind:=public.lemma_exam_enum(patch,'kind',array['probe','practice','verify','review','recap'],'probe');
    next_row.prompt:=public.lemma_exam_text(patch,'prompt',0,2000);
    next_row.delivery:=public.lemma_exam_enum(patch,'delivery',array['chat','questionnaire','practice_question','paper','other'],'chat');
    next_row.delivery_ref:=nullif(btrim(public.lemma_exam_text(patch,'delivery_ref',0,200)),'');
    next_row.independence:='independent';
    next_row.hint_level:=0;
    next_row.novelty:='novel';
    next_row.timed:=false;
    next_row.scoring:='tutor';
    next_row.confidence:='high';
    next_row.learner_confirmed:=false;
    next_row.concept:=blueprint_row->'concepts'->>0;
    next_row.level:=blueprint_row->>'level';
    next_row.session_id:=public.lemma_exam_session(owner_id,sitting.project_id,patch);
    next_row.occurred_at:=coalesce(public.lemma_exam_time(patch,'occurred_at',sitting.time_zone),at_time);
    if next_row.occurred_at>at_time+interval '5 minutes' then
      raise exception 'occurred_at may be at most 5 minutes in the future' using errcode='22023';
    end if;
    next_row.version:=1;
    next_row.created_at:=at_time;
    next_row.updated_at:=at_time;
  else
    select * into old_row from public.exam_attempts where user_id=owner_id and id=target_id for update;
    if not found then raise exception 'Exam attempt not found' using errcode='22023'; end if;
    prior:=public.lemma_exam_conflict(p,owner_id,to_jsonb(old_row));
    if prior is not null then return prior; end if;
    next_row:=old_row;
    if op='correct' then
      perform public.lemma_exam_keys(patch,score_keys||array['reason']);
      next_row.corrected_reason:=public.lemma_exam_text(patch,'reason',1,200);
      next_row.corrected_at:=at_time;
    elsif op='void' then
      perform public.lemma_exam_keys(patch,array['reason']);
      if old_row.voided_at is not null then raise exception 'Exam attempt is already voided' using errcode='22023'; end if;
      next_row.void_reason:=public.lemma_exam_text(patch,'reason',1,200);
      next_row.voided_at:=at_time;
    else
      perform public.lemma_exam_keys(patch,array[]::text[]);
      if old_row.voided_at is null then raise exception 'Only a voided exam attempt can be restored' using errcode='22023'; end if;
      next_row.voided_at:=null;
      next_row.void_reason:=null;
    end if;
  end if;

  if patch?'outcome' or op='record' then
    next_row.outcome:=public.lemma_exam_enum(patch,'outcome',array['correct','partial','incorrect','unscorable','skipped','timeout','exposure']);
    if next_row.outcome is null then raise exception 'outcome is required' using errcode='22023'; end if;
  end if;
  if patch?'independence' then
    next_row.independence:=public.lemma_exam_enum(patch,'independence',array['independent','hinted','after_recap','reading'],
      case when next_row.outcome='exposure' then 'reading' else 'independent' end);
  elsif next_row.outcome='exposure' then
    next_row.independence:='reading';
  elsif next_row.independence='reading' then
    next_row.independence:='independent';
  end if;
  if (next_row.outcome='exposure')<>(next_row.independence='reading') then
    raise exception 'independence must be reading for exposure and only for exposure' using errcode='22023';
  end if;
  if patch?'marks_awarded' then next_row.marks_awarded:=public.lemma_exam_number(patch,'marks_awarded',0,1000); end if;
  if patch?'marks_possible' then next_row.marks_possible:=public.lemma_exam_number(patch,'marks_possible',0,1000,false,true); end if;
  if next_row.outcome='exposure' and next_row.marks_awarded is not null then
    raise exception 'exposure cannot have marks_awarded' using errcode='22023';
  end if;
  if next_row.marks_awarded>next_row.marks_possible then
    raise exception 'marks_awarded must not exceed marks_possible' using errcode='22023';
  end if;
  if patch?'hint_level' then next_row.hint_level:=coalesce(public.lemma_exam_number(patch,'hint_level',0,4,true),0); end if;
  if patch?'novelty' then next_row.novelty:=public.lemma_exam_enum(patch,'novelty',array['novel','familiar','seen_solution'],'novel'); end if;
  if patch?'timed' then next_row.timed:=coalesce(public.lemma_exam_boolean(patch,'timed'),false); end if;
  if patch?'seconds' then next_row.seconds:=public.lemma_exam_number(patch,'seconds',0,36000,true); end if;
  if patch?'scoring' then next_row.scoring:=public.lemma_exam_enum(patch,'scoring',array['tutor','learner','rubric'],'tutor'); end if;
  if patch?'confidence' then next_row.confidence:=public.lemma_exam_enum(patch,'confidence',array['high','medium','low'],'high'); end if;
  if patch?'learner_confirmed' then next_row.learner_confirmed:=coalesce(public.lemma_exam_boolean(patch,'learner_confirmed'),false); end if;
  if patch?'concept' then
    next_row.concept:=case when patch->>'concept' is not null then public.lemma_exam_text(patch,'concept',1,60) end;
  end if;
  if patch?'level' then next_row.level:=public.lemma_exam_enum(patch,'level',array['recall','use','understand','transfer']); end if;
  if patch?'note' then next_row.note:=public.lemma_exam_text(patch,'note',0,300); end if;

  if op in ('record','restore') and next_row.delivery_ref is not null then
    select * into duplicate_row from public.exam_attempts
      where user_id=owner_id and sitting_id=next_row.sitting_id and delivery_ref=next_row.delivery_ref and voided_at is null;
    if found then
      if op='restore' then raise exception 'Another live attempt already holds this delivery_ref' using errcode='22023'; end if;
      return public.lemma_exam_finish(p,owner_id,jsonb_build_object('status','duplicate','id',duplicate_row.id,
        'version',duplicate_row.version,'note','This response is already recorded; correct it instead of recording it twice.'));
    end if;
  end if;

  if op='record' then
    insert into public.exam_attempts select (next_row).* on conflict (id) do nothing returning * into next_row;
    if not found then raise exception 'Attempt id is unavailable' using errcode='22023'; end if;
  else
    update public.exam_attempts set
      (outcome,marks_awarded,marks_possible,independence,hint_level,novelty,timed,seconds,scoring,confidence,
       learner_confirmed,concept,level,note,corrected_at,corrected_reason,voided_at,void_reason)=
      (next_row.outcome,next_row.marks_awarded,next_row.marks_possible,next_row.independence,next_row.hint_level,
       next_row.novelty,next_row.timed,next_row.seconds,next_row.scoring,next_row.confidence,next_row.learner_confirmed,
       next_row.concept,next_row.level,next_row.note,next_row.corrected_at,next_row.corrected_reason,
       next_row.voided_at,next_row.void_reason)
      where id=target_id and user_id=owner_id returning * into next_row;
  end if;
  result:=jsonb_build_object('id',next_row.id,'version',next_row.version,'rowKey',next_row.row_key,'blueprintVersion',next_row.blueprint_version);
  return public.lemma_exam_finish(p,owner_id,result,next_row.id,next_row.version);
end
$$;

create function public.lemma_exam_idea_evidence(p jsonb,old_evidence jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare item jsonb; result jsonb:=old_evidence;
begin
  if p is null then return result; end if;
  if jsonb_typeof(p) is distinct from 'array' or jsonb_array_length(p)>10 then
    raise exception 'evidence must be an array of at most 10 objects per save' using errcode='22023';
  end if;
  for item in select value from jsonb_array_elements(p) loop
    if jsonb_typeof(item)<>'object' or length(item::text)>400 then
      raise exception 'evidence entries must be JSON objects of at most 400 characters' using errcode='22023';
    end if;
    if jsonb_array_length(result)<20 and not exists (select 1 from jsonb_array_elements(result) where value=item) then
      result:=result||jsonb_build_array(item);
    end if;
  end loop;
  return result;
end
$$;

create function public.card_idea_command(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  owner_id uuid:=(select auth.uid());
  op text:=p->>'operation';
  patch jsonb:=coalesce(p->'patch','{}'::jsonb);
  target_id uuid;
  prior jsonb;
  old_row public.card_ideas%rowtype;
  next_row public.card_ideas%rowtype;
  proposal_row public.proposals%rowtype;
  note_row public.notes%rowtype;
  number_value bigint;
  proposal_no bigint;
  front_key text;
  card_code text;
  checkpoint_code text;
  concept_value text;
  note_type text;
  note_kind text;
  source_value text;
  at_time timestamptz:=clock_timestamp();
  fields text[]:=array['target','concept','level','reason','front','back'];
  merged boolean:=false;
  reused boolean:=false;
  result jsonb;
begin
  prior:=public.lemma_exam_begin(p,owner_id,'card_ideas','card_idea_command',array['save','update','draft','link','dismiss','restore']);
  if prior is not null then return prior; end if;
  target_id:=public.lemma_exam_uuid(p->'target','id');

  -- Acquire the undo registry's card_ideas lock before touching any proposal.
  lock table public.card_ideas in row exclusive mode;
  if op='save' then
    perform public.lemma_exam_keys(patch,fields||array['project','project_id','sitting_id','evidence']);
    next_row.project_id:=public.lemma_exam_project(owner_id,patch);
    next_row.user_id:=owner_id;
    next_row.id:=coalesce(target_id,gen_random_uuid());
    next_row.target:=public.lemma_exam_text(patch,'target',3,300);
    next_row.target_key:=public.lemma_exam_normalize(next_row.target);
    if next_row.target_key='' then raise exception 'target must contain a retrieval target' using errcode='22023'; end if;
    next_row.sitting_id:=public.lemma_exam_uuid(patch,'sitting_id');
    if next_row.sitting_id is not null and not exists(select 1 from public.exam_sittings
      where id=next_row.sitting_id and user_id=owner_id and project_id=next_row.project_id) then
      raise exception 'Exam sitting not found in this project' using errcode='22023';
    end if;

    select * into old_row from public.card_ideas where user_id=owner_id and project_id=next_row.project_id
      and target_key=next_row.target_key and status in ('saved','drafted') for update;
    merged:=found;
    if merged then
      next_row.sitting_id:=coalesce(old_row.sitting_id,next_row.sitting_id);
      next_row.id:=old_row.id;
      next_row.target:=old_row.target;
      next_row.status:=old_row.status;
      next_row.proposal_id:=old_row.proposal_id;
      next_row.note_id:=old_row.note_id;
      next_row.resolved_at:=old_row.resolved_at;
      next_row.sightings:=old_row.sightings+1;
    else
      next_row.status:='saved';
      next_row.sightings:=1;
      next_row.conversion_key:=gen_random_uuid();
      next_row.version:=1;
      next_row.created_at:=at_time;
      next_row.updated_at:=at_time;
    end if;
    next_row.evidence:=public.lemma_exam_idea_evidence(patch->'evidence',coalesce(old_row.evidence,'[]'::jsonb));
  else
    select * into old_row from public.card_ideas where user_id=owner_id and id=target_id for update;
    if not found then raise exception 'Card idea not found' using errcode='22023'; end if;
    prior:=public.lemma_exam_conflict(p,owner_id,to_jsonb(old_row));
    if prior is not null then return prior; end if;
    next_row:=old_row;
    if op='update' then
      perform public.lemma_exam_keys(patch,fields);
      if old_row.status<>'saved' then raise exception 'Only a saved card idea can be updated' using errcode='22023'; end if;
      if patch?'target' then
        next_row.target:=public.lemma_exam_text(patch,'target',3,300);
        next_row.target_key:=public.lemma_exam_normalize(next_row.target);
        if next_row.target_key='' then raise exception 'target must contain a retrieval target' using errcode='22023'; end if;
      end if;
    elsif op='draft' then
      perform public.lemma_exam_keys(patch,array['front','back','type','kind','checkpoint','concept']);
      if old_row.status='drafted' and old_row.proposal_id is not null then
        if exists (select 1 from public.proposals where user_id=owner_id and id=old_row.proposal_id
          and withdrawn_at is null and status in ('pending','approved')) then
          raise exception 'Card idea already has a pending or approved proposal' using errcode='22023';
        end if;
      elsif old_row.status not in ('saved','drafted') then
        raise exception 'Only a saved idea or one with a rejected or withdrawn proposal can be drafted' using errcode='22023';
      end if;
    elsif op='link' then
      perform public.lemma_exam_keys(patch,array['card','proposal']);
      if old_row.status not in ('saved','drafted') then raise exception 'Only a saved or drafted idea can be linked' using errcode='22023'; end if;
      if (patch->>'card' is null)=(patch->>'proposal' is null) then
        raise exception 'Specify either card (such as N12) or proposal (number)' using errcode='22023';
      end if;
      if patch->>'card' is not null then
        card_code:=public.lemma_exam_text(patch,'card',0,20);
        if card_code !~ '^N[1-9][0-9]{0,18}$' or substr(card_code,2)::numeric>9223372036854775807 then
          raise exception 'card must be a card number such as N12' using errcode='22023';
        end if;
        select * into note_row from public.notes where user_id=owner_id and project_id=old_row.project_id
          and no=substr(card_code,2)::bigint and status='active';
        if not found then raise exception 'Active card not found in this project' using errcode='22023'; end if;
        next_row.status:='linked';
        next_row.note_id:=note_row.id;
        next_row.proposal_id:=null;
        next_row.resolved_at:=at_time;
      else
        number_value:=public.lemma_exam_number(patch,'proposal',1,9223372036854775807,true);
        select * into proposal_row from public.proposals where user_id=owner_id and project_id=old_row.project_id
          and no=number_value and kind='card';
        if not found then raise exception 'Card proposal not found in this project' using errcode='22023'; end if;
        next_row.status:='drafted';
        next_row.proposal_id:=proposal_row.id;
        next_row.note_id:=null;
        next_row.resolved_at:=case when old_row.proposal_id=proposal_row.id then old_row.resolved_at else at_time end;
        proposal_no:=proposal_row.no;
      end if;
    elsif op='dismiss' then
      perform public.lemma_exam_keys(patch,array[]::text[]);
      if old_row.status='dismissed' then raise exception 'Card idea is already dismissed' using errcode='22023'; end if;
      next_row.status:='dismissed';
      next_row.resolved_at:=at_time;
    else
      perform public.lemma_exam_keys(patch,array[]::text[]);
      if old_row.status<>'dismissed' then raise exception 'Only a dismissed card idea can be restored' using errcode='22023'; end if;
      next_row.status:='saved';
      next_row.proposal_id:=null;
      next_row.note_id:=null;
      next_row.resolved_at:=null;
    end if;
  end if;

  if patch?'concept' then
    next_row.concept:=case when patch->>'concept' is not null then public.lemma_exam_text(patch,'concept',1,60) end;
  end if;
  if patch?'level' then next_row.level:=public.lemma_exam_enum(patch,'level',array['recall','use','understand','transfer']); end if;
  if patch?'reason' then next_row.reason:=public.lemma_exam_text(patch,'reason',0,300); end if;
  if patch?'front' then next_row.front:=public.lemma_exam_text(patch,'front',0,1500); end if;
  if patch?'back' then next_row.back:=public.lemma_exam_text(patch,'back',0,3000); end if;
  if merged then
    next_row.concept:=coalesce(old_row.concept,next_row.concept);
    next_row.level:=coalesce(old_row.level,next_row.level);
    next_row.reason:=case when nullif(btrim(old_row.reason),'') is null then coalesce(next_row.reason,old_row.reason) else old_row.reason end;
    next_row.front:=case when nullif(btrim(old_row.front),'') is null then coalesce(next_row.front,old_row.front) else old_row.front end;
    next_row.back:=case when nullif(btrim(old_row.back),'') is null then coalesce(next_row.back,old_row.back) else old_row.back end;
  end if;
  if op in ('restore','update') and exists (
    select 1 from public.card_ideas where user_id=owner_id and project_id=next_row.project_id and id<>next_row.id
      and target_key=next_row.target_key and status in ('saved','drafted')
  ) then
    raise exception 'Another open card idea already has this target' using errcode='22023';
  end if;

  if op in ('save','draft') then
    front_key:=public.lemma_exam_normalize(case when op='draft' then next_row.front else coalesce(nullif(btrim(next_row.front),''),next_row.target) end);
  end if;
  if op='draft' then
    if coalesce(front_key,'')='' then raise exception 'front is required to draft a card' using errcode='22023'; end if;
    -- Read pending proposals before cards. If approval wins the proposal
    -- lock, the next statement sees the newly active card and rejects draft.
    select * into proposal_row from public.proposals where user_id=owner_id and project_id=next_row.project_id
      and kind='card' and status='pending' and withdrawn_at is null
      and public.lemma_exam_normalize(payload->>'front')=front_key order by no limit 1 for share;
    reused:=found;
  end if;
  if op in ('save','draft') then
    select * into note_row from public.notes where user_id=owner_id and project_id=next_row.project_id
      and status='active' and public.lemma_exam_normalize(front)=front_key order by no limit 1;
  end if;
  if op='draft' then
    if note_row.id is not null then
      raise exception 'Card N% already has this front; link the idea to it instead',note_row.no using errcode='22023';
    end if;
    note_type:=public.lemma_exam_enum(patch,'type',array['basic','cloze','reverse'],'basic');
    note_kind:=public.lemma_exam_enum(patch,'kind',array['definition','theorem','why','example','counterexample','proof','other'],'other');
    checkpoint_code:=public.lemma_exam_text(patch,'checkpoint',0,10);
    if checkpoint_code is not null and not exists (select 1 from public.checkpoints
      where user_id=owner_id and project_id=next_row.project_id and code=checkpoint_code) then
      raise exception 'Checkpoint not found in this project' using errcode='22023';
    end if;
    concept_value:=next_row.concept;
    if not reused then
      source_value:=current_setting('lemma.source',true);
      insert into public.proposals(user_id,project_id,kind,payload,reason,origin)
        values(owner_id,next_row.project_id,'card',
          jsonb_strip_nulls(jsonb_build_object('front',next_row.front,'back',coalesce(next_row.back,''),'type',note_type,
            'kind',note_kind,'checkpoint',checkpoint_code,'concept',concept_value,'direct',false,'cardIdea',next_row.id)),
          next_row.reason,case when source_value in ('claude','chatgpt') then source_value else 'other' end)
        returning * into proposal_row;
    end if;
    next_row.status:='drafted';
    next_row.proposal_id:=proposal_row.id;
    next_row.note_id:=null;
    next_row.resolved_at:=at_time;
    proposal_no:=proposal_row.no;
  end if;

  if op='save' and not merged then
    insert into public.card_ideas select (next_row).* on conflict (id) do nothing returning * into next_row;
    if not found then raise exception 'Card idea id is unavailable' using errcode='22023'; end if;
  elsif merged or next_row is distinct from old_row then
    update public.card_ideas set (sitting_id,target,target_key,concept,level,reason,front,back,evidence,sightings,status,proposal_id,note_id,resolved_at)=
      (next_row.sitting_id,next_row.target,next_row.target_key,next_row.concept,next_row.level,next_row.reason,next_row.front,
       next_row.back,next_row.evidence,next_row.sightings,next_row.status,next_row.proposal_id,next_row.note_id,next_row.resolved_at)
      where id=next_row.id and user_id=owner_id returning * into next_row;
  end if;

  result:=jsonb_build_object('id',next_row.id,'version',next_row.version,'ideaStatus',next_row.status);
  if op='save' then
    result:=result||jsonb_build_object('sightings',next_row.sightings);
    if merged then result:=result||jsonb_build_object('merged',true); end if;
    if note_row.id is not null then result:=result||jsonb_build_object('existingCard','N'||note_row.no); end if;
  end if;
  if proposal_no is not null then result:=result||jsonb_build_object('proposalNo',proposal_no); end if;
  if reused then result:=result||jsonb_build_object('reusedProposal',true); end if;
  if old_row.version=next_row.version then
    return public.lemma_exam_finish(p,owner_id,result||jsonb_build_object('unchanged',true));
  end if;
  return public.lemma_exam_finish(p,owner_id,result,next_row.id,next_row.version);
end
$$;

revoke all on function public.lemma_exam_keys(jsonb,text[]) from public,anon,authenticated,service_role;
revoke all on function public.lemma_exam_text(jsonb,text,int,int) from public,anon,authenticated,service_role;
revoke all on function public.lemma_exam_number(jsonb,text,numeric,numeric,boolean,boolean) from public,anon,authenticated,service_role;
revoke all on function public.lemma_exam_boolean(jsonb,text) from public,anon,authenticated,service_role;
revoke all on function public.lemma_exam_enum(jsonb,text,text[],text) from public,anon,authenticated,service_role;
revoke all on function public.lemma_exam_uuid(jsonb,text) from public,anon,authenticated,service_role;
revoke all on function public.lemma_exam_time(jsonb,text,text) from public,anon,authenticated,service_role;
revoke all on function public.lemma_exam_normalize(text) from public,anon,authenticated,service_role;
revoke all on function public.lemma_exam_blueprint(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.lemma_exam_sources(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.lemma_exam_dispositions(jsonb,jsonb,jsonb,timestamptz) from public,anon,authenticated,service_role;
revoke all on function public.lemma_exam_project(uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.lemma_exam_bookmark(uuid,uuid,timestamptz) from public,anon,authenticated,service_role;
revoke all on function public.lemma_exam_begin(jsonb,uuid,text,text,text[]) from public,anon,authenticated,service_role;
revoke all on function public.lemma_exam_finish(jsonb,uuid,jsonb,uuid,int) from public,anon,authenticated,service_role;
revoke all on function public.lemma_exam_conflict(jsonb,uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.lemma_exam_version() from public,anon,authenticated,service_role;
revoke all on function public.lemma_exam_session(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.lemma_exam_idea_evidence(jsonb,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.exam_sitting_command(jsonb) from public,anon;
revoke all on function public.exam_attempt_command(jsonb) from public,anon;
revoke all on function public.card_idea_command(jsonb) from public,anon;
grant execute on function public.exam_sitting_command(jsonb),public.exam_attempt_command(jsonb),public.card_idea_command(jsonb)
  to authenticated,service_role;

insert into public.lemma_command_resources(resource,command_fn,mcp_ok,"schema") values
  ('exam_sittings','exam_sitting_command',true,
  '{"operations":["create","update","set_disposition","activate","pause","finish","reopen","cancel"],"fields":["project","project_id","title","starts_at","time_zone","duration_minutes","study_minutes","last_study_at","objective","pass_marks","total_marks","format","sources","blueprint","blueprint_version","ledger","rows","activate","status","phase","card_mode","bookmark","plan_note","next_question","activated_at","paused_at","finished_at","happened","result_marks","result_note"]}'::jsonb),
  ('exam_attempts','exam_attempt_command',true,
  '{"operations":["record","correct","void","restore"],"fields":["sitting_id","project_id","row_key","blueprint_version","kind","prompt","delivery","delivery_ref","outcome","marks_awarded","marks_possible","independence","hint_level","novelty","timed","seconds","scoring","confidence","learner_confirmed","concept","level","session","session_id","note","occurred_at","reason","corrected_at","corrected_reason","voided_at","void_reason"]}'::jsonb),
  ('card_ideas','card_idea_command',true,
  '{"operations":["save","update","draft","link","dismiss","restore"],"fields":["project","project_id","sitting_id","target","concept","level","reason","front","back","type","kind","checkpoint","card","proposal","evidence","sightings","status","proposal_id","note_id","resolved_at"]}'::jsonb);

-- The largest blueprint can reference 480 concepts. Keep the join in Postgres so
-- neither long URL filters nor the PostgREST per-page cap truncate the snapshot.
create function public.exam_row_evidence(p_owner uuid, p_sitting uuid, p_as_of timestamptz)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with mapped as (
    select distinct c.id, c.slug
    from public.exam_sittings s
    join public.projects p on (p.user_id,p.id)=(s.user_id,s.project_id)
    cross join lateral jsonb_array_elements(s.blueprint) as r(value)
    cross join lateral jsonb_array_elements_text(r.value->'concepts') as key(slug)
    join public.concepts c on c.user_id=p_owner and c.slug=key.slug
    where s.id=p_sitting and s.user_id=p_owner and c.subject_id=p.subject_id
      and not p.system and p.status <> 'archived'
      and (current_setting('role',true)='service_role' or p_owner=(select auth.uid()))
  ), latest as (
    select e.id, m.slug as concept, e.occurred_at, e.outcome, e.hint_level, e.novelty, e.kind
    from mapped m join public.evidence e on e.concept_id=m.id and e.user_id=p_owner
    where e.voided_at is null and e.occurred_at between p_as_of - interval '120 days' and p_as_of
    order by e.occurred_at desc,e.id desc limit 2000
  )
  select coalesce(jsonb_agg(to_jsonb(latest)-'id' order by occurred_at desc,id desc),'[]'::jsonb) from latest;
$$;
revoke all on function public.exam_row_evidence(uuid,uuid,timestamptz) from public,anon;
grant execute on function public.exam_row_evidence(uuid,uuid,timestamptz) to authenticated,service_role;
