# Lemma v7 implementation decisions

The Owner authorized one combined `rules:` PR, Agent `owner-setup-v7`, for the whole attached plan, including all `[New]` features. This is an incremental working PR, not a claim that the redesign is complete. The Owner chooses the model and effort for each part before it starts; Parts 1–3 have been selected.

## Accepted constraints and gates

- Build behind `v7Shell`, initially off. Activate only after hardening and Owner gallery, golden-screen, responsive and physical-device gates. The Owner merges the rules PR. Retain all v6 code and styles for rollback, an explicit L6 exception; retain conditional Google Fonts fallback for v6/legacy. Preserve existing deep links and tests.
- Keep the five-link navigation landmark on immersive screens, visually hidden with keyboard reveal. Self-host v7 fonts. Canonical UI radii are 10, 14, 20, 28 and round; choose the nearest token, ties up, except chart marks and the 4 px checkbox corner necessary to distinguish multi-select from circular radio controls.
- Persist v7 preferences and subject identity in a typed `settings.attention.v7` namespace, within the existing 4 KB section cap, with live/demo recursive-merge parity and stable creation timestamp plus ID allocation. Handle concurrent changes and capacity explicitly.
- Preserve the existing seven-day Today forecast RPC; the 14-day Review forecast is an additive frontend read. Atlas card counts derive from existing loaded records. Running Focus intention edits are recoverable device-local drafts; correct them after logging through the existing API.
- Today compressed cold first load must be at most 350 KB as a blocking deterministic check; timing metrics are reported without blocking. Design checks and byte accounting will be added to existing CI without weakening checks. No backend, migration, MCP, or new dependency changes.
- Gallery approval follows Part 3; six golden-screen approvals follow Part 5; responsive approval follows Part 11; physical-device approval precedes final activation. The new review paths are separate from the existing v6 baseline and review policy.

The later performance gate must measure actual cold Today transfers, including first-install service-worker precache traffic and self-hosted fonts, under a documented reproducible cache and network setup. CI should block the deterministic byte budget and v7 design invariants while reporting first paint, largest paint and main-thread timing separately; timing thresholds do not block. Preserve existing performance jobs and assertions. The exact probe and golden captures are implemented with the relevant screens, not by this foundation.

## Parts and proposed models

The Owner selected Parts 1–3; later entries are proposals pending the Owner's choice.

Part 1 baseline evidence at main `a4f8e86`: typecheck, lint and production build passed, as did 1,964 unit tests and 1,154 browser tests. On the Part 1 foundation, typecheck, lint, 27 focused unit tests and four v6 browser checks passed; CI `scope` and `fast-gate` passed at `98c306b`. The interface and release gates remain pending.

1. Setup, baseline and integration — GPT-6.1 Terra, high (selected).
2. Tokens, typography, fonts, components and gallery — GPT-6.1 Sol, medium (selected).
3. Mathematical emblems, motion, haptics and chart primitives — GPT-6.1 Terra, high (selected).
4. Shell and Today, Focus, review-round, Calendar-Day and Path golden screens — GPT-6.1 Terra, xhigh.
5. Atlas golden canvas and worker — GPT-6 Astra, xhigh.
6. Remaining daily loop, capture, search and completion — GPT-6.1 Terra, high.
7. Calendar, planner, Tasks and day-close — GPT-6.1 Terra, xhigh.
8. Paths, New path, Checkpoint, Session, Cards and editor — GPT-6.1 Sol, medium.
9. Inbox and Plan proposal — GPT-6.1 Terra, high.
10. Progress, Log, Practice, Settings, subjects, sign-in, first-run and states — GPT-6.1 Sol, high.
11. Sizes and keys — GPT-6.1 Sol, high.
12. Performance, accessibility, rollback and default switch — GPT-6.1 Terra, xhigh.
13. Independent complete-PR review — GPT-6 Astra, xhigh.


## Part 2 status

Implemented with GPT-6.1 Sol, medium effort: scoped Day/Night design tokens; the nine-size typography system; shared standard components from §4.7; licensed, namespaced WOFF2 fonts; and an interactive v7 branch of `/kit`. Canonical radii are 10, 14, 20, 28 and round, with a documented 4 px checkbox exception after Owner review: a 24 px checkbox at 10 px corners was visually indistinguishable from a radio button. The phone date grid preserves 44 px days at 320 px; desktop subject selection uses a keyboard menu. Sheets use native `dialog.showModal()`, Escape cancellation, focus return, a scrolling body and fixed footer. The gallery demonstrates errors, disabled/loading controls, mixed selection, empty/loading feedback and meter endpoints in both themes.

The implemented v7 root is limited to `/kit`, applied before first React paint and in a layout effect when routes change. Other routes continue using v6/legacy. Font loading follows route changes in both directions, retaining original Google font family names for v6 and using app-local `Lemma v7` names for v7. Official Google Fonts assets and individual OFL files live in `public/fonts/v7/`; identical variable font binaries are deduplicated. STIX Two Text omits several mathematical symbols, so its glyph stack includes an official 5 KB STIX Two Math symbol subset, with its own OFL, rather than system-font fallback. v7 assets are excluded from global Workbox precache to preserve flag-off traffic.

Typecheck, lint, production build and PWA release checks pass. Seven new unit tests cover component behavior and every specified Day/Night contrast pair; the five unchanged v6 token tests also pass. All 16 targeted built-app browser checks pass (ten new v7 checks and six unchanged kit/v6 checks); details are in `docs/current/N122.md`. Intermediate 390 × 844 Day/Night viewport and full-gallery PNGs live beside this document. These have been visually inspected and are not golden-screen approvals.

Part 2 was completed before the Part 3 additions below. Golden screens, default activation and release approval remain pending.


## Part 3 status

Implemented with GPT-6.1 Terra, high effort: deterministic mathematical SVG emblems for all five subject families, seeded identity and bounded generation cache; Day/Night rendering, optional drawing and Focus rotation with reduced-motion support; token-backed motion presets, haptic patterns and an optional phase chime; and accessible line/area, grouped, stacked and horizontal bar and heatmap chart primitives. The gallery demonstrates the emblem families, completion feedback and graphics in both themes. Charts expose interactive values and text tables.

Validation: typecheck, repository lint, production build/PWA artifact checks, 16 v7 unit tests and 13 built-app browser tests passed. The new browser tests cover Day and Night, 96 px emblem sizing, graphics interaction and tables, and reduced-motion rendering; the ten existing gallery tests also pass. Day/Night gallery captures are intermediate review artifacts, not approved golden references.

The visual transitions are reusable presets; their integration into actual screens happens in subsequent parts. The Owner’s gallery approval, design lint, first-load budget and all later screen and release gates remain outstanding. `v7Shell` remains off by default; v6 remains available.

## Part 2 visual review follow-up (PR #1348)

The Owner's Step 2 review identified conflicts between subject identity and status, weak selected states and control edges, missing gallery states, and inconsistent action/feedback affordances. The gallery and shared components have been amended on the existing PR branch (without enabling `v7Shell`): subject colours are restricted to identity/emblems while progress uses brand and complete uses Good; Ready/Complete/Demonstrated have different marks and semantic colours. Day/Night control borders are tested against all form surfaces at WCAG 3:1, with a 3 px focus ring and distinctive editable/read-only/disabled presentation. Selected segments, filters, preset durations and slider fill are now visible, and the gallery exposes focus, pressed, radio, open-menu, toast and confirmation-sheet examples. Save is primary, loading retains its label and indicator space, error banners use tone-specific icons, and explanatory specimen notes are replaced with actual copy. Spacing, typography hierarchy, checkbox/switch alignment, and redundant metrics are also corrected.

The original Part 2 and Part 3 PNG captures predate these corrections, so they are historical review artifacts rather than updated evidence. Both themes require fresh captures, and Owner gallery approval remains open. The added visual regression and contrast checks have not yet been confirmed by an executed build in this editing environment; retain the previous validation statements above as historical, not as validation of this follow-up.

## Constellation 10/10 UI kit specification (single-commit rewrite)

The Owner's supplied plan is retained verbatim as `docs/v7/KIT_10_PLAN.md`. This kit contract supersedes the earlier Part 2 intermediate gallery decisions wherever they conflict (especially colour meaning, neutral segmented thumbs, subject-coloured mastery, no dashed disabled borders, the multi-mode state model, and the 8 px proof badge shape).

The candidate 1.0 kit is generated from `src/ui/v7/design-tokens.json` (DTCG raw → semantic role → component alias). `node scripts/v7/generate-tokens.mjs` generates `tokens.css` and `figma-variables.json` from the same source. The JSON is an interchange manifest for Figma-variable import; it is not evidence of a live Figma import. Both themes and high-contrast variants use one component anatomy. The complete kit demonstrates principles, tokens, typography, all nine mathematical subject families, shared component states, proof-first patterns, charts with summaries and tables, and a semantic-versioned changelog in that order. Interaction specimens are deliberately separated from actual product actions.

The original Day Topology solid `#009F89` is tuned slightly to `#009C85` to meet a 3:1 mark-on-subtle-background check. The palette and both colour-blind simulations must continue to pass automated tests after this modification. The design gate `node scripts/v7/check-kit.mjs` is blocking in the PR typecheck/lint job and enforces role aliases, generated-artifact currency, four-mode foreground/background contrast, and category colour-blind separation. The v7 browser tests also exercise theme parity, forms, chart tables, mobile widths, and keyboard interactions. CI screenshots are uploaded as ephemeral workflow artifacts rather than committing generated screenshots, to keep the PR history compact.

**Scope and release:** This work rebuilds the v7 *kit* specified by `KIT_10_PLAN.md`. It does not claim that the app's six golden screens or its other legacy routes have been migrated to the new design system. Those remain Parts 4–13 of the existing v7 implementation plan with separate Owner approval and release requirements. Keep `v7Shell` off by default and do not merge or label this PR Ready until the original gates are met.

## Part 3 audit verification (Owner audit of kit 1.0.1)

Checked on PR head `a596854` against the Owner's audit (7 must-fix items plus polish). Must-fix 1–5 are asserted on the rendered kit by `scripts/v7/audit-rendered-kit.mjs`, which passed in the gallery workflow on that head: primary hover and pressed use their own tokens with pressed text ≥4.5:1 in both themes; the selected segment has a `border.default` edge and a bold label; unselected tab labels use `text.secondary` on hover; the ∎ sits after the mastery track; the disabled Select is transparent with a subtle edge and `type="button"`. Item 6: every swatch shows its declared pairing, threshold and pass/fail, and decorative tokens say so. Item 7: no `--v7-serious`, `--v7-critical`, `--v7-gold`, `.v7-chip-gold`, dashed disabled fields, hatching or doubled `html[data-v7][data-v7]` selectors remain, every kit stylesheet uses ordered `@layer`s, and no raw colour literal is left outside the token file. Polish: guidance is per component, checkbox and switch say Space, the stepper takes arrow keys and announces its value, theme and view switchers are radio groups, there is one theme control and the shared Select for density, the state reference is collapsed, time fields are 24-hour, the error state uses a broken emblem, the heatmap shows 14 square weeks with a today outline, banners use plain words and an action-coloured Retry, scales are drawn, and statements share one counter.

Three gaps were closed in this pass: the live kit had no section navigation at all (the offline export had one, with dead anchors), so the kit header now has an ordered fold-out section list that wraps on phones and scrolls without breaking the hash route, and sections carry stable ids; the export's duplicate nav was removed; and the one failing unit test still looked for the retired `.v7-banner.v7-critical` class.

## Part 5 status (done before Part 4, at the Owner's request)

The v7 Atlas (§6.12) replaces `/atlas` when `v7Shell` is on; v6 and legacy Atlas screens remain for rollback. Other routes keep their shell until Part 4.

- **Layout:** a seeded d3-force layout (`src/features/atlas/v7/layout.ts`) computed in a Web Worker and cached until the ids, clusters, sizes, links, pins or seed change; pinned concepts keep their stored coordinates. Without workers it runs on the main thread.
- **Sky:** a canvas that draws only what is in view, with one cached sprite per star look (Night glows drawn once). Night has 120 still dust points; Day has the 24 px graph-paper grid. Each subject is a tinted constellation (10% Night, 6% Day) with its name in wide capitals.
- **Stars:** five marks that differ by shape: filled star (demonstrated), half-filled ring (in progress), outlined star (up next: every prerequisite demonstrated), warning ring (needs a recheck) and a dim dot (not started). Size (6–14 px) follows what is linked to the concept: due cards, checkpoints and connections, because `AtlasGraph` has no total-card count. Per the kit contract, demonstrated is the subject colour rather than gold.
- **Links:** prerequisites are solid with an arrowhead at the dependent concept; related links are dotted. Selecting a star rings it, brightens its links to the selection colour and dims unrelated stars to 40%.
- **Zoom levels:** far shows constellation names and the two or three largest stars per constellation; mid labels every star in view without overlaps; near (≥1.6×) adds the selected concept's checkpoints and due cards as satellites.
- **Gestures:** drag, pinch, wheel, double tap; Recentre always and zoom buttons from 1024 px; a Legend chip.
- **Sheet:** peeks 180 px with the name, state, subject, "Checkpoint 4 · 9 cards due · 6 neighbours", Open checkpoint and Review cards (disabled with a reason when there is nothing to open). Pulled up (button or drag) it lists Needs / Opens up / Related neighbours (a tap flies there) and Pin, Edit and Preview edits, which reuse the existing audited commands.
- **Search and list:** name search, prefix matches first; choosing a result flies there in 700 ms (a jump with reduced motion). List view is the accessible path; the canvas is `aria-hidden` and the map announces "82 concepts, 26 connections, 9 demonstrated". Map and List share the `?id=` selection.

Seed checks (unit and browser): 82 stars, 3 constellations, 9 demonstrated; "comp" finds 7; Compactness reads "Checkpoint 4 · 9 cards due · 6 neighbours" (the plan's "3 neighbours" was illustrative; the seed has 6); Open checkpoint goes to `/p/real-analysis/cp/CP4`. The heavy profile (600 concepts, 1,500 links) lays out deterministically in the worker; the 50 fps panning target is a Part 12 performance-probe measurement, not a blocking test. Known follow-ups: Review cards links `/review/run?concept=`, which the current v6 review run does not filter by (the Part 4 review round should); the Pin, Edit and Preview dialogs are the v6 components until those screens are rebuilt.

## Part 4 status

Landed behind `v7Shell` (default off); v6 and legacy stay as the rollback. Routing lives in `src/app/v7Kit.ts`.

- **Shell** (`src/app/v7/`): hub, detail and immersive headers, tab bar, session row, Capture sheet.
- **Today** (§6.2), **Focus** (§6.3), **Review round** (§6.4: swipe right Good, left Again, up Easy; the four grade buttons are the accessible path).
- **Calendar Day** (§6.5, `src/features/calendar/v7/`): week strip with subject dots, all-day lane (overdue and due items), a 64 px/hour grid with study, busy (hatched), logged and done blocks, side-by-side overlaps, a now-line with time pill, taps on the quarter hour, press-and-hold drag in 15-minute steps with a tick per step, drop on the strip to move to another day, Alt+arrow keyboard move and resize, Undo toast. Week, Month and Agenda keep the v6 views (`view=week|month|agenda`).
- **Path** (§6.9, `src/features/project/v7/`): emblem header, meter, target chip, Map / Sessions / Sources / Cards tabs, the constellation map with five node states (each with a text label), a line solid to the current node and dotted after it, and a sticky action bar with the study-prompt sheet.

Known gaps, none blocking the flag staying off:
- Calendar: the quick-add sheet, block sheet and planner suggestions banner reuse the existing v6 sheets; their restyle and the dashed "Suggested" blocks wait for the Planner item. The overdue chip links to the Agenda triage rather than opening the overdue sheet.
- Path: Sources reuses the v6 panel; (Part 6 added Pause/Resume and Archive to the "More" menu, a real card list in the Cards tab, and a path-scoped Review hub) the Cards tab lists per-checkpoint due counts because the card list has no URL filter.
- Review cards link `/review/run?concept=`, which the v6 durable run ignores. (Capture is no longer a placeholder: see Part 6.)
- Verification is by CI; there was no local Playwright or typecheck run.

## Part 6 status (daily loop)

Behind `v7Shell` (default off). `/review` is a v7 screen; `/review/done` is one only when it carries `?run=` (a saved durable run), so local reminder rounds keep their existing Done page.

- **Capture** (§6.1 F, `src/app/v7/CaptureSheet.tsx`, `captureModel.ts`): one large field. It reads a date (today, tomorrow, weekday, "next mon", "9 Nov"), a time (16:00, 4pm), a length (90m, 1h30, 45 min) and `#path` out of the sentence as removable tokens; the type (Task, Time block, Card, Thought) follows from them (`::` makes a card) and can be set by hand. The footer button names the result ("Add block"). Long-press (350 ms) on the Capture button shows the four types first. Saves go through the existing task, calendar-block, card and thought APIs, each with an Undo toast. "More options" opens the full form on the relevant screen.
- **Search** (§6.1 G, `SearchSheet.tsx`, `searchModel.ts`): Recent and Actions before typing; while typing, groups of at most four rows with "Show all", in the order Paths, Checkpoints, Cards, Concepts, Tasks, Settings, Actions, with up/down/Enter. Recent items are kept on this device only.
- **Review hub** (§6.4 A, `src/features/review/v7/`): the hero count, a proportional subject bar (each segment is a labelled button that narrows the round to that subject), Start review or Resume, a "Customise this round" sheet (deck and checkpoint switches), Due each day, memory tiles (Recall, Reviews, Typical answer time as a median over 30 days) and deck rows with switches. `/review?path=<slug>` pre-selects one path, which is what Path's "Review N" now opens.
- **Round complete** (§6.4 C, `src/features/review-done/v7/`): proof mark, three stat tiles, a 28 px grade bar with counts and a legend, "Next: N cards tomorrow", Done and "Review N more" (up to 10 more due cards, as a new durable run).
- **Practice** (§6.13, `src/features/practice/v7/`): one card per topic (title, due chip, cadence in words, last practised), a small Practice button opening a sheet with the four named ratings, notes, an optional timer and Save; Manage holds cadence, history with Void, and Archive; archived topics sit under a disclosure. It reuses the existing practice-topic API and loaders. `/practice` highlights the Review tab, and the hub has Review / Cards / Practice links.
- **Path** (Part 4 gaps closed): Pause/Resume and Archive in More (with Undo), a card list in the Cards tab, path-scoped review.

Known gaps:
- Due each day shows 7 days (the existing forecast RPC); the plan asks for 14. Widening needs an RPC change, so it is left for a data item.
- The durable run stores no grades, so the Round complete grade bar and "recalled first try" are read from the reviews recorded between the run's start and end. Cards re-asked in the same round count each time. Cards and time use the run itself and the recorded durations.
- Capture shows Undo only (the shared Toast supports one action), not "Open". "Start focus" in Search goes to Today.
- Search checkpoints come from the first 12 paths only, to bound the requests.
- The remaining Today/Focus states are not built; Calendar Week/Month/Agenda, the block sheet and quick-add restyle, planner suggestions, the overdue sheet, Tasks and Close the day are Part 7.
- Verification is by CI plus pure-function unit tests run locally; there was no local Playwright, typecheck or device run.

## Part 7 status (plan, P3: Calendar, Tasks, Close the day)

All behind `v7Shell` (default off).

- **Tasks** (`/tasks`): To do / Doing / Done; To do grouped Overdue, Today, This week, Later, No date; swipe right completes, swipe left reveals Schedule / Edit / Delete; per-row More sheet; Load more. Model in `features/tasks/v7/tasksModel.ts`.
- **Close the day** (`/today/close`): immersive three steps (Today, Loose ends, Tomorrow). Blocks and tasks go to tomorrow or are dropped; thoughts become tasks or are dismissed; the tomorrow aim is stored in the ritual record; closing uses the existing `closePlan`. Model in `features/ritual/v7/closeModel.ts`.
- **Calendar** (`/calendar`): one page, `V7CalendarDay`, hosts Day, Week, Month and Agenda through `?view=`. Week has a 48 px hour grid with the strip as its header; Month tints on five steps with up to three subject dots, a due flag and an Open day list; Agenda covers 14 days with sticky day headings and "Nothing planned · Add". View helpers are in `features/calendar/v7/viewModel.ts`.
- **Quick-add** (`?quick=1`, also the New block button and tapping an empty slot): title, 25/50/90 min chips, Study/Busy switch, up to four path chips, and More options (opens the existing full block sheet). Tasks > Schedule links here with `task` and `len`; the title is prefilled from the task and the block is linked to it.
- **Suggestions banner** (Day, today or later): "N suggested blocks" from the existing planner preview (read-only). Add all commits through `commitPlannerSelection` with one Undo; Adjust, and `?plan=1` from Tasks > Plan these, open the v6 planner dialog (`PlannerLaunch` gained `autoOpen`, `hideTrigger`, `onClosed`).
- **Overdue sheet**: the "N overdue" chip opens a v7 sheet with Done, Reschedule and Hide until tomorrow, using the same deadline writes as the v6 banner.

### Gaps (not done)

- The planner Adjust dialog is still the v6 dialog; it is not restyled.
- Suggested blocks on the grid are outlined and hatched rather than dashed, because the design gate bans dashed borders.
- Tasks: no drag reorder. Week: no drag between days. Close the day: a day with no plan has no close record; "Tomorrow" shifts a block by 24 h, which is off by an hour across a DST change.
- Overdue still counts deadlines and practice topics only, not tasks (tasks show their own Overdue group on the Tasks screen), so the Today count and the Calendar sheet agree.
- Close the day is offered from 17:00 in the owner's zone; there is no day-end setting to read yet.

### Verification

Pure models have unit tests (`tests/unit/v7/{tasks,close-day,calendar-views,quick-add}.test.ts`) and e2e specs in `tests/e2e/v7-part6.spec.ts`. Locally only the design gate, syntax checks and the pure unit tests were run (no installs, no Playwright, no device). CI is the real runner; nothing here has been seen on a phone.

### Part 7 follow-up: Today and the start sheet

- **Targets** now has Focus, Reviews (answered today against answered plus due) and Practice (practised today against practised plus due), each hidden at a zero target. A met row shows Done.
- **Needs you** shows at most four rows (overdue, cards due, tasks due today with a checkbox and Undo, practice due) with "Show all (n)". Triage opens `/calendar?view=day&overdue=1`, which opens the overdue sheet.
- **Close the day** card from 17:00 until the day is closed. **Details** (`?block=`) opens the block sheet and **Plan tomorrow** (`?plan=tomorrow`) opens the planner on the next day.
- **Quick focus** start sheet lists Open plus the owner's presets (for example "Pomodoro · 25 / 5 × 4"); a chosen preset is sent as `presetId` so the server captures its configuration. Focus running, break, paused and finish were already built in Part 4.
- Rows from `needsModel.ts` have unit tests in `tests/unit/v7/today-needs.test.ts`.

### Part 7 follow-up: block sheet and suggestions on the grid

- The block sheet (New and Edit, also More options) now draws in the kit's sheet and controls under `v7Shell`; the form logic is unchanged and shared with v6 (`BlockSheet` takes a `v7` prop, v6 output is untouched).
- Quick-add hands its title, task link and length to the full sheet (`title`, `task`, `len` params).
- Day draws the planner's suggestions as labelled "Suggested" blocks, not clickable, until Add all or Adjust.

## Night critique v2 (11 Nov 2026): fix pass

The Owner's critique of the Night build is stored as `docs/v7/NIGHT_CRITIQUE_v2.md`. Where it and `PLAN.md` disagree, the critique (and the kit it points to) wins; `PLAN.md` now includes the PA0–PA11 amendments in place; the unchanged original is retained in git history. Everything stays behind `v7Shell` (off by default).

**Step 0 · captures.** `tests/e2e/v7-screens.spec.ts` now freezes the clock at Mon 9 Nov 2026, 13:43 IST (en-IN, Asia/Kolkata) on the demo seed (C1), captures long screens as viewport-sized frames while scrolling (C2), adds the review round and the Path map in Day and Night and Today and Calendar at 1280 × 800 (C3), and captures the Quick focus sheet, which every hero state now offers (C4, PA3). **C5 is an Owner decision:** P2 and P3 screens exist ahead of the golden-six gate; freeze them or waive the gate order in writing.

**Step 1 · kit leaks.**
- K1/KA1: the Night segmented thumb (`surface.muted.hover`), the hero emblem glow and the hero star field (`.v7-starfield`) now apply in the app, not only inside the kit page's split panels.
- K2/KA2: every legacy alias is gone from `tokens.css` (`--v7-glass`, `--v7-blur`, `--v7-hero-stop`, the alpha tokens, `--v7-art`, `--v7-ink*`, `--v7-wash*`, `--v7-accent*`, `--v7-subject-1…8`, `--v7-bg*`, `--v7-line*`, the 18/22/36/48 px sizes and the `size-N`/`leading-N` names, which became role names). App code was moved to role tokens; the unread component tier is no longer generated. `scripts/v7/check-kit.mjs` now fails on a token outside the role, foundation and effect sets, a retired alias, a read of an undefined `--v7-*` token, a native select/date/time control in v7 screen code, and the critique's off-kit colours.
- K3/KA3: `KIT_10_PLAN.md` is amended in place for the control-size table, Day Topology `#009C85`, the role-only type scale, the Night thumb and the component tier.
- KA4: `viz.neutral` (the `text.secondary` value, ≥3:1 on raised surfaces and the meter track) for single-series charts and non-subject meters.
- Found while measuring KC22: the v6 appearance setting writes `data-density="compact"` on `<html>`, which the v7 tokens also read, so phone buttons were 40–42 px. v7 density is now its own attribute, `data-v7-density`.

**Step 2 · blockers.**
- B1: the planner's Adjust panel is the kit Sheet (`features/planner/V7PlannerSheet.tsx`) with the kit Select, Checkbox, Date field and Time range field and an `action.bg` primary; "Not placed" rows name the reason and offer a fix (PL2).
- B2: `formatTimeLeft` in `lib/format.ts` reads the full due date and time; Agenda rows show it ("Due in 4 days"), and the effort reads "about 1 h of work".
- B3: `features/calendar/v7/overdue.ts` (`overdueSummary`, `useOverdueSummary`) is the one count — open tasks, deadlines and practice topics. Today, the Calendar lane, the overdue sheet (which now lists tasks with Done and Reschedule) and the Tasks Overdue group agree.
- B4: the Calendar date row is "‹ November 2026 ›" plus a Today pill only when away; "+ New block" is removed (CD2).
- B5: the Review split is a 6 px segmented meter with a wrapping legend of glyph, subject and count.
- B6: every v7 focusable element, textareas included, shows `focus.ring`; the capture sheet opens with it, and "Unavailable · …" sits under the disabled primary.
- B7: the block sheet, planner, overdue sheet and Close the day use the kit Date field, Time range field and Select; the kit's "Type a time" is a 24-hour text field. v7 screens use `formatShortDate` ("Wed 11 Nov"), `formatLongDate` and `formatClock`.

**Step 3 · kit compliance.** KC1 one Badge with its status icon (`ui/v7/Status.tsx`); KC2 subject glyphs replace dots (week strip, Month cells, Week blocks, Tasks, Review decks and split, Agenda, quick-add chips, session row); KC3/KC4 neutral data colour for non-subject meters and the single-series chart (the 7-day forecast has no per-subject split, so stacking by subject waits for a data item); KC5 round ticks, no one-series legend, a 150 px compact chart; KC6 the Starlight/Ink heat ramp with outlined empty cells and a five-swatch legend; KC7 underlined Tabs; KC8 Display 44 for Today's greeting, Title 32 for hub and step titles, Subhead 20 for the Month heading; KC9 the kit Stat tile and "19 of 42"; KC10 tertiary actions pull back by their padding; KC11 a flat `surface.raised` hero with the emblem bottom-right at 10% and the Night star field; KC12 a solid tab bar and headers; KC14 the capture type is a Segmented control and both block sheets use the Time range field; KC15 an info-tone suggestions banner in one 44 px row; KC16 inner rules with round ends; KC17 Focus shows the subject Tag and the path as text; KC18 hollow ○ conjectures and ↻ review-due marks; KC19 12 px kit fields and an "· Optional" suffix; KC20 24 px between Today's cards; KC21 64 px deck rows with a 40 px subject tile; KC22 48 px by default, 44 px small; KC23 the Night hero glow on Focus.

**Step 4/6 · screens.** Today TD2–TD9 (scroll padding on Continue, short-sentence briefing, "19 of 42 · 23 left", the Focus target from the deployed 20-minute default, the strip over the planning window, an Inbox card fan, 96 px covers), Focus FO1–FO5 (a visually hidden heading had taken the flexible row; the emblem is now centred on the timer; Finish stays secondary until the planned length), Review RV1–RV6, Practice PR1–PR5, Calendar CD1–CD6 (the grid starts above 45% of the viewport with at least 4 hours above the tab bar), Week CW1–CW3, Month CM1–CM5, Agenda CA1–CA5 (runs of empty days collapse, PA7), block sheet BS1–BS4, quick-add QA1–QA5 (the draft block is drawn and scrolled above the sheet), planner PL1–PL2, Tasks TK1–TK4, capture CP1–CP4, Search SE1–SE4 (full height, own icons, the field is the header), Close the day CL1–CL7 (fixed footer, best real figure when focus is zero, tomorrow's first study block or the planner's suggestion), Atlas AT1–AT5 (a portrait-aware layout and a fit that includes labels, fainter dust, labels that avoid stars, arrowheads only when zoomed or selected), shell SH1–SH4 (the Capture button hides while scrolling down; Inbox count on every hub, Settings on Today only; no disabled "⋯" placeholder). A demonstrated Path checkpoint is a subject-filled star, not gold (PA0).

**Second pass (same day): the items the first pass left open.**
- PA11 rendered design lint: `tests/e2e/v7-design-lint.spec.ts` opens every v7 scene (`tests/e2e/v7-scenes.ts`, shared with the captures) in Day and Night at 390 and 320 px and fails on a button that is not 48 px (44 small, 40 from 700 px), a visible native select, date or time control, a status Badge without its icon, a bare subject-coloured dot, indigo on a meter or chart, text cut to fewer than four characters, and horizontal page scroll. It found and I fixed: Path's action bar wrapped to 66–90 px buttons and was translucent; Target, Proposed and Suggested badges had no icon; the review round's primary was 56 px; the Path header scrolled sideways at 320 px (page grids now use one `minmax(0,1fr)` column and detail headers can shrink).
- KA5–KA8: the kit gallery has an "App shell" section (`features/kit/ShellPanel.tsx`) drawn with the real classes: tab bar and Capture, hub header (expanded and collapsed), week strip, time-grid and suggested blocks, day strip and live chip, timer ring, grade dock, map stars, search rows and the 96 px cover size. Kit version 1.1.0.
- KC21: a deck with checkpoints has a chevron that opens the checkpoint switches. CD1: hub titles sit in a sticky solid bar and shrink from Title 32 to Subhead 20 after 24 px of scrolling.
- Found while preparing the golden candidates: the Path emblem is now a 164 px, 10% ornament at the bottom-right instead of an 80% scribble behind the title; a 50-minute Calendar block shows two lines instead of clipping three; Focus's Pause keeps a visible edge in Day; the review card is centred between the progress bar and the button; Tabs without a count line up with tabs that have one; a gold star on the Path map became a subject-filled star.

**Open at the end of that pass (superseded by the closure pass below):**
- C5: P2 and P3 screens exist ahead of the golden-six gate. Freeze them or waive the gate order in writing.
- KC4: "Due each day" is a single neutral series because the forecast RPC returns one total per day. Stacking by subject needs an additive read (cards due per day per path), which the accepted constraints exclude until you approve it.
- 1280 × 800: the phone layout in a wide window. The side rail and two-column layouts of PLAN §5.3 are Part 11, so Today and Calendar at 1280 cannot be approved as final yet.
- The Capture button, at rest, can sit over the right edge of a row (Today's Reviews line, a Calendar block). It slides away on scroll as the critique asks; moving it into the tab bar's row would remove the overlap but changes the plan's navigation, so it is your call.

**Golden candidates** are in `docs/v7/golden-candidates/` (captured by `V7_GOLDEN=1 npx playwright test tests/e2e/v7-golden.spec.ts`, composed by `scripts/v7/compose-golden.py`). They move to `docs/v7/golden/` only when you approve them.

**Verification (this environment):** typecheck, repository lint and `scripts/v7/check-kit.mjs` pass; all 371 unit files (2,077 tests) pass, including the new `tests/unit/v7/night-critique.test.tsx`; the v7 browser specs (`v7-design-lint`, `v7-night-critique`, `v7-part4`, `v7-part6`, `v7-atlas`, `v7-kit`, `v7-step3`, `v7-screens`, 46 captures) and the v6 planner and calendar specs (`v6-g7-fixes`, `v6-harden-planning`, `v6-n121-audit`, `v6-n121-grid`, `v6-rollback`) pass against a production build. Deliberately updated tests: `v7-kit` counts 51 token cards (viz.neutral); `v7-part4` and `v7-part6` open quick-add from a tap on the grid (no "+ New block"), find Practice as a Review tab, and check that Agenda never shows two empty sections in a row; `v7-atlas` reads the kit state names "Review due" and "Conjecture · not started"; `calendar-views` uses the kit heat steps. No device run.


## Owner golden-screen approval · 11 Nov 2026

The Owner wrote: "I approve the screenshots of golden screens."

This records visual approval of the six phone golden screens (Today, Focus, Calendar Day, Atlas, review round and Path map), in Day and Night at 390 × 844. The twelve screen PNGs and six side-by-side comparison PNGs in `docs/v7/golden/` are byte-identical copies of the candidates on commit `d35496a4d47a5b8607d0e17567cb575fd907f862`. The source candidates remain available; future captures continue to go to `golden-candidates/` for review rather than overwriting approved references.

The 1280 × 800 Today and Calendar captures remain candidates, because they still show the phone layout in a wide window. They are not accepted as final desktop layouts by this record.

This is the Owner's visual approval, not a claim that the complete P1 acceptance checklist or every screen's "Done when" list has been verified. C5's retrospective gate-order decision, KC4's subject-stacked forecast/additional read, the Capture button's resting overlap and Part 11 responsive approval remain open. Gallery approval, Part 12 performance/accessibility/device evidence, final activation and independent final review also remain separate gates. `v7Shell` stays off, and this PR stays not Ready.

Code inspection at the approved source commit also confirms that "Due each day" still shows seven days; the fourteen-day Review forecast permitted by the accepted constraints remains unfinished. Preserve Today's existing seven-day RPC.



## Audit closure pass · 11 Nov 2026

Owner instruction: "Follow your recommendation and start working. First make sure everything in the audit is addressed."

The Owner accepted C5's retrospective order waiver, the additive frontend forecast read and Capture's reserved placement alongside the five-link tab bar. This supersedes those open decision bullets above. The exact earlier phone goldens remain unchanged; new captures remain candidates.

- KC4/RV2: `getPathReviewForecast` reads fourteen study days by path, counting every scheduled sibling before quotas. Live mode uses explicit owner filters, RLS, stable 500-row keyset pages and only scheduling/path metadata; demo mode matches the filtering and day-bucket semantics. Today's seven-day `home_review_outlook` RPC is unchanged. The chart stacks by subject, uses direct glyph labels for up to three series, retains an equivalent fourteen-row table and keyboard inspection, and shows a retryable error rather than partial counts.
- SH2/PA2: Capture now has a reserved dock slot outside the five-link navigation landmark. It retains tap/long-press behaviour, hides on scroll down, returns on scroll up or keyboard focus, and disables its transition under reduced motion.
- B3: Tasks now exposes the same overall triage count as Today and Calendar, with its task-only filter/group remaining the task subset. The browser regression now asserts equality on all three screens, rather than merely allowing Tasks to be smaller. An overdue read no longer falls back to a partial first page.
- PA0–PA11: the governing plan is amended in place. The kit replaces its former Section 4; breakpoints, type/radius roles, stars, suggestions and acceptance lists are reconciled. The traceability and itemized acceptance record is `AUDIT_CLOSURE.md`.
- Further acceptance gaps found: Quick focus is available in every hero state; a running session gives a truthful disabled reason instead of starting another. The review bar counts the actual selected/quota-limited batch; review tags name subjects, while paths and sources are metadata. A first swipe reveals the card and a second grades it, allowing a whole swipe-only round. A no-plan day is now closed through a recoverable, empty day-plan lifecycle, preserving tomorrow's aim and first-task field. Moving blocks to tomorrow preserves local wall times across DST. Tasks support drag/keyboard/menu reordering with versioned persisted positions; overdue remains the first group.

Validation at this point: typecheck, repository lint, the four-mode static kit check and a production build/PWA check pass. All 374 unit files / 2,089 tests passed locally after the initial fixes; later narrow edits are checked separately before push. The 22 new browser acceptance cases are enumerated successfully. Local Chromium launch is blocked by the command sandbox's Unix-socket policy; the shared browser cannot reach that isolated localhost. Browser execution must be verified by PR CI; neither attempt is reported as a passing browser run. The approved baseline and its earlier CI evidence remain historical.

Still separate: real responsive layouts and fresh 1280 captures (Part 11), physical-device/screen-reader testing, performance measurements/default activation, final visual review of changed candidates, and the independent complete-PR review. No Ready or activation is implied.

## Part 8 status (learning: PLAN §6.8, §6.9 Checkpoint and Session, §6.11)

Built behind `v7Shell` (default off); v6 and legacy screens stay for rollback.

- **Paths hub** (`/projects`, `src/features/projects/v7/`): hub tabs Paths · Cards · Atlas, search over title, subject, current checkpoint and source titles, Active/Paused/Done/Archived chips with counts, path cards (96 × 108 emblem cover on the subject tint, "Now: … · step n of m", an 8 px subject meter, the schedule chip only when there is a forecast, a "n due" link that starts that path's review), subject headings only for two or more paths, pinned-then-recent order, a ⋯ sheet with Pin, Pause/Resume, Mark done and Archive (each with Undo), and a solid-edge "Start a new path" card.
- **New path** (`/projects/new`): a sheet over the hub with Name, a dashed Sources drop zone ("Add a PDF, .tex or .md · 50 MB each"), file rows with size and remove, the tutor note and a primary "Create path". The new path opens with a "Tell your tutor" card and "Copy prompt" (`?new=1`).
- **Checkpoint**: eyebrow, title and state/stage chips; the statement card with a 3 px inset rule and "What counts"; a 56 px-row stepper (done, current with "Next", later); prerequisites with their state and the source; the recheck card; evidence grouped by session; "n cards · Review"; a sticky bar with "Work on this with your tutor" and ⋯ holding Demonstrate and Defer with their one-line explanations.
- **Session**: the goal as the title with duration, tutor, date-time and goal chips; the summary card; things to revisit; the timeline with times; the session's cards; "Start another session" in a sticky bar.
- **Cards** (Paths › Cards): search, Path/State/Checkpoint pickers, Has comments, a Due first/Newest sort, a count line, 72 px rows (glyph tile, front on two lines, "N49 · CP9 · due today", an accent dot when due today, a pause icon when paused), infinite scroll with "Load more" as the keyboard path. Capture opens the editor.
- **Card detail**: the card as in a review; Next review, Stability and Recall now; a recall chart replayed through the owner's scheduler (0–100% axis, 50% hairline, labelled target line, first/latest dates, grade-coloured dots with 44 px tap targets, legend); history with formatter dates, grade, confidence and the next interval; notes for the tutor; Edit card and Pause in a sticky bar; Pause/Delete in ⋯ with a delete confirmation.
- **Editor**: a full-height sheet, Write · Preview (side by side from 700 px), Front and Back in the serif, a key row with up to eight of the owner's macros then common symbols, Path, Checkpoint, Type and Kind pickers, and the primary in the sheet footer.

### Gaps (not done)

- The Cards sort offers Due first and Newest. "Hardest" needs card difficulty, which the library rows do not carry; adding it means changing the search read, which this PR does not do.
- "Due" in the Cards filter is a time test on the loaded pages (the search read has no due filter), so the count line says "50+" while more pages exist.
- The Atlas keeps its own immersive bar; it is reached from the Paths and Cards hub tabs but does not show them itself, so the approved Atlas golden is unchanged.
- The editor keeps the note's tags as they are; tag editing stays in the legacy editor.

### Verification

- Unit: `tests/unit/v7/learning.test.ts` (15 tests: Paths filters, order, search, grouping, due per path; Cards filters, due-today in the owner zone, meta line, sort; editor keys; evidence grouping; the recall replay; routes). Full unit suite 375 files / 2,104 tests passed.
- Browser: `tests/e2e/v7-learning.spec.ts` (8 tests covering each "Done when" item of §6.8, §6.9 and §6.11), the rendered design lint on the seven new scenes in Day and Night at 390 and 320 px (28 runs), and 115 existing tests across Paths, New project, routes, LaTeX, the v6 N121 audits, the Night critique, audit acceptance and responsive specs all passed against a production build.

## Part 9 status (Inbox and Plan proposal: PLAN §6.10)

Built behind `v7Shell` (default off); v6 and legacy screens stay for rollback.

- **Cards tab, triage stack** (`/proposals`, `src/features/proposals/v7/`): the top card in the review-card design (subject tag, path and session, kind eyebrow, front, hairline, back, "Why this card?" with the tutor's reason and the stored citations); two cards peek behind it at 60% and 30%. Reject (56 px, danger ring), Edit (48 px) and Approve (64 px, action fill) sit under the stack with captions, all in the bottom 40% of the screen. Swipe right approves and left rejects at 35% of the width or on a flick; up skips to the end; a shorter drag springs back. The card tilts up to 6° with a growing good or danger wash and the word. Keys: A or → approves, R or ← rejects, E edits, ↑ skips. Every decision waits 6 s with Undo before it is sent (the v6 contract: a new decision, leaving or closing sends the waiting one). "Approve all n from Session s" confirms in a sheet listing the cards. Edit opens the card editor with "Save and approve". Empty: ∎, "Inbox zero".
- **List view** (the header icon, `?view=list`): grouped by path and session, maths rendered, checkboxes and a sticky Reject n / Approve n bar, with the same 6 s Undo.
- **Plans tab**: one card per proposal with a 56 px emblem, the path and "Plan change · from Session n", "What changes" rows with plus, link, unlink, pencil, minus or arrow icons, a five-node mini map with the change as a dashed ring in place, "Why", and Reject, Approve and "Compare whole plan".
- **Plan proposal** (`/proposals/:id`): "What changes" first with the change summary, why, the whole plan drawn as the §6.9 path map with Added and Changed badges (before and after side by side from 900 px), sources, the draft editor under "Edit before approving (advanced)", and Approve / Reject in a sticky bar. A decision here is sent at once and returns to the path or the Plans tab, as on v6.

### Gaps (not done)

- The Plan proposal detail decides immediately (as v6 does) rather than with the 6 s Undo; the Plans tab in the Inbox does use the Undo window.
- The draft editor keeps its JSON text field; a structured editor is not in the plan.
- The main tab bar has no Inbox destination, so on `/proposals` it falls back to Today, as on every route outside the five destinations.

### Verification

- Unit: `tests/unit/v7/inbox.test.ts` (8 tests: swipe thresholds and flicks, tilt and wash, stable queue order and skipping, the "Approve all" set, list grouping, change rows, the mini-map window, routes). The v6 draft-editor unit tests (21) pass with the shared hook.
- Browser: `tests/e2e/v7-inbox.spec.ts` (8 tests: five decisions by swipe, by buttons and by keys; spring-back and skip; button placement in the bottom 40%; Undo within 6 s and the decision sticking after it; the batch sheet; the plan card and detail; the list view), run twice; the design lint on four new scenes in Day and Night at 390 and 320 px (16 runs); and 72 existing proposal, plan-review and draft-editor tests.

## Part 10 status (insight and edges: PLAN §6.13–6.16)

Built behind `v7Shell` (default off); v6 and legacy screens stay for rollback.

- **Progress** (`/insights`, `src/features/insights/v7/`): hub tabs Overview · Learning · Time · Log and one range control (Today, 7, 30, 90 days) above everything it affects. Overview: the focused time in Figure XL with "focused in the last n days", a change chip against the same number of days before, a focus-by-day (weekly at 30 and 90 days) chart, Reviews, Recall and Checkpoints tiles, a 26-week study almanac in one hue, time by subject as stacked columns in subject colours with a legend, and up to two rule-based insight sentences. Learning: recall over time with the target line, reviews by day stacked in the grade colours, "When you said" meters, checkpoints demonstrated per column, and the tutor-session time tile. Time: the hero, daily (weekly at 90 days) columns, subject bars, goal cards ("This week · All subjects", "40 min of 10 h", a meter with an even-pace tick, "9 h 20 min to go · 7 days left", Edit) and past goals. Every chart has a tap tooltip and "Show as table" (the kit chart components). Each column is its own exact partition of the saved time, so the columns add up to the hero.
- **Time log** (`/log`): the week strip as navigator, entries grouped by day with a 4 px subject bar, title, "22:00–22:35 · 35 min", the path and up to five rating dots; Edit, Split and Void in each row's ⋯ (Void confirms in a sheet that names the entry and offers Undo); Add time in a v7 sheet; Export CSV under ⋯.
- **Settings** (`/settings`): grouped index rows with an icon tile, the title, the current value and a chevron. Appearance: Auto/Day/Night cards with fixed mini previews (the theme changes at once) and switches for Reduce effects, Haptics and the phase chime. Subjects: a row per subject with its colour, opening a sheet with a live preview, the eight colour-and-emblem choices (taken ones marked) and the glyph. Tutor shows the connector address with Show, Copy and New address. Old `?section=` links open the page that holds that section. Delete account is last, in its own card with a critical heading.
- **Sign-in** (`/sign-in`): a full-height page with a slowly drawn emblem behind the ℓ mark, "Lemma" in Display and "A geometer's notebook"; one primary (Continue with Google) and a visible "Explore the example workspace". No tab bar.
- **First run** (`/welcome`): Connect your tutor (address, Copy, three steps), Start your first path (name and Create, or Use the example) and Your day (daily minimum, day end, reminders). Every step can be skipped; it ends on Today. A new owner with no paths who has neither finished nor skipped it is sent there once from Today; the example workspace never is.
- **States** (§6.16): v7 screens use the kit skeleton (shown only after its delay token), an inline error with Retry, the kit toast with Undo for reversible actions and a confirmation sheet that names the thing for destructive ones.

### Gaps (not done)

- Study and review, Planning, Reminders, Export and Delete account keep their existing forms (mapped onto v7 surfaces), including some native selects; they are not yet rebuilt with v7 fields and are left out of the design lint. Appearance, Subjects, the Tutor address and the index are v7.
- The emblem kind follows the colour choice (each of the eight colours has its own emblem family); it is not chosen separately.
- Log rows open the existing entry editor (a v6 dialog) for Edit and Split; swiping a row is not implemented, the ⋯ menu is.
- Progress "Today" reads the 7-day insight data limited to one day; live accounts that receive server aggregates show the aggregate's figures for the learning tiles.
- The almanac is 26 weeks at every width (a year on desktop is part of Part 11).

### Verification

- Unit: `tests/unit/v7/insight-edges.test.ts` (9 tests: columns add up to the hero for daily and weekly columns at 7, 30 and 90 days; the previous period; the almanac's whole weeks; insight sentences; goal wording with no raw dates or zone names; every Settings row's current value; old section links; the chosen subject colour overriding the name match; routes). Full unit suite 377 files / 2,121 tests passed.
- Browser: `tests/e2e/v7-insight-edges.spec.ts` (8 tests) passed three times in a row; the design lint on nine new scenes (36 runs); 365 existing tests across settings, time log, progress and sign-in; and all 196 v7 browser tests. `tests/e2e/v7-kit.spec.ts` now uses `/review/done` without a run as its example of an unmigrated route, because `/projects` is migrated.
