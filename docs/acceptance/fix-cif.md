# FIX-CIf — bounded NOTIF X SQL performance and study-day parity

Parent [FIX-CI #744](https://github.com/Mymayankyadav/lemma/pull/744), independent provenance [AUDIT #753](https://github.com/Mymayankyadav/lemma/issues/753). This is a **SQL-only** main-based extraction from the originally combined FIX-CIa #754, which now owns only the owner-approved CI timing policy.

## Acceptance
- [ ] Strict one-query, first-attempt **<150ms** at 60 projects, 2,400 checkpoints and 30,000 cards; no warm-up, retry, threshold increase or hidden fixture reduction.
- [ ] Preserve 20-project K2 diversity and four deterministic UTC-midnight/04:00 study-day boundaries, two-account owner isolation, service-role-only grants and undo parity.
- [ ] Ordered forward SQL migrations: `20261102052000_notify_candidates_ranked_reuse.sql`, then `20261102113500_notify_candidates_sort_memory.sql`; function-local 16MB `work_mem`, no global/session setting.
- [ ] Failure diagnostics use bounded plan-only EXPLAIN, never rerun the expensive query and never mask the original timing failure.
- [ ] Actual query-plan/root-cause optimization if needed: initial combined #754 first-attempt X was **164.1ms >150ms**, while parent #744 was 93.7ms with identical SQL. A passing repeat alone is not proof of robust headroom.
- [ ] All seven exact-head CI jobs and independent different-slot Auditor CLEAR; integrate owner-approved timing policy #754 after it merges, without force, before release.

Do not merge until the strict SQL first-attempt budget is robust and the full merge gate passes. #750's ordinary Review migration must be ordered after these two migrations.

Assisted-by: ChatGPT (OpenAI)
Co-authored-by: ChatGPT <noreply@openai.com>
