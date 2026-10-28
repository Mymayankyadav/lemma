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
