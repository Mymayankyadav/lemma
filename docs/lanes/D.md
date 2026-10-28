# Lane D — study plan and checkpoints (PLAN-01)

Next action: PLAN-01 P1 — add `supabase/migrations/<ts>_plan01_append_only_events.sql` (revoke client update/delete on `learning_events`, keep owner insert/select; add tests in `test/stack_study_events.js` over two local identities incl. duplicate `event_id` retry) and create `src/app/study_plan.js` with the `StudyPlan` contract from `docs/SHIP_PLAN.md` (`ready:false`), unit-tested in `test/study_plan.js` with a mocked client.

| Field | Value |
| --- | --- |
| Status | New lane (integration 28 Oct). No work started. |
| Task | PLAN-01 — gate in `plan.md` §2 and `docs/SHIP_PLAN.md` |
| Owns | see `lanes.json` lane D |
| Existing backend | `study_plans`, `study_plan_versions` (client read-only), `study_checkpoints` (owner CRUD), `learning_sessions`, `learning_events` (owner **all** — not yet append-only), `tutor_handoffs`; RPC `publish_study_plan` (idempotent by `p_request_id`, expected revision). Accepted contexts: `get_accepted_study_context` (lane A). |
| Slices | P1 append-only events + `StudyPlan` client · P2 draft → review → approve (publish) with local durable drafts in D's own IndexedDB namespace scoped by user id · P3 `StudyView` checkpoint screen (objective, attempt, hints, feedback, evidence, next action) · P4 amendment diff + accept, mid-proof resume, stale rejection · P5 gate run on local stack, then set `ready:true` |
| Production | Never apply migrations yourself; after merge, add the file to SHIP-A2 by noting it here and A applies it. |

**Requests from other lanes:** none yet. **Requests to other lanes:** SHIP-B1 (Study tab wiring) is already open on B via `docs/SHIP_PLAN.md`.

## Active claim — P1

- Run: `chat-20261028-lane-d-p1-1508` · heartbeat: 2026-10-28 09:38 UTC.
- Branch: `lane-d/plan-01-p1-events-client`; base `main@1653e401`; tested SHA: none yet.
- Scope: `supabase/migrations/*_plan01_*.sql`, `supabase/tests/plan01_*.sql`, `src/app/study_plan.js`, `test/study_plan.js`, `test/stack_study_events.js`, this handoff.
- Next action: inspect migration/schema and cloud account patterns; implement append-only rules and StudyPlan's guarded, revision-safe client; run unit/build/lane and applicable stack gates. Keep `ready:false`; no student auto-approval or production deployment.
- Blockers: none known. Migration application delegated to lane A after merge.
