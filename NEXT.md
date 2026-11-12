# NEXT — ranked by the priority run (2026-11-06 evening: all remaining v6 work, rules v2.1). Take the top open item whose Needs are all done.

## N132 v7 UX audit r3: the rest of U0 (truth) (Owner task)

Owner task: "Ok continue working. Make significant progress"
Stage: Harden · Status: open · Needs: — · Assigned: owner-setup-v7ux
Done = every open U0 finding of the v7 UX audit r3 (`docs/v7/ux-audit-2026-11-12/02_WEB_PLAN.md` §2) is fixed with a regression test and ticked in `CHECKLIST.md`: V14 (dock symmetric, Capture stays), V15 (every Calendar Month heat step ≥ 4.5 : 1), V16 (almanac starts at the record and opens on today, one tab stop), V18 (names, not codes), V32 (a not-found page), V33 (no repeated example cards), V34 (time-zone name, subject rows, tutor tile, one duration format, editor helpers), V35 (cloze as a selection), V37 (triage buttons one size), V38 (date on one line; Review now when due), V39 (sign-in drawing behind the links), V40 ("Mark resolved"), V42 (out-of-month days dimmed; week titles on a phone), V43 (Data and account as grouped lists, deletion in a sheet); recorded in `docs/current/N132.md`.
Tests: `tests/unit/v7/n132-truth.test.ts`, `tests/e2e/v7-n132-truth.spec.ts`, existing suites unchanged.
Scope: `src/app/{App.tsx,AppShell.tsx,v7Kit.ts}`, `src/app/v7/{V7Shell.tsx,NotFoundV7.tsx,shell.css}`, `src/ui/v7/Chart.tsx`, `src/ui/math.css`, `src/lib/{codeNames.ts,format.ts}`, `src/features/calendar/v7/**`, `src/features/insights/v7/ProgressV7.tsx`, `src/features/checkpoint/v7/CheckpointV7.tsx`, `src/features/plan-proposal/v7/PlanProposalV7.tsx`, `src/features/project/v7/V7Path.tsx`, `src/features/proposals/v7/{InboxV7.tsx,inbox.css}`, `src/features/card/v7/CardV7.tsx`, `src/features/cards/v7/{editorModel.ts,CardEditorSheet.tsx,cards.css}`, `src/features/session/v7/SessionV7.tsx`, `src/features/review-run/v7/ReviewRoundV7.tsx` (swipes over selected text), `src/features/sign-in/v7/welcome.css`, `src/features/settings/v6/{Export.tsx,DeleteAccount.tsx}`, `src/features/settings/v7/**`, `src/data/demo/{math-prompts.ts,fixture.json}`, tests, `docs/v7/ux-audit-2026-11-12/CHECKLIST.md`, `docs/current/N132.md`.
Not: server changes (the account-delete function is unchanged), new dependencies, flag defaults, phases U1–U4, AN1–AN4 and G0–G2.

## N130 v7 UX audit r3: the tracking checklist, the first fixes and the Owner's decisions (Owner task)

Owner task: "Start working on it maybe create a branch and checklist to Collaborate and track completed task." … "I approve each of them."
Stage: Harden · Status: open · Needs: — · Assigned: owner-setup-v7ux
Done = the v7 UX audit and plan r3 (12 Nov 2026, on `d741617`) is in `docs/v7/ux-audit-2026-11-12/` with `CHECKLIST.md` tracking every finding, phase item, Owner decision (E1–E23) and device check; the first slice that needs no Owner decision is fixed, each with a regression test: U0 V02 (Today strip hours placed by value), V03 (one practice count for Today and Close the day; one review estimate for Today and Review), V17 (Reject left, Approve right), V24 (no two Quick focus options called "Open"); G2 P4 (LT4, LT5, LT6) and P5 (LT1, LT2, LT10); and the Owner's decisions of 12 Nov 2026 are recorded and built where they unblock work, each with a test: E20 (LT3 Day closed stays until Done or 5 s), E18 (P1 Night illustration objects lighter than the disc), E6 (48 px touch in the app), E8 (phones held in portrait in the app), E14 (AW2 backup through the share sheet), E15 (AW3 About this app with the version and release links), E16 (AW4 undeliverable reminder kinds listed without switches); recorded in `docs/current/N130.md`.
Tests: `tests/unit/v7/n130-truth.test.ts`, `tests/unit/v7/n130-lottie.test.tsx`, `tests/unit/v7/n130-decisions.test.tsx`, `tests/e2e/v7-n130-truth.spec.ts`, `tests/e2e/v7-n130-decisions.spec.ts`, the Java unit tests `OrientationPolicyTest` and `ExportsTest`, existing suites unchanged.
Scope: `docs/v7/ux-audit-2026-11-12/**`, `src/features/home/v7/**`, `src/features/ritual/v7/{CloseDayV7.tsx,close.css}`, `src/features/practice/progress.ts`, `src/features/plan-proposal/v7/PlanProposalV7.tsx`, `src/features/project/v7/learning.css`, `src/features/settings/v6/Export.tsx`, `src/features/settings/v7/{SettingsV7.tsx,SettingsLists.tsx,PhoneSettings.tsx,reminderKinds.ts,settings.css}`, `src/platform/{native.ts,bridge.ts,device.ts,files.ts,reminders.ts}`, `src/main.tsx`, `src/ui/v7/{LottieMoment.tsx,Illustration.tsx,illustration.css,lottie.ts,lottie/**,components.css}`, `scripts/lottie/build.mjs`, `android/app/src/main/java/**/{MainActivity,LemmaNativePlugin,OrientationPolicy,Exports}.java`, `android/app/src/test/**`, tests, `docs/current/N130.md`.
Not: decisions still open (E1–E3, E9–E12, E17, E19, E21–E23: P2's Round complete, P6, P7, LT7 and the rest of U2), E5's system text size before U2's large-text layouts hold, E15's daily update check, server changes, new dependencies, flag defaults.

## N129 A3 Lottie moments: Inbox zero, Round complete, Day closed (Owner task)

Owner task: "Ok then continue working next task" … "dotLottie anyway"
Stage: Build · Status: open · Needs: — · Assigned: owner-setup-assets
Done = the dotLottie web player added (Owner approved the dependency, D-A3) and loaded only on demand with its WebAssembly self-hosted; L-11 Inbox zero, L-10 Round complete and L-12 Day closed drawn in code as Lottie files (≤ 60 KB, one play ≤ 1.6 s, nothing overshoots), themed from the page's roles so Day, Night and the subject colour follow; each starts over its A2 still, which stays under reduced motion, offline or on any failure; Today never loads the player; recorded in `docs/current/N129.md`.
Tests: `tests/unit/v7/lottie.test.tsx`, `tests/e2e/v7-lottie.spec.ts`, `tests/unit/v7/illustrations.test.tsx`, existing suites unchanged.
Scope: `package.json`, `package-lock.json`, `scripts/lottie/**`, `src/ui/v7/{lottie.ts,lottiePlayer.ts,LottieMoment.tsx,lottie/**,Illustration.tsx,illustration.css}`, the three moments (`InboxV7.tsx`, `RoundCompleteV7.tsx`, `CloseDayV7.tsx` and their CSS), tests, `docs/current/N129.md`.
Not: the other A3 animations (L-04 focus orbit, L-07 stamps, L-08 copied, L-09 loader, L-13, L-16, L-20), Rive, server changes.

## N126 Stop the "could not open what was shared" toast on every return to the app (Owner task)

Owner task: "This annoying toast keep coming for no reason wherever I switch app to lemma. After this fix move on to next item in the plan."
Stage: Harden · Status: open · Needs: — · Assigned: owner-setup-fixes
Done = returning to the Android app with nothing shared shows no toast; the plugin's lists (shares, pending lock-screen actions, calendars, busy times) reach the web layer as arrays; recorded in `docs/current/N126.md`.
Tests: `android/app/src/test/.../PluginResultTest.java`, `tests/unit/android/platform.test.ts` (N126 cases), existing suites unchanged.
Scope: `android/app/src/main/java/**/LemmaNativePlugin.java`, `src/platform/**`, `src/features/settings/v7/PhoneSettings.tsx`, tests, `docs/current/N126.md`.
Not: anything else.

## N125 Fix the Owner's phone report of 12 Nov 2026 (Owner task, one PR)

Owner task: "1. l looks of centered. 2. Can't press any of the buttons. 3. No notifications in the android app. 3. The buttons looks congested 4. This awkward highlight bar appears in almost all charts and is disgusting. 5. Why everything is 0 mins. 6. Awkward placement of the buttons."
Stage: Harden · Status: open · Needs: — · Assigned: owner-setup-fixes
Done = every item in `docs/current/N125.md` fixed with a regression test: the header ℓ optically centred; the Android app's own native calls working (they all failed), so its buttons, permission prompt, timer notification and reminders work, and a first focus session asks for notifications; the Tutor actions laid out; no focus ring on tapped chart columns; axis labels not clipped; the time-block sheet footer on one row; one tick on a selected chip.
Tests: `tests/unit/android/bridge.test.ts`, `tests/unit/v7/n125-owner-report.test.tsx`, `tests/unit/v7/brand-mark.test.ts`, existing suites unchanged.
Scope: `src/platform/**`, `src/ui/v7/**`, `src/app/v7/**`, `src/features/settings/v7/**`, `src/features/calendar/block-sheet/BlockSheet.tsx`, tests, `docs/current/N125.md`.
Not: server changes, new dependencies, flag defaults.

## N128 Redraw the A2 illustrations cleaner and symmetric (Owner task)

Owner task: "The icons you showed are bad and too weird. Retry maybe something clean less weird" … "These seems alright go ahead. Little more symmetric."
Stage: Build · Status: open · Needs: — · Assigned: owner-setup-assets
Done = the eight A2 empty-state illustrations redrawn as one familiar object per state on a soft round backdrop, centred, with one line weight, one accent and the badges at the same corner; recorded in `docs/current/N128.md`.
Tests: `tests/unit/v7/illustrations.test.tsx`, existing suites unchanged.
Scope: `src/ui/v7/Illustration.tsx`, `src/ui/v7/illustration.css`, tests, `docs/current/N128.md`.
Not: where the illustrations appear (unchanged from N127), new dependencies.

## N127 A2 Empty-state illustrations (Owner task, one PR)

Owner task: "You draw them and go with A"
Stage: Build · Status: open · Needs: — · Assigned: owner-setup-assets
Done = the eight empty-state illustrations of A2 (IL-01 … IL-08) drawn in the Owner's chosen style (D6 = A · Notebook line art; D8: drawn by Claude), Day and Night from theme roles, wired into their empty states; recorded in `docs/current/N127.md`.
Tests: `tests/unit/v7/illustrations.test.tsx`, existing suites unchanged.
Scope: `src/ui/v7/Illustration.tsx`, `src/ui/v7/illustration.css`, `src/ui/v7/EmptyMoment.tsx` and its CSS, the eight empty states (Paths, Calendar Day, Review, Inbox, Cards, Atlas, Progress, Tasks), tests, `docs/current/N127.md`.
Not: the icon-set redraw (the app keeps lucide plus the drawn marks), Lottie or Rive (A3), new dependencies.

## N124 A1 Motion v1 (Owner task, one PR)

Owner task: "Yes start A1"
Stage: Build · Status: open · Needs: — · Assigned: owner-setup-motion
Done = phase A1 of the release and assets plan (`03_LATER_ASSETS_SPEC.md` §A1, recorded in `docs/current/N124.md`): the motion tokens; the Settings › Reduce effects switch working everywhere (it now stops all movement, blur and glow, applies before first paint and follows the account); sheets rising on the sheet spring; list inserts (Tasks, Calendar Day blocks) rising in with a 30 ms stagger; a task's tick drawing when completed; the review answer rising in on reveal; a lifted calendar block growing; emblems drawing on the compass curve. Every animation runs only when motion is allowed and Reduce effects is off, and the settled layout is identical either way.
Tests: `tests/unit/v7/motion-v1.test.tsx`, `tests/e2e/v7-motion.spec.ts`, existing suites unchanged.
Scope: `src/ui/v7/**`, the v7 screens that use the new marks (Tasks, Calendar Day, Settings, Focus, Close the day, Atlas, Toast), `src/main.tsx`, `src/app/v7/V7Shell.tsx`, tests, `docs/current/N124.md`.
Not: new dependencies, Lottie or Rive (A3), illustrations (A2), flag defaults, server changes.
## N123 Lemma for Android: the Capacitor app (Owner task, one PR)

Owner task: "Start working on Android app complete the taskd"
Stage: Build · Status: open · Needs: — · Assigned: owner-setup-android
Owner decisions (12 Nov 2026, on `05_ANDROID_APP_PLAN.md` from the release and assets plan): D10 yes (Capacitor replaces the TWA, same package); D11 Capacitor core and official plugins only (no Firebase, ML Kit or Glance); D12 no server changes and no Firebase service account; D13 Study mode and device calendar built, opt-in, off by default; no Play Console: a signed APK on GitHub Releases, as in the Carrel app; one Owner `rules:` PR with the Android CI job.
Done = phases N0–N7 of `docs/android/PLAN.md` within those decisions, as recorded phase by phase in `docs/current/N123.md` (each part built, deferred by a decision, or waiting for the Owner's device checks); the app builds in CI (lint, Java unit tests, debug APK, release AAB).
Tests: `tests/unit/android/platform.test.ts`, `tests/unit/android/android-shell.test.ts` (replaces the TWA shell test with the same invariants on the Capacitor shell), the Java unit tests in `android/app/src/test/`, existing suites unchanged.
Scope: `android/**`, `src/platform/**`, small hooks in existing screens (Capture, New path, Focus, Calendar suggestions, Settings, Round complete, haptics, sign-in), `capacitor.config.json`, `vite.config.ts` android mode, `scripts/android-*.mjs`, `.github/workflows/android.yml`, docs, `public/privacy.html`.
Not: `supabase/**` (no migration, no FCM transport, no widget RPC); new web-push behaviour; WorkManager, in-app updates or review (dependencies not approved); flag defaults. Deferred by the Owner (12 Nov 2026): server-sent phone notifications (FCM), home-screen widgets (Glance), document scanner (ML Kit).

## N122 Lemma v7 Constellation (Owner task, one PR)

Owner task: "Implement this plan on lemma repo. It will pushed as just one pr under owner setup. Some parts are tricky and some parts are just basic labour. So what we do for each part we decide the model and effort level and once the part is complete you put in chat the model name and effort level."
Stage: Build · Status: open · Needs: — · Assigned: owner-setup-v7
Done = the complete Owner-approved v7 plan in `docs/v7/PLAN.md`, including every New feature, the gates and exceptions in `docs/v7/IMPLEMENTATION.md`, full validation, and Owner visual and device approval before activation.
Tests: existing suites and v7 journeys, design and performance checks as specified in the plan, without deleted, skipped or weakened tests.
Scope: One Owner-merged `rules:` PR for v7 frontend, tests, narrowly necessary CI and review configuration, and documentation.
Not: backend, migrations, MCP, new dependencies, or deletion of v6 code and styles.

Order used (priority run 2026-11-06 18:30 IST, all remaining v6 work): open PR work; blockers that unlock the most items (registries N36, versions N38, typed settings N39, capability registry N40); new record migrations and their app modules in parallel (D8); study command changes in sequence; V6-05 planner and rituals; V6-06 remaining learning screens; V6-07 MCP chain; Harden per area after its features (Owner: build fast, review in Harden); V6-08 acceptance; turning v6 on last. Earlier (12:30 IST): work already in a PR, then the v6 first study slice end to end (N20), then blockers that unlock the most items (task command layer N22, task adapters N23/N24), then independent lanes from V6-05 (tasks, Calendar) and V6-06 (learning screens), then MCP and live parity. Earlier order: the v6 first study slice (`docs/v6/`: Today → Focus → saved time → Calendar and Progress), split into lanes that can run at the same time, then notifications. Done and removed: N2–N5, N7–N10, N6.1, N6.2, N11.1–N11.3, N13, N14.1–N14.3, N16–N18, N20–N35 except N32.2.2, N21, N110–N117 (#818, #820, #821, #823, #840, #822, #850, #851, #872, #860, #882, #853, #887, #881, #888, #893, #903, #897, #905, #909, #910, #1309). An id in a Needs line that is no longer in this file is done.
No item may list a protected path (`ci/protected.json`) in Scope. Files under `docs/v6/` are behaviour references cited by items, not instructions. v6 UI work stays behind the `v6Shell` flag: with the flag off, existing screens, tests and visual rules stay exactly as they are.

Parallel lanes (v2.0). Every v6 screen and both study adapters meet at one typed contract that already exists on main: `src/data/study/contract.ts` (`StudyApi`, records shaped like the N10 tables) and `getStudyApi()` in `src/data/study/index.ts`, which returns an empty placeholder until N14.2 (demo) and N16 (live) replace `src/data/study/demo.ts` and `src/data/study/live.ts`. Screens therefore never wait for adapters: they read and write only through `getStudyApi()`, and their unit tests use `setStudyApiForTests(fake)`. Each item owns its own files, so parallel PRs do not touch the same code. Change the contract only additively. End-to-end wiring of the whole slice is N20.

Task lanes (priority run 2026-11-06). Tasks follow the same pattern with their own folder, so they never touch the study files N20 edits: the contract `src/data/tasks/contract.ts` (`TaskApi`, `TaskRecord` shaped like `public.tasks` from N21) and `getTaskApi()` / `setTaskApiForTests()` in `src/data/tasks/index.ts` are on main; `src/data/tasks/demo.ts` and `src/data/tasks/live.ts` are placeholders that read nothing and refuse writes until N23 and N24 replace them. The server command for tasks is Owner decision D7 (`docs/v6/README.md`).

v6 screen lanes (N28–N33). Each screen item owns only its own feature folder: it adds `src/features/<screen>/v6/**` and, in that screen's existing `Page.tsx`, one branch `if (isFlagOn('v6Shell')) return <…V6/>` (or the equivalent for a page that already branches). It reads through the existing hooks in `src/data/**` unchanged (no new queries, no `src/data/**` edits); a field the hooks do not provide is shown as unavailable, never invented. It distinguishes loading, empty, filtered-empty and failed states, keeps 44-pixel targets, uses the N19 tokens under `[data-v6]`, and leaves the flag-off page, its tests and its visual rules exactly as they are. Exact-pixel polish and device audits are the Harden stage, not these items.

Remaining v6 lanes (priority run 2026-11-06 evening, Owner decision D8 in `docs/v6/README.md`). **Resource migration items** ("migration" below) follow D8(b): one additive migration, `public.<resource>_command(p)`, rows in `lemma_undo_tables` and `lemma_command_resources`, and a PGlite test in `tests/mcp/sql/<resource>.mjs` covering create/update/delete or the named lifecycle, `operationId` retry, changed-payload conflict, stale `expectedVersion`, a second owner rejected, undo through `undo_action`, and `mcp_command` as service_role writing as `p_user`; they deploy on merge and need a review. **App module items** ("module") follow D8(c): `src/data/<resource>/` with a typed contract shaped like the migration item's fields (camelCase, dates `YYYY-MM-DD`, instants ISO, durations in minutes), a demo adapter with a small fixture and reload persistence under its own key, a live adapter over `rpc('<resource>_command', envelope)` with bounded owner reads, `get…Api()` / `set…ApiForTests()`, and unit tests in `tests/unit/<resource>/**`; they never wait for the migration. **Screen items** follow the v6 screen-lane rules above, may also read the new modules through their `get…Api()`, and test with the `set…ApiForTests` fakes. Every new table or column is added to the capability registry (N40) in the same PR that creates it.


Mockup port lane (Owner, 2026-11-08, #1303). The v6 app must look like the mockup captures in `docs/v6/screens/`. **Copy, don't redesign**: `docs/v6/prototype/source/MAP.md` names, for each screen, the mockup module that holds its exact markup and class strings and the repo folder to port it into; the CSS is `docs/v6/prototype/source/mockup-overrides.css`. Keep the repo's hooks, commands and behaviour, and wire mockup values to them; a value the hooks lack shows as unavailable. Everything stays behind `v6Shell`, and flag-off screens are unchanged. Every port PR refreshes its screen's Day and Night PNGs in `docs/v6/release-captures/` (capture command in MAP.md, or from CI), which requires an independent review: the reviewer compares each PNG with the same-named mockup and requests changes for any visible difference in layout, components, colour or type (demo data may differ). N110–N117 are merged (#1309, one PR at the Owner's direction); N118 audits them against the mockup and is now the only item left in this lane.

## N121 Fix the 9 Nov 2026 v6 UI audit in one PR (Owner task)
Owner task: "We will address the audit report by first making a plan then executing this plan and uploading just one pr with all the redressals."
Stage: Harden · Status: open · Needs: — · Assigned: owner-setup-n121
Done = every finding in `docs/v6/ui-audit-2026-11-09/AUDIT.md` (top 15, X1–X15, the Calendar deep dive, every per-screen item, other widths, F1–F14) is fixed as planned in `docs/v6/ui-audit-2026-11-09/PLAN.md`, or waived with a reason in `docs/current/N121.md`; every Blocker and Major has a regression test that fails on `f46de0a`; the release captures are refreshed.
Tests: `tests/e2e/v6-n121-audit.spec.ts` (new), the unit tests in PLAN.md §3.2, the deliberately updated tests in PLAN.md §3.3, and `tests/e2e/v6-release-audit.spec.ts` passing unchanged.
Scope: v6 screens and shell under src/**, tests, docs/v6/release-captures/**, docs/v6/ui-audit-2026-11-09/**, docs/current/N121.md.
Not: database or Edge Function changes (supabase/**); flag defaults (src/flags.ts); flag-off screens; docs/v6/screens/**; new dependencies.

## N120 Fix the v6 fidelity bugs from the N118 audit (Owner task, one PR)
Owner task: "Fix the bugs"
Stage: Harden · Status: open · Needs: — · Assigned: chat-528461#r7kq
Done = #1330 (Progress subtitle in the header), #1331 (Calendar dates without the year), #1332 (time-first Calendar cards for logged and due items), #1333 (flat Concept map list), #1334 (Concept map segment fill and position), #1335 (Settings row height), #1336 (Inbox Edit outlined) and #1337 (Focus notices caption hidden) are fixed, each with a regression test, and the release captures are refreshed.
Tests: `tests/e2e/v6-g7-fixes.spec.ts` (one check per issue), `tests/unit/atlas-v6/list.test.tsx`, `tests/unit/progress-v6/page.test.tsx`.
Scope: v6 screens and shell under src/**, tests, docs/v6/release-captures/**, docs/current/N120.md (RELEASE.md stays with N118).
Not: turning v6 on (N102); flag-off screens; database changes.

## N119 Fix the v6 release bugs (Owner task, one PR)
Stage: Harden · Status: open · Needs: — · Assigned: chat-528461#r7kq
Done = #1299 (undo the last answer in the durable v6 review run), #1300 (Kit at 320px), #1302 (Atlas header) and the N118 design differences #1312–#1326 are fixed, each with a regression test, and the release captures are refreshed.
Tests: `tests/e2e/v6-g7-fixes.spec.ts`, `tests/mcp/sql/review_runs_undo_last.mjs`, `tests/e2e/v6-release-audit.spec.ts` (no known-defect exemptions left), the unit tests listed in `docs/current/N119.md`.
Scope: v6 screens and shell under src/**, one additive migration under supabase/migrations/, tests, docs/v6/release-captures/**, docs/current/N119.md.
Not: turning v6 on (N102); flag-off screens.



(Next priority run: after the Owner's device checks and N102, or when a lane runs dry. Excluded from v6 on purpose: real third-party calendar connections and native surfaces (previews stay labelled per contract §5), recurring blocks. Next free ID: N119.)
