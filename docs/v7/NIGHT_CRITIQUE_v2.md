# Lemma v7 "Constellation": critique of the Night build and the plan to fix it (v2)

**Date:** 11 Nov 2026 · **Reviewed:** the 19 Night screenshots in `v7-night-screens.zip` (390 px wide, 1× density) · **Measured against:** the Constellation UI kit 1.0.2 (`lemma-ui-kit_2.html` for token values and component CSS, `lemma-constellation-10-plan.md` for the written rules), and `LEMMA-V7-PLAN.md` (10 Nov 2026) for screens, navigation and flows · **Method:** a screen-by-screen visual review, pixel sampling of the PNGs, and a read of the kit's 227 CSS custom properties, its component rules and its embedded fonts (Appendix A).

**This version replaces v1.** v1 judged colours, depth and type against §4 of the v7 plan. The kit replaces that section, and the build follows the kit. §1 lists every v1 finding that changed and why.

## In short

- **The colours are right.** Every surface, text level, the indigo action, the eight subject colours and their tints, the status colours, the focus ring and the meter track sample as the kit's exact token values. v1's biggest complaints (the palette, gold, the sky, the gradients, the gutter) came from the older plan and are withdrawn.
- **What still fails** is the use of the kit's components, plus layout.
  - Status badges have no icons and come in three shapes.
  - Subjects are shown as bare coloured dots.
  - Indigo is used on a progress meter, and a subject colour on a chart that isn't about subjects.
  - Hub tabs are pills, not underlined tabs.
  - Native date, time and select controls are still in use.
  - Titles are 36 px, which isn't one of the kit's type roles.
  - The seven blockers from v1 still stand, as do the layout problems on Calendar Day, Focus, the Atlas and Close the day.
- **The kit itself causes three of the problems.**
  - Three of its Night styles exist only inside the kit page: the lighter segmented thumb, the glow on hero emblems and the star field in the hero. The app gets the plain versions, so its selected segments look unselected and its hero emblems are flat.
  - It still defines 89 tokens it never reads itself, including the old "glass", "blur", "hero stop" and the 36 px size. They keep the older plan's look alive in the app: the see-through tab bar, the tinted hero card and 36 px titles.
  - Its written plan and its CSS disagree in four places.
- **The kit has nothing for the app shell.** There is no tab bar, capture button, hub header, calendar grid, focus timer, grade dock or map. For those, the v7 plan is the only spec.
- **The order of work:** fix the captures, fix the kit's three problems, fix the seven blockers, bring components into line with the kit, then rework the golden screens and re-run the P1 gate (§10).

## Contents

0. [How to read this](#0-how-to-read-this)
1. [What changed since v1](#1-what-changed-since-v1)
2. [What matches the kit](#2-what-matches-the-kit)
3. [Fix the captures first](#3-fix-the-captures-first)
4. [Problems in the kit that reach the build](#4-problems-in-the-kit-that-reach-the-build)
5. [Blockers](#5-blockers-s1)
6. [Where the build departs from the kit's components](#6-where-the-build-departs-from-the-kits-components)
7. [Screen by screen](#7-screen-by-screen)
8. [Scorecards](#8-scorecards)
9. [Suggested amendments to the kit and to the v7 plan](#9-suggested-amendments-to-the-kit-and-to-the-v7-plan)
10. [Order of work](#10-order-of-work)
11. [Appendix A: measurements](#appendix-a-measurements)
12. [Appendix B: the Owner's eye test on the four golden screens provided](#appendix-b-the-owners-eye-test-on-the-four-golden-screens-provided)

---

## 0. How to read this

### Which document governs what

| Topic | Governed by |
|---|---|
| Colour, type roles, spacing, radius, elevation, motion, the state model | Kit 1.0.2 |
| Components: buttons, tags, badges, filter chips, fields, time range, select, radio, checkbox, switch, slider, stepper, segmented control, tabs, menus, banners, toasts, sheets, rows, stat tiles, mastery bars, emblems, Constellation progress, statement cards, charts, heatmap | Kit 1.0.2 |
| Screens, hubs and navigation, the tab bar, capture, search, the calendar grid, Focus, the review round, the Atlas map, the golden-six gate, the "Done when" lists | v7 plan, Parts 5–7 |
| Where the kit's written plan and its CSS disagree | Flagged in §4 for a decision |
| Where the kit and the v7 plan disagree | The kit wins; the v7 items to update are listed in §9.2 |

This order is an assumption: the kit is described as the updated design description and is the `/kit` gallery that P0 of the v7 plan asks the Owner to approve. If the Owner decides otherwise, §1 shows which v1 findings would come back.

### Severity and IDs

| Severity | Meaning |
|---|---|
| **S1 Blocker** | Broken, wrong data, or a regression of an audit fix. Fix before any visual work. |
| **S2 Spec gap** | The build contradicts the kit or the v7 plan. |
| **S3 Polish** | Consistency, spacing or wording. |

| Prefix | Section |
|---|---|
| C | Captures (§3) |
| K | Kit problems (§4) |
| B | Blockers (§5) |
| KC | Kit-compliance findings (§6) |
| SH, TD, FO, RV, PR, CD, CW, CM, CA, BS, QA, PL, TK, CP, SE, CL, AT | Screens (§7): Shell, Today, Focus, Review hub, Practice, Calendar Day, Week, Month, Agenda, Block sheet, Quick add, Planner, Tasks, Capture, Search, Close the day, Atlas |
| KA, PA | Amendments to the kit and to the v7 plan (§9) |

Positions and sizes are CSS pixels on the 390 × 844 screen, with y measured from the top.

---

## 1. What changed since v1

| v1 finding | Now | Why |
|---|---|---|
| D1 The subject palette is not the validated one | **Withdrawn** | Cyan `#17A9CB`, tan `#CE8545` and mint `#52D7C1` are the kit's Night Analysis, Algebra and Topology values, and their tints match too. Analysis and Topology are 14.5 apart in OKLab, which passes the kit's gate of 10. The glyph is what separates them (now KC2). |
| D3 Gold does not mean "demonstrated" | **Withdrawn** | The kit has no gold. A demonstrated checkpoint is a star filled in the subject colour, plus the ∎ "Demonstrated" badge in the success colour. The Atlas stars follow this. What's still wrong in the Atlas is the not-started and review-due marks (KC18). |
| D4 No sky on hub screens | **Withdrawn** | The kit has no sky glow. Its Night texture is a sparse star field in hero and empty-state areas only (KC11). |
| D5 The hero card is a flat tint | **Reversed** | The kit wants a *flat* `surface.raised` hero with the emblem as the atmosphere. The build's subject tint is the departure (KC11). |
| D6 Flat, off-size buttons | **Partly withdrawn** | The kit's buttons are flat. The size finding stands, re-based on the kit: 48 px by default and 44 px small; 42 px is not a kit size (KC22). |
| D7 Emblems thin and flat | **Revised** | The kit defines stroke widths per size and a glow at hero size only (Night, 6 px blur, 30%). What remains: covers between 96 and 120 px fit none of the kit's three sizes, and the Linear Algebra cover reads as a scribble (TD8, KA6). |
| D8 The glass does not blur | **Revised** | The kit has no translucency: its `--v7-glass` alias is solid `surface.overlay`, and `--v7-blur` is never read. The tab bar should be solid (KC12). |
| D9 No subject glyphs | **Revised** | The kit's Tag uses the mini-emblem glyph, and the hero tag has it. The failures are the bare dots in rows, legends and the week strip (KC2). |
| D10 The gutter is 16 px, not 20 | **Withdrawn** | The kit's page margin on phones is 16 px. |
| D2 Subject colour used for amounts | **Fix changed** | v1 recommended an accent ramp, but the kit bans indigo on charts and progress bars. The fix is now to split by subject, or to use a neutral data colour the kit needs to add (KC3, KC4, KA4). |
| D11 Component drift | **Re-diagnosed** | The edged segment is the kit's design. The real fault is in the kit: outside its own page, the Night thumb is darker than the track (K1). The other drift items move to KC1, KC7, KC14 and KC19. |
| D12 Footers and orphan buttons | **Revised** | The kit's info banner deliberately uses an underlined link for its action, so "Adjust" may stay. The tertiary-button alignment now rests on the kit's own rule (KC10). |
| D13 Status colours for non-states | **Kept** | Now cites the kit's tones (KC15). |
| D14 Names differ | **Revised** | In the kit, a Tag names the *subject* ("Analysis"); path names are plain text (KC17). |
| D15 Navigation | **Kept** | The kit's Tabs are underlined too, so both documents agree (KC7, §7). |
| B6 Capture opens in an error state | **Narrowed** | "Unavailable · Type something to add." is the kit's own wording for a disabled reason. Only the critical ring on open is wrong. |
| B7 Native controls | **Kept and strengthened** | The kit specifies a Time range field and a Select that opens a sheet of radio rows on phones. |
| P10 Design-lint additions | **Kept** | Re-pointed at the kit's token set. |
| P11 Day strip window | **Kept** | — |
| P13 Emblem strokes in screen pixels | **Withdrawn** | The kit sets strokes per size. |
| C1–C5, B1–B5, and the layout findings | **Unchanged** | — |

---

## 2. What matches the kit

These were sampled from the screenshots and match the kit's token values exactly or within anti-aliasing. Keep them.

- **Surfaces:**
  - Page `#091023`, card `#11192C` and sheet `#192135` (`surface.page`, `surface.raised`, `surface.overlay`).
  - Secondary button `#1E263B` (`surface.muted`).
  - Day-strip track and Focus background `#050A1B` (`surface.sunken`).
- **Action:** primary buttons are `#5159D7` (`action.bg`). Focused fields in Search and Quick add show the lavender focus ring (`focus.ring` `#B1BFFF`).
- **Subjects:**
  - Marks: Analysis `#17A9CB`, Algebra `#CE8545`, Topology `#52D7C1`.
  - Tints: `#082831`, `#321F0F` and `#082A25` on the hero tag and the Continue covers.
- **Status:**
  - Warning badges use `#301F07` with `#FFBF67`.
  - The suggestions banner uses the success pair `#112917` and `#75D78D`. The values are right, but it's the wrong status for a suggestion (KC15).
- **Tag anatomy on Today's hero:** the Analysis mini-emblem glyph, the label in `text.primary`, on the subject tint, as a pill.
- **Filter chips** on Tasks and the Quick add length row: outlined pills; the selected one has `selection.subtle`, `selection.fg` and a leading check.
- **Switch** with a ✓ in the thumb, as the kit specifies.
- **Meters:** 6 px on a `border.subtle` (`#262D40`) track. The Continue tiles fill them with the subject colour, as mastery bars should.
- **Page margin:** 16 px.
- **Section headings** ("Due each day", "Memory · 30 days") at 26 px, the kit's Headline. **Hero numbers** ("23", "00:00") at 64 px, Numeric xl.
- **The chart has** a serif title, a one-sentence summary ("Cards due over the next 7 days: 41 in all.") and "Show as table".
- **Atlas stars:** demonstrated concepts are ★ filled in their subject colour, and in-progress ones use ◐, matching Constellation progress and the proof states.
- **Wording:**
  - "Unavailable · …" for disabled reasons.
  - "Overdue · Mon" follows the "Label · meaning" pattern.
  - Real ellipses ("Park a thought…") and en dashes ("10:00–10:50").
- **Secondary and disabled buttons:**
  - "Details" is `surface.muted` with no border.
  - The disabled "Add task" is transparent, with a subtle border and dimmed text.

The non-colour items from v1 still hold: Today's single primary visible without scrolling (goal S1), the floating tab bar, the Focus controls in the bottom 40%, Tasks without nested boxes, one-tap loose ends in Close the day, Search's Actions list, and Week blocks that carry no text at phone width.

---

## 3. Fix the captures first

Unchanged from v1. Without these, the plan's "Done when" lists can't be run.

| ID | Problem | Fix |
|---|---|---|
| C1 | **The clock isn't frozen.** The screens show Wed 11 Nov at 08:05 with different data from the audit seed: 1 study block left and 1 overdue, where the plan expects three and 7. | Capture with the audit seed and the clock frozen at Mon 9 Nov 2026, 13:43 IST (v7 plan §8). |
| C2 | **Fixed chrome is drawn mid-page.** Full-page captures paint the tab bar and capture button in the middle of long screens, hiding rows (Today, Review, Month, Agenda). | Capture viewport-sized frames while scrolling. |
| C3 | **Golden screens are missing.** There is no review round, no Path with its map, no Day theme and no 1280 × 800 capture. | Add them; the P1 gate needs them. The kit also asks for Day and Night side by side. |
| C4 | **The Quick focus capture shows nothing new.** `today-quick-focus` is pixel-identical to `today`: in this hero state the plan offers no Quick focus button. | Capture the sheet from the "Nothing left today" state or from Search (see PA3). |
| C5 | **Screens were built ahead of the gate.** P2 and P3 screens exist before the golden six are approved. The kit's own changelog repeats that the flag stays off until they are. | Freeze P2 and P3, or get the Owner's written waiver. |

---

## 4. Problems in the kit that reach the build

### K1 · Three Night styles exist only inside the kit page (S2)

The kit page shows Day and Night side by side in "split panels". Three of its Night rules are written for `.v7-split-panel[data-theme=graph-night]` (or the kit's own header) instead of the app's `html[data-theme=graph-night]`. The kit page therefore looks right, and the app gets the plain version:

| Style | Inside the kit page | In the app | Effect in the build |
|---|---|---|---|
| Selected segment | `surface.muted-hover` `#273045`, lighter than the track | `surface.overlay` `#192135` on a `#1E263B` track, so darker | Calendar (Day \| Week \| Month \| Agenda), Tasks (To do \| Doing \| Done), the block sheet (Study \| Busy) and the Atlas (Map \| List) all sample `#192135` on `#1E263B`. The selected segment reads as unselected. |
| Hero emblem glow | `drop-shadow` 6 px at 30% | None | The emblems on Focus and behind the hero are flat (KC23) |
| Star field in the hero | Sparse dots at 20% | `display: none` | No star field on Today's hero (KC11) |

- The kit's written plan agrees with the kit-page versions: §7.4 gives the Night thumb as `surface.muted.hover`, §8.1 the hero glow and §3.8 the star field.
- **Fix:** re-scope all three rules to `html[data-v7][data-theme=graph-night]`, and keep the split-panel selector only as an extra target. Keep the segment's 1 px `border.default` edge (changelog 1.0.2: "edged neutral segments").
- **Done when:** in Night, the selected segment samples lighter than its track on every screen, and the hero emblem on Focus samples with a glow.

### K2 · The token file keeps 89 tokens the kit never reads (S2)

- **Evidence:** 89 of the 227 custom properties defined in the kit's CSS are never read by its CSS. Most are old aliases from the v7 plan, kept so app code still compiles:
  - Surfaces and depth: `--v7-glass`, `--v7-blur` (22px), `--v7-hero-stop` (62%), `--v7-cover-alpha`, `--v7-subject-alpha`, `--v7-meter-alpha`.
  - Old colour names: `--v7-accent-fill-hi`, `--v7-wash`, `--v7-wash-strong`, `--v7-ink`, `--v7-ink-2`, `--v7-ink-3`, `--v7-subject-1` to `-8`.
  - Old sizes: `--v7-size-4`, `-5`, `-7` and `-8` (18, 22, 36 and 48 px), `--v7-art`.
- **How they reach the build:**
  - The see-through tab bar: its surface samples about 75% of `surface.overlay` over the page, and nothing in the kit is see-through.
  - The subject-tinted hero card.
  - Titles at 36 px (`--v7-size-7`).
  - A heading at 22 px (`--v7-size-5`).

  The kit's own components never produce any of these.
- **The component tier is unused too.** None of the 18 `--v7-component-*` tokens is read anywhere in the kit's CSS, markup or scripts; components read role tokens directly. The kit's §2 describes a three-tier system, but only two tiers are wired up.
- **Fix:**
  1. Find every app use of the legacy aliases.
  2. Move each use to a role token, or to a component token that points at one.
  3. Delete the aliases.
  4. Either wire the components to the `--v7-component-*` tokens or drop that tier from §2 of the kit's plan.
  5. Add a token-lint rule that fails on any alias not in the kit's role or component sets.
- **Done when:** the token file holds only role tokens, component tokens that are actually used, and layout and motion tokens, and the app builds without the aliases.

### K3 · The kit's written plan and its CSS disagree (S2)

| Topic | Kit plan (`.md`) | Kit CSS (`.html`) | Recommendation |
|---|---|---|---|
| Night segmented thumb | `surface.muted.hover` | `surface.overlay` outside the kit page (see K1) | The plan's value |
| Control sizes | sm 32, md 40, lg 48 | Button 48 (40 from 700 px), small 44, `--v7-small` 32 used only for filter chips | The CSS, with the plan's table rewritten to match |
| Day Topology mark | `#009F89` | `#009C85` | The CSS (it's the one with the contrast check), and fix the plan |
| Type scale | Role scale only (44, 32, 26, 20, 19, 17, 16, 14, 12, plus numerals 64, 40, 28) | The role scale plus the legacy `--v7-size-1` to `-9` (12–64, including 18, 22, 36 and 48) | The role scale only (see K2) |

### K4 · The kit and the v7 plan disagree (S2)

The kit wins (§0), but the v7 plan still contains the old values, and its "Done when" lists test some of them. §9.2 lists the plan items to update. In summary:

| Topic | v7 plan | Kit |
|---|---|---|
| Subject colours (Night slots 1–3) | Blue `#3987E5`, orange `#D95926`, aqua `#199E70` | Analysis `#17A9CB`, Algebra `#CE8545`, Topology `#52D7C1` |
| Slot order | Blue, orange, aqua, yellow, magenta, green, violet, red | Analysis, Algebra, Topology, Number theory, Geometry, Logic, Probability, Combinatorics |
| Demonstrated | Gold star-dot | Subject-filled star, plus the ∎ badge in success |
| Atmosphere | Sky glow on hubs, glass with blur, gradient primary button, gradient hero | None of these; flat surfaces, emblem as ornament, star field in hero and empty-state areas |
| Radii | 10, 14, 20, 28, full | 4, 8, 12, 16, 24, full |
| Type | 9 sizes; Display 36 | Role scale; Display 44, Title 32, Headline 26 |
| Gutter | 20 | 16 |
| Breakpoints | 600, 1024 | 700, 1100 |
| Dashed outlines | Suggested blocks, the proposed checkpoint, "Start a new path" | "Dashed borders are reserved for drop zones" |
| Heatmap and magnitude | Accent ramp | Ink (Day) and Starlight (Night) ramps; indigo banned on charts |

### K5 · The kit doesn't cover what the screens need (S2)

- **The app shell isn't in the kit:** the bottom tab bar, the capture button, the hub header with its collapsing title, the week strip, the time-grid block, the day strip, the focus timer, the review card and grade dock, the Atlas map and its star states, and the search sheet.
  - The build had to improvise them, which is where the see-through bar, the crescent block edges and the inverted selected day came from.
- **There is no neutral data colour.** Indigo is banned on charts and progress bars, and subject colours mean subjects, so nothing is left for a single-series amount ("cards due per day") or a meter that isn't about a subject (Reviews done today).
- **There is no cover size for emblems.** The kit defines glyph (14–24 px), tile (40–64 px) and hero (160 px and up). The Continue covers are about 108 px and the v7 plan's list covers are 96 px, which fall between tile and hero.
- **There is no live-time chip.** "in 1 h 55 min" on the hero isn't a Tag, Badge or Filter chip in the kit's sense.

See KA4 to KA7.

---

## 5. Blockers (S1)

The findings are those of v1, with kit references added.

### B1 · The planner's "Adjust" panel is unstyled, which brings back an audit bug

- **Evidence:**
  - The panel sits at x = 0, y = 0 with no padding or backdrop, on `#121212`, which is not a kit token.
  - It has a squared Close button with a focus ring, a native select, native checkboxes and ▶ disclosure triangles.
  - Its primary is coral `#FF7B6B`, which is not a kit token. The kit's danger solid, `#BA2B28`, is reserved for confirmation buttons.
- **Fix:**
  1. Use the kit's Sheet: 24 px top corners, `surface.overlay`, a header and a footer with a top border.
  2. Use the kit's Select (a sheet of radio rows on phones) and the kit's Checkbox.
  3. Put each "Change time" behind a Time range field (B7).
  4. Make the primary `action.bg`.
- **Done when:** no native control and no colour outside the kit's set remain; it opens as a bottom sheet at 360 and 390 px.

### B2 · Agenda says "1 h left" for deadlines that are days away

- **Evidence:** "Submit topology assignment" (Sun 15 Nov) and "Analysis examination" (Mon 23 Nov) both read "Deadline · 1 h left" on Wed 11 Nov.
- **Fix:** compute the time left from the full due date and time, through `format.ts`.
- **Done when:** a unit test covers deadlines due in 1 hour, later today, tomorrow, in 4 days and in 12 days.

### B3 · The overdue count is not shared

- **Evidence:** Today says 1, Calendar says 1, the Tasks filter says "Overdue 2", the Tasks group heading says "OVERDUE · 1", and Practice separately shows "Overdue · 1 day".
- **Fix:** one `overdueSummary()` selector that every overdue count reads from (v7 plan §6.2 item 6).
- **Done when:** an end-to-end test finds the same number on Today, Calendar and Tasks.

### B4 · The Calendar header row wraps in Week and Month

- **Evidence:** "November / 2026" and "New / block" each break onto two lines.
- **Fix:** follow the v7 plan's row (month label with a chevron, and a "Today" pill only when away) and remove "+ New block" (CD2). Under the kit's text-scaling rule, labels wrap and never truncate, so the row has to fit.
- **Done when:** the row is one line at 320–390 px.

### B5 · The Review split cuts "To…" and puts boxes inside a box

- **Evidence:** three outlined boxes sized by count, "Analysis 14 / Algebra 6 / To… 3", inside the card's own outline.
- **Kit:** labels never truncate (§12); a subject is always glyph plus text (§3.5).
- **Fix:** a 6 px meter split into subject segments, with a 2 px gap in the page colour, and below it a legend line of Tag glyph, subject name and count, wrapping when needed.
- **Done when:** no text is cut at 320 px, and the parts add up to the hero number.

### B6 · The capture sheet opens in an error state

- **Evidence:** the empty field has a coral `#FF7B6B` ring the moment the sheet opens.
- **Kit:**
  - Invalid is a 1 px `status.danger` border (`#FF8579`), an icon inside the field and a message with its own icon, checked on blur or submit (§6).
  - A focused field shows the `focus.ring`.
- **Fix:**
  1. Show `focus.ring` on open.
  2. Keep "Unavailable · Type something to add.", which is the kit's own pattern, but place it as helper text next to the disabled "Add task", not under the chips.
  3. Remove `#FF7B6B` from the codebase.
- **Done when:** opening the sheet shows no danger colour.

### B7 · Native controls, and dates and times in mixed formats

- **Evidence:**
  - Native date, time and select controls in the block sheet, Close the day step 3 and the planner.
  - Five date styles for one day ("Wednesday 11 November", "Wed, Nov 11", "Wednesday, November 11", "NOV 11", "11/11/2026").
  - 12-hour "08:30 AM" next to 24-hour times.
- **Kit:**
  - §7.3 Select opens a bottom sheet of radio rows on phones.
  - §7.3 Time range field: Start and End side by side with an en dash, presets 25 / 50 / 90 / Custom as filter chips that move End, and a summary line ("50 min session · 09:00–09:50 · 24-hour time").
  - §7.4 radio and checkbox are fully themed.
- **Fix:** use these three components everywhere, and route every date and time through `format.ts` with the owner's locale and clock format.
- **Done when:** design lint finds no visible `<select>`, `input[type=date]` or `input[type=time]`, and only one short date style, one long date style and one clock format appear.

---

## 6. Where the build departs from the kit's components

### KC1 · Status badges have no icon and come in three shapes (S2)

- **Kit (§3.4, §7.2):** a Badge is a rounded rectangle with 8 px corners, 24 px tall, with a filled status icon (warning is a triangle with "!") and "Label · meaning" in the status colour on its tint. Status is never shown without its icon.
- **Build:**
  - Today's "1 overdue" is a 25 px pill.
  - Calendar's "1 overdue" is a 44 px box.
  - Tasks' "Overdue · Mon" is a pill.
  - Practice's "Overdue · 1 day" is an outlined pill.
  - None of them has an icon. Practice's "In 1 day" is a neutral pill.
- **Fix:** one Badge component with the warning icon, "Overdue · 1 task" style text, and the kit's shape and size. Where a badge opens something (Today's overdue item, Calendar's all-day lane), wrap it in a button and keep the badge's look.

### KC2 · Subjects shown as bare dots (S2)

- **Kit (§3.5):** the mini-emblem glyph is required wherever a subject colour appears. Legends use glyphs, not dots (§9.6).
- **Build:** bare dots on Tasks rows, Review Decks, the Review split, the Calendar week strip, the Month grid, and the "Due" legend.
  - Analysis cyan and Topology mint are the closest pair on screen (14.5 in OKLab): enough for the kit's gate, not enough to tell two 8 px dots apart, especially under red–green colour blindness.
- **Fix:** replace each dot with the 14–16 px subject glyph in the subject colour. Where space is tight (week strip, month cells), use the glyph alone.

### KC3 · Indigo on a progress meter (S2)

- **Kit (§3.3):** indigo is not allowed on progress or mastery bars.
- **Build:** Today's "Reviews 19 of 42" meter fills with `action.bg`.
- **Fix:** use a neutral data fill (KA4, for example `text.secondary` on `border.subtle`), or split the meter by subject as in B5.

### KC4 · A subject colour on data that isn't about a subject (S2)

- **Kit:** subject colour means a subject. Its own "Study time" chart stacks bars by subject.
- **Build:**
  - The "Due each day" bars and their legend are Analysis cyan.
  - The Close-the-day "Reviews" meter is Analysis cyan, while on Today the same meter is indigo.
- **Fix:** stack "Due each day" by subject, with direct labels (three series or fewer, §9.6). Use the neutral fill from KC3 for the Reviews meter, the same on both screens.

### KC5 · The Review chart breaks the kit's chart rules (S2)

- **Kit (§9) says:** round-number ticks (1, 2, 2.5 or 5 × 10ⁿ); bars 40–60% of their slot with 4 px top corners; direct labels rather than a legend for three series or fewer; label every total or none.
- **Build:**
  - Ticks are 0, 13 and 25.
  - Bars fade to transparent at the base.
  - A legend is shown for one series.
  - The section is about 300 px tall for two non-zero bars.
  - Totals, including the zeros, are labelled throughout, which is consistent with the kit.
- **Fix:**
  - Ticks at 0, 10, 20, 30.
  - Solid bars at about 50% of the slot.
  - No legend, or direct labels once the bars are stacked by subject (KC4).
  - Chart height about 140 px.

### KC6 · Month's logged-time tint has one step (S2)

- **Kit:** heatmaps use the Starlight ramp in Night (`viz.heat1` `#756B51` to `viz.heat4` `#FCEABE`). An empty cell has an outline and no fill, the legend has five labelled swatches ("0", "1–15", "16–30", "31–60", "60+ min"), and today has a 1.5 px `text.primary` outline.
- **Build:** every tinted cell is `#202841`, which is not a kit token, so it can't show how much time was logged.
- **Fix:** apply the ramp and the legend. The white ring on today is consistent with the kit and can stay.

### KC7 · Hub tabs are pills (S2)

- **Kit (§7.4):** Tabs have a 2 px `action.bg` underline under the selected tab, which is in `text.primary`; the others are in the secondary or tertiary text colour. The v7 plan says the same.
- **Build:** selected hub tabs are `selection.subtle` pills with `selection.fg` text ("Review", "Schedule", "Tasks", "Practice").
- **Fix:** use the kit's Tabs.

### KC8 · Titles use sizes outside the kit's roles (S2)

- **How it was measured:** Newsreader's cap height is 0.67 em (read from the font embedded in the kit). Capitals 24 px tall mean 36 px type; 15 px capitals mean about 22 px.
- **Kit:** Display 44 (one per page), Title 32 (page title), Headline 26 (section), Subhead 20.
- **Build:**
  - "Good morning", "Review", "Calendar", "Practice", "Loose ends" and "Tomorrow" are 36 px (the legacy `--v7-size-7`).
  - The Month heading "Today · Wednesday, November 11" is about 22 px (`--v7-size-5`).
  - The section headings at 26 px are correct.
- **Fix:**
  - Today's greeting is Display 44, the one per page.
  - Hub and step titles are Title 32.
  - The Month heading is Subhead 20.
  - Remove the legacy sizes (K2).

### KC9 · Measures: unit sizes and stat tiles (S3)

- **Kit (§4.2, §7.8):**
  - Units are set at 60% of the number's size, in `text.secondary`, after a non-breaking space.
  - A Stat tile's value is Numeric lg (40 px).
  - Its change row is always reserved, so tiles line up ("No change yesterday" when there's nothing to compare).
  - In sentences, write "65 of 100", not "65 / 100".
- **Build:**
  - Close the day shows "0 min" with "min" at full size. The memory tile shows "25 s" with "s" at full size.
  - The memory tile values are about 28 px and have no change row.
  - "Typical answer" wraps, which pushes its value lower than the others.
  - Close the day writes "19 / 42" and "0 / 1".
- **Fix:** apply the kit's Stat tile and its unit rule; write "19 of 42".

### KC10 · Tertiary buttons don't line up with the column (S3)

- **Kit (§7.1):** a tertiary button has a negative inline margin equal to its padding, so its label lines up with the column edge.
- **Build:**
  - "Back" (Close the day) starts at x = 33 and "More options" (Quick add, Capture) at about x = 38. The column edge is x = 16.
  - "Plan these", "Move all to tomorrow" and "Customise this round" are centred on rows of their own.
- **Fix:** apply the kit's tertiary button, and left-align these actions or move them into a header row.

### KC11 · The hero card departs from the kit's pattern (S2)

- **Kit (§7.7 and its CSS):**
  - Flat `surface.raised` with a `border.subtle` edge, 24 px corners and 24 px padding.
  - The emblem is 164 px, anchored bottom-right at 10% opacity and cropped by the card.
  - In Night, a sparse star field sits in the hero.
  - At most 3 badges; the duration is metadata.
- **Build:**
  - The fill is the subject tint mixed into `raised` (`#0C2430`).
  - The emblem sits at the top-right, behind the chips and the title, which makes it read as noise.
  - There is no star field, because the kit's star-field rule only applies inside the kit page (K1). The duration as metadata is right ("10:00–10:50 · 50 min").
- **Fix:** follow the kit's hero. This also removes the last use of `--v7-hero-stop` (K2).

### KC12 · The tab bar shows content through it (S2)

- **Evidence:** the bar samples about 75% `surface.overlay` over the page, with no blur. Text underneath ("cards due", "Review", "SUGGESTED", "09:00") stays sharp and runs into the tab labels.
- **Kit:** no surface is see-through. `--v7-glass` is solid `surface.overlay`, and the kit honours "reduce transparency".
- **Fix:** a solid `surface.overlay` with a `border.subtle` edge and the level 2 shadow. Add the tab bar to the kit (KA5).

### KC13 · The segmented thumb looks unselected (S2)

See K1.

### KC14 · Chips used for the wrong job (S2)

- **Kit (§7.2, §7.4):**
  - A Filter chip is a multi-select pill.
  - A single choice among 2–4 options is a Segmented control.
  - Presets in a Time range field are filter chips.
- **Build:**
  - The capture type (Task, Time block, Card, Thought) is one choice drawn as filter chips, and it wraps onto two rows.
  - The block sheet's length presets use a filled 12 px-corner button style, while Quick add's use the kit's filter chips.
- **Fix:**
  - The capture type becomes a 4-option Segmented control, with icons above the labels if space is short.
  - Both sheets use the Time range field and its filter-chip presets.

### KC15 · Status tones used for things that aren't states (S2)

- **Kit:** "Every colour has one job." Success means saved or on track. Info has no hue: `text.secondary` on `surface.muted` with an info icon, and the info banner's action is an underlined link.
- **Build:**
  - The calendar suggestions banner uses the success pair and a check-circle, which says "done" about something not done.
  - Coral `#FF7B6B` appears on the capture field and the planner's primary.
- **Fix:** an info-tone banner ("2 suggested blocks for today"), with "Adjust" as its underlined link and "Add all" as a small primary or secondary button. Remove the coral.

### KC16 · Side stripes on rounded blocks (S2)

- **Kit (§7.6):** no side stripe on a rounded container, because it bends into a crescent. A rule sits *inside* the padding instead, like the 2 px rule on the Definition card.
- **Build:** Week and Day blocks draw a 4 px `border-left` on 12 px corners, which renders as a crescent "(".
- **Fix:** a 3–4 px inner rule, inset by the padding, with square or fully round ends.

### KC17 · A Tag shows a path name (S3)

- **Kit:** a Tag names the subject ("Analysis"), with its glyph. Path titles are text ("Continuity and limits · Analysis · Checkpoint 4 of 7").
- **Build:** Focus's top chip says "Real Analysis" in Tag styling, while Today's hero tag says "Analysis" for the same block.
- **Fix:** Focus shows the Tag "Analysis", with the path name as plain text where it's needed.

### KC18 · Atlas states that don't match the kit's proof states (S2)

- **Kit:**
  - Conjecture (not started) is ○, hollow, with a 1 px `border.default` outline.
  - In progress is ◐; demonstrated is a star filled in the subject colour.
  - Review due is ↻ in the warning colour.
- **Build:**
  - Demonstrated (★) and in progress (◐) are correct.
  - Not-started concepts are small filled grey dots that look the same as the background dust.
  - Review due is a warning ring with a dot, not ↻. In the Algebra cluster it sits beside tan stars of a similar hue.
- **Fix:** hollow outlined marks for conjectures, ↻ for review due, and dust that is smaller and fainter than any concept (PA9).

### KC19 · Fields (S3)

- **Kit (§7.3):**
  - A field is 48 px tall with 12 px corners, `surface.sunken` and a `border.default` edge.
  - "Optional" is a suffix in the Supporting style, not part of the label.
- **Build:**
  - The Search field and "Park a thought…" are full pills.
  - The block sheet writes "Path (optional)" and "Task (optional)" in label weight.
- **Fix:** the kit's field shape everywhere, and the kit's "Optional" suffix.

### KC20 · Group spacing (S3)

- **Kit (§5.2):** 24 px between related blocks on phones and 48 px between sections.
- **Build:** Today's cards are 16 px apart (hero to strip, strip to targets, targets to "Needs you").
- **Fix:** 24 px.

### KC21 · Rows without tiles or chevrons (S3)

- **Kit (§7.7):** a list row is 64 px tall, with a 40 px leading tile on the subject tint showing the subject glyph, and a chevron whenever the row navigates.
- **Build:** the Review Decks rows have a dot, a name and a switch, and no tile or chevron.
- **Fix:** add the tile, and a chevron for sub-decks.

### KC22 · Button heights (S3)

- **Kit:** 48 px by default on phones; 44 px for small buttons.
- **Build:**
  - 42 px: "Start review", Quick add's "Add block", Close the day's "Next" and "Finish".
  - 44 px: "Practice" and the block sheet's "Create block".
  - 48 px: "Start now".
- **Fix:** 48 for sheet footers and step flows, 44 for actions inside cards.

### KC23 · The emblem glow at hero size (S3)

- **Kit (§8.1):** in Night, hero-size emblems get a soft glow (6 px blur, 30%).
- **Build:** the 160 px-plus emblems on Focus and behind the hero have none, because the kit's glow rule only applies inside the kit page (K1).
- **Fix:** re-scope the rule (KA1); keep the glow at hero size only.

---

## 7. Screen by screen

The layout and flow findings are kept from v1. Kit findings from §6 are named, not repeated.

### 7.1 Shell

- **SH1 (S2) The tab bar shows content through it:** see KC12.
- **SH2 (S2) The capture button covers row actions** such as "Triage".
  - Hide it while scrolling down and bring it back on scroll up (PA2).
  - Keep 72 px of bottom padding so the last row clears it.
- **SH3 (S3) "⋯" in Close the day sits in an outlined circle.** The kit's icon button is transparent with 8 px corners. Use that, as Focus does.
- **SH4 (S2) Inbox count and Settings icon.** The Inbox count shows only on Today, and Settings appears on every hub. The v7 plan (§6.1 A) puts the Inbox count on every hub and Settings on Today only.

### 7.2 Today (golden)

- **Keep:** the single primary, the greeting, the day strip, the Continue tiles with their subject-coloured mastery bars.
- **TD1 (S2) The hero:** see KC11.
- **TD2 (S2) The Continue row starts at the screen edge.** The first tile's border is at x = 0.
  - Give the scroller a 16 px inline padding and matching scroll padding.
- **TD3 (S3) The briefing sentence is awkward.**
  - Write it as short sentences ("Next block in 1 h 55 min. 23 cards due and 1 thing overdue.").
  - Leave out "1 study block left" when it is the next block.
- **TD4 (S3) Two framings of the same number.** The Reviews meter says "19 of 42" while the briefing and the tab count say 23.
  - Write "19 of 42 · 23 left".
- **TD5 (S3) There's no Focus target row.** Check that the seed sets a daily minimum.
- **TD6 (S3) The day strip is mostly empty.** One 50-minute block is a 15 px sliver in an 18-hour track (PA10).
- **TD7 (S3) The Inbox peek has no card fan** (v7 plan §6.2 item 8).
- **TD8 (S3) The emblems on the covers are hard to read.** The Linear Algebra cover reads as a scribble at about 108 px, and the Analysis cover draws hero-level detail too thin to see.
  - Use the kit's tile-level detail (12–24 strokes at 1 px) for covers until the kit defines a cover size (KA6).
- **TD9 (S2) Badges, meter, spacing and greeting size:**
  - "1 overdue" needs its icon (KC1).
  - The Reviews meter shouldn't be indigo (KC3).
  - Cards should be 24 px apart (KC20).
  - The greeting should be Display 44 (KC8).

### 7.3 Focus (golden)

- **Keep:** the top bar, the 64 px timer, "OPEN SESSION", the bottom controls.
- **FO1 (S2) The emblem is above the timer, not behind it.** The emblem fills y ≈ 205–500, the timer sits at y ≈ 520–570, and the band from y ≈ 50 to 200 is empty.
  - Centre the emblem on the timer (v7 plan §6.3).
  - Centre the eyebrow, timer and intention as one block.
  - Add the kit's hero glow (KC23).
- **FO2 (S3) The labels don't line up.** "Pause" sits about 8 px lower than "Break" and "Finish". Put all three labels on one baseline.
- **FO3 (S3) "Drifted" is an unlabelled icon.** Add a caption label.
- **FO4 (S3) The field and top chip:**
  - The thought field is a pill (KC19).
  - The top chip is a path name in Tag styling (KC17).
- **FO5 (plan) Finish is the brightest control on a running timer.** See PA4.

### 7.4 Review hub

- **Keep:** the 64 px "23", the full-width "Start review", the chart's title, summary and "Show as table".
- **RV1 (S1) The split:** see B5.
- **RV2 (S2) The chart:** see KC4 and KC5.
- **RV3 (S3) The memory tiles:** see KC9.
- **RV4 (S3) The deck rows:** see KC21 and KC2.
- **RV5 (S3) The daily limit is an orphan link.** "Daily review limit: 200" sits alone in link colour.
  - Make it a row in the Decks card ("Daily limit · 200 ›").
- **RV6 (S2) The hub tabs:**
  - The tabs read "Review · Cards · Practice", but the card library belongs under Paths (v7 plan §5.1, OD4).
  - The two "Cards" names collide (PA1).
  - The tab style is wrong: see KC7.

### 7.5 Practice

- **PR1 (S2) The header is a detail header.** Practice has Back plus a bar title and a Display title. It's a Review hub tab, so render it inside the hub header.
- **PR2 (S2) Two primaries.** There are two accent-filled "Practice" buttons, and the kit allows one primary per view.
  - Make them 44 px secondaries. Only the most overdue topic may carry the primary.
- **PR3 (S3) Repetition.** "Practice" appears five times, and an explanatory paragraph takes the top of the page.
  - Remove the duplicate titles and move the paragraph to first-run tips.
- **PR4 (S3) Badges and subjects:**
  - "Overdue · 1 day" and "In 1 day" should be kit Badges (KC1).
  - "Topology concepts" shows no subject (KC2).
- **PR5 (S3) "Archived topics (1)" doesn't look tappable.** Make it a disclosure row with a chevron.

### 7.6 Calendar Day (golden)

- **Keep:** the now-line, the hour labels.
- **CD1 (S2) The grid starts 72% of the way down the screen.**
  - Above it sit the header, the title, the hub tabs, the month row with "+ New block", the week strip, the view switch, a 44 px overdue box, "Logged 0 min · Planned 50 min" and a banner about 130 px tall. The grid begins near y = 600, and the suggested blocks end up under the tab bar.
  - Steps:
    1. Remove "+ New block" (CD2).
    2. Put the overdue badge into the all-day lane.
    3. Move "Logged · Planned" into the date row, or drop it.
    4. Shrink the banner to one 44 px row (KC15).
    5. Collapse the hub title on scroll.
  - **Done when:** the grid starts above y = 380 and at least 4 hours show above the tab bar (PA5).
- **CD2 (S2) "+ New block" is redundant, and it sits in the top third.** It duplicates the capture button and breaks the thumb-reach goal F3. Remove it.
- **CD3 (S2) Suggested blocks look like busy time.** They use the busy hatch and an indigo outline. The v7 plan's dashed outline conflicts with the kit's rule that dashed borders are for drop zones only.
  - Use the subject tint at low strength, a solid 1 px `border.default` edge, the inner subject rule (KC16), and a "Suggested" info badge. Keep the hatch for busy time only.
- **CD4 (S3) "06:00" is cut in half** at the grid's top edge. Pad the top of the scroll area.
- **CD5 (S3) The selected day and the now pill are inverted.** Both are filled with `selection.fg` (`#B9C6FF`) behind dark text, which isn't a kit pattern.
  - Use `action.bg` with white text, as the kit does for checked controls, or the kit's selection pair (`selection.subtle` behind `selection.fg` text).
- **CD6 (S2) The segmented thumb:** see K1.

### 7.7 Calendar Week

- **CW1 (S1) The header row wraps:** see B4.
- **CW2 (S2) The block edge renders as a crescent:** see KC16.
- **CW3 (S3) Dots instead of glyphs.** Blocks show a dot where they should show the subject glyph, from 28 px tall (KC2).
- **Keep:** the tint on today's column, the logged minutes under each date, no clipped text.

### 7.8 Calendar Month

- **CM1 (S1) The header row wraps:** see B4.
- **CM2 (S2) The tint has one step:** see KC6.
- **CM3 (S3) The due flag pushes dates off-centre.** Pin the flag in the cell's corner.
- **CM4 (S3) The selected-day heading wraps.** "Today · Wednesday, November 11" runs onto two lines at about 22 px.
  - Use "Today · Wed 11 Nov" in Subhead 20 (KC8, B7).
- **CM5 (S3) Subject dots:** see KC2.

### 7.9 Calendar Agenda

- **CA1 (S1) Wrong time left:** see B2.
- **CA2 (S2) Deadline and practice rows don't match the block rows.** They use `#1A2028`, which is not a kit token, have no icon and no subject rule, and smaller titles.
  - Use one row design for every kind of item.
- **CA3 (S3) The busy hatch sits under the text.** Hatch the rule area only.
- **CA4 (S3) The page is 2,167 px tall.** "Nothing planned · Add" repeats nine times. Collapse runs of empty days (PA7).
- **CA5 (S3) Sticky headings are unconfirmed.** Check that the day headings stick.

### 7.10 Block sheet

- **BS1 (S1) Native controls and mixed formats:** see B7. Use the kit's Time range field, which also fixes the missing "Custom" preset and the inline "Length" label.
- **BS2 (S3) The eyebrow and starting focus are wrong.** The eyebrow is "CALENDAR · NOV 11", and focus starts on Close.
  - Use "TIME BLOCK", and focus the title field.
- **BS3 (S2) The footer buttons crowd the left.** "Cancel" and "Create block" are clustered on the left, almost touching.
  - Secondary on the left, primary on the right, both 48 px (PA6).
- **BS4 (S2) The Study | Busy thumb:** see K1. The "(optional)" labels: see KC19.

### 7.11 Quick add

- **Keep:** the focused title field with the kit's focus ring, the length presets as kit filter chips, "More options".
- **QA1 (S2) The path chips show no subject.** There's no glyph and no colour, on the one screen where you assign a subject (KC2).
- **QA2 (S2) Study or Busy is a switch** labelled "Study block (off for Busy)". The kit says a switch applies a setting immediately and must not be used inside a form that is submitted later.
  - Use a Study | Busy segmented control, as the full sheet does.
- **QA3 (S3) The eyebrow is just "08:30".** Show "WED 11 NOV · 08:30–09:20".
- **QA4 (S2) The draft block can't be seen.** The sheet starts at y ≈ 424 and the grid at y ≈ 600, so the draft is hidden.
  - After CD1, scroll the grid so the draft sits just above the sheet.
- **QA5 (S3) The footer:** see KC10 and PA6.

### 7.12 Planner ("Adjust")

- **PL1 (S1) The panel is unstyled:** see B1.
- **PL2 (S2) The "Not placed" reasons are vague and repeat.** Make each reason specific ("Due 08:00 · your first free slot is 08:10") and offer an action with it.

### 7.13 Tasks

- **Keep:** the To do | Doing | Done segmented control, the kit filter chips, one card per group, the row layout.
- **TK1 (S1) The overdue counts disagree:** see B3.
- **TK2 (S2) Badges and subjects:**
  - "Overdue · Mon" needs its icon (KC1).
  - The path dots need glyphs (KC2).
- **TK3 (S3) "Plan these" sits alone, centred:** see KC10. Move it into the filter row or the hub header.
- **TK4 (S3) Row meta wraps differently from row to row.** Use one fixed order (due badge, priority, estimate, subject) that wraps as one unit.

v1's TK2 ("make the overdue filter chip a warning chip") is withdrawn. Under the kit, filter chips stay neutral, and only badges carry status colour.

### 7.14 Capture sheet

- **Keep:** one field, "More options", a disabled primary that names its result.
- **CP1 (S1) The error state on open:** see B6.
- **CP2 (S2) The type choice:** see KC14.
- **CP3 (S3) The footer:** see KC10 and PA6.
- **CP4 (S3) Nothing hints at the recogniser.** Add a one-line hint under the field ("Try: Rudin ch 4 tomorrow 4pm 90m #real").

### 7.15 Search

- **Keep:** the focused field, the Actions list, the highlighted first row.
- **SE1 (S2) The sheet is half height.** The v7 plan specifies full height on phones (§6.1 G).
- **SE2 (S3) Every action has the same ▷ icon.** Give each its own: a timer, layers, calendar-plus, ∎, a sun.
- **SE3 (S3) The header repeats itself.** The eyebrow, the title and the placeholder all say the same thing. Let the field be the header.
- **SE4 (S3) The field is a pill:** see KC19.

### 7.16 Close the day

- **Keep:** the three steps, the progress dots, one-tap loose ends, "What will you understand?".
- **CL1 (S2) The primary button moves between steps.** It is at y = 390 (46%) on step 1, 603 on step 2 and 522 on step 3. Step 1 also breaks F3.
  - Use a fixed footer: Back on the left, aligned per KC10, and the primary on the right (PA6).
- **CL2 (S2) Step 1 makes "0 min" the hero number.** When focus is zero, lead with the day's best real figure (PA8). Set the unit at 60% (KC9).
- **CL3 (S2) The meters are the wrong colour and badly spaced.** The Reviews meter is Analysis cyan (KC4), and each label sits as far from its own bar as from the bar above.
  - Use the kit's mastery layout: label row above, then the bar, 8 px apart, with 16 px between rows. Write "19 of 42" (KC9).
- **CL4 (S2) Step 3 offers a busy block as tomorrow's "First block."** Show tomorrow's first study block, or the planner's first suggestion.
- **CL5 (S2) Step 3 explains internals** ("You didn't make a day plan…"). Remove the sentence.
- **CL6 (S3) Smaller departures:**
  - "Finish" should be "Close the day".
  - The native select: see B7.
  - The "⋯" circle: see SH3.
  - Step 1 has no Title, while steps 2 and 3 do.
- **CL7 (S3) The loose-end buttons don't line up.** Give the secondaries a fixed width so the tertiaries ("Drop", "Dismiss") line up.

### 7.17 Atlas (golden)

- **Keep:** the header, the dust field, the cluster labels, Legend, Recentre, the subject-filled demonstrated stars.
- **AT1 (S2) The proof states:** see KC18.
- **AT2 (S2) The first view isn't fitted.** There are about 200 px of empty sky above the clusters and about 170 px below, while "Topological spac…" runs off the right edge.
  - Fit the view to all stars and labels with 24 px of padding, and keep labels inside the viewport.
- **AT3 (S2) Concepts look like dust.** Make dust at most 1.5 px and 30% opacity. Concepts use the kit's outlined conjecture mark (PA9).
- **AT4 (S3) Labels and arrows collide.** "Linear maps" sits on top of stars, and arrows tangle at cluster centres. Place labels with collision avoidance, and show arrowheads only when zoomed in or selected.
- **AT5 (S2) The Map | List thumb:** see K1.

---

## 8. Scorecards

### 8.1 The kit's own 10/10 scorecard, applied to the build

| # | Kit criterion | Build | Evidence |
|---|---|---|---|
| 1 | Role tokens only; Day and Night differ in values only | No | Legacy aliases in use (K2); off-kit colours `#121212`, `#FF7B6B`, `#1A2028`, `#202841`; tinted hero; Day not captured |
| 2 | Text ≥4.5:1, non-text ≥3:1 in all 4 modes | Can't tell | The tokens pass in the kit. The see-through tab bar lets text collide; the high-contrast modes weren't captured |
| 3 | Every colour one job; indigo only on action, selection, focus | No | Indigo meter (KC3); success tone for a suggestion (KC15); a subject colour on a non-subject chart (KC4) |
| 4 | Status, subject and state tell apart in greyscale | No | Badges without icons (KC1); bare subject dots (KC2) |
| 5 | Full state matrix in both themes | Can't tell | Stills only |
| 6 | Disabled dimmer than all text; read-only never more prominent | Yes, where seen | The capture sheet's disabled "Add task" |
| 7 | One component per job | No | Filter chips used for a single choice; two length-preset styles; four badge treatments (KC1, KC14) |
| 8 | Charts: round ticks, summary, table, keyboard | Partly | Summary and table present; ticks 0, 13, 25 (KC5) |
| 9 | Emblems defined, legible at 3 sizes, ≥3:1 | Partly | Covers fall between sizes (K5, TD8); Day not captured |
| 10 | Motion tokens and reduced-motion versions | Can't tell | Stills only |
| 11 | Signature systems in real components | Partly | Emblems on covers, hero and Focus; stars in the Atlas. Statement cards, Constellation progress and the ∎ moment weren't captured |
| 12 | Gates run automatically | Can't tell | The legacy aliases suggest token lint isn't running (K2) |

### 8.2 The v7 plan's goals, with the kit as the token reference

| Goal | Status | Evidence |
|---|---|---|
| L1 Subject colours | Partly | The kit's palette is used. Glyphs are missing on dots (KC2); only one subject shows in Today's first viewport (C1) |
| L2 Type hierarchy | Partly | Kit roles used for sections and numerals; legacy 36 and 22 px for titles (KC8) |
| L3 Shape and depth | Partly | Kit surfaces and edges; boxes inside a box (B5); crescent edges (KC16) |
| L4 One component set | No | KC1, KC7, KC14, KC19 |
| L5 Imagery | Partly | Emblems present; the covers are weak (TD8) |
| L6 One styling source | No | Legacy aliases (K2) |
| F3 Thumb reach | No | "+ New block" in the top third; Close the day step 1 |
| S1 Start the right session | Yes | One tap, visible on open |
| S3 Capture | Partly | Error state on open (B6) |
| S4 Plan a block | Partly | The draft is hidden (QA4) |
| S6 Search | Partly | Half height (SE1) |
| Q3 Accessibility | At risk | Native controls; status and subject depend on colour; see-through bar |
| F1, F2, F4, S2, S5, Q4 | Can't tell | Not captured |

**The P1 gate cannot pass yet.** Only 4 of the 6 screens were captured, in Night only, without the frozen clock. Calendar Day, the Atlas and Today also fail their own "Done when" items (CD1, AT2, TD2).

---

## 9. Suggested amendments to the kit and to the v7 plan

### 9.1 To the kit

| # | Amendment | Why |
|---|---|---|
| KA1 | Re-scope the three kit-page-only Night rules (segmented thumb, hero emblem glow, hero star field) to `html[data-v7][data-theme=graph-night]`. | K1 |
| KA2 | Delete the 89 tokens the kit never reads, after moving app code to role tokens. Either wire up or drop the component tier. Add token lint. | K2 |
| KA3 | Resolve the four plan-versus-CSS conflicts in K3. | K3 |
| KA4 | Add `viz.neutral`, a non-subject data colour (for example `text.secondary`, which is ≥3:1 on every surface), for single-series charts and non-subject meters. | K5, KC3, KC4 |
| KA5 | Add the shell components: tab bar (solid overlay, `selection.subtle` pill on the active tab, count pip), capture button, hub header with a collapsing title, week strip, time-grid block with an inner subject rule, day strip, timer ring, review card and grade dock, map star states (reusing the proof-state marks), search sheet. | K5 |
| KA6 | Define a cover size for emblems (96–120 px) and its level of detail. | K5, TD8 |
| KA7 | Define a "live" time chip ("in 1 h 55 min", "Now · until 16:30"), probably an info Badge with a clock icon. | K5 |
| KA8 | Define a non-dashed "suggested" treatment for calendar blocks and proposed checkpoints, since dashed borders belong to drop zones. | CD3, K4 |

### 9.2 To the v7 plan

| # | Amendment | Why |
|---|---|---|
| PA0 | Replace §4 with a pointer to the kit, and update the tests that cite old tokens: | K4 |
| | • §3 L1: the kit's palette and slot order | |
| | • §3 L2: the kit's role scale instead of "exactly 9 sizes" | |
| | • §3 L3: the kit's six radii | |
| | • §4.3: drop the sky | |
| | • §5.3: breakpoints 700 and 1100 | |
| | • §6.2: the gutter is 16 | |
| | • §6.9 and §6.12: "gold star" and "9 of them gold" become "subject-filled star" and "9 demonstrated" | |
| | • §6.13: the heatmap uses the Starlight and Ink ramps | |
| | • §6.5 and §6.8–6.10: no dashed outlines (KA8) | |
| PA1 | Rename the Review hub's first tab from "Cards" to "Due" or "Review", so "Cards" means only the library under Paths. | §5.1 names two tabs "Cards" (RV6) |
| PA2 | The capture button hides while scrolling down and returns on scroll up. | SH2 |
| PA3 | Offer "Quick focus" in every hero state. | C4 |
| PA4 | On Focus, Finish is secondary until the planned length is reached. | An accent-filled Finish invites stopping early |
| PA5 | Calendar "Done when": the grid starts above 45% of the viewport and shows at least 4 hours. | CD1 |
| PA6 | Sheet and step-flow footers: secondary or tertiary on the left, primary on the right, both 48 px, fixed to the bottom. | BS3, CL1, KC10 |
| PA7 | Agenda collapses runs of empty days into one line. | CA4 |
| PA8 | Close the day step 1: when focus is zero, lead with the day's best real figure. | CL2 |
| PA9 | Atlas: dust at most 1.5 px and 30% opacity; concepts use the kit's proof-state marks. | AT3, KC18 |
| PA10 | Today's day strip shows the planning window, not 06:00–24:00. | TD6 |
| PA11 | Design lint, re-pointed at the kit: | Each of these slipped through |
| | • allowed button heights (48, 44, 40 on desktop) | |
| | • any colour outside the kit's role set | |
| | • any visible native control | |
| | • a subject colour without a glyph within 8 px | |
| | • a status colour without its icon | |
| | • indigo on a meter or chart | |
| | • text cut to fewer than four characters | |

---

## 10. Order of work

Work through the steps in order. Items within a step can run in parallel. Each step ends with a check.

### Step 0 · Make the build measurable
- [ ] C1 Capture with the audit seed and the frozen clock.
- [ ] C2 Capture viewport-sized frames on long screens.
- [ ] C3 Add the review round, the Path map, the Day theme and 1280 × 800.
- [ ] C4 Capture the Quick focus sheet.
- [ ] C5 The Owner decides whether to freeze P2 and P3 or waive the gate order.

**Check:** the six golden screens in both themes at both sizes.

### Step 1 · Fix the kit where it leaks
- [ ] KA1 The three kit-page-only Night styles.
- [ ] KA2 Remove the legacy aliases, and add token lint.
- [ ] KA3 Resolve the plan-versus-CSS conflicts.
- [ ] KA4 Add the neutral data colour.

**Check:** the kit page and the app sample the same values for the segmented control, the tab bar, the hero card and the titles.

### Step 2 · Blockers
- [ ] B1 The planner sheet
- [ ] B2 Time left on deadlines
- [ ] B3 One shared overdue count
- [ ] B4 The Calendar header row
- [ ] B5 The Review split
- [ ] B6 The capture sheet's opening state
- [ ] B7 Native controls and formats

**Check:** the B2 unit test and the B3 end-to-end test pass; lint finds no native controls.

### Step 3 · Kit compliance
- [ ] KC1 Badges with icons
- [ ] KC2 Glyphs instead of dots
- [ ] KC3 and KC4 Meter and chart colours
- [ ] KC5 Chart rules
- [ ] KC6 The Month heatmap
- [ ] KC7 Tabs
- [ ] KC8 Type roles
- [ ] KC9 Measures
- [ ] KC10 Tertiary alignment
- [ ] KC11 The hero card
- [ ] KC12 The solid tab bar
- [ ] KC14 Chips for the right job
- [ ] KC15 Status tones
- [ ] KC16 Inner rules on blocks
- [ ] KC17 to KC23

**Check:** design lint (PA11) passes on every v7 route, and the kit's scorecard rows 3, 4 and 7 read "Yes".

### Step 4 · The six golden screens
- [ ] Today: TD2–TD9, SH2
- [ ] Focus: FO1–FO4
- [ ] Calendar Day: CD1–CD6, CW2
- [ ] Atlas: AT1–AT5
- [ ] Build the review round (with the kit's statement-card typography for the card face) and the Path map (with the kit's Constellation progress and proof states).

**Check:** every "Done when" item in §6.2, §6.3, §6.4 B, §6.5, §6.9 and §6.12 of the v7 plan passes (as amended by PA0), and Appendix B reads all "yes".

### Step 5 · The P1 gate
- [ ] The six screens in Night and Day at 390 × 844, plus Today and Calendar at 1280 × 800, shown side by side in Day and Night as the kit recommends.
- [ ] The Owner's eye test; store the approved images in `docs/v7/golden/`.

### Step 6 · Everything else, only after the gate
- [ ] Review hub RV1–RV6; Practice PR1–PR5
- [ ] Week, Month and Agenda: CW3, CM2–CM5, CA2–CA5
- [ ] Block sheet BS2–BS4; Quick add QA1–QA5; Planner PL2
- [ ] Tasks TK2–TK4; Capture CP2–CP4; Search SE1–SE4
- [ ] Close the day CL1–CL7

**Check:** the P2 and P3 exit criteria in §7.3 of the v7 plan.

---

## Appendix A: measurements

Sampled from the 1× PNGs with Pillow; ±1 px for anti-aliasing. Kit values come from the CSS custom properties in `lemma-ui-kit_2.html`, under `[data-v7][data-theme=graph-night]`.

| What | Measured | Kit token | Match |
|---|---|---|---|
| Page background | `#091023` | `surface.page` `#091023` | Yes |
| Cards | `#11192C` | `surface.raised` `#11192C` | Yes |
| Sheets | `#192135` | `surface.overlay` `#192135` | Yes |
| Secondary button, segmented track | `#1E263B` | `surface.muted` `#1E263B` | Yes |
| Day-strip track, Focus background | `#050A1B` | `surface.sunken` `#050A1B` | Yes |
| Primary button | `#5159D7`, flat | `action.bg` `#5159D7` | Yes |
| Analysis, Algebra, Topology marks | `#17A9CB`, `#CE8545`, `#52D7C1` | Same | Yes |
| Their tints (hero tag, covers) | `#082831`, `#321F0F`, `#082A25` | Same | Yes |
| Overdue badge | `#301F07` with `#FFBF67` | `status.warning-subtle` and `status.warning` | Yes; no icon |
| Suggestions banner | `#112917` with `#75D78D` | `status.success-subtle` and `status.success` | Values yes; wrong job |
| Meter track | `#262D40`, 6 px | `border.subtle`, `--v7-meter` 6px | Yes |
| Hub tab pill | `#232953` with `#B9C6FF` | `selection.subtle` and `selection.fg` | Values yes; the kit's Tabs use an underline |
| Selected segment | `#192135` on a `#1E263B` track | `surface.overlay` on `surface.muted` | Matches the kit's app-level rule, which is wrong (K1) |
| Tab bar | `#151D31`, about 75% overlay over the page | `--v7-glass` = solid `surface.overlay` | No |
| Hero fill | `#0C2430`, about 55% subject tint mixed into `raised` | `surface.raised` | No |
| Selected day and now pill | `#B9C6FF` fill, dark text | No such pattern | No |
| Off-kit colours | Planner `#121212`; capture ring and planner button `#FF7B6B`; Agenda deadline card `#1A2028`; Month tint `#202841` | None | No |
| Atlas review ring | About `#F4B763` | `status.warning` `#FFBF67` (anti-aliased) | Colour yes; the shape should be ↻ |
| Page margin | 16 px | `--v7-page-margin` 16px | Yes |
| Gaps between Today's cards | 16 px | Group gap 24 | No |
| Primary heights | 48, 44, 42 | 48 (default), 44 (small) | 42 is off-kit |
| Type: titles | Capitals 24 px tall → 36 px type | Title 32, Display 44 | No (legacy `--v7-size-7`) |
| Type: section headings | Capitals 17 px → 26 px | Headline 26 | Yes |
| Type: Month heading | Capitals 15 px → about 22 px | Subhead 20 | No (legacy `--v7-size-5`) |
| Type: hero numerals | Figures 47–48 px → 64 px | Numeric xl 64 | Yes |
| Type: stat tile values | Figures 20 px → about 28 px | Stat tile uses Numeric lg 40 | No |
| Units | "min" and "s" at full size | 60% in `text.secondary` | No |

**Font metrics** were read from the WOFF2 files embedded in the kit: Newsreader has a cap height of 1340 / 2000 = 0.67 em; Instrument Sans has 720 / 1000 = 0.72 em.

**Kit token audit:** 227 custom properties are defined in the kit's CSS, and 89 are never read by it. The kit's markup reads `--v7-role-viz-heat*` (181 times) but never reads a `--v7-component-*` token.

**Limits:** stills only, so motion, haptics, gestures, keyboard use and screen-reader names weren't checked. Day and the high-contrast modes weren't captured. Corner radii weren't measured.

---

## Appendix B: the Owner's eye test on the four golden screens provided

The five questions from §7.4 of the v7 plan, answered with the kit as the token reference.

| Question | Today | Focus | Calendar Day | Atlas |
|---|---|---|---|---|
| 1. Is it obvious what to do first? | Yes | Yes | No: the grid and suggestions are below the fold | Partly: the map is small at first |
| 2. Can you tell the subjects apart at a glance? | Yes in Continue (three tints, three emblems); one subject in the first viewport | One subject on screen | No subject in the first viewport | Partly: Analysis and Topology are close, and there are no glyphs |
| 3. Does anything look like a default browser control? | No | No | Not on the screen; yes in its block sheet | No |
| 4. Is any text cramped, clipped or tiny? | Yes: a Continue tile at the edge; the capture button over "Triage"; text through the tab bar | No | Yes: "06:00" cut; suggestions under the tab bar | Yes: "Topological spac…"; labels on top of stars |
| 5. Would you show this screen to someone? | After KC11 and TD2 | After FO1 | No | After AT2 and KC18 |
