# Android: the app as built, and what comes next

**Revised 12 Nov 2026 (evening), on commit `1a67b04`.** The first version of this file was a design layer for an Android app that did not exist yet. Since then the Capacitor app was built (N123), with these Owner decisions: Capacitor and its official plugins only; no server changes; no Play Console (a signed APK on GitHub Releases); widgets, server-sent notifications and the document scanner deferred. This revision reviews what was built and re-plans inside those decisions.

**How this was reviewed.** I read the Android sources and the web platform layer, measured the generated icons, and rendered the Android-only parts of the web layer in a browser with a stand-in for the native bridge (`evidence/captures/android-app__*.png`). **I did not run the APK or a device.** Anything marked *verify* is a reasoned risk from the code, not an observation.

Boards: `visuals/14-android-as-built.jpg` (new), `visuals/10` and `11` (targets for the next passes), `visuals/09` (widgets, parked).

---

## 1. The rule: the web screens are the source of truth

The app is the React web app in a WebView. So:

| | Where it is defined | How it is judged |
|---|---|---|
| **Every screen** (Today, Review, Calendar, Paths, Inbox, Progress, Settings, every sheet) | The web app. There are no separate Android screen designs | The same web scene at 360–412 px wide. A difference between the phone and that scene is a bug in the wrapper |
| **Android-only interface inside the page** | Five places: the welcome sheet; "On this phone" in Settings › Reminders; "On this phone" in Settings › Planning; Speak in Capture; the drift prompt | Reviewed below |
| **System surfaces** (icon, splash, bars, back, notifications, timer, tiles, shortcuts, share) | `android/` | Reviewed below |

Three consequences:

1. **Every web finding is an Android finding.** The audit's open items (the Today strip's hours, disagreeing counts, the lopsided dock, Calendar Day's chrome, large-text collisions) are on the phone today.
2. **Fixes go into the web layer** and reach the phone with the next APK, since there is no over-the-air update.
3. **Design work for Android is small and specific:** the five places above and the system surfaces. Everything else is the web plan.

---

## 2. What is built, and how it reads

| Surface | Built (N123, N125) | Read |
|---|---|---|
| Icon | Adaptive icon from the Notebook mark, themed (monochrome) layer, legacy icons, ℓ status-bar icon, all from `scripts/android-icons.mjs` | **Good.** The old mark is gone (audit V12 resolved for the app). Details in AW14 |
| Splash | Android 12+ splash (back-ported): icon on the page colour, Day and Night from resources | Good base. Held for a fixed 800 ms (AW7) |
| Bars and insets | Edge to edge; bar icons follow the page's Day/Night | Right approach |
| Back | Closes the top sheet, then history, then Today, then leaves; predictive back enabled | Right order; no system preview on Today (AW8) |
| Sign-in | Supabase OAuth in a Custom Tab with an app callback | Works once the Owner adds the redirect address |
| Haptics | The kit's patterns play through the system engine | Engine is there; almost nothing calls it (AW6) |
| Notifications | Four channels: Focus timer (silent, ongoing), Focus alerts, Review, Study blocks; computed on the phone; Later, Snooze, Not today act without opening | **Well judged.** Wording is plain ("23 cards due · Your review is ready when you are") |
| Focus timer | System chronometer, Pause / Break / Finish, inline "Park a thought", exact alarms with a one-minute fallback, Live Update on Android 16, Quick Settings tile, restore after reboot; "Save 42 min" or "Rate and save" on finish | **The best part of the app.** Matches the plan and improves on it (the finish prompt is two clear actions, not five rating chips) |
| Shortcuts and tiles | Review, Quick focus, Capture, Inbox; "Resume *path*", "Review *n*"; Focus and Capture tiles | Good |
| Share and voice | Text and links open Capture; PDF, .tex, .md start a path; Speak in Capture | Good; opens the whole app (kept as a later refinement) |
| Study mode, calendar | Opt-in, device-local, in Settings › Planning | Good; enabling Study mode takes two trips (AW9) |
| Welcome | One sheet on first open | Needs finishing (AW5) |
| Offline | Refresh on start and resume; lock-screen actions queue | No visible "as of" yet |
| Large screens | The web's responsive layouts | Inherit the web's large-screen defects (AW11) |
| Updates | A new APK on GitHub Releases | The app cannot say that one exists (AW3) |
| Widgets, server push, scanner | Not built, by decision | Parked (§6) |

---

## 3. Findings on the Android app

### Major

**AW1 · Large system text is untested, and the web layer breaks at 130%** (audit V11). At 360 px with text at 130% the dock labels collide, calendar hours lose a digit and Focus's Drifted button leaves the screen. Whether this WebView enlarges text with the system font size must be checked on the phone (*verify*). If it does, those collisions are live for anyone with a larger font. If it does not, people who need larger text get none. Either way the fix is the same: make the layouts hold (web phase U2), then honour the system size on purpose.

**AW2 · "Download a backup" cannot work in the app** (confirmed in code; see it fail on a device). Export creates the file in the page and clicks a download link (`settings/v6/Export.tsx`, used by the v7 page). An Android WebView saves a download only through a download listener; Capacitor's bridge registers none and `android/` adds none. This matters twice: it is the only export, and the Delete account flow asks the learner to confirm they exported. *Fix:* in the app, hand the file to Android's share sheet or save it to Downloads through the existing plugin, then say where it went.

**AW3 · The app has no version and no way to learn about an update.** Without a store or an updater, a new APK on GitHub is invisible from inside the app, and every web fix waits for it. *Fix:* an "About this app" group in Settings › Data and account (in the app only): the version, "Check for updates" (opens the release page; optionally one quiet request a day to the public releases feed, Owner decision E15), and what changed in this version.

**AW4 · Reminder kinds this phone cannot deliver look like working switches.** In the app, Settings › Reminders still lists Checkpoint deadlines, Falling behind, Resuming a session, Tutor proposals, Weekly digest and others as ordinary switches. On the phone only *Cards due* and *study-block starts* produce a notification (no push service). The note under "On this phone" says tutor and digest messages stay in the Inbox, but the switches say otherwise. *Fix:* in the app, show the two kinds the phone delivers first, and group the rest under "In your Inbox on this phone" without a switch that implies delivery.

### Moderate

**AW5 · The welcome sheet is unfinished.** Its three points render as one run-on block (the list has no markers or spacing); the close button shows a focus ring because the sheet opens by itself; the title leaves "app" alone on a line; and it tells every new person to "sign in once more". *Fix:* three short rows with the tile, shortcut and share glyphs; "If you used Lemma before" as a secondary line; no ring on open; one line saying Lemma will ask about notifications after your first round, so the system prompt is not a surprise. (Asking at launch would break the plan's own rule; the current timing is right.)

**AW6 · Real haptics, nearly silent.** The patterns reach the system engine, but screens fire them only on Inbox decisions and calendar drags. Review grades, task completion (whose tick now draws), focus finish and the sheet threshold are defined in `haptics.ts` and never called. This is the cheapest improvement to how the app feels.

**AW7 · Launch.** The splash is held for a fixed 800 ms whether or not the page is ready (`launchShowDuration`). Only the splash plugin is given a colour, and only the Day paper. Capacitor colours the WebView only from a top-level `backgroundColor`, which `capacitor.config.json` does not set, so the WebView keeps its default background until the page paints: a light frame on a slow start at night (code confirmed; how visible it is needs a device). *Fix:* release the splash when the page reports its first paint (cap 800 ms); set the WebView's background from the Day/Night colour resource.

**AW8 · No back-to-home preview on Today** (confirmed in code). The App plugin's back callback stays enabled while a back listener exists, and the app never calls `toggleBackButtonHandler`, so Android cannot play its predictive "back to home" animation even though the manifest opts in. *Fix:* switch the handler off while Today is showing with no sheet open, on again otherwise.

**AW9 · Turning on Study mode takes two trips.** The switch shows a toast, opens system settings, and on return the learner must find the switch and tap it again. *Fix:* remember the intent; when access has been granted on return, turn it on and confirm with one line.

**AW10 · Rotation is allowed and the layouts are not ready for it** (audit V22). At 844 × 390 the review answer is cut after a line and Calendar shows no grid. Decide (E8): lock phones to portrait, or do the web work and add the desk clock.

**AW11 · Tablets and foldables inherit the web's large-screen defects** (audit V06, V23): the path's main action slides under the rail at 820 px, controls shrink to 42 px on touch screens, and an unfolded phone gets the phone layout.

**AW12 · Touch size.** The kit's 44 px rule is met; against Android's 48 dp guideline about half the controls are under.

**AW13 · The drift question is a 10-second toast.** After more than two minutes away, "Were you drifting?" appears as a toast with "Log drift" and disappears. It is easy to miss and has no "No". *Fix:* a quiet card at the top of Focus with **Yes, note it** and **No**, which stays until answered.

### Minor

| # | Finding |
|---|---|
| AW14 | Icon details. The adaptive foreground carries the whole page, so the grid cannot move against the background and the splash at night shows a paper disc on navy (*verify the look*). The themed layer is ℓ without the ∎. Legacy icons under 64 px use the simplified mark; they only appear on Android 7. Better: grid and margin rule in the background layer, ℓ and ∎ in the foreground and in the themed layer. |
| AW15 | Names. The channel is "Study blocks", the app says "time block" and "Calendar". Pick one word. |
| AW16 | The shortcut for Inbox uses the icon file named "approve". Check that it reads as an inbox at 48 dp. |
| AW17 | Sign-in failure. Until the redirect address is added sign-in fails; check that the screen says something useful when the Custom Tab returns without a session (*verify*). |

---

## 4. The plan, inside the Owner's decisions

No new dependency, no server change, no store. Phases are named **AN1–AN4**.

### AN1 · Make the built app right (size M)

| Item | Finding | Where |
|---|---|---|
| Export that works in the app | AW2 | Plugin method + `Export.tsx` branch; share sheet or Downloads (decision E14) |
| About this app: version, updates, what changed | AW3 | Settings › Data and account (decision E15) |
| Reminder kinds told truthfully | AW4 | `SettingsLists.tsx` (decision E16) |
| Welcome sheet finished | AW5 | `NativeWelcome.tsx` |
| Study mode in one trip | AW9 | `PhoneSettings.tsx` |
| Drift as a card | AW13 | Focus |
| Names and icon details | AW14–AW16 | `android-icons.mjs`, strings |

**Acceptance:** each on a device; a backup file opens from the Files app; the About group shows the version that Android's app info shows.

### AN2 · The web layer on a phone (size M)

This is web phases **U0** and **U2** (`02_WEB_PLAN.md`). It is no longer a gate before the Android work; the app is out, so it is the most urgent web work.

* Text at 100%, 130% and 200% at 360 px: dock (icons with one label), gutters that size from their text, rows that wrap (AW1).
* Honour the system font size on purpose, capped at 200% (decision E5).
* 48 px touch size in the app (AW12, decision E6).
* Landscape: per decision E8 (AW10).
* The open truth defects: Today's hours, the two counts, the dock slot, the almanac, button order.

### AN3 · Feel (size M)

| Item | Spec |
|---|---|
| **Haptic vocabulary** (AW6) | Reveal: one soft tick. Good or Easy: one click. Again: two light ticks. Task tick: one click as the tick finishes drawing. Round, day or path finished: one low thud. Drag steps: a tick per five minutes (exists). Inbox decision: a click (exists). Pomodoro end: rise, pause, rise (native alert). Off when the system's touch feedback or Lemma's Haptics switch is off |
| **Launch** (AW7) | Splash until first paint (cap 800 ms); themed WebView background; last known Today with an "as of" chip while the first request runs (the snapshot exists) |
| **Back** (AW8) | System preview at the root; sheets and detail pages shrink toward the edge when the gesture starts, if the plugin exposes its progress; otherwise keep the current order |
| **Offline, visible** | "as of 14:05" on Today and Review when values come from the phone; the header ℓ as the status light (steady, a ring while syncing, hollow when offline); queued lock-screen actions marked "syncing", as the timer already does |
| **Edges** | No Lemma gesture starts within 24 dp of a screen edge, so the Inbox swipe and calendar drags never fight the back gesture |

### AN4 · Large screens and postures (size M, after web U1)

As drawn on board 11: list beside detail from 600 dp, the review spread from 840 dp and in book posture, Focus as a clock in tabletop posture and on a stand, 48 px at every width, nothing interactive across a hinge. The width rules alone must be correct; posture is an enhancement where the WebView reports it.

### Notification wording (keep, with two edits)

| Channel | Now | Suggest |
|---|---|---|
| Focus timer | "Focus · until 15:50 · Pomodoro 2 of 4", Pause / Break / Finish | Keep |
| Focus alerts | "Planned focus time is up", "Break is over", "Take a 5-minute break, or keep going." | Keep |
| Review | "23 cards due" · "Your review is ready when you are." | Add the minutes: "23 cards due · about 9 min" |
| Study blocks | *block title* · "Starts 16:00 · 25 min" | Keep; rename the channel to match the app's word (AW15) |

---

## 5. Device checklist

I could not run the app. These are the checks that would confirm or dismiss the *verify* items, in order of value.

| # | Check | Confirms |
|---|---|---|
| 1 | Set the system font size to its largest; open Today, Calendar Day, Focus, Capture | AW1 |
| 2 | Settings › Data and account › Download a backup; look for the file (expected: nothing happens) | AW2 |
| 3 | Dark theme on; force-stop; open the app; watch for a light frame | AW7 |
| 4 | On Today, start the back gesture slowly (expected: no home preview) | AW8 |
| 5 | Rotate on Review and Calendar | AW10 |
| 6 | Long-press the icon; pull down Quick Settings; look at the themed icon on a dark wallpaper | AW14, AW16 |
| 7 | Sign in before and after adding the redirect address | AW17 |
| 8 | TalkBack: the timer notification, the tiles, Review | Not assessed anywhere yet |

---

## 6. Parked by the Owner (12 Nov 2026)

Not open work. Kept here so the design is ready if a decision changes.

| Parked | Design kept | What it would need |
|---|---|---|
| **Home-screen widgets** | Board 09: Paper and Sky looks, the week as a constellation, Next step, On my desk, five states | A widget library was not approved. For information only: the platform's own widget classes need no library, and a widget could show the last values the app computed, with "as of". That is a new decision, not a recommendation to proceed |
| **Server-sent notifications** (tutor, digest, deadlines, behind, resume) | The voice rules: a sentence, counts not content, a gentler second action | A push service and server changes |
| **Document scanner** | A filmstrip of pages with reorder and retake | A scanning library and a page-image pipeline |

---

## 7. Risks

| Risk | Mitigation |
|---|---|
| The *verify* items are wrong in either direction | The checklist in §5 takes under half an hour on one phone |
| Web fixes reach the phone slowly | AW3 makes updates discoverable; batch web fixes into each APK |
| Honouring text size exposes more layout faults | That is the purpose of AN2; cap at 200% |
| Haptics become noise | One pattern per meaning, eight meanings in all, both switches respected |

---

## r3 addendum (commit `d741617`)

* **All findings AW1–AW17 stand**, checked against the new code (§2 of `00_UPDATE_R3.md`).
* **N126** fixed a false “could not open what was shared” toast on every return to the app.
* **Icons on Android** (`06_ILLUSTRATION_ANIMATION_ICON_AUDIT.md`, IC4 and P7): the long-press menu mixes two icon styles; the dynamic “Resume *path*” uses the Atlas star and “Review *n*” repeats the static Review; both Quick Settings tiles show the ℓ. P7 gives every shortcut one recipe and each tile its own glyph. Add P7 to **AN1** (it is small and touches the same files as AW14).
* **The new endings on the phone:** the Lottie canvas is fixed at 2×, so on most Android screens (2.6–3.5×) the finished picture is softer than the still (LT2); and the `complete` haptic should fire when the ✓ or ∎ lands (LT8). Add both to **AN3**.
* **Device checklist (§5), two more checks:** 9. Long-press the icon and look at the shortcut icons together. 10. Open Inbox zero and Day closed with motion on, at the phone's default display size, and compare the finished picture with the still.
