# Tutor handoff v1 (TUTOR-01)

This is the portable **student-facing data contract**, not a host-specific AI API. The user chooses a tutor, copies a Markdown packet, and pastes back its JSON reply. The T1 implementation is deliberately hidden (`TutorHandoff.ready === false`) until T2–T4 acceptance gates pass. `docs/STUDY_PLANNING_PROTOCOL.md` is the product contract.

## Export: `TutorHandoff.exportPacket(ctx)`

`ctx` is the **approved** `StudyPlan.activeContext()` result, optionally enriched with student-reviewed `misconceptions`, `nextTutorAction`, `pendingPlanAmendment` and `citedExcerpts` (each `{ref,text}` with a ref in `sourceRefs`). The pure method returns `{markdown,json}` synchronously; it never queries another context or source.

The packet (`schema: "lemma.tutor_handoff.v1"`, `contract_version:1`) includes context and plan IDs/revisions, checkpoint ID/state/objective, session ID, the last attempt event ID **and actual attempt text**, hint level, misconceptions, citation IDs, cited excerpts, next tutor action, and pending amendment marker. Unknown input fields are ignored. No credentials, raw knowledge collection, full documents, hidden reasoning or whole conversation are implicitly exported.

Cited excerpts must match a source reference (at most four, 1,600 characters each); the complete Markdown is limited to **32 KiB UTF-8**. Excessively long proofs or packets fail explicitly rather than silently losing part of the proof. Literal Markdown fences in evidence are Unicode-escaped in the JSON representation.

The packet is not account authorization. T2 must re-read `StudyPlan.activeContext()` and compare ID, revision and checkpoint before any student-approved write.

## Reply: `TutorHandoff.parseReply(text)`

Accept one JSON object or a single complete fenced JSON object with **exact** fields:

```json
{
  "schema": "lemma.tutor_reply.v1",
  "contract_version": 1,
  "plan_id": "00000000-0000-4000-8000-000000000001",
  "checkpoint_id": "compactness-open-cover-proof",
  "expected_plan_revision": 5,
  "events": [
    {"event_id": "00000000-0000-4000-8000-000000000002",
     "type": "hint", "payload": {"level": 2, "question": "Which separation axiom do we use?"}, "source": "ChatGPT"}
  ],
  "card_proposals": [
    {"proposal_id": "00000000-0000-4000-8000-000000000003",
     "type": "basic", "title": "Compact Hausdorff",
     "front": "What must be proved?",
     "back": "A compact subset of a Hausdorff space is closed.",
     "tags": ["topology"], "requires": [],
     "source_refs": ["topology-notes:section-3.2"]}
  ],
  "amendment_proposal": null
}
```

`amendment_proposal` can alternatively contain `{proposal_id, expected_revision, snapshot, change_summary, source?}`. Its revision must match the root revision. Event types match D's StudyPlan contract: `objective`, `question`, `attempt`, `hint`, `feedback`, `misconception`, `proof_step`, `mastery_evidence`, `source_read`, `flashcard_link`, `session_note`. Cards use the existing `basic`, `reverse` or `cloze` types.

Event IDs and proposal IDs are UUIDs, unique **across the entire reply**. Retry an accepted event with the same ID and identical payload; new evidence receives a fresh ID. `parseReply` returns `{ok,events,cardProposals,amendmentProposal,errors}` and **never writes or approves anything**, schedules a card, or awards mastery. On any error it returns `ok:false` and **zero accepted items**; unknown fields, malformed revisions, duplicate IDs, unsafe JSON keys, unsupported types and oversized inputs are rejected (reply max **64 KiB**). Successful parsing is not verification of mathematical correctness.

## T2–T4 integration gates

- **T2:** copy/paste handoff sheet with explicit **per-item student consent**. Validate active ID/revision/checkpoint before every approval, never auto-rebase stale changes, and never insert unreviewed cards through `App.newCard`.
- **T3:** persist approved evidence through D's owner-scoped `StudyPlan.recordEvent` and proposed amendments through `StudyPlan.proposeAmendment`, preserving retry IDs; existing editor handles cards with provenance. Test stale writes and account isolation on disposable local Supabase before enabling.
- **T4:** verify Claude→ChatGPT→Claude resumes the exact unfinished proof/hint level, and approved cards keep provenance and original FSRS. Only then enable `ready:true` and expose the UI.

The T1 test `node test/tutor_packet.js` uses a **mock** StudyPlan and canned replies; it does **not** establish production, local-stack, card approval or real-tutor acceptance.

## T3b1: student-reviewed card editor staging

A checked card proposal enables **Review card in editor**, never an automatic insert. Lemma rechecks the current owner/workspace and the published plan revision/checkpoint and refuses source references not present in the active approved checkpoint. The existing editor opens with the proposed front/back, type, dependencies and a clearly labelled, student-visible provenance footer (plan ID/revision, checkpoint, proposal UUID and claimed source references). The tutor's references remain untrusted until the student verifies them. The student must press **Add card** in the editor to persist anything; opening, parsing, selecting and leaving the editor do not approve a card or alter FSRS. The existing editor does not accept arbitrary typed provenance metadata or prefill tag lists: add tags manually if desired. This slice does not claim durable audit receipts, duplicate-proposal suppression across separate editor saves, or T4 acceptance. Keep `TutorHandoff.ready=false`.

## T3b2: amendment drafts are not plan approval

After reviewing a tutor reply, a student can independently check the **Plan amendment** proposal and choose **Stage unapproved amendment draft**. This validates the active owner/workspace, accepted context revision, published plan revision and checkpoint again, then delegates to `StudyPlan.proposeAmendment` with the tutor's original proposal UUID and canonical `tutor_handoff.v1` provenance. The resulting draft is stored in D's owner-namespaced **local IndexedDB**, not automatically sent to Supabase. Uncertain saves may be retried with the same proposal ID and identical contents. A conflict with another pending draft is shown rather than overwritten.

**Not an approval:** the button never invokes `StudyPlan.approvePlanDraft` or `submitApprovedPlanDraft`, never changes the published plan, never grants mastery, and does not automatically save a card. The student must separately review the structural diff and explicitly approve the amendment in the Study interface when that flow is enabled. This feature remains hidden while `TutorHandoff.ready === false`; audit receipts and cross-model T4 gate remain unfinished.

## T3c1: immutable metadata-only handoff audit receipts

Migration `20261028120000_tutor01_handoff_receipts.sql` adds owner-private `tutor_handoff_receipts` and the authenticated `record_tutor_handoff_receipt` RPC. It accepts a caller-generated receipt UUID, plan UUID, expected **published** plan revision, approved checkpoint ID, a bounded action from `packet_exported`, `reply_reviewed`, `evidence_recorded`, `card_editor_opened`, `amendment_draft_staged`, an artifact UUID and an optional *untrusted* tutor label (maximum 80 characters). It stores **no raw study content, tutor messages, source excerpts, tokens or private proofs**.

The RPC uses owner isolation, verifies the published plan and checkpoint, and returns the original immutable receipt for identical retry input, including after a later plan revision is published. A matching ID with changed fields fails. Authenticated table privileges permit owner-scoped SELECT only; direct INSERT/UPDATE/DELETE and anonymous access are denied.

**This table is an audit of client-reported interaction metadata, not proof of a model identity, student approval, recorded mastery, or a successfully saved card.** The client must only submit an action after the related deliberate step and not call it for an unapproved plan. A later T3c2 slice wires the RPC into selected actions while retaining its original UUID across ambiguous response failures; T3c1 alone makes no client calls or production changes. Lane A must deploy the exact migration version before any cloud audit integration is enabled. Disposable local-stack RLS and concurrent retry tests live in `test/stack_tutor_receipts.js`.
