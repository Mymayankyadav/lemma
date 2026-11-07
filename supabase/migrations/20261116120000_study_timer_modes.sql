-- N52: durable timer metadata and immutable configuration capture at first start.
-- This first commit stages the new fields and start-time snapshot; the complete
-- command lifecycle/lease/exclusion paths are required before this PR is Ready.
alter table public.study_entries
 add column mode text not null default 'open'
  constraint study_entries_timer_mode_check check(mode in ('pomodoro','flowtime','open')),
 add column preset_id uuid,
 add column config jsonb not null default '{}'::jsonb
  constraint study_entries_timer_config_check check(jsonb_typeof(config)='object'),
 add column phase text not null default 'focus'
  constraint study_entries_timer_phase_check check(phase in ('focus','break','long_break')),
 add column cycle integer not null default 1
  constraint study_entries_timer_cycle_check check(cycle between 1 and 100000),
 add column phase_ends_at timestamptz,
 add column energy text constraint study_entries_timer_energy_check
  check(energy is null or energy in ('low','steady','high')),
 add column lease_device text constraint study_entries_timer_device_check
  check(lease_device is null or length(btrim(lease_device)) between 1 and 120),
 add column lease_version integer not null default 0
  constraint study_entries_timer_lease_version_check check(lease_version>=0),
 add column lease_expires_at timestamptz,
 add column excluded_intervals jsonb not null default '[]'::jsonb
  constraint study_entries_timer_exclusions_check check(jsonb_typeof(excluded_intervals)='array'),
 add constraint study_entries_timer_lease_pair_check
  check((lease_device is null)=(lease_expires_at is null)),
 add constraint study_entries_timer_preset_owner_fk
  foreign key(user_id,preset_id) references public.presets(user_id,id)
  deferrable initially immediate;

create index study_entries_owner_preset on public.study_entries(user_id,preset_id)
 where preset_id is not null;

-- A timer is configured when it *starts*, not when its draft is created.
-- Saving settings or editing a preset later cannot rewrite this snapshot.
-- No authenticated table write policy, receipt or lifecycle operation changes.
create function public.lemma_study_timer_capture() returns trigger
language plpgsql security invoker set search_path='' as $capture$
declare
 v_defaults jsonb;
 v_preset public.presets%rowtype;
 v_focus integer; v_mode text;
begin
 if old.status<>'draft' or new.status<>'running' then return new; end if;
 select s.focus_defaults into v_defaults from public.settings s
   where s.user_id=new.user_id for share;
 -- Legacy N11 test fixtures may predate their settings row. Preserve
 -- pre-N52 start behavior with the same safe bounded defaults.
 if v_defaults is null then
   v_defaults:='{"mode":"pomodoro","focus_minutes":25,"break_minutes":5,"long_break_minutes":15,"cycles":4,"flowtime_break_ratio":0.2}'::jsonb;
 end if;
 if new.preset_id is not null then
   select * into v_preset from public.presets
     where user_id=new.user_id and id=new.preset_id and archived_at is null
     for share;
   if not found then raise exception 'Selected activity preset unavailable for owner'; end if;
   v_mode:=v_preset.mode;
   v_focus:=v_preset.focus_minutes;
   new.config:=pg_catalog.jsonb_build_object(
     'mode',v_preset.mode,'focus_minutes',v_preset.focus_minutes,
     'break_minutes',v_preset.break_minutes,
     'long_break_minutes',v_preset.long_break_minutes,
     'cycles',v_preset.cycles,
     'flowtime_break_ratio',coalesce((v_defaults->>'flowtime_break_ratio')::numeric,0.2));
 else
   v_mode:=coalesce(v_defaults->>'mode','open');
   v_focus:=coalesce((v_defaults->>'focus_minutes')::integer,25);
   new.config:=v_defaults;
 end if;
 new.mode:=v_mode;
 new.phase:='focus';
 new.cycle:=1;
 new.phase_ends_at:=case when v_mode='pomodoro'
   then pg_catalog.clock_timestamp()+pg_catalog.make_interval(mins=>v_focus)
   else null end;
 return new;
end
$capture$;
revoke all on function public.lemma_study_timer_capture() from public,anon;
create trigger study_entries_timer_capture before update on public.study_entries
 for each row execute function public.lemma_study_timer_capture();
