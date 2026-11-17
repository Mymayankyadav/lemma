# 01 Information model (v3)

Every logged interaction is evidence: attempts, card reviews, teaching, timer and calendar facts. One generative model predicts each of them before it happens. It is chosen and checked prequentially: each event is predicted from the past only, then scored.

Logits throughout; σ(x) = 1/(1+e^−x); σ̃(m,V) = σ(m/√(1+πV/8)) (probit approximation).

## 0. Criterion
- **Score:** cumulative one-step log loss L_n = −Σ log p(y_i | past), which equals the description length (MDL). The model bank, priors and hyperparameters were selected by held-out simulation (09 §Model selection).
- **"Only randomness remains"** is tested, not assumed (§9). On simulated data the excess over the true process is KL(p_true‖p̂); on real data the proxies are the §9 diagnostics.

## 1. State
| Part | State | Prior / default |
|---|---|---|
| Card c | FSRS-6 (S_c, D_c, L_c), weights w | w₀ (fsrs-rs default); MAP refit §6 |
| KC memory k | FSRS-6 (S_k, D_k, L_k), weights w₀ | starts at first instruction: S = w₂ (Good) |
| Execution η(k,f) | Gaussian components, table below | — |
| Coupling hypotheses | H0: ρ = 0, H1: ρ = 0.3 (card review → KC memory) | π = (0.5, 0.5) |
| Safety-net model | PFA-MAP (§5) | mixture weight 0.2 |
| Time | duration and attendance states (§8) | §8 |

**Execution:** η(k,f) = μ + φ_f + Σ_{a∈anc(k)} v_a + v_k + w_{k,f} + Σ_{e∈E(k)} u_e + λ·ln(1+n_{k}) − β_fat·h + c_hint − b_i
- n_k = attempts on k so far; h = hours into the session; b_i = item difficulty with sd s_b.
- anc, families, E(k) and links are as in v2 (06 §5).

| Component | Prior | Aging q/day |
|---|---|---|
| μ learner | N(0, 1.0²) | 0 |
| φ facet | N(0, 0.5²) | 0 |
| v cluster/galaxy | N(0, 0.5²) | 0.005 |
| v system | N(0, 0.5²) | 0.005 |
| v KC | N(0, 0.71²) | 0.01 |
| w KC×facet | N(0, 0.5²) | 0.01 |
| u links | N(0, 0.4²) equivalent; N(0, 0.3²) other | 0.005 |
| λ learning slope (global) | N(0.3, 0.32²) | 0 |
| β_fat fatigue (global) | N(0.2, 0.2²) | 0 |
| item b | s_b 0.7 tutor, 0.5 source | 0 |

Aging: s² ← min(prior², s² + q·days). An instruction event adds 0.5 to v_k's variance (capped at its prior).

## 2. Observation model (two-process, noisy-AND)
For a stage trial with target tag j on KC k, required tags q and incidental tags x:

P(ok) = g + (1 − g − s)·R_k(t)^α·Π_q R_q(t)^{α_p}·σ̃(η_j)

- g = 0.05, s = 0.03, α = 1, α_p = 0.5; R = FSRS-6 retrievability of the KC memory (0 before instruction).
- Stages U → S → E → C, the hint ladder, the named culprit, which-tool items (g = 1/k) and legacy rows (P(≥partial) uses η + κ, κ = 3.5) are unchanged from v2.
- **Card:** P(recall) = σ(logit R_c(t) + o + o_sys + o_k − β_c·h), with offsets ~ N(0, 0.32²), N(0, 0.22²), N(0, 0.32²) and β_c ~ N(0, 0.1²).

## 3. Update per attempt (ADF, one Newton step)
1. Execution: A = (1−g−s)R_k^α Π_q R_q^{α_p}; P as §2; σ′ = σ̃(1−σ̃).
   - G = Aσ′/P if ok, −Aσ′/(1−P) if not; H = (Aσ′)²/(P(1−P)).
   - Per component c with feature x_c: m_c += V_c x_c G/(1+VH); V_c −= (V_c x_c)² H/(1+VH), where V = Σ V_c x_c².
   - Failed noisy-AND stages split blame (1−p_j)/(1−P), as in v2.
2. KC memory:
   - ok → FSRS Good on k (clock reset); Good × 0.4 on required and incidental KCs.
   - fail → Again × r then Good × (1−r) on k, with r = (1−R_k^α)(1−g)/(1−P) = P(retrieval failed | fail).
3. Cards: an ok attempt gives each card of k an FSRS Good × ω, ω = 0.2 (clock not reset).
4. Weights: π_H ∝ π_H·P_H(y). Mixture weights ∝ w·P(y), then share α = 0.001.

## 4. Update per card review and per instruction
- **Review:** FSRS step on the card (Good or Again); under H1, KC memory gets the same grade × ρ; card offsets get an ADF step.
- **Instruction:** KC memory starts (or gets Good); v_k variance +0.5.

## 5. Prediction served
p = π-weighted average over H, then mixed with PFA-MAP: p = 0.8·p_KF + 0.2·p_PFA at start, weights updated per §3.4.
- PFA-MAP: logit = β₀ + β_k + β_sys + γ₁ln(1+S_k) + γ₂ln(1+n_k) + prerequisite means + δb + β_h·h. Priors: N(0, 0.5²) on fixed effects, N(0, 0.3²) on random effects, δ ~ N(−1, 0.5²). Refit nightly.
- Bayes-mixture regret: at most ln(1/0.8) + n·ln(1/(1−α)) nats over n events against KF alone. That is 0.0017 nats per event at n = 300, and it tracks PFA if PFA fits a user better.

## 6. Card weights
- Default w₀ until 1,000 reviews.
- Then nightly MAP: w = argmax ℓ(w) − ½Σ((w−w₀)/(κ·SD))², with SD the fsrs-rs prior spread and κ = 0.3 (κ = 1 overfits at small n; 09).

## 7. Hyperparameters
- Fixed by simulation (09): α, α_p, g, s, ω, mixture prior and share, priors above. KF accuracy is insensitive to α ∈ {0.5, 1} and initial KC stability ×{0.5, 1, 2}.
- Learned per user: everything in §1 by ADF; π_H and the mixture weights online; PFA nightly; card weights after 1,000 reviews.
- Fixed, not learned per user: α, α_p, g, s, ω. Predictions were insensitive to α in simulation; g, s and ω were not varied.

## 8. Time models
**Duration of a CP or item** (y = ln(actual/estimate)):
- y = ℓ_t + x′β + ε, where ℓ_t is a random-walk level (step sd 0.03 per task, prior N(0.7, 0.4²)), x = [kind, difficulty proxy (−predicted logit of the criterion), ln(estimate/60)], β ~ N(0, diag(0.25², 0.2², 0.2²)) with the proxy prior mean 0.2.
- Fitted by Kalman filter. σ_ε² is adaptive (running innovation variance, prior 0.4² worth 5 tasks).
- Prediction is lognormal; totals are moment-matched.

**Attendance of a planned block:**
- P(kept) = σ(x′θ_t), x = [1, weekday(7), slot(4), kept yesterday, ln(block/60)].
- θ by ADF with prior means (1.0, 0, 0, 0.5, −0.5) and sds (0.7, 0.4, 0.6, 0.5, 0.2); intercept drift 0.02/day.
- Minutes | kept ~ lognormal(ln planned − 0.1, 0.25²).

## 9. Diagnostics: "only randomness remains" (replaces I13)
Rolling 200 predictions per stream (attempt, card, duration, attendance), recomputed nightly:
| Test | Pass | On fail |
|---|---|---|
| D1 beats the baseline (base rate; per-kind mean for durations) | log loss lower | FLAGS `model below baseline`; serve whichever of PFA and the baseline has the lower recent log loss |
| D2 calibration: y ~ a + b·logit p; for skewed streams (mean p > 0.85) binned ECE instead | \|a\| ≤ 0.2 and 0.8 ≤ b ≤ 1.2; or ECE ≤ 0.03 | switch on the Platt layer (a, b by ADF) for that stream |
| D3 residual score test on hour, fatigue, days since last session, item kind, hint | every \|z\| ≤ 3 | add the feature to the residual layer; FLAGS names it |
| D4 randomized PIT, Kolmogorov–Smirnov | p ≥ 0.01 | FLAGS |
| D5 interval coverage (durations, 80%) | 0.75–0.85 | widen by the observed ratio |

## 10. Outputs
- Proficiency: P(clean pass, b = 0, now and at the deadline) with an 80% interval from V.
- Retention: R_k and R_c now and on any date. Gap: P(gap) (two-state assumed KCs, unchanged from v2).
- Blame share; states shown / inferred / none (v2 rules).

## 11. Determinism and cost
- Replay facts ordered by (occurred_at, id); identical facts give identical output (I3); undo is exact (I7).
- Per event: O(tags × components), about 50 flops; no allocation in the hot path.
- Nightly on device, in a worker: PFA refit ≈ 10 ms per 300 attempts; FSRS MAP ≈ 0.3 s per 300 reviews, linear in reviews (both measured in the Python harness).
