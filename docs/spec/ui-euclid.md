# Lemma UI v2: Euclid by day, Euclid at night

The owner's final choice (30 Oct 2026, 10:48): **Euclid by day and Euclid at night by night, switching with the phone's light and dark mode**, the **Ascent** timeline (Metro as the alternative), the **Orbits** Atlas (Branches and Outline kept), **compact** text and **lively** motion. Eight worlds stay selectable in Settings › Appearance: Obsidian lamp, Graph paper, Euclid, Euclid at night, Scriptorium, Astrolabe, Lamp and compass, Graph paper at night.

This document is the visual source of truth for every screen. It overrides `design.md`, `themes.md` and `lab.md` wherever they differ. The working reference is `docs/design/lab/lemma-lab.html` (Today, Paths, Atlas, Lab tabs, both Euclid worlds, every rule below already applied).

## 1. Idea

A geometer's notebook. By day: sepia vellum, brown ink, oxblood rubrics. By night: walnut ink, parchment lines, rubric red. Each screen carries one faint construction from Euclid's *Elements* that draws itself when the screen opens, like a compass and straightedge at work. Everything else is quiet: thin rules, square-ish corners, Garamond titles, serif mathematics. Colour marks only the one main action, progress, the current position, due counts and the first letter of section titles.

## 2. Tokens

| Token | Euclid (day) | Euclid at night |
| --- | --- | --- |
| `--bg` | #F1E7D3 | #17130E |
| `--card` | #FAF4E6 | #211B14 |
| `--card-2` (wells, chips) | rgba(58,46,34,.05) | rgba(237,227,207,.045) |
| `--line` (hairlines) | rgba(58,46,34,.18) | rgba(237,227,207,.14) |
| `--ink` | #33291E | #EDE3CF |
| `--ink-2` | #5A4B39 | #CBBDA2 |
| `--ink-3` (lowest text) | #6E5D47 | #A69780 |
| `--accent` (rubric) | #8C2F1E | #E8705F |
| `--on-accent` | #FFF8EE | #1A0F0B |
| `--warn` / `--bad` / `--good` | #A8590E / #9E2A2A / #3E6B2F | #E9A55B / #F07A7A / #9CC48A |
| `--track` | rgba(58,46,34,.12) | rgba(237,227,207,.10) |
| `--tab-bg` | #FAF4E6 | #1E1812 |
| card border | 1px solid rgba(58,46,34,.28) | 1px solid rgba(237,227,207,.22) |
| card shadow | 0 1px 0 rgba(58,46,34,.08) | 0 1px 0 rgba(0,0,0,.4) |

`<meta name="theme-color">` follows `--bg`. Grade colours on review buttons use `--bad`, `--warn`, `--accent`, `--good` for Again, Hard, Good, Easy.

## 3. Type

| Role | Face | Compact size |
| --- | --- | --- |
| Titles, section headings, big numbers, sheet titles | EB Garamond 500–600 (section headings italic) | headings 15.5 × 1.18, titles 15.5 × 1.18, big numbers 36 |
| Body, labels, controls, meta | Instrument Sans 400–600 | body 14 × 0.92, labels 12, captions 11.5 |
| Card fronts and answers, tutor questions, criteria | STIX Two Text (KaTeX draws formulas) | front 20, answer 17, criterion 15 |

Rubrication: the first letter of every section heading is `--accent` (`h2::first-letter`). No all-caps labels. Numbers use `font-variant-numeric: tabular-nums`. Garamond is used for numbers only where they are large (≥ 20 px) or in code badges.

## 4. Spacing and shape (the review rules)

Spacing scale (multiply by `--s`: compact .92, cozy 1, comfortable 1.1): 4, 8, 12, 16, 24.
- Side gutter 16 px. Card padding 16. Gap between cards 10–12. Gap between sections 24. Section heading to its content 10.
- List rows at least 44 px tall; hairline dividers between rows only, never above the first.
- Inside a card, content keeps at least 12 px from the card edge (only timelines' plot area and full-width dividers may go closer).
- Badges that start rows (D3, NEW, CP codes) have a fixed width so the titles after them line up.

Shapes (Euclid family):
| Element | Radius |
| --- | --- |
| Cards, sections, wells, segmented control, world switcher, minimap | 6 |
| Buttons, chips, segment thumbs, inputs, map controls | 4 |
| Code badges | 3 |
| Progress bars (they are rules: 4 px tall) | 1 |
| Bottom tab bar (floating) | 8 |
| Bottom sheets (top corners) | 10 |
| Status marks, timeline points, Atlas nodes | circles |

No pills, no glass blur, no glow in the Euclid worlds. Subject glyphs are italic serif letters in `--accent` at 24 px with no tile behind them.

Text rules: never cut a stage, checkpoint or idea name with an ellipsis inside a chart; drop the label and keep the current one. In lists, titles wrap to two lines rather than truncate.

## 5. Backgrounds: one construction per screen

A fixed canvas behind the content, faint (`--ink` at 10–13 %, `--accent` at 20–30 % for the one highlighted figure), with a short italic caption next to the figure ("Elements I.1"). Lively motion draws it on entry (§6).

| Screen | Construction |
| --- | --- |
| Today | I.1 equilateral triangle on a given line (two circles, triangle in rubric) |
| Paths and project | I.10 bisect a given line (two arcs, perpendicular) |
| Checkpoint sheet, session record | III.1 find the centre of a circle (chord, perpendicular bisector) |
| Approve, plan review | I.2 place a line equal to a given line at a point |
| Review hub | I.9 bisect an angle |
| Card review | none (the index card and the polygon are the figures) |
| Review done | the round's polygon inscribed in its circle (§8.8) |
| Insights | II.11 the golden section of a line |
| Cards and card detail | I.46 describe a square on a line |
| Atlas | none (the map is the figure) |
| Settings, sign in | I.47 (the theorem of Pythagoras) |

Each construction is a small pure function `draw(ctx, w, h, tokens, progress)` in `src/ui/backgrounds/euclid/` with `progress` 0–1 for the draw-on. Captions sit beside the figure, never at the screen bottom (the tab bar hides it).

## 6. Motion (lively by default; calm and reduced motion respected)

- **Construction draw-on**: on first visit to a screen in a session, circles draw first (as a compass would), then straight lines, then the rubric figure: 1.4 s total with `stroke-dashoffset`, ease-in-out. Calm and reduced motion show the finished figure.
- **Climber**: the Ascent marker eases along its path to the current checkpoint (700 ms) the first time a timeline appears.
- **Reveal** (card review): a hairline rule draws left to right under the front (300 ms), then the answer fades up 6 px (250 ms).
- **Approve**: a check drawn like a pen stroke (280 ms) before the card leaves.
- **Done**: the I.1 triangle closes and its three vertices pulse once.
- Screen transitions: 200 ms crossfade between tabs; drill-in 280 ms slide of 16 px. No loops except the current-position halo (2.4 s, lively only) and a slow background drift (38 s, lively only).

## 7. Components (restyle `src/ui/**`)

- `Card`: §2 border and shadow, radius 6, padding 16. Variant `quiet` (no border, `--card-2`) for wells.
- `Button`: `primary` solid `--accent` with `--on-accent`, `ghost` (`--card-2`, hairline), `text`. Height 40 compact (44 hit area). Radius 4.
- `Chip`: radius 4, hairline, `--card-2`; selected = accent border and 14 % accent fill.
- `Segmented`: radius 6 frame, radius 4 thumb in `--card` with the card shadow.
- `Check`, `Switch`: square check (radius 3); switch track radius 4.
- `Progress`: a 4 px rule, radius 1, accent fill.
- `Badge` (codes): fixed width 46, radius 3, hairline coloured by kind (gap = warn, strength = good, new = accent).
- `Glyph`: italic serif letter, accent, no tile.
- `Sheet`: `--tab-bg`, radius 10 top, grabber, title in Garamond italic.
- `Timeline` (`lab.md` §5): Ascent default, Metro alternative; labels per §4 text rules.
- `Construction` background component per §5.

## 8. Screens

1. **Today** (lab "Today"): Distance to your goals (a card per project: glyph, title, "10/40 checkpoints, now CP11 Group actions", percentage; Ascent timeline 70 px; ETA line with target, finish date and spare days), Cards (due count with Review, stacked bar by project with legend, chips for approvals, notes and new cards, 7-day forecast), From your tutor (diagnostics with fixed-width badges), Last chat (one row with a Copy button).
2. **Paths** (lab "Paths"): project chips; project card (goal, Ascent at 96 px, done count, finish and target); stages as cards that open into checkpoint rows (status mark, code column 40 px, title, step or state on the right).
3. **Checkpoint sheet**: italic Garamond title with the code in small text before it; status, stage and project chips; criterion in STIX; key–value list (step, book, cards due, sessions, reason); actions (Study in chat; Approve and Reject for proposed).
4. **Session record**: header "Session 7" (Garamond) with duration, assistant and day; goal card with the outcome mark; the reasoning laid out like a numbered proof (1, 2, 3 … down a hairline, each step with its kind icon and text; hints show their level as small rules); misconceptions as marginal notes (a 2 px warn rule on the left, never a filled box); cards from the session as small index cards (radius 4) in a row; a Copy summary button.
5. **Approve and plan review**: one proposal card at a time (radius 6, padding 20), front in STIX, back below a hairline, reason in small italic; reject, edit and approve buttons as square-ish buttons (approve is primary); swipe kept. The Plan tab lists changes like an errata sheet (add, update, move, remove, prerequisite) with one-line reasons.
0. **Tab bar** (owner, 30 Oct): icon first. Four tabs: Today, Paths, Review, Insights; only the active tab shows its label under the icon; every tab has an `aria-label`. Atlas opens from Today and Paths (header icon). The Review tab carries the due count as a small badge.
6. **Review hub**: due count (Garamond 36) and estimated minutes, Start as the primary button, Mix decks switch, decks as a tree with square checks and due counts, sessions with new cards as chips.
7. **Card review** (reference: the lab's Review tab; build it to match):
   - Full screen over the tab bar. Header: close (left), **polygon progress** (centre: a regular n-gon for the n cards of the round, edge i drawn in accent when card i is passed, dashed in `--bad` while it is waiting for a second pass, the current vertex enlarged, "3/8" beside it), note-for-tutor pen (right). Under it the project chip (glyph and title) and the checkpoint code.
   - The card is a **ruled index card**: radius 6, padding 16/18/26, faint ruled lines every 28 px under a rubric rule below the header; header row in small caps with the kind on the left and the note code (N31) in Garamond on the right; front in STIX 21/28, answer in STIX 18/28 so text sits on the rules; min height `min(50vh, 400px)`. Two card edges peek below it as the remaining deck, with "7 after this".
   - Before reveal: "How sure are you? Tapping reveals the answer." and three equal buttons with geometric marks: **Sure** (filled point), **Unsure** (circle), **Guess** (dashed circle); "Show answer" as a text button.
   - **Reveal**: a 1.5 px rubric rule draws left to right (320 ms), the answer is inked in with a left-to-right wipe (520 ms), and a small compass arc appears in the card's corner. Cloze blanks "[ … ]" turn into the highlighted words one after another.
   - After reveal: four grade buttons in one row with intervals (Again `--bad`, Hard `--warn`, Good solid accent, Easy `--good`); Good gets an outer ring when the answer was marked Sure. Swipe: right Good, left Again, up Easy, with the grade written in italic Garamond on the card while dragging (rotation dx/22°).
   - **Grade motions**: Good and Easy first stamp a tombstone ∎ in the card's corner; Again tucks the card back into the deck (down, smaller) and requeues it two cards later; Hard drifts out to the left; Good lifts up; Easy flies up and right. The next card deals up from the deck (480 ms).
   - Calibration notes under the card, in italic: Sure + Again "You were sure, so this one comes back soon"; Guess + Good or Easy "A good guess. It will come back a little sooner."
   - Keys: Space reveals or grades Good, 1–4 grade, Escape ends the round.
8. **Round complete, "Q.E.D."**: the polygon of the round draws edge by edge (missed cards in `--bad`), vertices pop, the circumscribed circle closes, radii appear, 32 rays flash outward once and the centre point pulses; then "Q.E.D." (Garamond italic 44, rubric Q, letter spacing settling from wide) and "8 cards reviewed, 1 needed a second pass." Four tiles: recalled on the first try, time for the round, right when you were sure, due tomorrow. A **transcript** row of small squares, one per card, coloured by the first answer. Buttons: "Go over the n missed" (starts a round of only those) and Done. Calm motion shows the finished figure at once.
9. **Cards and card detail**: list rows (front in STIX, one line of meta); detail with front and back, memory figures (next review, stability, recall now) and a thin ink sparkline; notes for the tutor as marginal notes; composer at the bottom.
10. **Atlas** (lab "Atlas"): Orbits by default (subject names always visible, topic names at 44 px radius, idea names at 105 px, breadcrumb, minimap, filters); Branches and Outline in the segmented control.
11. **Insights**: tiles for time, sessions and reviews (Garamond numbers); recall as an ink line with a hatched area (diagonal hairlines, no gradient) over a faint grid, target as a dashed rule; reviews by day as flat-tinted stacked bars; calibration as three rules; time by subject as rules with glyphs.
12. **Settings › Appearance**: Day and night (on, Euclid / Euclid at night), the eight kept worlds with Keep and star, timeline style (Ascent, Metro), Atlas style (Orbits, Branches, Outline), text size, motion, Preview with demo data. Other settings (connector, memory, backup) keep their content in the new components.
13. **Sign in**: the I.47 construction draws, "Lemma" in Garamond, one primary button.

## 9. Automated layout check (no human needed)

`tests/e2e/layout.spec.ts` opens every main screen in demo mode for `euclid` and `euclid-night`, in compact and comfortable text, at 390 × 844 and 360 × 740, and fails with the offending selector when:
1. the page scrolls horizontally (`scrollWidth > innerWidth`);
2. any text inside a `[data-card]` (or `.card`) sits closer than 12 px to the card's left or right edge (elements marked `data-bleed` are exempt);
3. two text elements inside the same card overlap (bounding boxes intersect by more than 1 px);
4. a text element overflows its own box (`scrollWidth > clientWidth + 1` where `overflow` is hidden);
5. a button or link is smaller than 44 × 44 px (inline text links exempt);
6. a fixed element (tab bar, floating buttons) covers interactive content at the end of the scroll (scroll to bottom, check the last interactive element is fully visible).

Every UI-5 PR also attaches `review/**` screenshots for both worlds next to the lab's matching screen.

## 10. Tasks (replace UI-4a, UI-4b and UI-4c)

| Task | Depends on | Scope |
| --- | --- | --- |
| UI-5a Foundations | — | §2–7: tokens for both Euclid worlds plus the six other kept worlds from the lab, day and night following the system by default, fonts, spacing and shape rules, components restyled, construction backgrounds with draw-on, the layout check (§9). Remove the dropped worlds and colour themes from the picker. |
| UI-5b Today and timelines | UI-5a | §8.1, Ascent and Metro components, checkpoint sheet (§8.3) |
| UI-5c Paths | UI-5a | §8.2 |
| UI-5d Atlas v2 | UI-5a | §8.10 and `lab.md` §7 |
| UI-5e Review flow | UI-5a | §8.6–8.8 |
| UI-5f Approve, plan, session | UI-5a | §8.4–8.5 |
| UI-5g Cards and Insights | UI-5a | §8.9, §8.11 |
| UI-5h Settings and sign in | UI-5a | §8.12–8.13, Preview with demo data, `settings.ui` persistence |
| DB-3, MCP-3 | — | unchanged (`lab.md` §6) |

UI-5b to UI-5h run in parallel after UI-5a merges. UI-5a should merge its tokens and components first (PR 1) so the others can start, then the backgrounds and the layout check (PR 2).
