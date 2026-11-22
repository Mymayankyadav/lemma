# All-prefix development measurement

| Experiment | Protocol | Data hash | Engine/model hash | Primary diagnostic (95% CI) | Secondary | Leaks | False corrections | Latency p95 | Memory | Not measured |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| N219 all-prefix development | n219-development-measurement-v1 | c4ac2a64d1ef… | 1c782f38f47f… | Overall MRR@3: existing 0.3551, decoder 0.4003; CI not estimated | Prefix accuracy, pool recall, ideal target-word taps | Not certified; separate regression suite | Not evaluated; no new autocorrection | Not measured | Not measured | Learner, device, and human qualification |

**Human qualification: blocked. Winner selection: prohibited.** These are the same 24 hand-authored completion tasks, expanded deterministically to 214 prefixes. They contain 214 target-word characters. They are not a held-out corpus or independent learner documents.

Run `node --import tsx scripts/writing-decoder/measure.ts`. Definitions and fixed settings are in [protocol-v1.md](protocol-v1.md) and [protocol-v1.json](protocol-v1.json). Exact source hashes, all actual prefix trajectories, and the 16 seeded random-control runs are in [results.json](results.json). Retrieval uses 64 candidates, matching the worker.

## What changed from the earlier replay

The earlier replay measured one selected prefix per task. This protocol measures every prefix before the word is complete, adds MRR@3 and same-pool ranker controls, and counts one tap per ideal acceptance. Its numbers have different denominators and must not be presented as a continuation of the earlier fixed-prefix score table. No source fixture changed and no research qualification was added. No deviation from this development protocol.

## Whole-trajectory diagnostics

| Path | Ordering | Any-prefix pool hits | Overall MRR@3 | Ideal target-word savings k=1 | Ideal target-word savings k=3 |
| --- | --- | ---: | ---: | ---: | ---: |
| baseline | Actual | 22/24 | 0.3551 | 25.23% | 25.70% |
| baseline | Random mean | 22/24 | 0.3215 | 21.70% | 24.94% |
| baseline | Degraded | 22/24 | 0.2952 | 18.22% | 23.36% |
| baseline | Oracle | 22/24 | 0.3598 | 25.70% | 25.70% |
| decoder | Actual | 24/24 | 0.4003 | 28.50% | 29.44% |
| decoder | Random mean | 24/24 | 0.3409 | 24.01% | 28.42% |
| decoder | Degraded | 24/24 | 0.2858 | 17.29% | 27.10% |
| decoder | Oracle | 24/24 | 0.4065 | 29.44% | 29.44% |

## Observed ranking regressions

**0 top-one loss(es); 0 top-three loss(es)** across all prefixes. Aggregate gains do not erase these individual regressions.

No intended word that was in the existing displayed three drops out of the decoder displayed three.

## Accuracy and reciprocal rank at prefixes 0–3

| Path | Ordering | Prefix | Opportunities | Top-1 | Top-3 | MRR@3 |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| baseline | Actual | 0 | 24 | 0.00% | 0.00% | 0.0000 |
| baseline | Actual | 1 | 24 | 0.00% | 0.00% | 0.0000 |
| baseline | Actual | 2 | 24 | 4.17% | 4.17% | 0.0417 |
| baseline | Actual | 3 | 24 | 12.50% | 12.50% | 0.1250 |
| baseline | Random mean | 0 | 24 | 0.00% | 0.00% | 0.0000 |
| baseline | Random mean | 1 | 24 | 0.00% | 0.00% | 0.0000 |
| baseline | Random mean | 2 | 24 | 1.82% | 3.39% | 0.0252 |
| baseline | Random mean | 3 | 24 | 8.59% | 10.42% | 0.0946 |
| baseline | Degraded | 0 | 24 | 0.00% | 0.00% | 0.0000 |
| baseline | Degraded | 1 | 24 | 0.00% | 0.00% | 0.0000 |
| baseline | Degraded | 2 | 24 | 0.00% | 0.00% | 0.0000 |
| baseline | Degraded | 3 | 24 | 8.33% | 8.33% | 0.0833 |
| baseline | Oracle | 0 | 24 | 0.00% | 0.00% | 0.0000 |
| baseline | Oracle | 1 | 24 | 0.00% | 0.00% | 0.0000 |
| baseline | Oracle | 2 | 24 | 4.17% | 4.17% | 0.0417 |
| baseline | Oracle | 3 | 24 | 12.50% | 12.50% | 0.1250 |
| decoder | Actual | 0 | 24 | 0.00% | 0.00% | 0.0000 |
| decoder | Actual | 1 | 24 | 0.00% | 0.00% | 0.0000 |
| decoder | Actual | 2 | 24 | 4.17% | 4.17% | 0.0417 |
| decoder | Actual | 3 | 24 | 12.50% | 12.50% | 0.1250 |
| decoder | Random mean | 0 | 24 | 0.00% | 0.00% | 0.0000 |
| decoder | Random mean | 1 | 24 | 0.00% | 0.00% | 0.0000 |
| decoder | Random mean | 2 | 24 | 1.82% | 3.39% | 0.0252 |
| decoder | Random mean | 3 | 24 | 8.59% | 10.42% | 0.0946 |
| decoder | Degraded | 0 | 24 | 0.00% | 0.00% | 0.0000 |
| decoder | Degraded | 1 | 24 | 0.00% | 0.00% | 0.0000 |
| decoder | Degraded | 2 | 24 | 0.00% | 0.00% | 0.0000 |
| decoder | Degraded | 3 | 24 | 8.33% | 8.33% | 0.0833 |
| decoder | Oracle | 0 | 24 | 0.00% | 0.00% | 0.0000 |
| decoder | Oracle | 1 | 24 | 0.00% | 0.00% | 0.0000 |
| decoder | Oracle | 2 | 24 | 4.17% | 4.17% | 0.0417 |
| decoder | Oracle | 3 | 24 | 12.50% | 12.50% | 0.1250 |

## Sensitivity checks

| Path | Check | Result |
| --- | --- | --- |
| baseline | randomMrrBelowActual | Pass |
| baseline | actualMrrBelowOracle | Pass |
| baseline | reversedRankingChangesMrr | Pass |
| baseline | oracleAtLeastActual | Pass |
| baseline | controlsPreservePoolRecall | Pass |
| decoder | randomMrrBelowActual | Pass |
| decoder | actualMrrBelowOracle | Pass |
| decoder | reversedRankingChangesMrr | Pass |
| decoder | oracleAtLeastActual | Pass |
| decoder | controlsPreservePoolRecall | Pass |

A tied or unmet strict ordering means this small dataset does not provide that diagnostic. It is recorded without changing the fixture. Random results are means over fixed reorderings of identical eligible pools, not extra independent data or confidence bounds. The oracle only promotes an already eligible intended word.

## Exact ideal-tap accounting for the actual order

| Path | k | Target characters | Characters not typed | Acceptance taps | Net taps saved | Fraction |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| baseline | 1 | 214 | 76 | 22 | 54 | 25.23% |
| baseline | 3 | 214 | 77 | 22 | 55 | 25.70% |
| decoder | 1 | 214 | 85 | 24 | 61 | 28.50% |
| decoder | 3 | 214 | 87 | 24 | 63 | 29.44% |

These are target-word upper bounds. The denominator excludes repeated context, punctuation and separators; the numerator gives no credit for inserted trailing spaces. Attention, page switches, missed or wrong accepts, and recovery are not modeled. These fractions are not full-passage effort, WPM, or evidence that suggestions make the learner faster.

## Remaining qualification

- deliberately supplied real learner text and a frozen chronological split manifest
- independently labelled D13 blocked/allowed opportunities and a validated judge
- opt-in impression/outcome logs for behavior estimates
- a recorded release APK, device, WebView, latency and memory measurements
- a preregistered human-trial protocol and consent

No learner-choice certificate, correction certificate, phone performance claim, human preference claim, or model-selection decision follows from this report. The separate safety replay and hook/browser tests remain required.
