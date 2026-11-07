-- N50.2.2.1: optional owner-checked related record metadata for study events.
-- No authenticated write permissions, command routing or undo are enabled.
-- A related reference is a historical association: a later deletion can
-- leave a dangling ID, which consumers must treat as unavailable.
alter table public.study_events
  add column related_kind text,
  add column related_id uuid,
  add constraint study_events_related_pair_check check(
    (related_kind is null and related_id is null)
    or (related_kind in ('task','calendar_block','study_entry')
      and related_id is not null)
  );
create index study_events_owner_related on public.study_events
  (user_id,related_kind,related_id) where related_id is not null;

create function public.study_events_related_owner_check() returns trigger
language plpgsql security invoker set search_path='' as $related$
begin
  if new.related_id is null then return new; end if;
  -- Lookup by composite owner and UUID. Each target's ID is unique and its
  -- owner cannot be supplied by an unauthenticated event envelope.
  if new.related_kind='task' then
    if not exists(select 1 from public.tasks t
      where t.id=new.related_id and t.user_id=new.user_id) then
      raise exception 'Related task not found for this owner' using errcode='23503';
    end if;
  elsif new.related_kind='calendar_block' then
    if not exists(select 1 from public.calendar_blocks b
      where b.id=new.related_id and b.user_id=new.user_id) then
      raise exception 'Related calendar block not found for this owner' using errcode='23503';
    end if;
  elsif new.related_kind='study_entry' then
    if not exists(select 1 from public.study_entries e
      where e.id=new.related_id and e.user_id=new.user_id) then
      raise exception 'Related study entry not found for this owner' using errcode='23503';
    end if;
  else
    raise exception 'Invalid related kind' using errcode='23514';
  end if;
  return new;
end
$related$;
create trigger study_events_related_owner before insert or update of
  related_kind,related_id,user_id on public.study_events
  for each row execute function public.study_events_related_owner_check();
