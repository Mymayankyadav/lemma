# 07 Tests and acceptance

## Invariants
I1–I10 are kept. Each new invariant needs a named test.

| ID | Rule |
|---|---|
| I11 | Every shown proficiency carries an interval and a session count. Below the floor it shows — or a labelled inference |
| I12 | select and transfer move only on uncued attempts |
| I13 | Diagnostics D1–D5 (01 §9) run nightly per stream, and each failure changes serving exactly as listed there |
| I14 | Stage results, hints, error tags and cue flags never come from a worker model |
| I15 | Same-save duplicates merge |
| I16 | The new-card quota never lets forecast card reviews exceed the card budget; card minutes never exceed `card_cap` |
| I17 | Conversion never deletes a reviewed card, never changes a done CP and maps every old CP |
| I18 | At most one open certification check per (KC, facet); never due on its creation day |
| I19 | A decision-relevant effect that the data cannot identify (coupling) enters plans only through its posterior weight π_H |

## Unit (`tests/unit/adaptive/`)
- **Two-process likelihood:** analytic G and H match finite differences to 1e-6; P stays in [g, 1 − s].
- **Blame:** r = P(retrieval failed | fail) is in [0, 1]; a noisy-AND stage splits (1 − p_j)/(1 − P).
- **KC memory:** an ok attempt resets the clock; a fractional update never resets it; FSRS parity with `_shared/fsrs.js` to 1e-9.
- **Mixture:** the Bayes-mixture log loss is ≤ KF's + ln(1/0.8) + n·ln(1/(1 − α)) on random streams.
- **Hypothesis weights:** π_H sums to 1 and is order-stable.
- **Kalman durations:** with σ_ξ = 0 it equals Bayesian linear regression; coverage on synthetic data is 0.80 ± 0.03.
- **Attendance ADF:** the posterior moves toward the observed weekday rate.
- **KG gain:** exact enumeration over outcomes equals a 10⁴-draw Monte Carlo to 1e-3; zero for a Gaussian-only state.
- **Thompson slots:** identical seed (user, study_day) → identical ranking (I3).
- Kept from v2: hints, aging, legacy, determinism, card ≤ 100 tokens.

## Scheduler, template, conversion (unit)
- **Feasibility:** prune below 0.80; restore only after 2 days above 0.95; a seeded noisy series never flip-flops.
- **Pruning:** value/min order; core is never pruned automatically; test-out at P ≥ 0.7.
- **Pacing:** every core KC is taught by the pacing date in a seeded run.
- **Rechecks:** certification gap = clamp(0.15·days to exam, 1, 7); dedupe; final-3-day review.
- **Template and quota:** each 11 §5 rule rejects its bad fixture; 120 min/day → 2.6 units/day.
- **Conversion:** each 12 hard rule catches its violation; one retry, then flag.

## Property (fast-check)
- Posterior variance never exceeds the prior; no NaN for any finite input.
- A clean pass never lowers the target's predicted p at the same time point.
- KG gain of any action is finite, and ≥ 0 under the model's own expectation.

## Simulation gates (seeded CI, `sim/`; same protocol as 09)
| Check | Must hold (12 held-out learners per world) |
|---|---|
| KF attempt KL to the true p | ≤ 0.040 (W1) and ≤ 0.050 (W2); ≥ 40% below v2 |
| Learning curve | KL in attempts 200+ < KL in attempts 1–30 (both worlds) |
| Attempt calibration | slope 0.85–1.15, \|intercept\| ≤ 0.2, fatigue \|z\| ≤ 3 |
| Card model (FSRS + coupling + offsets) | mean KL over W1 and W2 ≤ default FSRS |
| Durations | log predictive density ≥ −0.70; 80% coverage 0.75–0.85 |
| Attendance | log loss ≤ 0.57 |
| End to end, paired | P2C − P0 > 0 in each world and > 2 SE overall; P1-style allocation stays removed |

## Migration (`tests/mcp/sql/atlas-v2.mjs`, PGlite)
- up → down → up gives an equal schema; the dry run writes nothing; the real run is idempotent.
- Fixture counts: 146 → 134 attempts, 12 merged, 24 untagged, 7 instruction events; undo per step.

## Acceptance
1. All §Gate checks in 03 pass on production; the Owner approves the diff.
2. `resume` ≤ 1,500 tokens and cards ≤ 100 for all 4 projects.
3. On production replay, D1–D5 are reported for every stream that has ≥ 50 events. Streams with fewer show `insufficient data`, not a pass.
4. App and MCP values are identical (parity test), including P_all, P_core, KG reasons and the quota.
5. No Beta proficiency code remains (lint rule: no import of `proficiency.ts`).
6. Every N169/N170 test still passes except those about removed Beta, EWMA pace and slack behaviour, which are replaced via a `rules:` PR (tests are protected).
7. All 4 projects are converted and approved; I17 holds.
8. All simulation gates pass on the shipped parameters.
