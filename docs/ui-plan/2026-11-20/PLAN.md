# Lemma UI plan v2: a focused, calm, consistent app (phone, night theme)

Date 2026-11-20 · supersedes v1 (same folder, git history) · source commit `24c8a22`.

**Evidence**
- 492 captures from `npm run audit:ui` (F### populated, E### empty; see `audit-INDEX.md`), every frame reviewed;
- per-frame DOM measurements (`METRICS.md`, `metrics.csv`);
- a code audit of the v7 UI;
- the tutor ↔ MCP loop traced through the code;
- the Lemma Pad chat page the Owner liked.

**Concepts:** 9 phone mockups built on the real v7 tokens and fonts (`mockups/png/`, sources in `mockups/*.html`), and 8 before/after pairs (`before-after/*.jpg`).

**Owner decisions (2026-11-20), applied throughout:**
1. **Large text:** the tab bar stays icons-only with the active label.
2. **Atlas:** options behave like map-app controls, out of sight until needed.
3. **Images:** photos and drawings reach the tutor through MCP.
4. **Photos:** accepted, handled like drawings.
5. **Plan estimates:** my call. Each stage header carries its own estimate (e.g. "~6 h"), the path header carries one total line ("about 29 h left" plus "Set time" when no weekly time is set), and the unlabeled list of ranges goes.

---

## 1. Diagnosis: eight root causes behind ~70 findings

| # | Root cause | What it produces (frames) |
|---|---|---|
| R1 | **Three generations of CSS run at once.** `src/styles/graph.css:16` gives every `h1–h4` the legacy family `Newsreader` (a Google font that v7 never loads), and `AppShell.tsx` still imports `ui/v6/tokens.css`, `mockup.css`, `mockup-bindings.css` and `v6-atlas-shell.css` under v7 | Headings on about 30 screens fall back to the phone's default serif. This is the "unstyled" look of the Today plan card, Settings titles, Inbox, Focus, Tutor header and others (F005, F224–F237, F157, F207, F281). A whole legacy screen also leaks in: direct `/review/done`, with the old tab bar and a cyan button (F156) |
| R2 | **Panels bolted onto screens outside the kit.** `src/features/adaptive/AtlasPanels.tsx` (101 dense lines) draws panels on Today, Calendar, Path, Session, Checkpoint, Inbox, Settings, Progress and the Atlas | Native `<details>`, raw tables, raw dates ("12/11/2026, 6:00:00 pm"), developer strings ("atlas-owner-2026-11-20.1"), a diagnostics table of dashes in Progress › Learning (F196–F197), floating filter panels over the map (F173) |
| R3 | **Every screen builds its own floating bar.** `position: fixed` appears in 11 feature stylesheets, with 14 ad-hoc z-index values and no shared dock | Action bar stacked on the tab bar (152px, F114, F132, F120, F170); browse slider on the tab bar (144px, F067); a floating CTA over content (F102–F113, E072); a mini-player plus tab bar (F218); the offline banner over titles (F296, E172) |
| R4 | **The recommendation never reaches the hero.** Today's hero (`aria-label="Your next step"`) shows the next *calendar block*. The scheduler's decision lives in a separate card and only proposes an action *inside a planned study block*; otherwise the UI prints its hold reason verbatim | Every Today variant (morning, evening, night, weekend, empty) shows "No authorized task fits this window" or "Available study time has not been declared" (F005, F284–F295, E005). The product's best feature is invisible |
| R5 | **The tutor UI exposes the protocol and its own kit.** `tutor.css` has 40 raw px font declarations and its own `.btn/.tb/.chip`; the UI shows "Copy bearer token", "Create a connector grant for this question", "Handoff reference", "Check for reply" | Off-kit header (legacy font, 13/15/34px), a 470px start card, keyboard always open, no scratch pad, no sense of whether Claude is listening (F281–F282) |
| R6 | **Errors and empties are not modelled.** "Not found" is treated as a load failure, and empty data still renders full screens | "Path unavailable. Check your connection" for a path that doesn't exist (F123–F124); "This card could not be loaded" for card #99999 (F138); Review, Progress and Week render empty charts, dashes and disabled buttons (E080–E098, F151) |
| R7 | **Two sources of truth for progress text** | Paths list says Compactness is "step 2 of 4" while Path and Checkpoint say "Step 3 of 4" (F087 vs F102, F114) |
| R8 | **Copy grew by accretion** | Helper sentences repeat visible numbers, jargon, permanent how-to hints, keyboard hints on a phone. First-viewport words: Today 89, Path 94, Calendar Month 114 |

---

## 2. Principles (each is checkable)

1. **Content gets the screen.** Fixed chrome ≤ 132px on hubs (52 header + 80 tab bar) and ≤ 136px on detail pages (56 header + 80 action bar). Main content starts within 140px of the top. One pinned control row at most.
2. **One bottom bar.** Either the tab bar or a docked action bar, never both. Mini-players and banners dock inside it or in flow.
3. **Nothing is far away.** Every primary action is ≤ 2 taps from Today (table in §3). The same action has the same name and place everywhere ("Continue with tutor" is always the docked primary).
4. **Controls appear when needed.** Maps-style: search, layers and recentre float over full-bleed content and fade while you pan. Filters live in a sheet behind one button with a count badge.
5. **Fewer words.**
   - Titles ≤ 4 words; helper text one sentence of ≤ 12 words.
   - Never restate a visible number; no internal terms, IDs, versions or raw dates (one formatter: "Thu 12 Nov · 18:00").
   - How-to hints for the first 3 uses only; keyboard hints only for a fine pointer.
6. **One kit.**
   - `Lemma v7 *` families and the 11-step v7 type scale only.
   - Kit Select sheet, Disclosure row and Ruler instead of native controls.
   - A z-index scale, and a shared Dock and Sheet for anything pinned.
7. **Every destructive action can be undone** (toast with Undo), including delete.
8. **Empty means one helpful thing.** One EmptyMoment per screen: a line and an action.
9. **Errors say what happened.** "Doesn't exist" ≠ "offline" ≠ "failed".
10. **The tutor is a conversation, not a protocol.** Show presence and replies; hide grants and references behind Connection.

---

## 3. Information architecture: same five tabs, nothing more than two taps away

The five tabs and Capture stay: Today · Paths · Review · Calendar · Progress · [+]. The change is in what each one holds and how they connect.

| Area | Holds | Change |
|---|---|---|
| **Today** | Next step (recommended), the Then queue, Today strip (the ruler), needs-you chips, Continue | The hero becomes the scheduler's recommendation (§4.1). The plan card and decision details leave the screen |
| **Paths hub (Library)** | Paths · Cards · Atlas | The title follows the tab (today "Cards" shows h1 "Paths"). Search moves into the header; filters go behind one Filter chip |
| **Review hub** | Due · Practice | Nothing-due and empty states collapse into one EmptyMoment with the next review date |
| **Calendar hub** | Schedule · Tasks | Compact header (§4.5). Tasks are also one tap from Today's chips |
| **Progress** | Overview · Learning · Log | The Time tab folds into Overview ("Focus by day", "By subject", **Goals**). Goals get Add/Edit right there. Diagnostics leave Progress |
| **Inbox** | Cards · Plans | Reached from the header icon on every hub and from Today's "6 to approve" chip. "Atlas links" become "Suggested links" under Cards only |
| **Settings** | Appearance, Tutor, Study and review, Planning (+ **Goals**), Reminders, Subjects, Data and account, **Advanced › Diagnostics** | Diagnostics (model health, decision details, algorithm versions, Atlas tuning) live in one place for those who want them |
| **Tutor** | Checkpoint conversation | Entry points: the Path, Checkpoint and Session docked bar; the Atlas peek card; Today's Then row ("with tutor") |
| **Pad** | Notes and ink | Opens inside the app shell (header Back) instead of a "Return to Lemma" text link (F283) |

**Distance from Today (target ≤ 2 taps):**
- Review now: 1 (Start review).
- Continue the current checkpoint with the tutor: 1 (Then row) or 2 (Continue tile → docked button).
- See or approve proposals: 1 (chip).
- Overdue task: 1 (chip).
- Add a task, block, card or thought: 1 (+).
- Set study time: 1 (the ruler in the hero, or the "Set time" row).
- Close the day: 1 (evening hero).
- Atlas: 2 (Paths → Atlas).
- Goals: 2 (Progress → Overview).

---

## 4. Redesigns (with mockups)

### 4.1 Today: "Next step" makes the recommendation the hero
Mockups: `mockups/png/01-today-next-step.png`, `09-today-first-run.png` · before/after `before-after/today.jpg`, `first-run.jpg`.

1. **Loop ribbon** at the top of the hero: Checks · Learn · Practice · Close, as 4 progress segments. This is the day's study loop shown as progress, replacing the heading "Checks → Learn → Practice → Close".
2. **Now** (eyebrow + headline): the scheduler's action, e.g. "Review 23 cards · about 10 min", with subject glyph counts. Primary button: "Start review" / "Start with tutor" / "Start focus", by action kind. "Why this" opens a sheet with plain reasons: "Reviews first keeps recall at 90%", "Compactness step 3 is next on Real Analysis", and the practice success estimate when available.
3. **Then** queue (2 rows): the next recommended step ("Use a finite subcover · Compactness step 3 · with tutor · 25 min") and the next fixed commitment ("15:00 · Solve analysis problems").
4. **"Time you have now"**, the Calendar ruler reused: drag 10–90 min and the Now/Then stack re-plans to fit ("Fits review + learn · done by 14:23").
   - Defaults to the free time before the next block, capped at the preset focus length.
   - Behind it: a same-day capacity override (`capacity_overrides` already exists in the study resources), so the scheduler can recommend outside planned blocks. This removes the "No authorized task fits this window" dead end.
5. **When the scheduler holds**, the hero never prints the raw reason. It maps each hold kind to a useful card:
   - `no-capacity`: show the ruler with "How long do you have?";
   - `occupied`: "Return to focus";
   - `fixed`/`protected`: "Free at 16:00 · Plan then";
   - `unavailable`: fall back to due reviews or the current checkpoint.
6. **Today strip:** the existing ruler (`v7Ruler`), with the needs-you counts as three chips under it ("1 overdue", "1 due", "6 to approve"), each opening its list. This replaces the separate "Needs you" card and the subtitle sentence.
7. **Continue:** 3 small path tiles with progress (subject glyph + colour).
8. **Time of day:**
   - after 21:00 the hero becomes "Close the day" / "Plan tomorrow" (today it says "Plan my day" at 21:15, F287);
   - after midnight "Still up? · Plan tomorrow" (00:40 shows "Good evening", F290).
9. **First run (empty account):** "Welcome to Lemma" + a 3-step checklist (Start a path · Connect your tutor · Set your study time), each with a done tick and a progress ring; plus "Just want to study? Quick focus". It replaces the hero + plan card + "Three ways to begin" pile (E005–E006).

Data: `useAgenda()` (`decision`, `label`, `practice`), `heroState`, `nextStudyBlock`, `needsRows`, capacity overrides. Files: `src/features/home/v7/V7Today.tsx`, `todayModel.ts`, `needsModel.ts`, `Ruler.tsx`, `src/features/adaptive/*`, `src/data/adaptive/*`.

### 4.2 Atlas: a map you can actually read (maps-app controls)
Mockups: `02-atlas-map.png`, `03-atlas-layers.png` · before/after `atlas.jpg`, `atlas-filters.jpg`.

1. **Full-bleed map** between the top edge and the tab bar. The first view frames the constellation of your current checkpoint (`clusterCamera` exists), not the whole sky at zoom 0.45. Stars are ≥ 4px (≥ 7px in progress, up next or due), with 22px tap targets. Labels are 13px (selected 16px) with a page-coloured halo, so edges never cross the text.
2. **Floating search pill** (back · "Search the Atlas" · List toggle) replaces the header row and both tab rows. There is exactly one Map/List switch.
3. **Two round buttons** on the right: **Layers** and **Recentre** (Here ↔ All). Controls fade while panning and return 1.5 s after.
4. **Layers sheet** (Owner decision 2):
   - Map type: Constellations · Themes · Bridges, as picture tiles. Themes and Bridges stop being tabs and are hidden while empty.
   - Show: All / Uncertain / Gaps / Certified.
   - Kind chips.
   - Only stale concepts.
   - Key (the legend).
5. **Edge compass chips:** "Topology ›" and "‹ Linear Algebra" point to constellations off screen. Tapping one flies there.
6. **Peek card** (≤ 150px): name, state ("In progress · step 3 of 4"), "9 due", and the actions "Continue with tutor", "Review 9", "Expand ˄". The camera keeps the selection above the card.
7. **List view:** rows grouped by subject under sticky 32px headers; state glyph only, no "Conjecture · not started" text; "9 due" trailing chip; no sticky filter panel (List shares the Layers filters). Tapping a row expands the concept.
8. **Empty Atlas:** "No concepts yet · Start a path" (or "New concept" once a path exists).

Files: `src/features/atlas/v7/*` (`AtlasV7.tsx`, `AtlasMap.tsx`, `scene.ts` fit/label passes, `atlas.css`), `src/features/adaptive/AtlasPanels.tsx` (`AtlasExplore`, `AtlasFilters`), `src/ui/v7/atlas-values.css`.

### 4.3 Tutor chat: a conversation with the room it needs
Mockups: `04-tutor-reading.png`, `05-tutor-scratch.png` · before/after `tutor.jpg`, `tutor-start.jpg`.

1. **Header (56px):** back · "Compactness / CP4 · step 3 of 4" · **presence pill** (Listening / Not listening / Replying…) · timer · ⋯ (Session parts, Latest question, Context, Connection). Kit type only.
2. **Hairline progress** for the four session parts after Begin; the step rail shows only before Begin.
3. **"On the table"** pinned one-line card with the tutor's current question; tap to expand.
4. **Reading mode by default:** the keyboard stays down while you read. Composer + tool row are 132px, so the conversation gets ~590px. Focus the field to open the custom keyboard. The 48px "Show keyboard" bar goes; Keys is a tool.
5. **Messages:** tutor text full width in the reading face (STIX); learner bubbles right; drawings and photos as thumbnails inside the bubble ("Drawing · sent to Claude"), tap for a zoomable viewer.
6. **Tool row:** Scratch · Photo · Hint n/4 · Stuck · Symbols · Keys.
7. **Scratch pad** (Owner decisions 3 and 4):
   - The pad replaces the keyboard area, with tools Pen (3 widths, ink or accent), Eraser, Hand, Undo, Expand and Keys.
   - An attachment chip ("Drawing · Sends with your answer ×") appears with the first stroke, and Photo adds a camera or gallery image the same way.
   - Up to 3 images per answer; sending with only an image is allowed.
8. **Start state:** a ≤ 140px "On the table" card (checkpoint, one-line goal, Begin) instead of the 470px hero. A path with no plan shows "This path has no plan yet · Plan with your tutor", never a dead end (F101, E073).
9. **Protocol controls** ("Copy bearer token", "Create a connector grant…", "Handoff reference", "Check for reply") move to ⋯ › Connection. The default flow is: Send → "Waiting for Claude" → reply appears.

Files: `src/features/tutor/*` (`TutorLayout.tsx`, `TutorComposer.tsx`, `TutorChat.tsx`, `TutorPage.tsx`, `DemoCheckpointTutor.tsx`, `tutor.css` → kit), `src/data/tutor/*`.

### 4.4 How the tutor loop works today, and what makes "monitoring" and images reliable (the Owner's PS)

**What exists (verified in code):**
1. In Lemma you send an answer. The app saves a turn and issues a **grant** for it, valid 1 day (`live-manual.ts`, migration n193/n201). While a turn is pending and the page is visible, the app checks for a reply **every 3 s**, and also on focus, online and visibility change (`DemoCheckpointTutor.tsx:169–178`). So yes: a reply posted by Claude appears in Lemma automatically.
2. In the Claude app you ask it to work with Lemma:
   - Claude calls `get(what=tutor_turn)` to list pending handoffs, reads one with `get(what=tutor_turn, id)`, claims it with `study` (a 5-minute lease) and replies with `study … reply` (including `nextQuestion`).
   - After replying it calls `get(what=tutor_next, id)`, which **waits up to 18 s** (polling every 1.5 s) for your next answer in the same thread.
3. **The limit:** if you don't answer within those 18 s, `tutor_next` returns `{id:null}`, and the instructions tell Claude to stop and say where to find the question. "Listening" therefore lasts only as long as Claude keeps calling `tutor_next` within its current response. A Claude response cannot wait indefinitely; the client and model end the turn.

**Proposed (MCP + UI):**
1. **Keep-listening contract:** after a null, Claude calls `tutor_next` again until about 10 minutes have passed or you say stop. Raise each wait to ~25 s, staying under host tool timeouts. Instructions in `tutor-connector.ts` change accordingly.
2. **Presence:** record `listener_seen_at` on each `tutor_next`/`tutor_turn` read (additive column on `tutor_threads`). The app shows "Listening" (seen < 30 s ago), "Replying…" (a claim lease is active) or "Not listening". In the last case it offers a one-tap **Copy prompt** ("Continue my Lemma tutor session") to paste into Claude.
3. **Images over the same channel:**
   - `get(what=tutor_turn)` returns its JSON text **plus one MCP `image` content block per attachment** (base64 PNG/JPEG, ≤ 1 MB each, ≤ 3 per turn, grant-checked).
   - `server.ts` (text-only at lines 39–41) builds the mixed content array.
   - A new `get(what=tutor_attachment, id)` re-fetches one image.
   - The tutor may store a short transcription with its reply so later turns use text.
   - No signed URLs in model context (Owner decision 3).
4. **Storage:**
   - private bucket `tutor-ink`, with owner-folder policies;
   - table `tutor_turn_attachments`: RLS owner select, browser writes revoked, bound to the turn by the existing learner-turn command in the same transaction;
   - unbound uploads purged after 24 h;
   - included in the backup; deleted with the turn or account.

So the loop you described works today for text, while Claude is actively waiting. With the keep-listening contract and presence, it becomes dependable and visible. With image content blocks, drawings and photos travel exactly the same way.

### 4.5 Calendar: the day grid starts high
Mockup: `07-calendar-day.png` · before/after `calendar-day.jpg`.

1. **Header:** a date pill ("Mon 9 Nov ▾", which opens the month picker), a view switch (Day ▾), search and inbox. The Schedule/Tasks tabs stay. The week strip is one 56px row and collapses into the date pill on scroll.
2. **One chip row:** "1 overdue" and "3 good times · Add all". The separate "Suggested study times" card (repeated in Day, Week, Month and Agenda with raw dates) goes. Suggestions are **ghost blocks** in the grid, each with "Add".
3. **Busy time** is a hatched band behind study blocks, with study blocks inset in lanes. Today a busy block and a study block overlap at full width (F037).
4. **"Browse day"** is on demand (the clock chip), not a second bar above the tab bar.
5. **Block editor:** one sheet. Title, Study/Busy, a "when" row (date + ruler time range), and Path (which implies the subject). Checkpoint, Task and Status sit under "More". Delete is a row with a confirm and Undo, visible above the footer (F082–F084).
6. **Week view:** the grid starts at ≤ 150px; columns fill the width. Agenda merges empty days ("Nothing planned Tue–Thu · Add"). Month day numbers are 14px; due glyphs 14px.

### 4.6 Path, Checkpoint, Session
Mockup: `06-path.png` · before/after `path.jpg`.

1. **Path header:** subject emblem, title, one-line goal, "3 of 12 · Target 1 Feb · about 29 h left", and a progress bar.
2. **Underlined tabs** Plan · Sessions · Sources · Cards. "Plan" replaces "Map", because it is a list.
3. **Plan:**
   - Done stages collapse ("Foundations · 3 of 3").
   - The current stage is expanded with its estimate ("0 of 4 · ~6 h").
   - The current checkpoint is a highlighted row (glyph, step, "9 due"); a proposed checkpoint shows "Review"; locked ones are dim with "After Continuity".
   - Later stages collapse with their totals.
4. **Docked action bar:** "Continue with tutor" + "Review 14", with the tab bar hidden. No floating pill, and no second "Continue · Compactness" button.
5. **Sources:** one compact row per source (title, pages transcribed, "1 to check"). The duplicated "1 of 342 pages transcribed" goes (F108). Downloads move into a ⋯ menu.
6. **Checkpoint:**
   - The goal is in the reading face, with "What counts" inline as one line.
   - Steps as now; Evidence as a compact timeline.
   - The "Ready … — · not yet" line merges into "Recheck: not ready yet".
   - **Locked** checkpoints show "Unlocks after Heine–Borel" instead of "Work on this with your tutor", and no "0 due · Review" link (F117–F118).
   - Docked bar: "Continue with tutor".
7. **Session:** drop "Recent attempts — No attempts yet" (it contradicts the timeline, F120). "Start another session" becomes "Continue with tutor". "Things to revisit" and proposals stay; they are good.
8. **Fix the data mismatch** "step 2 of 4" (Paths list) vs "Step 3 of 4" (Path, Checkpoint) with one shared progress helper.

### 4.7 Review
1. **One empty or nothing-due state** (E080–E081, F151–F152): "Nothing due · Next: 18 cards tomorrow" + "Practice instead" + "Create a card" (empty only). No disabled Start/Customise, no empty chart, no dashed tiles.
2. **Round:**
   - The card keeps one vertical position in all states (it jumps today, F144/F149).
   - Scratch paper uses the shared ink engine (grid, tools) and never clips the revealed answer. Today the answer card is cut under the scratch area (F147).
   - "Answer undone. Grade this card again." becomes a toast with Redo.
3. **Round complete** (F150): replace the oversized pale ∎ block with the kit's end mark at 64px; time shows "—" only when nothing was timed.
4. **Direct `/review/done`** must render the v7 screen, not the legacy one (F156).

### 4.8 Progress
1. **Overview:** "1 h 35 min focused · 30 days" with the comparison only when the previous period has data ("Your first month" otherwise). Below it: Focus by day, By subject, and **Goals** with Add/Edit (today goals sit on the Time tab, and the empty state points to a Settings section that doesn't exist, E098).
2. **Learning:** keep Recall over time, Reviews by day, "When you said" and Checkpoints demonstrated. Remove the Atlas diagnostics table and calibration text (F196–F197) to Settings › Advanced › Diagnostics. Fix chart summaries for zero data ("None yet").
3. **Log:** as now. `?day=` scrolls to and highlights the day (today it has no visible effect, F203–F204).
4. **Week digest:** a 7-day bar chart with day labels and totals; empty → EmptyMoment (F205, E103).

### 4.9 Inbox, Cards, Capture, Search, Settings, Focus, Pad
- **Inbox:**
  - Cards stay one-at-a-time, with Reject/Edit/Approve.
  - "Suggested links" rows (no "analogous · 1", no 80%).
  - Keyboard hints only for a fine pointer.
  - The list-view footer shows only with a selection.
  - Plan change tags use 12px badges (9.5px today).
- **Cards:**
  - Search in the header; one Filter chip opens a sheet with Path, State and Sort; "90 cards · 23 due" inline; the first card ≤ 180px from the top.
  - Remove the unexplained purple dot, or label it (F125).
  - No-results has one "Clear filters".
  - Card editor: Path · Type · Kind as kit Select sheets; Checkpoint only after a path; live preview under the field instead of a Write/Preview switch; the key row scrolls with an edge fade.
- **Capture:**
  - The type follows the text, but a change is announced: the type chip animates and the footer says "Adds a time block".
  - "More options" opens the editor of the **chosen** type (today a task with a duration opens a block form, F033).
  - The try-hint shows for the first 3 uses only.
- **Search:** "Nothing matches 'x'" offers "Add task 'x'" and "Ask your tutor about 'x'" (search that creates).
- **Settings:**
  - Tutor rows either open sheets or render as static info (they look tappable and do nothing, F238–F241); remove the duplicate "Teaching style" label.
  - Planning loses the Atlas tuning block (to Advanced) and gains **Goals**.
  - The ruler replaces typed times (Day starts/ends, Preferred study time).
  - Weekday minutes uses the **capacity painter** (§5) and starts on the configured week start (today it starts Sunday, F016).
- **Focus:**
  - Break shows a break state (verify; F212 shows none).
  - The "too short to save" banner and the sheet merge into the sheet.
  - The mini-player docks into the tab bar region, not above it.
- **Pad:** inside the app shell, kit Select for the path.

---

## 5. New UI elements (all from existing tokens and kit parts)

Board: `mockups/png/08-new-elements.png`.

| Element | What it is | Where |
|---|---|---|
| **Loop ribbon** | 4 progress segments: Checks · Learn · Practice · Close | Today hero; Close the day |
| **Next-step card** | Now + Then + "Why this" | Today |
| **Ruler as picker** | The Calendar's custom scale as the one control for durations and times | Time you have now; block length; day starts/ends; reminder time; focus/break length; Add time |
| **Capacity painter** | 7 draggable weekday bars + presets ("Weekdays 1 h", "Weekends 2 h", "Copy last week") | Settings › Planning; first run step 3 |
| **Glance chips** | Count chips under the Today strip | Today |
| **Docked action bar** | The detail-page primary + secondary in the tab bar's place | Path, Checkpoint, Card, Session, Plan proposal, Tutor, Focus, Close the day |
| **Map controls** | Search pill, Layers, Recentre, edge compass chips, peek card; fade while panning | Atlas |
| **Presence pill** | Listening / Replying / Not listening + Copy prompt | Tutor header; Today's tutor row |
| **Ink tray + attachment chip** | Shared ink engine and an attachment chip with ×; photo via camera or gallery | Tutor, Review scratch paper, Pad |
| **Ghost block** | A dashed suggested block with Add | Calendar Day and Week |
| **Disclosure row** | A kit replacement for `<details>` | Tasks Cancelled, Inbox "Why this card?", Practice Archived, Checkpoint "What counts" |
| **Search that creates** | No-results rows that create a task or ask the tutor | Search sheet, Paths/Cards search |
| **Toast with Undo** | For every destructive action | Delete task, block, card; Reject; Discard |

---

## 6. Theme consistency programme (make "one kit" true)

1. **Scope the legacy CSS.** Wrap `src/styles/graph.css`, `themes.css` and `surfaces.css` rules in `html:not([data-v7])`, or stop loading them when v7 is on. Stop importing `ui/v6/tokens.css`, `mockup.css`, `mockup-bindings.css` and `v6-atlas-shell.css` from `AppShell.tsx` under v7. Give v7 base headings `font-family: var(--v7-serif)` explicitly.
2. **Kill the legacy leaks:** direct `/review/done` (F156), any route rendering v6 components under v7.
3. **Tutor on the kit:** replace the 40 raw px sizes in `tutor.css` with type roles, and `.btn/.tb/.chip/.sbtn/.send` with kit Button, IconButton and Chip. The custom keyboard keeps its own documented size exceptions.
4. **Z-index scale tokens** (`--v7-z-base/sticky/dock/sheet/toast/modal`), and shared `Dock` and `Sheet` primitives. Feature CSS may no longer use `position: fixed`, enforced by lint.
5. **Native controls → kit:**
   - `details` in 7 places;
   - `select` in Settings (focus mode), Pad, the card editor (Path, Checkpoint, Type, Kind) and the block editor (Date, Path, Checkpoint, Task, Status);
   - time inputs with clock icons (block editor, Add time, settings times) → Ruler time picker.
6. **Type scale:** 15, 13, 18, 17.5, 34, 38.5 and 9.5px usages move to roles (listed in `METRICS.md`).
7. **Lint gates** (the project's `tests/e2e/v7-design-lint.spec.ts`): font family, scale, native controls, overlaps, chrome budget, raw dates and versions, `position: fixed` outside primitives. Run them on the scenes this plan adds.

---

## 7. Findings register (every finding, with its fix)

Severity: **S1** blocks use or hides key value · **S2** clear defect · **S3** polish. "Item" refers to `NEXT-ITEMS.md`.

| ID | Sev | Screen · frame | Finding | Fix | Item |
|---|---|---|---|---|---|
| T1 | S1 | ~30 screens · F005, F224, F157, F207, F281 | Legacy `Newsreader` headings fall back to device serif | §6.1 | N203 |
| T2 | S2 | Shell | v6 CSS imported under v7 | §6.1 | N203 |
| T3 | S1 | Review done · F156 | Legacy v6 screen (old tab bar, cyan button) | §4.7.4 | N203 |
| T4 | S2 | Tutor · F281–F282 | Own type scale and buttons (40 raw px) | §6.3 | N203, N207 |
| T5 | S2 | Atlas panels | Off-scale rem sizes, no kit fonts | §6, WP AtlasPanels | N204 |
| T6 | S2 | 11 screens | Own fixed bars, ad-hoc z-index | §6.4 | N203, N209 |
| T7 | S2 | 7 + 10 places | Native details, selects, time inputs | §6.5 | N211 |
| T8 | S3 | many | Off-scale sizes | §6.6 | N203 |
| T9 | S3 | Paths list (10), Cards filters (8), Tasks filters (7) | Targets < 40px | 44px hit areas | N211 |
| T10 | S2 | Round complete · F150 | ∎ drawn as a large pale block | Kit end mark 64px | N211 |
| T11 | S3 | Inbox plans · F161 | 9.5px tags | 12px badges | N211 |
| L1 | S1 | Checkpoint, Card, Session, Plan · F114, F132, F120, F170 | Action bar stacked on the tab bar (152px) | Docked bar, hide tab bar | N209 |
| L2 | S1 | Calendar Day · F067 | ~222–260px before the grid; slider bar 144px | §4.5 | N214 |
| L3 | S1 | Path tabs, new path · F102–F113, E072 | Floating CTA covers rows and text | Docked bar | N209 |
| L4 | S1 | Atlas list · F174–F176 | Sticky filter block 264px, floating mid-list | §4.2.7 | N206 |
| L5 | S1 | Atlas map · F173 | Content in a ~240px band, 32% covered, labels 12px | §4.2 | N206 |
| L6 | S2 | Cards · F125 | ~260px before the first card; h1 "Paths" | §4.9 | N209 |
| L7 | S2 | Offline · F296, E172 | Banner covers the title | In-flow banner | N209 |
| L8 | S2 | First card · E032–E033 | Fields half width | Full-width kit fields | N211 |
| L9 | S2 | Card editor · F135 | Key row clipped | Scroll + fade | N211 |
| L10 | S2 | Review round · F147, F149 | Answer clipped under scratch; card jumps | §4.7.2 | N211 |
| L11 | S2 | Calendar · F037 | Busy and study blocks overlap full width | Lanes + hatched busy band | N214 |
| L12 | S2 | Edit block · F082–F084 | Delete hidden under the footer | §4.5.5 | N214 |
| L13 | S2 | Task form · F051–F057 | 8 stacked fields; Subject + Path redundant | Sentence-builder form: title + token chips | N211 |
| L14 | S1 | Tutor · F281–F282 | 470px start card; keyboard always open; extra 48px bar | §4.3 | N207 |
| L15 | S3 | Week · F205 | Unlabeled 3-dot chart in a big empty card | §4.8.4 | N210 |
| L16 | S3 | Large text · F298 | Tab labels hidden | Keep (decision 1) | — |
| B1 | S1 | Paths list vs Path · F087, F102 | "step 2 of 4" vs "Step 3 of 4" | One progress helper | N211 |
| B2 | S2 | Path, Checkpoint, Card not found · F123, F124, F138 | Shown as connection failure | "Doesn't exist" states | N211 |
| B3 | S1 | Delete task · F062 | No Undo | Toast with Undo | N211 |
| B4 | S2 | Session · F120 | "No attempts yet" next to attempts | Remove panel | N204 |
| B5 | S2 | Progress · F187, F193, E096 | Wrong comparisons; "most on" with zero data | §4.8 | N215 |
| B6 | S2 | Progress Time empty · E098 | Points to a missing Settings › Planning goals section | Goals in Overview + Settings | N215 |
| B7 | S3 | Progress Time · F198–F200 | Two "This week · Analysis" goals (verify data or dedupe) | Check | N215 |
| B8 | S2 | Weekday minutes · F016 | Starts Sunday though the week starts Monday | Capacity painter honours the setting | N213 |
| B9 | S3 | Sources · F108 | "1 of 342 pages transcribed" printed twice | Compact source row | N211 |
| B10 | S2 | Capture · F026, F033 | Silent type switch; More options opens the wrong editor | §4.9 | N211 |
| B11 | S3 | Log `?day=` · F203–F204 | No visible effect | Scroll + highlight | N215 |
| B12 | S3 | Inbox Edit · F163 | Edit showed nothing in the capture (verify) | Verify; kit editor sheet | N211 |
| B13 | S3 | Focus Break · F212 | No break state shown (verify) | Verify; break state | N211 |
| B14 | S2 | Settings › Tutor · F238–F241 | Rows look tappable, do nothing | Static or real | N211 |
| B15 | S2 | Today evening and night · F287, F290 | "Plan my day" at 21:15; "Good evening" at 00:40 | §4.1.8 | N205 |
| B16 | S2 | Locked checkpoint · F117–F118 | "Work on this…" and a "0 due · Review" link | §4.6.6 | N211 |
| B17 | S3 | Paths Paused/Done/Archived · F089–F091 | Irrelevant "Start a new path" | No CTA | N210 |
| B18 | S1 | New path → tutor · F101, E073 | Dead end | §4.3.8 | N207 |
| B19 | S2 | Calendar suggestions · F067, F071, F038 | Raw dates; another date's suggestions in Day; repeated in 4 views | Ghost blocks | N214 |
| B20 | S3 | Empty Agenda · E056 | Checkpoint deadline in an empty account (verify seed) | Verify | N211 |
| B21 | S1 | Today, Progress, Tutor · F020, F196, F282 | Developer strings and diagnostics in the UI | Settings › Advanced › Diagnostics | N204 |
| B22 | S3 | Inbox · F157 | Keyboard hints on touch | Fine pointer only | N212 |
| B23 | S3 | Settings › Tutor · F228 | Duplicate "Teaching style" label | Remove | N211 |
| B24 | S3 | Cards no results · F131 | Two "Clear filters" | One | N211 |
| U1 | S1 | Today · all variants | Recommendation buried | §4.1 | N205 |
| U2 | S2 | Tasks | Only under Calendar | Today chips + Calendar | N205 |
| U3 | S2 | Progress | Time tab duplicates Overview; Goals buried | §4.8 | N215 |
| U4 | S3 | Tasks and Cards filters · F048, F129–F130 | A sheet for 3–4 chips | Inline chips or one Filter sheet | N209 |
| U5 | S2 | Calendar | Two block editors, 5 selects | One editor | N214 |
| U6 | S3 | Pad · F283 | Outside the app shell | Shell + Back | N211 |
| U7 | S2 | Tutor | Protocol controls in the main flow | §4.3.9 | N207 |
| U8 | S2 | Atlas · F173, F180–F183 | Two Map controls; empty Themes and Bridges tabs | §4.2 | N206 |
| U9 | S3 | Search · F013 | Dead-end no-results | Search that creates | N212 |
| U10 | S2 | Weekday minutes · F016 | 7 numeric inputs | Capacity painter | N213 |
| E1–E9 | S2 | Empty states · E080–E107 | Piles of empty parts | §4.7.1, §4.8, WP empty | N210 |
| W | S2 | All | Too many words | `COPY.md` (61 rows) | N212 |

---

## 8. Order of work

1. **Foundation (removes most of the "unfinished" look in one go):**
   - N202 lint gates;
   - N203 theme consolidation (legacy CSS out of v7, tutor on the kit, z-index scale, Dock and Sheet primitives, `/review/done`);
   - N204 kit rebuild of the adaptive panels (+ diagnostics home).
2. **Headline redesigns** (independent files, can run in parallel):
   - N205 Today "Next step";
   - N206 Atlas map controls;
   - N207 Tutor conversation-first + presence;
   - N209 one bottom bar + docked actions;
   - N214 Calendar compact day.
3. **Then:**
   - N208 tutor scratch pad + photos via MCP (migration review required);
   - N213 ruler picker + capacity painter;
   - N215 Progress reorganisation;
   - N210 empty states;
   - N211 correctness sweep;
   - N212 copy.
4. **Finish:** N216 beauty pass and the Owner's eye test, using `npm run audit:ui` before/after and the mockups as the target.

Each phase ends with `npm run audit:ui`. Compare `manifest.json` facts with `metrics.csv` (chrome, words, offFonts, offSizes, native, overlaps, picture) and put the new sheets next to `before-after/`.
