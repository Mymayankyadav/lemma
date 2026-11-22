# CPU-only decoder implementation

Agent: chat-732640#d9k2 · Item: N219 · PR #1746

The Owner supplied [section 16](PLAN.md), then the [companion chapters 01–14](source-plan/README.md), and authorized implementation inside a PR, with no merge. This draft starts from main `d1b3135f99ae54d52b312f4b728c4460abdabc06`, which already contains PR #1738. The existing writing-aid strip, typed-evidence guards and Undo are the integration path. PR #1743 (replay measurement) and #1744 (tutor trial) remain separate. [Contract reconciliation](SPEC_RECONCILIATION.md) records how the supplied chapters constrain this CPU-only task.

## First milestone: implemented, browser qualification pending

The `writingDecoder` flag defaults to **false**. When enabled, an eligible typed prose
prefix can supplement the existing word pool using a lazily created worker. The existing
engine supplies a fallback pool while the optional path loads. When the flag is enabled,
the same enabled admission guards filter that pool before its first display and after
worker failure; flag-off behavior remains the original comparison path.
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
and uses the existing three-slot selector and personalized ordering. Expanded ranking
adds the existing compact context contribution to the unigram prior through the same
pure scorer used by the baseline. Its original coefficients, tokenization, bounded
learner window and zero/one/two-context-word policy are retained. This reuses the sparse
context already in the app; it does not train the later proposed corpus-scale n-gram.

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

An audit against supplied chapter 07 exposed that the first integration painted an
unguarded baseline before the worker reply. Two hook regressions reproduced the weak
`cont` → `continuity` display during pending and failed loads. The fallback now runs
through the enabled policy with an empty decoded list, retaining safe baseline offers
without waiting for the worker. The same property is checked in the browser scenarios.

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
coverage at the selected prefix rises from 16 to 17 and displayed top-three hits from 16 to 17, with no lost
baseline success. Top-one remains 16. All 108 listed safety requests pass on the enabled
warm and guarded-fallback paths; one pre-existing baseline failure is reported separately. This is development
regression evidence, not held-out accuracy, a recovered prior replay, or human performance.

See [VALIDATION](VALIDATION.md) for exact commands and tests. Browser cases are written,
but local Chromium execution is blocked by the host's socket restriction. Do not advance
to the next rollout stage on the strength of unit tests alone. Physical-phone latency,
memory, touch accuracy and tap savings remain unmeasured.

The separate [all-prefix diagnostic](evaluation/REPORT.md) caught a context-loss
regression hidden by the original selected-prefix probes. The shared context scorer
corrects it without changing the candidate sets or any recorded baseline output. Across
214 prefixes, the only changed display restores `result` above `respect` after `the res`.
The pre-fix evidence remains in checkpoint `e34f2c1`. The new [corpus auditor](corpus/README.md)
prepares bounded source/provenance/split checks; its runnable example is synthetic and
does not close the real-data or model-fitting gates.

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

## Inputs for the remaining stages

Chapters 01–14 are now preserved with file hashes under `source-plan`; the Owner need
not supply them again. The ZIP did not contain chapter 15 (tutor signals). Later personal
evaluation and fitting need a deliberately supplied recent Lemma export and consented
typing logs; physical-phone qualification needs a concrete test build and an actual
device trial. Public source acquisition and license research are implementation work,
not prerequisites to ask the Owner to do. No account credentials are needed.

## Release hold

Keep this PR draft. Do not post the repository's Ready comment, enable automatic merge, merge, or deploy.
