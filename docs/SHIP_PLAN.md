# Ship-today plan — 28 October 2026

Owner instruction (28 Oct, 14:47 IST): ship **everything** today using parallel agents. **Update 14:56 IST: the web app is the priority; Android is paused** (no lane C work, no phone session, no APK in this release). This file is the execution detail for that push. `plan.md` §2 remains the authoritative task state; this file adds lanes D/E/F, interfaces between them, and the ship cut. Integration-owned.

## Ship cut and rules

- **Ship = tag `v1.0.0` on a fully green `main`** (regression, local Supabase, Pages, plus F's live-site smoke on the deployed URL). The Android workflow keeps running only as the lane-ownership check. Lane F prepares and makes the cut.
- **Times (IST / UTC):** 21:00 / 15:30 feature freeze (only fixes and gate evidence merge after this) · 22:00 / 16:30 ship cut.
- **Web P0 (before any feature work merges into a broken site):** (1) lane F's live smoke proves the deployed Pages app loads, signs-in screen renders, cards/review work and shows no console errors; (2) lane A deploys the 3 merged KNOWLEDGE-01 migrations to production (SHIP-A2) — until then the knowledge actions in Settings call functions that do not exist in production.
- **No gate is relaxed for the deadline.** A feature whose gate has not passed at the cut ships hidden (`StudyView.ready === false`, handoff entry points absent), with the work continuing as `v1.0.x`. That is the expected fallback, not a failure.
- **Hidden-until-ready:** Study tab and handoff controls appear only when the owning lane sets its `ready` flag in a PR that also carries the gate evidence.
- **Six lanes, one agent each.** Small PRs (≤ ~300 changed lines where possible). Before merging, merge current `main` into your branch and wait for green CI (§3 rule 13 of the plan); with six lanes, expect to do this more than once.
- **Red `main`:** the lane whose merge broke it fixes it first, within 20 minutes; nobody else merges except that fix. Lane F watches `main` CI and records the culprit in `docs/lanes/F.md`.

## Lanes

| Lane | Branch | Task | First slice (start now) |
| --- | --- | --- | --- |
| A sync/backend | `lane-a/` | KNOWLEDGE-01 finish + backend operator | Finish PR #80 (K2i), then SHIP-A1, SHIP-A2 below |
| B UI | `lane-b/` | UI-02 ship UI | SHIP-B1 Study tab wiring (hidden), then knowledge citation display |
| C Android | `lane-c/` | ANDROID-02 — **paused** | No agent needed today |
| D study plan | `lane-d/` | PLAN-01 | P1 append-only learning events + plan client module |
| E tutor handoff | `lane-e/` | TUTOR-01 | T1 handoff packet v1: export, validate, import (pure module + tests) |
| F release | `lane-f/` | RELEASE-01 | R0 live-site smoke workflow, then R1 service-worker offline/update test; main CI watch |

New-lane files (see `lanes.json`): D `src/app/study_plan.js`, `src/app/view_study.js`, `src/styles/study.css`, `test/study_*.js`, `test/stack_study_*.js`, `supabase/migrations/<ts>_plan01_<slug>.sql`; E `src/app/tutor_handoff.js`, `src/styles/handoff.css`, `docs/TUTOR_HANDOFF.md`, `test/tutor_*.js`, `test/stack_tutor_*.js`, `supabase/migrations/<ts>_tutor01_<slug>.sql`; F `src/service-worker.js`, `docs/RELEASE.md`, `test/release_*.js`, `.github/workflows/release.yml`.

**Wiring already in place:** `build.js` includes `study_plan.js`, `tutor_handoff.js`, `view_study.js` (in that order, before `main.js`) as soon as the file exists, and appends every `src/styles/*.css` after `app.css`. `npm test` runs every `test/study_*`, `test/tutor_*`, `test/release_*` file (`test/run_prefix.js`). The local Supabase workflow runs every `test/stack_*.js` after the existing gates. Android CI routes any `lane-<x>/` branch to its lane guard. None of these require editing shared scripts.

## Interfaces (fixed now so D, E and B work in parallel)

All three modules are top-level `const` objects inside the single app bundle. Others reference them with `typeof X !== 'undefined' && X.ready` so a missing module is harmless.

**`StudyPlan` (lane D, `study_plan.js`)** — the only code that reads/writes plans, checkpoints, sessions and learning events. Uses `LemmaAccount.client`, `LemmaAccount.user`, `LemmaAccount.onIdentityChange` and `LemmaCloud.accountToken(client, userId)` exactly as `cloud_bridge.js` does; never creates another Supabase client; re-checks the user after every await.
- `ready` (boolean) — true only after PLAN-01 gate evidence merges.
- `async activeContext()` → `null` or `{ planId, planRevision, contextId, contextRevision, checkpoint: { id, title, objective, status, prerequisiteIds }, sessionId, lastAttempt, hintLevel, sourceRefs }` from the **approved** plan.
- `async recordEvent({ planId, checkpointId, expectedPlanRevision, type, payload, eventId, source })` — `type` is a `learning_events.event_type`; `eventId` is a client UUID and makes retries idempotent; stale `expectedPlanRevision` rejects with `stale_plan_revision`.
- `async proposeAmendment({ planId, expectedRevision, snapshot, changeSummary, source })` → unapproved draft id. Approval is a student action in the Study screen only.

**`StudyView` (lane D, `view_study.js`)** — `{ ready, render(params) }`, same shape as other views. `#study` route.

**`TutorHandoff` (lane E, `tutor_handoff.js`)**
- `ready` (boolean).
- `exportPacket(ctx)` → `{ markdown, json }`, packet `lemma.tutor_handoff.v1` following "Cross-model handoff context packet" in `docs/STUDY_PLANNING_PROTOCOL.md`; bounded size (≤ 32 KB Markdown) and cited excerpts only, never the whole knowledge collection.
- `parseReply(text)` → `{ ok, events[], cardProposals[], amendmentProposal|null, errors[] }`; validates schema version, IDs, expected plan revision; never trusts unknown fields.
- `open({ planId, checkpointId })` — opens the handoff sheet (copy packet for Claude/ChatGPT; paste the tutor's reply; student approves each proposal). Persists accepted attempts/hints via `StudyPlan.recordEvent`, amendments via `StudyPlan.proposeAmendment`, cards via the existing editor (`App.newCard`), never auto-approving.

Until D merges `StudyPlan`, E tests against a mock that implements exactly this contract. A contract change is made by D in `docs/STUDY_PLANNING_PROTOCOL.md`, announced as a request addressed to E in D's own lane file.

## Cross-lane requests opened by this integration

| ID | Target | Request | Acceptance | State |
| --- | --- | --- | --- | --- |
| SHIP-A1 | A | `test/sync_security_parity.js`: keep the first 12 migrations exact; allow further migrations only if named `*_plan01_*` or `*_tutor01_*` | Parity passes with a D/E migration added in a local test; any other unexpected migration still fails | OPEN |
| SHIP-A2 | A | Production deploy of the 3 merged KNOWLEDGE-01 migrations, then each merged `plan01`/`tutor01` migration, in timestamp order, under the plan's backend production rule (preflight, recovery note, record written/merged/applied/verified in A.md). A is the only lane that touches production. | `list_migrations` on Lemma matches `supabase/migrations`; security advisors clean | OPEN |
| SHIP-B1 | B | `main.js`: add `study: StudyView` to `VIEWS` and a **Study** nav item with visible label, both only when `typeof StudyView !== 'undefined' && StudyView.ready`; Today's primary action becomes "Continue study" when `StudyPlan.activeContext()` returns a checkpoint, else due reviews | e2e green with and without the module; screenshots | OPEN |
| SHIP-B2 | B | Review `ci-screenshots/pr-<n>/` of D and E PRs on request; file style fixes as requests to D/E (they own their CSS) | — | OPEN |
| SHIP-C1 | C | (Cancelled 14:56 IST — Android paused.) | — | CANCELLED |
| SHIP-F0 | F | `.github/workflows/release.yml`: after every successful "Deploy Lemma web" run on `main` (and on demand), Playwright opens `https://mymayankyadav.github.io/lemma/` from the GitHub runner, checks it loads with no console errors or failed same-origin requests, Today/Cards/Review/Settings render, a card can be created, reviewed and survives reload (local workspace, never signed in), and uploads screenshots. Agents cannot reach Pages from their sandboxes; this is the web health signal. | Green run against the current Pages deploy; a deliberately broken URL fails | OPEN, P0 |
| SHIP-F1 | F | Ship cut at 22:00 IST: confirm `main` workflows and the latest live smoke are green, write release notes (what shipped, what is hidden, Android paused), tag `v1.0.0` | Tag on a green commit; live smoke green on that deploy | OPEN |

## Gates (unchanged from plan.md §2, restated for D/E/F)

- **PLAN-01 (D):** on the local stack with test identities — 12-checkpoint plan approved; two checkpoints demonstrated; mid-proof resume after reload; accepted prerequisite amendment showing a diff; stale revision rejected; failed/retried writes never duplicate evidence. Learning events are append-only for clients.
- **TUTOR-01 (E):** Claude→ChatGPT→Claude resumes the exact unfinished proof and hint level (owner performs the real-tutor round trip in ≈10 min once ready; automated tests use canned replies); stale writes fail; approved cards keep provenance and use existing FSRS; works with no AI API.
- **RELEASE-01 (F):** backup/restore round trip of cards, schedules, reviews (and contexts/plans/events once D lands) with no lost or duplicated events; PWA offline/update test with the service worker enabled; live web smoke at the cut. Android smoke is deferred with ANDROID-02. Account erasure (A backend + B UI) is the one RELEASE item expected to miss today; it ships as `v1.0.x` and is listed in the release notes.

Engineering agents never approve a study plan, amendment, card or notification opt-in on the student's behalf in production; gate demonstrations use local-stack test identities.

## SHIP-A2 exact-version deployment operator — integration claim

- **Claim:** `chat-20261028-a-ship-a2-deploy-operator`, heartbeat `2026-10-28T09:52:18.826Z`. This is a narrow integration-authorized workflow/ownership change; Lane A remains the only production operator. No other active integration PR on claim. The target is **only** Lemma `yemqnhnztlbyxmjxidis`; never Carrel.
- **Planned files:** `.github/workflows/deploy-knowledge.yml` and `lanes.json` (integration-owned), `docs/SHIP_PLAN.md` and the Lane A handoff. No application or production database write as part of this PR. Workflow must pin a clean main SHA, verify green gates and exact remote/local migration versions, default to read-only preflight and allow version-preserving `supabase db push` only on an explicit apply run using GitHub Actions secrets (never chat credentials).
- **Preflight:** live Supabase `list_migrations` shows exactly nine original migrations, three merged knowledge migrations still pending. MCP `apply_migration` is unsafe for existing source versions because it generates a different timestamp. CLI `db push` retains the committed version numbers.
- **Verification:** integration lane guard, plan/syntax checks, workflow validation, PR CI before merge. A separate authenticated workflow run is required for production verification; absence of GitHub secrets is a blocker, not permission for manual history edits.
