# Lemma Atlas v3 — implementation pack

Date 2026-11-18. Spec only; no app code (the `sim/` harness is research evidence). Base: `main` at c8dd9c9 (N170).

## What changes
- **One information model (01).** Every interaction (attempt, card review, teaching, timer, calendar block) is predicted before it happens and then absorbed.
  - KC memory runs on FSRS-6, adapted from cards to skills, combined with a hierarchical Bayesian execution ability that has learning and fatigue terms.
  - Problems succeed through a noisy AND of retrieval and execution.
  - FSRS cards are coupled to KC practice; learned durations and attendance cover time.
  - Each update is one closed-form Bayesian step (ADF) and runs on a phone.
- **Chosen by test, not taste (09).** Two structurally different simulated worlds, tuning learners separate from test learners, 6 attempt-model families (24 tuned variants) plus mixtures.
  - The v3 model has the lowest reducible error in both worlds: about half that of the previous v2 model. It beats PFA, DAS3H and gradient boosting, and its error keeps falling with data.
  - Diagnostics D1–D5 decide whether "only randomness remains" (01 §9).
- **Decisions (10).** A knowledge-gradient planner spends each minute where the model expects the largest exam gain. Effects the data cannot identify are averaged by their posterior. Lemma also places calendar blocks by learned attendance.
- Kept from v2: typed KCs and links (06), the course template and card policy (11), and the one-pass LLM conversion (12).

## Owner decisions
- **No transition phase.** Data is migrated once (03). No shadow mode, no per-user v2 flags and no legacy decision path. Old proficiency code is removed at cutover.
- Old tables stay, because MIGRATION-ADDITIVE forbids drops; `evidence` is frozen after migration.
- Fewer cards by default; proofs are never split into line cards (11 §4).
- Each existing project is converted once and approved as one plan proposal (12).
- Lemma proposes study-block times from learned attendance; the Owner picks (10 §9).
- Any default in 08 §Open questions applies until the Owner answers it.

## Files
| File | Content |
|---|---|
| 01-model.md | Information model: state, likelihood, updates, time models, diagnostics, cost |
| 02-schema.md | Tables and columns, all additive |
| 03-migration.md | One-shot migration, validation, rollback |
| 04-backend.md | Pure core modules, MCP contract, workers |
| 05-ui.md | App changes by screen, data layer, states, copy |
| 06-policy.md | Certification, probes, practice bands, deliberate-practice (DP) loop, links pipeline |
| 07-tests.md | Invariants, tests, acceptance criteria |
| 08-work-items.md | NEXT.md-ready items, order, open questions |
| 09-evidence.md | Model selection, real-data check, time models, end-to-end results, sources |
| 10-scheduler.md | Decision layer: utility, knowledge-gradient planner, pacing, feasibility, calendar placement |
| 11-course-template.md | Course template, card policy and quota, plan validation |
| 12-legacy-conversion.md | One-pass LLM conversion of existing projects |
| sim/ | Seeded simulation harness and protocol (Python) behind every number in 09 |

## Conventions (AGENTS.md)
- Migrations are additive.
- Fact tables: registered for undo, RLS `user_id = auth.uid()`, plus `version`, `updated_source` and the browser-write revoke.
- Derived caches are not registered for undo and are recomputed on read.
- Pure core lives in `supabase/functions/_shared/adaptive/`.
- Each item records itself in `docs/current/<id>.md`.

## Glossary
| Term | Meaning |
|---|---|
| KC | Knowledge component: a typed Atlas node |
| Facet | One way of knowing a KC: recall, understand, use, select, execute, recognise, construct, transfer, perform |
| Stage | Phase of an attempt: U understand, S select, E execute, C check |
| Tag | One (KC, facet, role, stage) on an attempt |
| Episode | Attempts on one (session, KC, facet) |
| Cued | The prompt names or implies the KC |
| Clean pass | Unaided pass, hint 0 |
| t | Mastery threshold, logit(0.85) = 1.73 on an item with b = 0 |
| CP | Checkpoint |
| P_all / P_core | Probability that all / core remaining CPs fit before last_study_on |
| Card unit | Review cost of one short card; a skeleton is 3 units |
| KF | The v3 attempt model: KC FSRS memory × execution ability (01 §2) |
| ADF | Assumed-density filtering: one Gaussian Newton step per observation |
| KL to oracle | Reducible prediction error in simulation (0 = only randomness left) |
| KG | Knowledge gradient: expected utility gain per minute of one more action |
| D1–D5 | Model-health diagnostics (01 §9) |
