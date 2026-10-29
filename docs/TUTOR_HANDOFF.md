# Tutor handoff v1 (TUTOR-01)

This is the portable **student-facing data contract**, not a host-specific AI API. The user chooses a tutor, copies a Markdown packet, and pastes back its JSON reply. The T1 implementation is deliberately hidden (`TutorHandoff.ready === false`) until T2–T4 acceptance gates pass. `docs/STUDY_PLANNING_PROTOCOL.md` is the product contract.

## Export: `TutorHandoff.exportPacket(ctx)`

`ctx` is the **approved** `StudyPlan.activeContext()` result, optionally enriched with student-reviewed `misconceptions`, `nextTutorAction`, `pendingPlanAmendment` and `citedExcerpts` (each `{ref,text}` with a ref in `sourceRefs`). The pure method returns `{markdown,json}` synchronously; it never queries another context or source.

The packet (`schema: "lemma.tutor_handoff.v1"`, `contract_version:1`) includes context and plan IDs/revisions, checkpoint ID/state/objective, session ID, the last attempt event ID **and actual attempt text**, hint level, misconceptions, citation IDs, cited excerpts, next tutor action, and pending amendment marker. Unknown input fields are ignored. No credentials, raw knowledge collection, full documents, hidden reasoning or whole conversation are implicitly exported.

Cited excerpts must match a source reference (at most four, 1,600 characters each); the complete Markdown is limited to **32 KiB UTF-8**. Excessively long proofs or packets fail explicitly rather than silently losing part of the proof. Literal Markdown fences in evidence are Unicode-escaped in the JSON representation.

The packet is not account authorization. T2 must re-read `StudyPlan.activeContext()` and compare ID, revision and checkpoint before any student-approved write.

When Study selects a checkpoint, the handoff requests that same plan and checkpoint on opening and on each fresh copy or proposal-action check. A changed plan, missing checkpoint, stale proof or failed read blocks the action; the selected checkpoint is never silently replaced with Study's default.

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

Hint event payloads must include an integer `level` from 0 to 20, representing the resulting level; ordinarily a new hint uses the current packet's `hint_level` plus one. The packet tells tutors this requirement. Both parsing and the atomic evidence client reject an invalid hint before a write, so a selected hint cannot be recorded without the level that Study needs to reconstruct it. The student still reviews the content and level; the client does not determine whether the mathematical hint is appropriate or enforce monotonicity.

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

## T3c2a: guarded receipt transport (not UI-connected)

`TutorHandoff.recordReceipt({receiptId,planId,checkpointId,expectedPlanRevision,action,artifactId})` calls the existing authenticated owner-scoped `record_tutor_handoff_receipt` RPC. The caller **must supply and persist its own UUID**; the transport never generates a new key on retry. This is a deliberate-action metadata endpoint, not an automatic proof/card/plan approval. The RPC writes no tutor text; `tutor_label` is intentionally null. The client rejects invalid IDs/actions and stale/changed owner/workspace, checks identity both after token acquisition and after the HTTP call, refuses offline calls, and verifies the returned receipt ID/revision/timestamp. Network ambiguity returns a retry-with-identical-ID error, not a false audit success. `test/tutor_receipt_client.js` exercises those conditions without accessing production.

**Still disabled:** the handoff sheet does *not* invoke this method; `TutorHandoff.ready` remains false. T3c2b must durably queue and retry audit for a successfully recorded study event or staged amendment, and avoid claiming an editor-opened card was saved. A must apply and verify migration `20261028120000_tutor01_handoff_receipts.sql` before enabling live audit. T4 cross-model, production and explicit student consent gates are still separate.

## T3c2b: transactional evidence and audit (backend only)

Migration `20261028155500_tutor01_atomic_event_receipt.sql` adds an authenticated owner-scoped `record_tutor_evidence_with_receipt` RPC. It invokes existing `record_study_event` with forced source `tutor_handoff.v1`, then `record_tutor_handoff_receipt` with `receipt_id = artifact_id = original event_id`, action `evidence_recorded`, in the **same PostgreSQL transaction**. The output contains both immutable receipts. A failed second call rolls back any newly inserted learning event, preventing orphaned audit metadata; exact-parameter retries return the same event and receipt after lost responses, including when a newer plan revision is published. A changed payload is rejected, not overwritten. This does not make model output authoritative or approve mastery automatically.

`test/stack_tutor_atomic.js` verifies exact concurrent retries, two-owner and anonymous isolation, stale revision rejection, canonical provenance, forced audit ID conflict rollback, and historical retry over a disposable local GoTrue/PostgREST stack. No live frontend call exists yet: `TutorHandoff.ready` stays false. T3c2c must connect the student-selected event action to the atomic RPC with unchanged event IDs and error handling, only after Lane A confirms the **previous 14 migrations** and applies this additional version safely. Card editor opening and local-only plan amendment staging remain separate non-approval actions; do not falsely claim they were persisted to the cloud or audited by this RPC.

## T3c2c: student-selected atomic evidence saving (client)

When a student checks and saves one parsed tutor event, `TutorHandoff.open` calls `recordEventWithAudit` rather than the unpaired `StudyPlan.recordEvent`. The request goes to the already-deployed `record_tutor_evidence_with_receipt` RPC with the original `event_id`, exact published plan revision/checkpoint, event type and validated bounded JSON payload. The server assigns the canonical `tutor_handoff.v1` source. A successful save requires matching **both** immutable returned event and audit receipts (event ID, audit ID, plan revision, positive event sequence, session UUID and audit timestamp); missing or mismatched receipts are treated as uncertain, never as a confirmed save.

The client rechecks the same account identity epoch (including same-user logout/relogin), workspace and authenticated token around every network await; offline and unexpected backend errors fail closed. If a response is lost, the **same event UUID and identical input** remain selected on the current sheet for retry, and the server transaction returns the existing event and audit without duplication. Partial success across multiple selected events is displayed accurately. Pasting, parsing, selecting or viewing a proposal makes no write; cards still need the existing editor's **Add card** action and amendment drafts still need separate student approval. `test/tutor_atomic_client.js` and `test/tutor_record.js` verify these safeguards. No production test identities were created by this slice.

`TutorHandoff.ready` remains **false** until real Claude→ChatGPT→Claude continuation, source/provenance and checkpoint acceptance gates are completed. A private RPC deployment is necessary but never sufficient evidence of real tutor behavior or student approval.

## T4a: deliberately opened acceptance preview — interface contract

The normal tutor sheet remains **unreleased** (`TutorHandoff.ready === false`) until a genuine student-operated cross-model T4 pass. Lane E now provides `await TutorHandoff.openForAcceptance({planId, checkpointId})`, specifically so Lane D can present a **separate, clearly labelled, explicit-click** acceptance action inside an already-ready Study checkpoint. This is not a hidden route, automatic unlock, host API connection or permission to approve a study item. It is a QA entry API, and is deliberately **not wired into production navigation** by E.

The preview API requires `StudyPlan.ready === true`, `StudyView.ready === true`, a signed-in owner, valid selected plan/checkpoint IDs, an unblocked workspace and online access. The sheet re-reads the exact approved checkpoint and rejects identity-epoch, client, owner or workspace changes across that read. It displays a conspicuous acceptance-only disclosure. Copy still rechecks current proof/context before sending data to the clipboard; Save, Card review and Amendment draft each require a separate student selection and freshness guard. Merely opening the sheet does not write any evidence, card or plan.

**E-T4-ACCESS-01 → D/integration (OPEN):** D must introduce an acceptance-only Study action with a clear consent/unfinished-feature label and the same typed/unconfirmed evidence + account/workspace guards as its merged #190 standard entry. Call E's `openForAcceptance` only on the student's explicit click; keep the standard button hidden until `TutorHandoff.ready === true`. Exercise a real built bundle and 390px/desktop light/dark screenshots without forcing `ready` or seeding a real account. Once deployed to a reviewed acceptance environment, the **owner** must personally perform the three fresh-model sessions, inspect math/provenance and approve or reject each item. Keep that result private (never publish raw proof/conversation). E can then propose normal readiness independently. Failure/withdrawal rolls back the acceptance entry, not the persisted student's approved evidence.

Synthetic tests `test/tutor_acceptance.js` cover the preview guards, including a same-owner relogin or workspace change *during* its awaited read, plus zero automatic writes. The browser suite `test/tutor_visual.js` captures the preview label in four viewports/themes; neither proves a live T4 result.

## T4: genuine cross-model acceptance (NOT YET PASSED)

This is a **manual, owner-operated acceptance test**, not an AI integration or a request to approve plans on the owner's behalf. It may run only after Lane D has independently verified and enabled access to a **student-approved** active checkpoint through Study. At this checkpoint the production migration history has 16 exact versions, including the tutor audit and atomic event RPC (Lane A applied and verified in [run 40736286767](https://github.com/Mymayankyadav/lemma/actions/runs/40736286767)). Study was independently enabled by D [#172](https://github.com/Mymayankyadav/lemma/pull/172) (`StudyView.ready=true`). The ordinary Study tutor entry prepared in D [#190](https://github.com/Mymayankyadav/lemma/pull/190) is still hidden until `TutorHandoff.ready=true`, which requires T4. The separately reviewed acceptance-preview path in T4a resolves the sequencing without opening normal navigation; mock CI and unapproved drafts do not pass T4.

### Test case and retained state

Use one approved checkpoint for the theorem “A compact subset of a Hausdorff space is closed.” Record the true current `plan_id`, published `plan_revision`, stable `checkpoint_id`, accepted context revision, a pinned valid source reference and a **real unfinished student proof attempt**. Before copying the first packet, confirm its `last_student_attempt_event`, exact unfinished attempt text, and `hint_level=H` came from the saved learning-event ledger. Do not insert synthetic mastery evidence or seed a production identity to fake the test. Check the Markdown export remains within 32 KiB and includes only bounded cited excerpts.

1. **Claude → Lemma:** Paste the bounded exported packet into Claude (or the chosen external first tutor). Instruct it to continue the unfinished proof by asking one useful question, not to solve it or infer mastery, and to answer using the exact `lemma.tutor_reply.v1` JSON contract. Back in Lemma, paste the complete JSON, verify matching IDs/revision, manually select one meaningful event and press Save. Confirm both the immutable study event and its audit receipt are saved and the original event UUID is used on retry.
2. **ChatGPT continuation:** Refresh the approved checkpoint from Lemma and export a *new* packet. Verify that the exact original unfinished student attempt is still included and hint level H reflects any deliberately saved hint. Paste that packet into ChatGPT in a separate session with no prior transcript. Ask it to resume at the same proof point; do not provide the hidden earlier Claude conversation. If a new hint is deliberately accepted, save it as a new event with a new UUID and confirm the next packet's level is H+1 (or the actual accepted level), not a fabricated completion.
3. **Return to Claude:** Export once more, start a new Claude session with only that packet and confirm it can recognize the same still-unfinished argument, the latest saved hint level, accepted source reference and appropriate next question. It must not claim a completed proof, card acceptance or plan change merely because feedback was displayed.
4. **Consent and stale controls:** Deliberately review one card proposal in the existing editor; no card exists until the student presses Add card. Verify its visible plan/checkpoint/proposal/source provenance and original FSRS scheduling. Stage one tutor amendment only as an unapproved local draft, inspect its diff separately in Study, and do not publish without explicit student approval. A reply against a superseded approved revision must fail instead of overwriting evidence. A lost-response retry must reuse the original event ID and not duplicate its audit/event.
5. **Record sanitized evidence:** Capture only non-sensitive pass/fail outcomes with tested app SHA, actual published revision/checkpoint, the two directions of handoff, exact IDs retained across retries, and any failures. Do **not** publish the raw student's private proof, model conversation, credentials or source excerpts in a public PR. A real owner-operated result is mandatory; CI, mocks or this checklist alone never authorize `TutorHandoff.ready=true`.

### Release gate

If any real response is malformed, the student rejects it or either model cannot resume the exact proof and hint level, keep the handoff entry points hidden and TUTOR-01 open. If all acceptance cases pass, Lane E opens a **separate** readiness PR with the evidence, checks that `StudyView.ready` is already independently accepted, and asks Lane B to expose navigation only when both owning `ready` flags are true. No automatic AI account linkage or paid-model request is required for core study.

## T3g: fresh proof validation before copying a handoff

The **Copy packet** action is an explicit student gesture, not an automatic tutor connection. A sheet displays a frozen approved checkpoint snapshot; another device can publish a new plan, complete a checkpoint, change the proof/hint/session, or replace its accepted context while the sheet is open. Copy now re-reads `StudyPlan.activeContext()` and checks the original account identity epoch/client, workspace and reviewed packet's plan/context revisions, checkpoint state, proof/feedback/evidence/next-action event IDs, hint level, session and cited references **before** calling the clipboard helper. A stale, offline or unverifiable packet is **not copied by that button**; its old text is cleared from the sheet and the user is instructed to reopen a fresh handoff. A validated packet may use the existing manual-selection fallback if browser clipboard permission is unavailable.

This is a **client-side freshness check at the time of the copy gesture**, not a transactional lock on another device, proof of model identity or a way to revoke a packet already shared. The user should use the validated Copy action rather than manually copying an old visible packet. The original `TutorHandoff.ready=false` and student approval gates remain unchanged. `test/tutor_copy_freshness.js` uses deterministic synthetic contexts to exercise stale plan, proof, hint, session, citation, owner and workspace changes; genuine Claude→ChatGPT→Claude T4 acceptance remains separate.

