# Data model and store interface

Supporting reference; [../plan.md](../plan.md) owns scope and task order. Read current source/migrations for exact runtime contracts. Existing media below is compatibility data, not authorization for new image features.

## Note (one document / one row)
```jsonc
{
  "id": "lq3k9x2abc",            // client-generated, stable
  "deck": "Math::Analysis",       // '::' separates subdecks
  "type": "basic" | "reverse" | "cloze",
  "title": "Mean Value Theorem",  // optional; target of [[links]]
  "front": "Markdown + LaTeX", "back": "…",
  "tags": ["theorems"],
  "requires": ["<note id or title>"],          // explicit prerequisites
  "media": { "img1": "data:image/webp;base64,…" },  // referenced as ![](media:img1)
  "created": 1792724400000, "modified": 1792724400000,   // ms epoch
  "example": true,                 // optional, sample content
  "cards": {                       // one entry per card ordinal ("1", "2", cloze numbers)
    "1": { "st": 0, "due": 0, "s": 0, "d": 0, "last": 0, "step": 0, "reps": 0, "lapses": 0,
           "susp": false, "bury": 0, "flag": 0 }
  },
  "log": [ [ts, ord, grade, stateBefore, durationMs, kind] ]  // kind: 0 review, 1 practice, 2 reset
}
```
Newer review log entries may append a stable event ID and scheduling provenance; preserve those fields and older entries without inventing missing history. See `src/app/session.js` and `review_ledger.js`.

`st`: 0 new, 1 learning, 2 review, 3 relearning. `s` stability (days), `d` difficulty (1–10).
Minimal notes (deck/type/front/back) are accepted; `Model.sanitizeNote` fills the rest.

## Profile (one per user)
`{ v, settings, decks, examplesHidden, lastDeck, updated }` — `settings` holds FSRS parameters
`w` (21 numbers), desired retention, limits, steps, LaTeX preamble, etc. (see `DEFAULT_SETTINGS`).

## Store interface (src/app/store.js) — keep this contract
```
Store.init(handlers) -> Promise<{ notes: Map<id, note>, profile|null, mode }>
   handlers.notes([{ id, note|null }])   remote change arrived (null = deleted)
   handlers.profile(profile)             remote profile change
   handlers.status(status)               sync indicator changed
   handlers.snapshotAll() -> { notes[], profile }
Store.saveNote(note)        local/account commit promise; legacy host uses its queue
Store.deleteNote(id)        local/account commit promise
Store.saveProfile(profile)  local/account commit promise; legacy host is debounced
Store.saveReview(note, entry)
Store.undoReview(restored, eventId)
Store.whenSaved()           awaits tracked local writes; rejects recorded failures
Store.status() -> { mode: 'cloud'|'account'|'local'|'memory'|'loading', reason, pending, failed, offline }
Store.localLeftovers(), Store.clearLocal()
```
Local/account promise resolution means local durability, not server acknowledgment. Callers must retain recoverable drafts on failure. Existing Model wrappers and legacy host paths have different return behavior: inspect them before assuming an awaited UI operation is durable.

Keep domain writes behind Store and the existing account adapters. Safe account switching also involves `workspace_lifecycle.js`, Model/Session and async UI guards; it is not a one-file backend swap. Internal `activateAccount`/`deactivateAccount` are gated and must not be exposed before the canonical plan's sync acceptance checks.


## KNOWLEDGE-01 K1 schema preflight (claim)

Claim `hourly-20261028T0232Z-a-k1-preflight` (UTC heartbeat 2026-10-28T02:32:22Z). Scope: inspect existing context/source/section schema and document a bounded owner-scoped revision/citation contract in this A-owned file. This is an inspection/design slice only; no migrations, runtime writes, product approvals, or production changes. Await UI-01 promotion PR #52 before asserting K1 implementation readiness. Evidence and precise follow-on will be appended here.

### Observed schema and trust boundaries (read-only audit, 28 October 2026)

The following describes the nine existing migrations on `main@a108dd5`, not a deployed K1 API. The live production schema is not queried in this slice.

| Existing object | Verified contract | Gap before KNOWLEDGE-01 acceptance |
| --- | --- | --- |
| `study_context_files` | Owner-keyed `(user_id,id)`, title, Markdown, JSON `source_refs`, positive `revision`, owner RLS; authenticated direct INSERT/UPDATE/DELETE | No immutable history, structured accepted context, compare-and-swap or idempotent write. A revision column alone does not prevent lost updates. |
| `study_plan_versions` | Immutable-looking snapshots by `(user_id,plan_id,revision)` with optional context ID/revision and owner read access; publication RPC checks the current context revision when supplied | No FK to an exact historical context revision. Publication/approval policy is PLAN-01 P1, not proof that tutor proposals are accepted. |
| `learning_sources` | Owner-keyed source UUID, type, citation JSON, metadata, optional storage path; authenticated direct writes and owner RLS | No source revision, accepted/proposed state, content cap or source-to-context scope; storage path is not permission to build uploads. |
| `learning_sections` | Owner-keyed section UUID with composite owner/source FK, locator, text, metadata and `(user_id,source_id,locator)` index | Locator is not unique or revision-qualified; text has no server-side size cap, no immutable snapshots and no bounded excerpt API. |
| `learning_sessions` / `learning_events` | Sessions reference owner-keyed plans; events reference owner-keyed sessions with unique event IDs | Plan/context scope is indirect. Existing review-event immutability does not establish learning-event immutability. |
| `publish_study_plan` | Public invoker wrapper delegates to private authenticated, revision-checked implementation; request ID deduplicates plan publication | Reuse its CAS/idempotency pattern; do not treat this RPC as a general context/source write API. |

These findings come from `20261026085028_initial_learning_state.sql`, `20261026090019_versioned_study_planning.sql`, `20261026090746_cards_reviews_sources.sql`, `20261026090844_atomic_plan_publication.sql`, and `20261026091125_harden_rpc_implementations.sql`. The note/profile write hardening in later migrations is a model for restricting direct writes, not permission to alter existing applied migrations.

### Proposed K2 data contract (not implemented)

**Scope and identity.** Use the existing `study_context_files.id` as a stable, owner-scoped **context/project key** for the first release; titles, model names and source filenames are not identifiers. An accepted plan version names `context_id` and `context_revision`; its sessions/events inherit the context through their plan and must never resolve a different owner's context. Attach each source to one context explicitly in an additive schema change, with composite owner/context FKs. If multiple contexts per project become a real requirement, introduce a separate stable project ID through an additive migration rather than silently reusing titles or rewriting historical IDs. Preserve existing null context references and historical rows; do not fabricate their scope.

**Accepted context v1.** A validated structured JSON object contains `goals`, `background` (with evidence status), `notation`, `learning_preferences`, `source_refs`, `constraints`, `recent_evidence_refs`, and `planning_requests`. All fields are optional with explicit empty defaults, text/array lengths bounded server-side, and source/evidence references validated to the same owner/context. Retain `context_markdown` as an editable human-readable projection, but do not allow an arbitrary Markdown overwrite to silently replace a newer structured revision. `context_id` remains stable and revision is a positive, monotone integer.

**History and writes.** Add an immutable, owner-scoped context revision ledger keyed by `(user_id,context_id,revision)` with a canonical accepted snapshot, provenance, timestamp and request ID/payload hash. A single authenticated CAS write accepts `(context_id,expected_revision,request_id,validated_payload)`, atomically advances the current row and inserts its revision; expected revision 0 is create-only. Exact retry with the same request/payload returns the original result, while a reused request ID with different content fails. A stale revision fails without mutating either row. Revoke direct authenticated writes to the accepted current row once the RPC and migration gates are tested; retain owner-scoped reads. Keep unaccepted tutor suggestions in a separate proposal state/record; only an explicit student action may promote a proposal to accepted history. Do not infer verified mathematical skill from a tutor assertion.

**Source and citation identity.** Preserve `learning_sources.id` and `learning_sections.id` as stable IDs; add immutable accepted source revisions and revision-specific section text snapshots. A citation is `(context_id,source_id,source_revision,section_id,locator)` with optional page/paragraph and bounded character range; include a text digest so edits or source replacement cannot silently redirect an old citation. Existing locator/title remain descriptive, never unique identity. Source metadata records kind, title, edition/URL when supplied, provenance, access scope, extraction status and removal/tombstone status. No external fetch, OCR, binary upload or unrestricted storage-path access is authorized by this contract. Removal must not silently rewrite historical citations; represent unavailable content explicitly.

**Bounded retrieval.** Define an owner-authenticated `get_knowledge_context(context_id,expected_revision?,source_filters?,limit?)` returning only the current **accepted** context revision plus cited, version-pinned excerpts. Proposed default cap: at most 8 excerpts, at most 2,000 Unicode characters per excerpt, and at most 12,000 characters of excerpt text per call; the implementation must also enforce byte limits and a strict total JSON response budget. Paginate using stable source revision/section ID keys; never load all `text_content` rows or a full book into the client to slice afterward. Return citation IDs, source title/edition, locator, revision and digest alongside each excerpt. An explicit request for a stale accepted revision should return that immutable snapshot or a clear unavailable/revision error, never silently substitute the latest revision.

**Authorization and storage.** Reuse the `lemma_private` security-definer implementation plus narrowly granted public invoker RPC pattern, `auth.uid()` checks and an empty `search_path`. Every foreign key and read/write predicate must include the owner; RLS is defense in depth, not a substitute for checking referenced IDs inside a definer function. Restrict direct mutation of accepted snapshots and immutable revision tables, add immutable triggers as appropriate, avoid service-role keys in the client and never log private content or auth tokens. Only additive, reversible migrations are proposed; deployment follows the main plan's local-security, review, merge and production recovery gates.

### K2 verification required before claiming an implementation

1. Two authenticated identities: owner A can read its accepted context and cited excerpts; owner B cannot read, mutate, enumerate or attach A's context/source/section IDs through tables **or** RPC.
2. Two independent tutor sessions requesting the same accepted context revision obtain byte-identical canonical fields and citation identities, without receiving unrelated sources or the whole source collection.
3. Concurrent expected-revision writes yield one accepted next revision and one explicit stale conflict; a lost response/retry with the same request ID returns the same revision without duplicate history.
4. A tutor proposal remains invisible to accepted-context retrieval until explicit student approval; rejected proposals do not change accepted data or mark skills verified.
5. Source revision N citations remain pinned to N after source N+1 is accepted; edited/removed text yields a versioned excerpt or an explicit unavailable marker, never a silently changed quote.
6. Enforce caps at the SQL/RPC boundary, reject oversize payloads and cross-context references, verify index-backed bounded queries and preserve existing note/review/plan rows and offline outbox behavior.
7. Run migrations against a disposable local Supabase stack with actual HTTP auth/RLS, check migration parity and regression/Android gates. Production is **not** touched by this K1 inspection.

**K1 handoff:** This preflight defines a proposed contract only. The next bounded A slice should implement the smallest additive schema/RPC and actual tests after UI-01 promotion, then expose a durable client data path in a separate K2 slice. Lane B should not start a knowledge editor until the accepted revision and cited-excerpt APIs are implemented and verified. No owner approval, data migration, or full KNOWLEDGE-01 gate is claimed here.
