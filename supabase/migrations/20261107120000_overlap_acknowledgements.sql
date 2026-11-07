-- N47.1: owner-scoped overlap acknowledgements and authoritative staleness.
-- N47.2 owns command lifecycle, undo registry and MCP parity. No direct
-- authenticated write policy exists while commands are not implemented.
create function public.overlap_ack_participants_valid(p jsonb)
returns boolean language plpgsql immutable set search_path='' as $valid$
declare part jsonb; item text; ids text[]:=array[]::text[]; identity text;
begin
  if pg_catalog.jsonb_typeof(p) is distinct from 'array' then return false; end if;
  if pg_catalog.jsonb_array_length(p) not between 2 and 10 then return false; end if;
  for part in select value from pg_catalog.jsonb_array_elements(p) loop
    if pg_catalog.jsonb_typeof(part) is distinct from 'object'
      or pg_catalog.jsonb_typeof(part->'kind') is distinct from 'string'
      or part->>'kind' not in ('block','entry')
      or pg_catalog.jsonb_typeof(part->'id') is distinct from 'string'
      or part->>'id' !~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$'
      or pg_catalog.jsonb_typeof(part->'version') is distinct from 'number'
      or part->>'version' !~ '^[1-9][0-9]*$' then
      return false;
    end if;
    if (part->>'version')::numeric>2147483647 then return false; end if;
    for item in select key from pg_catalog.jsonb_object_keys(part) as keys(key) loop
      if item not in ('kind','id','version') then return false; end if;
    end loop;
    identity:=part->>'kind'||':'||(part->>'id')::uuid::text;
    if identity=any(ids) then return false; end if;
    ids:=pg_catalog.array_append(ids,identity);
  end loop;
  return true;
exception when invalid_text_representation or numeric_value_out_of_range then
  return false;
end
$valid$;

create function public.overlap_ack_choice_valid(p jsonb,p_disposition text,p_choice jsonb)
returns boolean language plpgsql immutable set search_path='' as $choice$
declare k text;
begin
  if p_disposition='keep_both' then return p_choice is null; end if;
  if p_disposition is distinct from 'attribute_to'
    or pg_catalog.jsonb_typeof(p_choice) is distinct from 'object'
    or p_choice->>'kind' not in ('block','entry')
    or pg_catalog.jsonb_typeof(p_choice->'id') is distinct from 'string' then
    return false;
  end if;
  for k in select key from pg_catalog.jsonb_object_keys(p_choice) as keys(key) loop
    if k not in ('kind','id') then return false; end if;
  end loop;
  return p @> pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object('kind',p_choice->>'kind','id',p_choice->>'id'));
end
$choice$;

create table public.overlap_acknowledgements (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  participants jsonb not null constraint overlap_ack_participants_check
    check(public.overlap_ack_participants_valid(participants)),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text constraint overlap_ack_reason_check
    check(reason is null or pg_catalog.length(reason)<=600),
  disposition text not null constraint overlap_ack_disposition_check
    check(disposition in ('keep_both','attribute_to')),
  attributed_to jsonb,
  version integer not null default 1 constraint overlap_ack_version_check
    check(version>0),
  source text not null default 'app' constraint overlap_ack_source_check
    check(source in ('app','mcp','worker')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,id),
  constraint overlap_ack_window_check check(ends_at>starts_at),
  constraint overlap_ack_choice_check
    check(public.overlap_ack_choice_valid(participants,disposition,attributed_to))
);
create index overlap_ack_owner_window on public.overlap_acknowledgements
  (user_id,starts_at,ends_at,id);
alter table public.overlap_acknowledgements enable row level security;
create policy overlap_ack_owner_read on public.overlap_acknowledgements
  for select to authenticated using(user_id=(select auth.uid()));
grant select on public.overlap_acknowledgements to authenticated;
grant select,insert,update,delete on public.overlap_acknowledgements to service_role;

-- A read compares stored participant versions to current owner-visible rows;
-- deleting or editing a participant makes only its acknowledgements stale.
create function public.overlap_ack_is_stale(p_owner uuid,p_participants jsonb)
returns boolean language plpgsql stable security invoker set search_path='' as $stale$
declare part jsonb; current_version integer; pid uuid;
begin
  if not public.overlap_ack_participants_valid(p_participants) then return true; end if;
  for part in select value from pg_catalog.jsonb_array_elements(p_participants) loop
    pid:=(part->>'id')::uuid;
    if part->>'kind'='block' then
      select b.version into current_version from public.calendar_blocks b
        where b.user_id=p_owner and b.id=pid;
    else
      select e.version into current_version from public.study_entries e
        where e.user_id=p_owner and e.id=pid;
    end if;
    if not found or current_version is distinct from (part->>'version')::integer then
      return true;
    end if;
  end loop;
  return false;
end
$stale$;

-- Creation/updates must refer to real, current records of the same owner.
-- Later version changes never rewrite the acknowledgement: reads show stale.
create function public.overlap_ack_guard() returns trigger
language plpgsql security invoker set search_path='' as $guard$
begin
  if public.overlap_ack_is_stale(new.user_id,new.participants) then
    raise exception 'Overlap participants are missing, not owned or stale';
  end if;
  if tg_op='UPDATE' then
    new.version:=old.version+1;
    new.updated_at:=pg_catalog.clock_timestamp();
  end if;
  return new;
end
$guard$;
create trigger overlap_ack_guard before insert or update on public.overlap_acknowledgements
  for each row execute function public.overlap_ack_guard();
create trigger overlap_ack_log after insert or update or delete on public.overlap_acknowledgements
  for each row execute function public.log_change();
