# November v2 UI implementation

The comparisons use a 390 × 844 phone viewport in the Night theme and an account clock fixed at Mon 9 Nov 2026, 13:43 IST. The left side uses the plan’s source commit, `24c8a225`. The right side uses the implementation branch with the rollout features enabled for their scenes.

| Screen | Comparison |
|---|---|
| Today | [Before and after](today.jpg) · [First run](today-first-run.jpg) |
| Atlas | [Before and after](atlas.jpg) · [List](atlas-list.jpg) · [Peek](atlas-peek.jpg) |
| Tutor | [Before and after](tutor.jpg) · [Reading](tutor-reading.jpg) · [Scratch](tutor-scratch.jpg) |
| Path | [Before and after](path.jpg) · [Checkpoint](checkpoint.jpg) |
| Calendar | [Before and after](calendar.jpg) · [Week](calendar-week.jpg) · [Month](calendar-month.jpg) |
| Review | [Before and after](review.jpg) · [Empty](review-empty.jpg) · [Nothing due](review-nothing-due.jpg) · [Direct results](review-done.jpg) |
| Progress | [Before and after](progress.jpg) |
| Settings | [Before and after](settings.jpg) · [Tutor](settings-tutor.jpg) |

Additional frames show [Capture](capture-sheet.jpg), the [card editor](card-editor.jpg) and the [offline banner](offline.jpg). The [measurement export](measurements.json) also contains scenes without a comparison image. The runner uses the same browser checks as the design lint. Word counts depend on font loading, clipping and scene data. The source audit used an earlier version of the helper.

The N211 regression captures are grouped under [records](regressions-records.jpg), [interactions](regressions-interactions.jpg) and [layout](regressions-layout.jpg).

| Measure | Captured | Plan target |
|---|---:|---:|
| Atlas map clear area | 92.5% | ≥ 92% |
| Atlas map drawn extent | 60.4% | ≥ 60% |
| Atlas list chrome | 122 px | ≤ 132 px |
| Calendar hub chrome | 118 px | ≤ 132 px |
| Today words | 47 | ≤ 60 |
| Checkpoint words | 59 | ≤ 60 |
| Calendar Month words | 59 | ≤ 60 |
| Capture words | 17 | ≤ 25 |
| Path words | 60 | ≤ 60 |
| Progress words | 50 | ≤ 50 |

The plan’s owner visual approval is pending.
