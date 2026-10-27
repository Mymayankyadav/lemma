# Lane B — UI

Next action: UI-01 S3 — Cards screens (`view_browse.js`, `view_editor.js`, `sheets.js`): ≥44px tap targets, visible focus, local overflow for long display math, empty/loading/error states; do not touch editor save/durability logic.

| Field | Value |
| --- | --- |
| Status | S2 PR open, CI PENDING |
| Current task | UI-01 (slices S1–S4 in plan.md §2) |
| Open branch / PR | `lane-b/ui-01-s2-nav` |
| Last merged work | UI-01 S1 screenshot harness, PR #15 squash `449b473`; regression CI SUCCESS on the branch head before merge. |
| Not yours | `src/app/view_settings.js` (lane A until SYNC-04 is DONE). Sync/account behaviour. Supabase. |

**Requests from other lanes:** none.

**S2 decision:** nav labels are now Today / Cards / Stats / Settings. Stats stays a top-level tab until S4 moves it deeper, because e2e and `test/ui_screenshots.js` navigate to it; routes/hashes unchanged. Home already had a single primary action (Study button), left as is. NOT RUN locally (registry blocked); CI is the check. Screenshots not viewable (CI does not upload them, see request below).
