# Lemma v6: product direction and migration plan

**Prepared:** 5 November 2026  
**Revision:** 2 — reviewed against the owner's shared-data/full-MCP requirement and Inbox screenshot.  
**Status:** production implementation plan; the standalone Inbox reference repair is delivered separately.  
**Scope:** updated plan, a normative [data/MCP contract](Lemma_v6_Data_MCP_Contract.md), a complete [current schema inventory](Lemma_v6_Schema_Inventory.json), and corrected copies of the standalone HTML/source. Original attachments, repository files/branches/PRs, live records, migrations, and deployments were not changed.

## 1. Recommended direction

Make the supplied v6 mockup the product and interaction target, while retaining Lemma's existing learning system and infrastructure. This is a change in product direction that requires data, API, MCP, state-management, and UI work. A visual restyle alone cannot deliver the mockup's behavior.

Keep React/TypeScript, the live/demo adapter boundary, Supabase, the MCP connector, FSRS, source ingestion, and the existing learning records. Add a durable study-planning and effort model beside the learning model, connect them through stable IDs, and migrate screens in small, testable slices.

**The database is the authoritative product record, maintained by both the user and chatbot. The app is its visualization and editing client. MCP must be able to create, read, change, organize, correct, archive, restore, and delete every owner-maintainable application resource and relationship through the same server commands. No app-only data feature or browser-only business store counts as complete. Explicit user instructions in chat authorize the same changes as actions in the app; the user must not repeat that approval in the app.**

The normative supplement closes the first plan's omissions, specifies all 26 existing tables plus the new study records, and defines field/operation coverage and seven release gates. Its full-MCP requirement supersedes earlier optional/read-only interpretations. Temporary rendering state remains local; durable business state and preferences belong in the database.

The companion [capability registry](Lemma_v6_Capability_Registry.json) accounts for all **310 observed columns across 26 tables**, maps **35 prototype state keys** to durable or explicitly transient homes, and identifies **16 new resource contracts**. It is a required-operation specification, not a claim that current MCP coverage is already complete. Future migrations and UI actions must keep that inventory complete.

The first complete slice should prove this flow with real persistence: **Today → start a planned block → Focus → save once → see the same logged time in Today, Calendar, and Progress → correct the log and see every view update.** This establishes the new foundation before expanding the planner or polishing every screen.

The plan preserves progress from both sources: production domain behavior and performance work from the repository, and interaction decisions, algorithms, visual language, audit findings, and useful fixtures from the prototype.

## 2. Evidence and baseline

### Repository snapshot

The initial repository review was [Mymayankyadav/lemma](https://github.com/Mymayankyadav/lemma), pinned to `main` at **`7a7752d1708555a4c88b54bf98bd837c5e5155f9`**, 5 November 2026 at 03:53 UTC. The second review refreshed `main` to **`bbc5fdbd5f08caa4ab2d7543def415acad72bab5`**, 10:38 UTC, re-read CURRENT/NEXT/AGENTS, MCP registration/field access and domain types, and inspected all public-table columns/relationships without reading user rows. The broad initial code references below remain pinned for traceability. N3, N4, and N8 have since merged; only N5 remained open at the second review. Refresh again before implementation.

| Area | Observed state | Consequence for this plan |
| --- | --- | --- |
| Application | React 19, TypeScript, Vite, React Router, TanStack Query, Zustand, PWA; deployment base `/lemma/` | Extend the existing application and build. |
| UI | 18 registered screen routes; four main tabs: Today, Paths, Review, Insights. Tabs currently appear only on the main tab routes. | v6 adds Calendar, displays Insights as Progress, and changes navigation and shared chrome. |
| Learning model | Subjects, projects, staged checkpoints, prerequisites, concepts, sources, tutor sessions, cards, reviews, proposals, diagnostics, and action history | Most learning screens already have useful data and behavior. |
| Study-planning model | No durable focus-effort, task-backlog, calendar-block, or parked-thought tables in the inspected public schema | These are new domain capabilities, not missing CSS. |
| Time | Tutor sessions have a `minutes` field. MCP `end_session` derives it from elapsed conversation time, capped at 600 minutes. Live Insights sums ended tutor sessions. | Existing minutes cannot be relabelled as measured focus time or treated as exact intervals. |
| Data boundary | Typed `LemmaApi`, live and demo adapters, query hooks; bounded card search/history, home/review outlook, and Insights RPCs already exist | Add shared contracts at this boundary; preserve bounded reads and lazy loading. |
| MCP | 23 registered tools, compact context packets, owner scoping, transactional commits, expected-state checks, and undo history | Evolve this connector; do not replace it or lose its safeguards. |
| Backend | Read-only metadata inspection of project `yemqnhnztlbyxmjxidis`: 26 public tables, all reporting RLS enabled; all 28 repository migrations appear in remote migration history | Do not start by repairing an assumed deployment failure or resetting the database. |
| Checks | GitHub reported successful `check`, all four e2e shards, `mcp-sql`, and Pages deployment for the pinned head | Useful baseline evidence, not a fresh local test run or proof that v6 is implemented. |

Principal code references: [routes and shell](https://github.com/Mymayankyadav/lemma/tree/7a7752d1708555a4c88b54bf98bd837c5e5155f9/src/app), [domain types](https://github.com/Mymayankyadav/lemma/blob/7a7752d1708555a4c88b54bf98bd837c5e5155f9/src/data/types.ts), [API contract](https://github.com/Mymayankyadav/lemma/blob/7a7752d1708555a4c88b54bf98bd837c5e5155f9/src/data/api.ts), [live adapter](https://github.com/Mymayankyadav/lemma/blob/7a7752d1708555a4c88b54bf98bd837c5e5155f9/src/data/live/adapter.ts), [MCP implementation](https://github.com/Mymayankyadav/lemma/tree/7a7752d1708555a4c88b54bf98bd837c5e5155f9/supabase/functions/mcp), and [migrations](https://github.com/Mymayankyadav/lemma/tree/7a7752d1708555a4c88b54bf98bd837c5e5155f9/supabase/migrations).

### Existing plans and their accuracy

Read [AGENTS.md](https://github.com/Mymayankyadav/lemma/blob/7a7752d1708555a4c88b54bf98bd837c5e5155f9/AGENTS.md), [CURRENT.md](https://github.com/Mymayankyadav/lemma/blob/7a7752d1708555a4c88b54bf98bd837c5e5155f9/CURRENT.md), [NEXT.md](https://github.com/Mymayankyadav/lemma/blob/7a7752d1708555a4c88b54bf98bd837c5e5155f9/NEXT.md), and the owner guide, then checked important claims against code, PR state, checks, and remote schema metadata.

`NEXT.md` is primarily a hardening/notifications/Android queue. It does not describe the v6 product transition. It postpones Atlas and plan-proposal work until N2–N8 finish, which should be reconsidered under this new direction.

There is documentation drift to resolve during future planning work:

- N2, N3, N4, N7, and N8 remain marked open in `NEXT.md` although their PRs have merged by the second review. Preserve their implementations and tests; do not restart completed work from stale statuses.
- `CURRENT.md` correctly records the N1 deployment repair in Known breakages, while other paragraphs still describe deployment/migrations as broken or incomplete.
- `CURRENT.md` still describes the Android shell and all real flags as absent. The reviewed `src/flags.ts` includes `androidShell: false`.
- The owner guide mentions 14 MCP tools; `server.ts` registers 23. Its maintainer section also points to planning documents removed by the repository reset.
- `CURRENT.md` explicitly says `docs/spec/data.md` and `docs/spec/connector.md` survive as generator inputs, not authoritative specifications. Do not restore an old direction merely because these files still exist.

The authority for this transition should be the owner's v6 direction, an updated executable backlog, current code/contracts, and validated behavior. Historical documentation and screenshots remain evidence with dates and limitations.

### Supplied HTML and source archive

The attached HTML is byte-identical to both `Lemma_UI_Implemented.html` and `dist/index.html` in the ZIP. Its SHA-256 is:

`c884bd12cf0aaa4a4b221d7d4f17888d5c6cdf140529e04c183a85a87c2b79af`

The source archive SHA-256 is:

`ba0d677403377c8a6eb5ba4ccb855a98035ce883cbf60f2b53f94d20f7b2f68d`

Read `README_FIRST.txt`, `DESIGN_HANDOFF.md`, `BUILD_MANIFEST.json`, `AUDIT_RESPONSE.md`, `V5_REAUDIT_RESPONSE.md`, relevant source owners/modules, metric logic, and source build instructions. Running **`python SOURCE/repack.py verify`** on a temporary extracted copy passed: 78 import identifiers, 28 modified modules, byte-for-byte reproduction of the supplied HTML. Neither attachment was modified.

The ZIP contains editable bundled JavaScript modules, source-owned browser runtimes, styles, a deterministic HTML packer, regression fixtures, and historical patch scripts. It is not the repository's original TypeScript source tree or a drop-in production build. Its `SOURCE/IMPLEMENTATION_REPORT.md` is explicitly historical and references a status file absent from this archive; the root v6 handoff, manifest, and audit responses are more relevant to the supplied output.

The handoff reports 53 state/component regressions, 23 source/module checks, syntax/style checks, and selected token contrast checks. Those results belong to the detached prototype. They do not establish live Supabase/MCP behavior. Historical `SOURCE/evidence` and audit screenshots include previous revisions.

A limited initial Chromium inspection covered Today, Focus, Atlas list, and Settings. Revision 2 adds a reproduced Inbox baseline, a corrected source build and a dedicated rendered regression matrix. External fonts were blocked, so fallback fonts were used. The earlier direct Calendar probe remains unverified. No complete physical-device, screen-reader, or live-account acceptance pass is claimed; exact Inbox results and changed source owners are recorded in the corrected source's `REVIEW_FIX_REPORT.md`.

## 3. What the new product must deliver

### Product and visual contract

- Five primary destinations: **Today, Paths, Review, Calendar, Progress**. Preserve existing deep links; Paths can retain `/projects`, Progress can retain `/insights`, and Inbox can retain `/proposals`.
- A quiet notebook appearance: warm paper and navy in Day; dark surfaces and light-blue primary actions in Night. Newsreader headings, Instrument Sans interface text, and IBM Plex Mono clocks are the supplied typography direction. Preserve readable mathematics and its existing rendering/sanitization.
- Shared title/action rows, Inbox/Add/Menu, consistent sheets and feedback, and a persistent focus accessory outside sign-in. Detail routes must retain useful navigation and return context.
- One meaningful next action on Today, with at most two secondary rows in its compact main section. A fresh real account must not inherit the prototype's running Topology timer, synthetic history, or stress fixtures.
- Calm Focus with pause, break, parked thoughts, editable finish/reflection, Save/Discard, and a clear return to the current activity.
- Calendar with Agenda/Day/Week/Month, schedule-first presentation, readable overlap stacks, capacity explanation, and deliberate planning tools.
- Progressive Paths, Cards, Sources, Sessions, and concept browsing. Use explicit actions and preserve horizontal scrolling for long mathematics.
- Review retains confidence before reveal, Again/Hard/Good/Easy, FSRS semantics, undo, and a resumable interrupted round. Leaving a round must not falsely complete it.
- Progress uses the same committed time as Today and Calendar, with honest range labels, accessible chart data, correction links, and distinct measures for review responses, evidence, and effort.
- Settings uses navigable sections with valid autosave and Saved/error feedback, while preserving connector setup, memory tuning, source/subject management, export, and sign-out.

### Three concepts that must stay distinct

1. **Learning plan:** approved curriculum, checkpoint criteria, prerequisites, source citations, and demonstrated evidence.
2. **Study schedule:** tasks, estimates, available time, busy blocks, deadlines, and suggested placements.
3. **Recorded effort:** saved study intervals and optional reflection. Time spent is not demonstrated mastery.

Moving a calendar block must not rewrite a checkpoint criterion. Finishing Focus must not mark a checkpoint demonstrated. Ending a tutor conversation must not manufacture a measured focus interval. Inbox decisions and parked thoughts must not become an undifferentiated task list.

## 4. Preserve, adapt, and add

| Capability | Preserve from the repository | v6 adaptation or addition |
| --- | --- | --- |
| Subjects and Paths | Subject IDs, merges, ordering, projects, slugs, pinned/system/archived states, stages, target dates, plan revisions | New presentation, continuous rails, bounded loading, explicit switching. No renamed replacement tables for display terminology. |
| Checkpoints and concepts | Criteria, steps, prerequisite graph, evidence/rechecks, concept hierarchy and links | Clear status/count scope and mobile detail flows; task/block references use actual checkpoint IDs. |
| Tutor sessions | Conversation identity, events, resume questions, handoff prompts, provenance, diagnostics | Connect optional focus effort by reference while showing conversation and focus counts separately. |
| Sources | Storage policies, PDF workers, source pages, transcription provenance, multi-source checkpoint citations, page export | Port v6 discovery/filtering and presentation without replacing the ingestion pipeline. |
| Review | FSRS code/weights, cards, ratings, confidence, sibling handling, quotas, record/undo behavior | Consistent filtered selection/counts, durable round recovery, readable deck controls and forecast semantics. |
| Cards | Existing search/page contracts, 20-row cursor history/comments, note/card distinction | Filter sheet and progressive display. A UI reveal batch of 20 need not force an unnecessary change to a working 50-row search API. |
| Inbox | Proposal kinds, atomic application, action history, plan/change previews and idea graphs | Selection-aware decisions, versioned drafts, per-item receipts, durable recovery/undo, and rationale/source evidence where available. |
| Atlas | Existing graph/tree/layout work, semantic statuses, real concept counts, `pinX`/`pinY`, checkpoint/review links | Mobile list default and bounded map/detail flows. The production model already has persisted pin coordinates; do not assume every deferred prototype map capability needs a new table. |
| Progress | Bounded Insights RPC, review/calibration statistics, evidence events | Add saved-effort aggregates and correct range-dependent checkpoint summaries. Preserve legacy tutor-minute visibility with an accurate label. |
| Tasks and scheduling | Existing project/checkpoint dates and owner subjects | Durable task backlog, calendar blocks, generic milestones where needed, bounded previews, capacity/conflict handling. |
| Focus and time log | Existing PWA lifecycle and time-zone helpers | New study-entry lifecycle, intervals, correction, reflection, and recovery; one timing authority shared by all screens. |
| Infrastructure | Auth, RLS, owner scoping, live/demo separation, query caching, lazy loads, PWA update prompt, CI and stress tooling | Extend contracts and coverage incrementally; retain existing protections and measured performance progress. |
| Android/notifications | Merged TWA shell and existing reminder backend/subscription work | Keep compatible with v6 routes. A TWA shell does not by itself implement native Live Activities, Live Updates, or widgets. |

Do not revive `legacy/`, merge archived branches wholesale, replace the app with the standalone HTML, or replay the ZIP's historical apply/continue scripts over repository source.

## 5. Data model direction

The names below are proposed implementation names, not committed schema. The normative supplement supplies the complete required resource/field/lifecycle inventory, including persistence missing from this overview. Finalize types, constraints and relationship/delete behavior in V6-01 before downstream UI work; an omitted field or localStorage business key fails the contract gate. Tables may be consolidated only while preserving those explicit contracts.

### Reuse the existing learning model

Retain current IDs, relationships, card scheduling state, completed checkpoints, approved plan history, source provenance, and action history. Reuse `projects.target_date`, `checkpoints.due_on`, and the existing subject catalog where they already express the required information.

Prototype tasks frequently use subject names and display checkpoint codes, and its quick-task validation infers checkpoint existence from a numeric code and project size. Production must resolve actual records and verify ownership and project membership. Names and checkpoint counts are not identity or referential integrity.

### Add a study model beside it

| Record | Purpose and minimum contract |
| --- | --- |
| `study_entries` | Stable identity for timed or manual effort, with owner, optional subject/project/checkpoint/tutor-session links, intent, source, lifecycle, version, optional reflection, and explicit saved state. Running/paused/draft/discarded records contribute no committed minutes. |
| `study_intervals` | Entry-linked focus/break intervals with valid instants and interval kind. Break intervals are excluded from logged effort. Manual entries without reliable interval placement must remain distinguishable. |
| `tasks` | Owner backlog with title, finite estimated minutes, priority, status, optional due date, and optional learning references. Completion is independent of checkpoint demonstration. |
| `calendar_blocks` | Scheduled study or busy intervals, with time-zone intent, status, version, and optional task/learning links. Actual effort is derived from saved entries, not copied into mutable duplicate calendar rows. |
| `parked_thoughts` | Small notes linked to a focus entry, with unresolved/converted/dismissed state. Converting to a task records the destination identity and cannot create duplicates on retry. |
| `study_goals` | Weekly time intentions, including optional subject-specific targets and an effective period. Keep these separate from curriculum completion targets and FSRS retention. |
| Generic milestones | Persist standalone exam/seminar/task deadlines that existing project/checkpoint targets do not represent. Project existing dates into the shared view without duplicate authoritative records. |
| Existing `settings` extensions | Typed planning/focus preferences, week start, clock display, and intention/minimum-day settings. Reuse the existing owner IANA time zone and review rollover; preserve unknown preference keys. |

Also required: dated day plans/closures, manual practice topics, activity presets, study/attention events, overlap acknowledgements, persisted review runs, proposal drafts, durable pending commands/receipts and a cross-client change feed. Their minimum fields and lifecycles are specified in the supplement. Prototype values such as `ritualDone`, `shutdownDone`, `tomorrowFirst`, `topics`, `customActivities`, `notices`, `driftLog`, subject/path links and review-reservation preferences must each have an explicit persisted home or a documented transient-state classification.

Each new record needs owner isolation, owner-consistent references, appropriate indexes, and export coverage. Explicitly define what happens when a project is archived or a subject is merged; preserve the study log and references instead of cascading away user history.

### Mutation and lifecycle rules

- Use stable client operation IDs and durable receipts for operations that can be retried. A unique database key plus receipt lookup should make repeated saves return the same result.
- Save Focus as one transaction: final interval state, reflection, saved status, related task/block transition if explicitly chosen, and audit receipt. A reflection draft does not log time.
- Enforce the chosen active-timer policy in the backend. Recommended first behavior: one active or paused focus entry per owner, with a visible take-over flow on another device. This must not restrict the existing ability to have multiple tutor conversations.
- Apply expected-version checks to timer ownership, log corrections, task/block edits, and proposal drafts. An older tab must not replace a newer record silently.
- Extend the current action/undo infrastructure where practical. Undo changes affected records and checks their versions; it must preserve unrelated work created afterward.
- Treat batch results explicitly: either documented all-or-nothing semantics or per-item receipts. Never show a blanket success after a partially applied operation.
- Keep new study records exportable. Never copy connector secrets into exports, logs, screenshots, or local recovery payloads.

### Historical data and migration

1. Inventory schema/contracts and take a recoverable backup before future production migrations. No reset or destructive migration is part of this direction.
2. Add nullable links and additive tables/fields first; leave existing records and clients functional.
3. Keep tutor-session minutes as historical conversation-duration estimates. Do not invent starts/ends, duplicate them into a new focus log, or count them twice when focus is later linked.
4. Offer any later historical import as an explicit preview with provenance and deduplication. The prototype's anonymous local storage and synthetic seed are never an automatic import source for a signed-in account.
5. Update generated database types, live/demo adapters, exports, audit/undo allowlists, and contract tests together.
6. Rehearse migrations against a disposable database populated with representative existing data, then deploy through the repository's migration/deployment process. Keep the deployed backend backward compatible through the UI transition.

## 6. Shared metrics and time contract

Define these once, with matching server/client fixtures, before implementing dashboards. Start from the prototype's interval-union work and the repository's owner-zone `studyClock` helpers, then reconcile their differences: the prototype effort runtime uses the browser's local zone; the repository already stores an owner zone and review rollover.

| Metric | Required definition |
| --- | --- |
| Logged time | Union of saved focus/manual intervals in the selected range, clipped to the current instant. Exclude drafts, discarded entries, breaks, duplicate identities, and future portions. Flag invalid/overlapping/future records and provide correction access. |
| In progress | Unsaved active study effort, displayed separately. Reconstruct from phase transitions/timestamps rather than relying on interval callback frequency; Pomodoro does not accumulate past its configured focus boundary. |
| Planned time | Scheduled study effort, kept distinct from logged time and busy commitments. A plan is never represented as completed study. |
| Occupied time | Union of logged, planned, and busy intervals. For a partitioned capacity stack, use logged first, then busy, then planned; independent totals and overlap warnings remain available. |
| Subject time | A deterministic partition of logged time by subject ID, with a defined overlap-resolution rule and visible conflicts. Subject bars must reconcile to the overall total, including unassigned effort. |
| Legacy time | Tutor-session estimates remain separately labelled. Duration-only historical records never acquire fabricated timestamps or silently become exact union-based time. |
| Review counts | Distinguish all due, eligible after settings/filters, and the selected batch. Count and queue must use the same selection policy. A minute estimate is not an exact due count. |
| Forecast | Seven actual dates and a declared scope. Tomorrow's scheduled arrivals exclude overdue cards; unavailable or partial forecasts are not filled with invented zeroes. |
| Learning progress | Evidence events in the selected range, distinct from current/lifetime path completion. Tutor conversation count is distinct from saved focus-entry count. |

Additional contracts:

- Use half-open intervals `[start, end)`, split across boundaries for reporting, and apply the owner's IANA zone. Calendar civil dates use midnight-to-midnight; FSRS study days continue to use the configured rollover. Carry the chosen day convention in the metric contract and labels.
- Separate calendar-day duration from a fixed 24-hour assumption. Cover midnight, 23/25-hour DST days, repeated hours, skipped hours, device/owner zone differences, and clock changes.
- Store timed activity as instants; store date-only targets as dates. A planned recurring wall-clock time also needs its intended time zone. Repeated or nonexistent local times require an explicit, consistent resolution.
- Include scope, `asOf`, provenance, and load quality in summary responses. Loading, failed, stale, partial, unavailable, and genuine zero are different states.
- Keep effort and learning evidence independent. Saving 50 minutes must not improve mastery, retention, or checkpoint completion by inference.
- Fix range handling on both sides: the inspected Insights SQL and chart builder have checkpoint summaries tied to 28 days. A v6 7/30/90-day label must be backed by matching event data.

## 7. Application and API architecture

Keep `src/features/*` for screens, `src/ui` for common components, `src/data/types.ts` and `api.ts` for domain contracts, live/demo adapters for access, and pure domain functions for metrics and planning. Add study/Calendar features inside that structure.

Do not use `window.__lemmaNotebook`, `window.__lemmaSessionStore`, DOM events, or one browser-local JSON object as the production authority. They are useful prototype integration mechanisms. Production needs typed state transitions, owner-bound persistence, and one observable state owner.

Required boundaries:

- **Server state and commands:** TanStack Query over owner-scoped projections of the database and one server command dispatcher shared with MCP/workers. Authoritative scheduling, validation and lifecycle rules run there; browser calculations can preview them. Scope cache/recovery keys by account and mode; clear them on sign-out/account change.
- **Active focus state:** one typed state machine, exposed to Today, the dock, Focus, and Calendar. Persist recoverable checkpoints without treating them as logged effort.
- **Drafts and sessions:** proposal edits/reflection, selected review rounds and committed planning state have explicit database lifecycles. Account-bound local recovery is an outbox/cache, not the only copy. Draft recovery detects a changed underlying record.
- **Read models:** compact Today summary, bounded Calendar window, paged tasks/logs, and range-based Progress aggregates. Return summary totals separately from paged rows so a partial page cannot masquerade as a full count.
- **Mutations:** explicit commands with operation ID, expected version, structured errors, and receipts. Extend existing `LemmaError` handling instead of returning only success toasts.

Every committed app/MCP/worker change publishes an owner-scoped version/cursor change. The app refreshes affected projections; MCP reads current data. Reconnect catches up missed changes/deletions, and neither a stale conversation packet nor a client cache wins over newer records. Every resource's acceptance includes a chat write observed in the app and an app write observed in chat.

The existing `HomeSummary` can remain compatible while a versioned extension/read model supplies active focus, saved effort, next block, scoped review counts, and pending decisions. Keep Today within the existing request/transfer budgets; prefer bounded database aggregates over extra full-table downloads.

The live adapter currently has useful bounded paths, but proposal/session reads still assemble broader owner collections. Add bounded server-side queries where v6 surfaces expose that cost. MCP helpers also impose fixed row caps; report truncation or provide continuation rather than claiming complete counts from capped data.

Port the Calendar behavior and pure calculations into typed source. Prefer shared React controls and dialogs. If a temporary custom-element boundary saves substantial validated work, wrap it with a typed adapter, shared tokens, deterministic cleanup, and the same canonical data store; give that boundary an explicit exit criterion. Do not let it maintain a competing timer, planner database, or design system.

Offline behavior should preserve the current honest model: no silent replay of uncertain review/approval writes. Recover focus/drafts locally under the correct account, show unsynced state, and reconcile using operation receipts. A lost acknowledgement is resolved by checking server state before another non-idempotent operation.

## 8. MCP evolution

The existing connector is a major part of the product. Keep its 23-tool compatibility, owner prompts, teaching styles, proof-first rules, source-read-before-citation behavior, evidence/recheck flow, diagnostics, transactional `mcp_commit`, and undo history.

Full owner-data maintenance through MCP is mandatory, including advanced and rarely used edits. The current connector exposes direct mutations as well as proposals, but its field allowlist is incomplete. Implement the supplement's resource/field registry and shared semantic commands; do not equate “23 tools exist” with complete coverage. An explicit chat instruction can apply a change, including a curriculum/schedule change, through the same command path as the app. Unsolicited changes remain proposals, approvable in either channel. No repeated app-only approval is required.

| Capability | Current foundation | Planned extension |
| --- | --- | --- |
| Resume context | Project/checkpoint, criterion, last conversation, warm questions, due/proposal counts, source hints | Add a bounded next task/block and optional saved-effort summary after the study model is stable. Preserve critical teaching context when trimming packets. |
| Reads | `get`, `resume`, `search`, sources and sessions | Full owner-resource discovery/read/search/export with bounded pagination, schema discovery, freshness and continuation, including private notes on explicit request. |
| Scheduling and curriculum | Existing plan proposals and direct authorized mutations | Both direct instructed changes and unsolicited proposal flows for tasks, blocks, deadlines, learning plans and relationships. Keep schedule operations distinct from curriculum `plan_change` semantics. |
| Durable writes | Transactional allowlisted commands and some expected-state guards | Complete create/update/delete/correct/merge/reorder/restore capability for every resource, using the same server validation, versions, receipts, audit/undo and change feed as the app. |
| Counts and dates | Connector-specific calculations alongside app/SQL logic | Align review selection/count policy, owner zone, rollover, and time summaries through shared fixtures/read models. Prevent app/MCP disagreement at row caps. |
| Focus linkage | Tutor `start_session` / `end_session` | Optional explicit link to a focus entry. Starting/ending a chat does not automatically start/log a focus timer. |

Prefer a small, discoverable contract over adding one tool per panel. Keep the existing `tools/list` size constraint and compact response budgets. Version new payloads/capabilities, and keep old clients functional; do not start emitting a new proposal kind to clients that cannot review it safely.

Private reflection/parked text need not enter routine resume packets, but it must be readable/editable/deletable through MCP when the owner requests it. Credential rotation, account deletion, source-file access, historical review/evidence correction, reminder/device management and settings resets have explicit named workflows. Generated/audit fields are governed by semantic commands; arbitrary SQL/DDL and plaintext secret exposure are not required for full application-data control. No new in-app LLM backend is required.

MCP acceptance must cover owner isolation, unchanged legacy tool behavior, source provenance, explicit proposal approval, stale versions, retries, rollback on invalid batches, capped reads, and app-versus-MCP parity. Use disposable test data; deployed self-tests can write, so they were not run during this read-only review.

## 9. Screen implementation sequence

| Screen/flow | Implementation focus and acceptance |
| --- | --- |
| Shared shell and kit | Five destinations; consistent header/menu/add actions; persistent focus accessory; one feedback surface; shared Day/Night roles; safe areas and large-text layout. Validate Back, focus restoration, and sign-in suppression. |
| Today + Focus | Current action, honest saved/in-progress time, next block, parked thoughts, pause/break/finish/discard. Saving twice or from two tabs creates one committed entry; all views agree after refresh. |
| Calendar + study log | Agenda first on phones, four views, dense-overlap stacks, read-first details, bounded date queries, correction/edit/split/export. Editing a log changes actual projections everywhere without duplicating calendar records. |
| Planning tools | Global task sheet stays on the current route; validation, real subject/path/checkpoint references, explicit backlog reveal, targeted Undo, finite estimates. Preview placements, explain unplaced work, and commit selected records only. |
| Planning/closure rituals | Small unchecked suggestion sets, explicit carry-over choices, a fitting-slot preview, next-day recovery when no slot fits, parked-thought triage, and tomorrow's first step. No hidden mass rescheduling. |
| Progress | Display label changes without breaking `/insights`. Shared effort selector, legacy-time explanation, correct selected ranges, chart tables/patterns, correction links, and subject totals that reconcile. |
| Paths/project/checkpoint/session | Reuse current learning logic and N2 work; port rails, statuses, stage picker, switching, scoped event counts, binned session timeline, and Sources/Sessions presentation. |
| Review + Cards | Resolve filter/count ordering across demo/live/store/MCP; preserve FSRS; durable interrupted rounds and explicit completion; accessible deck selection, long math, filter sheet, progressive cards and detail actions. |
| Inbox/plan review | Keep existing plan/change/ideas previews. Add usable rationale/citations where supplied, versioned edit drafts, selected batch previews, per-item durable outcomes, and accessible Undo/recovery. Never manufacture missing rationale. |
| Atlas | Preserve production graph/layout/pin work; use phone list default, real concept counts, bounded exploration, keyboard equivalents, and detail sheets that preserve map context. |
| Settings/auth/PWA | Section navigation, account-scoped valid autosave, weekly intentions, one retention editor, truthful tuning eligibility, subjects/merge, export, connector rotation, and clear demo sign-out behavior. Keep updates from interrupting active work. |

Use the handoff's specific restraint: five unchecked day-plan suggestions, at most 20 automatic placements per preview, and progressive lists beginning around 20 rows. Treat these as configurable interaction contracts backed by tests, not reasons to load an entire account and slice it in the browser.

## 10. Reconcile the existing backlog

Do not discard open work or blindly continue the old queue. Recheck every PR/head before making changes and coordinate through the existing priority process. No PRs were reviewed, edited, claimed, or closed during this planning task.

| Existing item | Observed state | Recommended treatment under v6 |
| --- | --- | --- |
| N1 deployment ordering | Merged repair; remote migration history now matches | Preserve the fix; remove stale “deploy broken” claims during the documentation reconciliation. |
| N2 Today | Merged in #818, still open in NEXT | Keep its large-project/viewport regressions and goal-card logic. Mark implemented work accurately; adapt presentation deliberately for v6. |
| N3 Review ordering | Merged [PR #820](https://github.com/Mymayankyadav/lemma/pull/820), 07:09 UTC | Carry forward its tests/fixes. The initial SQL `review_items` applies filters after quota, and N3 forbids SQL edits: validate current SQL/MCP parity in a separate backend item rather than assuming the merged frontend item resolves it. |
| N4 Cards/checkpoint states | Merged [PR #821](https://github.com/Mymayankyadav/lemma/pull/821), 10:38 UTC | Retain the new page-state coverage and use it in the redesign. |
| N5 Web Push | Active [PR #822](https://github.com/Mymayankyadav/lemma/pull/822), latest observed head `846454a` | Preserve useful implementation after current-head acceptance is verified. A label or flag-only commit is not proof that the complete push behavior passes. |
| N6 reminder review flow | Not in main; depends on N5 | Fit its deep links and done-screen offer to the settled Review contract; keep the existing RPC/backend work. |
| N7 Android shell | Merged in #823; flag default off | Preserve the shell and tests. Update its stale planning status; do not mistake it for delivered native focus surfaces. |
| N8 store kit | Merged [PR #840](https://github.com/Mymayankyadav/lemma/pull/840), 06:34 UTC | Preserve validators/privacy/listing work. Refresh listing screenshots when v6 is stable; do not discard the merged assets or validators. |
| Atlas and plan review | Delayed beyond N2–N8 in old NEXT | Bring their v6 adaptations into the screen plan; remove the arbitrary dependency on completing Android marketing assets. |

The repository currently says the next unused item is N9. That is a snapshot observation, not a reservation. Use temporary work-package labels below; allocate actual NEXT IDs only after refreshing the live queue.

`AGENTS.md` v1.4 requires scoped items, default-off Build flags, meaningful tests, and protected-path changes through the priority/owner rules workflow. `ci/protected.json` includes workflow/CI files and Playwright/Vitest configuration. Future changes to those protections or old visual expectations must be explicit and reviewed; this document does not weaken or bypass them.

## 11. Phased delivery and completion gates

Each package below is a milestone, not necessarily one PR. Split it into scoped items with code and meaningful tests under the repository rules. Avoid a single app/schema/MCP replacement PR.

| Package | Depends on | Deliverables | Completion gate |
| --- | --- | --- | --- |
| **V6-00 — baseline and backlog** | None | Refresh main/open PRs; reconcile CURRENT/NEXT; establish the v6 reference set and a feature-by-feature carry-forward ledger | Every existing feature has a preserve/adapt/add/defer disposition; completed and active work is correctly identified; production code is not represented by stale documents. |
| **V6-01 — contracts and shared design** | V6-00 | Normative supplement finalized as typed schemas: every existing/new field, operation, relationship, projection and lifecycle; metrics; shared design/flags; Inbox regression | Zero unclassified fields/unnamed business-state keys; full app/MCP operation mappings; shell/header/dialog behavior demonstrated at phone and large-text sizes. No foundational data omission is passed downstream. |
| **V6-02 — durable study foundation** | V6-01 | Additive study schema, ownership/integrity/indexes, receipts, concurrency/audit/undo/export behavior, generated types | Migrations succeed on representative existing data; cross-owner references fail; duplicate/stale saves are handled; old learning data and clients continue to work. |
| **V6-03 — shared commands/adapters/parity** | V6-02 | Matching live/demo API and MCP resource access over one server command layer; bounded projections; metrics; account-bound cache/outbox and change feed | Every introduced resource passes create/edit/delete/correct from both channels, synchronization and same-fixture parity; browser-only seed/state cannot enter live mode. |
| **V6-04 — complete first study slice** | V6-03, shared shell | Today → block → Focus → saved log → Calendar/Progress; correction and recovery through app and MCP | Reload/two-tab/double-save/break/discard and chat↔app observation pass; cross-screen totals match; no false mastery; old routes/tutor flows remain usable. |
| **V6-05 — planner and rituals** | V6-04 | Task/backlog, deadlines, four Calendar views, bounded placement previews, capacity/conflicts, closure and targeted Undo | Overloaded/empty days have useful recovery; no silent overbooking; undo preserves unrelated later records; selected placements persist and appear correctly on another client. |
| **V6-06 — learning screens** | V6-01, V6-04; applicable N3/N4 work | Paths/project/checkpoint/session/source, Review/Cards, Inbox/plan review, Atlas, Settings | Existing learning regressions remain covered, deliberate v6 visual contracts pass, long mathematics and realistic account sizes remain usable. |
| **V6-07 — full MCP coverage and reminders** | Stable relevant contracts/UI; domain writes already delivered with each slice | Close all legacy rare-field/relationship/advanced-command gaps, capability discovery, full private/historical data workflows and notification compatibility | Every current/new schema column classified; every owner-editable resource passes bidirectional CRUD/correction parity; legacy tools compatible; zero app-only maintenance paths. |
| **V6-08 — acceptance and release** | Required v6 packages | Exact-output browser/device audit, live integration rehearsal, migration/export/rollback rehearsal, current screenshots/docs, deliberate flag activation | Required checks and acceptance journeys pass; known limitations are recorded; disabling v6 returns a functioning prior UI without deleting new records. |

V6-06 may be delivered screen by screen. Each slice includes its MCP writes and change propagation; V6-07 is the final completeness audit, not permission to defer those capabilities. The dependency is a settled contract, not finishing all visual work before testing integration.

No reliable calendar estimate should be promised from the mockup alone. Estimate and size the first implementation items after V6-01 exposes schema/API choices and the Calendar extraction cost. Track progress by completed behavior and gates, not screen count or “audit findings implemented” totals.

## 12. Verification and rollout

### Preserve useful regression coverage

Retain existing FSRS, source ingestion, ownership, proposal transaction, undo, math rendering, lazy-load, pagination, and large-account tests. Port useful prototype scenarios into the repository's typed contracts. Tests that inspect packed module strings or use DOM doubles do not replace browser or database tests.

Some existing tests encode the old graph-theme/geometry direction. Record intentional v6 changes and introduce the new appearance expectations through the appropriate reviewed work. Keep functional and accessibility assertions; do not delete/skip tests or lower protected thresholds just to obtain a green build.

Run checks appropriate to each implementation change, using the existing affected-test/PR gates, then the full required suite before release. Preserve current request/transfer/DOM budgets and report cold-route performance. Timing results are handled by the repository's separate non-blocking performance workflow; do not rewrite that policy inside a feature PR.

### Required end-to-end journeys

| Journey | Evidence required |
| --- | --- |
| Existing learner resumes | Current path, completed criteria, source links, cards, plan history, and tutor handoff remain intact after upgrade. |
| New account | Honest empty states, no synthetic active timer/history, working first path/task/focus creation, and correct sign-out/account separation. |
| Focus lifecycle | Pause, break, background/throttle, reload, finish edit, save, duplicate save, discard, second tab/device conflict, lost acknowledgement, and recovery. |
| Shared time | Overlap, midnight, future/invalid entries, owner/device zone mismatch, DST fold/gap, correction, and matching Today/Calendar/Progress totals. |
| Plan a full day | Zero fitting slots, explicit unplaced tasks, next-day preview, unchecked suggestions/carry-overs, changed task version, and targeted Undo after unrelated effort is saved. |
| Interrupted review | Filters/count/quota parity, confidence-before-reveal, Again handling, refresh/resume without replayed grades, conflict from an external grade, and completion only when the round is exhausted. |
| Inbox recovery | Long math, missing rationale, stale edit draft, selected batch, partial outcome, lost acknowledgement, accessible pending decision, and durable Undo/status recovery. |
| Large account | Existing stress/extreme fixtures plus dense schedules, long lists, 2,500 concepts/8,000 connections, many sources/sessions, and bounded network/render work. |
| Full MCP data parity | Enumerate every registry field/relationship/operation: chatbot creates/changes it, app observes it; app changes it, chatbot observes it; delete/correct/restore and inspect the same receipt. Include private notes, rare settings, source files/pages, historical reviews/evidence, pins/order, reminders and all new study resources. |
| PWA and account | Cold/direct routes, offline lazy-route availability, online recovery, safe updates during study, notification deep links, account switching, and export containing new records. |

Capture the exact implementation at 320, 360, and 390-pixel phone widths, representative larger screens, landscape, Day/Night, reduced motion, and 200% text. Check rendered contrast, 44-pixel controls, visible focus above the dock, dialog/keyboard/Back behavior, formula scrolling, safe areas, and screen-reader names. Include actual Android Chrome/TWA and iOS Safari testing where supported; a desktop Chromium screenshot cannot establish those results.

### Release and rollback

1. Add backend support while new UI/features remain off. Verify backward compatibility before deploying consumers.
2. Exercise live/demo parity and the full study slice in a controlled test environment. Keep production seed data out of the rollout.
3. Ship accepted features behind the repository's typed flags. Current production builds ignore URL/env overrides; production activation requires changing reviewed defaults, or a separately authorized rollout mechanism. A query parameter is not an existing production canary system.
4. Deliberately enable the accepted v6 experience once the required gates pass. Preserve the existing PWA update prompt and recover active sessions/drafts across versions.
5. Keep previous UI paths and additive schema compatibility during the transition. Roll back application flags/code if necessary; retain new records and audit receipts. Do not drop new tables as a UI rollback.
6. Update CURRENT, NEXT, the owner guide, MCP documentation, screenshots, and Android listing assets to the released behavior. Remove transitional code only after its replacement is accepted and historical data remains accessible.

## 13. Explicit later work

The supplied audits defer native focus surfaces, proof-step reveal, technique-based interleaving, private worry-dump flows, stylus/margin editing, and several speculative coaching features. Keep those outside the initial v6 acceptance scope unless separately defined. Preserve already working production capabilities that overlap with those ideas, such as Atlas pins and teaching styles.

Do not invent a fourth confidence category, infer a technique taxonomy from prose, synthesize tutor rationale/source passages, or claim mastery/health benefits from effort data. Optional calendar-account integrations need an explicit connector/data/permission contract before replacing previews with a claim of synchronization.

The first production implementation commitment should be **V6-00 and V6-01, followed by the smallest durable study slice with complete app/MCP writes**. Full v6 release additionally requires all seven gates in the normative supplement: schema coverage, command parity, complete UI inputs, consistency, history preservation, ownership/deletion, and visible behavior.

## 14. Inbox bottom-area repair and downstream blocker

The screenshot defect is reproduced and fixed in the corrected standalone reference source. Its causes were explicit route-level navigation/timer suppression and a conflicting higher-specificity sticky action-bar rule. The fix restores five-way navigation and the active timer in Inbox, portals the decision bar outside animated page transforms, anchors it above measured chrome, reserves content space, and moves feedback/focus reveal above the combined stack.

Corrected deliverables: `Lemma_Mobile_UI_v6_Reviewed.html` and `Lemma_Mobile_UI_v6_Reviewed_Source.zip`. The original attachments stay unchanged. `REVIEW_FIX_REPORT.md` and `SOURCE/tests/inbox-chrome.browser.py` in the source archive record the exact repair and rendered checks.

The production port must preserve this invariant: in portrait Inbox, the five navigation destinations remain reachable, an active timer remains reachable, Reject/Edit/Approve do not overlap either, and the final content/focus target scrolls above the whole stack. With no timer, actions sit above navigation; modal close and route return restore the correct stack. Landscape, 200% text, keyboard/visual-viewport changes, safe areas, and feedback/Undo are explicit acceptance cases. Do not copy the old route-hiding rules into production.

This local fix does not claim that the production data/MCP migration is implemented. The source remains an example workspace; production readiness is established by the explicit data and command gates, not by appearance alone.
