# NEXT — ranked by the priority run (2026-11-05). Take the top open item whose Needs are all done.

Order used: S0/S1 work, confirmed bugs in Stable features, the item already in progress (N5), then the Owner's v6 direction (`docs/v6/`, first durable study slice: Today → Focus → saved time), then the remaining notifications item. Done and removed: N2, N3, N4, N7, N8 (#818, #820, #821, #823, #840), N5 (#822), N9 (#850), N6.1 (#872). N10 (#851) is done. An id in a Needs line that is no longer in this file is done.
No item may list a protected path (`ci/protected.json`) in Scope. Files under `docs/v6/` are behaviour references cited by items, not instructions. v6 UI work stays behind the `v6Shell` flag: with the flag off, existing screens, tests and visual rules stay exactly as they are.

(1) `loggedMinutes(entries, range, zone, now)`: union of saved focus/manual intervals as half-open `[start, end)`, clipped to `now`, excluding drafts, discarded entries, breaks and duplicate entry ids; future portions are returned as a separate `futureMinutes` flag value, not counted;
(2) `inProgressMinutes(active, now)`: unsaved running time, breaks excluded, a Pomodoro phase never exceeding its configured focus length;
(3) `capacityStack(logged, busy, planned, day)`: partition of the occupied union with logged first, then busy, then planned, never double counting;
(4) `subjectPartition(entries, range, zone)`: logged time per subject id plus `unassigned`, overlaps assigned once in record order, parts summing exactly to `loggedMinutes`;
(5) `dayBounds(date, zone)`: civil midnight-to-midnight instants for an IANA zone (23- and 25-hour days allowed).
Unit tests in `tests/unit/effort/` (at least 25 assertions) with fixtures for: overlapping and duplicate intervals; breaks; future clipping; an interval split at midnight in `Asia/Kolkata`; the `Europe/London` days 2026-03-29 (23 h) and 2026-10-25 (25 h); a Pomodoro left open for 3 h counting only its focus length; subject parts summing to the total.
References: `docs/v6/DESIGN_HANDOFF.md` "Metric definitions", `docs/v6/Lemma_UI_v6_Direction_Plan.md` §6, `docs/v6/prototype/effort-metrics.js` (behaviour only).
Scope: src/lib/effort/**, tests/unit/effort/**, CURRENT.md.
Not: UI, `src/data/**`, `supabase/**`, new dependencies (use `Intl`), FSRS study-day rollover (civil days only here).

## N10 v6 study tables: one additive migration with RLS
Stage: Build · Status: done (#851; kept only until the N11 split merges, then removed) · Needs: — · Assigned: —
Done = one new migration `supabase/migrations/<timestamp>_v6_study.sql`, additive only (creates objects; does not alter or drop existing ones), defining:
- `study_entries` (id, user_id, optional subject_id/project_id/checkpoint_id/session_id, intent, source `timer|manual`, status `running|paused|draft|saved|discarded`, reflection, rating, version, created_at, updated_at, saved_at);
- `study_intervals` (id, entry_id, user_id, kind `focus|break`, started_at, ended_at nullable, check ended_at > started_at);
- `calendar_blocks` (id, user_id, kind `study|busy`, title, starts_at, ends_at, time_zone, status `planned|done|cancelled`, version, optional task/learning links);
- `command_receipts` (user_id, operation_id unique per user, resource, result jsonb, created_at).
RLS on all four with owner policies in the style of existing tables. Every optional link must belong to the same owner (enforce with constraint or trigger). A partial unique index allows at most one `running|paused` entry per owner. Indexes on (user_id, started_at) and (user_id, starts_at).
Test `tests/mcp/sql/study-schema.mjs` (PGlite, same pattern as `tests/mcp/db5.mjs`, applying all migrations): owner CRUD works; a second owner can neither read the rows nor link to the first owner's subject; a second active entry is rejected; an interval ending before it starts is rejected. Every `tests/mcp/sql/*.mjs` runs in the PR gate's `sql` job (CI v1.5). `src/data/live/database.types.ts` gains the four tables. CURRENT.md data model is updated.
Owner-authorized 2026-11-05 (decision D1): merging deploys this migration to production (the tables stay unused while `v6Shell` is off). It must pass the additive-only migration guard, and the reviewer confirms that.
Scope: supabase/migrations/<the new file only>, tests/mcp/sql/**, src/data/live/database.types.ts, CURRENT.md.
Not: any change to existing tables, functions or policies; app code; MCP code; edge functions; importing tutor-session minutes as focus time.

## N11.3 v6 reversible study commands and existing undo support
Stage: Build · Status: open · Needs: — · Assigned: —
Done = complete N11 by recording `actions` and `action_changes` for study update/delete/save and returning a real `actionNo` for every reversible write. `public.undo_action` restores a deleted calendar block and reverts saved or updated study records without cross-owner writes. Add PGlite regression tests covering undo of deleted blocks, conflict after newer edits, restored study data, exact receipt replay and owner isolation. Per Owner decision D5 (`docs/v6/README.md`): compatible `undo_action` replacement limited to adding the three study tables. Preserve the public command envelope and N11.1/N11.2 semantics.
Scope: supabase/migrations/<one new additive file>, tests/mcp/sql/**, CURRENT.md, src/data/live/database.types.ts (signature only if needed).
Not: changing existing migration files, existing functions without Owner authorization, client UI, MCP, disabling RLS, deleting or weakening tests, or new dependencies.

## N12 MCP: study records through the same command
Stage: Build · Status: open · Needs: N11.3 · Assigned: —
Done = the connector reads study records through existing `get`/`search` (resources `study_entries`, `calendar_blocks`; bounded pages with a cursor; totals reported separately from the page) and gains ONE new tool `study` that forwards a command envelope to `public.study_command` and returns its receipt. The owner comes from the authenticated connection, never from arguments. Existing tools and the `resume` packet are unchanged. `tools/list` stays under 15,000 characters (`tests/mcp/sweep-budget.test.mjs`).
Tests: unit tests in `tests/unit/mcp/` (argument validation, owner not taken from arguments, receipt passed through unchanged) and `tests/mcp/sql/study-mcp.mjs`, where an entry created through the `study` tool is read back by `get` with the same version, and an app-side `study_command` change is seen by the next `get`.
Owner-authorized 2026-11-05 (D1): merging deploys the MCP function to production. The reviewer confirms that no existing tool's input or output changed. Per D3, the `study` tool acts on explicit instructions in chat only for changes that can be undone (every write returns an `actionNo` for `undo`).
Scope: supabase/functions/mcp/**, tests/unit/mcp/**, tests/mcp/sql/**, CURRENT.md (MCP tools list).
Not: changes to existing tool behaviour, the `resume` packet, the `notify` function, migrations.

## N13 v6 shell behind a flag: five destinations, shared header, accessory slot
Stage: Build · Status: open · Needs: — · Assigned: —
Done = flag `v6Shell` (default false) in `src/flags.ts`. With it on:
- the tab bar has five destinations: Today `/`, Paths `/projects`, Review `/review`, Calendar `/calendar` (new route; placeholder page titled "Calendar" with the empty state "Your planned and logged study will appear here."), and Progress `/insights` (label change only; route unchanged);
- the tabs show on every route except `/sign-in`, including detail routes and `/proposals`;
- a shared page header has a title row and an action row with Inbox (pending-count badge), Add and Menu, matching `docs/v6/screens/*-day.png`;
- an empty "focus accessory" slot sits above the tabs and renders nothing until N14;
- on `/proposals`, the Reject / Edit / Approve bar sits above accessory and tabs, and the last content scrolls clear of the whole stack (`docs/v6/INBOX_FIX_REPORT.md`).

With the flag off, nothing changes.
Tests: a unit test of the tab set in both flag states, and `tests/e2e/v6-shell.spec.ts` (`?demo=stress&flags=v6Shell`) at 320×640, 390×844 and 844×390. It checks that the five tabs are reachable on Today, Review, Inbox and a card detail, with no horizontal overflow and tap targets of at least 44 px. It also checks that the Inbox decision bar's box does not overlap the tab bar, and that Today has under 1,500 DOM nodes.
Scope: src/app/** (including `src/app/TabBar.tsx`), src/ui/** (new components), src/features/calendar/** (new), src/features/proposals/** (decision-bar placement only), src/flags.ts, tests/unit/app/**, tests/unit/flags.test.ts, tests/e2e/v6-shell.spec.ts, CURRENT.md.
Not: colours, fonts or theme tokens (a later item); timer logic; data or API changes; edits to existing e2e specs or visual tests; removing the current four-tab shell.

## N14 v6 Focus on demo data: state machine, Today hero, Focus dialog
Stage: Build · Status: open · Needs: N13 · Assigned: —
Done = a typed state machine `src/lib/focus/machine.ts` with these transitions:
- idle → running;
- running ⇄ paused;
- running ⇄ break;
- running or paused → finishing → saved or discarded.

Elapsed time is rebuilt from timestamps, never from tick counts, and the Pomodoro cap comes from N9. The demo adapter stores study entries in memory, with shapes matching N10's columns and no live wiring. Study types are added to `src/data/types.ts` and `src/data/api.ts` (additions only).
With `v6Shell` on:
- Today shows the current-action hero (Start / Return to focus) and "logged today" from N9's `loggedMinutes`;
- the accessory shows the intent, the remaining time and Pause;
- the Focus native dialog offers Pause, Take a break and Park a thought (text field), and Finish leads to editable minutes and an optional note, then Save or Discard (`docs/v6/screens/focus-day.png`, `today-day.png`).

Tests: unit tests for every transition, rebuilding state after a reload, a double save giving one saved entry, a discard giving 0 logged minutes, and break exclusion. Also `tests/e2e/v6-focus.spec.ts` (`?demo=1&flags=v6Shell`): start → pause → resume → finish → save, after which Today's logged time rises by the saved minutes; Escape closes the dialog and focus returns to the trigger.
Scope: src/lib/focus/**, src/features/home/** (the v6 branch only), src/features/focus/** (new), src/ui/** (new components), src/data/demo/** (study entries only), src/data/api.ts and src/data/types.ts (additions only), tests/unit/focus/**, tests/e2e/v6-focus.spec.ts, CURRENT.md.
Not: the live adapter (next priority run), Calendar or Progress views, converting parked thoughts to tasks, notifications, and Today with the flag off.

## N6.2 Notifications: bounded reminder Review queue (after N6.1)
Stage: Build · Status: open · Needs: — · Assigned: —
Done = with `notificationsPush` enabled, a due-card reminder link parsed by N6.1 starts one Review round of 1–50 owner-visible due cards selected through the existing `notification_review_items` RPC; the page consumes the link using replace navigation, shows bounded empty/error states, and does not change the saved ordinary daily quota. With the flag off, the ordinary Review route behaves unchanged. Tests verify one bounded RPC read, owner-session filtering, count bounds, and ordinary versus reminder selection.
Scope: src/features/review/**, src/features/review-run/**, src/data/notify.ts, tests/unit/notify/**, tests/unit/review/**, CURRENT.md.
Not: supabase/**, `.github/**`, new dependencies, changing the ordinary `review_items` RPC or stored review quotas.

## N6.3 Notifications: Review completion reminder-time offer (after N6.2)
Stage: Build · Status: open · Needs: N6.2 · Assigned: —
Done = after a reminder-driven Review queue is finished, the Review-done screen offers the next reminder time from current notification settings rather than an invented schedule; the offer is absent for ordinary Review and when `notificationsPush` is off. Tests cover eligible reminder completion, ordinary round, missing/unavailable scheduling data, and correct finishing navigation.
Scope: src/features/review-done/**, src/features/review-run/**, src/data/notify.ts, tests/unit/notify/**, tests/unit/review/**, CURRENT.md.
Not: supabase/**, `.github/**`, new dependencies, mutation of persisted reminder settings.


(Next priority run: live adapter for study entries, v6 visual tokens and fonts, Calendar Agenda/Day, Progress effort selector, tasks. Next free ID: N15.)
