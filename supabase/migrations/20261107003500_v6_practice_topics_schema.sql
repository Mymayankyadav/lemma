-- N43.1 / D8(b): additive owner-scoped practice topics/events; FSRS untouched.
-- N43.2 will implement versioned command, record/void and due-date inverse.
create function public.lemma_valid_practice_cadence(p jsonb) returns boolean
language plpgsql immutable security invoker set search_path = '' as $cadence$
declare n numeric; idx integer; part jsonb;
begin
 if p is null or pg_catalog.jsonb_typeof(p)<>'object' then return false; end if;
 if (select count(*) from pg_catalog.jsonb_object_keys(p))<>2 then return false; end if;
 if p->>'kind'='fixed_days' then
  if pg_catalog.jsonb_typeof(p->'days')<>'number' then return false; end if;
  n:=(p->>'days')::numeric;
  return n=pg_catalog.trunc(n) and n between 1 and 3650;
 elsif p->>'kind'='after_rating' then
  if pg_catalog.jsonb_typeof(p->'daysByRating')<>'array' then return false; end if;
  if pg_catalog.jsonb_array_length(p->'daysByRating')<>4 then return false; end if;
  for idx in 0..3 loop
   part:=p->'daysByRating'->idx;
   if pg_catalog.jsonb_typeof(part)<>'number' then return false; end if;
   n:=(part::text)::numeric;
   if n<>pg_catalog.trunc(n) or n not between 1 and 3650 then return false; end if;
  end loop;
  return true;
 end if;
 return false;
exception when others then return false;
end
$cadence$;

create table public.practice_topics (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 title text not null check (char_length(btrim(title)) between 1 and 200),
 subject_id uuid,
 concept_id uuid,
 checkpoint_id uuid,
 next_due_date date,
 cadence jsonb not null default '{"kind":"fixed_days","days":7}'::jsonb
  check (public.lemma_valid_practice_cadence(cadence)),
 last_practiced_at timestamptz,
 archived_at timestamptz,
 version integer not null default 1 check (version>0),
 source text not null default 'app' check (source in ('app','mcp','worker')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(user_id,id),
 constraint practice_topics_subject_owner_fk foreign key(user_id,subject_id)
  references public.subjects(user_id,id) on delete set null (subject_id) deferrable initially immediate,
 constraint practice_topics_concept_owner_fk foreign key(user_id,concept_id)
  references public.concepts(user_id,id) on delete set null (concept_id) deferrable initially immediate,
 constraint practice_topics_checkpoint_owner_fk foreign key(user_id,checkpoint_id)
  references public.checkpoints(user_id,id) on delete set null (checkpoint_id) deferrable initially immediate
);
create index practice_topics_owner_due_idx on public.practice_topics
 (user_id,archived_at,next_due_date,id);

create table public.practice_events (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 topic_id uuid not null,
 occurred_at timestamptz not null,
 rating integer not null check (rating between 1 and 4),
 response text check (response is null or char_length(response)<=4000),
 minutes integer check (minutes is null or minutes between 0 and 1440),
 voided_at timestamptz,
 version integer not null default 1 check (version>0),
 source text not null default 'app' check (source in ('app','mcp','worker')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(user_id,id),
 constraint practice_events_topic_owner_fk foreign key(user_id,topic_id)
  references public.practice_topics(user_id,id) deferrable initially immediate
);
create index practice_events_owner_topic_time_idx on public.practice_events
 (user_id,topic_id,occurred_at desc,id);

alter table public.practice_topics enable row level security;
alter table public.practice_events enable row level security;
create policy practice_topics_owner_select on public.practice_topics for select
 to authenticated using (user_id=(select auth.uid()));
create policy practice_topics_owner_insert on public.practice_topics for insert
 to authenticated with check (user_id=(select auth.uid()));
create policy practice_topics_owner_update on public.practice_topics for update
 to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create policy practice_topics_owner_delete on public.practice_topics for delete
 to authenticated using (user_id=(select auth.uid()));
create policy practice_events_owner_select on public.practice_events for select
 to authenticated using (user_id=(select auth.uid()));
create policy practice_events_owner_insert on public.practice_events for insert
 to authenticated with check (user_id=(select auth.uid()));
create policy practice_events_owner_update on public.practice_events for update
 to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create policy practice_events_owner_delete on public.practice_events for delete
 to authenticated using (user_id=(select auth.uid()));
grant select,insert,update,delete on public.practice_topics to authenticated;
grant select,insert,update,delete on public.practice_events to authenticated;
create trigger lemma_log_change after insert or update or delete on public.practice_topics
 for each row execute function public.log_change();
create trigger lemma_log_change after insert or update or delete on public.practice_events
 for each row execute function public.log_change();
insert into public.lemma_undo_tables(table_name) values ('practice_topics'),('practice_events');
