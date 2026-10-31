# Screens to capture for visual review (QA-4)

Capture every row at 393 × 873 (2×) and 360 × 780, in night and day, for the default demo (`?demo=1`) and the stress demo (`?demo=stress`). Take a viewport shot, and a full-page shot where the page scrolls.

| Name | Route | Interaction before the shot |
| --- | --- | --- |
| today | `#/` | — |
| paths | `#/projects` | — |
| new-project | `#/projects/new` | — |
| project-path | `#/p/real-analysis` | — |
| project-sessions | `#/p/real-analysis?tab=sessions` | — |
| project-sources | `#/p/real-analysis?tab=sources` | — |
| checkpoint | `#/p/real-analysis/cp/CP4` | — |
| session | `#/s/real-analysis/7` | — |
| proposals | `#/proposals` | — |
| plan-change | `#/proposals/proposal-6` | — |
| review | `#/review` | — |
| review-run | `#/review/run` | — |
| review-run-answer | `#/review/run` | press "Show answer" |
| review-done | `#/review/done` | — |
| cards | `#/cards` | — |
| card | `#/cards/1` | — |
| atlas | `#/atlas` | — |
| atlas-selected | `#/atlas` | Find an idea → "Compactness" → choose it |
| atlas-details | `#/atlas` | as above, then Details |
| atlas-all | `#/atlas` | Fold to depth → All |
| insights | `#/insights` | — |
| settings | `#/settings` | — |
| sign-in | `#/sign-in` | — |

In the stress profile, `#/p/real-analysis` is the 36-checkpoint plan without stages: the owner's Algebra 1 shape.

Note: `scripts/review-shots.mjs` still throws "Expected all 15 generated themes" because only `graph` and `graph-night` remain. QA-4 rewrites it around this list.
