# FIX-507a — independent chart-mark clearance slice

Parent: [FIX #507 / PR #516](https://github.com/Mymayankyadav/lemma/pull/516).
Spec: `docs/spec/stress.md` §1.2, E2–E3 and the 8px mark-spacing budget.

This is a self-contained, mergeable split of the already implemented chart fix.
It changes only the two chart components and the eight-world regression.
The remaining ST-0 cold-route gate and fixture performance stay in #516.

## Acceptance

- [ ] Grouped weekly series preserve every bucket and at least 8px clearance between painted bars.
- [ ] Dense 30-day review bars scroll *inside* their container rather than shrink below the 8px budget.
- [ ] S/X-compatible Graph day/night at 360 and 390px: no document overflow; data totals and period counts unchanged.
- [ ] Eight affected-screen screenshots and all seven exact-head CI checks.
- [ ] Independent Auditor CLEAR; do not merge this split before acceptance.

No database, connector or contract changes. Do not weaken existing tests.

Assisted-by: ChatGPT (OpenAI)
