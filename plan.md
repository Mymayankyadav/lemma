# Lemma — canonical execution plan and chatbot handoff

> **FIRST READ FOR EVERY ASSISTANT.** If the user says **"follow the plan.md"**, read this file from GitHub `main`, inspect the live repository and recent CI, then **perform the next safe implementation task**. Do not spend the turn writing another plan unless it is materially out of date. When finished, **update this file in the same repository** for the next assistant. Chat history is *not* required.
>
> **Protocol v1.1 — 26 October 2026.** Applies to ChatGPT, Astra, Claude, Codex, or any other coding agent. Work is **sequential, ordinarily directly on `main`**. If a previous agent left work incomplete, adopt or repair it—never restart the project.

## 0. Operator instructions — the 60-second orientation

1. Fetch this **exact** file at `Mymayankyadav/lemma:main/plan.md` (not a remembered, uploaded, or cached copy), then read **§1 Current handoff**, **§2 Task queue**, and **§3 Protocol**.
2. Verify `main` HEAD, recent commits, the latest **regression** and **Pages deployment** runs. For backend work, inspect the dedicated Lemma Supabase project, migrations, and relevant policies. If evidence conflicts with this file, **observed source/CI/schema wins**; correct the handoff before proceeding.
3. Work on the **first actionable unblocked task**, using its acceptance criteria. Inspect existing implementations before writing code. Do not duplicate FSRS, rendering, persistence, or planning functionality already in the codebase.
4. Commit small, coherent, tested changes **to `main`**. Avoid branches/PRs unless the user requests them or policy explicitly prevents a direct commit. Never force-push, reset, or discard someone else's changes.
5. Finish by updating **§1 handoff**, **§2 task states**, and **§5 completed/evidence ledger** with real commit hashes, test results, blockers, and the **one precise next action**. This is mandatory even after partial progress. A CI run still pending must be reported as **pending**, not passed.
6. Reply briefly with implementation, commit/deployment evidence, and next unresolved item. A successful CI build is not proof of real cross-device sync.

The user's phrase **"follow the plan.md" is authorization to continue implementation**, not merely summarize this document. Prefer concrete, bounded progress to questions already answered in this file.

## 1. CURRENT HANDOFF — update at the end of EVERY coding session

**Last verified handoff:** 2026-10-26, first canonical-handoff implementation complete. **Working branch:** `main`; no active chatbot work is presumed after a response ends. **Session state:** `READY_FOR_NEXT_AGENT`.

**This session implemented:** root `plan.md`, `AGENTS.md`, `test/plan_protocol.js`, updated `README.md` and `package.json` (runs `test:plan` during `npm test`), retired obsolete `PROMPT.md`, and clarified precedence in `docs/DEVELOPMENT_ROADMAP.md` and `docs/SETUP.md`. **No app/Supabase behavior was changed this session.**

| Field | Last verified fact |
| --- | --- |
| Repository | https://github.com/Mymayankyadav/lemma |
| Canonical branch | `main` |
| Known-good main baseline before protocol | `051f117b3708ddc55d8303fd3c6bda1148f7f4cf` (merge of PR #1) |
| Full regression at baseline | [run 40351875233](https://github.com/Mymayankyadav/lemma/actions/runs/40351875233) — **success** |
| Pages deployment at baseline | [run 40351875125](https://github.com/Mymayankyadav/lemma/actions/runs/40351875125) — **success** |
| Web | https://mymayankyadav.github.io/lemma/ |
| Backend | **Lemma only**, Supabase ref `yemqnhnztlbyxmjxidis`, Mumbai `ap-south-1` |
| Last independently tested HEAD for handoff protocol | `104707fc4a44bd6c88fe8e83ec43dd16c5aa2843` — [regression 40353975777](https://github.com/Mymayankyadav/lemma/actions/runs/40353975777) **SUCCESS** (`npm test` includes the plan contract) |
| Last web deployment since handoff files | [Pages run 40353778265](https://github.com/Mymayankyadav/lemma/actions/runs/40353778265) **SUCCESS**; docs-only follow-up does not change built app |
| Last source-controlled migration | `supabase/migrations/20261026203000_revision_safe_profiles.sql` — deployed successfully |
| Backend security check | Supabase security advisor: **zero reported findings** after profile CAS migration; this is not a complete penetration test |
| Current application safety | Existing flashcard app works with its original Store. Supabase account cache/outbox is implemented, but **active account Store activation remains gated**, not triggered by login. |
| Cloud confidence | **Not proven end-to-end** with real authenticated devices, simultaneous offline reviews, or Android |
| Android | Capacitor dependencies/config exist; no verified production APK, native deep-link/sync lifecycle, or device test |
| Current source head / last handoff commit | **RE-FETCH GITHUB LIVE HEAD**: the final commit editing this very file cannot include its own unknown SHA. Record the previous *tested* SHA above; the new agent must inspect current HEAD and newer CI. |

**Next action, in one sentence:** **SYNC-01** — inspect the gated account-switch lifecycle across `Store.activateAccount`, `LemmaSync.attach/stop`, `Model.replaceAll`, and `Session`; add an identity-safe, no-loss account-switch orchestration with crash/unsaved-review tests, but leave the public activation control disabled until SYNC-02 and SYNC-03 gates pass.

**Known risks to inspect before active sync:** profile CAS is deployed, but client conflicts lack a review/resolve UI; local model/workspace can diverge from account cache during identity transitions; concurrent offline review schedules and old six-field histories need a verified baseline policy; tests against mock Supabase do not replace live two-identity verification; status cannot claim cloud-confirmed until ack.

**When you end a session, replace this paragraph/table with the latest evidence**, not an optimistic forecast. Preserve the task IDs below. Keep the current handoff concise enough for the next model to grasp quickly.

## 2. Task queue — stable IDs, priority and exit criteria

Statuses: `DONE` = committed + checked against stated gate; `IN_PROGRESS` = demonstrable partial work; `NEXT` = immediate; `BLOCKED` = missing prerequisite; `LATER` = waiting on earlier phase. **Do not mark DONE for design-only, untested UI, or CI passing without a required live test.**

| ID | State | Work and non-negotiable exit condition |
| --- | --- | --- |
| **HANDOFF-01** | **DONE** | Root `plan.md` is authoritative; future agents update it; entry points point here; handoff validator runs in CI. |
| **FOUNDATION-01** | **DONE** | Source imported, existing math flashcards and original FSRS-6 preserved, web deployed, npm tests + Chromium E2E successful on main at baseline. |
| **SYNC-00** | **DONE (infrastructure only)** | Owner-scoped RLS, revision-safe note/profile/plan RPCs; durable per-account outbox; immutable review ledger and Undo retractions; read-only account comparison; local persistence regression tests. **Does not mean sync is live.** |
| **SYNC-01** | **NEXT** | Safe account workspace lifecycle: explicit identity-scoped switch boundaries; no open review/editor during switching; await all local commits; safely load/restore Model, profile, account cache; prevent cross-account stale async callbacks; robust sign-out/account-switch recovery. Tests for A → B → A, sign-out in flight, aborted storage, recover after reload. No automatic switch on login. |
| **SYNC-02** | **BLOCKED: SYNC-01** | Conflict UI/repair path for note content, tombstones, per-note queue and profile CAS. Preserve both versions and ancestor, never silently resume a stale write. Test two offline devices, simultaneous edits/deletes and lost acknowledgments. |
| **SYNC-03** | **BLOCKED: SYNC-01/02** | Review convergence using **existing `src/fsrs.js`** only: reconcile stable review IDs, immutable retractions, scheduling provenance and legacy baselines; verify due states for concurrent reviews, undo, resets, fuzz/learning steps. No alternate FSRS implementation or last-writer-wins schedule. |
| **SYNC-04** | **BLOCKED: SYNC-01/02/03** | Expose **explicit** account activation after backup/preflight; stage all normal mutations atomically; correct local/pending/confirmed/error UI; real authenticated two-identity/two-browser offline/reconnect test plus RLS test. Only then claim automatic sync. |
| **PLAN-01** | **LATER** | Curated/versioned mathematical context editor and plan revision approval UI following `docs/STUDY_PLANNING_PROTOCOL.md`. No silent re-planning; stable checkpoint IDs. |
| **TUTOR-01** | **LATER** | Least-privilege Claude/ChatGPT learning-context tools; portable checkpoint/attempt/hints/handoff with expected revisions and authenticated owner checks. |
| **ANDROID-01** | **LATER** | Reproducible Capacitor Android builds; auth redirects, app lifecycle sync, notifications, device smoke tests. PWA deployment ≠ APK update. |
| **RELEASE-01** | **LATER** | Source-linked backups/restore, account deletion, security threat model, monitoring, performance, end-to-end fault matrix and release gates. |

**Task-selection rule:** work on `SYNC-01` first unless the verified repository reveals an urgent build, data-loss or security regression; fix that first, document the deviation, then resume. For a large task, complete one independently testable substep and leave the next exact code location and acceptance test in §1. Do not switch to speculative UI work just because the primary task is hard.

## 3. Sequential chatbot protocol — start → implement → hand off

### 3A. Start / adopt

- **Never trust remembered chat state.** Start from `main` HEAD and `plan.md`. Inspect changed files and recent commits since the verified handoff, CI results, and Supabase migration history if relevant.
- One writer at a time is expected. **If `main` unexpectedly changes during a session, stop writing, refetch the current HEAD and affected file blobs, reconcile, then continue.** Do not overwrite newer code or force-update refs. Connector content writes should use a freshly fetched blob SHA (optimistic concurrency).
- If the last assistant stopped mid-task, trust durable commits and failed-test output, not its prose. A missing final handoff means **reconstruct state from GitHub and update §1**.
- Check for unfinished GitHub Actions runs and potentially breaking migrations. Do not recreate the repository, re-import a ZIP or rerun old one-time migrations.
- Respect the active task's acceptance tests and the existing source; read affected modules *before* coding. Prefer the existing test/adapter/API rather than a parallel abstraction.

### 3B. Implementation discipline

- **Main-first, consecutive changes.** Direct commits to `main` are allowed by the user. Keep each commit coherent and undoable. Do not use draft PRs by default, unless organizational rules require review.
- Database migrations: use a **new ordered SQL file** in `supabase/migrations/`, review RLS/grants/rollback risk, apply only to **Lemma**, verify via SQL/security advisor, then record deployed status. Never confuse writing SQL to GitHub with applying it to Supabase.
- Web deploy: changing code on main should trigger GitHub Actions; confirm **Deploy Lemma web** separately from **Lemma regression tests**. A workflow not yet complete is `PENDING`.
- **Data safety:** never automatically merge anonymous/Claude data into a logged-in account; never drop dirty IndexedDB rows, review logs, pending requests, user-authored proofs or old migrations. Do not enable account switching when review due-state convergence is unverified.
- Preserve `src/fsrs.js` and `src/render.js` implementations; only change with a demonstrated bug and golden-test coverage. Reuse `FSRS.replay`/`FSRS.preview` rather than recreating scheduling logic.
- Tests: normally run `npm ci`, `npm run test:syntax`, `npm test`, `npm run build`. If local dependencies or browsers are unavailable, rely on the **actual GitHub CI logs** and disclose the limitation. Add regression tests for changed behavior.
- Security: no secret/service-role key in browser, Android, repo or prompt; public Supabase publishable key only with owner RLS. No edits to Carrel database or repository.
- Do not equate "schema exists" with "feature works," "cache updated" with "server acknowledged," or "test passed" with "real two-device verification passed."
- For uncertain destructive migration, irreversible data change, payment or production secret requirement: pause that action, document a safe blocker and proceed with other safe work.

### 3C. End / handoff (MANDATORY)

Before ending a **coding** session, commit an update to this file containing:

1. **Latest independently tested `main` SHA** (or explain uncommitted/failed work), commits and files touched. The handoff file **cannot contain the SHA of its own not-yet-created commit**; the next agent obtains the final tip from GitHub.
2. **Evidence:** exact CI/workflow links and their success/failure/pending status, deployment evidence, Supabase migration/security check if touched.
3. **What changed** vs **what is still unimplemented**; distinguish test/mock from production/live data.
4. **Task queue update** with current ID and state; do not change IDs casually.
5. **One precise next action**, its module paths, intended change and acceptance test; mention blockers and recovery steps.
6. **No secrets, local-only artifact paths, hidden conversation links, or assumptions** needed by the next chatbot.

Update the handoff **after** implementing code, not as a replacement for code. If a session must stop before CI finishes, record links with `PENDING` and instruct the next agent to inspect results first. The handoff update is the **final content commit** when possible; its own CI may still be pending.

### 3D. Interrupted/failed session

- Detect failure by checking main's newest commits, latest workflow logs, and any unapplied/deployed migrations. Never blindly rerun a migration that succeeded but whose SQL commit was interrupted.
- Preserve failed outbox mutations and their request IDs. If profile/note retries returned an uncertain result, use the existing idempotency keys instead of creating new ones.
- Repair a failed gate on main with a small regression commit. If a deployed change is dangerous, use an explicit reversible fix/rollback with tests; **do not reset main**.
- Update §1 to show `BLOCKED`, failing SHA/workflow, exact error, and the next recovery command/task.

## 4. Ownership, architecture, and reference precedence

**Resources:** repo `Mymayankyadav/lemma` · project `yemqnhnztlbyxmjxidis` only · web https://mymayankyadav.github.io/lemma/ · Supabase https://supabase.com/dashboard/project/yemqnhnztlbyxmjxidis . **Carrel is separate: never modify it.**

**Precedence for conflicts:**
1. Current explicit user instruction and observed runtime/database facts.
2. This `plan.md` for **engineering task order, status, handoff and safety**.
3. Actual `main` source, migrations, tests and CI for **what was implemented**.
4. `docs/STUDY_PLANNING_PROTOCOL.md` for product semantics; `docs/PHASE2_SYNC_CONTRACT.md` and `docs/SYNC_AUDIT_2026-10-26.md` for engineering constraints; `docs/ROADMAP_AMENDMENTS.md` for adopted product changes.
5. `docs/DEVELOPMENT_ROADMAP.md`, `PROMPT.md`, and older README history are background only if they disagree with current facts.

| Area | Existing source to reuse |
| --- | --- |
| FSRS-6 and scheduling | `src/fsrs.js`, `src/app/model.js`, `src/app/session.js`; `test/compare_tsfsrs.mts` |
| UI, rendering, interaction | `src/app/main.js`, views, `src/render.js`, `src/app.css` |
| Original local/Claude persistence | `src/app/store.js`; `test/local_persistence.js` |
| Account auth and lifecycle | `src/app/cloud_account.js`, `src/app/account_sync.js` |
| Durable per-user storage / transport | `src/app/sync_browser.js`, `src/app/outbox_core.js`, `src/app/review_ledger.js`, `src/app/sync_merge.js` |
| Live DB contracts | `supabase/migrations/` and authenticated RLS; `commit_note`, `commit_profile`, `publish_study_plan` RPCs |
| Tests and delivery | `test/`, `.github/workflows/test.yml`, `.github/workflows/pages.yml`, `package.json` |

## 5. Completed evidence ledger — append only significant milestones

| Date | Change | Commit/verification |
| --- | --- | --- |
| 2026-10-26 | Existing app imported, web build deployed, local durable review and Undo path, Supabase auth skeleton and explicit transfer controls | Main history, source tests |
| 2026-10-26 | Astra durability and account-sync scaffolding merged to main; local review provenance, retractions, CAS notes, owner-scoped cache and comparison; **automatic active account sync remains gated** | [merged PR #1](https://github.com/Mymayankyadav/lemma/pull/1), merge `051f117b3708`, [regression](https://github.com/Mymayankyadav/lemma/actions/runs/40351875233) success, [Pages](https://github.com/Mymayankyadav/lemma/actions/runs/40351875125) success |
| 2026-10-26 | Deployed revision-safe profile RPC and removed direct authenticated profile writes; added profile outbox staging and tests | `20261026203000_revision_safe_profiles.sql`, Supabase security advisor **zero findings** |
| 2026-10-26 | Introduced canonical sequential-chatbot handoff, updated README and retired old PROMPT; root plan structural guard runs in regression suite | [main regression 40353975777](https://github.com/Mymayankyadav/lemma/actions/runs/40353975777) **success** at `104707fc4a44`; plan contract uses `npm run test:plan` |

## 6. Five-line end-of-session report template

**Implemented:** precise user-visible and backend changes, with files and commits.

**Verified:** named tests / GitHub Actions links / deployed migrations, each marked SUCCESS, FAILED, NOT RUN or PENDING.

**Still gated:** important behavior not proven or not exposed to end users.

**Next task:** `TASK-ID` — exact file or function, required test, smallest safe next step.

**Handoff:** updated `plan.md` on `main`; previous tested SHA (live HEAD is authoritative after this document commit); any blocker that the next chatbot must read.

**Do not leave `plan.md` stale. The next chatbot will have only: "follow the plan.md".**
