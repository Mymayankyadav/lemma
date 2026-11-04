# CURRENT — what exists in Lemma (written from the code on 2026-11-03)

Every claim below can be checked in the repo. Anything I could not check is marked **unverified**.

## What Lemma is

A private, proof-first mathematics study app. A web PWA (React) talks to a Supabase project; an AI tutor (Claude/ChatGPT) connects through an MCP server (a Supabase Edge Function) and only *proposes* plans, cards and edits. The user approves them in the app. Reviews are scheduled with FSRS. Plain-language guide for the owner: `docs/guide.md` (not re-verified).

## Stack

- Frontend: React 19, React Router 7, TanStack Query, Zustand, Tailwind 4, Vite 8 (`vite.config.ts`, base path `/lemma/`), `vite-plugin-pwa`, KaTeX, `marked` + DOMPurify, d3 (force/scale/shape/zoom), `pdfjs-dist`, `motion`. Exact versions: `package.json`.
- Backend: Supabase project `yemqnhnztlbyxmjxidis` (Postgres + RLS, Storage bucket `sources`, Edge Functions `mcp` and `notify` in `supabase/functions/`). Migrations: `supabase/migrations/` (28 files).
- Hosting: GitHub Pages (`.github/workflows/pages.yml`, built on every push to main).
- Tests: Vitest (jsdom) for `tests/unit/**/*.test.{ts,tsx}`, Playwright for `tests/e2e` (one project, chromium, 390×844), Node scripts for SQL/MCP checks in `tests/mcp/*.mjs`.
- Modes: **live** (Supabase) and **demo** (local fixture; `?demo=1`, `?demo=stress`, `?demo=extreme`, `?demo=0` exits) in `src/data/mode.ts`. E2E runs in demo mode.

## Install, run, test

```
npm ci
cp .env.example .env.local        # VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, VITE_VAPID_PUBLIC_KEY
npm run dev                        # predev generates icons, then vite
npm run check                      # typecheck (tsc -b) + unit tests + build + PWA artifact check
npm test                           # vitest run
npm run e2e                        # playwright (builds, serves on :4173)
```

`.env.production` (committed) holds the public Supabase URL and publishable key. Demo mode needs no env.
Last run on main `a68d15c` and on this cleanup: `npm run check` passes (main: 181 test files / 859 tests; after cleanup: 177 / 819 — the 4 removed files tested the deleted agent protocol and docs).

## FEATURES

Stage: Stable = works and has tests on main. Harden = exists but is reported broken, or untested. Harden reasons are under "Known breakages". Flag column is "—" because no feature uses a flag yet (`src/flags.ts` is the mechanism).

| Feature | Source folders | Main tests | Stage | Flag |
|---|---|---|---|---|
| Today (home, Continue, goal cards, review outlook) | `src/features/home` | `tests/unit/home`, `tests/e2e/home.spec.ts`, `look-5b-today-duplicates.spec.ts` | Harden | — |
| Projects list and New project | `src/features/projects`, `src/features/new-project` | `tests/unit/projects`, `tests/e2e/projects.spec.ts`, `fix-659-new-project.spec.ts` | Stable | — |
| Project page (stages, plan route, sources) | `src/features/project`, `src/ui/timeline` | `tests/unit/project`, `tests/unit/timeline`, `tests/e2e/project.spec.ts` | Stable | — |
| Checkpoint page | `src/features/checkpoint` | `tests/e2e/look-1f-checkpoint.spec.ts`, `fix-659i-checkpoint-defer.spec.ts` | Harden | — |
| Tutor sessions | `src/features/session` | `tests/unit/session`, `tests/e2e/session.spec.ts` | Stable | — |
| Proposals (card approvals) | `src/features/proposals` | `tests/unit/proposals`, `tests/e2e/proposals.spec.ts` | Stable | — |
| Plan proposal review (plan map, change map, ideas) | `src/features/plan-proposal` | `tests/unit/plan-proposal`, `tests/e2e/st2-plan-review.spec.ts` | Harden | — |
| Review (queue, run, done) | `src/features/review`, `review-run`, `review-done` | `tests/unit/review`, `review-*.test.ts`, `tests/e2e/review.spec.ts` | Harden | — |
| Cards browser and card detail | `src/features/cards`, `src/features/card` | `tests/unit/cards`, `tests/e2e/cards.spec.ts`, `fix-648-cards-filters.spec.ts` | Harden | — |
| Atlas (concept graph) | `src/features/atlas` | `tests/unit/atlas` (23 files), `tests/e2e/atlas.spec.ts`, `look-4*-atlas.spec.ts` | Harden | — |
| Insights (charts) | `src/features/insights`, `src/ui/charts` | `tests/unit/features/insights-math.test.tsx`, `tests/unit/charts`, `tests/e2e/insights.spec.ts` | Stable | — |
| Settings | `src/features/settings` | `tests/unit/settings`, `tests/e2e/settings.spec.ts` | Stable | — |
| Sign-in, auth gate, demo mode | `src/features/sign-in`, `src/app/AuthGate.tsx`, `src/data/mode.ts`, `src/data/demo` | `tests/unit/app/auth-gate.test.tsx`, `tests/unit/demo`, `tests/e2e/routes.spec.ts` | Stable | — |
| UI kit (`/kit`) | `src/features/kit`, `src/ui` | `tests/unit/ui`, `tests/e2e/kit.spec.ts` | Stable | — |
| FSRS scheduling and optimizer | `src/lib/fsrs`, `src/lib/schedule.ts`, `src/lib/optimizer.worker.ts` | `tests/unit/lib/fsrs.test.ts`, `optimizer.test.ts`, `tests/unit/schedule` | Stable | — |
| PDF sources: upload, text extraction, storage | `src/pdf`, `src/lib/queue.ts` | `tests/unit/pdf`, `tests/unit/data/archive.test.ts`, `tests/e2e/source-*.spec.ts` | Stable | — |
| PWA shell, install, offline cache | `vite.config.ts`, `src/app/PwaStatus.tsx`, `src/lib/offline-cache.ts`, `scripts/check-pwa.mjs` | `tests/unit/app/pwa-status.test.tsx`, `tests/unit/lib/offline-cache.test.ts`, `tests/e2e/and1-install.spec.ts` | Harden | — |
| MCP connector (23 tools) | `supabase/functions/mcp` | `tests/unit/mcp`, `tests/unit/mcp4`, `tests/mcp/*.mjs`, CI `mcp-sql` | Harden | — |
| Notifications (reminders, push, `notify` function) | `supabase/functions/notify`, `src/data/notify.ts` | `tests/unit/notify` (15 files), `tests/mcp/notif1*.mjs` | Harden | — |
| Deploy pipeline (Supabase workflow, MCP smoke) | `.github/workflows/supabase.yml`, `mcp-smoke.yml`, `scripts/mcp-selftest-queue*.mjs` | `tests/unit/agents/mcp-selftest-*.test.ts`, `tests/mcp/smoke.mjs` | Harden | — |
| Stress and screenshot harness (ST-0 budgets, QA captures) | `scripts/stress-*.ts`, `scripts/qa3-*.ts`, `scripts/qa4-screens.ts`, `scripts/review-shots.mjs` | `tests/unit/stress`, `tests/unit/qa4`, `tests/e2e/stress*.spec.ts` | Stable | — |

Routes (`src/app/routes.tsx`): `/`, `/projects`, `/projects/new`, `/p/:slug`, `/p/:slug/cp/:code`, `/s/:slug/:n`, `/proposals`, `/proposals/:id`, `/review`, `/review/run`, `/review/done`, `/cards`, `/cards/:no`, `/atlas`, `/insights`, `/settings`, `/sign-in`, `/kit`.

Not on main (existed only in archived, unmerged PRs): Android Trusted Web Activity shell and store kit (AND-3, AND-4), read-only offline snapshot (AND-8). Only `docs/android/assetlinks.template.json` (read by `tests/unit/lib/platform.test.ts`) is on main.

## Data model

Tables in `public` (from `supabase/migrations/20261029164215_lemma_tables.sql` and later), every row carries `user_id` with RLS; connector and app code must filter by `user_id`:

- Study structure: `subjects`, `projects`, `concepts`, `concept_links`, `checkpoints`, `checkpoint_prereqs`, `checkpoint_concepts`, `checkpoint_sources`, `styles`, `settings`.
- Sources: `sources`, `source_pages` (extracted text, `tsv` full-text column); Storage bucket `sources` (owner-folder policies, `20261029164332_lemma_storage.sql`).
- Tutor sessions: `sessions`, `session_events`, `misconceptions`, `diagnostics`.
- Cards and reviews: `notes` (kinds: definition, theorem, why, example, counterexample, proof, other), `cards` (FSRS fields: due, stability, difficulty, reps, lapses), `reviews` (rating 1–4, confidence sure/unsure/guess), `card_comments`.
- Approvals: `proposals` (kinds card, card_edit, plan, plan_change; status pending/approved/rejected).
- History: `actions`, `action_changes` (undo log); views `v_history`, `v_action_changes_owner`, `v_plan_revisions`, `v_due_cards`.
- Notifications: `notifications`, `notify_holds`, `push_devices`.
- Key RPCs (`create function` in migrations): `bootstrap`, `record_review`, `undo_review`, `undo_action`, `approve_proposal`, `approve_card_proposals`, `reject_proposal`, `save_progress`, `mcp_commit`, `review_items`, `deck_tree`, `home_summary`, `home_review_outlook`, `insights`, `search_cards_page`, `search_cards_filtered_page`, `project_summaries`, `source_transcription_stats`, `notify_candidates`, `notify_act`, `notification_review_items`, `ping`.

Types: `src/data/types.ts` (domain), `src/data/live/database.types.ts` (generated, **unverified** that it matches the remote schema). Remote migrations are NOT all applied — see Known breakages.

## MCP connector tools

Registered in `supabase/functions/mcp/server.ts` (`TOOL_NAMES`, 23): `resume`, `get`, `read_pages`, `search`, `save_pages`, `start_session`, `save_progress`, `end_session`, `propose_cards`, `propose_card_edits`, `propose_plan`, `propose_plan_change`, `create_project`, `proposals`, `decide`, `set_prompt`, `history`, `undo`, `edit`, `add`, `delete`, `review`, `grade`. Tool modules: `supabase/functions/mcp/tools/{read,write,control,transcribe}.ts`. The `tools/list` payload is budgeted to 15,000 characters (comment in `server.ts`; `tests/mcp/sweep-budget.test.mjs`).

## CI (`.github/workflows/`)

PR gate (required checks: **`fast-gate`** and **`scope`**) and the full suite on main:

| Workflow / job | What it checks |
|---|---|
| `pr-gate.yml` / `fast-gate` | Aggregates: `typecheck-lint` (`tsc -b` + `scripts/ci/lint.mjs`), `unit-affected` (`scripts/ci/affected.mjs` + `ci/test-map.json`; shared code runs all), `smoke-e2e` (6 specs in `ci/test-map.json` `smoke`), `e2e-affected` (4 shards), `sql` (only when `supabase/**` or SQL tests changed). On failure `report` records signatures and opens `incident: <signature>` issues |
| `scope.yml` / `scope` | AGENTS.md mechanics (`scripts/ci/scope.mjs`, runs from the base branch): title, item/issue ids, body line 1, 1 PR per agent and at most 6 open, protected paths (`ci/protected.json`), test deletion/skips, NEXT.md edits, `revert`/`ci: perf calibration` rules. An `expect(` count drop is a warning only |
| `ci.yml` / `check`, `e2e-N-of-4`, `mcp-sql`, `qa3-screens` | The full suite, **on push to main only**. `LEMMA_PERF=off` skips the timing-based checks. `qa3-screens` is skipped unless the repo variable `LEMMA_QA3_IN_CI` is `true` (pinned by `tests/unit/ci/workflow-sharding.test.ts`) |
| `ci.yml` / `revert`, `main-green` | Red main: one `revert #<pr>` PR (`Agent: ci`, label S0, auto-merge) + one S0 incident; green main closes the incident |
| `perf-report.yml` | **Non-blocking.** The checks in `ci/perf-checks.json` (4×-CPU renders, ST-0 budgets, `notif1b-stress.mjs` 150 ms, `stress-home-perf` unit) and `qa3-screens`; posts a summary |
| `calibrate.yml` | Manual + nightly: runs each perf check N=10 times on main, writes `ci/perf-calibration.md` through a `ci: perf calibration` PR (only this job writes that file); pass rate under 95% = quarantined |
| `sweep.yml` | Every 30 min: `escalate` label, S1→S0 after 2 h with no fix PR, `lease-expired` label |
| `labels.yml` | Creates the labels in `ci/labels.json` |
| `review-shots.yml` / `shots` | PR-only (screenshot script paths): captures v4 route screenshots |
| `review-shots-publish.yml` | On push to `review/**`: commits contact sheets to that branch |
| `pages.yml` | Builds and deploys the app to GitHub Pages on every push to main |
| `supabase.yml` / `deploy` | On push to main touching `supabase/**`: `supabase db push`, deploy `mcp`, verify, MCP smoke. **Currently failing.** |
| `mcp-smoke.yml` / `smoke` | After a successful Supabase workflow: `node tests/mcp/smoke.mjs` against `MCP_URL`. Posts FIFO ticket comments on issue #668 via REST (the issue was closed in the reset; closing is fine, locking would break the queue) |
| `keepalive.yml` | Daily cron: calls the `ping` RPC so the Supabase project does not pause |
| `setup-check.yml` | Manual: reports whether the four deploy secrets exist (values never printed) |

Failure signatures: `scripts/ci/signatures.mjs` reads JUnit (vitest, Playwright, SQL scripts via `scripts/ci/sql-reporter.cjs`) and makes `<kind>/<test file>::<test> :: <normalized first error line>`. State lives in one closed issue labelled `ci-registry` (CI edits its body; agents ignore it). Branch protection settings are outside the repo (**unverified**).

## Known breakages

1. **Main does not deploy: migrations are missing on the remote database.** Per archived issue #776 (verified there by read-only queries on 2026-11-03, not re-checked by me), the `Supabase` workflow run 41566452638 failed at `supabase db push` because local migrations sit *before* the last remote one, and the MCP deploy and smoke steps were skipped. The two unapplied files:
   - `supabase/migrations/20261102052000_notify_candidates_ranked_reuse.sql` (adds an owner-scoped cards index, replaces `public.notify_candidates`)
   - `supabase/migrations/20261102113500_notify_candidates_sort_memory.sql` (`ALTER FUNCTION public.notify_candidates … SET work_mem='16MB'`; must run after the 05:20 file)

   The migration `20261102104500_notification_review_items.sql` between them is already applied remotely. The workflow runs plain `supabase db push` (no `--include-all`). This is NEXT item N1. A merge of the reset PR does not touch `supabase/**`, so it does not trigger this workflow.
2. **Reported on main by archived issues, not re-verified** (these set Stage = Harden): Today goal cards for projects with more than 14 checkpoints still use the old summary card (#614); intermittent ST-7 Continue metadata outside viewport (#760); Atlas C2 4×-CPU cold-route first attempt over 1,000 ms (#647); Cards D6 first attempt over 1,000 ms (#648); Checkpoint CP4 and Plan-proposal cold 4×-CPU renders over budget (#655, #656); mcp-sql NOTIF-1b candidate query over 150 ms (#679); first-visit PWA client not controlled for offline lazy routes (#751); Review filters applied after the daily quota (archived PR #750 / issue #747, unverified).
3. Feature flags: `src/flags.ts` exists (typed, all off by default; override with `?flags=a,b` or `VITE_FLAGS` only in dev, tests and the e2e build; ignored in production). It has one placeholder flag, `ciSelfTest`, and no real flags yet; test: `tests/unit/flags.test.ts`.
4. `legacy/` (old vanilla-JS app and three scripts) is not imported by `src`, `tests` or `scripts` (grep); it is dead code, left alone (**unverified** whether anything outside the repo uses it).
5. Code comments in a few files still cite deleted specs (`data.md §5.4` in `src/data/types.ts`, `v4-look.md §2a` in `src/lib/schedule.ts` and `scripts/make-themes.ts`, `stress.md` in `scripts/qa3-report.ts` and `tests/e2e/look-4b-row-fade.spec.ts`, `design.md §6` in `src/app/routes.tsx`, `notifications.md §4a` in `supabase/functions/notify/test-handler.ts`). The tests are the authority now. `supabase/**` was not edited in the reset so as not to trigger a deploy.
6. `docs/spec/data.md` and `docs/spec/connector.md` were kept only because `scripts/make-demo-data.ts` reads the default KaTeX macros and teaching-style presets from them. Treat them as data inputs, not specs.
7. `supabase/tests/*.sql` are referenced only by `tests/unit/db4/schema.test.ts`; they are not run against a database in CI (**unverified** otherwise).

## UI and performance rules enforced by tests

- ST-0 budgets (`scripts/stress-limits.ts`, tests `tests/unit/stress-gate.test.ts`, `tests/e2e/stress.spec.ts`): no horizontal overflow beyond 1px; under 1,500 DOM nodes; text at least 12px; maths at least 16px; tap targets at least 44px; marks at least 8px apart; 4×-CPU first render under 4,000 ms; Today at most 3 API requests, Insights at most 1; aggregate transfer for those two at most 200 kB.
- Per-route cold-render budgets and first-attempt timings: `tests/unit/atlas/fix-647-*.test.ts`, `tests/e2e/fix-546b-live-budget.spec.ts`, `live-api-budget.spec.ts`, `look-7a-stress.spec.ts`.
- Atlas row geometry, labels and look: `tests/unit/atlas/row-geometry.test.ts`, `tests/e2e/look-4a-atlas.spec.ts` … `look-4c-atlas.spec.ts`.
- Visual palette: two graph-paper themes (`graph`, `graph-night`) in `src/styles/themes.css`, generated by `scripts/make-themes.ts`; colour distance (CIEDE2000) and token rules in `tests/unit/look-0.test.ts`; `tests/e2e/ui6a-graph-material.spec.ts`, `fix-686-stage-paper.spec.ts`, `fix-687-stage-palette.spec.ts`.
- Typography and layout: `tests/e2e/look-1c-typography.spec.ts`, `look-1d-typography.spec.ts`, `layout.spec.ts`, `chart-labels.spec.ts`; maths rendering caches: `tests/unit/ui/tex-cache.test.tsx`.
- Screenshot structure (144 ST-0 PNGs, all routes × themes): `tests/unit/stress/qa3-screens.test.ts`, `qa3-report.test.ts`; v4 capture inventory: `tests/unit/qa4/capture-inventory.test.ts` (reads `docs/design/v4/capture-routes.md` and `scripts/v4-capture-inventory.json`).
- CI sharding contract: `tests/unit/ci/workflow-sharding.test.ts` (reads `ci.yml`). Guardrail logic: `tests/unit/ci/guard-*.test.ts` and `scope.test.ts`.
- PWA release artifacts: `scripts/check-pwa.mjs` (postbuild).

## Repo layout

`src/app` shell and routes · `src/features/*` one folder per screen · `src/ui` shared components · `src/data` data layer (`live/` Supabase, `demo/` fixture) · `src/lib` FSRS, schedule, rendering, offline cache · `src/pdf` PDF parsing · `supabase/` migrations, functions, SQL tests · `scripts/` build, screenshot and stress tooling · `tests/{unit,e2e,mcp}` · `docs/` only the five files that code reads or the owner guide · `legacy/` dead (see above).
