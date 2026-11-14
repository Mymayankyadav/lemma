## N163 (rules) — Firebase Cloud Messaging is approved for the phone's notifications

**Owner decision, 14 Nov 2026** ("Ok let's setup fcm"; scope: the timer from chat first, then every notify kind): this lifts D11 and D12 of 12 Nov for Cloud Messaging only. Everything else in them stands: no other Firebase library (analytics, crash reporting, ...), no `google-services` plugin or `google-services.json`, no Play services extras.

- `android/scripts/check-shell.mjs` now accepts `com.google.firebase:firebase-messaging` in the Gradle files and fails any other `com.google.firebase:*` artifact, any Firebase or `gms` plugin line, and the `google-services` plugin. `tests/unit/android/android-shell.test.ts` covers all three (it accepted no Firebase at all before).
- `.github/workflows/supabase.yml` deploys the `push` Edge function (`--no-verify-jwt`; the handler checks a shared-secret header) when `supabase/functions/push/index.ts` exists. It is a no-op until N163 lands that file.
- `NEXT.md` has the two items: N163 (the timer from chat, end to end) and N164 (every notify kind, closing N160.10).
- The app starts Firebase from four public client values (`android/app/firebase.properties`: application id, API key, project id, sender id), so no plugin or JSON is needed and the app builds without them.

Secrets stay out of the repo: the Firebase service-account key is the Supabase function secret `FCM_SERVICE_ACCOUNT`, and `PUSH_SHARED_SECRET` is a second function secret, both set by the Owner in the Supabase dashboard (steps in `docs/current/N163.md`).
