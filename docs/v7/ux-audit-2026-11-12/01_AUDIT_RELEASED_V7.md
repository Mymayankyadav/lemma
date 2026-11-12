# Audit of the released Lemma v7

**What was audited:** the build live at `mymayankyadav.github.io/lemma/` on 12 Nov 2026 (repository commit `bcc04a3`, v7 "Constellation" on by default). A local build of that commit produces the same entry file as the live site (`index-BQXxHQcq.js`), so the sweep ran locally and the performance figures were taken from the live site.

**How:** the example workspace, clock fixed at Thu 12 Nov 2026 13:43 IST, 47 scenes (every v7 route plus its sheets and scroll positions) on 12 device profiles, 810 frames in all. I looked at every phone Day and Night frame and at the key screens of every other profile, then checked each suspected defect in the page itself (text, geometry, computed styles) and, where it was quick, in the source.

| Profile | Size | Why |
|---|---|---|
| Phone Day, Phone Night | 390 × 844 | The approved golden size |
| Android common | 360 × 800, Night | The most common Android width |
| Android large text | 360 × 800 at 130% text | Android users who raise the system font size |
| Android large phone | 412 × 915 | Pixel-class |
| Small | 320 × 640 | Minimum supported |
| Landscape | 844 × 390 | The Android app allows rotation |
| Foldable | 673 × 841 | Unfolded inner screen |
| Tablet | 820 × 1180 | Portrait tablet |
| Desktop Day, Night | 1280 × 800 | Common laptop |
| Wide | 1728 × 1000 | Large display |

> **Status on `1a67b04` (re-checked 12 Nov 2026, evening).** V01 and V04 are fixed (N125); V12 is fixed for the app itself (N123); V20 is half fixed (N124). Everything else re-measured as open. V43 is new. Re-check values: `evidence/recheck.md`; summary: `00_UPDATE_AFTER_ANDROID_BUILD.md`. With the two fixes, phone rises from 7.44 to 7.48 (7.5 rounded) and desktop from 6.85 to 6.88 (6.9 rounded).

**Not tested (so not scored):** a busy account, signed-in live data, physical devices, screen readers, real notifications, the installed Android app in use. The 130% text profile scales the page's root font size; an Android WebView's text zoom scales text only, so those results must be confirmed on a device.

Evidence is in `visuals/02`–`04` (annotated) and `evidence/` (source clips, contact sheets, measurements).

---

## 1. Verdict

| | First audit | Now | Release target |
|---|:-:|:-:|:-:|
| Phone (Day and Night) | 5.9 | **7.4** | 8–8.5 |
| Desktop 1280 | not scored | **6.8** | not set |
| Android conditions (360 px, 130% text) | not scored | **5.5** | not set |

The redesign worked. The app now reads as one product: one menu, one sheet anatomy, one grade language, grouped-list Settings, exact counts, covers that hold their size. On a phone it is a calm, scholarly tool that a stranger would trust for most of a session.

It is not yet at the target for three reasons, in order of weight:

1. **A few screens print wrong information.** Chart axes read "0 min" on every tick (V01), the Today strip is drawn against the wrong hours (V02), and the same quantity has two values one tap apart (V03). These are small in code and large in trust.
2. **Large screens were released without their own approval, and it shows.** The count badge covers the word "Review" in the rail, the path's main action slides under the rail, a page scrolls sideways, charts double their type size, and the review card is 1,184 px wide (V05–V10).
3. **The web layer is not ready for Android users.** At 360 px with text at 130% the dock labels collide, calendar hours lose a digit and a Focus control leaves the screen (V11). The installed Android app still carries the pre-v6 icon, colours and store screenshots (V12).

Several findings from the first audit are still open by decision or by time: Calendar Day chrome (F10), Close the day (F70), the path "map" (F56), Search (F74), first run (F73), the almanac (F44). They are restated below with new numbers so one list covers everything.

Scores by screen group are on `visuals/01-scorecard.jpg`.

---

## 2. What to protect

| # | Strength | Evidence |
|---|---|---|
| P1 | **One system.** Menus, sheets, steppers, chips and grades are the same component everywhere. | All 47 scenes |
| P2 | **Night is a finished theme**, not an inverted Day: raised surfaces, an indigo data ramp, readable events. | Phone Night frames |
| P3 | **Mathematics is typeset**, on cards, in the inbox and in plan diffs. | Review, Inbox |
| P4 | **Every chart has a sentence and a table.** Rare, and exactly right for a study record. | Progress, Review |
| P5 | **Robust basics.** No script errors in 810 frames. No sideways scroll at 320, 360, 390 or 412 px at normal text size. 91% of controls have a true hit area of 44 px or more, because the kit extends small chips invisibly. Safe-area insets are handled throughout. | `evidence/measurements.md` |
| P6 | **Undo everywhere**, with one quiet toast. | Inbox, Tasks, Settings |
| P7 | **Emblem covers** on Paths: the brand, used with restraint. | Paths |
| P8 | **Inbox on desktop** (queue beside the decision) and **Atlas on desktop** (labels have room) show what large screens can be. | Desktop frames |
| P9 | **Settings**, rebuilt as grouped lists with current values, is the largest single improvement (4 → 8). | Settings |
| P10 | **Keyboard**: ⌘K search, `?` for shortcuts, number keys in review. | Shell, Review |

---

## 3. Findings

Severity: **Major** (a new user would notice, or the screen says something untrue), **Moderate**, **Minor**. "Cause" is given only where I confirmed it in the code. F-numbers refer to the first audit.

### 3.1 Major

**V01 · Chart value axes read "0 min" on every tick.** Progress › Time, 30 days: the page text is "0 min, 10 min, 20 min, 30 min, 40 min" but all five display as "0 min"; Overview shows "20 min" and "40 min" the same way. The label's first digit falls outside the chart's clipped box (labels start at x = 9–10 px, the chart box at 16 px). *Fix:* size the left gutter from the longest formatted tick; never clip axis text. *Test:* every tick label's box lies inside the chart's box. Board 02. **Fixed in N125:** the gutter now fits the widest label.

**V02 · The Today strip is drawn against the wrong hours.** The strip spans the planning window (08:00–22:00 here) but prints five labels, 08 to 20, spread edge to edge, so "20" sits where 22:00 is. The 15:00 block is drawn exactly under "14"; marks later in the day are up to two hours off. *Cause:* `stripHours()` in `src/features/home/v7/todayModel.ts` returns labels every three hours and stops before the window's end; `.v7-today-hours` uses `justify-content: space-between`. *Fix:* place each label at its own percentage; or adopt the ruler (S1). Board 02.

**V03 · One number, two values.** Practice is "0 of 1" on Today and "0 of 2" on Close the day. The review estimate is "about 9 min" on Today and "About 10 min" on Review. (F05 was fixed for card counts; these two remain.) *Fix:* one selector per metric, used by both screens; a test that renders both and compares.

**V04 · Selected duration chips show two ticks.** "✓ ✓ 50 min" in New block, "✓ ✓ Custom" in New time block. The chip renders its own tick and the kit's selected state adds one. Filter chips elsewhere are correct. **Fixed in N125.**

**V05 · Desktop rail: the count badge covers the word "Review".** On every page at 1280 px and wider. Board 03.

**V06 · Desktop and tablet: "Continue with tutor" slides under the rail.** The pill is centred on the window, not on the content column: at 1280 px it spans x = 183–409 while the rail covers 0–262, so it reads "nue with tutor". Same at 820 px. Board 03.

**V07 · Desktop: Card detail is 31 px wider than the window.** `.v7-detail-header` runs from the rail edge to 1,311 px; the page scrolls sideways and the ⋯ menu is half off-screen.

**V08 · Desktop: chart text grows with the window.** Charts are drawn in a 360-unit box and stretched: axis text is 19 px tall on a 460 px chart and 38 px on a 936 px chart, against 16 px body text. Affects Recall over time, Due each day and the card's recall chart, where "target 90%" overprints the line.

**V09 · Desktop: the review card is 1,184 px wide** (1,640 px at 1728). The answer is a single line of about 150 characters; the grade buttons are 86 px wide and 250 px below it. The kit has a `reading: 68ch` token this screen does not use.

**V10 · Desktop: Settings is below the fold of the rail.** At 1280 × 800 on hub pages the rail's Settings link starts at 792 px. The gear icon exists only on Today.

**V11 · At 360 px with text at 130%, core controls collide or leave the screen.** Dock labels run together ("ReviewCalendarProgress"); calendar hours lose their first digit ("12:00" reads "2:00"); in Focus the intention is clipped and the Drifted button is pushed past the right edge; Capture's type switch overlaps ("Time blocCard"); the Progress total wraps to two lines and the range switch wraps inside its segments. Emulated; confirm on a device. Board 04.

**V12 · The installed Android app and the store still show the old product.** `android/app/src/main/res/drawable/ic_launcher.xml` is the pre-v7 mark; its colours are `#FAFAF6` and `#13171D` (v7 uses `#F8F5F0` and `#091023`); the status-bar icon is the old mark; the eight Play screenshots in `docs/android/shots/` and the two install-dialog screenshots in `public/screenshots/` show a pre-v6 design. `index.html` also sets the v6 colours before the app loads. Board 04. **Mostly fixed in N123:** the Capacitor app has the v7 icon family, themed icon, status-bar mark and colours. Still stale: the install-dialog screenshots and labels, and `index.html`'s pre-paint colours. The Play screenshots no longer matter (no Play Console).

**V13 · Calendar Day gives the day 46% of the screen** (F10, recorded as open at release). Seven rows of controls take 410 of 844 px; the grid starts at 11:00 and the next block sits near the dock. Concept S7.

### 3.2 Moderate

**V14 · Capture fades on scroll but keeps its slot.** The button goes to opacity 0 and the dock keeps its width, so every scrolled screen has a lopsided bar.

**V15 · Numerals on mid-heat days measure 2.93 : 1 by day and 2.97 : 1 by night** (Calendar Month, the middle heat steps).

**V16 · The study almanac opens 26 weeks in the past.** The scroller starts at May; today is 334 px off-screen to the right. It is 182 buttons of 24 × 24 px, 179 of them empty in this workspace (F44).

**V17 · Plan proposal detail puts Approve left and Reject right**, the opposite of the Inbox plan card and of the kit's rule (F71).

**V18 · Internal codes still surface.** The checkpoint page's collapsed title is "CP4"; plan proposal rows read "CP1 · Foundations · Demonstrated" and "CP4a"; the tutor's reason reads "Same gap in S6 and S7" (F49).

**V19 · Page titles have three voices.** Hubs: large serif. Atlas: small serif, left, in a white bar. Inbox, Card, Plan proposal, Session: bold sans, centred. Hub titles also name the hub, not the tab ("Calendar" above Tasks, "Paths" above Cards, "Progress" above the time log).

**V20 · Motion and haptics are specified but mostly not connected.** `transitionPresets()`, `dismissSheet()` and `interpolateNumber()` in `src/ui/v7/motion.ts` have no callers. `haptic()` is called only from the Inbox and the Calendar drag; the defined `grade`, `gradeAgain`, `complete` and `sheetThreshold` events are never fired by a screen. **Half fixed in N124:** Motion v1 is in (in CSS); the three helpers are still unused and haptics still fire only in the Inbox and calendar drags.

**V21 · First load is heavy for a phone.** Today, cold, example workspace: 76 requests, about 620 KB transferred (447 KB script, 112 KB fonts, 60 KB styles). With a mid-range phone emulated (4× CPU, 1.6 Mbit/s): first paint about 4.0 s, largest paint about 5.0 s, about 1.0 s of blocked main thread. Emulation, not a device measurement.

**V22 · Landscape on a phone is unconsidered.** At 844 × 390 the app switches to the tablet rail; the review answer is cut after one line; Calendar shows no grid in the first screen. The Android app allows rotation.

**V23 · Tablets and foldables get desktop density or the phone layout.** At 820 px (touch) buttons, fields and search are 40–42 px tall. At 673 px (unfolded) the app shows the phone layout with no list beside detail.

**V24 · Quick focus lists two options called "Open"**: the mode ("No timer, count up") and a preset ("Open-ended study").

**V25 · Close the day is still a form** (F70): three steps of meters and fields, most of each screen empty, no ending.

**V26 · The path "map" is still a list** (F56): 12 checkpoints take three screens; 4 are visible on opening.

**V27 · Atlas on a phone is small.** The three constellations use about a third of the canvas and 5 of 82 stars carry a label; the list is a flat A–Z of 82 rows (F57, F58). On desktop it is good.

**V28 · Search opens with a blank header band and an empty lower half**, five actions and no recents (F74).

**V29 · First run opens with "Connect your tutor"** and a raw connector address, an unnumbered list and a grey Next (F73). The most technical step is the first thing a new person meets.

**V30 · "Reviews by day" is the loudest thing in the app.** Thirty stacked bars in saturated red, amber, green and indigo, against a principle that says "Quiet by default".

**V31 · Tasks spends 390 px before the first task**, and shows "3 overdue" beside "Overdue 2" (the first counts tasks, deadlines and practice; the second only tasks).

**V32 · Unknown addresses silently show Today.** A link to something deleted gives no explanation.

**V43 · Data and account is still the old form** (found in the re-check). Inside a v7 page: 12 px text in seven places, two 14 px headings set in a serif v7 does not load, a 13 px native checkbox, an underlined text link, and "Download a backup" three times in one card. In the Android app its download cannot work (`03_ANDROID_UX_PLAN.md`, AW2).

### 3.3 Minor

| # | Finding |
|---|---|
| V33 | The example workspace's Cards list repeats the same two Linear Algebra cards many times; a visitor reads it as a bug. |
| V34 | Copy: "Times are in Calcutta time"; Subjects rows read "Analysis · glyph ∫"; a tile titled "Tutor sessions" whose value is "18 h 40 min in tutor sessions"; "1.6 h" in a sentence under "1 h 35 min"; the card editor's first helpers are `\newcommand` and `\DeclareMathOperator`. |
| V35 | The cloze highlight uses the danger red (4.13 : 1): red for something that is not dangerous. |
| V36 | True hit area under 44 px: almanac cells (24), "Adjust" (51 × 20), "3 overdue · Triage" (32 tall), "14 due" on path cards (24 tall), narrow tabs (Log 33, Due 35, Atlas 41 wide), time-log days (31–36 wide). 9% of controls at 390 px, 7% at 360 px. Against Android's 48 dp guideline: 45% and 54%. |
| V37 | Inbox triage: three round buttons in two sizes with labels on three baselines. |
| V38 | Card detail: "Thu 12 / Nov" wraps in the Memory tile; the page's pinned primary action is "Edit card". |
| V39 | Sign-in: the construction circle crosses the "Explore the example workspace" link and the note under it. |
| V40 | Session › Things to revisit: "Resolved" is drawn as a button and reads as a status. |
| V41 | The corner emblem on Today and Path shows as two stray stroke fragments (F53). |
| V42 | Calendar Month draws days outside the month like days inside it; Week on a phone shows blocks as a glyph with no title. |

---

## 4. Findings by where they are fixed

| Phase (see `05_PHASES_AND_DECISIONS.md`) | Findings |
|---|---|
| **U0 · Truth** | V02, V03, V14–V18, V24, V32–V35, V37–V40, V42, V43 (V01 and V04 fixed in N125) |
| **U1 · Large screens** | V05–V10, V23 |
| **U2 · Resilience** | V11, V21, V22, V36 |
| **U3 · Room and rhythm** | V13, V19, V26–V31, V41 |
| **U4 · Signature** | V02 (ruler), V25 |
| **A1 · Motion** | V20 (Motion v1 done in N124; haptics remain) |
| **G0 · Refresh what is stale** | V12 (the app part fixed in N123) |

---

## 5. What I could not judge

* **Volume.** The first audit scored the busy account 4.5. The release added scalable pickers, clamping and the Atlas list fallback; none of that was re-tested here.
* **Devices and assistive technology.** No physical phone, no TalkBack or VoiceOver, no hardware keyboard on a phone.
* **Motion as experienced.** Captures were taken with reduced motion on; V20 is from the code.
* **Signed-in behaviour:** real sync, errors from the server, notification delivery.

---

## r3 status (commit `d741617`)

Every finding above was re-measured after N126–N129 and reads as on `1a67b04` (`evidence/recheck-d741617.txt`). The empty states the first audit called “a sentence, not a moment” (F36) now have drawings (N127, N128), and Day closed and Round complete now end with an animation (N129); those are audited in `06_ILLUSTRATION_ANIMATION_ICON_AUDIT.md`. Note for this file's V-numbers: r3 findings use their own prefixes (IL, LT, IC) so nothing here is renumbered.
