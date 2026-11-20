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
    select b.item_id as id,b.project_id as project,b.concept_id as concept,b.facet,b.context,b.track,b.policy,b.bank,b.rubric,b.family,
      b.form,b.minutes,b.uncued,b.novel,true as approved,b.registered_at as "registeredAt",b.native_order as "nativeOrder",
      b.scored_at as "expertAsOf",b.expert_probabilities as "expertProbabilities",i.b as difficulty,
      public.lemma_trial_arm(p_owner,b.track,b.policy,b.bank,b.rubric,e.anchors,p_cutoff) as arm
    from public.atlas_practice_bank b join public.items i on i.user_id=b.user_id and i.id=b.item_id and i.version=b.item_version
    left join public.atlas_practice_trials t on t.track=b.track left join public.atlas_practice_enrollments e on e.trial=t.id and e.owner_id=p_owner
    where b.user_id=p_owner and b.registered_at<=p_cutoff and p_cutoff<b.valid_until and i.status='active'
  ) r;
  return bank_items;
end
$bank$;
revoke all on function public.lemma_practice_bank_snapshot(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.lemma_practice_bank_snapshot(uuid,timestamptz) to service_role;
