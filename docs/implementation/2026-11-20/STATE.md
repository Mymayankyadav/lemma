# Repository and open-PR audit — 2026-11-20

- Repository: [Mymayankyadav/lemma](https://github.com/Mymayankyadav/lemma); main at audit `d4f86b1c96de5daa2a05d8c216e34dc134e4a960`.
- Owner ZIP: research/plan evidence, not a repository checkout; prior handoff reported 118 MB and an SHA-256 matched manifest (not re-run in this publication turn).
- Historical main `NEXT.md`: 44 sections; claims/status may lag merged code. Verbatim snapshot and ledger accompany this plan.
- The live PRs are **not merged**. Do not count any branch-only feature as shipped.

| PR | Work that exists on its branch | Last reviewed blocker and first useful action |
|---|---|---|
| [#1533](https://github.com/Mymayankyadav/lemma/pull/1533), N191 at `f690fe0` | Owner-bound evidence revisions, calendar/time snapshot, release capability, shared receipts, export registry | SQL parity reports untracked `calendar_blocks.weekly_rule` and `buffer_before_minutes` paths; finish parity and lifecycle rather than rebuild foundation |
| [#1535](https://github.com/Mymayankyadav/lemma/pull/1535), N192 at `0c2504f` | IndexedDB/offline editor, math preview, ink, export, share-grant and local selection; scope/fast gate had passed | Missing **full-fledged page with custom math keyboard** per new Owner decision; add route and keyboard and final tutor bridge, then device acceptance |
| [#1537](https://github.com/Mymayankyadav/lemma/pull/1537), N193 at `4648b0e` | Sealed turns, manual/MCP grants/replies, owner export and recovery; type/unit/browser passed | SQL and migration scope errors around shared release and private export REVOKEs; coordinate N191 and Owner privilege cutover |
| [#1546](https://github.com/Mymayankyadav/lemma/pull/1546), N195 at `e6f2bd7` | Live first card/review, task/calendar and UI repairs | Scope/type/SQL/browser; shared missing release function in old migration ordering; fix independent TS failure and acceptance after N191 |
| [#1547](https://github.com/Mymayankyadav/lemma/pull/1547), N196 at `7fc3a9e` | New agenda, four-state forecast, practice policy, Settings planning choice | SQL `version` ambiguity, TS and migration scope failures. Qualify and **ship New default on** with Settings opt-out in N198 |

Cross-cutting: earlier CI showed `public.lemma_plan_released()` missing on multiple PRs pending N191, plus an independent native pause-envelope failure. Diagnose these separately rather than creating many duplicate tasks. The current main release status should be queried again before an actual rollout.

Additional previously identified work: a separate receipt-permissions cutover branch, a three-file Pad-to-tutor handoff bridge, and an Android acceptance harness. Their exact tip SHAs were not reverified in this turn: search repository branch/commit history, compare with the five PR heads and reuse only compatible code.

This publication modifies **planning documents only**. The owner's launch decision changes target behavior, **not** the current production feature flags. All tests and device gates in packet N198 remain unexecuted by this documentation PR.
