# 10 Scheduler v3 (decision layer, upgrades N169/N171)

Pure and deterministic given facts and seeds (I3); undo is exact (I7). Input: the information model (01). Outputs: the day's queue, calendar blocks, feasibility, prune proposals and the TIME block.

## Lessons from the last 10 PRs
| PR | Lesson → rule here |
|---|---|
| N169 | Pace factor ≈ 3× on production → durations are learned with uncertainty (01 §8) |
| N169 | Capacity is often unset → never guessed; until set, FLAGS asks, and attendance is learned from blocks |
| N171 | The app imports the pure `assemble` for parity → keep its API and the parity test |
| #1492 | tools/list is 14,669 of 15,000 chars → no new tool fields (04 §MCP) |
| #1492 | Read heartbeats were blocking undo → new tables follow the telemetry rule; reads never journal |
| N167 | Change-feed backlog caused refetch storms → one invalidation per drain |

## 1. Utility
U = 0.6·Σ_k ω_k·P̂_k(T_k) + 0.4·Σ_c ω_c·R̂_c(T_c)
- P̂_k(T) = predicted P(ok) on a standard item of KC k (mean criterion b) at its need date T: the next dependent CP's day, else last_study_on.
- R̂_c(T) = card recall on that date.
- ω_k ∝ tier weight (core 3, standard 2, venture 1) × exam weight × (1 + dependents); ω_c = ω_{k(c)} / cards on k. Both are normalised.
- The 0.6/0.4 split is the Owner setting `card_weight` (default 0.4).

## 2. Allocation: knowledge-gradient MPC
After every action, pick argmax_a E_y[ΔU(a, y)] / E[minutes(a)].
- **Candidates:**
  - practice on each open KC, with the item whose predicted p is nearest 0.80 inside the band 0.70–0.90;
  - review of the 12 cards with the lowest R̂ at their need date (only if < 0.98);
  - due checks and teaching are forced first (§3, §6).
- **ΔU:** apply the model's own update (01 §3–4) to a copy of the affected state (the KC, its prerequisites and dependents, its cards) for y ∈ {ok, not ok}, weighted by the predicted p.
  - A Gaussian ability mean has zero expected change, so gains come only from memory and learning terms: effects the model actually claims.
- **Coupling:** gains are averaged over the coupling hypotheses by π_H. A card → skill effect counts only as far as the data support it. In simulation, assuming it cost up to 0.04 exam score in the world where it is absent (09).
- **Card cap:** card minutes ≤ `card_cap` × block (Owner setting; default 12.5%, half the review share). Its measured cost is in 09.
- **Cost:** ≤ 100 candidates × 2 outcomes × the affected states, ≈ 1–3 ms per decision.
- Planning uses the KF part of the model only. The PFA safety net is correlational (its count terms are not causal effects), so it serves predictions only.

## 3. Teaching pacing (constraint)
- Teach the next KC in CP order on each study day with ≥ 30 free minutes, as simulated, until all are taught.
- Never fall behind a linear pace that finishes every core KC by last_study_on minus max(7 study days, 20% of the course). If behind, teach first.
- Reason: a one-step look-ahead under-values first teaching, which pays off only through later practice.

## 4. Durations, supply, feasibility (01 §8)
- **Remaining minutes per CP:** P(test-out)·15 + (1 − P(test-out))·lognormal from the duration model.
- **Supply:** Σ over planned blocks of P(kept)·E[minutes | kept]. Variance combines Bernoulli × lognormal noise and parameter uncertainty.
- P_all = Φ((S − R)/sd); P_core is the same over core CPs only.
- **Prune** below 0.80; **restore** above 0.95 on 2 consecutive study days. `scheduler_runs.p_all` and `p_core` are frozen at the first run of the day.

## 5. Pruning value
- value/min = ω × (1 − P(test-out)) ÷ remaining minutes.
- P(test-out) ≥ 0.7 → the CP becomes a 15-min test-out probe.
- Standard tier: automatic when `auto_prune_standard`; core: by proposal. The prune order is unchanged.

## 6. Rechecks and checks
- T1–T5 are kept; T5 fires on P(gap) > 0.8.
- **Certification check** (core criterion facets): due on the first study day ≥ teach day + clamp(0.15 × days to exam, 1, 7). At most 1 open per (KC, facet), never due on its creation day (I18). Spacing follows Cepeda et al. 2008.
- **Deadline clamp:** core ≤ last_study_on − 1. Each core item with R̂ at the exam < 0.90 gets one review in the final 3 study days.

## 7. Session template (queue order)
1. Forced checks, ≤ 25% of the block.
2. Teaching (pacing).
3. KG queue (§2).
4. Close (≤ 10 min): 3 recall questions, card drafting (11 §4), stage logging.
- Re-entry after > 3 study days: 3 probes on the current CP's prerequisites first.

## 8. Several projects
- One utility over all projects, each weighted by its exam weight.
- Constraint: every project keeps P_core ≥ 0.8 where possible; otherwise ask the Owner (unchanged).
- Earliest deadline first breaks ties; `share_weight` overrides.

## 9. Calendar placement (Lemma owns the calendar)
- Candidate slots: the user's declared windows ∩ free time (`calendar_overlaps`).
- Thompson sampling: draw θ from the attendance posterior, then rank slots by P(kept) × expected minutes. Show the top 2; the user's choice and any later move are facts that feed the model.
- Simulation: +3.7% realised minutes against a fixed slot over 60 days; knowing the true best slot would give +14% (09).

## 10. TIME block
`fit=P_all core=P_core`, `checks_due=N`, `new_cards_quota=N`, `card_min=used/cap`. All derived (I1).
