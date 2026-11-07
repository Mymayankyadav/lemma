-- N41.2.2.2.2.1: transaction-scoped locking companion to the
-- read-only lifecycle preview. This function NEVER changes a preset.
-- Callers doing writes must invoke it inside their command transaction,
-- holding the row lock through the mutation and receipt commit.
create function public.lemma_preset_lifecycle_lock(p jsonb) returns jsonb
language plpgsql volatile security invoker set search_path = '' as $lock$
declare
  v_owner uuid;
  v_id uuid;
  v_expected integer;
  v_operation text;
  v_current public.presets%rowtype;
  v_preview jsonb;
  v_referenced boolean := false;
begin
  -- Preview validates an authenticated owner, exact envelope keys, operation,
  -- target and expectedVersion. It never trusts a caller-supplied user_id.
  v_preview := public.lemma_preset_lifecycle_preview(p);
  v_owner := (select auth.uid());
  if v_owner is null then raise exception 'Authentication required'; end if;
  v_id := (v_preview ->> 'id')::uuid;
  -- A row lock serializes archive/restore/delete with concurrent updates and
  -- with another owner-bound command. Never lock or expose a foreign preset.
  select * into v_current from public.presets
    where user_id=v_owner and id=v_id for update;
  if not found then raise exception 'Preset not found'; end if;
  -- The previous preview is STABLE: invoking it again inside this same
  -- statement could reuse its pre-lock snapshot after a competing UPDATE.
  -- The row returned by SELECT FOR UPDATE is authoritative, including when
  -- the row was updated while we waited for another transaction's lock.
  v_expected := (p->>'expectedVersion')::integer;
  v_operation := p->>'operation';
  if v_current.version is distinct from v_expected then
    return pg_catalog.jsonb_build_object(
      'operationId',p->>'operationId','status','conflict',
      'id',v_id,'currentVersion',v_current.version);
  end if;
  -- A fresh VOLATILE statement evaluates the reference guard only after the
  -- row is locked. A future owner FK's KEY SHARE lock serializes new links
  -- against this FOR UPDATE lock. Never reuse the initial preview's decision.
  if v_operation='delete' then
    select public.lemma_preset_has_entry_ref(v_owner,v_id)
      into v_referenced;
  end if;
  return pg_catalog.jsonb_build_object(
    'operationId',p->>'operationId','status','ok',
    'id',v_id,'currentVersion',v_current.version,
    'archived',v_current.archived_at is not null,
    'effectiveOperation',case when v_operation='delete' and v_referenced
      then 'archive' else v_operation end,
    'referencesStudyEntries',v_referenced);
end
$lock$;
revoke all on function public.lemma_preset_lifecycle_lock(jsonb) from public,anon;
grant execute on function public.lemma_preset_lifecycle_lock(jsonb)
  to authenticated,service_role;
