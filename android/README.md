# Lemma for Android (Capacitor)

The Android app is the same React app as the website, bundled into a Capacitor 8 shell with Lemma's own native code
for the focus timer, reminders, Quick Settings tiles, shortcuts, share-to-Lemma, voice capture, Study mode and the
device calendar. Package `io.github.mymayankyadav.lemma` (the same Play listing the Trusted Web Activity used).
What exists and why: `docs/current/N123.md`. The plan: `docs/android/PLAN.md`.

## Build

JDK 21, Android SDK platform 36 and build-tools 36.0.0 (`ANDROID_HOME` set).

```sh
npm ci
npm run build:android            # icons, vite build --mode android, cap sync
cd android
./gradlew testDebugUnitTest lintDebug assembleDebug   # Java tests, lint, debug APK
./gradlew bundleRelease                               # release AAB
```

Release signing reads `ANDROID_KEYSTORE_FILE`, `ANDROID_UPLOAD_KEYSTORE_PASSWORD`, `ANDROID_UPLOAD_KEY_ALIAS` and
`ANDROID_UPLOAD_KEY_PASSWORD`; without them the AAB is unsigned and must not be uploaded. CI (`.github/workflows/android.yml`)
does all of the above and keeps the AAB, APK and lint report as artifacts. Never commit keystores, passwords,
`local.properties` or `google-services.json` (there is no Firebase in this app).

## Layout

- `app/src/main/java/io/github/mymayankyadav/lemma/` — `MainActivity` and `LemmaNativePlugin` (the bridge to
  `src/platform/bridge.ts`); the timer (`TimerState`, `TimerText`, `TimerController`, `TimerActionReceiver`,
  `FocusTileService`, `BootReceiver`); reminders (`Reminders`, `Channels`, `AlarmPolicy`); `StudyMode`;
  `CalendarSync`/`CalendarPlan`; `ShareIntake`; `Shortcuts`, `CaptureTileService`; `SessionStore`, `StudyCommandClient`,
  `PendingActions`, `Links`.
- `app/src/test/` — JVM unit tests for the pure classes.
- `scripts/check-shell.mjs` — package, start path, App Links, sign-in callback and permission invariants.
- Icons are generated from the Notebook mark by `scripts/android-icons.mjs`; edit the mark, not the PNGs.

## Owner setup

1. Supabase → Authentication → URL configuration → Redirect URLs: add `io.github.mymayankyadav.lemma://auth/callback`.
2. Publish `docs/android/assetlinks.template.json`, with the Play App Signing SHA-256, at
   `https://mymayankyadav.github.io/.well-known/assetlinks.json` (the separate user-site repository, not under /lemma/).
3. Add the four upload-key secrets above (keystore as `ANDROID_UPLOAD_KEYSTORE_BASE64`); confirm it is the TWA's upload key.
