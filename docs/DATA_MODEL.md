# Data model and store interface

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
Store.saveNote(note)        fire-and-forget; queued, one write in flight per note
Store.deleteNote(id)
Store.saveProfile(profile)  debounced
Store.status() -> { mode: 'cloud'|'local'|'memory'|'loading', reason, pending, offline }
Store.localLeftovers(), Store.clearLocal()
```
The UI never talks to the backend directly; swapping the backend only touches store.js.
