# Lane C — Android

## ANDROID-02 N1a — native callback entry claim (28 October 2026)

- **Claim:** `chat-20261028-c-n1a`; UTC heartbeat `2026-10-28T02:40Z`; base `main@7f9cd16`; branch `lane-c/android-02-n1-deeplink-entry`. Intended files: `android/app/src/main/AndroidManifest.xml`, `src/app/native_shell.js`, `test/android_native_shell.js`, `docs/ANDROID.md`, `docs/lanes/C.md`. No A auth, B Settings, package dependency, production, or user data change.
- **Scope:** add narrowly scoped Android HTTPS? no: custom `io.lemma.study://auth-callback` intent filter, parse and gate the exact callback in native App listener; surface a callback subscription for A's later PKCE exchange. Preserve Back/resume and web inert behavior. Include robust tests for invalid schemes/hosts, duplicate registration, callbacks with errors and no secrets logged. Do **not** claim complete Google login until A auth plus Browser plugin is integrated in a later coordinated slice.
- **Next:** implement, inspect patch, run `npm run test:android`, `npm run test:plan`, `node test/lane_guard.js C`, syntax and exact-head CI; merge only if current main passes all required checks. Physical Android OAuth/device gates remain NOT RUN.


Next action: **ANDROID-02 N1 READY** after UI-01 passed, using system browser Google PKCE sign-in/deep-link and native return handling; claim a fresh lane C PR, preserve A auth APIs and B presentation, automate what can be tested; physical phone gate remains NOT RUN.

## 28 October 2026 — ANDROID-02 unblocked (N1)

- **Dependency evidence:** UI-01 DONE following [PR #49](https://github.com/Mymayankyadav/lemma/pull/49), accepted B [PR #51](https://github.com/Mymayankyadav/lemma/pull/51) evidence and `main@a108dd5` [regression 40619701452](https://github.com/Mymayankyadav/lemma/actions/runs/40619701452), [local Supabase 40619701405](https://github.com/Mymayankyadav/lemma/actions/runs/40619701405), [Android 40619701429](https://github.com/Mymayankyadav/lemma/actions/runs/40619701429), all SUCCESS. [Integration PR #52](https://github.com/Mymayankyadav/lemma/pull/52) promotes ANDROID-02 to NEXT. Prior PR #39 preparation notes below are historical (do not reopen).
- **N1 scope:** system browser Google OAuth (`@capacitor/browser`, PKCE `skipBrowserRedirect:true`, `io.lemma.study://auth-callback`), `appUrlOpen` intent handling and exchange; coordinate required A/B-owned auth/UI changes by lane requests. Verify cancellation, invalid callback, lifecycle/duplicate callback and offline preservation in automated tests. No credentials or production tests by default; device sign-in remains an explicit hardware gate.
- **NOT RUN:** physical-install, safe-area/keyboard, foreground recovery, offline restart and reconnect, opt-in/denied due notification and Pages/phone convergence. Prepare artifact and checklist before requesting owner physical verification; native bundle still needs a new APK for each code update.


Next action: review and merge [PR #39](https://github.com/Mymayankyadav/lemma/pull/39) when docs/lane guard and CI pass. It prepares a no-code D1–D6 device+Pages acceptance sheet; physical tests are NOT RUN. ANDROID-02 stays BLOCKED by UI-01; afterward claim N1 native OAuth only when UI-01 is DONE.

| Field | Value |
| --- | --- |
| Status | ANDROID-01 S1 and S2 CI-verified; ANDROID-02 dependency-blocked |
| Current task | ANDROID-02 (blocked only by UI-01; SYNC-04 is DONE) |
| Lane C delivery | [PR #12](https://github.com/Mymayankyadav/lemma/pull/12) — S2 native Back and resume shell, exact `@capacitor/app@8.0.0`, native registration and tests |
| Last earlier merged work | [PR #9](https://github.com/Mymayankyadav/lemma/pull/9) S1, [PR #11](https://github.com/Mymayankyadav/lemma/pull/11) handoff |
| Verification evidence | [Regression 40469725905](https://github.com/Mymayankyadav/lemma/actions/runs/40469725905) **SUCCESS** (full `npm test` including `test:android`). [Android 40469725939](https://github.com/Mymayankyadav/lemma/actions/runs/40469725939) **SUCCESS** (native Gradle APK, syntax, `test:plan`, `node test/lane_guard.js C`, upload 5.6 MB APK). |
| Scope | Hardware Back: sheet → Home → history.back (if available) → native exit at root. Resume emits diagnostic log; web path no-op. No auth/sync/UI changes. |
| Outstanding | Physical Android device Back gesture, background/foreground, offline and updates NOT TESTED. Google sign-in, notifications and release signing are future gates. |
| Not yours | Web UI/CSS (lane B); sync/account/backend (lane A). |
| CI routing (27 Oct, owner-requested) | `android.yml` lane selection now also maps `integration/*` PR branches to `node test/lane_guard.js integration`, so owner-requested integration sessions are no longer rejected as "Unknown PR lane". Other prefixes still fail. No build steps changed. |

**Shared physical-device checklist (prepare before asking; reuse at RELEASE-01):** sideload the latest `lemma-android-debug` artifact from a green `main` Android run (see `docs/ANDROID.md`) and note whether Back from a sheet, Back at Home (exit) and background/foreground behave. Record results here in the next lane C session.

**Requests from other lanes:** none open at v5 inspection. Read all lane handoffs directly. Record requests to A/B with contract and acceptance criteria; do not ask the owner to relay them.

**N4 preparation (PR #39, CI pending):** [docs/ANDROID.md](../ANDROID.md#shared-android-02--release-01-device-acceptance-protocol-preparation-only) now holds D1–D6 preconditions, safe local-data backup/upgrade handling, native Back, OAuth cancel/deep-link, opt-in account convergence/deletion, offline restart, future consent-based notifications, and APK/Pages update checks. Each check requires physical PASS/FAIL/BLOCKED/NOT RUN with environment, SHA and evidence; nothing in this checklist is evidence of a run. Reuse passing unchanged checks at release. This is independent preparation only, not authorization to start blocked ANDROID-02 behavior.
