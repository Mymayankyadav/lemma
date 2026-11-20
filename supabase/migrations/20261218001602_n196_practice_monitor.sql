-- Separate registered practice trials. No rows, campaigns or assignments are created by deployment.
-- Independent operational switches. Only the service operator may change the singleton.
create table public.atlas_practice_controls (
  singleton boolean primary key check(singleton), forecast_enabled boolean not null default false,
  challenger_enabled boolean not null default false, admission_enabled boolean not null default false
);
insert into public.atlas_practice_controls(singleton) values(true);
alter table public.atlas_practice_controls enable row level security;
revoke all on public.atlas_practice_controls from public,anon,authenticated,service_role;
create function public.lemma_practice_controls(p_forecast boolean,p_challenger boolean,p_admission boolean)
returns void language plpgsql security definer set search_path='' as $controls$
begin
  if current_setting('role',true) is distinct from 'service_role' then raise exception 'Research service required' using errcode='42501';end if;
  update public.atlas_practice_controls set forecast_enabled=p_forecast,challenger_enabled=p_challenger,
    admission_enabled=p_admission where singleton;
end
$controls$;
revoke all on function public.lemma_practice_controls(boolean,boolean,boolean) from public,anon,authenticated;
grant execute on function public.lemma_practice_controls(boolean,boolean,boolean) to service_role;

-- The live clock has no caller inputs. Historic simulation overrides it only in a disposable test database.
create function public.lemma_trial_clock() returns timestamptz language sql stable set search_path='' as
  $$select pg_catalog.statement_timestamp()$$;
revoke all on function public.lemma_trial_clock() from public,anon,authenticated,service_role;

create table public.atlas_practice_trials (
  id uuid primary key, track text not null unique, challenger text not null, start_day date not null,
  protocol text not null check (length(btrim(protocol))>0), certificate jsonb not null
);
create table public.atlas_practice_pairs (
  trial uuid not null references public.atlas_practice_trials(id), id uuid not null, assigned_on date not null,
  challenger_index smallint check(challenger_index between 0 and 1), primary key(trial,id)
);
create index atlas_practice_pairs_due on public.atlas_practice_pairs(trial,assigned_on) where challenger_index is not null;
create table public.atlas_practice_enrollments (
  trial uuid not null, pair uuid not null, user_id uuid not null references auth.users(id) on delete cascade,
  position smallint not null check(position between 0 and 1), anchors jsonb not null, arm text not null,
  primary key(trial,user_id), unique(trial,pair,position),
  foreign key(trial,pair) references public.atlas_practice_pairs(trial,id)
);
create index atlas_practice_enrollments_owner on public.atlas_practice_enrollments(user_id);
create table public.atlas_practice_outcomes (
  trial uuid not null, user_id uuid not null, assessed_on date not null, reported_on date not null,
  score double precision not null check(score between 0 and 1), known_at timestamptz not null default clock_timestamp(), primary key(trial,user_id),
  foreign key(trial,user_id) references public.atlas_practice_enrollments(trial,user_id) on delete cascade,
  check(reported_on>=assessed_on)
);
create table public.atlas_practice_checkpoints (
  trial uuid not null references public.atlas_practice_trials(id), day date not null, available boolean not null,
  benefit double precision[] not null, harm jsonb not null, promoted boolean not null,
  stop text not null check(stop in ('','coverage','harm','monitor_unavailable')), grades integer[] not null,
  primary key(trial,day)
);
alter table public.atlas_practice_trials enable row level security;
alter table public.atlas_practice_pairs enable row level security;
alter table public.atlas_practice_enrollments enable row level security;
alter table public.atlas_practice_outcomes enable row level security;
alter table public.atlas_practice_checkpoints enable row level security;
revoke all on public.atlas_practice_trials,public.atlas_practice_pairs,public.atlas_practice_enrollments,
  public.atlas_practice_outcomes,public.atlas_practice_checkpoints from public,anon,authenticated,service_role;

create function public.lemma_trial_immutable() returns trigger language plpgsql set search_path='' as $immutable$
begin
  -- Account deletion erases that owner's intake, scored evidence and linkage. Closed aggregate checkpoints persist.
  if TG_OP='DELETE' and TG_TABLE_NAME in ('atlas_practice_enrollments','atlas_practice_outcomes','atlas_practice_exposures','atlas_practice_scores') then
    if pg_trigger_depth()>1 then return old;end if;
    if current_setting('role',true)='service_role' and exists(select 1 from public.account_deletion_requests d
      where d.user_id=old.user_id and d.cleanup_txid=txid_current() and d.cleanup_pid=pg_backend_pid()) then return old;end if;
  end if;
  raise exception 'Registered trial records are immutable' using errcode='55000';
end
$immutable$;
revoke all on function public.lemma_trial_immutable() from public,anon,authenticated;
create trigger immutable_trial before update or delete on public.atlas_practice_trials for each row execute function public.lemma_trial_immutable();
create trigger immutable_pair before update or delete on public.atlas_practice_pairs for each row execute function public.lemma_trial_immutable();
create trigger immutable_enrollment before update or delete on public.atlas_practice_enrollments for each row execute function public.lemma_trial_immutable();
create trigger immutable_outcome before update or delete on public.atlas_practice_outcomes for each row execute function public.lemma_trial_immutable();
create trigger lemma_account_delete_write_guard before insert or update or delete on public.atlas_practice_enrollments
  for each row execute function public.lemma_block_account_deletion_writes();
create trigger lemma_account_delete_write_guard before insert or update or delete on public.atlas_practice_outcomes
  for each row execute function public.lemma_block_account_deletion_writes();
create trigger immutable_checkpoint before update or delete on public.atlas_practice_checkpoints for each row execute function public.lemma_trial_immutable();

create function public.lemma_trial_group(a jsonb) returns text language plpgsql immutable set search_path='' as $intake$
declare score int;
begin
  if jsonb_typeof(a) is distinct from 'array' or jsonb_array_length(a)<>12 or exists(
    select 1 from jsonb_array_elements(a) x where x not in ('0'::jsonb,'1'::jsonb)) then return null; end if;
  select sum(x::int) into score from jsonb_array_elements(a) x;
  return case when score<=4 then '0-4' when score<=7 then '5-7' else '8-12' end;
end
$intake$;
create function public.lemma_trial_certified(c jsonb,g text,day date) returns text language plpgsql immutable set search_path='' as $certificate$
declare arm text; a jsonb; b jsonb;
begin
  if c->>'version' is distinct from '1' or c->>'source' is distinct from 'randomized-pilot' or
    nullif(btrim(c->>'track'),'') is null or nullif(btrim(c->>'bank'),'') is null or
    nullif(btrim(c->>'policy'),'') is null or nullif(btrim(c->>'rubric'),'') is null or
    g is null or day is null or (c->>'validThrough')::date is null or day>(c->>'validThrough')::date then return 'atlas80';end if;
  arm:=c->'routes'->>g;
  if arm is null or arm not in ('atlas_dp80','level80','shared80','skill80','sqrt80','hard72','easy88','guided80','contrast80') then return 'atlas80'; end if;
  a:=c->'evidence'->g->arm; b:=a->'bounds';
  if a->'eligible'='true'::jsonb and (a->>'n')::int>=100 and (c->'evidence'->g->'atlas80'->>'n')::int>=100
    and (b#>>'{transfer7,lower}')::numeric>.005 and (b#>>'{abandon_rate,upper}')::numeric<=.025
    and (b#>>'{trigger_rate,upper}')::numeric<=.035 and (b#>>'{feedback_share,upper}')::numeric<=.085
    and (b#>>'{idle_share,upper}')::numeric<=.045 then return arm; end if;
  return 'atlas80';
exception when data_exception then return 'atlas80';
end
$certificate$;
revoke all on function public.lemma_trial_group(jsonb),public.lemma_trial_certified(jsonb,text,date) from public,anon,authenticated;

create function public.lemma_trial_register(p_trial uuid,p_protocol text,p_certificate jsonb,p_challenger text,p_start date)
returns void language plpgsql security definer set search_path='' as $register$
declare prior public.atlas_practice_trials; track_id text:=p_certificate->>'track';
begin
  if current_setting('role',true) is distinct from 'service_role' then raise exception 'Research service required' using errcode='42501'; end if;
  if p_trial is null or p_start is null or p_protocol is null or btrim(p_protocol)='' or p_challenger='atlas80' or
    not exists(select 1 from unnest(array['0-4','5-7','8-12']) g where public.lemma_trial_certified(p_certificate,g,p_start)=p_challenger)
    then raise exception 'A registered protocol and scoped randomized certificate are required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_trial::text,196));
  select * into prior from public.atlas_practice_trials where id=p_trial;
  if found then
    if (prior.track,prior.challenger,prior.start_day,prior.protocol,prior.certificate) is distinct from
      (track_id,p_challenger,p_start,p_protocol,p_certificate) then raise exception 'Conflicting trial registration';end if;
    return;
  end if;
  if p_start is distinct from (public.lemma_trial_clock() at time zone 'UTC')::date then
    raise exception 'Registration must start on the current UTC day';end if;
  insert into public.atlas_practice_trials values(p_trial,track_id,p_challenger,p_start,p_protocol,p_certificate);
  insert into public.atlas_practice_checkpoints values(p_trial,p_start,true,array[0.,0.,0.],'[]',false,'',array[0,0,0]);
end
$register$;
revoke all on function public.lemma_trial_register(uuid,text,jsonb,text,date) from public,anon,authenticated;
grant execute on function public.lemma_trial_register(uuid,text,jsonb,text,date) to service_role;

create function public.lemma_trial_assign(p_trial uuid,p_pair uuid,p_owners uuid[],p_anchors jsonb,p_day date)
returns text[] language plpgsql security definer set search_path='' as $assign$
declare registry public.atlas_practice_trials; state public.atlas_practice_checkpoints; prior public.atlas_practice_pairs;
  owners uuid[]; original jsonb; arms text[]:=array['atlas80','atlas80']; group_a text; group_b text;
  today int; pending int; bit smallint;
begin
  if current_setting('role',true) is distinct from 'service_role' then raise exception 'Research service required' using errcode='42501'; end if;
  if p_pair is null or p_day is null or cardinality(p_owners) is distinct from 2 or p_owners[1] is null or
    p_owners[2] is null or p_owners[1]=p_owners[2] or jsonb_array_length(p_anchors) is distinct from 2 then raise exception 'Invalid pair'; end if;
  group_a:=public.lemma_trial_group(p_anchors->0); group_b:=public.lemma_trial_group(p_anchors->1);
  select * into strict registry from public.atlas_practice_trials where id=p_trial for update;
  select * into prior from public.atlas_practice_pairs where trial=p_trial and id=p_pair;
  if found then
    select array_agg(user_id order by position),jsonb_agg(anchors order by position),array_agg(arm order by position)
      into owners,original,arms from public.atlas_practice_enrollments where trial=p_trial and pair=p_pair;
    if (prior.assigned_on,owners,original) is distinct from (p_day,p_owners,p_anchors) then raise exception 'Conflicting pair retry'; end if;
    return arms;
  end if;
  if p_day is distinct from (public.lemma_trial_clock() at time zone 'UTC')::date then
    raise exception 'New pair must use the current UTC day';end if;
  if not coalesce((select admission_enabled from public.atlas_practice_controls where singleton for share),false) then return arms;end if;
  select * into strict state from public.atlas_practice_checkpoints where trial=p_trial order by day desc limit 1;
  select count(*) filter(where assigned_on=p_day),count(*) filter(where assigned_on>state.day-21)
    into today,pending from public.atlas_practice_pairs where trial=p_trial;
  if state.stop<>'' or state.day<>p_day or p_day-registry.start_day>=224 or group_a is null or group_a is distinct from group_b or
     public.lemma_trial_certified(registry.certificate,group_a,p_day)<>registry.challenger or
     today>=(case when state.promoted then 64 else 24 end) or pending>=(case when state.promoted then 144 else 72 end)
    then return arms;end if;
  -- A denied admission leaves both learners free for a later eligible pair. The DB chooses one random challenger.
  bit:=get_byte(uuid_send(gen_random_uuid()),0)%2; arms[bit+1]:=registry.challenger;
  insert into public.atlas_practice_pairs values(p_trial,p_pair,p_day,bit);
  insert into public.atlas_practice_enrollments values
    (p_trial,p_pair,p_owners[1],0,p_anchors->0,arms[1]),(p_trial,p_pair,p_owners[2],1,p_anchors->1,arms[2]);
  return arms;
end
$assign$;
revoke all on function public.lemma_trial_assign(uuid,uuid,uuid[],jsonb,date) from public,anon,authenticated;
grant execute on function public.lemma_trial_assign(uuid,uuid,uuid[],jsonb,date) to service_role;

create function public.lemma_trial_outcome(p_trial uuid,p_owner uuid,p_assessed date,p_reported date,p_score double precision)
returns void language plpgsql security definer set search_path='' as $grade$
declare prior public.atlas_practice_outcomes; assigned date;
begin
  if current_setting('role',true) is distinct from 'service_role' then raise exception 'Research service required' using errcode='42501'; end if;
  perform 1 from public.atlas_practice_trials where id=p_trial for update;
  select p.assigned_on into strict assigned from public.atlas_practice_enrollments e join public.atlas_practice_pairs p
    on p.trial=e.trial and p.id=e.pair where e.trial=p_trial and e.user_id=p_owner and p.challenger_index is not null;
  if p_assessed is distinct from assigned+20 or p_reported<p_assessed or p_reported is null or p_score is null or not(p_score between 0 and 1)
    then raise exception 'Invalid assessment or report date';end if;
  select * into prior from public.atlas_practice_outcomes where trial=p_trial and user_id=p_owner;
  if found then
    if (prior.assessed_on,prior.reported_on,prior.score) is distinct from (p_assessed,p_reported,p_score) then raise exception 'Conflicting immutable outcome'; end if;
    return;
  end if;
  if greatest(p_assessed,p_reported)>(public.lemma_trial_clock() at time zone 'UTC')::date then
    raise exception 'Future assessment or report date';end if;
  insert into public.atlas_practice_outcomes(trial,user_id,assessed_on,reported_on,score,known_at)
    values(p_trial,p_owner,p_assessed,p_reported,p_score,public.lemma_trial_clock());
end
$grade$;
revoke all on function public.lemma_trial_outcome(uuid,uuid,date,date,double precision) from public,anon,authenticated;
grant execute on function public.lemma_trial_outcome(uuid,uuid,date,date,double precision) to service_role;

create function public.lemma_trial_logmean(v double precision[]) returns double precision
language sql immutable set search_path='' as $logmean$
  select m + ln((exp(v[1]-m)+exp(v[2]-m)+exp(v[3]-m))/3.) from (select greatest(v[1],v[2],v[3]) as m) peak
$logmean$;
revoke all on function public.lemma_trial_logmean(double precision[]) from public,anon,authenticated;

create function public.lemma_trial_advance(p_trial uuid,p_day date,p_available boolean)
returns jsonb language plpgsql security definer set search_path='' as $advance$
declare state public.atlas_practice_checkpoints; prior public.atlas_practice_checkpoints; pair record;
  benefit double precision[]:=array[0.,0.,0.]; harm double precision[]:=array[0.,0.,0.]; wagers double precision[]:=array[.25,.50,.80];
  window_values double precision[]; windows jsonb:='[]'; old_window jsonb; low_delta double precision; high_delta double precision;
  matched int:=0; got_challenger int:=0; got_control int:=0;
begin
  if current_setting('role',true) is distinct from 'service_role' then raise exception 'Research service required' using errcode='42501'; end if;
  if p_day is null or p_available is null then raise exception 'Invalid checkpoint'; end if;
  perform 1 from public.atlas_practice_trials where id=p_trial for update;
  select * into prior from public.atlas_practice_checkpoints where trial=p_trial and day=p_day;
  if found then
    if prior.available is distinct from p_available then raise exception 'Conflicting checkpoint retry'; end if;
    return to_jsonb(prior);
  end if;
  if p_day>(public.lemma_trial_clock() at time zone 'UTC')::date then raise exception 'Future checkpoint';end if;
  select * into strict state from public.atlas_practice_checkpoints where trial=p_trial order by day desc limit 1;
  if p_day<>state.day+7 then raise exception 'Advance in registered weekly order'; end if;
  state.day:=p_day;state.available:=p_available;
  if state.stop='' and not p_available and exists(select 1 from public.atlas_practice_pairs
    where trial=p_trial and assigned_on=p_day-21 and challenger_index is not null)
    then state.stop:='monitor_unavailable';end if;
  if state.stop='' then
    for pair in
      select p.id,max(o.score) filter(where e.position=p.challenger_index) as challenger,
        max(o.score) filter(where e.position<>p.challenger_index) as control
      from public.atlas_practice_pairs p
      left join public.atlas_practice_enrollments e on e.trial=p.trial and e.pair=p.id
      left join public.atlas_practice_outcomes o on o.trial=e.trial and o.user_id=e.user_id and o.reported_on<=p_day
        and (o.known_at at time zone 'UTC')::date<=p_day
      where p.trial=p_trial and p.assigned_on=p_day-21 and p.challenger_index is not null
      group by p.id order by p.id
    loop
      matched:=matched+1;
      if pair.challenger is not null then got_challenger:=got_challenger+1;end if;
      if pair.control is not null then got_control:=got_control+1;end if;
      low_delta:=coalesce(pair.challenger,0)-coalesce(pair.control,1);
      high_delta:=coalesce(pair.challenger,1)-coalesce(pair.control,0);
      for i in 1..3 loop
        benefit[i]:=benefit[i]+ln(1+wagers[i]*(low_delta-.005));
        harm[i]:=harm[i]+ln(1-wagers[i]*(high_delta+.005));
      end loop;
    end loop;
    if matched>0 then
      for i in 1..3 loop state.benefit[i]:=state.benefit[i]+benefit[i];end loop;
      for old_window in select x from jsonb_array_elements(state.harm||'[[0,0,0]]'::jsonb) x loop
        window_values:=array[(old_window->>0)::float8+harm[1],(old_window->>1)::float8+harm[2],(old_window->>2)::float8+harm[3]];
        if public.lemma_trial_logmean(window_values)>=ln(1280.) then state.stop:='harm';end if;
        windows:=windows||jsonb_build_array(to_jsonb(window_values));
      end loop;
      if jsonb_array_length(windows)>32 then raise exception 'Registered horizon exceeded';end if;
      state.harm:=windows;
      if state.stop='' and 100*least(got_challenger,got_control)<95*matched then state.stop:='coverage';end if;
      state.promoted:=state.promoted or(state.stop='' and public.lemma_trial_logmean(state.benefit)>=ln(40.));
      state.grades:=array[state.grades[1]+matched,state.grades[2]+got_challenger,state.grades[3]+got_control];
    end if;
  end if;
  insert into public.atlas_practice_checkpoints select state.*;
  return to_jsonb(state);
end
$advance$;
revoke all on function public.lemma_trial_advance(uuid,date,boolean) from public,anon,authenticated;
grant execute on function public.lemma_trial_advance(uuid,date,boolean) to service_role;

-- Read access derives from an authenticated application caller. RPC is for the verified Edge service only.
create function public.lemma_trial_arm(p_owner uuid,p_track text,p_policy text,p_bank text,p_rubric text,p_anchors jsonb,p_at timestamptz)
returns text language plpgsql stable security definer set search_path='' as $serve$
declare r record; d date:=(p_at at time zone 'UTC')::date; g text;
begin
  if current_setting('role',true) is distinct from 'service_role' then raise exception 'Verified owner required' using errcode='42501';end if;
  if p_at>public.lemma_trial_clock() or p_at is null or not coalesce((select challenger_enabled
    from public.atlas_practice_controls where singleton),false) then return 'atlas80'; end if;
  g:=public.lemma_trial_group(p_anchors);
  select e.arm,e.anchors,p.assigned_on,t.certificate,a.day,a.stop into r
    from public.atlas_practice_trials t join public.atlas_practice_enrollments e on e.trial=t.id and e.user_id=p_owner
    join public.atlas_practice_pairs p on p.id=e.pair and p.trial=t.id and p.challenger_index is not null
    join lateral(select day,stop from public.atlas_practice_checkpoints where trial=t.id and day<=d order by day desc limit 1) a on true
    where t.track=p_track and t.certificate->>'policy'=p_policy and t.certificate->>'bank'=p_bank and t.certificate->>'rubric'=p_rubric;
  if found and r.stop='' and d-r.day<7 and d-r.assigned_on between 0 and 13 and r.anchors=p_anchors and
    public.lemma_trial_certified(r.certificate,g,d)=r.arm then return r.arm;end if;
  return 'atlas80';
end
$serve$;
revoke all on function public.lemma_trial_arm(uuid,text,text,text,text,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.lemma_trial_arm(uuid,text,text,text,text,jsonb,timestamptz) to service_role;
