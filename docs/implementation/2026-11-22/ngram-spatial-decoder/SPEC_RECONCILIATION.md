# Supplied plan and implementation boundaries

Agent: chat-732640#d9k2 · N219 · PR #1746 · 22 November 2026

## The supplied files are now durable

The Owner supplied `math-input-plan.zip` during this continuation. Its 16 Markdown
files (chapters 01–14, README and REFERENCES) are preserved byte-for-byte under
[source-plan](source-plan/README.md). The [snapshot manifest](source-plan/manifest.json)
records every file's size and SHA-256 and the original archive hash. The archive itself
is not needed to resume the work. Chapter 16 remains in [PLAN.md](PLAN.md).
The referenced `15-tutor-signals.md` was not in this ZIP.

The active N219 task is chapter 16's **CPU-only** implementation. The broader proposal
includes GPU-trained Scribe and handwriting work; receiving those specifications does
not change this item's scope, enable training, or enable collection of personal data.
The source snapshot retains the proposal's original claims and links. Preserving a
proposal is not independent verification of its research or evidence of implementation.

## Requirements applied to this continuation

| Supplied contract | Consequence for N219 |
| --- | --- |
| [02 §2.9–2.12](source-plan/02-datasets.md): frozen document/day splits, provenance, synthetic-data restrictions | Preserve source hashes and synthetic provenance. A reused regression fixture cannot become a held-out test. Personal evaluation and corpus training need separate, non-overlapping inputs. |
| [03 §3.2 and §3.9](source-plan/03-feedback-and-logging.md): opt-in, owner-scoped, bounded, local-only logs and explicit export | The decoder adds no raw-draft or tap collection. A future logger needs its own consent, retention, deletion and export implementation before it can collect evidence. Existing personalization is not a substitute for that dataset. |
| [05 §5.10](source-plan/05-training.md): separate calibration and autocorrection certification | Unigram scores are heuristic ranks. No probability, entropy threshold, safety certificate or new automatic correction is inferred from them. |
| [06 §6.1–6.3](source-plan/06-evaluation.md): frozen protocol, rank-sensitive controls, per-prefix metrics, separate behavior fitting | Add a separately versioned development measurement protocol. Keep the original replay and its denominator intact; do not combine its fixed-prefix counts with new any-prefix metrics. No simulated WPM or fitted-user claim is produced. |
| [07 §7.4](source-plan/07-learner-choice-safety.md): validate before every display | Enabled-path admission rules must also protect the first/loading/failure list. Checking only the final worker reply is insufficient. Flag-off baseline behavior remains the comparison control. |
| [07 §7.6](source-plan/07-learner-choice-safety.md): at least 600 independently labelled blocked test items and a fresh red-team batch | The 108 synthetic safety requests are regression coverage, not D13 certification. Mode repetitions do not create independent labelled examples. |
| [11 §11.3](source-plan/11-scribe-architecture.md) and [12 §12.4](source-plan/12-scribe-dataset.md): deterministic prose/math front end | Future n-gram preparation must use explicit normalization and tokenization versions. The current ASCII prefix lexicon is not that front end or a LaTeX model. |
| [13](source-plan/13-scribe-rl-and-feedback.md): behavior feedback, propensities and conservative policy learning | No ignore penalty, random slot policy, reward fit or off-policy claim is added without the corresponding consented impressions and outcomes. |
| [16 §16.12](PLAN.md): staged rollout with separate gates | Preparation and measurement work may proceed, but later runtime stages are not enabled on the strength of a synthetic unigram replay. |

## Findings from applying the newly supplied contracts

The existing integration used the original baseline list while its worker loaded or
failed. That could briefly display the known Fast-mode `cont` → `continuity` result,
even though the completed worker path rejected it. The before-display requirement
therefore calls for the enabled policy to filter the baseline fallback too, with
deferred and failed-worker tests. Final-result replay alone cannot test that timing gap.

An additional temporal audit found that prediction identity lacked the decoder flag.
In supported dev/test in-place overrides, the previous flag's offers could remain
actionable until the next animation frame. Including the captured flag in the current
prediction check retires those offers immediately. Production ignores those overrides.

CI also exposed a test assumption that contradicted authored-evidence safety: after
Undo restores text, adding one letter inside the restored word does not make its whole
prefix newly learner-authored. The corrupt-asset test now checks that boundary and
verifies usable fallback on a separately typed fresh word occurrence.

The original replay measures intended-word presence at **one selected prefix per
fixture**. Its historical JSON field `oraclePoolHits` is fixed-prefix pool coverage,
not the plan's any-prefix-before-word-end oracle recall. Likewise, 16/24 or 17/24 are
development counts, not estimates of performance on learner writing. A new measurement
report must state its own opportunity definition, denominators and protocol version.

The current retrieval floor is three letters and conservative admission can require
more. It cannot establish the proposed G2 gains at prefix lengths one and two merely
by improving a longer-prefix fixture. Those early-prefix metrics must be reported
even when unchanged or zero. Do not relax the safety policy to make a metric improve.

## What remains needed for qualification

| Evidence | Current boundary |
| --- | --- |
| Browser integration | Real loading, fallback, stale-result, explicit acceptance and Undo assertions must pass. Local Chromium is blocked before application startup; current-head CI is recorded separately. |
| Real-text evaluation | A deliberately supplied export or other permitted real writing sample, a frozen chronological/document split, and enough opportunities for the proposed comparison. None is inferred from the screenshots or the synthetic fixture. |
| Learner-choice certification | Independently labelled real blocked examples and a fresh red-team set; zero failures in a small reused regression suite is insufficient. |
| Behavior and spatial fitting | Consented tap/impression/outcome logs with deletion and export controls. No invented acceptance probabilities or tap coordinates. |
| Device qualification | An actual release-mode trial on the target phone, with build/WebView identity and latency, memory and backgrounding evidence. Desktop CI is not a phone trial. |
| Tutor-signal stage | The referenced chapter 15, if available, before implementing its specific pack and provenance contracts. |

No account credentials are required to continue the code, offline measurement or public
source work. Keep the PR draft and unmerged regardless of test results; the Owner's hold
also excludes Ready, automatic merge and deployment.
