-- TUTOR-01 T3c1. Additive, metadata-only, append-only handoff audit.
-- Apply to Lemma only through Lane A's exact-version production gate AFTER merge.
-- Never store tutor replies, proof content, access tokens or source excerpts here.
create table public.tutor_handoff_receipts (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  receipt_id uuid not null,
  plan_id uuid not null,
  plan_revision bigint not null check (plan_revision >= 1),
  checkpoint_id text not null check (length(checkpoint_id) between 1 and 160),
  action text not null check (action in (
    'packet_exported','reply_reviewed','evidence_recorded',
    'card_editor_opened','amendment_draft_staged'
  )),
  artifact_id uuid not null,
  tutor_label text,
  created_at timestamptz not null default now(),
  primary key (user_id, receipt_id),
  foreign key (user_id,plan_id) references public.study_plans(user_id,id)
    on delete cascade,
  check (tutor_label is null or length(tutor_label) <= 80)
);
create index tutor_handoff_receipts_plan_idx
  on public.tutor_handoff_receipts(user_id,plan_id,created_at,receipt_id);
alter table public.tutor_handoff_receipts enable row level security;

-- The application may inspect its own audit receipts, but may not insert,
-- update or delete them directly. The RPC is the only authenticated writer.
revoke all on public.tutor_handoff_receipts from PUBLIC, anon, authenticated;
grant select on public.tutor_handoff_receipts to authenticated;
create policy tutor_handoff_receipts_owner_read
  on public.tutor_handoff_receipts for select to authenticated
  using (user_id = (select auth.uid()));

create function public.record_tutor_handoff_receipt(
  p_receipt_id uuid, p_plan_id uuid, p_checkpoint_id text,
  p_expected_plan_revision bigint, p_action text, p_artifact_id uuid,
  p_tutor_label text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_plan_revision bigint;
  v_snapshot jsonb;
  v_existing public.tutor_handoff_receipts%rowtype;
  v_receipt public.tutor_handoff_receipts%rowtype;
  v_label text := nullif(trim(p_tutor_label),'');
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if p_receipt_id is null or p_plan_id is null or p_artifact_id is null
     or p_expected_plan_revision is null or p_expected_plan_revision < 1
     or p_checkpoint_id is null or length(p_checkpoint_id) not between 1 and 160
     or p_action not in ('packet_exported','reply_reviewed','evidence_recorded',
                         'card_editor_opened','amendment_draft_staged')
     or p_action is null or length(coalesce(v_label,'')) > 80 then
    raise exception 'invalid_handoff_receipt';
  end if;
  -- Stable ID plus immutable parameter tuple = retry-safe receipt.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    v_user::text || ':tutor01-receipt:' || p_receipt_id::text, 0));
  select * into v_existing from public.tutor_handoff_receipts
    where user_id=v_user and receipt_id=p_receipt_id;
  if found then
    if v_existing.plan_id <> p_plan_id
       or v_existing.plan_revision <> p_expected_plan_revision
       or v_existing.checkpoint_id <> p_checkpoint_id
       or v_existing.action <> p_action
       or v_existing.artifact_id <> p_artifact_id
       or v_existing.tutor_label is distinct from v_label then
      raise exception 'idempotency_key_reused';
    end if;
    return jsonb_build_object('receiptId',v_existing.receipt_id,
      'planRevision',v_existing.plan_revision,
      'createdAt',v_existing.created_at);
  end if;
  -- Verify owner, currently published plan revision, and checkpoint in the
  -- immutable approved plan snapshot. Never accept an unapproved draft.
  select revision into v_plan_revision from public.study_plans
    where user_id=v_user and id=p_plan_id for share;
  if not found or v_plan_revision <> p_expected_plan_revision then
    raise exception 'stale_plan_revision';
  end if;
  select snapshot into v_snapshot from public.study_plan_versions
    where user_id=v_user and plan_id=p_plan_id and revision=v_plan_revision;
  if not found or jsonb_typeof(v_snapshot->'checkpoints') <> 'array'
     or not exists (
       select 1 from jsonb_array_elements(v_snapshot->'checkpoints') as cp(item)
       where cp.item->>'checkpoint_id'=p_checkpoint_id
          or cp.item->>'id'=p_checkpoint_id
     ) then
    raise exception 'checkpoint_not_in_approved_plan';
  end if;
  insert into public.tutor_handoff_receipts
    (user_id,receipt_id,plan_id,plan_revision,checkpoint_id,action,
     artifact_id,tutor_label)
    values(v_user,p_receipt_id,p_plan_id,p_expected_plan_revision,
      p_checkpoint_id,p_action,p_artifact_id,v_label)
    returning * into v_receipt;
  return jsonb_build_object('receiptId',v_receipt.receipt_id,
    'planRevision',v_receipt.plan_revision,'createdAt',v_receipt.created_at);
end $$;

revoke all on function public.record_tutor_handoff_receipt(
  uuid,uuid,text,bigint,text,uuid,text) from PUBLIC, anon;
grant execute on function public.record_tutor_handoff_receipt(
  uuid,uuid,text,bigint,text,uuid,text) to authenticated;
