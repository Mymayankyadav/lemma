-- N39 / D8(e): typed owner planning/focus preferences. Existing rows receive
-- fast defaults; no legacy row is UPDATEd and no old writer needs a new field.
-- JSON sections deliberately accept unknown keys for forward compatibility.
create function public.v6_settings_section_valid(section text, payload jsonb)
returns boolean language plpgsql immutable as $validation$
declare
  field text;
  val jsonb;
  n numeric;
  content text;
begin
  if jsonb_typeof(payload) <> 'object' then return false; end if;
  if section not in ('focus_defaults','planning','review_budget','attention') then return false; end if;
  for field, val in select key, value from jsonb_each(payload) loop
    if section = 'focus_defaults' and field = 'mode' then
      if jsonb_typeof(val) <> 'string' or val #>> '{}' not in ('pomodoro','flowtime','open') then return false; end if;
    elsif section = 'planning' and field in ('window_start','window_end') then
      content := val #>> '{}';
      if jsonb_typeof(val) <> 'string' or content !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then return false; end if;
    elsif (section = 'planning' and field = 'daily_intention_enabled')
       or (section = 'review_budget' and field = 'reserve_review_time')
       or (section = 'attention' and field in ('drift_prompts','urge_prompts')) then
      if jsonb_typeof(val) <> 'boolean' then return false; end if;
    elsif (section = 'focus_defaults' and field in
        ('focus_minutes','break_minutes','long_break_minutes','cycles','flowtime_break_ratio','long_session_guard_minutes'))
       or (section = 'planning' and field in
        ('gap_minutes','max_consecutive_minutes','daily_minimum_qualifying_minutes'))
       or (section = 'review_budget' and field in ('cards','minutes')) then
      if jsonb_typeof(val) <> 'number' then return false; end if;
      content := val::text;
      if field <> 'flowtime_break_ratio' and content !~ '^[0-9]+$' then return false; end if;
      n := content::numeric;
      if (field = 'focus_minutes' and n not between 1 and 240)
         or (field = 'break_minutes' and n not between 1 and 120)
         or (field = 'long_break_minutes' and n not between 1 and 180)
         or (field = 'cycles' and n not between 1 and 16)
         or (field = 'flowtime_break_ratio' and n not between 0.05 and 1)
         or (field = 'long_session_guard_minutes' and n not between 30 and 1440)
         or (field = 'gap_minutes' and n not between 0 and 120)
         or (field = 'max_consecutive_minutes' and n not between 15 and 720)
         or (field = 'daily_minimum_qualifying_minutes' and n not between 0 and 1440)
         or (field = 'cards' and n not between 0 and 2000)
         or (field = 'minutes' and n not between 0 and 1440)
      then return false; end if;
    end if;
    -- Unknown fields (including nested future sections) remain valid.
  end loop;
  return true;
exception when others then return false;
end;
$validation$;

alter table public.settings
  add column week_start integer not null default 1
    constraint settings_week_start_valid check (week_start between 0 and 6),
  add column clock_24h boolean not null default true,
  add column focus_defaults jsonb not null default
    '{"mode":"pomodoro","focus_minutes":25,"break_minutes":5,"long_break_minutes":15,"cycles":4,"flowtime_break_ratio":0.2,"long_session_guard_minutes":120}'::jsonb
    constraint settings_focus_defaults_valid check (public.v6_settings_section_valid('focus_defaults',focus_defaults)),
  add column planning jsonb not null default
    '{"window_start":"09:00","window_end":"22:00","gap_minutes":10,"max_consecutive_minutes":180,"daily_minimum_qualifying_minutes":10,"daily_intention_enabled":false}'::jsonb
    constraint settings_planning_valid check (public.v6_settings_section_valid('planning',planning)),
  add column review_budget jsonb not null default
    '{"cards":30,"minutes":20,"reserve_review_time":true}'::jsonb
    constraint settings_review_budget_valid check (public.v6_settings_section_valid('review_budget',review_budget)),
  add column attention jsonb not null default
    '{"drift_prompts":false,"urge_prompts":false}'::jsonb
    constraint settings_attention_valid check (public.v6_settings_section_valid('attention',attention));

-- Merge each updated JSON section on the server so a partial preference write
-- cannot discard future/unknown keys read by older clients. Scalar settings
-- and existing settings writers are otherwise untouched.
create function public.v6_settings_preserve_json_keys()
returns trigger language plpgsql as $merge$
begin
  if new.focus_defaults is distinct from old.focus_defaults and new.focus_defaults is not null then
    new.focus_defaults := old.focus_defaults || new.focus_defaults;
  end if;
  if new.planning is distinct from old.planning and new.planning is not null then
    new.planning := old.planning || new.planning;
  end if;
  if new.review_budget is distinct from old.review_budget and new.review_budget is not null then
    new.review_budget := old.review_budget || new.review_budget;
  end if;
  if new.attention is distinct from old.attention and new.attention is not null then
    new.attention := old.attention || new.attention;
  end if;
  return new;
end;
$merge$;

create trigger settings_v6_preserve_json_keys
before update on public.settings for each row
execute function public.v6_settings_preserve_json_keys();
