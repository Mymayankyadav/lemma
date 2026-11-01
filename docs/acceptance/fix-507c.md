# FIX-507c — Paths-to-Atlas prefetch acceptance

Independent, mergeable split from [FIX #507 / PR #516](https://github.com/Mymayankyadav/lemma/pull/516).
Sources: `docs/spec/stress.md` C2 and `docs/spec/v4-look.md` §4.

- [x] Demo-only canonical `['atlas']` query prefetch when Paths mounts; no additional live-network request.
- [x] Concurrent and repeated prefetch deduplicated through React Query.
- [x] Today never prefetches Atlas data; Paths grouping and route semantics preserved.
- [x] Restore eager direct-route imports pending the parent's *complete* cold-start/hydration optimization. The isolated lazy-route attempt regressed extreme-profile navigation across all four browser shards (CI [#41270600282](https://github.com/Mymayankyadav/lemma/actions/runs/41270600282)); do not ship the partial chunk split.
- [ ] Exact-head `npm run check`, SQL, four Playwright shards and 144 screenshots all green.
- [ ] Strict first-attempt C2/D6 4× CPU evidence and S/X × day/night × 360/390 screenshots.
- [ ] Independent Auditor CLEAR.

The parent #516 retains the route-splitting/Today performance work together with its optimized stress-fixture path; it must reconcile this prefetch slice after merge. No local test run is claimed: this environment has no authenticated GitHub checkout.
