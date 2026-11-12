# Update: after the Android app was built

**12 Nov 2026, evening. Re-checked on commit `1a67b04`.** Read this first; it says what changed since the audit and how the rest of the folder was revised.

## 1. What changed on main since the audit

The audit was taken on `bcc04a3`. Three merges followed the same day.

| Merge | What it did | Effect on this plan |
|---|---|---|
| **N123** Lemma for Android: the Capacitor app | Replaced the web wrapper with a Capacitor app: new icon family, splash, edge-to-edge, back, four notification channels, the native focus timer, tiles, shortcuts, share, voice, Study mode, calendar sync. Owner decisions: Capacitor only; no server changes; no Play Console; widgets, server-sent notifications and the scanner deferred | The Android part of the plan is rewritten around what exists (`03_ANDROID_UX_PLAN.md`). Phase N‑1 is gone: the icon and colours are fixed |
| **N124** Motion v1 | Motion tokens, sheets rising, list inserts, the task tick drawing, the review answer rising, emblems stroking in; "Reduce effects" now works | Phase A1 is done. What remains is haptics and the three signature motions (`04`) |
| **N125** Owner's phone report | The header ℓ redrawn; the app's native calls repaired; chart axis labels no longer clipped; one tick on selected chips; chart tap highlight; sheet footers | Two of the audit's Majors are fixed (V01, V04) |

**A correction to the brief.** The web app did change after the audit: the three merges touch about thirty files of the web app. The screens look the same; the changes are motion and six fixes. Every finding below was re-measured on the new build rather than assumed.

## 2. The rule for Android

The Android app shows the web app's screens in a WebView. **The web screens are the source of truth**: there are no separate Android designs for any screen, a screen on the phone is judged against the same web scene at 360–412 px, and fixes are made in the web layer. Android-specific design is limited to five places inside the page (the welcome sheet, two "On this phone" groups in Settings, Speak in Capture, the drift prompt) and to the system surfaces around it.

## 3. Findings, re-checked

| Finding | Status on `1a67b04` | Measured now |
|---|---|---|
| **V01** Chart axes read "0 min" | **Fixed (N125)** | Labels "0, 10, 20, 30, 40 min" all inside the chart box |
| **V02** Today strip against the wrong hours | Open | Labels at 2, 26, 50, 74, 98% of an 08:00–22:00 strip; the 15:00 block at 50%, under "14" |
| **V03** One number, two values | Open | Practice "0 of 1" (Today), "0 of 2" (Close the day); "about 9 min" (Today), "About 10 min" (Review) |
| **V04** Two ticks in selected chips | **Fixed (N125)** | One tick |
| **V05** Badge over "Review" in the rail | Open | Badge 36–58 px, label from 54 px |
| **V06** "Continue with tutor" under the rail | Open | Button at x = 183–409 px |
| **V07** Card detail overflows | Open | 1,311 px in a 1,280 px window |
| **V08** Chart text grows with width | Open | 38 px on a 936 px chart |
| **V09** Review card 1,184 px wide | Open | 1,184 px |
| **V10** Settings below the rail's fold | Open | Link at 792 px of 800 |
| **V11** Collisions at 360 px, 130% text | Open | Three dock labels overlap |
| **V12** Old Android identity | **Mostly fixed (N123).** App icon, themed icon, status-bar icon and colours are generated from the v7 mark | Still stale: the install-dialog screenshots and their "Graph day" labels; the page's pre-paint colours in `index.html`. The Play screenshots no longer matter (no Play Console) |
| **V13** Calendar Day is 46% day | Open | 46% |
| **V14** Dock slot | Open | Capture at opacity 0, tabs 13–325 px |
| **V15** Heat numerals | Open | 2.93 : 1 |
| **V16** Almanac opens in the past | Open | Today at x = 692 px in a 358 px view |
| **V17** Approve / Reject order | Open | Approve at 25 px, Reject at 255 px |
| **V18** Codes | Open | "CP4" in the bar; "CP1…", "S6", "S7" in the proposal |
| **V20** Motion and haptics not connected | **Half fixed (N124).** Motion v1 is in, written in CSS | The kit's older `transitionPresets`, `dismissSheet` and `interpolateNumber` still have no callers (dead code to delete or adopt). Haptics still fire only in the Inbox and calendar drags |
| **V24** Two "Open" options | Open | Unchanged |
| **V31** Tasks first task | Open | First task at 391 px |
| **V32** Unknown address | Open | Shows Today |
| **V34** "Calcutta time" | Open | Unchanged |
| All others (V19, V21–V23, V25–V30, V33, V35–V42) | Not re-measured; the files they concern did not change | — |

**New, from a screen the first sweep missed**

**V43 · Data and account is still the old form** (Moderate). Inside a v7 page: 12 px text in seven places, two 14 px headings in a serif that v7 does not load, a 13 px native checkbox, an underlined text link, and the word "Download a backup" three times in one card. It is also where AW2 lives (below). Rebuild it as two grouped lists: *Export* (one row, one sentence) and *Delete account* (a confirm sheet).

**Scores.** With V01 and V04 fixed, Progress rises from 6 to 6.5 on phones. Phone overall moves from 7.4 to **7.5**; desktop from 6.8 to **6.9**; Android conditions stay at **5.5**. The scorecard board keeps the audit's snapshot and carries a note.

## 4. The Android app as built: summary

Detail in `03_ANDROID_UX_PLAN.md` and on board 14. I read the code and rendered the Android-only screens with a stand-in for the native bridge; I did not run a device, so items marked *verify* are risks, not observations.

**Strong:** the native focus timer (system clock, lock-screen actions, Live Update, tile, restore after reboot, "Save 42 min" or "Rate and save"); notifications computed on the phone with plain wording and gentle actions; the generated icon family; opt-in Study mode and calendar.

**To fix first (AW1–AW4):**

1. Large system text is untested and the web layer breaks at 130% (*verify how the WebView scales*).
2. "Download a backup" cannot work in the app: neither Capacitor nor the app handles downloads (confirmed in code). Delete account asks you to export first.
3. The app shows no version and cannot tell anyone that a newer APK exists.
4. Reminder kinds the phone cannot deliver (tutor, digest, deadlines) are shown as working switches.

**Then (AW5–AW13):** finish the welcome sheet; fire the haptics that exist; release the splash on first paint and theme the WebView background; restore the system's back preview on Today (the handler is never released); Study mode in one trip; decide what rotation is for; large-screen defects; 48 px; the drift question as a card, not a toast.

## 5. How the plan changed

| Was | Now |
|---|---|
| N‑1: bring the old wrapper's icon and colours up to v7 | **Done by N123.** Removed |
| U2 as a gate before the Android work | The app is out, so **U2 is the most urgent web phase** (it is Android phase AN2) |
| A design layer to add to N0–N7 | **AN1** make the built app right · **AN2** the web layer on a phone · **AN3** feel (haptics, launch, back, offline made visible) · **AN4** large screens and postures |
| Widgets with Paper and Sky looks, "On my desk" | **Parked** with the Owner's decision; the design stays on board 09 |
| Notification voice for ten kinds | Four channels exist; their wording is good; two small edits. The rest waits for push |
| Store screenshots, feature graphic | **Dropped** (no Play Console). Replaced by a release page that explains itself and the About group in the app |
| A1: wire the kit's presets | **Done differently by N124.** Remaining: delete or adopt the unused presets; wire haptics; the ∎, draw-in on covers, stamps |
| Decisions E1–E13 | E7 and E13 lapse; E14–E17 added (`05_PHASES_AND_DECISIONS.md`) |

## 6. What was revised in this folder

| File | Change |
|---|---|
| `00_UPDATE_AFTER_ANDROID_BUILD.md` | New (this file) |
| `01_AUDIT_RELEASED_V7.md` | Status notes on V01, V04, V12, V20; V43 added |
| `02_WEB_PLAN.md` | U0 and U2 rows updated; U2 no longer described as a gate |
| `03_ANDROID_UX_PLAN.md` | Rewritten: the app as built, findings AW1–AW17, phases AN1–AN4, device checklist, parked items |
| `04_ASSETS_AND_MOTION_PLAN.md` | A1 marked done; Android icon states; store assets dropped |
| `05_PHASES_AND_DECISIONS.md` | New order; decisions updated |
| `visuals/14-android-as-built.jpg` | New board |
| `visuals/13-phase-map.jpg` | Redrawn |
| `visuals/01`, `02`, `04`, `09`, `10`, `12` | Notes on what is now fixed, built or parked |
| `evidence/` | `recheck.md`; the Android-only captures; the re-check and stand-in scripts |
