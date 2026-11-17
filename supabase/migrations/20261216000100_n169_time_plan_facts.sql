-- N169 (additive only): per-user flags, capacity, project time facts, session study day,
-- and checkpoint kind/tier/estimate/plan_state. Existing columns are untouched; the old
-- recheck_* and needs_revisit columns stay readable and are only no longer written once
-- the per-user recheck_v2 flag is on.
alter table public.settings
  add column flags jsonb not null default '{}'::jsonb
    constraint settings_flags_object check (pg_catalog.jsonb_typeof(flags)='object'),
  add column capacity jsonb
    constraint settings_capacity_object check (capacity is null or pg_catalog.jsonb_typeof(capacity)='object');

create function public.lemma_flag(p_user uuid,p_name text) returns boolean
language sql stable security invoker set search_path='' as $flag$
  select coalesce((select (s.flags->>p_name)::boolean from public.settings s
    where s.user_id=p_user and pg_catalog.jsonb_typeof(s.flags->p_name)='boolean'),false)
$flag$;
revoke all on function public.lemma_flag(uuid,text) from public,anon;
grant execute on function public.lemma_flag(uuid,text) to authenticated,service_role;

alter table public.projects
  add column deadline_at timestamptz,
  add column last_study_on date,
  add column time_confirmed boolean not null default false,
  add column share_weight real constraint projects_share_weight_positive check (share_weight is null or share_weight>0),
  add column auto_prune_standard boolean not null default false;

-- A session belongs to the study day of started_at, in the zone recorded when it started.
alter table public.sessions
  add column study_day date,
  add column time_zone text,
  add column abandoned boolean not null default false;
create function public.lemma_session_study_day() returns trigger
language plpgsql security invoker set search_path='' as $day$
declare v_zone text; v_roll int;
begin
  select s.time_zone,s.rollover_hour into v_zone,v_roll from public.settings s where s.user_id=new.user_id;
  v_zone:=coalesce(v_zone,'UTC'); v_roll:=coalesce(v_roll,4);
  new.time_zone:=coalesce(new.time_zone,v_zone);
  new.study_day:=coalesce(new.study_day,((new.started_at at time zone new.time_zone)-pg_catalog.make_interval(hours=>v_roll))::date);
  return new;
end
$day$;
create trigger lemma_session_study_day before insert on public.sessions
  for each row execute function public.lemma_session_study_day();

alter table public.checkpoints
  add column kind text not null default 'learn'
    constraint checkpoints_kind_valid check (kind in ('learn','cards','milestone')),
  add column tier text not null default 'standard'
    constraint checkpoints_tier_valid check (tier in ('core','standard','venture')),
  add column estimate_minutes integer
    constraint checkpoints_estimate_valid check (estimate_minutes is null or estimate_minutes between 1 and 2400),
  add column pinned boolean not null default false,
  add column self_reported boolean not null default false,
  add column plan_state text not null default 'active'
    constraint checkpoints_plan_state_valid check (plan_state in ('active','deferred','skipped')),
  add column deferred_reason text constraint checkpoints_deferred_reason_len check (char_length(deferred_reason)<=200),
  add column deferred_at timestamptz,
  add column step_meta jsonb
    constraint checkpoints_step_meta_array check (step_meta is null or pg_catalog.jsonb_typeof(step_meta)='array');
-- New "Cards K…" checkpoints are typed on insert; existing ones are typed by adaptive_migrate.
create function public.lemma_checkpoint_kind() returns trigger
language plpgsql security invoker set search_path='' as $kind$
begin
  if new.kind='learn' and new.title ~* '^cards k' then new.kind:='cards'; end if;
  return new;
end
$kind$;
create trigger lemma_checkpoint_kind before insert on public.checkpoints
  for each row execute function public.lemma_checkpoint_kind();
