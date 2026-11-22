# Fresh decoder development replay

Fresh, hand-authored development fixtures created on 2026-11-22. The earlier chat's 42-case/17-completion replay was not committed and has not been recovered. These cases are not that replay, a held-out test set, personal typing records, or evidence of human/device performance.

Run `node --import tsx scripts/writing-decoder/replay.ts` from the repository root. The script exits nonzero if a baseline displayed intended completion is lost, a listed safety condition fails, another suggestion surface changes, or explicit/stale acceptance fails. `--baseline-only` diagnoses the existing path without replacing paired results.

## Result

**Gate: PASS.** 24 completion probes and 108 safety requests.

| Metric | Existing path | Lexicon path |
| --- | ---: | ---: |
| Intended word in eligible pool | 16/24 | 17/24 |
| Intended word ranked first | 16/24 | 16/24 |
| Intended word in displayed three | 16/24 | 17/24 |

1 displayed-completion gains; 0 losses. 0 candidate safety failures; 1 baseline safety failures. 0 proposal-contract failures. 61 explicit proposal applications checked; 549 changed-request applications checked for rejection.

## Per-case intended-word ranks

A dash means absent. Pool ranks are after eligibility guards; displayed ranks use the existing three-slot selector. All retrieved words, eligible pools, displayed lists, risk tags, and failures are in [results.json](results.json).

| Case / mode | Intended word | Existing pool | Lexicon pool | Existing top 3 | Lexicon top 3 |
| --- | --- | ---: | ---: | ---: | ---: |
| notation/balanced | notation | 1 | 1 | 1 | 1 |
| preimage/balanced | preimage | 1 | 1 | 1 | 1 |
| denominator/balanced | denominator | 1 | 1 | 1 | 1 |
| numerator/balanced | numerator | 1 | 1 | 1 | 1 |
| sequence/balanced | sequence | — | — | — | — |
| function/balanced | function | — | — | — | — |
| equation/balanced | equation | 1 | 1 | 1 | 1 |
| polynomial/balanced | polynomial | — | — | — | — |
| arithmetic/balanced | arithmetic | — | — | — | — |
| topology/balanced | topology | 1 | 1 | 1 | 1 |
| derivative/balanced | derivative | — | — | — | — |
| coefficient/balanced | coefficient | — | — | — | — |
| paragraph/balanced | paragraph | 1 | 1 | 1 | 1 |
| example/balanced | example | 1 | 1 | 1 | 1 |
| explanation/balanced | explanation | — | 3 | — | 3 |
| question/balanced | question | 1 | 1 | 1 | 1 |
| sentence/balanced | sentence | 1 | 1 | 1 | 1 |
| definition/balanced | definition | 1 | 1 | 1 | 1 |
| continuous-strong-evidence/balanced | continuous | — | — | — | — |
| necessary-strong-evidence/balanced | necessary | 1 | 1 | 1 | 1 |
| title-case/balanced | Notation | 1 | 1 | 1 | 1 |
| all-caps/balanced | NOTATION | 1 | 1 | 1 | 1 |
| fast-short-prefix/fast | result | 1 | 1 | 1 | 1 |
| strict-denominator/strict | denominator | 1 | 1 | 1 | 1 |

## Failures

None in the bounded gates above.

## Scope and limits

The fixture was written for development and can inform fixes. It must not be described as a held-out evaluation or a recovery of the lost prior replay. No fitting or split-leakage claim is made. The existing path is invoked with no third argument; the lexicon path passes real asset lookup candidates through the same runtime guards. Both omit the learned personalization model. Source and asset hashes identify the evaluated bytes.

Each lookup requests at most 64 candidates (`MAX_DECODER_CANDIDATES`), matching the worker's retrieval limit before the main-thread policy filters.

This replay covers prediction and application contracts. Worker transport, loading/failure fallback, flag-off UI behavior, tap/Tab acceptance and Undo require the separate unit/browser checks. It does not measure speed, touch accuracy, latency, memory, or physical-phone usability. New autocorrection remains disabled.
