# Lane A — sync, auth and backend

Next action: AUTH-01 S2 is BLOCKED_OWNER (owner must enable Google in Supabase and sign in once on Pages); SYNC-04 M1 recovery coverage is implemented on `lane-a/sync-04-m1-recovery`; finish PR CI before closing this slice. No live gates are satisfied.

| Field | Value |
| --- | --- |
| Status | IN_PROGRESS (SYNC-04 M1 CI pending; AUTH-01 S2 waiting on owner) |
| Current task | AUTH-01 S2 (owner-assisted), then SYNC-04 |
| Open branch / PR | `lane-a/sync-04-m1-recovery`; PR creation pending |
| Last merged work | AUTH-01 S1 at `b1ea568`, [CI 40450843938](https://github.com/Mymayankyadav/lemma/actions/runs/40450843938) SUCCESS (mocked OAuth). SYNC-03 DONE at `6fb7005`. |
| Backend | Only this lane may use Supabase (`yemqnhnztlbyxmjxidis`). Nine applied migrations, RLS on all four sync tables, advisors clean. Two-identity RLS probe NOT RUN. |
| Live confidence | Google provider config UNVERIFIED (owner). All sync evidence is mock transport. |

**SYNC-04 M1 gate inventory (mock transport only):**

| Gate item | Coverage / result |
| --- | --- |
| Offline restart | Added to `test/browser_sync.js`: commit offline, reload the real IndexedDB cache with sending disabled, compare the complete pending operation, reconnect and confirm one revision with the original request ID. Browser run PENDING CI. This does not test PWA offline asset loading. |
| Auth/session expiry | Added to `test/browser_sync.js`: expired JWT stops the batch with pending dirty data, same-owner token refresh retries the same ID; missing session makes no RPC, SIGNED_OUT stops the handle, same-owner re-entry recovers the pending edit. Browser run PENDING CI. Existing `test/account_identity.js`, `test/workspace_lifecycle.js` and `test/workspace_browser.js` cover identity invalidation and workspace scrubbing. |
| Network loss after local commit | Existing `test/browser_sync.js`: server commits but response is lost; reload retries the original ID without a second revision. `test/local_persistence.js` and `test/editor_persistence.js` cover transaction/receipt durability. Node tests SUCCESS locally; browser PENDING CI. |
| Deletes | Existing `test/browser_sync.js`: tombstone propagation and offline edit/delete conflict across reload; explicit deletion resolution retains archives. `test/conflict_storage.js`, `test/conflict_resolution.js`, `test/account_store.js` cover durable deletes and no silent resurrection. Node tests SUCCESS locally; browser PENDING CI. |

**Validation:** `npm ci`, syntax, lane A guard, merge/outbox/replay/storage/account/account-store/workspace/FSRS tests, plan guard and build SUCCESS locally. Local Chromium unavailable: Playwright CDN returns a 195-byte "Site Unavailable" page, so local `test:browser-sync` and full `npm test` cannot pass; retain assertions and require full PR CI. No production code or database change in this slice.

**Still gated:** Google provider config UNVERIFIED (owner); AUTH-01 S2 sign-in/out and existing email-account `user.id` continuity, authenticated two-browser sync, two-identity RLS, live network/expiry/deletion recovery and PWA offline/update behavior NOT RUN. SYNC-04 remains BLOCKED.

**Requests from other lanes:** none.
