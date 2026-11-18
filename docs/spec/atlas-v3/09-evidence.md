# 09 Evidence

## Production audit (read-only, 2026-11-18)
| Fact | Value |
|---|---|
| Concepts | 400 (9 cluster, 33 galaxy, 97 system, 254 planet, 7 moon) |
| Evidence rows (non-voided) | 146; 24 without concept |
| Card reviews / cards / calendar blocks | 1 / 0 / 0 |
| Study entries / sessions | 9 / 14 |
| Study time | 1,327 min (6.6 attempt rows per hour) |

Real data cannot yet choose between models, so the choice rests on simulation and literature-based priors. The real rows act as a check.

## Model selection (simulation; method in `sim/README.md`)
Two ground-truth worlds that differ in structure: W1 cognitive (ACT-R memory with spacing, Pavlik & Anderson 2005) and W2 additive (logistic skill, FSRS cards). Every candidate is misspecified in at least one of them. Hyperparameters were tuned on 8 learners per world and are reported on 12 new learners per world. The metric is KL from the true probability, i.e. the reducible error in nats per prediction (0 = only randomness left).

**Attempts**
| Model | KL W1 | KL W2 | Log loss W1 / W2 (oracle 0.549 / 0.505) | Calibration slope W1 / W2 |
|---|---|---|---|---|
| **KF (v3)** | **0.035 ± 0.002** | **0.043 ± 0.002** | 0.590 / 0.549 | 0.90 / 1.04 |
| KF + PFA mixture (uniform, share 0.02) | 0.037 | 0.044 | 0.590 / 0.549 | 0.87 / 1.02 |
| KF + Platt layer (always on) | 0.036 | 0.044 | 0.591 / 0.549 | 0.89 / 1.01 |
| 4-model mixture | 0.040 | 0.045 | 0.594 / 0.551 | 0.85 / 0.97 |
| PFA-MAP | 0.049 | 0.053 | 0.599 / 0.558 | 0.77 / 0.91 |
| DAS3H-MAP | 0.051 | 0.052 | 0.601 / 0.558 | 0.77 / 0.90 |
| Beta (N170) | 0.085 | 0.091 | 0.637 / 0.605 | 0.77 / 0.84 |
| v2 (previous pack) | 0.088 | 0.103 | 0.644 / 0.613 | 0.69 / 0.70 |
| Gradient boosting | 0.105 | 0.112 | 0.660 / 0.616 | 0.55 / 0.63 |

- KF closes 57% (W1) and 59% (W2) of the log-loss gap between v2 and the oracle.
- **Convergence:** KF's KL by attempt index (1–30, 31–100, 101–200, 200+) is 0.045, 0.041, 0.033, 0.028 in W1 and 0.050, 0.048, 0.040, 0.040 in W2. Gradient boosting starts at 0.144.
- **Residual structure:** the fatigue score test on KF residuals gives z = −1.6 (W1) and 0.1 (W2). ECE is 0.015 and 0.021. No detectable structure is left.
- **Insensitivity:** KF varies < 0.001 nats across α ∈ {0.5, 1} and KC stability × {0.5, 1, 2}. PFA and DAS3H need strong shrinkage (prior sd 0.3–0.5); at sd 1.5 they fall to Beta's level.
- **Mixtures:** fixed-share mixtures cost more than they gained here. 01 §5 therefore uses a near-Bayes mixture (share 0.001, KF prior 0.8), whose total regret is bounded by ln 1.25 + n·0.001 nats.

**Cards**
| Model | KL W1 | KL W2 | ECE W1 / W2 |
|---|---|---|---|
| **FSRS default + coupling ω 0.2 + offsets** | **0.072** | 0.0049 | 0.027 / 0.010 |
| … + MAP (κ 0.3) + residual features | 0.071 | 0.0055 | 0.018 / 0.013 |
| FSRS default | 0.082 | 0.0043 | 0.051 / 0.013 |
| FSRS MAP κ = 1 (tuning set) | 0.074 | 0.0045 | — |
| FSRS-anchored logistic on cross-type history | 0.077 | 0.0104 | 0.034 / 0.024 |

- In W1 (not an FSRS world) default FSRS fails D2: ECE 0.051, mean predicted 0.92 against 0.87 observed. Coupling plus offsets bring ECE to 0.027 (pass).
- A fatigue residual remains (z = −2.8, inside the bound but close). Slope and fatigue terms could not absorb it from ≈ 300 reviews per learner (tight and loose priors and a Bayes mixture were tested). That is the kind of structure D3 exists to watch.
- Card streams are skewed (mean p ≈ 0.9), so the logistic slope is noisy there; D2 uses ECE for such streams (01 §9).
- In real Anki data FSRS-6 is the best published card model: log loss ≈ 0.34 over 9,999 collections. So W2 is the more realistic card world.

## Real-data check (110 de-duplicated production attempts, clean-pass rate 0.636)
| Model | Log loss |
|---|---|
| PFA-MAP | 0.669 |
| DAS3H-MAP | 0.671 |
| 4-model mixture | 0.678 |
| v2 | 0.697 |
| KF | 0.706 |
| Beta | 0.712 |

- No model beats the hindsight base-rate entropy (0.656): the legacy rows carry no learnable signal (no item difficulty, coarse outcomes, mostly created by migration).
- Differences are within ±1 SE (≈ 0.035). KF has no edge here, which is why the PFA safety net with weight 0.2 is kept.

## Time models (200 simulated learners each)
| Durations (40 CPs, overrun ≈ 2.2×, drift, difficulty) | Log predictive density | 80% coverage |
|---|---|---|
| EWMA pace factor (N169) | −0.973 | 0.71 |
| Per-kind NIG (previous pack) | −0.861 | 0.79 |
| **Kalman dynamic regression** | **−0.655** | 0.83 |
| Oracle | −0.368 | 0.80 |

| Attendance (60 days, weekday, slot, lag, motivation AR(1)) | Log loss | Brier |
|---|---|---|
| Declared capacity | 1.300 | 0.275 |
| Ratio (previous pack) | 0.576 | 0.194 |
| **Dynamic logistic** | **0.560** | **0.188** |

Calendar slot policy, realised min/day: fixed 65.6, random 65.5, **Thompson 68.0**, true best slot 74.8.

## End to end (paired by learner; true exam score at day 42.5)
Same learner, course, availability and outcome draws under each policy; 24 KCs, 48 cards, 42 days, teaching pacing identical; utility 0.6 × problem solving + 0.4 × card recall; W1 8 learners, W2 10.

| Policy | Mean score | Δ vs N169 heuristic (paired, ± SE) |
|---|---|---|
| P0 N169 heuristic (FSRS due cards ≤ 25%, round-robin practice, T1 rechecks) | 0.723 | — |
| P1 previous pack (v2 model, band 0.85, memory and probe priority) | 0.677 | −0.046 ± 0.008 (W1 −0.076, W2 −0.022) |
| P2 knowledge gradient, no card cap | 0.730 | +0.007 ± 0.002 |
| **P2C knowledge gradient, card cap 12.5%** | **0.734** | **+0.011 ± 0.002** (W1 +0.007, W2 +0.015) |
| Greedy with the TRUE world's one-step gains | 0.745 | +0.022 ± 0.006 (W1 +0.003, W2 +0.038) |

- P2C captures half of what the true-model greedy gains over N169. The true-model greedy is a reference, not an upper bound: in W1 the capped model planner beat it.
- **The card cap helps:** P2C − P2 = +0.004 ± 0.001. Uncapped, the planner over-reviews cards when the card → skill coupling is uncertain.
- **Coupling must be learned:** with coupling fixed at 0.3 (assumed, not learned), the uncapped planner scored 0.714 and 0.769 against 0.739 and 0.810 with Bayes-averaged coupling on the same W2 learners.
- **Scale:** with teaching pacing fixed, smarter allocation is worth about 1 point of exam score here. Larger levers are minutes actually studied (calendar placement +3.7%) and accurate feasibility, which decides what gets pruned.

## Scheduler inputs (last 10 PRs)
- N169: pace factor ≈ 3× on production (actual vs estimated minutes).
- #1492: tools/list at 14,669 of 15,000 chars.
- N167: change-feed backlog caused refetch storms.

## FSRS card load (repo `fsrs.js` `simulate`, default weights, seeded)
Reviews per day for 1 new card per day:

| Retention | Days 1–30 | 31–60 | 61–120 |
|---|---|---|---|
| 0.85 | 1.59 | 3.12 | 4.07 |
| 0.91 | 2.55 | 4.43 | 5.65 |

One card at 0.91: 3.70 reviews in its first 30 days, 5.05 in 60.

## v2-era backtests (kept for the record)
| Model | 108 rows | 96 de-duplicated rows |
|---|---|---|
| Current Beta | 0.692 | 0.748 |
| Base rate | 0.668 | 0.694 |
| v2 fitted | 0.660 | 0.693 |

## Sources
- [Pavlik & Anderson 2005: activation-based model of the spacing effect (W1 memory)](https://digitalcommons.memphis.edu/facpubs/8387)
- [Choffin et al. 2019: DAS3H](https://arxiv.org/abs/1905.06873)
- [Open spaced-repetition benchmark (FSRS-6)](https://expertium.github.io/Benchmark.html)
- [Frazier, Powell & Dayanik 2008: knowledge-gradient policy](https://collaborate.princeton.edu/en/publications/a-knowledge-gradient-policy-for-sequential-information-collection/)
- [Cepeda et al. 2008: spacing ridgeline](https://pubmed.ncbi.nlm.nih.gov/19076480/)
- [Buehler, Griffin & Ross 1994: planning fallacy](https://bear.warrington.ufl.edu/brenner/mar7588/Papers/buehler-et-al-1994.pdf)
- [van Gog & Sweller 2015](https://link.springer.com/article/10.1007/s10648-015-9310-x); [Karpicke & Aue 2015](https://link.springer.com/10.1007/s10648-015-9309-3); [Rawson 2015](https://doi.org/10.1007/s10648-015-9308-4)
- [Mejía-Ramos et al. 2012](https://link.springer.com/doi/10.1007/s10649-011-9349-7); [Hodds, Alcock & Inglis 2014](https://dspace.lboro.ac.uk/2134/13603)
- [Rohrer et al. 2020: interleaving](https://Www.Gwern.net/doc/psychology/spaced-repetition/2019-rohrer.pdf); [Sinha & Kapur 2021: PS-I](https://ersearch2.cvtisr.sk/vufind/SummonRecord/FETCH-LOGICAL-c407t-93f17c4244f0a3c39bd4ecc1c713834ae60096b53e29597f51f4a4b5ce454bfe3); [Wilson et al. 2019: 85% rule](https://escholarship.org/content/qt0v22s4g4/qt0v22s4g4.pdf?t=sdxgqm)
- [Glickman 1999 (Glicko)](https://ideas.repec.org/a/bla/jorssc/v48y1999i3p377-394.html); [Tutz sequential model](https://arxiv.org/pdf/2010.01382); [Murphy Brier decomposition](https://arxiv.org/pdf/1303.6182)
- Also used, cited without links: Pavlik, Cen & Koedinger 2009 (PFA); Herbster & Warmuth 1998 (fixed share); Dawid 1984 (prequential analysis); Russo et al. 2018 (Thompson sampling tutorial).
