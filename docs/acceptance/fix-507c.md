# FIX-507c — Paths-to-Atlas prefetch acceptance

Split from [FIX #507 / PR #516](https://github.com/Mymayankyadav/lemma/pull/516).

Source: `docs/spec/stress.md` C2, `docs/spec/v4-look.md` §4.

- [ ] Canonical Atlas query prefetch on Paths in demo only; never a new live-network request.
- [ ] Repeated and concurrent prefetch deduplicate; cache remains available for Atlas navigation.
- [ ] Preserve v4 Paths groups, no eager Today Atlas load.
- [ ] Full exact-head CI (seven required jobs), strict first-attempt C2/D6 under 1,000 ms, 144 screenshots.
- [ ] Independent Auditor CLEAR.

Evidence and screenshot links will be recorded after CI.
