-- N93: owner scoped historical route aliases and immutable source revisions.
-- A two-argument resolution is allowed only when a code/slug is unambiguous.
create table public.record_aliases(
 id bigint generated always as identity primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check(kind in ('project','concept','checkpoint')),
 scope_id uuid,
 old_value text not null check(char_length(old_value) between 1 and 120),
 target_id uuid not null,
 created_at timestamptz not null default now(),
 constraint record_alias_scope check ((kind='project')=(scope_id is null)),
 unique(user_id,kind,scope_id,old_value)
);
-- PostgreSQL ordinary UNIQUE treats NULL scopes as distinct; cover project
-- slugs explicitly so no owner can claim the same historical project slug.
create unique index record_alias_project_global
 on public.record_aliases(user_id,old_value) where kind='project';
create index record_alias_target on public.record_aliases(user_id,kind,target_id);
alter table public.record_aliases enable row level security;
create policy record_aliases_owner_read on public.record_aliases
 for select to authenticated using(user_id=(select auth.uid()));
grant select on public.record_aliases to authenticated,service_role;
grant insert,update,delete on public.record_aliases to service_role;
revoke insert,update,delete,truncate on public.record_aliases from anon,authenticated;
create trigger lemma_log_change after insert or update or delete on public.record_aliases
 for each row execute function public.log_change();
insert into public.lemma_undo_tables(table_name) values('record_aliases');

create function public.capture_record_alias() returns trigger
 language plpgsql security definer set search_path='' as $alias$
 declare k text:=tg_argv[0]; f text:=tg_argv[1];
  owner uuid;target uuid;new_scope uuid;old_scope uuid;
  v_new_value text;v_old_value text;collision uuid;
 begin
  owner:=(to_jsonb(new)->>'user_id')::uuid;
  target:=(to_jsonb(new)->>'id')::uuid;
  v_new_value:=to_jsonb(new)->>f;
  new_scope:=case k when 'concept' then (to_jsonb(new)->>'subject_id')::uuid
                    when 'checkpoint' then (to_jsonb(new)->>'project_id')::uuid
                    else null end;
  if tg_op='UPDATE' then
   v_old_value:=to_jsonb(old)->>f;
   old_scope:=case k when 'concept' then (to_jsonb(old)->>'subject_id')::uuid
                     when 'checkpoint' then (to_jsonb(old)->>'project_id')::uuid
                     else null end;
   if v_old_value is distinct from v_new_value or old_scope is distinct from new_scope then
    -- Generic undo should not invent new immutable aliases.
    if not (pg_catalog.current_setting('lemma.tool',true)='undo'
            and current_user not in ('authenticated','anon')) then
     insert into public.record_aliases(user_id,kind,scope_id,old_value,target_id)
       values(owner,k,old_scope,v_old_value,target)
       on conflict do nothing;
     select target_id into collision from public.record_aliases a
      where user_id=owner and kind=k and scope_id is not distinct from old_scope
        and a.old_value=v_old_value limit 1;
     if collision is distinct from target then
      raise exception 'Historic alias belongs to another record';
     end if;
    end if;
   end if;
  end if;
  -- Never allow a current identifier to shadow another record's older URL.
  select target_id into collision from public.record_aliases a
   where user_id=owner and kind=k and scope_id is not distinct from new_scope
    and a.old_value=v_new_value limit 1;
  if collision is not null and collision<>target then
   raise exception 'Identifier is reserved by an older alias';
  end if;
  return new;
 end $alias$;
create trigger a_project_alias before insert or update of slug on public.projects
 for each row execute function public.capture_record_alias('project','slug');
create trigger a_concept_alias before insert or update of slug,subject_id on public.concepts
 for each row execute function public.capture_record_alias('concept','slug');
create trigger a_checkpoint_alias before insert or update of code,project_id on public.checkpoints
 for each row execute function public.capture_record_alias('checkpoint','code');

create function public.resolve_alias(p_kind text,p_value text,p_scope uuid default null)
returns uuid language plpgsql security invoker set search_path='' as $resolve$
declare found_ids uuid[]; owner uuid:=auth.uid();
begin
 if owner is null or p_kind not in ('project','concept','checkpoint') or
  p_value is null or p_value='' then return null;end if;
 if p_kind='project' then
  select array_agg(distinct id) into found_ids from(
   select id from public.projects where user_id=owner and slug=p_value
   union all
   select target_id id from public.record_aliases
    where user_id=owner and kind='project' and old_value=p_value
  )x;
 elsif p_kind='concept' then
  select array_agg(distinct id) into found_ids from(
   select id from public.concepts where user_id=owner and slug=p_value
    and (p_scope is null or subject_id=p_scope)
   union all
   select target_id id from public.record_aliases where user_id=owner
    and kind='concept' and old_value=p_value and (p_scope is null or scope_id=p_scope)
  )x;
 else
  select array_agg(distinct id) into found_ids from(
   select id from public.checkpoints where user_id=owner and code=p_value
    and (p_scope is null or project_id=p_scope)
   union all
   select target_id id from public.record_aliases where user_id=owner
    and kind='checkpoint' and old_value=p_value and (p_scope is null or scope_id=p_scope)
  )x;
 end if;
 if coalesce(array_length(found_ids,1),0)>1 then
  raise exception 'Ambiguous alias: supply the subject or project scope';end if;
 return found_ids[1];
end $resolve$;
revoke all on function public.resolve_alias(text,text,uuid) from public,anon;
grant execute on function public.resolve_alias(text,text,uuid) to authenticated,service_role;

create table public.source_revisions(
 id bigint generated always as identity primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 source_id uuid not null,
 version integer not null check(version>0),
 content_hash text not null check(content_hash~'^[0-9a-f]{32}$'),
 snapshot jsonb not null check(jsonb_typeof(snapshot)='object'),
 created_at timestamptz not null default now(),
 unique(user_id,source_id,version),
 foreign key(user_id,source_id) references public.sources(user_id,id) on delete cascade
);
create table public.source_page_revisions(
 id bigint generated always as identity primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 source_id uuid not null,
 page integer not null check(page>0),
 version integer not null check(version>0),
 content_hash text not null check(content_hash~'^[0-9a-f]{32}$'),
 snapshot jsonb not null check(jsonb_typeof(snapshot)='object'),
 created_at timestamptz not null default now(),
 unique(user_id,source_id,page,version),
 foreign key(user_id,source_id) references public.sources(user_id,id) on delete cascade
);
alter table public.source_revisions enable row level security;
alter table public.source_page_revisions enable row level security;
create policy source_revisions_owner_read on public.source_revisions
 for select to authenticated using(user_id=(select auth.uid()));
create policy source_page_revisions_owner_read on public.source_page_revisions
 for select to authenticated using(user_id=(select auth.uid()));
grant select on public.source_revisions,public.source_page_revisions to authenticated,service_role;
grant insert,update,delete on public.source_revisions,public.source_page_revisions to service_role;
revoke insert,update,delete,truncate on public.source_revisions,public.source_page_revisions from anon,authenticated;
-- Revision snapshots are append-only history, intentionally not part of the
-- reversible source edit action. Journalling them would change existing
-- source action_change counts and erase the very snapshots a citation needs
-- when an owner undoes an edit.

create function public.capture_source_revision() returns trigger
 language plpgsql security definer set search_path='' as $rev$
 declare before_json jsonb;after_json jsonb;v_version integer;
 begin
  if pg_catalog.current_setting('lemma.tool',true)='undo'
   and current_user not in ('authenticated','anon') then return new;end if;
  before_json:=to_jsonb(old)-'version'-'updated_at'-'updated_source';
  after_json:=to_jsonb(new)-'version'-'updated_at'-'updated_source';
  if before_json is not distinct from after_json then return new;end if;
  v_version:=old.version;
  if tg_table_name='sources' then
   insert into public.source_revisions(user_id,source_id,version,content_hash,snapshot)
   values(old.user_id,old.id,v_version,pg_catalog.md5(before_json::text),before_json)
   on conflict(user_id,source_id,version) do nothing;
  else
   insert into public.source_page_revisions(user_id,source_id,page,version,content_hash,snapshot)
   values(old.user_id,old.source_id,old.page,v_version,pg_catalog.md5(before_json::text),before_json)
   on conflict(user_id,source_id,page,version) do nothing;
  end if;
  return new;
 end $rev$;
create trigger z_source_revision after update on public.sources
 for each row execute function public.capture_source_revision();
create trigger z_source_page_revision after update on public.source_pages
 for each row execute function public.capture_source_revision();
