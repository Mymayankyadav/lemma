# Lane D — study plan and checkpoints (PLAN-01)

Next action: P5a disposable local Supabase integration demonstrating 12 checkpoints, two proofs, exact mid-proof resume, amendment, stale rejection and no duplicates; then P5b browser/visual acceptance and readiness decision. Study hidden until full gates.

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

## P4a active claim — immutable amendment comparison

- Run `chat-20261028-lane-d-p4a-owner` · heartbeat 2026-10-28T11:14Z · base `main@089b3f1`.
- Scope: D-owned `src/app/study_plan.js`, `test/study_diff.js`, `docs/STUDY_PLANNING_PROTOCOL.md`, this handoff. No backend/other-lane files or production data.
- Add a pure, bounded plan-snapshot comparison for proposed amendments: reject duplicate, dangling or cyclic checkpoint prerequisites; expose added/removed/changed/unchanged stable IDs, prerequisite edge changes and evidence-sensitive criterion edits. Do not approve or publish. Later P4b must read/version-pin accepted revision, render a student diff and call P2b approval only after consent; P4c must handle explicit stale conflict restart/mid-proof resumption.
- P3 PR #105 merged as [089b3f1](https://github.com/Mymayankyadav/lemma/commit/089b3f1500fb9cb927d5d26223864614a2699565); exact-head [regression 40677743107](https://github.com/Mymayankyadav/lemma/actions/runs/40677743107) and [local stack 40677742947](https://github.com/Mymayankyadav/lemma/actions/runs/40677742947) SUCCESS. Synthetic screenshots exist but direct visual inspection remains for P5. P3 intentionally `ready:false`.

### P4a implementation checkpoint

- `StudyPlan.diffPlanSnapshots` validates bounded checkpoint graphs (unique stable IDs, no duplicate/dangling/cyclic prerequisite edges), compares plan-level fields and checkpoint content, reports added/removed/changed/unchanged IDs and changed prerequisite edges, and flags changed mastery criteria/task/review policy for explicit reassessment. Pure read-only function: no RPC or student approval.
- `test/study_diff.js` exercises 12 checkpoints, a new prerequisite before checkpoint 4 preserving 11 unaffected IDs, criterion changes vs mere sources, reorder-only, malformed graphs, and argument immutability. Tests and CI at final head are **pending**. No production migration or user-data action.
- Next after CI/merge: P4b owner-scoped accepted-plan version lookup and student-facing diff/explicit acceptance. P4c conflict reopen and persistent mid-proof resume, P5 full gate; do not set either ready flag early.

## P4b1 active claim — owner-scoped reviewed amendment reads

- Run: `chat-20261028-lane-d-p4b1-owner` · heartbeat: 2026-10-28T11:21Z; base current `main@fee93bd` after P4a #110 merged with exact-head [regression 40678593209](https://github.com/Mymayankyadav/lemma/actions/runs/40678593209) / [local stack 40678593235](https://github.com/Mymayankyadav/lemma/actions/runs/40678593235) SUCCESS.
- Files: `src/app/study_plan.js`, `test/study_amendment_read.js`, this D handoff. P4b1 is **read-only**: fetch currently published owner-scoped `study_plans` and its exact immutable `study_plan_versions` snapshot, compare it to locally unapproved amendment draft using P4a, fail closed for missing, stale or mismatched context and identity switches. Never approve or publish; P4b2 handles visible student review and P2b explicit consent.
- Next: implement, test owner A/B, version mismatch, offline and no-write gates, run exact-head CI and merge if green. No production writes, `StudyView.ready=false`.

### P4b1 implementation checkpoint

- `StudyPlan.reviewPendingAmendment(planId)` reads the owner's unapproved durable draft, confirms exact published `study_plans.revision` and `study_plan_versions` snapshot and context pins, uses the P4a structural diff, then rechecks both cloud revision and local draft CAS before returning a preview. It fails closed for missing, stale, offline, identity-changed or approved/pending drafts. Does **not** approve or publish.
- `test/study_amendment_read.js` uses fake IndexedDB + authenticated mock transport to check 12 checkpoints, prerequisite addition, owner scoping, stale published revision, changed context, offline/missing records, identity switch and no RPC calls. Exact-head CI pending.
- Next: verify and merge P4b1, then P4b2 explicit student-reviewed diff and durable approval buttons, followed by P4c conflict restart/mid-proof continuity and P5 full acceptance. `ready:false`.

## P4b2 active claim — student-reviewed amendment UI

- Run `chat-20261028-lane-d-p4b2-owner`, heartbeat 2026-10-28T11:27Z, base `main@06c5f54` (P4b1 [PR #112](https://github.com/Mymayankyadav/lemma/pull/112) merged with exact-head regression 40679488760/local Supabase 40679488701 SUCCESS).
- Scope D-owned `src/app/view_study.js`, `src/styles/study.css`, `test/study_amendment_ui.js`, this handoff. No backend or other-lane writes. Hidden `StudyView.ready=false`.
- Expose a deliberate **Review pending amendment** action in the approved checkpoint view; show pinned server revision, change summary, stable checkpoint/prerequisite diff and reassessment warning. Student must explicitly approve reviewed draft via `approvePlanDraft`, then separately click Submit via `submitApprovedPlanDraft`; no auto-approval, no automatic network call on read, and stable retry intent from P2b. On reload, show existing `approved_pending` or `needs_review` without silently retrying/rebasing. Guard async UI after identity/workspace switches; use escaped text nodes only.
- Gate: synthetic VM and browser tests for review vs approval vs submit, stale, offline, pending receipt retry and identity guard; green exact-head CI, screenshots; full P5 acceptance and human visual check remain open.

### P4b2 implementation checkpoint

- `view_study.js` now includes a deliberately triggered **Review pending amendment** action that displays P4b1's exact accepted-vs-draft diff, affected prerequisite IDs and reassessment requirements. It requires a second explicit click to store student approval, then a third explicit click to submit via P2b's durable `submitApprovedPlanDraft` method; review, render and reload never perform publication. The existing `approved_pending` intent can be manually retried, while `needs_review` fails closed pending P4c. Account and route guards protect async completion.
- `test/study_amendment_ui.js` checks no implicit writes, visible review/approval/submit separation, pending intent after reload, stale state, identity switch. `test/study_view_browser.js` adds synthetic Chromium desktop/mobile diff screenshots plus distinct approval vs submission checks. Final-head CI not yet verified.
- Remaining: P4c explicit stale conflict restart and persistent mid-proof continuation; P5 complete local-stack acceptance, visual review and `ready` gates. Never approve a student plan or amendment on their behalf, and no production writes.

## Active claim — P4c1 explicit stale amendment restart

- Run: `chat-20261028-lane-d-p4c1-owner`, heartbeat 2026-10-28 (~11:49 UTC), base `main@9c7c5b636fda`. User requested continue; same Lane D owner from completed #94/#105/#110/#112/#115.
- D-owned scope: `src/app/study_plan.js`, `test/study_conflict_restart.js`, `docs/lanes/D.md`, optional `docs/STUDY_PLANNING_PROTOCOL.md`. No new migrations, production DB action, cross-lane edits or student action on the user's behalf.
- Goal: read-only compare the old student-approved conflict against the latest accepted plan/context and identify clobber/criterion changes; require separately explicit restart to store a *new unapproved draft* pinned to the latest revision. Transactionally archive the original approved intent including immutable request ID and prior snapshot, do not silently retry/rebase or delete proof/event history. Revalidate remote/current revision and same original conflict before local CAS, reject stale/concurrent switches, and keep StudyView hidden.
- Gate: synthetic owner A/B, reload, graph diff, stale version, offline, conflict archive, transactional abort, intentional double click and no network writes; exact-head regression/local stack and lane guard, merge only if clean. P4c2 UI and proof resume P5 remain open.

### P4c1 implementation checkpoint (28 October 2026)

- Added owner-scoped `reviewConflictedAmendment` to compare original immutable base, latest published revision and rejected student-approved snapshot. Exposes three structural diffs and overlapping checkpoint IDs, without RPC mutations.
- Added explicit-only `restartConflictedAmendment(..., true)`. It rechecks the latest published revision and accepted context before one atomic IndexedDB v3 transaction: archives old `needs_review` approval (including original request UUID) and creates a new **unapproved** draft with a new draft UUID, current revision/context pin and local CAS. Old proof/event ledger untouched. Archive readable via owner-scoped `readConflictArchive`. Aborted archive transaction leaves old approved intent intact.
- `test/study_conflict_restart.js` covers 12 checkpoints, same-checkpoint conflicting server/student edits, v2→v3 migration, stale/offline/identity guards, aborted write, explicit restart and separate new approval; CI pending. `StudyView.ready` remains false. Next P4c2 visible review/restart and mid-proof reload proof; then PLAN-01 P5 end-to-end local-stack and visual gates.

## Active claim — P4c2 conflict review controls

- Run `chat-20261028-lane-d-p4c2-owner` · 28 October 2026; base main@f2d136553c76 after P4c1 merged [PR #118](https://github.com/Mymayankyadav/lemma/pull/118). Regression 40683335793 and local stack 40683335833 both SUCCESS at P4c1 exact head.
- Scope `src/app/view_study.js`, `src/styles/study.css`, `test/study_amendment_ui.js`, `test/study_view_browser.js`, D handoff. No other lane files/backend writes.
- For durable `needs_review` state show Inspect conflict; only after explicit click retrieve owner-scoped old/proposed/current checkpoint changes and conflicts. A second deliberate click must call P4c1 restart; old approval archived, new proposal unapproved, never auto-approve/publish. Add stale, identity and reload mock/browser tests, screenshot small/mobile. `StudyView.ready=false` pending P4c3 and P5.

### P4c2 implementation checkpoint

- `view_study.js` now displays **Inspect rejected amendment** only for durable `needs_review`; an explicit click shows original vs current revisions, added/removed/modified checkpoint IDs, overlapping edits and reassessment risks. A separate **Restart as unapproved draft** action calls P4c1 owner-scoped atomic archive/restart, never reuses approval or publishes. If stale again, inspection must be repeated; reload/preview never restarts. Identity/route guards after each awaited operation.
- `test/study_amendment_ui.js` covers no implicit reads/writes, rejected conflict inspection vs restart, stale retry, owner switch while reviewing and no implicit publication. `test/study_view_browser.js` also produces conflict comparison desktop/mobile synthetic screenshots and checks narrow viewport and explicit restart.
- Exact-head CI pending. Next P4c3 mid-proof reload persistence test and P5 final local-stack plan gate. `StudyView.ready=false`; no production schema writes.

## Active claim — P4c3 reload-safe unfinished proof selection

- Run `chat-20261028-lane-d-p4c3-owner`; 28 October 2026; base main@f3b6656c0c73 after P4c2 [PR #120](https://github.com/Mymayankyadav/lemma/pull/120) merged and regression 40684267898 SUCCESS at exact PR head.
- Scope D-owned `src/app/study_plan.js`, `src/app/view_study.js`, `test/study_resume.js`, `test/study_view.js`, this handoff. No A/B/E/F/production edits.
- Fix resume selection when a plan has no manually `in_progress` checkpoint: detect most recently active unfinished proof/hint/session-note from the append-only event ledger for the approved revision and prefer its checkpoint; then show an explicitly activated `Continue saved proof` action that preloads the saved proof without writing, never overwrites unsaved text. Preserve status priority, account guards, exact hint level and current revision pin; no inferred mastery. Add page-reload, two-identity, multiple checkpoints, stale/offline tests. CI and P5 pending.

### P4c3 implementation checkpoint

- `activeContext()` now reads the approved plan's latest immutable session events before selecting a checkpoint. Explicit `in_progress` status still wins; otherwise the latest valid incomplete proof/step/hint/note from the same published plan revision wins over a first `not_started` checkpoint. Completed checkpoints and events tied to older plan revisions are excluded from inferred focus. This fixes the fact that `record_study_event` appends immutable events without changing `study_checkpoints.status`.
- Hidden `StudyView` includes an explicit **Continue saved proof** action that preloads the saved attempt without a cloud write. It never overwrites nonempty input or an unconfirmed event retry; saving the continued attempt still requires its own explicit event action.
- `test/study_resume.js` recreates the StudyPlan client after saved proof/hint events for two distinct checkpoints within a 12-checkpoint plan, tests revision/owner/offline guards and no implicit writes. `test/study_view.js` and `test/study_view_browser.js` check deliberate proof restoration. Exact-head CI pending.
- Next: P5 disposable local-stack gate for two demonstrated checkpoints, approved amendment and rejected stale writes; real browser/visual acceptance and `ready:true` only after all gates. No production writes, currently hidden.

## Active claim — P5a integrated real local-stack plan gate

- Run `chat-20261028-lane-d-p5a-owner` · 28 Oct 2026, base main@0bda2bb1aa73. P4c3 merged #121 at main@0bda2bb, regression 40686382580 and local stack 40686382505 both SUCCESS.
- Scope D-owned `test/stack_study_plan_gate.js`, `docs/lanes/D.md`, optionally D protocol for verified contract. No production or non-D files and no change to ready flags in this slice.
- Use two new real disposable local GoTrue identities, actual local PostgREST/RPC/owner RLS and the production StudyPlan module in a reloadable Node VM adaptor. Verify 12-checkpoint plan, two stored proof attempts/hints, exact checkpoint/attempt/hint resumption after re-instantiation, accepted prerequisite amendment preserving IDs/evidence, stale plan/event rejection and exact retry receipts without duplicate events, cross-owner isolation. Fail closed if local Supabase unavailable; test belongs in `test/stack_*` and is run by existing local CI automatically.
- After P5a green, P5b perform remaining desktop/mobile visual acceptance, inspect screenshot evidence, dependency/production migrations and make an evidence-based readiness decision, not automatic enablement.

### P5a implementation checkpoint

- Added `test/stack_study_plan_gate.js` using fresh disposable local GoTrue users and **actual** local HTTP PostgREST `publish_study_plan`/`record_study_event` RPCs and RLS, with a minimal HTTP builder running the unmodified `StudyPlan` module in a fresh VM after each simulated page reload.
- Covers a 12-checkpoint proof plan, distinct stored attempts/hints/feedback for checkpoints 3 and 7, resumption of the exact unfinished proof and hint level, a student-authorized test-only prerequisite amendment preserving 11 unchanged checkpoints and both old version and learning ledger, idempotent same-key publication/event retries, rejected stale writes, post-amendment proof continuation and another authenticated owner's read/write isolation.
- This is disposable synthetic identity evidence only; no production or real student approval was performed. Exact-head CI and local-stack acceptance **pending**. Remain hidden until P5b visual review and backend production prerequisite evidence are independently established.
