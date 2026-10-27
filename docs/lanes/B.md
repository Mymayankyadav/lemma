# Lane B — UI

Next action: after the S1 PR is merged with green CI, start UI-01 S2 (navigation labels Today / Cards / Settings and Today's single primary action in `main.js`/`view_home.js`). If S1 CI is red, fix `test/ui_screenshots.js` first.

| Field | Value |
| --- | --- |
| Status | S1 PR open, CI PENDING |
| Current task | UI-01 (slices S1–S4 in plan.md §2) |
| Open branch / PR | `lane-b/ui-01-s1-screenshots` (PR link added on open) |
| Last merged work | none yet in this lane |
| Not yours | `src/app/view_settings.js` (lane A until SYNC-04 is DONE). Sync/account behaviour. Supabase. |

**Evidence limits (S1):** `test/ui_screenshots.js` and `test:ui` (appended to `npm test`) were written but NOT RUN locally: this session's egress policy denies `registry.npmjs.org` (403), so `npm ci`, build and Chromium were unavailable. Only `node --check` and lane guard were run. CI on the PR is the first real execution; the next agent must read that result before S2.

**Requests from other lanes (to the owner / integration session):** `.github/workflows/test.yml` does not upload `test-output/`, so screenshots cannot be attached to PRs. Please add an `actions/upload-artifact` step for `test-output/ui/**` (always(), 7-day retention).
