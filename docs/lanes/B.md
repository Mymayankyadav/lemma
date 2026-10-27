# Lane B — UI

Next action: UI-01 S4 — Review and Stats (`view_review.js`, `view_stats.js`, `charts.js`): reduced motion, keep keyboard shortcuts unchanged, put advanced FSRS/stat controls behind progressive disclosure, move Stats off the top-level nav (update `test/ui_screenshots.js` and e2e navigation accordingly), then the full UI-01 gate.

| Field | Value |
| --- | --- |
| Status | S3 PR open, CI PENDING |
| Current task | UI-01 (slices S1–S4 in plan.md §2) |
| Open branch / PR | `lane-b/ui-01-s3-cards` |
| Last merged work | UI-01 S1 screenshot harness, PR #15 squash `449b473`; regression CI SUCCESS on the branch head before merge. |
| Not yours | `src/app/view_settings.js` (lane A until SYNC-04 is DONE). Sync/account behaviour. Supabase. |

**Requests from other lanes:** none.

**S2 decision:** nav labels are now Today / Cards / Stats / Settings. Stats stays a top-level tab until S4 moves it deeper, because e2e and `test/ui_screenshots.js` navigate to it; routes/hashes unchanged. Home already had a single primary action (Study button), left as is. NOT RUN locally (registry blocked); CI is the check. Screenshots not viewable (CI does not upload them, see request below).

**S3 decision:** focus rings, local scrolling of display math (`.prose .katex-display`) and Cards empty states ('No cards yet' / 'No cards match') already existed, so S3 only adds a `@media (pointer: coarse)` block at the end of `app.css` raising buttons, icon buttons, segmented controls and chip-remove buttons to ≥44px. Desktop unchanged. Loading/error states for Cards are not added: the view reads the in-memory Model synchronously, so no loading state exists. NOT RUN locally; screenshots not yet reviewed.
