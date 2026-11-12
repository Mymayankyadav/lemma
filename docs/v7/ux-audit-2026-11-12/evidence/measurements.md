# Measurements

All numbers were taken on 12 Nov 2026 from the build of repository commit `bcc04a3` (entry file `index-BQXxHQcq.js`, the same file the live site serves), in headless Chromium, with the example workspace (`?demo=1`), locale en-IN, time zone Asia/Kolkata and the clock fixed at 13:43 on Thu 12 Nov 2026. Scripts are in `tools/`.

## 1. The sweep

47 scenes × 12 profiles = 564 scene loads, 810 frames.

| Profile | Viewport | Theme | Frames | Script errors | Sideways overflow |
|---|---|---|--:|--:|---|
| phone-day | 390 × 844 | Day | 69 | 0 | none |
| phone-night | 390 × 844 | Night | 69 | 0 | none |
| android-360-night | 360 × 800 | Night | 70 | 0 | none |
| android-360-day-font130 | 360 × 800, root font 130% | Day | 70 | 0 | Progress, 2 px |
| android-412-day | 412 × 915 | Day | 65 | 0 | none |
| small-320-day | 320 × 640 | Day | 72 | 0 | none |
| landscape-night | 844 × 390 | Night | 72 | 0 | none |
| fold-night | 673 × 841 | Night | 68 | 0 | none |
| tablet-day | 820 × 1180 | Day | 59 | 0 | none |
| desktop-day | 1280 × 800 | Day | 67 | 0 | Card detail, 31 px |
| desktop-night | 1280 × 800 | Night | 67 | 0 | Card detail, 31 px |
| wide-day | 1728 × 1000 | Day | 62 | 0 | none |

Scenes: Today (and its Quick focus, Capture and Search sheets), Focus, Review hub, a review round before and after the answer, Practice, Tasks, Close the day (three steps), Calendar Day / Week / Month / Agenda and its three sheets, Atlas map and list, Paths, New path, Path, Checkpoint, Session, Cards, Card, card editor, Inbox (stack, list, plans), Plan proposal, Progress (Overview, Learning, Time), Time log, Settings (index and five sections), Sign-in, first run, an unknown address.

## 2. Touch: true hit areas

For each visible control on 20 screens (first viewport), a point 22 px (and 24 px) from its centre was tested to see whether it still lands on the control. This counts the kit's invisible hit-area extensions, which a plain size measurement misses.

| Viewport | Controls | Hit area under 44 px | Under 48 px |
|---|--:|--:|--:|
| 390 × 844 | 414 | 39 (9%) | 185 (45%) |
| 360 × 800 | 390 | 26 (7%) | 210 (54%) |

Under 44 px: almanac cells 24 × 24; time-log day cells 31–36 wide; "Adjust" 51 × 20; "3 overdue · Triage" 133 × 32; "14 due" on path cards 49–56 × 24; tabs "Log" 33, "Due" 35, "Atlas" 41, "Time" 42 wide.

At 820 px wide (touch): primary buttons, fields and pickers are 42 px tall; search fields 40 px.

## 3. Contrast (computed from rendered styles)

| Where | Ratio | Needed |
|---|--:|--:|
| Calendar Month: numerals on the middle heat steps | 2.93 : 1 (Day), 2.97 : 1 (Night) | 4.5 : 1 |
| Card editor: "Checkpoint · Optional" label | 3.36 : 1 (Day), 3.09 : 1 (Night) | 4.5 : 1 |
| Cloze highlight (danger ink on danger tint) | 3.91–4.13 : 1 | 4.5 : 1 |

No other body text failed on the 47 scenes in either theme (text over images or gradients was not measured).

## 4. Geometry behind the findings

| Finding | Measurement |
|---|---|
| V01 | Chart box starts at x = 16 px; tick labels "20 min" and "40 min" start at x = 10 and 9 px; "0 min" at 16 px. Page text of the Time chart's ticks: 0, 10, 20, 30, 40 min |
| V02 | Strip window 08:00–22:00 (14 h). Labels 08, 11, 14, 17, 20 centred at 7, 85, 162, 239, 317 px of a 324 px strip. "Now" (13:43) at 40.8%; the 15:00 block at 50.0% (162 px, under "14") |
| V03 | Today: "Practice 0 of 1", "about 9 min". Close the day: "Practice 0 of 2". Review: "About 10 min at your pace" |
| V05 | Rail "Review" row: badge overlaps the label's first glyph at 1280 and 1728 px |
| V06 | "Continue with tutor" spans x = 183–409 px; the rail covers 0–262 px (1280 px window) |
| V07 | Document width 1,311 px in a 1,280 px window; `.v7-detail-header` spans 217–1,311 px; the ⋯ button spans 1,259–1,303 px |
| V08 | Chart view box 360 × 224. Rendered width 460 px → axis text 19 px tall; 936 px → 38 px |
| V09 | `.v7-review-card` is 1,184 px wide at 1280 px |
| V10 | Rail "Settings" link: top 792 px, bottom 840 px in an 800 px viewport (hub pages) |
| V13 | Calendar Day: first hour line at 410 px of 844; dock from about 800 px; grid ≈ 46% of the viewport |
| V14 | Dock 12–378 px; tabs 13–325 px; Capture 325–373 px at opacity 0 after scrolling down, 1 after scrolling up |
| V16 | Almanac scroller: scrollLeft 0, scrollWidth 704, clientWidth 358; today's cell at x = 692 px; 182 cells |

## 5. First load (live site, cold cache, example workspace)

| Route | Condition | Requests | Transferred | First paint | Largest paint | Blocked main thread | Layout shift |
|---|---|--:|--:|--:|--:|--:|--:|
| Today | no throttling | 76 | 621 KB | 2.7 s | 3.1 s | 0.2 s | 0 |
| Today | 4× CPU, 1.6 Mbit/s, 150 ms | 76 | 621 KB | 4.0 s | 5.0 s | 1.0 s | 0 |
| Review | same | 75 | 584 KB | 4.1 s | 6.0 s | 1.2 s | 0.065 |
| Atlas | same | 61 | 563 KB | 4.0 s | 4.7 s | 0.8 s | 0 |

Today's 621 KB: 447 KB script (largest: entry 147 KB, example data 81 KB, React 39 KB), 112 KB fonts (three files), 60 KB styles. The example-data chunk is not loaded for a signed-in account. Timings went through this environment's network proxy and an emulated phone; treat them as indicative. The release record's own figure for Today is 586 KB.

## 6. From the source

* `transitionPresets`, `dismissSheet` and `interpolateNumber` (`src/ui/v7/motion.ts`): no callers outside that file.
* `haptic()` callers: `InboxV7.tsx` (4) and `calendar/v7/DayGrid.tsx` (2), plus one in the kit gallery. The events `grade`, `gradeAgain`, `check`, `complete`, `sheetThreshold` and `destructive` are defined and not fired by any screen.
* Android wrapper: `ic_launcher.xml` and `ic_stat_lemma.xml` are the earlier mark; `colors.xml` holds `#FAFAF6`, `#13171D`, `#1B2A41`; `twa-manifest.json` theme colours `#FAFAF6` / `#13171D`.
* `index.html` pre-paint colours: `#FAFAF6` and `#13171D`; the manifest's are `#F8F5F0`.
* Install-dialog screenshots (`public/screenshots/`) and Play screenshots (`docs/android/shots/`) were last changed on 8 Nov 2026 and show a pre-v6 design.

## 7. Method notes and limits

* Captures used reduced motion, so motion findings come from the source, not from watching.
* The 130% profile sets the page's root font size to 130%. An Android WebView's text zoom enlarges text without enlarging containers sized in pixels, so real results may differ; the direction of the finding (fixed-width slots cannot hold larger text) holds either way.
* Hit-area and contrast checks cover what is visible in the first viewport of each scene, not content reached only by scrolling or interaction.
* An "Offline app setup failed" toast appears if the browser refuses the service worker (it did in a first run that blocked service workers). The captures here allow service workers, as a normal browser does.
