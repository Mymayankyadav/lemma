# r3 desktop and U3 review candidates

PR #1392 · N157 · Agent: chat-42#q8rm. These are review candidates, not Owner-approved goldens.

The real demo app at 1280 × 800 (desktop) or 390 × 844 (phone), Day and Night, en-IN, Asia/Kolkata, fixed at 9 November 2026 13:43. Reduced motion; device scale 1. Each image waits for loaded content and fonts. The harness blocks service workers and dismisses the resulting offline-install notice. No application content is replaced.

Desktop opts into `v7Shell,v6Shell,v7Room,v7Margin,v7Spread`. Phone after opts into `v7Shell,v6Shell,v7Room`; before omits `v7Room`. Every new flag still defaults off.

## Six desktop screens

| Screen | Day | Night |
|---|---|---|
| Today | [Day](desktop-today-day-after.png) | [Night](desktop-today-night-after.png) |
| Review | [Day](desktop-review-day-after.png) | [Night](desktop-review-night-after.png) |
| Path | [Day](desktop-path-day-after.png) | [Night](desktop-path-night-after.png) |
| Calendar | [Day](desktop-calendar-day-after.png) | [Night](desktop-calendar-night-after.png) |
| Inbox | [Day](desktop-inbox-day-after.png) | [Night](desktop-inbox-night-after.png) |
| Progress | [Day](desktop-progress-day-after.png) | [Night](desktop-progress-night-after.png) |

Review shows an answer revealed in the spread. Path shows the margin. Calendar shows Day explicitly; the desktop default remains Week.

## U3 phone changes

| Screen | Day before | Day after | Night before | Night after |
|---|---|---|---|---|
| Calendar | [Day before](phone-calendar-day-before.png) | [Day after](phone-calendar-day-after.png) | [Night before](phone-calendar-night-before.png) | [Night after](phone-calendar-night-after.png) |
| Path | [Day before](phone-path-day-before.png) | [Day after](phone-path-day-after.png) | [Night before](phone-path-night-before.png) | [Night after](phone-path-night-after.png) |

| Screen | Day | Night |
|---|---|---|
| Tasks | [Day](phone-tasks-day-after.png) | [Night](phone-tasks-night-after.png) |
| Atlas | [Day](phone-atlas-day-after.png) | [Night](phone-atlas-night-after.png) |
| Search | [Day](phone-search-day-after.png) | [Night](phone-search-night-after.png) |
| Welcome | [Day](phone-welcome-day-after.png) | [Night](phone-welcome-night-after.png) |

[Layout measurements](measurements.json) record horizontal overflow and Calendar grid share. Phone Calendar after gives 78.2% to the grid at this size (before: 62.0%).

## Reproduce

Build with `VITE_ALLOW_FLAG_OVERRIDES=1 VITE_FLAGS=-v6Shell,-v7Shell npm run build`, serve preview on port 4173, then run `node scripts/v7/r3-review.mjs`. Set `CHROMIUM_PATH` only when using a system Chromium.

## Acceptance

The Owner’s six desktop approvals and Calendar Day / Path phone re-approval are still pending. These files supply the missing evidence; they do not grant approval or turn flags on. Physical Android, TalkBack, foldable and system-font checks stay on the device checklist.
