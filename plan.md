# Lemma — canonical execution plan and chatbot handoff

**Protocol v3 · 27 October 2026.** This is the only engineering roadmap and task queue. Git history retains older roadmaps. It is written so that any model (including smaller ones) can execute it literally: every decision needed for the NEXT task is already made below. If something you need is **not** decided here, stop and ask the owner instead of inventing policy. A later **"follow the plan.md"** means implement the next bounded slice; a request only to plan/review does not authorize code changes.

## 0. Operator instructions

Read current `main` → this plan → the files named in your slice → do one slice → verify → commit → update §1. Agents work **consecutively, never simultaneously**. No old chat, local workspace or particular model is required.

**Quick start (run literally):**
1. `git clone https://github.com/Mymayankyadav/lemma && cd lemma && git log -5 --oneline` — record the HEAD SHA.
2. If HEAD is newer than the SHA in §1, read `git log <§1 SHA>..HEAD` and adopt that work first (update §1 to describe it).
3. `gh run list -L 5` (or open the Actions tab). If the latest run on `main` FAILED, fixing it is your task before anything else.
4. `npm ci && npm run test:syntax && npm run test:plan`. Browser tests need Chromium: `npx playwright install chromium`; if that fails, say so in §1 and rely on CI.
5. Find the first unchecked slice in §2 "Current task: execution slices". Do only that slice.

**Product goal:** a private, persistent mathematics learning workspace for a PhD student. Curate shared knowledge, approve a thoughtful study plan, attempt proofs with interchangeable tutors, retain evidence and misconceptions, and review useful cards. Switching Claude/ChatGPT or devices should not require restarting the lesson. Supabase is the authenticated source of truth; durable local storage supports immediate interaction and offline work.

**Scope boundaries**
- Preserve the imported app, original FSRS-6, mathematical rendering, prerequisite links, review/Undo, import/export and user data. Extend existing modules; no framework rewrite or parallel scheduler/store.
- **No new image-upload features:** no camera, OCR, scanning, image-based tutoring, gallery or media-management project. Preserve compatibility with existing card media without expanding it.
- Exception: private file attachments may support a study project's shared knowledge. Start with curated text, Markdown and source references; accept PDFs/documents only when needed, with citations and bounded retrieval. This is not a general upload product.
- "Shared" means the same owner's knowledge available to successive tutors, not public sharing or multi-user collaboration.
- Optimize for understanding and continuity, not chat volume, decorative dashboards, streak pressure or speculative AI infrastructure.

**Hard "never" list (violating any of these is a failed session):** force-push; modify Carrel; put secret keys in client code, repo or plans; delete/clear dirty caches, receipts, outbox entries or review history to make a test pass; weaken an assertion or `test/plan_protocol.js` to make it pass; re-import the original ZIP or rewrite `src/fsrs.js` maths; mark a task DONE without its gate; claim a check passed that you did not see pass.

## 1. CURRENT HANDOFF

**Last verified handoff:** 2026-10-27; at baseline `main@68678073454fdfa0bb459747b34ada73386d73ab`, SYNC-03 S1 was started: diagnostics bundled, code-unit ordering and new Node tests wired. **State: READY_FOR_NEXT_AGENT, verification pending.** SYNC-03 remains NEXT until S1 gates are observed; do not start S2 before closing S1.

| Field | Evidence / limit |
| --- | --- |
| Known-good main baseline | `main@4bfe3ab`; [regression 40444108939](https://github.com/Mymayankyadav/lemma/actions/runs/40444108939) SUCCESS. Previous conflict-controls baseline `92a67c8` ([40441775123](https://github.com/Mymayankyadav/lemma/actions/runs/40441775123)). |
| Latest inspected regression | **SUCCESS** 40444108939 at `4bfe3ab` (CI `npm ci`, `test:syntax`, Chromium, full `npm test`). Run 40444075423 at `4ffe1db` was CANCELLED (superseded). Local full suite NOT RUN by the plan editor. |
| Documentation validation | Updated plan text; `npm run test:plan` is **NOT RUN locally** (GitHub connector environment lacks an installed repo). Await CI. |
| Web deployment | [Pages 40444108945](https://github.com/Mymayankyadav/lemma/actions/runs/40444108945) SUCCESS at `4bfe3ab`. `review_replay.js` is not in the bundle, so deployed behaviour is unchanged from SYNC-02. |
| Cloud confidence | SYNC-02 conflict comparison/choice is verified with fault-injected IndexedDB and real Chromium on **mock transport only**. Divergent schedules are still blocked by `review_replay_required` in `src/app/sync_browser.js` (resolution validator, ~line 163). |
| Backend security check | NOT RUN; no backend/schema change. Nine tracked migrations; verify applied state before any backend work. |
| Current blocker / unfinished work | S1 changes are committed but **not locally executed**: `review_replay.js` is now in the bundle; `test/review_replay.js` and ledger tests are in `test:replay` and `npm test`. Await a passing replay/syntax/build/plan gate (prefer full CI) before checking S1. The diagnostics still only replay memory; schedule convergence (S2–S4) and live Supabase verification remain absent. |

**Next action, in one sentence:** verify S1 on the current GitHub Actions regression (`test:replay`, `test:syntax`, `build`, `test:plan`); when green tick S1 and proceed to S2 deterministic schedule projection, otherwise repair the specific failing gate.

The record above describes inspected evidence, not today's mutable HEAD. Overwrite it after each slice; do not append a second handoff.

## 2. Task queue

States: **DONE** (gate passed, with evidence), **NEXT** (exactly one task), **IN_PROGRESS**, **BLOCKED** (dependency unfinished), **LATER**. Choose the first row whose dependencies are DONE. Large rows are split into slices; one slice per session is normal. Keep remaining criteria in the row.

| ID | State | Depends on | Requirement and completion gate |
| --- | --- | --- | --- |
| **HANDOFF-01** | **DONE** | — | Canonical plan, short entry points and existing `test:plan` guard. Maintain them with every change. |
| **FOUNDATION-01** | **DONE** | — | Imported app, web build, local cards, original FSRS/rendering and baseline tests exist. Preserve them. |
| **SYNC-00** | **DONE** | — | Account/outbox/RPC/ledger infrastructure exists in source. This is not completed live sync. |
| **SYNC-01** | **DONE** | SYNC-00 | Editor durability/crash recovery, account invalidation and durable import recovery; browser gates passed in regression 40419737189. |
| **SYNC-02** | **DONE** | SYNC-01 | Conflict evidence, transactional note/profile/tombstone resolution, three-version comparison and explicit choice controls. Gate passed in main regression 40441775123 (mocked transport, not live sync). |
| **SYNC-03** | **NEXT** | SYNC-02 | Converge review/Undo schedules deterministically from the immutable ledger using existing `FSRS.preview` and `ReviewLedger`. Never take the latest card snapshot as truth; never fabricate legacy history. Gate: concurrent offline reviews/Undo, equal timestamps, timezone/rollover, fuzz and parameter changes produce the same card state on both devices; unsupported histories stay preserved and explicitly blocked. Follow slices S1–S4 below. |
| **SYNC-04** | **BLOCKED** | SYNC-03 | Enable account workspace only after explicit enrollment/backup. Route every mutation through durable staging; automatically push after local commit, retry on reconnect/foreground and refresh on remote invalidation. Distinguish device-saved, queued, cloud-confirmed, conflict and failure. Gate: authenticated two-browser/two-identity tests, offline restart, auth expiry, network loss after commit, deletes and RLS isolation. Routine use needs no manual Sync button. |
| **UI-01** | **LATER** | SYNC-01 | Apply the UI contract below to existing screens incrementally. Keep working routes and controls while Study is built later. Gate: mobile/desktop light/dark screenshots, keyboard navigation, 200% text, long mathematical expressions, empty/loading/error/offline states and existing review flows. |
| **KNOWLEDGE-01** | **LATER** | SYNC-04, UI-01 | Reuse context/source/section tables for private project knowledge: goals, background, notation, references, verified skills and editable summary. Scope context, plans and evidence to stable project/context IDs. Version changes; distinguish learner-authored facts from tutor proposals. Optional documents need private access, size/type limits, extraction status, stable source/version/page IDs and removal controls; no OCR. Gate: two tutors retrieve the same accepted revision and cited excerpt without loading the entire collection; another owner cannot read it. |
| **PLAN-01** | **LATER** | KNOWLEDGE-01 | Build context→draft→review→approved plan and a checkpoint screen for objective, attempt, hints, feedback, evidence and next action. Strong-model planning is user-selected and occasional. Reuse existing schema/RPC, first verifying event append-only enforcement, context revision safety, publication metadata/idempotency and approval permissions. Amendments need a diff and acceptance; preserve unaffected checkpoint IDs/evidence. Gate: 12-checkpoint plan, two demonstrated checkpoints, mid-proof resume, accepted prerequisite amendment and rejected stale revision; failed/retried writes never duplicate evidence. |
| **TUTOR-01** | **LATER** | PLAN-01 | Deliver bounded Markdown/JSON handoff export/import first; add authenticated owner-scoped context/source/event/card/plan-proposal tools when supported. Validate imported schema, IDs and expected revisions. Tutors may propose cards/amendments; student approves. Persist attempts and hints; never mark mastery just because content was displayed. Gate: Claude→ChatGPT→Claude resumes the exact unfinished proof and hint level, stale writes fail, approved cards retain provenance and use existing FSRS. Core study works without a host-specific AI API or paid model call. |
| **ANDROID-01** | **LATER** | SYNC-04, UI-01 | Generate reproducible Capacitor Android project/builds from existing source. Verify safe areas, keyboard, Back, auth redirects, foreground recovery and offline launch. Optional due-review notifications: opt-in, quiet by default, configurable time, no stale duplicates, tap opens relevant review. Gate: physical-device install, permission denied/granted, offline edits/restart/reconnect and notification checks. Document APK update delivery; Pages deployment does not update bundled native assets. |
| **RELEASE-01** | **LATER** | All above | Verify backup/restore of cards, schedules, context, plan versions, events and source references; safe migrations, deliberate account erasure, scoped connector access and recovery. Test PWA service-worker offline/update separately (current UI suite disables it). Gate: restore round trip, no lost/duplicated events, cross-owner isolation, both tutor handoff directions and web/Android smoke checks. |

### Current task: SYNC-03 execution slices

Tick a box (`[x]`) in the same commit that completes the slice. When S4 is ticked and its gate passes, set SYNC-03 DONE and SYNC-04 NEXT.

**Background you need (verified in source, `main@4bfe3ab`):**
- A scheduled review appends a log entry `[occurred_at_ms, ord, grade, state_before, duration_ms, kind, event_id, scheduling_provenance]` in `Session.answer` (`src/app/session.js`). `kind` 0 = scheduled, 1 = cram (does not change the schedule).
- `scheduling_provenance` (version 1) contains: `weights` (21 numbers), `day_index`, `rollover_hour`, `timezone_offset_minutes` (`Date#getTimezoneOffset`, e.g. −330 for IST), `retention`, `max_interval_days`, `learn_steps`, `relearn_steps` (strings like `"1m 10m"`), `fuzz`, `load_balance`, `preview_at_ms`, `card_before`.
- Undo writes an immutable retraction `{retraction_id, target_event_id, reason:'undo'|'correction'|'reset'}`; `ReviewLedger.activeEvents(events, retractions)` removes retracted events.
- `FSRS.preview(card, now, cfg, env)` returns results for grades 1–4; `cfg` is built by `schedCfg()` in `src/app/model.js`; `env = {clock, key: noteId + ':' + ord, loadAt}`. Fuzz is seeded from `key` and `card.reps`, so it is deterministic. **`loadAt` (load balancing) depends on each device's local card load and is NOT deterministic.** `FSRS.makeClock` uses the device's local timezone, so it is NOT deterministic across devices either.

**Decisions (replay policy v1 — do not change without asking the owner):**
- D1 Order: active scheduled events per ordinal, sorted by `occurred_at_ms`, then `event_id` by plain code-unit comparison (`a < b ? -1 : a > b ? 1 : 0`). Never use `localeCompare` (it is locale-dependent).
- D2 Baseline: the first event's `card_before` must be a new card (`st === 0 && reps === 0`); otherwise block with `legacy_baseline_required` (already done in `inspect`).
- D3 Per-event parameters: each step uses **that event's** provenance (weights, retention, steps, maxIvl, fuzz). Parameter changes between events are therefore allowed in the schedule fold.
- D4 Clock: build a fixed-offset clock from each event's provenance: `dayIndex(ts) = Math.floor((ts − tz·60000 − rollover·3600000) / 86400000)`, `dayStart(i) = i·86400000 + rollover·3600000 + tz·60000`, where `tz = timezone_offset_minutes`, `rollover = rollover_hour`. If `clock.dayIndex(occurred_at_ms) !== provenance.day_index`, block with `clock_mismatch`.
- D5 Load balancing is **ignored** in replay (`loadAt: undefined`, `cfg.loadBalance = false`). Fuzz stays as recorded.
- D6 Step: `card = FSRS.preview(card, p.preview_at_ms, cfg, {clock, key}) [grade].card`. Only schedule fields `st, due, s, d, last, step, reps, lapses` come from replay; `flag`, `susp` and all other fields come from the chosen snapshot. Do not re-run leech logic.
- D7 Resets (`reason:'reset'`) and any missing provenance field stay **blocked** (`reset_policy_required` / `replay_unsupported`). This is an accepted SYNC-03 limitation.
- D8 Replay is used **only** to resolve divergent schedules (where `review_replay_required` is thrown today). Never rewrite a non-conflicting card's schedule on load.

**[ ] S1 — wire and test the existing diagnostics (implementation pushed; test gate pending).**
1. In `build.js`, add `'review_replay.js'` to `appFiles` immediately after `'review_ledger.js'`.
2. In `src/app/review_ledger.js` `activeEvents`, replace `localeCompare` with the D1 comparison.
3. Create `test/review_replay.js` (Node, `node:assert/strict`, same style as `test/review_ledger.js`) covering `LemmaReviewReplay.inspect`: missing note → `missing_note`; legacy log entry without event ID → `legacy_history`; dangling retraction → `incomplete_ledger`; first event with non-new `card_before` → `legacy_baseline_required`; reset retraction → `reset_policy_required`; two valid events → `status 'memory-only'` with identical result when the input arrays are reversed; an Undo removes one event from `activeReviews`.
4. In `package.json` add `"test:replay": "node test/review_ledger.js && node test/review_replay.js"` and insert `npm run test:replay` into `"test"` right after `npm run test:outbox`.
5. Verify: `npm run test:replay`, `npm run test:syntax`, `npm run build`, `npm run test:plan`; full `npm test` if Chromium works, else rely on CI.

**[ ] S2 — deterministic schedule projection (pure function, no UI/storage).**
1. In `src/app/review_replay.js` add `project(row, allEvents, allRetractions, outbox = [])`. First call `inspect`; if it returns `blocked`, return it unchanged.
2. For each ordinal, fold active scheduled events per D1–D6 starting from the first event's `card_before`. Add helper `fixedClock(provenance)` (D4) and `cfgFrom(provenance)` that mirrors `schedCfg()` with `FSRS.parseSteps(...) || []` and `loadBalance:false`. Any missing/invalid provenance field → `blocked('replay_unsupported')`.
3. Return `{status:'projected', noteId, cards:{[ord]: scheduleFields}, eventIds:[...active scheduled ids in order]}`. Export `project` alongside `inspect`.
4. Tests in `test/review_replay.js`: shuffled input order gives deep-equal output; two events with equal `occurred_at_ms` order by `event_id`; Undo of the middle event equals a history that never had it; weights changed between events still projects; a review just before and just after the rollover hour lands on different `day_index` values; a mismatching `day_index` blocks with `clock_mismatch`.
5. Add `TZ=America/Los_Angeles node test/review_replay.js` to the `test:replay` script so the same assertions run in a second timezone (results must not depend on the machine's timezone).

**[ ] S3 — use projection in conflict resolution.**
1. In `src/app/sync_browser.js`, at the check that throws `review_replay_required`: load the note's review events and retractions from account storage (find the stores used by `ingestReview`/retraction ingestion in the same file), call `LemmaReviewReplay.project`.
2. If projected: resolved `data` = the user's chosen content snapshot with `cards[ord]` schedule fields replaced by the projection, and `log` = union of all versions' log entries keyed by `event_id` (entry index 6), excluding retracted IDs, sorted by D1. Keep cram entries. If blocked: keep throwing `review_replay_required` and surface the block `code` in the conflict panel text.
3. Tests in `test/conflict_resolution.js`: two devices review the same card offline (different grades) → both resolve to deep-equal `cards` and `log`; one device reviews and the other reviews then Undoes → identical result; legacy history stays blocked with every snapshot and receipt preserved.

**[ ] S4 — browser gate and close-out.**
1. Extend the two-browser Chromium test used for SYNC-02 (`test/conflict_browser.js`) with: concurrent offline reviews on both pages, one Undo, resolve, reload both pages → same due date shown for the card.
2. Run full `npm test` (locally or CI). Update §1, set SYNC-03 **DONE** (note "mock transport, not live"), SYNC-04 **NEXT**, and add a §5 row (merge the two oldest rows to stay at five).

**UI contract:** retain Lemma's mathematical notebook character, restrained indigo accent, serif math and clear system UI text. Use consistent spacing, typography, borders and icons; quiet surfaces and generous reading space. Avoid new decorative illustrations, dense widget grids and excessive shadows.

Target navigation is **Today / Study / Cards / Settings**, with visible labels on mobile; introduce Study only when usable. Today foregrounds "Continue study" and due reviews; Cards retains decks, search, editor and prerequisites. Stats/graphs and advanced FSRS controls remain accessible deeper in the relevant screens. One primary action per screen; progressive disclosure for advanced controls. During proofs/review, keep content central and controls reachable, with no surprise full solution. Provide readable equations (local overflow for oversized math), ≥44px tap targets, visible focus, adequate contrast, reduced motion and safe keyboard/inset behavior. Sync detail belongs in a compact status/control, not engineering jargon in the main flow.

**Effort:** high reasoning for sync/replay/security and plan contracts; medium for established UI patterns, docs and routine tests. Model choice is advisory, never a blocker or automatic paid upgrade.

## 3. Sequential chatbot protocol

**Start**
1. Do the §0 quick start. Inspect only files named in your slice plus anything they call. Do not reread the whole repo.
2. Reconcile §1 with reality: commits after the §1 SHA, failed CI, migration state. Source and observed CI are the truth; this plan is the desired behaviour. Adopt interrupted work rather than redoing it.
3. Pick exactly one slice. If it is blocked, write the exact prerequisite into §1 and stop or take the next eligible row; never relax a gate. The user's current instruction overrides the queue.

**Work**
4. Work directly on `main` unless the user asks for a branch/PR. Preserve unrelated local changes.
5. Keep changes small: extend existing functions/modules; follow the existing code style (IIFE modules with `module.exports` fallback, 2-space indent, no new dependencies without owner approval).
6. Never re-import a ZIP or regenerate FSRS. No anonymous-to-account merge on sign-in. No clearing dirty caches, attempts or receipts to fix a test.
7. Backend changes: compare tracked vs applied migrations, add a **new** migration file (never edit an applied one), test owner access, and record **written vs applied vs verified** separately. Only Lemma (`yemqnhnztlbyxmjxidis`) may be changed.

**Stop and ask the owner (do not guess) when:** a decision in §2 seems wrong or missing; a test can only pass by deleting data or weakening an assertion; a migration or live Supabase change is needed and not described; CI fails for reasons unrelated to your slice and you cannot fix it in under ~30 minutes of work.

**Verify and hand off**
8. Docs-only: `npm run test:plan`. Code: `npm ci`, `npm run test:syntax`, the slice's tests, `npm test`, `npm run build`. UI changes also need screenshots. Write SUCCESS/FAILED/PENDING/NOT RUN exactly as observed; mock tests never prove live sync.
9. Commit message format: `type(task-id): summary`, e.g. `feat(sync-03): add deterministic schedule projection`, `test(sync-03): ...`, `docs: ...`. Code and the §1/§2 update go in the same push.
10. Before pushing: `git fetch origin main`; if HEAD moved, rebase (never force-push), rerun affected tests, reconcile §1. If push access fails, report the unpublished patch and exact recovery steps; never claim remote completion. Do not invent your own commit's SHA in §1 — cite the last SHA with a known CI result.
11. Update §1 (overwrite, do not append), slice checkboxes, task states and the one-sentence next action. Keep at most five §5 rows. Keep this plan under ~3,800 words; move reusable technical detail to existing docs (e.g. `docs/PHASE2_SYNC_CONTRACT.md`), never a second roadmap. Do not weaken `test/plan_protocol.js`.
12. End your reply with the §6 report.

## 4. Ownership, architecture, and reference precedence

Repo: [Mymayankyadav/lemma](https://github.com/Mymayankyadav/lemma), branch `main`. Web: https://mymayankyadav.github.io/lemma/. Backend: **`yemqnhnztlbyxmjxidis`**, Mumbai. **Carrel is a separate app/database; never modify it.**

| Responsibility | Existing code / reference |
| --- | --- |
| Scheduling, domain, review | `src/fsrs.js` (`preview`, `replay`, `makeClock`, `parseSteps`), `src/app/model.js` (`schedCfg`, `previewFor`), `session.js` (`answer`, `undo`), `review_ledger.js`, `review_replay.js` |
| Durability, identity, transport | `src/app/store.js`, `workspace_lifecycle.js`, `account_sync.js`, `sync_browser.js`, `outbox_core.js`, `sync_merge.js` |
| Shell, screens, rendering | `src/app/main.js`, `view_*.js`, `sheets.js`, `conflict_ui.js`, `src/app.css`, `src/render.js` |
| AI portability | `src/app/ai.js` currently requires `window.claude`; Settings' ArtifactData instructions are host-specific, not a working general connector. |
| Data / product contracts | `supabase/migrations/`; [study protocol](docs/STUDY_PLANNING_PROTOCOL.md); [sync reference](docs/PHASE2_SYNC_CONTRACT.md) |
| Delivery / verification | `package.json`, `build.js` (`appFiles` order = load order), `test/`, `.github/workflows/`, `capacitor.config.json`; native `android/` does not yet exist. |

Precedence: current user instruction → this plan for scope/order → supporting contracts. Source, tests and observed backend determine implementation status; correct stale prose rather than assuming it works. Historical audits are evidence only. Engineering `plan.md` is distinct from the student's versioned study plans.

## 5. Completed evidence ledger

| Milestone | Evidence / limit |
| --- | --- |
| Original source and sync groundwork retained | [merged PR #1](https://github.com/Mymayankyadav/lemma/pull/1), existing source/migrations; no replacement implementation. |
| Durable editor and crash recovery | [PR #2](https://github.com/Mymayankyadav/lemma/pull/2) and [PR #3](https://github.com/Mymayankyadav/lemma/pull/3) merged; main regression/Pages 40378487715/40378487955 and 40381695953/40381695797 SUCCESS. |
| Synchronous identity guards | `cloud_account.js`, `workspace_lifecycle.js`, `test/account_identity.js`, `test/workspace_browser.js`; [PR #4](https://github.com/Mymayankyadav/lemma/pull/4) merged; full main regression 40383331439 and Pages 40383331522 SUCCESS. |
| Durable imports | `IO.prepare/commit`, ImportSheet recovery, Store note/profile receipts; [PR #5](https://github.com/Mymayankyadav/lemma/pull/5) merged; full main regression 40420169362 and Pages 40420169191 SUCCESS. |
| Conflict evidence, transactions and UI | [PR #6](https://github.com/Mymayankyadav/lemma/pull/6) and [PR #7](https://github.com/Mymayankyadav/lemma/pull/7) merged; [main regression 40441775123](https://github.com/Mymayankyadav/lemma/actions/runs/40441775123) SUCCESS; [Pages 40441762109](https://github.com/Mymayankyadav/lemma/actions/runs/40441762109) SUCCESS. Review replay and live activation remain gated. |

## 6. Five-line end-of-session report template

**Changed:** task ID + slice, outcome, relevant files and commit.
**Verified:** tested SHA, exact checks/run links and result.
**Still gated:** unfinished behavior, deployment/migration limits.
**Next:** one task slice, function/path and acceptance check.
**Handoff:** updated on remote `main`, or exact unpublished-work recovery.
