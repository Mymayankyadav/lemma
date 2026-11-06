# NEXT — ranked by the priority run (2026-11-06, rules v2.0 parallel plan). Take the top open item whose Needs are all done.

Order used (priority run 2026-11-06 12:30 IST): work already in a PR, then the v6 first study slice end to end (N20), then blockers that unlock the most items (task command layer N22, task adapters N23/N24), then independent lanes from V6-05 (tasks, Calendar) and V6-06 (learning screens), then MCP and live parity. Earlier order: the v6 first study slice (`docs/v6/`: Today → Focus → saved time → Calendar and Progress), split into lanes that can run at the same time, then notifications. Done and removed: N2–N5, N7–N10, N6.1, N6.2, N11.1–N11.3, N13, N14.1–N14.3, N16–N18, N21 (#818, #820, #821, #823, #840, #822, #850, #851, #872, #860, #882, #853, #887, #881, #888, #893, #903, #897, #905, #909, #910). An id in a Needs line that is no longer in this file is done.
No item may list a protected path (`ci/protected.json`) in Scope. Files under `docs/v6/` are behaviour references cited by items, not instructions. v6 UI work stays behind the `v6Shell` flag: with the flag off, existing screens, tests and visual rules stay exactly as they are.

Parallel lanes (v2.0). Every v6 screen and both study adapters meet at one typed contract that already exists on main: `src/data/study/contract.ts` (`StudyApi`, records shaped like the N10 tables) and `getStudyApi()` in `src/data/study/index.ts`, which returns an empty placeholder until N14.2 (demo) and N16 (live) replace `src/data/study/demo.ts` and `src/data/study/live.ts`. Screens therefore never wait for adapters: they read and write only through `getStudyApi()`, and their unit tests use `setStudyApiForTests(fake)`. Each item owns its own files, so parallel PRs do not touch the same code. Change the contract only additively. End-to-end wiring of the whole slice is N20.

Task lanes (priority run 2026-11-06). Tasks follow the same pattern with their own folder, so they never touch the study files N20 edits: the contract `src/data/tasks/contract.ts` (`TaskApi`, `TaskRecord` shaped like `public.tasks` from N21) and `getTaskApi()` / `setTaskApiForTests()` in `src/data/tasks/index.ts` are on main; `src/data/tasks/demo.ts` and `src/data/tasks/live.ts` are placeholders that read nothing and refuse writes until N23 and N24 replace them. The server command for tasks is Owner decision D7 (`docs/v6/README.md`).

v6 screen lanes (N28–N33). Each screen item owns only its own feature folder: it adds `src/features/<screen>/v6/**` and, in that screen's existing `Page.tsx`, one branch `if (isFlagOn('v6Shell')) return <…V6/>` (or the equivalent for a page that already branches). It reads through the existing hooks in `src/data/**` unchanged (no new queries, no `src/data/**` edits); a field the hooks do not provide is shown as unavailable, never invented. It distinguishes loading, empty, filtered-empty and failed states, keeps 44-pixel targets, uses the N19 tokens under `[data-v6]`, and leaves the flag-off page, its tests and its visual rules exactly as they are. Exact-pixel polish and device audits are the Harden stage, not these items.

## N28.2.2 v6 Settings: Reminders and Export controls
Stage: Build · Status: open · Needs: N28.2.1 · Assigned: —
Done = complete N28 after the seven-section navigation (N28.1) and Study defaults (N28.2.1). Replace the temporary legacy-settings fallback for Reminders and Export with dedicated v6 panels using existing settings hooks and mutation calls. Reminders shows and edits existing notify preferences without inventing fields, follows the legacy auto-save/error/Saved contract and reports empty/loading/failure correctly; Export uses the existing exportAll download with error feedback. Preserve the existing connector setup, sign-out, subjects, appearance, teaching styles, tutor rules, recall retention, new cards/day, math shortcuts and optimizer. All seven destinations are keyboard-accessible, with coverage for valid writes, error feedback and all states; no original flag-off behavior changes.
Tests: tests/unit/settings-v6/reminders-export.test.tsx covering reminder preferences and unchanged server writes, export/download and failure feedback, all seven sections, keyboard controls, loading/empty/failure states and legacy flag-off behavior.
Scope: src/features/settings/v6/**, src/features/settings/Page.tsx (flag branch only), tests/unit/settings-v6/**, CURRENT.md.
Not: new fields, autosave/retention logic changes, src/data/**, new dependencies, other screens, existing tests' expectations.

## N30.2 v6 Review start screen behind shell flag
Stage: Build · Status: open · Needs: N30.1 · Assigned: —
Done = with v6Shell on, /review shows the v6 Review from docs/v6/screens/review-day.png and -night.png and the v6 design handoff, using the N30.1 pure selected-batch helper to keep the all-due total, selected-eligible count and actual quota-limited queue distinct. Include complete-label deck/checkpoint selection, visible checks, a keyboard-accessible start action that initializes exactly the displayed batch with the existing useReviewSession, and long maths wrapping. Distinguish loading, empty, filtered-empty and failed states with 44px controls. Flag off leaves the legacy Review page and its tests unchanged.
Tests: tests/unit/review-v6/** with the flag on and off, loading/empty/failed states, exact queue-to-label count, and keyboard selection/access.
Scope: src/features/review/v6/**, src/features/review/Page.tsx (v6 branch only), tests/unit/review-v6/**, CURRENT.md.
Not: src/features/review-run/**, src/features/review-done/**, FSRS/quota logic, src/data/**, new dependencies or existing tests' expectations.

## N32 v6 Inbox behind the shell flag
Stage: Build · Status: open · Needs: N19 · Assigned: —
Done = with `v6Shell` on, `/proposals` renders the v6 Inbox from `docs/v6/screens/inbox-day.png` and `-night.png`, `docs/v6/DESIGN_HANDOFF.md` "Shared design contracts" and the Inbox row of `docs/v6/Lemma_UI_v6_Direction_Plan.md` §9, following the "v6 screen lanes" rules above. Proposals grouped as today, with selection-aware approve/reject using the existing atomic decision calls and their receipts; rationale and citations shown where the proposal has them and "Rationale unavailable" where it does not; the existing plan/change/ideas previews are reused.
Tests: `tests/unit/proposals-v6/**` with the flag on and off (flag off renders the existing page unchanged), loading/empty/failed states, and keyboard access to every action.
Scope: src/features/proposals/v6/** (new), src/features/proposals/Page.tsx (the existing v6 branch only), tests/unit/proposals-v6/**, CURRENT.md.
Not: `src/features/plan-proposal/**`, proposal drafts (a later item), decision logic, `src/data/**`, new dependencies, other screens' folders, existing tests' expectations.

## N33.2 v6 Project detail behind the shell flag
Stage: Build · Status: open · Needs: N33.1 · Assigned: —
Done = with v6Shell on, /p/:slug renders the v6 project detail guided by docs/v6/screens/paths-day.png and paths-night.png, docs/v6/DESIGN_HANDOFF.md Shared design contracts, and the Paths project-page row of docs/v6/Lemma_UI_v6_Direction_Plan.md §9. Follow v6 screen lane rules: existing useProject hooks only, stage rail with real checkpoint statuses, checkpoint navigation and project-scoped session/source counts from ProjectDetail; insufficient schedule evidence is Forecast unavailable. Distinguish loading, no checkpoints and failed states, preserve flag-off UI and 44px keyboard targets.
Tests: tests/unit/paths-v6/project.test.tsx with flag on/off, real statuses, scoped counts, loading, empty, failure and keyboard navigation.
Scope: src/features/project/v6/** (new), src/features/project/Page.tsx (flag branch only), tests/unit/paths-v6/project.test.tsx, CURRENT.md.
Not: src/features/projects/** (N33.1), src/data/**, checkpoint/session detail pages, stage/plan logic, new dependencies, other screens or original tests.

## N35 v6 first slice on live data
Stage: Build · Status: open · Needs: N20, N12 · Assigned: —
Done = the N20 journey (start focus → pause → resume → finish → save, Today/Calendar/Progress agree, reload mid-focus resumes, discard adds nothing) passes against the live adapters, and an entry saved through the MCP `study` tool appears in Today, Calendar and Progress after refresh (D4), and the reverse. Fix the wiring bugs this exposes in the study live adapter and the v6 screens.
Tests: a PGlite-backed integration test in `tests/unit/study/live-slice.test.ts` driving `createLiveStudyApi` against the real migrations (or the existing SQL test harness if that fits better), plus the observation check through `mcp_study_command`.
Scope: src/data/study/live.ts, src/features/home/** (v6 branch), src/features/focus/**, src/features/calendar/Page.tsx, src/features/progress-v6/**, tests/unit/study/live-slice.test.ts, tests/mcp/sql/study-live-slice.mjs, CURRENT.md.
Not: migrations, MCP function code, the demo adapter, new screens.

(Next priority run: Harden pass for the v6 first slice and the new lanes, planner previews and capacity (V6-05) on N22–N27, parked thoughts and day plans (new tables, Owner decision first), study entry correction in Calendar, checkpoint/session/source v6 pages, proposal drafts. Next free ID: N36.)
