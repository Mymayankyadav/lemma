# Lane A — sync, auth and backend

Next action: SYNC-04 L1 — using an owner-authenticated browser, export the device backup, compare device/account data, explicitly activate the account workspace, create one clearly identified sync-verification note, and verify automatic cloud commit plus reload recovery. Preserve all existing device/account data. Extend to independent devices and another real test identity before marking SYNC-04 DONE.

| Field | Value |
| --- | --- |
| Status | AUTH-01 DONE (web); SYNC-04 NEXT |
| Current task | SYNC-04 live automatic-write/recovery checks |
| Delivery | [PR #17](https://github.com/Mymayankyadav/lemma/pull/17), `lane-a/auth-01-s2-live-complete`; verify merged status before proceeding |
| Baseline | `449b473`: regression 40475690079 and Android 40475690031 SUCCESS. PR #13 merged as `639a8df`; its mocked Settings guards passed. |
| Backend | Only Lemma `yemqnhnztlbyxmjxidis`; nine applied migrations. No migration, credential configuration or learning-data writes in AUTH-01 S2 verification. |

## AUTH-01 S2 — live web gate COMPLETE, 27 October 2026

- Owner completed secure Google authentication in the test browser. The first, delayed OAuth state expired; Lemma displayed **OAuth state has expired**, kept the device workspace intact (0 notes/cards/reviews), and a fresh Google request succeeded. No secrets were inspected, copied or committed.
- The deployed Pages Settings showed **Signed in** for the owner and **Private account cache: ready**, while device/account workspaces stayed separate.
- With the backup checkbox unchecked, clicking **Use account workspace** displayed **Export a backup and check the acknowledgment before switching.** The device workspace stayed active. This was verified in the live deployed UI while signed in.
- Clicking **Sign out** returned success; after a page reload, Settings showed **Not signed in** and account cache **signed-out**. Gateway logs confirm `POST /auth/v1/logout` HTTP 204.
- Clicking **Continue with Google** again completed PKCE exchange; Settings returned to **Signed in** and cache **ready**. Gateway logs confirm token exchange HTTP 200. Comparing the owner's database identity before and after logout/re-login confirmed the **same `user.id`**. Only the equality result is retained here; no account identifiers or credentials are published.
- There was no earlier email-link account in this installation: zero auth users before initial Google signup, then one owner/Google identity. That earlier-email linking case is N/A for this run, not claimed as a separate live test. No accounts/rows were migrated. The pre-existing-email regression remains mock-only.
- Explicit device/account comparison after re-login reported **0 cards, 0 conflicts, 0 deletions and 0 pending snapshots**. This verifies comparison, not synchronization of writes.
- Android OAuth S3 is still part of ANDROID-02. AUTH-01 DONE refers to the web gate only.

## Prior evidence and limits

SYNC-04 M1 passed [regression 40463998686](https://github.com/Mymayankyadav/lemma/actions/runs/40463998686): offline IndexedDB restart, expired JWT/session recovery, lost server responses, tombstones and explicit conflict recovery with mocked transport. [PR #13 regression, attempt 2](https://github.com/Mymayankyadav/lemma/actions/runs/40472195378/attempts/2) passed full app/Settings tests; [its APK build](https://github.com/Mymayankyadav/lemma/actions/runs/40472195531) passed. An initial unrelated editor-preview assertion failed before the unchanged rerun passed.

The existing rollback-only `supabase/tests/note_write_contract.sql` passed on Lemma: revisions, idempotency, write grants, tombstones, immutable reviews and isolation under two authenticated-role UID claims. All fixtures rolled back; the real owner remained intact. This is a SQL role probe, not two HTTP-authenticated users. RLS is enabled on notes, profiles, review_events and review_retractions. Advisor's password-only [leaked-password protection warning](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) was left unchanged.

## SYNC-04 remaining live gates

Automatic writes and clean Model invalidation, independent two-browser/device convergence, offline restart, auth expiry, lost response after commit, deletes and two-real-identity HTTP RLS isolation still require live verification. No routine manual Sync button after activation. Do not equate successful reads, same-profile tabs, SQL role simulation or mock tests with these gates. PWA offline asset loading/update remains a separate release check.

The browser's Google session enables the next owner-scoped tests in this conversation; another environment may need its own secure login. Never extract session tokens or infer that a user's phone login authenticates the agent browser. Synthetic test notes must be clearly identified; never alter existing learning cards to satisfy a test.

## Requests from other lanes

None. PR #14 (`dbfb961`) consumed the owner's one-time workflow-only exception; ownership rules are unchanged. Future cross-lane changes use the normal request protocol.
