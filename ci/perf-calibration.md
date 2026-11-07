# Performance calibration

Written only by the `calibrate` workflow. Run 42358714654 on `7156be06` (main, unchanged), 2026-11-07, N=10 repetitions per check.
A check whose pass rate is below 95% is **quarantined**; the priority run decides about budgets, agents never do.

63 checks, 0 quarantined.

| Check | Kind | Runs | Pass rate | Median ms | p10–p90 ms | Status |
|---|---|---|---|---|---|---|
| `audit-441-atlas-budget.spec.ts` AUDIT #441 extreme Atlas opens within 2s at 4x CPU, graph 360px | e2e | 10 | 100% | 1214 | 1164–1456 | ok |
| `audit-441-atlas-budget.spec.ts` AUDIT #441 extreme Atlas opens within 2s at 4x CPU, graph 390px | e2e | 10 | 100% | 1383 | 1317–1483 | ok |
| `audit-441-atlas-budget.spec.ts` AUDIT #441 extreme Atlas opens within 2s at 4x CPU, graph-night 360px | e2e | 10 | 100% | 1192 | 1165–1253 | ok |
| `audit-441-atlas-budget.spec.ts` AUDIT #441 extreme Atlas opens within 2s at 4x CPU, graph-night 390px | e2e | 10 | 100% | 1257 | 1203–1311 | ok |
| `fix-659-new-project.spec.ts` FIX #659 cold New project sheet and real Paths on close: extreme graph 360 | e2e | 10 | 100% | 3156 | 2785–3218 | ok |
| `fix-659-new-project.spec.ts` FIX #659 cold New project sheet and real Paths on close: extreme graph 390 | e2e | 10 | 100% | 3003 | 2879–3447 | ok |
| `fix-659-new-project.spec.ts` FIX #659 cold New project sheet and real Paths on close: extreme graph-night 360 | e2e | 10 | 100% | 2826 | 2779–2941 | ok |
| `fix-659-new-project.spec.ts` FIX #659 cold New project sheet and real Paths on close: extreme graph-night 390 | e2e | 10 | 100% | 3207 | 2845–3581 | ok |
| `fix-659-new-project.spec.ts` FIX #659 cold New project sheet and real Paths on close: stress graph 360 | e2e | 10 | 100% | 3073 | 2962–3292 | ok |
| `fix-659-new-project.spec.ts` FIX #659 cold New project sheet and real Paths on close: stress graph 390 | e2e | 10 | 100% | 3066 | 2931–3238 | ok |
| `fix-659-new-project.spec.ts` FIX #659 cold New project sheet and real Paths on close: stress graph-night 360 | e2e | 10 | 100% | 2903 | 2771–3010 | ok |
| `fix-659-new-project.spec.ts` FIX #659 cold New project sheet and real Paths on close: stress graph-night 390 | e2e | 10 | 100% | 2963 | 2871–3042 | ok |
| `fix-659-new-project.spec.ts` FIX #659 deferred maths preview still renders on input | e2e | 10 | 100% | 1393 | 1265–1413 | ok |
| `fix-659-new-project.spec.ts` FIX #659 lazy Paths backdrop never duplicates its heading during hydration | e2e | 10 | 100% | 1663 | 1655–1674 | ok |
| `st-4.spec.ts` D6 strict first-attempt 4x CPU budget › ST-4 extreme cards open under 2s at 4x CPU: graph 360 | e2e | 10 | 100% | 1360 | 1314–1373 | ok |
| `st-4.spec.ts` D6 strict first-attempt 4x CPU budget › ST-4 extreme cards open under 2s at 4x CPU: graph 390 | e2e | 10 | 100% | 1388 | 1345–1397 | ok |
| `st-4.spec.ts` D6 strict first-attempt 4x CPU budget › ST-4 extreme cards open under 2s at 4x CPU: graph-night 360 | e2e | 10 | 100% | 1319 | 1302–1367 | ok |
| `st-4.spec.ts` D6 strict first-attempt 4x CPU budget › ST-4 extreme cards open under 2s at 4x CPU: graph-night 390 | e2e | 10 | 100% | 1376 | 1336–1435 | ok |
| `st-4.spec.ts` ST-4 bounded review and card library: extreme graph 360 | e2e | 10 | 100% | 2683 | 2634–2699 | ok |
| `st-4.spec.ts` ST-4 bounded review and card library: extreme graph 390 | e2e | 10 | 100% | 2743 | 2707–2759 | ok |
| `st-4.spec.ts` ST-4 bounded review and card library: extreme graph-night 360 | e2e | 10 | 100% | 2665 | 2647–3032 | ok |
| `st-4.spec.ts` ST-4 bounded review and card library: extreme graph-night 390 | e2e | 10 | 100% | 2731 | 2697–2765 | ok |
| `st-4.spec.ts` ST-4 bounded review and card library: stress graph 360 | e2e | 10 | 100% | 2360 | 2330–2391 | ok |
| `st-4.spec.ts` ST-4 bounded review and card library: stress graph 390 | e2e | 10 | 100% | 2546 | 2515–2572 | ok |
| `st-4.spec.ts` ST-4 bounded review and card library: stress graph-night 360 | e2e | 10 | 100% | 2350 | 2327–2363 | ok |
| `st-4.spec.ts` ST-4 bounded review and card library: stress graph-night 390 | e2e | 10 | 100% | 2395 | 2359–2412 | ok |
| `st-4.spec.ts` ST-4 long aligned and matrix maths expand without horizontal page overflow | e2e | 10 | 100% | 1419 | 1385–1432 | ok |
| `st-4.spec.ts` ST-4 virtual card rows typeset fraction and inline maths: graph 360 | e2e | 10 | 100% | 1976 | 1967–1986 | ok |
| `st-4.spec.ts` ST-4 virtual card rows typeset fraction and inline maths: graph 390 | e2e | 10 | 100% | 2011 | 1988–2042 | ok |
| `st-4.spec.ts` ST-4 virtual card rows typeset fraction and inline maths: graph-night 360 | e2e | 10 | 100% | 1967 | 1947–1981 | ok |
| `st-4.spec.ts` ST-4 virtual card rows typeset fraction and inline maths: graph-night 390 | e2e | 10 | 100% | 2012 | 1993–2026 | ok |
| `stress.spec.ts` ST-0 all-route baseline: extreme, graph-night, 360px | e2e | 10 | 100% | 16601 | 16181–16726 | ok |
| `stress.spec.ts` ST-0 all-route baseline: extreme, graph-night, 390px | e2e | 10 | 100% | 16586 | 16171–16691 | ok |
| `stress.spec.ts` ST-0 all-route baseline: extreme, graph, 360px | e2e | 10 | 100% | 16512 | 16129–16791 | ok |
| `stress.spec.ts` ST-0 all-route baseline: extreme, graph, 390px | e2e | 10 | 100% | 16864 | 16360–17048 | ok |
| `stress.spec.ts` ST-0 all-route baseline: stress, graph-night, 360px | e2e | 10 | 100% | 16136 | 15844–16278 | ok |
| `stress.spec.ts` ST-0 all-route baseline: stress, graph-night, 390px | e2e | 10 | 100% | 16589 | 16119–16760 | ok |
| `stress.spec.ts` ST-0 all-route baseline: stress, graph, 360px | e2e | 10 | 100% | 16128 | 15458–16661 | ok |
| `stress.spec.ts` ST-0 all-route baseline: stress, graph, 390px | e2e | 10 | 100% | 16345 | 15793–16415 | ok |
| `stress.spec.ts` ST-0 counts small informative text but not KaTeX internal script glyphs | e2e | 10 | 100% | 209 | 198–220 | ok |
| `tests/mcp/notif1b-stress.mjs` notif1b-stress.mjs | sql | 10 | 100% | 5699 | 5440–5900 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > builds Atlas from virtual stress ideas and links without allocating unlinked cards | unit | 10 | 100% | 87 | 81–102 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > builds the deck tree without recomputing 60 full project summaries | unit | 10 | 100% | 95 | 89–99 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > configures demand-driven source deferral for every cold document | unit | 10 | 100% | 0 | 0–0 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > counts project cards and due cards in one Today note traversal | unit | 10 | 100% | 27 | 20–32 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > counts virtual future cards by project without visiting all 30k records on cold Today | unit | 10 | 100% | 31 | 23–37 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > defers 2,500 ideas and 8,000 links on initial Today, but materializes an exact Atlas on demand | unit | 10 | 100% | 51 | 39–59 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > derives the extreme project and due summaries without per-card/per-checkpoint quadratic scans | unit | 10 | 100% | 872 | 852–913 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > does not deep-clone seed histories discarded by the 5k/30k stress generator | unit | 10 | 100% | 22 | 22–23 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > expires cached due counts exactly when a future card becomes due | unit | 10 | 100% | 214 | 213–214 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > hydrates a private copy and preserves the original fixture tokens | unit | 10 | 100% | 224 | 222–225 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > invalidates the due snapshot on project archive and direct note suspension | unit | 10 | 100% | 249 | 244–253 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > keeps 6,000 source records virtual for Paths counts, then materializes exact sources on demand | unit | 10 | 100% | 109 | 104–114 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > keeps exact 4,000-card deck counts without materialising every ReviewItem | unit | 10 | 100% | 916 | 876–931 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > keeps session counts scoped to their own project after the 60-project fixture grows | unit | 10 | 100% | 105 | 103–107 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > keeps the 30k-card fixture virtual through first Today and deck reads, then materializes on card detail | unit | 10 | 100% | 93 | 88–97 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > keeps the browser stress adapter on the deferred-card path | unit | 10 | 100% | 1 | 0–1 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > memoizes repeated civil-day fixture tokens in the 30,000-card stress profile | unit | 10 | 100% | 1040 | 1036–1077 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > parses each distinct due timestamp once across cold Today and deck counts | unit | 10 | 100% | 149 | 132–156 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > preserves most-recent-project-first deck ordering without full summary recomputation | unit | 10 | 100% | 19 | 17–22 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > preserves per-project virtual session totals without allocating 60,000 sessions | unit | 10 | 100% | 75 | 72–81 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > reuses one exact due-card scan across Today and DeckTree | unit | 10 | 100% | 26 | 21–33 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > reuses the parsed seed for repeated default demo adapters | unit | 10 | 100% | 475 | 464–481 | ok |
