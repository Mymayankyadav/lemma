-- DB-4: additive v3 schema. All backfills are journalled; no reset, truncate or
-- unlogged delete. The existing mcp Edge Function and connector secret are untouched.

-- All data backfills and the narrowly scoped orphan cleanup share a clearly
-- labelled, undoable DB-2 action instead of looking like an app edit.
select set_config('lemma.source','system',true);
select set_config('lemma.tool','db4_migration',true);
select set_config('lemma.summary','DB-4 source, system and orphan Atlas backfill',true);

-- Sources-first project drafts are allowed to have no subject or goal until the
-- tutor supplies them. Existing non-null values and validation remain intact.
alter table public.projects alter column subject_id drop not null;
alter table public.projects alter column goal drop not null;
alter table public.projects
  add column system boolean not null default false,
  add column pinned boolean not null default false;
create index projects_owner_system_status on public.projects(user_id,system,status);
create index projects_owner_pinned on public.projects(user_id,pinned) where pinned;

-- Enforce the library's four-pin limit even when multiple devices race.
create function public.lemma_limit_pins() returns trigger
language plpgsql security invoker set search_path = '' as $
begin
  if not new.pinned then return new; end if;
  if tg_op='UPDATE' and old.pinned then return new; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(new.user_id::text)::bigint);
  if (select count(*) from public.projects p
      where p.user_id=new.user_id and p.pinned and p.id<>new.id)>=4 then
    raise exception 'At most four projects may be pinned';
  end if;
  return new;
end $;
revoke all on function public.lemma_limit_pins() from public,anon;
create trigger a_project_pin_limit before insert or update of pinned on public.projects
  for each row execute function public.lemma_limit_pins();


alter table public.checkpoints add column due_on date;
create index checkpoints_project_due on public.checkpoints(project_id,due_on);

alter table public.sources
  add column kind text not null default 'other'
    check (kind in ('book','notes','slides','problems','syllabus','exam','other')),
  add column sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  add column position integer not null default 0,
  add column added_at timestamptz not null default now();
create unique index sources_project_sha256 on public.sources(project_id,sha256)
  where sha256 is not null;
create index sources_project_added on public.sources(project_id,added_at desc);
alter table public.sources alter column short set default '';


-- Preserve the original upload chronology instead of assigning migration time
-- to pre-existing PDFs. Existing stable shorts are never renamed.
with ranked as (
  select id,created_at,
    (row_number() over(partition by project_id order by created_at,id)-1)::integer as source_position
  from public.sources
)
update public.sources s set added_at=r.created_at,position=r.source_position
from ranked r where s.id=r.id
  and (s.added_at is distinct from r.created_at or s.position<>r.source_position);


update public.sources set kind=case
  when filename ~* '(syllabus|outline)' then 'syllabus'
  when filename ~* '(exam|test|quiz)' then 'exam'
  when filename ~* '(homework|problem|exercise|sheet|hw[0-9])' then 'problems'
  when filename ~* '(lecture|notes|week[0-9]|class)' then 'notes'
  when filename ~* '(slides|presentation)' then 'slides'
  else 'book'
end
where kind='other';

-- The generated short is stable after creation, even if the title is renamed.
-- Serialize allocation within a project to avoid two concurrent suffix choices.
create function public.lemma_source_short() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare base text; candidate text; suffix integer := 1;
begin
  if tg_op='INSERT' and new.kind='other' then
    new.kind := case
      when new.filename ~* '(syllabus|outline)' then 'syllabus'
      when new.filename ~* '(exam|test|quiz)' then 'exam'
      when new.filename ~* '(homework|problem|exercise|sheet|hw[0-9])' then 'problems'
      when new.filename ~* '(lecture|notes|week[0-9]|class)' then 'notes'
      when new.filename ~* '(slides|presentation)' then 'slides'
      else 'book'
    end;
  end if;
  if nullif(new.short,'') is not null then return new; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(new.project_id::text)::bigint);
  base := trim(both '-' from pg_catalog.regexp_replace(
    lower(pg_catalog.split_part(coalesce(nullif(new.title,''),new.filename),'.',1)),
    '[^a-z0-9]+','-','g'));
  base := left(coalesce(nullif(base,''),new.kind),20);
  candidate := base;
  while exists(select 1 from public.sources s where s.project_id=new.project_id and s.short=candidate and s.id<>new.id) loop
    suffix := suffix+1;
    candidate := left(base,20-char_length(suffix::text)-1)||'-'||suffix;
  end loop;
  new.short := candidate;
  return new;
end $$;
revoke all on function public.lemma_source_short() from public,anon;
create trigger a_source_short before insert on public.sources
  for each row execute function public.lemma_source_short();

-- A checkpoint may cite several sources. Both composite FKs enforce owner
-- isolation; the trigger also forbids a source from a different project.
create table public.checkpoint_sources (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade deferrable initially immediate,
  created_at timestamptz not null default now(),
  checkpoint_id uuid not null,
  source_id uuid not null,
  pages text check (pages is null or char_length(pages)<=120),
  primary key(checkpoint_id,source_id),
  foreign key(user_id,checkpoint_id) references public.checkpoints(user_id,id)
    on delete cascade deferrable initially immediate,
  foreign key(user_id,source_id) references public.sources(user_id,id)
    on delete cascade deferrable initially immediate
);
create index checkpoint_sources_owner on public.checkpoint_sources(user_id);
create index checkpoint_sources_source on public.checkpoint_sources(source_id);
alter table public.checkpoint_sources enable row level security;
revoke all on public.checkpoint_sources from public,anon;
grant select,insert,update,delete on public.checkpoint_sources to authenticated,service_role;
create policy owner_all on public.checkpoint_sources for all to authenticated
  using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy visible_project on public.checkpoint_sources as restrictive for select to authenticated
  using(exists(select 1 from public.checkpoints c where c.id=checkpoint_id and c.user_id=checkpoint_sources.user_id));

create function public.lemma_checkpoint_source_project() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare cp_project uuid; source_project uuid;
begin
  select project_id into cp_project from public.checkpoints where id=new.checkpoint_id and user_id=new.user_id;
  select project_id into source_project from public.sources where id=new.source_id and user_id=new.user_id;
  if cp_project is null or source_project is null or cp_project<>source_project then
    raise exception 'Checkpoint source must belong to the same project and owner';
  end if;
  return new;
end $$;
revoke all on function public.lemma_checkpoint_source_project() from public,anon;
create trigger a_checkpoint_source_project before insert or update on public.checkpoint_sources
  for each row execute function public.lemma_checkpoint_source_project();
create trigger lemma_log_change after insert or update or delete on public.checkpoint_sources
  for each row execute function public.log_change();

insert into public.checkpoint_sources(user_id,checkpoint_id,source_id,pages)
select c.user_id,c.id,c.source_id,c.pages from public.checkpoints c
join public.sources s on s.id=c.source_id and s.user_id=c.user_id and s.project_id=c.project_id
where c.source_id is not null
on conflict (checkpoint_id,source_id) do nothing;


-- Until MCP-4 switches to multi-source writes, keep legacy checkpoint.source_id
-- and pages in sync with the citation table. Do not overwrite other citations.
create function public.lemma_checkpoint_source_legacy() returns trigger
language plpgsql security invoker set search_path = '' as $
begin
  if tg_op='UPDATE' and old.source_id is distinct from new.source_id
      and old.source_id is not null then
    delete from public.checkpoint_sources
      where checkpoint_id=new.id and source_id=old.source_id and user_id=new.user_id;
  end if;
  if new.source_id is not null then
    insert into public.checkpoint_sources(user_id,checkpoint_id,source_id,pages)
      values(new.user_id,new.id,new.source_id,new.pages)
    on conflict (checkpoint_id,source_id) do update
      set pages=excluded.pages;
  end if;
  return new;
end $;
revoke all on function public.lemma_checkpoint_source_legacy() from public,anon;
create trigger z_checkpoint_source_legacy after insert or update of source_id,pages
  on public.checkpoints for each row execute function public.lemma_checkpoint_source_legacy();

-- Extend DB-2 undo's fixed table allow-list and lock list. Preserve its
-- conflict, cascade and authorization behavior verbatim.
do $$
declare definition text; extended text;
begin
  select pg_catalog.pg_get_functiondef('public.undo_action(uuid,bigint,boolean)'::regprocedure) into definition;
  if definition is null or pg_catalog.strpos(definition,'''diagnostics'']')=0 then
    raise exception 'DB-4 requires the known DB-2 undo_action implementation';
  end if;
  extended := pg_catalog.replace(definition,'''diagnostics'']','''diagnostics'',''checkpoint_sources'']');
  execute extended;
end $$;

-- Hierarchical Atlas; existing concepts are planets unless reparented below.
alter table public.concepts
  add column level text not null default 'planet'
    check (level in ('cluster','galaxy','system','planet','moon')),
  add column parent_id uuid,
  add column is_star boolean not null default false,
  add constraint concepts_parent_not_self check(parent_id is null or parent_id<>id),
  add constraint concepts_owner_parent_fk foreign key(user_id,parent_id)
    references public.concepts(user_id,id) on delete set null(parent_id)
    deferrable initially immediate;
create index concepts_parent on public.concepts(user_id,parent_id);

create function public.lemma_concept_parent() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare parent_subject uuid; cycle_found boolean;
begin
  if new.parent_id is null then return new; end if;
  select subject_id into parent_subject from public.concepts
    where id=new.parent_id and user_id=new.user_id;
  if parent_subject is distinct from new.subject_id then
    raise exception 'Atlas parent must belong to the same subject';
  end if;
  with recursive ancestors(id,parent_id,path) as (
    select c.id,c.parent_id,array[c.id] from public.concepts c
      where c.id=new.parent_id and c.user_id=new.user_id
    union all
    select c.id,c.parent_id,a.path||c.id from ancestors a
      join public.concepts c on c.id=a.parent_id and c.user_id=new.user_id
    where not c.id=any(a.path)
  )
  select exists(select 1 from ancestors where id=new.id) into cycle_found;
  if cycle_found then raise exception 'Atlas hierarchy cannot contain a cycle'; end if;
  return new;
end $$;
revoke all on function public.lemma_concept_parent() from public,anon;
-- Deferred validation allows moving a whole hierarchy in one subject merge.
create constraint trigger a_concept_parent after insert or update on public.concepts
  deferrable initially deferred for each row execute function public.lemma_concept_parent();

-- Preserve linked legacy concepts and turn their topic into a system. Never
-- manufacture hierarchy for detached subjects slated for cleanup below.
insert into public.concepts(user_id,subject_id,slug,name,level)
select distinct c.user_id,c.subject_id,
  'system-'||substr(md5(c.topic),1,12),left(c.topic,60),'system'
from public.concepts c
where nullif(c.topic,'') is not null
  and exists(select 1 from public.projects p where p.subject_id=c.subject_id and not p.system)
  and not exists(select 1 from public.concepts existing
    where existing.user_id=c.user_id and existing.subject_id=c.subject_id
      and existing.slug='system-'||substr(md5(c.topic),1,12))
on conflict (user_id,subject_id,slug) do nothing;
update public.concepts c set parent_id=parent.id
from public.concepts parent
where c.id<>parent.id and c.user_id=parent.user_id and c.subject_id=parent.subject_id
  and c.level='planet' and nullif(c.topic,'') is not null
  and parent.level='system' and parent.slug='system-'||substr(md5(c.topic),1,12)
  and c.parent_id is null;

-- A subject merge moves both projects and ideas; a colliding idea slug is
-- preserved with an ID suffix rather than silently deleting mathematical work.
create function public.merge_subjects(p_source uuid,p_target uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid; target_owner uuid; idea record; moved_projects int; moved_concepts int;
begin
  owner_id:=auth.uid();
  if owner_id is null or p_source is null or p_target is null or p_source=p_target then
    raise exception 'Choose two distinct subjects you own';
  end if;
  perform 1 from public.subjects where id in (p_source,p_target) and user_id=owner_id for update;
  if (select count(*) from public.subjects where id in (p_source,p_target) and user_id=owner_id)<>2 then
    raise exception 'Subject not found for owner';
  end if;

  if exists(select 1 from public.subjects s
      where s.id in (p_source,p_target) and s.user_id=owner_id and s.name ilike 'zz-selftest%')
     or exists(select 1 from public.projects p
      where p.subject_id in (p_source,p_target) and p.user_id=owner_id and p.system) then
    raise exception 'System and self-test subjects cannot be merged into study subjects';
  end if;
  update public.projects set subject_id=p_target where user_id=owner_id and subject_id=p_source;
  get diagnostics moved_projects=row_count;
  moved_concepts:=0;
  for idea in select id,slug from public.concepts
    where user_id=owner_id and subject_id=p_source order by id for update loop
    update public.concepts set subject_id=p_target,
      slug=case when exists(select 1 from public.concepts other
          where other.user_id=owner_id and other.subject_id=p_target and other.slug=idea.slug)
        then idea.slug||'-'||substr(idea.id::text,1,8) else idea.slug end
    where id=idea.id and user_id=owner_id;
    moved_concepts:=moved_concepts+1;
  end loop;
  delete from public.subjects where id=p_source and user_id=owner_id;
  return jsonb_build_object('projects',moved_projects,'concepts',moved_concepts,'target',p_target);
end $$;
revoke all on function public.merge_subjects(uuid,uuid) from public,anon,service_role;
grant execute on function public.merge_subjects(uuid,uuid) to authenticated;

-- Approved plans are numbered from their existing proposals; no second
-- mutable copy can drift from the owner-approved source of truth.
create view public.v_plan_revisions with (security_invoker=true) as
select p.user_id,p.project_id,p.id as proposal_id,
  row_number() over (partition by p.project_id order by p.decided_at,p.created_at,p.id) as revision,
  p.decided_at as approved_at,p.kind,
  coalesce(p.reason,p.payload->>'summary','Approved plan') as summary
from public.proposals p
where p.status='approved' and p.kind in ('plan','plan_change');
revoke all on public.v_plan_revisions from public,anon;
grant select on public.v_plan_revisions to authenticated,service_role;

-- Mark known connector self-test projects, without destroying their data.
-- The journal records this change, and the owner can undo it.
update public.projects p set system=true
where not p.system and (
  p.slug like 'zz-selftest%' or p.title ilike 'zz-selftest%'
  or exists(select 1 from public.subjects s
    where s.id=p.subject_id and s.name ilike 'zz-selftest%')
);

-- The deleted Algebra 1 project left an isolated graph of ideas with no
-- project, checkpoint or card anchors. Remove only that known orphan graph,
-- and only if the *entire subject* has no such anchors. DB-2 logs each node
-- and cascaded link, making undo possible. Never touch other subject graphs.
do $$
declare algebra_subject uuid; orphan_count integer;
begin
  select s.id into algebra_subject from public.subjects s
    where s.name='Algebra'
      and not exists(select 1 from public.projects p where p.subject_id=s.id)
      and not exists(select 1 from public.notes n join public.concepts c on c.id=n.concept_id where c.subject_id=s.id)
      and not exists(select 1 from public.checkpoint_concepts cc join public.concepts c on c.id=cc.concept_id where c.subject_id=s.id);
  if algebra_subject is not null then
    select count(*) into orphan_count from public.concepts where subject_id=algebra_subject;
    if orphan_count=79 then
      delete from public.concepts where subject_id=algebra_subject;
    elsif orphan_count>0 then
      raise notice 'DB-4: orphan count changed from the reviewed 79 to %; skipping cleanup',orphan_count;
    end if;
  end if;
end $$;

-- Restrictive SELECT visibility for the owner-facing app. Service-role MCP
-- reads still must explicitly filter system=true (MCP-4 owns that code).
create policy hide_system_projects on public.projects as restrictive for select
  to authenticated using (not system);
create policy hide_selftest_subjects on public.subjects as restrictive for select
  to authenticated using (name not ilike 'zz-selftest%');
create policy hide_selftest_concepts on public.concepts as restrictive for select
  to authenticated using (exists(select 1 from public.subjects s where s.id=subject_id));
create policy hide_selftest_links on public.concept_links as restrictive for select
  to authenticated using (exists(select 1 from public.concepts c where c.id=from_id)
    and exists(select 1 from public.concepts c where c.id=to_id));

create or replace view public.v_due_cards with (security_invoker=true) as
 select c.user_id,c.id as card_id,n.id as note_id,n.no as note_no,c.ord,
        n.project_id,n.checkpoint_id,n.session_id,c.state,c.due
 from public.cards c
 join public.notes n on n.id=c.note_id and n.user_id=c.user_id
 join public.projects p on p.id=n.project_id and p.user_id=n.user_id
 where n.status='active' and p.status<>'archived' and not p.system;
