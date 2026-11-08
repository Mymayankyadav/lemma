# NEXT — ranked by the priority run (2026-11-06 evening: all remaining v6 work, rules v2.1). Take the top open item whose Needs are all done.

Order used (priority run 2026-11-06 18:30 IST, all remaining v6 work): open PR work; blockers that unlock the most items (registries N36, versions N38, typed settings N39, capability registry N40); new record migrations and their app modules in parallel (D8); study command changes in sequence; V6-05 planner and rituals; V6-06 remaining learning screens; V6-07 MCP chain; Harden per area after its features (Owner: build fast, review in Harden); V6-08 acceptance; turning v6 on last. Earlier (12:30 IST): work already in a PR, then the v6 first study slice end to end (N20), then blockers that unlock the most items (task command layer N22, task adapters N23/N24), then independent lanes from V6-05 (tasks, Calendar) and V6-06 (learning screens), then MCP and live parity. Earlier order: the v6 first study slice (`docs/v6/`: Today → Focus → saved time → Calendar and Progress), split into lanes that can run at the same time, then notifications. Done and removed: N2–N5, N7–N10, N6.1, N6.2, N11.1–N11.3, N13, N14.1–N14.3, N16–N18, N20–N35 except N32.2.2, N21 (#818, #820, #821, #823, #840, #822, #850, #851, #872, #860, #882, #853, #887, #881, #888, #893, #903, #897, #905, #909, #910). An id in a Needs line that is no longer in this file is done.
No item may list a protected path (`ci/protected.json`) in Scope. Files under `docs/v6/` are behaviour references cited by items, not instructions. v6 UI work stays behind the `v6Shell` flag: with the flag off, existing screens, tests and visual rules stay exactly as they are.

Parallel lanes (v2.0). Every v6 screen and both study adapters meet at one typed contract that already exists on main: `src/data/study/contract.ts` (`StudyApi`, records shaped like the N10 tables) and `getStudyApi()` in `src/data/study/index.ts`, which returns an empty placeholder until N14.2 (demo) and N16 (live) replace `src/data/study/demo.ts` and `src/data/study/live.ts`. Screens therefore never wait for adapters: they read and write only through `getStudyApi()`, and their unit tests use `setStudyApiForTests(fake)`. Each item owns its own files, so parallel PRs do not touch the same code. Change the contract only additively. End-to-end wiring of the whole slice is N20.

Task lanes (priority run 2026-11-06). Tasks follow the same pattern with their own folder, so they never touch the study files N20 edits: the contract `src/data/tasks/contract.ts` (`TaskApi`, `TaskRecord` shaped like `public.tasks` from N21) and `getTaskApi()` / `setTaskApiForTests()` in `src/data/tasks/index.ts` are on main; `src/data/tasks/demo.ts` and `src/data/tasks/live.ts` are placeholders that read nothing and refuse writes until N23 and N24 replace them. The server command for tasks is Owner decision D7 (`docs/v6/README.md`).

v6 screen lanes (N28–N33). Each screen item owns only its own feature folder: it adds `src/features/<screen>/v6/**` and, in that screen's existing `Page.tsx`, one branch `if (isFlagOn('v6Shell')) return <…V6/>` (or the equivalent for a page that already branches). It reads through the existing hooks in `src/data/**` unchanged (no new queries, no `src/data/**` edits); a field the hooks do not provide is shown as unavailable, never invented. It distinguishes loading, empty, filtered-empty and failed states, keeps 44-pixel targets, uses the N19 tokens under `[data-v6]`, and leaves the flag-off page, its tests and its visual rules exactly as they are. Exact-pixel polish and device audits are the Harden stage, not these items.

Remaining v6 lanes (priority run 2026-11-06 evening, Owner decision D8 in `docs/v6/README.md`). **Resource migration items** ("migration" below) follow D8(b): one additive migration, `public.<resource>_command(p)`, rows in `lemma_undo_tables` and `lemma_command_resources`, and a PGlite test in `tests/mcp/sql/<resource>.mjs` covering create/update/delete or the named lifecycle, `operationId` retry, changed-payload conflict, stale `expectedVersion`, a second owner rejected, undo through `undo_action`, and `mcp_command` as service_role writing as `p_user`; they deploy on merge and need a review. **App module items** ("module") follow D8(c): `src/data/<resource>/` with a typed contract shaped like the migration item's fields (camelCase, dates `YYYY-MM-DD`, instants ISO, durations in minutes), a demo adapter with a small fixture and reload persistence under its own key, a live adapter over `rpc('<resource>_command', envelope)` with bounded owner reads, `get…Api()` / `set…ApiForTests()`, and unit tests in `tests/unit/<resource>/**`; they never wait for the migration. **Screen items** follow the v6 screen-lane rules above, may also read the new modules through their `get…Api()`, and test with the `set…ApiForTests` fakes. Every new table or column is added to the capability registry (N40) in the same PR that creates it.

## N109 Register calendar_blocks.task_id and study_entries.calendar_block_id for MCP
Stage: Build · Status: open · Needs: — · Assigned: —
Done = per D8, one additive migration appends `task_id` to the `calendar_blocks` row and `calendar_block_id` to the `study_entries` row of `lemma_command_resources` (append only, when missing), and `study_command` accepts `calendar_block_id` on study entry create and start with the same owner-composite check the app relies on (a foreign-owner or non-study block is refused, nothing written). MCP study tools expose both fields. Owner decision (bug #1231): this is the one authorized change to the frozen N36.1 baseline rows; `tests/mcp/sql/registries.mjs` changes only to expect these two appended fields. The static manifest and the two capability-registry `mcpPath` entries are updated so N94 reports no tracked gaps.
Owner-authorized (D1, D8): deploys on merge, so this PR needs a review. PR body line `Replaces function: study_command (reviewer verified signature and behaviour)`.
Tests: `tests/mcp/sql/study-block-link-mcp.mjs` (registry rows, MCP start with a block, foreign-owner and non-study block refused, replay, undo), the existing `registries.mjs` and `command-manifest-mirror.mjs`
Scope: supabase/migrations/<one new additive file>, supabase/functions/mcp/tools/study.ts, tests/mcp/sql/study-block-link-mcp.mjs, tests/mcp/sql/registries.mjs (the two appended fields only), docs/v6/capability-registry/{lemma_command_resources,calendar_blocks,study_entries}.json, CURRENT.md.
Not: app code, other commands, other registry rows.

## N108 Day close: canonical carry-over and tomorrow's-first-task transitions
Stage: Build · Status: open · Needs: N107 · Assigned: —
Done = per D8, one additive migration replaces `day_plans_command` compatibly so `close` also accepts `tomorrow_first_task_id` and a list of `carry_over` task IDs. It verifies owner ownership, that the plan is committed and that the day is the owner's local today or earlier, then updates the plan's dedicated column and sets the matching `day_plan_items` to `carried_over` with their reason in the same journalled action. `DayPlanApi.closePlan` forwards them. N69's `ritual` JSON stays the record of the owner's choices. Existing close behaviour and future-day refusal are unchanged. Owner decision (#1178): N69 is complete with ritual JSON only; canonical transitions belong to this item.
Owner-authorized (D1, D8): deploys on merge, so this PR needs a review. PR body line `Replaces function: day_plans_command (reviewer verified signature and behaviour)`.
Tests: `tests/mcp/sql/day-plan-close.mjs` (column and items updated, stale version refusal, future day refused, foreign task refused, undo, owner isolation), `tests/unit/day-plans/close-transitions.test.ts`
Scope: supabase/migrations/<one new additive file>, src/data/day-plans/**, tests/mcp/sql/day-plan-close.mjs, tests/unit/day-plans/close-transitions.test.ts, CURRENT.md.
Not: screens, other functions, MCP code, new dependencies.

## N54.1 App sync from the change feed
Stage: Build · Status: open · Needs: N54 · Assigned: —
Done = `src/data/sync/` polls `changes_since` while the app is visible (and on focus/reconnect), keyed by account and mode, invalidating only the affected query keys; on `reset` it refetches bounded projections; cursors are cleared on sign-out or account switch. Demo mode does nothing. This replaces refresh-only sync (D4) for the v6 screens.
Tests: `tests/unit/sync/**` (invalidation per resource, reset, account switch, backoff when hidden)
Scope: src/data/sync/** (new), src/data/hooks.ts (one subscription call), tests/unit/sync/**, CURRENT.md.
Not: screens, supabase/**.

## N68 v6 planner sheet: preview and commit placements behind the shell flag
Stage: Build · Status: open · Needs: N67, N65, N60.2, N107 · Assigned: —
Done = with `v6Shell` on, a Plan action on Today and Calendar opens a titled native dialog that previews placements for the selected tasks over the chosen days (from N67), lets the owner deselect or move items, and commits only the selected placements as study blocks with `taskId` and the day plan's `commit` (refused with an explanation when a task or block changed since the preview); unplaced work stays listed with its reason; one toast with Undo. Flag off: nothing changes.
Owner decision (#1177): the commit makes a single call to the atomic planner command from N107 (`DayPlanApi.commitPlacements`), so there is one receipt and one truthful Undo for every selected day; the per-block and per-day orchestration is removed, and a stale source refuses the whole commit with nothing written.
Tests: `tests/unit/planner/sheet.test.tsx` (preview, deselect, stale-preview refusal, unplaced reasons, Undo)
Scope: src/features/planner/** (except model.ts), src/features/home/Page.tsx and src/features/calendar/Page.tsx (opening the sheet only), tests/unit/planner/sheet.test.tsx, CURRENT.md.
Not: other screens' folders, `src/data/**` except reading through existing APIs, new dependencies, existing tests' expectations.

## N72 v6 Focus modes and the persistent focus accessory behind the shell flag
Stage: Build · Status: open · Needs: N66, N71, N41.2.2.2.2.2 · Assigned: —
Done = with `v6Shell` on, starting focus picks a preset or mode (Pomodoro/Flowtime/open) with its captured configuration; Focus shows the current phase, cycle and the server phase deadline (browser ticking is only display), offers Next phase and the long-session guard; a compact accessory in the v6 shell (all routes, above the dock, not overlapping Inbox decisions) shows the running entry with pause/resume/open; taking the lease on another tab is explicit; I drifted can now exclude the minutes. Flag off: nothing changes.
Tests: `tests/unit/focus/modes.test.tsx`, `tests/e2e/v6-focus-modes.spec.ts` (accessory clears the dock and Inbox decision bar at 320×640)
Scope: src/features/focus/**, src/app/V6Shell.tsx (mounting the accessory only), src/app/FocusAccessory.tsx (new), tests/unit/focus/modes.test.tsx, tests/e2e/v6-focus-modes.spec.ts, CURRENT.md.
Not: other screens' folders, `src/data/**` except reading through existing APIs, new dependencies, existing tests' expectations.

## N88 MCP: paths, subjects, styles, concepts and sources fields
Stage: Build · Status: open · Needs: N87, N93 · Assigned: —
Done = MCP covers project pinning and status lifecycle, slug rename with aliases, subject/style create/reorder/merge/delete-unused, concept hierarchy, Atlas pin coordinates and edges with cycle checks, and source metadata/order/coverage/verification and page text revisions, each through the existing transaction path with versions when given.
Owner-authorized (D1, D8): deploys the MCP function on merge, so this PR needs a review.
Tests: `tests/unit/mcp/learning-coverage.test.ts` enumerating the registry fields of those tables, plus SQL round trips in `tests/mcp/sql/learning-coverage.mjs`
Scope: supabase/functions/mcp/**, tests/unit/mcp/learning-coverage.test.ts, tests/mcp/sql/learning-coverage.mjs, CURRENT.md.
Not: migrations, app code.

## N89 MCP: devices, holds and notifications
Stage: Build · Status: open · Needs: N88 · Assigned: —
Done = MCP lists push devices and renames, disables, restores or removes them (never synthesizing a subscription), creates/changes/clears notification holds, previews, schedules, updates, cancels, snoozes and dismisses notifications, and reads delivery history, with the same validation as the app.
Owner-authorized (D1, D8): deploys the MCP function on merge, so this PR needs a review.
Tests: `tests/unit/mcp/notify-coverage.test.ts`
Scope: supabase/functions/mcp/**, tests/unit/mcp/notify-coverage.test.ts, CURRENT.md.
Not: migrations, the notify function, app code.

## N90 MCP: historical corrections, proposal versions and drafts
Stage: Build · Status: open · Needs: N89, N91, N92 · Assigned: —
Done = MCP exposes the N91 corrections (session events and reviews), N92 withdraw/revise/reopen and versioned approval, and N49 drafts through `mcp_command`, with explicit-instruction rules from D3.
Owner-authorized (D1, D8): deploys the MCP function on merge, so this PR needs a review.
Tests: `tests/unit/mcp/history-coverage.test.ts`
Scope: supabase/functions/mcp/**, tests/unit/mcp/history-coverage.test.ts, CURRENT.md.
Not: migrations, app code.

## N98 Harden: Today, Focus, time log and Progress
Stage: Build · Status: open · Needs: N70, N72, N73, N76 · Assigned: —
Done = review the fast-built first slice and its additions against `docs/v6/DESIGN_HANDOFF.md` and contract §6: exact geometry at 320/360/390 widths, 200% text, Day/Night, keyboard and Back, reload and two-tab behaviour, long mathematics; fix every defect found within these folders and record intentional limitations in CURRENT.md.
Tests: `tests/e2e/v6-harden-slice.spec.ts` covering the journeys and geometry found
Scope: src/features/home/** (v6 branch), src/features/focus/**, src/features/time-log/**, src/features/progress-v6/**, src/app/FocusAccessory.tsx, tests/e2e/v6-harden-slice.spec.ts, CURRENT.md.
Not: data adapters, supabase/**, other screens.

## N99 Harden: tasks, planner, Calendar and ritual
Stage: Build · Status: open · Needs: N68, N69, N74, N75, N78 · Assigned: —
Done = as N98 for `/tasks`, the planner sheet, all four Calendar views with deadlines/practice/overlaps, the ritual and practice screens, including overloaded and empty days, DST weeks and 50+ task accounts.
Tests: `tests/e2e/v6-harden-planning.spec.ts`
Scope: src/features/tasks/**, src/features/planner/**, src/features/calendar/**, src/features/ritual/**, src/features/practice/**, tests/e2e/v6-harden-planning.spec.ts, CURRENT.md.
Not: data adapters, supabase/**, other screens.

## N100 Harden: learning screens
Stage: Build · Status: open · Needs: N80, N81, N82, N83, N84, N85, N86 · Assigned: —
Done = as N98 for Paths/project, checkpoint, session, sources, Review/run/done, Cards and card detail, Inbox and plan review, Atlas and Settings, with realistic account sizes (2,000+ cards, long sources) and the Inbox decision-bar invariant (contract §9).
Tests: `tests/e2e/v6-harden-learning.spec.ts`
Scope: src/features/*/v6/**, src/features/*-v6/**, tests/e2e/v6-harden-learning.spec.ts, CURRENT.md.
Not: data adapters, supabase/**, flag-off pages.

## N97 Upgrade rehearsal on representative existing data (G5)
Stage: Build · Status: open · Needs: N53, N54, N91, N92, N93 · Assigned: —
Done = a PGlite test loads a representative pre-v6 account fixture (paths, sources, cards with history, sessions, proposals), applies all migrations, and checks no lost rows, links or schedules, historical estimates still labelled, new records creatable, and export/undo across old and new records.
Tests: `tests/mcp/sql/upgrade-rehearsal.mjs` and its fixture
Scope: tests/mcp/sql/upgrade-rehearsal.mjs, tests/mcp/sql/fixtures/pre-v6-account.sql (new), CURRENT.md.
Not: migrations, app code.

## N101 Release audit, screenshots and docs
Stage: Build · Status: open · Needs: N98, N99, N100, N94, N96, N97 · Assigned: —
Done = run the exact-output browser audit of every v6 route (320/360/390, 200% text, Day/Night) and the acceptance journeys, refresh `docs/v6/screens/` captures from the real app, write `docs/v6/RELEASE.md` (what shipped, known limitations, gates G1–G7 evidence, the Owner's physical-device checklist), and fix small defects found.
Tests: `tests/e2e/v6-release-audit.spec.ts`
Scope: docs/v6/screens/**, docs/v6/RELEASE.md (new), tests/e2e/v6-release-audit.spec.ts, CURRENT.md.
Not: app behaviour changes beyond small fixes, supabase/**.

## N102 Turn v6 on by default (Owner approval required)
Stage: Build · Status: open · Needs: N101, N90, N95, N103, N54.1 · Assigned: —
Done = `v6Shell` defaults on in `src/flags.ts` with the existing override to turn it off; the PR body lists the G1–G7 evidence from `docs/v6/RELEASE.md`; the Owner's explicit approval comment on the PR is required before merge (D8 g), and the Owner's device checks are done.
Tests: the flag test and the full e2e suite with the flag on by default; the rollback spec with it off
Scope: src/flags.ts, tests affected by the default (expectations updated deliberately), CURRENT.md.
Not: anything else.

(Next priority run: after the Owner's device checks and N102, or when a lane runs dry. Excluded from v6 on purpose: real third-party calendar connections and native surfaces (previews stay labelled per contract §5), recurring blocks. Next free ID: N104.)
