# Phase 2 — Synced-learning backend contract

**Backend:** Supabase project `yemqnhnztlbyxmjxidis` (Mumbai; separate from Carrel). **Status:** DB migrations deployed; application connection in progress.

## Tables now present

- User's flashcards and profile: `notes`, `profiles`.
- Append-only review ledger: `review_events`.
- Private math library: `learning_sources`, `learning_sections`, `learning_card_links`.
- Safe retry receipts: `client_mutation_receipts`.
- Strong-model plan system: `study_plans`, `study_context_files`, `study_plan_versions`, `study_checkpoints`.
- Tutoring history/handoff: `learning_sessions`, `learning_events`, `tutor_handoffs`.

All 14 exposed tables have RLS enabled. An October 26 security-advisor check returned zero security findings.

## Authenticated RPCs

**`commit_note(note_id, expected_revision, request_id, data, delete=false)`**
- An expected revision of zero creates a note; a later revision must match exactly.
- Conflicting writes return `stale_note_revision` rather than overwriting newer work.
- Stable UUID request IDs permit idempotent retries after transport timeout.
- Deletions are tombstones; offline clients can discover them.

**`publish_study_plan(plan_id, expected_revision, request_id, title, objective, snapshot, change_summary, context_id?, expected_context_revision?, author_model?)`**
- Publishes accepted plans atomically and creates an immutable version record.
- Conflicting writes return `stale_plan_revision`.
- Supports the dedicated high-effort planning session and explicit amendment workflow.

Public RPC wrappers use SECURITY INVOKER. Privileged implementations live in an unexposed schema, require authentication, and scope data to `auth.uid()`.

The `review_events` table permits authenticated owners to insert and select their own events. Updating or deleting review events is denied.

## Source code status

The latest prepared application archive is `lemma-phase2-source.zip` in the conversation. It includes:
- All existing cards, FSRS-6, proof-step, editor, browse and statistics code.
- `src/app/outbox_core.js`: tested ordering, retries, idempotency IDs and conflict isolation.
- `src/app/sync_browser.js`: per-account IndexedDB staging and Supabase transport.
- `test/outbox_core.js`: passing unit tests.
- `docs/PHASE2_SYNC_CONTRACT.md`: integration contract and remaining acceptance tests.

**IMPORTANT:** GitHub repository currently contains the planning documents and migrations only. The large source archive is not imported; the connected GitHub interface cannot directly upload a ZIP from the working container. The new sync modules are NOT yet activated by the app's active `Store`. Do not mark cloud synchronization as complete.

## Next execution checklist

1. Import the unzipped `lemma-phase2-source.zip` **contents** to repository root; do not overwrite the newer GitHub planning documents or migration history.
2. Install dependencies, commit package-lock, and run CI/browser builds.
3. Add explicit Supabase sign-in and activate the new outbox only after tests.
4. Generate stable review UUIDs, atomically stage review + note, reconcile cross-device FSRS histories.
5. Cross-device, offline, auth isolation, GitHub Pages, and Android smoke tests.
6. Implement authenticated Claude/ChatGPT learning-state connectors.

Never embed a service_role key in GitHub Pages or the Capacitor app.
