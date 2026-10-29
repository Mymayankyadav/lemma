-- DB-2: reversible action journal and standing prompts.
alter table public.settings add column master_prompt text check (char_length(master_prompt) <= 2000);
alter table public.projects add column prompt text check (char_length(prompt) <= 1000);
alter table public.projects drop constraint projects_status_check;
alter table public.projects add constraint projects_status_check check (status in ('planning','active','paused','done','archived'));

alter table public.sources add column plan_checked_at timestamptz;
create table public.diagnostics (
 id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(), no bigint generated always as identity unique,
 project_id uuid not null, checkpoint_id uuid, session_id uuid,
 kind text not null check(kind in ('gap','strength','material','pace')),
 topic text not null check(char_length(topic) between 1 and 120),
 evidence text not null check(char_length(evidence)<=600), severity smallint not null default 1 check(severity between 1 and 3),
 times int not null default 1 check(times>0), status text not null default 'open' check(status in ('open','confirmed','planned','resolved','dismissed')),
 proposal_id uuid, last_seen_at timestamptz not null default now(),
 foreign key(user_id,project_id) references public.projects(user_id,id) on delete cascade,
 foreign key(user_id,checkpoint_id) references public.checkpoints(user_id,id) on delete set null(checkpoint_id),
 foreign key(user_id,session_id) references public.sessions(user_id,id) on delete set null(session_id),
 foreign key(user_id,proposal_id) references public.proposals(user_id,id) on delete set null(proposal_id)
);
create unique index diagnostics_topic on public.diagnostics(project_id,kind,lower(topic));
create index diagnostics_owner on public.diagnostics(user_id);
create index diagnostics_checkpoint on public.diagnostics(user_id,checkpoint_id);
create index diagnostics_session on public.diagnostics(user_id,session_id);
create index diagnostics_proposal on public.diagnostics(user_id,proposal_id);
alter table public.diagnostics enable row level security;
revoke all on public.diagnostics from public,anon;
grant select,insert,update,delete on public.diagnostics to authenticated,service_role;
grant usage,select on sequence public.diagnostics_no_seq to authenticated,service_role;
create policy owner_all on public.diagnostics for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));

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
create index actions_undoes_idx on public.actions(undoes);
create index actions_undone_by_idx on public.actions(undone_by);
create index actions_user_idx on public.actions(user_id, no desc);
alter table public.actions enable row level security;
alter table public.action_changes enable row level security;
revoke all on public.actions, public.action_changes from public, anon, authenticated, service_role;
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
  if nullif(current_setting('lemma.summary',true),'') is null then
    update public.actions set summary = (select left(string_agg(op||' '||table_name||' '||n, ', ' order by table_name,op),200)
      from (select op,table_name,count(*) n from public.action_changes where action_no=action_id group by op,table_name) totals)
      where no=action_id;
  end if;
  return coalesce(new,old);
end $$;
revoke all on function public.log_change() from public, anon, authenticated, service_role;

do $$
declare t text; c record;
begin
  foreach t in array array['settings','subjects','projects','sources','source_pages','concepts','concept_links','checkpoints','checkpoint_prereqs','checkpoint_concepts','styles','sessions','session_events','misconceptions','notes','cards','reviews','card_comments','proposals','diagnostics'] loop
    execute format('create trigger lemma_log_change after insert or update or delete on public.%I for each row execute function public.log_change()',t);
  end loop;
  for c in select conrelid::regclass as table_name, conname from pg_catalog.pg_constraint
    where contype='f' and connamespace='public'::regnamespace and not condeferrable
  loop
    execute format('alter table %s alter constraint %I deferrable initially immediate',c.table_name,c.conname);
  end loop;
end $$;

create view public.v_history with (security_invoker=true) as
select a.*, coalesce((select jsonb_object_agg(counts.table_name, counts.n)
  from (select c.table_name, count(*) as n from public.action_changes c
        where c.action_no=a.no group by c.table_name) counts), '{}'::jsonb) as change_counts
from public.actions a order by a.no desc;
revoke all on public.v_history from public, anon;
grant select on public.v_history to authenticated, service_role;

-- Undo operates only on journalled public tables and records its own inverse.
create function public.undo_action(p_user uuid, p_no bigint, p_force boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  original public.actions%rowtype; c record; later text; inverse_no bigint;
  cols text; assignments text; extra text; changed integer; t text;
begin
  if p_user is null or (coalesce(current_setting('role',true),'') <> 'service_role'
      and auth.uid() is distinct from p_user) then
    raise exception 'Not authorized';
  end if;
  if exists(select 1 from public.actions where txid=txid_current()) then raise exception 'Undo must run in its own transaction'; end if;
  -- Block writers while checking conflicts and applying inverses. A concurrent write
  -- either completes before the check or starts after undo; failures roll back fully.
  foreach t in array array['settings','subjects','projects','sources','source_pages','concepts','concept_links','checkpoints','checkpoint_prereqs','checkpoint_concepts','styles','sessions','session_events','misconceptions','notes','cards','reviews','card_comments','proposals','diagnostics'] loop
    execute format('lock table public.%I in share row exclusive mode',t);
  end loop;
  select * into original from public.actions where no=p_no and user_id=p_user for update;
  if not found then raise exception 'A% is not yours',p_no; end if;
  if original.undone_by is not null then raise exception 'A% is already undone (by A%)',p_no,original.undone_by; end if;
  select string_agg('A'||a.no, ', ' order by a.no desc) into later
  from public.actions a where a.user_id=p_user and a.no>p_no and a.undone_by is null
    and exists (select 1 from public.action_changes x join public.action_changes y
      on x.table_name=y.table_name and x.row_pk=y.row_pk
      where x.action_no=p_no and y.action_no=a.no);
  if later is not null then raise exception 'Undo % first',later; end if;
  perform set_config('lemma.source',coalesce(nullif(current_setting('lemma.source',true),''),'app'),true);
  perform set_config('lemma.tool','undo',true);
  perform set_config('lemma.summary',left('undo A'||p_no||': '||coalesce(original.summary,''),200),true);
  set constraints all deferred;
  for c in select * from public.action_changes where action_no=p_no order by seq desc loop
    -- Reject journal entries outside the fixed trigger set.
    if c.table_name <> all(array['settings','subjects','projects','sources','source_pages','concepts','concept_links','checkpoints','checkpoint_prereqs','checkpoint_concepts','styles','sessions','session_events','misconceptions','notes','cards','reviews','card_comments','proposals','diagnostics']) then
      raise exception 'Unrecognized journal table';
    end if;
    if c.op='insert' then
      execute format('delete from public.%I t where to_jsonb(t) @> $1 and t.user_id=$2',c.table_name) using c.row_pk,p_user;
    elsif c.op='delete' then
      select string_agg(format('%I',a.attname),',' order by a.attnum) into cols
      from pg_catalog.pg_attribute a where a.attrelid=format('public.%I',c.table_name)::regclass
        and a.attnum>0 and not a.attisdropped and a.attgenerated='';
      execute format('insert into public.%I (%s) overriding system value select %s from jsonb_populate_record(null::public.%I,$1)', c.table_name,cols,cols,c.table_name) using c.old;
    else
      select string_agg(format('%1$I = r.%1$I',a.attname),',' order by a.attnum) into assignments
      from pg_catalog.pg_attribute a where a.attrelid=format('public.%I',c.table_name)::regclass
        and a.attnum>0 and not a.attisdropped and a.attgenerated='' and a.attidentity=''
        and c.old -> a.attname is distinct from c.new -> a.attname;
      if assignments is not null then
        execute format('update public.%I t set %s from jsonb_populate_record(null::public.%I,$1) r where to_jsonb(t) @> $2 and t.user_id=$3',c.table_name,assignments,c.table_name) using c.old,c.row_pk,p_user;
      end if;
    end if;
  end loop;
  select no into inverse_no from public.actions where txid=txid_current() and user_id=p_user;
  if inverse_no is null or inverse_no=p_no then raise exception 'Undo must run in its own transaction'; end if;
  select string_agg(table_name||' '||n, ', ') into extra from (
    select x.table_name,count(*) n from public.action_changes x
    where x.action_no=inverse_no and x.op='delete' and not exists (
      select 1 from public.action_changes y where y.action_no=p_no and y.table_name=x.table_name and y.row_pk=x.row_pk
    ) group by x.table_name) counts;
  if extra is not null and not p_force then raise exception 'Undo would also remove: %; undo those actions first or confirm',extra; end if;
  update public.actions set undoes=p_no where no=inverse_no;
  update public.actions set undone_by=inverse_no where no=p_no;
  if original.undoes is not null then update public.actions set undone_by=null where no=original.undoes and undone_by=p_no; end if;
  select count(*) into changed from public.action_changes where action_no=inverse_no;
  return jsonb_build_object('undone',p_no,'as',inverse_no,'changes',changed);
end $$;
revoke all on function public.undo_action(uuid,bigint,boolean) from public, anon, authenticated, service_role;
grant execute on function public.undo_action(uuid,bigint,boolean) to authenticated, service_role;

-- Archive visibility is a SELECT restriction; undo runs as the journal owner and
-- can restore the project. Existing owner checks still govern every write.
create policy visible_project on public.projects as restrictive for select to authenticated using (status <> 'archived');
do $$
declare t text;
begin
 foreach t in array array['sources','checkpoints','sessions','misconceptions','notes','proposals','diagnostics'] loop
  execute format('create policy visible_project on public.%I as restrictive for select to authenticated using (exists(select 1 from public.projects p where p.id=%1$I.project_id and p.user_id=%1$I.user_id))',t);
 end loop;
end $$;
create policy visible_project on public.cards as restrictive for select to authenticated using (exists(select 1 from public.notes n where n.id=note_id));
create policy visible_project on public.reviews as restrictive for select to authenticated using (exists(select 1 from public.cards c where c.id=card_id));
create policy visible_project on public.card_comments as restrictive for select to authenticated using (exists(select 1 from public.notes n where n.id=note_id));
create policy visible_project on public.source_pages as restrictive for select to authenticated using (exists(select 1 from public.sources s where s.id=source_id));
create policy visible_project on public.session_events as restrictive for select to authenticated using (exists(select 1 from public.sessions s where s.id=session_id));
create policy visible_project on public.checkpoint_prereqs as restrictive for select to authenticated using (exists(select 1 from public.checkpoints c where c.id=checkpoint_id));
create policy visible_project on public.checkpoint_concepts as restrictive for select to authenticated using (exists(select 1 from public.checkpoints c where c.id=checkpoint_id));

create or replace view public.v_due_cards with(security_invoker=true) as
 select c.user_id,c.id as card_id,n.id as note_id,n.no as note_no,c.ord,n.project_id,n.checkpoint_id,n.session_id,c.state,c.due
 from public.cards c join public.notes n on n.id=c.note_id and n.user_id=c.user_id
 join public.projects p on p.id=n.project_id and p.user_id=n.user_id
 where n.status='active' and p.status<>'archived';

-- Proposal transitions and their diagnostic effects are journalled together.
create function public.lemma_diagnostic_decision() returns trigger
language plpgsql security invoker set search_path='' as $$
declare ref text; diagnostic_id uuid;
begin
 if current_setting('lemma.tool',true)='undo' or new.kind<>'plan_change' then return new; end if;
 if tg_op='UPDATE' and new.status is not distinct from old.status then return new; end if;
 for ref in select jsonb_array_elements_text(coalesce(new.payload->'diagnostics','[]'::jsonb)) loop
  select id into diagnostic_id from public.diagnostics where user_id=new.user_id and project_id=new.project_id and no=substring(ref from '^D([0-9]+)$')::bigint;
  if diagnostic_id is null then raise exception 'Unknown diagnostic: %',ref; end if;
  update public.diagnostics set proposal_id=new.id,
   status=case when new.status='rejected' then 'confirmed' when new.status='approved' and kind='material' then 'resolved' else 'planned' end
   where id=diagnostic_id and user_id=new.user_id;
 end loop;
 if new.status='approved' and new.payload ? 'book' then
  update public.sources set plan_checked_at=now() where user_id=new.user_id and project_id=new.project_id and short=new.payload->>'book';
  if not found then raise exception 'Unknown book: %',new.payload->>'book'; end if;
 end if;
 return new;
end $$;
revoke all on function public.lemma_diagnostic_decision() from public,anon;
create trigger z_diagnostic_decision after insert or update on public.proposals for each row execute function public.lemma_diagnostic_decision();

create function public.lemma_diagnostic_resolution() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if current_setting('lemma.tool',true)='undo' or new.status<>'demonstrated' or old.status='demonstrated' then return new; end if;
 update public.diagnostics d set status='resolved'
 where d.user_id=new.user_id and d.project_id=new.project_id and d.status='planned'
 and exists (
   select 1 from public.action_changes cp join public.action_changes proposal on proposal.action_no=cp.action_no
   where cp.table_name='checkpoints' and cp.op='insert' and cp.new->>'id'=new.id::text
   and proposal.table_name='proposals' and proposal.new->>'id'=d.proposal_id::text
   and proposal.new->>'status'='approved'
 );
 return new;
end $$;
revoke all on function public.lemma_diagnostic_resolution() from public,anon;
create trigger z_diagnostic_resolution after update on public.checkpoints for each row execute function public.lemma_diagnostic_resolution();
