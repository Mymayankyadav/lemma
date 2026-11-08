# NEXT — ranked by the priority run (2026-11-06 evening: all remaining v6 work, rules v2.1). Take the top open item whose Needs are all done.

Order used (priority run 2026-11-06 18:30 IST, all remaining v6 work): open PR work; blockers that unlock the most items (registries N36, versions N38, typed settings N39, capability registry N40); new record migrations and their app modules in parallel (D8); study command changes in sequence; V6-05 planner and rituals; V6-06 remaining learning screens; V6-07 MCP chain; Harden per area after its features (Owner: build fast, review in Harden); V6-08 acceptance; turning v6 on last. Earlier (12:30 IST): work already in a PR, then the v6 first study slice end to end (N20), then blockers that unlock the most items (task command layer N22, task adapters N23/N24), then independent lanes from V6-05 (tasks, Calendar) and V6-06 (learning screens), then MCP and live parity. Earlier order: the v6 first study slice (`docs/v6/`: Today → Focus → saved time → Calendar and Progress), split into lanes that can run at the same time, then notifications. Done and removed: N2–N5, N7–N10, N6.1, N6.2, N11.1–N11.3, N13, N14.1–N14.3, N16–N18, N20–N35 except N32.2.2, N21 (#818, #820, #821, #823, #840, #822, #850, #851, #872, #860, #882, #853, #887, #881, #888, #893, #903, #897, #905, #909, #910). An id in a Needs line that is no longer in this file is done.
No item may list a protected path (`ci/protected.json`) in Scope. Files under `docs/v6/` are behaviour references cited by items, not instructions. v6 UI work stays behind the `v6Shell` flag: with the flag off, existing screens, tests and visual rules stay exactly as they are.

Parallel lanes (v2.0). Every v6 screen and both study adapters meet at one typed contract that already exists on main: `src/data/study/contract.ts` (`StudyApi`, records shaped like the N10 tables) and `getStudyApi()` in `src/data/study/index.ts`, which returns an empty placeholder until N14.2 (demo) and N16 (live) replace `src/data/study/demo.ts` and `src/data/study/live.ts`. Screens therefore never wait for adapters: they read and write only through `getStudyApi()`, and their unit tests use `setStudyApiForTests(fake)`. Each item owns its own files, so parallel PRs do not touch the same code. Change the contract only additively. End-to-end wiring of the whole slice is N20.

Task lanes (priority run 2026-11-06). Tasks follow the same pattern with their own folder, so they never touch the study files N20 edits: the contract `src/data/tasks/contract.ts` (`TaskApi`, `TaskRecord` shaped like `public.tasks` from N21) and `getTaskApi()` / `setTaskApiForTests()` in `src/data/tasks/index.ts` are on main; `src/data/tasks/demo.ts` and `src/data/tasks/live.ts` are placeholders that read nothing and refuse writes until N23 and N24 replace them. The server command for tasks is Owner decision D7 (`docs/v6/README.md`).

v6 screen lanes (N28–N33). Each screen item owns only its own feature folder: it adds `src/features/<screen>/v6/**` and, in that screen's existing `Page.tsx`, one branch `if (isFlagOn('v6Shell')) return <…V6/>` (or the equivalent for a page that already branches). It reads through the existing hooks in `src/data/**` unchanged (no new queries, no `src/data/**` edits); a field the hooks do not provide is shown as unavailable, never invented. It distinguishes loading, empty, filtered-empty and failed states, keeps 44-pixel targets, uses the N19 tokens under `[data-v6]`, and leaves the flag-off page, its tests and its visual rules exactly as they are. Exact-pixel polish and device audits are the Harden stage, not these items.

Remaining v6 lanes (priority run 2026-11-06 evening, Owner decision D8 in `docs/v6/README.md`). **Resource migration items** ("migration" below) follow D8(b): one additive migration, `public.<resource>_command(p)`, rows in `lemma_undo_tables` and `lemma_command_resources`, and a PGlite test in `tests/mcp/sql/<resource>.mjs` covering create/update/delete or the named lifecycle, `operationId` retry, changed-payload conflict, stale `expectedVersion`, a second owner rejected, undo through `undo_action`, and `mcp_command` as service_role writing as `p_user`; they deploy on merge and need a review. **App module items** ("module") follow D8(c): `src/data/<resource>/` with a typed contract shaped like the migration item's fields (camelCase, dates `YYYY-MM-DD`, instants ISO, durations in minutes), a demo adapter with a small fixture and reload persistence under its own key, a live adapter over `rpc('<resource>_command', envelope)` with bounded owner reads, `get…Api()` / `set…ApiForTests()`, and unit tests in `tests/unit/<resource>/**`; they never wait for the migration. **Screen items** follow the v6 screen-lane rules above, may also read the new modules through their `get…Api()`, and test with the `set…ApiForTests` fakes. Every new table or column is added to the capability registry (N40) in the same PR that creates it.


Mockup port lane (Owner, 2026-11-08, #1303). The v6 app must look like the mockup captures in `docs/v6/screens/`. **Copy, don't redesign**: `docs/v6/prototype/source/MAP.md` names, for each screen, the mockup module that holds its exact markup and class strings and the repo folder to port it into; the CSS is `docs/v6/prototype/source/mockup-overrides.css`. Keep the repo's hooks, commands and behaviour, and wire mockup values to them; a value the hooks lack shows as unavailable. Everything stays behind `v6Shell`, and flag-off screens are unchanged. Every port PR refreshes its screen's Day and Night PNGs in `docs/v6/release-captures/` (capture command in MAP.md, or from CI), which requires an independent review: the reviewer compares each PNG with the same-named mockup and requests changes for any visible difference in layout, components, colour or type (demo data may differ). Do N110 first; N111–N117 then run in parallel.

## N111 Mockup port: Today and Focus
Stage: Build · Status: open · Needs: N110 · Assigned: —
Done = Today and the Focus screen match `today-*.png` and `focus-day.png`, ported from `53__index` per MAP.md (Today: current study action hero with Return to focus, logged-time row, "Also in your notebook"; Focus: full screen with large clock, cycle progress, Pause / Take a break, Finish & log). Existing Today and Focus behaviour and tests keep passing.
Tests: updated unit tests under tests/unit/home/** and tests/unit/focus/**; release audit passes.
Scope: src/features/home/**, src/features/focus/**, src/ui/v6/focus/**, docs/v6/release-captures/today-*.png, docs/v6/release-captures/focus-day.png, those tests, docs/current/N111.md.
Not: shell (N110), src/data/**.

## N112 Mockup port: Review
Stage: Build · Status: open · Needs: N110 · Assigned: —
Done = Review, its round and its done screen match `review-*.png` and the mockup, ported from `12__Page`, `15__Page`, `16__Page` and `28__ReviewOutlook` per MAP.md (hero "N cards for today · about N min · Start review", Today's batch, collapsed Decks & options). Review undo stays bug #1299.
Tests: updated tests under tests/unit/review*/**; release audit passes.
Scope: src/features/review/**, src/features/review-run/**, src/features/review-done/**, docs/v6/release-captures/review-*.png, those tests, docs/current/N112.md.
Not: shell, src/data/**.

## N113 Mockup port: Inbox and proposal
Stage: Build · Status: open · Needs: N110 · Assigned: —
Done = Inbox and proposal detail match `inbox-*.png` and the mockup, ported from `23__Page` and `13__Page` per MAP.md (Cards / Plans tabs, one proposal at a time with "1 of N", Reject / Edit / Approve, Browse queue). Batch decisions and Undo keep working.
Tests: updated tests under tests/unit/proposals/** and tests/unit/plan-proposal/**; release audit passes.
Scope: src/features/proposals/**, src/features/plan-proposal/**, docs/v6/release-captures/inbox-*.png, those tests, docs/current/N113.md.
Not: shell, src/data/**.

## N114 Mockup port: Paths, path, checkpoint, session
Stage: Build · Status: open · Needs: N110 · Assigned: —
Done = Paths matches `paths-*.png` (search, Concept map link, Active / Paused / Done tabs, subject groups with progress rails) and path, checkpoint, session and new-path screens match the mockup, ported from `53__index`, `19__Page`, `20__Page`, `11__Page` and `14__Page` per MAP.md.
Tests: updated tests under the matching tests/unit/** folders; release audit passes.
Scope: src/features/projects/**, src/features/project/**, src/features/checkpoint/**, src/features/session/**, src/features/new-project/**, docs/v6/release-captures/paths-*.png, those tests, docs/current/N114.md.
Not: shell, src/data/**.

## N115 Mockup port: Progress
Stage: Build · Status: open · Needs: N110 · Assigned: —
Done = Progress matches `progress-*.png` (time-range select, Overview / Learning / Time tabs, stat tiles), ported from `22__Page` and `55__insights` per MAP.md; saved-time figures keep using the existing selectors.
Tests: updated tests under tests/unit/insights/** and tests/unit/progress-v6/**; release audit passes.
Scope: src/features/insights/**, src/features/progress-v6/**, docs/v6/release-captures/progress-*.png, those tests, docs/current/N115.md.
Not: shell, src/data/**.

## N116 Mockup port: Calendar
Stage: Build · Status: open · Needs: N110 · Assigned: —
Done = Calendar matches `calendar-*.png` (date navigation, Agenda / Day / Week / Month, Planning tools, due-today and overlap chips, timed blocks), ported from `owners/lemma-native-calendar-runtime.js` and `styles/calendar.css` per MAP.md; planner behaviour unchanged.
Tests: updated tests under tests/unit/calendar/**; release audit passes.
Scope: src/features/calendar/**, src/app/calendarRoute.tsx, docs/v6/release-captures/calendar-*.png, those tests, docs/current/N116.md.
Not: shell, src/features/planner/** logic, src/data/**.

## N117 Mockup port: Cards, Atlas, Settings
Stage: Build · Status: open · Needs: N110 · Assigned: —
Done = Cards and card detail, Atlas and Settings match `cards-*.png`, `atlas-*.png` and `settings-*.png`, ported from `18__Page`, `21__Page`, `53__index` (Atlas) and `10__Page` per MAP.md (Settings: four grouped rows opening section pages). Fixes #1302.
Tests: updated tests under the matching tests/unit/** folders; release audit passes.
Scope: src/features/cards/**, src/features/card/**, src/features/atlas/**, src/features/settings/**, docs/v6/release-captures/cards-*.png, docs/v6/release-captures/atlas-*.png, docs/v6/release-captures/settings-*.png, those tests, docs/current/N117.md.
Not: shell, src/data/**.

## N118 Mockup fidelity audit
Stage: Harden · Status: open · Needs: N110, N111, N112, N113, N114, N115, N116, N117 · Assigned: —
Done = all 19 release captures refreshed from one CI run and compared with `docs/v6/screens/`; one bug issue per visible difference; `docs/v6/RELEASE.md` G7 updated (passes only with no open design bug); #1303 closed when none remain.
Tests: `tests/e2e/v6-release-audit.spec.ts`
Scope: docs/v6/RELEASE.md, docs/v6/release-captures/**, docs/current/N118.md.
Not: app code (file bugs instead).

## N102 Turn v6 on by default (Owner approval required)
Stage: Build · Status: open · Needs: N101, N90, N95, N103, N54.1, N118 · Assigned: —
Done = `v6Shell` defaults on in `src/flags.ts` with the existing override to turn it off; the PR body lists the G1–G7 evidence from `docs/v6/RELEASE.md`; the Owner's explicit approval comment on the PR is required before merge (D8 g), and the Owner's device checks are done.
Tests: the flag test and the full e2e suite with the flag on by default; the rollback spec with it off
Scope: src/flags.ts, tests affected by the default (expectations updated deliberately), CURRENT.md.
Not: anything else.

(Next priority run: after the Owner's device checks and N102, or when a lane runs dry. Excluded from v6 on purpose: real third-party calendar connections and native surfaces (previews stay labelled per contract §5), recurring blocks. Next free ID: N119.)
