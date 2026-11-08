# NEXT — ranked by the priority run (2026-11-06 evening: all remaining v6 work, rules v2.1). Take the top open item whose Needs are all done.

Order used (priority run 2026-11-06 18:30 IST, all remaining v6 work): open PR work; blockers that unlock the most items (registries N36, versions N38, typed settings N39, capability registry N40); new record migrations and their app modules in parallel (D8); study command changes in sequence; V6-05 planner and rituals; V6-06 remaining learning screens; V6-07 MCP chain; Harden per area after its features (Owner: build fast, review in Harden); V6-08 acceptance; turning v6 on last. Earlier (12:30 IST): work already in a PR, then the v6 first study slice end to end (N20), then blockers that unlock the most items (task command layer N22, task adapters N23/N24), then independent lanes from V6-05 (tasks, Calendar) and V6-06 (learning screens), then MCP and live parity. Earlier order: the v6 first study slice (`docs/v6/`: Today → Focus → saved time → Calendar and Progress), split into lanes that can run at the same time, then notifications. Done and removed: N2–N5, N7–N10, N6.1, N6.2, N11.1–N11.3, N13, N14.1–N14.3, N16–N18, N20–N35 except N32.2.2, N21 (#818, #820, #821, #823, #840, #822, #850, #851, #872, #860, #882, #853, #887, #881, #888, #893, #903, #897, #905, #909, #910). An id in a Needs line that is no longer in this file is done.
No item may list a protected path (`ci/protected.json`) in Scope. Files under `docs/v6/` are behaviour references cited by items, not instructions. v6 UI work stays behind the `v6Shell` flag: with the flag off, existing screens, tests and visual rules stay exactly as they are.

Parallel lanes (v2.0). Every v6 screen and both study adapters meet at one typed contract that already exists on main: `src/data/study/contract.ts` (`StudyApi`, records shaped like the N10 tables) and `getStudyApi()` in `src/data/study/index.ts`, which returns an empty placeholder until N14.2 (demo) and N16 (live) replace `src/data/study/demo.ts` and `src/data/study/live.ts`. Screens therefore never wait for adapters: they read and write only through `getStudyApi()`, and their unit tests use `setStudyApiForTests(fake)`. Each item owns its own files, so parallel PRs do not touch the same code. Change the contract only additively. End-to-end wiring of the whole slice is N20.

Task lanes (priority run 2026-11-06). Tasks follow the same pattern with their own folder, so they never touch the study files N20 edits: the contract `src/data/tasks/contract.ts` (`TaskApi`, `TaskRecord` shaped like `public.tasks` from N21) and `getTaskApi()` / `setTaskApiForTests()` in `src/data/tasks/index.ts` are on main; `src/data/tasks/demo.ts` and `src/data/tasks/live.ts` are placeholders that read nothing and refuse writes until N23 and N24 replace them. The server command for tasks is Owner decision D7 (`docs/v6/README.md`).

v6 screen lanes (N28–N33). Each screen item owns only its own feature folder: it adds `src/features/<screen>/v6/**` and, in that screen's existing `Page.tsx`, one branch `if (isFlagOn('v6Shell')) return <…V6/>` (or the equivalent for a page that already branches). It reads through the existing hooks in `src/data/**` unchanged (no new queries, no `src/data/**` edits); a field the hooks do not provide is shown as unavailable, never invented. It distinguishes loading, empty, filtered-empty and failed states, keeps 44-pixel targets, uses the N19 tokens under `[data-v6]`, and leaves the flag-off page, its tests and its visual rules exactly as they are. Exact-pixel polish and device audits are the Harden stage, not these items.

Remaining v6 lanes (priority run 2026-11-06 evening, Owner decision D8 in `docs/v6/README.md`). **Resource migration items** ("migration" below) follow D8(b): one additive migration, `public.<resource>_command(p)`, rows in `lemma_undo_tables` and `lemma_command_resources`, and a PGlite test in `tests/mcp/sql/<resource>.mjs` covering create/update/delete or the named lifecycle, `operationId` retry, changed-payload conflict, stale `expectedVersion`, a second owner rejected, undo through `undo_action`, and `mcp_command` as service_role writing as `p_user`; they deploy on merge and need a review. **App module items** ("module") follow D8(c): `src/data/<resource>/` with a typed contract shaped like the migration item's fields (camelCase, dates `YYYY-MM-DD`, instants ISO, durations in minutes), a demo adapter with a small fixture and reload persistence under its own key, a live adapter over `rpc('<resource>_command', envelope)` with bounded owner reads, `get…Api()` / `set…ApiForTests()`, and unit tests in `tests/unit/<resource>/**`; they never wait for the migration. **Screen items** follow the v6 screen-lane rules above, may also read the new modules through their `get…Api()`, and test with the `set…ApiForTests` fakes. Every new table or column is added to the capability registry (N40) in the same PR that creates it.

## N59.2 Study goals live adapter (remaining after N59 split)
Stage: Build · Status: open · Needs: N59.1, N45 · Assigned: —
Done = complete N59 after N59.1's typed GoalApi contract, isolated sessionStorage demo adapter and getGoalApi/setGoalApiForTests facade. Implement the owner-RLS live adapter for the N45 study_goals_command RPC, with idempotent v1 operationId receipts and retry using the same ID, expectedVersion for update/archive/restore/delete, typed conflict/not-found mapping, exact bounded 1–50 keyset pages and stable owner-scoped ID filters, correct archived state, inclusive YYYY-MM-DD period bounds and IANA time-zone intent. Refuse overlapping active goals of the same period and stable scope (subject/project IDs, never display names); restore must detect conflicts too. Live reads come from the signed-in owner's DB RLS and must not send an owner ID in the command envelope. Replace the live placeholder while retaining demo semantics and the stable facade.
Tests: tests/unit/study-goals/live.test.ts (RPC envelope and operationId retry/changed-payload conflict, every lifecycle op, stale expectedVersion, owner-RLS read, no owner ID in writes, >50 paged goals, date/time-zone and overlap parity); existing N59.1 demo tests stay green.
Scope: src/data/study-goals/**, tests/unit/study-goals/**, CURRENT.md.
Not: src/data/study/** or other data folders, UI, supabase/**, new dependencies.

## N63.2 Proposal drafts: persistent demo, versioned live RPC, retry and conflict views
Stage: Build · Status: open · Needs: N49 · Assigned: —
Done = finish N63 on top of N63.1's typed ProposalDraftApi, immutable full-edit payload validation, positive optimistic draft and target base versions, and explicit draft/saved/submitted/discarded lifecycle. Implement an isolated sessionStorage-backed demo adapter and mode-aware index facade under src/data/proposal-drafts/**. It must seed owner-safe proposal/target fixtures, keep draft edits separate from approved proposals, clone values, survive reload, preserve owner-independent drafts, require expectedDraftVersion for every save/submit/discard, and never silently overwrite a newer cross-device draft. List/get pages must use 1–50 filter-bound opaque keyset cursors, exact totals and no caller owner fields. Implement a live owner-RLS read adapter and an atomic server RPC for create/save/submit/discard after N49's proposal_drafts_command is deployed; each mutation has a unique operationId retained on uncertain retries, maps stale versions to typed conflicts carrying base/current/draft, and submits through the existing proposal edit path under both proposal and target base-version checks. Submission of a draft must not be an implicit approval without the N49 command receipt. Expose getProposalDraftApi/setProposalDraftApiForTests; keep v6 flag default off and other app folders untouched.
Tests: tests/unit/proposal-drafts/** for demo lifecycle/reload/isolation, no implicit approval, duplicate/changed-payload operationId, conflict views and source version drift, bounded pages and cursor filter locks, live envelopes per operation with retry and no owner field, typed error mapping. Retain N63.1 pure-model tests.
Scope: src/data/proposal-drafts/**, tests/unit/proposal-drafts/**, CURRENT.md.
Not: other data modules, UI, supabase/**, unrelated MCP functions, protected paths, or new dependencies.

## N52 Study command v3: timer modes, captured configuration, drift deduction and lease
Stage: Build · Status: open · Needs: N51, N41.2.2.2.2.2 · Assigned: —
Done = per D8(d), one migration replaces `study_command` compatibly and adds to `study_entries`: `mode` (`pomodoro`/`flowtime`/`open`, default `open`), `preset_id` (FK to presets), captured `config jsonb` (copied from the preset or `settings.focus_defaults` at start; later default changes never alter it), `phase` (`focus`/`break`/`long_break`), `cycle`, `phase_ends_at`, `energy` (`low`/`steady`/`high`, optional), and a timer lease (`lease_device`, `lease_version`, `lease_expires_at`); operations `next_phase`, `take_lease`, and `exclude_minutes` (deduct the last N minutes of focus as an `excluded` interval with a reason, refused when there is not enough focus time; never double-subtracts). A second device without the lease can read but its writes conflict until the lease expires or is taken.
Owner-authorized (D1, D8): deploys on merge, so this PR needs a review. PR body line `Replaces function: study_command (reviewer verified signature and behaviour)`.
Tests: `tests/mcp/sql/study-modes.mjs` (Pomodoro cycle and long break, Flowtime break from ratio, captured config immune to settings change, lease conflict and takeover, exclusion bounds, undo) and earlier study SQL tests unchanged
Scope: supabase/migrations/<one new additive file>, tests/mcp/sql/study-modes.mjs, docs/v6/capability-registry/study_entries.json, CURRENT.md.
Not: app or MCP code, other functions.

## N54 Owner change feed and catch-up cursor
Stage: Build · Status: open · Needs: N36.2 · Assigned: —
Done = one additive migration adds `public.owner_changes` (ordered `cursor bigserial`, owner, resource, record ID, version, `op`, `tombstone`, `committed_at`) filled in the same transaction by triggers on every table in `lemma_undo_tables` (the registry, so later tables are covered by inserting their name), and `public.changes_since(p_cursor bigint, p_limit int)` returning a bounded ordered page and a `reset` flag when the cursor is older than retention (30 days, pruned by the notify tick).
Owner-authorized (D1, D8): deploys on merge, so this PR needs a review.
Tests: `tests/mcp/sql/change-feed.mjs` (app and `mcp_command` writes both appear once in commit order, deletes as tombstones, paging, reset, second owner invisible)
Scope: supabase/migrations/<one new additive file>, tests/mcp/sql/change-feed.mjs, docs/v6/capability-registry/owner_changes.json, CURRENT.md.
Not: app code (N54.1), MCP code.

## N54.1 App sync from the change feed
Stage: Build · Status: open · Needs: N54 · Assigned: —
Done = `src/data/sync/` polls `changes_since` while the app is visible (and on focus/reconnect), keyed by account and mode, invalidating only the affected query keys; on `reset` it refetches bounded projections; cursors are cleared on sign-out or account switch. Demo mode does nothing. This replaces refresh-only sync (D4) for the v6 screens.
Tests: `tests/unit/sync/**` (invalidation per resource, reset, account switch, backoff when hidden)
Scope: src/data/sync/** (new), src/data/hooks.ts (one subscription call), tests/unit/sync/**, CURRENT.md.
Not: screens, supabase/**.

## N66 StudyApi: timer modes, phases, drift exclusion and lease
Stage: Build · Status: open · Needs: N52, N65 · Assigned: —
Done = the study contract gains, additively, mode/preset/config/phase/cycle/energy/lease fields and `nextPhase`, `takeLease`, `excludeMinutes`, in both adapters with the N52 envelope; the live adapter keeps one device lease per tab and renews it while visible.
Tests: `tests/unit/study/modes.test.ts`
Scope: src/data/study/**, tests/unit/study/modes.test.ts, CURRENT.md.
Not: UI, supabase/**, other `src/data/**` folders.

## N68 v6 planner sheet: preview and commit placements behind the shell flag
Stage: Build · Status: open · Needs: N67, N65, N60.2 · Assigned: —
Done = with `v6Shell` on, a Plan action on Today and Calendar opens a titled native dialog that previews placements for the selected tasks over the chosen days (from N67), lets the owner deselect or move items, and commits only the selected placements as study blocks with `taskId` and the day plan's `commit` (refused with an explanation when a task or block changed since the preview); unplaced work stays listed with its reason; one toast with Undo. Flag off: nothing changes.
Tests: `tests/unit/planner/sheet.test.tsx` (preview, deselect, stale-preview refusal, unplaced reasons, Undo)
Scope: src/features/planner/** (except model.ts), src/features/home/Page.tsx and src/features/calendar/Page.tsx (opening the sheet only), tests/unit/planner/sheet.test.tsx, CURRENT.md.
Not: other screens' folders, `src/data/**` except reading through existing APIs, new dependencies, existing tests' expectations.

## N69 v6 day ritual and closure behind the shell flag
Stage: Build · Status: open · Needs: N60.2, N58.2.3 · Assigned: —
Done = with `v6Shell` on, `/today/close` (lazy route) shows the dated plan, what was saved today, open parked thoughts to resolve (convert, dismiss), carry-over choices for unfinished tasks and tomorrow's first task, then closes the date through the day plan `close` operation; a closed date can be reopened; nothing marks future dates closed. Flag off: nothing changes.
Tests: `tests/unit/ritual/**`
Scope: src/features/ritual/** (new), src/app/App.tsx (registering the route only), tests/unit/ritual/**, CURRENT.md.
Not: other screens' folders, `src/data/**` except reading through existing APIs, new dependencies, existing tests' expectations.

## N72 v6 Focus modes and the persistent focus accessory behind the shell flag
Stage: Build · Status: open · Needs: N66, N71, N41.2.2.2.2.2 · Assigned: —
Done = with `v6Shell` on, starting focus picks a preset or mode (Pomodoro/Flowtime/open) with its captured configuration; Focus shows the current phase, cycle and the server phase deadline (browser ticking is only display), offers Next phase and the long-session guard; a compact accessory in the v6 shell (all routes, above the dock, not overlapping Inbox decisions) shows the running entry with pause/resume/open; taking the lease on another tab is explicit; I drifted can now exclude the minutes. Flag off: nothing changes.
Tests: `tests/unit/focus/modes.test.tsx`, `tests/e2e/v6-focus-modes.spec.ts` (accessory clears the dock and Inbox decision bar at 320×640)
Scope: src/features/focus/**, src/app/V6Shell.tsx (mounting the accessory only), src/app/FocusAccessory.tsx (new), tests/unit/focus/modes.test.tsx, tests/e2e/v6-focus-modes.spec.ts, CURRENT.md.
Not: other screens' folders, `src/data/**` except reading through existing APIs, new dependencies, existing tests' expectations.

## N76 v6 Progress: goals and range-correct statistics behind the shell flag
Stage: Build · Status: open · Needs: N59.2 · Assigned: —
Done = with `v6Shell` on, Progress shows weekly/monthly goals against saved minutes for their exact scope and range, 7/30/90-day ranges computed for that range (never a fixed 28-day series under another label), subject partitions that sum to the total, exact values on charts, and goal create/edit/archive. Flag off: nothing changes.
Tests: `tests/unit/progress-v6/goals.test.tsx`
Scope: src/features/progress-v6/**, tests/unit/progress-v6/goals.test.tsx, CURRENT.md.
Not: other screens' folders, `src/data/**` except reading through existing APIs, new dependencies, existing tests' expectations.

## N79 v6 Settings: planning, focus and review-budget preferences behind the shell flag
Stage: Build · Status: open · Needs: N39 · Assigned: —
Done = with `v6Shell` on, Settings gains Focus and Planning sections editing `focus_defaults`, `planning`, `review_budget`, `attention`, `week_start` and `clock_24h` with validated units, through the existing settings save path extended additively (unknown keys preserved); Calendar week start and time format follow them. Flag off: nothing changes.
Tests: `tests/unit/settings-v6/planning.test.tsx`
Scope: src/features/settings/v6/Planning.tsx and src/features/settings/v6/Focus.tsx (new), src/features/settings/v6/Page.tsx (section links only), src/data/types.ts and the settings patch in src/data/live/adapter.ts and src/data/demo/** (new fields only), tests/unit/settings-v6/planning.test.tsx, and (Owner, bug #1166) the week-start and time-format reads only in src/features/calendar/Page.tsx, src/features/calendar/views/WeekView.tsx and src/features/calendar/views/MonthView.tsx with a targeted test under tests/unit/settings-v6/, docs/current/N79.md.
Not: other screens (except the Calendar week-start and time-format reads above), other settings sections, supabase/**.

## N85 v6 plan review with proposal drafts behind the shell flag
Stage: Build · Status: open · Needs: N63.2 · Assigned: —
Done = with `v6Shell` on, `/proposals/:id` shows the plan or change preview with before/after targets, rationale and citations, and an Edit that saves a draft (N63), shows base/current/draft on conflict, and submits through the draft; approve/reject keep the existing atomic paths. Flag off: nothing changes.
Tests: `tests/unit/plan-proposal-v6/**`
Scope: src/features/plan-proposal/v6/** (new), src/features/plan-proposal/Page.tsx (the flag branch only), tests/unit/plan-proposal-v6/**, CURRENT.md.
Not: other screens' folders, `src/data/**` except reading through existing APIs, new dependencies, existing tests' expectations.

## N91 Evidence and review history correction
Stage: Build · Status: open · Needs: N38 · Assigned: —
Done = one additive migration: `session_events` gains `occurred_at` (read as `coalesce(occurred_at, created_at)`), `superseded_by`, `voided_at`, `correction_reason`, `actor`; `reviews` gains `scheduler_version`, `params_id` (FK to a new `review_parameter_sets` snapshot of the weights and settings used) and `operation_id`; new functions `correct_session_event`, `void_session_event` (re-derive checkpoint state from remaining evidence) and `correct_review`, `void_review` (rebuild the affected card's schedule from its remaining history with the recorded parameters, or a disclosed replacement state), all owner-checked, journaled and undoable, registered in `lemma_command_resources`.
Owner-authorized (D1, D8): deploys on merge, so this PR needs a review.
Tests: `tests/mcp/sql/history-correction.mjs` (each correction re-derives state, history and schedule agree, undo, second owner, existing grade and session tests unchanged)
Scope: supabase/migrations/<one new additive file>, tests/mcp/sql/history-correction.mjs, docs/v6/capability-registry/session_events.json, docs/v6/capability-registry/reviews.json, docs/v6/capability-registry/review_parameter_sets.json, CURRENT.md.
Not: app or MCP code, changing existing grade functions.

## N87 MCP: every settings field
Stage: Build · Status: open · Needs: N37, N39 · Assigned: —
Done = the settings edit path covers every column classified owner-editable in the capability registry (maximum interval, fuzz, load balancing, learn-ahead, FSRS weights set/restore with validation, macros, UI and notification preferences, and the N39 typed settings), merging JSON sections without losing unknown keys and checking `version` when given.
Owner-authorized (D1, D8): deploys the MCP function on merge, so this PR needs a review.
Tests: `tests/unit/mcp/settings-coverage.test.ts` enumerating the registry's settings fields
Scope: supabase/functions/mcp/**, tests/unit/mcp/settings-coverage.test.ts, CURRENT.md.
Not: migrations, app code.

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

## N94 Parity harness for every registered resource (G2, G4)
Stage: Build · Status: open · Needs: N37, N40 · Assigned: —
Done = `tests/mcp/sql/parity.mjs` iterates `lemma_command_resources` and, for each resource, creates through `mcp_command`, reads through the app's owner path, updates through the app path, reads through MCP, deletes/voids and restores, and checks the receipts and versions match; it fails, naming the resource, when an operation in the schema has no passing round trip, and when a registry entry or capability-registry column lacks a read or write path.
Tests: the harness itself, on main's resources, plus a fixture resource missing a path
Scope: tests/mcp/sql/parity.mjs, CURRENT.md.
Not: migrations, app or MCP code.

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

## N95 Export covers every v6 record
Stage: Build · Status: open · Needs: N36.2 · Assigned: —
Done = the account export includes every table in `lemma_undo_tables` (so later tables are included by registry), owner-scoped and paged past former row caps, with a manifest of tables, counts and schema version; a unit test fails if a registered table is missing from the export.
Tests: `tests/unit/export/v6-export.test.ts`, `tests/mcp/sql/export-registry.mjs`
Scope: one additive migration adding a read-only `security definer` owner export function (Owner, bug #1156): it lists the names in `lemma_undo_tables` and returns only the caller's own rows (`user_id = auth.uid()`) of one registered table per call in bounded keyset pages, rejects names not in the registry, is executable by `authenticated` only, and grants nothing on the registry itself; the export implementation in src/data/live/adapter.ts and src/data/api.ts (export only), tests/unit/export/v6-export.test.ts, tests/mcp/sql/export-registry.mjs, docs/current/N95.md.
Owner-authorized (D1): deploys on merge, so this PR needs a review.
Not: other adapter methods, UI.

## N104 Card reschedule and reset (write path and v6 buttons)
Stage: Build · Status: open · Needs: N84 · Assigned: —
Done = one additive migration adds `public.card_schedule_command(p)` with operations `reschedule` (set the card's next due date) and `reset` (back to new), owner-checked, with an exactly-once operation receipt, one journalled action that `undo_action` reverses, and a `lemma_command_resources` entry so `mcp_command` can run it; `LemmaApi` gains `rescheduleCard` and `resetCard` (demo and live), and the v6 card detail (N84) shows both actions. Flag off: nothing changes.
Owner-authorized (D1, D8): deploys on merge, so this PR needs a review.
Tests: `tests/mcp/sql/card-schedule-command.mjs` (owner separation, replay, undo, MCP parity) and `tests/unit/card-v6/**`
Scope: supabase/migrations/<one new additive file>, src/data/api.ts (two methods), the demo and live card adapters in src/data/**, src/features/card/v6/**, tests/mcp/sql/card-schedule-command.mjs, tests/unit/card-v6/**, docs/current/N104.md.
Not: review grading or FSRS changes, other screens.

## N105 Concept graph edits (write path and v6 Atlas actions)
Stage: Build · Status: open · Needs: N86 · Assigned: —
Done = one additive migration adds `public.concepts_command(p)` with operations create, update (name, blurb), reparent, link and unlink (prerequisite or related) and merge (moving links and card references to the kept concept, impact returned first by a preview), refusing cycles with a reason, owner-checked, with exactly-once receipts, one journalled undoable action each and a `lemma_command_resources` entry for `mcp_command`; `LemmaApi` gains the matching methods (demo and live), and the v6 Atlas list (N86) offers them. Flag off: nothing changes.
Owner-authorized (D1, D8): deploys on merge, so this PR needs a review.
Tests: `tests/mcp/sql/concepts-command.mjs` (cycles, merge impact, owner separation, replay, undo, MCP parity) and `tests/unit/atlas-v6/**`
Scope: supabase/migrations/<one new additive file>, src/data/api.ts (concept methods), the demo and live atlas adapters in src/data/**, src/features/atlas/v6/**, tests/mcp/sql/concepts-command.mjs, tests/unit/atlas-v6/**, docs/current/N105.md.
Not: concept placement layout, other screens.

## N106 Study entry linked to its calendar block
Stage: Build · Status: open · Needs: N70 · Assigned: —
Done = one additive migration adds a nullable owner-composite `calendar_block_id` on study entries (an entry may point only at one of the owner's own blocks); `StudyApi.startStudyEntry` accepts it (demo and live) and v6 Today's Start passes the block it starts. Existing entries and callers are unchanged. Flag off: nothing changes.
Owner-authorized (D1): deploys on merge, so this PR needs a review.
Tests: `tests/mcp/sql/study-entry-block-link.mjs` (owner separation, foreign block refused) and `tests/unit/home-v6/today-plan.test.tsx`
Scope: supabase/migrations/<one new additive file>, the study entry types and start method in src/data/** (demo and live), the Start call in src/features/home/** (v6 branch), tests/mcp/sql/study-entry-block-link.mjs, tests/unit/home-v6/today-plan.test.tsx, docs/current/N106.md.
Not: calendar editing, other screens.

## N97 Upgrade rehearsal on representative existing data (G5)
Stage: Build · Status: open · Needs: N53, N54, N91, N92, N93 · Assigned: —
Done = a PGlite test loads a representative pre-v6 account fixture (paths, sources, cards with history, sessions, proposals), applies all migrations, and checks no lost rows, links or schedules, historical estimates still labelled, new records creatable, and export/undo across old and new records.
Tests: `tests/mcp/sql/upgrade-rehearsal.mjs` and its fixture
Scope: tests/mcp/sql/upgrade-rehearsal.mjs, tests/mcp/sql/fixtures/pre-v6-account.sql (new), CURRENT.md.
Not: migrations, app code.

## N103 Account deletion
Stage: Build · Status: open · Needs: N95 · Assigned: —
Done = Settings offers Delete account after an export prompt and a typed confirmation; a service-role edge function (or SQL function) deletes every owner row in dependency order, storage objects and the auth user, and is refused for any other user; MCP cannot call it.
Owner-authorized (D1, D8): deploys on merge, so this PR needs a review.
Tests: `tests/mcp/sql/account-delete.mjs` (all owner rows gone, another owner untouched), `tests/unit/settings-v6/delete-account.test.tsx`
Scope: supabase/migrations/<one new additive file>, supabase/functions/account-delete/** (new), src/features/settings/v6/DeleteAccount.tsx (new), src/features/settings/v6/Page.tsx (section link only), tests/mcp/sql/account-delete.mjs, tests/unit/settings-v6/delete-account.test.tsx, CURRENT.md.
Not: other functions, MCP code.

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
