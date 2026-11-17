# 04 Backend

## Pure core (`supabase/functions/_shared/adaptive/`)
No I/O. Shared by the MCP server and the app, as in N171.

| File | Change |
|---|---|
| measure.ts | NEW. Information model 01: KC and card FSRS memory, two-process noisy-AND likelihood, execution ADF (with learning slope and fatigue), coupling hypotheses, PFA safety-net mixture, card offsets; stage, hint, legacy, which-tool, two-state. `replay(facts, fit)` → State |
| fit.ts | NEW. Nightly: PFA-MAP refit, FSRS MAP (≥ 1,000 reviews), diagnostics D1–D5 (01 §9); writes `model_fits` |
| kg.ts | NEW. Utility, knowledge-gradient MPC, candidate set, card cap, pacing (10 §1–3) |
| timemodel.ts | NEW. Kalman duration model; attendance ADF; supply and P_all/P_core (01 §8, 10 §4) |
| calendar.ts | NEW. Slot ranking by seeded Thompson sampling (seed = hash(user, study_day), so I3 holds) (10 §9) |
| kc.ts | NEW. Kind → facets, legacy level → facet, context distance (0 same home, 1 planet, 2 system, 3 subject), cue rule, transfer opportunity |
| links.ts | NEW. Default tags (prereq → required at −1; uses_technique → select), shared components, bridge strength |
| policy.ts | NEW. Certification, probe priority, bands, stretch budget, staircase, frustration, DP loop (06) |
| proficiency.ts | REMOVE. Mode logic moves to policy.ts |
| items.ts | predictItem via measure.ts; selection via policy.ts; drop `updateB` |
| calibration.ts | Log loss, Brier as REL − RES + UNC, buckets on P(clean pass), full / pooled / base |
| node.ts | Card v2, profile, theme, bridges |
| recheck.ts | Input is attempts/tags; T5 fires when P(gap) > 0.8; T2 unchanged; certification checks, deadline clamp, final-3-day reviews, re-entry probes (10 §6, §9) |
| time.ts | Calls timemodel.ts; EWMA pace removed |
| prune.ts | Value per minute, test-out compression, 0.80/0.95 thresholds with 2-day hysteresis (10 §3–4) |
| queue.ts | Session order (10 §7) around kg.ts. `assemble` API kept for app parity |
| plan.ts | `plan_template_v1` validation (11 §5); several-project allocation (10 §8) |
| cards.ts | NEW. Card quota, card-plan limits per KC kind, suspend and lapse proposals (11 §4) |
| convert.ts | NEW. Hard-rule checks for conversion output (12) |
| facts.ts | Load attempts, attempt_tags, instruction_events, atlas_links, model_fits, concepts.kind |

## Card v2 (≤ 100 tokens)
`<name> [kind] Rc .91(.84–.95)s3 · Un — · Ex .86(.75–.92)s2 · Sel ~.62<Sets · gap .03 · seen 11-17 flags:[LBU]`

Here sN = sessions with direct evidence, ~ = inferred, < = inferred from that area, and — = none.

## MCP (`supabase/functions/mcp`)
- **save_progress:**
  - **New `attempt` object:**
    - item (id or text), kind, cued[], confidence_before, minutes, plan_score;
    - stages: [{stage, tags:[{concept, facet, role}], result, hint, error:{concept, tag}}].
  - Explanation events accept `concepts[]`, which become instruction_events.
  - Old fields (concept, level, role, novelty, item) are still accepted and stored as a one-tag legacy attempt.
- **get(what=node):** card v2. `depth=profile` adds the facet table.
- **New get values:**
  - `profile` (id = system | project);
  - `theme`, id;
  - `bridges`, subject;
  - `probes`: top 5 by priority, with target facet and suggested b.
- **get(what=calibration):** v2 report.
- **Tool budget (#1492: 14,669 of 15,000 chars).** No tool-schema change. `get.what` is a free string routed in `tools/read.ts`, so new reads cost nothing in tools/list:
  - `feasibility` (existing) now returns P_all, P_core, required, supply;
  - `plan_template`: 11 as compact rules, ≤ 800 tokens;
  - `card_budget`: quota, units used today, 30-day load forecast;
  - `conversion_input`, id = project (12).
- **propose_plan:** validates against `plan_template_v1`; failure returns the full reason list and saves nothing.
- **Conversion drafts:** `study` → `proposal_drafts`, kind `plan_conversion`; checked by `convert.ts`. Approval applies the plan and card changes as one undoable action.
- **TIME block:** slack is replaced by `fit P_all (core P_core)`; adds `checks_due` and `new_cards_quota`.
- **study resources:** `atlas_links` (decide approve/reject); `concepts` edit for kind and family_id; `instruction_events` (create, void).
- **resume:**
  - BRIEF uses card v2.
  - FLAGS adds probe-due gaps, integration gaps, model-health failures (D1–D5) and frustration state.
  - Budgets unchanged.
- **Rules text** (add, terse):
  - Log stages, cue and errors on attempts.
  - Select counts only when uncued.
  - Tag the explanation event when teaching a KC.
  - Plan first on proofs ≥ plan_first_min.
  - Plan with the template (`get(what=plan_template)`).
  - Draft cards only in close, within `new_cards_quota`; a proof gets a key-idea card and a skeleton card, never line cards.
  - A full proof is practised as a reconstruction recheck.
- Remove every reference to the Beta "mean ± sd".

## Workers (N170 infrastructure; still inactive until a key exists)
| Worker | Role |
|---|---|
| scribe | Proposes tags (concept, facet, role, stage) with confidence. Never sets results, hints, errors or cued (I14) |
| gardener | Link candidates and proposals (06 §6); digests |
| curator | Items with cued[], b and b_sd; fills template item specs (practice, stretch) as items |
