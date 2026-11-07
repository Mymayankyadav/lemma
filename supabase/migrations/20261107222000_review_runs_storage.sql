-- N48.1 staged durable review-run storage. No authenticated writes until
-- N48.2 owns the versioned command, idempotent receipts, audit and undo.
-- Deck identifiers are stable keys (project:<slug>, cp:<slug>:<code>),
-- not necessarily UUIDs. Snapshot keys are immutable for each run.
create function public.lemma_review_deck_keys_valid(p text[])
returns boolean language sql immutable set search_path = '' as $deck$
  select p is not null and pg_catalog.cardinality(p) <= 256
    and not exists (
      select 1 from pg_catalog.unnest(p) as k
      where k is null or pg_catalog.length(pg_catalog.btrim(k)) = 0
        or pg_catalog.length(k) > 180
    )
$deck$;

create table public.review_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  filters jsonb not null default '{}'::jsonb
    check (jsonb_typeof(filters) = 'object' and octet_length(filters::text) <= 8192),
  selected_deck_ids text[] not null default '{}'::text[]
    check (public.lemma_review_deck_keys_valid(selected_deck_ids)),
  card_budget integer not null default 20 check (card_budget between 0 and 2000),
  minute_budget integer not null default 20 check (minute_budget between 0 and 1440),
  scheduler_version text not null
    check (length(btrim(scheduler_version)) between 1 and 80),
  settings_version integer not null check (settings_version > 0),
  status text not null default 'running'
    check (status in ('running','paused','exhausted','completed','abandoned')),
  position integer not null default 0 check (position >= 0),
  revealed boolean not null default false,
  started_at timestamptz not null default now(),
  paused_at timestamptz,
  ended_at timestamptz,
  version integer not null default 1 check (version > 0),
  source text not null default 'app' check (source in ('app','mcp','worker')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,id),
  constraint review_runs_pause_state check ((status='paused') = (paused_at is not null)),
  constraint review_runs_terminal_state check (
    (status in ('exhausted','completed','abandoned')) = (ended_at is not null)
  ),
  constraint review_runs_time_order check (
    (paused_at is null or paused_at >= started_at) and
    (ended_at is null or ended_at >= started_at)
  )
);
create index review_runs_owner_status_created on public.review_runs
  (user_id,status,created_at desc,id);

create table public.review_run_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  run_id uuid not null,
  position integer not null check (position >= 0),
  card_id uuid not null,
  expected_card_version integer not null check (expected_card_version > 0),
  state text not null default 'pending'
    check (state in ('pending','graded','stale')),
  review_id bigint,
  stale_reason text check (stale_reason is null or length(btrim(stale_reason)) between 1 and 200),
  version integer not null default 1 check (version > 0),
  source text not null default 'app' check (source in ('app','mcp','worker')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,id),
  unique(user_id,run_id,position),
  constraint review_run_items_state_review check (
    (state='graded') = (review_id is not null)
  ),
  constraint review_run_items_stale_reason check (
    (state='stale') = (stale_reason is not null)
  ),
  foreign key(user_id,run_id) references public.review_runs(user_id,id)
    on delete cascade deferrable initially immediate,
  foreign key(user_id,card_id) references public.cards(user_id,id)
    deferrable initially immediate,
  foreign key(review_id) references public.reviews(id)
    deferrable initially immediate
);
create index review_run_items_owner_card on public.review_run_items
  (user_id,card_id,created_at desc);

-- reviews lacks a composite unique(user_id,id) key, so guard the optional
-- review link against mixing owners or cards at the database boundary.
create function public.lemma_review_run_item_review_owner()
returns trigger language plpgsql security invoker set search_path = '' as $review$
begin
  if new.review_id is not null and not exists (
    select 1 from public.reviews r where r.id=new.review_id
      and r.user_id=new.user_id and r.card_id=new.card_id
  ) then raise exception 'Review receipt must belong to the item owner and card'; end if;
  return new;
end
$review$;
create trigger review_run_item_review_owner before insert or update
  on public.review_run_items for each row
  execute function public.lemma_review_run_item_review_owner();

alter table public.review_runs enable row level security;
alter table public.review_run_items enable row level security;
create policy review_runs_owner_read on public.review_runs for select to authenticated
  using (user_id=(select auth.uid()));
create policy review_run_items_owner_read on public.review_run_items for select to authenticated
  using (user_id=(select auth.uid()));
grant select on public.review_runs to authenticated,service_role;
grant select on public.review_run_items to authenticated,service_role;
-- No INSERT/UPDATE/DELETE RLS policy or grant: N48.2 will make writes
-- reversible, journalled and receipt-backed before exposing them.
