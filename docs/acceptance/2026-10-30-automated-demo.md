# QA-1 — Automated demo acceptance, 30 October 2026

**Scope:** the deployed-source `main` baseline at [`2c698a1`](https://github.com/Mymayankyadav/lemma/commit/2c698a172e411d988f702a5b4df22f37c6848ade), before the still-open UI-5d Atlas v2 PR #329. This is **automated demo-mode evidence**, not a claim of a manual browser-agent walkthrough or live owner-account acceptance.

**Evidence:** [CI run 41028045901](https://github.com/Mymayankyadav/lemma/actions/runs/41028045901) succeeded on this exact commit on 30 October 2026. Its `check` job ran `npm run check` and **93/93 Playwright tests passed**, including all three `acceptance-journey.spec.ts` scenarios. The DB-2/MCP-2 SQL job also passed. [Pages deployment 41028045827](https://github.com/Mymayankyadav/lemma/actions/runs/41028045827) succeeded on the same commit. [CI screenshots artifact](https://github.com/Mymayankyadav/lemma/actions/runs/41028045901/artifacts/12964662119) contains the captured demo screens; this report does not assert that those images were manually inspected.

| Check from `docs/spec/testing.md` §7 | Automated result | Evidence in `tests/e2e/acceptance-journey.spec.ts` |
| --- | --- | --- |
| 1. Today resume, due/proposals and project counts | PASS | Home heading, Compactness, 23 due, 6 proposals, Real Analysis 3/12 |
| 2. Proposal inbox opens with pending cards | PASS | Cards 5 and the question text |
| 3. Explicit approve and reject | PASS | Card count 5 → 4 → 3 only after clicks |
| 4. Plan amendment review | PASS | Finite subcover lemma, prerequisite diff and explicit approval |
| 5. Updated project path | PASS | CP4a appears after plan approval |
| 6. Historical session details | PASS | S7, 42 min, goal met, reasoning and misconception |
| 7. Deck filtering | PASS | Topology exclusion changes due count 23 → 20 |
| 8. Confidence, grade and undo | PASS | Sure reveals, Good grades, undo restores the card |
| 9. Tutor note | PASS | Search Heine, save and display note |
| 10. Atlas concepts and filters | PASS | 22 nodes, Revisit filter, Compactness detail |
| 11. Insights time range | PASS | 30-day values and changed 7-day values |
| 12. Settings connector and setup | PASS | Masked address, reveal and ChatGPT setup |
| 13. Mobile navigation and fit | PASS (automated subset) | Four main tab links and 390px horizontal-overflow guard; layout.spec.ts separately audits Euclid day/night tap targets and clipping |

**Additional post-Euclid acceptance in progress:** [QA-1 PR #333](https://github.com/Mymayankyadav/lemma/pull/333) adds a two-world cross-screen journey and explicit-approval count regression. Its latest-head CI and screenshots must pass before that PR can merge. The final Atlas-inclusive visual acceptance must be repeated after [UI-5d #329](https://github.com/Mymayankyadav/lemma/pull/329) merges.

**Not established by this report:** authenticated production owner recovery, actual Claude→ChatGPT handoff, signed-in data isolation, physical-device PWA installability, manual comparison of screenshot pixels to the Euclid boards, or final release-tag eligibility. These require their own evidence and must not be inferred from demo-mode CI.


## Post-Atlas final UI acceptance — 30 October 2026, 09:07 UTC

**Updated exact-main baseline:** [`02626ae`](https://github.com/Mymayankyadav/lemma/commit/02626aeeeb5b98cc04d0da4c0d9aa39807893e4a), which includes UI-5d Atlas v2 and all UI-5a–UI-5h screens. [CI #41030510506](https://github.com/Mymayankyadav/lemma/actions/runs/41030510506) **SUCCESS**: `npm run check`, **98/98 Playwright tests**, and the DB-2/MCP-2 SQL acceptance job. The three `acceptance-journey.spec.ts` scenarios covering checks 1–13 all passed on this exact commit. Atlas-specific tests additionally passed for Orbits, Branches, Outline, minimap navigation, subject/topic focus and Euclid-night narrow-phone layout. [GitHub Pages deployment #41030510505](https://github.com/Mymayankyadav/lemma/actions/runs/41030510505) **SUCCESS** on the same commit. [Main CI screenshots](https://github.com/Mymayankyadav/lemma/actions/runs/41030510506/artifacts/12965353516).

**Visual inspection:** The preceding exact-head Atlas PR screenshots ([artifact 12965157560](https://github.com/Mymayankyadav/lemma/actions/runs/41029837879/artifacts/12965157560)) were downloaded and examined: initial Orbits has non-overlapping subject rings, minimap panning moves the viewport, and Branches/Outline remain legible in the Euclid worlds. The topic-focus screenshot shows a conspicuous keyboard focus outline and a subject label partly behind the sticky filter row; this polish observation was recorded in [PR #329](https://github.com/Mymayankyadav/lemma/pull/329). The 98 passing automated checks do not replace manual design-board comparison.

**Final QA-1 integration extension:** [PR #334](https://github.com/Mymayankyadav/lemma/pull/334) additionally exercises the full Today → Atlas → Branches → Outline → concept → checkpoint route in both Euclid worlds. Its own latest-head CI is required before that test is considered verified.

**Release boundary:** These results establish the **automated demo-mode UI acceptance**, not authenticated owner/security recovery, physical-device installation, real cross-chat tutor continuity, or permission to publish a release tag. The independent [RELEASE-01 issue #107](https://github.com/Mymayankyadav/lemma/issues/107) retains its owner/security gates.
