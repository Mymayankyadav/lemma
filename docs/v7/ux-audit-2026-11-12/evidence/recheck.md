# Re-check on commit `1a67b04` (12 Nov 2026, evening)

After the audit (on `bcc04a3`) three merges landed: N123 (the Capacitor Android app), N124 (Motion v1) and N125 (fixes from the Owner's phone report). The web app was rebuilt from `1a67b04` (entry file `index-D-aXkfof.js`) and every finding that could have changed was measured again with `tools/recheck.cjs`: same example workspace, same fixed clock, 390 × 844 unless stated.

## Findings

| Finding | Measured on `1a67b04` | Status |
|---|---|---|
| V01 axis labels | "0, 10, 20, 30, 40 min", all inside the chart box (none left of x = 16 px) | **Fixed (N125)** |
| V02 Today strip | Labels at 2.2, 26.1, 50.0, 73.9, 97.8% of an 08:00–22:00 strip; block at `left: 50%`; now at 40.8% | Open |
| V03 numbers | Practice "0 of 1" (Today) vs "0 of 2" (Close the day); "about 9 min" (Today) vs "About 10 min" (Review) | Open |
| V04 double tick | Selected "50 min" chip: no tick element, one drawn by the kit's CSS | **Fixed (N125)** |
| V05 rail badge | 1280 px: badge 36–58 px, label 54–101 px | Open |
| V06 floating action | 1280 px: "Continue with tutor" at x = 183–409 px | Open |
| V07 card overflow | 1280 px window: document 1,311 px wide | Open |
| V08 chart text | 936 px chart: 38 px axis text; 460 px chart: 19 px | Open |
| V09 review card | 1280 px: 1,184 px wide | Open |
| V10 rail Settings | Top at 792 px of 800 | Open |
| V11 large text | 360 px at 130%: three dock labels overlap | Open |
| V13 Calendar Day | Grid from 378 px, dock at 766 px: 46% of the viewport | Open |
| V14 dock slot | After scrolling: Capture opacity 0; tabs 13–325 px in a 12–378 px bar | Open |
| V15 heat numerals | 2.93 : 1 on 7 and 11 Nov | Open |
| V16 almanac | scrollLeft 0; today at x = 692 px in a 358 px view | Open |
| V17 button order | Plan proposal: Approve at x = 25, Reject at x = 255 | Open |
| V18 codes | Checkpoint bar "CP4"; proposal "CP1…CP4", "S6", "S7" | Open |
| V20 motion and haptics | Motion v1 shipped in CSS (N124). `transitionPresets`, `dismissSheet`, `interpolateNumber`: no callers. `haptic()` callers: Inbox (4), calendar drag (2), kit gallery (1) | Half fixed |
| V24 Quick focus | Options named "Open" twice | Open |
| V31 Tasks | First task at 391 px | Open |
| V32 unknown address | Shows "Good afternoon" (Today) | Open |
| V34 copy | "Times are in Calcutta time." | Open |
| V12 old Android identity | App: adaptive, themed, legacy and status-bar icons from the v7 mark; v7 colours. Web: `public/screenshots/` unchanged since 8 Nov, labels "Today · Graph day"; `index.html` pre-paint colours `#FAFAF6` / `#13171D` | Mostly fixed (N123) |
| **V43** Data and account | 12 px text ×7, 14 px headings in a serif v7 does not load ×2, 13 × 13 px checkbox, three "Download a backup" | **New** |

## The Android-only interface

The app shows the web screens; Android adds five places inside the page, each behind `isNative()`. They were rendered in a desktop browser with a stand-in for Capacitor's bridge (`tools/androidui.cjs`, `tools/androidrects.cjs`): `window.Capacitor` reports Android and answers every native call with a fixed value (notifications "not asked", Study mode off, calendar not granted). This shows the layout and wording; it does not exercise any native behaviour.

| Place | File | Capture |
|---|---|---|
| Welcome sheet | `src/platform/NativeWelcome.tsx` | `captures/android-app__welcome.png` |
| Settings › Reminders › On this phone | `src/features/settings/v7/PhoneSettings.tsx` | `android-app__settings-reminders-phone.png`, `…-reminders-kinds.png` |
| Settings › Planning › On this phone | same | `android-app__settings-planning-phone.png` |
| Speak in Capture | `src/app/v7/CaptureSheet.tsx` | `android-app__capture-speak.png` |
| Drift prompt | `src/platform/start.ts` (a toast) | read from code |

## Read from the Android sources

| Claim | Evidence |
|---|---|
| The backup download cannot save in the app (AW2) | `Export.tsx` clicks an `<a download>` on a blob URL. No `DownloadListener` in `node_modules/@capacitor/android` or in `android/app/src/main/java` |
| No back-to-home preview on Today (AW8) | `AppPlugin.java` keeps its `OnBackPressedCallback` enabled while a `backButton` listener exists; `src/` never calls `toggleBackButtonHandler` |
| WebView keeps its default background (AW7) | `Bridge.java` sets the WebView colour only from `config.getBackgroundColor()`; `capacitor.config.json` sets a colour only for the SplashScreen plugin |
| Splash held a fixed time | `SplashScreen.launchShowDuration: 800`, `launchAutoHide: true` |
| Only two reminder kinds reach the phone (AW4) | `src/platform/reminders.ts` schedules cards due and study-block starts; N123's note lists the server-sent kinds as not built |
| Haptics engine connected | `src/ui/v7/haptics.ts` routes to `platform/haptics.ts` when `isNative()` |
| Adaptive foreground carries the whole page | `mipmap-xxxhdpi/ic_launcher_foreground.png`: opaque square 288 px of 432 (72 of 108 dp); background colour `#F8F5F0` |
| Themed icon is ℓ only | `drawable/ic_launcher_monochrome.xml`: one path, the ℓ |

## Scores

Only Progress changes (V01): phone Day and Night 6 → 6.5, desktop 5 → 5.5. Phone 7.44 → 7.48 (7.5 rounded); desktop 6.85 → 6.88 (6.9 rounded); Android conditions unchanged at 5.5.

## Not done

No APK was built or installed and no device was used. The findings marked *verify* in `03_ANDROID_UX_PLAN.md` need the device checklist in its §5.
