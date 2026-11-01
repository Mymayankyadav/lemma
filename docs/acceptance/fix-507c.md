# FIX-507c — Paths-to-Atlas prefetch acceptance

Split from [FIX #507 / PR #516](https://github.com/Mymayankyadav/lemma/pull/516).

Source: `docs/spec/stress.md` C2, `docs/spec/v4-look.md` §4.

- [x] Canonical Atlas query prefetch on Paths in demo only; never a new live-network request.
- [x] Repeated and concurrent prefetch deduplicate; cache remains available for Atlas navigation.
- [x] Preserve v4 Paths groups, no eager Today Atlas load.
- [ ] Full exact-head CI (seven required jobs), strict first-attempt C2/D6 under 1,000 ms, 144 screenshots.
- [ ] Independent Auditor CLEAR.

Implementation: `b27776b7` helper regressions, `83d8add9` lazy-route regressions, `231b8b11` query helper, `0658f8fd` Paths integration, `07287bb6` lazy Atlas route. All exact-head CI and visual evidence still pending. No local tests claimed (GitHub DNS unavailable).
