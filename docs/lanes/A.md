# Lane A — sync, auth and backend

Next action: AUTH-01 S2 is BLOCKED_OWNER (owner must enable Google in Supabase and sign in once on Pages); until then do SYNC-04 slice M1 below (mock-verifiable gaps only, no live gates).

| Field | Value |
| --- | --- |
| Status | READY (AUTH-01 S2 waiting on owner) |
| Current task | AUTH-01 S2 (owner-assisted), then SYNC-04 |
| Open branch / PR | none |
| Last merged work | AUTH-01 S1 at `b1ea568`, [CI 40450843938](https://github.com/Mymayankyadav/lemma/actions/runs/40450843938) SUCCESS (mocked OAuth). SYNC-03 DONE at `6fb7005`. |
| Backend | Only this lane may use Supabase (`yemqnhnztlbyxmjxidis`). Nine applied migrations, RLS on all four sync tables, advisors clean. Two-identity RLS probe NOT RUN. |
| Live confidence | Google provider config UNVERIFIED (owner). All sync evidence is mock transport. |

**SYNC-04 slice M1 (allowed before AUTH-01 S2 because it needs no live login):** list which SYNC-04 gate items already have tests (`grep -l` in `test/account_*.js`, `test/browser_sync.js`, `test/workspace_*.js`); for each missing item among offline restart, auth/session expiry, network loss after local commit, and deletes, add one mock-transport test and fix code only in lane A files. Record the item-by-item result in this file.

**Requests from other lanes:** none.
