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
