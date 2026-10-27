# Lemma — canonical execution plan and chatbot handoff

**Protocol v4 (parallel lanes) · 27 October 2026.** This is the only engineering roadmap and task queue. Git history retains older roadmaps. It is written so that any model (including smaller ones) can execute it literally: every decision needed for the NEXT task is already made below. If something you need is **not** decided here, stop and ask the owner instead of inventing policy. A later **"follow the plan.md, lane X"** means implement lane X's next bounded slice; a request only to plan/review does not authorize code changes.

## 0. Operator instructions

Up to **three agents may run at the same time, one per lane** (A sync/auth/backend, B UI, C Android). Each agent works only on its own lane's files (`lanes.json`), on its own branch, and merges through a pull request. Never more than one agent per lane. No old chat, local workspace or particular model is required.

**Quick start (run literally):**
1. Know your lane. The owner names it ("follow the plan.md, lane B"). If no lane was named, ask the owner one question; if nobody can answer, stop without changes.
2. `git clone https://github.com/Mymayankyadav/lemma && cd lemma && npm ci`.
3. Read `docs/lanes/<X>.md` (your handoff and "Next action") and your task's rows/slices in §2. Read `lanes.json` to see which files you own.
4. List open PRs (§3 "GitHub commands"). If a PR from your lane's branch prefix (`lane-x/`) is open, continue on that branch instead of starting a new one. Never touch another lane's PR or branch.
5. `gh run list --branch main -L 3`. If the latest `main` run FAILED, read §3 rule 10 before doing anything else.
6. Do one slice, following §3.

**Product goal:** a private, persistent mathematics learning workspace for a PhD student. Curate shared knowledge, approve a thoughtful study plan, attempt proofs with interchangeable tutors, retain evidence and misconceptions, and review useful cards. Switching Claude/ChatGPT or devices should not require restarting the lesson. Supabase is the authenticated source of truth; durable local storage supports immediate interaction and offline work.

**Scope boundaries**
- Preserve the imported app, original FSRS-6, mathematical rendering, prerequisite links, review/Undo, import/export and user data. Extend existing modules; no framework rewrite or parallel scheduler/store.
- **No new image-upload features:** no camera, OCR, scanning, image-based tutoring, gallery or media-management project. Preserve compatibility with existing card media without expanding it.
- Exception: private file attachments may support a study project's shared knowledge. Start with curated text, Markdown and source references; accept PDFs/documents only when needed, with citations and bounded retrieval. This is not a general upload product.
- "Shared" means the same owner's knowledge available to successive tutors, not public sharing or multi-user collaboration.
- Optimize for understanding and continuity, not chat volume, decorative dashboards, streak pressure or speculative AI infrastructure.

**Hard "never" list (violating any of these is a failed session):** force-push; push directly to `main` (always use a PR); edit files outside your lane (`node test/lane_guard.js <X>` must pass); delete or rename tracked files without owner approval; touch another lane's branch, PR or status file; modify Carrel; put secret keys in client code, repo or plans; delete/clear dirty caches, receipts, outbox entries or review history to make a test pass; weaken an assertion or `test/plan_protocol.js` to make it pass; re-import the original ZIP or rewrite `src/fsrs.js` maths; mark a task DONE without its gate; claim a check passed that you did not see pass.

## 1. CURRENT HANDOFF

**Per-lane handoffs live in `docs/lanes/A.md`, `B.md`, `C.md`; each lane updates only its own file.** This section is a shared snapshot changed only in owner-requested integration sessions, so lanes never conflict over it.

**Last verified handoff:** 2026-10-27; integration snapshot at `main@5cf1d42` (after PR #26; no lane PR open). SYNC-04 remaining gates re-planned onto a local Supabase stack (§2 "SYNC-04 slices"). AUTH-01 DONE (live web gate, PR #17); UI-01 S1–S2 DONE (PRs #15, #18); ANDROID-01 DONE (CI APK; physical device untested). **State: READY_FOR_NEXT_AGENT** in lanes A and B; lane C dependency-blocked.

| Field | Evidence / limit |
| --- | --- |
| Known-good main baseline | The latest SUCCESS run of "Lemma regression tests" on `main` (`gh run list --branch main --workflow test.yml -L 1`) is authoritative. At this snapshot: `2c1f554` regression [40478252724](https://github.com/Mymayankyadav/lemma/actions/runs/40478252724) and Android [40478252732](https://github.com/Mymayankyadav/lemma/actions/runs/40478252732) SUCCESS. |
| Cloud confidence | Live Pages Google sign-in/out and same `user.id` verified (AUTH-01). Live automatic create/update, reload and same-profile tabs verified (SYNC-04 L1); approved server tombstone (L2). Independent-device convergence, offline/expiry/lost-response and two-identity HTTP RLS NOT VERIFIED; planned on a local stack (L5–L8). |
| Backend security check | Lane A only. RLS on all four sync tables, nine applied migrations; rollback-only SQL two-role probe passed. Two-identity HTTP probe NOT RUN (L6 runs it locally; L8 proves production matches). |
| Owner action needed | None for SYNC-04: no signed-in browser and no second Google identity are required any more. Later, two short owner smoke checks are scheduled in ANDROID-02/RELEASE-01. Optional: sideload the `main` debug APK and report Back/resume behaviour in `docs/lanes/C.md`. |
| CI screenshots | Artifact downloads are blocked in agent sandboxes. Regression CI therefore also pushes the `test:ui` PNGs to the never-merged `ci-screenshots` branch: `main/` = latest `main` (the "before"), `pr-<n>/` = latest run of PR n (the "after"); each folder's README names its source commit. View: `gh api -H "Accept: application/vnd.github.raw" "repos/Mymayankyadav/lemma/contents/pr-<n>/<file>.png?ref=ci-screenshots" > x.png`, then open the image. Never merge or edit that branch. UI-01 S3 (PR #21) merged before this existed: lane B must review its `main/` screenshots before starting S4. Integration PRs use branch prefix `integration/`. |

| Lane | Scope (files in `lanes.json`) | NEXT task | Branch prefix | Status file |
| --- | --- | --- | --- | --- |
| A | sync, auth, Supabase, account Settings | SYNC-04 L5 (local Supabase stack in CI) | `lane-a/` | [A.md](docs/lanes/A.md) |
| B | screens, CSS, navigation, rendering | UI-01 gate review (S1–S4 done) | `lane-b/` | [B.md](docs/lanes/B.md) |
| C | native Android shell and build | none — ANDROID-02 waits for SYNC-04 and UI-01; do not start work | `lane-c/` | [C.md](docs/lanes/C.md) |

**Next action, in one sentence:** lanes A and B do the "Next action:" line at the top of their `docs/lanes/<X>.md` (lane A: SYNC-04 L5); lane C stays idle until SYNC-04 and UI-01 are DONE.

## 2. Task queue

States: **DONE** (gate passed, with evidence), **NEXT** (at most one task per lane), **IN_PROGRESS**, **BLOCKED** (dependency unfinished), **LATER**. Each lane works only on rows with its letter in the Lane column; "—" means done or not yet assigned (an integration session assigns it when its dependencies are DONE). Large rows are split into slices; one slice per session is normal. Keep remaining criteria in the row.

| ID | State | Lane | Depends on | Requirement and completion gate |
| --- | --- | --- | --- | --- |
| **HANDOFF-01** | **DONE** | — | — | Canonical plan, short entry points and existing `test:plan` guard. Maintain them with every change. |
| **FOUNDATION-01** | **DONE** | — | — | Imported app, web build, local cards, original FSRS/rendering and baseline tests exist. Preserve them. |
| **SYNC-00** | **DONE** | — | — | Account/outbox/RPC/ledger infrastructure exists in source. This is not completed live sync. |
| **SYNC-01** | **DONE** | — | SYNC-00 | Editor durability/crash recovery, account invalidation and durable import recovery; browser gates passed in regression 40419737189. |
| **SYNC-02** | **DONE** | — | SYNC-01 | Conflict evidence, transactional note/profile/tombstone resolution, three-version comparison and explicit choice controls. Gate passed in main regression 40441775123 (mocked transport, not live sync). |
| **SYNC-03** | **DONE** | — | SYNC-02 | Converge review/Undo schedules deterministically from the immutable ledger using existing `FSRS.preview` and `ReviewLedger`. Never take the latest card snapshot as truth; never fabricate legacy history. Gate: concurrent offline reviews/Undo, equal timestamps, timezone/rollover, fuzz and parameter changes produce the same card state on both devices; unsupported histories stay preserved and explicitly blocked. Follow slices S1–S4 below. |
| **AUTH-01** | **DONE** | A | SYNC-01, SYNC-03 | Google sign-in is the primary Supabase auth method; email magic link stays as fallback. Web gate passed 2026-10-27 (PR #17; evidence in `docs/lanes/A.md`). Android OAuth (S3) is part of ANDROID-02. |
| **SYNC-04** | **DONE** | A | SYNC-03, AUTH-01 | Automatic account synchronization without routine manual Sync. L1/L2 live web create/update/reload/tombstone, L3/L4 PRs #25/#26, L5 local stack PR #28, L6 two-identity HTTP RLS PR #29, L7 real independent persistent-browser devices and offline/expiry/lost-response PR #30, L8 production/local exact security parity PR #31. Owner-approved **byte-identical** migration version renames are guarded by integration PR #32. **Final main-branch gate PASS at `24f9c16`:** [local stack + L5–L8](https://github.com/Mymayankyadav/lemma/actions/runs/40555709587), [regression + screenshots](https://github.com/Mymayankyadav/lemma/actions/runs/40555709552), [Android + lane guard](https://github.com/Mymayankyadav/lemma/actions/runs/40555709588). Source-of-truth Supabase Lemma only; no user-data or Carrel mutations. Production independent-phone smoke remains separately in ANDROID-02/RELEASE-01, not an unmet SYNC-04 gate. |
| **UI-01** | **NEXT** | B | SYNC-01 | Apply the UI contract below to existing screens incrementally. Keep working routes and controls while Study is built later. Settings is excluded until SYNC-04 is DONE (lane A owns `view_settings.js`). Follow "UI-01 slices". Gate: mobile/desktop light/dark screenshots, keyboard navigation, 200% text, long mathematical expressions, empty/loading/error/offline states and existing review flows. |
| **KNOWLEDGE-01** | **LATER** | — | SYNC-04, UI-01 | Reuse context/source/section tables for private project knowledge: goals, background, notation, references, verified skills and editable summary. Scope context, plans and evidence to stable project/context IDs. Version changes; distinguish learner-authored facts from tutor proposals. Optional documents need private access, size/type limits, extraction status, stable source/version/page IDs and removal controls; no OCR. Gate: two tutors retrieve the same accepted revision and cited excerpt without loading the entire collection; another owner cannot read it. |
| **PLAN-01** | **LATER** | — | KNOWLEDGE-01 | Build context→draft→review→approved plan and a checkpoint screen for objective, attempt, hints, feedback, evidence and next action. Strong-model planning is user-selected and occasional. Reuse existing schema/RPC, first verifying event append-only enforcement, context revision safety, publication metadata/idempotency and approval permissions. Amendments need a diff and acceptance; preserve unaffected checkpoint IDs/evidence. Gate: 12-checkpoint plan, two demonstrated checkpoints, mid-proof resume, accepted prerequisite amendment and rejected stale revision; failed/retried writes never duplicate evidence. |
| **TUTOR-01** | **LATER** | — | PLAN-01 | Deliver bounded Markdown/JSON handoff export/import first; add authenticated owner-scoped context/source/event/card/plan-proposal tools when supported. Validate imported schema, IDs and expected revisions. Tutors may propose cards/amendments; student approves. Persist attempts and hints; never mark mastery just because content was displayed. Gate: Claude→ChatGPT→Claude resumes the exact unfinished proof and hint level, stale writes fail, approved cards retain provenance and use existing FSRS. Core study works without a host-specific AI API or paid model call. |
| **ANDROID-01** | **DONE** | C | — | Reproducible Capacitor Android project and CI debug build from existing source, plus native Back/resume shell. No sign-in, sync or web UI changes. Follow "ANDROID-01 slices". Gate: `android.yml` builds a debug APK artifact on the PR; full `npm test` green; web `dist/` behaviour unchanged. |
| **ANDROID-02** | **LATER** | C | ANDROID-01, SYNC-04, UI-01 | Device gates (the phone is also SYNC-04's production independent device: owner edits on phone, confirms it on Pages, and a deleted `SYNC-04` fixture stays deleted): safe areas, keyboard, Google sign-in via system browser + deep link (AUTH-01 S3), foreground recovery and offline launch. Optional due-review notifications: opt-in, quiet by default, configurable time, no stale duplicates, tap opens relevant review. Gate: physical-device install, permission denied/granted, offline edits/restart/reconnect and notification checks. Document APK update delivery; Pages deployment does not update bundled native assets. |
| **RELEASE-01** | **LATER** | — | All above | Verify backup/restore of cards, schedules, context, plan versions, events and source references; safe migrations, deliberate account erasure, scoped connector access and recovery. Test PWA service-worker offline/update separately (current UI suite disables it). Gate: restore round trip, no lost/duplicated events, cross-owner isolation (re-run L8 parity), both tutor handoff directions and web/Android smoke checks, including a 5-minute owner production sync smoke (two own devices, one offline edit). |

SYNC-03's replay rules (D1–D8) now live in [the sync contract](docs/PHASE2_SYNC_CONTRACT.md#review-replay-policy-v1-sync-03-moved-from-planmd); lane A must follow them.

### UI-01 slices (lane B)

Each slice is one PR. Every PR attaches the S1 screenshots (before/after) in its description. Do not change behaviour of sync/account code; do not touch `view_settings.js`.

**[x] S1 — screenshot harness, no visual change (PR #15).** Create `test/ui_screenshots.js`: build is already done by `npm test`'s e2e step, so serve/launch `dist/` exactly the way `test/e2e.js` does (copy its server and Playwright launch code), seed data with `test/seed.js`, and capture Home, Cards list, Editor, Review and Stats at 390×844 and 1280×800 in `colorScheme` light and dark into `test-output/ui/<screen>-<size>-<scheme>.png` (already git-ignored; never commit PNGs). Add `"test:ui": "node test/ui_screenshots.js"` and append `&& npm run test:ui` to the end of `"test"`.
**[x] S2 — navigation and Today (Stats tab kept until S4).** In `main.js`, label navigation **Today / Cards / Settings** (Study stays hidden until PLAN-01); keep every existing route/hash working. In `view_home.js`, make due reviews the single primary action. Gate: e2e green, screenshots, keyboard-only navigation works.
**[x] S3 — Cards (`view_browse.js`, `view_editor.js`, `sheets.js`).** ≥44px tap targets, visible focus, long equations scroll locally (`overflow-x:auto` on display math), empty/loading/error states. Do not change editor save/durability logic (it calls lane A's Store).
**[x] S4 — Review and Stats (local `npm test` green; CI pending) (`view_review.js`, `view_stats.js`, `charts.js`).** Reduced motion, existing keyboard shortcuts unchanged, advanced FSRS/stat controls behind progressive disclosure. Gate: full UI-01 gate in the row above except Settings.

### SYNC-04 slices (lane A) — feasible verification

Why: agents cannot hold the owner's Google session or extract tokens, no second real Google identity exists, and fault injection on production data is forbidden. Instead CI starts `supabase start` (Docker on `ubuntu-latest`, `supabase/setup-cli` action) applying exactly `supabase/migrations/`. Disposable email/password users exist only there, never on Lemma. `build.js` already reads `SUPABASE_URL`/`SUPABASE_PUBLISHABLE_KEY`, so `dist/` targets the local stack unchanged. Lane A's new `.github/workflows/sync-local.yml` runs on lane A paths and `main`; `"test:sync-local"` is not appended to `"test"` (needs Docker).

**[x] L5 — local stack (CI [40522126776](https://github.com/Mymayankyadav/lemma/actions/runs/40522126776) SUCCESS).** `supabase/config.toml` (`supabase init`; site URL and redirect `http://127.0.0.1:*/**`, `jwt_expiry` short, e.g. 60 s, local only), workflow, and a smoke that `supabase db reset` applies all migrations and RLS is enabled on the four sync tables. No app change.
**[x] L6 — two-identity HTTP RLS (PR #29 local GoTrue/PostgREST CI [40528408878](https://github.com/Mymayankyadav/lemma/actions/runs/40528408878) SUCCESS).** Give `test/auth_http_rls.js` a `--local` mode: origin restricted to loopback, local publishable key, two users signed up via local GoTrue, one `SYNC-04` fixture each created through `commit_note`. Same assertions as `--live`.
**[x] L7 — independent devices and faults through the real UI (merged PR #30; exact offline EDIT plus real browser fault suite [40546214237](https://github.com/Mymayankyadav/lemma/actions/runs/40546214237) SUCCESS).** `test/sync_local_e2e.js`: two persistent Playwright contexts (separate storage = independent devices) sign in through the app's email-link fallback, reading links from the stack's Mailpit. Gates: create/update/delete on one converges on the other without manual sync and survives reload (no resurrection); offline edit → close → relaunch → reconnect delivers once; expiry → refresh and delivery without duplicate; lost response after commit (`route.fetch()` then `route.abort()`) → retry yields one revision and one receipt; user B never sees A. Assert revisions, receipts and `deleted_at` via local `psql`; never wipe storage.
**[x] L8 — production parity ([local-stack 40554180723](https://github.com/Mymayankyadav/lemma/actions/runs/40554180723) SUCCESS, exact metadata diff empty).** `supabase/tests/security_snapshot.sql` (read-only: RLS flags, `pg_policies`, function definitions/grants on sync tables and RPCs). Run on the local stack in CI and on Lemma via the Supabase connector; diff must be empty and migration lists equal. Record both in `docs/lanes/A.md`. On green, mark SYNC-04 DONE and move `view_settings.js` to lane B in an integration session.

`--live` stays optional, not a gate. Residual production risk (Google refresh, Pages caching, mobile networks) is covered by ANDROID-02 and RELEASE-01.

### ANDROID-01 slices (lane C)

**[x] S1 — project and CI build.** Run `npm run android:add` (builds and runs `cap add android`); keep `capacitor.config.json` `appId` `io.lemma.study`. Commit `android/` minus ignored build outputs. Add `.github/workflows/android.yml` (on `pull_request` and `push` to `main`): checkout, Node 22, `npm ci`, Java version required by Capacitor 8's Android docs (check them; likely Temurin 21), `npm run android:sync`, `cd android && ./gradlew assembleDebug`, upload `android/app/build/outputs/apk/debug/*.apk` as an artifact. Write `docs/ANDROID.md` (build and sideload steps). No new npm dependencies in this slice.
**[x] S2 — native shell (mock and CI verified; device check deferred to ANDROID-02).** Add `@capacitor/app` (pre-approved; pin the exact version matching `@capacitor/core`). Create `src/app/native_shell.js`, append it to `build.js` `appFiles` after `util.js`; when `window.Capacitor?.isNativePlatform()` is true, map the hardware Back button to `history.back()` (exit app at the root screen) and log resume events. It must be a no-op on the web. Anything needing CSS (safe areas) or sign-in changes goes as a request to lane B or A.

### AUTH-01 execution slices (Google sign-in)

Current state (verified at `main@978f784`): `LemmaAccount.signIn(email)` in `src/app/cloud_account.js` uses `client.auth.signInWithOtp` (email magic link); `src/app/view_settings.js` renders an email box and "Send sign-in link". No OAuth code exists. `createClient(cfg.url, cfg.publishableKey)` uses default options.

**Owner prerequisites (agents must NOT do these, and must never commit the client secret):** in Google Cloud Console create an OAuth client (type Web application) with authorized redirect URI `https://yemqnhnztlbyxmjxidis.supabase.co/auth/v1/callback`; in Supabase Dashboard → Authentication → Providers enable Google with that client ID/secret; in Authentication → URL Configuration keep Site URL `https://mymayankyadav.github.io/lemma/` and allow `https://mymayankyadav.github.io/lemma/`, `http://localhost:*/**` and (for Android) `io.lemma.study://auth-callback`. If an agent cannot confirm these are done, it records "Google provider config: UNVERIFIED (owner)" in `docs/lanes/A.md` and still ships S1 behind the existing UI.

**Decisions:** A1 Google is the primary button; email link stays as a smaller fallback. A2 Use `flowType: 'pkce'` in `createClient` options (`{auth: {flowType: 'pkce', detectSessionInUrl: true, persistSession: true}}`); verify email links still work with PKCE in the S1 test. A3 Request only default scopes (`email profile openid`); no Google API access, no Drive/Calendar scopes. A4 Never merge anonymous device data on sign-in (unchanged rule). A5 No new npm dependency on web; Android may add `@capacitor/app` and `@capacitor/browser` (pre-approved, pin exact versions matching `@capacitor/core`).

**[x] S1 — PKCE Google button, email fallback, safe callback errors; CI 40450843938 (mocked OAuth).**

**[x] S2 — live web check COMPLETE (2026-10-27).** Evidence: `docs/lanes/A.md`.

**[ ] S3 — Android (done inside ANDROID-02).** Open the OAuth URL from `signInWithOAuth({..., options:{redirectTo:'io.lemma.study://auth-callback', skipBrowserRedirect:true}})` with `Browser.open`; handle `App.addListener('appUrlOpen')`, call `client.auth.exchangeCodeForSession(code)`, then `Browser.close()`. Register the intent filter for scheme `io.lemma.study`. Never use an embedded WebView for Google login (Google blocks it). Gate: physical device sign-in, cancel, and offline-launch while signed in.

**UI contract:** retain Lemma's mathematical notebook character, restrained indigo accent, serif math and clear system UI text. Use consistent spacing, typography, borders and icons; quiet surfaces and generous reading space. Avoid new decorative illustrations, dense widget grids and excessive shadows.

Target navigation is **Today / Study / Cards / Settings**, with visible labels on mobile; introduce Study only when usable. Today foregrounds "Continue study" and due reviews; Cards retains decks, search, editor and prerequisites. Stats/graphs and advanced FSRS controls remain accessible deeper in the relevant screens. One primary action per screen; progressive disclosure for advanced controls. During proofs/review, keep content central and controls reachable, with no surprise full solution. Provide readable equations (local overflow for oversized math), ≥44px tap targets, visible focus, adequate contrast, reduced motion and safe keyboard/inset behavior. Sync detail belongs in a compact status/control, not engineering jargon in the main flow.

**Effort:** high reasoning for sync/replay/security and plan contracts; medium for established UI patterns, docs and routine tests. Model choice is advisory, never a blocker or automatic paid upgrade.

## 3. Parallel lane protocol

**Start**
1. Do the §0 quick start. Inspect only files named in your slice plus what they call.
2. Reconcile your lane file with reality (merged PRs, CI, open PR for your lane). Adopt an interrupted lane branch instead of redoing it. Source and CI are the truth.
3. Pick exactly one slice of your lane's NEXT task. If it is blocked, write the exact blocker in your lane file and stop, or do the fallback slice your lane file names. Never relax a gate. The owner's current instruction overrides the queue.

**Stay in your lane (no overlap)**
4. Create a branch from fresh `main`: `git fetch origin && git switch -c lane-x/<task-id>-<slug> origin/main`.
5. Edit only files your lane owns in `lanes.json`. Shared append-only files (`plan.md`, `package.json`, `package-lock.json`, `build.js`, `docs/SETUP.md`, `src/app/util.js`, `.gitignore`) may get **additions** and edits to your own lines only: in `plan.md` only your lane's task rows and slice section; in `package.json` add your own `test:*` script and append it to the end of `"test"`; in `build.js` append your new file to `appFiles`; in `util.js` add new helpers, never change existing ones. Never edit `§0–§6` protocol text, other lanes' rows or status files.
6. Need a change in another lane's file? Do not make it. Add a line under "Requests from other lanes" in **your own** lane file stating the file, function and exact change wanted; the owner relays it, or that lane's next session reads all lane files and picks it up. Continue with work that doesn't depend on it.
7. Before every commit: `node test/lane_guard.js <X>` must print ok. It fails on files outside your lane, frozen files, unowned files and deletions/renames.
8. Backend: only lane A uses Supabase. Write a **new** migration file, never edit an applied one; apply it only after its PR is merged to `main`; record written vs applied vs verified separately in `docs/lanes/A.md`. Only Lemma (`yemqnhnztlbyxmjxidis`) may be changed.

**Non-destructive rules**
9. Never force-push, never rebase a pushed branch (update it with `git merge origin/main`), never push to `main` directly, never delete branches/PRs/files you did not create, never revert another lane's commits, never change another lane's tests to make yours pass. Do not clear dirty caches, outbox entries, receipts or review history. No anonymous-to-account merge on sign-in. No new npm dependency unless this plan pre-approves it or the owner does.
10. If `main` CI is red: the lane whose merge caused it (see the failing commit) fixes it first, in a PR; other lanes keep working on their branches but do not merge until `main` is green again. If you cannot tell whose it is, record it in your lane file and ask the owner.

**Verify, merge and hand off**
11. Checks: `npm ci`, `npm run test:syntax`, your slice's tests, `npm test`, `npm run build`, `npm run test:plan`. UI changes: look at your PR's `ci-screenshots` images against `main/` (§1 "CI screenshots") and state in the PR what changed; do not merge a UI PR whose screenshots you have not viewed. Write SUCCESS/FAILED/PENDING/NOT RUN exactly as observed; mock tests never prove live sync.
12. Commit message `type(task-id): summary`. Push the branch normally and open a PR titled `[lane X] TASK-ID Sn: summary`. Update your lane file (status, next action, PR link, evidence) **in the same PR**.
13. Merge yourself only when all hold: lane guard ok; the PR branch contains current `main` (`git fetch && git merge-base --is-ancestor origin/main HEAD`, otherwise merge `origin/main` in, push, and wait for CI again); PR CI is green; no unresolved conflicts. Squash-merge and delete your branch (§3 "GitHub commands"). If GitHub requires a review, leave it for the owner and say so.
14. Merge conflicts in shared files: keep **both** sides (your lines and theirs), never drop another lane's text; rerun tests. Conflicts in another lane's owned file mean you broke rule 5: undo your change to that file.
15. A task is DONE only when its gate passes; mark it DONE in its row and set your lane's next row to NEXT in the same PR. Add a §5 row if it is a milestone (keep both sides on conflict; integration sessions prune).
16. If push or merge fails, report the branch name and exact recovery steps; never claim completion that is not on `main`. End your reply with the §6 report.

**GitHub commands.** If `gh pr ...` fails (some agent environments block GitHub GraphQL), use the REST equivalents; a chatbot GitHub connector's create/merge-PR actions are also fine.
- Open PRs: `gh api "repos/Mymayankyadav/lemma/pulls?state=open" --jq '.[]|"\(.number) \(.head.ref) \(.title)"'`
- Create PR: `gh api repos/Mymayankyadav/lemma/pulls -f title="[lane X] ..." -f head=lane-x/... -f base=main -f body="..."`
- PR CI: `gh api repos/Mymayankyadav/lemma/commits/<head-sha>/check-runs --jq '.check_runs[]|"\(.name) \(.status) \(.conclusion)"'`
- Merge: `gh api -X PUT repos/Mymayankyadav/lemma/pulls/<n>/merge -f merge_method=squash`, then `gh api -X DELETE repos/Mymayankyadav/lemma/git/refs/heads/lane-x/...` (your own branch only).

**Stop and ask the owner (do not guess) when:** a decision here seems wrong or missing; the work needs a file your lane does not own and the request route is too slow to proceed; a test can only pass by deleting data or weakening an assertion; a migration or live Supabase change is needed and not described; `main` CI is red and it is unclear whose change caused it.

**Integration sessions** happen only when the owner asks (for example "re-plan lanes"), on a branch `integration/<date>-<slug>` merged by PR like any lane. They alone may edit `lanes.json`, protocol sections, §1, workflows other than `android.yml`, `AGENTS.md`, `README.md`, `PROMPT.md`, `test/plan_protocol.js` and `test/lane_guard.js` (`node test/lane_guard.js integration`). They assign "—" rows to lanes when dependencies are DONE and move file ownership when a lane's work finishes (e.g. `view_settings.js` to lane B after SYNC-04). Run them when no lane PR is open. Keep this plan under ~4,500 words; put reusable detail in existing docs.

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
| Conflict evidence, transactions and UI | [PR #6](https://github.com/Mymayankyadav/lemma/pull/6) and [PR #7](https://github.com/Mymayankyadav/lemma/pull/7) merged; [main regression 40441775123](https://github.com/Mymayankyadav/lemma/actions/runs/40441775123) SUCCESS; [Pages 40441762109](https://github.com/Mymayankyadav/lemma/actions/runs/40441762109) SUCCESS. Review replay and live activation remain gated. |

## 6. Five-line end-of-session report template

**Changed:** lane, task ID + slice, outcome, relevant files, PR and merge commit.
**Verified:** tested SHA, exact checks/run links and result.
**Still gated:** unfinished behavior, deployment/migration limits.
**Next:** your lane's next slice, function/path, acceptance check, and any requests made to other lanes.
**Handoff:** `docs/lanes/<X>.md` updated and merged to `main`, or exact branch/PR recovery steps.
