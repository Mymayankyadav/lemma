# Lemma — Strong-model planning and checkpoint protocol

**Status:** Supporting product contract, 2026-10-26; not a claim of completed implementation. [../plan.md](../plan.md) is the sole engineering roadmap and overrides scope/order here. Read this document only for KNOWLEDGE-01, PLAN-01 or TUTOR-01.

Shared knowledge is private to one owner across successive tutors. Curated text and source references come first; optional knowledge documents must have bounded retrieval and citations. New image upload, camera, OCR and image-tutoring features are out of scope. Engineering-agent handoff and the student's tutor handoff are different protocols.

## Core workflow

1. The student creates or updates a **curated context file**. It includes goals, background, notation/conventions, interests, constraints, source references (book/edition/chapter/pages), previous learning history and verified skills. It does not contain an entire textbook or an uncensored chat transcript.
2. The student deliberately chooses a strong reasoning model and effort level for **one dedicated planning session**. This planning model reads the context file, retrieves relevant source sections, asks only essential questions, and creates a precise learning plan.
3. Lemma stores the **approved plan revision**, including prerequisites, ordered checkpoints, assessment tasks, acceptance criteria, source references, and a concise public rationale. The plan is not owned by Claude, ChatGPT, or the conversation where it was generated.
4. Subsequent sessions run the plan with a suitable model. At the start, the tutor reads a small canonical context packet: context-file revision, approved plan revision, current checkpoint, recent attempts, known misconceptions, and current source slices.
5. After each meaningful proof attempt or checkpoint, the tutor records **student-visible evidence**: student's actual attempt, feedback, hints, skills demonstrated, next action. A checkbox is never treated as proof of mastery.
6. When the plan needs change, the tutor records a **proposed amendment** with reason, affected checkpoint IDs, prerequisite changes and expected effects. Do not silently replan the whole subject.
7. The student can accept an amendment, optionally using another strong-model planning session for a substantive revision. Preserve the old plan, plan diff, history and unaffected checkpoint progress.

The guiding split is **plan with strong reasoning; execute with interchangeable tutors; preserve evidence in Lemma**.

## Context-file contract

Canonical object, stored privately and versioned:
- `context_id`, `revision`, `title`, `last_updated`;
- `goals` (precise mathematical outcomes and any exam/course constraints);
- `background` (verified definitions/theorems, not assumed mastery);
- `learning_preferences` (Socratic guidance, hint ladder, notation/style, preferred difficulty);
- `source_refs` (stable document ID, edition, chapter, section/page, permission/access scope);
- `constraints` (weekly reading time if provided, priority topics, blocked prerequisites);
- `recent_evidence_refs` (links to past attempts and assessments);
- `planning_requests` (what this planning session should optimize).

A human-readable Markdown export may represent the same context, but structured fields and citations are canonical. Never insert hidden chain-of-thought or entire copyrighted source texts into this file.

## Detailed study-plan contract

Each approved plan revision has a stable `plan_id`, integer `revision`, `context_revision`, topic, scope, objectives, assumption list, prerequisite graph, and checkpoint array.

Each checkpoint has:
- Stable `checkpoint_id` (preserve across revisions unless fundamentally replaced).
- `title`, `objective`, `prerequisite_checkpoint_ids`, `source_refs`.
- `learning_tasks`: e.g. reconstruct theorem, justify a quantifier, prove a lemma, create counterexample, solve transfer problem.
- `mastery_criterion`: **observable proof of understanding**, not merely “read section.”
- `assessment_prompt`, optional `hint_policy`, `review_policy`.
- `status`: not_started / in_progress / blocked / demonstrated / review_due.
- Evidence event references and an explicit next suggested action.
- An optional estimated workload, never a mandatory schedule unless the user specified one.

Use small checkpoints that can be resumed mid-proof. The plan must cover source scope and important prerequisites, but it may branch if diagnostic evidence justifies it. The student may always override the suggested path.

## Amendments and version safety

- Every accepted material edit increments the revision and stores an immutable snapshot and a human-readable **what changed and why**.
- Proposed amendments are distinct from accepted plans. Execution tutors may suggest but must not independently erase the approved learning strategy.
- Use compare-and-swap: accept a plan update only against the expected latest revision. Reject stale writes and surface a merge/review path.
- Retain unchanged checkpoint IDs and mastery evidence. When a criterion materially changes, mark the checkpoint “needs reassessment” or assign a new ID; never transfer mastery invisibly.
- Store failed approaches and misconception corrections as learning events, not as rewrites to history.
- Support “return to revision N” by creating a *new* revision derived from N; do not delete intervening history.
- Record the source/model used to draft a plan as metadata, never as a trust guarantee.

## Cross-model handoff context packet

```json
{
  "contract_version": 1,
  "context_id": "uuid",
  "context_revision": 3,
  "plan_id": "uuid",
  "plan_revision": 5,
  "checkpoint_id": "compactness-open-cover-proof",
  "checkpoint_state": "in_progress",
  "objective": "Prove a compact subset of a Hausdorff space is closed",
  "last_student_attempt_event": "uuid",
  "misconceptions": ["finite subcover applied to a wrong family"],
  "hint_level": 1,
  "source_refs": ["topology-notes:section-3.2"],
  "next_tutor_action": "Ask for neighbourhoods separating x from each point of K",
  "pending_plan_amendment": false
}
```

`get_learning_context` must retrieve the current **approved** plan plus its revision and active checkpoint, not merely the newest unapproved draft. Both assistants must follow the same tutor protocol, honor source citations, and continue from the student's latest visible attempt. Handoff notes are summaries; events remain canonical.

## Planning and execution effort guidance

- **Initial complete plan or major amendment:** strongest available model, High effort. Choose manually; no automatic purchase or hidden model upgrade.
- **Difficult checkpoint redesign / inconsistent prerequisite graph:** strong model, Medium–High.
- **Normal Socratic lessons, proof critique, progress recording:** a capable standard coding/reasoning model, Medium–High as needed.
- **Cards, tagging, progress summaries and routine retrieval:** cheaper model or deterministic application logic.
- Never make daily continuation depend on having quota for the original planning model.

## Acceptance tests

1. Given context file v1, strong model generates a 12-checkpoint algebra plan with assessment criteria. Save approved plan v1.
2. Complete two checkpoints with visible, source-linked mastery evidence. A routine tutor reads v1, chooses checkpoint 3, and asks a useful next question.
3. Interrupt Claude mid-proof; ChatGPT resumes using only a bounded context packet, without full-text book upload and without supplying an unwanted solution.
4. A routine tutor proposes inserting a prerequisite before checkpoint 4. Previous completed checkpoints and their evidence remain unchanged.
5. Student accepts amendment. Plan v2 has a saved diff and all unaffected checkpoint identities, and both chatbots see v2.
6. A stale tutor tries to update based on v1 and receives a revision conflict instead of overwriting v2.
7. Change the model and repeat on Android and the web; offline local events sync without duplicating progress.

## Implementation mapping

- Existing `study_plans`: latest published plan and monotonic revision.
- Existing `study_context_files`: current curated context text and revision; full revision governance/history still needs verification.
- Existing `study_plan_versions`: accepted plan snapshots; reuse publication RPC and verify permissions.
- Existing `study_checkpoints`: stable per-checkpoint progress and evidence references.
- Existing `learning_events`: append-only student attempts, feedback, hints and mastery evidence.
- Existing `publish_study_plan` provides revision-aware publication. Verify context locking, complete idempotency metadata and approval authorization before exposing it. Amendment proposal persistence is still planned; do not recreate the publication mechanism.
- The app needs UI to edit context, run planning, inspect checkpoint progress, compare plan versions, and accept/reject amendments.
- The connector needs `get_planning_context`, `propose_plan`, `get_active_checkpoint`, `propose_plan_amendment`, `accept_plan_revision`, plus existing event/handoff/card tools.

**Execution order and acceptance gates:** use only `plan.md`. API names above describe the intended product contract; their presence here does not mean those tools already exist.

## PLAN-01 P1 event recording (implementation contract)

The owner-scoped `record_study_event` RPC accepts `p_plan_id`, `p_checkpoint_id`, `p_expected_plan_revision`, `p_event_type`, `p_payload` (a bounded object), `p_event_id` (caller-assigned UUID), and optional `p_source` (short provenance string). On a new event it atomically checks the current **published** plan revision and membership of the checkpoint in that revision's `snapshot.checkpoints`; a stale revision fails with `stale_plan_revision`. It appends to a single owner/plan active session, creating one if needed. It returns `{eventId, sessionId, seq, planRevision}`.

The immutable event payload contains `{data, checkpoint_id, plan_revision, source}`; `data` is the tutor/student-visible payload, not hidden reasoning. Retrying the **same** event ID with the same input returns the original receipt, including after a plan revision advances. Reusing an ID with different contents fails with `idempotency_key_reused`. Distinct concurrent event IDs share the plan's active session; previously accepted events are never overwritten. Clients retain the same ID across ambiguous network failures and must not display a write as saved until receipt verification.

Authenticated owners retain `SELECT` and `INSERT` on `learning_events` for compatibility, but `UPDATE` and `DELETE` are revoked with select/insert-only RLS policies. Direct owner inserts are **not** revision-checked, so the normal app and handoff integrations use the RPC and do not mistake a direct insert for accepted checkpoint mastery. No feature, including a tutor handoff, may approve a plan or amendment through this RPC. Local-stack tests exercise two independent users, concurrent retry, stale revision, foreign access and denied mutation.

Until P2–P5 gates pass, `StudyPlan.ready` remains false; `proposeAmendment` deliberately fails rather than publishing a tutor proposal. Offline event queuing and student-approved durable amendment drafts are separate later slices, not functionality implied by P1.

## PLAN-01 P2 local draft approval and publication (implementation contract)

Drafts are private to the signed-in owner and stored in `lemma-plan-drafts-v1-<user_id>` IndexedDB. The version-2 upgrade adds a separate `receipts` object store and retains version-1 `drafts` without backfill loss. A proposal is always `status:'draft'` until the student explicitly calls `StudyPlan.approvePlanDraft(planId, expectedLocalRevision, true)`. Approval atomically records `approved_pending`, `approvedBy:'student'`, immutable `requestId`, and the reviewed local revision. Repeated approval of that exact version returns the same request ID; it never publishes implicitly. A draft without a title cannot be approved.

`submitApprovedPlanDraft(planId)` is the **only** P2 accepted write path. Offline returns `queued` and keeps the intent; online it first persists an attempted marker, then calls the authenticated owner-scoped `publish_study_plan` RPC with the *original* `expectedRevision`, `contextId/contextRevision`, snapshot, change summary, and exact request ID. An ambiguous transport failure leaves the intent unchanged for a same-key retry. Once the server returns a valid new revision, a **single IndexedDB transaction** archives the receipt and removes the pending draft. Repeated calls return the confirmed receipt without republishing. An aborted receipt transaction leaves the approved intent intact for retry.

A server `stale_plan_revision` or `stale_or_missing_context` error changes the local intent to `needs_review`. It does **not** auto-rebase the snapshot, swap source revisions, amend prerequisites, or turn a tutor proposal into student consent. Conflict reopening/diff/restore belongs to P4, after explicit review. Account identity checks guard each asynchronous boundary, so a switched account cannot receive the previous owner's approval or receipt. The Study UI remains `ready:false` through later P3–P5 acceptance gates.

## PLAN-01 P4a immutable amendment comparison (implementation contract)

`StudyPlan.diffPlanSnapshots(accepted, proposed)` is a **pure**, offline-capable read-only comparison of two JSON snapshots, not an approval action. Both snapshots must contain 1–120 uniquely identified checkpoints and a valid directed acyclic prerequisite graph (no duplicate edges, dangling IDs or cycles); total serialized size is bounded to 100 KB per snapshot. Neither argument is modified. The output lists `added`, `removed`, `modified`, `unchanged`, `planFieldsChanged`, `reordered` and `requiresReassessment`. For each modified checkpoint, the field names and added/removed prerequisite edges are visible.

Stable checkpoint IDs survive insertions and reorderings. A changed mastery criterion, assessment prompt, learning task or review policy yields `requiresReassessment`; an accepted plan must never automatically retain mastery for that material change. Pure comparison neither reads nor writes account data, approves a tutor proposal, marks mastery, creates events, nor publishes a version. Subsequent P4b must bind the diff to a currently published, owner-scoped accepted revision, show it to the student and use the existing P2b explicit approval path; stale conflicts require a separately reviewed restart in P4c. `StudyView.ready` remains false pending P5.

## PLAN-01 P4c1 rejected amendment recovery (hidden until P5)

A rejected `publish_study_plan` request remains `needs_review` and is **never** automatically retried, rebased, or approved. `StudyPlan.reviewConflictedAmendment(planId)` reads the owner's original immutable published base, current published revision, accepted context, and local rejected approved intent. It returns separate old→student-proposed, old→server-changed, and current→student-proposed checkpoint diffs, plus overlapping checkpoint IDs. No database publication or evidence mutation occurs during inspection.

Only an explicit student restart may call `restartConflictedAmendment(planId, reviewedComparison, true)`. Before changing local state, the method re-reads the latest published revision/context and old intent, and rejects an outdated comparison or changed account. One atomic IndexedDB v2→v3-safe transaction archives the **entire rejected approved intent**, including its original request ID, in an owner-local `conflict_archive` store and stages a **fresh unapproved draft** with a new draft ID, current expected plan/context revisions, and incremented local CAS. On transaction abort, neither write survives. `readConflictArchive(planId, requestId)` can retrieve the preserved owner-private record. The new draft must undergo the ordinary P4b1 comparison and separate P2b student approval and publish actions; original approval is not transferable. Learning events, checkpoint IDs and prior proof/hint evidence are not deleted or rewritten. P4c2 still needs visible recovery actions and resumption verification, and `StudyView.ready` stays false through P5.
