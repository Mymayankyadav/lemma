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

## Checkpoint 3: companion contracts and temporal fixes

Preserved the Owner's companion ZIP, corrected enabled loading/failure safety, and
included the captured feature flag in prediction identity. Two tests reproduce the
former fallback leak; two more reproduce stale offers across in-place dev/test flag
changes. All four pass after the fixes. The existing module-download browser test
now distinguishes the editor's dedicated Worker request from PWA precache requests.

Added a separate [all-prefix measurement protocol](evaluation/protocol-v1.md) and
an [offline corpus auditor](corpus/README.md). The combined suite has 262 passing tests,
and build/typecheck and lint pass. The unchanged fixed-prefix replay still yields
16/24 versus 17/24 displayed hits and zero listed enabled/fallback safety failures.

The new measurement uses the same 24 synthetic targets over 214 prefixes, with
random/degraded/oracle controls. It improves measurement validity without supplying
held-out, human or device evidence. It exposes a top-one regression at prefix 3:
`I think the res` ranks `respect` before intended `result`, because the new unigram
sort discards the baseline's existing `the result` bigram signal. That regression
is recorded explicitly in [evaluation/REPORT.md](evaluation/REPORT.md); it is the
next general ranking mechanism to correct. Do not hard-code the example or retune
the fixture. The old and new protocol denominators must remain separate.

The corpus example is three synthetic records. The auditor enforces source/evidence
hashes, reviewed declarations, role/provenance restrictions, one owner scope, bounded
reads and whole-day/document/group/overlap checks. It imports no external corpus and
does not approve fitting or certify semantic safety.

## Checkpoint 4: existing context preserved and CI test contracts corrected

The context-loss mechanism recorded in checkpoint `e34f2c1` is now fixed. A shared
pure scorer retains the original sequential bigram/trigram contributions, configuration
and tokenization. Both the original lexical path and the expanded path use it; no
coefficient, admission rule or vocabulary changed. The original `words.mjs` bytes
are preserved as `scripts/writing-decoder/sources/baseline-words.mjs.txt` with their
original source hash/URL, so the lexicon remains byte-identical after the refactor.

The combined **282 unit tests**, production build/typecheck, lint, Kit and PWA/asset
checks pass. Twenty context tests include exact formula and original-module parity.
Both replay generators were rerun with unchanged fixture and protocol bytes. Against
`e34f2c1`, all 132 recorded baseline/fallback rows and all 214 baseline trajectories
and controls are identical; eligible decoder sets are identical. The only displayed
change restores `result` above `respect` at prefix `res`. No top-one or top-three loss
remains versus the baseline or previous decoder. Current decoder MRR@3 is 0.40031,
versus baseline 0.35514. Ideal target-word tap totals do not change. These remain
development diagnostics, not qualified model selection or human benefit evidence.

CI run `44986990378` on old head `7c7a820` completed with nine decoder browser cases
passing and two failing. Structured JUnit artifact `14740193798` confirmed both:
the worker-module test counted a PWA precache request, and the corrupt-asset case
expected a completion inside text restored by Undo. The corrected tests distinguish
precache from the dedicated Worker and verify restored-text suppression followed by
fallback acceptance/Undo on a freshly typed word. They retain corruption, one-fetch,
zero-decoder-result and stale/safety assertions. Local Chromium remains blocked before
startup. Do not claim the current browser gate passed until its own CI completes.

## Exact next action

1. Fetch the latest PR branch and read the CI comment/status for its current commit.
2. In an environment where Chromium can run, execute
   `npx playwright test tests/e2e/tutor-writing-decoder.spec.ts tests/e2e/tutor-writing-aid.spec.ts --workers=2`.
   Keep existing test thresholds and configuration. Record the actual results here.
3. Resolve any remaining failure in the same draft PR. The local unit/pure replay checks
   do not substitute for loading/fallback, visible acceptance and Undo in a real browser.
4. After the first stage is qualified, continue the staged plan with the companion
   specifications and a separate data/evaluation protocol. Do not merge this PR.
   The next model-preparation milestone is a versioned prose/math normalization and
   portable 4-gram import/export/scoring-parity pipeline, followed by a reviewed public
   corpus pilot. Do not fit coefficients to the 24 reused development probes.

## Later inputs and stages

The Owner has now supplied `math-input-plan.zip`. Its chapters 01–14, README and
REFERENCES are preserved byte-for-byte under [source-plan](source-plan/README.md), with
the archive and per-file SHA-256 values in `source-plan/manifest.json`. Read
[SPEC_RECONCILIATION](SPEC_RECONCILIATION.md) before continuing. Chapter 15 (tutor signals)
was not in the archive; do not ask again for the chapters already supplied. A deliberately
supplied Lemma export and consented tap logs are needed for personal fitting and realistic
evaluation. A physical target-phone trial remains necessary for actual touch/latency claims.

Corpus-scale n-grams, spatial fitting, fuzzy beam decoding, tutor packs, entropy/hysteresis,
and personalization are still later stages. Never train on the evaluation split or describe
these public unigram heuristics as a trained n-gram model or calibrated probability.
