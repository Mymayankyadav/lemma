# Web plan: from 7.4 to 9

The released app is one codebase for the browser, the installed web app and the Android app, which now shows these same screens in a WebView. The web screens are the source of truth for all three, so everything in this file improves all three, and reaches the phone with the next APK.

> **Revised on `1a67b04`.** V01 and V04 were fixed in N125; Motion v1 landed in N124. U2 is now the most urgent web phase because the Android app is out. Phases are named **U0–U4** so they do not collide with the release plan's R, A and N phases. Finding numbers (V##) refer to `01_AUDIT_RELEASED_V7.md`; sketch numbers (S#) to the boards in `visuals/`.

## 1. Five rules for this round

1. **Say only true things.** A number appears in one place in the code and is formatted in one place. A scale's labels sit where its values are.
2. **Content first in the first screen.** On any page, at least 60% of the first viewport is the thing the page is about (the day, the list, the card), not controls for it.
3. **One layout system from 320 px to 1728 px**, with four named widths (§3), and text that may grow to 200% without losing a control.
4. **Add nothing to the palette.** Every idea below uses existing tokens, the two typefaces, the emblem generator and the mark. No new colour meanings, no new illustration style.
5. **New things arrive behind a flag** (`src/flags.ts`, default off), get an Owner look at a design sheet first, and are hardened once.

---

## 2. U0 · Truth (size M)

Fixes that need no design decision. Each is filed as a bug with a failing test and fixed in the same PR.

| Item | Finding | Done means | Test that fails today |
|---|---|---|---|
| ~~Chart gutters~~ | V01 | **Done in N125** | — |
| Day strip scale | V02 | Each hour label is positioned at its own percentage of the window; the last label is the window's end | For a window of 08:00–22:00, the label "14" is centred within 2 px of 14:00 |
| One source per number | V03 | Practice progress and the review-time estimate each come from one selector used by Today, Review and Close the day | Render Today and Close the day on the same data; values are equal |
| ~~Duration chips~~ | V04 | **Done in N125** | — |
| Dock | V14 | When Capture hides, the bar closes the gap (or Capture does not hide); the bar is always symmetric | Dock's content box is centred within 1 px after scrolling |
| Month numerals | V15 | Each heat step sets its own numeral ink (dark on the light steps, white on the dark ones) so every step is ≥ 4.5 : 1 in Day and Night | Contrast test per step per theme |
| Almanac | V16 | Opens scrolled to today; cells are not individual tab stops (one roving focus); empty weeks before the first study day are not drawn | `scrollLeft` puts today's cell in view on mount |
| Button order | V17 | Reject left, Approve right on the plan proposal page | Order assertion |
| Names, not codes | V18 | Checkpoint's collapsed title is its name; proposal rows read "Foundations · Demonstrated"; tutor text passes through the existing name mapper where it matches a session or checkpoint code | No `/\bCP\d+[a-z]?\b/` or `/\bS\d+\b/` in rendered text of the six learning scenes |
| Quick focus | V24 | Modes and presets are separate groups; no two options share a name | Unique accessible names in the sheet |
| Not found | V32 | Unknown address: "This page isn't in the notebook" with Search and Today | Route test |
| Example data | V33 | The example deck has no repeated cards in the first two screens | Fixture test |
| Copy | V34 | "Times are in India Standard Time" (the zone's display name, not its id); Subjects rows show the mark, not the word "glyph"; the tutor tile reads "18 h 40 min" under "Tutor sessions"; one duration format per screen; the card editor's first helpers are fraction, sum, integral, set braces | Snapshot of the four strings |
| Cloze highlight | V35 | Selection tint and ink, not danger | The colour-jobs lint gains a rule for `.cz` |
| Data and account | V43 | Two grouped lists: *Export* (one row, one sentence, one button) and *Delete account* (the confirm moves into a sheet); body text at the kit's sizes; the kit's checkbox | Design-lint scene for the page; no text under 14 px except captions |
| Small things | V37–V40, V42 | Triage buttons one size on one baseline; "Thu 12 Nov" on one line; the card's pinned action is "Review now" when due, otherwise none; the sign-in circle is clipped behind the text block; "Resolved" is a status with an Undo, or a button labelled "Mark resolved"; out-of-month days are dimmed; Week blocks show a two-word title from 44 px wide | Design-lint rows |

**Acceptance:** boards 02 re-shot clean; the rendered design lint gains the rows above; no assertion removed.

---

## 3. U1 · Large screens (size L)

Desktop and tablet were released without their own approval. This phase gives them a designed layout instead of a stretched one.

### 3.1 Four widths

| Window | Navigation | Content | Notes |
|---|---|---|---|
| under 600 | Dock | One pane, sheets | As today |
| 600–839 | Icon rail | One pane; list beside detail for Inbox, Cards, Paths | New: today this range shows the phone layout |
| 840–1099 | Icon rail | List beside detail; review spread; margin as a sheet | |
| 1100 and over | Full rail (214 px) | Page 720 px max, margin 292 px | Never wider at 1600+; centred |

600 and 840 are also Android's window size class boundaries, so tablets and foldables follow the same rules.

**Height matters too.** Below 480 px tall (a phone in landscape) the rail hides and page headers collapse to one row; see U2.

### 3.2 Items

| Item | Finding | Done means |
|---|---|---|
| Rail | V05, V10 | Counts sit at the right end of their row; Settings is pinned to the bottom and the Library list scrolls above it; Capture is a labelled row with its shortcut; Library rows get icons and the same height as the main five (S11) |
| Floating actions | V06 | Any floating or sticky bar is positioned in the content column, never the window. Path's "Continue" moves onto the current checkpoint card (S8), which removes the pill |
| Detail header | V07 | The header's width is the content column's; no page scrolls sideways at any width from 320 to 1728 |
| Reading measure | V09 | Any block of prose or mathematics is at most 34 em wide. Review uses the two-page spread from 840 px (S6): question left, answer right, grades under the spread with their keys |
| Charts | V08 | Chart text is 12 px at every width and strokes do not scale; a chart is at most 640 px wide; on wide pages charts sit two abreast (S13) |
| Tasks | — | From 900 px: three columns, To do, Doing, Done; drag or keyboard move between them (S12) |
| Settings | — | From 840 px: the index stays on the left, the section opens on the right; row values stay within 320 px of their labels |
| Touch density | V23 | Control heights follow the input, not the width: the full touch size (44 px on the web, 48 px in the Android app, see U2) at every width; 40 px only for a fine pointer (`@media (pointer: fine)`) |
| The margin | — | The page-and-margin layout on Path, Checkpoint, Session, Card and Review (S11). Flag `v7Margin` |

### 3.3 The margin (S11)

A 292 px column to the right of the page, separated by a 2 px rule in the margin colour already used by the icon. It holds only things that exist today behind links: the tutor's notes on this path or step, parked thoughts, sources and page ranges, "why this card", the last reviews, the day's agenda beside the calendar. Nothing in the margin is needed to complete a task, so hiding it (key `M`, remembered per device) never blocks anyone. Below 1100 px the same content opens as a sheet from one "Margin" button in the header. Screen readers meet it as a complementary landmark named "Notes".

**Acceptance:** board 03 re-shot clean; a browser test at 1280 and 1728 asserts no element crosses the rail, no horizontal scroll, prose blocks ≤ 34 em, chart text 12 px; Owner approves desktop goldens for Today, Review, Path, Calendar, Inbox and Progress (decision E2).

---

## 4. U2 · Resilience (size M) — the most urgent phase

The Android app is out and shows these screens. This phase makes the web layer hold under the conditions Android users bring. It is Android phase AN2 in `03_ANDROID_UX_PLAN.md`.

| Item | Finding | Done means |
|---|---|---|
| Text scale | V11 | Every v7 scene passes at 100%, 130% and 200% text at 360 and 390 px: no overlapping labels, no clipped text, no control off-screen. The design lint gains a "360 at 130%" pass |
| Dock at large text | V11 | When labels would exceed their slot the dock shows icons with the selected tab's label only; names remain for assistive technology |
| Gutters that hold text | V11 | The calendar's time gutter, chart gutters and tile labels size from their content (`max-content` or measured), never a fixed pixel width |
| Rows that wrap | V11 | Focus's thought field and Drifted button stack when they cannot share a row; segmented controls with more than three options become a menu when their labels do not fit |
| Touch size | V36 | The kit's `touch` token is 44 px on the web and 48 px in the Android app (set from the platform flag), which lifts the "under 48" share from about half to under 5%. The six controls under 44 px are fixed in both |
| Landscape | V22 | Below 480 px tall: headers collapse to one row, sheets go full height, the review card scrolls inside itself with grades pinned. Focus gets the desk clock (S16) |
| First load | V21 | Today's first load requests only Today: review, atlas, calendar and KaTeX fonts load on demand; the example data loads only in the example workspace. Target: ≤ 350 KB and ≤ 30 requests on Today cold; largest paint ≤ 2.5 s under the same emulation (now about 5 s). Budgets are Owner-set; this plan proposes numbers, it does not change `ci/` |
| Boot colours | V12 | `index.html`'s pre-paint colours and theme-colour meta use the v7 page colours for the v7 shell |

**Acceptance:** board 04 (left half) re-shot clean; a device check by the Owner on the Android app with the system font at its largest setting.

---

## 5. U3 · Room and rhythm (size M)

Screens whose first viewport is mostly controls, and three flows that start in the wrong place. Each sub-item is behind `v7Room` until its sheet is approved.

| Item | Finding | Sketch | Done means |
|---|---|---|---|
| Calendar Day | V13 | S7 | One title row (date with arrows, a view menu); the week strip with a load mark per day; suggestions drawn in the grid as dashed blocks that one tap accepts; overdue as a chip on the grid. The grid has ≥ 75% of the viewport (now 46%) and opens scrolled so "now" is in the upper third |
| Tasks | V31 | — | Banner, switch and filters fit in ≤ 200 px (now 390); "3 overdue" names its parts ("2 tasks, 1 practice") |
| Path spine | V26 | S8 | A strip under the title shows every checkpoint as a star grouped by stage; finished stages fold to one row; the list opens at the current checkpoint; "Continue" sits on that card. The drawn map of A4 can later replace the strip without changing the page |
| Search | V28 | S9 | The field is the header; "Jump back in" shows the last three things opened on this device; actions are chips; results below. The same component is the desktop command bar |
| First run | V29 | — | Order becomes: 1 what are you studying (or explore the example), 2 your rhythm (minutes a day, day start), 3 connect your tutor, with "Open Claude" and "Open ChatGPT" buttons, a copy field instead of a raw address, numbered steps, and a "Connected" confirmation when the first tool call arrives. Skippable at every step |
| Atlas on a phone | V27 | S10 | Opens fitted to the last-studied constellation with every star in it labelled; chips light subsets (Tonight, Shaky, Demonstrated); the list is grouped by subject with a sticky letter index |
| Header voice | V19 | — | Every page title is serif. Hubs: large, then collapsing. Detail pages: the item's name (never a code or a type word), left-aligned after the back arrow. A hub's title is the selected tab's name |
| Review chart | V30 | — | "Reviews by day" uses one ink ramp for Hard, Good and Easy and keeps colour only for Again, so the chart is quiet and lapses still stand out |
| Hero emblem | V41 | — | The corner emblem is either a whole tile-tier drawing or absent; never a cropped fragment |

**Acceptance:** the "measured targets" table on board 07; golden phone screens re-approved for Calendar Day and Path (they are two of the six).

---

## 6. U4 · Signature (size L, design-led)

Three ideas that come from Lemma's own icon (a ruler-straight grid, a margin rule, an ℓ, a ∎) and three smaller ones. Each has its own flag and starts with an Owner-approved sheet.

### S1 · The ruler (flag `v7Ruler`)
Replaces the Today strip. A ruler with a tick for every half hour and a label on every second hour, positioned by value. Blocks sit on the ruler in their subject colour, finished ones in grey; an indigo needle marks now. Dragging the needle previews "next at 17:00" in the card above and snaps to five minutes, with a light haptic tick per step on Android. The same ruler is the duration slider in New block, the time scrubber on Calendar Day, and the Next step widget's timeline (board 09). Accessible as a slider with spoken times.

### S2–S4 · The ∎, one ending everywhere (flag `v7Qed`)
The end-of-proof square on the icon becomes the single mark of completion.

* **Tick → ∎.** A task's checkbox shrinks from a rounded box to the square and stays (240 ms; final frame only under reduced motion).
* **Close the day** becomes one page written like a proof: *Given* (planned minutes, cards due), *Shown* (what was done, each line with a ∎), *Left open* (loose ends, each with its two actions), *Tomorrow opens with*. One button: "Close the day ∎". It uses the data the three-step ritual already reads; the three steps remain as the reduced-motion and keyboard path only if the Owner prefers.
* **Day closed** shows the ∎, the day's three numbers and the week as a constellation that gains today's star. "Share the page" exports the screen as an image.
* **Elsewhere:** round complete (the progress line closes with ∎), inbox zero, checkpoint demonstrated (∎ joins its star), path finished ("Q.E.D." with the emblem drawn whole).
* **Rules:** indigo only; one per screen; only for something the learner finished; spoken as "done".

This replaces four commissioned ending animations (L‑10 to L‑13) with one coded mark under 1 KB.

### S5–S6 · Review as an open notebook (flag `v7Spread`, `v7Scratch`)
* **Phone:** answer in full ink at reading size; grades directly under the card; one thin progress line that closes with a ∎; the confidence you gave shown as a quiet line.
* **Spread (840 px and wider, and book posture):** question on the left page, answer on the right, each ≤ 34 em; before the reveal the right page is blank paper. Grades under the spread with their keys.
* **Scratch paper (opt-in):** before "Show answer", a sheet of graph paper for an attempt: finger, stylus (pressure where available) or keyboard. After the reveal it sits beside the answer; grading discards it. Local and temporary; nothing is stored. Keeping an attempt as a page for the tutor is a later step tied to the scanner work in N4.

### S14 · Paper and sky (flag `v7Paper`)
Appearance gains one choice per theme: paper *Plain, Graph, Dot, Ruled* by day; sky *Clear, Stars* by night. Tileable SVG under 4 KB each, drawn at 7% ink so text contrast is unchanged; off under "Reduce effects". It gives people a way to make the notebook theirs without touching a colour that has a job.

### S15 · The week page
The weekly digest becomes a page in the app (and the share image): the week's constellation, hours, cards, checkpoints, one line from the tutor. It is the Sunday notification's destination.

### S16 · Desk clock (flag `v7DeskClock`)
Focus in landscape, or with one tap in portrait: large digits, the session's intention, a ring that fills per pomodoro, nothing else. The screen stays awake while a session runs (Screen Wake Lock, released on pause, finish or when the page hides). Tap anywhere for controls. This is also the tabletop layout on foldables (board 11).

### Errata and empty states (no flag; copy and marks)
Mathematical books have errata, not error pages. Failures read "Erratum: this page didn't load. Try again." with the existing alert style. Offline reads "Working from your notebook · as of 14:05". Empty results use ∅ ("No cards match"), finished states use ∎, and "nothing yet" states use one compass construction from the emblem generator. No second illustration style enters the product (see `04_ASSETS_AND_MOTION_PLAN.md` §4).

**Acceptance for U4:** each flag has a sheet approved by the Owner, a reduced-motion equivalent, a keyboard path, and a line in the design lint; turning any flag off restores the released screen with no data change.

---

## 7. What this plan deliberately does not do

* It does not change the kit's colours, type sizes or radii.
* It does not add dependencies or touch the server.
* It does not redesign Inbox, Settings, the review hub or Paths, which are the strongest screens.
* It does not add streaks, badges or scores; Lemma's word is rhythm.
