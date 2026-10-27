# Lane B — UI

Next action: UI-01 S4 final verification on PR #35. Inspect regenerated `ci-screenshots/pr-35/` images (the mobile bar now has visible text labels), check the new oversized-math, touch, keyboard, offline and 640px reflow tests, then merge only after the exact PR head's CI is green. Actual 200% browser text zoom and wider error/loading/offline visual states remain a separate unverified UI-01 gate. Do not mark UI-01 DONE if any gate is unverified. `view_settings.js` transfers only in a separate integration session.

| Field | Value |
| --- | --- |
| Status | PR #35 updated with mobile nav labels and oversized-math coverage; latest-head CI PENDING. Earlier S4 revision `cf36d28` was green. Full UI-01 gate remains NEXT. |
| Current task | UI-01 (S4 implemented; final accessibility and screenshot gate review left) |
| Open branch / PR | `lane-b/ui-01-s4-stats` / PR #35 |
| Last merged work | UI-01 S3 Cards (PR #21); S1 #15; S2 #18 |
| Not yours | `src/app/view_settings.js` until an integration session reassigns it. Sync/account behaviour. Supabase. |

**Requests from other lanes:** none.

**S4 decision:** Stats is no longer a top-level tab (nav: Today / Cards / Settings); Today has a "Statistics" link (`.stats-link`, `data-go="stats"`), route/hash unchanged. On Stats, True retention and FSRS accuracy are collapsed `<details>` panels. Reduced motion was already covered by the global `prefers-reduced-motion` block in `app.css`; review keyboard shortcuts untouched. `npm test` (including e2e and 20 UI screenshots) and `node test/lane_guard.js B` pass locally; CI not yet run.

**S4 follow-up (PR #35):** Compared the previous 20-shot CI suite against `main/` in both mobile and desktop modes, light and dark. The first PR preview exposed a five-track mobile bottom bar with only four controls (unused end slot); changed it to four equal tracks. Increased the Statistics link and advanced disclosure summaries to a 44px minimum height. Added tests in `test/ui_screenshots.js` for four evenly spaced mobile controls, keyboard disclosure, 44px mobile targets with touch emulation, offline Cards browsing, and a 640px desktop reflow proxy for 200% zoom. Original comparison screenshots were from `63b00c2`; **updated screenshots from `cf36d28` reviewed in both mobile schemes and desktop, including Home, Stats, Cards and Review.** [Regression + screenshot publish 40562397011](https://github.com/Mymayankyadav/lemma/actions/runs/40562397011) SUCCESS; [Android + lane guard 40562396999](https://github.com/Mymayankyadav/lemma/actions/runs/40562396999) SUCCESS. Actual 200% text zoom and comprehensive loading/error/offline UI-state review remain for the final UI-01 acceptance gate. The proxy does not substitute for a real-browser 200% text-zoom/keyboard audit, and mocked offline browsing does not prove production network recovery (lane A's local-stack suite covers sync).

**S4 final-accessibility follow-up:** The UI contract requires visible mobile navigation labels; the existing icons-only bar did not meet it. Added Today / Cards / New / Settings captions with four even tracks, preserved the distinguished New-card action and ≥44px hit boxes. Added screenshot-harness assertions that these labels are visible and every action is large enough. Added a long 70-term display-math editor-preview test on mobile, asserting local `overflow-x: auto` and no global page overflow. These changes are on **PR #35 and not yet verified by CI**; re-review the updated screenshots rather than relying on the earlier `cf36d28` images. No account, Settings, backend, Android or data-mutation code was touched.
