# Lemma v6: complete data and MCP contract

**Revision 2 — 5 November 2026.** This is the normative data/command supplement to `Lemma_UI_v6_Direction_Plan.md`. It specifies future production behavior; it does not claim that these capabilities are already implemented. The corrected standalone mockup remains a local demonstration.

## 1. Governing requirement

**Supabase is the canonical application record. The app renders and edits that record; the chatbot reads and edits the same record through MCP. Every owner-maintainable application datum and relationship must be maintainable through MCP. No feature is complete with an app-only mutation path, a chat-only shadow store, or a browser-only authoritative value.**

An explicit instruction in chat is an authorized user action, just like an explicit action in the app. The chatbot must be able to create, change, organize, correct, archive, restore, and delete the owner's records through validated commands. It must not require the owner to open the app merely to repeat an approval already given in chat. Unsolicited tutor suggestions remain proposals; this does not restrict a direct owner instruction.

“Everything” covers all application data below, including historical corrections, relationships, preferences, source text/files, schedules, effort, drafts, private reflections, and reminder management. Derived values are changed by correcting their inputs. Server identity, audit provenance, cryptographic credentials, and database DDL are handled by their explicit lifecycle commands rather than arbitrary field overwrites. This distinction must not be used to omit a legitimate owner-data operation.

The browser may maintain transient rendering state and an account-bound offline outbox. Neither replaces persisted business state. A record created or changed in chat must appear in the app, and the next MCP read must see a change made in the app.

## 2. Reviewed baseline and concrete gaps

The second review checked `main` at **`bbc5fdbd5f08caa4ab2d7543def415acad72bab5`**, 5 November 2026, 10:38 UTC, the current MCP registry/field allowlist, and read-only metadata for all 26 public tables. `Lemma_v6_Schema_Inventory.json` records every current column, type, nullability, generated-column status, primary key, and reported relationship without row contents or credential values.

The current MCP has 23 tools, but its editable-field coverage is incomplete. For example, the generic settings allowlist omits maximum interval, fuzz, load balancing, learn-ahead, weights/tuning, macros, UI, and notification preferences; it also omits project pinning, subject/style ordering, Atlas coordinates, and several source-management fields. Device/hold management, full historical correction, drafts, and all new study records need explicit coverage. Existing transactions and undo are valuable foundations, not evidence of full CRUD parity.

`Lemma_v6_Capability_Registry.json` classifies all 310 observed columns, names required mutation/managed-command paths, maps 35 prototype state keys, and enumerates 16 new resource contracts. No current column is unclassified. This establishes planning coverage; runtime behavior still has to pass G1–G7.

The first plan also omitted durable representations for manual topic practice, activity presets, attention events, dated rituals, saved review rounds, draft conflicts, pending delayed decisions, overlap acknowledgements, and several cross-screen preferences. These are addressed below.

## 3. Persistence rules for every field

Every persisted resource has an owner-bound stable identity, schema version, creation/update provenance, and an optimistic-concurrency version where mutable. Define field types, required/null behavior, defaults, limits, valid enums, clear-vs-unchanged patch semantics, relationship constraints, deletion/restore behavior, and migration source before implementation starts.

All current columns must be classified in the capability registry as one of:

1. **Owner-editable:** available through an MCP and app command with the same validation.
2. **Command-managed:** changed by an explicit operation such as grade, merge, complete, reorder, rotate, or restore; not an unexplained restriction.
3. **Derived/audit:** computed from authoritative inputs or created by a transaction. It has a documented correction/rebuild/undo path where its inputs can be wrong.
4. **Credential/transport:** readable as safe metadata and modifiable through register, connect, rotate, revoke, retry, or disconnect. Do not expose private key material as ordinary chat content.

An omitted field, silently ignored patch, unsupported relationship, or unclassified column fails the completeness gate. Immutable record IDs/ownership are server assigned; user-facing slugs/codes can be renamed through a command that preserves old links and resolves historical references.

Dates are `YYYY-MM-DD`; instants are UTC timestamps with explicit IANA zone intent where needed. Durations use an explicit unit. Intervals are half-open. IDs are never inferred from display names, array positions, or checkpoint counts. Cross-owner references fail at the database boundary, including from the privileged MCP execution path.

Required additive extensions to existing records must be included in the migration contract, not assumed to exist:

- Mutable aggregates need a concurrency version and actual actor/client provenance. Relationship-set replacement needs an aggregate version so concurrent child-edge edits cannot silently pass a parent check.
- `session_events` needs a business occurrence instant, seeded from current `created_at`, plus superseding/void/correction metadata. Keep creation audit time distinct so the owner can correct when evidence occurred without falsifying when the correction was recorded.
- `proposals` needs payload/base-target versions, an explicit grouping identity where the UI groups records, structured source/version/page citations, and withdrawal/revision semantics. New kinds/states must be gated for older clients.
- `reviews` needs scheduler/policy/parameter version references and operation/receipt identity sufficient for historical replay. Snapshot or retain each referenced parameter version; a dangling hash is insufficient.
- Source files/pages and relevant note/proposal content need readable revision identity/content hashes so citations and edit conflicts survive later corrections or replacement.
- User-facing project/concept slugs and checkpoint codes need owner-scoped prior-name aliases resolved to stable IDs. An alias relation may be a supporting table owned by its parent resource; rename/delete/restore commands maintain it transactionally and prevent namespace collisions.
- Existing settings need typed planning/focus/preference extensions with validated units, partial-update behavior and unknown-key preservation. Existing audit/undo, export and change propagation must cover these additions.

These extensions are part of the existing resource capabilities, not extra optional features. The schema inventory describes today's database; it does not imply these columns or supporting relations are already present.

## 4. Existing database: required owner capabilities

All rows support owner-scoped read/search, stable pagination, and export. “Delete” below means the correct domain operation—soft deletion, cancellation, voiding, merge, or an explicit purge—not a dangling-reference SQL delete. Each listed command family must be callable through MCP and the app's command layer; the app need not expose every advanced command as a top-level button.

| Current table | Data the owner can maintain | Required command behavior |
| --- | --- | --- |
| `settings` | Every memory/review preference, 21 validated FSRS weights, macros, time zone/rollover, tutor/master prompt, preferred chat, appearance and notification settings | Read/patch/reset sections, tune/set/restore weights, rotate connector credential. Merge partial JSON settings without losing unknown keys. Connection-seen timestamps describe actual activity. |
| `subjects` | Name, glyph, hue, order and membership through related records | Create, patch, reorder, merge, restore, delete unused; deleting a used subject requires an explicit reassignment/merge policy. |
| `projects` | Title, slug, subject, goal, style, status, target date/label, prompt, pinning | Create draft/full path; patch; activate/pause/finish/archive/restore/delete with impact preview; rename slug with alias preservation. System/backlog role and counters use explicit managed operations. |
| `sources` | Metadata, kind/order, outline, original file, extracted/transcribed content, verification/coverage status and provenance | Create/import/upload, patch metadata, replace/re-extract file with version history, reorder, mark plan coverage, delete/restore as supported. Storage object and database state must reconcile. |
| `source_pages` | Page/label/text, verification/confidence, transcription corrections | Read/write one or bounded pages, revise/delete text, verify and export; recompute generated `chars`/`tsv`. Preserve revision and actual transcription provenance rather than claiming a different author. |
| `concepts` | Name/slug, subject, blurb/topic, hierarchy level/parent, star and pin coordinates | Create, patch, reparent/reorder where defined, pin/unpin, merge, delete with reference policy; preserve aliases and validate hierarchy. |
| `concept_links` | Prerequisite/related edges | Create, change kind/direction, remove, replace an explicit edge set; validate endpoints, duplicates, self links and prerequisite cycles. |
| `checkpoints` | Code/order/stage, title, objective, criterion, steps, sources/pages, status/current step, due date and recheck settings | Create/patch/reorder/move; demonstrate/reopen/defer/recheck; explicit owner correction with reason; delete with dependency impact. Changing a step list must reconcile resume steps and linked tasks. |
| `checkpoint_prereqs` | Checkpoint prerequisite edges | Add/remove/replace/move edges atomically; prevent cycles; recalculate availability without erasing completed evidence. |
| `checkpoint_concepts` | Concepts taught by checkpoints | Attach/detach/replace mappings; validate project/owner scope and update Atlas projections. |
| `checkpoint_sources` | Multiple source/page citations | Attach/update/detach/reorder if ordered; retain source versions and readable citations after later source edits. |
| `styles` | Key/name/icon/instructions/order | Create, patch, rename with reference updates, reorder, delete/reassign/reset defaults; preserve per-owner scope. |
| `sessions` | Tutor goal/style/checkpoint, summary/outcome, resume question/note/step, actual client, start/end and legacy duration corrections | Start/resume/end/reopen/correct/archive/delete with linked-event policy. Number allocation is atomic; a chatbot cannot fabricate measured focus effort by ending a conversation. |
| `session_events` | Evidence, attempts, hints, explanations, rechecks and notes with outcomes/checkpoint references | Append, correct/supersede, void/delete as permitted and inspect revisions; rederive checkpoint state when evidence is corrected. Record actual actor and a correction reason. |
| `misconceptions` | Label/concept, evidence-backed occurrences and resolution | Create, patch, merge, resolve/reopen, correct occurrences, delete; derive occurrence totals from defined evidence or record an explicit correction. |
| `notes` | Front/back, type/kind, tags, subject/path/checkpoint/session/concept/source references and status | Create directly on instruction or via proposal, edit, retag/relink, suspend/restore/delete. Type changes reconcile cloze/reverse card ordinals while preserving compatible scheduling/history. |
| `cards` | Scheduling state, due date and memory parameters | Grade/reschedule/reset/restore/correct through versioned scheduling commands; expose a validated explicit schedule override. Card variants are created/reconciled by note operations; do not break sibling/history relationships. |
| `reviews` | Rating, confidence, review instant, duration and historical errors | Grade/record/import, undo, correct or void historical review. Rebuild affected card scheduling consistently using recorded algorithm/parameter versions or a disclosed explicit replacement state. Do not leave history and current schedule contradictory. |
| `proposals` | Card/edit/plan/change payload, rationale, citations, grouping, draft revisions and decision | Create/edit/revise/approve/reject/reopen/withdraw/remove as defined. Direct chat approval uses the same command as app approval; approval checks expected proposal/target versions. |
| `card_comments` | Body and open/addressed/dismissed state | Create/edit, address/link to proposal, dismiss/reopen, remove/restore; maintain resolution metadata. |
| `diagnostics` | Kind/topic, evidence/severity, occurrence history, status and links | Create, patch/correct, confirm/resolve/reopen, merge and delete; do not leave a read-only chatbot-only diagnostic store. |
| `actions` | History visibility, correction/undo intent and explicit account purge | Read/inspect/undo/redo where valid, export and owner-requested purge policy. Receipt identity, actor and actual transaction history are generated, not silently rewritten. |
| `action_changes` | Before/after details of transactions | Inspect with secret redaction; reconstruct/undo affected records; include in defined history export/purge. No unsupported application-data exception hidden behind an audit table. |
| `push_devices` | Label, enable/disable/remove/restore, platform and subscription lifecycle | List/register verified browser subscription, rename/revoke/restore/test; endpoints/keys change through registration, delivery health through actual outcomes. MCP can manage devices without being able to synthesize browser permission or a valid subscription. |
| `notifications` | Scheduled/reminder intent, title/body/deep link before delivery, action/hold and delivery history | Preview/schedule/update/cancel, mark read, act/dismiss/snooze, retry when valid and remove history. Sent/failed state reflects transport receipts; content corrections retain original delivery provenance. |
| `notify_holds` | Scope and end instant | Create/change/clear/expire holds through both clients, with consistent zone and reminder recalculation. |

Database views and aggregate fields are projections. Their registry entries must identify source records and commands that change them. The application cannot promise that a user can directly set an aggregate badge or generated search vector.

Authentication sessions, connector credentials, and original source-file bytes also have named lifecycle operations. Expose authenticated profile/sign-out and secure account-deletion workflows where applicable; no general SQL/DDL tool is needed to achieve full application-data control.

## 5. New v6 records: complete minimum field sets

These are required domain contracts. They can be implemented as normalized tables or carefully typed child structures, but none may be left as an unexplained localStorage key. Every resource below requires create/read/update/delete-or-correct semantics through MCP and the app command layer, ownership, versioning, export, and an audit/undo policy.

| Resource | Minimum fields beyond common identity/owner/version/provenance | Lifecycle and integrity |
| --- | --- | --- |
| **Study entries** | Source `timer/manual/import`, intent/title, optional subject/project/checkpoint/tutor-session/task/block/preset IDs, mode `Pomodoro/Flowtime/open`, state, start/finish/saved instants, optional focus rating/reflection and start-energy self-report, approximate-time flag; current phase/cycle, phase budget/deadline, captured focus/break/cycle configuration, timer lease identity/version/expiry | `draft → running ↔ paused/break → saved` or `discarded`; only saved effort counts. Changing default preferences cannot silently change an active entry's captured settings. Correction revises an entry without duplicate calendar actuals. |
| **Study intervals** | Entry ID, kind `focus/break/excluded`, start/end instants, zone-at-capture, optional exclusion reason/correction reference and approximation provenance | At most one open interval for the active entry; end after start; no implicit 24-hour cap that drops a legitimate 25-hour civil day. Reject unreasonable input visibly. Logged time excludes breaks and explicitly deducted drift intervals. |
| **Study events** | Entry ID, kind, instant, optional duration/note/related record, correction/void reference | Record pause/resume/break transitions, distraction notices and opt-in drift/urge events. Counts and timelines derive from these events; no diagnosis or inferred attention score. |
| **Activity presets** | Label, optional subject/path/checkpoint, default mode/focus/break lengths, position and active/archive state | Supports custom activity choices. Rename/archive preserves past entry labels and references. |
| **Tasks** | Title/body, optional subject/path/checkpoint/topic/deadline, estimate in minutes, priority, due date or due instant with explicit semantics, position, state/completed instant | Backlog/in progress/completed/cancelled; split and carry-over preserve identity and remaining work. Task completion and mastery remain independent. |
| **Calendar blocks** | Kind `study/review/practice/busy`, title, start/end instants, intended IANA zone, optional task/learning/deadline links, state, recurrence-series/occurrence references if exposed | Create/move/resize/cancel/restore; actual effort is a derived projection. Editing one recurring occurrence cannot move an entire series silently. |
| **Deadlines/milestones** | Title/kind, due date or instant, optional subject/path/checkpoint, remaining effort estimate and its source, state | Supports standalone exam/seminar milestones. Existing project/checkpoint dates are projected into the same view without duplicate authoritative deadline rows. |
| **Manual practice topics** | Title, optional subject/concept/checkpoint, next practice date, cadence policy, last-practiced instant, active/archive state | Distinct from FSRS cards. Practice completion is recorded as an event; advancing a due date follows an explicit policy and is undoable. |
| **Parked thoughts** | Entry link if present, text, created instant, unresolved/converted/dismissed state, destination resource/ID | Create/edit/resolve/reopen/delete. Task conversion is atomic and retry-safe; card/tutor conversion requires complete destination fields, not a fake completed action. |
| **Study goals** | Period type/date range, owner zone, optional subject/path scope, target minutes, effective dates and archive state | Weekly intentions and subject goals use explicit units. No display-name-to-path lookup; no duplicated goal value in an unrelated settings blob. |
| **Dated day plans/closures** | Owner civil date/zone, intention, capacity/availability snapshot and source versions, selected tasks/placements, state, closure instant, tomorrow-first-task reference, dated coach/ritual choice | Draft/preview/committed/closed. Daily flags are dated, so yesterday's `shutdownDone` cannot permanently complete future days. Preserve explicitly unplaced work and unchecked carry-over choices. |
| **Overlap acknowledgements** | Stable affected block/entry IDs and versions, overlap window, optional reason and chosen disposition | Acknowledging one overlap does not suppress unrelated conflicts. Changing a participating interval invalidates its acknowledgement. |
| **Review runs** | Owner, full filter, selected deck IDs, card/time budget, settings/scheduler version, ordered item IDs and expected card versions, current position/reveal state, start/pause/end instants and state | Running/paused/exhausted/completed/abandoned; answers link to durable review receipts. Resume never replays a grade; stale card changes are reconciled. Selection count equals actual selected items. |
| **Proposal drafts** | Proposal/target IDs, base versions, complete edit payload, draft version, state and edited instant | Draft/saved/submitted/discarded; show base/current/draft on conflict. An unsent draft is not approval. Cross-device editing must not overwrite a newer draft silently. |
| **Commands/receipts and pending decisions** | Operation ID, actor/client, schema version, payload hash, expected entity versions, status, scheduled-not-before/undo-until instants where relevant, result/changed versions, error/retry classification, action reference | Accepted/scheduled/executing/succeeded/failed/cancelled/uncertain. Retrying an operation ID retrieves its result; a changed payload with the same ID is a conflict. Delayed approval needs a server executor, not a browser timer. |
| **Owner sync checkpoint/change feed** | Opaque ordered cursor, changed resource identities/versions, tombstones, commit/read-model version | Transactionally visible changes from app, MCP and workers. Catch-up/reset handles missed messages; a client reconnect must not lose a write because of a naive timestamp or ID ordering assumption. |

Additional mandatory settings: focus/open/Pomodoro defaults and cycle lengths; daily intention/minimum qualifying day; planning window, gap and maximum consecutive-work constraints; week start and 12/24-hour format; review batch/time budget and review-reservation preference; optional attention controls; timer-accessory preference; owner-wide appearance/density/motion; subject/path links where the UI exposes them. Store actual IDs, preserve unknown keys, and use one canonical retention editor.

Specify Flowtime and the long-session guard too: the prototype's `guard` is in hours, `gap`/focus/break lengths are in minutes, and legacy subject goals are in hours. Normalize units explicitly during an approved import; never reinterpret `6` hours as `6` minutes. Each active entry captures its selected configuration. An energy picker stores its optional low/steady/high self-report instead of discarding the entered value.

`drift` is a duration in minutes, not a count. Persist reported duration, note, event instant and entry/interval scope; derive noticed-event counts separately. Deduct drift only through a recorded interval correction, such as an explicitly labelled “exclude the last N minutes,” with enough available effort and no double subtraction. A duration-only historical report remains approximate; changing a timer counter while leaving saved intervals unchanged is invalid. Manual topic practice stores rating/response/time in practice events and uses its own versioned cadence policy, without adding a card review or altering FSRS.

Store user preferences in the database. Keep viewport size, keyboard state, focus location, scroll position, open menus, temporary date navigation and hover state client-local unless an explicit saved-view feature requires synchronization. Device-specific preference overrides must be labelled and must not overwrite owner-wide preferences.

The prototype contains calendar/native-service previews. A real calendar connection requires provider/account identity, selected remote calendars, connection and sync status, error/cursor metadata, remote event mappings, and a credential lifecycle in an appropriate private store. Do not render “connected” from a boolean. Native surfaces require actual platform support. Explicit previews may remain labelled previews; a visible production Connect/Sync/Install action cannot ship without a working end-to-end operation.

## 6. Every screen has a complete projection

| UI surface | Authoritative inputs and missing-data behavior | Commands and refresh targets |
| --- | --- | --- |
| Today | Resume checkpoint/conversation, active entry, civil-day saved union, dated intention, next planned block, selected review batch, pending proposals | Start/resume entry, change intention, start next block, add task; refresh Today/Calendar/Progress and focus accessory. Empty account has honest onboarding. |
| Focus and accessory | Same active entry, interval/phase/cycle, actual deadline for current focus/break, parked thoughts and notice events | Start/pause/resume/break/finish/save/discard/correct/park. Phase changes and save work from chat too; browser ticking is display prediction. |
| Calendar | Bounded time window, saved-interval projections, planned/busy blocks, deadlines, owner zone, conflict acknowledgements | Create/move/resize/delete/restore; day/week/month/agenda share the same records and totals. Source not loaded is not zero availability. |
| Backlog/planner | Tasks, deadlines, practice topics, availability/goals, review demand and qualified estimates | Add/edit/split/reorder/complete; preview placements; commit only selected items against preview versions. Report unplaced work with a reason. |
| Ritual/closure | Dated plan, log, unresolved thoughts, carry-over choices and tomorrow's first step | Commit intention, approve selected placements/carry-over, resolve thoughts, close/reopen date. No singleton lifetime completion flag. |
| Time log/attention | Saved entry/interval/event revisions and explicit approximate records | Edit/split/void/restore/export; correct corresponding derived Calendar and Progress immediately. Missing rating is unknown, not “poor focus.” |
| Paths and project | Real subject/project identities, ordered stages/checkpoints, source/session counts, target and throughput evidence | Create/rename/move/pin/archive/switch; source/session/log projections refresh. Forecast without sufficient evidence is unavailable/qualified. |
| Checkpoint/session/source detail | Criterion/steps, prerequisite states, evidence/rechecks, original tutor events, source/version/page citations | Correct/reopen/demonstrate/relink, manage original PDF/page text and transcription, resume tutor. No source text or evidence is synthesized. |
| Review and done | Owner study-day eligibility and quotas, filters, selected run, durable grade receipts and next arrivals | Select/start/pause/resume/grade/undo/correct/finish. All-due and selected-batch counts are different named fields. |
| Cards/detail | Notes/variants, filtered bounded results, scheduling version, history/comments and continuation cursors | Create/edit/reconcile/suspend/reschedule/reset/delete/restore/comment. Full-page count is not total count. |
| Inbox/plan review | Proposals and selected group, before/after targets, citations/rationale, draft versions, decision receipts/undo state | Edit/save draft/approve/reject/withdraw/reopen/undo/batch. Missing rationale says unavailable. Pending results survive refresh and can be inspected/cancelled in chat. |
| Atlas | Real concepts, hierarchy/edges, checkpoint links, saved pins, derived evidence and due counts | Create/edit/reparent/merge/link/pin/delete; list and map are equivalent projections. Synthetic grouping nodes are labelled and excluded from concept totals. |
| Progress | Committed effort union, distinct tutor estimates, range-correct evidence/review statistics, subject partitions and quality flags | Corrections happen on source records via the same command path; charts expose exact values and provenance. No hard-coded 28-day data under a 7/30/90-day label. |
| Settings/account/reminders | Complete settings, styles/subjects, connector state, devices/holds/history, export capability and actual platform status | Patch/reset/tune, manage subjects/styles/devices/holds, rotate/revoke, export/delete account. MCP covers the same owner operations; actual device/OAuth interaction is identified when required. |

Each production read model declares scope, owner/day convention, time zone, filters, `asOf`, snapshot/cursor, data quality and continuation. Distinguish loading, genuine empty, filtered empty, partial, stale, unavailable, failed, not-found and conflict states. Do not generate precise badges, rationale, storage sizes, clearance dates, mastery or time from missing inputs.

## 7. Shared command protocol

Use one server-side dispatcher/RPC command layer for app, MCP and scheduled workers. Keep the existing MCP tools as compatible adapters; do not leave two scheduling or mutation rule implementations diverging behind them. Existing browser FSRS calculations may preview results, but the authoritative server command computes or validates the versioned transition identically for both actors.

Minimum command envelope:

```json
{
  "operationId": "client-generated-uuid",
  "schemaVersion": 1,
  "resource": "tasks",
  "operation": "update",
  "target": {"id": "stable-record-id"},
  "expectedVersion": 7,
  "patch": {"estimateMinutes": 45}
}
```

The server derives owner and actual actor/client from the authenticated connection. Neither comes from an arbitrary chatbot argument. A receipt includes operation ID/status, changed IDs/versions, action/undo reference, commit cursor, validation/conflict detail, and any required next step. Reject unknown fields; distinguish omitted fields from explicit null.

MCP must expose resource discovery and field/operation schemas so the model can discover less common edits without carrying every schema in `tools/list`. Existing `get/search/edit/add/delete/history/undo` can delegate to this registry, with dedicated commands for complex lifecycles. Tool-count and compact-description budgets must not become a reason to omit capabilities.

For one requested user change, execute one bounded transaction with deterministic validation, version checks, domain updates, audit/receipt and change-feed publication. On a duplicate operation ID, look up the receipt before stale-version rejection. An ambiguous transport failure is not a failed operation: retrieve the receipt and current state before retrying.

Bulk operations name an explicit selected ID/version set. Define all-or-nothing versus per-item results. Do not approve a newly arrived proposal that was not in the user's selected batch, or silently delete a whole subject because its list was only partially loaded. Preview/dry-run returns affected dependencies and a versioned plan; commit refuses a stale preview. Bounded pages and resumable jobs provide full coverage of large accounts rather than silent fixed row caps.

A user's direct instruction can apply a reversible change through chat immediately. Unsolicited suggested changes are stored as proposals; the user may approve them in either channel. Destructive dependency changes use a concrete impact preview when needed. Protect that workflow consistently instead of adding an app-only confirmation requirement.

## 8. Cross-client synchronization and correctness

- Both app and MCP mutations produce the same versioned receipt and owner-scoped change notification. The app invalidates affected bounded projections; MCP context reads current records rather than treating an old conversation packet as authority.
- A subscription alone is insufficient: reconnect uses an ordered catch-up cursor or a full bounded resync. Include tombstones for deletions, account/mode in cache and outbox keys, and compatible schema versions. Clear private caches on sign-out or account switch.
- A timer running in two clients uses an owner/device lease and expected version. A backgrounded browser does not extend a Pomodoro indefinitely. A chatbot can pause/correct/finish the same timer with an explicit instruction; doing so updates the visible accessory.
- Pending decision deadlines are server instants and execution is durable. Define extension/cancellation and what happens offline or after the deadline. A toast countdown cannot claim server success. Feedback/Undo remains reachable after navigation or a later unrelated save.
- App and MCP share review selection: eligible filters, note/sibling deduplication and quota policy are applied in the agreed order before batch truncation. Existing N3 work is preserved; SQL and connector parity remain an explicit gate.
- A saved interval split preserves the exact union; a duration correction cannot silently retain contradictory old intervals. Define a deterministic overlap-attribution rule and preserve raw records with quality flags. A one-day technical limit must not discard a legitimate interval at DST.
- Scheduled estimates do not create actual effort. Actuals do not silently change the user's remaining task estimate or complete a task; that requires an explicit policy/command. A busy block has no focus effort.
- Subject/path reassignment, merges, code/slug renames, source replacement, note-type changes, and evidence/review corrections each have an explicit policy for historical references and derived values. Validate the entire affected graph, not only the edited row.

## 9. Screenshot defect: required invariant and delivered source repair

The attached Inbox screenshot is reproducible in the supplied v6 source. `design-system.css` hides main navigation on the proposals route; the session component returns null for proposals; and a higher-specificity sticky rule overrides the later fixed decision-bar rule. This removes expected bottom chrome and leaves the decisions above an empty gap.

The corrected standalone source removes those route-specific exclusions, renders the decision bar through a body-level portal outside route transforms, measures navigation/timer height, anchors decisions directly above visible chrome, reserves content padding, and places feedback above the whole stack. Keyboard-focus reveal accounts for the decision bar too. This is a reference fix, not a production-repository deployment.

The invariant is semantic, not a hard-coded pixel height: **in portrait Inbox, navigation remains reachable; an active timer remains reachable; decision controls are above them; their rectangles do not overlap; and the final content/focus target can scroll clear of the entire stack.** Landscape may use the established compact timer and menu destinations. With no active timer, decisions sit immediately above navigation. Modal editors restore the stack on close; route changes remove the old decision portal.

The downstream implementation must reproduce that behavior, including Day/Night, 320/360/390 widths, the screenshot-like reduced viewport, 200% text, scroll compaction, keyboard/visual-viewport changes, safe areas, pending feedback, edit/Escape and back navigation. The new rendered regression must fail on the original artifact and pass on the corrected artifact. Physical Android browser/IME and iOS safe-area acceptance remain release checks.

## 10. Completeness and release gates

Create a machine-readable capability registry covering every current schema column and every new resource/action above. `Lemma_v6_Schema_Inventory.json` is the observed schema input, not evidence of implemented MCP access. Use it to fail a contract check when a migration adds a field/table without a mutability classification, command/read mapping, export policy, and appropriate tests. Add the screen/action-to-resource mapping to that same check.

| Gate | Required passing evidence |
| --- | --- |
| **G1: schema coverage** | Every current column and every new resource/relationship classified; data types/constraints/defaults/lifecycle/deletion and migration are specified. Zero unnamed local business-state keys. |
| **G2: command parity** | For every editable field/relationship: create/change through MCP, observe in the app, change through the app, observe in MCP, then delete/restore/correct and inspect the same audit receipt. This includes rare settings, pins, ordering, source pages, historical records and private notes on explicit request. |
| **G3: complete UI data** | Every displayed metric, badge, list, state and enabled action maps to persisted inputs or an explicit deterministic projection; null/error/partial states are exercised. No fabricated seed/placeholder content in live mode. |
| **G4: consistency** | Same selection, scheduler, time-zone, interval-union and evidence fixtures pass through server/app/MCP; retry, conflict, partial batch, delayed decision and reconnect cases pass. |
| **G5: preserved history** | Representative existing account upgrades without lost records/links/schedules; historical estimates remain labelled; export/restore and rollback preserve new records. No database reset. |
| **G6: ownership and deletion** | Two-owner tests reject cross-owner IDs/relationships under normal app and privileged MCP paths. Merge/deletion/purge impacts are tested; worker and storage changes obey the same ownership model. |
| **G7: visible behavior** | Exact-artifact browser screenshots and geometry, full route/navigation states, dialog/keyboard/Back and long-math checks; the reported Inbox regression is blocked. |

For G2, testing a few successful MCP examples is insufficient: enumerate every registry field and operation. For transitions where literal mutation is invalid, test the named semantic operation and verify its resulting data. Test list/search completeness past former 1,000/2,000-row caps and offset/cursor boundaries.

The first durable study slice must already pass both-channel create/update/delete and synchronization checks for the resources it introduces. MCP write parity is not a later optional enhancement. The full v6 release requires all seven gates; a partially implemented resource remains disabled in production until its complete owner-data path is accepted.
