## incident #1404 — Today's ruler could show only two labels

`e2e/v7-n161-layout.spec.ts` › "Today's ruler labels never overlap and stay inside the card" failed on main at 360 px / text ×1.3 and 390 px / text ×1.6 (`expected ≥ 3 labels, received 2`).

- **Cause.** Today's ruler window follows the clock (it widens to include now). N161 spaced the labels in whole two-hour steps on a midnight grid; on a phone with large text the step is six hours, and a 14-hour window (for example 10:00–24:00 seen at 16:00) contains only two multiples of six hours (12:00, 18:00). The N161 PR passed in CI late in the evening, when the window was wider; main failed in the afternoon.
- **Fix.** `rulerTicks` (`src/features/home/v7/Ruler.tsx`) keeps the midnight grid whenever it gives three or more labels. When it would give fewer and the window is at least two steps long, labels start at the window's own start instead (10:00, 16:00, 22:00). The label spacing, edge alignment and every other window are unchanged.
- **Tests.** `tests/unit/v7/n161-ruler-labels.test.ts` (new case: at least three labels for every start hour and step, the usual windows unchanged); the failing e2e now passes and `v7-n161-layout` and `v7-n157-finish` pass (33 of 33).
