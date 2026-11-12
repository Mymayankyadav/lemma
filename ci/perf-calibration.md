# Performance calibration

Written only by the `calibrate` workflow. Run 43198521182 on `bcc04a30` (main, unchanged), 2026-11-12, N=10 repetitions per check.
A check whose pass rate is below 95% is **quarantined**; the priority run decides about budgets, agents never do.

63 checks, 1 quarantined.

| Check | Kind | Runs | Pass rate | Median ms | p10–p90 ms | Status |
|---|---|---|---|---|---|---|
| `audit-441-atlas-budget.spec.ts` AUDIT #441 extreme Atlas opens within 2s at 4x CPU, graph 360px | e2e | 10 | 100% | 1327 | 1282–1421 | ok |
| `audit-441-atlas-budget.spec.ts` AUDIT #441 extreme Atlas opens within 2s at 4x CPU, graph 390px | e2e | 10 | 100% | 1458 | 1400–1501 | ok |
| `audit-441-atlas-budget.spec.ts` AUDIT #441 extreme Atlas opens within 2s at 4x CPU, graph-night 360px | e2e | 10 | 100% | 1314 | 1279–1333 | ok |
| `audit-441-atlas-budget.spec.ts` AUDIT #441 extreme Atlas opens within 2s at 4x CPU, graph-night 390px | e2e | 10 | 100% | 1353 | 1287–1403 | ok |
| `fix-659-new-project.spec.ts` FIX #659 cold New project sheet and real Paths on close: extreme graph 360 | e2e | 10 | 100% | 3296 | 3149–3408 | ok |
| `fix-659-new-project.spec.ts` FIX #659 cold New project sheet and real Paths on close: extreme graph 390 | e2e | 10 | 100% | 3392 | 3177–3777 | ok |
| `fix-659-new-project.spec.ts` FIX #659 cold New project sheet and real Paths on close: extreme graph-night 360 | e2e | 10 | 100% | 3154 | 3075–3510 | ok |
| `fix-659-new-project.spec.ts` FIX #659 cold New project sheet and real Paths on close: extreme graph-night 390 | e2e | 10 | 100% | 3373 | 3222–3777 | ok |
| `fix-659-new-project.spec.ts` FIX #659 cold New project sheet and real Paths on close: stress graph 360 | e2e | 10 | 100% | 3328 | 3295–3477 | ok |
| `fix-659-new-project.spec.ts` FIX #659 cold New project sheet and real Paths on close: stress graph 390 | e2e | 10 | 100% | 3341 | 3186–3472 | ok |
| `fix-659-new-project.spec.ts` FIX #659 cold New project sheet and real Paths on close: stress graph-night 360 | e2e | 10 | 100% | 3088 | 3026–3206 | ok |
| `fix-659-new-project.spec.ts` FIX #659 cold New project sheet and real Paths on close: stress graph-night 390 | e2e | 10 | 100% | 3196 | 3129–3254 | ok |
| `fix-659-new-project.spec.ts` FIX #659 deferred maths preview still renders on input | e2e | 10 | 100% | 1515 | 1470–1530 | ok |
| `fix-659-new-project.spec.ts` FIX #659 lazy Paths backdrop never duplicates its heading during hydration | e2e | 10 | 100% | 1812 | 1787–1820 | ok |
| `st-4.spec.ts` D6 strict first-attempt 4x CPU budget › ST-4 extreme cards open under 2s at 4x CPU: graph 360 | e2e | 10 | 100% | 1109 | 1088–1173 | ok |
| `st-4.spec.ts` D6 strict first-attempt 4x CPU budget › ST-4 extreme cards open under 2s at 4x CPU: graph 390 | e2e | 10 | 100% | 1181 | 1096–1232 | ok |
| `st-4.spec.ts` D6 strict first-attempt 4x CPU budget › ST-4 extreme cards open under 2s at 4x CPU: graph-night 360 | e2e | 10 | 100% | 1117 | 1085–1151 | ok |
| `st-4.spec.ts` D6 strict first-attempt 4x CPU budget › ST-4 extreme cards open under 2s at 4x CPU: graph-night 390 | e2e | 10 | 100% | 1150 | 1100–1183 | ok |
| `st-4.spec.ts` ST-4 bounded review and card library: extreme graph 360 | e2e | 10 | 100% | 2451 | 2042–2522 | ok |
| `st-4.spec.ts` ST-4 bounded review and card library: extreme graph 390 | e2e | 10 | 100% | 2425 | 2061–2512 | ok |
| `st-4.spec.ts` ST-4 bounded review and card library: extreme graph-night 360 | e2e | 10 | 100% | 2436 | 2080–2454 | ok |
| `st-4.spec.ts` ST-4 bounded review and card library: extreme graph-night 390 | e2e | 10 | 100% | 2494 | 2134–2568 | ok |
| `st-4.spec.ts` ST-4 bounded review and card library: stress graph 360 | e2e | 10 | 100% | 2173 | 1724–2231 | ok |
| `st-4.spec.ts` ST-4 bounded review and card library: stress graph 390 | e2e | 10 | 100% | 2262 | 1866–2331 | ok |
| `st-4.spec.ts` ST-4 bounded review and card library: stress graph-night 360 | e2e | 10 | 100% | 2119 | 1683–2184 | ok |
| `st-4.spec.ts` ST-4 bounded review and card library: stress graph-night 390 | e2e | 10 | 100% | 2194 | 1734–2578 | ok |
| `st-4.spec.ts` ST-4 long aligned and matrix maths expand without horizontal page overflow | e2e | 10 | 100% | 1213 | 1170–1251 | ok |
| `st-4.spec.ts` ST-4 virtual card rows typeset fraction and inline maths: graph 360 | e2e | 10 | 100% | 1798 | 1735–1812 | ok |
| `st-4.spec.ts` ST-4 virtual card rows typeset fraction and inline maths: graph 390 | e2e | 10 | 100% | 1810 | 1747–1901 | ok |
| `st-4.spec.ts` ST-4 virtual card rows typeset fraction and inline maths: graph-night 360 | e2e | 10 | 100% | 1766 | 1753–1875 | ok |
| `st-4.spec.ts` ST-4 virtual card rows typeset fraction and inline maths: graph-night 390 | e2e | 10 | 100% | 1798 | 1786–1843 | ok |
| `stress.spec.ts` ST-0 all-route baseline: extreme, graph-night, 360px | e2e | 10 | 100% | 15668 | 14865–16032 | ok |
| `stress.spec.ts` ST-0 all-route baseline: extreme, graph-night, 390px | e2e | 10 | 100% | 15910 | 15055–16326 | ok |
| `stress.spec.ts` ST-0 all-route baseline: extreme, graph, 360px | e2e | 10 | 100% | 15757 | 15217–15921 | ok |
| `stress.spec.ts` ST-0 all-route baseline: extreme, graph, 390px | e2e | 10 | 100% | 15909 | 15406–16140 | ok |
| `stress.spec.ts` ST-0 all-route baseline: stress, graph-night, 360px | e2e | 10 | 100% | 15688 | 15318–15821 | ok |
| `stress.spec.ts` ST-0 all-route baseline: stress, graph-night, 390px | e2e | 10 | 100% | 15592 | 14969–16120 | ok |
| `stress.spec.ts` ST-0 all-route baseline: stress, graph, 360px | e2e | 10 | 100% | 15316 | 14967–15474 | ok |
| `stress.spec.ts` ST-0 all-route baseline: stress, graph, 390px | e2e | 10 | 100% | 15423 | 14834–15728 | ok |
| `stress.spec.ts` ST-0 counts small informative text but not KaTeX internal script glyphs | e2e | 10 | 100% | 159 | 154–163 | ok |
| `tests/mcp/notif1b-stress.mjs` notif1b-stress.mjs | sql | 10 | 70% | 10958 | 9450–11003 | quarantined |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > builds Atlas from virtual stress ideas and links without allocating unlinked cards | unit | 10 | 100% | 90 | 72–96 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > builds the deck tree without recomputing 60 full project summaries | unit | 10 | 100% | 102 | 94–105 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > configures demand-driven source deferral for every cold document | unit | 10 | 100% | 0 | 0–0 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > counts project cards and due cards in one Today note traversal | unit | 10 | 100% | 28 | 19–31 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > counts virtual future cards by project without visiting all 30k records on cold Today | unit | 10 | 100% | 27 | 23–32 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > defers 2,500 ideas and 8,000 links on initial Today, but materializes an exact Atlas on demand | unit | 10 | 100% | 43 | 37–63 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > derives the extreme project and due summaries without per-card/per-checkpoint quadratic scans | unit | 10 | 100% | 851 | 828–886 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > does not deep-clone seed histories discarded by the 5k/30k stress generator | unit | 10 | 100% | 22 | 21–22 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > expires cached due counts exactly when a future card becomes due | unit | 10 | 100% | 212 | 211–218 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > hydrates a private copy and preserves the original fixture tokens | unit | 10 | 100% | 223 | 220–227 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > invalidates the due snapshot on project archive and direct note suspension | unit | 10 | 100% | 244 | 242–252 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > keeps 6,000 source records virtual for Paths counts, then materializes exact sources on demand | unit | 10 | 100% | 109 | 102–115 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > keeps exact 4,000-card deck counts without materialising every ReviewItem | unit | 10 | 100% | 865 | 845–907 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > keeps session counts scoped to their own project after the 60-project fixture grows | unit | 10 | 100% | 102 | 100–104 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > keeps the 30k-card fixture virtual through first Today and deck reads, then materializes on card detail | unit | 10 | 100% | 92 | 85–95 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > keeps the browser stress adapter on the deferred-card path | unit | 10 | 100% | 0 | 0–0 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > memoizes repeated civil-day fixture tokens in the 30,000-card stress profile | unit | 10 | 100% | 1028 | 1007–1067 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > parses each distinct due timestamp once across cold Today and deck counts | unit | 10 | 100% | 140 | 126–155 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > preserves most-recent-project-first deck ordering without full summary recomputation | unit | 10 | 100% | 19 | 18–23 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > preserves per-project virtual session totals without allocating 60,000 sessions | unit | 10 | 100% | 76 | 70–79 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > reuses one exact due-card scan across Today and DeckTree | unit | 10 | 100% | 23 | 21–33 | ok |
| `tests/unit/data/stress-home-perf.test.ts` FIX #507: cold Today stress summary > reuses the parsed seed for repeated default demo adapters | unit | 10 | 100% | 469 | 461–487 | ok |
