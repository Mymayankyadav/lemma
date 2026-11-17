-- N169: derived caches. They are recomputed from facts and are deliberately NOT registered for undo:
-- undoing or redoing any fact recomputes them exactly. Owners can read them; only service-role code writes them.
create table public.rechecks (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  class_id uuid not null,
  level text not null constraint rechecks_level_valid check (level in ('recall','use','understand','transfer')),
  seq integer not null constraint rechecks_seq_valid check (seq>0),
  state text not null constraint rechecks_state_valid check (state in ('open','escalated','retired','superseded','expired','converted')),
  prompt text not null constraint rechecks_prompt_concrete check (char_length(prompt) between 8 and 300 and prompt !~* '^\s*Recheck\s+CP[0-9]+'),
  origin_evidence_ids text[] not null default '{}',
  origin_codes text[] not null default '{}',
  stability real not null, difficulty real not null,
  due date, last_review date not null,
  reps integer not null default 0, lapses integer not null default 0, fail_count integer not null default 0, pass_streak integer not null default 0,
  created_day date not null, closed_day date, close_reason text,
  merge_log jsonb not null default '[]'::jsonb,
  input_hash text not null,
  computed_at timestamptz not null default now(),
  primary key (user_id,class_id,level,seq)
);
create index rechecks_owner_due on public.rechecks(user_id,due) where state='open';
create table public.scheduler_runs (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  study_day date not null,
  project_id uuid not null,
  slack_ratio real not null,          -- frozen at the first computation of the study day: hysteresis reads it (I3)
  supply real not null, required real not null,
  queue jsonb, prune jsonb,
  input_hash text not null,
  computed_at timestamptz not null default now(),
  primary key (user_id,study_day,project_id)
);
do $derived$
declare t text;
begin
  foreach t in array array['rechecks','scheduler_runs'] loop
    execute pg_catalog.format('alter table public.%I enable row level security',t);
    execute pg_catalog.format('create policy %I on public.%I for select to authenticated using (user_id=(select auth.uid()))',t||'_owner_select',t);
    execute pg_catalog.format('revoke insert,update,delete,truncate on public.%I from anon,authenticated',t);
    execute pg_catalog.format('grant select on public.%I to authenticated,service_role',t);
  end loop;
end
$derived$;
