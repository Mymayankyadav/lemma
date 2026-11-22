# N219 development measurement protocol v1

**Status: a fixed development diagnostic, not qualified human, held-out, or release evidence.**
The executable settings are in [protocol-v1.json](protocol-v1.json). The report is
[REPORT.md](REPORT.md), with full results in [results.json](results.json).

This protocol adds the measurement definitions and sensitivity controls requested by
chapters 06 and 10. It does not claim their Phase 0 exit or G1–G6 gates. Research
qualification remains blocked on the inputs listed below. No winner may be selected
from this synthetic fixture, even if the diagnostic scores differ.

## Fixed inputs and derivation

The sole input is the unchanged `completionCases` array in the existing fresh development
replay fixture, pinned to SHA-256
`c4ac2a64d1effeaa108e17472cb9c63455b0baf1fa24d1b3b5457df50bd36d47`.
It contains 24 hand-authored target-word probes, including repeated words with different
case and modes. They are not independent learner documents, train/validation/test splits,
or a recovery of the previous chat's lost replay. No new corpus is invented here.

For each probe, remove its final ASCII word prefix to obtain the context. Append every
prefix of the named intended word, from length 0 through the penultimate character.
The original mode is retained: Balanced unless the fixture specifies Fast or Strict.
The context and prefix are simulated as directly authored text; no pasted or automatic
outcome is treated as real learner evidence. At prefix 0, an empty draft has no valid
typing anchor, while a nonempty context uses the normal runtime boundary rules.

Both paths use the actual `predictWritingAidPool` and `selectWritingAidPool`, with the
learned personalization model omitted. The existing path omits the third argument.
The decoder path uses `writingDecoderPrefix`, the real parsed lexicon and index, and
the worker's 64-candidate retrieval limit. This is the completed lookup path; loading,
failure, and transient display states have separate hook/browser safety checks.

Every run records the fixture, protocol, scripts, runtime source, and asset hashes.
Changing the input derivation, controls, metric definitions or assumptions requires a
new protocol version; do not silently replace these settings or combine different
versions in one comparison table. Runtime changes are identified by their source hashes.

## Metric definitions

| Metric | Exact denominator and meaning |
| --- | --- |
| Any-prefix eligible-pool recall | Target tasks whose intended word appears in an eligible pool at any prefix `0 <= p < word length`, divided by all 24 tasks. This differs from the old replay's one-chosen-prefix pool coverage. |
| Top-1 / top-3 at prefix p | Correct target tasks divided by tasks long enough to have that prefix. Report p = 0, 1, 2 and 3 separately. An empty displayed list is a miss. |
| MRR@3 at prefix p | Average of 1/rank when the intended word is in the displayed three, otherwise 0, over the same opportunities. |
| Overall MRR@3 | Sum of the same reciprocal ranks over every prefix of every target, divided by the total prefix-opportunity count. Longer words contribute more opportunities. This is the primary **diagnostic** for checking metric sensitivity. |
| Ideal target-word tap savings, k = 1 or 3 | At the earliest prefix p where the intended word is displayed in the first k, save `word length - p` typed characters and spend one acceptance tap. Sum `(characters not typed - acceptance taps)` and divide by the total intended-word ASCII character count. If never offered, savings are zero. |

The savings calculation is an upper bound for these target words only. It excludes the
already supplied context, punctuation, separators, page switches, reading/attention,
missed offers, wrong accepts, and Undo. It gives **no credit** for the trailing space
inserted by the runtime. It is not full-passage keystroke savings, fitted-user savings,
time saved, WPM, or a human benefit estimate. No behavioral parameters are invented.

## Same-pool sensitivity controls

Controls cannot add a word to an eligible pool or bypass a policy filter. Every ordering
still passes through the same production three-slot family selector.

- **Actual:** keep the runtime's eligible-pool order.
- **Random:** Fisher–Yates shuffle using the 16 fixed seeds in the JSON protocol, salted
  by target id and prefix. Report the mean metrics and each seed's result. These are
  repeated orderings of the same data, not 16 independent datasets or a confidence interval.
- **Degraded:** reverse the runtime pool order before selection.
- **Oracle:** if the intended word is in the eligible pool, move it to the front; otherwise
  leave the pool unchanged. This isolates the ranking ceiling without fabricating recall.

For each engine, report whether random overall MRR@3 is below actual, actual is below
oracle, degradation changes MRR@3, and the oracle is at least as good as actual. Ties or
failed strict orderings are reported as an inadequate dataset/ranker diagnostic; they
must not be hidden by changing the fixture. Unit tests also use small exact examples to
verify that ranking, acceptance cost, missing candidates, and denominators affect metrics.
The command fails on input/hash/metric invariant errors, not merely because a diagnostic
ties or qualified human data is absent.

## Qualification that remains blocked

There is no chronological split, independently held-out period, D13 label set, fitted
acceptance model, confidence interval, correction certificate, phone benchmark, or human
trial in this report. The 108 requests in the earlier safety regression repeat 38 authored
contexts across modes; they cannot substitute for 600 independently labelled blocked
D13 test items or support the specified statistical leak bound.

Before selecting or releasing an improved model, supply and freeze a separate qualified
protocol with real learner data and split hashes; the taxonomy and independent D13 labels;
one primary research metric and its statistical tests; the device/APK/WebView and memory
budget; and the consented trial design. Logging must remain opt-in, owner-scoped, local,
bounded, and deletable under chapter 03. Uncalibrated autocorrection and research
randomization are not enabled by this offline measurement code.

## Reproduction

```bash
node --import tsx scripts/writing-decoder/measure.ts
node node_modules/vitest/vitest.mjs run tests/unit/tutor/writing-decoder-metrics.test.ts --maxWorkers=1
```

The harness uses Vite's in-process source loader for the existing raw-text imports.
It opens no browser, binds no listening socket, accesses no account, and performs no
network request. Generated files contain only the existing synthetic repository
fixture and source metadata. No learner exports are read or written.
