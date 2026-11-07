-- N52 (in progress): additive timer-mode storage and immutable configuration capture.
-- New command operations and device-lease enforcement will be added here before Ready.
alter table public.study_entries
 add column mode text not null default 'open'
   constraint study_entries_mode_v3_check check (mode in ('pomodoro','flowtime','open')),
 add column preset_id uuid,
 add column config jsonb not null default '{}'::jsonb
   constraint study_entries_config_v3_check
     check (public.lemma_v6_settings_valid('focus_defaults',config)),
 add column phase text not null default 'focus'
   constraint study_entries_phase_v3_check check (phase in ('focus','break','long_break')),
 add column cycle integer not null default 1
   constraint study_entries_cycle_v3_check check (cycle between 1 and 24),
 add column phase_ends_at timestamptz,
 add column energy text constraint study_entries_energy_v3_check
   check (energy is null or energy in ('low','steady','high')),
 add column lease_device text constraint study_entries_lease_device_v3_check
   check (lease_device is null or pg_catalog.length(lease_device) between 1 and 120),
 add column lease_version integer not null default 1
   constraint study_entries_lease_version_v3_check check (lease_version>0),
 add column lease_expires_at timestamptz,
 add constraint study_entries_lease_pair_v3_check
   check ((lease_device is null)=(lease_expires_at is null)),
 add constraint study_entries_preset_owner_v3_fk
   foreign key(user_id,preset_id) references public.presets(user_id,id)
   deferrable initially immediate;
create index study_entries_owner_lease_v3
 on public.study_entries(user_id,lease_expires_at)
 where lease_device is not null;

-- Capture exactly once at the draft -> running boundary, regardless of
-- subsequent preset edits or settings updates. The earlier study_command
-- lifecycle still executes normally; this trigger adds no extra writes.
create function public.lemma_study_capture_timer_config()
returns trigger language plpgsql security invoker set search_path='' as $capture$
declare
 v_preset public.presets%rowtype;
 v_defaults jsonb;
 v_focus integer;
begin
 if old.status is distinct from 'draft' or new.status is distinct from 'running' then
  return new;
 end if;
 if new.preset_id is not null then
  select * into v_preset from public.presets p
    where p.user_id=new.user_id and p.id=new.preset_id and p.archived_at is null
    for share;
  if not found then raise exception 'Active owner preset not found'; end if;
  v_defaults:=pg_catalog.jsonb_build_object(
   'mode',v_preset.mode,
   'focus_minutes',v_preset.focus_minutes,
   'break_minutes',v_preset.break_minutes,
   'long_break_minutes',v_preset.long_break_minutes,
   'cycles',v_preset.cycles,
   'flowtime_break_ratio',0.2);
 else
  select s.focus_defaults into v_defaults from public.settings s
    where s.user_id=new.user_id for share;
  if not found then raise exception 'Owner focus defaults not found'; end if;
 end if;
 if not public.lemma_v6_settings_valid('focus_defaults',v_defaults) then
  raise exception 'Invalid focus configuration'; end if;
 new.config:=v_defaults;
 new.mode:=coalesce(v_defaults->>'mode','open');
 new.phase:='focus';
 new.cycle:=1;
 v_focus:=coalesce((v_defaults->>'focus_minutes')::integer,25);
 new.phase_ends_at:=case when new.mode='pomodoro'
   then pg_catalog.clock_timestamp()+pg_catalog.make_interval(mins=>v_focus)
   else null end;
 return new;
end
$capture$;
revoke all on function public.lemma_study_capture_timer_config()
 from public,anon;
create trigger study_entries_capture_timer_v3 before update
 on public.study_entries for each row execute function public.lemma_study_capture_timer_config();
