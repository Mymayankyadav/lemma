# N217: Scribe replay v1

**Synthetic measurement only.** This is the first development-only slice of Phase 0, not a model choice or rollout. Run `node --import tsx scripts/scribe-replay.mjs` and `npm test -- tests/unit/tutor/scribe-replay.test.ts`. The CLI loads only its in-source synthetic cases, uses the existing dev toolchain and refuses drift from either baseline source blob. A change to source, fixtures, display rules or metric definitions requires a new protocol version.

## What ran

The original N201 `notationSuggestions` with `padEdit` from main at [289838d](https://github.com/Mymayankyadav/lemma/tree/289838d6ec33c51515b9fea624fb92cb6cb55193). The baseline receives the synthetic draft with caret at the end, and no tutor context, recents or target. This is not the adaptive writing-aid C0 in [N202 / #1738](https://github.com/Mymayankyadav/lemma/pull/1738), which is separately claimed and unmerged as of this run. The report records the baseline source blobs and fixture SHA-256 (`4cb398c281aad71c5539f9a48dca24a9ce13720f343024d1deacc2844e56d9fe`). There is one regression set, no training or calibration, and no external input.

The existing Tutor composer maps the returned array in order to buttons. The unfiltered engine diagnostic uses this order; it neither observes browser paint nor claims which horizontally scrollable buttons fit the viewport. The controlled safe baseline takes the same order, filters it, then shows at most three in a simulated strip. This freezes the allowed pool before the **experimental** three-slot limit, not before N201's internal production caps (the full upstream universe is not exposed). A seeded SHA-256 shuffle changes ordering over the same pool; the oracle only ranks the already-eligible target first. Suppression returns an empty strip for all variants, without mutating eligibility.

The development-only filter allows exact typed single-word extensions, with at least five typed letters for listed logical connectors; for the next-word lane it permits a small closed set of neutral words. It denies other lanes and rewrites. Independent synthetic labels probe a weak connector, suggested proof methods and quantifier choice. These are fixture checks, not a comprehensive policy, D13 or a real safety certificate. Neither the filter nor any behavior is added to the app.

## Metrics and validation

- Top-1, Top-3 and MRR@3 use order in the **output strip**. A target at fourth place does not count even if it is in the pool. An absent or suppressed target is a miss. Report all scored opportunities, per prefix (0, 1, 2, 3), and per exact allowed pool size. The separately labelled safety probes are not ranking opportunities.
- Pool recall uses unique intended token occurrences (not spellings); a target counts if any listed shorter prefix can generate it before display clipping. Suppression affects display metrics, not pool recall.
- Exact random chance is calculated over the same allowed pool and fixed slot cap. If target eligible and not suppressed, Top-1 = 1/n, Top-3 = m/n, MRR@3 = (1 + 1/2 + … + 1/m)/n, with n=eligible count and m=min(3,n). For absence, policy exclusion, empty pools and suppression, contribution is zero. The arithmetic averages across all declared opportunities in each slice. If future display depends on order, replay the order-dependent pipeline instead of applying this formula.
- For the six actual `p` completions the test exhausts all 720 permutations: chance Top-1 = 1/6, Top-3 = 1/2, MRR@3 = 11/36. Reversing the six moves the first candidate beyond the three visible slots; moving it first-to-third keeps Top-3 fixed but lowers Top-1 and MRR. Random expectation is independent of the chosen shuffle.

| On 12 synthetic ranking opportunities | Top‑1 | Top‑3 | MRR@3 |
|---|---:|---:|---:|
| Filtered N201 baseline | 1/4 | 5/12 | 23/72 |
| Deterministic shuffled order | 1/4 | 5/12 | 1/3 |
| Analytic uniform chance | 1/6 | 11/24 | 7/24 |
| Safety-constrained oracle | 7/12 | 7/12 | 7/12 |

Returned allowed pool recall is 8/10 occurrences. The three labelled adversarial inputs each contained a blocked option in the raw engine order; none appeared in the controlled strip. The shuffle altered MRR but did not uniformly degrade this tiny sample. Here the real baseline does **not** beat exact random on every metric, and this regression corpus is neither powered nor representative enough to choose an engine. No WPM, learning benefit, real-user safety, latency, memory or device behavior was measured.
