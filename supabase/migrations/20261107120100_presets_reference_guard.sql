-- N41.2.2.1: owner-scoped forward-compatible deletion reference guard.
-- N52 later introduces study_entries.preset_id. N41.2.2.2 uses this guard
-- to archive a referenced preset rather than physically deleting history.
create function public.lemma_preset_has_entry_ref(p_user uuid,p_preset uuid)
returns boolean language plpgsql stable security invoker set search_path = ''
as $refs$
declare v_referenced boolean;
begin
  if p_user is null or p_user is distinct from auth.uid() then
    raise exception 'Not authorized';
  end if;
  if p_preset is null then return false; end if;
  if not exists (
    select 1 from pg_catalog.pg_attribute a
    where a.attrelid='public.study_entries'::pg_catalog.regclass
      and a.attname='preset_id' and a.attnum > 0 and not a.attisdropped
  ) then return false; end if;
  execute 'select exists(select 1 from public.study_entries
    where user_id=$1 and preset_id=$2)'
    into v_referenced using p_user,p_preset;
  return coalesce(v_referenced,false);
end
$refs$;
revoke all on function public.lemma_preset_has_entry_ref(uuid,uuid)
  from public,anon;
grant execute on function public.lemma_preset_has_entry_ref(uuid,uuid)
  to authenticated,service_role;
