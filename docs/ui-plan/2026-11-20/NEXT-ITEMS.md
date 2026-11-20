# Proposed NEXT.md items v2 (ready to paste)

Format as in NEXT.md. Per AGENTS.md "Owner tasks given directly", the agent that adds them puts the Owner's words in the PR body after line 1 and places the items where the Owner says (top if unspecified). Stages are proposals; the priority run sets them. IDs assume N201 is the highest in use.

Owner's words:
- Owner task: "You are ui design expert go through already created ui images ( you can see the code) your job to create plan to fix ui bugs, improve usauablity, remove layout bugs, make it beautiful. I see many areas that could benefit with fewer words. I see atlas has many overlapping and manageable. I see the atlas is not in focus and very small view port and same goes for many pages in the app. The chat with tutor button open the chat chat had small area to cover keyboard is fine but I am attaching the ui of html that I liked too larger area dedicated to chat and missing scratchpad support of these images sharing via mcp."
- Owner decisions: "1. Stay icon only 2. Altas options to google controls need not to be visible all the time. 3. The photos and other things are to be shared via mcp. 4. Yes accept photos in form of drawings 5. Take a call yourself." and "Theme should be applied consistently and ease of use should be focus every page should have enought space for main content … The today page featured the recommendated next step and all this which is completely suppressed by ui implementation find creative way to deal with. Reorganization and complete redesign is fine as long as you build on current ui tokens."

Plan: `docs/ui-plan/2026-11-20/PLAN.md` (section numbers below). Targets: `mockups/png/*.png`. Findings register: PLAN §7.

---

## N202 Design-lint gates: kit fonts, type scale, native controls, overlaps, chrome, raw dates, fixed positioning

Stage: Harden (proposed) · Status: open · Needs: — · Assigned: —
Done = `tests/e2e/v7-design-lint.spec.ts` gains these rules:
- computed font family `Lemma v7*` or KaTeX;
- sizes on the v7 scale;
- no visible `details > summary`, `select` or time/date inputs;
- no flow-text overlap;
- fixed chrome ≤ 132px on hubs and ≤ 136px on detail pages;
- no visible raw date or version string;
- no `position: fixed` in feature CSS outside the Dock and Sheet primitives (a CSS scan).

Scenes are added for Atlas map/list/peek, Path, Path → tutor, Checkpoint, Session, Calendar Day/Week/Month/Agenda, Settings › Planning and Tutor, Tutor start and after Begin, Review empty and nothing-due, Progress empty, and offline. Current failures sit in an explicit allowlist that later items delete line by line.
Tests: each rule fails on a fixture page with the defect and passes on a clean one.
Scope: tests/e2e/v7-design-lint.spec.ts; tests/e2e/v7-scenes.ts; tests/e2e/helpers/**; docs/current/N202.md.
Not: Fixing the failures; Changing playwright.config.ts, CI or thresholds.

## N203 Theme consolidation: one kit under v7

Stage: Harden (proposed) · Status: open · Needs: N202 · Assigned: —
Done = Per PLAN §6:
- legacy rules in `src/styles/graph.css`, `themes.css` and `surfaces.css` no longer apply under `[data-v7]`; v7 headings use `--v7-serif`;
- `AppShell.tsx` stops importing v6 CSS under v7;
- direct `/review/done` renders the v7 screen;
- `tutor.css` uses type roles and kit Button, IconButton and Chip (documented keyboard exceptions only);
- z-index scale tokens and shared `Dock` and `Sheet` primitives exist, and feature CSS uses them.

The N202 font, scale and fixed-positioning allowlist entries for the touched scenes are deleted.
Tests: the lint rules pass on Today, Settings, Inbox, Focus, Tutor and Review done; unit tests for the Dock and Sheet primitives; the v6 rollback specs stay green with v7 off.
Scope: src/styles/**; src/app/AppShell.tsx; src/app/v7/**; src/ui/v7/**; src/features/tutor/tutor.css; src/features/review-done/**; tests/**; docs/current/N203.md.
Not: Visual redesign of screens (later items); Removing the v6 shell behind its flag.

## N204 Adaptive panels on the kit, and one home for diagnostics

Stage: Harden (proposed) · Status: open · Needs: N203 · Assigned: —
Done = Every panel of `src/features/adaptive/AtlasPanels.tsx` is rebuilt from kit parts and split into `panels/*`:
- Today's plan card is absorbed by N205;
- Calendar suggestions become ghost blocks (N214);
- Path estimates follow the Owner's estimate decision (PLAN §4.6);
- Session "Recent attempts" is removed;
- Checkpoint readiness folds into the recheck row;
- Inbox "Suggested links" are one row per link;
- model health, decision details, algorithm versions and Atlas tuning move to Settings › Advanced › Diagnostics.

No developer strings or diagnostics tables remain on Today, Progress, Session or Inbox.
Tests: unit tests per panel; lint passes on the consuming scenes; the existing adaptive tests stay green.
Scope: src/features/adaptive/**; src/ui/v7/atlas-values.css; consuming v7 screens; src/features/settings/v7/**; tests/**; docs/current/N204.md.
Not: Scheduler or model logic; MCP.

## N205 Today "Next step": the recommendation becomes the hero

Stage: Build (proposed; flag `todayNextStep`) · Status: open · Needs: N204 · Assigned: —
Done = Per PLAN §4.1 and `mockups/png/01-today-next-step.png`:
- **Hero:** the loop ribbon; Now from the scheduler decision with a primary per action kind; "Why this" sheet with plain reasons and the practice estimate; Then queue (next step + next fixed commitment).
- **"Time you have now" ruler:** writes a same-day capacity override, and the stack re-plans.
- **Hold kinds** map to helpful cards; raw reasons never print.
- **Below the hero:** Today strip with glance chips (overdue, due, to approve) opening their lists; Continue tiles.
- **Time of day:** evening and late-night variants.
- **First run:** the checklist screen (`09-today-first-run.png`).

First-viewport words ≤ 60; chrome ≤ 132px.
Tests: unit tests for the hold-kind mapping, the ruler → override → recommendation, and time-of-day copy; e2e for populated, empty, evening, night and running-session states.
Scope: src/features/home/v7/**; src/features/adaptive/**; src/data/adaptive/**; src/flags.ts; tests/**; docs/current/N205.md.
Not: Changing the scheduler's policy; New MCP tools.

## N206 Atlas with maps-app controls (Owner decision 2)

Stage: Harden (proposed) · Status: open · Needs: N204 · Assigned: —
Done = Per PLAN §4.2 and `02-atlas-map.png`, `03-atlas-layers.png`:
- **Map:** full-bleed; the first view is the current checkpoint's constellation; labels ≥ 13px with halos; stars ≥ 4px with 22px targets.
- **Controls:** floating search pill with the single Map/List switch; Layers and Recentre buttons that fade while panning; a Layers sheet with map type (Constellations/Themes/Bridges), show, kind, stale and key.
- **Navigation:** edge compass chips; a peek card ≤ 150px with Continue with tutor / Review / Expand.
- **List:** grouped by subject with glyph-only state and no sticky filter panel.
- **Empty:** "Start a path" when there is no path.

Audit: map unobstructed ≥ 92%, drawn content ≥ 60% of the visible map, List chrome ≤ 132px, zero overlaps.
Tests: unit tests for cameras with insets, labels and collision, and the controls' fade state; e2e for first view, layers round trip, compass fly-to and List row → concept.
Scope: src/features/atlas/v7/**; src/features/adaptive/AtlasPanels.tsx (AtlasExplore, AtlasFilters); src/ui/v7/atlas-values.css; tests/**; docs/current/N206.md.
Not: Atlas data or MCP.

## N207 Tutor chat: conversation first, presence, keep-listening

Stage: Harden (proposed) · Status: open · Needs: N203 · Assigned: —
Done = Per PLAN §4.3–4.4 and `04-tutor-reading.png`:
- **Layout:** 56px header with presence (Listening / Replying / Not listening + Copy prompt); hairline parts; pinned "On the table"; reading mode keeps the keyboard down until the field is focused; Keys tool instead of the 48px bar; full-width tutor text; ≤ 140px start card; protocol controls under ⋯ › Connection.
- **No dead end:** a path with no plan offers "Plan with your tutor".
- **MCP:**
  - `listener_seen_at` (additive column) is recorded on `tutor_next` and `tutor_turn` reads;
  - instructions tell the tutor to re-call `tutor_next` after a null for ~10 minutes unless the learner says stop;
  - each wait is ~25 s.

Conversation ≥ 590px in reading mode and ≥ 420px with the keyboard.
Tests: e2e for reading/writing modes, the pinned question, presence states and the path-level state; SQL test for presence isolation; MCP selftest for the keep-listening loop timing.
Scope: src/features/tutor/**; src/data/tutor/**; supabase/migrations/<new>_tutor_presence.sql; supabase/functions/mcp/tutor-connector.ts; tests/**; docs/current/N207.md.
Not: Images (N208); A server push channel to Claude.

## N208 Tutor scratch pad and photos, shared with the tutor through MCP (Owner decisions 3–4)

Stage: Build (proposed; flag `tutorScratch`) · Status: open · Needs: N207 · Assigned: —
Done = Per PLAN §4.3.7, §4.4.3–4 and `05-tutor-scratch.png`:
- **Ink engine:** one shared engine (extracted from Pad ink and Review scratch paper).
- **Scratch tool:** swaps the keyboard area for the pad. Photo adds a camera or gallery image (EXIF stripped by re-encode). The composer attachment chip appears with the first stroke; ≤ 3 images per answer; image-only answers allowed. The transcript thumbnail opens a viewer. Drafts and the offline queue keep strokes and images.
- **Migration (additive, review required):**
  - bucket `tutor-ink` with owner-folder policies;
  - table `tutor_turn_attachments` with RLS owner select and revoked browser writes;
  - the learner-turn command binds attachments in the same transaction;
  - unbound uploads purged after 24 h;
  - included in the backup.
- **MCP:** `get(tutor_turn)` returns text plus MCP image content blocks (≤ 1 MB each, grant-checked); `get(tutor_attachment)` re-fetches; no signed URLs in model context.

Tests:
- unit: crop/scale/size cap; stroke round trip; photo re-encode;
- e2e: draw, photo, remove, send, viewer, offline;
- SQL: RLS isolation, bind with the turn, purge, additive check;
- MCP selftest: image content with mimeType image/png or image/jpeg, grant required, cap enforced.

Scope: src/ui/v7/ink/**; src/features/pad/** (extraction); src/features/review-run/v7/ScratchPad.tsx; src/features/tutor/**; src/data/tutor/**; src/flags.ts; supabase/migrations/<new>_tutor_ink.sql; supabase/functions/mcp/{server.ts,tutor-connector.ts,tools/read.ts,rules.ts}; tests/**; docs/current/N208.md.
Not: Handwriting recognition (N200); Images in notifications; Turning the flag on.
Split note: if > 800 lines, N208.1 carries ink → upload → bind → MCP image end to end.

## N209 One bottom bar, docked actions, roomy hubs

Stage: Harden (proposed) · Status: open · Needs: N203 · Assigned: —
Done = Per PLAN §2, §4.6 and §4.9:
- **Detail pages** (Path, Checkpoint, Card, Session, Plan proposal, Tutor, Focus, Close the day) hide the tab bar and dock their action bar. Path: "Continue with tutor" + "Review n"; the floating pill and the inline Continue button go.
- **Pinned elements:** the focus mini-player docks within the bar region; the offline banner sits in flow.
- **Library hub:** the title follows the tab; search moves into the header; one Filter chip/sheet for Cards and Tasks.

Audit chrome: hubs ≤ 132px, detail pages ≤ 136px; zero overlaps on Path scenes.
Tests: e2e for tab-bar visibility per route, back navigation from each detail page, docked bars, the offline banner and filter sheets; unit tests for the shell route map.
Scope: src/app/v7/**; src/app/OfflineBanner.tsx; v7 feature folders listed; tests/**; docs/current/N209.md.
Not: Desktop and tablet changes beyond keeping them working.

## N210 Empty states: one EmptyMoment per screen

Stage: Harden (proposed) · Status: open · Needs: N204 · Assigned: —
Done = Per PLAN §4.7.1, §4.8 and the §7 E rows:
- Review (empty and nothing-due), Cards, Progress (each tab), Practice, Week, Calendar suggestions, Atlas, the new path, and Paths Paused/Done/Archived (no CTA) each show one line + one action.
- No disabled primary buttons, empty charts, filters or stat tiles without data.
- `src/ui/v7/Chart.tsx` summaries are correct for zero data.

Tests: unit tests per condition; e2e `?demo=first-use` per screen.
Scope: affected v7 feature folders; src/ui/v7/EmptyMoment.tsx; src/ui/v7/Chart.tsx; tests/**; docs/current/N210.md.
Not: Onboarding logic beyond CTA targets.

## N211 Correctness and layout sweep

Stage: Harden (proposed) · Status: open · Needs: — · Assigned: —
Done = PLAN §7 rows B1, B2, B3, B9, B10, B12, B13, B14, B16, B20, B23, B24, L8, L9, L10, L13, T7, T9, T10, T11 and U6 are fixed, each with a re-captured frame:
- one progress helper (step mismatch);
- "doesn't exist" states for path, checkpoint and card;
- delete with Undo;
- compact source rows;
- the Capture type announcement and the right editor;
- Inbox Edit and Focus Break verified;
- Settings tutor rows real or static;
- locked checkpoint copy;
- phantom deadline verified;
- duplicate labels and buttons removed;
- full-width first-card fields;
- unclipped key row;
- the review card never clipped and never jumping;
- the sentence-builder task form;
- kit replacements for native controls;
- 44px targets;
- the end mark;
- 12px tags;
- Pad in the shell.

Tests: a regression test per row that fails before its fix.
Scope: affected v7 folders and src/ui/v7/**; tests/**; docs/current/N211.md.
Not: Redesigns owned by N205–N209, N214, N215.

## N212 Copy diet and search that creates

Stage: Harden (proposed) · Status: open · Needs: N204 · Assigned: —
Done = `COPY.md` (61 rows) is applied, with:
- one date/time formatter;
- `FirstUseHint` (3 uses);
- keyboard hints for a fine pointer only;
- Search no-results offering "Add task" and "Ask your tutor".

First-viewport words: Today ≤ 60, Path ≤ 60, Checkpoint ≤ 60, Calendar Month ≤ 60, Progress ≤ 50, Capture sheet ≤ 25.
Tests: unit tests for the formatter and hint; a visible-strings fixture per scene; e2e for search-to-create.
Scope: src/lib/format.ts; src/ui/v7/**; affected feature folders; src/app/v7/SearchSheet.tsx; tests/**; docs/current/N212.md.
Not: Tutor and MCP instruction texts.

## N213 Ruler as the picker, and the capacity painter

Stage: Harden (proposed) · Status: open · Needs: N203 · Assigned: —
Done = Per PLAN §5:
- the Calendar's ruler is a kit component used for durations and times (time you have, block length and range, day starts/ends, preferred and reminder times, focus/break lengths, Add time), with spoken values and keyboard steps;
- the weekday-minutes sheet becomes the capacity painter (7 draggable bars, presets, honours week start).

Tests: unit tests for ruler value/step/accessibility and painter presets; e2e on each replaced control.
Scope: src/ui/v7/RulerSlider.tsx and new ruler pickers; src/features/adaptive/WeekdayCapacity.tsx; settings, calendar, time-log and focus forms; tests/**; docs/current/N213.md.
Not: Changing stored data shapes.

## N214 Calendar: compact header, ghost suggestions, one block editor

Stage: Harden (proposed) · Status: open · Needs: N204, N213 · Assigned: —
Done = Per PLAN §4.5 and `07-calendar-day.png`:
- date pill + view switch; the week strip collapses on scroll; one chip row;
- suggestions as ghost blocks with Add (no suggestions card in any view);
- busy as a hatched band with lanes for overlaps;
- "Browse day" on demand;
- one block editor (title, Study/Busy, date + ruler range, Path; More for checkpoint, task, status; Delete with confirm + Undo);
- Week grid ≤ 150px from the top; Agenda merges empty days; Month numbers and glyphs 14px.

Tests: unit tests for lane layout and ghost placement; e2e for add/accept suggestion, edit/delete with undo, and views.
Scope: src/features/calendar/**; src/app/calendarRoute.tsx; tests/**; docs/current/N214.md.
Not: Scheduling policy.

## N215 Progress reorganised: Overview, Learning, Log; goals within reach

Stage: Harden (proposed) · Status: open · Needs: N204 · Assigned: —
Done = Per PLAN §4.8:
- Time folds into Overview (Focus by day, By subject, Goals with Add/Edit);
- comparisons only with prior data;
- Learning drops the diagnostics (to Settings › Advanced);
- zero-data summaries are fixed;
- Log `?day=` scrolls and highlights;
- the Week digest becomes a labelled 7-day chart;
- Settings › Planning gains Goals;
- duplicate goal rows are checked.

Tests: unit tests for comparison rules, goals CRUD UI and summaries; e2e for tabs and the week digest.
Scope: src/features/insights/**; src/features/week/**; src/features/time-log/**; src/features/settings/v7/**; tests/**; docs/current/N215.md.
Not: Data model changes.

## N216 Beauty pass and the Owner's eye test

Stage: Harden (proposed) · Status: open · Needs: N205, N206, N207, N209, N210, N211, N212, N214, N215 · Assigned: —
Done = Per PLAN §2.8 and §5:
- sections instead of nested cards;
- one section-title style per level;
- 8px rhythm with 16px gutters;
- subject glyph plus colour everywhere;
- charts minimal and hidden when empty.

The `npm run audit:ui` before/after sheets for Today, Atlas, Tutor, Path, Calendar, Review, Progress and Settings are attached next to `docs/ui-plan/2026-11-20/mockups/png`, and the Owner approves them.
Tests: the N202 lint allowlist is empty; visual captures are attached.
Scope: src/ui/v7/**; v7 screen CSS; docs/current/N216.md.
Not: New features.
