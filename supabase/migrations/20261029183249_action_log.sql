-- DB-2: reversible action journal. Undo and archive visibility are still being implemented.
alter table public.settings add column master_prompt text check (char_length(master_prompt) <= 2000);
alter table public.projects add column prompt text check (char_length(prompt) <= 1000);
alter table public.projects drop constraint projects_status_check;
alter table public.projects add constraint projects_status_check check (status in ('planning','active','paused','done','archived'));

create table public.actions (
  no bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id),
  txid bigint not null unique,
  source text not null default 'app' check (source in ('app','claude','chatgpt','other','system')),
  tool text,
  summary text check (char_length(summary) <= 200),
  undoes bigint references public.actions(no),
  undone_by bigint references public.actions(no),
  created_at timestamptz not null default now()
);
create table public.action_changes (
  id bigint generated always as identity primary key,
  action_no bigint not null references public.actions(no),
  seq integer not null,
  table_name text not null,
  row_pk jsonb not null,
  op text not null check (op in ('insert','update','delete')),
  old jsonb,
  new jsonb,
  unique(action_no, seq)
);
create index action_changes_row_idx on public.action_changes using btree (table_name, row_pk);
create index actions_user_idx on public.actions(user_id, no desc);
alter table public.actions enable row level security;
alter table public.action_changes enable row level security;
revoke all on public.actions, public.action_changes from public, anon, authenticated;
grant select on public.actions, public.action_changes to authenticated;
grant select on public.actions, public.action_changes to service_role;
create policy owner_all on public.actions for select to authenticated using (user_id = (select auth.uid()));
create policy owner_all on public.action_changes for select to authenticated using (
  exists (select 1 from public.actions a where a.no = action_no and a.user_id = (select auth.uid()))
);

-- This function is only reached by table triggers, not callable as an RPC.
create function public.log_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  before_row jsonb; after_row jsonb; current_row jsonb; pk jsonb;
  owner_id uuid; action_id bigint; action_owner uuid; action_source text;
begin
  if tg_op <> 'INSERT' then before_row := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then after_row := to_jsonb(new); end if;
  if tg_op = 'UPDATE' and (before_row - 'updated_at' - 'last_activity_at') = (after_row - 'updated_at' - 'last_activity_at') then
    return new;
  end if;
  current_row := coalesce(after_row, before_row);
  owner_id := (current_row ->> 'user_id')::uuid;
  select jsonb_object_agg(a.attname, current_row -> a.attname) into pk
    from pg_catalog.pg_index i
    join pg_catalog.pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
    where i.indrelid = tg_relid and i.indisprimary;
  if pk is null then raise exception 'No primary key on %.%', tg_table_schema, tg_table_name; end if;
  action_source := coalesce(nullif(current_setting('lemma.source', true), ''), 'app');
  insert into public.actions(user_id,txid,source,tool,summary)
    values(owner_id,txid_current(),action_source,nullif(current_setting('lemma.tool', true),''),left(nullif(current_setting('lemma.summary', true),''),200))
    on conflict (txid) do nothing;
  select no,user_id into action_id,action_owner from public.actions where txid=txid_current() for update;
  if action_owner is distinct from owner_id then raise exception 'An action cannot modify multiple owners'; end if;
  insert into public.action_changes(action_no,seq,table_name,row_pk,op,old,new)
    select action_id,coalesce(max(seq),0)+1,tg_table_name,pk,lower(tg_op),before_row,after_row
    from public.action_changes where action_no=action_id;
  return coalesce(new,old);
end $$;
revoke all on function public.log_change() from public, anon, authenticated, service_role;

do $$
declare t text; c record;
begin
  foreach t in array array['settings','subjects','projects','sources','source_pages','concepts','concept_links','checkpoints','checkpoint_prereqs','checkpoint_concepts','styles','sessions','session_events','misconceptions','notes','cards','reviews','card_comments','proposals'] loop
    execute format('create trigger lemma_log_change after insert or update or delete on public.%I for each row execute function public.log_change()',t);
  end loop;
  for c in select conrelid::regclass as table_name, conname from pg_catalog.pg_constraint
    where contype='f' and connamespace='public'::regnamespace and not condeferrable
  loop
    execute format('alter table %s alter constraint %I deferrable initially immediate',c.table_name,c.conname);
  end loop;
end $$;
