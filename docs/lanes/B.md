# Lane B — UI

Next action: UI-01 gate review. S1–S4 are implemented. Once CI is green on the S4 PR, review the `ci-screenshots` `pr-<n>/` images (mobile/desktop, light/dark), check 200% text and the offline state, then mark UI-01 DONE. `view_settings.js` moves to lane B only via an integration session now that SYNC-04 is DONE.

| Field | Value |
| --- | --- |
| Status | S4 pushed, CI PENDING |
| Current task | UI-01 (S4 done, gate review left) |
| Open branch / PR | `ccr-ab20dc78-f2vlrf` (no PR opened yet) |
| Last merged work | UI-01 S3 Cards (PR #21); S1 #15; S2 #18 |
| Not yours | `src/app/view_settings.js` until an integration session reassigns it. Sync/account behaviour. Supabase. |

**Requests from other lanes:** none.

**S4 decision:** Stats is no longer a top-level tab (nav: Today / Cards / Settings); Today has a "Statistics" link (`.stats-link`, `data-go="stats"`), route/hash unchanged. On Stats, True retention and FSRS accuracy are collapsed `<details>` panels. Reduced motion was already covered by the global `prefers-reduced-motion` block in `app.css`; review keyboard shortcuts untouched. `npm test` (including e2e and 20 UI screenshots) and `node test/lane_guard.js B` pass locally; CI not yet run.
