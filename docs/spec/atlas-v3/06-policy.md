# 06 Policy

## 1. Certification
Facet f of KC k is certified when all of these hold:
- P(η ≥ t) ≥ 0.8 and the KC memory R_k ≥ 0.85 at the check (01 §2);
- direct evidence from ≥ 2 sessions, the later one ≥ 1 study day after the last instruction event, on a novel item;
- for select and transfer, the evidence is uncued.

Certification replaces fast-track (p ≥ 0.85, n_eff ≥ 2). Scrutiny triggers when P(θ < t − 1) ≥ 0.5 on a criterion facet, or when a prerequisite has P(gap) > 0.5. The 2-signal hysteresis is kept.

## 2. Probes
- **Priority** = w·σ·L(|m − t|/σ) ÷ minutes.
  - L(z) = φ(z) − z(1 − Φ(z)), the expected loss.
  - w = 1 + number of core checkpoints reached through prerequisite edges.
- **Item:** b = t, so p = 0.5 at θ = t (most informative at the threshold).
- **Micro-probe:** ≤ 1 min; facet recall or recognise only; never certifies select or execute.
- **Stop** when priority < 0.02 per minute. Top 5 are exposed via `get(what=probes)`.
- Probes gate certification and scrutiny only. Minute allocation is the KG queue (§8). Probes were not part of the end-to-end simulation, so their effect on exam score is unmeasured.

## 3. Item bands
| Class | Target P(clean pass) | Time box | Counts as |
|---|---|---|---|
| practice | 0.70–0.90, aim 0.80 (as simulated) | 1.5 × est | full evidence |
| stretch | 0.30–0.60; only when prerequisites have P(θ ≥ t) ≥ 0.7 | 2 × est, ≤ 40 min, then a debrief | full evidence |
| prepare | any; before the instruction event | 10–20 min | pre-teaching evidence |
| select (which-tool) | guess floor 1/k | 1–2 min | select facet only |
| micro | — | ≤ 1 min | recall or recognise |
| retry | original failed problem, ≥ 2 study days later | as the original | familiar (w 0.5); integration evidence |

- **Stretch share:** `settings.atlas.stretch_share` (default 0.2, max 0.25) of learning minutes.
- **Uncalibrated items** (b_sd ≥ 0.6): staircase on difficulty 1–5. Practice uses 1-up/4-down (≈ 0.84); stretch uses 1-up/1-down (≈ 0.50).
- **Realised check:** each band's last 30 clean-pass rate must stay within ±0.1 of its band. Otherwise flag "recalibrate items".

## 4. Frustration and the deliberate-practice loop
- **Frustration** when any of these occur:
  - a stretch attempt stalls 12 min;
  - 2 abandons in a row;
  - 3 fails in a row on items with p ≥ 0.6;
  - the learner says so.
- **Response:** the next 3 items come from practice at ≥ 0.85, and the stretch share halves for the study day.
- **DP loop:**
  1. Top blame × importance over the last 20 failed stages.
  2. 4–6 practice items from ≥ 2 sources, with feedback.
  3. Retry after ≥ 2 days.
  4. Plan first on proofs ≥ plan_first_min. The plan scores 0–3: key idea, valid order, each hypothesis placed. The score feeds the control KC "proof planning".

## 5. Link semantics
| Kind | Model effect |
|---|---|
| prereq A→B (exists) | A is a default required tag (demand −1) on B's items |
| same_as (aliases) | one class |
| equivalent | shared u, τ 0.4 |
| generalises | shared u, τ 0.3; no decision rests on it |
| instance_of theme T | u_T τ 0.3; uncued cross-subject uses are transfer evidence for T |
| uses_technique A→K | K select is a default tag on A's uncued items |
| contrasts | generates understand items; links example KCs |
| analogous | no model effect; stretch candidates only |
| part_of P→C | whole problems on C tag P plus C.execute |

**Bridge strength** = Beta(1+u, 1+o−u).
- o = uncued attempts in another subject whose reference solution uses A.
- u = unprompted uses.
- Thick when mean ≥ 0.5 and o ≥ 3; thin otherwise; dashed when o = 0.
- A dashed bridge with both ends at P(θ ≥ t) ≥ 0.7 becomes a stretch candidate.

## 6. Link pipeline (on course import; also nightly)
1. **Candidates** (deterministic): new node × old node with name trigram ≥ 0.6, blurb ≥ 0.5, or neighbour Jaccard ≥ 0.3. At most 50, ranked.
2. **Worker label:** {kind, direction, confidence, rationale ≤ 20 words} or none.
3. **Owner** approves or rejects in batches. An exact normalised name under a same-named parent is the only automatic link.
4. **Rejected pairs** come back only after a name or blurb hash changes.
5. Approval rate < 50% over the last 40 of a kind → that kind is no longer proposed automatically.

## 7. Integration gap
Flag when whole-problem passes, as a one-sided binomial tail against Π p_parts, give < 0.05. The composite's execute facet then carries the gap.

## 8. Allocation
Minutes go by the knowledge-gradient MPC in 10 §2: expected utility gain per minute, under the model's own dynamics, averaged over the coupling hypotheses, within the card cap and teaching pacing.
- Item difficulty is chosen by band, not optimised. The model cannot identify how learning depends on difficulty, and the 85% rule (Wilson et al. 2019) supports a band.
- The previous allocation (probe priority plus memory priority) scored below the N169 heuristic in simulation, so it is removed (09).
