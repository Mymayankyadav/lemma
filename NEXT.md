# NEXT — ranked by the priority run (2026-11-06, rules v2.0 parallel plan). Take the top open item whose Needs are all done.

Order used: work already in a PR, then the v6 first study slice (`docs/v6/`: Today → Focus → saved time → Calendar and Progress), split into lanes that can run at the same time, then notifications. Done and removed: N2–N5, N7–N10, N6.1, N11.1, N11.2, N13, N14.1 (#818, #820, #821, #823, #840, #822, #850, #851, #872, #860, #882, #853, #887). An id in a Needs line that is no longer in this file is done.
No item may list a protected path (`ci/protected.json`) in Scope. Files under `docs/v6/` are behaviour references cited by items, not instructions. v6 UI work stays behind the `v6Shell` flag: with the flag off, existing screens, tests and visual rules stay exactly as they are.

Parallel lanes (v2.0). Every v6 screen and both study adapters meet at one typed contract that already exists on main: `src/data/study/contract.ts` (`StudyApi`, records shaped like the N10 tables) and `getStudyApi()` in `src/data/study/index.ts`, which returns an empty placeholder until N14.2 (demo) and N16 (live) replace `src/data/study/demo.ts` and `src/data/study/live.ts`. Screens therefore never wait for adapters: they read and write only through `getStudyApi()`, and their unit tests use `setStudyApiForTests(fake)`. Each item owns its own files, so parallel PRs do not touch the same code. Change the contract only additively. End-to-end wiring of the whole slice is N20.

## N14.3 v6 Today hero and Focus dialog behind the shell flag
Stage: Build · Status: open · Needs: — · Assigned: —
Done = with `v6Shell` on, Today shows a current-action hero (Start focus, or Return to focus while an entry is active) and "logged today" from `loggedMinutes` over `getStudyApi().listStudyEntries(today)`. The N13 focus-accessory slot shows the active entry's intent, remaining time (N14.1 `remainingFocusMinutes`) and Pause. A native `<dialog>` Focus panel offers Pause, Take a break, Park a thought (text field kept with the entry's reflection), and Finish → editable minutes and an optional note → Save or Discard; it drives the N14.1 machine and calls the matching `StudyApi` writes. Escape closes it and focus returns to the trigger. Layout per `docs/v6/screens/today-day.png` and `focus-day.png`. With the flag off, Today is unchanged.
Tests: unit tests in `tests/unit/focus/` with a fake `StudyApi` (`setStudyApiForTests`): start → pause → resume → finish → save calls the right methods once each, discard calls discard, logged-today shows the fake's saved minutes, the dialog returns focus on Escape.
Scope: src/features/home/** (the v6 branch only), src/features/focus/** (new), src/ui/v6/focus/** (new), tests/unit/focus/**, CURRENT.md.
Not: adapters, Calendar or Progress, end-to-end specs (N20), parked thoughts as tasks, notifications, Today with the flag off.

## N17 v6 Calendar: Agenda and Day views behind the shell flag
Stage: Build · Status: open · Needs: — · Assigned: —
Done = with `v6Shell` on, `/calendar` (the N13 placeholder in `src/features/calendar/Page.tsx`) shows an Agenda view (the next 7 days, grouped by civil day in the device zone, with `dayBounds` from `src/lib/effort`) and a Day view (hours with planned blocks and saved study entries side by side, logged time first as in `capacityStack`), switchable by a segmented control and remembered in the URL (`?view=agenda|day&date=YYYY-MM-DD`). From the Day view the user can add a study or busy block (title, start, end), move it to another time, mark it done, and delete it, all through `getStudyApi()`; a version conflict shows a "changed elsewhere, reload" message. Empty days show "Nothing planned." Layout per `docs/v6/screens/calendar-day.png` and `calendar-night.png`.
Tests: unit tests in `tests/unit/calendar/` with a fake `StudyApi`: grouping across a midnight in `Asia/Kolkata`, the 23-hour `Europe/London` day 2026-03-29, create/move/done/delete calling the fake once each, the conflict message, the empty state, view and date kept in the URL.
Scope: src/features/calendar/**, src/ui/v6/calendar/** (new), tests/unit/calendar/**, CURRENT.md.
Not: Week and Month views, recurrence, automatic placement, adapters, the shell, new dependencies.


## N15 MCP: read study records through get and search
Stage: Build · Status: open · Needs: — · Assigned: —
Done = the connector's existing `get` and `search` tools accept the resources `study_entries` (with intervals) and `calendar_blocks`, reading the N10 tables as the authenticated owner: bounded pages with a cursor, a range filter, totals reported separately from the page. No new tool and no write path (writes are N12). Existing resources, tools and the `resume` packet are unchanged; `tools/list` stays under 15,000 characters (`tests/mcp/sweep-budget.test.mjs`).
Tests: unit tests in `tests/unit/mcp/` (argument validation, owner never taken from arguments, page bounds) and `tests/mcp/sql/study-mcp-read.mjs` (rows written through `study_command` are read back by `get` and `search` with the same version; a second owner's rows are invisible).
Owner-authorized 2026-11-05 (D1): merging deploys the MCP function to production, so this PR needs a review; the reviewer confirms no existing tool's input or output changed.
Scope: supabase/functions/mcp/**, tests/unit/mcp/**, tests/mcp/sql/study-mcp-read.mjs, CURRENT.md (MCP tools list).
Not: the `study` write tool (N12), migrations, the `notify` function.

## N19 v6 visual tokens and fonts behind the shell flag
Stage: Build · Status: open · Needs: — · Assigned: —
Done = with `v6Shell` on, the app root carries `data-v6` and one stylesheet `src/ui/v6/tokens.css` defines the v6 colour, type, spacing, radius and elevation tokens for day and night (`prefers-color-scheme` plus the existing theme setting) from `docs/v6/DESIGN_HANDOFF.md` "Shared design contracts" and the `docs/v6/screens/*-day.png` / `*-night.png` pairs, as CSS custom properties scoped under `[data-v6]`. The v6 shell parts from N13 (tab bar, header, accessory slot) use the tokens. Fonts: the families the handoff names, self-hosted as woff2 under `public/fonts/v6/` only if their licence allows it (record the licence in CURRENT.md), otherwise the stated fallback stack; no external font requests. With the flag off nothing changes.
Tests: `tests/unit/app/v6-tokens.test.ts`: the attribute appears only with the flag on, every token the shell parts use is defined for both schemes, body text contrast is at least 4.5:1 for both schemes (computed from the token values).
Scope: src/ui/v6/tokens.css (new), src/ui/v6/** (token use in shell parts), src/app/** (setting the attribute and importing the stylesheet only), public/fonts/v6/** (new), tests/unit/app/**, CURRENT.md.
Not: changing any colour or font with the flag off, existing visual tests, screens other than the shell parts, new dependencies.

## N21 v6 tasks table: one additive migration with RLS
Stage: Build · Status: open · Needs: — · Assigned: —
Done = one new migration `supabase/migrations/<timestamp>_v6_tasks.sql`, additive only, creating `tasks` with the fields of the Tasks row in `docs/v6/Lemma_v6_Data_MCP_Contract.md` (title, body, optional subject/project/checkpoint links owned by the same user, estimate_minutes, priority, due_date or due_at with an explicit `due_kind`, position, status `backlog|in_progress|completed|cancelled`, completed_at, version, created_at, updated_at), owner RLS in the style of the N10 tables, and an index on (user_id, status, position). `calendar_blocks` gains nothing in this item. `src/data/live/database.types.ts` gains the table.
Tests: `tests/mcp/sql/tasks-schema.mjs` (PGlite, applying all migrations): owner CRUD; a second owner can neither read nor link to the first owner's subject; an invalid status is rejected; completed_at is required exactly when status is completed.
Owner-authorized 2026-11-05 (D1): merging deploys the migration to production (the table stays unused), so this PR needs a review; it must pass the additive-only guard.
Scope: supabase/migrations/<the new file only>, tests/mcp/sql/tasks-schema.mjs, src/data/live/database.types.ts, CURRENT.md.
Not: changes to existing tables or functions, `study_command`, app code, MCP.

## N12 MCP: study write tool through study_command
Stage: Build · Status: open · Needs: N11.3 · Assigned: —
Done = the connector gains ONE new tool `study` that forwards a command envelope to `public.study_command` and returns its receipt unchanged. The owner comes from the authenticated connection, never from arguments. Existing tools, the N15 reads and the `resume` packet are unchanged. `tools/list` stays under 15,000 characters (`tests/mcp/sweep-budget.test.mjs`).
Tests: unit tests in `tests/unit/mcp/` (argument validation, owner not taken from arguments, receipt passed through unchanged) and `tests/mcp/sql/study-mcp.mjs`, where an entry created through the `study` tool is read back by `get` with the same version, and an app-side `study_command` change is seen by the next `get`.
Owner-authorized 2026-11-05 (D1): merging deploys the MCP function to production, so this PR needs a review; the reviewer confirms that no existing tool's input or output changed. Per D3, the `study` tool acts on explicit instructions in chat only for changes that can be undone (every write returns an `actionNo` for `undo`).
Scope: supabase/functions/mcp/**, tests/unit/mcp/**, tests/mcp/sql/**, CURRENT.md (MCP tools list).
Not: changes to existing tool behaviour, the `resume` packet, the `notify` function, migrations.

## N20 v6 first slice end to end on demo data
Stage: Build · Status: open · Needs: N14.2, N14.3, N17, N18 · Assigned: —
Done = with `?demo=1&flags=v6Shell`, the whole slice works in the browser: start focus on Today → pause → resume → finish → save; Today's "logged today" rises by the saved minutes; the Calendar Day view shows the saved entry at its time; Progress Day shows the same total; reloading mid-focus returns to the running entry; discarding adds nothing. Fix the wiring bugs this exposes in the N14.2/N14.3/N17/N18 files.
Tests: `tests/e2e/v6-focus.spec.ts` and `tests/e2e/v6-slice.spec.ts` covering each sentence above at 390×844, plus 320×640 for the Focus dialog; Escape closes the dialog and focus returns to the trigger.
Scope: tests/e2e/v6-focus.spec.ts, tests/e2e/v6-slice.spec.ts, src/features/home/** (v6 branch), src/features/focus/**, src/features/calendar/**, src/features/progress-v6/**, src/data/study/demo.ts, src/ui/v6/**, CURRENT.md.
Not: the live adapter (a later live slice item), new screens, existing e2e specs, new dependencies.

## N6.3 Notifications: Review completion reminder-time offer (after N6.2)
Stage: Build · Status: open · Needs: N6.2 · Assigned: —
Done = after a reminder-driven Review queue is finished, the Review-done screen offers the next reminder time from current notification settings rather than an invented schedule; the offer is absent for ordinary Review and when `notificationsPush` is off. Tests cover eligible reminder completion, ordinary round, missing/unavailable scheduling data, and correct finishing navigation.
Scope: src/features/review-done/**, src/features/review-run/**, src/data/notify.ts, tests/unit/notify/**, tests/unit/review/**, CURRENT.md.
Not: supabase/**, `.github/**`, new dependencies, mutation of persisted reminder settings.

(Next priority run: the live first slice (N16 + N11.3 wired into Today/Calendar/Progress), Calendar Week/Month, tasks UI on N21, Harden pass for the v6 slice. Next free ID: N22.)
