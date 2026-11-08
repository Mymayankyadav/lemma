## Owner fixes 2026-11-08 morning (incident #1149 freeze, bugs #1156, #1166, #1168)

- **Overnight S0 freeze:** #1158 fixed incident #1149 at 23:14 IST, but the issue stayed open, so its S0 label froze every other merge until 07:10 IST. The issue was closed after confirming the merged fix. CI v2.8: when CI merges a `bug #<n>` or `incident #<n>` PR, `scripts/ci/approve.mjs` closes issue #<n>.
- **#1156:** N95 may add one read-only `security definer` owner export function that lists the `lemma_undo_tables` names and returns only the caller's rows of one registered table per call, in bounded keyset pages. It needs a review.
- **#1166:** N79 may make the Calendar read the saved week start and time format, in `Page.tsx`, `WeekView.tsx` and `MonthView.tsx` only.
- **#1168:** N70's Start uses the block's existing subject/project/checkpoint links. An exact calendar-block link on the study entry is the new item N106.
