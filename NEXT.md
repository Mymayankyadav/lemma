# NEXT — ranked by the priority run (2026-11-06 evening: all remaining v6 work, rules v2.1). Take the top open item whose Needs are all done.

## N154 v7 UX audit r3 · the Owner's remaining decisions; endings felt where they land; the haptic vocabulary; Lottie guard rails (Owner task)

Owner task: "Now you're the only agent working on the task so whatever is left you have to do it"
Stage: Harden · Status: open · Needs: — · Assigned: owner-setup-v7ux2
Done = the Owner's answers of 13 Nov 2026 are recorded in `docs/v7/ux-audit-2026-11-12/CHECKLIST.md`: E1, E2, E3, E9, E10, E11, E12, E17, E19, E21, E22 and E23 approved as recommended, and U3/U4 built from the boards behind flags that default off. And, each with a test:
- LT7 (E22): the Lottie player is skipped on Save-Data and 2G (the still shows), and is fetched in idle time when an ending is one step away (one Inbox card or one review card left; the Close the day page).
- LT8: `haptic('complete')` fires once, on the frame the ✓ or ∎ lands (66, 72, 80), or when the still shows in its place; an Inbox that was already empty is not felt.
- LT9: stars fade in from 70%; a badge draws its ring before its disc fills (from 70%); the endings land on the same frames.
- AW6 (E17): a soft tick on reveal, a click for Good, Hard or Easy, two ticks for Again, a click for a task tick, rise-pause-rise at a pomodoro's end, a tick at the sheet's dismiss threshold. Every call follows Lemma's Haptics switch: the Inbox read the wrong field, so the switch was ignored there.
- Recorded in `docs/current/N154.md`, with LT7, LT8, LT9 and AW6 ticked.
Tests: `tests/unit/v7/n154-feel.test.tsx`, `tests/unit/v7/n154-player.test.ts`, `tests/e2e/v7-n154-feel.spec.ts`, existing suites unchanged.
Scope: `src/ui/v7/{haptics.ts,useHapticsSetting.ts,lottie.ts,lottiePlayer.ts,LottieMoment.tsx,sheetDrag.ts}`, `scripts/lottie/build.mjs`, `src/ui/v7/lottie/*.json` (regenerated), `src/app/v7/V7Shell.tsx` (one hook), `src/features/{proposals,review-run,review-done,ritual,tasks,home,focus,settings,calendar}/v7/*` (the calls), tests, `docs/current/N154.md`, `docs/v7/ux-audit-2026-11-12/CHECKLIST.md`.
Not: the Progress table, new dependencies, server changes, the Android notification for a pomodoro's end (unchanged).

## N153 v7 UX audit r3 · V36 leftovers: the Inbox list's checkboxes and the card's review dots take a 44 px tap (Owner task)

Owner task: "Work on the v7 audit items the other agent is not doing"
Stage: Harden · Status: open · Needs: — · Assigned: owner-setup-v7ux2
Done = at 360 and 390 px, for every Inbox list checkbox and every tap target of the card's recall chart, the element at 21 px from the control's centre (up, down, left and right) is that control or its label, as follows.
- Inbox list: the row's leading space belongs to the checkbox's label (20 px box, 44 px label), so a tap up to 22 px left of the box ticks it. The row looks as before.
- Recall chart: reviews closer than a fingertip no longer have 44 px targets stacked over each other. The time axis is cut midway between reviews into side-by-side targets, each at least one touch target wide and tall (`--v7-touch`, 48 px in the app), that never overlap (`tapGroups`). A target holding several reviews names each of them in its label and lists them in the caption when tapped, and its dots are enlarged.
- Every review stays in the History list.
- Recorded in `docs/current/N153.md`, with a ticked V36 leftovers line in `docs/v7/ux-audit-2026-11-12/CHECKLIST.md`.
Tests: `tests/unit/v7/n153-hit-areas.test.tsx`, `tests/e2e/v7-n153-hit-areas.spec.ts`, existing suites unchanged.
Scope: `src/features/proposals/v7/inbox.css` (the list rows), `src/features/card/v7/{RecallChart.tsx,recallModel.ts}`, `src/features/cards/v7/cards.css` (the recall targets), tests, `docs/current/N153.md`, `docs/v7/ux-audit-2026-11-12/CHECKLIST.md` (one V36 line).
Not: the six controls of the other V36 line (almanac cells, "Adjust", "3 overdue · Triage", "14 due", narrow tabs, time-log days), `src/ui/v7/components.*`, server changes, new dependencies.

## N152 v7 UX audit r3 · V20 motion in use: drag a sheet to dismiss, a count that counts (Owner task)

Owner task: "Work on the v7 audit items the other agent is not doing"
Stage: Harden · Status: open · Needs: — · Assigned: owner-setup-v7ux2
Done = V20's three helpers in `src/ui/v7/motion.ts` are used or gone, as follows.
- `dismissSheet` decides a drag on a bottom sheet. Dragging the grabber or header down moves the sheet. Letting go past 30% of its height, or after a flick over 600 px/s, closes it through the dialog's cancel path (as Escape does); otherwise it settles back. Buttons, the body and centred dialogs (wide screens) do not drag. One delegated listener (`sheetDrag.ts`, installed in `src/main.tsx`) serves every v7 sheet without a change to the Sheet component.
- `interpolateNumber` drives `useAnimatedNumber`: the Review hub's "cards today" counts to its new value in 240 ms when the round changes. The first value after loading shows at once, and with reduced motion or Reduce effects the number jumps.
- `transitionPresets`, which nothing used, is deleted. The existing tests of the other two are unchanged.
- Recorded in `docs/current/N152.md`, with the V20 line of `docs/v7/ux-audit-2026-11-12/CHECKLIST.md` ticked.
Tests: `tests/unit/v7/n152-motion.test.tsx`, `tests/e2e/v7-n152-motion.spec.ts`, existing suites unchanged.
Scope: `src/ui/v7/{motion.ts,useAnimatedNumber.ts,sheetDrag.ts,sheet-drag.css}`, `src/main.tsx` (one install call), `src/features/review/v7/ReviewHubV7.tsx` (the count), tests, `docs/current/N152.md`, `docs/v7/ux-audit-2026-11-12/CHECKLIST.md` (the V20 line).
Not: `src/ui/v7/components.tsx` (owned by another item until its PRs merge), haptics, other numbers, server changes, new dependencies.
## N138 v7 UX audit r3: every control takes a 44 px tap (U2 · V36) (Owner task)

Owner task: "Ok continue working. Make significant progress"
Stage: Harden · Status: open · Needs: — · Assigned: owner-setup-v7ux
Done = at 360 and 390 px the six kinds of control the audit measured under 44 px (almanac cells, "Adjust", "1 overdue · Triage", "14 due" on path cards, the narrow hub tabs, the time-log days) and Agenda's "Add" take a tap 21 px from their centre in every direction (48 px in the app where the hit area follows the touch token), the almanac is one touch target that picks the day under the finger, and the time log names its week above a full-width day strip; ticked in `docs/v7/ux-audit-2026-11-12/CHECKLIST.md` and recorded in `docs/current/N138.md`.
Tests: `tests/unit/v7/n138-touch.test.ts`, `tests/e2e/v7-n138-touch.spec.ts`, existing suites unchanged.
Scope: `src/ui/v7/{Chart.tsx,chart.css,kit-system.css}`, `src/app/v7/shell.css`, `src/features/time-log/v7/{TimeLogV7.tsx,log.css,weekLabel.ts}`, `src/features/calendar/v7/calendar.css`, `src/features/projects/v7/paths.css`, tests, `docs/v7/ux-audit-2026-11-12/CHECKLIST.md`, `docs/current/N138.md`.
Not: Calendar Week's day headers and blocks at 360 px (a layout of their own, U1/U3), the Inbox list's checkboxes, the design lint's every-scene pass, new dependencies.

## N151 v7 UX audit r3 · AN3 offline made visible: "as of HH:MM" on Today and the Review hub (Owner task)

Owner task: "Work on the v7 audit items the other agent is not doing"
Stage: Harden · Status: open · Needs: — · Assigned: owner-setup-v7ux2
Done = when Today's or the Review hub's numbers come from the saved copy rather than the server, "as of HH:MM" (the learner's time zone) sits beside them, as follows.
- The saved copy means: the device is offline, a refresh is paused waiting for the network, or the latest refresh failed while the older numbers stay on screen. The chip shows the time of the oldest such number. With fresh numbers nothing is shown.
- Today shows the chip in its briefing. When its day cannot load, Today shows the last day it loaded in this tab, with the chip, instead of "Couldn't load Today". Back online it loads the day again.
- The Review hub shows the chip beside its count. A failed refresh keeps the hub's numbers and the forecast on screen, with the chip, instead of the load error.
- The header ℓ sync light is not part of this item.
- Recorded in `docs/current/N151.md`, with the AN3 line of `docs/v7/ux-audit-2026-11-12/CHECKLIST.md` split and its "as of" half ticked.
Tests: `tests/unit/v7/n151-as-of.test.tsx`, `tests/e2e/v7-n151-as-of.spec.ts`, existing suites unchanged.
Scope: `src/ui/v7/{savedCopy.ts,AsOf.tsx,Status.tsx}` (a `saved` meta chip), `src/features/home/v7/V7Today.tsx`, `src/features/review/v7/ReviewHubV7.tsx`, tests, `docs/current/N151.md`, `docs/v7/ux-audit-2026-11-12/CHECKLIST.md` (the AN3 offline line).
Not: the header ℓ sync light, wiring `src/lib/offline-cache.ts` (a snapshot kept across launches), other screens, server changes, new dependencies.

## N136 v7 UX audit r3: launch and back feel like Android (AN3 · AW7, AW8) (Owner task)

Owner task: "Ok continue working. Make significant progress"
Stage: Harden · Status: open · Needs: — · Assigned: owner-setup-v7ux
Done = in the app the splash lifts when the page has drawn (the 800 ms auto-hide stays the cap), the WebView's background is the Day/Night page colour from start and on a theme change, and on Today with nothing open Lemma releases the back gesture so Android plays its back-to-home preview (a sheet or any other screen takes it back; below Android 12 a native fallback still leaves the app running); ticked in `docs/v7/ux-audit-2026-11-12/CHECKLIST.md` and recorded in `docs/current/N136.md`.
Tests: `tests/unit/v7/n136-android-feel.test.ts`, `tests/e2e/v7-n136-back.spec.ts`, `android/app/src/test/java/io/github/mymayankyadav/lemma/BackPolicyTest.java`, existing suites unchanged.
Scope: `src/platform/start.ts`, `src/platform/links.ts`, `src/platform/splash.ts`, `android/app/src/main/java/io/github/mymayankyadav/lemma/MainActivity.java`, `android/app/src/main/java/io/github/mymayankyadav/lemma/BackPolicy.java`, tests, `docs/v7/ux-audit-2026-11-12/CHECKLIST.md`, `docs/current/N136.md`.
Not: haptics (AW6, decision E17), the "as of" offline chips, edge gesture margins, the back gesture's shrink animation for sheets, new dependencies.

## N150 Inbox: a key pressed just after the Inbox opens is not lost (bug #1375) (Owner task)

Owner task: "Work on the v7 audit items the other agent is not doing"
Stage: Harden · Status: open · Needs: — · Assigned: owner-setup-v7ux2
Done = bug #1375 fixed with a regression test, as follows.
- The Inbox's keys (A, R, arrows, E) are handled from the Inbox's first commit; one listener is attached synchronously in `useInboxKeys`.
- An E pressed while the stack is loading, or before the Inbox's code has loaded (kept by `inboxEarlyKeys.ts`, which the app's routes load from the start), opens the editor when the first card shows, within 5 s.
- A decision key is never replayed on a card the learner has not seen.
- `tests/e2e/v7-inbox.spec.ts` "keys alone … E opens the editor" holds under load. That test is unchanged.
- Recorded in `docs/current/N150.md`.
Tests: `tests/unit/v7/n150-inbox-keys.test.tsx`, `tests/e2e/v7-n150-inbox-keys.spec.ts`, existing suites unchanged.
Scope: `src/features/proposals/v7/{InboxV7.tsx (keyboard only),useInboxKeys.ts,inboxEarlyKeys.ts}`, `src/app/routes.tsx` (one side-effect import), tests, `docs/current/N150.md`.
Not: InboxV7's pointer handlers, other screens' keys, server changes, new dependencies.

## N134 v7 UX audit r3: large text holds (U2 · V11) (Owner task)

Owner task: "Ok continue working. Make significant progress"
Stage: Harden · Status: open · Needs: — · Assigned: owner-setup-v7ux
Done = at 360 px with the text at 130% and 200%, no dock name runs into another (the dock keeps only the selected name when they do not fit), the calendar's hours keep every digit, segmented controls never overlap (a menu for more than three options, two lines for up to three), Focus keeps every control on the screen, and stat tiles stay on the screen; 390 px at 100% looks as before; ticked in `docs/v7/ux-audit-2026-11-12/CHECKLIST.md` and recorded in `docs/current/N134.md`.
Tests: `tests/e2e/v7-n134-text-scale.spec.ts`, existing suites unchanged.
Scope: `src/app/v7/{V7Shell.tsx,shell.css}`, `src/ui/v7/{components.tsx,components.css}`, `src/features/calendar/v7/calendar.css`, `src/features/focus/v7/focus.css`, `src/features/{cards,insights,review}/v7/*.css`, tests, `docs/v7/ux-audit-2026-11-12/CHECKLIST.md`, `docs/current/N134.md`.
Not: the design lint's every-scene pass, V36, V21, AW1/E5 (system text size in the app), server changes, new dependencies.

## N135 v7 UX audit r3: three drawings redrawn (G2 · P2) (Owner task)

Owner task: "Ok continue working. Make significant progress"
Stage: Harden · Status: open · Needs: — · Assigned: owner-setup-v7ux
Done = the Cards "no match" drawing no longer reads "zoom out", Progress "no time yet" is an hourglass, and Day closed sits on the disc's centre with its animation moved to match (its last frame still equals the still), as drawn in the r3 proposals; ticked in `docs/v7/ux-audit-2026-11-12/CHECKLIST.md` and recorded in `docs/current/N135.md`.
Tests: `tests/unit/v7/n135-redraws.test.ts`, `tests/e2e/v7-n135-redraws.spec.ts`, existing suites unchanged.
Scope: `src/ui/v7/Illustration.tsx`, `scripts/lottie/build.mjs`, `src/ui/v7/lottie/day-closed.json`, tests, `docs/v7/ux-audit-2026-11-12/CHECKLIST.md`, `docs/current/N135.md`.
Not: Round complete's ∎ still (decision E19), P3's rules, new dependencies.

## N137 v7 UX plan r3 · G1 the asset pipeline: manifest and lint, Android colours from tokens, icon layers, emblem exporter (Owner task)

Owner task: "Your pr is done next work on things not picked by the other agenr"
Stage: Build · Status: open · Needs: — · Assigned: owner-setup-assets
Done = G1 of plan r3 (`docs/v7/ux-audit-2026-11-12/04_ASSETS_AND_MOTION_PLAN.md` §3) as far as no Owner decision gates it, each with a test, and ticked in `CHECKLIST.md`: `assets.manifest.json` lists every generated asset (source, generator, size, themes, byte budget, use) and `scripts/brand/asset-lint.mjs` checks it after every build (exists, budget, PNG size, committed outputs byte-equal to their generators, the mark's ℓ ≥ 7 : 1 and ∎ ≥ 3 : 1 on paper in Day and Night); Android `colors.xml` (Day, Night) generated from `design-tokens.json`; the adaptive icon split into a background layer (paper, grid, margin) and a foreground layer (ℓ, ∎) that compose to the same picture; the emblem exporter (SVG with the component's geometry, stroke order with lengths and draw-in timing, a browser PNG); recorded in `docs/current/N137.md`.
Tests: `tests/unit/v7/g1-pipeline.test.tsx`, existing suites unchanged.
Scope: `assets.manifest.json`, `scripts/brand/{asset-lint.mjs,android-colors.mjs,emblem-export.mjs,lemma-mark.mjs}`, `scripts/android-icons.mjs`, `package.json` (scripts only), `android/app/src/main/res/{values,values-night}/colors.xml`, `android/app/src/main/res/mipmap-*/ic_launcher_*`, `src/ui/v7/emblemExport.ts`, tests, `docs/v7/ux-audit-2026-11-12/CHECKLIST.md` (G1 lines), `docs/current/N137.md`.
Not: the ∎ in the themed icon (E23), the scene camera (after N133's install shots land), wiring the lint into CI (an Owner `rules:` PR), new dependencies, server changes.

## N133 v7 UX audit r3: the rest of AN1 and G0 (Owner task)

Owner task: "Ok continue working. Make significant progress"
Stage: Harden · Status: open · Needs: — · Assigned: owner-setup-v7ux
Done = the Android app's remaining AN1 items that need no Owner decision and the stale assets of G0 are fixed, each with a test, and ticked in `docs/v7/ux-audit-2026-11-12/CHECKLIST.md`: AW5 (the welcome sheet as three glyph rows, focus on its text, the notification line), AW9 (Study mode turns on when the learner comes back with access granted), AW13 (the drift question as a card on Focus with No and Yes, note it), G0 (pre-paint colours from the build's v7 flag; v7 install screenshots); recorded in `docs/current/N133.md`.
Tests: `tests/unit/v7/n133-app.test.tsx`, `tests/e2e/v7-n133-app.spec.ts`, existing suites unchanged.
Scope: `src/platform/{NativeWelcome.tsx,native-welcome.css,drift.ts,studyMode.ts,device.ts,start.ts}`, `src/features/focus/v7/{FocusV7.tsx,DriftCard.tsx,focus.css}`, `src/features/settings/v7/PhoneSettings.tsx`, `src/app/paper.ts`, `index.html`, `vite.config.ts`, `scripts/check-pwa.mjs`, `scripts/v7/install-shots.mjs`, `public/screenshots/**`, tests, `docs/v7/ux-audit-2026-11-12/CHECKLIST.md`, `docs/current/N133.md`.
Not: AW14 and P7 (decision E23), AW15 (a wording decision), AW17 (needs a device), a wide install screenshot (the PWA gate allows two), server changes, new dependencies.

## N132 v7 UX audit r3: the rest of U0 (truth) (Owner task)

Owner task: "Ok continue working. Make significant progress"
Stage: Harden · Status: open · Needs: — · Assigned: owner-setup-v7ux
Done = every open U0 finding of the v7 UX audit r3 (`docs/v7/ux-audit-2026-11-12/02_WEB_PLAN.md` §2) is fixed with a regression test and ticked in `CHECKLIST.md`: V14 (dock symmetric, Capture stays), V15 (every Calendar Month heat step ≥ 4.5 : 1), V16 (almanac starts at the record and opens on today, one tab stop), V18 (names, not codes), V32 (a not-found page), V33 (no repeated example cards), V34 (time-zone name, subject rows, tutor tile, one duration format, editor helpers), V35 (cloze as a selection), V37 (triage buttons one size), V38 (date on one line; Review now when due), V39 (sign-in drawing behind the links), V40 ("Mark resolved"), V42 (out-of-month days dimmed; week titles on a phone), V43 (Data and account as grouped lists, deletion in a sheet); recorded in `docs/current/N132.md`.
Tests: `tests/unit/v7/n132-truth.test.ts`, `tests/e2e/v7-n132-truth.spec.ts`, existing suites unchanged.
Scope: `src/app/{App.tsx,AppShell.tsx,v7Kit.ts}`, `src/app/v7/{V7Shell.tsx,NotFoundV7.tsx,shell.css}`, `src/ui/v7/Chart.tsx`, `src/ui/math.css`, `src/lib/{codeNames.ts,format.ts}`, `src/features/calendar/v7/**`, `src/features/insights/v7/ProgressV7.tsx`, `src/features/checkpoint/v7/CheckpointV7.tsx`, `src/features/plan-proposal/v7/PlanProposalV7.tsx`, `src/features/project/v7/V7Path.tsx`, `src/features/proposals/v7/{InboxV7.tsx,inbox.css}`, `src/features/card/v7/CardV7.tsx`, `src/features/cards/v7/{editorModel.ts,CardEditorSheet.tsx,cards.css}`, `src/features/session/v7/SessionV7.tsx`, `src/features/review-run/v7/ReviewRoundV7.tsx` (swipes over selected text), `src/features/sign-in/v7/welcome.css`, `src/features/settings/v6/{Export.tsx,DeleteAccount.tsx}`, `src/features/settings/v7/**`, `src/data/demo/{math-prompts.ts,fixture.json}`, tests, `docs/v7/ux-audit-2026-11-12/CHECKLIST.md`, `docs/current/N132.md`.
Not: server changes (the account-delete function is unchanged), new dependencies, flag defaults, phases U1–U4, AN1–AN4 and G0–G2.

## N131 The rest of the assets plan, as v7 UX plan r3 keeps it: coded moments, the focus orbit prototype, sounds, "Share the page" (Owner task)

Owner task: "Continue for the of work. Keep it one pr and don't merge. But complete all A tasks" … "there is new pr which will supersede the current plan. N130 make sure they aligned. Second the checkpoint path is still looking ugly revert to legacy."
Stage: Build · Status: open · Needs: N130 · Assigned: owner-setup-assets
Done = what the release-and-assets plan's A3–A5 still asks for after plan r3 (`docs/v7/ux-audit-2026-11-12/04_ASSETS_AND_MOTION_PLAN.md` §6–§8) is built in code: L-07 the approve/reject stamp for a button or key decision with its 4° settle; L-09 an emblem glyph drawing itself as the loader; L-16 a cross-fade between Day and Night; L-20 a still splash on the web; the focus orbit as an SVG prototype behind `focusOrbit` (off); optional sounds, off by default (pencil tick, page turn, low chime, each ≤ 200 ms, synthesised, no files); A5′ "Share the page" images for Day closed, the week page and a finished path, and the site's share preview; the Path map stays the list (the drawn map was reverted at the Owner's request); recorded in `docs/current/N131.md`.
Tests: `tests/unit/v7/a-assets.test.tsx`, `tests/e2e/v7-assets.spec.ts`, existing suites unchanged.
Scope: `src/features/proposals/v7/{InboxV7.tsx,inbox.css}`, `src/ui/v7/{Loader.tsx,components.css,motion.css,sounds.ts,shareImage.ts}`, `src/styles/appearance.ts`, `index.html`, `src/flags.ts` (`focusOrbit`), `src/features/focus/v7/**`, the loader's six screens, `src/features/{review-run,review-done,ritual,insights,project,settings}/v7/**` for sounds and sharing, `scripts/brand/og-image.mjs`, `public/og-image.png`, tests, `docs/current/N131.md`, the A5′ line of `docs/v7/ux-audit-2026-11-12/CHECKLIST.md`.
Not: what r3 drops or gates (achievement seals, store assets, L-08 beyond the existing toast, L-13 and the endings before E3, the Atlas sky and a drawn path map before U3's spine, the icon strokes before E21), G0's install screenshots and pre-paint colours (their own item), Rive, server changes, flag defaults.

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
