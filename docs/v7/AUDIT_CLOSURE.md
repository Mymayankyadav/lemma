# Night critique v2: closure and acceptance record

Source: `NIGHT_CRITIQUE_v2.md`, reviewed against branch source after `656ea45`. This is an evidence index, not a replacement for the original audit. The baseline phone visual approval is in `GOLDEN_APPROVAL.md`.

## Owner decisions

On 11 Nov 2026 the Owner wrote: "Follow your recommendation and start working. First make sure everything in the audit is addressed." This accepts C5’s retrospective order waiver, the additive frontend forecast read, Capture’s reserved placement, and the plan to complete Part 11 before reviewing fresh desktop captures. No release/default-on approval was given.

## Finding-by-finding traceability

“Implemented” means the source contains the correction, backed by the indicated prior/new checks. Current browser execution is pending PR CI. The table does not equate code inspection with device or screen-reader acceptance.

| ID | Disposition | Implementation / evidence |
|---|---|---|
| C1 | Implemented; browser verification in CI | `tests/e2e/v7-scenes.ts`, `v7-screens.spec.ts`, `v7-golden.spec.ts` |
| C2 | Implemented; browser verification in CI | `tests/e2e/v7-scenes.ts`, `v7-screens.spec.ts`, `v7-golden.spec.ts` |
| C3 | Phone complete; final desktop capture remains Part 11 | `tests/e2e/v7-scenes.ts`, `v7-screens.spec.ts`, `v7-golden.spec.ts`; 1280 candidates are not final desktop approval |
| C4 | Implemented; browser verification in CI | `tests/e2e/v7-scenes.ts`, `v7-screens.spec.ts`, `v7-golden.spec.ts` |
| C5 | Owner waived the retrospective order | Owner instruction above; `PLAN.md` final amendment table |
| K1 | Implemented; browser verification in CI | `scripts/v7/check-kit.mjs`, `src/ui/v7/`, `KIT_10_PLAN.md` |
| K2 | Implemented; browser verification in CI | `scripts/v7/check-kit.mjs`, `src/ui/v7/`, `KIT_10_PLAN.md` |
| K3 | Implemented; browser verification in CI | `scripts/v7/check-kit.mjs`, `src/ui/v7/`, `KIT_10_PLAN.md` |
| K4 | Implemented; browser verification in CI | `PLAN.md` §4 replaced with kit authority; goals, breakpoints, star/suggestion rules and final amendments reconciled |
| K5 | Implemented; browser verification in CI | `scripts/v7/check-kit.mjs`, `src/ui/v7/`, `KIT_10_PLAN.md` |
| B1 | Implemented; browser verification in CI | `tests/unit/v7/night-critique.test.tsx`, `tests/e2e/v7-night-critique.spec.ts` |
| B2 | Implemented; browser verification in CI | `tests/unit/v7/night-critique.test.tsx`, `tests/e2e/v7-night-critique.spec.ts` |
| B3 | Implemented; browser verification in CI | `tests/unit/v7/night-critique.test.tsx`, `tests/e2e/v7-night-critique.spec.ts` |
| B4 | Implemented; browser verification in CI | `tests/unit/v7/night-critique.test.tsx`, `tests/e2e/v7-night-critique.spec.ts` |
| B5 | Implemented; browser verification in CI | `tests/unit/v7/night-critique.test.tsx`, `tests/e2e/v7-night-critique.spec.ts` |
| B6 | Implemented; browser verification in CI | `tests/unit/v7/night-critique.test.tsx`, `tests/e2e/v7-night-critique.spec.ts` |
| B7 | Implemented; browser verification in CI | `tests/unit/v7/night-critique.test.tsx`, `tests/e2e/v7-night-critique.spec.ts` |
| KC1 | Implemented; browser verification in CI | `src/ui/v7/`, `scripts/v7/check-kit.mjs`, `tests/e2e/v7-design-lint.spec.ts` |
| KC2 | Implemented; browser verification in CI | `src/ui/v7/`, `scripts/v7/check-kit.mjs`, `tests/e2e/v7-design-lint.spec.ts` |
| KC3 | Implemented; browser verification in CI | `src/ui/v7/`, `scripts/v7/check-kit.mjs`, `tests/e2e/v7-design-lint.spec.ts` |
| KC4 | Implemented; browser verification in CI | `src/data/path-review-forecast.ts`, live/demo adapters, `ReviewHubV7.tsx`, `Chart.tsx`; new data and browser regressions |
| KC5 | Implemented; browser verification in CI | `src/ui/v7/`, `scripts/v7/check-kit.mjs`, `tests/e2e/v7-design-lint.spec.ts` |
| KC6 | Implemented; browser verification in CI | `src/ui/v7/`, `scripts/v7/check-kit.mjs`, `tests/e2e/v7-design-lint.spec.ts` |
| KC7 | Implemented; browser verification in CI | `src/ui/v7/`, `scripts/v7/check-kit.mjs`, `tests/e2e/v7-design-lint.spec.ts` |
| KC8 | Implemented; browser verification in CI | `src/ui/v7/`, `scripts/v7/check-kit.mjs`, `tests/e2e/v7-design-lint.spec.ts` |
| KC9 | Implemented; browser verification in CI | `src/ui/v7/`, `scripts/v7/check-kit.mjs`, `tests/e2e/v7-design-lint.spec.ts` |
| KC10 | Implemented; browser verification in CI | `src/ui/v7/`, `scripts/v7/check-kit.mjs`, `tests/e2e/v7-design-lint.spec.ts` |
| KC11 | Implemented; browser verification in CI | `src/ui/v7/`, `scripts/v7/check-kit.mjs`, `tests/e2e/v7-design-lint.spec.ts` |
| KC12 | Implemented; browser verification in CI | `src/ui/v7/`, `scripts/v7/check-kit.mjs`, `tests/e2e/v7-design-lint.spec.ts` |
| KC13 | Implemented; browser verification in CI | `src/ui/v7/`, `scripts/v7/check-kit.mjs`, `tests/e2e/v7-design-lint.spec.ts` |
| KC14 | Implemented; browser verification in CI | `src/ui/v7/`, `scripts/v7/check-kit.mjs`, `tests/e2e/v7-design-lint.spec.ts` |
| KC15 | Implemented; browser verification in CI | `src/ui/v7/`, `scripts/v7/check-kit.mjs`, `tests/e2e/v7-design-lint.spec.ts` |
| KC16 | Implemented; browser verification in CI | `src/ui/v7/`, `scripts/v7/check-kit.mjs`, `tests/e2e/v7-design-lint.spec.ts` |
| KC17 | Implemented; browser verification in CI | `src/ui/v7/`, `scripts/v7/check-kit.mjs`, `tests/e2e/v7-design-lint.spec.ts` |
| KC18 | Implemented; browser verification in CI | `src/ui/v7/`, `scripts/v7/check-kit.mjs`, `tests/e2e/v7-design-lint.spec.ts` |
| KC19 | Implemented; browser verification in CI | `src/ui/v7/`, `scripts/v7/check-kit.mjs`, `tests/e2e/v7-design-lint.spec.ts` |
| KC20 | Implemented; browser verification in CI | `src/ui/v7/`, `scripts/v7/check-kit.mjs`, `tests/e2e/v7-design-lint.spec.ts` |
| KC21 | Implemented; browser verification in CI | `src/ui/v7/`, `scripts/v7/check-kit.mjs`, `tests/e2e/v7-design-lint.spec.ts` |
| KC22 | Implemented; browser verification in CI | `src/ui/v7/`, `scripts/v7/check-kit.mjs`, `tests/e2e/v7-design-lint.spec.ts` |
| KC23 | Implemented; browser verification in CI | `src/ui/v7/`, `scripts/v7/check-kit.mjs`, `tests/e2e/v7-design-lint.spec.ts` |
| SH1 | Implemented; browser verification in CI | `src/app/v7/V7Shell.tsx`, `shell.css` |
| SH2 | Implemented; browser verification in CI | Reserved dock Capture slot in `V7Shell.tsx`/`shell.css`; overlap geometry at 320/360/390 in `v7-audit-acceptance.spec.ts` |
| SH3 | Implemented; browser verification in CI | `src/app/v7/V7Shell.tsx`, `shell.css` |
| SH4 | Implemented; browser verification in CI | `src/app/v7/V7Shell.tsx`, `shell.css` |
| TD1 | Implemented; browser verification in CI | `src/features/home/v7/`, `v7-night-critique.spec.ts`, approved Today phone PNGs |
| TD2 | Implemented; browser verification in CI | `src/features/home/v7/`, `v7-night-critique.spec.ts`, approved Today phone PNGs |
| TD3 | Implemented; browser verification in CI | `src/features/home/v7/`, `v7-night-critique.spec.ts`, approved Today phone PNGs |
| TD4 | Implemented; browser verification in CI | `src/features/home/v7/`, `v7-night-critique.spec.ts`, approved Today phone PNGs |
| TD5 | Implemented; browser verification in CI | `src/features/home/v7/`, `v7-night-critique.spec.ts`, approved Today phone PNGs |
| TD6 | Implemented; browser verification in CI | `src/features/home/v7/`, `v7-night-critique.spec.ts`, approved Today phone PNGs |
| TD7 | Implemented; browser verification in CI | `src/features/home/v7/`, `v7-night-critique.spec.ts`, approved Today phone PNGs |
| TD8 | Implemented; browser verification in CI | `src/features/home/v7/`, `v7-night-critique.spec.ts`, approved Today phone PNGs |
| TD9 | Implemented; browser verification in CI | `src/features/home/v7/`, `v7-night-critique.spec.ts`, approved Today phone PNGs |
| FO1 | Implemented; browser verification in CI | `src/features/focus/v7/`, `src/app/v7/focus.ts`, `v7-audit-acceptance.spec.ts`, approved Focus PNGs |
| FO2 | Implemented; browser verification in CI | `src/features/focus/v7/`, `src/app/v7/focus.ts`, `v7-audit-acceptance.spec.ts`, approved Focus PNGs |
| FO3 | Implemented; browser verification in CI | `src/features/focus/v7/`, `src/app/v7/focus.ts`, `v7-audit-acceptance.spec.ts`, approved Focus PNGs |
| FO4 | Implemented; browser verification in CI | `src/features/focus/v7/`, `src/app/v7/focus.ts`, `v7-audit-acceptance.spec.ts`, approved Focus PNGs |
| FO5 | Implemented; browser verification in CI | `src/features/focus/v7/`, `src/app/v7/focus.ts`, `v7-audit-acceptance.spec.ts`, approved Focus PNGs |
| RV1 | Implemented; browser verification in CI | `src/features/review/v7/`, `v7-part6.spec.ts`, `v7-audit-acceptance.spec.ts` |
| RV2 | Implemented; browser verification in CI | `src/features/review/v7/`, `v7-part6.spec.ts`, `v7-audit-acceptance.spec.ts` |
| RV3 | Implemented; browser verification in CI | `src/features/review/v7/`, `v7-part6.spec.ts`, `v7-audit-acceptance.spec.ts` |
| RV4 | Implemented; browser verification in CI | `src/features/review/v7/`, `v7-part6.spec.ts`, `v7-audit-acceptance.spec.ts` |
| RV5 | Implemented; browser verification in CI | `src/features/review/v7/`, `v7-part6.spec.ts`, `v7-audit-acceptance.spec.ts` |
| RV6 | Implemented; browser verification in CI | `src/features/review/v7/`, `v7-part6.spec.ts`, `v7-audit-acceptance.spec.ts` |
| PR1 | Implemented; browser verification in CI | `src/features/practice/v7/`, `v7-part6.spec.ts`, rendered design lint |
| PR2 | Implemented; browser verification in CI | `src/features/practice/v7/`, `v7-part6.spec.ts`, rendered design lint |
| PR3 | Implemented; browser verification in CI | `src/features/practice/v7/`, `v7-part6.spec.ts`, rendered design lint |
| PR4 | Implemented; browser verification in CI | `src/features/practice/v7/`, `v7-part6.spec.ts`, rendered design lint |
| PR5 | Implemented; browser verification in CI | `src/features/practice/v7/`, `v7-part6.spec.ts`, rendered design lint |
| CD1 | Implemented; browser verification in CI | `src/features/calendar/v7/`, `v7-night-critique.spec.ts`, approved Calendar phone PNGs |
| CD2 | Implemented; browser verification in CI | `src/features/calendar/v7/`, `v7-night-critique.spec.ts`, approved Calendar phone PNGs |
| CD3 | Implemented; browser verification in CI | `src/features/calendar/v7/`, `v7-night-critique.spec.ts`, approved Calendar phone PNGs |
| CD4 | Implemented; browser verification in CI | `src/features/calendar/v7/`, `v7-night-critique.spec.ts`, approved Calendar phone PNGs |
| CD5 | Implemented; browser verification in CI | `src/features/calendar/v7/`, `v7-night-critique.spec.ts`, approved Calendar phone PNGs |
| CD6 | Implemented; browser verification in CI | `src/features/calendar/v7/`, `v7-night-critique.spec.ts`, approved Calendar phone PNGs |
| CW1 | Implemented; browser verification in CI | `src/features/calendar/v7/WeekGrid.tsx`, `calendar.css`, `v7-part6.spec.ts` |
| CW2 | Implemented; browser verification in CI | `src/features/calendar/v7/WeekGrid.tsx`, `calendar.css`, `v7-part6.spec.ts` |
| CW3 | Implemented; browser verification in CI | `src/features/calendar/v7/WeekGrid.tsx`, `calendar.css`, `v7-part6.spec.ts` |
| CM1 | Implemented; browser verification in CI | `src/features/calendar/v7/MonthGrid.tsx`, `viewModel.ts`, `v7-part6.spec.ts` |
| CM2 | Implemented; browser verification in CI | `src/features/calendar/v7/MonthGrid.tsx`, `viewModel.ts`, `v7-part6.spec.ts` |
| CM3 | Implemented; browser verification in CI | `src/features/calendar/v7/MonthGrid.tsx`, `viewModel.ts`, `v7-part6.spec.ts` |
| CM4 | Implemented; browser verification in CI | `src/features/calendar/v7/MonthGrid.tsx`, `viewModel.ts`, `v7-part6.spec.ts` |
| CM5 | Implemented; browser verification in CI | `src/features/calendar/v7/MonthGrid.tsx`, `viewModel.ts`, `v7-part6.spec.ts` |
| CA1 | Implemented; browser verification in CI | `src/features/calendar/v7/AgendaList.tsx`, `viewModel.ts`, `v7-part6.spec.ts` |
| CA2 | Implemented; browser verification in CI | `src/features/calendar/v7/AgendaList.tsx`, `viewModel.ts`, `v7-part6.spec.ts` |
| CA3 | Implemented; browser verification in CI | `src/features/calendar/v7/AgendaList.tsx`, `viewModel.ts`, `v7-part6.spec.ts` |
| CA4 | Implemented; browser verification in CI | `src/features/calendar/v7/AgendaList.tsx`, `viewModel.ts`, `v7-part6.spec.ts` |
| CA5 | Implemented; browser verification in CI | `src/features/calendar/v7/AgendaList.tsx`, `viewModel.ts`, `v7-part6.spec.ts` |
| BS1 | Implemented; browser verification in CI | `src/features/calendar/block-sheet/BlockSheet.tsx`, kit controls, `v7-audit-acceptance.spec.ts` |
| BS2 | Implemented; browser verification in CI | `src/features/calendar/block-sheet/BlockSheet.tsx`, kit controls, `v7-audit-acceptance.spec.ts` |
| BS3 | Implemented; browser verification in CI | `src/features/calendar/block-sheet/BlockSheet.tsx`, kit controls, `v7-audit-acceptance.spec.ts` |
| BS4 | Implemented; browser verification in CI | `src/features/calendar/block-sheet/BlockSheet.tsx`, kit controls, `v7-audit-acceptance.spec.ts` |
| QA1 | Implemented; browser verification in CI | `src/features/calendar/v7/QuickAddSheet.tsx`, `DayGrid.tsx`, `v7-part6.spec.ts`, `v7-audit-acceptance.spec.ts` |
| QA2 | Implemented; browser verification in CI | `src/features/calendar/v7/QuickAddSheet.tsx`, `DayGrid.tsx`, `v7-part6.spec.ts`, `v7-audit-acceptance.spec.ts` |
| QA3 | Implemented; browser verification in CI | `src/features/calendar/v7/QuickAddSheet.tsx`, `DayGrid.tsx`, `v7-part6.spec.ts`, `v7-audit-acceptance.spec.ts` |
| QA4 | Implemented; browser verification in CI | `src/features/calendar/v7/QuickAddSheet.tsx`, `DayGrid.tsx`, `v7-part6.spec.ts`, `v7-audit-acceptance.spec.ts` |
| QA5 | Implemented; browser verification in CI | `src/features/calendar/v7/QuickAddSheet.tsx`, `DayGrid.tsx`, `v7-part6.spec.ts`, `v7-audit-acceptance.spec.ts` |
| PL1 | Implemented; browser verification in CI | `src/features/planner/V7PlannerSheet.tsx`, `night-critique.test.tsx`, `v7-night-critique.spec.ts` |
| PL2 | Implemented; browser verification in CI | `src/features/planner/V7PlannerSheet.tsx`, `night-critique.test.tsx`, `v7-night-critique.spec.ts` |
| TK1 | Implemented; browser verification in CI | `src/features/tasks/v7/`, shared overdue summary, `v7-night-critique.spec.ts`, `audit-acceptance.test.ts` |
| TK2 | Implemented; browser verification in CI | `src/features/tasks/v7/`, shared overdue summary, `v7-night-critique.spec.ts`, `audit-acceptance.test.ts` |
| TK3 | Implemented; browser verification in CI | `src/features/tasks/v7/`, shared overdue summary, `v7-night-critique.spec.ts`, `audit-acceptance.test.ts` |
| TK4 | Implemented; browser verification in CI | `src/features/tasks/v7/`, shared overdue summary, `v7-night-critique.spec.ts`, `audit-acceptance.test.ts` |
| CP1 | Implemented; browser verification in CI | `src/app/v7/CaptureSheet.tsx`, `captureModel.ts`, `v7-part6.spec.ts` |
| CP2 | Implemented; browser verification in CI | `src/app/v7/CaptureSheet.tsx`, `captureModel.ts`, `v7-part6.spec.ts` |
| CP3 | Implemented; browser verification in CI | `src/app/v7/CaptureSheet.tsx`, `captureModel.ts`, `v7-part6.spec.ts` |
| CP4 | Implemented; browser verification in CI | `src/app/v7/CaptureSheet.tsx`, `captureModel.ts`, `v7-part6.spec.ts` |
| SE1 | Implemented; browser verification in CI | `src/app/v7/SearchSheet.tsx`, `searchModel.ts`, `v7-part6.spec.ts` |
| SE2 | Implemented; browser verification in CI | `src/app/v7/SearchSheet.tsx`, `searchModel.ts`, `v7-part6.spec.ts` |
| SE3 | Implemented; browser verification in CI | `src/app/v7/SearchSheet.tsx`, `searchModel.ts`, `v7-part6.spec.ts` |
| SE4 | Implemented; browser verification in CI | `src/app/v7/SearchSheet.tsx`, `searchModel.ts`, `v7-part6.spec.ts` |
| CL1 | Implemented; browser verification in CI | `src/features/ritual/v7/`, `audit-acceptance.test.ts`, `v7-audit-acceptance.spec.ts` |
| CL2 | Implemented; browser verification in CI | `src/features/ritual/v7/`, `audit-acceptance.test.ts`, `v7-audit-acceptance.spec.ts` |
| CL3 | Implemented; browser verification in CI | `src/features/ritual/v7/`, `audit-acceptance.test.ts`, `v7-audit-acceptance.spec.ts` |
| CL4 | Implemented; browser verification in CI | `src/features/ritual/v7/`, `audit-acceptance.test.ts`, `v7-audit-acceptance.spec.ts` |
| CL5 | Implemented; browser verification in CI | `src/features/ritual/v7/`, `audit-acceptance.test.ts`, `v7-audit-acceptance.spec.ts` |
| CL6 | Implemented; browser verification in CI | `src/features/ritual/v7/`, `audit-acceptance.test.ts`, `v7-audit-acceptance.spec.ts` |
| CL7 | Implemented; browser verification in CI | `src/features/ritual/v7/`, `audit-acceptance.test.ts`, `v7-audit-acceptance.spec.ts` |
| AT1 | Implemented; browser verification in CI | `src/features/atlas/v7/`, `v7-atlas.spec.ts`, approved Atlas phone PNGs |
| AT2 | Implemented; browser verification in CI | `src/features/atlas/v7/`, `v7-atlas.spec.ts`, approved Atlas phone PNGs |
| AT3 | Implemented; browser verification in CI | `src/features/atlas/v7/`, `v7-atlas.spec.ts`, approved Atlas phone PNGs |
| AT4 | Implemented; browser verification in CI | `src/features/atlas/v7/`, `v7-atlas.spec.ts`, approved Atlas phone PNGs |
| AT5 | Implemented; browser verification in CI | `src/features/atlas/v7/`, `v7-atlas.spec.ts`, approved Atlas phone PNGs |
| KA1 | Implemented; browser verification in CI | `src/ui/v7/`, `src/features/kit/ShellPanel.tsx`, `KIT_10_PLAN.md`, static kit check |
| KA2 | Implemented; browser verification in CI | `src/ui/v7/`, `src/features/kit/ShellPanel.tsx`, `KIT_10_PLAN.md`, static kit check |
| KA3 | Implemented; browser verification in CI | `src/ui/v7/`, `src/features/kit/ShellPanel.tsx`, `KIT_10_PLAN.md`, static kit check |
| KA4 | Implemented; browser verification in CI | `src/ui/v7/`, `src/features/kit/ShellPanel.tsx`, `KIT_10_PLAN.md`, static kit check |
| KA5 | Implemented; browser verification in CI | `src/ui/v7/`, `src/features/kit/ShellPanel.tsx`, `KIT_10_PLAN.md`, static kit check |
| KA6 | Implemented; browser verification in CI | `src/ui/v7/`, `src/features/kit/ShellPanel.tsx`, `KIT_10_PLAN.md`, static kit check |
| KA7 | Implemented; browser verification in CI | `src/ui/v7/`, `src/features/kit/ShellPanel.tsx`, `KIT_10_PLAN.md`, static kit check |
| KA8 | Implemented; browser verification in CI | `src/ui/v7/`, `src/features/kit/ShellPanel.tsx`, `KIT_10_PLAN.md`, static kit check |
| PA0 | Implemented; browser verification in CI | `PLAN.md` §4 replaced with kit authority; goals, breakpoints, star/suggestion rules and final amendments reconciled |
| PA1 | Implemented; browser verification in CI | `PLAN.md` §4 and final amendment table, rendered design lint and acceptance suites |
| PA2 | Implemented; browser verification in CI | Reserved dock Capture slot in `V7Shell.tsx`/`shell.css`; overlap geometry at 320/360/390 in `v7-audit-acceptance.spec.ts` |
| PA3 | Implemented; browser verification in CI | `PLAN.md` §4 and final amendment table, rendered design lint and acceptance suites |
| PA4 | Implemented; browser verification in CI | `PLAN.md` §4 and final amendment table, rendered design lint and acceptance suites |
| PA5 | Implemented; browser verification in CI | `PLAN.md` §4 and final amendment table, rendered design lint and acceptance suites |
| PA6 | Implemented; browser verification in CI | `PLAN.md` §4 and final amendment table, rendered design lint and acceptance suites |
| PA7 | Implemented; browser verification in CI | `PLAN.md` §4 and final amendment table, rendered design lint and acceptance suites |
| PA8 | Implemented; browser verification in CI | `PLAN.md` §4 and final amendment table, rendered design lint and acceptance suites |
| PA9 | Implemented; browser verification in CI | `PLAN.md` §4 and final amendment table, rendered design lint and acceptance suites |
| PA10 | Implemented; browser verification in CI | `PLAN.md` §4 and final amendment table, rendered design lint and acceptance suites |
| PA11 | Implemented; browser verification in CI | `PLAN.md` §4 and final amendment table, rendered design lint and acceptance suites |

## Amended Done-when lists

| Section | Acceptance and evidence |
|---|---|
| 6.1 Shell | Main navigation keeps five links; Capture parser/save and Search groups/Enter: existing Part 6 suite. New dock geometry covers three hubs at 320/360/390 in both themes. 200% text and physical assistive-technology acceptance remain hardening checks. |
| 6.2 Today | Hero states and one-tap start use `todayModel.ts` and the study API; existing Part 6 journey tests cover quick focus and needs. New source correction makes Quick focus available in every state. Final geometry/DOM checks run in the acceptance suite. |
| 6.3 Focus | One shared clock/state selector is used by all three surfaces. The new browser acceptance covers reload/ring, Pause, Break, matching session words, Enter-to-park, reduced motion and bottom controls. |
| 6.4 Review | New browser acceptance attempts all 23 seeded cards with keys and with swipes; checks Undo removes its segment. The subject split now sums the actual selected/quota-limited batch. Forecast tests cover fourteen days, owner scope, pagination, siblings, DST and failure instead of partial results. |
| 6.5 Calendar | Existing critique checks assert the Day grid starts above 45% and shows four hours. Existing Part 4/6/grid/rollback suites cover titles, week text, month zeros, quarter-hour entry, moves/resize and Undo. New acceptance checks block-title focus and draft visibility above quick-add. |
| 6.6 Tasks | Overdue remains the first group; task and global counts are explicitly distinguished. Drag, arrow keys and menu share persisted integer positions. Existing completion/swipe/Undo coverage remains. |
| 6.7 Close the day | New unit and browser checks verify a no-plan day persists a closure and aim, survives adapter recreation/reload, recovers from an interrupted preview, rejects future days and preserves wall times across DST. Existing loose-end operations use the same APIs. |
| 6.9 Path map | Existing `calendar-path.test.ts` and Part 4 browser suite cover marks/text, line reach, matching header meter and sticky action. Checkpoint/Session restyling belongs to Part 8; this audit targets the Path golden screen. |
| 6.12 Atlas | Existing Atlas unit/browser suites assert 82 stars, three clusters, nine demonstrated, Compactness counts/navigation, seven “comp” results and selection retained in Map/List. Panning frame-rate measurement remains Part 12. |

## Scorecards and limitations

The static kit checker passes all four token modes, CVD separation, aliases and generated-file currency. New browser cases exercise the six goldens in Day/Night high-contrast modes and retain screenshots as test attachments; names and geometry are checked. Existing kit tests cover component states, keyboard charts and reduced motion. These do not establish physical screen-reader, touch/haptic hardware or frame-rate results.

Local full unit baseline after the initial closure fixes: 374 files / 2,089 tests passed. Typecheck, repository lint, static kit check, production build and PWA checks passed. Browser attempts failed before page execution because the command sandbox disallows Chromium’s Unix socket; the shared browser could not reach the isolated localhost. PR CI is the browser execution authority for this pass.

Desktop layouts/captures (Part 11), 200% text, real-device and screen-reader checks, performance budget/measurements, final changed-candidate review and independent full-PR review remain separate acceptance. The PR is not Ready and `v7Shell` remains off.

## Continuation from deee0fcc · 11 Nov 2026

The local production-build reproduction completed with **35 passes and 7 failures** in `v7-night-critique`, `v7-audit-acceptance` and `v7-responsive`. Those failures were investigated before further feature work:

| Failure | Finding and correction | Verification status |
|---|---|---|
| Focus Pause / state agreement | The frozen audit clock never elapsed time between starting and closing a study interval. The test now advances that clock before Pause and Break, preserving the positive-duration API contract and all state/ring assertions. | Corrected run pending CI |
| Block-title / quick-add case | Title focus passed; navigating from the full block form to quick-add retained the old URL-opened modal. `BlockSheetActions` now releases it when the URL request disappears. The test additionally requires exactly one open dialog. | Corrected run pending CI |
| Unplanned closure | The second `goto` targeted the same hash, preserving completion state and its return timer. The test now performs the actual reload named in its acceptance criterion and still requires the saved aim and disabled closed-day action. | Corrected run pending CI |
| Task ordering | The post-reload synchronous row read ran before tasks loaded (both IDs had index −1). The test now waits for both persisted rows before asserting their order, in both directions. | Corrected run pending CI |
| Today at 1280, Day and Night | The lazy-loaded DayGrid had no calendar stylesheet on a cold Today entry; its unstyled gutter created 1661 px document width. DayGrid now imports its own stylesheet. No overflow assertion or layout threshold changed. | Corrected run pending CI |
| Desktop keys | Search opened and focused correctly, but the test requested a textbox instead of the existing accessible combobox. The locator now uses the actual role. | Corrected run pending CI |
| CI unit contract | At deee0fcc, PR-gate unit tests had 2066 passes / 1 failure: the sharding contract still required the former inline install command. It now requires the wrapper and its standard host validation, pinned metadata, official endpoint and fail-closed checks; shard/no-filter assertions remain. | Corrected run pending CI |

The exact official fallback was executed locally and installed both browser binaries at Playwright revision 1243, Chrome for Testing **153.0.8010.12**. The initial CI install jobs remained in progress for more than twelve minutes; the wrapper now bounds each standard download attempt at three minutes before fallback/failure. The gallery workflow also explicitly exercises `--official-fallback` after host setup. No browser, test, retry count, assertion threshold or test coverage was relaxed.

The local execution environment disconnected after reproduction and before the corrected runs finished. Its incomplete full-unit run is not a pass. Current-head CI is required to establish the corrected results. The capture workflow now also runs after evidence-record changes, so its manifest can identify the final source commit. It writes candidates to artifacts, preserving `docs/v7/golden/` unchanged.

**Still open:** corrected browser and complete regression evidence; final-commit captures and their visual review; separate Owner desktop approval; the remaining Part 11 layouts/keys; 200% text, physical devices and assistive technology; performance and final release gates. Do not infer closure of these items from source corrections. `v7Shell` stays off; no Ready or merge.
