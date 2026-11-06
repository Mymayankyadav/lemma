-- N39 / D8(e): typed owner settings. Add-only; no existing records are updated.
-- Names include units: *_minutes, *_ratio, and local HH:MM fields.
create function public.lemma_v6_setting_int(p jsonb, k text, low bigint, high bigint)
returns boolean language plpgsql immutable as $$
begin
  if not p ? k then return true; end if;
  if jsonb_typeof(p->k) <> 'number' or (p->>k) !~ '^[0-9]+$' then return false; end if;
  return (p->>k)::numeric between low and high;
exception when numeric_value_out_of_range then return false;
end $$;

create function public.lemma_v6_setting_ratio(p jsonb, k text)
returns boolean language plpgsql immutable as $$
begin
  if not p ? k then return true; end if;
  if jsonb_typeof(p->k) <> 'number' then return false; end if;
  return (p->>k)::numeric > 0 and (p->>k)::numeric <= 1;
exception when numeric_value_out_of_range then return false;
end $$;

create function public.lemma_v6_setting_bool(p jsonb, k text)
returns boolean language sql immutable as $$
  select not (p ? k) or coalesce(jsonb_typeof(p->k) = 'boolean',false)
$$;

create function public.lemma_v6_setting_time(p jsonb, k text)
returns boolean language sql immutable as $$
  select not (p ? k) or coalesce(
    jsonb_typeof(p->k)='string' and
    (p->>k) ~ '^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$',false)
$$;

-- Unknown future keys are intentionally accepted; known keys are strictly
-- typed and bounded here, including explicit units and enum values.
create function public.lemma_v6_settings_valid(section text, value jsonb)
returns boolean language plpgsql immutable as $$
begin
  if value is null or jsonb_typeof(value) <> 'object' or pg_column_size(value) > 4096 then
    return false;
  end if;
  case section
    when 'focus_defaults' then
      return (not value ? 'mode' or
        (jsonb_typeof(value->'mode')='string' and
         value->>'mode' in ('pomodoro','flowtime','open')))
        and public.lemma_v6_setting_int(value,'focus_minutes',1,240)
        and public.lemma_v6_setting_int(value,'break_minutes',1,120)
        and public.lemma_v6_setting_int(value,'long_break_minutes',1,240)
        and public.lemma_v6_setting_int(value,'cycles',1,24)
        and public.lemma_v6_setting_ratio(value,'flowtime_break_ratio')
        and public.lemma_v6_setting_int(value,'long_session_guard_minutes',30,720);
    when 'planning' then
      return public.lemma_v6_setting_time(value,'window_start')
        and public.lemma_v6_setting_time(value,'window_end')
        and public.lemma_v6_setting_int(value,'gap_minutes',0,120)
        and public.lemma_v6_setting_int(value,'max_consecutive_minutes',15,600)
        and public.lemma_v6_setting_int(value,'daily_minimum_minutes',0,600)
        and public.lemma_v6_setting_bool(value,'daily_intention');
    when 'review_budget' then
      return public.lemma_v6_setting_int(value,'cards',0,2000)
        and public.lemma_v6_setting_int(value,'minutes',0,720)
        and public.lemma_v6_setting_bool(value,'reserve_in_plans');
    when 'attention' then
      return public.lemma_v6_setting_bool(value,'drift_prompt')
        and public.lemma_v6_setting_bool(value,'urge_prompt');
    else return false;
  end case;
end $$;

-- Recursive object merge: a writer sending only one known key must not
-- silently delete unknown keys, including those nested under a future key.
create function public.lemma_v6_settings_merge(before jsonb, patch jsonb)
returns jsonb language plpgsql immutable as $$
declare
  merged jsonb := coalesce(before,'{}'::jsonb);
  item record;
begin
  if patch is null then return merged; end if;
  if jsonb_typeof(patch)<>'object' then return patch; end if;
  for item in select key,value from jsonb_each(patch) loop
    if jsonb_typeof(merged->item.key)='object' and jsonb_typeof(item.value)='object' then
      merged := jsonb_set(merged,array[item.key],
        public.lemma_v6_settings_merge(merged->item.key,item.value),true);
    else
      merged := jsonb_set(merged,array[item.key],item.value,true);
    end if;
  end loop;
  return merged;
end $$;

create function public.lemma_v6_settings_preserve_json() returns trigger
language plpgsql as $$
begin
  new.focus_defaults := public.lemma_v6_settings_merge(old.focus_defaults,new.focus_defaults);
  new.planning := public.lemma_v6_settings_merge(old.planning,new.planning);
  new.review_budget := public.lemma_v6_settings_merge(old.review_budget,new.review_budget);
  new.attention := public.lemma_v6_settings_merge(old.attention,new.attention);
  return new;
end $$;

alter table public.settings
  add column week_start int not null default 1
    constraint settings_week_start_v6_check check (week_start between 0 and 6),
  add column clock_24h boolean not null default true,
  add column focus_defaults jsonb not null default
    '{"mode":"pomodoro","focus_minutes":25,"break_minutes":5,"long_break_minutes":15,"cycles":4,"flowtime_break_ratio":0.2,"long_session_guard_minutes":120}'::jsonb
    constraint settings_focus_defaults_v6_check check (public.lemma_v6_settings_valid('focus_defaults',focus_defaults)),
  add column planning jsonb not null default
    '{"window_start":"08:00","window_end":"22:00","gap_minutes":10,"max_consecutive_minutes":120,"daily_minimum_minutes":20,"daily_intention":true}'::jsonb
    constraint settings_planning_v6_check check (public.lemma_v6_settings_valid('planning',planning)),
  add column review_budget jsonb not null default
    '{"cards":20,"minutes":20,"reserve_in_plans":true}'::jsonb
    constraint settings_review_budget_v6_check check (public.lemma_v6_settings_valid('review_budget',review_budget)),
  add column attention jsonb not null default
    '{"drift_prompt":false,"urge_prompt":false}'::jsonb
    constraint settings_attention_v6_check check (public.lemma_v6_settings_valid('attention',attention));

create trigger settings_v6_preserve_json before update on public.settings
for each row execute function public.lemma_v6_settings_preserve_json();
