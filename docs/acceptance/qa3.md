# QA-3a — Stress evidence report

This is the independently mergeable **reporting** half of QA-3 (stress acceptance). The final QA-3b acceptance gate runs after ST-4 and ST-6 merge. This report never substitutes for the per-element browser assertions or screenshot review.

Run `npx tsx scripts/qa3-report.ts` after the ST-0 Playwright suite has produced all eight `test-results/stress/*.json` reports. It generates a Markdown report with complete profile/theme/width/route coverage, generic budget failures, and per-element budget status; it exits nonzero if the evidence is missing, malformed, or violates a hard budget. It does **not** change existing test thresholds.

## Acceptance

- [ ] Validate all eight S/X × graph/graph-night × 390/360 matrix files and every ST-0 route.
- [ ] Reject missing, duplicated, mismatched, malformed or stale evidence.
- [ ] Recompute hard-budget failures with the existing `stressViolations` implementation.
- [ ] Produce per-route and A–I per-element budget status with honest distinction from behavioral/screenshot acceptance.
- [ ] Unit tests cover a clean matrix, missing and duplicated routes, violations and invalid numbers.
- [ ] `npm ci && npm run check` and relevant browser tests green on the final head.
