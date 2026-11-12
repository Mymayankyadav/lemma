# Lemma v7 "Constellation": plan to make the app beautiful and state of the art

**Date:** 10 Nov 2026 · **Baseline build:** `main` at `1f1a679` (#1343, the audit-fix PR) · **Covers:** the whole web app, phone first, then tablet and desktop.

The 9 Nov audit was about things that were broken, and #1343 fixed them. This plan is about the next problem: the app now works, but it looks and feels plain. Part 1 shows that with numbers from a fresh crawl of the fixed build. Parts 2 to 6 describe the target in enough detail to build it without mockups: goals, the design system, and every screen. Part 7 is the delivery plan.

**Conventions.** Sizes are CSS pixels on a 390 × 844 phone unless stated. Names in `code` are design tokens or repo paths. Each screen item carries one of three tags: **[Restyle]** (same behaviour, new look), **[Rearrange]** (same data and actions, new layout) or **[New]** (new behaviour). Nothing in this plan needs a database, Edge Function or MCP change.

## In short

- **Where it stands.** The audit fixes hold. What is left is the look: one hue covers 6.5% of the screen area and everything else is slate, there are 18 type sizes with no hierarchy, no images, no animation at rest, and up to 20 button styles on one screen.
- **The direction.** "Constellation": every subject gets a colour and a mathematical emblem, concepts and checkpoints are stars that light up when demonstrated, and the proof mark ∎ closes every piece of work. Night is an observatory; Day is an engraved chart.
- **The goals.** 21 measurable targets for look, feel, task speed and quality (Part 3).
- **The screens.** Every screen is described from top to bottom, with sizes, states, motion and a testable "Done when" list (Part 6).
- **The order of work.** Foundations, then six "golden" screens that you approve before anything else is built, then the rest in four areas that can run in parallel, then tablet and desktop, then hardening and the switch. Everything sits behind a new `v7Shell` flag.
- **Needed from you first.** Nine decisions (§7.2). The three that shape the work most are OD1 (what v7 is judged against, since there are no mockups), OD3 (whether the tab bar may hide during a review round) and OD7 (one PR per phase or one for everything).

## Contents

1. [Where the app stands today](#1-where-the-app-stands-today)
2. [The target in one page](#2-the-target-in-one-page)
3. [Clear-cut goals](#3-clear-cut-goals)
4. [Design system](#4-design-system)
5. [App structure and navigation](#5-app-structure-and-navigation)
6. [Screen-by-screen UI description](#6-screen-by-screen-ui-description)
7. [Delivery plan](#7-delivery-plan)
8. [Appendix: how the baseline was measured](#8-appendix-how-the-baseline-was-measured)

---

## 1. Where the app stands today

### 1.1 What I re-ran

- I rebuilt `main` at `1f1a679` (production build, example workspace) and loaded the same seeded month of study as the audit. The clock was frozen at Mon 9 Nov 13:43 IST so that before and after are comparable.
- The same capture script, updated for the controls that changed, walked 100 states in Night and 100 in Day: 369 screenshots, no failed steps, no console errors.
- Two new measurements: a design-language crawl of 24 routes (which colours, type sizes, corner radii, shadows, animations and graphics the screens are made of), and a first-load performance run on a throttled phone profile.

### 1.2 The audit fixes hold

| Audit finding | State on `1f1a679` |
|---|---|
| Sheet buttons hidden under the tab bar | Fixed. I re-ran the tap test on ten sheets and one row menu at 390 × 844 and 360 × 640. Every action can be reached, in the taller sheets after scrolling inside the sheet. |
| Modals glued to the top-left corner | Fixed. They are bottom sheets with a header, a scrolling body and a fixed footer. |
| Calendar with no direct manipulation | Fixed. Day and Week are time grids with tap to create, drag to move and resize, and a now-line. |
| Overdue logic and the overdue pile | Fixed. One banner with Done and Reschedule, computed against today. |
| Developer tools as user screens | Fixed. Pickers and named selects replace ISO strings, JSON and ID fields. |
| Contradictory numbers | Fixed. Progress says 49 h in both places; Focus has one status; Today lists today's blocks. |
| Raw machine formats | Fixed everywhere except the review history on Card detail, which still prints dates as `9/11/2026`. |
| Orphaned routes and "Lemma" titles | Fixed. |

Four small leftovers I noticed while crawling:

- On Path detail the "Switch path" and "Concept map" buttons still sit edge to edge.
- In the Week grid the block text is clipped to fragments ("To…", "06:3").
- In a review round the four grade buttons sit directly under the card, mid-screen, not at the bottom edge.
- Today says "7 overdue" and Calendar says "5 overdue" at the same moment, because only Today counts tasks.

### 1.3 Why it still looks plain

These are measurements, not opinions. They cover 24 routes in Night with the seeded data. Day gives the same picture.

| What I measured | Result | What it means on screen |
|---|---|---|
| Painted area by colour | 88.9% is two almost identical slate fills (`#141C25` and `#1C2733`) | Every screen is the same dark rectangle. |
| Area with any real colour | 6.5%, and all of it one blue (hue about 240°). Red covers about 0.5%; amber and green under 0.1%. | One colour for the whole app. Subjects, states and priorities all look alike. |
| Text colour | 97% neutral; 1.1% red, 0.7% blue, 0.6% amber | Nothing is emphasised by colour. |
| Type sizes | 18 distinct sizes, but 84.8% of all text is 12, 14 or 16 px and only 1.7% is 26 px or larger | Lists of same-sized text; no hero element. |
| Weights | 68.8% regular, 20.9% medium | Little contrast in weight either. |
| Corner radii | 12 distinct values; 8 px on about half of all rounded elements | No shape system. |
| Depth | One real drop shadow (used 12 times), 0 gradients, 0 blur or translucency | Completely flat. |
| Motion | 0 animations on any screen at rest. The only motion is hover and focus colour changes and a 0.2 to 0.36 s fade or slide between routes. One haptic call in the whole app (grading a card). | Static. |
| Imagery | 0 images, 0 illustrations, 0 canvases. Charts appear only on Progress and Card detail. | A text-only product. |
| Outlined boxes | 270 bordered rounded boxes. Tasks alone has 58, nested 3 deep; Calendar Agenda has 31. | Outlines carry all the structure. |
| Button styles | Up to 20 visually different button styles on one screen (Calendar Month 20, Week 19, Day 18, Agenda 16, Inbox 13) | No single component set. |
| Native controls | 3 unstyled selects remain (two on Today, one on Cards) | |
| First load on a throttled phone (4× CPU slowdown, 1.6 Mbps, 150 ms latency) | First paint at 2.6 to 2.7 s, largest paint at 3.6 to 4.1 s, 0.8 to 1.3 s of main-thread blocking, 480 to 610 KB transferred (354 to 473 KB of it JavaScript) in 39 to 46 requests | A slow first impression. |
| Styling code | The v6 look is a 116 KB generated override sheet (`src/ui/v6/mockup.css`: 974 rules, 92 different hex colours) plus 16.6 KB of bindings, on top of three token files (`src/styles/tokens.css`, `src/styles/themes.css`, `src/ui/v6/tokens.css`) | Three styling systems at once. Every restyle fights the override sheet. |

What that adds up to, screen by screen: Today is one outlined card followed by ruled rows of icon, text and chevron. Focus is a number and three rectangles on an empty background. Review is one card and two disclosure rows above half a screen of nothing. Calendar blocks, path rows, task rows and inbox cards are all the same outlined slate box. No screen has an image, a subject colour, or a moment of reward.

### 1.4 What the repo already has that v7 should use

- **Motion:** the `motion` library is a dependency and already drives route transitions (`src/app/AppShell.tsx`), sheets and swipe-to-grade in the review round (`src/features/review-run/Page.tsx`).
- **Art:** `src/ui/art/` holds `Starfield`, `DoneBurst`, `CompassArt`, `CardFanArt` and `PageStackArt`; `src/ui/backgrounds/graph/` holds the graph-paper ground. v6 hides all of them.
- **Charts:** `src/ui/charts/` has `LineArea`, `StackedBars`, `GroupedBars`, `HBars`, `CalibrationBars` and `Sparkline`.
- **Path timeline:** `src/ui/timeline/` (`Route`, `ProjectTimeline`, `MiniStageBar`) draws a path as a line of checkpoint dots. The pre-v6 screens used it.
- **Graph libraries:** `d3-force`, `d3-zoom` and `d3-polygon` are in `package.json` but imported nowhere in `src`. The Atlas can use them without adding a dependency.
- **Typesetting and icons:** KaTeX, lucide, and four font families (Newsreader, Instrument Sans, STIX Two Text, IBM Plex Mono).
- **From #1343:** one formatter for dates, times and durations (`src/lib/format.ts`), human labels (`src/lib/labels.ts`), a native dialog (`src/ui/v6/Dialog.tsx`) and the calendar time grid (`src/features/calendar/grid/**`).
- **A gallery route:** `/kit` exists in dev, test and e2e builds. It becomes the living style guide.
- **A safety net:** 1,964 unit tests and 1,154 end-to-end tests (figures from the N121 note).

---

## 2. The target in one page

### 2.1 The idea

**Every proof you can give lights a star.**

Lemma is a notebook for learning mathematics by proving things. v7 makes what you know visible. Each concept is a star, each path is a constellation, and each checkpoint you demonstrate stays lit. Every subject gets its own colour and its own emblem drawn from real mathematics. The daily loop (plan, focus, review) is fast and works with one thumb.

- **Night** is an observatory: a deep indigo sky, luminous marks, soft glass for the chrome.
- **Day** is an engraved chart: warm paper, ink-blue text, the same marks printed instead of glowing.

### 2.2 Five principles

1. **One thing leads each screen.** One hero element and one primary action, and the action is within thumb reach.
2. **Colour means something.** A subject's colour is its identity. Gold means demonstrated. Status colours mean state. The indigo accent means "you can act on this". Everything else is neutral.
3. **Mathematics is the decoration.** Emblems, the proof mark ∎ and well-set formulas replace stock illustration.
4. **Motion explains.** It shows where something came from or went. It is short (400 ms or less in ordinary use) and it turns off with the system's reduced-motion setting.
5. **Fast with one thumb, complete with a keyboard.** Phones get gestures and bottom-anchored actions. Desktops get real layouts and shortcuts.

### 2.3 Six signature moments

These are the places where the app should make someone stop and look. Each is specified in Part 6.

1. **Opening Today:** a soft sky, a greeting, and one card that says what to do next, with the path's emblem behind it.
2. **Starting focus:** that card grows into a full-screen timer; a ring starts to fill and the emblem turns slowly behind it.
3. **Grading a card:** the answer unfolds, the card follows your thumb and leaves in the direction of the grade, with a tick you can feel.
4. **Finishing:** the proof mark ∎ draws itself. When a checkpoint is demonstrated, its star ignites on the path.
5. **The Atlas:** a night sky of everything you are learning that you can pan, zoom and search.
6. **Moving time:** a calendar block lifts under your finger, snaps in 15-minute steps and shows its new time as it moves.

### 2.4 What v7 deliberately leaves out

Backend or schema changes, native apps, third-party calendar connections, recurring blocks, AI features inside the app (the tutor stays external through the connector), and game mechanics such as points, leagues or mascots.

---

## 3. Clear-cut goals

Each goal has a measured starting point, a target, and a way to check it. "Design lint" is an automated test that reads computed styles from the running app, the same way the baseline in Part 1 was measured.

### Look

| ID | Goal | Today | v7 target | Checked by |
|---|---|---|---|---|
| L1 | Each subject has one colour, used everywhere the subject appears | No subject colours; one hue app-wide | The kit's eight validated subject colours and slot order (§4). With the audit seed, at least 3 hue families are visible in the first viewport of Today, Calendar Day and Paths, and the Progress overview shows every subject's colour in its "Time by subject" chart. | Design lint |
| L2 | A real type hierarchy | 18 sizes; 1.7% of text at 26 px or more | The kit's role scale only: Today uses Display 44; other hub titles use Title 32. | Design lint |
| L3 | A shape and depth system | 12 radii; 270 outlined boxes nested up to 3 deep; no elevation | The kit's six radii, three elevation levels, and no bordered box inside another bordered box | Design lint |
| L4 | One component set | Up to 20 button styles on one screen | At most 6 computed button styles on any screen | Design lint |
| L5 | Imagery made of mathematics | 0 illustrations; charts on 2 screens | An emblem for every path. A data graphic on Today, Review, Calendar, Paths, Path, Progress, Card and Atlas. An illustration on every empty state. | Checklist and screenshots |
| L6 | One styling source | 133 KB of v6 override CSS and 3 token files | Every v7 style reads from one token file. `mockup.css` and `mockup-bindings.css` are deleted at the switch. | Search test; files gone |

### Feel

| ID | Goal | Today | v7 target | Checked by |
|---|---|---|---|---|
| F1 | Signature motion | A generic fade or slide | The 8 transitions in §4.6, each within its duration token and each with a reduced-motion variant | End-to-end test and manual list |
| F2 | Gestures | Swipe-to-grade exists but nothing shows it; calendar drag | Visible swipe-to-grade, swipe to triage the Inbox, drag to dismiss sheets, drag and resize blocks, swipe actions on task rows | Pointer tests |
| F3 | Thumb reach | The grade row sits mid-screen; "+" is in the header | On phones no primary action sits in the top third of the screen, and the repeated actions of the core flows (reveal, grade, approve, reject, save, continue) sit in the bottom 40% | Geometry test per screen |
| F4 | Haptics | 1 call | 6 mapped events (§4.6), behind a setting | Unit test |

### Speed of the core tasks

| ID | Goal | Today | v7 target | Checked by |
|---|---|---|---|---|
| S1 | Start the right session | "Start" is in the second viewport of Today | One tap from a cold open, visible without scrolling | End-to-end test |
| S2 | Review one-handed | Grade buttons mid-screen | Reveal and grade 20 cards with every tap in the bottom third; keyboard: Space, 1 to 4, U | Geometry and keyboard tests |
| S3 | Capture anything | Header "+", then a form per type | One capture button and one sheet for a task, block, card or thought. Typing "tomorrow 4pm 90m" sets date, time and length. | End-to-end and parser unit tests |
| S4 | Plan a block | Tap a slot, fill a dialog | Tap a slot, type a title, Save: 3 interactions. Or drag, with 15-minute snap and Undo. | End-to-end test |
| S5 | Triage tutor proposals | One card at a time with buttons, or a checkbox list | 10 card proposals decided in 30 s or less by swipe; one action, with a confirmation, to approve a whole session's cards | Scripted swipes; manual timing |
| S6 | Find anything | No global search | One search across paths, checkpoints, cards, concepts, tasks, settings and actions; Ctrl or ⌘ + K on desktop | End-to-end test |

### Quality bars

| ID | Goal | Today | v7 target | Checked by |
|---|---|---|---|---|
| Q1 | First load on the throttled phone profile | First paint 2.6 to 2.7 s; largest paint 3.6 to 4.1 s; blocking 0.8 to 1.3 s; 480 to 610 KB | First paint within 1.8 s; largest paint within 2.5 s; blocking within 300 ms; Today's first load within 350 KB | Performance probe, reported on every PR; the byte budget blocks |
| Q2 | Smooth motion | Not measured | No frame longer than 50 ms during the 8 signature transitions at 4× CPU slowdown | Long-frame probe |
| Q3 | Accessibility | Passes the repo's own audit matrix | WCAG 2.2 AA: verified token contrast (§4.1), 44 px targets, full keyboard use, screen-reader names, 200% text, reduced motion, and no meaning carried by colour alone | The release-audit matrix run on v7, plus a checklist |
| Q4 | Every screen size | A phone layout, stretched | Real layouts from 700 px and from 1100 px (§5.3) | Screenshots at 390, 768 and 1280 px |
| Q5 | Safety | 1,964 unit and 1,154 end-to-end tests | All pass with the flag off. v7 adds journeys, design lint and screenshot baselines. The switch is one reversible flag. | CI |

---

## 4. Design system

**Amended 11 Nov 2026 (PA0).** The Constellation kit in `KIT_10_PLAN.md`, the generated `src/ui/v7/tokens.css`, and the live `/kit` gallery govern colour, type roles, spacing, shape, elevation, component anatomy, motion and the state model. `NIGHT_CRITIQUE_v2.md` records the corrections. The former palette, sky, glass, gradients and legacy size aliases are superseded.

- Use role tokens only. Day, Night and their high-contrast variants share component anatomy.
- Type uses Display 44, Title 32, Headline 26 and the kit's remaining roles; numerals use the Numeric roles. Phone page margin is 16 px.
- Radii are 4, 8, 12, 16, 24 and round. Buttons are 48 px on phones, 44 px small and 40 px on desktop.
- Subject colours identify Analysis, Algebra, Topology, Number theory, Geometry, Logic, Probability and Combinatorics, always with their glyph. Demonstrated stars are filled in the subject colour; completion uses the success proof badge.
- Surfaces are solid. The hero is `surface.raised`, with a 164 px emblem at the bottom-right at 10% opacity and a sparse Night star field. Hero emblems alone receive the Night glow.
- Charts and non-subject meters use `viz.neutral`; subject charts use the subject colours. Heatmaps use the Ink (Day) and Starlight (Night) ramps. Indigo is reserved for actions, selection and focus.
- Dashed borders belong only to drop zones. Suggestions and proposed checkpoints use a solid edge, subject tint/inner rule and an explicit label or mark.
- The live kit's App shell section defines the headers, dock, Capture, strips, grid blocks, timer, review dock, map states and search rows. Screen-specific layout and behaviour remain in Parts 5–7.
- Motion and haptic helpers live in `src/ui/v7/motion.ts` and `haptics.ts`. Every moving pattern respects reduced motion; haptics respect the owner's setting.

---

## 5. App structure and navigation

### 5.1 Destinations

The five tabs stay: **Today, Paths, Review, Calendar, Progress.** (The release audit expects exactly five links in the main navigation.) What changes is that the screens now buried in the "⋯" menu become tabs inside those five hubs:

| Hub | Tabs inside the hub | Routes (all unchanged) |
|---|---|---|
| Today | none | `/`, and `/today/close` from the evening card |
| Paths | Paths · Cards · Atlas | `/projects`, `/cards`, `/atlas`; details at `/p/:slug`, `/p/:slug/cp/:code`, `/s/:slug/:n`, `/cards/:no`, `/projects/new` |
| Review | Cards · Practice | `/review`, `/practice`; the round at `/review/run`, the summary at `/review/done` |
| Calendar | Schedule · Tasks | `/calendar`, `/tasks` |
| Progress | Overview · Learning · Time · Log | `/insights` (with its `view` parameter), `/log` |

- The header of every hub holds two actions: **Search** and **Inbox** (with its count). Today's header adds **Settings**. The "⋯" menu disappears from hubs. Detail screens keep a "⋯" only for actions that belong to that screen.
- The Inbox (`/proposals`, `/proposals/:id`) and Settings (`/settings`) open as detail screens with a Back control and highlight no tab.
- All 23 existing routes stay valid as deep links. A sub-route highlights its hub: Cards and Atlas highlight Paths, Practice highlights Review, Tasks highlights Calendar, the time log highlights Progress.
- The concept map is called **Atlas** everywhere (title, tab, menus). Today the title says "Concept map" and the route says `/atlas`.

### 5.2 Two global actions

- **Capture:** one floating button on every hub adds a task, a time block, a card or a thought (§6.1).
- **Search:** one search finds paths, checkpoints, cards, concepts, tasks, settings and actions (§6.1).

### 5.3 Screen sizes

| Width | Layout |
|---|---|
| Under 700 px (phones) | One column, the floating tab bar, bottom sheets. Everything in Part 6 describes this size first. |
| 700 to 1099 px (tablets, small windows) | The tab bar becomes a 72 px icon rail on the left with the capture button at its top. Content is one column up to 720 px wide; card lists (Paths, stat tiles, "Continue") become two columns. Sheets become centred dialogs from 700 px. |
| 1100 px and up (desktop) | A 248 px side rail: the ℓ mark and "Lemma"; a search field showing its shortcut; the five destinations; a "Library" group (Inbox with its count, Cards, Atlas, Tasks, Practice, Time log); and at the bottom the running session (when there is one) and Settings. Content is up to 1,200 px wide with the layouts below. |

| Screen | Desktop layout |
|---|---|
| Today | Two columns: the briefing (hero, targets, "Needs you") on 7 of 12 columns and today's live time grid on 5. |
| Calendar | The Week grid by default. A 280 px left panel with a mini month and the selected day's due items. A 320 px inspector on the right when a block is selected. |
| Review round | The card centred at 640 px. Each grade button shows its key (1 to 4). |
| Paths | A three-column grid of path cards. |
| Path | The path map on 5 of 12 columns, the selected checkpoint on 7. |
| Inbox | The queue on the left, the selected proposal on the right. Keys: A approve, R reject, E edit, arrows to move. |
| Cards | A table-like list (front, path, checkpoint, due, state) with a preview pane. |
| Atlas | The map edge to edge, with a 360 px inspector. |
| Progress | A 12-column grid: the hero figure and tiles on top, the heatmap full width, then charts two abreast. |

**Keyboard on desktop:** Ctrl or ⌘ + K opens search. N opens capture. Outside a review round, 1 to 5 switch tabs. F starts or returns to focus. In a review round, Space reveals, 1 to 4 grade and U undoes. Arrows and Enter move through lists. Esc closes the top layer. "?" lists the shortcuts.

The main-navigation landmark contains exactly the five destination links at every size. The Library group in the desktop rail is a second, separately named landmark.

---

## 6. Screen-by-screen UI description

Each screen below has: what it is for, what it looks like today, the v7 layout from top to bottom, its states, how it moves, and a "Done when" list that can be tested. The sketches are 390 px wide phones drawn in text; the notes to their right give sizes and tokens. Example content comes from the seeded workspace at 13:43 on Mon 9 Nov.

### 6.1 The shell: headers, tab bar, session row, capture and search

**Today:** every hub has a title and three icons (Inbox, "+", "⋯"). A 60 px tab bar is fixed to the bottom edge, and a focus dock sits above it while a session runs.

```
|                                      |
|                               +----+ |
|                               | +  | |   capture button, 56
|                               +----+ |
| +----------------------------------+ |
| | o Heine-Borel..  Focus 24:58 (II)| |   session row, 48 (only while
| |----------------------------------| |   a session exists)
| | Today  Paths  Review  Cal  Progr | |   tab bar, 64, floating glass
| +----------------------------------+ |
+--------------------------------------+
```

**A. Hub header** [Restyle]
- Row 1 is 60 px tall. On Today it shows the ℓ mark and the date ("Monday 9 November", Body S, `ink-2`) on the left. On the other hubs the left side is empty.
- On the right are 44 px round icon buttons in `ink-2`: Search, then Inbox with a count badge (18 px, `accent-fill`, white 12/600, ringed in the page colour). Today adds Settings as a third. These buttons form the "Page actions" landmark the release audit looks for.
- Row 2 is the hub title in Display (36/40), followed by the hub tabs where the hub has them (§5.1).
- After 48 px of scrolling, row 2 collapses into a 52 px sticky glass bar that shows the title at 16/600 in the centre and keeps the actions.

**B. Detail header** [Restyle]
- A 52 px sticky glass bar: Back (44 px) on the left, the title at 16/600 in the centre (one line, truncated), and one action or a "⋯" menu on the right.
- The large title lives in the page content below, in Title (28/34), so long names wrap properly.

**C. Immersive header** (Focus, review round, close-the-day flow, first run) [Restyle]
- Close or Minimise on the left, progress in the centre, "⋯" on the right. No tab bar (see decision OD3 in §7.2).

**D. Tab bar** [Restyle]
- A floating glass pill: 12 px from the left, right and bottom edges (plus the device's safe area), 64 px tall, 24 px corners, level 3, `line-strong` ring. Where blur is unsupported or the owner turns on "Reduce effects", the background is solid `bg-overlay`.
- Five equal columns. Each tab is a 22 px icon above a 12/600 label. Inactive tabs are `ink-3`. The active tab has an `accent` icon, an `ink` label and a `wash-strong` pill behind it (52 px tall, 18 px corners) that slides between tabs (T1).
- Icons: house for Today, route for Paths, layers for Review, calendar for Calendar, columns for Progress.
- The Review tab shows the number of cards due today in a small `accent-fill` pip at the top-right of its icon; nothing at zero.
- Page content gets bottom padding equal to the bar, its margins and 24 px, so nothing hides behind it.

**E. Session row** [Restyle of the focus dock]
- Present only while a focus session exists (running, on a break or paused). It is a 48 px row attached to the top of the tab bar inside the same glass container, separated by a hairline.
- Left to right: an 8 px dot in the subject colour, the session title (14/600, one line), the state in `ink-3` ("Focus", "Break" or "Paused", the same word the Focus screen shows), the time left (16/600, tabular), and a 36 px round Pause or Resume button.
- Tapping anywhere else on the row opens Focus.

**F. Capture** [New]
- The button: 56 × 56 with 20 px corners, the overlay surface, a `line-strong` ring, a 24 px plus icon in `accent`, and level 2. It is deliberately not filled with the accent, so that a screen's primary button stays the only accent-filled control. It sits 20 px from the right edge and 16 px above the tab bar (above the session row when that shows).
- It is hidden while a sheet or an immersive screen is open and on screens with their own bottom action bar (Inbox, Checkpoint, the card editor).
- A tap opens the capture sheet. A long press (350 ms) shows the four types to pick directly. On Calendar a tap starts a block at the next free half hour of the day in view.
- The capture sheet:
  - One large text field with the keyboard already up. Placeholder: "What do you want to add?"
  - Four type chips under it: Task, Time block, Card, Thought. The app preselects one from the text and the owner can change it. Text with a time or a length ("tomorrow 4pm 90m", "Fri 10:00", "for 45 min") selects Time block. Text of the form "front :: back" selects Card. While a focus session runs the default is Thought, linked to that session. Otherwise it is Task.
  - Recognised parts become removable tokens under the field: "Tomorrow", "16:00", "90 min", and a path when its name follows "#".
  - Footer: the primary button names the result ("Add task", "Add block", "Add card", "Park thought"). A ghost "More options" opens that type's full sheet (the existing task, block and card forms).
  - After saving, a toast confirms with Undo and Open.
- The recogniser is local and rule-based: dates (today, tomorrow, weekday names, "9 Nov"), times (16:00, 4pm), lengths (90m, 1h30, 45 min) and "#path". Anything it does not recognise stays in the title.

**G. Search** [New]
- A full-height sheet on phones, a 640 px dialog on desktop. The field is focused on open; its placeholder is "Search or jump to…".
- Before typing: "Recent" (the last five things opened) and "Actions" (Start focus, Review 23 cards, New time block, Close the day, Switch to Day).
- While typing: results in groups of at most four with "Show all": Paths, Checkpoints, Cards (with rendered formulas), Concepts, Tasks, Settings, Actions. Each row has a lead glyph or icon, the title with the matching part in `ink` and the rest in `ink-2`, and the parent path on the right.
- Enter opens the first result; arrows move between results.
- It searches the data the screens already load (paths, card search, the Atlas, tasks). No backend change.

**H. Offline and errors** [Restyle]
- Offline: a pill under the header that carries the app's current offline message.
- A failed load: a banner inside the affected card with a sentence and Retry. The rest of the screen stays usable.

**Done when**
- Every route except sign-in still meets the release audit: the header, five navigation links and the page-actions landmark (on immersive screens as decided in OD3), with no sideways scrolling at 320, 360 and 390 px in both themes and at 200% text.
- The tab pill slides on a tab change, and the session row shows the same state word as the Focus screen.
- From any hub, capture adds a task in two taps plus typing. "Rudin ch 4 tomorrow 4pm 90m #real" produces a 90-minute block tomorrow at 16:00 linked to Real Analysis.
- Search for "compact" returns results in at least four groups with the seeded data, and Enter opens the first.

### 6.2 Today

- **For:** deciding what to do now, in one glance.
- **Today:** an outlined card with a start-focus form (or a "Return to focus" card), then ruled rows of icon, text and chevron. The row that starts the next block is in the second viewport.

```
+--------------------------------------+
| [l] Monday 9 November   (S)(I6)(Set) |   header, 60
|                                      |
| Good afternoon                       |   Display 36
| Three study blocks left, 23 cards    |   Body 16, ink-2
| due and 7 things overdue.            |
| +----------------------------------+ |
| | (o Real Analysis) (in 1 h 17 min)| |   hero card: radius 28,
| |                           emblem | |   subject tint, emblem off
| | Heine-Borel proof attempt        | |   the corner; Title 28
| | 15:00-16:30 . 90 min . Compactn. | |   Body S 14
| | [    Start now    ]  [ Details ] | |   primary + secondary, 48
| +----------------------------------+ |
| +----------------------------------+ |
| | Today     3 h 30 planned . 40 min| |   day strip card
| | [#....|......==..xx...===x.=...] | |   06:00 to 24:00 + now-line
| | 06   09   12   15   18   21   24 | |
| +----------------------------------+ |
| +----------------------------------+ |
| | Focus    [###.......]  40/120 min| |   targets: a meter list
| | Reviews  [..........]   0/23     | |
| | Practice [..........]   0/2      | |
| +----------------------------------+ |
|                               [ + ]  |   capture button
| ( Today  Paths  Review  Cal  Progr ) |   tab bar
+--------------------------------------+
```

**Layout, top to bottom**

1. **Header** (§6.1 A).
2. **Greeting** [New]
   - "Good morning" from 04:00, "Good afternoon" from 12:00, "Good evening" from 17:00, in Display.
   - One briefing sentence in Body, `ink-2`, at most two lines. It is assembled by fixed rules from up to three facts, in this order of priority: a running session, the next block, the number of study blocks left today, cards due, overdue items. With nothing to report it reads "Nothing scheduled. A good day to get ahead."
3. **Hero card** [Rearrange]. Always present. One of five states:

| State | Chips | Title and line | Buttons |
|---|---|---|---|
| A block is coming up today | Subject chip; "in 1 h 17 min" | The block title in Title; "15:00–16:30 · 90 min", plus the checkpoint name when the block is linked to one | Primary "Start now"; secondary "Details" (opens the block sheet) |
| A block's time has started | Subject chip; "Now · until 16:30" | As above | Primary "Start focus"; secondary "Details" |
| A session is running, paused or on a break | Subject chip; the state word | The intention in Title; the time left in Figure L (tabular) with a 4 px progress bar in the subject colour | Primary "Return to focus"; a 44 px round Pause or Resume |
| Nothing left today | "Free afternoon" | "Nothing planned for the rest of today" | Primary "Plan my day" (opens the planner); secondary "Quick focus" (opens the start sheet, §6.3) |
| The day is closed | Gold "Day closed ∎" | "2 h 10 min studied today" | Secondary "Plan tomorrow" |

   The card is tinted with the block's subject colour and carries that path's emblem at 250 px, bleeding off the top-right corner. Without a subject it uses the accent and the rose emblem.
4. **Day strip** [New]
   - A card with the label "Today" and, on the right, "3 h 30 planned · 40 min done".
   - The strip is 34 px tall with 10 px corners on `bg-inset` and represents 06:00 to 24:00. Study blocks are rounded segments in their subject colours. Busy time is a neutral diagonal hatch. Time already logged is drawn at 50% opacity. A 2 px `ink` line with a soft halo marks now.
   - Under it, hour labels every three hours (Caption, tabular, `ink-3`).
   - Tapping the card opens Calendar Day.
5. **Targets** [Rearrange]
   - A card with a three-row meter list: **Focus** (minutes logged today against the daily minimum in Settings), **Reviews** (answered against due today), **Practice** (done against due today).
   - All three fills use the accent. A completed row swaps its value for a check mark with the word "Done" in the good colour.
   - A row whose target is zero is left out. With no targets at all the card is left out.
6. **Needs you** [Rearrange]. A card of at most four rows plus "Show all (n)":
   - Review: layers icon, "23 cards due", "about 10 min", and a small secondary "Review" button.
   - Tasks due today: a checkbox, the title on up to two lines, and "High · due today · 45 min". Checking it completes the task, with an Undo toast.
   - Practice due: the topic and a small "Practice" button.
   - Overdue: a warning chip "7 overdue" and a ghost "Triage" that opens the overdue sheet (Done, Reschedule, Hide until tomorrow per item). The overdue count is the same wherever it appears: tasks, deadlines and practice topics together.
7. **Continue** [New]
   - A horizontally scrolling row of path tiles, 156 × 196 with 20 px corners.
   - Each tile: a 108 px cover with the emblem, the path title (16/600), "Now: Compactness" (Body S, `ink-3`) and a thin meter.
   - A tap opens the path (T2).
8. **Inbox peek** [Rearrange]. Only when proposals are pending: one row, "6 proposals from your tutor", with a small fan of three card outlines. It opens the Inbox.
9. **Close the day** [Rearrange]. After the day-end time in Settings (17:00 by default): a card with today's totals and a secondary "Close the day" button.

Sections with nothing to show are left out instead of being shown empty. The hero card is the exception.

**States**
- First run, with no path yet: the hero becomes "Start your first path" with a primary button, and the rest of the page is three short tips.
- Loading: a skeleton with the shapes of the greeting, hero and strip.
- A failed section: a banner inside that card only.
- Heavy data: the lists are capped as described, so the page stays under the repo's limit of 1,500 elements on Today.

**Motion**
- On first paint the hero's emblem draws once and the meters fill (T8).
- "Start now" plays T4. Pull to refresh re-reads the data.

**Desktop:** two columns (§5.3). The right column is today's live time grid, so the day strip is not needed there.

**Done when**
- At 390 × 844 the hero card and its primary button are fully visible without scrolling, and that button is the only accent-filled control in the first viewport.
- With the seed, the day strip shows two subject colours (Analysis cyan for Real Analysis, Algebra tan for Linear Algebra) beside the accent, and the briefing reads as in the sketch.
- Each of the five hero states renders from real data, and each has a test.
- Starting the next block takes one tap from a cold open.
- Under the heavy-data profile, Today stays below 1,500 elements.

### 6.3 Focus

- **For:** staying in one session; nothing else on screen.
- **Today:** an eyebrow, the path name, a large timer, a thin bar, the intention, two outlined buttons, one filled button, two text links and a disclosure, on an empty background.

```
+--------------------------------------+
| (v)       (o Real Analysis)     (..) |   minimise, subject chip, more
|                                      |
|            .-''''''''''-.            |
|          .'              '.          |   ring, 280 across: 6 px track,
|         /    FOCUS 1 OF 4   \        |   progress arc in the
|        |                     |       |   subject colour
|        |       24:58         |       |   Figure XL 64, tabular
|        |                     |       |
|         \     ends 14:08    /        |   Caption
|          '.              .'          |
|            '-..........-'            |
|                                      |
|   Prove the quotient-map criterion   |   Headline 22, tap to edit
|                                      |
| +----------------------------+ +---+ |
| | Park a thought...          | | ~ | |   thought field 52, "Drifted"
| +----------------------------+ +---+ |
|                                      |
|     ( cup )    (( || ))    ( check ) |   round buttons: 56, 72, 56
|      Break       Pause      Finish   |   Caption labels
+--------------------------------------+
```

**Starting a session** [Rearrange]
- One tap on Today's hero, or "Start focus" in a block's sheet, starts a session linked to that block.
- "Quick focus" opens the **start sheet**, which replaces the form that sits on Today now:
  - an intention field;
  - a row of path chips (the active paths, each with its glyph);
  - three preset cards: "Pomodoro · 25 / 5 × 4", "Flowtime", "Open". The owner's own presets from Settings follow;
  - a primary "Start focus".

**The running screen** [Restyle]
- **Background:** `bg-inset`, with the path's emblem at 520 px in the centre at 12 to 18% opacity, turning once every 240 s, under a soft vignette.
- **Top bar:** Minimise (chevron down) on the left, the subject chip in the centre, "⋯" on the right (Timer details, Chime, Keep screen awake).
- **The ring:** 280 px across. A 6 px track in `wash-strong` and a 6 px arc in the subject colour with a round cap and a 10 px dot at its head. Inside: the eyebrow "FOCUS 1 OF 4", the time left in Figure XL (tabular), and "ends 14:08" in Caption.
- An open-ended session has no ring. It shows the elapsed time counting up, with the eyebrow "OPEN SESSION".
- **Intention:** one or two lines in Headline, centred. A tap edits it.
- **Thought row:** a 52 px field, "Park a thought…", which saves on Enter and confirms with a small check. Beside it is a 52 px round "Drifted" button: a tap logs one distraction and shows "Noted" for a second; a long press asks how many minutes and whether to leave them out of the logged time.
- **Controls:** three round buttons with Caption labels beneath. Break (56 px, secondary, cup icon), Pause or Resume (72 px, `ink` icon on `wash-strong`), Finish (56 px, accent fill, check icon).

**Other states**
- **Break:** the ring turns `ink-3`, the eyebrow reads "BREAK", and the centre shows the break time left. One slow breathing circle replaces the emblem's rotation (4 s in, 6 s out). The centre button becomes a primary "Resume now".
- **Paused:** the time dims to `ink-2`, the eyebrow reads "PAUSED", and the centre button becomes Resume.
- **Phase end:** the ring pulses once, with the success haptic and the optional chime. The next phase starts or waits according to the preset, as it does today.
- **Timer details** (under "⋯") keeps the existing controls: when the phase ends, skip to the next phase, take control from another device.

**Finishing** [Restyle]
- Finish opens a sheet, "Log this session":
  - minutes to save (a stepper in whole minutes, prefilled);
  - "How did it go?" as five tappable dots from "Rough" to "Great";
  - an optional "What did you learn?" field;
  - a primary "Save" and a ghost "Discard" in critical text, which asks for confirmation.
- On Save the proof mark plays (T6), a toast says "Logged 25 min to Real Analysis", and the app returns to Today, where the Focus meter fills to its new value (T8).

**Minimise:** the screen shrinks into the session row (T4 in reverse). The session keeps running.

**Desktop:** the same composition, centred, with the ring at 360 px. Space pauses and resumes, B takes a break, Enter in the thought field parks a thought, Esc minimises.

**Done when**
- The state word (Focus, Break, Paused) is identical on this screen, in the session row and on Today's hero.
- The ring's arc matches the time left to within one second after a reload.
- Parking a thought takes one field and Enter, and never leaves the screen.
- With reduced motion on, the emblem and the breathing circle are still.
- All three controls sit in the bottom 40% of the screen.

### 6.4 Review

- **For:** keeping what you have learned, in a few minutes a day.
- **Today:** the hub is one card (count, estimate, Start) and two disclosure rows above an empty half-screen. In a round, the four grade buttons sit directly under the card, mid-screen, and the tab bar stays visible.

**A. Review hub** (the "Cards" tab of Review) [Rearrange]

1. **Hero card.**
   - The number of cards due in Figure XL ("23") beside "cards due today" in Body.
   - Under it, "about 10 min" and a thin segmented bar (8 px, fully rounded, 2 px gaps) that splits the 23 by subject: 14 Real Analysis, 6 Linear Algebra, 3 Topology. Each part also appears as text beside its subject dot, so the bar is never the only source.
   - A primary "Start review" spans the card.
   - Below it, a ghost "Customise this round" opens a sheet with the deck list (checkboxes, with sub-decks on demand), the order, and the daily limit, which links to the setting.
2. **Due each day** [New]. A column chart of the next 14 days in one hue (the accent ramp). Today's column is at full strength and the rest at 60%. Only today and the highest day are labelled. A tap on a column shows its date and count.
3. **Memory tiles.** Three stat tiles: Recall (30 days), Reviews (30 days), Typical answer time.
4. **Decks.** One row per path: glyph tile, name, "14 due", and a switch that includes or excludes the deck. A chevron opens its sub-decks.

With nothing due, the hero reads "All caught up" with the proof mark, the next due date, and a secondary "Review ahead" if early review is allowed.

**B. Review round** [Restyle]

```
+--------------------------------------+
| (x)          7 of 23        (u) (..) |   leave, count, undo, more
| ======-----------------------------  |   4 px segmented progress
| +----------------------------------+ |
| | (S Real Analysis . Compactness)  | |   review card: radius 28,
| | DEFINITION                       | |   level 2, padding 24
| |                                  | |
| | Why does a finite intersection   | |   Reading L 22
| | of open neighborhoods remain     | |
| | open?                            | |
| | -------------------------------- | |
| | ANSWER                           | |   Eyebrow
| | For each x in the intersection,  | |   Reading 18
| | choose an open neighborhood      | |
| | inside every set; finitely many  | |
| | such neighborhoods intersect in  | |
| | an open set.                     | |
| |                                  | |
| | (Rudin p. 40)          You: Sure | |   source chip, confidence
| +----------------------------------+ |
| +-------+ +-------+ +-------+ +----+ |
| | Again | | Hard  | | Good  | |Easy| |   grade dock at the bottom
| | 10 min| | 30 d  | | 31 d  | |2 mo| |   edge; buttons 64 tall
| +-------+ +-------+ +-------+ +----+ |
+--------------------------------------+
```

- **Top bar:** Leave (keeps the round so it can be resumed), "7 of 23", Undo last answer (disabled until the first answer), and "⋯" (Edit card, Pause card, Why this card).
- **Progress:** a 4 px bar under the top bar with one segment per card. Answered segments take the colour of their grade; the rest are `wash-strong`.
- **The card:** raised surface, 28 px corners, level 2, 24 px padding. A subject chip with the checkpoint name, and the card type as an eyebrow. The front in Reading L.
  - Before the reveal the card is centred in the free space. "How sure are you?" sits under the text with three filter chips (Sure, Unsure, Guess). It is optional, as today.
  - After the reveal, a hairline, the eyebrow "ANSWER", the back in Reading with formulas typeset, then the source chips and the chosen confidence.
  - A long card scrolls inside itself. The dock never moves.
- **The dock,** 16 px above the bottom safe area:
  - Before the reveal: one 56 px primary, "Show answer".
  - After the reveal: four grade buttons in a row, each 64 px tall with 14 px corners, a 3 px top edge in its grade colour and a `wash` fill. Each has a 14/600 label and its next interval in Caption ("10 min", "30 days", "31 days", "2 months").
- **Swipe** [Restyle; the gesture exists]: after the reveal the card follows the thumb. Right is Good, left is Again, up is Easy. The first three rounds show a one-line hint under the card. While dragging, a label in the grade colour follows the card ("Good · 31 days"), and the card tilts up to 6°.
- **On a grade:** T5 plays with the grade haptic.
- **Keyboard:** Space reveals, 1 to 4 grade, U undoes.

**C. Round complete** [Restyle]
- The proof mark draws itself (T6) above "Round complete" in Display. This shows only when at least one card was answered.
- Three stat tiles: cards, time taken, recalled on the first try.
- A tall segmented bar (28 px) shows the split of the four grades, each count printed in its segment, with a legend.
- "Next: 12 cards tomorrow."
- A primary "Done" and, when more cards are available, a secondary "Review 10 more".
- Opened directly with no round: the existing empty state, restyled.

**Practice** (the second tab of Review) is described in §6.13.

**Done when**
- The reveal button and all four grade buttons are in the bottom third of the screen for every card length.
- A full round of 23 cards can be done with swipes only and with keys only.
- The progress bar shows one coloured segment per answer, and Undo removes the last one.
- The hub's segmented bar adds up to the due count, and each part is also given as text.

### 6.5 Calendar

- **For:** seeing the shape of the day and week, and moving time around by hand.
- **Today:** a date navigator, an overdue banner, a four-way segmented control and a "Planning tools" button are stacked above the content, each on its own row. The Day and Week grids work, but every block is the same outlined box in one colour. In Week the block text is clipped to fragments. Month shows dots.

```
+--------------------------------------+
| Calendar                    (S) (I6) |   Display 36
| [ Schedule ]  Tasks                  |   hub tabs
| November 2026 v            ( Today ) |   month label opens the month
|  M    T    W    T    F    S    S     |   grid; "Today" pill when away
| (9)  10   11   12   13   14   15     |   week strip: selected day is
|  ..   ..  ...   .         ..         |   filled; dots = study blocks
| [Day]  Week   Month   Agenda         |   segmented control
| (! 7 overdue) (Practice: Compactn.)  |   all-day lane: chips
| 13 |                                 |
|    |--13:43--------------------------|   now-line with a time pill
| 14 | : SUGGESTED  Write up compact : |   suggestion: dashed outline
|    | : subsets . 45 min            : |
| 15 | +-----------------------------+ |
|    | | Heine-Borel proof attempt   | |   study block: 4 px subject
| 16 | | 15:00-16:30 . Real Analysis | |   bar, subject tint
|    | +-----------------------------+ |
| 17 | [/// Lab meeting . 17:00 ////]  |   busy block: hatched
| 18 |                                 |
| 19 | +--------------+                |
| 20 | | Problem set 6| [// Dinner //] |   an overlap: side by side
| 21 | +--------------+                |
|                               [ + ]  |
| ( Today  Paths  Review  Cal  Progr ) |
+--------------------------------------+
```

**Above the grid**

1. **Header and hub tabs:** Schedule · Tasks.
2. **Date row:** the month ("November 2026") with a chevron, which opens the month grid as a drop-down. On the right a "Today" pill appears only when another day is in view.
3. **Week strip** [New]
   - Seven cells. Each has the weekday initial (Caption, `ink-3`) and the date (16/600) in a 36 px circle.
   - The selected day is an `accent-fill` circle with a white number. Today, when not selected, has an accent ring.
   - Under each date are up to three 5 px dots in the subject colours of that day's study blocks.
   - Swiping the strip changes week; tapping a day selects it.
4. **View switch:** the existing four-way control (Day, Week, Month, Agenda), restyled as a segmented control. Day is the default.
5. **All-day lane** (Day and Agenda): one row of chips that scrolls sideways. First the overdue summary as a warning chip ("7 overdue", the same shared count as on Today), which opens the overdue sheet from #1343 (Done, Reschedule, Hide until tomorrow). Then anything due that day, each with a flag or practice icon. The row is absent when empty. This replaces the full-width banner.
6. **Suggestions banner** [Rearrange]: when the planner has suggestions for the day in view, one line ("3 suggested blocks for today") with a small primary "Add all" and a ghost "Adjust".

**The Day grid** [Restyle]

- An hour is 64 px tall, so 15 minutes is 16 px. The left gutter is 44 px with hour labels in Caption (tabular, `ink-3`) in the owner's clock format. Hour lines are solid hairlines.
- It opens with the now-line one third of the way down. Other days open at the start of the planning window.
- **Now-line:** a 2 px accent line with a time pill in the gutter ("13:43", white on `accent-fill`). Everything above it is drawn at 60% opacity.
- **Study block:** 12 px corners, the subject colour as a tint (18% Night, 12% Day), and a 4 px bar in the full subject colour down the left edge. The title is 14/600 in `ink` on up to two lines. Under it, the time range and path name in Caption. A block shorter than 45 minutes shows one line; a block shorter than 30 minutes shows the title only and extends its tap area to 44 px.
- **Busy block:** a `wash` fill with a neutral diagonal hatch, the title in `ink-2`, and no subject bar.
- **Logged session:** the subject tint at 34% with a check icon and "40 min logged".
- **Planned block marked done:** a check icon, with the title in `ink-2`.
- **Overlap:** the blocks share the width side by side with a 2 px gap.
- **Suggestion:** a solid 1 px `border.default` edge, a low-strength subject tint, an inner subject rule and a "Suggested" info badge, then the task title and length. A tap opens a small sheet: "Add to calendar" (primary), "Change time", "Dismiss".
- **Links:** a small target icon when the block is linked to a checkpoint, a small checkbox icon when it is linked to a task.

**Interactions**

- **Tap an empty time** [Restyle]: a 30-minute draft appears there and a quick-add sheet rises with the title field focused, length chips (25, 50, 90 min), a Study or Busy switch and path chips. Save is the primary. "More options" opens the full block sheet.
- **Tap a block:** the block sheet.
- **Press and hold (300 ms)** lifts a block. Dragging moves it in 15-minute steps (T7). A handle on the bottom edge resizes it. Dragging near the top or bottom scrolls the grid. Dropping it on another day in the week strip moves it to that day [New]. On release a toast confirms: "Moved to 16:00–17:30 · Undo".
- **Swipe** the grid sideways to change day.
- **Keyboard:** unchanged from #1343 (Alt + arrows move, Alt + Shift + arrows resize, Enter opens).

**Week** [Restyle]
- The week strip is the column header. The gutter is 36 px and an hour is 48 px. Under each date, the minutes logged that day in Caption.
- On a phone each column is about 45 px wide, so blocks are bars without text: the subject tint, the subject bar, and the subject glyph at the top when the block is at least 28 px tall. Busy time is hatched. Position and colour carry the meaning, and nothing is clipped.
- From 600 px wide, blocks also show their titles (Caption 600, two lines).
- A tap on a block opens its sheet, and a tap on a date opens Day. Blocks can be dragged between days.

**Month** [Restyle]
- A grid of cells about 50 × 56. Each has the date (14/600; other months in `ink-3`), a background tint for logged time on the five-step accent ramp, up to three subject dots for planned study, and a small flag when something is due.
- Today has an accent ring. The selected day has `wash-strong`.
- Tapping a day selects it and lists its items under the grid as Agenda rows, with an "Open day" button.
- A legend under the grid explains the tint and the dots. No cell prints "0".

**Agenda** [Restyle]
- Sticky day headings ("Today · Mon 9 Nov") on glass.
- Rows: a 4 px subject bar, the time range in a fixed 92 px column (Body S, tabular), the title (16/600) and a meta line.
- Empty days collapse to one line: "Nothing planned · Add".
- An overlap shows a warning chip on the later block ("Overlaps Dinner with family"), which opens the existing resolve sheet (Move, Shorten, Keep both).

**Block sheet** [Restyle]
- Header: the eyebrow "TIME BLOCK" and the title as an inline field in Headline.
- For an existing study block, a secondary "Start focus" sits at the top of the body.
- Then: a Study or Busy segmented control; a "When" group (date picker row, the time picker with start and end, length chips); and picker rows for Path, Checkpoint (once a path is chosen) and Task.
- Footer: a ghost "Delete" in critical text on the left, which confirms in place, and a primary "Save" on the right.

**Planner** [Rearrange]
- "Plan my day" (from Today's hero or the suggestions banner) no longer opens a form. Its suggestions appear on the grid as solid-edge labelled blocks, with the banner's "Add all".
- "Adjust" opens the existing list, restyled: one row per suggestion with a checkbox, the task, the proposed time and "Change time". "Not placed" items follow, with their reasons as sentences.

**Done when**
- At 390 × 844 the Day grid starts above 45% of the viewport and shows at least four hours above the dock.
- At 390 px every block of 30 minutes or more shows a readable title in Day, and Week shows either a full word or no text at all (never a fragment).
- With the seed, Wednesday 11 Nov shows three subjects in three colours, and each block also names its path.
- Tap a slot, type a title, Save: three interactions create a 30-minute study block at the tapped quarter hour.
- A drag moves in 15-minute steps with a tick per step and ends with an Undo toast. The keyboard move and resize from #1343 still pass their tests.
- The grid opens with the now-line in view and the pill shows the current time.
- Month never prints "0m" or "0 blocks".

### 6.6 Tasks (Calendar › Tasks)

**Today:** grouped by status, with a checkbox, chips and a "⋯" per row. It has 58 outlined boxes nested three deep.

[Rearrange]
- **Segmented control:** To do · Doing · Done (backlog, in progress, completed). Cancelled tasks sit at the end of Done under a collapsed "Cancelled".
- **Filter chips:** All paths (opens a picker), Overdue with its count (a warning chip when not zero), High priority.
- **One card per group, rows inside, no boxes inside boxes.** In "To do" the groups are Overdue, Today, This week, Later and No date, each with an Eyebrow heading.
- **Row** (64 to 84 px): a 24 px checkbox in a 44 px target; the title (16/600, up to two lines); then one line of chips: due ("Today", "Fri 13 Nov", or a warning "Overdue · Sat"), a flag for High priority only, the estimate ("45 min"), and the path's dot and glyph.
- **Swipe right** completes the task. **Swipe left** reveals Schedule (opens quick-add with the task linked and its estimate as the length) and More (Edit, Move to Doing, Cancel, Delete).
- **Press, hold and drag** reorders within a group. The "⋯" menu keeps "Move up" and "Move down" for keyboards and screen readers.
- **Header action:** a ghost "Plan these", which asks the planner to place the unscheduled tasks (§6.5).
- **Done tab:** rows with a filled check and the completion date; swipe to reopen.

**Done when**
- No bordered box sits inside another.
- Overdue tasks carry a warning chip and sort first.
- Completing by checkbox or by swipe shows an Undo toast.
- A reorder by drag persists after reload and is also possible from the menu.

### 6.7 Close the day

**Today:** a single page with saved time, parked thoughts, tomorrow's first block and "Start a plan for tomorrow".

[Rearrange] An immersive three-step flow. The header has Close and three progress dots.

1. **Today.** The time studied in Figure XL ("2 h 10 min"), the three targets as a meter list, and the day's sessions as rows (title, minutes). Primary: "Next".
2. **Loose ends.** One row per unfinished planned block ("Card review · 22:00–22:30"), per task due today that is still open, and per parked thought. Each row has two small buttons: "Tomorrow" and "Drop" for blocks and tasks, "Make a task" and "Dismiss" for thoughts. A ghost "Move all to tomorrow" sits above the list. With nothing open the step reads "Nothing left open" beside the proof mark.
3. **Tomorrow.** Tomorrow's first block (or the planner's first suggestion) as a small hero card, and an "Aim for tomorrow" field. Primary: "Close the day".

Closing plays the success proof mark with "Day closed" and returns to Today, whose hero card moves to its "day closed" state.

**Done when**
- All three steps work without a day plan.
- Every loose end can be settled in one tap.
- The flow reads and writes the same records as the current ritual.

### 6.8 Paths and New path

**Today:** a search field, a "Concept map" link row, a three-way filter, then outlined subject boxes containing path rows with a thin rail.

```
+--------------------------------------+
| Paths                       (S) (I6) |   Display 36
| [ Paths ]  Cards  Atlas              |   hub tabs
| +----------------------------------+ |
| | (s) Search paths and checkpoints | |   search field, 52
| +----------------------------------+ |
| (Active 3) (Paused) (Done) (Archived)|   filter chips
| +----------------------------------+ |
| | +------+ Real Analysis           | |   path card
| | |emblem| Now: Compactness, step 3| |   cover 96 x 108, subject tint
| | | blue | [###.........] 3 of 12  | |   meter in the subject colour
| | +------+ (4 days behind) (14 due)| |   schedule chip, due chip
| +----------------------------------+ |
| +----------------------------------+ |
| | +------+ Linear Algebra          | |
| | |emblem| Now: Diagonalization    | |
| | |orange| [#######.....] 8 of 14  | |
| | +------+ (On track) (6 due)      | |
| +----------------------------------+ |
| +----------------------------------+ |
| | +------+ Topology                | |
| | |emblem| Now: Topological spaces | |
| | | aqua | [#...........] 1 of 9   | |
| | +------+ (On track) (3 due)      | |
| +----------------------------------+ |
| + - - - - - - - - - - - - - - - - -+ |
| |  +  Start a new path             | |   dashed card
| + - - - - - - - - - - - - - - - - -+ |
+--------------------------------------+
```

**Paths list** [Rearrange]
- **Hub tabs:** Paths · Cards · Atlas. They replace the "Concept map" link row and make the card library and the Atlas one tap away.
- **Search** filters this list as you type. Global search (§6.1) covers everything else.
- **Filter chips:** Active with its count, Paused, Done, Archived.
- **Path card:** 20 px corners, 12 px padding.
  - On the left, a cover tile (96 × 108, 14 px corners) with the subject tint and the path's emblem.
  - On the right: the title in Headline, and "Now: Compactness · step 3 of 4" (Body S, `ink-2`, one line).
  - Then an 8 px meter in the subject colour with "3 of 12" in Caption.
  - Then a row of chips: a schedule chip only when the app has a forecast ("On track" in the good style, "4 days behind" in the warning style), and a neutral due chip ("14 due") that starts a review of that path.
- **Subject headings** (glyph and name as an Eyebrow) appear only when a subject has two or more paths.
- **Order:** pinned first, then most recently studied. Press and hold, or "⋯", offers Pin, Pause and Archive.
- **Last item:** a solid-edge card, "Start a new path".
- The word is "path" everywhere. "Project" no longer appears in the interface.

**New path** [Restyle] (a sheet over the list, as today)
- A "Name" field with the placeholder "e.g. Abstract Algebra".
- A dashed "Sources" area, 96 px tall: "Add a PDF, .tex or .md · 50 MB each". Added files appear as rows with their size and a remove button.
- A note: "Your tutor fills in the subject, goal and plan."
- Footer: a primary "Create path".
- Afterwards the new path opens with a "Tell your tutor" card at the top: one sentence and a primary "Copy prompt".

**Done when**
- Three path cards are visible in the first viewport at 390 × 844.
- Every card shows an emblem in its subject's colour, and its name and glyph.
- No user-facing string says "project".

### 6.9 Path, Checkpoint and Session

**Today:** Path detail has two chip-like buttons, an outlined "current checkpoint" card with "Copy study prompt", a paragraph, stage chips and a ruled checkpoint list.

```
+--------------------------------------+
| (<)                             (..) |   sticky glass bar
|                         emblem, 320  |   the path's emblem behind
| Real Analysis                        |   the header; Display 36
| Prove the main theorems of Rudin     |   Body S, two lines at most
| ch. 2-4.                             |
| [###.............]  3 of 12          |   meter in the subject colour
| (Target 1 Feb 2027)                  |   chip
| [ Map ]  Sessions 8  Sources 4  Cards|   tabs
|                                      |
|  FOUNDATIONS . 3 of 3                |   stage label (Eyebrow)
|   *--- Metric spaces                 |   subject-filled star: demonstrated
|   |                                  |
|   *--- Open and closed sets          |
|   |                                  |
|   *--- Sequences                     |
|   |                                  |
|  COMPACTNESS AND CONTINUITY . 0 of 3 |
|  (O)-- Compactness                   |   current: ring with a halo
|   :    Step 3 of 4: Use a finite     |
|   :    subcover        [ Continue ]  |
|  ( )-- Finite subcover lemma         |   proposed: solid outlined ring
|   :                      (Proposed)  |
|   o--- Continuity            Up next |   hollow ring
|   .--- Limits of functions   Locked  |   dim dot
| +----------------------------------+ |
| | [Continue with tutor] [Review 14]| |   sticky bottom bar (glass)
| +----------------------------------+ |
+--------------------------------------+
```

**Path** [Rearrange]

1. **Header.** The path's emblem at 320 px sits behind the top-right of the header at 80% opacity. The title is in Display, the goal in Body S (two lines at most). Under them: a meter in the subject colour with "3 of 12", and a chip for the target date.
2. **Bottom bar** (sticky, glass, above the tab bar). A primary "Continue with tutor" opens a sheet with the study prompt (three lines of preview), a primary "Copy prompt" and the line "Paste it into your tutor". A secondary "Review 14" starts a review of this path's due cards.
3. **Tabs:** Map · Sessions · Sources · Cards, with counts.
4. **Map** [New presentation of existing data]: the path as a constellation.
   - A 2 px vertical line runs 36 px from the left edge. It is solid in the subject colour down to the current checkpoint and a dotted `line-strong` after it.
   - Stage names are Eyebrow rows with their count ("FOUNDATIONS · 3 of 3").
   - Each checkpoint is a node on the line with a row of text beside it:

| State | Node | Text |
|---|---|---|
| Demonstrated | 20 px subject-filled star | Title in `ink-2`; "Demonstrated 2 Nov" in Caption |
| Current | 28 px ring in the subject colour with a slow halo | Title in `ink` at 16/600; "Step 3 of 4: Use a finite subcover"; a small secondary "Continue" |
| Proposed by the tutor | 20 px solid outlined ring | Title; a "Proposed" chip that opens the proposal |
| Up next | 16 px hollow ring | Title in `ink-2`; "Up next" |
| Locked | 8 px dim dot | Title in `ink-3`; "Needs Continuity" |

   - A tap on a row opens the checkpoint (T2). When a checkpoint becomes demonstrated, its star ignites and the solid line advances (T6).
5. **Sessions:** a dated list. Each row has "Session 8 · 42 min · Claude", the session goal on one line, and a status chip.
6. **Sources:** one card per source with the title, "book · 342 pages", a meter for pages transcribed, a warning chip when pages need checking, and "View pages" and "Download" buttons. "Add or remove sources" comes last.
7. **Cards:** the card list (§6.11), filtered to this path.

"⋯" holds Switch path, Edit path, Pause and Archive.

**Checkpoint** [Restyle]
- **Header:** the eyebrow "CHECKPOINT 4 · REAL ANALYSIS", the title in Title, and chips for the state and the stage.
- **Statement card:** raised surface with a 3 px bar in the subject colour on the left, the eyebrow "TO DEMONSTRATE", and the statement in italic Reading. A "What counts" disclosure holds the acceptance sentence.
- **Steps:** a vertical stepper with 56 px rows. Done: a filled circle with a check in the subject colour. Current: a ring, a bold label and a "Next" chip. Later: hollow, `ink-2`.
- **Prerequisites and sources:** chips. Each prerequisite shows its star state and name; each source opens its pages.
- **Evidence:** a timeline grouped by session ("Session 7 · 8 Nov"). Each entry has its kind as an Eyebrow (Pretest, Attempt, Hint 2, Explanation), a result chip and the text in Body. The recheck prompt is its own card.
- **Cards:** one row, "11 cards · Review".
- **Bottom bar** (sticky, glass): a primary "Work on this with your tutor", and a 48 px "⋯" with Demonstrate and Defer, each with its one-line explanation.

**Session** [Restyle]
- **Header:** the eyebrow "SESSION 7 · REAL ANALYSIS", the session goal as the title, and chips: "42 min", "Claude", "8 Nov, 15:18", and a good-style "Goal met".
- **Summary card:** the summary text, the teaching style and the source pages.
- **Timeline:** the same entry design as Evidence, with times on the right.
- **Bottom bar:** a primary "Start another session".

**Done when**
- With the seed, the Real Analysis map shows all five node states, each with a text label as well as its mark.
- The line is solid down to the current node and dotted below it, and the header meter matches the count.
- The primary action of Path, Checkpoint and Session sits in a sticky bar at the bottom of the screen.

### 6.10 Inbox and Plan proposal

- **For:** deciding what the tutor proposed, quickly and safely.
- **Today:** tabs, a pager, one outlined card, and a Reject, Edit, Approve bar. The alternative is a checkbox list behind "Browse all".

```
+--------------------------------------+
| (<) Inbox                       (=)  |   back, title, list view
| [ Cards 5 ]  Plans 1                 |   tabs with counts
|                                      |
|    +----------------------------+    |   two more cards peek out
|  +--------------------------------+  |   behind the top one
| +----------------------------------+ |
| | (S Real Analysis) Session 7      | |   top card: radius 28,
| | WHY IT IS TRUE                   | |   level 3
| |                                  | |
| | Why must U_y and V_y be          | |   Reading L 22
| | disjoint?                        | |
| | -------------------------------- | |
| | Each U_y misses its V_y.         | |   Reading 18
| | Finitely many U_y cover K, so    | |
| | the matching V_y intersect in an | |
| | open set around x that misses K. | |
| |                                  | |
| | Why this card?                 > | |   disclosure
| +----------------------------------+ |
|               1 of 5                 |
|      (x)       (edit)      ((v))     |   Reject 56, Edit 48, Approve 64
|     Reject      Edit      Approve    |
|    Approve all 4 from Session 7      |   ghost button
+--------------------------------------+
```

**Cards tab: a triage stack** [Rearrange]
- **The top card** uses the review-card design: a subject chip and the session it came from, the card type as an eyebrow, the front in Reading L, a hairline, the back in Reading. A "Why this card?" disclosure at the bottom opens the tutor's reason and its sources.
- **Behind it** two more cards peek out, each 8 px higher and 4% smaller, at 60% and 30% opacity.
- **Buttons** under the stack, round, with Caption labels: Reject (56 px, critical ring and icon), Edit (48 px, secondary), Approve (64 px, accent fill, check icon).
- **Swipe** [New]: right approves, left rejects, up skips the card to the end of the queue. While dragging, the card tilts up to 6° and a wash in the good or critical colour grows with the distance, with the word "Approve" or "Reject". A decision needs 35% of the width or a fast flick; otherwise the card springs back.
- **After a decision:** the tick haptic, the next card rises, and a toast offers Undo for 6 s (the existing window).
- **Under the buttons:** "1 of 5" and a ghost "Approve all 4 from Session 7", which confirms in a sheet that lists the four cards.
- **List view** (the header icon) is the existing queue, restyled: grouped by session, with checkboxes and a bottom bar for batch decisions.
- **Edit** opens the card editor (§6.11) with a primary "Save and approve".
- **Empty:** the proof mark, "Inbox zero", and "Your tutor's next proposals will appear here."

**Plans tab** [Rearrange]. One card per plan proposal:
- A 56 px cover thumbnail, the path name, and "Plan change · from Session 7".
- **What changes:** one row per change with an icon: plus for an addition ("Add Finite subcover lemma after Compactness"), a link for a new prerequisite ("Continuity now needs Finite subcover lemma"), a pencil for a change, a minus for a removal.
- **A mini path map** of five nodes that shows the change in place: the new node as a solid outlined ring between its neighbours.
- **Why:** the tutor's reason in Body S.
- A secondary "Reject", a primary "Approve", and a ghost "Compare whole plan".

**Plan proposal detail** [Restyle]
- "What changes" comes first, as now.
- The whole plan is drawn as the path map of §6.9 with "Added" and "Changed" chips on the affected nodes. On desktop, before and after stand side by side.
- The draft editor stays under the "Edit before approving (advanced)" disclosure from #1343.

**Done when**
- Five proposals can be decided by swipe alone, by buttons alone and by keys alone (A, R, E, arrows).
- Every decision can be undone for 6 s.
- All three decision buttons are in the bottom 40% of the screen.
- A plan card shows what changes without opening the detail.

### 6.11 Cards, Card detail and the card editor

**Today:** a ruled list (glyph, front, meta line) with Filters and Sort. Card detail has outlined boxes and a memory sparkline whose only labels are "First review" and "Latest review".

**Cards** (Paths › Cards) [Restyle]
- **Search field,** then filter chips that open pickers: Path, State (Due, New, Learning, Paused), Checkpoint (once a path is chosen), and "Has comments". A sort menu: Due first, Newest, Hardest.
- **A count line,** for example "248 cards · 23 due".
- **Rows,** 72 px: the subject glyph tile, the front on up to two lines with formulas typeset (Body), and a Caption meta line ("N49 · Compactness · due in 7 days"). On the right, an accent dot when the card is due today or a pause icon when it is paused.
- The list loads further pages of 20 as you scroll, with skeleton rows. A "Load more" button remains as the keyboard path.
- The capture button opens the editor for a new card.

**Card detail** [Restyle]
- **Header:** Back, "Card N7", and "⋯" (Pause card or Resume card, Delete).
- **The card itself,** drawn exactly as in a review: subject chip, type, front, hairline, back, source chips.
- **Memory:** three stat tiles (Next review, Stability, Recall now) above a real chart:
  - a 2 px accent line of estimated recall from the first review to today;
  - each review as an 8 px dot in its grade colour, with a legend for the four grades;
  - a vertical axis from 0 to 100% with a hairline at 50% and a labelled hairline at the owner's target ("target 90%");
  - the first and latest dates on the horizontal axis;
  - a tap on a dot shows the date, grade and interval.
- **History:** rows with the date (from the formatter), a grade chip, the confidence and the interval.
- **For your tutor:** the comments and their status, as now.
- **Bottom bar:** a primary "Edit card" and a secondary "Pause".

**Editor** (new and edit) [Restyle]
- A full-height sheet with a segmented "Write · Preview". On desktop the two stand side by side.
- Front (at least three lines) and Back (at least four) in Reading.
- A key row above the keyboard with the owner's math shortcuts and common symbols.
- Picker rows for Path, Checkpoint and Type.
- Footer: a primary "Create card" or "Save changes", always visible above the keyboard.

**Done when**
- The recall chart has labelled axes, a legend and tap targets on its dots.
- The editor's primary button stays visible with the keyboard open at 360 × 640.
- History dates come from the formatter.

### 6.12 Atlas

- **For:** seeing everything you are learning as one map, and finding your way through it.
- **Today:** the default view is a flat alphabetical list of names. The "Map" view is an indented tree with link arrows crammed in the right gutter.

```
+--------------------------------------+
| (<) Atlas          [ Map | List ] (S)|   glass bar over the map
|     .        .            .      .   |
|        A N A L Y S I S               |   cluster label, wide caps
|   .      *-----*  Heine-Borel        |   * demonstrated (subject-filled)
|     *---/       \                    |
|   Open sets     (O) Compactness      |   selected: ring and label
|          \      /   \                |
|     .     o----o     o  Continuity   |   o not started
|                           .          |
|  T O P O L O G Y        L I N E A R  |
|     *---o         .       *---*      |
|      \   \             *--/    \     |
|       o   o   .       Basis    o     |
|   .                         .        |
| +----------------------------------+ |
| | Compactness                      | |   bottom sheet, peek 180
| | (In progress) (9 cards due)      | |
| | Checkpoint 4 . 3 neighbours      | |
| | [Open checkpoint] [Review cards] | |
| +----------------------------------+ |
+--------------------------------------+
```

[New presentation of existing data]

- **The sky.** The map fills the screen under a glass header (Back, "Atlas", a Map or List switch, Search). The background is `bg-inset`. In Night it carries about 120 still dust points at 15 to 50% opacity. In Day it is ivory with the faint graph-paper grid the repo already has.
- **Stars.** Each concept is a star. Its size (6 to 14 px) follows the number of cards linked to it. Its mark follows the star states in §4.4: subject-filled stars for demonstrated, a ring in the subject colour for in progress, hollow for up next, dim for not started, a warning ring for "needs a recheck".
- **Constellations.** Concepts group by field. Each cluster has a soft patch of its subject colour behind it (10% in Night, 6% in Day) and its name in wide capitals (Eyebrow).
- **Links.** A prerequisite is a solid hairline with a small arrowhead at the concept that depends on it. A looser relation is a dotted hairline.
- **Layout.** Positions come from a force layout that is seeded, so the map looks the same every time. It is computed off the main thread and cached until the data changes. Concepts the owner has pinned keep their positions.
- **Zoom levels.** Fully zoomed out, only cluster names and the two or three largest stars in each cluster are labelled. Closer in, every star in view is labelled (Caption, `ink-2`). Closest, around one concept, its cards and checkpoints appear as small satellites around it.
- **Gestures.** Drag to pan, pinch to zoom, double tap to zoom in. Two buttons at the bottom-right recentre and, on desktop, zoom. A legend chip at the bottom-left opens to explain the star states.
- **Selecting a star.** It gets a ring and a larger label, its links brighten to the accent, and unrelated stars dim to 40%. A sheet peeks 180 px up from the bottom with the name in Headline, a state chip, a line of counts ("Checkpoint 4 · 9 cards due · 3 neighbours"), a primary "Open checkpoint" and a secondary "Review cards". Pulled up, the sheet shows the neighbours (a tap flies to one) and the existing actions (Pin, Edit, Preview edits).
- **Search** lists matching stars. Choosing one flies the map to it in 700 ms.
- **List view** is the existing list, restyled: each row has the star mark, the name, a status line and a chevron. Assistive technology uses the list. The canvas is hidden from screen readers and announced by a one-line summary ("82 concepts, 26 connections, 9 demonstrated").
- **Performance.** It is drawn on a canvas, only what is in view, with star glows drawn once and reused. The target is 50 frames per second or better while panning the heavy-data profile (600 concepts, 1,500 links) at 4× CPU slowdown.
- **Reduced motion:** no flying and no pulsing. The map jumps.

**Done when**
- With the seed the map shows 82 stars in three tinted clusters, 9 demonstrated with subject-filled stars.
- Selecting "Compactness" opens the sheet with the right counts, and "Open checkpoint" goes to Checkpoint 4.
- Searching "comp" lists 7 concepts, and choosing one centres it.
- Switching between Map and List keeps the selection.
- The pan and zoom target above is met.

### 6.13 Progress, Time log and Practice

**Today:** two stacked segmented controls, four outlined stat boxes, one column chart, then goal boxes.

```
+--------------------------------------+
| Progress                    (S) (I6) |   Display 36
| [ Overview ] Learning  Time  Log     |   hub tabs
| ( Today | 7 days |[30 days]| 90 days)|   the one range control
|                                      |
| 49 h                                 |   Figure XL 64
| focused in the last 30 days          |   Body S
| (^ 6 h more than the 30 days before) |   change chip, when known
| ._/\_/\/\__/\/\_._                   |   sparkline, 30 points
| +----------+ +----------+ +--------+ |
| | Reviews  | | Recall   | | Check- | |   stat tiles
| | 412      | | 91%      | | points | |
| |          | |          | | 9      | |
| +----------+ +----------+ +--------+ |
| +----------------------------------+ |
| | Study almanac    Less ..::## More| |   heatmap: 26 weeks x 7 days,
| | Jun  Jul  Aug  Sep  Oct  Nov     | |   one hue, five steps
| | M . : . # : . . # # : . # # . :  | |
| | W : . # # . : # . : # # . : # .  | |
| | F . . : . # . : # . . : # # . :  | |
| +----------------------------------+ |
| +----------------------------------+ |
| | Time by subject                  | |   stacked weekly columns
| | (o Analysis)(o Linear)(o Topol.) | |   legend; 2 px gaps
| |  16h |  #                        | |
| |   8h |  #   #   #   #            | |
| |    0 +--#---#---#---#---#--      | |
| |        12  19  26   2   9  Nov   | |
| +----------------------------------+ |
+--------------------------------------+
```

**Overview** [Rearrange]

1. **Hub tabs** (Overview · Learning · Time · Log) and the one range control from #1343 (Today · 7 days · 30 days · 90 days). The control sits above everything it affects.
2. **Hero figure:** the focused time in the range in Figure XL ("49 h"), a line of Body S ("focused in the last 30 days"), a change chip when the previous period can be read ("6 h more than the 30 days before", in the good style when up and neutral when down), and a 30-point sparkline.
3. **Three stat tiles:** Reviews, Recall, Checkpoints demonstrated.
4. **Study almanac** [New]: a heatmap of the last 26 weeks on a phone (a year on desktop). Weeks are columns and days are rows. Cells are 12 px with 3 px gaps and 3 px corners, in one hue on the five-step accent ramp. Month names sit above, "M W F" at the left, and a "Less to More" legend at the top-right. A tap on a cell shows "Tue 13 Oct · 4 h 10 min" and lists that day's sessions under the chart.
5. **Time by subject:** stacked weekly columns, at most 24 px wide, with 2 px gaps between segments and 4 px rounded tops. Each segment takes its subject colour. A legend names the subjects. Only the latest and the highest columns are labelled with their totals. With the seed the five weeks total 16 h, 11 h 50, 13 h, 7 h 30 and 40 min.
6. **Insights** [New]: up to two plain sentences computed by fixed rules, such as "Topology took 36% of your time in this range" or "Your recall on cards you were unsure of is 71%". They are shown only when their rule has enough data.

**Learning** [Restyle]
- **Recall over time:** a 2 px line with the target as a labelled hairline.
- **Reviews by day:** stacked columns in the four grade colours, with a legend.
- **When you said:** a meter list for Sure, Unsure and Guess.
- **Checkpoints demonstrated:** weekly columns with their values labelled.
- Tutor-session time is a separate, clearly named tile ("18 h 40 min in tutor sessions").

**Time** [Restyle]
- The hero figure again, with daily columns (weekly at 90 days).
- **By subject:** ranked horizontal bars, each in its subject colour, with the value at the tip.
- **Goals:** one card per active goal. A title ("This week · All subjects"), "40 min of 10 h" with the first number in Figure L, a meter with a small tick where an even pace would be today, and "9 h 20 min to go · 6 days left". A ghost "Edit".
- **Past goals:** a list with "Reached" (good chip) or "2 h short" (neutral).

**Log** (the time log) [Restyle]
- The week strip from Calendar as its navigator.
- Entries grouped by day. Each row has a 4 px subject bar, the title, "22:00–22:35 · 35 min" and up to five rating dots.
- Swipe left for Edit, Split and Void. Capture adds time. "Export CSV" lives under "⋯".

**Practice** (Review › Practice) [Restyle]
- One card per topic: the title in Headline, a due chip ("Due today" in the accent, "Overdue · 1 day" in the warning style, "In 3 days" neutral), the cadence in words ("Every 3 days" or "Adapts to your rating") and when it was last practised.
- A small primary "Practice" opens a sheet with a notes field, an optional timer, the four named ratings as buttons, and Save.
- Archived topics sit under a disclosure.

**Done when**
- One range control changes every figure on the tab, and the hero figure equals the sum of the columns.
- The heatmap uses one hue. Subject charts use the subject colours with a legend. No chart text is set in a series colour.
- Every chart has a tap tooltip and a "Show as table" switch.
- Goal cards never print raw dates or zone names.

### 6.14 Settings

**Today:** a four-row index that opens section pages.

[Restyle]
- **Index:** grouped cards of rows. Each row has an icon tile, the title, a one-line summary of the current value, and a chevron:
  - Appearance ("Night · follows the system");
  - Tutor ("Connected · Claude");
  - Study and review ("Target recall 90% · 20 new cards a day");
  - Planning ("Daily minimum 2 h · day ends 17:00");
  - Reminders;
  - Subjects ("3 subjects");
  - Data and account.
- **Appearance:** three theme cards with small live previews (Auto, Day, Night), and switches for "Reduce effects" (no blur and no glow), Haptics and the phase chime.
- **Subjects** [New]: one row per subject with its colour swatch, glyph and name. A row opens a sheet to choose one of the eight colours (taken ones are marked), the glyph, and the emblem kind, with a live preview.
- **Everything else:** the existing sections with the v7 fields, picker rows, switches and sliders. Each section keeps its `?section=` link.
- **Delete account** stays last, in its own card with a critical heading and the same flow.

**Done when**
- Each index row shows the current value.
- Changing the theme updates the previews at once.
- Changing a subject's colour changes it on the calendar, the covers and the charts.

### 6.15 Sign-in and first run

**Sign-in** [Restyle]
- A full-height sky with a large rose emblem drawing itself slowly behind the content.
- The ℓ mark, "Lemma" in Display, and "A geometer's notebook" in italic Reading.
- One primary, "Continue with Google", and a ghost "Explore the example workspace".

**First run** [New]. After the first sign-in, three steps that can each be skipped:
1. **Connect your tutor:** the connector address with Copy, and the short setup steps that Settings already has.
2. **Start your first path:** the New path form inline, or "Use the example".
3. **Your day:** the daily minimum (a stepper), the day-end time, and reminders on or off.

It ends on Today.

**Done when**
- Sign-in has exactly one primary action and a visible way into the example.
- First run can be skipped at every step and never blocks the app.

### 6.16 States every screen must handle

| State | Rule |
|---|---|
| Loading | A skeleton in the shape of the final layout, shown only after 300 ms. When data is refreshed, the old content stays on screen at reduced opacity instead of flashing a skeleton. |
| Empty | An emblem or line drawing, one sentence and one action. Examples: Paths: "No paths yet. Start one from a book or your notes." Calendar day: "Nothing planned. Tap any time to add a block." Review: "All caught up." Inbox: "Inbox zero." Cards: "No cards match" with "Clear filters". Atlas: "Your sky is empty. Concepts appear as you study." Progress: the chart frame stays, greyed, with "No study time in this range yet." |
| Error | A banner inside the affected card with a plain sentence and Retry. Never a raw error message. |
| Offline | The pill under the header. Actions that need the network are disabled with a reason on tap. |
| Success | A toast with Undo for anything reversible. The proof mark for the five endings in §4.4. |
| Destructive | A confirmation sheet that names the thing ("Delete 'Lab meeting'?") with the destructive button on the left in critical text. |
| Long content | Titles wrap to two lines and then truncate with an ellipsis; nothing is clipped mid-word. Long cards scroll inside themselves. |
| Large text | Every screen works at 200% text: rows grow, and chips wrap onto a second line. |

---

## 7. Delivery plan

### 7.1 Ground rules in this repo

These come from `AGENTS.md` and from how v6 and the audit fix were shipped.

- **Behind a new flag.** v7 ships behind `v7Shell`, off by default. It lives beside v6 the way v6 lives beside the legacy screens: each screen's `Page.tsx` gets one branch, new code goes under `src/ui/v7/**` and `src/features/<screen>/v7/**`, and styles are scoped under a `data-v7` attribute on the root. With the flag off, the v6 screens, their tests and their captures stay exactly as they are.
- **Stages.** Build behind the flag, then Harden, then one reviewed PR with the Owner's approval turns the flag on, as N102 did for v6.
- **Tests are never deleted, skipped or loosened,** and protected paths stay untouched (`AGENTS.md`, `.github/**`, `ci/**`, `scripts/ci/**`, `playwright.config.ts`, `vitest.config.ts`).
- **No backend change.** Nothing here needs `supabase/**`.
- **No new dependency.** `motion`, `d3-force`, `d3-zoom`, `katex` and `lucide-react` are already in `package.json`.
- **The release-audit invariants apply to v7 as well:** the header, five links in the main navigation, the page-actions landmark, no sideways scrolling at 320, 360 and 390 px, no uncaught errors, no leftover "Loading" text, and Today under 1,500 elements with heavy data.
- **`docs/v6/screens/**` is not touched** (a test guards it).
- **v6 must render as it does now until the switch.** In particular, the Google Fonts link stays for v6. The self-hosted fonts load only when v7 is on, and the link is removed in the switch PR.

### 7.2 Decisions for the Owner before work starts

| # | Decision | Recommendation | Why it matters |
|---|---|---|---|
| OD1 | What v7 is judged against, since there are no mockups | This document, plus Owner-approved screenshots of the first build of the component gallery and of six "golden" screens (phase P1), stored in `docs/v7/golden/`. Later work is compared with those. | The current design-review rule compares captures with `docs/v6/screens/`. v7 needs its own reference, which takes a `rules:` change. |
| OD2 | The flag | Add `v7Shell`, off. Keep `v6Shell` as it is. | Lets v7 land in pieces without touching what users see. |
| OD3 | May the tab bar disappear on immersive screens? | Yes for the review round and the close-the-day flow (Focus already covers it). Fallback if not: keep the five links available to keyboards and screen readers while hiding them visually. | The release audit requires five navigation links on every route, including `/review/run`. |
| OD4 | Navigation changes | Accept the hub tabs in §5.1, drop the "⋯" drawer from hubs, rename "Concept map" to "Atlas", and let Cards highlight Paths instead of Review. | Existing tests name some of these controls. |
| OD5 | Self-hosted fonts | Yes. All four families have open licences. | Removes a render-blocking request, and makes screenshots deterministic. |
| OD6 | Subject colours | Fixed order by creation, editable in Settings. | Colour must follow the subject for good. |
| OD7 | One PR, or one per phase | One PR per phase. | A redesign of 23 routes in a single PR cannot be reviewed by eye or reverted in part. Each phase is shippable behind the flag. |
| OD8 | Budgets | Make the byte budget (350 KB for Today's first load) a blocking check. Report timings on every PR without blocking. | `AGENTS.md` says timing checks never block. |
| OD9 | The [New] items | Capture and search in the main run. First run, insights, dragging a block to another day and the subject editor can follow the switch if time is short. | Keeps a restyle from turning into a feature project. |

### 7.3 Phases

Sizes are relative, not estimates of days.

**P0 · Foundations** (large; nothing visible with the flag off)

1. The flag and the `data-v7` root attribute.
2. One token file, `src/ui/v7/tokens.css`, holding §4.1 to §4.3 and §4.6 for Night and Day, with the Tailwind theme names mapped onto it.
3. Self-hosted fonts, loaded only under v7 (OD5).
4. The component set of §4.7 in `src/ui/v7/**`. Every component appears in `/kit` in all its states and both themes.
5. The emblem generator (§4.5), the chart parts (§4.8, built on `src/ui/charts`), the motion presets and the haptics helper (§4.6).
6. Three checks:
   - **Design lint:** reads computed styles on `/kit`, and later on every v7 route, and fails on more than 9 font sizes, more than 5 radii outside charts, more than 6 button styles on a screen, a bordered box inside a bordered box, or a colour outside the token set.
   - **Screenshot baselines** for `/kit`.
   - **A performance probe** that reports first paint, largest paint, blocking time and bytes for Today, Calendar, Review and Progress on the throttled profile.

Exit criteria:
- `/kit` shows every component in both themes and passes design lint.
- A unit test asserts every contrast pair in §4.1.
- All existing tests pass unchanged with the flag off.
- The Owner has looked at `/kit` and approved the look.

**P1 · The shell and six golden screens** (very large; the "is it beautiful" gate)

- The shell: §6.1 A to E, sheets and toasts. Capture and search may be placeholders.
- Six screens built completely on the example data: Today (§6.2), Focus while running (§6.3), the review round (§6.4 B), Calendar Day (§6.5), Path with its map (§6.9) and the Atlas map (§6.12).

Exit criteria:
- Each of the six passes its "Done when" list.
- Goals L1 to L5 hold on the six.
- Transitions T1 to T7 work wherever these screens use them.
- The Owner approves Night and Day screenshots of all six at 390 × 844, and of Today and Calendar at 1280 × 800. They become the baseline in `docs/v7/golden/`.

This gate exists because there are no mockups. Nothing else should be built until these six look right.

**P2 · The daily loop** (large)

The remaining Today states; Focus start sheet, break, paused and finish; the Review hub and Round complete; Practice; capture; search.

Exit criteria: goals S1, S2, S3 and S6 pass their tests, and F3 and F4 hold on these screens.

**P3 · Planning** (large)

Calendar Week, Month and Agenda; the block sheet and quick-add; suggestions on the grid; the overdue sheet with one shared count; Tasks; Close the day.

Exit criteria: goal S4 passes, and the "Done when" lists of §6.5 to §6.7 pass.

**P4 · Learning** (very large)

Paths and New path; Checkpoint and Session; the Inbox stack and list; Plan proposal; Cards, Card detail and the editor.

Exit criteria: goal S5 passes, and the "Done when" lists of §6.8 to §6.11 pass.

**P5 · Insight and edges** (large)

Progress (Overview, Learning, Time), the Log, the Atlas list and search, Settings with the subject editor, Sign-in, first run, and every state in §6.16.

Exit criteria: the "Done when" lists of §6.12 to §6.15 pass, and every empty state has its illustration (L5 complete).

**P6 · Sizes and keys** (medium)

The tablet rail, the desktop rail, the layouts in §5.3 and the keyboard shortcuts.

Exit criteria: goal Q4 holds, and the Owner approves screenshots at 768 and 1280 px.

**P7 · Harden and switch** (medium)

1. Performance work to meet Q1 and Q2: split the 1.18 MB main script by route, load fonts as in §4.2, and keep effects off the critical path.
2. An accessibility pass for Q3.
3. Device checks by the Owner: Android Chrome and the installed app, iPhone Safari and the installed app, a hardware keyboard, and a screen reader on the six golden screens.
4. One reviewed PR turns `v7Shell` on. It also removes the Google Fonts link.
5. A later PR deletes the v6 styling (`mockup.css`, `mockup-bindings.css`, the v6 tokens) and the v6 screen branches, once the Owner is satisfied (L6).

Exit criteria: every goal in Part 3 is met or waived in writing by the Owner, and turning the flag off restores v6 with no data lost.

### 7.4 How it is verified

- **Unit tests:** component behaviour (keyboard, focus, names), the capture recogniser, the briefing-sentence rules, emblem determinism (the same seed gives the same drawing), the contrast pairs, the haptics helper.
- **End-to-end journeys** on the audit seed with the clock frozen:
  1. cold open, "Start now", focus running, in one tap;
  2. a 23-card round by swipes only, and again by keys only;
  3. capture a task, a block, a card and a thought;
  4. tap to create a block, drag it, undo;
  5. triage five proposals by swipe, with one undo;
  6. search "compact" and open the first result;
  7. close the day;
  8. switch theme;
  9. turn the flag off and find v6 intact.
- **Design lint** on every v7 route in both themes.
- **Screenshot baselines:** `/kit` and about 60 states in both themes (the audit's capture list), compared in CI with a small tolerance.
- **The release-audit matrix** on v7: 23 routes at 320, 360 and 390 px, Day and Night, at 200% text.
- **The performance probe** on every PR, plus the byte budget.
- **The Owner's eye test** at the P1 gate and before the switch. For each golden screen, five yes-or-no questions:
  1. Is it obvious what to do first?
  2. Can you tell the subjects apart at a glance?
  3. Does anything look like a default browser control?
  4. Is any text cramped, clipped or tiny?
  5. Would you show this screen to someone?

### 7.5 Risks

| Risk | What reduces it |
|---|---|
| With no mockups, "beautiful" is only judged once code exists | The P1 gate: six screens first, approved by the Owner before anything else is built |
| One very large PR | A PR per phase, each behind the flag and each revertable (OD7) |
| Blur, glow and the canvas map are slow on cheap phones | A "Reduce effects" switch and an automatic fallback where blur is unsupported; goals Q1 and Q2; glows drawn once and reused; no animation in lists |
| 1,154 end-to-end tests are written against v6 | v7 is additive. v6 tests keep running with the flag off, the way legacy tests did when v6 arrived. |
| Today's element budget | The caps in §6.2 |
| Meaning carried by colour alone | Rule 2 in §4.1, and a design-lint check that every subject-coloured mark has a name or a label next to it |
| The [New] items grow the scope | OD9 |
| The Atlas layout jumps around or runs slowly | A seeded, cached layout; drawing only what is in view; the List view as the fallback |
| Self-hosted fonts add weight to the repo and the offline cache | Subset the files and ship only the weights in §4.2. Today the fonts cost 88 to 116 KB on first load. |

### 7.6 Definition of done

- Every goal in Part 3 is met, or waived in writing by the Owner.
- Every screen's "Done when" list passes.
- `v7Shell` is on by default with the Owner's approval, and turning it off has been tested.
- The v6 override styles are deleted in the follow-up PR.
- Each phase has its note in `docs/current/`, and `/kit` is the living reference for the system.

### 7.7 Turning this into NEXT.md items

One item per phase. P1 and P4 will need the split that `AGENTS.md` allows for large top-level items. The priority run assigns the ids; note that the "Next free ID" line in `NEXT.md` still says N119 although N121 is in use.

| Item | Needs | Done = | Scope | Not |
|---|---|---|---|---|
| v7 foundations (P0) | OD1, OD2, OD5 decided | P0 exit criteria | `src/ui/v7/**`, `src/flags.ts` (new flag, off), `src/features/kit/**`, font files, tests | v6 and legacy screens; `supabase/**` |
| v7 shell and golden six (P1) | P0 | P1 exit criteria | `src/app/**` (v7 branches), the six screens' `v7/` folders, `docs/v7/golden/**`, tests | The other screens |
| v7 daily loop (P2) | P1 approved | P2 exit criteria | Today, Focus, Review, Practice, capture, search | Database changes |
| v7 planning (P3) | P1 approved | P3 exit criteria | Calendar, Tasks, Close the day | Recurring blocks, outside calendars |
| v7 learning (P4) | P1 approved | P4 exit criteria | Paths, Path, Checkpoint, Session, Inbox, Plan proposal, Cards | Connector changes |
| v7 insight and edges (P5) | P1 approved | P5 exit criteria | Progress, Log, Atlas, Settings, Sign-in, first run, states | |
| v7 sizes and keys (P6) | P2 to P5 | P6 exit criteria | Layouts from 600 px and 1024 px, shortcuts | |
| v7 harden and switch (P7) | P6, the Owner's device checks | P7 exit criteria | Performance, accessibility, the flag default, deleting v6 styles | |

P2 to P5 do not depend on each other and can run in parallel once P1 is approved.

---

## 8. Appendix: how the baseline was measured

- **Build and data.** `main` at `1f1a679`, production build, example workspace, with the audit's seed: 50 saved focus sessions over 30 days (2,940 min), 27 calendar blocks, 13 tasks, 8 deadlines, 5 practice topics and 5 goals. The browser clock was frozen at Mon 9 Nov 2026, 13:43 IST. Locale `en-IN`, time zone Asia/Kolkata.
- **Captures.** Chromium at 390 × 844 and 2× density, driven through 100 scripted states per theme (every route, sheet, menu, tab and calendar view, scrolled to the end).
- **Design-language crawl.** 24 routes: Today, Paths, Path, Checkpoint, Session, Review, the four Calendar views, the three Progress tabs, Inbox, Plan proposal, Cards, Card, Atlas list and map, Settings, Tasks, Time log, Practice, Close the day. On each, the script read the computed style of every visible element:
  - background colours, weighted by painted area;
  - text colours, sizes and weights, weighted by number of characters;
  - corner radii of elements that have a border or a background;
  - box shadows, running animations and transitions (measured with reduced motion off);
  - images, canvases and vector graphics larger than 60 × 40 px;
  - bordered rounded boxes larger than 120 × 40 px, and how deeply they nest;
  - button styles, counted as distinct combinations of background, border, radius, type size, weight, padding and colour.
- **"Real colour"** means a chroma above 0.04 in the OKLCH colour space. Below that, a colour reads as grey.
- **Performance.** Chromium with the CPU slowed 4×, the network limited to 1.6 Mbps down, 750 kbps up and 150 ms latency, and the cache and service worker off. First load of Today, Calendar, Review and Progress; the median of three runs each. "First paint" is first contentful paint. "Largest paint" is largest contentful paint. "Blocking" is the time spent beyond 50 ms in each long task. Bytes are compressed bytes transferred.
- **Colour checks.** Contrast ratios were computed from the token values with the WCAG formula. The subject palette check measures the distance between neighbouring colours in the OKLab colour space, under normal vision and under simulated protanopia and deuteranopia, plus a lightness range, a minimum chroma and 3:1 contrast against the v7 surfaces.
- **Limits.** Chromium only, on a local server, with example data. No physical device and no live account. The performance figures will differ somewhat on the deployed site. The v7 colours were computed and checked but have not been seen on a screen in context, which is what the P0 and P1 gates are for.

**Terms used in this document**

| Term | Meaning |
|---|---|
| Hub | One of the five tab destinations |
| Sheet | A panel that rises from the bottom edge and holds a form or details |
| Token | A named design value (a colour, size, radius, shadow or duration) that components refer to |
| Emblem | The generated mathematical drawing that belongs to a path |
| Proof mark | The small square ∎ that mathematicians put at the end of a proof |
| Design lint | The automated check that reads computed styles and enforces the limits in Part 3 |
| Golden screens | The six screens built first and approved by the Owner as the visual reference |


## Audit amendments · 11 Nov 2026

The original sketches illustrate hierarchy; the kit and these amendments govern conflicting details.

| ID | Binding amendment |
|---|---|
| PA0 | Section 4 is replaced by the kit pointer above; colour, type, radii, 16 px phone margin, 700/1100 breakpoints, subject-filled demonstrated stars and Ink/Starlight heatmaps follow the kit. |
| PA1 | Review's first tab is Due; Cards names the library under Paths. |
| PA2 / SH2 | Capture occupies a reserved slot alongside the five-link tab bar, outside the navigation landmark. It may hide on scroll down and returns on scroll up or keyboard focus. It never overlays row actions. |
| PA3 | Quick focus is available in every Today hero state. |
| PA4 | Focus Finish stays secondary until the planned length is reached. |
| PA5 | Calendar Day opens above 45% of the viewport and exposes at least four hours above the dock. |
| PA6 | Sheet and step-flow footers are fixed at the bottom: secondary/tertiary left, primary right, 48 px on phones. |
| PA7 | Agenda collapses consecutive empty days into one line. |
| PA8 | Close the day leads with the best real figure when focus is zero. |
| PA9 | Atlas dust is at most 1.5 px and 30% opacity; concept states use the kit's proof marks. |
| PA10 | Today's day strip shows the planning window, widened for actual blocks and now. |
| PA11 | Static and rendered lint cover role colours, button heights, visible native controls, subject glyphs, status icons, indigo on data and text clipped below four characters. Every applicable screen Done-when item needs named evidence. |

**Owner decisions, 11 Nov 2026:** The six phone golden screens are visually approved. Following the recommendations, the Owner waived the retrospective P2/P3 gate order (C5), approved the additive frontend read for a subject-stacked fourteen-day Review forecast while preserving Today's RPC, and approved Capture's reserved dock placement. Desktop remains Part 11 with fresh captures and separate visual acceptance. All other acceptance and release gates remain.
