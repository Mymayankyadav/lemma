# Lemma — Strong-model planning and checkpoint protocol

**Status:** Adopted product requirement, 2026-10-26. This is a design specification, not a claim that the full workflow is implemented.

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
- New `study_context_files`: current curated context text and revision.
- New `study_plan_versions`: immutable snapshot of each accepted plan version.
- New `study_checkpoints`: stable per-checkpoint progress and evidence references.
- Existing `learning_events`: append-only student attempts, feedback, hints and mastery evidence.
- Future `plan_change_proposals` and atomic revision-commit API enforce approval and optimistic concurrency.
- The app needs UI to edit context, run planning, inspect checkpoint progress, compare plan versions, and accept/reject amendments.
- The connector needs `get_planning_context`, `propose_plan`, `get_active_checkpoint`, `propose_plan_amendment`, `accept_plan_revision`, plus existing event/handoff/card tools.

**Priority:** This is part of the critical product workflow in Phase 3 and must be integrated into Phase 4 model handoffs. A basic usable planning/checkpoint UI should ship before advanced adaptive tutors, not be deferred as optional polish.
