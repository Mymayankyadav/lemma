# Simulation harness (research evidence, not app code)

Python 3, numpy, scipy, scikit-learn. All runs are seeded and deterministic.

| File | Role |
|---|---|
| gt.py | Ground-truth worlds. **W1 cognitive:** ACT-R memory with spacing (Pavlik & Anderson 2005) × execution skill that learns most at moderate difficulty, partly decays; conjunctive prerequisites; fatigue; attempts and reviews leave memory traces on related KCs and cards. **W2 additive:** compensatory logistic skill with success/failure learning and decay; FSRS-6 cards with learner-specific weights; weak attempt→card transfer. Each learner draws its own parameters. |
| fsrs.py | FSRS-6 port of `_shared/fsrs.js`, vectorised; MAP fit with the fsrs-rs prior spread |
| models.py | Candidates: Beta (N170), V2 (previous pack), PFA-MAP, DAS3H-MAP, KF (v3), gradient boosting, fixed-share mixtures, Platt layer; card models (FSRS default / MAP / coupled + residual / FSRS-anchored logistic / mixtures) |
| preq.py | Model-free logging policy (1 KC taught per study day, 3 + 4–9 attempts/day, FSRS-due cards plus 10% early reviews, 12% skipped days, 42 days, 24 KCs in 4 systems, 2 cards per KC); one-step-ahead predictions of every candidate on the same stream |
| analyze.py | KL to the true probability (reducible error), log loss vs oracle, learning-curve bins, calibration (a, b), fatigue residual z |
| real.py | Same models on the 110 de-duplicated production attempts |
| time_sim.py | Durations (EWMA, NIG, Kalman) and attendance (declared, ratio, dynamic logistic); calendar slot policies |
| e2e.py | Same learner, course and availability under 5 policies; true exam score at day 42.5 |

**Protocol.**
1. Tune on seeds 1000–1007 per world (grid in `preq.att_specs('tune')`, `card_specs()`); pick the best variant per family by mean KL over both worlds.
2. Test the picks, mixtures and calibrated versions on new seeds 2000–2011.
3. End-to-end on seeds 3000–3009, paired by seed.

**Run.**
- `python3 preq.py W1 1000 1008 tune tune_W1.pkl`, then `analyze.py tune`
- `preq.py W1 2000 2012 test test_W1.pkl`, then `analyze.py test test_W1.pkl test_W2.pkl`
- `time_sim.py`
- `e2e.py W1 3000 3010 e2e_W1.pkl`
