# QA-3b — final stress acceptance (work in progress)

Source: [stress.md §3](../spec/stress.md), [QA-3a reporter](qa3.md), and the owner's decisions in [agent handbook §4](../agents/README.md).

**Status: INCOMPLETE.** This document is an evidence ledger, not a declaration that all stress budgets or behavioral contracts pass. Do not mark the task ready until every row below has reproducible evidence, the hard-budget gate is green on the exact head, and the Auditor has cleared the screenshots.

## Prerequisites

- [x] ST-0, ST-1, ST-2, ST-3, ST-5, ST-6 and ST-7 merged.
- [x] ST-4 #433 merged after exact-head green CI and Auditor CLEAR.
- [x] QA-3a #453 reporter merged (8 matrix files, 144 screenshot names, generic hard-budget summary).
- [ ] Audit #507 / PR #516 strict ST-0 gate merged and green on current main.
- [ ] Audit #462 / PR #480 project-level session fixture merged and green on current main.
- [ ] All open stress-related audit findings cleared or explicitly recorded as failures.

## Acceptance matrix

| Section | Scope | Hard budgets | Behavioral acceptance | Visual evidence | Status |
| --- | --- | --- | --- | --- | --- |
| A | Progress, stages, mini routes, Today | 360/390, S/X, both worlds | A1–A6 | Pending final screenshots | INCOMPLETE |
| B | Plan review, maps, stage jumps | Same | B1–B3 | Pending | INCOMPLETE |
| C | Atlas fold/links/virtualization | 4× CPU C2, 1,500 DOM, 8px marks | C1–C3 | Pending | INCOMPLETE |
| D | Cards, review, long maths | 4× CPU, 44px controls, 16px maths | D1–D7 | ST-4 #433 artifact #13037109553 | INCOMPLETE |
| E | Insights and live data | Today ≤3 API requests, Insights ≤1, ≤200kB | E1–E4 | Pending authenticated-network proof | INCOMPLETE |
| F | Paths, projects, sources | 1,500 DOM, 44px controls | F1–F3 | Pending | INCOMPLETE |
| G | Session history | 150/400-event fixture, 44px actions | G1–G3 | Pending #480 | INCOMPLETE |
| H | Tutor proposal batches | 44px controls, bounded DOM | H1–H3 | Pending | INCOMPLETE |
| I | Text, maths and long labels | ≥12px text, ≥16px maths, no clipped glyphs | I1–I3 | Pending | INCOMPLETE |

## Evidence and method

1. Run `npx playwright test tests/e2e/stress.spec.ts` on the final main-based head. This must produce the eight S/X × graph/graph-night × 360/390 JSON files and 144 PNG screenshots, each checked against the source SHA.
2. Run `npx tsx scripts/qa3-report.ts`; its generic budget report must say PASS, not merely that the screenshot inventory is complete. A demo zero-request result is **not** live API proof.
3. Run `npx tsx scripts/qa3-screens.ts` to validate the 144 PNG envelopes and exact viewport dimensions (1×/2×/3×). Inspect duplicate-image warnings. A structural PASS is not visual acceptance.
4. Independently exercise each A1–I3 behavioral acceptance in the relevant screen-specific Playwright suites. A green generic ST-0 baseline does not prove behavior.
5. Inspect every screenshot against the actual owner-approved v3/stress design (v4-look supersedes visual decisions where applicable); record PASS/FAIL per element, not just one overall statement.
6. Enforce strict budgets without exclusions unless the owner explicitly approves one: marks ≥8px, targets ≥44px, text ≥12px, maths ≥16px, no horizontal overflow, DOM <1,500, first render <1.5s at 4× CPU. Atlas C2 retains its stricter <1s gate.
7. Record any failure with route, profile, world, width, screenshot path, measured value and issue/PR. Do not claim QA-3b complete while a prerequisite or audit block remains.

## Independently inspected ST-4 evidence (31 Oct 2026)

[ST-4 exact-head CI #41187725047](https://github.com/Mymayankyadav/lemma/actions/runs/41187725047) and [screens artifact #13037109553](https://github.com/Mymayankyadav/lemma/actions/runs/41187725047/artifacts/13037109553) were downloaded and inspected. Twelve extreme screenshots (Cards list, long card face, Review hub × Graph/day/night × 360/390) showed the expected 4,000 due / 200 today / 3,800 overdue split, bounded visible card rows, readable internal card scrolling and sticky grading controls, without obvious horizontal clipping. This is supplemental visual inspection, not final A–I acceptance; the Auditor separately issued CLEAR on #433.


## Preliminary 144-screenshot structural check (not final acceptance)

The ST-4 #433 exact-head screens artifact #13037109553 contains all 144 ST-0 S/X × graph/graph-night × 360/390 screenshots. An independent ZIP/header/hash pass found 72 PNGs at 720×1480 and 72 at 780×1688 (all 2× expected viewport dimensions), valid PNG end markers and no duplicate image hashes within any 18-route matrix. This is **structural evidence only** from the ST-4 head, not proof that every screen is legible or that final-main QA-3b passes. The new `scripts/qa3-screens.ts` gate and its unit tests make this repeatable on the final head.

## Release decision

**INCOMPLETE** until the acceptance matrix has nine explicit PASS verdicts, all required hard budgets pass on exact-head CI, live E1 network evidence is recorded, screenshots are reviewed, and the Auditor clears the final PR.

Assisted-by: ChatGPT (OpenAI)
