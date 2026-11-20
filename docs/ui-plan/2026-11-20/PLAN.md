# Lemma UI plan: focus, fewer words, no layout bugs (phone, night)

Date 2026-11-20 · source commit `24c8a22` (main) · evidence: 492 captures from `npm run audit:ui` (F### = populated account, E### = empty account; see `audit-INDEX.md`), DOM measurements per frame (`METRICS.md`, `metrics.csv`), and the Lemma Pad chat page the Owner liked (`evidence/liked-*.png`).

The Owner asked for: fewer words; an Atlas that is in focus, not tiny and not overlapping; more room for content on many pages; a tutor chat with a larger conversation area, like the attached Lemma Pad page; and scratch-pad drawings that reach the tutor through MCP. This plan covers those, plus every layout bug the audit found. Ready-to-paste NEXT.md items are in `NEXT-ITEMS.md`, and the before → after text is in `COPY.md`.

---

## 0. What is wrong, in one page

1. **One file makes most screens look unfinished.** `src/features/adaptive/AtlasPanels.tsx` (101 lines) renders panels on eight screens: the Today plan card ("Checks → Learn → Practice → Close"), Calendar "Suggested study times", Path "Plan estimates", Session "Recent attempts", Checkpoint "Ready", Inbox "Atlas links", Settings › Planning "Atlas", and the Atlas tab row and filters. Its styles (`src/ui/v7/atlas-values.css`) bypass the v7 kit in five ways:
   - legacy `Newsreader` headings instead of `Lemma v7 Newsreader`, at an off-scale 17.6px;
   - native `<details>`, tables and checkboxes;
   - raw `toLocaleString` dates ("12/11/2026, 6:00:00 pm");
   - developer strings ("Scheduling algorithm · New atlas-owner-2026-11-20.1 · 9/11/2026, 1:43:00 pm");
   - absolutely positioned panels over the Atlas map.

   Evidence: F005, F020, F071, F102, F120, F157, F173, F231.
2. **The Atlas is out of focus.**
   - At first paint all stars and labels sit in a band about 240px tall (y≈180–420, roughly 25% of the 844px screen) (F173).
   - 32% of the map canvas is under overlays: two stacked tab rows, a floating filter panel that is clipped and overlaps the Legend chip ("Stale ⟂ Legend"), the Legend popover, and the tab bar.
   - There are two "Map" controls (header `Map | List` and a second row `Map | Themes | Bridges`). With List selected, the second row still underlines "Map" (F183).
   - In List view a sticky filter block leaves only 500 of 844px for rows (F174), and the selected-concept peek sheet covers the list (F183–F186).
   - Labels are 12px; most stars are 3–4px dots.
3. **Too many words.** Helper sentences repeat what the screen already shows. The text also carries:
   - jargon: "No authorized task fits this window", "Conjecture · not started" on about 80 Atlas rows, "kept 0 of 0 recent";
   - desktop keyboard hints on a phone ("Keys: A or Right approves…");
   - sentences that state nothing: "0 checkpoints demonstrated in this range, most on Sun 11 Oct – Sat 17 Oct" (E096).
4. **The reading area shrinks for avoidable reasons.**
   - Detail pages stack an action bar on top of the tab bar, using 152px at the bottom (Checkpoint, Card, Session, Plan proposal: F114, F132, F120, F170).
   - Calendar Day stacks the "Browse day" slider on the tab bar (144px, F067).
   - The floating "Continue with tutor" pill covers rows on Path, Sessions and the new empty path (F102–F106, E072).
   - Cards puts about 260px of header, tabs, search, chips and count above the first card (F125).
5. **Empty states pile up instead of guiding.** For example, Review in an empty account shows four separate things where one would do (E080–E081):
   - a "First card" CTA;
   - a "0 cards today" hero with two disabled buttons;
   - "No cards due" text;
   - an empty 14-day chart and three dashed stat tiles.

   Progress shows empty grids and charts (E090–E098), Practice is a bare paragraph (E107), and Week is an empty sparkline (E103).
6. **Concrete layout bugs:**
   - the offline banner covers the Today title (F296);
   - first-card form fields are half the sheet width (E032–E033);
   - the card editor's maths key row is clipped (F135);
   - Path "Plan estimates" prints eight unlabeled ranges ("15–193 min, 15–618 min…") (F102);
   - Not found says the same thing twice (F004);
   - "Continue with tutor" on a new path dead-ends (F101, E073);
   - Session says "No attempts yet" beside four attempts (F120);
   - the Week chart has no labels (F205);
   - at 130% text the tab bar hides every label but the active one (F298).
7. **The tutor chat does not give the conversation the screen, and has no scratch pad.**
   - It already has the liked design's skeleton (step rail, composer, tool row, custom keyboard).
   - Before "Begin session" the conversation area is a 470px hero card.
   - With the keyboard open it gets 404px. With the keyboard hidden it gets 622px, minus a separate 48px "Show keyboard" bar.
   - There is no Scratch tool. The MCP server can only return text (`supabase/functions/mcp/server.ts:41`), so no drawing can reach the tutor.

---

## 1. Principles (every screen, enforced by lint where possible)

- **P1 Content first.** At first paint the screen's main content starts within 140px of the top. Fixed chrome stays within budget: hub screens ≤ 132px (52px header + 80px tab bar); detail screens ≤ 136px (56px header + 80px action bar). No sticky block may hold more than one 48px control row.
- **P2 One bottom bar.** A screen has either the tab bar or its own action bar, never both stacked. Detail pages (Checkpoint, Card, Session, Plan proposal, Tutor, Focus, Close the day) hide the tab bar; Back is in the header.
- **P3 Fewer words.**
  - Title ≤ 4 words; helper text at most one sentence of ≤ 12 words.
  - Never restate a number that is already visible.
  - No internal terms (authorized, window, conjecture, facet, generation, stale, utility, quota).
  - No IDs, versions, raw dates or times. Use one formatter: "Thu 12 Nov · 18:00".
  - Keyboard hints only under `(pointer: fine)`.
  - Instructional hints ("Swipe right for Good…", "Try: Rudin ch 4…") show for the first 3 uses only.
- **P4 Kit only.**
  - Font families: `Lemma v7 *` (or KaTeX) only.
  - Sizes: the v7 scale only (12, 14, 16, 17, 19, 20, 26, 28, 32, 44, 64px at 100% text).
  - No visible native `details`, `select`, `date`, `time` or `range` controls; use the kit's Disclosure row, Select sheet, time field and RulerSlider.
- **P5 One empty state per screen.** EmptyMoment (illustration, one line, one primary action). Hide filters, sort chips, charts, stat tiles and disabled buttons while there is no data.
- **P6 Nothing floats over content without reserving space.** Overlays never cover the thing you are acting on; pinned bars pad the scroll area so the last item can scroll clear.
- **P7 Same action, same name, same place.** "Continue with tutor" is the primary button in the bottom action bar on Path, Checkpoint and Session. It replaces "Work on this with your tutor", "Start another session" and the floating pill.
- **P8 Beauty through restraint.**
  - Fewer boxes: sections are a heading plus rows with dividers. Cards are reserved for the hero and for interactive objects.
  - One section-title style per level: serif "subhead" for sections, caps "eyebrow" only for metadata.
  - Subject colour always paired with its glyph.
  - Charts labelled minimally and hidden when empty.

---

## 2. Work packages (in delivery order)

Each package lists the problem (with frames), the changes, the files involved, a measurable Done and the tests. The measurements come from the audit tool (`scripts/ui-audit/lib.mjs` `pageFacts`), so "Done" can be checked by re-running `npm run audit:ui` and reading `manifest.json`.

### WP0 Gates first: extend the project's own design lint

- **Why:** the v7 design lint (`tests/e2e/v7-design-lint.spec.ts`, scenes in `tests/e2e/v7-scenes.ts`) passes today because its scenes never open the screens where the problems are, and it checks neither font families nor sizes.
- **Change:**
  - Add scenes: Atlas list and the selected concept, Path, Path → tutor, Checkpoint, Session, Calendar month and agenda, Settings › Planning, Tutor chat (start and after Begin), Review empty, Progress empty, and the offline banner.
  - Add rules, failing per scene:
    - (a) computed font family not `Lemma v7*` or `KaTeX*`;
    - (b) font size off the v7 scale;
    - (c) a visible `details > summary`;
    - (d) flow text overlapping flow text (the audit's `overlaps`, ignoring inline wrap);
    - (e) fixed chrome above budget (P1);
    - (f) raw date pattern `\d{1,2}/\d{1,2}/\d{4}` or a version-like token `[a-z]+-\d{4}-\d{2}-\d{2}\.\d` in visible text.
  - Rules start as an explicit allowlist of the current failures (the list in §3) so CI stays green. Each package below deletes its allowlist lines.
- **Done:** the rules exist, run in fast-gate, and the allowlist equals the findings in this plan.
- **Note:** adding tests is allowed; never loosen an existing threshold (AGENTS.md).

### WP1 Rebuild the adaptive (Atlas) panels with the v7 kit: highest leverage

- **Problem:** see §0.1. These eight panels are the "ugly" parts of eight screens.
- **Changes** (one component each, kit primitives only; delete `.v7-atlas-panel` styling):
  1. **Today › "Checks → Learn → Practice → Close" → "Today's plan".**
     - Four step chips: Checks · Learn · Practice · Close, with done/now state.
     - One "Next" row (title, time, a Start button).
     - When there is no study time: one row, "Set your study time", that opens the WeekdayCapacity sheet.
     - Remove "Decision details" and the algorithm/version string from the UI; keep them in `export`/diagnostics only.
     - Replace "No authorized task fits this window" with "Nothing fits before your next block".
     - Evidence: F005, F020, E005.
  2. **Calendar › "Suggested study times" → "Good times to study".**
     - Two rows: "Thu 12 Nov · 18:00 · 60 min" with an "Add" button.
     - No helper paragraph.
     - "Usually kept 3 of 4" only when there are ≥ 3 data points.
     - Hide the section on accounts without history.
     - Evidence: F067, F071, E054.
  3. **Path › "Plan estimates" → one line under the progress bar.** "About 29 h of work · no weekly time set" with a "Set time" link. The eight unlabeled ranges either show inside each stage header ("Foundations · 3 of 3 · ~4 h") or are removed. Evidence: F102.
  4. **Session › "Recent attempts".** Remove it: the session timeline already lists the attempts, and the panel contradicts it. Evidence: F120.
  5. **Checkpoint › "Ready".** Fold into the existing "Next recheck" row as "Recheck: not ready yet" or "Ready to recheck". Evidence: F115.
  6. **Inbox › "Atlas links" → "Suggested links".**
     - Each link is one row: "Metric spaces ↔ Open sets", a one-line reason, Approve and Reject.
     - Group actions only when there are ≥ 2 links.
     - No percentage, no "analogous · 1".
     - Evidence: F157, F159.
  7. **Settings › Planning › "Atlas"** (six raw parameters, a native checkbox and its own Save button) moves to Settings › Study and review › Advanced › "Atlas tuning". Use plain labels and ranges, and the same auto-saving rows as the rest of Settings. Evidence: F231.
  8. **Atlas `AtlasExplore` and `AtlasFilters`:** replaced in WP2.
- **Files:**
  - `src/features/adaptive/AtlasPanels.tsx`, split into `src/features/adaptive/panels/*.tsx`;
  - `src/ui/v7/atlas-values.css`;
  - consumers: `home/v7/V7Today.tsx`, `calendar/v7/V7CalendarDay.tsx`, `project/v7/V7Path.tsx`, `session/v7/SessionV7.tsx`, `checkpoint/v7/CheckpointV7.tsx`, `proposals/v7/InboxV7.tsx`, `settings/v7/SettingsV7.tsx`, `settings/v7/SettingsLists.tsx`.
- **Done:**
  - the audit shows `offFonts` and `offSizes` empty, and `native` without `details`, on Today, Calendar Day/Week/Month, Path, Session, Checkpoint, Inbox and Settings › Planning;
  - no visible raw date or version strings;
  - word count in the first viewport: Today ≤ 60 (now 89), Path ≤ 60 (now 94).
- **Tests:** unit tests per panel (formatting, hidden-when-empty); lint rules (a)–(c) and (f) on those scenes; the existing `tests/unit/adaptive` and `atlas` tests stay green.

### WP2 Atlas focus mode

- **Problem:** see §0.2. Evidence: F173–F186, E086.
- **Changes:**
  1. **One header row:** back · "Atlas" · `Map | List` · search · filter (badge with the active-filter count). Delete the second tab row (`AtlasExplore`, `.v7-atlas-explore{position:absolute; inset:74px 12px auto}`).
     - **Themes** becomes a "Group by: Subject / Theme" switch inside List. Hide it while there are no themes ("Themes · No themes yet", F180).
     - **Bridges** becomes a List filter ("Links across subjects"). Hide it while every bridge has 0 uses (F181).
  2. **Filters and legend go into one bottom sheet** opened from the filter button:
     - Show: All · Uncertain · Gaps · Certified;
     - Kind;
     - Stale;
     - Key (the legend).
     - Delete `.v7-atlas-filters-floating` (absolute, over the map) and the sticky `.v7-atlas-list>.v7-atlas-filters` (List chrome is 264px today).
  3. **The map fills the space between the header and the tab bar** (a 708px canvas).
     - The camera fit uses the unobstructed rect (header, tab bar, open peek sheet) plus 16px of padding.
     - First view = the constellation of the current checkpoint (`clusterCamera` already exists in `scene.ts`). The whole sky is one tap away: "Recentre" toggles Here ↔ All.
     - Today's `fitCamera` starts at zoom 0.45 for three clusters, which is what makes it tiny.
  4. **Legibility:**
     - star radius ≥ 4px (≥ 7px for in progress, up next or due); tap radius 22px;
     - labels 13px (selected 16px) with a 3px page-coloured halo, so edges never cross the text;
     - labels at first view: every in-progress, up-next and due star, then the top 3 per cluster, using the existing four-position collision test;
     - cluster names stay 12px spaced caps.
  5. **Selection:**
     - The peek sheet is ≤ 112px: name, state badge, "9 due · Review" and "Open".
     - The camera pans so the selected star sits above the sheet.
     - In List, tapping a row opens the expanded concept sheet; there is no peek over the list.
     - The "Review 9" chip that sits loose under a row (F184) moves into the row as a trailing "9 due".
  6. **List rows:**
     - The state glyph replaces the repeated text "Conjecture · not started · Analysis".
     - The meta line appears only when informative (in progress, due, recheck).
     - Rows are grouped by subject under sticky 32px subject headers.
  7. **Empty account (E086):** the CTA is "Start a path" while there is no path; "New concept" appears only once a path exists.
- **Files:**
  - `src/features/atlas/v7/AtlasV7.tsx`, `AtlasMap.tsx`, `scene.ts` (fit, cluster camera, label pass), `atlas.css`;
  - `src/features/adaptive/AtlasPanels.tsx` (`AtlasExplore`, `AtlasFilters`, `ConceptFacets`);
  - `src/ui/v7/atlas-values.css`.
- **Done (audit facts on `atlas-map`, `atlas-list`, `atlas-select`):**
  - map `picture.unobstructed` ≥ 92% (now 68%);
  - drawn content ≥ 60% of the visible map area at first paint (pixel check as in `METRICS.md`; now ≈ 25% of the screen);
  - List chrome ≤ 132px (now 264px);
  - `overlaps` = 0;
  - labels ≥ 13px;
  - exactly one control named "Map".
- **Tests:**
  - unit: `fitCamera`/`clusterCamera` with insets; label halo and collision; filter sheet state;
  - e2e: first-view zoom ≥ 0.9 on the demo; filter sheet round trip; List row opens the concept; no overlap facts.

### WP3 Tutor chat: give the conversation the screen (the liked Lemma Pad layout)

- **Reference:** `evidence/compare-tutor-chat.jpg` puts the liked page (chat with keyboard, scratch pad) next to F281, F282 and F283.
- **Problem:** see §0.7.
- **Changes:**
  1. **Header:** one 48px row: back · "Real Analysis · CP4 Compactness" (tap to switch checkpoint) · timer pill · ⋯ (Session parts, Latest question, Context, Connect). Use kit type; today's header uses legacy `Newsreader` and off-scale 13, 15 and 34px text (F281).
  2. **Rail:** the four-step rail (Checks · Learn · Practice · Close, 68px) shows only before the session begins, as in the liked page. After Begin it becomes a 4px progress hairline under the header.
  3. **Start state:**
     - Replace the 470px hero card (F281) with a compact "On the table" card of ≤ 140px: checkpoint name, the goal in one line, and Begin.
     - "Plan" and "Write a question" become chips under it.
     - Path-level entry without an approved checkpoint (F101, E073 "Approve a checkpoint in your plan…") shows "This path has no plan yet" with two actions, "Plan with your tutor" (copy prompt or open connector) and "Back to path". It is never a dead end.
  4. **Reading and writing modes:**
     - Hide the keyboard when a tutor reply arrives and when the learner scrolls the transcript up.
     - Show it when the composer is focused.
     - Delete the separate 48px "Show keyboard" bar (`TutorComposer.tsx:340`); the keyboard toggle becomes an icon in the tool row.
     - When scrolled away, pin the tutor's latest question as a slim "On the table" chip under the header (the liked page's `#onTable`).
  5. **Messages:**
     - Tutor text runs full width with no bubble, at the 17px reading size, with display maths centred.
     - Learner bubbles are right-aligned at ≤ 85% width.
     - System or demo notes ("Saved in this demo. Import a tutor reply to continue.", F282) become a single status line above the composer, not chat content.
  6. **Tool row** (same order as the liked page): Scratch · Hint n/4 · Stuck · Undo · Symbols · Keyboard. Context and Connect move into ⋯ once connected.
- **Files:** `src/features/tutor/TutorLayout.tsx` (rail, `nextup` hero), `TutorComposer.tsx` (`tbar`, `kb`, show/hide), `TutorChat.tsx`, `TutorPage.tsx` (path-level route), `DemoCheckpointTutor.tsx`, `tutor.css`.
- **Done (measured as in `METRICS.md`):**
  - conversation height ≥ 650px in reading mode (now 622 − 48) and ≥ 420px in writing mode (now 404);
  - the start card is ≤ 140px;
  - no off-system fonts or off-scale sizes on `tutor-chat`;
  - path-level entry with no approved checkpoint shows the plan-with-tutor state.
- **Tests:**
  - e2e: reading/writing mode switch; scroll up hides the keyboard; the "On the table" chip appears; path-level entry state;
  - the existing `v7-tutor-*` specs stay green.

### WP4 Scratch pad in the tutor chat, and drawings shared with the tutor through MCP

**Goal:** the learner draws working (a diagram, a proof sketch, an equation) under the question. The drawing is attached to the answer, and the connected tutor reads it as an image in `get(what=tutor_turn)`, the same way it reads the text.

1. **One ink engine.**
   - Extract `InkSurface` (pointer events, pressure, pen/eraser/hand, undo/redo, two-finger scroll, dot grid, stroke JSON) from `src/features/pad/padInk.ts` + `LocalPadInk.tsx` and the Review "Scratch paper" (`src/features/review-run/v7/ScratchPad.tsx`).
   - Review, Pad and Tutor all use it; delete the duplicates.
2. **Scratch in the tutor (UI).**
   - "Scratch" in the tool row swaps the keyboard area for the pad at the same height, with an expand control (↑) to about 70% of the screen. This matches the liked page (`evidence/liked-scratch-pad.jpg`).
   - Tools: Keys · Pen (3 widths, ink and accent) · Eraser · Hand · Undo · Clear · Expand.
   - An "Attach" toggle turns on with the first stroke.
   - A thumbnail chip with × sits in the composer.
   - Send is allowed with an empty text and a drawing ("See my drawing").
   - The sent message shows the thumbnail; tapping it opens a full-screen viewer with pinch zoom.
   - Upload states are shown (progress, failed → Retry).
   - Drafts keep the strokes per account and checkpoint, like text drafts.
3. **Export.**
   - Crop to the ink bounds plus 16px.
   - White background, dark ink (best for the model to read).
   - Longest side ≤ 1200px; PNG; downscale until ≤ 600 KB.
   - Keep the stroke JSON (≤ 200 KB) for re-editing.
   - At most 3 images per turn.
   - Optional photo (camera or gallery) through the same pipeline, re-encoded on a canvas to strip EXIF.
4. **Storage and schema.** One additive migration, which needs review because it touches `supabase/**`:
   - **Bucket `tutor-ink`:** private, `file_size_limit` 1 MB, PNG, WebP or JPEG. Owner-folder policies (`(storage.foldername(name))[1] = auth.uid()::text`) for select and insert, like `sources` in `20261029164332_lemma_storage.sql`.
   - **Table `public.tutor_turn_attachments`:**
     - columns: `id uuid pk`, `user_id`, `thread_id`, `turn_id null` (until bound), `storage_path`, `mime`, `bytes`, `width`, `height`, `sha256`, `kind ('ink'|'photo')`, `strokes jsonb null`, `created_at`;
     - foreign keys to `tutor_threads` and `tutor_turns` `on delete cascade`;
     - RLS: owner select;
     - `revoke insert, update, delete, truncate … from anon, authenticated` (bug #1094 rule).
   - **Send command:** the existing learner-turn owner command accepts `attachments: uuid[]` (≤ 3), checks ownership, size, MIME, magic bytes and dimensions, and binds them to the turn in the same transaction. It follows the provenance rule for command functions (bug #1051).
   - **Cleanup:** unbound uploads older than 24 h are purged.
   - Attachments are included in Settings › Data and account › backup, and deleted with the thread, the turn or the account.
5. **MCP.**
   - **`get({what:"tutor_turn"})`:**
     - The JSON gains `attachments: [{id, kind, width, height, bytes}]`.
     - The tool result returns the text block **plus one MCP image content block per attachment**: `{type:"image", data:<base64>, mimeType:"image/png"}`. The connector downloads each image with the service role after the same grant check as the turn, capped at 3 images × 1 MB.
     - This needs `TutorConnector.read` to return `{text, images}` and `server.ts` (now text-only at lines 39–41) to build a mixed content array.
   - **`get({what:"tutor_attachment", id})`:** a new read that re-fetches one image for a later turn.
   - **Instructions:** "If the learner attached a drawing, read it first and say in one line what you see, then give feedback."
   - **Optional `study` transcription:** a `tutor_turns` reply patch `attachmentNotes:[{id,text}]` stores what the tutor read, so later turns and history use text and do not resend images.
   - **Open question for the Owner:** hosts that cannot take image content in tool results. Proposal: no signed URLs in model context; return the text with "1 drawing attached (open Lemma to view)".
6. **Limits and safety:** owner-only everywhere; no images in notifications or push payloads; server-side validation before binding; a per-day upload cap (e.g. 60 images).
7. **Offline:** the drawing is saved locally (IndexedDB, per account) and uploaded on reconnect. The message stays in the "waiting to send" state already used for text.

- **Flag:** `tutorScratch` (Build stage, default off). The MCP part ships with the migration and is inert without attachments.
- **Files:**
  - `src/features/pad/padInk.ts`, `LocalPadInk.tsx`, `src/features/review-run/v7/ScratchPad.tsx` → `src/ui/v7/ink/*`;
  - `src/features/tutor/*`, `src/data/tutor/*`;
  - `supabase/migrations/<new>_tutor_ink.sql`;
  - `supabase/functions/mcp/tutor-connector.ts`, `server.ts`, `tools/read.ts`, `rules.ts`;
  - `docs/current/<id>.md`.
- **Done:**
  - In the demo: draw → attach → send shows the thumbnail in the transcript; the draft survives a reload; offline send is queued.
  - Live: the MCP selftest shows `get(tutor_turn)` returning one `image/png` content block ≤ 1 MB for an attached drawing, and none without a grant.
  - RLS: owner A cannot read or bind owner B's attachment.
- **Tests:**
  - unit: crop/scale/size cap; stroke JSON round trip; attachment limits;
  - e2e: draw, attach, remove, send, viewer, offline queue;
  - SQL: RLS isolation, bind in the same transaction as the turn, purge of unbound uploads, additive-migration check;
  - MCP selftest: image content, grant required, cap enforced.

### WP5 Copy diet

- **Change:** apply `COPY.md` (49 rows, before → after) and principle P3.
- **Shared code to add:** one date/time formatter used everywhere (`src/lib/format.ts`), a `<FirstUseHint id>` that hides after 3 uses, and a `(pointer: fine)` guard for keyboard hints.
- **Done:** first-viewport word counts at or under the budgets in `METRICS.md` (Today ≤ 60, Path ≤ 60, Checkpoint ≤ 60, Calendar Month ≤ 60, Progress ≤ 50, Capture sheet ≤ 25 inside the sheet); lint rule (f) clean.
- **Tests:** unit tests for the formatter and FirstUseHint; snapshot of the visible strings per scene (the audit text dump) committed as a fixture.

### WP6 One bottom bar, docked tutor action, less chrome

1. **Detail pages hide the tab bar** and dock their action bar (≤ 80px): Checkpoint, Card, Session, Plan proposal, Tutor, Focus, Close the day. This saves 72px (F114, F132, F120, F170). ⋯ moves into the header.
2. **Path page:**
   - The floating "Continue with tutor" pill (`V7Path.tsx`) becomes the action-bar primary, with "Review 14" as secondary (it moves from the header pill).
   - Remove the inline "Continue · Compactness" button: two "Continue"s is one too many (F102).
   - Content can no longer be covered (E072: the pill sits on the empty-state text).
3. **Calendar Day:** the "Browse day" slider (64px, F067) appears only on demand (the clock chip in the header), or merges into the header. Day chrome then ≤ 132px.
4. **Library hub (Paths / Cards / Atlas):**
   - The title follows the tab ("Cards" shows h1 "Paths" today, F125).
   - Search becomes an icon in the header; the four filter chips become one "Filter" chip row; the "90 cards · 23 due" count moves into the row.
   - First card at ≤ 180px from the top (now ≈ 260px).
5. **Sheets:**
   - A focused field always scrolls above the sheet footer and the keyboard.
   - A 24px fade above sticky footers.
   - Footers carry at most 2 actions.
6. **Offline banner:** in flow below the header, pushing content down, using the kit Banner (F296).

- **Files:** `src/app/v7/V7Shell.tsx` (tab bar visibility per route), `shell.css`, `responsive.css`, `src/features/project/v7/V7Path.tsx`, `checkpoint/v7/CheckpointV7.tsx`, `card/*`, `session/v7/SessionV7.tsx`, `plan-proposal/*`, `calendar/v7/*`, `projects/v7/PathsV7.tsx`, `cards/v7/*`, `src/app/OfflineBanner.tsx`.
- **Done:** audit chrome on hubs ≤ 132px and on detail pages ≤ 136px (Checkpoint, Card, Session and Plan proposal are 204px today: 52 + 152); no floating CTA overlapping text (`overlaps` = 0 on Path scenes); offline banner frame shows the full title.

### WP7 Empty states: one per screen

| Screen | Now | After |
|---|---|---|
| Review (E080–E081) | First-card CTA, a 0-card hero with disabled Start and Customise, "No cards due…", an empty 14-day chart, dashed tiles | EmptyMoment "No cards yet" + "Create your first card" (opens the first-card form); nothing else until the first review |
| Cards (E076) | Search, 4 filter chips, "0 cards", "First card" | EmptyMoment "Your cards live here" + "Create a card"; no filters |
| Progress (E090–E098) | Empty almanac grid, empty charts, "0 checkpoints … most on Sun 11 Oct" | One EmptyMoment per tab ("Your first focus session shows here" + "Start focus"); fix `src/ui/v7/Chart.tsx` summaries for zero data |
| Practice (E107) | A paragraph | EmptyMoment + "Ask your tutor for a practice topic" (copies the prompt) |
| Week (E103 and F205) | Empty sparkline; with data, 3 unlabeled dots | EmptyMoment; with data, a 7-day bar chart with day labels and totals |
| Calendar Month and Agenda (E054, E056) | Suggestions with "kept 0 of 0"; "Nothing planned · Add" repeated per range | Hide suggestions without history; merge consecutive empty days ("Nothing planned Tue–Thu · Add") |
| Atlas (E086) | "New concept" with no path | "Start a path" when there is no path |
| Today (E005–E006) | Hero "Start your first path" + plan card "Set weekday minutes" + "Three ways to begin" | Hero + a 3-step checklist (start a path · connect tutor · add a study block), each with done ticks; no plan card until a path exists |
| New path (E068–E073) | "Your tutor fills this in.", "Plan estimates · 0 min", tabs with 0 counts, floating CTA over "A plan is waiting…" | One card "Plan this path with your tutor" with Copy prompt / Open connector; tabs hidden until there is content |

- **Done:** the audit's empty profile shows one EmptyMoment per screen, with no disabled primary buttons and no empty charts.
- **Tests:** unit tests for each EmptyMoment condition; e2e `?demo=first-use` per screen.

### WP8 Layout bug sweep (each a small PR, or one item)

| # | Bug | Evidence | Fix |
|---|---|---|---|
| 1 | Offline banner covers the H1 | F296 | WP6.6 |
| 2 | First-card form fields half width | E032–E033, `cards/v7/FirstCardPanel.tsx` | Full-width kit fields |
| 3 | Card editor maths key row clipped at the right | F135 | Horizontal scroll with an edge fade, or 2 rows |
| 4 | Raw date "12/11/2026, 6:00:00 pm" | F071, `AtlasPanels.tsx:81` | Shared formatter |
| 5 | Atlas "Stale" ⟂ "Legend" overlap; legend over filters | F173, F179 | WP2 |
| 6 | Two "Map" controls; List active but "Map" underlined | F183 | WP2.1 |
| 7 | Path "Plan estimates": eight unlabeled ranges | F102 | WP1.3 |
| 8 | Not found repeats itself (title + card) | F004 | Title "Page not found" + one line + Go to Today |
| 9 | Path → tutor dead end | F101, E073 | WP3.3 |
| 10 | Session "No attempts yet" next to 4 attempts | F120 | WP1.4 |
| 11 | Inbox keyboard hints on a phone | F157 | P3 guard |
| 12 | Inbox list: disabled "Reject 0 / Approve 0" footer always shown | F159 | Show only with a selection |
| 13 | "1 h 35 min more than the 30 days before" when the previous total is 0 | F187 | "Your first month" |
| 14 | Checkpoint "Ready / Compactness — · not yet" | F115 | WP1.5 |
| 15 | Developer string in Today "Decision details" | F020 | WP1.1 |
| 16 | Settings › Planning raw model parameters + extra Save | F231 | WP1.7 |
| 17 | 130% text: tab bar labels hidden except the active one | F298 | Owner decision: keep icons-only with a visible active label, or a 2-row tab bar at ≥ 120% text |
| 18 | Focus: "too short to save" banner and "Nothing to log yet" sheet say the same thing | earlier focus frames (F207–F216) | Keep the sheet only |
| 19 | Capture: a sentence with a time and length silently becomes a Time block | F026 | Animate the type chip and say "Adds a time block" in the footer |
| 20 | Native `details` on Today, Tasks (Cancelled), Checkpoint (What counts), Review done (Menu), Inbox (Why this card?), Atlas Themes, Practice (Archived) | see `METRICS.md` | Kit Disclosure row |
| 21 | Native `select` in Settings › Study (focus mode) and Pad (Choose a path) | F242–F250, F283 | Kit Select sheet |

### WP9 Beauty pass (after WP1–WP8; small, visible changes)

1. **Fewer boxes.** Today shows 5 bordered cards in one screen. Keep the hero card; turn "Today", "Needs you" and "Continue" into sections (subhead + rows) with dividers. Same for Review hub, Progress and Settings detail pages.
2. **One section-title style:** serif subhead 20px for sections ("Due each day", "Memory", "Decks", "Evidence"); caps eyebrow 12px only for metadata labels.
3. **Rhythm:** 8px spacing grid; 16px gutters; 24px between sections; 12px inside rows. Remove ad-hoc margins in `atlas-values.css` and `tutor.css`.
4. **Subject identity:** always glyph + colour, never colour alone (lists, chips, charts); use the emblem art (Paths list) only in the Path header and Paths list.
5. **Charts:** at most 3 y-axis labels; units in the title; no chart without data; colours from subjects only where the chart is about subjects (kit rule).
6. **Motion:** keep sheet and tab transitions; add a 150ms cross-fade for empty → content.

- **Done:** an Owner eye test on before/after sheets for Today, Path, Checkpoint, Review, Atlas and Tutor.

---

## 3. Screen-by-screen checklist (what changes where)

| Screen (scene) | Changes |
|---|---|
| Today (`today`, F005–F007; E005–E006) | WP1.1 plan card; drop the subtitle that restates the hero ("Next block in 1 h 17 min. 23 cards due and 1 thing overdue."); sections not cards (WP9.1); empty checklist (WP7) |
| Search sheet (`today-search`) | OK; keep |
| Capture sheet (`capture-*`, F025–F044) | Hint on first uses only; no "Unavailable ·" prefix (a disabled button plus placeholder is enough); explicit type switch (WP8.19) |
| Tasks (`tasks-*`, F045–F066) | "Tasks, deadlines and practice · Triage" → "1 overdue · Review"; Cancelled list as a kit Disclosure row |
| Calendar (`calendar-*`, F067–F086) | WP1.2; WP6.3; Agenda merges empty days; Month legend behind an (i) |
| Paths list (`paths-*`) | OK; small targets on chips and "⋯" (10 under 40px in F087): 44px hit areas |
| Path (`path-map`, `path-tabs`, F102–F113) | WP1.3; WP6.2; tabs are sticky at 48px only after the header scrolls away |
| New path (`path-new*`, E068–E073) | WP7 row; WP3.3 |
| Checkpoint (`checkpoint*`, F114–F119) | WP6.1; WP1.5; "What counts" inline under the goal; "Work on this with your tutor" → "Continue with tutor" |
| Session (`session`, F120–F122) | WP1.4; "Start another session" → "Continue with tutor"; WP6.1 |
| Cards (`cards-*`, F125–F131) | WP6.4 |
| Card (`card-*`, F132–F137) | WP6.1; History collapses to the last 5 + "Show all"; WP8.3 editor |
| Review hub and round (`review-*`, F139–F156) | Chart subtitle "90 due in 14 days"; swipe hint first uses only; "How sure are you? Optional" → "How sure?"; empty state WP7 |
| Inbox and Plan proposal (`inbox-*`, F157–F172) | WP1.6; WP8.11–12; plan list collapses unchanged checkpoints ("9 unchanged" disclosure) |
| Atlas (`atlas-*`, F173–F186) | WP2 |
| Progress, Log and Week (`insights*`, `time-log*`, `week`, F187–F205) | Remove repeated summary sentences (keep them for screen readers); WP8.13; Time tab duplicates Overview: fold "Focus by day" and "By subject" into Overview, keep Time for the log; WP7 Week |
| Focus (`focus-*`, F206–F217) | WP8.18; Break shows a break state |
| Close the day (`close-day`, F221–F223) | "Given and shown · 19 reviews answered today" → "Today · 19 reviews"; WP6.1 |
| Practice (`practice`, F220) | WP7 |
| Settings (`settings-*`, F224–F280) | WP1.7; WP8.21; subjects rows OK; Tutor connector URL in `Lemma v7 IBM Plex Mono` |
| Welcome and Sign-in (`welcome`, `sign-in`) | Welcome step 1: drop the paragraph, keep the 3 numbered steps; URL in kit mono |
| Not found (`not-found`) | WP8.8 |
| Tutor and Pad (`tutor-chat`, `pad`) | WP3, WP4; Pad intro "Notes and ink for a checkpoint. Saved on this device." and the kit Select for the path picker |

---

## 4. Order of work and stages

1. **Phase A (unblocks everything, low risk):** WP0 gates, then WP1 panels and WP8 bugs. These are visible on almost every screen.
2. **Phase B (the Owner's headline asks):** WP2 Atlas focus mode, WP3 tutor chat layout and WP6 bottom bars. They can run in parallel; different files.
3. **Phase C:** WP4 scratch pad + MCP images (Build stage behind `tutorScratch`; migration review required, `supabase/**`), WP5 copy diet, WP7 empty states.
4. **Phase D:** WP9 beauty pass, then the Owner's eye test.

After each phase, run `npm run audit:ui` and compare `manifest.json` facts (`offFonts`, `offSizes`, `native`, `overlaps`, `chrome`, `words`, `picture`) with `metrics.csv` from this plan. The audit tool lives at `scripts/ui-audit/`.

AGENTS.md mechanics:
- Each WP is one NEXT.md item (see `NEXT-ITEMS.md`), split only if it is clearly > 800 changed lines (WP4 is the likely candidate; its .1 must carry the end-to-end path: ink → upload → bind → MCP image).
- Copy changes ship with the screens they touch.
- New behaviour sits behind flags in Build: `tutorScratch`, and optionally `atlasFocus` and `tutorReading` if the Owner wants rollback switches.

## 5. Open decisions for the Owner

1. **Tab bar at ≥ 120% text** (WP8.17): icons-only with a visible active label (today), or a two-row tab bar?
2. **Themes and Bridges** (WP2.1): folding them into List (proposed), or keeping them as tabs inside List?
3. **Tutor images on hosts that cannot read image content** (WP4.5): text notice only (proposed), or a short-lived signed URL?
4. **Photos as well as drawings** in the tutor (WP4.3 optional)?
5. **Path "Plan estimates"** (WP1.3): show per-stage estimates in stage headers, or remove them?
