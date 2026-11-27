# Performance calibration

Written only by the `calibrate` workflow. Run 45989869539 on `49430ed2` (main, unchanged), 2026-11-27, N=10 repetitions per check.
A check whose pass rate is below 95% is **quarantined**; the priority run decides about budgets, agents never do.

63 checks, 0 quarantined.

| Check | Kind | Runs | Pass rate | Median ms | p10–p90 ms | Status |
|---|---|---|---|---|---|---|
| `audit-441-atlas-budget.spec.ts` AUDIT #441 extreme Atlas opens within 2s at 4x CPU, graph 360px | e2e | 10 | 100% | 1344 | 1285–1380 | ok |
| `audit-441-atlas-budget.spec.ts` AUDIT #441 extreme Atlas opens within 2s at 4x CPU, graph 390px | e2e | 10 | 100% | 1473 | 1416–1518 | ok |
| `audit-441-atlas-budget.spec.ts` AUDIT #441 extreme Atlas opens within 2s at 4x CPU, graph-night 360px | e2e | 10 | 100% | 1321 | 1283–1382 | ok |
| `audit-441-atlas-budget.spec.ts` AUDIT #441 extreme Atlas opens within 2s at 4x CPU, graph-night 390px | e2e | 10 | 100% | 1364 | 1301–1464 | ok |
| `fix-659-new-project.spec.ts` FIX #659 cold New project sheet and real Paths on close: extreme graph 360 | e2e | 10 | 100% | 3350 | 3287–3464 | ok |
| `fix-659-new-project.spec.ts` FIX #659 cold New project sheet and real Paths on close: extreme graph 390 | e2e | 10 | 100% | 3438 | 3347–3800 | ok |
| `fix-659-new-project.spec.ts` FIX #659 cold New project sheet and real Paths on close: extreme graph-night 360 | e2e | 10 | 100% | 3404 | 3276–3750 | ok |
| `fix-659-new-project.spec.ts` FIX #659 cold New project sheet and real Paths on close: extreme graph-night 390 | e2e | 10 | 100% | 3364 | 3342–3751 | ok |
| `fix-659-new-project.spec.ts` FIX #659 cold New project sheet and real Paths on close: stress graph 360 | e2e | 10 | 100% | 3553 | 3501–3574 | ok |
| `fix-659-new-project.spec.ts` FIX #659 cold New project sheet and real Paths on close: stress graph 390 | e2e | 10 | 100% | 3349 | 3168–3458 | ok |
| `fix-659-new-project.spec.ts` FIX #659 cold New project sheet and real Paths on close: stress graph-night 360 | e2e | 10 | 100% | 3274 | 3079–3420 | ok |
| `fix-659-new-project.spec.ts` FIX #659 cold New project sheet and real Paths on close: stress graph-night 390 | e2e | 10 | 100% | 3429 | 3268–3471 | ok |
| `fix-659-new-project.spec.ts` FIX #659 deferred maths preview still renders on input | e2e | 10 | 100% | 1343 | 1311–1366 | ok |
| `fix-659-new-project.spec.ts` FIX #659 lazy Paths backdrop never duplicates its heading during hydration | e2e | 10 | 100% | 1686 | 1657–1702 | ok |
| `st-4.spec.ts` D6 strict first-attempt 4x CPU budget › ST-4 extreme cards open under 2s at 4x CPU: graph 360 | e2e | 10 | 100% | 1730 | 1722–1776 | ok |
| `st-4.spec.ts` D6 strict first-attempt 4x CPU budget › ST-4 extreme cards open under 2s at 4x CPU: graph 390 | e2e | 10 | 100% | 1813 | 1753–1849 | ok |
| `st-4.spec.ts` D6 strict first-attempt 4x CPU budget › ST-4 extreme cards open under 2s at 4x CPU: graph-night 360 | e2e | 10 | 100% | 1766 | 1750–1768 | ok |
| `st-4.spec.ts` D6 strict first-attempt 4x CPU budget › ST-4 extreme cards open under 2s at 4x CPU: graph-night 390 | e2e | 10 | 100% | 1798 | 1777–1837 | ok |
| `st-4.spec.ts` ST-4 bounded review and card library: extreme graph 360 | e2e | 10 | 100% | 2560 | 2513–2599 | ok |
| `st-4.spec.ts` ST-4 bounded review and card library: extreme graph 390 | e2e | 10 | 100% | 2643 | 2585–2692 | ok |
| `st-4.spec.ts` ST-4 bounded review and card library: extreme graph-night 360 | e2e | 10 | 100% | 2609 | 2554–2622 | ok |
| `st-4.spec.ts` ST-4 bounded review and card library: extreme graph-night 390 | e2e | 10 | 100% | 2642 | 2583–2700 | ok |
| `st-4.spec.ts` ST-4 bounded review and card library: stress graph 360 | e2e | 10 | 100% | 2068 | 2028–2121 | ok |
| `st-4.spec.ts` ST-4 bounded review and card library: stress graph 390 | e2e | 10 | 100% | 2303 | 2263–2320 | ok |
| `st-4.spec.ts` ST-4 bounded review and card library: stress graph-night 360 | e2e | 10 | 100% | 2091 | 2042–2126 | ok |
| `st-4.spec.ts` ST-4 bounded review and card library: stress graph-night 390 | e2e | 10 | 100% | 2147 | 2114–2215 | ok |
| `st-4.spec.ts` ST-4 long aligned and matrix maths expand without horizontal page overflow | e2e | 10 | 100% | 1950 | 1929–1976 | ok |
| `st-4.spec.ts` ST-4 virtual card rows typeset fraction and inline maths: graph 360 | e2e | 10 | 100% | 2450 | 2417–2493 | ok |
| `st-4.spec.ts` ST-4 virtual card rows typeset fraction and inline maths: graph 390 | e2e | 10 | 100% | 2472 | 2454–2493 | ok |
| `st-4.spec.ts` ST-4 virtual card rows typeset fraction and inline maths: graph-night 360 | e2e | 10 | 100% | 2445 | 2431–2471 | ok |
| `st-4.spec.ts` ST-4 virtual card rows typeset fraction and inline maths: graph-night 390 | e2e | 10 | 100% | 2510 | 2441–2530 | ok |
| `stress.spec.ts` ST-0 all-route baseline: extreme, graph-night, 360px | e2e | 10 | 100% | 8570 | 8515–8635 | ok |
| `stress.spec.ts` ST-0 all-route baseline: extreme, graph-night, 390px | e2e | 10 | 100% | 8744 | 8685–8808 | ok |
| `stress.spec.ts` ST-0 all-route baseline: extreme, graph, 360px | e2e | 10 | 100% | 8476 | 8368–8529 | ok |
| `stress.spec.ts` ST-0 all-route baseline: extreme, graph, 390px | e2e | 10 | 100% | 8683 | 8606–8747 | ok |
| `stress.spec.ts` ST-0 all-route baseline: stress, graph-night, 360px | e2e | 10 | 100% | 7756 | 7701–7818 | ok |
| `stress.spec.ts` ST-0 all-route baseline: stress, graph-night, 390px | e2e | 10 | 100% | 7958 | 7928–8008 | ok |
| `stress.spec.ts` ST-0 all-route baseline: stress, graph, 360px | e2e | 10 | 100% | 7780 | 7712–7832 | ok |
| `stress.spec.ts` ST-0 all-route baseline: stress, graph, 390px | e2e | 10 | 100% | 8034 | 8007–8146 | ok |
| `stress.spec.ts` ST-0 counts small informative text but not KaTeX internal script glyphs | e2e | 10 | 100% | 170 | 160–174 | ok |
| `tests/mcp/notif1b-stress.mjs` notif1b-stress.mjs | sql | 10 | 100% | 6224 | 6112–6320 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > builds Atlas from virtual stress ideas and links without allocating unlinked cards | unit | 10 | 100% | 53 | 50–57 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > builds the deck tree without recomputing 60 full project summaries | unit | 10 | 100% | 77 | 71–82 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > configures demand-driven source deferral for every cold document | unit | 10 | 100% | 0 | 0–0 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > counts project cards and due cards in one Today note traversal | unit | 10 | 100% | 21 | 16–22 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > counts virtual future cards by project without visiting all 30k records on cold Today | unit | 10 | 100% | 22 | 19–24 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > defers 2,500 ideas and 8,000 links on initial Today, but materializes an exact Atlas on demand | unit | 10 | 100% | 42 | 34–60 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > derives the extreme project and due summaries without per-card/per-checkpoint quadratic scans | unit | 10 | 100% | 737 | 714–786 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > does not deep-clone seed histories discarded by the 5k/30k stress generator | unit | 10 | 100% | 21 | 17–21 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > expires cached due counts exactly when a future card becomes due | unit | 10 | 100% | 160 | 158–165 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > hydrates a private copy and preserves the original fixture tokens | unit | 10 | 100% | 168 | 166–170 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > invalidates the due snapshot on project archive and direct note suspension | unit | 10 | 100% | 186 | 180–191 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > keeps 6,000 source records virtual for Paths counts, then materializes exact sources on demand | unit | 10 | 100% | 111 | 95–119 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > keeps exact 4,000-card deck counts without materialising every ReviewItem | unit | 10 | 100% | 757 | 725–782 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > keeps session counts scoped to their own project after the 60-project fixture grows | unit | 10 | 100% | 87 | 84–88 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > keeps the 30k-card fixture virtual through first Today and deck reads, then materializes on card detail | unit | 10 | 100% | 80 | 72–82 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > keeps the browser stress adapter on the deferred-card path | unit | 10 | 100% | 0 | 0–1 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > memoizes repeated civil-day fixture tokens in the 30,000-card stress profile | unit | 10 | 100% | 836 | 832–845 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > parses each distinct due timestamp once across cold Today and deck counts | unit | 10 | 100% | 120 | 108–124 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > preserves most-recent-project-first deck ordering without full summary recomputation | unit | 10 | 100% | 17 | 15–20 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > preserves per-project virtual session totals without allocating 60,000 sessions | unit | 10 | 100% | 66 | 63–67 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > reuses one exact due-card scan across Today and DeckTree | unit | 10 | 100% | 24 | 18–27 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > reuses the parsed seed for repeated default demo adapters | unit | 10 | 100% | 349 | 340–356 | ok |
