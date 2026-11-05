# CURRENT — what exists in Lemma (written from the code on 2026-11-03; stages, Android, flags, Known breakages and CI notes refreshed by the priority run on 2026-11-05)

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

Stage: Stable = works and has tests on main. Harden = exists but is reported broken, or untested. Harden reasons are under "Known breakages". Build = planned or new, behind a flag that its first item adds to `src/flags.ts` (default off). Flag column is "—" for features on main because none uses a flag yet. Stages last reviewed by the priority run on 2026-11-05: Today, Checkpoint page and Cards promoted Harden → Stable (their bug-hunting items N2, N4 merged with blocking tests; calibration shows their timing checks at 100% pass); Android shell and store kit promoted Build → Harden (N7, N8 merged behind `androidShell`); Review stays Harden (awaiting priority-run promotion after the live SQL filter-before-quota fix, Known breakages 2); no demotions (no feature PR was reverted since 2026-11-04).

| Feature | Source folders | Main tests | Stage | Flag |
|---|---|---|---|---|
| Today (home, Continue, goal cards, review outlook) | `src/features/home` | `tests/unit/home`, `tests/e2e/home.spec.ts`, `look-5b-today-duplicates.spec.ts` | Stable | — |
| Projects list and New project | `src/features/projects`, `src/features/new-project` | `tests/unit/projects`, `tests/e2e/projects.spec.ts`, `fix-659-new-project.spec.ts` | Stable | — |
| Project page (stages, plan route, sources) | `src/features/project`, `src/ui/timeline` | `tests/unit/project`, `tests/unit/timeline`, `tests/e2e/project.spec.ts` | Stable | — |
| Checkpoint page | `src/features/checkpoint` | `tests/unit/checkpoint/page-states.test.tsx`, `tests/e2e/look-1f-checkpoint.spec.ts`, `fix-659i-checkpoint-defer.spec.ts` | Stable | — |
| Tutor sessions | `src/features/session` | `tests/unit/session`, `tests/e2e/session.spec.ts` | Stable | — |
| Proposals (card approvals) | `src/features/proposals` | `tests/unit/proposals`, `tests/e2e/proposals.spec.ts` | Stable | — |
| Plan proposal review (plan map, change map, ideas) | `src/features/plan-proposal` | `tests/unit/plan-proposal`, `tests/e2e/st2-plan-review.spec.ts` | Harden | — |
| Review (queue, run, done) | `src/features/review`, `review-run`, `review-done` | `tests/unit/review`, `review-*.test.ts`, `tests/e2e/review.spec.ts` | Harden | — |
| Cards browser and card detail | `src/features/cards`, `src/features/card` | `tests/unit/cards` (including `page-states.test.tsx`), `tests/e2e/cards.spec.ts`, `fix-648-cards-filters.spec.ts` | Stable | — |
| Atlas (concept graph) | `src/features/atlas` | `tests/unit/atlas` (23 files), `tests/e2e/atlas.spec.ts`, `look-4*-atlas.spec.ts` | Harden | — |
| Insights (charts) | `src/features/insights`, `src/ui/charts` | `tests/unit/features/insights-math.test.tsx`, `tests/unit/charts`, `tests/e2e/insights.spec.ts` | Stable | — |
| Settings | `src/features/settings` | `tests/unit/settings`, `tests/e2e/settings.spec.ts` | Stable | — |
| Sign-in, auth gate, demo mode | `src/features/sign-in`, `src/app/AuthGate.tsx`, `src/data/mode.ts`, `src/data/demo` | `tests/unit/app/auth-gate.test.tsx`, `tests/unit/demo`, `tests/e2e/routes.spec.ts` | Stable | — |
| UI kit (`/kit`) | `src/features/kit`, `src/ui` | `tests/unit/ui`, `tests/e2e/kit.spec.ts` | Stable | — |
| FSRS scheduling and optimizer | `src/lib/fsrs`, `src/lib/schedule.ts`, `src/lib/optimizer.worker.ts` | `tests/unit/lib/fsrs.test.ts`, `optimizer.test.ts`, `tests/unit/schedule` | Stable | — |
| PDF sources: upload, text extraction, storage | `src/pdf`, `src/lib/queue.ts` | `tests/unit/pdf`, `tests/unit/data/archive.test.ts`, `tests/e2e/source-*.spec.ts` | Stable | — |
| PWA shell, install, offline cache | `vite.config.ts`, `src/app/PwaStatus.tsx`, `src/lib/offline-cache.ts`, `scripts/check-pwa.mjs` | `tests/unit/app/pwa-status.test.tsx`, `tests/unit/lib/offline-cache.test.ts`, `tests/e2e/and1-install.spec.ts` | Harden | — |
| MCP connector (23 tools) | `supabase/functions/mcp` | `tests/unit/mcp`, `tests/unit/mcp4`, `tests/mcp/*.mjs`, CI `mcp-sql` | Harden | — |
| Notifications server side (reminders, `notify` function, subscribe flow) | `supabase/functions/notify`, `src/data/notify.ts` | `tests/unit/notify` (15 files), `tests/mcp/notif1*.mjs` | Harden | — |
| Notifications in the app (service-worker push handling, reminder deep links) | `src/lib/lemma-push-worker.js`, `src/lib/lemma-push-query.js`, `src/lib/push-*`, `vite.config.ts` | `tests/unit/notify/push-worker.test.ts`, `push-handlers.test.ts`, `push-notice.test.ts` | Build | `notificationsPush` (default off) |
| Android Trusted Web Activity shell (N7, #823) and store kit (N8, #840); unsigned debug build workflow `.github/workflows/android.yml` | `android/`, `docs/android`, `public/privacy.html`, `scripts/play-shots.mjs`, `scripts/play-png.mjs` | `tests/unit/android/twa-shell.test.ts`, `tests/unit/android/play-png.test.ts` | Harden | `androidShell` (default off) |
| v6 shell: five destinations (adds Calendar, Insights shown as Progress), shared header, focus accessory — planned N13 | planned: `src/app`, `src/ui`, `src/features/calendar` | none yet | Build | `v6Shell` (added by N13, default off) |
| v6 study model: effort metrics (N9), study tables (N10), study commands (N11), MCP `study` tool (N12), Focus on demo data (N14) — planned | planned: `src/lib/effort`, `src/lib/focus`, `src/features/focus`, `supabase/migrations` | none yet | Build | `v6Shell` |
| Deploy pipeline (Supabase workflow, MCP smoke) | `.github/workflows/supabase.yml`, `mcp-smoke.yml`, `scripts/mcp-selftest-queue*.mjs` | `tests/unit/agents/mcp-selftest-*.test.ts`, `tests/mcp/smoke.mjs` | Harden | — |
| Stress and screenshot harness (ST-0 budgets, QA captures) | `scripts/stress-*.ts`, `scripts/qa3-*.ts`, `scripts/qa4-screens.ts`, `scripts/review-shots.mjs` | `tests/unit/stress`, `tests/unit/qa4`, `tests/e2e/stress*.spec.ts` | Stable | — |

Routes (`src/app/routes.tsx`): `/`, `/projects`, `/projects/new`, `/p/:slug`, `/p/:slug/cp/:code`, `/s/:slug/:n`, `/proposals`, `/proposals/:id`, `/review`, `/review/run`, `/review/done`, `/cards`, `/cards/:no`, `/atlas`, `/insights`, `/settings`, `/sign-in`, `/kit`.

Not on main (existed only in archived, unmerged PRs): read-only offline snapshot (AND-8). The Android shell and store kit were ported by N7 and N8.

v6 direction (Owner, 2026-11-05): the reference set is in `docs/v6/` (mockup, screenshots, direction plan, data/MCP contract). It describes the target, not what exists; NEXT.md items N9–N14 implement the first durable study slice behind `v6Shell`.

N10 in-progress PR #851 adds four owner-scoped v6 study tables (study_entries, study_intervals, calendar_blocks, command_receipts), additive only; not yet on main or deployed. The study UI and commands are not wired yet.

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
| `pr-gate.yml` / `fast-gate` | Aggregates: `typecheck-lint` (`tsc -b` + `scripts/ci/lint.mjs`), `unit-affected` (`scripts/ci/affected.mjs` + `ci/test-map.json`; shared code runs all), `smoke-e2e` (6 specs in `ci/test-map.json` `smoke`), `e2e-affected` (4 shards), `sql` (only when `supabase/**` or SQL tests changed). On failure `report` records signatures and opens `incident: <signature>` issues, and `feedback` writes the failing jobs/steps/test signatures and how to fix them into one PR comment (edited in place) and the `fast-gate` check summary |
| `scope.yml` / `scope` | AGENTS.md mechanics (`scripts/ci/scope.mjs`, runs from the base branch): title, item/issue ids, body line 1 (`Agent: <name> · Item: <id>`; the old `· Lease until …` form is accepted and ignored), valid Agent names (`lemma-<n>`, `chat-<n>#<tag>`, `owner-setup*`, `priority`, `ci`) and the chat session lock (a different tag on the same `chat-<n>` within 3 h fails), one open PR per Item, `N<id> split` PRs must also change code or CURRENT.md plus a test (sub-item .1), 1 PR per agent and at most 6 open, protected paths (`ci/protected.json`), test deletion/skips, NEXT.md edits, `revert`/`ci: perf calibration` rules. An `expect(` count drop is a warning only. On failure the exact rule and how to comply go into one PR comment (edited in place) and the `scope` check summary |
| `ci.yml` / `check`, `e2e-N-of-4`, `mcp-sql`, `qa3-screens` | The full suite, **on push to main only**. `LEMMA_PERF=off` skips the timing-based checks. `qa3-screens` is skipped unless the repo variable `LEMMA_QA3_IN_CI` is `true` (pinned by `tests/unit/ci/workflow-sharding.test.ts`) |
| `ci.yml` / `revert`, `main-green` | Red main: one `revert #<pr>` PR (`Agent: ci`, label S0) + one S0 incident. The revert PR is opened and merged with the `CI_BOT_TOKEN` secret, so it gets its REAL `fast-gate` and `scope` checks and the ruleset accepts a normal squash merge (no bypass). The merge runs the full suite on main by itself; a green run closes the incident. If the ruleset still refuses, CI stops at once with a "blocked by ruleset" comment on the PR and the incident. Commits touching only `ci/perf-calibration.md` are never reverted |
| `perf-report.yml` | **Non-blocking.** The checks in `ci/perf-checks.json` (4×-CPU renders, ST-0 budgets, `notif1b-stress.mjs` 150 ms, `stress-home-perf` unit) and `qa3-screens`; posts a summary |
| `calibrate.yml` | Manual + nightly: runs each perf check N=10 times on main, writes `ci/perf-calibration.md` through a `ci: perf calibration` PR (only this job writes that file; scope accepts it only from `Agent: ci` with only that file changed). The PR is opened and merged with `CI_BOT_TOKEN` after its real checks pass. Pass rate under 95% = quarantined |
| `review-merge.yml` | **CI merges, agents do not.** On a comment `Approve · Agent: <name>`, `Changes requested · Agent: <name>: <what>` (adds `changes-requested`) or `Ready · Agent: <author>`, and again when PR gate / scope finish. `Ready` (newer than the last push, `fast-gate` and `scope` green, no `changes-requested`) adds `needs-review`; a push removes it. Squash-merges with `CI_BOT_TOKEN` when an approving Agent (valid name, not a locked chat session, different from the PR's `Agent:`) has the latest verdict on the head, `fast-gate` and `scope` are green on the head, the approval is newer than the head commit (a push voids it), no `changes-requested` stands and no S0 freeze applies (except the incident's own fix PR). Per agent only the latest verdict counts; verdicts from invalid names are ignored and CI posts one comment with the valid formats. Only `N<id>`, `bug #n` and `incident #n` PRs; `rules:` PRs are merged by the Owner. Reads the PR through the API from the default branch and never runs PR code. Limit: all agents share one GitHub account, so "different Agent" is a name check, not an identity proof |
| `sweep.yml` | Every 30 min: `escalate` label, S1→S0 after 2 h with no fix PR, `lease-expired` label (no commit and no comment from the PR's Agent for 3 h), keeps `needs-review` consistent with `Ready` (adds it only for a valid Ready with green checks, removes it otherwise), creates the closed `run-log: lemma-<n>` issues, and writes the per-agent run-plan table (plans, steps done, `plan-short`, `no-result`, reviews, commits, last 24 h) into the closed issue `agent-metrics`. State issues carry the label `ci-registry` (signature registry, `ci-registry: chat sessions`, `agent-metrics`, run-logs) and are matched by title |
| `labels.yml` | Creates the labels in `ci/labels.json`; removes `changes-requested` and `needs-review` when the author pushes |
| `review-shots.yml` / `shots` | PR-only (screenshot script paths): captures v4 route screenshots |
| `review-shots-publish.yml` | On push to `review/**`: commits contact sheets to that branch |
| `pages.yml` | Builds and deploys the app to GitHub Pages on every push to main |
| `supabase.yml` / `deploy` | On push to main touching `supabase/**` or this workflow: `supabase db push`, deploy `mcp`, verify, MCP smoke. Working again since 2026-11-04 (Known breakages 1); a failure opens an S0 incident through `deploy-incident.yml` |
| `mcp-smoke.yml` / `smoke` | After a successful Supabase workflow: `node tests/mcp/smoke.mjs` against `MCP_URL`. Posts FIFO ticket comments on issue #668 via REST (the issue was closed in the reset; closing is fine, locking would break the queue) |
| `deploy-incident.yml` / `sync` | After every finished `Supabase` run on main (and manually): a failed run opens or updates ONE S0 incident (`<!-- deploy-incident -->`, title `incident: deploy/supabase:: <failed step> failed`); the newest finished run decides, so an older run's late event is ignored. A run that deployed and passed `Verify deployed MCP endpoint` closes it; a "successful" run whose deploy steps were skipped (no credentials) closes nothing. `scripts/ci/deploy-incident.mjs`; test `tests/unit/ci/guard-deploy-incident.test.ts`. Manual run: Actions → Deploy incident → `run_id` empty = newest finished run, `dry_run` true (default) only prints the writes. `main-green` never closes it (different marker) |
| `keepalive.yml` | Daily cron: calls the `ping` RPC so the Supabase project does not pause |
| `setup-check.yml` | Manual: reports whether the four deploy secrets exist (values never printed) |

Failure signatures: `scripts/ci/signatures.mjs` reads JUnit (vitest, Playwright, SQL scripts via `scripts/ci/sql-reporter.cjs`) and makes `<kind>/<test file>::<test> :: <normalized first error line>`. State lives in one closed issue labelled `ci-registry` (CI edits its body; agents ignore it). Branch protection is outside the repo (**unverified**); the intended setting is: `main` requires the status checks `fast-gate` and `scope` only, no required reviews. Verified on 2026-11-04: checks attached by `workflow_dispatch` do NOT satisfy the ruleset (only checks from the PR's own `pull_request` / `pull_request_target` events do), so CI-opened PRs must be opened with `CI_BOT_TOKEN`. That secret (fine-grained, this repo only: contents, pull requests, workflows) is used only in `ci.yml` `revert` and `calibrate.yml` `publish`, never in a pull_request-triggered job (`scripts/ci/lint.mjs` enforces it).

## Known breakages

1. **Deploy works again (N1 fixed 2026-11-04).** N1 (#803) renamed `20261102052000_notify_candidates_ranked_reuse.sql` to `20261102105000_…` (SQL unchanged). After the Owner refreshed the Supabase access token (it needs the Connection Pooling Read permission), `Supabase` run 41877187929 on main applied `20261102105000_notify_candidates_ranked_reuse` and `20261102113500_notify_candidates_sort_memory`, deployed the MCP function and passed the deployed-MCP verification (4 selftest parts plus the endpoint checks); the remote migration history now includes both. S0 incident #807 (deploy failures on the way: invalid token, missing token permission, then `Apply migrations` IPv6) is closed by CI when the run is marked complete. If `Apply migrations` fails with an IPv6 error again, the token lacks the pooler permission: `supabase link` then cannot store the IPv4 pooler URL.
2. **Review: live SQL filters before daily quota (fixed by bug #843).** `20261105153000_fix_review_items_prequota.sql` compatibly replaces `public.review_items` with candidate-level deck, checkpoint, session, concept, new-only and include-new filters before sibling deduplication, ranking and daily quotas. The existing signature, owner filtering, saved daily limits and result shape are retained. `tests/mcp/st5.mjs` now has a failing-before/fixed-after SQL regression for filtered decks and owner isolation. N3 (#820) previously fixed and tested only the demo adapter and review-run store. Still reported by archived issues and not re-verified: Atlas C2 4×-CPU cold-route first attempt over 1,000 ms (#647); Checkpoint CP4 and Plan-proposal cold 4×-CPU renders over budget (#655, #656); mcp-sql NOTIF-1b candidate query over 150 ms (#679; quarantined in `ci/perf-calibration.md`, 70% pass rate); first-visit PWA client not controlled for offline lazy routes (#751). Resolved by merged items: Today goal cards over 14 checkpoints and Continue metadata viewport (N2, #818); Review filter-before-quota in demo/store (N3, #820); Cards and Checkpoint page states (N4, #821).
3. **N5 notifications Web Push:** `notificationsPush` defaults off. When enabled, a Workbox companion worker parses bounded server v1 payloads, shows notifications, and opens or focuses safe destinations on click. Production builds with the flag off emit no worker companion. Override-capable builds can opt in with `VITE_FLAGS=notificationsPush` or a URL-only `?flags=notificationsPush`, which selects a distinct service-worker script URL; without the URL flag, the worker registers no push or notificationclick listeners.
4. Feature flags: `src/flags.ts` is typed and all defaults are off; `?flags=a,b` and `VITE_FLAGS` overrides apply only in dev, tests and e2e builds, not production. Defined flags: `ciSelfTest` (placeholder), `androidShell` (N7) and `notificationsPush` (N5). Planned: `v6Shell` (N13). Test: `tests/unit/flags.test.ts`.
5. `legacy/` (old vanilla-JS app and three scripts) is not imported by `src`, `tests` or `scripts` (grep); it is dead code, left alone (**unverified** whether anything outside the repo uses it).
6. Code comments in a few files still cite deleted specs (`data.md §5.4` in `src/data/types.ts`, `v4-look.md §2a` in `src/lib/schedule.ts` and `scripts/make-themes.ts`, `stress.md` in `scripts/qa3-report.ts` and `tests/e2e/look-4b-row-fade.spec.ts`, `design.md §6` in `src/app/routes.tsx`, `notifications.md §4a` in `supabase/functions/notify/test-handler.ts`). The tests are the authority now. `supabase/**` was not edited in the reset so as not to trigger a deploy.
7. `docs/spec/data.md` and `docs/spec/connector.md` were kept only because `scripts/make-demo-data.ts` reads the default KaTeX macros and teaching-style presets from them. Treat them as data inputs, not specs.
8. `supabase/tests/*.sql` are referenced only by `tests/unit/db4/schema.test.ts`; they are not run against a database in CI (**unverified** otherwise).
9. **CI limits found on 2026-11-05.** (a) `sweep.yml` is scheduled every 30 min, but GitHub ran it only 4 times on schedule in the 24 hours to 2026-11-05 11:40 UTC (last at 05:29), so `lease-expired`, `escalate`, S1→S0 timers and `agent-metrics` lag by hours. (b) GitHub does not run `pull_request` workflows on a PR that conflicts with main, so `fast-gate` is simply absent there (seen on #822); resolve the conflict on the branch. (c) The PR gate `sql` job runs a fixed list of scripts (`db2 st5 db5 notif1a notif1a-concurrency notif1b notif1b-candidates notif1b-concurrency`, plus `transactions`); a new `tests/mcp/*.mjs` file does not run until that list or a folder rule changes (Owner CI change).

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

`src/app` shell and routes · `src/features/*` one folder per screen · `src/ui` shared components · `src/data` data layer (`live/` Supabase, `demo/` fixture) · `src/lib` FSRS, schedule, rendering, offline cache · `src/pdf` PDF parsing · `supabase/` migrations, functions, SQL tests · `scripts/` build, screenshot and stress tooling · `tests/{unit,e2e,mcp}` · `docs/` the files that code reads, the owner guide, and `docs/v6/` (v6 reference set, not instructions) · `legacy/` dead (see above).
