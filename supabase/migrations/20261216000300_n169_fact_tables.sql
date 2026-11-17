-- N169: three small learner/tutor facts, each undoable and registered as an MCP resource:
--   capacity_overrides(on_date, minutes)  per-date capacity beyond the weekday defaults
--   recheck_decisions                      the learner's calls on a recheck (rate easy, make a card, remediation logged)
--   plan_baselines                         approved plan versions; "behind" is measured against the latest
create table public.capacity_overrides (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  on_date date not null,
  minutes integer not null constraint capacity_overrides_minutes_valid check (minutes between 0 and 1440),
  reason text constraint capacity_overrides_reason_len check (char_length(reason)<=200),
  version integer not null default 1 constraint capacity_overrides_version_valid check (version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_source text constraint capacity_overrides_source_valid check (updated_source in ('app','mcp','worker')),
  unique (user_id,id),
  unique (user_id,on_date)
);
create table public.recheck_decisions (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  concept_id uuid not null,
  level text not null constraint recheck_decisions_level_valid check (level in ('recall','use','understand','transfer')),
  action text not null constraint recheck_decisions_action_valid check (action in ('rate_easy','convert_card','remediation')),
  occurred_at timestamptz not null default now(),
  note text constraint recheck_decisions_note_len check (char_length(note)<=300),
  version integer not null default 1 constraint recheck_decisions_version_valid check (version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_source text constraint recheck_decisions_source_valid check (updated_source in ('app','mcp','worker')),
  unique (user_id,id),
  foreign key (user_id,concept_id) references public.concepts(user_id,id) on delete cascade
);
create index recheck_decisions_owner on public.recheck_decisions(user_id,concept_id,level,occurred_at);
create table public.plan_baselines (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid not null,
  baseline_version integer not null constraint plan_baselines_baseline_valid check (baseline_version>=0),
  approved_at timestamptz not null default now(),
  reason text constraint plan_baselines_reason_len check (char_length(reason)<=300),
  entries jsonb not null constraint plan_baselines_entries_array check (pg_catalog.jsonb_typeof(entries)='array'),
  version integer not null default 1 constraint plan_baselines_version_valid check (version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_source text constraint plan_baselines_source_valid check (updated_source in ('app','mcp','worker')),
  unique (user_id,id),
  unique (user_id,project_id,baseline_version),
  foreign key (user_id,project_id) references public.projects(user_id,id) on delete cascade
);
do $facts$
declare t text;
begin
  foreach t in array array['capacity_overrides','recheck_decisions','plan_baselines'] loop
    execute pg_catalog.format('alter table public.%I enable row level security',t);
    execute pg_catalog.format('create policy %I on public.%I for select to authenticated using (user_id=(select auth.uid()))',t||'_owner_select',t);
    -- Direct DML is closed: every write goes through adaptive_facts_command (journalled, idempotent, versioned).
    execute pg_catalog.format('revoke insert,update,delete,truncate on public.%I from anon,authenticated',t);
    execute pg_catalog.format('grant select on public.%I to authenticated,service_role',t);
    execute pg_catalog.format('create trigger z_record_version before update on public.%I for each row execute function public.lemma_record_version()',t);
    execute pg_catalog.format('create trigger lemma_log_change after insert or update or delete on public.%I for each row execute function public.log_change()',t);
    execute pg_catalog.format('insert into public.lemma_undo_tables(table_name) values(%L)',t);
  end loop;
end
$facts$;

create function public.adaptive_facts_write_owned(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $facts_write$
declare
 v_owner uuid; v_op_id uuid; v_op text; v_res text; v_patch jsonb; v_target jsonb; v_bad text;
 v_id uuid; v_expected integer; v_stored jsonb; v_receipt jsonb; v_changed jsonb; v_action bigint;
 v_cap public.capacity_overrides%rowtype; v_base public.plan_baselines%rowtype;
 v_dec public.recheck_decisions%rowtype; v_next integer; v_entries jsonb; v_current_version integer;
begin
 v_owner:=(select auth.uid());
 if v_owner is null then raise exception 'Authentication required'; end if;
 if p is null or pg_catalog.jsonb_typeof(p) is distinct from 'object' then
  raise exception 'Command envelope must be an object'; end if;
 if pg_catalog.jsonb_typeof(p->'operationId') is distinct from 'string' or nullif(p->>'operationId','') is null then
  raise exception 'operationId is required UUID'; end if;
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
 if v_res is null or v_res not in ('capacity_overrides','recheck_decisions','plan_baselines') then
  raise exception 'Unsupported resource'; end if;
 v_op:=p->>'operation';
 if v_op is null or v_op not in ('create','update','delete') then raise exception 'Unsupported operation'; end if;
 if v_res<>'capacity_overrides' and v_op<>'create' then
  raise exception '% records are append-only; undo the action instead',v_res; end if;
 v_target:=coalesce(p->'target','{}'::jsonb);
 if pg_catalog.jsonb_typeof(v_target) is distinct from 'object' then raise exception 'target must be an object'; end if;
 if v_target?'id' then
  if pg_catalog.jsonb_typeof(v_target->'id') is distinct from 'string' then raise exception 'target.id must be a UUID'; end if;
  v_id:=(v_target->>'id')::uuid;
 elsif v_op='create' then v_id:=pg_catalog.gen_random_uuid();
 else raise exception 'target.id required'; end if;
 if v_op<>'create' then
  if pg_catalog.jsonb_typeof(p->'expectedVersion') is distinct from 'number' or p->>'expectedVersion' !~ '^[1-9][0-9]*$' then
   raise exception 'expectedVersion must be a positive whole number'; end if;
  v_expected:=(p->>'expectedVersion')::integer;
 end if;
 v_patch:=coalesce(p->'patch','{}'::jsonb);
 if pg_catalog.jsonb_typeof(v_patch) is distinct from 'object' then raise exception 'patch must be an object'; end if;
 select k into v_bad from pg_catalog.jsonb_object_keys(v_patch) as keys(k)
  where k<>all(case v_res when 'capacity_overrides' then array['on_date','minutes','reason']
    when 'recheck_decisions' then array['concept_id','level','action','note']
    else array['project_id','reason','entries'] end) limit 1;
 if v_bad is not null then raise exception 'Unknown % patch field: %',v_res,v_bad; end if;
 if coalesce(current_setting('role',true),'')<>'service_role' then
  perform pg_catalog.set_config('lemma.source','app',true);
  perform pg_catalog.set_config('lemma.tool',v_res,true);
 end if;
 perform pg_catalog.set_config('lemma.summary',pg_catalog.left(replace(v_res,'_',' ')||' '||v_op,200),true);

 if v_res='capacity_overrides' then
  if v_op='create' then
   if not (v_patch?'on_date' and v_patch?'minutes') then raise exception 'Create requires on_date and minutes'; end if;
   insert into public.capacity_overrides(id,user_id,on_date,minutes,reason)
    values(v_id,v_owner,(v_patch->>'on_date')::date,(v_patch->>'minutes')::integer,v_patch->>'reason') returning * into v_cap;
   v_changed:=pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('id',v_cap.id,'version',v_cap.version));
  else
   select * into v_cap from public.capacity_overrides where id=v_id and user_id=v_owner for update;
   if not found then raise exception 'Capacity override not found for owner'; end if;
   if v_cap.version is distinct from v_expected then
    v_receipt:=pg_catalog.jsonb_build_object('operationId',v_op_id,'status','conflict','changed','[]'::jsonb,'actionNo',null,
      'current',pg_catalog.to_jsonb(v_cap),'conflict',pg_catalog.jsonb_build_object('expectedVersion',v_expected,'currentVersion',v_cap.version));
   elsif v_op='delete' then
    delete from public.capacity_overrides where id=v_id and user_id=v_owner;
    v_changed:=pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('id',v_id,'version',v_cap.version+1));
   else
    if v_patch='{}'::jsonb then raise exception 'Update patch must not be empty'; end if;
    update public.capacity_overrides c set
      on_date=coalesce((v_patch->>'on_date')::date,c.on_date),
      minutes=coalesce((v_patch->>'minutes')::integer,c.minutes),
      reason=case when v_patch?'reason' then v_patch->>'reason' else c.reason end
     where c.id=v_id and c.user_id=v_owner returning * into v_cap;
    v_changed:=pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('id',v_cap.id,'version',v_cap.version));
   end if;
  end if;
 elsif v_res='recheck_decisions' then
  if not (v_patch?'concept_id' and v_patch?'level' and v_patch?'action') then
   raise exception 'Create requires concept_id, level and action'; end if;
  insert into public.recheck_decisions(id,user_id,concept_id,level,action,note)
   values(v_id,v_owner,(v_patch->>'concept_id')::uuid,v_patch->>'level',v_patch->>'action',v_patch->>'note') returning * into v_dec;
  v_changed:=pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('id',v_dec.id,'version',v_dec.version));
 else
  if not v_patch?'project_id' then raise exception 'Create requires project_id'; end if;
  perform 1 from public.projects where id=(v_patch->>'project_id')::uuid and user_id=v_owner for update;
  if not found then raise exception 'Project not found for owner'; end if;
  select coalesce(max(b.baseline_version),-1)+1 into v_next from public.plan_baselines b
   where b.user_id=v_owner and b.project_id=(v_patch->>'project_id')::uuid;
  -- Without explicit entries the baseline snapshots the project's current due dates.
  v_entries:=coalesce(v_patch->'entries',(select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'checkpoint_id',c.id,'due_on',c.due_on) order by c.position),'[]'::jsonb)
    from public.checkpoints c where c.user_id=v_owner and c.project_id=(v_patch->>'project_id')::uuid));
  insert into public.plan_baselines(id,user_id,project_id,baseline_version,reason,entries)
   values(v_id,v_owner,(v_patch->>'project_id')::uuid,v_next,v_patch->>'reason',v_entries) returning * into v_base;
  v_changed:=pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('id',v_base.id,'version',v_base.version,'baseline_version',v_base.baseline_version));
 end if;
 if v_receipt is null then
  select a.no into v_action from public.actions a where a.txid=pg_catalog.txid_current() and a.user_id=v_owner;
  if v_action is null then raise exception 'Mutation lacks a reversible journal action'; end if;
  v_receipt:=pg_catalog.jsonb_build_object('operationId',v_op_id,'status','ok','changed',v_changed,'actionNo',v_action);
 end if;
 insert into public.command_receipts(user_id,operation_id,resource,result)
  values(v_owner,v_op_id,v_res,v_receipt||pg_catalog.jsonb_build_object('_request',p));
 return v_receipt;
end
$facts_write$;
create function public.adaptive_facts_command(p jsonb) returns jsonb
language sql volatile security invoker set search_path='' as $command$
 select public.adaptive_facts_write_owned(p)
$command$;
revoke all on function public.adaptive_facts_write_owned(jsonb) from public,anon;
revoke all on function public.adaptive_facts_command(jsonb) from public,anon;
grant execute on function public.adaptive_facts_write_owned(jsonb) to authenticated,service_role;
grant execute on function public.adaptive_facts_command(jsonb) to authenticated,service_role;

insert into public.lemma_command_resources(resource,command_fn,mcp_ok,"schema") values
 ('capacity_overrides','adaptive_facts_command',true,'{"operations":["create","update","delete"],"fields":["on_date","minutes","reason"]}'::jsonb),
 ('recheck_decisions','adaptive_facts_command',true,'{"operations":["create"],"fields":["concept_id","level","action","note"]}'::jsonb),
 ('plan_baselines','adaptive_facts_command',true,'{"operations":["create"],"fields":["project_id","reason","entries"]}'::jsonb);
