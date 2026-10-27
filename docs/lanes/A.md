# Lane A — sync, auth and backend

Next action: SYNC-04 L3 — verify the already-tombstoned synthetic fixture disappears from the owner-signed-in account UI, stays absent after reload, and is not resurrected across an independently authenticated browser/device. The server tombstone and mocked client regression passed, but live client propagation is NOT VERIFIED. Then run offline restart, expiry, lost-response, and two-real-identity HTTP RLS gates; do not mark SYNC-04 DONE.

| Field | Value |
| --- | --- |
| Status | AUTH-01 DONE (web); SYNC-04 NEXT |
| Current task | SYNC-04 L3 owner-authenticated device checks still pending; L4 opt-in two-identity HTTP RLS acceptance harness added (self-test only until tokens are available) |
| Delivery | SYNC-04 L1/L2 [PR #23](https://github.com/Mymayankyadav/lemma/pull/23) merged as `6550475`; L3 checklist [PR #24](https://github.com/Mymayankyadav/lemma/pull/24) merged as `f15f4d2`. L3 deferred projection [PR #25](https://github.com/Mymayankyadav/lemma/pull/25) merged as `80c385c`. Current HTTP acceptance harness branch: `lane-a/sync-04-l4-http-rls-harness`. AUTH-01 PR #17 merged as `e13582d`. |
| Baseline | `main@80c385c` regression, Android, screenshot publication and Pages deployment all SUCCESS after PR #25; previous live L1 tests do not certify later builds. |
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
- Deletion was **NOT RUN**: inspected **Delete this note? / Its cards and review history will be removed.**, then cancelled. No normal UI recovery flow was shown, so action-time owner confirmation is required before the final Delete. At the L1 handoff the synthetic note was live at revision 2; the owner subsequently approved its L2 server-side tombstone at revision 3. All existing learning data and receipts were preserved.
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

## SYNC-04 L2 — owner-approved server tombstone, 27 October 2026

- Owner explicitly authorized deletion of the uniquely named synthetic note `SYNC-04 live verification 2026-10-27 A`; authorization was limited to that note.
- On Lemma project `yemqnhnztlbyxmjxidis`, preflight matched exactly one live `Verification` note at revision 2, two mutation receipts, zero review events, and the exact expected updated front.
- Within a transaction, checked the target, deck, front, revision, receipts, and review-event count; invoked the existing `public.commit_note` RPC under the `authenticated` role with the matching owner JWT claim and `p_delete=true`, expected revision 2, fresh request UUID, and null payload. This uses the same database function as normal app deletion but was **not initiated in the app UI**.
- Independent read-only verification after commit: the one fixture is **tombstoned, revision 3, three mutation receipts, zero reviews**. No row hard-deleted; no unrelated content was targeted, and no credentials/IDs are published.
- **Still unverified:** client outbox acknowledgment/propagation, live remote invalidation, UI disappearance, reload and offline no-resurrection. These cannot be inferred from the server RPC. An existing open client could retain a stale local copy until it pulls the tombstone. Do not mark deletion end-to-end complete.
- PR #23 was updated from prior `main` without rebase; regression [40502775044](https://github.com/Mymayankyadav/lemma/actions/runs/40502775044), Android [40502775101](https://github.com/Mymayankyadav/lemma/actions/runs/40502775101), screenshot publication SUCCESS. SYNC-04 remains NEXT, PR remains unmerged until this update re-passes CI.

## SYNC-04 L2 follow-up — mocked client deletion coverage, 27 October 2026

- Added [account Model tombstone invalidation regression](https://github.com/Mymayankyadav/lemma/commit/8ad6942b1201248780c4d1b497e68689e6d5d62b) in `test/account_sync.js`: pending local writes and open edits block projection; idle clean Model deletes the remote note; a stale restored projection disappears on refresh; dirty drafts and unrelated notes survive. No client write is queued to replay the tombstoned note.
- Added [independent-cache restart regression](https://github.com/Mymayankyadav/lemma/commit/52f34ae966d6423ac0112a6d2fe13063ec680d0e) in `test/browser_sync.js`: a second Chromium context ingests the tombstone and keeps its revision-2 deletion marker across reload, with no server resurrection.
- Automated [regression run 40506123997](https://github.com/Mymayankyadav/lemma/actions/runs/40506123997), [Android run 40506123832](https://github.com/Mymayankyadav/lemma/actions/runs/40506123832), and screenshot publication all **SUCCESS** for test commit `52f34ae`.
- This is mocked transport, not a real owner-authenticated web UI, a real-device HTTP test, or proof of no resurrection after a browser's offline restart. We lack access to the previous agent's signed-in browser session. Do not infer those gates from CI.
- The only live record changed by this L2 handoff was the explicitly approved synthetic server tombstone described above. No schema migration or additional production note writes.

## SYNC-04 L3 — explicit live acceptance checklist (pending)

The previous agent's authenticated browser profile is not accessible through the GitHub/Supabase connectors used in this continuation. Do not assume it remains signed in or reuse tokens from documentation. L3 is **blocked on a real authenticated app session**; the production tombstone alone cannot prove the client UI removed its local copy.

1. In a clean, separately authenticated browser profile, open deployed Pages, sign in securely as the owner, confirm **account workspace** is active, and wait for status **Saved to cloud** or a resolved/explicitly reported conflict. Never switch a device workspace without its validated backup and acknowledgment.
2. Search Cards for the uniquely labelled `SYNC-04 live verification 2026-10-27 A` and confirm it is absent; reload the page and verify remembered account workspace and continued absence. Confirm from read-only Lemma DB that only this fixture has `deleted_at IS NOT NULL`, revision 3 and three receipts, with zero reviews. Check for unexpected extra receipts and do not touch other learning notes.
3. In a second genuinely independent browser profile or device signed into the **same owner account**, confirm the tombstone is not resurrected. Same-profile tabs and raw SQL/IndexedDB mock tests do not meet this gate. If an old offline cache has pending or conflicting edits, retain it and test conflict resolution explicitly; do not wipe storage to get green results.
4. Separately exercise offline stop/restart/reconnect, expired session, and lost response after server commit using controlled tests. Inspect pending IDs, receipts, and UI status at each step; preserve all outbox and review history. Avoid making production network faults against real learning data.
5. For HTTP RLS isolation, use two independently authenticated real identities provided by the owner, with distinct test fixtures, and verify read/write denial across each identity. Existing rollback SQL simulated roles are insufficient. Never create shadow users, reveal tokens, or change authorization policy for a test.

SYNC-04 remains **NEXT**, not DONE. Until independent live testing is possible, rely only on previously scoped L1 live UI observations, the approved L2 server RPC, and green mocked regression tests. The next agent must verify current `main` and the status of this handoff PR before any further branch work.

## SYNC-04 L3 — deferred account Model invalidation reliability

- In `src/app/account_sync.js`, after the remote owner-scoped cache is updated, projection into the visible Model can be blocked by a sheet, active review, pending local write, or workspace transition. Previously a blocked projection just returned: without a further focus/navigation event it could leave the deleted note visible until a periodic fetch. This is a **source-level reliability gap**, not an observed live-device failure.
- The bounded fix schedules a 500 ms **local-cache-only** retry while the same owner account workspace remains active. Once idle and with no pending/failed Store writes, it projects the already-fetched tombstone; it does **not** repeatedly call Supabase or discard outbox entries. A failed Store write continues to block projection until explicitly resolved.
- A generation/ticket check guards every async boundary. Leaving the account cancels the retry timer and invalidates in-flight cache reads so a previous identity cannot update the new visible Model.
- New `test/account_sync.js` regressions cover idle-after-editor-close, pending-write-drain, preservation of dirty and unrelated notes, no automatic local mutation, and cancellation of a delayed cache read after sign-out. Existing `test/browser_sync.js` tests still cover independent IndexedDB tombstone durability under mocked transport.
- **Gate status:** New changes require green PR CI before merging. These are mock/VM checks; they do **not** certify authenticated real-browser tombstone propagation, independent-device convergence, offline app restart, expired HTTP session, lost response after server commit or two-real-identity HTTP RLS.
- Never perform another production delete or replace an existing learning note to simulate these gates. The previously authorized synthetic note remains tombstoned. No database migration is part of this slice.

## SYNC-04 L4 — reproducible HTTP RLS probe (implementation, NOT live evidence)

- `test/auth_http_rls.js` is a safety-guarded **opt-in** integration probe against **only the Lemma project**. The script's default behavior and `--self-test` use fake HTTP and no credentials; `test/account_identity.js` includes the self-test in the existing CI.
- The explicit `--live` mode requires two **different real** owner-authorized signed-in Supabase access tokens, the project's public/publishable API key, and two distinct test note IDs. Both fixtures must have a title starting `SYNC-04`; the script will reject ordinary mathematical notes. The existing owner-owned tombstoned fixture can serve as account A if its session is available; account B still needs its own *separate synthetic fixture*.
- Tokens are passed by **private local environment variables**, never pasted into PRs, committed, put in CI logs, or sent in chat. Run in a trusted local terminal only, with the owner controlling both independent logins. Read actual scripts before use; do not collect third-party users' credentials.
- Secure operator environment keys: `LEMMA_RLS_PUBLIC_KEY`, `LEMMA_RLS_TOKEN_A`, `LEMMA_RLS_TOKEN_B`, `LEMMA_RLS_NOTE_A`, `LEMMA_RLS_NOTE_B` and `LEMMA_RLS_ACK=SYNC-04-SYNTHETIC-HTTP-TEST`. Invocation: `node test/auth_http_rls.js --live`. The project URL is hardcoded, with redirect following disabled.
- It checks `/auth/v1/user` for two distinct user IDs, confirms each owner can read its **own** labelled note, probes foreign-owner reads from `notes`, `profiles`, `review_events`, and `review_retractions`, then probes RPC `commit_note` in both directions with an **expected nonzero victim revision**. The wrong owner must receive `stale_note_revision`. It re-reads owner data afterward to verify no change. The read-only preflight must pass before either RPC; no legitimate notes are targeted and no rows are deliberately created.
- **NOT YET RUN LIVE:** absence of the two real test sessions/second synthetic fixture prevents claiming HTTP authorization gate success. A passing mocked self-test does not prove deployed RLS behavior. This harness must not be used with a service-role key or embedded in the client.
- Remaining independent-device UI tombstone, offline restart/reconnect, expired authenticated session and lost-response end-to-end gates remain open. Keep SYNC-04 **NEXT**, not DONE.
