-- N170 (additive only): items, assumptions, concept aliases, learning profile, worker telemetry.
-- Proficiency, node cards and digests are derived on read from evidence and are deliberately not stored or registered for undo.
alter table public.projects
  add column learning_profile jsonb constraint projects_learning_profile_object check (learning_profile is null or pg_catalog.jsonb_typeof(learning_profile)='object'),
  add column learning_profile_approved boolean not null default false;

create table public.items (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  origin text not null constraint items_origin_valid check (origin in ('source_exercise','source_example','source_theorem','plan_probe','template','tutor_generated','past_exam','card','user_supplied')),
  text text not null constraint items_text_len check (char_length(text) between 1 and 2000),
  source_id uuid, page_label text constraint items_page_len check (char_length(page_label)<=12),
  concept_tags jsonb not null default '[]'::jsonb constraint items_tags_array check (pg_catalog.jsonb_typeof(concept_tags)='array'),
  b real not null default 0 constraint items_b_valid check (b between -6 and 6),
  b_n integer not null default 0 constraint items_bn_valid check (b_n>=0),
  has_reference_solution boolean not null default false,
  fingerprint text not null,
  teaches boolean not null default false,
  holdout boolean not null default false,
  status text not null default 'active' constraint items_status_valid check (status in ('active','needs_transcription','retired')),
  created_by text not null default 'tutor' constraint items_created_by_valid check (created_by in ('curator','tutor','migration','user')),
  version integer not null default 1 constraint items_version_valid check (version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_source text constraint items_updated_source_valid check (updated_source in ('app','mcp','worker')),
  unique (user_id,id),
  unique (user_id,fingerprint),
  foreign key (user_id,source_id) references public.sources(user_id,id) on delete set null (source_id)
);
create index items_owner_status on public.items(user_id,status,holdout);
alter table public.evidence add constraint evidence_item_fk foreign key (user_id,item_id) references public.items(user_id,id) on delete set null (item_id);

create table public.assumptions (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  concept_id uuid not null,
  level text not null constraint assumptions_level_valid check (level in ('recall','use','understand','transfer')),
  mean_at real constraint assumptions_mean_valid check (mean_at between 0 and 1),
  n_eff_at real constraint assumptions_n_valid check (n_eff_at>=0),
  reason text constraint assumptions_reason_len check (char_length(reason)<=300),
  revoked_at timestamptz,
  revoke_evidence_id bigint,
  version integer not null default 1 constraint assumptions_version_valid check (version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_source text constraint assumptions_updated_source_valid check (updated_source in ('app','mcp','worker')),
  unique (user_id,id),
  foreign key (user_id,concept_id) references public.concepts(user_id,id) on delete cascade
);
create unique index assumptions_one_active on public.assumptions(user_id,concept_id,level) where revoked_at is null;

-- Concepts joined across subjects: proficiency is pooled per class (spec §3). `same_as` cannot be a new concept_links kind
-- (that CHECK may not change in an additive migration), so aliases are their own fact.
create table public.concept_aliases (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  concept_a uuid not null,
  concept_b uuid not null,
  origin text not null default 'approved' constraint concept_aliases_origin_valid check (origin in ('auto','approved')),
  version integer not null default 1 constraint concept_aliases_version_valid check (version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_source text constraint concept_aliases_updated_source_valid check (updated_source in ('app','mcp','worker')),
  unique (user_id,id),
  unique (user_id,concept_a,concept_b),
  constraint concept_aliases_ordered check (concept_a<concept_b),
  foreign key (user_id,concept_a) references public.concepts(user_id,id) on delete cascade,
  foreign key (user_id,concept_b) references public.concepts(user_id,id) on delete cascade
);

do $facts$
declare t text;
begin
  foreach t in array array['items','assumptions','concept_aliases'] loop
    execute pg_catalog.format('alter table public.%I enable row level security',t);
    execute pg_catalog.format('create policy %I on public.%I for select to authenticated using (user_id=(select auth.uid()))',t||'_owner_select',t);
    execute pg_catalog.format('revoke insert,update,delete,truncate on public.%I from anon,authenticated',t);
    execute pg_catalog.format('grant select on public.%I to authenticated,service_role',t);
    execute pg_catalog.format('create trigger z_record_version before update on public.%I for each row execute function public.lemma_record_version()',t);
    execute pg_catalog.format('create trigger lemma_log_change after insert or update or delete on public.%I for each row execute function public.log_change()',t);
    execute pg_catalog.format('insert into public.lemma_undo_tables(table_name) values(%L)',t);
  end loop;
end
$facts$;

-- Worker telemetry (spec §12): a log, not a fact; written by service-role code, read by the owner.
create table public.worker_runs (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  job text not null constraint worker_runs_job_valid check (job in ('scribe','gardener','curator','briefer','audit')),
  model text not null,
  input_tokens integer not null default 0, output_tokens integer not null default 0, cached_tokens integer not null default 0,
  status text not null constraint worker_runs_status_valid check (status in ('ok','failed','skipped_disabled','skipped_cap','skipped_done')),
  watermark_from text, watermark_to text, error text constraint worker_runs_error_len check (char_length(error)<=300),
  started_at timestamptz not null default now(), ended_at timestamptz
);
create index worker_runs_owner on public.worker_runs(user_id,started_at);
alter table public.worker_runs enable row level security;
create policy worker_runs_owner_select on public.worker_runs for select to authenticated using (user_id=(select auth.uid()));
revoke insert,update,delete,truncate on public.worker_runs from anon,authenticated;
grant select on public.worker_runs to authenticated,service_role;

-- assumptions and aliases: one shared, journalled, idempotent command (items arrive through save_progress, the curator and migrations)
create function public.adaptive_facts2_write_owned(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $facts_two$
declare
 v_owner uuid; v_op_id uuid; v_op text; v_res text; v_patch jsonb; v_target jsonb; v_bad text; v_id uuid; v_expected integer;
 v_stored jsonb; v_receipt jsonb; v_changed jsonb; v_action bigint; v_a public.assumptions%rowtype; v_al public.concept_aliases%rowtype;
 v_x uuid; v_y uuid;
begin
 v_owner:=(select auth.uid());
 if v_owner is null then raise exception 'Authentication required'; end if;
 if p is null or pg_catalog.jsonb_typeof(p) is distinct from 'object' then raise exception 'Command envelope must be an object'; end if;
 if pg_catalog.jsonb_typeof(p->'operationId') is distinct from 'string' or nullif(p->>'operationId','') is null then raise exception 'operationId is required UUID'; end if;
 v_op_id:=(p->>'operationId')::uuid;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text||':'||v_op_id::text,0));
 select r.result into v_stored from public.command_receipts r where r.user_id=v_owner and r.operation_id=v_op_id;
 if found then
  if v_stored->'_request'=p then return v_stored-'_request'; end if;
  return pg_catalog.jsonb_build_object('operationId',v_op_id,'status','conflict','changed','[]'::jsonb,'actionNo',null,
    'conflict',pg_catalog.jsonb_build_object('reason','operationId reused with a different payload'));
 end if;
 select k into v_bad from pg_catalog.jsonb_object_keys(p) as keys(k)
  where k<>all(array['operationId','schemaVersion','resource','operation','target','expectedVersion','patch']) limit 1;
 if v_bad is not null then raise exception 'Unknown command field: %',v_bad; end if;
 if p->>'schemaVersion' is distinct from '1' then raise exception 'schemaVersion must be 1'; end if;
 v_res:=p->>'resource';
 if v_res is null or v_res not in ('assumptions','concept_aliases') then raise exception 'Unsupported resource'; end if;
 v_op:=p->>'operation';
 if v_op is null or v_op not in ('create','revoke','delete') then raise exception 'Unsupported operation'; end if;
 if (v_res='assumptions' and v_op='delete') or (v_res='concept_aliases' and v_op='revoke') then raise exception '% does not support %',v_res,v_op; end if;
 v_target:=coalesce(p->'target','{}'::jsonb);
 if pg_catalog.jsonb_typeof(v_target) is distinct from 'object' then raise exception 'target must be an object'; end if;
 if v_target?'id' then v_id:=(v_target->>'id')::uuid;
 elsif v_op='create' then v_id:=pg_catalog.gen_random_uuid();
 else raise exception 'target.id required'; end if;
 if v_op<>'create' then
  if pg_catalog.jsonb_typeof(p->'expectedVersion') is distinct from 'number' or p->>'expectedVersion' !~ '^[1-9][0-9]*$' then raise exception 'expectedVersion must be a positive whole number'; end if;
  v_expected:=(p->>'expectedVersion')::integer;
 end if;
 v_patch:=coalesce(p->'patch','{}'::jsonb);
 if pg_catalog.jsonb_typeof(v_patch) is distinct from 'object' then raise exception 'patch must be an object'; end if;
 select k into v_bad from pg_catalog.jsonb_object_keys(v_patch) as keys(k)
  where k<>all(case v_res when 'assumptions' then array['concept_id','level','mean_at','n_eff_at','reason','revoke_evidence_id'] else array['concept_a','concept_b','origin'] end) limit 1;
 if v_bad is not null then raise exception 'Unknown % patch field: %',v_res,v_bad; end if;
 if coalesce(current_setting('role',true),'')<>'service_role' then
  perform pg_catalog.set_config('lemma.source','app',true);
  perform pg_catalog.set_config('lemma.tool',v_res,true);
 end if;
 perform pg_catalog.set_config('lemma.summary',pg_catalog.left(replace(v_res,'_',' ')||' '||v_op,200),true);
 if v_res='assumptions' then
  if v_op='create' then
   if not (v_patch?'concept_id' and v_patch?'level') then raise exception 'Create requires concept_id and level'; end if;
   insert into public.assumptions(id,user_id,concept_id,level,mean_at,n_eff_at,reason)
    values(v_id,v_owner,(v_patch->>'concept_id')::uuid,v_patch->>'level',(v_patch->>'mean_at')::real,(v_patch->>'n_eff_at')::real,v_patch->>'reason') returning * into v_a;
  else
   select * into v_a from public.assumptions where id=v_id and user_id=v_owner for update;
   if not found then raise exception 'Assumption not found for owner'; end if;
   if v_a.version is distinct from v_expected then
    v_receipt:=pg_catalog.jsonb_build_object('operationId',v_op_id,'status','conflict','changed','[]'::jsonb,'actionNo',null,
      'current',pg_catalog.to_jsonb(v_a),'conflict',pg_catalog.jsonb_build_object('expectedVersion',v_expected,'currentVersion',v_a.version));
   else
    if v_a.revoked_at is not null then raise exception 'Assumption is already revoked'; end if;
    update public.assumptions set revoked_at=pg_catalog.clock_timestamp(),revoke_evidence_id=(v_patch->>'revoke_evidence_id')::bigint where id=v_id and user_id=v_owner returning * into v_a;
   end if;
  end if;
  v_changed:=pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('id',v_a.id,'version',v_a.version));
 else
  if v_op='create' then
   if not (v_patch?'concept_a' and v_patch?'concept_b') then raise exception 'Create requires concept_a and concept_b'; end if;
   v_x:=(v_patch->>'concept_a')::uuid; v_y:=(v_patch->>'concept_b')::uuid;
   if v_x=v_y then raise exception 'A concept cannot be its own alias'; end if;
   insert into public.concept_aliases(id,user_id,concept_a,concept_b,origin)
    values(v_id,v_owner,least(v_x,v_y),greatest(v_x,v_y),coalesce(v_patch->>'origin','approved')) returning * into v_al;
   v_changed:=pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('id',v_al.id,'version',v_al.version));
  else
   select * into v_al from public.concept_aliases where id=v_id and user_id=v_owner for update;
   if not found then raise exception 'Alias not found for owner'; end if;
   if v_al.version is distinct from v_expected then
    v_receipt:=pg_catalog.jsonb_build_object('operationId',v_op_id,'status','conflict','changed','[]'::jsonb,'actionNo',null,
      'current',pg_catalog.to_jsonb(v_al),'conflict',pg_catalog.jsonb_build_object('expectedVersion',v_expected,'currentVersion',v_al.version));
   else
    delete from public.concept_aliases where id=v_id and user_id=v_owner;
    v_changed:=pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('id',v_id,'version',v_al.version+1));
   end if;
  end if;
 end if;
 if v_receipt is null then
  select a.no into v_action from public.actions a where a.txid=pg_catalog.txid_current() and a.user_id=v_owner;
  if v_action is null then raise exception 'Mutation lacks a reversible journal action'; end if;
  v_receipt:=pg_catalog.jsonb_build_object('operationId',v_op_id,'status','ok','changed',v_changed,'actionNo',v_action);
 end if;
 insert into public.command_receipts(user_id,operation_id,resource,result) values(v_owner,v_op_id,v_res,v_receipt||pg_catalog.jsonb_build_object('_request',p));
 return v_receipt;
end
$facts_two$;
create function public.adaptive_facts2_command(p jsonb) returns jsonb
language sql volatile security invoker set search_path='' as $command$ select public.adaptive_facts2_write_owned(p) $command$;
revoke all on function public.adaptive_facts2_write_owned(jsonb) from public,anon;
revoke all on function public.adaptive_facts2_command(jsonb) from public,anon;
grant execute on function public.adaptive_facts2_write_owned(jsonb) to authenticated,service_role;
grant execute on function public.adaptive_facts2_command(jsonb) to authenticated,service_role;
insert into public.lemma_command_resources(resource,command_fn,mcp_ok,"schema") values
 ('assumptions','adaptive_facts2_command',true,'{"operations":["create","revoke"],"fields":["concept_id","level","mean_at","n_eff_at","reason","revoke_evidence_id"]}'::jsonb),
 ('concept_aliases','adaptive_facts2_command',true,'{"operations":["create","delete"],"fields":["concept_a","concept_b","origin"]}'::jsonb);
