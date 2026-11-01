# FIX-507a — independent chart-mark clearance slice

Parent: [FIX #507 / PR #516](https://github.com/Mymayankyadav/lemma/pull/516).
Spec: `docs/spec/stress.md` §1.2, E2–E3 and the 8px mark-spacing budget.
Implementation: [PR #610](https://github.com/Mymayankyadav/lemma/pull/610).

This is a self-contained, mergeable chart slice. It changes only the two chart
components, the 16-case browser regression and this acceptance note. The
remaining ST-0 cold-route gate and fixture performance stay in #516.

## Acceptance evidence

- [x] Grouped weekly series preserve every bucket and ≥8px clearance between painted bars.
- [x] Dense 30-day review bars scroll **inside** their container rather than shrink below the 8px budget.
- [x] S/X × Graph day/night × 360/390px: no document overflow; period counts and totals unchanged.
- [x] 16 Insights/Kit browser regressions, 40 chart screenshots (including eight scrolled-right views), and all seven exact-head CI checks passed on `24a1bd99`: [workflow #41264973064](https://github.com/Mymayankyadav/lemma/actions/runs/41264973064).
- [x] All 40 current-head chart PNGs SHA-256-identical to the visually reviewed preceding head; unobscured final-period ticks confirmed.
- [ ] Independent Auditor CLEAR on the final head, then standalone Ready and Steward squash merge.

**Important:** the evidence above is for `24a1bd99`; any later commit,
including this documentation update, requires fresh exact-head CI. Do not
mistake an older green run for final merge clearance.

No database, connector or contract changes. No tests or thresholds weakened.

Assisted-by: ChatGPT (OpenAI)
