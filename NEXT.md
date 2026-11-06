# NEXT — ranked by the priority run (2026-11-06, rules v2.0 parallel plan). Take the top open item whose Needs are all done.

Order used (priority run 2026-11-06 12:30 IST): work already in a PR, then the v6 first study slice end to end (N20), then blockers that unlock the most items (task command layer N22, task adapters N23/N24), then independent lanes from V6-05 (tasks, Calendar) and V6-06 (learning screens), then MCP and live parity. Earlier order: the v6 first study slice (`docs/v6/`: Today → Focus → saved time → Calendar and Progress), split into lanes that can run at the same time, then notifications. Done and removed: N2–N5, N7–N10, N6.1, N6.2, N11.1–N11.3, N13, N14.1–N14.3, N16–N18, N21 (#818, #820, #821, #823, #840, #822, #850, #851, #872, #860, #882, #853, #887, #881, #888, #893, #903, #897, #905, #909, #910). An id in a Needs line that is no longer in this file is done.
No item may list a protected path (`ci/protected.json`) in Scope. Files under `docs/v6/` are behaviour references cited by items, not instructions. v6 UI work stays behind the `v6Shell` flag: with the flag off, existing screens, tests and visual rules stay exactly as they are.

Parallel lanes (v2.0). Every v6 screen and both study adapters meet at one typed contract that already exists on main: `src/data/study/contract.ts` (`StudyApi`, records shaped like the N10 tables) and `getStudyApi()` in `src/data/study/index.ts`, which returns an empty placeholder until N14.2 (demo) and N16 (live) replace `src/data/study/demo.ts` and `src/data/study/live.ts`. Screens therefore never wait for adapters: they read and write only through `getStudyApi()`, and their unit tests use `setStudyApiForTests(fake)`. Each item owns its own files, so parallel PRs do not touch the same code. Change the contract only additively. End-to-end wiring of the whole slice is N20.

Task lanes (priority run 2026-11-06). Tasks follow the same pattern with their own folder, so they never touch the study files N20 edits: the contract `src/data/tasks/contract.ts` (`TaskApi`, `TaskRecord` shaped like `public.tasks` from N21) and `getTaskApi()` / `setTaskApiForTests()` in `src/data/tasks/index.ts` are on main; `src/data/tasks/demo.ts` and `src/data/tasks/live.ts` are placeholders that read nothing and refuse writes until N23 and N24 replace them. The server command for tasks is Owner decision D7 (`docs/v6/README.md`).

v6 screen lanes (N28–N33). Each screen item owns only its own feature folder: it adds `src/features/<screen>/v6/**` and, in that screen's existing `Page.tsx`, one branch `if (isFlagOn('v6Shell')) return <…V6/>` (or the equivalent for a page that already branches). It reads through the existing hooks in `src/data/**` unchanged (no new queries, no `src/data/**` edits); a field the hooks do not provide is shown as unavailable, never invented. It distinguishes loading, empty, filtered-empty and failed states, keeps 44-pixel targets, uses the N19 tokens under `[data-v6]`, and leaves the flag-off page, its tests and its visual rules exactly as they are. Exact-pixel polish and device audits are the Harden stage, not these items.

## N23 Tasks: demo adapter with reload persistence
Stage: Build · Status: open · Needs: — · Assigned: —
Done = `src/data/tasks/demo.ts` implements `TaskApi` from `src/data/tasks/contract.ts` for demo mode: a small fixed fixture (about 6 tasks across statuses, linked to demo subjects/projects where the demo data has them), bounded pages with an opaque cursor and a separate `total`, ordering by status, position, createdAt, optimistic versions (stale `expectedVersion` rejects with a conflict and changes nothing), `completedAt` set exactly while completed, due date versus due instant kept distinct, receipts with `actionNo: null`, and persistence across reload in the same storage the demo study adapter uses (its own key). Live mode never reads the demo store.
Tests: `tests/unit/tasks/demo.test.ts` covering each sentence above, including a reload round trip and a 50-task page walk.
Scope: src/data/tasks/demo.ts, tests/unit/tasks/demo.test.ts, CURRENT.md.
Not: `src/data/tasks/contract.ts` (additive changes only, with a note in the PR body), `src/data/study/**`, UI, supabase/**.

## N24 Tasks: live adapter over task_command
Stage: Build · Status: open · Needs: — · Assigned: —
Done = `src/data/tasks/live.ts` implements `TaskApi` for live mode: reads `public.tasks` as the signed-in owner with bounded keyset pages (limit 1–50, default 20), an opaque cursor and an exact `total`; writes only through `rpc('task_command', envelope)` with a fresh `operationId` per user action (reused on retry), mapping receipts to `StudyReceipt` and conflicts to a typed error; due fields mapped to and from `due_kind`/`due_date`/`due_at` without converting one into the other. The envelope is the one D7 specifies, so this item runs in parallel with N22; integration against the real function is N22's SQL test plus N35.
Tests: `tests/unit/tasks/live.test.ts` with a mocked Supabase client: page bounds and cursor, envelope shape per operation, retry reuses the `operationId`, conflict mapping, due mapping round trip, no owner field ever sent.
Scope: src/data/tasks/live.ts, tests/unit/tasks/live.test.ts, CURRENT.md.
Not: migrations, `src/data/study/**`, UI.

## N25.2 Tasks: paginated backlog and Task-sheet handoff
Stage: Build · Status: open · Needs: N25.1 · Assigned: —
Done = the task sheet from N25.1 adds an explicit "View in backlog" action after save, without replacing its single Undo toast. With `v6Shell` on, a new lazy `/tasks` route beside Calendar lists tasks in bounded pages of 20 with "Show more", grouped by status (backlog, in progress, completed, cancelled). Each row can complete/reopen, edit title/estimate/priority/due/links in the existing native sheet, and move up/down within its status using `TaskApi.updateTask(id,version,patch)`; a conflict reloads the record and says it changed elsewhere. Flag off: `/tasks` redirects to `/`, and the existing header and screens remain unchanged. The existing task sheet continues to restore focus and validate inputs.
Tests: `tests/unit/tasks-ui/backlog.test.tsx` using `setTaskApiForTests` (20-row paging and grouped statuses, versioned complete/reopen, edits and ordering, stale conflict, explicit View in backlog, flag-off /tasks redirect).
Scope: src/features/tasks/**, src/app/V6Header.tsx (only Task sheet handoff), src/app/tasksRoute.tsx (new), src/app/App.tsx (adding the route only), tests/unit/tasks-ui/**, CURRENT.md.
Not: `src/data/tasks/**`, other app routes or screens, Supabase, new dependencies, touching flag-off UI.

## N28 v6 Settings behind the shell flag
Stage: Build · Status: open · Needs: N19 · Assigned: —
Done = with `v6Shell` on, `/settings` renders the v6 Settings from `docs/v6/screens/settings-day.png` and `-night.png`, `docs/v6/DESIGN_HANDOFF.md` "Shared design contracts" and the Settings row of `docs/v6/Lemma_UI_v6_Direction_Plan.md` §9, following the "v6 screen lanes" rules above. Section navigation (account, appearance, study defaults, reminders, subjects, connector, export) over the existing settings controls, which keep their current save behaviour; the connector address and subjects panels are reused, not rewritten.
Tests: `tests/unit/settings-v6/**` with the flag on and off (flag off renders the existing page unchanged), loading/empty/failed states, and keyboard access to every action.
Scope: src/features/settings/v6/** (new), src/features/settings/Page.tsx (the flag branch only), tests/unit/settings-v6/**, CURRENT.md.
Not: new settings fields, changes to autosave or retention logic, `src/data/**`, new dependencies, other screens' folders, existing tests' expectations.

## N30 v6 Review start behind the shell flag
Stage: Build · Status: open · Needs: N19 · Assigned: —
Done = with `v6Shell` on, `/review` renders the v6 Review from `docs/v6/screens/review-day.png` and `-night.png`, `docs/v6/DESIGN_HANDOFF.md` "Shared design contracts" and the Review row of `docs/v6/Lemma_UI_v6_Direction_Plan.md` §9, following the "v6 screen lanes" rules above. Deck selection and the start panel: all-due and selected-batch counts are separate named numbers, the selection count equals the cards a round will contain, and starting uses the existing round start; long mathematics wraps.
Tests: `tests/unit/review-v6/**` with the flag on and off (flag off renders the existing page unchanged), loading/empty/failed states, and keyboard access to every action.
Scope: src/features/review/v6/** (new), src/features/review/Page.tsx (the flag branch only), tests/unit/review-v6/**, CURRENT.md.
Not: `src/features/review-run/**` and `src/features/review-done/**` (N6.3 owns them), FSRS or quota logic, `src/data/**`, new dependencies, other screens' folders, existing tests' expectations.

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
