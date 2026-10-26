# Lemma — canonical execution plan and chatbot handoff

**Protocol v2 · 26 October 2026.** This is the only engineering roadmap and task queue. It replaces all previous roadmaps and amendments; Git history retains them. The roadmap consolidation was documentation-only; §1 records subsequent implementation. A later **"follow the plan.md"** means implement the next bounded task; a request only to plan/review does not authorize implementation.

## 0. Operator instructions

Read current `main` → this plan → relevant source/tests → one task → verify → commit → update handoff. Agents work **consecutively, never simultaneously**. No old chat, local workspace or particular model is required.

**Product goal:** a private, persistent mathematics learning workspace for a PhD student. Curate shared knowledge, approve a thoughtful study plan, attempt proofs with interchangeable tutors, retain evidence and misconceptions, and review useful cards. Switching Claude/ChatGPT or devices should not require restarting the lesson. Supabase is the authenticated source of truth; durable local storage supports immediate interaction and offline work.

**Scope boundaries**
- Preserve the imported app, original FSRS-6, mathematical rendering, prerequisite links, review/Undo, import/export and user data. Extend existing modules; no framework rewrite or parallel scheduler/store.
- **No new image-upload features:** no camera, OCR, scanning, image-based tutoring, gallery or media-management project. Preserve compatibility with existing card media without expanding it.
- Exception: private file attachments may support a study project's shared knowledge. Start with curated text, Markdown and source references; accept PDFs/documents only when needed, with citations and bounded retrieval. This is not a general upload product.
- "Shared" means the same owner's knowledge available to successive tutors, not public sharing or multi-user collaboration.
- Optimize for understanding and continuity, not chat volume, decorative dashboards, streak pressure or speculative AI infrastructure.

## 1. CURRENT HANDOFF

**Last verified handoff:** 2026-10-27; SYNC-01 durable-import slice based on `main@5a3be53cd4e8505150b916703fe1cbfa6715eb4a`. **State: READY_FOR_NEXT_AGENT.** The listed SYNC-01 gates passed; SYNC-02 is the single NEXT task.

| Field | Evidence / limit |
| --- | --- |
| Known-good main baseline | `5a3be53`; [regression 40383585241](https://github.com/Mymayankyadav/lemma/actions/runs/40383585241) SUCCESS. |
| Latest inspected regression | SUCCESS: [regression 40419737189](https://github.com/Mymayankyadav/lemma/actions/runs/40419737189) at `0189fda6f015954992ba8a247db3f26a73720cd1`: syntax and full `npm test`, including partial import failure/reload and account switching during an import write. Local syntax, storage/import, account/account-store, identity/workspace, plan and build SUCCESS; browser tests NOT RUN locally (Chromium unavailable). |
| Documentation validation | SUCCESS: `npm run test:plan`; preserve this guard. |
| Web deployment | [Pages 40383331522](https://github.com/Mymayankyadav/lemma/actions/runs/40383331522) SUCCESS at `5ab496d`. Durable-import delivery is not yet deployed. |
| Cloud confidence | `IO.prepare/commit` saves complete prerequisite links once, awaits each storage receipt, reads durable state on retry and keeps stable IDs. Import recovery stores source/job under the origin account key; subsequent writes and UI callbacks stop on identity change. Backup settings and generated-card imports await persistence too. Browser tests use real app/IndexedDB/outbox with mocked auth/remote receipts; no live login/RLS/convergence claim. |
| Backend security check | NOT RUN; no backend/schema change. Nine tracked migrations remain; verify applied state before backend work. |
| Current blocker / unfinished work | No SYNC-01 gate blocker. Batch writes are sequential: already committed cards remain saved if a later card fails. Changed backup targets block retry with retained source; conflict repair remains SYNC-02. Deletes still acknowledge optimistically and require later mutation audit. |

**Next action, in one sentence:** start SYNC-02 by inspecting `sync_merge.js`, `AccountStorage.ingestRemoteNote/stageProfile` and outbox conflict records, then preserve base/local/remote note and profile revisions before adding resolution controls.

The record above describes inspected evidence, not today's mutable HEAD. Update it after each task; do not append another competing handoff.

## 2. Task queue

Keep stable IDs. **DONE** requires its gate; **NEXT** is exactly one task; **IN_PROGRESS** records partial work; **BLOCKED/LATER** are unfinished. Read top-to-bottom and choose the first task whose dependencies are satisfied. Break large rows into one testable slice per session; keep the remaining criteria here.

| ID | State | Depends on | Requirement and completion gate |
| --- | --- | --- | --- |
| **HANDOFF-01** | **DONE** | — | Canonical plan, short entry points and existing `test:plan` guard. Maintain them with every change. |
| **FOUNDATION-01** | **DONE** | — | Imported app, web build, local cards, original FSRS/rendering and baseline tests exist. Preserve them. |
| **SYNC-00** | **DONE** | — | Account/outbox/RPC/ledger infrastructure exists in source. This is not completed live sync. |
| **SYNC-01** | **DONE** | SYNC-00 | Editor durability/crash recovery, account invalidation and durable import recovery implemented; browser gates passed in regression 40419737189. Retain recoverable input on failed storage; report success/close only after commit. Reuse workspace leases for delayed callbacks. Gate: browser crash/reload, aborted write, sign-out during save/import, A→B→A with isolated drafts/cache and intact anonymous data; existing tests stay green. |
| **SYNC-02** | **NEXT** | SYNC-01 | Finish note/profile/tombstone conflict repair with local, remote and base revision visible. Choosing/merging a version creates a new revision; never drop queued edits or silently revive deletes. Gate: two offline editors, edit/delete race, profile conflict and lost acknowledgment recover without data loss; retry retains request ID. |
| **SYNC-03** | **BLOCKED** | SYNC-02 | Converge review/Undo using existing `FSRS.preview/replay` and `ReviewLedger.fsrsInput`. Specify deterministic ordering, parameter/time provenance, legacy baseline handling and resets. Never choose the latest card snapshot as truth or fabricate legacy history. Gate: concurrent offline reviews/Undo, equal timestamps, timezone/rollover, fuzz and parameter changes produce the same due state on both devices; unsupported histories remain preserved and explicitly blocked. |
| **SYNC-04** | **BLOCKED** | SYNC-03 | Enable account workspace only after explicit enrollment/backup. Route every mutation through durable staging; automatically push after local commit, retry on reconnect/foreground and refresh on remote invalidation. Distinguish device-saved, queued, cloud-confirmed, conflict and failure. Gate: authenticated two-browser/two-identity tests, offline restart, auth expiry, network loss after commit, deletes and RLS isolation. Routine use needs no manual Sync button. |
| **UI-01** | **LATER** | SYNC-01 | Apply the UI contract below to existing screens incrementally. Keep working routes and controls while Study is built later. Gate: mobile/desktop light/dark screenshots, keyboard navigation, 200% text, long mathematical expressions, empty/loading/error/offline states and existing review flows. |
| **KNOWLEDGE-01** | **LATER** | SYNC-04, UI-01 | Reuse context/source/section tables for private project knowledge: goals, background, notation, references, verified skills and editable summary. Scope context, plans and evidence to stable project/context IDs. Version changes; distinguish learner-authored facts from tutor proposals. Optional documents need private access, size/type limits, extraction status, stable source/version/page IDs and removal controls; no OCR. Gate: two tutors retrieve the same accepted revision and cited excerpt without loading the entire collection; another owner cannot read it. |
| **PLAN-01** | **LATER** | KNOWLEDGE-01 | Build context→draft→review→approved plan and a checkpoint screen for objective, attempt, hints, feedback, evidence and next action. Strong-model planning is user-selected and occasional. Reuse existing schema/RPC, first verifying event append-only enforcement, context revision safety, publication metadata/idempotency and approval permissions. Amendments need a diff and acceptance; preserve unaffected checkpoint IDs/evidence. Gate: 12-checkpoint plan, two demonstrated checkpoints, mid-proof resume, accepted prerequisite amendment and rejected stale revision; failed/retried writes never duplicate evidence. |
| **TUTOR-01** | **LATER** | PLAN-01 | Deliver bounded Markdown/JSON handoff export/import first; add authenticated owner-scoped context/source/event/card/plan-proposal tools when supported. Validate imported schema, IDs and expected revisions. Tutors may propose cards/amendments; student approves. Persist attempts and hints; never mark mastery just because content was displayed. Gate: Claude→ChatGPT→Claude resumes the exact unfinished proof and hint level, stale writes fail, approved cards retain provenance and use existing FSRS. Core study works without a host-specific AI API or paid model call. |
| **ANDROID-01** | **LATER** | SYNC-04, UI-01 | Generate reproducible Capacitor Android project/builds from existing source. Verify safe areas, keyboard, Back, auth redirects, foreground recovery and offline launch. Optional due-review notifications: opt-in, quiet by default, configurable time, no stale duplicates, tap opens relevant review. Gate: physical-device install, permission denied/granted, offline edits/restart/reconnect and notification checks. Document APK update delivery; Pages deployment does not update bundled native assets. |
| **RELEASE-01** | **LATER** | All above | Verify backup/restore of cards, schedules, context, plan versions, events and source references; safe migrations, deliberate account erasure, scoped connector access and recovery. Test PWA service-worker offline/update separately (current UI suite disables it). Gate: restore round trip, no lost/duplicated events, cross-owner isolation, both tutor handoff directions and web/Android smoke checks. |

**UI contract:** retain Lemma's mathematical notebook character, restrained indigo accent, serif math and clear system UI text. Use consistent spacing, typography, borders and icons; quiet surfaces and generous reading space. Avoid new decorative illustrations, dense widget grids and excessive shadows.

Target navigation is **Today / Study / Cards / Settings**, with visible labels on mobile; introduce Study only when usable. Today foregrounds "Continue study" and due reviews; Cards retains decks, search, editor and prerequisites. Stats/graphs and advanced FSRS controls remain accessible deeper in the relevant screens. One primary action per screen; progressive disclosure for advanced controls. During proofs/review, keep content central and controls reachable, with no surprise full solution. Provide readable equations (local overflow for oversized math), ≥44px tap targets, visible focus, adequate contrast, reduced motion and safe keyboard/inset behavior. Sync detail belongs in a compact status/control, not engineering jargon in the main flow.

**Effort:** high reasoning for sync/replay/security and plan contracts; medium for established UI patterns, docs and routine tests. Model choice is advisory, never a blocker or automatic paid upgrade.

## 3. Sequential chatbot protocol

**Start**
1. Read `AGENTS.md` and this file from current remote `main`; record starting SHA. Inspect only task-relevant code and recent changes/CI. Read deeper contracts on demand; do not reread the whole repo every turn.
2. Reconcile unfinished commits, failed checks and migration state with §1. Source/observed evidence establishes reality; this plan establishes desired behavior. Adopt existing work, including an interrupted session.
3. Select one slice of the single NEXT task and its gate. If blocked, record the exact prerequisite and choose the next eligible row without relaxing a release gate. Current user instructions override the queue.

**Work**
4. Work directly on `main` unless user/repository policy requires a branch. No lock service, agent branches or concurrent delegation are needed. Preserve unrelated local changes.
5. Before publishing, refetch HEAD. Use a normal fast-forward push or connector commit based on that tree with expected-head checking. If HEAD changed, inspect/reconcile and revalidate; never force-push or overwrite a newer handoff. Publish related code and status coherently.
6. Reuse existing code. Never re-import a ZIP or regenerate FSRS. No anonymous-to-account merge merely on sign-in; no clearing dirty caches, attempts or receipts to fix a test.
7. For backend changes, compare tracked/applied migrations, add a new migration, test owner access and record **written vs applied vs verified** separately. Only Lemma may be changed; no secrets in clients, repo or context packets.

**Verify and hand off**
8. Docs-only: `npm run test:plan`, links and documentation consistency. Code: `npm ci`, `npm run test:syntax`, relevant regression tests, `npm test`, `npm run build`; browser tests require Chromium. UI changes also need screenshots. Record unavailable checks honestly; mock tests do not prove live sync.
9. Update §1, task state and one exact next action in the same delivery. Include files/functions, tested SHA, test/run URLs, deployment/migration status and blockers. Use SUCCESS/FAILED/PENDING/NOT RUN accurately; pending CI is the next agent's first check.
10. Commit/push before ending. If access fails, report the unpublished patch/branch and precise recovery action; never claim remote completion. Do not invent the handoff commit's own SHA.
11. Keep one current handoff and at most five milestone rows; Git history is the long log. Keep this plan near 2,400 words or less. Put reusable technical detail in existing reference docs, never a second roadmap. Do not weaken `test/plan_protocol.js` to conceal missing fields.

## 4. Ownership, architecture, and reference precedence

Repo: [Mymayankyadav/lemma](https://github.com/Mymayankyadav/lemma), branch `main`. Web: https://mymayankyadav.github.io/lemma/. Backend: **`yemqnhnztlbyxmjxidis`**, Mumbai. **Carrel is a separate app/database; never modify it.**

| Responsibility | Existing code / reference |
| --- | --- |
| Scheduling, domain, review | `src/fsrs.js`, `src/app/model.js`, `session.js`, `review_ledger.js` |
| Durability, identity, transport | `src/app/store.js`, `workspace_lifecycle.js`, `account_sync.js`, `sync_browser.js`, `outbox_core.js`, `sync_merge.js` |
| Shell, screens, rendering | `src/app/main.js`, `view_*.js`, `sheets.js`, `src/app.css`, `src/render.js` |
| AI portability | `src/app/ai.js` currently requires `window.claude`; Settings' ArtifactData instructions are host-specific, not a working general connector. |
| Data / product contracts | `supabase/migrations/`; [study protocol](docs/STUDY_PLANNING_PROTOCOL.md); [sync reference](docs/PHASE2_SYNC_CONTRACT.md) |
| Delivery / verification | `package.json`, `build.js`, `test/`, `.github/workflows/`, `capacitor.config.json`; native `android/` does not yet exist at this review. |

Precedence: current user instruction → this plan for scope/order → supporting contracts. Source, tests and observed backend determine implementation status; correct stale prose rather than assuming it works. Historical audits are evidence only. Engineering `plan.md` is distinct from the student's versioned study plans.

## 5. Completed evidence ledger

| Milestone | Evidence / limit |
| --- | --- |
| Original source and sync groundwork retained | [merged PR #1](https://github.com/Mymayankyadav/lemma/pull/1), existing source/migrations; no replacement implementation. |
| Durable editor-save slice | [PR #2](https://github.com/Mymayankyadav/lemma/pull/2) merged; main regression 40378487715 and Pages 40378487955 SUCCESS. |
| Crash acknowledgment recovery | [PR #3](https://github.com/Mymayankyadav/lemma/pull/3) merged; regression 40381695953 and Pages 40381695797 SUCCESS. |
| Synchronous identity guards | `cloud_account.js`, `workspace_lifecycle.js`, `test/account_identity.js`, `test/workspace_browser.js`; [PR #4](https://github.com/Mymayankyadav/lemma/pull/4) merged; full main regression 40383331439 and Pages 40383331522 SUCCESS. |
| Durable imports | `IO.prepare/commit`, ImportSheet recovery, Store note/profile receipts; local import tests and full browser regression 40419737189 SUCCESS. |

## 6. Five-line end-of-session report template

**Changed:** task ID, outcome, relevant files and commit.
**Verified:** tested SHA, exact checks/run links and result.
**Still gated:** unfinished behavior, deployment/migration limits.
**Next:** one task slice, function/path and acceptance check.
**Handoff:** updated on remote `main`, or exact unpublished-work recovery.
