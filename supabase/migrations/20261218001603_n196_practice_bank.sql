-- Maps an existing approved/scored local bank item version to a registered destination.
-- There is no seeded mapping and no enrollment or assignment side effect on a read.
create table public.atlas_practice_bank (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid not null, item_version int not null check(item_version>0), project_id uuid not null, concept_id uuid not null,
  facet text not null, context text not null check(length(btrim(context))>0), track text not null, policy text not null,
  bank text not null, rubric text not null, family text not null check(length(btrim(family))>0),
  form text not null check(form in ('whole','step','micro','recall','worked')), minutes real not null check(minutes>0 and minutes<'Infinity'::real),
  uncued boolean not null, novel boolean not null, native_order integer, expert_probabilities jsonb,
  scored_at timestamptz, registered_at timestamptz not null default clock_timestamp(), valid_until timestamptz not null,
  primary key(user_id,item_id,item_version),foreign key(user_id,item_id) references public.items(user_id,id) on delete cascade,
  foreign key(user_id,project_id) references public.projects(user_id,id) on delete cascade,
  foreign key(user_id,concept_id) references public.concepts(user_id,id) on delete cascade,
  check(valid_until>registered_at),check(expert_probabilities is null or jsonb_typeof(expert_probabilities)='object' and scored_at is not null)
);
create index atlas_practice_bank_owner_target on public.atlas_practice_bank(user_id,project_id,concept_id);
alter table public.atlas_practice_bank enable row level security;
revoke all on public.atlas_practice_bank from public,anon,authenticated;
grant select,insert,delete on public.atlas_practice_bank to service_role;

create function public.lemma_practice_bank_snapshot(p_owner uuid,p_cutoff timestamptz) returns jsonb
language plpgsql stable security definer set search_path='' as $bank$
declare bank_items jsonb;
begin
  if current_setting('role',true) is distinct from 'service_role' then raise exception 'Verified owner required' using errcode='42501';end if;
  if p_cutoff>statement_timestamp() then raise exception 'Future cutoff';end if;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') into bank_items from (
    select b.item_id as id,b.item_version as "itemVersion",b.project_id as project,b.concept_id as concept,b.facet,b.context,b.track,b.policy,b.bank,b.rubric,b.family,
      b.form,b.minutes,b.uncued,b.novel,true as approved,b.registered_at as "registeredAt",b.native_order as "nativeOrder",
      b.scored_at as "expertAsOf",b.expert_probabilities as "expertProbabilities",i.b as difficulty,
      public.lemma_trial_arm(p_owner,b.track,b.policy,b.bank,b.rubric,e.anchors,p_cutoff) as arm
    from public.atlas_practice_bank b join public.items i on i.user_id=b.user_id and i.id=b.item_id and i.version=b.item_version
    left join public.atlas_practice_trials t on t.track=b.track left join public.atlas_practice_enrollments e on e.trial=t.id and e.user_id=p_owner
    where b.user_id=p_owner and b.registered_at<=p_cutoff and p_cutoff<b.valid_until and i.status='active'
  ) r;
  return bank_items;
end
$bank$;
revoke all on function public.lemma_practice_bank_snapshot(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.lemma_practice_bank_snapshot(uuid,timestamptz) to service_role;

-- A delivery receipt records the question actually opened. Agenda previews, forecast reads and shadow runs do not write.
create table public.atlas_practice_exposures (
  user_id uuid not null references auth.users(id) on delete cascade, request_id uuid not null,
  trial uuid references public.atlas_practice_trials(id), assigned_arm text, actual_arm text not null,
  item_id uuid not null, item_version int not null, question_text text not null, served_at timestamptz not null,
  scope jsonb not null, native_probability double precision check(native_probability between 0 and 1),
  primary key(user_id,request_id),check((trial is null)=(assigned_arm is null))
);
alter table public.atlas_practice_exposures enable row level security;
revoke all on public.atlas_practice_exposures from public,anon,authenticated,service_role;
create trigger immutable_practice_exposure before update or delete on public.atlas_practice_exposures
  for each row execute function public.lemma_trial_immutable();

create function public.lemma_deliver_practice(p_owner uuid,p_request uuid,p_selection jsonb) returns jsonb
language plpgsql security definer set search_path='' as $deliver$
declare
  prior public.atlas_practice_exposures; exposure public.atlas_practice_exposures;
  scope jsonb:=p_selection->'scope'; now_at timestamptz:=public.lemma_trial_clock();
  enrollment record; permissible text:='atlas80'; wanted text:=p_selection->>'arm'; pick uuid; version int; chosen record;
  unavailable constant jsonb:='{"status":"unavailable"}'::jsonb;
begin
  if current_setting('role',true) is distinct from 'service_role' or p_owner is null or p_request is null then
    raise exception 'Verified owner and request required' using errcode='42501';end if;
  if to_regprocedure('public.lemma_plan_released()') is null then return unavailable;end if;
  if not public.lemma_plan_released() then return unavailable;end if;
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text||p_request::text,196));
  select * into prior from public.atlas_practice_exposures where user_id=p_owner and request_id=p_request;
  -- Simultaneous rollback, assignment or checkpoint changes serialize against a new exposure.
  -- Trial before controls is the same acquisition order as admission.
  if found then
    if prior.actual_arm<>'atlas80' then
      select e.anchors,t.track,t.certificate into enrollment from public.atlas_practice_trials t
        join public.atlas_practice_enrollments e on e.trial=t.id and e.user_id=p_owner
        where t.id=prior.trial for share of t;
      perform 1 from public.atlas_practice_controls where singleton for share;
      if public.lemma_trial_arm(p_owner,enrollment.track,enrollment.certificate->>'policy',
        enrollment.certificate->>'bank',enrollment.certificate->>'rubric',enrollment.anchors,now_at)<>prior.actual_arm then
        return unavailable;end if;
    end if;
    exposure:=prior;
  elsif p_selection is not null then
    if scope->>'owner' is distinct from p_owner::text then return unavailable;end if;
    select e.trial,e.arm,e.anchors into enrollment from public.atlas_practice_trials t
      join public.atlas_practice_enrollments e on e.trial=t.id and e.user_id=p_owner
      where t.track=scope->>'track' for share of t;
    perform 1 from public.atlas_practice_controls where singleton for share;
    if enrollment.trial is not null then
      permissible:=public.lemma_trial_arm(p_owner,scope->>'track',scope->>'policy',scope->>'bank',scope->>'rubric',enrollment.anchors,now_at);
    end if;
    exposure.actual_arm:=case when wanted=permissible then wanted else 'atlas80' end;
    pick:=(case when exposure.actual_arm='atlas80' then p_selection->>'nativeQuestionId' else p_selection->>'questionId' end)::uuid;
    version:=(case when exposure.actual_arm='atlas80' then p_selection->>'nativeVersion' else p_selection->>'itemVersion' end)::int;
    select i.text into chosen from public.atlas_practice_bank b
      join public.items i on i.user_id=b.user_id and i.id=b.item_id and i.version=b.item_version
      where b.user_id=p_owner and b.item_id=pick and b.item_version=version and i.status='active'
        and b.registered_at<=now_at and now_at<b.valid_until and b.project_id::text=scope->>'project'
        and b.concept_id::text=scope->>'concept' and b.facet=scope->>'facet' and b.context=scope->>'context'
        and b.track=scope->>'track' and b.policy=scope->>'policy' and b.bank=scope->>'bank' and b.rubric=scope->>'rubric'
      for share of i,b;
    if not found then return unavailable;end if;
    insert into public.atlas_practice_exposures values(p_owner,p_request,enrollment.trial,enrollment.arm,exposure.actual_arm,
      pick,version,chosen.text,now_at,scope,(case when exposure.actual_arm='atlas80' then p_selection->>'nativeItemProbability'
        else p_selection->>'native' end)::float8) returning * into exposure;
  else return unavailable;end if;
  return jsonb_build_object('status','available','question',exposure.question_text,'arm',exposure.actual_arm,
    'itemId',exposure.item_id,'itemVersion',exposure.item_version,'requestId',exposure.request_id);
end
$deliver$;
revoke all on function public.lemma_deliver_practice(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.lemma_deliver_practice(uuid,uuid,jsonb) to service_role;

-- Export policy metadata is shared with N191. No grant on these installer-owned rows reaches a client or service.
create schema if not exists lemma_export_private;
revoke all on schema lemma_export_private from public,anon,authenticated,service_role;
create table if not exists lemma_export_private.additional_tables(
  table_name text primary key check(table_name~'^[a-z_][a-z0-9_]*$'),
  owner_column text not null default 'user_id' check(owner_column~'^[a-z_][a-z0-9_]*$'), redact_columns text[] not null default '{}'
);
alter table lemma_export_private.additional_tables enable row level security;
revoke all on lemma_export_private.additional_tables from public,anon,authenticated,service_role;
insert into lemma_export_private.additional_tables(table_name,redact_columns) values
  ('atlas_practice_enrollments',array['pair','position']),
  ('atlas_practice_outcomes','{}'),('atlas_practice_exposures','{}'),('atlas_practice_bank','{}')
on conflict(table_name) do update set owner_column=excluded.owner_column,redact_columns=excluded.redact_columns;
