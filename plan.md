# Lemma — canonical execution plan and chatbot handoff

**Protocol v5 (autonomous execution) · 28 October 2026.** This is the only engineering roadmap and task queue. The owner's instruction is to minimize human intervention. A request to implement, follow or continue the plan authorizes the agent to select work, resolve routine decisions, implement, verify, merge and advance through ready slices without another “continue”. A planning/review request remains documentation only. Autonomy does not waive acceptance gates, product consent or tool permissions.

## 0. Operator instructions

Up to **three implementation agents, one per lane** (A sync/auth/backend, B UI, C Android), may work concurrently. One agent can cover these roles sequentially. No particular model, previous chat, manual lane assignment or continuously running agent is required.

**Quick start:**
1. Read current remote `main`: this plan, `AGENTS.md`, `lanes.json`, and the three lane handoffs (also pending handoff/request changes in claimed PRs). Inspect open PRs and latest relevant CI before believing a status line.
2. Honor an explicit lane. Otherwise choose automatically: repair failing main CI; recover an interrupted claim; satisfy a blocking cross-lane request; finish the nearest ready gate; then take the first dependency-ready task in §2. Break ties by table order, then A/B/C. Skip lanes held by another active agent. Do not ask the owner to select a lane.
3. Clone/fetch `https://github.com/Mymayankyadav/lemma`; use a clean branch/worktree from current `main`. Claim work using §3 before editing. Read deeper references only for that slice.
4. Complete one bounded slice per PR. After merging and checking relevant main CI, select the next ready slice within the user's scope. Continue until work is completed, no permitted work is ready, or execution limits require a durable checkpoint. One PR is not a reason to request another “continue”.
5. If blocked, record the exact unmet gate and advance independent work. Use the escalation table in §3; ordinary engineering uncertainty is resolved by inspection, tests and documented defaults.

**Product goal:** a private mathematics learning workspace: curated knowledge, approved study plans, proof attempts with interchangeable tutors, retained evidence/misconceptions and useful review cards. Supabase is authenticated source of truth; durable local storage supports immediate/offline work.

**Scope boundaries**
- Preserve the imported app, original `src/fsrs.js`, rendering, prerequisite links, review/Undo, import/export and user data. Extend existing modules; no framework rewrite or parallel scheduler/store.
- No new camera, OCR, scanning, image-tutoring, gallery or media-management features. Preserve existing media compatibility.
- Private study knowledge starts with text, Markdown and source references. Optional documents need private access, bounded retrieval and citations; they are not a general upload product. “Shared” means one owner's knowledge across tutors, not public collaboration.
- Optimize understanding and continuity, not chat volume, decorative dashboards, streak pressure or speculative AI infrastructure.

**Hard never list:** force-push; direct pushes to `main`; bypass branch protections or required reviews; overwrite another active agent's branch; edit outside the current role's ownership; modify Carrel; publish credentials/private study content; discard dirty data, receipts or review history; weaken tests to obtain green CI; rewrite FSRS maths; mark DONE or claim verification without evidence. Preserve tracked files by default; any required rename/removal follows §3. Engineering autonomy never approves the student's study plans, amendments, card proposals, account transfer, erasure or notification opt-in on their behalf.

## 1. CURRENT HANDOFF

**Integration record (2026-10-28 UTC):** `UI-01-PROMOTION`; [integration PR #52](https://github.com/Mymayankyadav/lemma/pull/52) reconciles task states and lane handoffs from `main@a108dd5` after verified PR #49. Validation/merge evidence is on the PR; no production or native code changed. The merged PR #49 and B audit #51 provide the acceptance evidence; later task implementation requires separate lane PRs.

**Per-lane handoffs:** `docs/lanes/A.md`, `B.md`, `C.md`. These contain execution details; §2 contains authoritative task states. An automatic integration PR reconciles shared snapshots and ownership. Historical paragraphs are not fresh blockers.

**Last verified handoff:** 28 October 2026 (IST), `main@a108dd5` after [PR #49](https://github.com/Mymayankyadav/lemma/pull/49) merged and all three post-merge CI suites passed (details below); zero open PRs at pre-integration inspection. **UI-01 DONE**: lane B's [PR #51 acceptance matrix](https://github.com/Mymayankyadav/lemma/pull/51) accepted core screenshots, keyboard, actual browser zoom, long math, local-stack offline/error/recovery, and existing review flows. SYNC-04, AUTH-01 web and ANDROID-01 remain DONE. **State: READY_FOR_NEXT_AGENT** for lanes A KNOWLEDGE-01 K1 and C ANDROID-02 N1. Native OAuth, production phone/Pages smoke and due-notification consent remain unverified.

| Field | Evidence / limit |
| --- | --- |
| Known-good main baseline | `a108dd5`: [regression/screenshots 40619701452](https://github.com/Mymayankyadav/lemma/actions/runs/40619701452), [local Supabase 40619701405](https://github.com/Mymayankyadav/lemma/actions/runs/40619701405), [Android 40619701429](https://github.com/Mymayankyadav/lemma/actions/runs/40619701429) all SUCCESS on the same merged commit. Re-read latest runs on entry. |
| Cloud confidence | Live web sign-in/create/update/reload and approved tombstone recorded; independent browsers, offline restart, expiry and lost response passed on the real local stack. [PR #49](https://github.com/Mymayankyadav/lemma/pull/49) adds genuine authenticated RPC-error/queued/recovery, durable outbox and exactly-one server receipt with 16 inspected visual states. Production phone/Pages smoke remains in ANDROID-02/RELEASE-01. |
| Backend security check | SYNC-04 L8 passed: local/production metadata and nine migrations match; two-identity local HTTP isolation passed. Re-check parity after backend changes. No current production query is implied by this snapshot. |
| Owner action needed | None now. Prepare one reusable phone/Pages smoke checklist and tested APK before requesting physical-device actions. Reuse unchanged-component evidence across Android/release gates; request only missing or invalidated checks. |
| CI screenshots | Read `ci-screenshots/main/` and `pr-<n>/`; each README identifies its source SHA/run. Download artifacts when available, otherwise use the GitHub contents API. Never edit/merge this CI-owned branch. Missing/stale images are not visual acceptance. |

| Lane | Scope | NEXT task / fallback | Branch prefix | Status file |
| --- | --- | --- | --- | --- |
| A | sync/auth/backend | KNOWLEDGE-01 K1: inspect existing context/source schema and define versioned private contract | `lane-a/` | [A.md](docs/lanes/A.md) |
| B | screens/CSS/rendering, now Settings presentation | UI-01 complete; support KNOWLEDGE-01 K3 when A supplies APIs, then PLAN-01 | `lane-b/` | [B.md](docs/lanes/B.md) |
| C | native shell/build | ANDROID-02 N1: native Google OAuth via system browser/deep link and CI; physical smoke later | `lane-c/` | [C.md](docs/lanes/C.md) |

**Next action, in one sentence:** select lane A KNOWLEDGE-01 K1 (schema/RPC inspection and versioned private context/source contract), while independent lane C may begin ANDROID-02 N1 native system-browser OAuth; lane B supports accepted knowledge UI only after an A contract.

## 2. Task queue

States: **DONE** (gate passed with evidence), **NEXT** (at most one per lane), **IN_PROGRESS**, **BLOCKED** (named unmet prerequisite), **LATER**. Lane is the task lead, not permission to edit all files; support work follows ownership. Automatically promote the earliest eligible row when all dependencies are DONE. Split large tasks into bounded PRs and keep unpassed criteria explicit. A blocker on one slice does not block unrelated work.

| ID | State | Lane | Depends on | Requirement and completion gate |
| --- | --- | --- | --- | --- |
| **HANDOFF-01** | **DONE** | — | — | Canonical plan, short entry points and existing `test:plan` guard. Maintain them with every change. |
| **FOUNDATION-01** | **DONE** | — | — | Imported app, web build, local cards, original FSRS/rendering and baseline tests exist. Preserve them. |
| **SYNC-00** | **DONE** | — | — | Account/outbox/RPC/ledger infrastructure exists in source. This is not completed live sync. |
| **SYNC-01** | **DONE** | — | SYNC-00 | Editor durability/crash recovery, account invalidation and durable import recovery; browser gates passed in regression 40419737189. |
| **SYNC-02** | **DONE** | — | SYNC-01 | Conflict evidence, transactional note/profile/tombstone resolution, three-version comparison and explicit choice controls. Gate passed in main regression 40441775123 (mocked transport, not live sync). |
| **SYNC-03** | **DONE** | — | SYNC-02 | Converge review/Undo schedules deterministically from the immutable ledger using existing `FSRS.preview` and `ReviewLedger`. Never take the latest card snapshot as truth; never fabricate legacy history. Gate: concurrent offline reviews/Undo, equal timestamps, timezone/rollover, fuzz and parameter changes produce the same card state on both devices; unsupported histories stay preserved and explicitly blocked. Follow the replay rules linked below. |
| **AUTH-01** | **DONE** | A | SYNC-01, SYNC-03 | Google sign-in is the primary Supabase auth method; email magic link stays as fallback. Web gate passed 2026-10-27 (PR #17; evidence in `docs/lanes/A.md`). Android OAuth (S3) is part of ANDROID-02. |
| **SYNC-04** | **DONE** | A | SYNC-03, AUTH-01 | Automatic account synchronization without routine manual Sync. L1/L2 live web create/update/reload/tombstone, L3/L4 PRs #25/#26, L5 local stack PR #28, L6 two-identity HTTP RLS PR #29, L7 real independent persistent-browser devices and offline/expiry/lost-response PR #30, L8 production/local exact security parity PR #31. Owner-approved **byte-identical** migration version renames are guarded by integration PR #32. **Final main-branch gate PASS at `24f9c16`:** [local stack + L5–L8](https://github.com/Mymayankyadav/lemma/actions/runs/40555709587), [regression + screenshots](https://github.com/Mymayankyadav/lemma/actions/runs/40555709552), [Android + lane guard](https://github.com/Mymayankyadav/lemma/actions/runs/40555709588). Source-of-truth Supabase Lemma only; no user-data or Carrel mutations. Production independent-phone smoke remains separately in ANDROID-02/RELEASE-01, not an unmet SYNC-04 gate. |
| **UI-01** | **DONE** | B | SYNC-01 | Apply the UI contract below to existing screens incrementally. Keep working routes and controls while Study is built later. Settings presentation now belongs to lane B; preserve account behavior. The original core-screen acceptance gate does not expand to a new Settings redesign. Follow "UI-01 slices". **Gate PASSED**: [B visual acceptance PR #51](https://github.com/Mymayankyadav/lemma/pull/51), [authentic RPC error/recovery PR #49](https://github.com/Mymayankyadav/lemma/pull/49), 16 local-stack screenshots, and `main@a108dd5` post-merge [regression 40619701452](https://github.com/Mymayankyadav/lemma/actions/runs/40619701452), [local stack 40619701405](https://github.com/Mymayankyadav/lemma/actions/runs/40619701405), [Android 40619701429](https://github.com/Mymayankyadav/lemma/actions/runs/40619701429) SUCCESS. Core mobile/desktop light/dark, keyboard, actual Chromium 200% zoom, long math, empty/loading, real offline/error/recovery, and existing review flows covered. No physical phone/production Pages claim. |
| **KNOWLEDGE-01** | **NEXT** | A | SYNC-04, UI-01 | Reuse context/source/section tables for private project knowledge: goals, background, notation, references, verified skills and editable summary. Scope context, plans and evidence to stable project/context IDs. Version changes; distinguish learner-authored facts from tutor proposals. Optional documents need private access, size/type limits, extraction status, stable source/version/page IDs and removal controls; no OCR. Gate: two tutors retrieve the same accepted revision and cited excerpt without loading the entire collection; another owner cannot read it. |
| **PLAN-01** | **LATER** | B | KNOWLEDGE-01 | Build context→draft→review→approved plan and a checkpoint screen for objective, attempt, hints, feedback, evidence and next action. Strong-model planning is user-selected and occasional. Reuse existing schema/RPC, first verifying event append-only enforcement, context revision safety, publication metadata/idempotency and approval permissions. Amendments need a diff and acceptance; preserve unaffected checkpoint IDs/evidence. Gate: 12-checkpoint plan, two demonstrated checkpoints, mid-proof resume, accepted prerequisite amendment and rejected stale revision; failed/retried writes never duplicate evidence. |
| **TUTOR-01** | **LATER** | A | PLAN-01 | Deliver bounded Markdown/JSON handoff export/import first; add authenticated owner-scoped context/source/event/card/plan-proposal tools when supported. Validate imported schema, IDs and expected revisions. Tutors may propose cards/amendments; student approves. Persist attempts and hints; never mark mastery just because content was displayed. Gate: Claude→ChatGPT→Claude resumes the exact unfinished proof and hint level, stale writes fail, approved cards retain provenance and use existing FSRS. Core study works without a host-specific AI API or paid model call. |
| **ANDROID-01** | **DONE** | C | — | Reproducible Capacitor Android project and CI debug build from existing source, plus native Back/resume shell. No sign-in, sync or web UI changes. Implementation/evidence is in the completed-foundations section and lane C handoff. Gate: `android.yml` builds a debug APK artifact on the PR; full `npm test` green; web `dist/` behaviour unchanged. |
| **ANDROID-02** | **NEXT** | C | ANDROID-01, SYNC-04, UI-01 | Device gates (the phone is also SYNC-04's production independent device: owner edits on phone, confirms it on Pages, and a deleted `SYNC-04` fixture stays deleted): safe areas, keyboard, Google sign-in via system browser + deep link (AUTH-01 S3), foreground recovery and offline launch. Optional due-review notifications: opt-in, quiet by default, configurable time, no stale duplicates, tap opens relevant review. Gate: physical-device install, permission denied/granted, offline edits/restart/reconnect and notification checks. Document APK update delivery; Pages deployment does not update bundled native assets. |
| **RELEASE-01** | **LATER** | A | All above | Verify backup/restore of cards, schedules, context, plan versions, events and source references; safe migrations, deliberate account erasure, scoped connector access and recovery. Test PWA service-worker offline/update separately (current UI suite disables it). Gate: restore round trip, no lost/duplicated events, cross-owner isolation (re-run L8 parity), both tutor handoff directions and web/Android smoke checks, including the shared owner production smoke (two own devices, one offline edit). Reuse ANDROID-02 evidence for unchanged code/config; rerun only invalidated steps. |

SYNC-03's replay rules (D1–D8) now live in [the sync contract](docs/PHASE2_SYNC_CONTRACT.md#review-replay-policy-v1-sync-03-moved-from-planmd); lane A must follow them.

### UI-01 slices (lane B)

Each slice is one PR. Every PR attaches the S1 screenshots (before/after) in its description. Do not change sync/account behavior. Settings presentation ownership is transferred to B; account APIs remain A-owned.

**[x] S1 — screenshot harness, no visual change (PR #15).** Create `test/ui_screenshots.js`: build is already done by `npm test`'s e2e step, so serve/launch `dist/` exactly the way `test/e2e.js` does (copy its server and Playwright launch code), seed data with `test/seed.js`, and capture Home, Cards list, Editor, Review and Stats at 390×844 and 1280×800 in `colorScheme` light and dark into `test-output/ui/<screen>-<size>-<scheme>.png` (already git-ignored; never commit PNGs). Add `"test:ui": "node test/ui_screenshots.js"` and append `&& npm run test:ui` to the end of `"test"`.
**[x] S2 — navigation and Today (Stats tab kept until S4).** In `main.js`, label navigation **Today / Cards / Settings** (Study stays hidden until PLAN-01); keep every existing route/hash working. In `view_home.js`, make due reviews the single primary action. Gate: e2e green, screenshots, keyboard-only navigation works.
**[x] S3 — Cards (`view_browse.js`, `view_editor.js`, `sheets.js`).** ≥44px tap targets, visible focus, long equations scroll locally (`overflow-x:auto` on display math), empty/loading/error states. Do not change editor save/durability logic (it calls lane A's Store).
**[x] S4 — Review and Stats (PR #35 merged; main CI SUCCESS) (`view_review.js`, `view_stats.js`, `charts.js`).** Reduced motion, existing keyboard shortcuts unchanged, advanced FSRS/stat controls behind progressive disclosure. S4 implementation is merged; remaining full UI-01 acceptance is tracked separately in lane B and the task row (Settings excluded).

### Completed sync/auth/native foundations

SYNC-04 L5–L8 are DONE; evidence and implementation details live in [lane A](docs/lanes/A.md). The real local Supabase workflow covers exact migrations/RLS, two users over HTTP, independent persistent browsers, offline edit/restart/reconnect, expiry, lost response and production security parity. Production fault injection and a second owner-supplied Google account are not required. Never substitute mock results for these gates.

ANDROID-01 S1–S2 are DONE; [lane C](docs/lanes/C.md) and [Android reference](docs/ANDROID.md) cover the CI APK and Back/resume shell. A CI APK is not physical-device verification.

AUTH-01 S1–S2 (Google PKCE, email fallback, live web) are DONE. Preserve PKCE, default identity scopes only and no automatic device/account merge. Do not repeat completed OAuth setup or request secrets in chat. For ANDROID-02/AUTH S3, open Google auth in the system browser (`Browser.open`, `skipBrowserRedirect:true`, redirect `io.lemma.study://auth-callback`), handle `appUrlOpen`, exchange the code, close the browser and register the intent filter. A owns auth APIs; C owns native code; B owns presentation. `@capacitor/app` and `@capacitor/browser` are pre-approved at exact compatible versions. Verify the Android redirect configuration securely; owner interaction is needed only for inaccessible credentials/consent or physical-device steps.

### Default slices after UI-01 (no further planning approval)

| Task lead | Bounded delivery order | Support and gate |
| --- | --- | --- |
| KNOWLEDGE-01 / A | K1 inspect existing schema/RPC and define versioned context/source contract; K2 durable private text/reference operations and tests; K3 B builds context editor and accepted-revision/citation display | A supplies APIs/fixtures before B UI. Text/Markdown first; optional binary documents deferred until needed. Prove same accepted revision, bounded excerpts and cross-owner denial. |
| PLAN-01 / B | P1 A verifies/fixes append-only events, context revisions, idempotent publication and approval permissions; P2 B builds draft/review/approve/checkpoint screens; P3 amendment diff and mid-proof resume | Reuse existing schema and publication RPC. A owns persistence/security; B owns UI. Run every gate in the task row before DONE. |
| TUTOR-01 / A | T1 versioned Markdown/JSON export/import; T2 B handoff/proposal UI; T3 demonstrate both tutor directions and stale-write rejection | Manual copy/import is a product fallback, not an engineering handoff dependency. Authenticated connector tools only when available and scoped. No paid AI dependency. |
| ANDROID-02 / C | N1 native OAuth with A/B support; N2 safe areas/keyboard/offline/recovery with B; N3 optional opt-in due reminders; N4 consolidated physical smoke | Automate intents, denial/cancel, resume and recovery with mocks/emulator/CI where feasible. Label each evidence type; retain actual-device gate. |
| RELEASE-01 / A | R1 backup/restore, privacy and event integrity; R2 B service-worker offline/update tests; R3 C release/update verification; R4 remaining production smoke | Determine release signing/credentials only when needed; prepare build and instructions first. Existing CI deployment is automatic after a qualifying merge; new distribution/cost needs approval. |

New modules/tests are assigned by a small integration PR before use (A data/auth/contracts, B screens/rendering, C native). Reuse current dependencies and schemas; choose the smallest reversible implementation consistent with [the study contract](docs/STUDY_PLANNING_PROTOCOL.md). Record defaults and rationale in the lead's handoff rather than asking the owner to design routine details.

**UI contract:** retain Lemma's mathematical notebook character, restrained indigo accent, serif math and clear system UI text. Use consistent spacing, typography, borders and icons; quiet surfaces and generous reading space. Avoid new decorative illustrations, dense widget grids and excessive shadows.

Target navigation is **Today / Study / Cards / Settings**, with visible labels on mobile; introduce Study only when usable. Today foregrounds "Continue study" and due reviews; Cards retains decks, search, editor and prerequisites. Stats/graphs and advanced FSRS controls remain accessible deeper in the relevant screens. One primary action per screen; progressive disclosure for advanced controls. During proofs/review, keep content central and controls reachable, with no surprise full solution. Provide readable equations (local overflow for oversized math), ≥44px tap targets, visible focus, adequate contrast, reduced motion and safe keyboard/inset behavior. Sync detail belongs in a compact status/control, not engineering jargon in the main flow.

**Effort:** high reasoning for sync/replay/security and plan contracts; medium for established UI patterns, docs and routine tests. Model choice is advisory, never a blocker or automatic paid upgrade.

## 3. Parallel lane protocol

### Claim, resume and continue

1. Use a `lane-x/<task>-<slice>` branch and a draft PR as the durable claim **before substantive edits**. Record lane/task/slice, run identifier, UTC heartbeat, intended files, tested SHA, next step and blockers in the PR body. A claim-only opening commit may update the lane handoff. Re-read open PRs: earliest active claim for a lane wins; a duplicate stops editing and preserves its work. Never rely on a local checkout as the lock.
2. Refresh the heartbeat at milestones and before long CI waits. Adopt your own interrupted PR. For another run's claim, takeover requires at least two hours without a heartbeat/commit, no queued/running CI, and an unchanged remote head on a second read. Record takeover and preserve all commits; never force-push. Revalidate claim owner and remote head before each push/merge; a displaced agent stops writing. If liveness is uncertain, choose another lane or checkpoint; do not ask the owner to arbitrate routinely.
3. An explicit lane request stays in that lane unless the user broadens it. An unscoped continuation may switch roles sequentially using separate branches after releasing the prior claim. Read all lane requests at every pickup. Do not duplicate active work or create two implementation PRs in one lane.
4. After a green merge, inspect main CI and advance. At runtime limits, push a recoverable checkpoint, refresh the lane's `Next action:` and evidence, and leave the PR draft with exact recovery steps. Never claim a scheduler or background agent is running merely because this plan describes one.

### Ownership and coordination

5. `lanes.json` is authoritative. `node test/lane_guard.js <X>` must pass. Shared files permit only additive/owned-line edits: own task/slices in `plan.md`; own scripts/dependencies in package files; append modules in `build.js`; add helpers in `util.js`. Protocol/snapshot/ownership changes use an integration PR.
6. Cross-lane requests go in the requester's handoff with **ID, target lane, file/function, required contract, acceptance check, dependency and state** (OPEN/IN_PROGRESS/DONE). The receiving lane reads these directly, implements in its own PR and links the result in its handoff; the requester records completion. The owner is never the message relay. Lead tasks remain open until supporting gates pass.
7. **Standing integration authorization:** any agent following this plan may use `integration/<date>-<slug>` to reconcile task states, assign new files, transfer ownership after gates, repair CI routing and update entry points. No new owner request is needed. Only one active integration PR; no simultaneous edits to affected files/ownership by lane PRs. If affected work is active, service independent work, then integrate once its owner merges or checkpoints/releases it. Unrelated lane PRs can continue. Integration may update lane docs while preserving their evidence; it cannot silently modify lane implementation code. Run `node test/lane_guard.js integration`. Keep tests and gates intact; integration is not a bypass.
8. Settings presentation transfers A→B with this v5 integration because SYNC-04 is DONE; auth/sync APIs stay A-owned. Other transfers require a recorded reason and updated ownership. New file ownership is a routine integration decision, not a user question.

### Defaults and limits

| Situation | Agent action | Human needed? |
| --- | --- | --- |
| Missing routine implementation/UI detail | Inspect existing patterns/contracts; choose the smallest reversible option, document it, test it | No |
| Red CI / unclear blame | Inspect failing jobs and paths, route to owning lane; reproduce/fix with unchanged assertions. Other lanes may work; only a corrective PR addressing the failure may merge over red main, with applicable PR gates green | No |
| Transient CI/tool failure | Retry at most twice after inspecting logs; then use a different supported route or checkpoint and advance independent work | Only if all authorized access routes require owner action |
| Cross-lane dependency, task promotion, stale status, model availability | Use requests/integration/default slices; use available capable model and effort | No |
| New dependency or source rename/removal | Prefer existing packages/additive changes. If essential, integration reviews necessity, pinned compatible version/license/security or exact replacement paths, and verifies preservation before enabling the narrow guard change | No for reversible in-scope code; never bypass the current guard |
| Backend schema work for an approved task | A creates a new migration, tests on disposable local stack incl. isolation/idempotency, records deployment/recovery plan; preserve applied migrations | No for design/local tests; production rule below |
| Irreversible production/user-data change, broadened access, new paid service, new external distribution, material product-scope choice | Prepare concrete diff, impact, tests, recovery and recommended option; pause only that action | Yes unless that exact action is already authorized |
| Credentials, account consent, protected-branch review, physical phone action unavailable to agent | Prepare everything possible; request the smallest remaining action once | Yes; never impersonate reviewer, obtain tokens insecurely or bypass restrictions |

**Backend production rule:** only A and only Lemma `yemqnhnztlbyxmjxidis`. Already scoped, additive/backward-compatible migrations may be applied after their PR merges, local security gates pass, target/history are verified and a recovery plan is recorded. Inspect locks/backfill/runtime risks; a supposedly additive change with destructive or uncertain data impact falls into the approval row. Never modify an applied migration, weaken isolation, create production test identities or run production fault injection. Record written, merged, applied and verified separately. Missing deployment access does not prevent merging safely gated code or other tasks.

**Escalation packet:** stable blocker ID; exact action/question; evidence and attempted alternatives; prepared diff/APK/checklist; recommendation; consequence of waiting; work continuing meanwhile. Bundle nonurgent owner actions into one request. Do not repeat a pending request without new evidence; silence is not consent. Security/data-loss failures stop the affected action immediately. Completed app consent steps remain recorded; do not ask for them again without a real new need.

### Verify and merge without routine approval

9. Documentation/ownership-only changes: `npm run test:plan`, applicable lane guard, `git diff --check` and links/consistency review. Code: `npm ci`, `npm run test:syntax`, slice tests, `npm test`, `npm run build` and applicable integration gates. Local runtime gaps may be covered by observed CI; explicitly distinguish NOT RUN locally from SUCCESS in CI. Do not rerun unrelated suites repeatedly without a changed cause.
10. UI changes require viewing screenshots for the tested SHA against the previous baseline. True browser zoom, CSS zoom stress, mocks, local-stack browsers and real devices are distinct evidence; never relabel an approximation to close a gate. Use an available browser/emulator/CI route before assigning work to the owner. Missing evidence leaves the criterion open, not the whole project idle.
11. Commit `type(task-id): summary`; PR title `[lane X] TASK-ID slice: summary` or `[integration] summary`. Include scope, validation, remaining gates, next action and lane handoff in the PR. Finalize evidence before the last tested commit; avoid endless documentation-only commits after green CI. Canonical PR/run links allow later readers to resolve the final merge without a bookkeeping-only PR.
12. Merge automatically when the actual head contains current `main`, diff/ownership are correct, required and applicable CI jobs are SUCCESS for that head/merge candidate, reviews (if required) are satisfied, and there are no conflicts/unresolved findings. Do not count an absent, skipped or cancelled required gate as success. GitHub auto-merge is currently disabled; an agent may call the merge API itself. Never turn off branch rules or fabricate review approval.
13. Re-read head/base immediately before merging; pass the expected head SHA to squash-merge. If main advanced, merge `origin/main` into the branch normally, preserve both sides of shared files and rerun affected CI. Never rebase a pushed branch. A failed merge is a recoverable PR, not permission for direct main pushes. Deleting the agent's own merged branch is optional.
14. A task becomes DONE only with every gate evidenced. Promote newly ready tasks automatically, using integration for cross-lane rows/snapshots. Verify relevant post-merge CI/deployment; on failure prioritize a corrective PR and pause further merges. Preserve previous green evidence but do not call the broken current head good. Before the terminal task closes, integration must teach the structural plan guard to allow zero NEXT only for a fully DONE queue; never invent a task to satisfy the current guard.

**GitHub access:** prefer available connector actions; `gh` REST is a fallback when GraphQL fails. Read `/repos/Mymayankyadav/lemma/pulls?state=open`, head check-runs/statuses and Actions jobs. Create/merge a PR using connector or REST with expected `sha` and `merge_method=squash`; never use a force update. Access failure is checkpointed with exact branch/SHA and retry instructions.

**Scheduled continuation:** the existing hourly “Advance Lemma development” task should consume this current plan. On each invocation use the same claims and priorities, recover inactive work, make a concrete eligible advance, and record outcomes. No duplicate scheduler, paid service or new automation is created by this document. If all work is blocked, persist blocker IDs and the condition to recheck; avoid repeat owner prompts. Once complete, report completion without inventing more scope. A future invocation resumes from GitHub, not chat memory.

## 4. Ownership, architecture, and reference precedence

Repo: [Mymayankyadav/lemma](https://github.com/Mymayankyadav/lemma), branch `main`. Web: https://mymayankyadav.github.io/lemma/. Backend: **`yemqnhnztlbyxmjxidis`**, Mumbai. **Carrel is a separate app/database; never modify it.**

| Responsibility | Existing code / reference |
| --- | --- |
| Scheduling, domain, review | `src/fsrs.js` (`preview`, `replay`, `makeClock`, `parseSteps`), `src/app/model.js` (`schedCfg`, `previewFor`), `session.js` (`answer`, `undo`), `review_ledger.js`, `review_replay.js` |
| Durability, identity, transport | `src/app/store.js`, `workspace_lifecycle.js`, `account_sync.js`, `sync_browser.js`, `outbox_core.js`, `sync_merge.js` |
| Shell, screens, rendering | `src/app/main.js`, `view_*.js`, `sheets.js`, `conflict_ui.js`, `src/app.css`, `src/render.js` |
| AI portability | `src/app/ai.js` currently requires `window.claude`; Settings' ArtifactData instructions are host-specific, not a working general connector. |
| Data / product contracts | `supabase/migrations/`; [study protocol](docs/STUDY_PLANNING_PROTOCOL.md); [sync reference](docs/PHASE2_SYNC_CONTRACT.md) |
| Lanes and ownership | `lanes.json` (who owns which file), `test/lane_guard.js`, `docs/lanes/*.md` (per-lane handoff) |
| Delivery / verification | `package.json`, `build.js` (`appFiles` order = load order), `test/`, `.github/workflows/`, `capacitor.config.json`, native `android/` (debug APK built by `android.yml`). |

Precedence: current user instruction → this plan for scope/order → supporting contracts. Source, tests and observed backend determine implementation status; correct stale prose rather than assuming it works. Historical audits are evidence only. Engineering `plan.md` is distinct from the student's versioned study plans.

## 5. Completed evidence ledger

| Milestone | Evidence / limit |
| --- | --- |
| Google sign-in, live web (AUTH-01) | [PR #17](https://github.com/Mymayankyadav/lemma/pull/17): live Pages PKCE sign-in, logout HTTP 204, re-login to the same `user.id`, expired-callback error with device data intact, backup acknowledgement enforced. Android OAuth deferred to ANDROID-02. |
| Android shell and CI APK (ANDROID-01) | [PR #9](https://github.com/Mymayankyadav/lemma/pull/9), [PR #12](https://github.com/Mymayankyadav/lemma/pull/12); [Android 40469725939](https://github.com/Mymayankyadav/lemma/actions/runs/40469725939) SUCCESS. Physical device NOT TESTED. |
| Deterministic review convergence (SYNC-03) | `review_replay.project`, transactional conflict resolution, undo/retraction gates, both-timezone replay test and two-page app due-date smoke; [regression 40449924808](https://github.com/Mymayankyadav/lemma/actions/runs/40449924808) SUCCESS. MOCK transport only. |
| Durable editor and crash recovery | [PR #2](https://github.com/Mymayankyadav/lemma/pull/2) and [PR #3](https://github.com/Mymayankyadav/lemma/pull/3) merged; main regression/Pages 40378487715/40378487955 and 40381695953/40381695797 SUCCESS. |
| Synchronous identity guards | `cloud_account.js`, `workspace_lifecycle.js`, `test/account_identity.js`, `test/workspace_browser.js`; [PR #4](https://github.com/Mymayankyadav/lemma/pull/4) merged; full main regression 40383331439 and Pages 40383331522 SUCCESS. |
| Durable imports | `IO.prepare/commit`, ImportSheet recovery, Store note/profile receipts; [PR #5](https://github.com/Mymayankyadav/lemma/pull/5) merged; full main regression 40420169362 and Pages 40420169191 SUCCESS. |
| Conflict evidence, transactions and UI | [PR #6](https://github.com/Mymayankyadav/lemma/pull/6) and [PR #7](https://github.com/Mymayankyadav/lemma/pull/7) merged; [main regression 40441775123](https://github.com/Mymayankyadav/lemma/actions/runs/40441775123) SUCCESS; [Pages 40441762109](https://github.com/Mymayankyadav/lemma/actions/runs/40441762109) SUCCESS. At that historical milestone replay/live activation were still gated; SYNC-03/SYNC-04 evidence above supersedes that limit. |

## 6. Five-line end-of-session report template

**Changed:** lane, task ID + slice, outcome, relevant files, PR and merge commit.
**Verified:** tested SHA, exact checks/run links and result.
**Still gated:** unfinished behavior and evidence limits; include owner-action blocker ID only when needed.
**Next:** automatically selected next slice, function/path, gate and cross-lane request IDs; no routine permission question.
**Handoff:** `docs/lanes/<X>.md` updated and merged to `main`, or exact branch/PR recovery steps.
