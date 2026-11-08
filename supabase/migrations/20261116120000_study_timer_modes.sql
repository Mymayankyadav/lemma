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

-- N52 timer writes. Old study_command operations are retained byte-for-byte
-- except the new dispatch branch, receipt-collision guard and lease check.
-- No new table grants or owner-changing fields are accepted from a caller.
create function public.lemma_study_timer_command(
  p jsonb, p_owner uuid, p_operation_id uuid
) returns jsonb language plpgsql security invoker set search_path='' as $timer$
declare
 v_op text:=p->>'operation';
 v_patch jsonb:=coalesce(p->'patch','{}'::jsonb);
 v_id uuid; v_expected integer; v_bad text;
 v_row public.study_entries%rowtype;
 v_after public.study_entries%rowtype;
 v_open public.study_intervals%rowtype;
 v_now timestamptz:=pg_catalog.clock_timestamp();
 v_device text; v_minutes integer; v_lease_version integer;
 v_new_phase text; v_duration integer; v_ratio numeric;
 v_remaining numeric; v_piece numeric; v_start timestamptz;
 v_focus_cutoff timestamptz; v_previous_exclusion_end timestamptz;
 v_focus tstzmultirange; v_removed tstzmultirange;
 v_slice record; v_reason text; v_segments jsonb:='[]'::jsonb;
 v_action bigint; v_receipt jsonb; v_stored jsonb;
begin
 if p_owner is null or (select auth.uid()) is distinct from p_owner or
    p_operation_id is null or (p->>'operationId')::uuid is distinct from p_operation_id
    or p->>'resource' is distinct from 'study_entries'
    or v_op not in ('take_lease','next_phase','exclude_minutes') or
    pg_catalog.jsonb_typeof(p->'schemaVersion') is distinct from 'number'
    or p->>'schemaVersion' is distinct from '1' then
    raise exception 'Invalid owner-bound timer command envelope';
 end if;
 if pg_catalog.jsonb_typeof(coalesce(p->'target','{}'::jsonb)) is distinct from 'object'
    or pg_catalog.jsonb_typeof(v_patch) is distinct from 'object'
    or pg_catalog.jsonb_typeof(p->'target'->'id') is distinct from 'string' then
    raise exception 'Timer command needs a target ID and object patch';
 end if;
 select key into v_bad from pg_catalog.jsonb_object_keys(p) as keys(key)
   where key<>all(array['operationId','schemaVersion','resource',
      'operation','target','expectedVersion','patch','device','leaseVersion']) limit 1;
 if v_bad is not null then raise exception 'Unknown timer command field: %',v_bad; end if;
 select key into v_bad from pg_catalog.jsonb_object_keys(p->'target') as keys(key)
   where key<>'id' limit 1;
 if v_bad is not null then raise exception 'Unknown target field: %',v_bad; end if;
 select key into v_bad from pg_catalog.jsonb_object_keys(v_patch) as keys(key)
   where key<>all(case v_op
      when 'take_lease' then array['device','lease_minutes']
      when 'next_phase' then array['device','lease_version','energy']
      else array['device','lease_version','minutes','reason'] end) limit 1;
 if v_bad is not null then raise exception 'Unknown timer patch field: %',v_bad; end if;
 if pg_catalog.jsonb_typeof(p->'expectedVersion') is distinct from 'number'
    or p->>'expectedVersion' !~ '^[1-9][0-9]*$'
    or (p->>'expectedVersion')::numeric>2147483647 then
    raise exception 'Timer expectedVersion must be positive int32';
 end if;
 v_id:=(p->'target'->>'id')::uuid;
 v_expected:=(p->>'expectedVersion')::integer;
 -- The outer study_command has already acquired the owner/operationId
 -- advisory lock; a direct helper call must serialize identically too.
 perform pg_catalog.pg_advisory_xact_lock(
   pg_catalog.hashtextextended(p_owner::text||':'||p_operation_id::text,0));
 select r.result into v_stored from public.command_receipts r
   where r.user_id=p_owner and r.operation_id=p_operation_id;
 if found then
   if v_stored->'_request'=p then return v_stored-'_request'; end if;
   return pg_catalog.jsonb_build_object('operationId',p_operation_id,
     'status','conflict','changed','[]'::jsonb,'actionNo',null,
     'conflict',pg_catalog.jsonb_build_object('reason',
       'operationId reused with a different payload'));
 end if;
 select * into v_row from public.study_entries e
   where e.id=v_id and e.user_id=p_owner for update;
 if not found then raise exception 'Study timer entry not found for owner'; end if;
 if v_row.version is distinct from v_expected then
   v_receipt:=pg_catalog.jsonb_build_object(
     'operationId',p_operation_id,'status','conflict',
     'changed','[]'::jsonb,'actionNo',null,
     'current',pg_catalog.to_jsonb(v_row),
     'conflict',pg_catalog.jsonb_build_object('expectedVersion',
       v_expected,'currentVersion',v_row.version));
 else
   -- Only the server/connector can select privileged journal provenance.
   perform pg_catalog.set_config('lemma.source',
     case when pg_catalog.current_setting('role',true)='service_role'
       and pg_catalog.current_setting('lemma.source',true) in
          ('chatgpt','claude','other','system')
       then pg_catalog.current_setting('lemma.source',true)
       when pg_catalog.current_setting('role',true)='service_role' then 'other'
       else 'app' end,true);
   perform pg_catalog.set_config('lemma.tool','study',true);
   perform pg_catalog.set_config('lemma.summary',
     pg_catalog.left('Study timer '||v_op,200),true);
   if v_op='take_lease' then
     if v_row.status not in ('draft','running','paused') then
       raise exception 'Terminal entries cannot acquire a timer lease'; end if;
     if pg_catalog.jsonb_typeof(v_patch->'device') is distinct from 'string'
       or pg_catalog.length(pg_catalog.btrim(v_patch->>'device')) not between 1 and 120
       then raise exception 'Timer device token required'; end if;
     if v_patch?'lease_minutes' and
       (pg_catalog.jsonb_typeof(v_patch->'lease_minutes') is distinct from 'number'
        or v_patch->>'lease_minutes' !~ '^[1-9][0-9]*$'
        or (v_patch->>'lease_minutes')::numeric>30) then
       raise exception 'Timer lease minutes must be 1–30'; end if;
     v_device:=v_patch->>'device';
     v_minutes:=coalesce((v_patch->>'lease_minutes')::integer,2);
     -- An explicit take_lease can take over a live lease; it advances both
     -- generations so an older device cannot accidentally mutate thereafter.
     update public.study_entries set
       lease_device=v_device,lease_version=lease_version+1,
       lease_expires_at=v_now+pg_catalog.make_interval(mins=>v_minutes),
       updated_at=v_now,version=version+1
       where id=v_id and user_id=p_owner returning * into v_after;
   else
     if v_op='next_phase' and v_row.status not in ('running','paused') then
       raise exception 'Phase transition requires an active timer'; end if;
     if v_op='exclude_minutes' and v_row.status not in
          ('running','paused','saved') then
       raise exception 'Only active or saved focus can be excluded'; end if;
     if (v_row.lease_device is not null
       and v_row.lease_expires_at>v_now
       and v_row.status in ('running','paused')) or v_op='next_phase' then
       -- A phase change always needs a current lease. Exclusion of already
       -- saved history does not, but active sessions respect the device.
       if pg_catalog.jsonb_typeof(v_patch->'device') is distinct from 'string'
          or v_patch->>'device' is distinct from v_row.lease_device
          or pg_catalog.jsonb_typeof(v_patch->'lease_version') is distinct from 'number'
          or v_patch->>'lease_version' !~ '^[1-9][0-9]*$'
          or (v_patch->>'lease_version')::numeric>2147483647 then
         return pg_catalog.jsonb_build_object('operationId',p_operation_id,
           'status','conflict','changed','[]'::jsonb,'actionNo',null,
           'conflict',pg_catalog.jsonb_build_object('reason',
            'active timer lease required'));
       end if;
       if v_row.lease_expires_at is null or v_row.lease_expires_at<=v_now or
         (v_patch->>'lease_version')::integer<>v_row.lease_version then
         return pg_catalog.jsonb_build_object('operationId',p_operation_id,
           'status','conflict','changed','[]'::jsonb,'actionNo',null,
           'conflict',pg_catalog.jsonb_build_object('reason',
             'timer lease expired or generation changed'));
       end if;
     end if;
     if v_op='next_phase' then
       if v_patch?'energy' and
         (v_patch->'energy'<>'null'::jsonb and
          (pg_catalog.jsonb_typeof(v_patch->'energy') is distinct from 'string'
           or v_patch->>'energy' not in ('low','steady','high'))) then
         raise exception 'Invalid timer energy'; end if;
       -- Every transition closes the sole open interval and atomically
       -- opens its successor. No independent unjournalled interval mutation.
       select * into v_open from public.study_intervals i
         where i.entry_id=v_id and i.user_id=p_owner and i.ended_at is null
         for update;
       if not found then raise exception 'A timer phase needs one open interval'; end if;
       if v_open.started_at>=v_now then raise exception 'Timer interval start is in future'; end if;
       if v_row.phase='focus' then
         if v_open.kind<>'focus' then raise exception 'Focus phase requires focus interval'; end if;
         v_new_phase:=case when v_row.mode='pomodoro'
             and mod(v_row.cycle,coalesce((v_row.config->>'cycles')::integer,4))=0
           then 'long_break' else 'break' end;
         v_duration:=case when v_row.mode='pomodoro'
           then case when v_new_phase='long_break'
             then coalesce((v_row.config->>'long_break_minutes')::integer,15)
             else coalesce((v_row.config->>'break_minutes')::integer,5) end
           when v_row.mode='flowtime' then
             greatest(1,least(180,pg_catalog.ceil(
               pg_catalog.date_part('epoch',(v_now-v_open.started_at))/60 *
               coalesce((v_row.config->>'flowtime_break_ratio')::numeric,0.2)
             )::integer))
           else null end;
         update public.study_intervals set ended_at=v_now
           where user_id=p_owner and id=v_open.id;
         insert into public.study_intervals(entry_id,user_id,kind,started_at)
           values(v_id,p_owner,'break',v_now);
         update public.study_entries set
           phase=v_new_phase,status='paused',
           phase_ends_at=case when v_duration is not null
             then v_now+pg_catalog.make_interval(mins=>v_duration)
             else null end,
           energy=case when v_patch?'energy' then v_patch->>'energy' else energy end,
           version=version+1,updated_at=v_now
           where id=v_id and user_id=p_owner returning * into v_after;
       elsif v_row.phase in ('break','long_break') then
         if v_open.kind<>'break' then raise exception 'Break phase requires break interval'; end if;
         update public.study_intervals set ended_at=v_now
           where user_id=p_owner and id=v_open.id;
         insert into public.study_intervals(entry_id,user_id,kind,started_at)
           values(v_id,p_owner,'focus',v_now);
         update public.study_entries set
           phase='focus',status='running',cycle=cycle+1,
           phase_ends_at=case when mode='pomodoro'
             then v_now+pg_catalog.make_interval(
               mins=>coalesce((config->>'focus_minutes')::integer,25))
             else null end,
           energy=case when v_patch?'energy' then v_patch->>'energy' else energy end,
           version=version+1,updated_at=v_now
           where id=v_id and user_id=p_owner returning * into v_after;
       else raise exception 'Unknown timer phase'; end if;
     else
       -- Accurately remove the last N unexcluded minutes from focus as
       -- disjoint, reasoned absolute-time spans. Multiranges union any
       -- overlapping focus records before subtraction and subtraction
       -- protects earlier exclusions from double-counting.
       if pg_catalog.jsonb_typeof(v_patch->'minutes') is distinct from 'number'
         or v_patch->>'minutes' !~ '^[1-9][0-9]*$'
         or (v_patch->>'minutes')::numeric>1440 then
         raise exception 'Excluded minutes must be 1–1440'; end if;
       if pg_catalog.jsonb_typeof(v_patch->'reason') is distinct from 'string'
         or pg_catalog.length(pg_catalog.btrim(v_patch->>'reason')) not between 1 and 200
         then raise exception 'Exclusion reason required'; end if;
       v_remaining:=(v_patch->>'minutes')::numeric*60;
       v_reason:=pg_catalog.btrim(v_patch->>'reason');
       -- Integer-minute deductions must not consume a tiny new tail that
       -- accrued between two commands while the same focus interval runs.
       -- Otherwise back-to-back exclusions fragment into millisecond spans.
       -- Count new focus after a complete minute has accrued, while keeping
       -- completed intervals at their exact timestamps.
       v_focus_cutoff:=v_now;
       if v_row.status='running' then
         select max((e.value->>'to')::timestamptz)
           into v_previous_exclusion_end
           from pg_catalog.jsonb_array_elements(
             v_row.excluded_intervals) as e(value);
         if v_previous_exclusion_end is not null
           and v_previous_exclusion_end<=v_now
           and v_previous_exclusion_end>v_now-interval '1 minute' then
           v_focus_cutoff:=v_previous_exclusion_end;
         end if;
       end if;
       select coalesce(pg_catalog.range_agg(
           pg_catalog.tstzrange(i.started_at,
             least(coalesce(i.ended_at,v_focus_cutoff),v_focus_cutoff),'[)')),
          '{}'::tstzmultirange)
         into v_focus from public.study_intervals i
         where i.entry_id=v_id and i.user_id=p_owner and i.kind='focus'
           and i.started_at<v_focus_cutoff
           and (i.ended_at is null or i.ended_at>i.started_at);
       select coalesce(pg_catalog.range_agg(
            pg_catalog.tstzrange((e.value->>'from')::timestamptz,
              (e.value->>'to')::timestamptz,'[)')),
          '{}'::tstzmultirange)
         into v_removed from pg_catalog.jsonb_array_elements(
           v_row.excluded_intervals) as e(value);
       for v_slice in
         select pg_catalog.lower(segment.span) as starts_at,
                pg_catalog.upper(segment.span) as ends_at
           from pg_catalog.unnest(v_focus-v_removed) as segment(span)
           order by ends_at desc,starts_at desc
       loop
         exit when v_remaining<=0;
         v_piece:=least(v_remaining,
             pg_catalog.date_part('epoch',(v_slice.ends_at-v_slice.starts_at)));
         if v_piece<=0 then continue; end if;
         v_start:=v_slice.ends_at-v_piece*interval '1 second';
         v_segments:=v_segments||pg_catalog.jsonb_build_array(
           pg_catalog.jsonb_build_object(
             'from',v_start,'to',v_slice.ends_at,'reason',v_reason));
         v_remaining:=v_remaining-v_piece;
       end loop;
       if v_remaining>0 then
         raise exception 'Not enough unexcluded focus minutes'; end if;
       update public.study_entries set
         excluded_intervals=excluded_intervals||v_segments,
         version=version+1,updated_at=v_now
         where id=v_id and user_id=p_owner returning * into v_after;
     end if;
   end if;
   select no into v_action from public.actions a
     where a.txid=pg_catalog.txid_current() and a.user_id=p_owner;
   if v_action is null then raise exception 'Timer mutation lacks action journal'; end if;
   v_receipt:=pg_catalog.jsonb_build_object('operationId',p_operation_id,
     'status','ok','changed',pg_catalog.jsonb_build_array(
       pg_catalog.jsonb_build_object('id',v_after.id,'version',v_after.version)),
     'actionNo',v_action,'entry',pg_catalog.to_jsonb(v_after));
 end if;
 insert into public.command_receipts(user_id,operation_id,resource,result)
   values(p_owner,p_operation_id,'study_entries',
     v_receipt||pg_catalog.jsonb_build_object('_request',p));
 return v_receipt;
end
$timer$;
revoke all on function public.lemma_study_timer_command(jsonb,uuid,uuid)
 from public,anon;
grant execute on function public.lemma_study_timer_command(jsonb,uuid,uuid)
 to authenticated,service_role;

-- Authenticated table UPDATE is already granted by N10. Protect all
-- server-managed timer fields and its immutable captured configuration even
-- with no live lease. Checking lemma.tool here would be forgeable by an owner
-- (set_config is public), so trust the current effective SQL role instead.
-- The owner-checked study_command compatibility dispatcher runs as SECURITY
-- DEFINER; its nested writes and the existing SECURITY DEFINER undo_action
-- execute with the function owner while untrusted direct DML does not.
-- N10 allows authenticated INSERT with owner RLS. A direct INSERT of a
-- running/paused entry bypasses the UPDATE-only start snapshot/lease guards.
-- Preserve draft selection (including owner-checked preset_id) and legacy
-- manual saved-entry creation, but never accept unaudited server timer state.
-- Spoofable lemma.tool/lemma.source GUCs deliberately do not affect this rule.
create function public.lemma_study_timer_insert_guard() returns trigger
language plpgsql security invoker set search_path='' as $insert_guard$
begin
 if current_user='authenticated' and (
    new.status in ('running','paused')
    or new.mode is distinct from 'open'
    or new.config is distinct from '{}'::jsonb
    or new.phase is distinct from 'focus'
    or new.cycle is distinct from 1
    or new.phase_ends_at is not null
    or new.energy is not null
    or new.excluded_intervals is distinct from '[]'::jsonb
    or new.lease_device is not null
    or new.lease_version is distinct from 0
    or new.lease_expires_at is not null
 ) then
   raise exception 'Protected timer INSERT requires an audited study command';
 end if;
 return new;
end
$insert_guard$;
revoke all on function public.lemma_study_timer_insert_guard() from public,anon;
create trigger study_entries_timer_insert_guard
 before insert on public.study_entries
 for each row execute function public.lemma_study_timer_insert_guard();

create function public.lemma_study_timer_entry_guard() returns trigger
language plpgsql security invoker set search_path='' as $entry_guard$
begin
 if current_user='authenticated'
   and (
     old.mode is distinct from new.mode
     or old.config is distinct from new.config
     or old.phase is distinct from new.phase
     or old.cycle is distinct from new.cycle
     or old.phase_ends_at is distinct from new.phase_ends_at
     or old.energy is distinct from new.energy
     or old.excluded_intervals is distinct from new.excluded_intervals
     or old.lease_device is distinct from new.lease_device
     or old.lease_version is distinct from new.lease_version
     or old.lease_expires_at is distinct from new.lease_expires_at
     or (old.preset_id is distinct from new.preset_id
       and (old.status<>'draft' or new.status<>'draft'))
     or (old.lease_device is not null
       and old.lease_expires_at>pg_catalog.clock_timestamp())
   ) then
   raise exception 'Active timer lease requires an audited study command; protected timer fields require an audited study command';
 end if;
 return new;
end
$entry_guard$;
revoke all on function public.lemma_study_timer_entry_guard() from public,anon;
create trigger study_entries_timer_lease_guard before update on public.study_entries
 for each row execute function public.lemma_study_timer_entry_guard();

-- UPDATE OF fires even when a malicious client assigns the existing value
-- (for example excluded_intervals='[]' on a new timer). Deny the attempted
-- direct write itself: a value-difference guard alone cannot catch no-ops.
-- The authenticated study_command dispatcher performs authorized updates
-- under its validated DEFINER context, as does journalled undo_action.
create function public.lemma_study_timer_metadata_write_guard() returns trigger
language plpgsql security invoker set search_path='' as $metadata_guard$
begin
 if current_user='authenticated' then
   raise exception 'Active timer lease requires an audited study command; protected timer fields require an audited study command';
 end if;
 return new;
end
$metadata_guard$;
revoke all on function public.lemma_study_timer_metadata_write_guard() from public,anon;
create trigger study_entries_timer_metadata_write_guard
 before update of mode,config,phase,cycle,phase_ends_at,energy,
  excluded_intervals,lease_device,lease_version,lease_expires_at
 on public.study_entries
 for each row execute function public.lemma_study_timer_metadata_write_guard();

create function public.lemma_study_timer_interval_guard() returns trigger
language plpgsql security invoker set search_path='' as $interval_guard$
declare v_parent public.study_entries%rowtype;
begin
 -- User-controlled GUCs (lemma.tool, lemma.source) must never waive
 -- a lease. Only the effective SQL definer of the authenticated, owner-checked
 -- study_command/undo_action path can bypass the direct-DML lease guard.
 if current_user<>'authenticated' then
   if tg_op='DELETE' then return old; else return new; end if;
 end if;
 -- A direct UPDATE cannot move a leased interval to another entry.
 if tg_op='UPDATE' and (old.entry_id is distinct from new.entry_id or
   old.user_id is distinct from new.user_id) then
   select * into v_parent from public.study_entries e
     where e.id=old.entry_id and e.user_id=old.user_id;
   if found and v_parent.lease_device is not null and
      v_parent.lease_expires_at>pg_catalog.clock_timestamp() then
     raise exception 'Active timer lease requires an audited interval command';
   end if;
 end if;
 select * into v_parent from public.study_entries e
  where e.id=case when tg_op='DELETE' then old.entry_id else new.entry_id end
    and e.user_id=case when tg_op='DELETE' then old.user_id else new.user_id end;
 if found and v_parent.lease_device is not null and
   v_parent.lease_expires_at>pg_catalog.clock_timestamp() then
   raise exception 'Active timer lease requires an audited interval command';
 end if;
 if tg_op='DELETE' then return old; else return new; end if;
end
$interval_guard$;
revoke all on function public.lemma_study_timer_interval_guard() from public,anon;
create trigger study_intervals_timer_lease_guard
 before insert or update or delete on public.study_intervals
 for each row execute function public.lemma_study_timer_interval_guard();


-- Lease check for original N11/N51 commands; a lost acknowledgement is
-- replayed by the caller *before* checking the current lease generation.
create function public.lemma_study_timer_lease_conflict(p jsonb,p_owner uuid)
returns jsonb language plpgsql security invoker set search_path='' as $lease_check$
declare
 v_resource text:=p->>'resource'; v_op text:=p->>'operation';
 v_target_id uuid; v_entry public.study_entries%rowtype;
 v_operation_id uuid:=(p->>'operationId')::uuid;
begin
 if p_owner is null or (select auth.uid()) is distinct from p_owner then
   raise exception 'Timer lease owner authorization required'; end if;
 if v_resource not in ('study_entries','study_intervals')
   or v_op in ('take_lease','next_phase','exclude_minutes') then return null; end if;
 if v_resource='study_entries' then
   if v_op='create' then return null; end if;
   v_target_id:=nullif(p->'target'->>'id','')::uuid;
 elsif v_op='create' then
   v_target_id:=nullif(p->'patch'->>'entry_id','')::uuid;
 else
   select i.entry_id into v_target_id from public.study_intervals i
     where i.id=(p->'target'->>'id')::uuid and i.user_id=p_owner;
 end if;
 if v_target_id is null then return null; end if;
 select * into v_entry from public.study_entries e
   where e.id=v_target_id and e.user_id=p_owner for update;
 if not found or v_entry.lease_device is null
   or v_entry.lease_expires_at<=pg_catalog.clock_timestamp()
   or v_entry.status not in ('draft','running','paused') then return null; end if;
 if pg_catalog.jsonb_typeof(p->'device') is distinct from 'string'
   or p->>'device' is distinct from v_entry.lease_device
   or pg_catalog.jsonb_typeof(p->'leaseVersion') is distinct from 'number'
   or p->>'leaseVersion' !~ '^[1-9][0-9]*$'
   or (p->>'leaseVersion')::numeric>2147483647 then
   return pg_catalog.jsonb_build_object('operationId',v_operation_id,
     'status','conflict','changed','[]'::jsonb,'actionNo',null,
     'conflict',pg_catalog.jsonb_build_object('reason',
       'active timer lease belongs to another device',
       'leaseVersion',v_entry.lease_version));
 end if;
 if (p->>'leaseVersion')::integer is distinct from v_entry.lease_version then
   return pg_catalog.jsonb_build_object('operationId',v_operation_id,
     'status','conflict','changed','[]'::jsonb,'actionNo',null,
     'conflict',pg_catalog.jsonb_build_object('reason','timer lease generation changed',
       'leaseVersion',v_entry.lease_version));
 end if;
 return null;
end
$lease_check$;
revoke all on function public.lemma_study_timer_lease_conflict(jsonb,uuid)
 from public,anon;
grant execute on function public.lemma_study_timer_lease_conflict(jsonb,uuid)
 to authenticated,service_role;

create function public.lemma_study_command_v2_compat(p jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $study$
declare
  v_owner uuid;
  v_operation_id uuid;
  v_resource text;
  v_operation text;
  v_patch jsonb;
  v_target jsonb;
  v_id uuid;
  v_expected integer;
  v_block public.calendar_blocks%rowtype;
  v_new public.calendar_blocks%rowtype;
  v_receipt jsonb;
  v_bad text;
  v_action_no bigint;
  v_timer_conflict jsonb;
begin
  v_owner := (select auth.uid());
  if v_owner is null then raise exception 'Authentication required'; end if;
  if p is null or pg_catalog.jsonb_typeof(p) <> 'object' then
    raise exception 'Command envelope must be an object';
  end if;
  if not (p ? 'operationId') or nullif(p ->> 'operationId', '') is null then
    raise exception 'operationId is required';
  end if;
  v_operation_id := (p ->> 'operationId')::uuid;

  -- Serialize concurrent retries by authenticated owner + operation ID.
  -- A lost acknowledgement replays the stored result before any version check.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_owner::text || ':' || v_operation_id::text, 0)
  );
  select r.result into v_receipt from public.command_receipts r
    where r.user_id = v_owner and r.operation_id = v_operation_id;
  if found then
    -- N51 receipts carry their exact request, unlike older v1 receipts.
    -- Keep the legacy replay shape untouched while detecting changed-payload
    -- operationId reuse on correction/split/void/restore/manual commands.
    if v_receipt ? '_request' then
      if v_receipt->'_request'=p then return v_receipt-'_request'; end if;
      return pg_catalog.jsonb_build_object('operationId',v_operation_id,
        'status','conflict','changed','[]'::jsonb,'actionNo',null,
        'conflict',pg_catalog.jsonb_build_object(
          'reason','operationId reused with a different payload'));
    end if;
    -- An N51 action cannot claim the operationId of an earlier v1 action.
    -- Old v1 replay itself remains byte-for-byte compatible.
    if p->>'resource'='study_entries' and p->>'operation' in
      ('create_manual','correct','split','void','restore',
       'take_lease','next_phase','exclude_minutes') then
      return pg_catalog.jsonb_build_object('operationId',v_operation_id,
        'status','conflict','changed','[]'::jsonb,'actionNo',null,
        'conflict',pg_catalog.jsonb_build_object(
          'reason','operationId already belongs to a legacy command'));
    end if;
    return v_receipt;
  end if;

  select k into v_bad from pg_catalog.jsonb_object_keys(p) as t(k)
    where k <> all(array['operationId','schemaVersion','resource',
                        'operation','target','expectedVersion','patch',
                        'device','leaseVersion'])
    limit 1;
  if v_bad is not null then raise exception 'Unknown command field: %', v_bad; end if;
  if pg_catalog.jsonb_typeof(p -> 'schemaVersion') is distinct from 'number'
      or p ->> 'schemaVersion' is distinct from '1' then
    raise exception 'schemaVersion must be 1';
  end if;
  v_resource := p ->> 'resource';
  v_operation := p ->> 'operation';
  -- N52 adds an owner/device guard for legacy writes, without changing
  -- their command grammar, journal, receipt or optimistic version behavior.
  v_timer_conflict:=public.lemma_study_timer_lease_conflict(p,v_owner);
  if v_timer_conflict is not null then return v_timer_conflict; end if;
  if v_resource in ('study_entries','study_intervals') then
    perform pg_catalog.set_config('lemma.tool','study',true);
  end if;
  if v_resource='study_entries' and v_operation in
       ('take_lease','next_phase','exclude_minutes') then
    return public.lemma_study_timer_command(p,v_owner,v_operation_id);
  end if;
  if v_resource='study_entries' and v_operation in
       ('create_manual','correct','split','void','restore') then
    -- Only new operations go to the v2 helper. All existing N11 lifecycle
    -- operations continue through their original function unchanged.
    perform pg_catalog.set_config('lemma.source',
      case when current_setting('role',true)='service_role' and
         pg_catalog.current_setting('lemma.source',true) in
          ('claude','chatgpt','other','system')
        then pg_catalog.current_setting('lemma.source',true)
        when current_setting('role',true)='service_role' then 'other'
        else 'app' end,true);
    return public.study_command_correction(p,v_owner,v_operation_id);
  end if;
  if v_resource in ('study_entries','study_intervals') then
    v_receipt := public.study_command_lifecycle(p,v_owner,v_operation_id);
    -- The N11.2 helper already persisted this receipt; attach the journal action.
    if v_receipt ->> 'status' = 'ok' then
      select a.no into v_action_no from public.actions a
        where a.txid = pg_catalog.txid_current() and a.user_id = v_owner;
      if v_action_no is null then raise exception 'Study change has no journal action'; end if;
      v_receipt := pg_catalog.jsonb_set(v_receipt, '{actionNo}', pg_catalog.to_jsonb(v_action_no));
      update public.command_receipts set result = v_receipt
        where user_id = v_owner and operation_id = v_operation_id;
    end if;
    return v_receipt;
  end if;
  if v_resource is distinct from 'calendar_blocks' then
    raise exception 'Unsupported resource: %', v_resource;
  end if;
  if v_operation not in ('create', 'update', 'delete') or v_operation is null then
    raise exception 'Unsupported operation: %', v_operation;
  end if;
  v_patch := case when v_operation = 'delete' then coalesce(p -> 'patch', '{}'::jsonb) else p -> 'patch' end;
  if pg_catalog.jsonb_typeof(v_patch) is distinct from 'object' then
    raise exception 'patch must be an object';
  end if;
  select k into v_bad from pg_catalog.jsonb_object_keys(v_patch) as t(k)
    where k <> all(case when v_operation = 'delete' then array[]::text[]
        else array['kind','title','starts_at','ends_at','time_zone',
                   'status','subject_id','project_id','checkpoint_id','session_id','task_id'] end)
    limit 1;
  if v_bad is not null then raise exception 'Unknown patch field: %', v_bad; end if;

  v_target := coalesce(p -> 'target','{}'::jsonb);
  if pg_catalog.jsonb_typeof(v_target) is distinct from 'object' then
    raise exception 'target must be an object';
  end if;
  select k into v_bad from pg_catalog.jsonb_object_keys(v_target) as t(k)
    where k <> 'id' limit 1;
  if v_bad is not null then raise exception 'Unknown target field: %', v_bad; end if;

  if v_operation = 'create' then
    if p ? 'expectedVersion' and (p ->> 'expectedVersion') is distinct from '0' then
      raise exception 'create expectedVersion must be absent or 0';
    end if;
    v_id := coalesce(nullif(v_target ->> 'id', '')::uuid, pg_catalog.gen_random_uuid());
    insert into public.calendar_blocks(
      id,user_id,kind,title,starts_at,ends_at,time_zone,status,
      subject_id,project_id,checkpoint_id,session_id,task_id
    ) values (
      v_id,v_owner,v_patch ->> 'kind',v_patch ->> 'title',
      (v_patch ->> 'starts_at')::timestamptz,(v_patch ->> 'ends_at')::timestamptz,
      v_patch ->> 'time_zone',coalesce(v_patch ->> 'status','planned'),
      (v_patch ->> 'subject_id')::uuid,(v_patch ->> 'project_id')::uuid,
      (v_patch ->> 'checkpoint_id')::uuid,(v_patch ->> 'session_id')::uuid,
      (v_patch ->> 'task_id')::uuid
    ) returning * into v_block;
  else
    if nullif(v_target ->> 'id','') is null then
      raise exception 'target.id required for update';
    end if;
    if pg_catalog.jsonb_typeof(p -> 'expectedVersion') is distinct from 'number' then
      raise exception 'expectedVersion required for update';
    end if;
    v_id := (v_target ->> 'id')::uuid;
    v_expected := (p ->> 'expectedVersion')::integer;
    select * into v_block from public.calendar_blocks
      where id = v_id and user_id = v_owner for update;
    if not found then raise exception 'Calendar block not found'; end if;
    if v_block.version is distinct from v_expected then
      v_receipt := pg_catalog.jsonb_build_object(
        'operationId',v_operation_id::text,'status','conflict',
        'changed',pg_catalog.jsonb_build_array(),'actionNo',null,
        'current',pg_catalog.to_jsonb(v_block),
        'conflict',pg_catalog.jsonb_build_object(
          'expectedVersion',v_expected,'currentVersion',v_block.version)
      );
    else
      if v_operation = 'delete' then
        delete from public.calendar_blocks where id = v_id and user_id = v_owner;
        v_block.version := v_block.version + 1;
      else
      -- The existing row supplies omitted keys; explicit null stays null.
      -- The allow-list forbids owner, ID, and version edits.
      select * into v_new from pg_catalog.jsonb_populate_record(v_block, v_patch);
      update public.calendar_blocks set
        kind = v_new.kind, title = v_new.title,
        starts_at = v_new.starts_at, ends_at = v_new.ends_at,
        time_zone = v_new.time_zone, status = v_new.status,
        subject_id = v_new.subject_id, project_id = v_new.project_id,
        checkpoint_id = v_new.checkpoint_id, session_id = v_new.session_id,
        task_id = v_new.task_id,
        version = version + 1
      where id = v_id and user_id = v_owner
      returning * into v_block;
      end if;
    end if;
  end if;

  if v_receipt is null then
    v_receipt := pg_catalog.jsonb_build_object(
      'operationId',v_operation_id::text,'status','ok',
      'changed',pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('id',v_block.id,'version',v_block.version)
      ),
      'actionNo',null
    );
  end if;
  if v_receipt ->> 'status' = 'ok' then
    select a.no into v_action_no from public.actions a
      where a.txid = pg_catalog.txid_current() and a.user_id = v_owner;
    if v_action_no is null then raise exception 'Calendar change has no journal action'; end if;
    v_receipt := pg_catalog.jsonb_set(v_receipt, '{actionNo}', pg_catalog.to_jsonb(v_action_no));
  end if;
  insert into public.command_receipts(user_id,operation_id,resource,result)
    values(v_owner,v_operation_id,v_resource,v_receipt);
  return v_receipt;
end
$study$;


-- Same public study_command signature and authenticated JWT owner checks.
-- The compatibility body uses DEFINER only so the trigger can distinguish
-- authenticated direct DML from vetted study_command/undo writes; it still
-- derives v_owner from auth.uid(), never the caller's payload.
revoke all on function public.lemma_study_command_v2_compat(jsonb) from public,anon;
grant execute on function public.lemma_study_command_v2_compat(jsonb)
 to authenticated,service_role;
create or replace function public.study_command(p jsonb) returns jsonb
language sql volatile security invoker set search_path='' as $n52_delegate$
 select public.lemma_study_command_v2_compat(p)
$n52_delegate$;
