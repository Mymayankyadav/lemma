# Performance calibration

Written only by the `calibrate` workflow. Run 46137010005 on `f4dc14e0` (main, unchanged), 2026-11-28, N=10 repetitions per check.
A check whose pass rate is below 95% is **quarantined**; the priority run decides about budgets, agents never do.

63 checks, 1 quarantined.

| Check | Kind | Runs | Pass rate | Median ms | p10–p90 ms | Status |
|---|---|---|---|---|---|---|
| `audit-441-atlas-budget.spec.ts` AUDIT #441 extreme Atlas opens within 2s at 4x CPU, graph 360px | e2e | 10 | 100% | 1908 | 1852–1942 | ok |
| `audit-441-atlas-budget.spec.ts` AUDIT #441 extreme Atlas opens within 2s at 4x CPU, graph 390px | e2e | 10 | 100% | 2107 | 2062–2130 | ok |
| `audit-441-atlas-budget.spec.ts` AUDIT #441 extreme Atlas opens within 2s at 4x CPU, graph-night 360px | e2e | 10 | 100% | 1878 | 1850–1940 | ok |
| `audit-441-atlas-budget.spec.ts` AUDIT #441 extreme Atlas opens within 2s at 4x CPU, graph-night 390px | e2e | 10 | 100% | 1938 | 1900–1973 | ok |
| `fix-659-new-project.spec.ts` FIX #659 cold New project sheet and real Paths on close: extreme graph 360 | e2e | 10 | 100% | 2759 | 2701–2921 | ok |
| `fix-659-new-project.spec.ts` FIX #659 cold New project sheet and real Paths on close: extreme graph 390 | e2e | 10 | 100% | 2827 | 2770–3053 | ok |
| `fix-659-new-project.spec.ts` FIX #659 cold New project sheet and real Paths on close: extreme graph-night 360 | e2e | 10 | 100% | 2833 | 2646–3242 | ok |
| `fix-659-new-project.spec.ts` FIX #659 cold New project sheet and real Paths on close: extreme graph-night 390 | e2e | 10 | 100% | 2852 | 2764–3169 | ok |
| `fix-659-new-project.spec.ts` FIX #659 cold New project sheet and real Paths on close: stress graph 360 | e2e | 10 | 100% | 2859 | 2752–2941 | ok |
| `fix-659-new-project.spec.ts` FIX #659 cold New project sheet and real Paths on close: stress graph 390 | e2e | 10 | 100% | 2717 | 2659–2809 | ok |
| `fix-659-new-project.spec.ts` FIX #659 cold New project sheet and real Paths on close: stress graph-night 360 | e2e | 10 | 100% | 2724 | 2626–2812 | ok |
| `fix-659-new-project.spec.ts` FIX #659 cold New project sheet and real Paths on close: stress graph-night 390 | e2e | 10 | 100% | 2785 | 2689–2810 | ok |
| `fix-659-new-project.spec.ts` FIX #659 deferred maths preview still renders on input | e2e | 10 | 100% | 1258 | 1189–1284 | ok |
| `fix-659-new-project.spec.ts` FIX #659 lazy Paths backdrop never duplicates its heading during hydration | e2e | 10 | 100% | 1606 | 1558–1613 | ok |
| `st-4.spec.ts` D6 strict first-attempt 4x CPU budget › ST-4 extreme cards open under 2s at 4x CPU: graph 360 | e2e | 10 | 100% | 1436 | 1403–1475 | ok |
| `st-4.spec.ts` D6 strict first-attempt 4x CPU budget › ST-4 extreme cards open under 2s at 4x CPU: graph 390 | e2e | 10 | 100% | 1446 | 1405–1485 | ok |
| `st-4.spec.ts` D6 strict first-attempt 4x CPU budget › ST-4 extreme cards open under 2s at 4x CPU: graph-night 360 | e2e | 10 | 100% | 1456 | 1391–1493 | ok |
| `st-4.spec.ts` D6 strict first-attempt 4x CPU budget › ST-4 extreme cards open under 2s at 4x CPU: graph-night 390 | e2e | 10 | 100% | 1464 | 1435–1537 | ok |
| `st-4.spec.ts` ST-4 bounded review and card library: extreme graph 360 | e2e | 10 | 100% | 2153 | 2074–2168 | ok |
| `st-4.spec.ts` ST-4 bounded review and card library: extreme graph 390 | e2e | 10 | 100% | 2167 | 2087–2214 | ok |
| `st-4.spec.ts` ST-4 bounded review and card library: extreme graph-night 360 | e2e | 10 | 100% | 2080 | 2034–2132 | ok |
| `st-4.spec.ts` ST-4 bounded review and card library: extreme graph-night 390 | e2e | 10 | 100% | 2215 | 2130–2236 | ok |
| `st-4.spec.ts` ST-4 bounded review and card library: stress graph 360 | e2e | 10 | 100% | 1765 | 1717–1781 | ok |
| `st-4.spec.ts` ST-4 bounded review and card library: stress graph 390 | e2e | 10 | 100% | 1947 | 1919–1977 | ok |
| `st-4.spec.ts` ST-4 bounded review and card library: stress graph-night 360 | e2e | 10 | 100% | 1758 | 1714–1818 | ok |
| `st-4.spec.ts` ST-4 bounded review and card library: stress graph-night 390 | e2e | 10 | 100% | 1840 | 1783–1865 | ok |
| `st-4.spec.ts` ST-4 long aligned and matrix maths expand without horizontal page overflow | e2e | 10 | 100% | 1688 | 1668–1722 | ok |
| `st-4.spec.ts` ST-4 virtual card rows typeset fraction and inline maths: graph 360 | e2e | 10 | 100% | 2151 | 2139–2176 | ok |
| `st-4.spec.ts` ST-4 virtual card rows typeset fraction and inline maths: graph 390 | e2e | 10 | 100% | 2174 | 2145–2181 | ok |
| `st-4.spec.ts` ST-4 virtual card rows typeset fraction and inline maths: graph-night 360 | e2e | 10 | 100% | 2139 | 2124–2169 | ok |
| `st-4.spec.ts` ST-4 virtual card rows typeset fraction and inline maths: graph-night 390 | e2e | 10 | 100% | 2177 | 2133–2211 | ok |
| `stress.spec.ts` ST-0 all-route baseline: extreme, graph-night, 360px | e2e | 10 | 100% | 7562 | 7443–7718 | ok |
| `stress.spec.ts` ST-0 all-route baseline: extreme, graph-night, 390px | e2e | 10 | 100% | 7667 | 7537–7745 | ok |
| `stress.spec.ts` ST-0 all-route baseline: extreme, graph, 360px | e2e | 10 | 100% | 7454 | 7286–7589 | ok |
| `stress.spec.ts` ST-0 all-route baseline: extreme, graph, 390px | e2e | 10 | 100% | 7641 | 7472–7905 | ok |
| `stress.spec.ts` ST-0 all-route baseline: stress, graph-night, 360px | e2e | 10 | 100% | 6955 | 6751–6983 | ok |
| `stress.spec.ts` ST-0 all-route baseline: stress, graph-night, 390px | e2e | 10 | 100% | 7110 | 6964–7277 | ok |
| `stress.spec.ts` ST-0 all-route baseline: stress, graph, 360px | e2e | 10 | 100% | 6999 | 6869–7199 | ok |
| `stress.spec.ts` ST-0 all-route baseline: stress, graph, 390px | e2e | 10 | 100% | 7164 | 7088–7287 | ok |
| `stress.spec.ts` ST-0 counts small informative text but not KaTeX internal script glyphs | e2e | 10 | 100% | 157 | 149–162 | ok |
| `tests/mcp/notif1b-stress.mjs` notif1b-stress.mjs | sql | 10 | 70% | 11649 | 9950–11751 | quarantined |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > builds Atlas from virtual stress ideas and links without allocating unlinked cards | unit | 10 | 100% | 50 | 46–53 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > builds the deck tree without recomputing 60 full project summaries | unit | 10 | 100% | 67 | 63–69 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > configures demand-driven source deferral for every cold document | unit | 10 | 100% | 0 | 0–0 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > counts project cards and due cards in one Today note traversal | unit | 10 | 100% | 18 | 13–19 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > counts virtual future cards by project without visiting all 30k records on cold Today | unit | 10 | 100% | 21 | 16–23 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > defers 2,500 ideas and 8,000 links on initial Today, but materializes an exact Atlas on demand | unit | 10 | 100% | 54 | 34–58 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > derives the extreme project and due summaries without per-card/per-checkpoint quadratic scans | unit | 10 | 100% | 567 | 561–581 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > does not deep-clone seed histories discarded by the 5k/30k stress generator | unit | 10 | 100% | 16 | 16–21 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > expires cached due counts exactly when a future card becomes due | unit | 10 | 100% | 147 | 146–148 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > hydrates a private copy and preserves the original fixture tokens | unit | 10 | 100% | 154 | 153–156 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > invalidates the due snapshot on project archive and direct note suspension | unit | 10 | 100% | 170 | 165–171 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > keeps 6,000 source records virtual for Paths counts, then materializes exact sources on demand | unit | 10 | 100% | 99 | 76–104 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > keeps exact 4,000-card deck counts without materialising every ReviewItem | unit | 10 | 100% | 604 | 600–607 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > keeps session counts scoped to their own project after the 60-project fixture grows | unit | 10 | 100% | 70 | 68–73 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > keeps the 30k-card fixture virtual through first Today and deck reads, then materializes on card detail | unit | 10 | 100% | 64 | 63–66 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > keeps the browser stress adapter on the deferred-card path | unit | 10 | 100% | 0 | 0–0 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > memoizes repeated civil-day fixture tokens in the 30,000-card stress profile | unit | 10 | 100% | 719 | 710–739 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > parses each distinct due timestamp once across cold Today and deck counts | unit | 10 | 100% | 102 | 99–106 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > preserves most-recent-project-first deck ordering without full summary recomputation | unit | 10 | 100% | 14 | 12–15 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > preserves per-project virtual session totals without allocating 60,000 sessions | unit | 10 | 100% | 52 | 50–55 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > reuses one exact due-card scan across Today and DeckTree | unit | 10 | 100% | 20 | 17–23 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > reuses the parsed seed for repeated default demo adapters | unit | 10 | 100% | 314 | 308–324 | ok |
