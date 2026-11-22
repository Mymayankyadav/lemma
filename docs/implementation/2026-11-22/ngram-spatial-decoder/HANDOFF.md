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

## In progress after this checkpoint

Default-off worker integration and its tests are being built. The worker must load and
hash-verify the public asset lazily; baseline suggestions must remain usable on delay,
failed assets, failed worker, or unavailable storage. Recheck candidate permissions on
the editor side, preserve risk tags, and reject stale editor/selection/mode/owner results.
Keep the existing explicit tap/Tab-ghost acceptance and Undo path. Do not add autocorrect.

Initial fresh replay found ranking and safety defects in the first attempted integration:
two-letter frequency ranking displaced `result`; Balanced admitted short `re`→`record`;
proof-family inflections such as `contradictory` and the existing Fast `cont`→`continuity`
need stronger visible spelling on the enabled path. Fix these generally and record the
paired results before calling the first milestone complete. No fixture was weakened.

Local Playwright's expected browser download was blocked. Installed Chromium also could
not start because the execution sandbox rejects its process-singleton socket. This is a
browser execution limitation, not a passing browser gate. Do not claim those cases ran.

## Later inputs and stages

No additional Owner input was needed to build the lexicon or start integration. Before
later stages, obtain the companion chapters referenced by PLAN.md (especially logging,
evaluation, learner-choice safety, certification, Scribe, and tutor signals). A deliberately
supplied Lemma export and consented tap logs are needed for personal fitting and realistic
evaluation. A physical target-phone trial remains necessary for actual touch/latency claims.

Corpus-scale n-grams, spatial fitting, fuzzy beam decoding, tutor packs, entropy/hysteresis,
and personalization are still later stages. Never train on the evaluation split or describe
these public unigram heuristics as a trained n-gram model or calibrated probability.
