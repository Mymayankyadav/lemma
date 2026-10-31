# QA-3a — Stress evidence report

This is the independently mergeable **reporting** half of QA-3 (stress acceptance). The final QA-3b acceptance gate runs after ST-4 and ST-6 merge. This report never substitutes for the per-element browser assertions or screenshot review.

Run `npx playwright test tests/e2e/stress.spec.ts` to produce the eight ST-0 matrix JSON files and screenshots. Then run `npx tsx scripts/qa3-report.ts` to write `test-results/qa3/stress-budget-report.md` (or pass a JSON source directory, output path and screenshot directory as its three arguments). The reporter exits nonzero for incomplete or failing budget evidence. Its output should be attached to the final QA-3b acceptance PR alongside screenshots. It validates the 144 expected screenshot filenames (presence, not visual correctness) and generates a Markdown report with complete profile/theme/width/route coverage, generic budget failures, and per-element budget status; it exits nonzero if the evidence is missing, malformed, or violates a hard budget. It does **not** change existing test thresholds.

## Acceptance

- [ ] Validate all eight S/X × graph/graph-night × 390/360 matrix files, every ST-0 route and 144 screenshots.
- [ ] Reject missing, duplicated, mismatched, malformed or stale-route evidence; verify the first render actually used 4× CPU throttling.
- [ ] Recompute hard-budget failures with the existing `stressViolations` implementation.
- [ ] Produce per-route and A–I per-element budget status with honest distinction from behavioral/screenshot acceptance.
- [ ] Unit tests cover a clean matrix, missing and duplicated routes, violations and invalid numbers.
- [ ] `npm ci && npm run check` and relevant browser tests green on the final head.

## Explicit limits of this split

- ST-0 only throttles the first (Today) route. Other screens' latency needs separate 4× acceptance tests before QA-3b can declare them fast.
- The A–I table reports **generic budgets**, not whether each element's behavior works. QA-3b must verify every specific A1–I3 acceptance case, inspect the screenshots, and record final PASS/FAIL.
- Source-commit freshness must be checked against the CI run/head SHA when collecting artifacts; the ST-0 JSON files do not carry a commit SHA.
