# Lane A — sync, auth and backend

Next action: finish AUTH-01 S2: verify one live Pages sign-out/re-login and the backup acknowledgment control. Google setup and first login are VERIFIED; do not ask the owner to repeat setup. Resolve the lane C workflow request below before merging this PR. SYNC-04 live gates stay pending until AUTH-01 passes.

| Field | Value |
| --- | --- |
| Status | IN_PROGRESS (AUTH-01 S2; live sign-out pending) |
| Current task | AUTH-01 S2 verification, then SYNC-04 live gates |
| Open branch / PR | `lane-a/auth-01-live-verification`; PR pending |
| Baseline | `main@310ef6a`, regression 40466003325 and Android 40466003236 SUCCESS. SYNC-04 M1 merged in PR #8 at `5efdf3e`. |
| Backend | Only Lemma `yemqnhnztlbyxmjxidis`; nine applied migrations. No migrations or persistent backend writes in this slice. |

## Live evidence — 27 October 2026

- **Google enabled and login SUCCESS:** public auth settings report `external.google=true`; unified auth logs show Google signup at 07:45:27 UTC and Google login at 07:45:36 UTC, successful callback redirects and token exchange (HTTP 200). The deployed Pages app points to this project. The owner reports completing setup/sign-in.
- **Account identity:** before OAuth the project had zero accounts; afterward it has one account and one Google identity. There is no earlier email-link account to match in this installation. Pre-existing-email identity linking remains untested live; no accounts or rows were migrated.
- **Account cache reads SUCCESS:** gateway logs show HTTP 200 for owner note, profile, review-event and review-retraction reads. This does not prove writes, device convergence or owner workspace activation.
- **Live sign-out NOT VERIFIED:** the inspected 07:40 UTC onward window contains no logout request/event. Auth audit events are in unified `auth_audit_logs`; `auth.audit_log_entries` is empty. Never interpret that empty SQL table as absence of login.
- **Database role probe SUCCESS:** existing `supabase/tests/note_write_contract.sql` ran against Lemma and rolled back every fixture. It verified revisions, idempotency, write grants, tombstones, immutable reviews and cross-owner isolation under the `authenticated` role with two synthetic UID claims. This is a database policy test, not two real HTTP-authenticated users. Post-check: one account/Google identity remains and zero fixture notes remain.
- **RLS enabled** on notes, profiles, review_events and review_retractions. Security advisor reports one password-auth setting: [leaked-password protection disabled](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection); no table/RPC finding. Configuration left unchanged.

## Regression coverage

`test/workspace_browser.js` now exercises the real Settings buttons with mocked auth: Google is primary; attempting account activation without backup acknowledgment preserves the device workspace; Sign out calls the auth client once and retains device cards and draft. Browser result PENDING CI; this is not a live logout test.

SYNC-04 M1 is already mock-verified by [regression 40463998686](https://github.com/Mymayankyadav/lemma/actions/runs/40463998686): `test/browser_sync.js` covers offline IndexedDB restart, expired JWT/session recovery, lost responses after server commit, tombstones and explicit edit/delete conflict recovery. Storage/account/workspace tests cover durable receipts, identity invalidation and no implicit enrollment.

Local checks: `npm ci`, syntax, `test:workspace`, build, `test:plan`, lane A guard and diff checks SUCCESS. Full local `npm test` is blocked by unavailable Chromium; the prior browser-download attempts returned a 195-byte Site Unavailable page. Full PR regression must pass.

## Remaining gates

AUTH-01 S2 stays unfinished until a live Pages logout/re-login is observed and the acknowledgment control is verified. Then mark AUTH-01 DONE and SYNC-04 NEXT in the same PR. Android OAuth S3 belongs to ANDROID-02.

SYNC-04 still needs real authenticated two-browser/two-identity convergence, offline restart, auth expiry, network loss after commit, deletes and HTTP RLS isolation. PWA offline asset loading/update remains separately unverified. Do not treat successful cache reads, SQL role simulation or mock transport as those live gates.

## Requests from other lanes

- **Lane C:** `.github/workflows/android.yml`, step `Check syntax and lane ownership`, currently runs `node test/lane_guard.js C` on every PR. This rejects legitimate A/B changes. Select the guard using the PR head's `lane-a/`, `lane-b/` or `lane-c/` prefix; on main pushes run ownership-config validation (`npm run test:plan`) without forcing C. Keep syntax/plan checks. After C merges the correction, merge current main into this A branch and rerun CI. Do not bypass or weaken ownership tests from lane A.
