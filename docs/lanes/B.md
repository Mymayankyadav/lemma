# Lane B — UI

Next action: UI-01 gate review on PR #35. Review fresh `ci-screenshots/pr-35/` images after CI, the automated keyboard/touch/offline and 640px reflow checks, and actual 200% browser text zoom before closing the full gate. Do not mark UI-01 DONE if any gate is unverified. `view_settings.js` transfers only in a separate integration session.

| Field | Value |
| --- | --- |
| Status | S4 fixes and gate tests pushed to PR #35; new CI PENDING |
| Current task | UI-01 (S4 implemented; final accessibility and screenshot gate review left) |
| Open branch / PR | `lane-b/ui-01-s4-stats` / PR #35 |
| Last merged work | UI-01 S3 Cards (PR #21); S1 #15; S2 #18 |
| Not yours | `src/app/view_settings.js` until an integration session reassigns it. Sync/account behaviour. Supabase. |

**Requests from other lanes:** none.

**S4 decision:** Stats is no longer a top-level tab (nav: Today / Cards / Settings); Today has a "Statistics" link (`.stats-link`, `data-go="stats"`), route/hash unchanged. On Stats, True retention and FSRS accuracy are collapsed `<details>` panels. Reduced motion was already covered by the global `prefers-reduced-motion` block in `app.css`; review keyboard shortcuts untouched. `npm test` (including e2e and 20 UI screenshots) and `node test/lane_guard.js B` pass locally; CI not yet run.

**S4 follow-up (PR #35):** Compared the previous 20-shot CI suite against `main/` in both mobile and desktop modes, light and dark. The first PR preview exposed a five-track mobile bottom bar with only four controls (unused end slot); changed it to four equal tracks. Increased the Statistics link and advanced disclosure summaries to a 44px minimum height. Added tests in `test/ui_screenshots.js` for four evenly spaced mobile controls, keyboard disclosure, 44px mobile targets with touch emulation, offline Cards browsing, and a 640px desktop reflow proxy for 200% zoom. Original screenshots were from `63b00c2`; **fresh post-fix CI and screenshot review still pending**. The proxy does not substitute for a real-browser 200% text-zoom/keyboard audit, and mocked offline browsing does not prove production network recovery (lane A's local-stack suite covers sync).
