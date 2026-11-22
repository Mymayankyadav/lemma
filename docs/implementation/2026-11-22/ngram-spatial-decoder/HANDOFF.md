# N219 continuation checkpoint

Agent: chat-732640#d9k2

## Start here in another chat

Continue **Mymayankyadav/lemma PR #1746**, branch `chat-628431/n219`.
Keep it draft. The Owner explicitly forbids merging; do not post Ready, enable
automatic merge, or deploy. Commit and push concrete checkpoints, including this note.
Do not rely on local files or a previous chat remaining available.

The Owner mentioned #1738, but that PR was merged before this session. #1746 is the
earlier chat's decoder continuation, based on main `d1b3135f99ae54d52b312f4b728c4460abdabc06`.
Its only starting commit was `f23da6d7de30f9ee35983241d11c44f3398a9a21` (plan/claim).
The screenshot's worker implementation and 42-case/17-completion fixture never reached
that branch. The fresh replay must be labeled development regression, not a recovered
fixture, held-out evaluation, or human/phone performance.

## Checkpoint 1: reproducible lexicon

Implemented source-pinned offline builder, original AOSP dictionary/archive/notices,
SCOWL and filtered mathlib provenance, bounded asset schema, and exact top-k prefix
retrieval with a range-max tree. Original `logic` tags survive retrieval. See the
runtime asset's `ATTRIBUTION.md` and `manifest.json` for source and output hashes.

- Asset: `public/models/writing-decoder/unigram-v1/lexicon.json`.
- 49,232 entries; 1,688,748 bytes.
- SHA-256: `3c60a7226fcabd574caaf0f152fc8451c9d7173af8e2470a96052f3bd5ed2594`.
- 21 focused lexicon tests passed; offline regeneration was byte-identical.

```sh
npm ci --ignore-scripts --no-audit --no-fund
node scripts/writing-decoder/build-lexicon.mjs --check
npm test -- --run tests/unit/tutor/writing-decoder-lexicon.test.ts
```

## Checkpoint 2: worker integration and replay

Implemented `writingDecoder: false`, lazy worker lookup and asset verification/cache,
baseline suggestions during loading/failure, exact request checks and cancellation,
one cold-load continuation, sticky failures and independent startup/network deadlines.
The editor rechecks permissions and risk metadata. Off/mode/scope/generation changes
dispose the worker. The existing explicit tap/Tab-ghost acceptance and Undo path remains.
New automatic correction is not enabled. See [IMPLEMENTATION](IMPLEMENTATION.md).

The first attempted integration's ranking and permission regressions are fixed: preserve
short-prefix baseline behavior and original rare-word floors; share neutral-writing
permissions; require five letters/80% spelling for newly admitted non-neutral vocabulary;
guard proof inflections and known logic even if their tags are missing. This avoids treating
a large dictionary as a semantic safety classifier. Original baseline behavior remains
available for comparison, including its known weak `cont`→`continuity` gap.

The frozen fresh replay now passes at the actual worker retrieval limit of 64. Among
24 completion probes, baseline pool/top-one/top-three hits are 16/16/16; enabled results
are 17/16/17. There is one displayed gain (`explanation`) and no lost baseline success.
All 108 listed safety requests pass on the enabled path; 61 explicit applications and
549 stale applications pass their contracts. [Replay report](replay/REPORT.md).
The fixture was not expanded to inflate this result; extra diagnostic regressions stay
in separate unit tests. See [VALIDATION](VALIDATION.md) for the final test counts.

Local Playwright's expected browser download was blocked. Installed Chromium also could
not start because the execution sandbox rejects its process-singleton socket, even with
a writable workspace temporary directory. Eleven focused browser cases are committed and
discovered, but their actual browser assertions remain unexecuted locally. This is not a
passing browser gate. Do not loosen tests or call this a phone trial.

## Exact next action

1. Fetch the latest PR branch and read the CI comment/status for its current commit.
2. In an environment where Chromium can run, execute
   `npx playwright test tests/e2e/tutor-writing-decoder.spec.ts tests/e2e/tutor-writing-aid.spec.ts --workers=2`.
   Keep existing test thresholds and configuration. Record the actual results here.
3. Resolve any remaining failure in the same draft PR. The local unit/pure replay checks
   do not substitute for loading/fallback, visible acceptance and Undo in a real browser.
4. After the first stage is qualified, continue the staged plan with the companion
   specifications and a separate data/evaluation protocol. Do not merge this PR.

## Later inputs and stages

No additional Owner input was needed to build the lexicon or start integration. Before
later stages, obtain the companion chapters referenced by PLAN.md (especially logging,
evaluation, learner-choice safety, certification, Scribe, and tutor signals). A deliberately
supplied Lemma export and consented tap logs are needed for personal fitting and realistic
evaluation. A physical target-phone trial remains necessary for actual touch/latency claims.

Corpus-scale n-grams, spatial fitting, fuzzy beam decoding, tutor packs, entropy/hysteresis,
and personalization are still later stages. Never train on the evaluation split or describe
these public unigram heuristics as a trained n-gram model or calibrated probability.
