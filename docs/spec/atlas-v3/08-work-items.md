# 08 Work items (NEXT.md-ready)

Add these as Owner tasks with the next free IDs. Build order: N172, N173, N174, N177, N178, N179, then N175 cuts over once; N176 follows. No item turns anything on before N175: new code stays dormant because `attempts` is empty until the migration runs.

## N172 Atlas v2 core and schema
- **Done:**
  - 02 migrations plus the down script;
  - `measure.ts`, `fit.ts`, `kc.ts`, `links.ts`, `policy.ts`;
  - `calibration`, `node`, `recheck`, `facts` changes;
  - information model v3 (01) in `measure.ts` and `fit.ts`;
  - `research/sim/` (Python, CI-only, never shipped) with golden files: the TS core must reproduce the harness on 3 seeds to 1e-6;
  - 07 unit and property tests; a nightly CI job runs the simulation gates.
- **Scope:** `supabase/migrations/*_n172_*`, `supabase/rollback/N172.down.sql`, `_shared/adaptive/**`, `tests/unit/adaptive/**`, `docs/current/N172.md`.
- **Not:** removing Beta (that is N175), MCP, UI.

## N173 MCP contract v2
- **Done:** 04 §MCP. The `attempt` payload writes `attempts`/`attempt_tags`/`instruction_events` only after cutover; until then it is validated and rejected with "Atlas v2 not migrated". New get values. Rules text. Token budget tests.
- **Scope:** `supabase/functions/mcp/**`, `tests/mcp/**`, `docs/current/N173.md`.

## N174 App UI v2
- **Done:** all of 05; demo data; parity test; e2e.
- **Scope:** `src/ui/v7/**` (new primitives); `src/features/{atlas/v7, insights/v7, checkpoint/v7, project/v7/Evidence.tsx, home/v7, proposals, settings, session, kit}`; `src/data/**`; tests.
- **Note:** with `attempts` empty the UI shows "—" everywhere; acceptable until cutover.

## N175 Cutover
- **Done:**
  - `atlas_v2_migrate` RPC (03); dry run on production; Owner approval; real run;
  - scheduler state (03 step 7); the conversion run and approvals (03 step 8);
  - delete `proficiency.ts` and Beta paths; freeze `evidence` writes;
  - replace protected Beta tests via a `rules:` PR;
  - acceptance 1–6.
- **Scope:** migration RPC file, `_shared/adaptive/**`, `mcp/**`, tests, `docs/current/N175.md`.

## N176 Links v2 pipeline
- **Done:** 06 §5–6; gardener candidates; proposals UI wired.

## N177 Scheduler v3
- **Done:**
  - 10: `kg.ts`, `timemodel.ts`, `calendar.ts`; `time`, `prune`, `queue`, `recheck`, `plan` changes;
  - TIME block fields; `feasibility` payload;
  - Today, Path, Planner and Model-health UI (05);
  - 07 scheduler tests and end-to-end gates.
- **Scope:** `_shared/adaptive/{kg,timemodel,calendar,time,prune,queue,recheck,plan}.ts`, `mcp/**`, `src/features/{home/v7, project/v7, planner, calendar, insights/v7}`, `src/data/**`, `tests/**`, `docs/current/N177.md`.
- **Note:** the N169 decision paths stay live until N175 swaps them.

## N178 Course template and card policy
- **Done:** 11; `plan_template_v1`; `cards.ts`; propose_plan validation; `plan_template` and `card_budget` reads; rules text; template columns (02); plan-proposal UI; quota setting.
- **Scope:** `_shared/adaptive/{plan,cards}.ts`, `supabase/migrations/*_n178_*`, `mcp/**`, `src/features/{plan-proposal/v7, settings}`, tests, `docs/current/N178.md`.
- **Note:** validation turns on at N175.

## N179 Legacy conversion
- **Done:** 12; `conversion_input` read; `convert.ts`; `plan_conversion` drafts and approval as one undoable action; conversion view; tests on a copy of the 4 projects.
- **Scope:** `_shared/adaptive/convert.ts`, `mcp/**`, `src/features/{plan-proposal/v7, proposals}`, tests, `docs/current/N179.md`.
- **Run:** inside N175 (03 step 8).

## Open questions (default applies until answered)
| # | Question | Default |
|---|---|---|
| 1 | Mastery threshold | 0.85 clean pass at b = 0 |
| 2 | Ask confidence before problems | on |
| 3 | Past exams for hold-outs | none yet |
| 4 | Create KCs below topic level | lazily |
| 5 | Stretch share | 20% |
| 6 | Plan-first minimum | 10 min |
| 7 | Link proposals per batch | 50 |
| 8 | 24 untagged legacy rows | one tutor tagging pass |
| 9 | Card quota share | 50% of the sustainable rate |
| 10 | Prepare (PS-I) step | conceptual core CPs only |
| 11 | Suspending certified, stable cards | proposal, never automatic |
| 12 | Owner rejects a conversion | revise and resubmit once; if rejected again, the project keeps its plan and new CPs follow the template |
| 13 | Card cap / card weight in the exam utility | 12.5% of a block / 0.4 (cost of the cap: 09) |
| 14 | Teaching reserve before the deadline | max(7 study days, 20% of the course) |

## Model and effort
- **Build items (N172–N174, N176–N179):** Sonnet 5.5, high effort. The maths is fixed here; golden files fix the numbers.
- **Conversion run:** Opus 5.5, one fresh chat, one pass per project.
- **Review of `supabase/**`, and N175:** Opus 5.5, high effort, in a fresh chat.
