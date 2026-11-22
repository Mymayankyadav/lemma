# CPU-only decoder implementation

Agent: chat-732640#d9k2 · Item: N219 · PR #1746

The Owner supplied [section 16](PLAN.md) and authorized implementation inside a PR, with no merge. This draft starts from main `d1b3135f99ae54d52b312f4b728c4460abdabc06`, which already contains PR #1738. The existing writing-aid strip, typed-evidence guards and Undo are the integration path. PR #1743 (replay measurement) and #1744 (tutor trial) remain separate.

## First milestone: implemented, browser qualification pending

The `writingDecoder` flag defaults to **false**. When enabled, an eligible typed prose
prefix can supplement the existing word pool using a lazily created worker. The existing
engine paints its suggestions while the optional path loads and remains the fallback.
Only the lowercase prefix reaches the worker; drafts, transcripts, account identifiers,
and personalization records do not. Strict mode and zero-prefix suggestions retain the
existing path. No new automatic correction is enabled.

The lexicon contains 49,232 lowercase ASCII words in a 1,688,748-byte JSON asset. Its
sources are pinned SCOWL spellings, curated math terms, filtered existing mathlib counts,
and an older AOSP LatinIME English dictionary. Source bytes and full notices are checked
in for offline regeneration. The score is a heuristic unigram prior, not a probability.
See [asset attribution](../../../../public/models/writing-decoder/unigram-v1/ATTRIBUTION.md).

An exact range-max prefix index retrieves up to 64 candidates by frequency over the whole
matching range. Candidate tags survive serialization and duplicate merging. The editor
validates the message, reapplies its permissions, preserves vetted baseline lane priority,
and uses the existing three-slot selector and personalized ordering.

### Conservative admission rules

- One- and two-letter stems keep the original behavior. The worker starts at three letters.
- Rare vocabulary retains the original three/four-letter floors.
- Balanced reuses the original neutral-writing/visible-spelling permission function.
- Newly admitted words absent from the baseline candidate pool need at least five letters
  and 80% of their spelling typed, unless they are in the existing explicit neutral-writing
  allowlist. The lexicon is not treated as a semantic classifier. This protects previously
  unseen properties such as `abelian` without enumerating every mathematical adjective.
- Known proof-word families, quantifiers, polarity and original risk tags require strong
  visible spelling even if metadata is absent. The enabled path also closes the baseline's
  weak `cont` → `continuity` gap. Flag-off behavior stays unchanged.
- Candidate retrieval never supplies a correction, next word, tutor answer, operand, or
  new learner-authored evidence. Existing ghost and edit surfaces remain unchanged.

### Loading, cancellation and failure

The worker verifies asset byte length and SHA-256 before parsing/indexing. Only verified
public bytes enter CacheStorage; a corrupt cache entry is removed, and denied storage
falls back to a verified fetch. Android reads the packaged asset without this cache.
The JSON asset is excluded from the existing PWA precache by its file-type pattern.

There is one cold-load continuation, coalescing typed prefixes to the latest query. A
worker-startup deadline survives per-query cancellation, and the network load has an
independent abort deadline. A malformed reply, failed module/asset, timeout or runtime
failure retires the worker for that editor; it is not recreated on every keystroke.
Off, mode, owner/editor scope, and learning-generation changes dispose the old worker.
Replies still require the exact current editor/selection/mode/anchor snapshot before
display. The existing acceptance and Undo path is retained.

## Evidence and remaining gates

The [fresh development replay](replay/REPORT.md) compares the unchanged omitted-argument
engine path with the actual 64-candidate expansion. In 24 fixed completion probes, pool
recall rises from 16 to 17 and displayed top-three recall from 16 to 17, with no lost
baseline success. Top-one remains 16. All 108 listed safety requests pass on the enabled
path; one pre-existing baseline failure is reported separately. This is development
regression evidence, not held-out accuracy, a recovered prior replay, or human performance.

See [VALIDATION](VALIDATION.md) for exact commands and tests. Browser cases are written,
but local Chromium execution is blocked by the host's socket restriction. Do not advance
to the next rollout stage on the strength of unit tests alone. Physical-phone latency,
memory, touch accuracy and tap savings remain unmeasured.

## Remaining plan stages

1. Finish the browser loading/fallback/staleness/acceptance/Undo gates and inspect current PR CI.
2. Prose/LaTeX corpus preparation, licensed provenance, trained/pruned/quantized n-grams and parity.
3. Measured keyboard geometry, consented taps, spatial priors and held-out fitting.
4. Fuzzy edit lattice, beam/completion search, space errors and calibrated posterior.
5. Tutor signal packs and guarded caches.
6. Entropy thresholds, family selection, stable slots and ignore feedback.
7. Personalized cache/spatial fitting and device qualification.

Each later stage remains default-off until its own specified gate passes. Large corpus
training, spatial fitting and automatic-correction certification have not been performed.

## Inputs to request after implementation

The companion specifications referenced by section 16, especially chapters 02, 03, 05–07
and 11–15; an optional deliberately supplied recent Lemma export and eventual consented
typing logs for chronological evaluation and fitting; a physical-phone trial after a
concrete test build is available. Those chapters were not present in this checkout or
the attachment. Public source acquisition and license research are implementation work,
not prerequisites to ask the Owner to do. No account credentials are needed for this checkpoint.

## Release hold

Keep this PR draft. Do not post the repository's Ready comment, enable automatic merge, merge, or deploy.
