# Lane D — study plan and checkpoints (PLAN-01)

Next action: P3 checkpoint study screen on `lane-d/plan-01-p3-checkpoint-screen`: render approved objectives, last proof, hint level, feedback/evidence/next action and explicit append-only study events; keep Study tab hidden until P5.

| Field | Value |
| --- | --- |
| Status | P1 merged PR #83 (main@28d7672); local stack, regression and Android CI passed. P1 migration production application still delegated to lane A. P2a merged PR #91 (main@04b339f), exact-head regression/local stack/Android SUCCESS; P2b merged PR #94 as main@87daaaa; exact-head regression 40675654109 and local Supabase 40675654119 SUCCESS. P3 claimed. |
| Task | PLAN-01 — gate in `plan.md` §2 and `docs/SHIP_PLAN.md` |
| Owns | see `lanes.json` lane D |
| Existing backend | `study_plans`, `study_plan_versions` (client read-only), `study_checkpoints` (owner CRUD), `learning_sessions`, `learning_events` (owner SELECT/INSERT only; P1 RPC revision-safe), `tutor_handoffs`; RPC `publish_study_plan` (idempotent by `p_request_id`, expected revision). Accepted contexts: `get_accepted_study_context` (lane A). |
| Slices | P1 append-only events + `StudyPlan` client · P2 draft → review → approve (publish) with local durable drafts in D's own IndexedDB namespace scoped by user id · P3 `StudyView` checkpoint screen (objective, attempt, hints, feedback, evidence, next action) · P4 amendment diff + accept, mid-proof resume, stale rejection · P5 gate run on local stack, then set `ready:true` |
| Production | Never apply migrations yourself; after merge, add the file to SHIP-A2 by noting it here and A applies it. |

**Requests from other lanes:** none yet. **Requests to other lanes:** SHIP-B1 (Study tab wiring) is already open on B via `docs/SHIP_PLAN.md`.

## Active claim — P1

- Run: `chat-20261028-lane-d-p1-1508` · heartbeat: 2026-10-28T09:45:11.253Z UTC (agent active).
- Branch: `lane-d/plan-01-p1-events-client`; base `main@1653e401`; tested SHA: local mock exercise only; exact-head CI pending.
- Scope: `supabase/migrations/*_plan01_*.sql`, `supabase/tests/plan01_*.sql`, `src/app/study_plan.js`, `test/study_plan.js`, `test/stack_study_events.js`, this handoff.
- Next action: inspect migration/schema and cloud account patterns; implement append-only rules and StudyPlan's guarded, revision-safe client; run unit/build/lane and applicable stack gates. Keep `ready:false`; no student auto-approval or production deployment.
- Implementation: `20261028094500_plan01_append_only_events.sql` revokes event updates/deletes and adds a CAS + retry-safe `record_study_event` RPC; `src/app/study_plan.js` implements `activeContext` and `recordEvent`; `test/study_plan.js` and `test/stack_study_events.js` test guards and local authenticated RLS.
- P1 gate: [regression](https://github.com/Mymayankyadav/lemma/actions/runs/40668221525), [local Supabase](https://github.com/Mymayankyadav/lemma/actions/runs/40668221441), [Android](https://github.com/Mymayankyadav/lemma/actions/runs/40668221585) SUCCESS on tested PR #83 head; merged as [28d7672](https://github.com/Mymayankyadav/lemma/commit/28d767209e7a6ad8c17a3bc1ec09847e1b611479). P1 only; full PLAN-01 still open.
- Cross-lane request SHIP-A1 (A): migration parity must admit new `*_plan01_*` migrations without weakening the 12-item baseline; active in A PR #82. Merge ordering: A #82 first; then run D head local-stack parity. SHIP-A2 (A): once this PR is merged, deploy migration version `20261028094500` through exact-version CLI and verify under plan production gate. No D production writes.
- Next action: inspect actual CI at HEAD, fix failures, reconcile `main`, merge only on required green checks; then start PLAN-01 P2.
- Blockers: SHIP-A1 dependency until PR #82 merges; production deployment separately owned by A.

## Active claim — P2a durable unapproved drafts

- Run: `chat-20261028-lane-d-p2a` · heartbeat: 2026-10-28T10:01:48.925Z.
- Branch: `lane-d/plan-01-p2-durable-drafts`, base `main@28d7672`. Task: PLAN-01 P2a, local unapproved draft persistence only.
- Scope: `src/app/study_plan.js`, `test/study_drafts.js`, `docs/lanes/D.md`. No backend migration, no shared files.
- Next action: implement owner-isolated IndexedDB draft transactions with local CAS, account-change guards and offline persistence; test crash/reload and two-account isolation. Publication and approval are **not** part of this slice; plan P2b explicitly reviews and approves drafts via existing `publish_study_plan` RPC.
- P1: merged via PR #83, main commit `28d767209e7a6ad8c17a3bc1ec09847e1b611479`, exact-head regression/local stack/Android SUCCESS. P1 migration remains lane A SHIP-A2 production work.

### P2a progress and contract

- `StudyPlan.savePlanDraft(input)`, `readPlanDraft(planId)`, `discardPlanDraft(planId, expectedLocalRevision)` and `proposeAmendment(input)` operate solely on the owner-namespaced `lemma-plan-drafts-v1-<user_id>` IndexedDB database. They never call Supabase, publish a plan or mark approval.
- Draft snapshots retain `expectedRevision`, `contextId/contextRevision`, `source`, `changeSummary`, stable `draftId` (tutor `proposalId` if supplied), status `draft`, and local CAS `localRevision`; independent tabs cannot silently overwrite. Same proposal ID and identical contents are safe to retry; changed contents require a new proposal ID and updated local revision.
- `test/study_drafts.js` covers unapproved offline persistence and reload, two owners, idempotency, concurrent CAS, aborted writes, account switches, deletion and invalid proposals. CI verification at final PR head pending.
- P2b must add an explicit student approval transition with an immutable request key and durable `approved_pending` record; only then call `publish_study_plan` using original revision/context and stable request ID, archive receipts and surface stale conflicts for review. Never auto-approve a tutor proposal or assign `ready:true` before P5.

## Active claim — P2b student-approved publication

- Run: `chat-20261028-lane-d-p2b` · heartbeat 2026-10-28T10:19:26.446Z; base `main@04b339f4`.
- Scope: `src/app/study_plan.js`, `test/study_approval.js`, `docs/lanes/D.md`. Parent P2a merged PR #91. Use existing `publish_study_plan` RPC; no production migration.
- Next: implement explicit student-approval intent in per-owner durable storage, stable request UUID, authenticated CAS publish, server receipt, stale-conflict review, network-failure retry; add isolated fake IndexedDB tests. Leave `ready:false` and no implicit tutor approval.

### P2b implementation and verification

- Added a version-2 local `receipts` store to the owner-scoped IndexedDB namespace, preserving P2a draft rows on upgrade. `approvePlanDraft(planId, localRevision, true)` persists immutable student consent and original CAS revision/request UUID offline; tutor proposals remain draft-only.
- `submitApprovedPlanDraft(planId)` uses existing owner-filtered `publish_study_plan` RPC only for durable `approved_pending` intents. Preserves the same request ID on unknown network results, archives confirmed receipt and deletes intent in one IDB transaction; never silently rebase stale plan/context revision, returning `needs_review` instead. `readPlanReceipt` supports exact confirmation after restart.
- `test/study_approval.js` covers v1→v2 upgrade, no consent/no network, queued offline submission, lost response, aborted local receipt, stable retries, owner isolation, changed identity and stale approval conflicts. Exact-head CI pending. This is not full PLAN-01 acceptance; P3–P5 remain, and no production schema writes in D.

## Active claim — P3 hidden checkpoint screen (owner-directed continuation)

- Run: `chat-20261028-lane-d-p3-owner` · heartbeat 2026-10-28T10:58Z; base `main@87daaaa`.
- Scope: D-owned `src/app/view_study.js`, `src/styles/study.css`, `src/app/study_plan.js` (read-only latest evidence enrichment), `test/study_view.js`, this handoff. No shared or backend files.
- Build a checkpoint-specific view of an **approved** plan only: objective, latest unfinished attempt, hint level, feedback, evidence and next action. Only deliberate student input calls `StudyPlan.recordEvent` with stable per-attempt UUID; never implicitly claim mastery or approve a plan. Guard identity/workspace after every await and fail closed for missing/unapproved/offline contexts.
- Tests: draft-only/unapproved not shown, loading/empty/error, stale route/identity, explicit event types, retry with same ID, no implicit writes, guard, syntax, full regression/build; screenshots after hidden view can be exercised. Keep `StudyView.ready=false` through P4/P5.
- P2b prior owner-directed takeover fixed one IndexedDB abort matcher without weakening rollback assertions; exact-head regression [40675654109](https://github.com/Mymayankyadav/lemma/actions/runs/40675654109) and local stack [40675654119](https://github.com/Mymayankyadav/lemma/actions/runs/40675654119) SUCCESS; merged #94 as 87daaaa. Production migration application remains Lane A only.

### P3 implementation checkpoint (28 October 2026)

- `src/app/view_study.js` adds a hidden, owner/workspace-guarded checkpoint view with published objective, latest attempt, hint level, feedback, evidence, next action and source references. Explicit input only appends attempt/hint/feedback/mastery-evidence/session-note events with `recordEvent`; retrying an ambiguous response keeps the same event UUID and text. Saved evidence never auto-sets mastery or approves a plan.
- `src/app/study_plan.js` adds bounded read-only `lastFeedback`, `lastEvidence`, `nextAction` fields selected from the existing immutable 50-event slice. Existing plan/context/version owner and accepted-revision checks remain intact.
- `src/styles/study.css` scopes responsive checkpoint presentation. `test/study_view.js` exercises approved vs absent/stale/signed-out context, deliberate writes and stable retries/account switching; `test/study_view_browser.js` generates synthetic desktop/mobile Chromium screenshots with a hidden-only fixture (not production Pages or real accounts).
- Branch head last edited with tests and sign-out handling; **exact-head CI pending**, no P3 gate claimed, no student data/production writes. Next: fix any regressions, obtain screenshots for the final head, merge only after green gates; then P4 amendment diff/explicit acceptance and proof-resumption safeguards.
