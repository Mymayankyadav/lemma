# Historical automatic flashcard sync audit — 26 October 2026

> **Historical evidence, not an execution plan.** The sole current roadmap is [../plan.md](../plan.md). Branch state, policies, findings and suggested A4/A5/A6 sequence below describe the audit at that time; later commits/migrations supersede several findings. Do not execute its old next steps without checking the current task and source. Preserve this record for investigation, not startup reading.

Scope: `Mymayankyadav/lemma`, Supabase `yemqnhnztlbyxmjxidis` only. Baseline repository commit `39dfffd772ba269ae49ff667e225635c7ecec51e`. Latest pre-audit Pages deployment: `6b07dfb66124207003f2b7ab1af1d7cef75f7c2f`, Actions run `40317373162`, successful. The newer tip was documentation. No Carrel resources were changed.

## What the app actually did

`Model.createNote`, `updateNote`, `saveScheduling`, `deleteNote`, bulk actions and imports call the original `Store`. That Store selects the old Claude capability or anonymous `lemma-flashcards` IndexedDB. Supabase authentication does not select an account store. `LemmaCloud.startAccount` was never called by the active app. Settings performed only explicit copy-missing transfers. No background upload, pull scheduler, conflict screen or cross-device FSRS reconstruction existed.

The original local Store coalesced writes in an in-memory queue; callers could not await it. Its status ignored pending IndexedDB writes. Failed local saves were dropped from the queue and could subsequently look saved. Profile saves waited 500ms in memory. Legacy migration cleared local cards before the cloud queue acknowledged them.

`Session.answer` appended a six-field log row and saved the whole note. `Session.undo` replaced the whole note with an old snapshot. That could overwrite later text edits. Uploading a separate immutable review event using that design would leave an undone answer active on the server. Neither concatenating review logs nor choosing the newest note snapshot is a correct FSRS merge.

## Implemented in this branch

### Checkpoint A1: active local persistence

- Local note/profile/delete transactions start immediately. Save promises resolve at transaction completion; failure stays visible. `whenSaved` is available to transfer callers.
- Status distinguishes saving, saved on device (sync disabled), and failure. Unload protection includes failed saves.
- Review history advances after persistence; failed reviews restore the displayed state. New log rows carry stable UUIDs in field 7, retaining compatibility with six-field history.
- Undo waits for persistence, preserves later text edits, and rejects intervening scheduling/history changes instead of overwriting them.
- Legacy migration retains the local source backup. Explicit cloud import waits for local durability before counting a copied card.

### Checkpoint A2: prepared account storage and transport

- IndexedDB schema v2 assigns queue sequence numbers in the same transaction as writes, across tabs. V1 queues retain their previous deterministic order during upgrade; their original intent cannot be reconstructed if timestamp ties already occurred.
- Review snapshot, immutable local event and both queue operations stage in one transaction. Duplicate event insertion aborts all of them.
- Acknowledgement validates the revision, updates metadata, rebases the next operation and removes the completed operation atomically. Dirty snapshots survive pull; late older snapshots cannot regress clean state.
- Persist an attempted marker before dispatch. A request with an uncertain response must keep its original idempotency key and cannot safely be cancelled by simply deleting the queue item.
- `startAccount` serializes flushes with Web Locks and stops handles on account changes. Requests bind the checked account's JWT explicitly, avoiding a shared-client auth race.
- Pull and manual transfer use keyset pagination rather than shifting offsets. Full scans must repeat after invalidation/resume; this is not a gap-free incremental change ledger.
- Auth subscribers run outside Supabase's auth callback lock, and delayed startup lookups cannot resurrect a signed-out account.

These primitives remain disconnected from the active Store until A4/A5 below. No cloud Undo compensation or scheduler replay is claimed.

### Checkpoint A3: backend contract and migration history

- Recovered four missing applied migrations verbatim from `supabase_migrations.schema_migrations`. The first two match deployed SQL apart from comments/formatting.
- Audited all owner policies, RPC definitions and execute grants. Public wrappers are invokers; private implementations validate `auth.uid()`. Review events allow SELECT/INSERT and have an update/delete rejection trigger.
- Found direct note-table grants bypassing CAS and allowing hard deletes. Deployed `20261026121817_enforce_note_rpc_writes`: client note writes now require `commit_note`; owner reads and constrained RPC writes continue to work. No existing rows changed.
- Transactional SQL checks with two synthetic authenticated identities passed for creation, retry deduplication, reused-key rejection, stale revisions, tombstones, forbidden direct writes, review immutability and cross-account isolation. All fixtures rolled back. These are database-role tests, not a claim of two real browser login sessions.
- Security advisor returned zero findings after deployment. Realtime publication contains notes, profiles and review events, but the app still has no subscriber.

## Historical proposed sequence and gates — superseded by plan.md

### A4 — review ledger semantics (priority at audit time)

1. Define append-only review retractions keyed by event ID, with owner-scoped foreign keys and idempotent append RPC. Undo must append a retraction even when the original upload timed out; never delete historical cloud events.
2. Atomically commit reviews/retractions and sufficient scheduling provenance: algorithm/version, parameter set, learning steps, retention, scheduling timestamp (including preview time), rollover/timezone, deterministic seed and load-balancing policy. Current `review_events` lacks these fields.
3. Define a durable baseline for imported six-field history and its materialized card state. Preserve repeated identical legacy rows; do not deduplicate by timestamp or six-field value. Ambiguous imports need a reviewable policy rather than silently inventing history.
4. Replay active events in a documented total order, apply retractions, exclude cram events from scheduling, preserve suspend/bury/flag behavior, and explicitly model reset/reschedule/type changes. Local load balancing and daylight-saving boundaries cannot be left device-dependent.
5. Gate: two independent caches converge to identical states after simultaneous offline reviews, out-of-order delivery, Undo before/after upload, crash-after-commit, duplicate delivery and reset/retraction combinations. Golden FSRS tests alone do not establish distributed replay correctness.

### A5 — activate account Store and orchestration

1. Bind the entire Model and profile/settings to one account database; cancel old subscriptions/workers and discard old view references on auth change. Handle offline startup with the cached session, validating operations server-side on reconnect.
2. Explicitly enroll anonymous notes by durable copy with backup retention. Never adopt shared anonymous data just because a user signed in. Existing manual imports are deliberate local copies and remain in the shared anonymous store after sign-out; they are not an isolated cloud cache.
3. Route every note/review/Undo/delete/import/reset/bulk action through transactional account staging. Implement a distinct local-save status versus queued, confirmed and conflicted cloud status, plus recovery for storage failure.
4. Flush automatically on local commit, online/reconnect and foreground; bounded backoff and auth recovery, no busy loops. Subscribe to owner-filtered Realtime as invalidation and retry pull on subscription recovery. Use repeated full scans initially; introduce a commit-safe change ledger before claiming incremental gap-free sync.
5. Conflict UI preserves both versions and the ancestor/base revision; resolve content and scheduling independently. Never mark a dirty conflicting snapshot as confirmed.
6. Gate: fault-injected two-browser tests and two authenticated live identities, including sign-out during upload, offline deletions, account A/B/A changes, browser restart, profile divergence and failed networks.

### A6 — planning, connectors and Android

After A4/A5 gates pass, proceed to context/plan/checkpoint UI, amendment review, scoped cross-model tools and Capacitor releases per the main roadmap. Auth/profile/plan write permissions need further hardening before those features ship.

## Additional backend findings to resolve before planning UI

- `learning_events` still has owner ALL policies: append-only is a product requirement, not currently enforced there.
- Direct writes to `study_plans`, direct insertion of `study_plan_versions`, and mutable `study_context_files` can bypass publication/revision governance. Profiles also lack a revision-aware write RPC.
- `publish_study_plan` compares retry snapshot/plan ID but not all mutable metadata, and does not lock the context row against concurrent edits. These need contract tests before connectors can use it.
- Review immutability triggers also affect cascading account deletion. Account erasure needs a separate reviewed, explicit server workflow.
- No claim was made about configured API exposed schemas beyond the observed RPC surface/permissions; verify that `lemma_private` remains unexposed when changing API settings.

## Verification

New tests: `test/sync_storage.js` (IndexedDB adapter with fake-indexeddb), `test/local_persistence.js` (actual Store and Session), extended Chromium e2e review/Undo reload checks, `test/browser_sync.js` (two browser caches, two tabs, actual Web Locks and a fault-injected mock RPC server), and `supabase/tests/note_write_contract.sql`.

The broader regression run exposed two previously unexecuted test defects: an ESM `__dirname` error and overly strict relative-only FSRS tolerances near zero. The comparison now permits the reference library's documented eight-decimal rounding (absolute tolerance 1e-7 days plus the existing 1ppm relative bound); scheduler state/interval checks remain unchanged. It also exposed a real closed-scratchpad pointer blocker, fixed with `.scratch[hidden]`.

Local syntax, storage, outbox, merge, FSRS, rendering, browser UI and two-browser adapter checks passed. Production Supabase multi-device login/sync remains unverified.

The new regression workflow runs syntax, storage, outbox, merge, FSRS, rendering and browser tests on development branches/PRs. Browser assertions and unexpected console errors now return nonzero. Service workers are intentionally blocked in this UI suite; offline PWA caching still needs its own release test. Local Chromium verification uses a separately supplied headless binary because the default download endpoint returned an invalid archive; no browser binary/dependency is included in the app.

Reference checks: Supabase changelog and API grant documentation, auth callback deadlock guidance, plus installed supabase-js 2.102.0 / postgrest-js source for per-request Authorization headers. The announced 10 November 2026 TLS cipher removal does not require a modern-browser code change; minimum Android WebView verification remains part of native release testing.
