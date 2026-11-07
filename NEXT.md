# NEXT — ranked by the priority run (2026-11-06 evening: all remaining v6 work, rules v2.1). Take the top open item whose Needs are all done.

Order used (priority run 2026-11-06 18:30 IST, all remaining v6 work): open PR work; blockers that unlock the most items (registries N36, versions N38, typed settings N39, capability registry N40); new record migrations and their app modules in parallel (D8); study command changes in sequence; V6-05 planner and rituals; V6-06 remaining learning screens; V6-07 MCP chain; Harden per area after its features (Owner: build fast, review in Harden); V6-08 acceptance; turning v6 on last. Earlier (12:30 IST): work already in a PR, then the v6 first study slice end to end (N20), then blockers that unlock the most items (task command layer N22, task adapters N23/N24), then independent lanes from V6-05 (tasks, Calendar) and V6-06 (learning screens), then MCP and live parity. Earlier order: the v6 first study slice (`docs/v6/`: Today → Focus → saved time → Calendar and Progress), split into lanes that can run at the same time, then notifications. Done and removed: N2–N5, N7–N10, N6.1, N6.2, N11.1–N11.3, N13, N14.1–N14.3, N16–N18, N20–N35 except N32.2.2, N21 (#818, #820, #821, #823, #840, #822, #850, #851, #872, #860, #882, #853, #887, #881, #888, #893, #903, #897, #905, #909, #910). An id in a Needs line that is no longer in this file is done.
No item may list a protected path (`ci/protected.json`) in Scope. Files under `docs/v6/` are behaviour references cited by items, not instructions. v6 UI work stays behind the `v6Shell` flag: with the flag off, existing screens, tests and visual rules stay exactly as they are.

Parallel lanes (v2.0). Every v6 screen and both study adapters meet at one typed contract that already exists on main: `src/data/study/contract.ts` (`StudyApi`, records shaped like the N10 tables) and `getStudyApi()` in `src/data/study/index.ts`, which returns an empty placeholder until N14.2 (demo) and N16 (live) replace `src/data/study/demo.ts` and `src/data/study/live.ts`. Screens therefore never wait for adapters: they read and write only through `getStudyApi()`, and their unit tests use `setStudyApiForTests(fake)`. Each item owns its own files, so parallel PRs do not touch the same code. Change the contract only additively. End-to-end wiring of the whole slice is N20.

Task lanes (priority run 2026-11-06). Tasks follow the same pattern with their own folder, so they never touch the study files N20 edits: the contract `src/data/tasks/contract.ts` (`TaskApi`, `TaskRecord` shaped like `public.tasks` from N21) and `getTaskApi()` / `setTaskApiForTests()` in `src/data/tasks/index.ts` are on main; `src/data/tasks/demo.ts` and `src/data/tasks/live.ts` are placeholders that read nothing and refuse writes until N23 and N24 replace them. The server command for tasks is Owner decision D7 (`docs/v6/README.md`).

v6 screen lanes (N28–N33). Each screen item owns only its own feature folder: it adds `src/features/<screen>/v6/**` and, in that screen's existing `Page.tsx`, one branch `if (isFlagOn('v6Shell')) return <…V6/>` (or the equivalent for a page that already branches). It reads through the existing hooks in `src/data/**` unchanged (no new queries, no `src/data/**` edits); a field the hooks do not provide is shown as unavailable, never invented. It distinguishes loading, empty, filtered-empty and failed states, keeps 44-pixel targets, uses the N19 tokens under `[data-v6]`, and leaves the flag-off page, its tests and its visual rules exactly as they are. Exact-pixel polish and device audits are the Harden stage, not these items.

Remaining v6 lanes (priority run 2026-11-06 evening, Owner decision D8 in `docs/v6/README.md`). **Resource migration items** ("migration" below) follow D8(b): one additive migration, `public.<resource>_command(p)`, rows in `lemma_undo_tables` and `lemma_command_resources`, and a PGlite test in `tests/mcp/sql/<resource>.mjs` covering create/update/delete or the named lifecycle, `operationId` retry, changed-payload conflict, stale `expectedVersion`, a second owner rejected, undo through `undo_action`, and `mcp_command` as service_role writing as `p_user`; they deploy on merge and need a review. **App module items** ("module") follow D8(c): `src/data/<resource>/` with a typed contract shaped like the migration item's fields (camelCase, dates `YYYY-MM-DD`, instants ISO, durations in minutes), a demo adapter with a small fixture and reload persistence under its own key, a live adapter over `rpc('<resource>_command', envelope)` with bounded owner reads, `get…Api()` / `set…ApiForTests()`, and unit tests in `tests/unit/<resource>/**`; they never wait for the migration. **Screen items** follow the v6 screen-lane rules above, may also read the new modules through their `get…Api()`, and test with the `set…ApiForTests` fakes. Every new table or column is added to the capability registry (N40) in the same PR that creates it.

## N41.2.2.2.2.2 Preset lifecycle writes, undo registration and MCP parity
Stage: Build · Status: open · Needs: N41.2.2.2.2.1 · Assigned: —
Done = finish N41.2.2.2.2 after N41.2.2.2.2.1's transaction-row-lock and post-lock reference/version recheck. Compatibly replace presets_command(jsonb) in ONE new additive migration, adding archive/restore/delete with action journal and exactly-once operationId receipts. All owner/version/reference decisions must run under the locking helper inside the same transaction; a delete with study-entry references archives instead of physically deleting. Retain create/update/reorder, owner isolation, provenance and optimistic conflicts. Register presets together in lemma_undo_tables and lemma_command_resources with complete field/operation schema and mcp_ok=true before exposing lifecycle writes. Verify undo_action and service-role mcp_command under p_user, unchanged existing mcp_command and undo_action. Bug #1024 requires a separately scoped regression fix to N41.1's outdated zero-registry expectation before this registration can merge. No unaudited authenticated writes or irreversible deletes.
Owner-authorized (D1, D8): production SQL requires independent review; PR body must include Replaces function: presets_command (reviewer verified signature and behaviour).
Tests: strengthen tests/mcp/sql/presets-command.mjs for archive/restore/delete, referenced delete as archive, optimistic conflicts, changed-payload operationId, action receipt, source attribution, undo, service-role MCP, owner separation; retain current preview and row-lock regression and existing historical tests outside scope.
Scope: supabase/migrations/<one new additive file>, tests/mcp/sql/presets-command.mjs, docs/v6/capability-registry/presets.json, CURRENT.md.
Not: earlier migrations, other modules, app/MCP functions, unrelated existing test assertions or protected files.

## N42.2 Deadlines versioned command, projections, undo and MCP parity
Stage: Build · Status: open · Needs: N36.2 · Assigned: —
Done = complete N42 on N42.1's owner-scoped public.deadlines table (title, kind, exclusive civil due date or instant, optional owner-composite links, strict estimate fields, status, version, action journal and owner-SELECT-only RLS already implemented; direct authenticated DML and write policies must be added compatibly with the versioned command and registry activation in N42.2). Add public.deadlines_command(p jsonb) with versioned and idempotent create, update, complete, reopen, cancel, restore and delete (changed-payload conflict, stale expectedVersion and second-owner rejection); register deadlines in lemma_undo_tables and lemma_command_resources, make the existing mcp_command service-role dispatcher work under p_user with owner/source/receipt parity. Add a read-only, owner-scoped read function that unions physical deadlines with projected project target dates and checkpoint due dates, clearly labelled by origin and never copied into deadlines rows. N42.1 test covers the schema, FK, RLS, dates and checks; this final stage must exercise full command lifecycle, retries, undo, read projections and MCP parity.
Owner-authorized (D1, D8): production SQL needs independent review.
Tests: extend tests/mcp/sql/deadlines.mjs for every command lifecycle, operationId and version conflict, second-owner isolation, undo, registered service-role MCP dispatch, and read-only project/checkpoint projection parity; existing suites unchanged.
Scope: supabase/migrations/<one new additive file>, tests/mcp/sql/deadlines.mjs, docs/v6/capability-registry/deadlines.json, CURRENT.md.
Not: changes to existing migrations or SQL tests, other tables, study_command, task_command, undo_action, mcp_command, app code or unrelated functions.

## N43.2 Practice topic commands, record and void-event due-date inverse (D8 b)
Stage: Build · Status: open · Needs: N43.1 · Assigned: —
Done = finish N43 after N43.1's two owner-scoped, RLS-protected tables. Create the owner journal triggers and register both tables in lemma_undo_tables alongside a tested, compatible undo inverse. Add a versioned, owner-authorized transactional practice_topics_command for topic create/update/archive/restore/delete, and record/void_event. On record, insert practice_events with rating 1–4, optional response/minutes and occurred_at, advance the topic's next_due_date by fixed_days or daysByRating[rating-1] using civil-day arithmetic, and persist enough previous due/last-practiced values for a precise void-event inverse. On void_event, mark the event voided, restore the prior next_due_date and last_practiced_at consistently even across multiple events, with explicit stale-version conflict behavior, idempotent operationId receipts and an owner action journal. Enforce owner-only linked subjects/concepts/checkpoints and topic/event owner equality. Keep cards, reviews and FSRS untouched. Register the new command resource so MCP and app share one command after N37. Preserve compatible undo_action behavior and never modify existing migrations.
Tests: tests/mcp/sql/practice-topics-commands.mjs with real full-migration PGlite, owner isolation, cadence boundaries, record and void inverses, conflict/reties, registered undo receipts and cross-client parity.
Scope: supabase/migrations/<one new additive file>, tests/mcp/sql/practice-topics-commands.mjs, docs/v6/capability-registry/practice_topics.json, docs/v6/capability-registry/practice_events.json, docs/v6/capability-registry/lemma_command_resources.json, CURRENT.md.
Not: existing migrations, src/data/**, UI, card reviews, FSRS, unrelated RPCs or tables.

## N44.2 Parked thought commands and atomic conversion to task
Stage: Build · Status: open · Needs: N44.1 · Assigned: —
Done = finish N44 on the read-only owner-scoped parked_thoughts table from N44.1. Add a reviewed additive migration with the authenticated security-invoker parked_thoughts_command for create, edit, dismiss, reopen, delete and convert_to_task. Atomically create one task with task_command-equivalent validation and mark the thought converted with its real task ID; retry of the same operationId must replay the receipt without creating another task. Reject owner spoofing, linked foreign-owner entry/task, changed-payload retry, stale expectedVersion and an invalid state transition. Enable audited writes only together with lemma_log_change, lemma_undo_tables registration and a lemma_command_resources entry, so app and service-role MCP dispatch share the command and all writes are undoable. Preserve existing task_command, study_command, undo_action and MCP code unchanged. Production SQL review required (D1/D8).
Tests: extend tests/mcp/sql/parked_thoughts.mjs with full-migration PGlite command lifecycle, idempotent atomic task conversion, optimistic conflicts, owner isolation, action receipts, undo and MCP parity. Keep the N44.1 schema, owner-FK and status assertions; replace the deliberately read-only stage guard with stronger tests proving every newly permitted client mutation is command-receipted, journalled and undoable.
Scope: supabase/migrations/<one new additive file>, tests/mcp/sql/parked_thoughts.mjs, docs/v6/capability-registry/parked_thoughts.json, docs/v6/capability-registry/lemma_undo_tables.json, docs/v6/capability-registry/lemma_command_resources.json, CURRENT.md.
Not: changing existing migrations, app/MCP code, unrelated resources/functions or protected files.

## N45 Study goals: migration (study_goals)
Stage: Build · Status: open · Needs: N36.2 · Assigned: —
Done = per D8(b), table `public.study_goals` with `period` (`week`/`month`/`custom`), `start_date`, `end_date`, `time_zone`, optional subject/project scope, `target_minutes`, `archived_at`. Operations create, update, archive, restore, delete. Scope is by ID, never by display name; overlapping goals for the same scope and period are rejected.
Owner-authorized (D1, D8): deploys on merge, so this PR needs a review.
Tests: `tests/mcp/sql/study_goals.mjs` per the lane rules, plus the lifecycle rules above
Scope: supabase/migrations/<one new additive file>, tests/mcp/sql/study_goals.mjs, docs/v6/capability-registry/<each new table>.json (new), CURRENT.md.
Not: other tables, `study_command`, `task_command`, `undo_action`, MCP function code, app code.

## N46.2 Day-plan items, preview-to-commit invariants and closure commands
Stage: Build · Status: open · Needs: N46.1 · Assigned: —
Done = complete N46 on N46.1's owner-bound, one-per-day day_plans headers. Add public.day_plan_items with owner-composite references to its plan, task and optional calendar block, disposition placed/unplaced/carried_over, reason and stable position; keep unplaced/carried-over work listed. Add public.day_plans_command(p jsonb) with versioned owner-create/update, preview, commit, close and reopen; commit must atomically compare every listed task/block version to the availability.sources recorded at preview and refuse stale versions. Closing one date may never affect another; close sets closed_at and reopening clears it. Keep client writes disabled until command_receipts idempotence, action journal, registered undo in lemma_undo_tables and generic mcp_command registration in lemma_command_resources are installed. Ensure same owner IDs throughout, exact retry/conflict semantics and source attribution. Production SQL needs independent review (D8 b).
Tests: extend tests/mcp/sql/day_plans.mjs with full-migration lifecycle, owner isolation, task/block version drift refusal, multiple dates and closure, item dispositions, idempotent retries, undo and MCP parity. Keep N46.1 field, JSON and FK constraints; revise read-only stage assertions only to enforce registered auditable writes.
Scope: supabase/migrations/<one new additive file>, tests/mcp/sql/day_plans.mjs, docs/v6/capability-registry/day_plans.json, docs/v6/capability-registry/day_plan_items.json, docs/v6/capability-registry/lemma_undo_tables.json, docs/v6/capability-registry/lemma_command_resources.json, CURRENT.md.
Not: changes to existing migrations, unrelated app/MCP functions, UI or other owner data.

## N47.2 Overlap acknowledgement command lifecycle and MCP/undo parity
Stage: Build · Status: open · Needs: N47.2.1 · Assigned: —
Done = complete N47 on N47.1's owner-scoped overlap_acknowledgements schema and version-aware staleness function. Add an owner-bound, receipt-idempotent overlap_acknowledgements_command with create, update and delete; reject changed operationId payloads, stale expected versions, a cross-owner participant, and a changed participant version. Register the table in lemma_undo_tables and the command in lemma_command_resources for service-role mcp_command parity. Reads flag an acknowledgement stale when any participant version has changed, without hiding other conflicts; attribute_to requires a participant in the exact acknowledged set. Keep authenticated table writes command-only.
Owner-authorized (D1, D8): production SQL requires independent review.
Tests: tests/mcp/sql/overlap_acknowledgements-command.mjs (lifecycle, receipts, concurrency, owner checks, stale reads, undo and MCP parity) and unchanged N47.1 SQL suite.
Scope: supabase/migrations/<one new additive file>, tests/mcp/sql/overlap_acknowledgements-command.mjs, docs/v6/capability-registry/overlap_acknowledgements.json, CURRENT.md.
Not: changes to earlier migrations, app or MCP function code, other tables/functions, existing test assertions.

## N48 Durable review runs: migration (review_runs)
Stage: Build · Status: open · Needs: N36.2, N38 · Assigned: —
Done = per D8(b), table `public.review_runs` with the full filter, selected deck IDs, card and minute budgets, scheduler/settings version, `status` (`running`/`paused`/`exhausted`/`completed`/`abandoned`), position, reveal state, start/pause/end instants; and child table `public.review_run_items` (run, position, card, expected card version, linked review once graded). Operations `start` (selects items with the same SQL selection the connector uses, so counts equal the selection), `pause`, `resume`, `advance` (links the review receipt of the grade just recorded; never grades), `abandon`, `complete`. Resuming never replays a grade; an item whose card version changed is marked stale and skipped with a reason.
Owner-authorized (D1, D8): deploys on merge, so this PR needs a review.
Tests: `tests/mcp/sql/review_runs.mjs` per the lane rules, plus the lifecycle rules above
Scope: supabase/migrations/<one new additive file>, tests/mcp/sql/review_runs.mjs, docs/v6/capability-registry/<each new table>.json (new), CURRENT.md.
Not: other tables, `study_command`, `task_command`, `undo_action`, MCP function code, app code.

## N49 Proposal drafts: migration (proposal_drafts)
Stage: Build · Status: open · Needs: N36.2, N38, N92 · Assigned: —
Done = per D8(b), table `public.proposal_drafts` with proposal and target IDs, `base_versions jsonb`, complete edit `payload jsonb`, `draft_version`, `status` (`draft`/`saved`/`submitted`/`discarded`), `edited_at`. Operations create, save (conflict when a newer draft exists), submit (applies through the existing proposal edit path, checking base versions), discard. An unsent draft is never approval.
Owner-authorized (D1, D8): deploys on merge, so this PR needs a review.
Tests: `tests/mcp/sql/proposal_drafts.mjs` per the lane rules, plus the lifecycle rules above
Scope: supabase/migrations/<one new additive file>, tests/mcp/sql/proposal_drafts.mjs, docs/v6/capability-registry/<each new table>.json (new), CURRENT.md.
Not: other tables, `study_command`, `task_command`, `undo_action`, MCP function code, app code.

## N50.2.2 Study events: related links, versioned lifecycle, undo and MCP
Stage: Build · Status: open · Needs: N50.2.1 · Assigned: —
Done = complete N50.2 after N50.2.1's authenticated, side-effect-free study_events_validate_envelope and N50.1's owner-scoped study_events table. Add optional related_kind/related_id with owner-bound references, transactional owner-only study_events_command supporting record, edit, void, restore, receipt replay, changed-payload and stale version conflicts. Recheck current kind, drift-only positive duration, related/entry ownership and versions under lock; preserve voided history. Register study_events in lemma_undo_tables and lemma_command_resources for action journal, undo and service-role MCP parity; block unaudited direct DML and prevent forged provenance. Production SQL requires independent review.
Tests: extend tests/mcp/sql/study_events-command.mjs with actual lifecycle, related owner links, retries, conflicts, journal, undo, MCP and second-owner refusal; preserve the N50.2.1 full-migration assertions and N50.1 SQL test.
Scope: supabase/migrations/<one new additive file>, tests/mcp/sql/study_events-command.mjs, docs/v6/capability-registry/study_events.json, docs/v6/capability-registry/lemma_undo_tables.json, docs/v6/capability-registry/lemma_command_resources.json, CURRENT.md.
Not: earlier migrations, existing test loosening, app/MCP code, unrelated tables/functions or protected paths.

## N56.2 Deadlines and milestones live adapter (remaining after N56 split)
Stage: Build · Status: open · Needs: N56.1, N42.2.2 · Assigned: —
Done = complete N56 after N56.1's typed contract, isolated demo adapter and getDeadlineApi/setDeadlineApiForTests facade. Implement the owner-RLS live deadline adapter for every N42 operation: create, update, complete, reopen, cancel, restore and delete through public.deadlines_command with stable operationId across retries, optimistic expectedVersion, actionNo receipts and typed conflict mapping. Preserve civil due dates versus instants, read-only projected project/checkpoint targets, exact status-filtered bounded 1–50 keyset pages, and never send owner IDs in browser commands. Replace the live placeholder in the existing module facade.
Tests: tests/unit/deadlines/live.test.ts mocking the browser client and RPC, including retries, each operation, conflicts, owner RLS, projected read-only targets and 50+ row cursor walk; N56.1 demo tests remain green.
Scope: src/data/deadlines/**, tests/unit/deadlines/**, CURRENT.md.
Not: other data folders, UI, supabase/**, new dependencies.

## N58.2.3 Parked thought atomic conversion and owner-RLS live adapter
Stage: Build · Status: open · Needs: N44.2, N44.2.2 · Assigned: —
Done = complete N58.2 using the N58.1 typed ThoughtApi, validation and transitions plus N58.2.2's reload-safe demo CRUD/paging. Implement atomic convertToTask in demo without a fake destination or orphan task, and src/data/parked-thoughts/live.ts plus index.ts/getThoughtApi()/setThoughtApiForTests(). The live adapter must issue every create/edit/dismiss/reopen/delete/convert operation through owner-RLS parked_thoughts_command envelopes after N44.2, with a fresh operationId per new action reused on uncertain retry, optimistic version conflict mapping, no caller owner fields and bounded owner reads. One convert action returns both a real TaskRecord and a resolved thought from a single transaction receipt; failed/retried conversion must not leave a partially converted thought or duplicate task. Preserve storage isolation and existing cards/reviews. N44.2 remains a prerequisite while split PR #1039 is unmerged; afterward N44.2.2 must be done before implementing live writes.
Tests: extend tests/unit/parked-thoughts/** with atomic demo conversion and reload, live RPC envelopes for every operation, retry identity, stale/conflict mapping, owner isolation and bounded pages; retain N58.1 and N58.2.2 regressions.
Scope: src/data/parked-thoughts/**, tests/unit/parked-thoughts/**, CURRENT.md.
Not: edits to other src/data/** modules, supabase/**, UI, protected files or new dependencies.

## N59.2 Study goals live adapter (remaining after N59 split)
Stage: Build · Status: open · Needs: N59.1, N45 · Assigned: —
Done = complete N59 after N59.1's typed GoalApi contract, isolated sessionStorage demo adapter and getGoalApi/setGoalApiForTests facade. Implement the owner-RLS live adapter for the N45 study_goals_command RPC, with idempotent v1 operationId receipts and retry using the same ID, expectedVersion for update/archive/restore/delete, typed conflict/not-found mapping, exact bounded 1–50 keyset pages and stable owner-scoped ID filters, correct archived state, inclusive YYYY-MM-DD period bounds and IANA time-zone intent. Refuse overlapping active goals of the same period and stable scope (subject/project IDs, never display names); restore must detect conflicts too. Live reads come from the signed-in owner's DB RLS and must not send an owner ID in the command envelope. Replace the live placeholder while retaining demo semantics and the stable facade.
Tests: tests/unit/study-goals/live.test.ts (RPC envelope and operationId retry/changed-payload conflict, every lifecycle op, stale expectedVersion, owner-RLS read, no owner ID in writes, >50 paged goals, date/time-zone and overlap parity); existing N59.1 demo tests stay green.
Scope: src/data/study-goals/**, tests/unit/study-goals/**, CURRENT.md.
Not: src/data/study/** or other data folders, UI, supabase/**, new dependencies.

## N60.2 Day plans: persistent demo, transactional live commands and closure
Stage: Build · Status: open · Needs: N46.2 · Assigned: —
Done = complete N60 with N60.1's typed DayPlanApi, owner civil-date/time-zone rules, bounded capacity, availability source-version comparisons, closure consistency and explicit placed/unplaced/carried_over items. Add a tab-local persistent src/data/day-plans/demo.ts fixture and live.ts plus index.ts/getDayPlanApi()/setDayPlanApiForTests(). Demo must implement create/update/preview/commit/close/reopen with optimistic version checks and same-date uniqueness, reload-safe records and isolated keyset pages 1–50 with exact totals, preserved unplaced tasks/reasons, per-date ritual/closure and no false completion of future dates. Live reads owner-scoped day_plans/day_plan_items and calls public.day_plans_command through one server transaction per mutation; each operation uses a fresh operationId that is reused on uncertain retry, identical conflict mapping, and NO client owner field. Commit must atomically recheck all snapshot source versions on the server, never rely only on N60.1's client advisory comparePlanSources. Close sets closedAt only for the chosen date; reopen clears it and never affects another plan. Ensure MCP/app receipts and item dispositions stay in parity with N46.2's registered command once that migration is deployed.
Tests: tests/unit/day-plans/** for demo reload, owner-day uniqueness, multiple dates and closure independence, all operations, version drift, source staleness, unplaced/carry-over visibility, bounded cursor pages/total, live envelopes/retry operationId, conflict mapping, no caller owner field. Retain N60.1 pure-model tests.
Scope: src/data/day-plans/**, tests/unit/day-plans/**, CURRENT.md.
Not: other data modules, UI, supabase/**, new dependencies.

## N61.2.2 Overlap acknowledgement live RPC adapter, facade and owner parity
Stage: Build · Status: open · Needs: N61.2.1 · Assigned: —
Done = complete N61.2 after N61.1's typed contract/validation and N61.2.1's isolated tab-persistent demo CRUD and dynamic staleness. Implement the mode-aware getOverlapApi()/setOverlapApiForTests() facade and src/data/overlap-acknowledgements/live.ts using authenticated owner-RLS reads of public.overlap_acknowledgements, plus current owner participant versions for the computed stale state without hiding other conflicts. Implement exact 1–50 keyset pages, filter-bound opaque cursors, and get by ID. Send every create/update/delete as an owner-free versioned rpc('overlap_acknowledgements_command', envelope) mutation, generating one fresh operationId per user action and reusing the exact envelope on ambiguous or post-write retries; never issue direct table DML. Map currentVersion and changed-payload conflict receipts, source/action numbers and read-after-write to the typed contract. Validate participant ownership and version on the server via N47.2.3 before writes; no fake success if N47.2.3 has not deployed. Preserve N61.2.1 demo and N61.1 validation semantics without changes.
Tests: tests/unit/overlap-acknowledgements/live.test.ts (mocked owner RLS read pages, all envelopes, stable retry IDs, optimistic conflicts, partial owner visibility, current participant staleness, source receipts and no caller owner field), plus existing N61.1 and N61.2.1 tests unchanged.
Scope: src/data/overlap-acknowledgements/**, tests/unit/overlap-acknowledgements/**, CURRENT.md.
Not: other src/data/** folders, UI, supabase/**, existing test assertion changes, new dependencies.
Reverted: 2026-11-06 — sql/tests/mcp/sql/registries-dispatch.mjs::registries-dispatch.mjs :: Undo AN first

## N62 Durable review runs: app module (src/data/review-runs)
Stage: Build · Status: open · Needs: — · Assigned: —
Done = per D8(c) and the lane rules, `src/data/review-runs/` for the records and operations of N48, including every lifecycle operation it names.
Tests: `tests/unit/review-runs/**` (demo behaviour and reload, live envelope per operation, retry reuses `operationId`, conflict mapping, bounded pages, no owner field sent)
Scope: src/data/review-runs/** (new), tests/unit/review-runs/**, CURRENT.md.
Not: other `src/data/**` folders, UI, supabase/**.

## N63 Proposal drafts: app module (src/data/proposal-drafts)
Stage: Build · Status: open · Needs: — · Assigned: —
Done = per D8(c) and the lane rules, `src/data/proposal-drafts/` for the records and operations of N49, including every lifecycle operation it names.
Tests: `tests/unit/proposal-drafts/**` (demo behaviour and reload, live envelope per operation, retry reuses `operationId`, conflict mapping, bounded pages, no owner field sent)
Scope: src/data/proposal-drafts/** (new), tests/unit/proposal-drafts/**, CURRENT.md.
Not: other `src/data/**` folders, UI, supabase/**.

## N64 Study notices, drift and urge events: app module (src/data/study-events)
Stage: Build · Status: open · Needs: — · Assigned: —
Done = per D8(c) and the lane rules, `src/data/study-events/` for the records and operations of N50, including every lifecycle operation it names.
Tests: `tests/unit/study-events/**` (demo behaviour and reload, live envelope per operation, retry reuses `operationId`, conflict mapping, bounded pages, no owner field sent)
Scope: src/data/study-events/** (new), tests/unit/study-events/**, CURRENT.md.
Not: other `src/data/**` folders, UI, supabase/**.

## N51 Study command v2: saved-entry correction and block task links
Stage: Build · Status: open · Needs: N36.2 · Assigned: —
Done = per D8(d), one migration replaces `study_command` compatibly and adds `calendar_blocks.task_id` (owner-composite FK to `tasks`, deferrable) so a block can carry a task; new operations on `study_entries`: `correct` (edit intent/links/rating/reflection and replace its intervals with a validated union, end after start, no 24-hour cap at DST), `split` (one saved entry into two at an instant, preserving the exact union), `void` and `restore`, and `create_manual` (a saved entry with `approximate=true` and its intervals). Calendar block create/update accept `task_id`. Every existing operation behaves exactly as before.
Owner-authorized (D1, D8): deploys on merge, so this PR needs a review. PR body line `Replaces function: study_command (reviewer verified signature and behaviour)`.
Tests: `tests/mcp/sql/study-correction.mjs` (each operation, union preserved, overlapping intervals rejected, a voided entry leaves Calendar/Progress reads, undo reverts each, retry/conflict, second owner, `mcp_command` path) and the existing study SQL tests unchanged
Scope: supabase/migrations/<one new additive file>, tests/mcp/sql/study-correction.mjs, docs/v6/capability-registry/study_entries.json, docs/v6/capability-registry/calendar_blocks.json, CURRENT.md.
Not: app or MCP code, other functions.

## N52 Study command v3: timer modes, captured configuration, drift deduction and lease
Stage: Build · Status: open · Needs: N51, N41.2.2.2.2.2 · Assigned: —
Done = per D8(d), one migration replaces `study_command` compatibly and adds to `study_entries`: `mode` (`pomodoro`/`flowtime`/`open`, default `open`), `preset_id` (FK to presets), captured `config jsonb` (copied from the preset or `settings.focus_defaults` at start; later default changes never alter it), `phase` (`focus`/`break`/`long_break`), `cycle`, `phase_ends_at`, `energy` (`low`/`steady`/`high`, optional), and a timer lease (`lease_device`, `lease_version`, `lease_expires_at`); operations `next_phase`, `take_lease`, and `exclude_minutes` (deduct the last N minutes of focus as an `excluded` interval with a reason, refused when there is not enough focus time; never double-subtracts). A second device without the lease can read but its writes conflict until the lease expires or is taken.
Owner-authorized (D1, D8): deploys on merge, so this PR needs a review. PR body line `Replaces function: study_command (reviewer verified signature and behaviour)`.
Tests: `tests/mcp/sql/study-modes.mjs` (Pomodoro cycle and long break, Flowtime break from ratio, captured config immune to settings change, lease conflict and takeover, exclusion bounds, undo) and earlier study SQL tests unchanged
Scope: supabase/migrations/<one new additive file>, tests/mcp/sql/study-modes.mjs, docs/v6/capability-registry/study_entries.json, CURRENT.md.
Not: app or MCP code, other functions.

## N53 Pending decisions with a server executor
Stage: Build · Status: open · Needs: N36.2 · Assigned: —
Done = one additive migration adds `public.pending_commands` (operation ID, resource, payload, `not_before`, `undo_until`, `status` `scheduled`/`executing`/`succeeded`/`failed`/`cancelled`, result, error class) and `public.pending_command(p)` to schedule, extend or cancel a registered-resource command, plus `public.lemma_run_due_commands()` that executes due rows once each through the registry (row lock, idempotent on retry). It runs from the existing scheduled `notify` tick (one call added in `supabase/functions/notify/tick-core.ts`), never from a browser timer. The app's delayed-approval toasts may later use it; nothing changes for current flows.
Owner-authorized (D1, D8): deploys on merge, so this PR needs a review.
Tests: `tests/mcp/sql/pending-commands.mjs` (due execution exactly once, cancel before due, extension, failure recorded, second owner, undo of the executed command) and a unit test for the tick call
Scope: supabase/migrations/<one new additive file>, supabase/functions/notify/tick-core.ts (one call), tests/mcp/sql/pending-commands.mjs, tests/unit/notify/pending-tick.test.ts, docs/v6/capability-registry/pending_commands.json (new), CURRENT.md.
Not: other notify behaviour, MCP code, app code.

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

## N65 StudyApi: corrections, manual entries and block task links
Stage: Build · Status: open · Needs: N51 · Assigned: —
Done = the study contract gains, additively, `correctStudyEntry`, `splitStudyEntry`, `voidStudyEntry`, `restoreStudyEntry`, `createManualStudyEntry` (approximate flag) and `taskId` on calendar blocks, implemented in the demo and live adapters with the N51 envelope.
Tests: `tests/unit/study/corrections.test.ts` (demo and mocked live for each operation, union preserved, conflicts)
Scope: src/data/study/**, tests/unit/study/corrections.test.ts, CURRENT.md.
Not: UI, supabase/**, other `src/data/**` folders.

## N66 StudyApi: timer modes, phases, drift exclusion and lease
Stage: Build · Status: open · Needs: N52, N65 · Assigned: —
Done = the study contract gains, additively, mode/preset/config/phase/cycle/energy/lease fields and `nextPhase`, `takeLease`, `excludeMinutes`, in both adapters with the N52 envelope; the live adapter keeps one device lease per tab and renews it while visible.
Tests: `tests/unit/study/modes.test.ts`
Scope: src/data/study/**, tests/unit/study/modes.test.ts, CURRENT.md.
Not: UI, supabase/**, other `src/data/**` folders.

## N67 Planner placement engine (pure)
Stage: Build · Status: open · Needs: — · Assigned: —
Done = `src/features/planner/model.ts` deterministically places selected tasks into free time for a bounded date range: availability from `settings.planning` (with documented defaults until N39 lands), existing planned/busy blocks and saved effort as occupied, gap and maximum-consecutive limits, priority then due order, splitting a task only when allowed; it returns placements, the remaining capacity per day and unplaced tasks each with a reason (`no_capacity`, `after_due`, `too_long`, `no_estimate`); overload and empty days produce suggestions (smaller next step, move to the next free day) without silently overbooking. DST and the owner's zone handled; unknown availability is not zero.
Tests: `tests/unit/planner/model.test.ts` (fixtures for empty day, overloaded day, due-before-capacity, DST day, gap/consecutive limits, determinism)
Scope: src/features/planner/model.ts (new), tests/unit/planner/model.test.ts, CURRENT.md.
Not: UI, `src/data/**`, supabase/**.

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

## N70 v6 Today: intention, next block, add task and onboarding behind the shell flag
Stage: Build · Status: open · Needs: N60.2 · Assigned: —
Done = with `v6Shell` on, Today shows the dated intention (set/edit through the day plan), the next planned block with Start (starting a study entry linked to it), an Add task action opening the N25 task sheet, the selected review batch count from the existing review summary, and honest onboarding for an empty account (no invented numbers). Flag off: nothing changes.
Tests: `tests/unit/home-v6/today-plan.test.tsx`
Scope: src/features/home/** (v6 branch only), tests/unit/home-v6/today-plan.test.tsx, CURRENT.md.
Not: other screens' folders, `src/data/**` except reading through existing APIs, new dependencies, existing tests' expectations.

## N71 v6 Focus: park a thought, notices and drift behind the shell flag
Stage: Build · Status: open · Needs: N58.2.3, N64 · Assigned: —
Done = with `v6Shell` on, Focus offers Park a thought (a short dialog saving to parked thoughts linked to the entry, never interrupting the timer), I drifted (records a drift event with minutes; deduction is offered only after N66 lands) and a notice counter from study events; everything works from the keyboard and survives reload. Flag off: nothing changes.
Tests: `tests/unit/focus/park-notice.test.tsx`
Scope: src/features/focus/**, tests/unit/focus/park-notice.test.tsx, CURRENT.md.
Not: other screens' folders, `src/data/**` except reading through existing APIs, new dependencies, existing tests' expectations.

## N72 v6 Focus modes and the persistent focus accessory behind the shell flag
Stage: Build · Status: open · Needs: N66, N71, N41.2.2.2.2.2 · Assigned: —
Done = with `v6Shell` on, starting focus picks a preset or mode (Pomodoro/Flowtime/open) with its captured configuration; Focus shows the current phase, cycle and the server phase deadline (browser ticking is only display), offers Next phase and the long-session guard; a compact accessory in the v6 shell (all routes, above the dock, not overlapping Inbox decisions) shows the running entry with pause/resume/open; taking the lease on another tab is explicit; I drifted can now exclude the minutes. Flag off: nothing changes.
Tests: `tests/unit/focus/modes.test.tsx`, `tests/e2e/v6-focus-modes.spec.ts` (accessory clears the dock and Inbox decision bar at 320×640)
Scope: src/features/focus/**, src/app/V6Shell.tsx (mounting the accessory only), src/app/FocusAccessory.tsx (new), tests/unit/focus/modes.test.tsx, tests/e2e/v6-focus-modes.spec.ts, CURRENT.md.
Not: other screens' folders, `src/data/**` except reading through existing APIs, new dependencies, existing tests' expectations.

## N73 v6 time log: edit, split, void, restore and export saved time behind the shell flag
Stage: Build · Status: open · Needs: N65 · Assigned: —
Done = with `v6Shell` on, `/log` (lazy route) lists saved entries by day in bounded pages with their intervals; edit (intent, links, rating, reflection, intervals), split at a time, void and restore through the N65 operations, add a manual approximate entry, and export the visible range as CSV; Calendar and Progress reflect each change after refresh; missing rating is unknown, not poor. Flag off: nothing changes.
Tests: `tests/unit/time-log/**`
Scope: src/features/time-log/** (new), src/app/App.tsx (registering the route only), tests/unit/time-log/**, CURRENT.md.
Not: other screens' folders, `src/data/**` except reading through existing APIs, new dependencies, existing tests' expectations.

## N74 v6 Calendar: deadlines and practice topics behind the shell flag
Stage: Build · Status: open · Needs: N56.2, N57.2 · Assigned: —
Done = with `v6Shell` on, Agenda, Day, Week and Month show deadlines (standalone and projected project/checkpoint dates, labelled by origin) and due practice topics alongside blocks, with remaining-effort hints; tapping opens the deadline or practice record; totals of saved effort are unchanged. Flag off: nothing changes.
Tests: `tests/unit/calendar/deadlines-practice.test.tsx`
Scope: src/features/calendar/views/** and src/features/calendar/deadlines/** (new), src/features/calendar/Page.tsx (loading the extra records only), tests/unit/calendar/deadlines-practice.test.tsx, CURRENT.md.
Not: other screens' folders, `src/data/**` except reading through existing APIs, new dependencies, existing tests' expectations.

## N75 v6 Calendar: overlaps and acknowledgements behind the shell flag
Stage: Build · Status: open · Needs: N61.2.2, N74 · Assigned: —
Done = with `v6Shell` on, overlapping blocks or saved entries show a conflict marker with the overlap window; Acknowledge records the disposition for exactly those participants (stale acknowledgements show the conflict again); no overbooking is hidden. Flag off: nothing changes.
Tests: `tests/unit/calendar/overlaps.test.tsx`
Scope: src/features/calendar/overlaps/** (new), src/features/calendar/views/** (markers only), tests/unit/calendar/overlaps.test.tsx, CURRENT.md.
Not: other screens' folders, `src/data/**` except reading through existing APIs, new dependencies, existing tests' expectations.

## N76 v6 Progress: goals and range-correct statistics behind the shell flag
Stage: Build · Status: open · Needs: N59.2 · Assigned: —
Done = with `v6Shell` on, Progress shows weekly/monthly goals against saved minutes for their exact scope and range, 7/30/90-day ranges computed for that range (never a fixed 28-day series under another label), subject partitions that sum to the total, exact values on charts, and goal create/edit/archive. Flag off: nothing changes.
Tests: `tests/unit/progress-v6/goals.test.tsx`
Scope: src/features/progress-v6/**, tests/unit/progress-v6/goals.test.tsx, CURRENT.md.
Not: other screens' folders, `src/data/**` except reading through existing APIs, new dependencies, existing tests' expectations.

## N77 v6 activity presets: manage and pick behind the shell flag
Stage: Build · Status: open · Needs: N55 · Assigned: —
Done = with `v6Shell` on, Settings gains an Activities section to create, edit, reorder, archive and restore presets; the Focus start control lists active presets (selection is passed through once N72 lands; until then it pre-fills the intent and links). Flag off: nothing changes.
Tests: `tests/unit/presets-ui/**`
Scope: src/features/settings/v6/Activities.tsx (new), src/features/settings/v6/Page.tsx (section link only), src/features/focus/PresetPicker.tsx (new), tests/unit/presets-ui/**, CURRENT.md.
Not: other screens' folders, `src/data/**` except reading through existing APIs, new dependencies, existing tests' expectations.

## N78 v6 practice topics behind the shell flag
Stage: Build · Status: open · Needs: N57.2 · Assigned: —
Done = with `v6Shell` on, `/practice` (lazy route) lists topics due first, with record practice (rating, optional response, minutes), cadence edit, archive/restore and event void; it never touches card review. Flag off: nothing changes.
Tests: `tests/unit/practice-ui/**`
Scope: src/features/practice/** (new), src/app/App.tsx (registering the route only), tests/unit/practice-ui/**, CURRENT.md.
Not: other screens' folders, `src/data/**` except reading through existing APIs, new dependencies, existing tests' expectations.

## N79 v6 Settings: planning, focus and review-budget preferences behind the shell flag
Stage: Build · Status: open · Needs: N39 · Assigned: —
Done = with `v6Shell` on, Settings gains Focus and Planning sections editing `focus_defaults`, `planning`, `review_budget`, `attention`, `week_start` and `clock_24h` with validated units, through the existing settings save path extended additively (unknown keys preserved); Calendar week start and time format follow them. Flag off: nothing changes.
Tests: `tests/unit/settings-v6/planning.test.tsx`
Scope: src/features/settings/v6/Planning.tsx and src/features/settings/v6/Focus.tsx (new), src/features/settings/v6/Page.tsx (section links only), src/data/types.ts and the settings patch in src/data/live/adapter.ts and src/data/demo/** (new fields only), tests/unit/settings-v6/planning.test.tsx, CURRENT.md.
Not: other screens, other settings sections, supabase/**.

## N80 v6 checkpoint page behind the shell flag
Stage: Build · Status: open · Needs: — · Assigned: —
Done = with `v6Shell` on, `/p/:slug/cp/:code` shows the criterion and steps, prerequisite states, evidence and rechecks with their tutor sessions, source/page citations and the existing demonstrate/reopen/defer/recheck actions, from the existing hooks. Flag off: nothing changes.
Tests: `tests/unit/checkpoint-v6/**`
Scope: src/features/checkpoint/v6/** (new), src/features/checkpoint/Page.tsx (the flag branch only), tests/unit/checkpoint-v6/**, CURRENT.md.
Not: other screens' folders, `src/data/**` except reading through existing APIs, new dependencies, existing tests' expectations.

## N81 v6 session page behind the shell flag
Stage: Build · Status: open · Needs: — · Assigned: —
Done = with `v6Shell` on, `/s/:slug/:n` shows the tutor session goal, events in order with outcomes, resume question and note, linked checkpoint and study time, and the existing resume/end actions. Flag off: nothing changes.
Tests: `tests/unit/session-v6/**`
Scope: src/features/session/v6/** (new), src/features/session/Page.tsx (the flag branch only), tests/unit/session-v6/**, CURRENT.md.
Not: other screens' folders, `src/data/**` except reading through existing APIs, new dependencies, existing tests' expectations.

## N82 v6 sources panel and page text behind the shell flag
Stage: Build · Status: open · Needs: — · Assigned: —
Done = with `v6Shell` on, the project's sources show kind/order, coverage and verification, pages with text, confidence and `[illegible]` markers, and the existing upload, transcription and export actions; long mathematics wraps. Flag off: nothing changes.
Tests: `tests/unit/sources-v6/**`
Scope: src/features/project/sources-v6/** (new), src/features/project/SourcesPanel.tsx (the flag branch only), tests/unit/sources-v6/**, CURRENT.md.
Not: other screens' folders, `src/data/**` except reading through existing APIs, new dependencies, existing tests' expectations.

## N83 v6 review run and done with durable runs behind the shell flag
Stage: Build · Status: open · Needs: N62 · Assigned: —
Done = with `v6Shell` on, starting from Review creates a durable run (N62's `start`); the run screen shows position/total, reveals and grades through the existing grade path and then `advance`; leaving and returning resumes the same run at the same item without replaying a grade; stale items are skipped with a note; Done shows the run's counts and next arrivals. Flag off: nothing changes.
Tests: `tests/unit/review-run-v6/**`
Scope: src/features/review-run/v6/** and src/features/review-done/v6/** (new), src/features/review-run/Page.tsx and src/features/review-done/Page.tsx (the flag branches only), src/features/review/v6/** (starting a run only), tests/unit/review-run-v6/**, CURRENT.md.
Not: other screens' folders, `src/data/**` except reading through existing APIs, new dependencies, existing tests' expectations.

## N84 v6 card detail and editor behind the shell flag
Stage: Build · Status: open · Needs: — · Assigned: —
Done = with `v6Shell` on, `/cards/:no` shows the note's variants, scheduling state, review history and comments with the existing edit, suspend/restore, reschedule, reset and comment actions; the editor previews mathematics and keeps the existing save path. Flag off: nothing changes.
Tests: `tests/unit/card-v6/**`
Scope: src/features/card/v6/** (new), src/features/card/Page.tsx (the flag branch only), tests/unit/card-v6/**, CURRENT.md.
Not: other screens' folders, `src/data/**` except reading through existing APIs, new dependencies, existing tests' expectations.

## N85 v6 plan review with proposal drafts behind the shell flag
Stage: Build · Status: open · Needs: N63 · Assigned: —
Done = with `v6Shell` on, `/proposals/:id` shows the plan or change preview with before/after targets, rationale and citations, and an Edit that saves a draft (N63), shows base/current/draft on conflict, and submits through the draft; approve/reject keep the existing atomic paths. Flag off: nothing changes.
Tests: `tests/unit/plan-proposal-v6/**`
Scope: src/features/plan-proposal/v6/** (new), src/features/plan-proposal/Page.tsx (the flag branch only), tests/unit/plan-proposal-v6/**, CURRENT.md.
Not: other screens' folders, `src/data/**` except reading through existing APIs, new dependencies, existing tests' expectations.

## N86 v6 Atlas editing in the list behind the shell flag
Stage: Build · Status: open · Needs: — · Assigned: —
Done = with `v6Shell` on, the v6 Atlas list adds create concept, edit name/blurb, reparent, link/unlink prerequisite or related, pin/unpin and merge, each through the existing write paths with an impact note for merges; cycles are refused with a reason. Flag off: nothing changes.
Tests: `tests/unit/atlas-v6/edit.test.tsx`
Scope: src/features/atlas/v6/**, tests/unit/atlas-v6/edit.test.tsx, CURRENT.md.
Not: other screens' folders, `src/data/**` except reading through existing APIs, new dependencies, existing tests' expectations.

## N91 Evidence and review history correction
Stage: Build · Status: open · Needs: N38 · Assigned: —
Done = one additive migration: `session_events` gains `occurred_at` (read as `coalesce(occurred_at, created_at)`), `superseded_by`, `voided_at`, `correction_reason`, `actor`; `reviews` gains `scheduler_version`, `params_id` (FK to a new `review_parameter_sets` snapshot of the weights and settings used) and `operation_id`; new functions `correct_session_event`, `void_session_event` (re-derive checkpoint state from remaining evidence) and `correct_review`, `void_review` (rebuild the affected card's schedule from its remaining history with the recorded parameters, or a disclosed replacement state), all owner-checked, journaled and undoable, registered in `lemma_command_resources`.
Owner-authorized (D1, D8): deploys on merge, so this PR needs a review.
Tests: `tests/mcp/sql/history-correction.mjs` (each correction re-derives state, history and schedule agree, undo, second owner, existing grade and session tests unchanged)
Scope: supabase/migrations/<one new additive file>, tests/mcp/sql/history-correction.mjs, docs/v6/capability-registry/session_events.json, docs/v6/capability-registry/reviews.json, docs/v6/capability-registry/review_parameter_sets.json, CURRENT.md.
Not: app or MCP code, changing existing grade functions.

## N92 Proposal versions, grouping, citations and withdrawal
Stage: Build · Status: open · Needs: N38 · Assigned: —
Done = one additive migration: `proposals` gains `payload_version`, `base_target_versions jsonb`, `group_id`, structured `citations jsonb` (source, version, page) and `withdrawn_at`, `revised_from`; new functions `withdraw_proposal`, `revise_proposal`, `reopen_proposal`; approval through the existing path accepts optional expected versions (a compatible replacement of the approve function, PR body line `Replaces function: <name> (reviewer verified signature and behaviour)`).
Owner-authorized (D1, D8): deploys on merge, so this PR needs a review.
Tests: `tests/mcp/sql/proposal-versions.mjs` (stale approval refused when versions are given, unchanged when not, withdraw/revise/reopen, grouping, existing proposal tests unchanged)
Scope: supabase/migrations/<one new additive file>, tests/mcp/sql/proposal-versions.mjs, docs/v6/capability-registry/proposals.json, CURRENT.md.
Not: app or MCP code.

## N93 Slug and code aliases, source and page revisions
Stage: Build · Status: open · Needs: N38 · Assigned: —
Done = one additive migration adds `public.record_aliases` (owner, kind `project`/`concept`/`checkpoint`, old value, target ID; unique per owner and kind) maintained by triggers when a slug or code changes, `public.resolve_alias(kind, value)`, and `public.source_revisions` / `public.source_page_revisions` with content hashes captured by triggers on edit, so citations and edit conflicts survive later corrections.
Owner-authorized (D1, D8): deploys on merge, so this PR needs a review.
Tests: `tests/mcp/sql/aliases-revisions.mjs` (rename keeps old links resolvable, collisions refused, revisions captured once per change, second owner)
Scope: supabase/migrations/<one new additive file>, tests/mcp/sql/aliases-revisions.mjs, docs/v6/capability-registry/record_aliases.json, docs/v6/capability-registry/source_revisions.json, docs/v6/capability-registry/source_page_revisions.json, CURRENT.md.
Not: app or MCP code.

## N37 MCP: generic commands and resource discovery
Stage: Build · Status: open · Needs: N36.2 · Assigned: —
Done = the `study` tool sends any registered resource's envelope to `mcp_command` (study entries, calendar blocks and tasks keep their current behaviour), `get` and `search` read registered resources in bounded pages, and a `resources` capability (inside an existing tool, so `tools/list` stays under 15,000 characters) lists registered resources with their field/operation schemas from `lemma_command_resources`, so new resources need no MCP code change.
Owner-authorized (D1, D8): deploys the MCP function on merge, so this PR needs a review.
Tests: `tests/unit/mcp/**` and `tests/mcp/sql/mcp-generic.mjs` (a resource registered only in the test is discoverable, readable and writable; existing study/task MCP tests unchanged)
Scope: supabase/functions/mcp/**, tests/unit/mcp/**, tests/mcp/sql/mcp-generic.mjs, CURRENT.md.
Not: migrations, existing tools' inputs or outputs.

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
Scope: the export implementation in src/data/live/adapter.ts and src/data/api.ts (export only), tests/unit/export/v6-export.test.ts, tests/mcp/sql/export-registry.mjs, CURRENT.md.
Not: other adapter methods, UI.

## N96 Flag-off rollback keeps a working app and every record
Stage: Build · Status: open · Needs: — · Assigned: —
Done = an e2e journey creates v6 records (entries, blocks, tasks) with `v6Shell` on, turns the flag off and checks the prior UI works on every route with no errors and no records deleted, then on again and the records reappear.
Tests: `tests/e2e/v6-rollback.spec.ts`
Scope: tests/e2e/v6-rollback.spec.ts, CURRENT.md.
Not: app code, supabase/**.

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
