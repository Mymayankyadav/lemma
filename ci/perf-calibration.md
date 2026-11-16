# Performance calibration

Written only by the `calibrate` workflow. Run 43846040952 on `200a8713` (main, unchanged), 2026-11-16, N=10 repetitions per check.
A check whose pass rate is below 95% is **quarantined**; the priority run decides about budgets, agents never do.

63 checks, 0 quarantined.

| Check | Kind | Runs | Pass rate | Median ms | p10–p90 ms | Status |
|---|---|---|---|---|---|---|
| `audit-441-atlas-budget.spec.ts` AUDIT #441 extreme Atlas opens within 2s at 4x CPU, graph 360px | e2e | 10 | 100% | 1061 | 1043–1080 | ok |
| `audit-441-atlas-budget.spec.ts` AUDIT #441 extreme Atlas opens within 2s at 4x CPU, graph 390px | e2e | 10 | 100% | 1206 | 1177–1226 | ok |
| `audit-441-atlas-budget.spec.ts` AUDIT #441 extreme Atlas opens within 2s at 4x CPU, graph-night 360px | e2e | 10 | 100% | 1040 | 1032–1066 | ok |
| `audit-441-atlas-budget.spec.ts` AUDIT #441 extreme Atlas opens within 2s at 4x CPU, graph-night 390px | e2e | 10 | 100% | 1067 | 1037–1120 | ok |
| `fix-659-new-project.spec.ts` FIX #659 cold New project sheet and real Paths on close: extreme graph 360 | e2e | 10 | 100% | 2375 | 2345–2396 | ok |
| `fix-659-new-project.spec.ts` FIX #659 cold New project sheet and real Paths on close: extreme graph 390 | e2e | 10 | 100% | 2416 | 2380–2433 | ok |
| `fix-659-new-project.spec.ts` FIX #659 cold New project sheet and real Paths on close: extreme graph-night 360 | e2e | 10 | 100% | 2349 | 2332–2383 | ok |
| `fix-659-new-project.spec.ts` FIX #659 cold New project sheet and real Paths on close: extreme graph-night 390 | e2e | 10 | 100% | 2431 | 2379–2444 | ok |
| `fix-659-new-project.spec.ts` FIX #659 cold New project sheet and real Paths on close: stress graph 360 | e2e | 10 | 100% | 2400 | 2370–2438 | ok |
| `fix-659-new-project.spec.ts` FIX #659 cold New project sheet and real Paths on close: stress graph 390 | e2e | 10 | 100% | 2390 | 2342–2422 | ok |
| `fix-659-new-project.spec.ts` FIX #659 cold New project sheet and real Paths on close: stress graph-night 360 | e2e | 10 | 100% | 2316 | 2248–2333 | ok |
| `fix-659-new-project.spec.ts` FIX #659 cold New project sheet and real Paths on close: stress graph-night 390 | e2e | 10 | 100% | 2365 | 2332–2397 | ok |
| `fix-659-new-project.spec.ts` FIX #659 deferred maths preview still renders on input | e2e | 10 | 100% | 1173 | 1144–1189 | ok |
| `fix-659-new-project.spec.ts` FIX #659 lazy Paths backdrop never duplicates its heading during hydration | e2e | 10 | 100% | 1517 | 1506–1522 | ok |
| `st-4.spec.ts` D6 strict first-attempt 4x CPU budget › ST-4 extreme cards open under 2s at 4x CPU: graph 360 | e2e | 10 | 100% | 1556 | 1528–1591 | ok |
| `st-4.spec.ts` D6 strict first-attempt 4x CPU budget › ST-4 extreme cards open under 2s at 4x CPU: graph 390 | e2e | 10 | 100% | 1647 | 1596–1701 | ok |
| `st-4.spec.ts` D6 strict first-attempt 4x CPU budget › ST-4 extreme cards open under 2s at 4x CPU: graph-night 360 | e2e | 10 | 100% | 1588 | 1500–1630 | ok |
| `st-4.spec.ts` D6 strict first-attempt 4x CPU budget › ST-4 extreme cards open under 2s at 4x CPU: graph-night 390 | e2e | 10 | 100% | 1615 | 1532–1651 | ok |
| `st-4.spec.ts` ST-4 bounded review and card library: extreme graph 360 | e2e | 10 | 100% | 2557 | 2536–2607 | ok |
| `st-4.spec.ts` ST-4 bounded review and card library: extreme graph 390 | e2e | 10 | 100% | 2664 | 2612–2719 | ok |
| `st-4.spec.ts` ST-4 bounded review and card library: extreme graph-night 360 | e2e | 10 | 100% | 2595 | 2559–2642 | ok |
| `st-4.spec.ts` ST-4 bounded review and card library: extreme graph-night 390 | e2e | 10 | 100% | 2630 | 2613–2657 | ok |
| `st-4.spec.ts` ST-4 bounded review and card library: stress graph 360 | e2e | 10 | 100% | 2147 | 2106–2193 | ok |
| `st-4.spec.ts` ST-4 bounded review and card library: stress graph 390 | e2e | 10 | 100% | 2376 | 2339–2433 | ok |
| `st-4.spec.ts` ST-4 bounded review and card library: stress graph-night 360 | e2e | 10 | 100% | 2153 | 2122–2168 | ok |
| `st-4.spec.ts` ST-4 bounded review and card library: stress graph-night 390 | e2e | 10 | 100% | 2206 | 2175–2223 | ok |
| `st-4.spec.ts` ST-4 long aligned and matrix maths expand without horizontal page overflow | e2e | 10 | 100% | 1598 | 1559–1629 | ok |
| `st-4.spec.ts` ST-4 virtual card rows typeset fraction and inline maths: graph 360 | e2e | 10 | 100% | 2291 | 2275–2296 | ok |
| `st-4.spec.ts` ST-4 virtual card rows typeset fraction and inline maths: graph 390 | e2e | 10 | 100% | 2359 | 2327–2392 | ok |
| `st-4.spec.ts` ST-4 virtual card rows typeset fraction and inline maths: graph-night 360 | e2e | 10 | 100% | 2277 | 2252–2305 | ok |
| `st-4.spec.ts` ST-4 virtual card rows typeset fraction and inline maths: graph-night 390 | e2e | 10 | 100% | 2359 | 2334–2397 | ok |
| `stress.spec.ts` ST-0 all-route baseline: extreme, graph-night, 360px | e2e | 10 | 100% | 16356 | 15587–16633 | ok |
| `stress.spec.ts` ST-0 all-route baseline: extreme, graph-night, 390px | e2e | 10 | 100% | 16237 | 15868–16551 | ok |
| `stress.spec.ts` ST-0 all-route baseline: extreme, graph, 360px | e2e | 10 | 100% | 16538 | 16039–16779 | ok |
| `stress.spec.ts` ST-0 all-route baseline: extreme, graph, 390px | e2e | 10 | 100% | 16159 | 15973–16644 | ok |
| `stress.spec.ts` ST-0 all-route baseline: stress, graph-night, 360px | e2e | 10 | 100% | 15482 | 14942–15764 | ok |
| `stress.spec.ts` ST-0 all-route baseline: stress, graph-night, 390px | e2e | 10 | 100% | 15437 | 15068–15904 | ok |
| `stress.spec.ts` ST-0 all-route baseline: stress, graph, 360px | e2e | 10 | 100% | 15307 | 15009–15440 | ok |
| `stress.spec.ts` ST-0 all-route baseline: stress, graph, 390px | e2e | 10 | 100% | 15438 | 14978–15721 | ok |
| `stress.spec.ts` ST-0 counts small informative text but not KaTeX internal script glyphs | e2e | 10 | 100% | 221 | 211–224 | ok |
| `tests/mcp/notif1b-stress.mjs` notif1b-stress.mjs | sql | 10 | 100% | 6055 | 5937–6183 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > builds Atlas from virtual stress ideas and links without allocating unlinked cards | unit | 10 | 100% | 51 | 44–54 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > builds the deck tree without recomputing 60 full project summaries | unit | 10 | 100% | 63 | 59–65 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > configures demand-driven source deferral for every cold document | unit | 10 | 100% | 0 | 0–0 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > counts project cards and due cards in one Today note traversal | unit | 10 | 100% | 15 | 13–17 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > counts virtual future cards by project without visiting all 30k records on cold Today | unit | 10 | 100% | 21 | 17–22 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > defers 2,500 ideas and 8,000 links on initial Today, but materializes an exact Atlas on demand | unit | 10 | 100% | 46 | 32–56 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > derives the extreme project and due summaries without per-card/per-checkpoint quadratic scans | unit | 10 | 100% | 548 | 539–550 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > does not deep-clone seed histories discarded by the 5k/30k stress generator | unit | 10 | 100% | 15 | 15–16 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > expires cached due counts exactly when a future card becomes due | unit | 10 | 100% | 141 | 141–143 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > hydrates a private copy and preserves the original fixture tokens | unit | 10 | 100% | 150 | 147–150 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > invalidates the due snapshot on project archive and direct note suspension | unit | 10 | 100% | 165 | 160–167 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > keeps 6,000 source records virtual for Paths counts, then materializes exact sources on demand | unit | 10 | 100% | 76 | 70–101 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > keeps exact 4,000-card deck counts without materialising every ReviewItem | unit | 10 | 100% | 579 | 573–581 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > keeps session counts scoped to their own project after the 60-project fixture grows | unit | 10 | 100% | 65 | 65–74 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > keeps the 30k-card fixture virtual through first Today and deck reads, then materializes on card detail | unit | 10 | 100% | 61 | 61–63 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > keeps the browser stress adapter on the deferred-card path | unit | 10 | 100% | 0 | 0–0 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > memoizes repeated civil-day fixture tokens in the 30,000-card stress profile | unit | 10 | 100% | 697 | 666–701 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > parses each distinct due timestamp once across cold Today and deck counts | unit | 10 | 100% | 97 | 91–103 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > preserves most-recent-project-first deck ordering without full summary recomputation | unit | 10 | 100% | 13 | 10–15 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > preserves per-project virtual session totals without allocating 60,000 sessions | unit | 10 | 100% | 49 | 47–50 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > reuses one exact due-card scan across Today and DeckTree | unit | 10 | 100% | 20 | 15–23 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > reuses the parsed seed for repeated default demo adapters | unit | 10 | 100% | 305 | 302–309 | ok |
