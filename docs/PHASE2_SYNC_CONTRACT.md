# Phase 2 Sync Contract (implementation in progress)

## Backend deployed (2026-10-26)

Supabase project `yemqnhnztlbyxmjxidis`, Mumbai. Tables: `notes`, `profiles`, `review_events`, `learning_sources`, `learning_sections`, `learning_card_links`, `client_mutation_receipts`, `study_plans`, `study_context_files`, `study_plan_versions`, `study_checkpoints`, `learning_sessions`, `learning_events`, `tutor_handoffs`. RLS enabled on all.

Public authenticated RPC surface:

- `commit_note(p_note_id text, p_expected_revision bigint, p_request_id uuid, p_data jsonb, p_delete boolean default false) -> bigint`
- `publish_study_plan(p_plan_id uuid, p_expected_revision bigint, p_request_id uuid, p_title text, p_objective text, p_snapshot jsonb, p_change_summary text, p_context_id uuid default null, p_expected_context_revision bigint default null, p_author_model text default null) -> bigint`

These are SECURITY INVOKER entry points delegating to constrained implementations in a non-exposed schema. Anonymous users cannot invoke them. Each validates `auth.uid()` and scopes all data operations to it. Revision 0 means create, else match the current revision. On mismatch the server raises `stale_note_revision` / `stale_plan_revision`. Reusing a successful `p_request_id` with the same payload returns the existing revision and performs no duplicate mutation. Do not create a new request ID when retrying a transport timeout.

`review_events` supports owner-scoped SELECT and INSERT, never UPDATE or DELETE. Review IDs are UUIDs and are unique per account, enabling `ON CONFLICT DO NOTHING` replays. The old `note.log` field remains in the materialized note representation until deterministic FSRS replay and migration are implemented. **Never infer definitive FSRS state solely from the last note revision across two devices.**

## Current browser code

- `src/app/outbox_core.js`: pure, tested processor for ordered, durable operations, conflict isolation and safe retry.
- `src/app/sync_browser.js`: account-isolated IndexedDB outbox, atomic local snapshot/event staging and Supabase transport. **Not wired to the existing main Store or UI yet.**
- Existing `src/app/store.js` remains the active local/Claude-capability store. The prepared app still runs offline without a cloud account.

## Remaining integration tasks, in order

1. Sign-in UI (email OTP) and auth redirect settings for GitHub Pages; keep anonymous local cards intact until explicit migration. No service-role key in clients.
2. Connect `LemmaCloud.startAccount` to existing `Store` behind a feature switch; inject signed-in user ID from `supabase.auth.getUser()` and use a per-user database.
3. Update the review session to assign a stable `event_id` at answer time and persist **both** review event and card snapshot in a single transaction before confirming completion. Add an import path for old 6-field log entries without destroying duplicates.
4. After a successful note commit, atomically update the last server revision and rebase **later local operations on that same note** before acknowledging the queue. If a remote writer raced, preserve local data and surface a reviewable conflict.
5. Reconstruct card scheduling from all immutable review events in deterministic chronological order with FSRS parameter version, time zone, and device clock drift handling; never silently discard historical review data.
6. Implement pull on login/reconnect/resume and Realtime subscriptions as invalidation. Cursor-based incremental pull must be gap-free across concurrent transactions; use a properly designed durable change ledger, not a naive `updated_at` cursor.
7. Surface unambiguous sync states: `saved on device`, `pending upload`, `conflict`, `confirmed on cloud`. Never claim cloud confirmation from a local write alone.
8. Test same-card reviews offline on two devices, concurrent edits, account switching, sign-out during upload, rate limits, network drop after server commit and recovery from corrupted metadata.
9. Hook into plan/checkpoint UI and authenticated cross-model connector; verify that a tutor cannot publish over a newer plan revision.

## Testing so far

`node test/outbox_core.js` passes queue-ordering, isolation, offline retry and idempotency tests. `node test/sync_merge.js` passes old note merge regression checks. Supabase migration and schema inspection succeeded, security advisor reports zero findings. Full end-to-end sync and browser/Android tests are **not yet passing or claimed**.


## October 26 — explicit snapshot transfer milestone
The repository now contains `src/app/cloud_bridge.js` with owner-authenticated paginated cloud reads and manual copy-missing operations. Settings exposes two buttons. They intentionally do NOT automatically reconcile concurrent review logs, update existing notes, copy profiles or enroll cards in continuous sync. Before using, export a backup. Card uploads use `commit_note` revision-zero inserts, skipping server-present IDs. Download copies only IDs absent locally. Live sync remains blocked until review-event reconciliation, conflict UX, atomic local writes and auth isolation tests pass.


## Astra durability checkpoint — 26 October 2026

See [audit and next gates](SYNC_AUDIT_2026-10-26.md). Account DB version 2 allocates queue sequence in the transaction; UUID/timestamp order is not authoritative for new writes. `stageReview` now takes the complete note snapshot, seven-field log entry (stable UUID), and optional expected revision, and commits snapshot/event/outbox together. Local review and Undo await transaction completion. Account RPC/pull requests explicitly pin the checked JWT. Direct client note-table writes are revoked in deployed migration `20261026121817`; use `commit_note`.

**Still gated:** the main Store has not switched to Supabase account mode. Review retractions, scheduling provenance/replay, account enrollment, conflict UI and automatic orchestration remain required. An attempted operation is potentially committed remotely; never discard it to implement Undo. Keyset full scans avoid offset shifting but do not promise a consistent snapshot or a commit-safe incremental cursor.

## Reuse of the original scheduler and account-cache lifecycle (Oct 26, 2026)

The original `src/fsrs.js` remains the only source of scheduling and replay mathematics. The previous duplicate `ReviewLedger.replayMemory` was removed. `ReviewLedger.fsrsInput` only validates and adapts immutable review events (after retractions) for `FSRS.replay`; it explicitly rejects incomplete/ambiguous replay inputs rather than producing fictional due dates.

`src/app/session.js` records optional actual scheduling provenance for new reviews, including the card produced by the original `FSRS.preview`. `AccountStorage.stageUndo` stages a restored card snapshot plus immutable retraction in a single IndexedDB transaction, preserving outbound operation order. Cloud Undo is still not connected to the active local review UI.

`src/app/account_sync.js` now uses the existing `LemmaCloud.startAccount` to warm and refresh a **private, account-scoped cache** at login, reconnect and foreground, and receive owner-filtered Realtime invalidations. It never injects account snapshots into the existing anonymous `Model` or `Store`; the Settings cache status is independent of the local card save indicator. Until account migration, profile reconciliation and deterministic multi-device review convergence are verified, automatic active-card sync remains disabled. No anonymous cards are uploaded merely by signing in.
