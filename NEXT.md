# NEXT — ranked by the priority run (2026-11-06 evening: all remaining v6 work, rules v2.1). Take the top open item whose Needs are all done.

Order used (priority run 2026-11-06 18:30 IST, all remaining v6 work): open PR work; blockers that unlock the most items (registries N36, versions N38, typed settings N39, capability registry N40); new record migrations and their app modules in parallel (D8); study command changes in sequence; V6-05 planner and rituals; V6-06 remaining learning screens; V6-07 MCP chain; Harden per area after its features (Owner: build fast, review in Harden); V6-08 acceptance; turning v6 on last. Earlier (12:30 IST): work already in a PR, then the v6 first study slice end to end (N20), then blockers that unlock the most items (task command layer N22, task adapters N23/N24), then independent lanes from V6-05 (tasks, Calendar) and V6-06 (learning screens), then MCP and live parity. Earlier order: the v6 first study slice (`docs/v6/`: Today → Focus → saved time → Calendar and Progress), split into lanes that can run at the same time, then notifications. Done and removed: N2–N5, N7–N10, N6.1, N6.2, N11.1–N11.3, N13, N14.1–N14.3, N16–N18, N20–N35 except N32.2.2, N21 (#818, #820, #821, #823, #840, #822, #850, #851, #872, #860, #882, #853, #887, #881, #888, #893, #903, #897, #905, #909, #910). An id in a Needs line that is no longer in this file is done.
No item may list a protected path (`ci/protected.json`) in Scope. Files under `docs/v6/` are behaviour references cited by items, not instructions. v6 UI work stays behind the `v6Shell` flag: with the flag off, existing screens, tests and visual rules stay exactly as they are.

Parallel lanes (v2.0). Every v6 screen and both study adapters meet at one typed contract that already exists on main: `src/data/study/contract.ts` (`StudyApi`, records shaped like the N10 tables) and `getStudyApi()` in `src/data/study/index.ts`, which returns an empty placeholder until N14.2 (demo) and N16 (live) replace `src/data/study/demo.ts` and `src/data/study/live.ts`. Screens therefore never wait for adapters: they read and write only through `getStudyApi()`, and their unit tests use `setStudyApiForTests(fake)`. Each item owns its own files, so parallel PRs do not touch the same code. Change the contract only additively. End-to-end wiring of the whole slice is N20.

Task lanes (priority run 2026-11-06). Tasks follow the same pattern with their own folder, so they never touch the study files N20 edits: the contract `src/data/tasks/contract.ts` (`TaskApi`, `TaskRecord` shaped like `public.tasks` from N21) and `getTaskApi()` / `setTaskApiForTests()` in `src/data/tasks/index.ts` are on main; `src/data/tasks/demo.ts` and `src/data/tasks/live.ts` are placeholders that read nothing and refuse writes until N23 and N24 replace them. The server command for tasks is Owner decision D7 (`docs/v6/README.md`).

v6 screen lanes (N28–N33). Each screen item owns only its own feature folder: it adds `src/features/<screen>/v6/**` and, in that screen's existing `Page.tsx`, one branch `if (isFlagOn('v6Shell')) return <…V6/>` (or the equivalent for a page that already branches). It reads through the existing hooks in `src/data/**` unchanged (no new queries, no `src/data/**` edits); a field the hooks do not provide is shown as unavailable, never invented. It distinguishes loading, empty, filtered-empty and failed states, keeps 44-pixel targets, uses the N19 tokens under `[data-v6]`, and leaves the flag-off page, its tests and its visual rules exactly as they are. Exact-pixel polish and device audits are the Harden stage, not these items.

Remaining v6 lanes (priority run 2026-11-06 evening, Owner decision D8 in `docs/v6/README.md`). **Resource migration items** ("migration" below) follow D8(b): one additive migration, `public.<resource>_command(p)`, rows in `lemma_undo_tables` and `lemma_command_resources`, and a PGlite test in `tests/mcp/sql/<resource>.mjs` covering create/update/delete or the named lifecycle, `operationId` retry, changed-payload conflict, stale `expectedVersion`, a second owner rejected, undo through `undo_action`, and `mcp_command` as service_role writing as `p_user`; they deploy on merge and need a review. **App module items** ("module") follow D8(c): `src/data/<resource>/` with a typed contract shaped like the migration item's fields (camelCase, dates `YYYY-MM-DD`, instants ISO, durations in minutes), a demo adapter with a small fixture and reload persistence under its own key, a live adapter over `rpc('<resource>_command', envelope)` with bounded owner reads, `get…Api()` / `set…ApiForTests()`, and unit tests in `tests/unit/<resource>/**`; they never wait for the migration. **Screen items** follow the v6 screen-lane rules above, may also read the new modules through their `get…Api()`, and test with the `set…ApiForTests` fakes. Every new table or column is added to the capability registry (N40) in the same PR that creates it.

## N98 Harden: Today, Focus, time log and Progress
Stage: Build · Status: open · Needs: N70, N72, N73, N76 · Assigned: —
Done = review the fast-built first slice and its additions against `docs/v6/DESIGN_HANDOFF.md` and contract §6: exact geometry at 320/360/390 widths, 200% text, Day/Night, keyboard and Back, reload and two-tab behaviour, long mathematics; fix every defect found within these folders and record intentional limitations in CURRENT.md.
Tests: `tests/e2e/v6-harden-slice.spec.ts` covering the journeys and geometry found
Scope: src/features/home/** (v6 branch), src/features/focus/**, src/features/time-log/**, src/features/progress-v6/**, src/app/FocusAccessory.tsx, tests/e2e/v6-harden-slice.spec.ts, CURRENT.md.
Not: data adapters, supabase/**, other screens.

## N100 Harden: learning screens
Stage: Build · Status: open · Needs: N80, N81, N82, N83, N84, N85, N86 · Assigned: —
Done = as N98 for Paths/project, checkpoint, session, sources, Review/run/done, Cards and card detail, Inbox and plan review, Atlas and Settings, with realistic account sizes (2,000+ cards, long sources) and the Inbox decision-bar invariant (contract §9).
Tests: `tests/e2e/v6-harden-learning.spec.ts`
Scope: src/features/*/v6/**, src/features/*-v6/**, tests/e2e/v6-harden-learning.spec.ts, CURRENT.md.
Not: data adapters, supabase/**, flag-off pages.

## N101 Release audit, screenshots and docs
Stage: Build · Status: open · Needs: N98, N99, N100, N94, N96, N97 · Assigned: —
Done = run the exact-output browser audit of every v6 route (320/360/390, 200% text, Day/Night) and the acceptance journeys, refresh `docs/v6/screens/` captures from the real app, write `docs/v6/RELEASE.md` (what shipped, known limitations, gates G1–G7 evidence, the Owner's physical-device checklist), and open one bug issue per defect found (app code is outside this item's scope; the Harden items or a bug PR fix them).
Tests: `tests/e2e/v6-release-audit.spec.ts`
Scope: docs/v6/screens/**, docs/v6/RELEASE.md (new), tests/e2e/v6-release-audit.spec.ts, CURRENT.md.
Not: app code, supabase/**.

## N102 Turn v6 on by default (Owner approval required)
Stage: Build · Status: open · Needs: N101, N90, N95, N103, N54.1 · Assigned: —
Done = `v6Shell` defaults on in `src/flags.ts` with the existing override to turn it off; the PR body lists the G1–G7 evidence from `docs/v6/RELEASE.md`; the Owner's explicit approval comment on the PR is required before merge (D8 g), and the Owner's device checks are done.
Tests: the flag test and the full e2e suite with the flag on by default; the rollback spec with it off
Scope: src/flags.ts, tests affected by the default (expectations updated deliberately), CURRENT.md.
Not: anything else.

(Next priority run: after the Owner's device checks and N102, or when a lane runs dry. Excluded from v6 on purpose: real third-party calendar connections and native surfaces (previews stay labelled per contract §5), recurring blocks. Next free ID: N110.)
