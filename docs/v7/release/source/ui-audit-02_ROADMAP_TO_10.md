# Lemma: roadmap from 6/10 to 10/10 (Part B)

This turns the findings in `01_VISUAL_AUDIT.md` into a plan. It is design direction only, with no code. Finding IDs (F##) link back to the audit; motion (M-…), Lottie (L-…), illustration (IL-…) and icon (I-…) IDs link to `03_MOTION_AND_ASSETS.md`.

---

## 1. The score ladder

| Phase | Theme | What changes | Expected score |
|---|---|---|:-:|
| **0** | **Stop looking broken** | ActionSheet rebuilt (F01); native forms replaced (F02); missing glyphs drawn (F08); swipe and toast states (F07, F13, F40); z-order contract (F04); one due count (F05); chart tick thinning (F06). | **7.0** |
| **1** | **One system** | Serif titles everywhere (F15); new numeral style (F16); colour semantics table enforced (F20–F23); one grade language (F22); sheet templates (F17); controls unified (F14, F32–F35, F37); Settings rebuilt as grouped lists (F03); date and time formatter (F51); copy pass (F43, F49, F50). | **8.0** |
| **2** | **Room to breathe** | Collapsing headers (F11, F18); Calendar header compacted (F10); one bottom action layer; box-in-box removed (F31); alignment grid (F30); Night data palette and calendar surfaces (F24, F25); empty states with illustrations (F36). | **8.7** |
| **3** | **Signature moments** | Atlas as a living sky (F12, F57); path map as a real map (F56); endings with ceremony (F55, F70); focus timer with an orbit (F38); emblem system v2 (F27); motion language shipped (all M-…). | **9.4** |
| **4** | **Holds at any scale, on any device** | Volume patterns (F75–F78); tablet and desktop layouts designed, not stretched; real-device font and OLED tuning; performance budgets for motion; a design QA checklist in every PR. | **10** |

**Rule of thumb:** phases 0 and 1 are mostly *removing* inconsistency, so they are cheap and give the biggest jump. Phases 2 and 3 are where the design team's craft turns the app from "good" into "remarkable".

---

## 2. Foundations and component specs

### 2.1 Typography: one voice per job

| Role | Face | Size / line height (phone) | Weight | Notes |
|---|---|---|---|---|
| Display (greeting, hub title) | Serif | 40/44 | Regular | Optical size "display" if the serif has one |
| Page title (detail, settings, first run) | Serif | 30/36 | Regular | **Replaces** the bold sans H1s (F15) |
| Section head | Serif | 22/28 | Regular | "Decks", "Memory", "Goals", "Steps", "Evidence", "History" |
| Sheet title | Serif | 24/30 | Regular | Always preceded by an overline |
| Overline | Sans | 12/16, +0.08em tracking, caps | SemiBold | Context ("QUICK FOCUS", "CHECKPOINT · REAL ANALYSIS") |
| Body | Sans | 16/24 | Regular | |
| Meta | Sans | 13/18 | Medium | Minimum 4.5:1 contrast; never lighter than `text.secondary` |
| Card face (question and answer) | Serif | 19/28 | Regular | **Always serif** for questions, everywhere (F63); answer in `text.primary` (F52) |
| Maths | KaTeX in the serif's companion maths font | inherits | | Keep punctuation glued to the maths (F65) |
| **Hero numeral** | Serif lining figures **or** a display sans at Medium | 56/60 | Regular / Medium | Units at 55% size in `text.secondary`; tabular figures; **never Black weight** (F16) |
| Timer | Same as the hero numeral, tabular | 88/92 | Regular | Digits never move on tick |
| Code and URL | Mono | 14/20 | Regular | Inside a field or chip, never floating (F73) |

**Rules**
- A sans title is never placed next to a serif title on the same screen.
- Labels never wrap inside tiles. Use short forms ("Median answer", "10 Dec") or reserve two lines for every tile in the row (F19).
- `text-wrap: balance` on titles of two lines or fewer, and `text-wrap: pretty` on paragraphs.

### 2.2 Colour: enforce "every colour has one job"

| Job | Token family | Allowed uses | Never |
|---|---|---|---|
| **Act** | Indigo | Primary buttons, links, selected chip, focus ring, Undo, sliders, switches | Status, decoration |
| **Identify** | 8+ subject hues | Subject tags, emblem tiles, event fills (tinted), chart series per subject, path theming | Status, actions |
| **Succeed** | Green | Completed meters, "Approved" stamp, diff "+ Added" | Labels on non-success bars (F23) |
| **Warn** | Amber | Overdue, at-risk goals | Partial progress, "Hard", "Changed" (F21) |
| **Danger** | Red | Destructive buttons, errors, the "Reject" stamp | Save, Undo, sliders, ordinals, highlights (F20) |
| **Info** | Blue-grey | Genuine informational notes only | Dates, "Next", "Easy", "In progress" (F21) |
| **Ink and neutrals** | Paper / ink ramp | Text, surfaces, dividers, "no subject" | |

**Grade language** (F22): one definition, used in review tiles, history badges, the results bar, practice and charts.

| Grade | Colour | Glyph | Words |
|---|---|---|---|
| Again | Danger-soft | ↺ | "Again" (also in practice; drop "Couldn't recall") |
| Hard | Amber-soft | half-filled circle | "Hard" |
| Good | Green-soft | filled circle | "Good" |
| Easy | Indigo-soft | ★ | "Easy" |

**Night data palette** (F24): sequential ramp from the indigo family; for example navy-700 → indigo-500 → lavender-300 → periwinkle-100. Check that neighbouring steps have at least 3:1 contrast, and draw "today" as a ring, never as the brightest fill.

**Night surfaces** (F25): page `#0F1530`-ish, raised `+6% L`, overlay `+10% L`. Event surfaces add a 12–16% subject tint and a 1 px border at 40% subject.

### 2.3 Spacing, radius, elevation

- **Grid:** 4 pt; screen gutters 20; card padding 20; list rows 56 (single-line) / 72 (two-line); leading-element column 40.
- **Radii:** 28 sheets · 20 cards · 14 fields and buttons · 999 chips and pills · 10 small tiles. **One radius per role**; delete the 8 px legacy radius (`60`, `146`).
- **Elevation:** three levels. Level 1 is cards (hairline plus 2% shadow); level 2 is sheets and the tab bar (blur plus shadow); level 3 is toasts and the Capture button. In Night, elevation = lighter surface, not a stronger shadow.
- **No nesting** (F31): a card may contain list rows and dividers, never another bordered card.

### 2.4 Iconography

- One stroke set: 1.75 px stroke on a 24 px grid, rounded caps, a 2 px corner radius. Filled variants only for "selected" states.
- Status icons (✓ ! ✕ i) are for status only. Dates use a calendar; targets use a flag; progress uses a ring; diffs use + and Δ.
- Subject glyphs and emblems are a separate, mathematical family (I-30). They are not UI icons and must never be used as icons for actions.
- Replace the generic sparkle "AI" icon for concepts with the star glyph (F74).
- A build check that every icon key resolves (F08).

### 2.5 Component specs (the ones that fix the most screens)

**ActionSheet** (F01) fixes `43`, `51`, `58`, `87`, `128`.
```
┌───────────────────────────────────────────┐
│                 ───                       │  grabber
│  TASK                                  ×  │  overline + close
│  Work on eigenvectors                     │  serif title, 2 lines max
│  ───────────────────────────────────────  │
│  [□]  Schedule            Pick a time   › │  56 pt rows, 40 px icon tile
│  [✎]  Edit                                │
│  [↺]  Move to To do                       │
│  [⊘]  Cancel task                         │
│  ───────────────────────────────────────  │  hairline before destructive
│  [🗑]  Delete task            (red)        │
└───────────────────────────────────────────┘
```

**Sheet templates** (F17)
- **Pick sheet:** overline, serif title and × in the header; a list or chips; **no footer** when picking closes the sheet, otherwise a full-width primary.
- **Form sheet:** overline, serif title and × in the header; fields; a sticky footer with **ghost "Cancel" on the left and the primary on the right** (or a full-width primary when there is no secondary). Destructive actions live in the body, last, never in the footer.
- **Confirm sheet:** a serif question, a one-line consequence, then "Keep" (ghost) on the left and "Delete" (danger) on the right. `88` is already close: make the other confirms match it, including `129` (currently in reverse order).
- Button order is always **negative left, positive right** (F71).

**Toast** (F13, F40)
- An ink pill in Day and a raised navy pill in Night, with an icon, a message and a bold indigo action ("Undo" / "Retry").
- A 2 px countdown hairline shrinks along the bottom edge for the undo window.
- At most one toast; a new one replaces the old one with a crossfade. Errors that persist become an inline banner.
- Toasts dock 12 px above the topmost bar and never cover a primary action.

**Chips** (F32)
- Unselected: hairline plus ink text. Selected: indigo 12% fill, indigo text and a leading ✓.
- Counts inside chips are tabular ("Overdue · 1").
- Sort is never a chip: use a trailing "Sort ▾" text button that opens a pick sheet with a ✓.
- Above 8 options, a chip group becomes a searchable list (F76).

**Stepper** (F14)
- A pill, 44 pt end caps, a tabular numeral in the centre, and **always a label and a unit** above it ("Study blocks per day").

**Disabled with a reason** (F33)
- Primary style at 40% opacity, plus a reason line directly beneath it in `text.secondary`: "Add a name to create the path".

**Empty state** (F36)
- An illustration (IL-…, 160 px, two-tone, theme-aware), a serif one-liner, one sentence of explanation and one context-correct action. No outlined giant CTA on filter-empty states; offer "Clear filter" instead.

**Collapsing header** (F11, F18)
- Large serif title → a 56 pt bar after 24 px of scroll. Detail pages keep the subject emblem thumbnail and a mini progress ring in the bar. Sub-tabs stick under the bar.

**Bottom layers** (F4, F11)
- At most **one** floating layer above the tab bar: the session row *or* a context CTA pill, never both. While a sheet is open the tab bar hides.

**Capture button** (F28)
- A 56 pt filled indigo circle, level-3 elevation, placed in the same spot on every tab. It does not hide on scroll (or, if it does, it hides together with the tab bar).

**Tab bar** (F29)
- Backdrop blur plus a 1 px top hairline. Badge rules: a number for due work (Review), a dot for "something new" (Inbox lives in the header with its count).

### 2.6 Chart rules (F06, F44–F48)
1. Tick labels never overlap. Thin by available width (minimum 8 px gap); for daily data over 14 days, label week starts; over 60 days, label month starts.
2. Reference lines (goal or target) are labelled at the right edge, outside the data, with collision avoidance against value labels.
3. Value labels only when the bar is wider than the label; never print "0 min".
4. Round y-ticks (1 h / 2 h / 3 h; 25 / 50 / 75 / 100%).
5. One unit format per screen ("3 h 55 min" *or* "3.9 h", not both).
6. Legend swatches match the mark (square for bars, line for lines, dot for points).
7. Colour: subject hues for per-subject series; indigo for "you" totals; neutral only for "no subject" (F48).
8. The chart title follows its bucket ("Focus by week" when bars are weeks; table headers match).
9. Selection readouts are pinned *above* the plot, so they never land under a bar (F04, F46).
10. Minimum plot height 160 px on phone (F46).
11. Keep "Show as table" and the summary sentence (P09), but fix the grammar templates (F43).

### 2.7 Copy and formatting
- **Dates:** "Mon 9 Nov", "9 Nov", "Thu 19 Nov · 17:00". Times follow the user's setting (default 24-hour), and every form uses the app's own picker (F51).
- **Numbers:** exact, thin-space grouped ("4 951"), never "50+" for a total (F05, F77).
- **No internal codes** in titles or meta. Show "Compactness", not "CP4"; "Card · Compactness", not "Card N1" (F49).
- **No developer explanations** (F50). The test is "Would a learner say this to a friend?"
- **Errors** say what happened, what is safe and what to do: "We couldn't confirm your last 2 decisions. They're saved on this phone. **Retry**."

---

## 3. Screen by screen: what 10/10 looks like

### Today (`01`, `162`): target 9.5
```
ℓ  Mon 9 Nov                         ⌕  ✉•  ⚙
Good afternoon                                  ← serif display (keep)
Next block in 1 h 17 min · 23 cards due

┌─────────────────────────────────────────────┐
│ ∿ Analysis · 15:00–15:50          [emblem]  │  emblem in its own corner,
│ Solve analysis problems                     │  drawn in once (M-TOD-01)
│ [ Start now  ▾ ]   Details                  │  split button: ▾ = Quick focus
└─────────────────────────────────────────────┘
TODAY  08 ─────│──[∿ 15:00]──────── 20         ← labelled block, "now" tick
FOCUS   ▓▓▓▓▓▓▓▓▓▓▓▓  50 / 50 min ✓            ← green when complete
REVIEWS ▓▓▓▓▓░░░░░░░  19 / 42
NEEDS YOU
 ⧉  23 cards due · ~9 min              Review   ← same row anatomy for all
 ○  Prove continuity · due today        Done
 ✉  6 proposals from your tutor            ›
CONTINUE  [Real Analysis] [Linear Algebra] [Topology]
```
- Fixes F05, F23, F53 and F54. In the busy account, the hero shows "Today's slice: 60 cards · 25 min · Why?" (F78).
- While focusing, the hero becomes the running session and the session row hides on Today (no duplicate, P12).

### Focus (`02`–`06`): target 9.5
- Timer screen: the clock sits inside a **thin orbit ring** that slowly traces the subject emblem (L-04) at under 12% contrast. The intention goes below the clock in serif. Pause is primary (filled); Break and Finish are secondary. "Park a thought" becomes a single pill that expands.
- Errors become an inline banner with an action (F09).
- The finish sheet has a labelled stepper ("Blocks completed") or none at all, a five-glyph rating, a full-width Save and "Discard" in the header (F14, F39).
- The start sheet: rename the two "Open" options ("Open · count up" vs "Open-ended study" → "Stopwatch" and "No timer"); the subject chips become a recent-five list plus "More…" (F76).

### Capture and Search (`07`–`11`): target 9
- Parsed tokens are tinted inline in the field, matching the chips below. "front :: back" shows a live mini card. One type selector only (F42).
- Search: field at the top with "Cancel", recent searches, actions with consistent icons, two-line result rows with subject glyphs, and highlight tokens in indigo (F74).

### Review and Practice (`20`–`27b`, `160`, `161`): target 9.5
- Hub: a serif or medium hero numeral; a subject split bar (keep); a forecast chart with direct labels and thinned ticks; stat tiles with two-line reserved labels; decks as a list with a trailing switch and *no* chevron (one target per row).
- Round: the card is centred; the answer in primary ink; grade tiles tinted with their grade colour plus glyph; consistent undo; swipe tints matching the grade colour (M-REV-03).
- **Round complete** (F55): an L-10 "Q.E.D." seal draws, the stats count up, the grade bar animates in sequence, then "Next: 18 cards tomorrow at 09:00", and Done. A streak or rhythm line ("4 days this week") replaces the empty half.
- **Nothing due** (`161`): IL-03 "clear sky" illustration, "All caught up", the next-due time, and "Practise a topic instead" as the action. Remove the disabled buttons.
- Practice reuses the grade components and sheet templates (F79).

### Calendar, Tasks, Close the day (`30`–`47`): target 9
```
Mon 9 Nov ▾                  ⌕   ☰ Day ▾   ← one row: date picker + view switch
⚠ 1 overdue · 3 suggestions    Review ›     ← one dismissible row
11:00 ┌▨▨ Linear algebra problem set ✓ ┐    ← logged = tint + hatch + ✓
      └────────────────────────────────┘
13:43 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━     ← keep the now pill
14:00 ┊ Prove continuity · 25 min   + ┊     ← suggested = dashed, true height
15:00 ┃∿ Solve analysis problems        ┃    ← planned = subject tint
```
- Fixes F10, F25 and F26. Drag to create, using the existing ghost block (M-CAL-02). Accept a suggestion with a tap that "inks in" the dashed outline (M-CAL-03).
- Month: borderless days, heat fill plus planned-subject dots, the legend behind "?" (F66). Agenda: collapse single empty days and use a fixed time column (F67).
- Tasks: one header row, sectioned list, swipe right to complete (with a check-draw, M-TSK-01), swipe left to schedule (F68).
- Close the day: three cards with drawn progress dots. Step 1 shows the day as a "notebook page" (time, cards, blocks). Step 3 ends with the page folding into the notebook (L-11) and "See you tomorrow at 09:00" (F70).

### Paths, path detail, checkpoint, session (`50`–`67`): target 9.5
- **Paths list:** keep the emblem cards. Serif titles. Hide the subject tag when it equals the title. The due pill is non-interactive styling (no outline). Compact density at 6+ paths (F75).
- **Path detail:** collapsing header (F11), sticky tabs, one floating "Continue with tutor" pill; Review moves into the header.
- **Map tab** becomes a real map (F56): stages are horizontal bands; checkpoints are nodes on a metro line that can branch (prerequisites); node shapes follow the README states (filled star, ringed halo, dashed ring, hollow ring, faint dot). There is a mini-map scrubber at volume and "You are here" pulses gently (M-PTH-02).
- **Sources:** cover thumbnail, title, transcription progress ring, one status chip, overflow (F59).
- **Checkpoint:** serif title (no "CP4"); keep the "To demonstrate" quote card (it's lovely); steps as a stepper (keep); evidence as a timeline with neutral partial glyphs; one primary action "Demonstrate" plus "•••" (F60).
- **Session:** serif title (two lines maximum), meta chips, a timeline (keep), "Things to revisit" with a status chip vs an action button that can't be confused (F62).

### Atlas (`68`–`71b`): target 10 (the signature screen)
- **Level 0 (whole sky):** each subject is one constellation glyph with a soft nebula glow in its hue and a label plus counts ("Analysis · 9 / 34"). Fit to content on open.
- **Level 1 (subject):** stars appear with a magnitude scale: demonstrated = bright filled star with glow; in progress = ringed and gently twinkling; proposed = dashed ring; up next = hollow; locked = faint point. Hit areas are at least 44 pt.
- **Level 2 (selection):** the selected star gets a ring; its first-degree edges draw in (M-ATL-03); all other edges fade to 8%; the sheet opens **above** the tab bar.
- Labels: collision-avoided and never clipped. Constellation names sit on arcs outside each cluster.
- Day = an ink-on-graph-paper star chart (like an astronomical atlas plate). Night = deep sky with a parallax starfield (M-ATL-01).
- List mode: grouped by subject with coloured headers, an A–Z scrubber, and states as glyphs (F58).

### Cards (`80`–`91`): target 9
- Library: serif questions, a subject glyph tile, meta "Compactness · due today" (no codes), a trailing due dot. A "Sort ▾" control, selected chips and a true count (F49, F63).
- Detail: the card face clamped to 8 lines (F77); stats with short date formats; a 160 px recall chart with pinned readout (F46); history badges in the grade language (F22); "For your tutor" with an auto-growing field.
- Editor: monospace input, live serif preview, a frequency-ordered shortcut bar with an edge fade, and kind labels that are never "Other" (F64).

### Inbox and plan proposal (`100`–`112`): target 9.5
- Stack: the card hugs its content; "Why this card?" expands with a chevron and a soft reveal; the next card is visible at 96% scale.
- Swipe: grade-language tints plus stamps (M-INB-01 to 04). Approve flies the card into a small "deck" icon in the header (M-INB-03), so the user sees where it went.
- List: no permanent disabled batch bar; it slides up only when something is selected.
- Plan proposal: negative-left, positive-right order (F71); a diff legend using + and Δ; the plan drawn with the same map component as the path map.
- **Inbox zero:** IL-05 plus the L-12 animation ("An empty desk, a lamp, a single star"), "Nothing to decide", and "Your tutor's next proposals will appear here" (F08, F55).

### Progress and Time log (`120`–`130`): target 9
- Hero numeral in the new numeral style (F16); the delta chip only when there is a previous period (F47).
- Charts follow §2.6. Almanac: dots for zero, starting at the first active week, with an edge fade (F44).
- Insights become small illustrated cards (IL-09 family), for example "Your recall on cards you were unsure of is 71%", with a tiny calibration glyph.
- Time log: subject-colour bars, day totals, and an illustrated empty week (F80).

### Settings (`140`–`149`): target 9
```
Study and review                                ← serif page title
MEMORY
  Target recall                 90 %      ›     ← opens a sheet with an indigo slider
  New cards a day               20        ›
  Math shortcuts                12        ›
FOCUS
  Default mode               Pomodoro     ›
  Focus · Break · Long break  25·5·15     ›
  Advanced                                ›     ← ratios, guards
```
- Grouped lists, save on change with a toast ("Saved · Undo"), switches only, no per-section Save buttons (F03).
- Appearance: theme cards show a real miniature of Today in each theme; Subjects show colour swatches and a glyph picker (F72).
- Data and account: one red, one heading, and no developer copy (F50).

### Sign-in and first run (`150`–`153`): target 9.5
- **Sign-in:** the emblem draws itself behind the wordmark (L-01) and *settles* behind the logo, never crossing buttons. Use the empty bottom third for a one-line value statement, plus a second sign-in option if there is one.
- **First run:** serif titles. Each step gets an illustration in the top half (IL-10, IL-11, IL-12). The connector address sits in a copy field with a "Copied" check animation (M-SYS-06). Instructions are a numbered list. "Next" is primary. The last step ends with L-02 ("Your notebook is ready"), showing the emblem of the first path drawing in.

---

## 4. Volume patterns (busy account)
- **Lists over about 20 items:** sticky section headers, an index scrubber where alphabetical, and "Show 10 more" rather than an endless list.
- **Pickers over 8 options:** searchable list, "Recent" first, select all / none (F76).
- **Counts:** exact, grouped; "99+" only on the inbox badge.
- **Cards and long content:** clamped with "Show full" (F77).
- **Emblems:** seeded per path, so no two paths share art (F27, F75).
- **Atlas:** semantic zoom and edge filtering (F12).
- **Today under overload:** present a slice, not the backlog (F78).
- **Errors:** deduplicated, one toast, then a banner (F13).

## 5. Day and Night parity rules
1. Every data palette is designed twice and checked side by side (F24).
2. Elevation in Night = lighter surface (F25).
3. Emblems: Day = ink line on a tinted paper tile; Night = glowing line on a deep tile (keep, P03).
4. Reds and ambers are checked separately in Night (`N/149` currently uses two different reds).
5. Any screenshot review compares Day and Night frames together, as the boards here do.

## 6. Definition of 10/10 (acceptance checklist)
- [ ] No component renders without its design-system wrapper (no native selects, checkboxes or date inputs anywhere).
- [ ] Every page title is serif; no Black-weight numerals.
- [ ] Red appears only on destructive or error elements; every status icon matches its meaning.
- [ ] Every number shown for the same quantity is identical across screens.
- [ ] No overlapping text anywhere at 320, 390 and 430 px widths, or at 200% text size.
- [ ] Every sheet uses one of the three templates; every footer follows negative-left, positive-right.
- [ ] Every empty, error and success state has an illustration or animation and one action.
- [ ] Content is never hidden under bars; no more than one floating layer above the tab bar.
- [ ] The busy account passes: no list longer than 20 rows without structure; no picker over 8 options without search.
- [ ] Day and Night frames reviewed side by side for every screen; Night data palettes designed.
- [ ] Motion: every M- item implemented with a reduced-motion alternative; 60 fps on a mid-range Android.
- [ ] Tablet and desktop: each screen has a layout designed for the width (not a stretched phone column).
