# Lane D — study plan and checkpoints (PLAN-01)

Next action: finish PR #83 P1 gates and merge after SHIP-A1 parity; then P2 durable, explicitly unapproved plan drafts. P1 includes `supabase/migrations/<ts>_plan01_append_only_events.sql` (revoke client update/delete on `learning_events`, keep owner insert/select; add tests in `test/stack_study_events.js` over two local identities incl. duplicate `event_id` retry) and create `src/app/study_plan.js` with the `StudyPlan` contract from `docs/SHIP_PLAN.md` (`ready:false`), unit-tested in `test/study_plan.js` with a mocked client.

| Field | Value |
| --- | --- |
| Status | P1 implementation staged in draft PR #83; CI and migration parity dependent on lane A SHIP-A1. Not merged or production-applied. |
| Task | PLAN-01 — gate in `plan.md` §2 and `docs/SHIP_PLAN.md` |
| Owns | see `lanes.json` lane D |
| Existing backend | `study_plans`, `study_plan_versions` (client read-only), `study_checkpoints` (owner CRUD), `learning_sessions`, `learning_events` (owner **all** — not yet append-only), `tutor_handoffs`; RPC `publish_study_plan` (idempotent by `p_request_id`, expected revision). Accepted contexts: `get_accepted_study_context` (lane A). |
| Slices | P1 append-only events + `StudyPlan` client · P2 draft → review → approve (publish) with local durable drafts in D's own IndexedDB namespace scoped by user id · P3 `StudyView` checkpoint screen (objective, attempt, hints, feedback, evidence, next action) · P4 amendment diff + accept, mid-proof resume, stale rejection · P5 gate run on local stack, then set `ready:true` |
| Production | Never apply migrations yourself; after merge, add the file to SHIP-A2 by noting it here and A applies it. |

**Requests from other lanes:** none yet. **Requests to other lanes:** SHIP-B1 (Study tab wiring) is already open on B via `docs/SHIP_PLAN.md`.

## Active claim — P1

- Run: `chat-20261028-lane-d-p1-1508` · heartbeat: 2026-10-28T09:45:11.253Z UTC (agent active).
- Branch: `lane-d/plan-01-p1-events-client`; base `main@1653e401`; tested SHA: local mock exercise only; exact-head CI pending.
- Scope: `supabase/migrations/*_plan01_*.sql`, `supabase/tests/plan01_*.sql`, `src/app/study_plan.js`, `test/study_plan.js`, `test/stack_study_events.js`, this handoff.
- Next action: inspect migration/schema and cloud account patterns; implement append-only rules and StudyPlan's guarded, revision-safe client; run unit/build/lane and applicable stack gates. Keep `ready:false`; no student auto-approval or production deployment.
- Implementation: `20261028094500_plan01_append_only_events.sql` revokes event updates/deletes and adds a CAS + retry-safe `record_study_event` RPC; `src/app/study_plan.js` implements `activeContext` and `recordEvent`; `test/study_plan.js` and `test/stack_study_events.js` test guards and local authenticated RLS.
- Validation: JavaScript source and tests parsed successfully; direct mocked StudyPlan invocation succeeded. Exact-head CI pending; no claim of local-stack, browser, live-production or full PLAN-01 acceptance. Study view remains hidden.
- Cross-lane request SHIP-A1 (A): migration parity must admit new `*_plan01_*` migrations without weakening the 12-item baseline; active in A PR #82. Merge ordering: A #82 first; then run D head local-stack parity. SHIP-A2 (A): once this PR is merged, deploy migration version `20261028094500` through exact-version CLI and verify under plan production gate. No D production writes.
- Next action: inspect actual CI at HEAD, fix failures, reconcile `main`, merge only on required green checks; then start PLAN-01 P2.
- Blockers: SHIP-A1 dependency until PR #82 merges; production deployment separately owned by A.

## Active claim — P2a durable unapproved drafts

- Run: `chat-20261028-lane-d-p2a` · heartbeat: 2026-10-28T10:01:48.925Z.
- Branch: `lane-d/plan-01-p2-durable-drafts`, base `main@28d7672`. Task: PLAN-01 P2a, local unapproved draft persistence only.
- Scope: `src/app/study_plan.js`, `test/study_drafts.js`, `docs/lanes/D.md`. No backend migration, no shared files.
- Next action: implement owner-isolated IndexedDB draft transactions with local CAS, account-change guards and offline persistence; test crash/reload and two-account isolation. Publication and approval are **not** part of this slice; plan P2b explicitly reviews and approves drafts via existing `publish_study_plan` RPC.
- P1: merged via PR #83, main commit `28d767209e7a6ad8c17a3bc1ec09847e1b611479`, exact-head regression/local stack/Android SUCCESS. P1 migration remains lane A SHIP-A2 production work.
