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
./gradlew assembleRelease                             # release APK (signed when the key variables are set)
```

There is no Play Console. CI (`.github/workflows/android.yml`) checks every pull request and, on main, builds a
release APK signed with the Owner's key and attaches it to a GitHub Release (`Lemma.apk`), the same model as the
Carrel app. Install it on the phone directly. Every update must be signed with the same key, so keep a backup of it.
Never commit the keystore, its passwords or `local.properties`.

## Layout

- `app/src/main/java/io/github/mymayankyadav/lemma/` — `MainActivity` and `LemmaNativePlugin` (the bridge to
  `src/platform/bridge.ts`); the timer (`TimerState`, `TimerText`, `TimerController`, `TimerActionReceiver`,
  `FocusTileService`, `BootReceiver`); reminders (`Reminders`, `Channels`, `AlarmPolicy`); `StudyMode`;
  `CalendarSync`/`CalendarPlan`; `ShareIntake`; `Shortcuts`, `CaptureTileService`; `SessionStore`, `StudyCommandClient`,
  `PendingActions`, `Links`.
- `app/src/test/` — JVM unit tests for the pure classes.
- `scripts/check-shell.mjs` — package, start path, App Links, sign-in callback and permission invariants.
- Icons are generated from the Notebook mark by `scripts/android-icons.mjs`; edit the mark, not the PNGs.

## Owner setup (once)

1. Supabase → Authentication → URL configuration → Redirect URLs: add `io.github.mymayankyadav.lemma://auth/callback`.
2. Repository secrets `ANDROID_KEYSTORE_BASE64` (the base64 of a PKCS12 keystore with alias `lemma`, key password equal to
   the store password) and `ANDROID_KEYSTORE_PASSWORD`. The Owner's key was generated for them on 12 Nov 2026 (EC P-256);
   keep a backup of both values: every update must be signed with the same key. To make a new one elsewhere:
   `keytool -genkeypair -keystore lemma-release.p12 -storetype PKCS12 -alias lemma -keyalg EC -groupname secp256r1 -validity 10000`
   (optional overrides: `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`).
3. Optional: `assetlinks.json` at `https://mymayankyadav.github.io/.well-known/` (from `docs/android/assetlinks.template.json`,
   with this key's SHA-256) makes Lemma web links tapped in other apps open the app. Without it they open in the browser;
   nothing in the app depends on it.
