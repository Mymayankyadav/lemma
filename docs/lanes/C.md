# Lane C — Android

Next action: ANDROID-02 becomes ready automatically when UI-01 is DONE (SYNC-04 already DONE). Until then prepare the native smoke checklist/test design and inspect incoming C requests without enabling dependent auth/UI/notification behavior. On readiness claim a lane-c PR; coordinate A auth APIs and B safe-area UI directly. Prepare a tested APK and consolidate physical-device/production checks before asking the owner.

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
