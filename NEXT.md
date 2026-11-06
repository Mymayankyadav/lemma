# NEXT — ranked by the priority run (2026-11-06, rules v2.0 parallel plan). Take the top open item whose Needs are all done.

Order used (priority run 2026-11-06 12:30 IST): work already in a PR, then the v6 first study slice end to end (N20), then blockers that unlock the most items (task command layer N22, task adapters N23/N24), then independent lanes from V6-05 (tasks, Calendar) and V6-06 (learning screens), then MCP and live parity. Earlier order: the v6 first study slice (`docs/v6/`: Today → Focus → saved time → Calendar and Progress), split into lanes that can run at the same time, then notifications. Done and removed: N2–N5, N7–N10, N6.1, N6.2, N11.1–N11.3, N13, N14.1–N14.3, N16–N18, N21 (#818, #820, #821, #823, #840, #822, #850, #851, #872, #860, #882, #853, #887, #881, #888, #893, #903, #897, #905, #909, #910). An id in a Needs line that is no longer in this file is done.
No item may list a protected path (`ci/protected.json`) in Scope. Files under `docs/v6/` are behaviour references cited by items, not instructions. v6 UI work stays behind the `v6Shell` flag: with the flag off, existing screens, tests and visual rules stay exactly as they are.

Parallel lanes (v2.0). Every v6 screen and both study adapters meet at one typed contract that already exists on main: `src/data/study/contract.ts` (`StudyApi`, records shaped like the N10 tables) and `getStudyApi()` in `src/data/study/index.ts`, which returns an empty placeholder until N14.2 (demo) and N16 (live) replace `src/data/study/demo.ts` and `src/data/study/live.ts`. Screens therefore never wait for adapters: they read and write only through `getStudyApi()`, and their unit tests use `setStudyApiForTests(fake)`. Each item owns its own files, so parallel PRs do not touch the same code. Change the contract only additively. End-to-end wiring of the whole slice is N20.

Task lanes (priority run 2026-11-06). Tasks follow the same pattern with their own folder, so they never touch the study files N20 edits: the contract `src/data/tasks/contract.ts` (`TaskApi`, `TaskRecord` shaped like `public.tasks` from N21) and `getTaskApi()` / `setTaskApiForTests()` in `src/data/tasks/index.ts` are on main; `src/data/tasks/demo.ts` and `src/data/tasks/live.ts` are placeholders that read nothing and refuse writes until N23 and N24 replace them. The server command for tasks is Owner decision D7 (`docs/v6/README.md`).

v6 screen lanes (N28–N33). Each screen item owns only its own feature folder: it adds `src/features/<screen>/v6/**` and, in that screen's existing `Page.tsx`, one branch `if (isFlagOn('v6Shell')) return <…V6/>` (or the equivalent for a page that already branches). It reads through the existing hooks in `src/data/**` unchanged (no new queries, no `src/data/**` edits); a field the hooks do not provide is shown as unavailable, never invented. It distinguishes loading, empty, filtered-empty and failed states, keeps 44-pixel targets, uses the N19 tokens under `[data-v6]`, and leaves the flag-off page, its tests and its visual rules exactly as they are. Exact-pixel polish and device audits are the Harden stage, not these items.

## N28.2 v6 Settings: study defaults, reminders and export controls
Stage: Build · Status: open · Needs: N28.1 · Assigned: —
Done = finish N28 after N28.1's flag-gated seven-section navigation and the working Account/Appearance/Subjects/Connector panels: replace the temporary legacy-settings fallback for Study defaults, Reminders and Export with dedicated v6 panels. Preserve all existing Settings behaviour and the same underlying hooks, update calls and error/Saved feedback, including teaching styles and tutor rules, retention, cards/day, memory tuning eligibility, notification settings, math shortcuts, export/download, connector setup and sign-out. Ensure each section loads only from existing hooks, distinguishes loading, empty and failure states, is keyboard accessible, and no control silently loses its save action. Keep the legacy flag-off page unchanged.
Tests: tests/unit/settings-v6/** covering flag on/off, all seven reachable sections, valid writes/errors, loading/empty/failed states, keyboard access and unchanged legacy save paths.
Scope: src/features/settings/v6/**, src/features/settings/Page.tsx (flag branch only), tests/unit/settings-v6/**, CURRENT.md.
Not: new settings fields, autosave or retention logic changes, src/data/**, new dependencies, other screens' folders, existing tests' expectations.

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

## N33 v6 Paths and project behind the shell flag
Stage: Build · Status: open · Needs: N19 · Assigned: —
Done = with `v6Shell` on, `/projects` and `/p/:slug` renders the v6 Paths list and project page from `docs/v6/screens/paths-day.png` and `-night.png`, `docs/v6/DESIGN_HANDOFF.md` "Shared design contracts" and the Paths list and project page row of `docs/v6/Lemma_UI_v6_Direction_Plan.md` §9, following the "v6 screen lanes" rules above. Paths shows subjects and projects with pinned/archived states and one creation entry point; the project page shows the stage rail with checkpoint statuses and scoped session/source counts from the existing project data; a forecast without enough evidence is shown as unavailable.
Tests: `tests/unit/paths-v6/**` with the flag on and off (flag off renders the existing page unchanged), loading/empty/failed states, and keyboard access to every action.
Scope: src/features/projects/v6/** (new), src/features/project/v6/** (new), src/features/projects/Page.tsx and src/features/project/Page.tsx (the flag branches only), tests/unit/paths-v6/**, CURRENT.md.
Not: checkpoint and session pages, new-project flow, stage or plan logic, `src/data/**`, new dependencies, other screens' folders, existing tests' expectations.

## N35 v6 first slice on live data
Stage: Build · Status: open · Needs: N20, N12 · Assigned: —
Done = the N20 journey (start focus → pause → resume → finish → save, Today/Calendar/Progress agree, reload mid-focus resumes, discard adds nothing) passes against the live adapters, and an entry saved through the MCP `study` tool appears in Today, Calendar and Progress after refresh (D4), and the reverse. Fix the wiring bugs this exposes in the study live adapter and the v6 screens.
Tests: a PGlite-backed integration test in `tests/unit/study/live-slice.test.ts` driving `createLiveStudyApi` against the real migrations (or the existing SQL test harness if that fits better), plus the observation check through `mcp_study_command`.
Scope: src/data/study/live.ts, src/features/home/** (v6 branch), src/features/focus/**, src/features/calendar/Page.tsx, src/features/progress-v6/**, tests/unit/study/live-slice.test.ts, tests/mcp/sql/study-live-slice.mjs, CURRENT.md.
Not: migrations, MCP function code, the demo adapter, new screens.

(Next priority run: Harden pass for the v6 first slice and the new lanes, planner previews and capacity (V6-05) on N22–N27, parked thoughts and day plans (new tables, Owner decision first), study entry correction in Calendar, checkpoint/session/source v6 pages, proposal drafts. Next free ID: N36.)
