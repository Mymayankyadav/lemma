# Lane A — sync, auth and backend

Next action: verify post-integration CI on draft PR #23 (`lane-a/sync-04-l1-live-write`), then continue SYNC-04 L2 within the outstanding live gates. The prior `main` was integrated without rebasing; this PR remains unmerged. Obtain action-time owner confirmation before deleting only the synthetic note `SYNC-04 live verification 2026-10-27 A` in deck `Verification`; then verify automatic tombstone delivery and no resurrection after reload. L1 create/update/reload passed. Independent-device/offline/fault/second-identity gates remain; preserve all learning data.

| Field | Value |
| --- | --- |
| Status | AUTH-01 DONE (web); SYNC-04 NEXT |
| Current task | SYNC-04 L1 live create/update/reload complete; L2 deletion awaiting confirmation |
| Delivery | [Draft PR #23](https://github.com/Mymayankyadav/lemma/pull/23), `lane-a/sync-04-l1-live-write`. Lane A reassigned and branch adopted. Latest `main` integrated without rebasing; PR remains draft and unmerged. AUTH-01 PR #17 merged as `e13582d`. |
| Baseline | L1 tested on `main@2c1f554`: [regression 40478252724](https://github.com/Mymayankyadav/lemma/actions/runs/40478252724), Android 40478252732 and Pages 40478252681 SUCCESS. Latest `main@1125388` [regression 40484074497](https://github.com/Mymayankyadav/lemma/actions/runs/40484074497) and [Android 40484074547](https://github.com/Mymayankyadav/lemma/actions/runs/40484074547) SUCCESS; post-integration PR CI awaiting verification. L1 live checks ran against the earlier deployed AUTH-01 build; they do not certify lane B's later navigation change. |
| Backend | Only Lemma `yemqnhnztlbyxmjxidis`; nine applied migrations. L1 created/updated one synthetic note through the app; no migration, credential configuration or existing learning-data changes. |

## AUTH-01 S2 — live web gate COMPLETE, 27 October 2026

- Owner completed secure Google authentication in the test browser. The first, delayed OAuth state expired; Lemma displayed **OAuth state has expired**, kept the device workspace intact (0 notes/cards/reviews), and a fresh Google request succeeded. No secrets were inspected, copied or committed.
- The deployed Pages Settings showed **Signed in** for the owner and **Private account cache: ready**, while device/account workspaces stayed separate.
- With the backup checkbox unchecked, clicking **Use account workspace** displayed **Export a backup and check the acknowledgment before switching.** The device workspace stayed active. This was verified in the live deployed UI while signed in.
- Clicking **Sign out** returned success; after a page reload, Settings showed **Not signed in** and account cache **signed-out**. Gateway logs confirm `POST /auth/v1/logout` HTTP 204.
- Clicking **Continue with Google** again completed PKCE exchange; Settings returned to **Signed in** and cache **ready**. Gateway logs confirm token exchange HTTP 200. Comparing the owner's database identity before and after logout/re-login confirmed the **same `user.id`**. Only the equality result is retained here; no account identifiers or credentials are published.
- There was no earlier email-link account in this installation: zero auth users before initial Google signup, then one owner/Google identity. That earlier-email linking case is N/A for this run, not claimed as a separate live test. No accounts/rows were migrated. The pre-existing-email regression remains mock-only.
- Explicit device/account comparison after re-login reported **0 cards, 0 conflicts, 0 deletions and 0 pending snapshots**. This verifies comparison, not synchronization of writes.
- Android OAuth S3 is still part of ANDROID-02. AUTH-01 DONE refers to the web gate only.

## SYNC-04 L1 — live automatic writes and reload SUCCESS, 27 October 2026

- Starting device and account comparison was empty: 0 notes, conflicts, deletions and pending snapshots. Saved and parsed the app's visible JSON backup (empty notes plus profile/settings), then checked the acknowledgment and confirmed **Use account workspace**. Activation displayed **Saved to cloud**; it did not merge or erase the separate device workspace.
- The host-dependent Export **Download** did not produce a file in this browser. **Copy** showed success but clipboard readback was empty. The backup was instead saved from the visible export textarea and validated as Lemma JSON before activation. This is not evidence that the Download/Copy controls work on plain Pages; see lane B request below.
- Created exactly one Basic note through the normal editor: title **SYNC-04 live verification 2026-10-27 A**, deck **Verification**, front **SYNC-04 automatic cloud delivery test. Temporary verification card.** No reviews or learning content. Clicking **Add card** automatically progressed from **Saved on device · checking cloud** to **Saved to cloud**, without a manual Sync action.
- Read-only database verification scoped to that owner/title found exactly **1 live note, revision 1, 1 mutation receipt**, with the expected front. No account identifiers, tokens or credentials are retained in this record.
- Reloading restored the remembered account workspace and the same note. An asynchronous startup briefly showed the empty device view before account restoration; the eventual rendered account view was verified.
- Opened a second tab in the **same browser profile**, then changed the front through the original editor to **SYNC-04 updated automatically. Temporary verification card.** and clicked **Save**. The peer view displayed the update automatically without manual refresh/sync. Database verification found **1 live note, revision 2, 2 mutation receipts**, matching the updated front.
- This proves automatic create/update delivery, reload recovery and same-profile cross-tab invalidation for this fixture. Shared cookies/storage mean it does **not** prove independent-device convergence, remote-only Model invalidation or another identity's isolation.
- Deletion was **NOT RUN**: inspected **Delete this note? / Its cards and review history will be removed.**, then cancelled. No normal UI recovery flow was shown, so action-time owner confirmation is required before the final Delete. The one labelled synthetic note remains live at revision 2; all existing learning data and receipts are preserved.
- This PR is evidence/documentation only. Local `npm run test:plan`, `node test/lane_guard.js A` and `git diff --check` SUCCESS. Full PR CI PENDING at handoff. The successor incorporated `main@1125388` as an additional parent in a no-rebase merge, preserving concurrent lane changes; post-integration PR CI must pass before any PR merge. No deletion or further live mutation is authorized by this handoff alone.

## Prior evidence and limits

SYNC-04 M1 passed [regression 40463998686](https://github.com/Mymayankyadav/lemma/actions/runs/40463998686): offline IndexedDB restart, expired JWT/session recovery, lost server responses, tombstones and explicit conflict recovery with mocked transport. [PR #13 regression, attempt 2](https://github.com/Mymayankyadav/lemma/actions/runs/40472195378/attempts/2) passed full app/Settings tests; [its APK build](https://github.com/Mymayankyadav/lemma/actions/runs/40472195531) passed. An initial unrelated editor-preview assertion failed before the unchanged rerun passed.

The existing rollback-only `supabase/tests/note_write_contract.sql` passed on Lemma: revisions, idempotency, write grants, tombstones, immutable reviews and isolation under two authenticated-role UID claims. All fixtures rolled back; the real owner remained intact. This is a SQL role probe, not two HTTP-authenticated users. RLS is enabled on notes, profiles, review_events and review_retractions. Advisor's password-only [leaked-password protection warning](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) was left unchanged.

## SYNC-04 remaining live gates

Independent two-browser/device convergence and remote-only clean Model invalidation, offline restart, auth expiry, lost response after commit, deletes and two-real-identity HTTP RLS isolation still require live verification. L1 automatic create/update delivery, online reload and same-profile cross-tab checks passed as scoped above. No routine manual Sync button after activation. Do not equate successful reads, same-profile tabs, SQL role simulation or mock tests with these gates. PWA offline asset loading/update remains a separate release check.

The browser's Google session enables the next owner-scoped tests in this conversation; another environment may need its own secure login. Never extract session tokens or infer that a user's phone login authenticates the agent browser. Synthetic test notes must be clearly identified; never alter existing learning cards to satisfy a test.

## Requests from other lanes

Lane B request: in `src/app/sheets.js`, `ExportSheet.open/getDownloads`, provide a working plain-web backup download fallback (or hide unavailable Download reliably) and verify Copy readback/failure reporting without `window.claude`. In the live cloud browser, Download appeared but did nothing; Copy reported success with empty clipboard readback. The visible JSON textarea fallback allowed this empty-workspace test; do not weaken the activation backup acknowledgment. Lane A has not edited lane B files.

PR #14 (`dbfb961`) consumed the owner's one-time workflow-only exception; ownership rules are unchanged. Future cross-lane changes use the normal request protocol.
