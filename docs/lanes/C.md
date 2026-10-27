# Lane C — Android

Next action: ANDROID-02 — BLOCKED until both SYNC-04 and UI-01 are DONE; physical device verification of the Android shell is also still needed. Do not begin authentication, UI/CSS or notification work ahead of those gates.

| Field | Value |
| --- | --- |
| Status | ANDROID-01 S1 and S2 CI-verified; ANDROID-02 dependency-blocked |
| Current task | ANDROID-02 (not ready: requires SYNC-04 and UI-01) |
| Lane C delivery | [PR #12](https://github.com/Mymayankyadav/lemma/pull/12) — S2 native Back and resume shell, exact `@capacitor/app@8.0.0`, native registration and tests |
| Last earlier merged work | [PR #9](https://github.com/Mymayankyadav/lemma/pull/9) S1, [PR #11](https://github.com/Mymayankyadav/lemma/pull/11) handoff |
| Verification evidence | [Regression 40469725905](https://github.com/Mymayankyadav/lemma/actions/runs/40469725905) **SUCCESS** (full `npm test` including `test:android`). [Android 40469725939](https://github.com/Mymayankyadav/lemma/actions/runs/40469725939) **SUCCESS** (native Gradle APK, syntax, `test:plan`, `node test/lane_guard.js C`, upload 5.6 MB APK). |
| Scope | Hardware Back: sheet → Home → history.back (if available) → native exit at root. Resume emits diagnostic log; web path no-op. No auth/sync/UI changes. |
| Outstanding | Physical Android device Back gesture, background/foreground, offline and updates NOT TESTED. Google sign-in, notifications and release signing are future gates. |
| Not yours | Web UI/CSS (lane B); sync/account/backend (lane A). |
| CI routing (27 Oct, owner-requested) | `android.yml` lane selection now also maps `integration/*` PR branches to `node test/lane_guard.js integration`, so owner-requested integration sessions are no longer rejected as "Unknown PR lane". Other prefixes still fail. No build steps changed. |

**Idle-time owner check (optional, not a gate yet):** sideload the latest `lemma-android-debug` artifact from a green `main` Android run (see `docs/ANDROID.md`) and note whether Back from a sheet, Back at Home (exit) and background/foreground behave. Record results here in the next lane C session.

**Requests from other lanes:** none.
