-- TUTOR-01 T3c2b: a selected tutor event and its audit receipt are a single
-- transaction. Preserve D's canonical immutable event ledger and E's receipt
-- RPC; neither existing function, table or migration is modified.
create function public.record_tutor_evidence_with_receipt(
  p_plan_id uuid, p_checkpoint_id text, p_expected_plan_revision bigint,
  p_event_type text, p_payload jsonb, p_event_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_event jsonb;
  v_receipt jsonb;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  -- D's RPC validates the owner's published plan, checkpoint, revision,
  -- event shape and exact-key idempotency; it must never use a tutor-supplied
  -- actor/source string. A failed second RPC rolls this write back.
  v_event := public.record_study_event(
    p_plan_id, p_checkpoint_id, p_expected_plan_revision,
    p_event_type, p_payload, p_event_id, 'tutor_handoff.v1');
  -- The immutable event UUID doubles as the audit receipt key/artifact ID.
  -- Existing receipts are returned only for the exact original parameter tuple.
  v_receipt := public.record_tutor_handoff_receipt(
    p_event_id, p_plan_id, p_checkpoint_id, p_expected_plan_revision,
    'evidence_recorded', p_event_id, null);
  return jsonb_build_object('event', v_event, 'audit', v_receipt);
end $$;
revoke all on function public.record_tutor_evidence_with_receipt(
  uuid,text,bigint,text,jsonb,uuid) from PUBLIC, anon;
grant execute on function public.record_tutor_evidence_with_receipt(
  uuid,text,bigint,text,jsonb,uuid) to authenticated;
