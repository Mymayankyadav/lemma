-- N41.2.2.2.2.1: transaction-scoped locking companion to the
-- read-only lifecycle preview. This function NEVER changes a preset.
-- Callers doing writes must invoke it inside their command transaction,
-- holding the row lock through the mutation and receipt commit.
create function public.lemma_preset_lifecycle_lock(p jsonb) returns jsonb
language plpgsql volatile security invoker set search_path = '' as $lock$
declare
  v_owner uuid;
  v_id uuid;
  v_locked uuid;
  v_preview jsonb;
begin
  -- Preview validates an authenticated owner, exact envelope keys, operation,
  -- target and expectedVersion. It never trusts a caller-supplied user_id.
  v_preview := public.lemma_preset_lifecycle_preview(p);
  v_owner := (select auth.uid());
  if v_owner is null then raise exception 'Authentication required'; end if;
  v_id := (v_preview ->> 'id')::uuid;
  -- A row lock serializes archive/restore/delete with concurrent updates and
  -- with another owner-bound command. Never lock or expose a foreign preset.
  select id into v_locked from public.presets
    where user_id=v_owner and id=v_id for update;
  if not found then raise exception 'Preset not found'; end if;
  -- The initial preview is non-authoritative. Re-read the owner row, version,
  -- archival state and study-entry references AFTER taking the row lock.
  -- An existing conflict stays a conflict; a new conflict is now visible.
  return public.lemma_preset_lifecycle_preview(p);
end
$lock$;
revoke all on function public.lemma_preset_lifecycle_lock(jsonb) from public,anon;
grant execute on function public.lemma_preset_lifecycle_lock(jsonb)
  to authenticated,service_role;
