# Proposed NEXT.md items (ready to paste)

These follow the NEXT.md item format. Per AGENTS.md "Owner tasks given directly", the agent that adds them puts the Owner's words in the PR body after line 1 and places the items where the Owner says (top if unspecified). Stages are proposals; the priority run sets them. IDs assume N201 is the highest in use; renumber if needed.

Owner's words for every item:
Owner task: "You are ui design expert go through already created ui images ( you can see the code) your job to create plan to fix ui bugs, improve usauablity, remove layout bugs, make it beautiful. I see many areas that could benefit with fewer words. I see atlas has many overlapping and manageable. I see the atlas is not in focus and very small view port and same goes for many pages in the app. The chat with tutor button open the chat chat had small area to cover keyboard is fine but I am attaching the ui of html that I liked too larger area dedicated to chat and missing scratchpad support of these images sharing via mcp."

Plan reference for every item: `docs/ui-plan/2026-11-20/PLAN.md` (the WP numbers below), with evidence frames from `npm run audit:ui`.

---

## N202 Design-lint gates for kit fonts, type scale, disclosures, overlaps, chrome and raw dates

Stage: Harden (proposed) · Status: open · Needs: — · Assigned: —
Done = `tests/e2e/v7-design-lint.spec.ts` gains these rules on new scenes (Atlas list and selection, Path, Path → tutor, Checkpoint, Session, Calendar month and agenda, Settings › Planning, Tutor start and after Begin, Review empty, Progress empty, offline banner):
- computed font family is `Lemma v7*` or KaTeX;
- font sizes are on the v7 scale;
- no visible `details > summary`;
- no flow-text overlap;
- fixed chrome within budget (hubs ≤ 132px, detail ≤ 136px);
- no visible raw date or version string.

Current failures are listed in an explicit allowlist that later items delete line by line (PLAN.md WP0). No existing threshold is loosened.
Tests: the new rules fail on a fixture page with each defect and pass on a clean one; fast-gate runs them.
Scope: tests/e2e/v7-design-lint.spec.ts; tests/e2e/v7-scenes.ts; tests/e2e/helpers/**; docs/current/N202.md.
Not: Fixing the failures (later items); Changing playwright.config.ts or CI files.

## N203 Rebuild the adaptive Atlas panels with the v7 kit

Stage: Harden (proposed) · Status: open · Needs: N202 · Assigned: —
Done = The eight panels from `src/features/adaptive/AtlasPanels.tsx` use kit components and kit type only. Per PLAN.md WP1:
- Today's plan card has step chips and one Next row; there is no "Decision details" or version string.
- Calendar shows "Good times to study" with formatted dates, hidden without history.
- Path estimates are one line.
- Session "Recent attempts" is removed.
- Checkpoint readiness is folded into the recheck row.
- Inbox "Suggested links" are one row per link.
- Atlas tuning moves to Settings › Study and review › Advanced, with auto-saving rows.

The N202 allowlist entries for these scenes are deleted. First-viewport words: Today ≤ 60 and Path ≤ 60.
Tests: unit tests per panel (formatting, hidden-when-empty, saves); the lint rules pass on Today, Calendar, Path, Session, Checkpoint, Inbox and Settings › Planning; existing adaptive and Atlas tests stay green.
Scope: src/features/adaptive/**; src/ui/v7/atlas-values.css; the consuming v7 screens (home, calendar, project, session, checkpoint, proposals, settings); tests/unit/adaptive/**; docs/current/N203.md.
Not: Changing the Atlas model, scheduler or MCP; Atlas map layout (N204).

## N204 Atlas focus mode: one header, map fills the screen, legible labels, filters in a sheet

Stage: Harden (proposed) · Status: open · Needs: N203 · Assigned: —
Done = Per PLAN.md WP2:
- one header row (back, Atlas, Map | List, search, filter with a count); the second tab row is gone;
- Themes and Bridges are folded into List and hidden while empty;
- filters and the legend sit in one bottom sheet, with no floating or sticky filter panels;
- the map canvas fills the space between the header and the tab bar, and the first view is the current checkpoint's constellation;
- labels are ≥ 13px with a halo; star radius is ≥ 4px with 22px tap targets;
- the peek sheet is ≤ 112px and the camera keeps the selection visible above it; List rows open the concept;
- the empty Atlas offers "Start a path" when there is no path.

Audit: map unobstructed ≥ 92%, drawn content ≥ 60% of the visible map, List chrome ≤ 132px, zero overlaps.
Tests: unit tests for fit and cluster cameras with insets, the label halo and collision pass, and filter sheet state; e2e for first-view zoom, filter round trip, row opens the concept, and overlap and chrome facts.
Scope: src/features/atlas/v7/**; src/features/adaptive/AtlasPanels.tsx (AtlasExplore, AtlasFilters); src/ui/v7/atlas-values.css; tests/unit/atlas/**; tests/e2e/v7-atlas*.spec.ts (new cases only); docs/current/N204.md.
Not: Changing Atlas data or MCP; the v6 Atlas.

## N205 Tutor chat: conversation-first layout like the Lemma Pad page

Stage: Harden (proposed) · Status: open · Needs: — · Assigned: —
Done = Per PLAN.md WP3:
- one 48px kit header (title switches the checkpoint; timer; ⋯ holds session parts, latest question, context and connect);
- the step rail shows only before Begin, then a hairline;
- the start card is ≤ 140px;
- reading mode hides the keyboard when a reply arrives or the transcript is scrolled up, and the composer focus shows it; the 48px "Show keyboard" bar is replaced by a tool-row toggle;
- an "On the table" chip pins the latest question;
- tutor text is full width at reading size, and demo or system notes become a status line;
- path-level entry without an approved checkpoint offers "Plan with your tutor" instead of a dead end.

Conversation ≥ 650px in reading mode and ≥ 420px in writing mode (now 622 − 48 and 404); no off-kit fonts or sizes on the tutor scenes.
Tests: e2e for mode switching, scroll-up hides the keyboard, the pinned question and the path-level state; the existing v7-tutor specs stay green.
Scope: src/features/tutor/**; tests/e2e/v7-tutor-*.spec.ts (new cases only); tests/unit/tutor/**; docs/current/N205.md.
Not: The scratch pad and images (N206); MCP or database changes.

## N206 Tutor scratch pad: drawings attached to answers and read by the tutor through MCP

Stage: Build (proposed; flag `tutorScratch`, default off) · Status: open · Needs: N205 · Assigned: —
Done = Per PLAN.md WP4:
- **Ink engine:** one shared engine, extracted from the Pad ink and the Review scratch paper.
- **Scratch tool:** swaps the keyboard area for the pad (pen, eraser, hand, undo, clear, expand) and auto-attaches after the first stroke. The composer shows a thumbnail chip; sending with only a drawing works; the transcript thumbnail opens a zoomable viewer; drafts and the offline queue keep strokes.
- **Export:** cropped, white background, ≤ 1200px, ≤ 600 KB PNG, at most 3 per turn.
- **Migration (additive, review required):**
  - private bucket `tutor-ink` with owner-folder policies;
  - table `tutor_turn_attachments` with RLS owner select and revoked browser writes;
  - the learner-turn owner command binds ≤ 3 validated attachments in the same transaction;
  - unbound uploads are purged after 24 h.
- **MCP:** `get(what=tutor_turn)` returns its text plus one MCP image content block per attachment (grant-checked, ≤ 1 MB each); `get(what=tutor_attachment, id)` re-fetches one; the tutor instructions mention drawings.

Tests:
- unit: crop/scale/size cap and stroke round trip;
- e2e: draw, attach, remove, send, viewer, offline;
- SQL: RLS isolation, bind with the turn, purge, additive-migration check;
- MCP selftest: image content block with mimeType image/png, grant required, cap enforced.

Scope: src/ui/v7/ink/**; src/features/pad/** (ink extraction only); src/features/review-run/v7/ScratchPad.tsx; src/features/tutor/**; src/data/tutor/**; src/flags.ts; supabase/migrations/<new>_tutor_ink.sql; supabase/functions/mcp/{server.ts,tutor-connector.ts,tools/read.ts,rules.ts}; tests/**; docs/current/N206.md.
Not: Signed URLs in model context; images in notifications; handwriting recognition (N200); turning the flag on (a separate reviewed PR).
Split note: if > 800 lines, N206.1 must carry the end-to-end path (ink → upload → bind → MCP image); N206.2 adds photos, the viewer and the offline queue.

## N207 One bottom bar: detail pages hide the tab bar; dock "Continue with tutor"

Stage: Harden (proposed) · Status: open · Needs: — · Assigned: —
Done = Per PLAN.md WP6:
- Checkpoint, Card, Session, Plan proposal, Tutor, Focus and Close the day hide the tab bar and dock their action bar (≤ 80px).
- Path docks "Continue with tutor" as its primary with Review as secondary; the floating pill and the inline Continue button are removed.
- Calendar Day shows the browse slider only on demand.
- The Library hub title follows its tab; search moves into the header and filters into one chip row.
- In sheets, focused fields scroll above the footer and keyboard.
- The offline banner sits in flow and does not cover the title.

Audit chrome: hubs ≤ 132px and detail pages ≤ 136px; zero overlaps on Path scenes.
Tests: e2e for route-dependent tab bar visibility, back navigation from every detail page, the Path action bar, Calendar browse on demand, and the offline banner; unit tests for the shell route map.
Scope: src/app/v7/**; src/app/OfflineBanner.tsx; src/features/{project,checkpoint,card,session,plan-proposal,calendar,projects,cards,focus,ritual}/v7/**; tests/**; docs/current/N207.md.
Not: Desktop and tablet layouts beyond keeping them unchanged; new navigation destinations.

## N208 Empty states: one EmptyMoment per screen

Stage: Harden (proposed) · Status: open · Needs: N203 · Assigned: —
Done = Per the PLAN.md WP7 table:
- Review, Cards, Progress (every tab), Practice, Week, Calendar suggestions, Atlas, Today (first run) and the new path each show one EmptyMoment with one action.
- With no data, there are no disabled primary buttons, empty charts, filters or stat tiles.
- `src/ui/v7/Chart.tsx` writes correct summaries for zero data.

Tests: unit tests per empty condition; e2e with `?demo=first-use` on every screen.
Scope: the affected v7 feature folders; src/ui/v7/EmptyMoment.tsx; src/ui/v7/Chart.tsx; tests/**; docs/current/N208.md.
Not: Changing data or onboarding flows beyond the CTA targets.

## N209 Layout bug sweep

Stage: Harden (proposed) · Status: open · Needs: — · Assigned: —
Done = PLAN.md WP8 rows 2, 3, 8, 11, 12, 13, 18, 19, 20 and 21 are fixed, with evidence frames re-captured:
- the first-card form is full width;
- the card editor key row is not clipped;
- Not found says it once;
- Inbox keyboard hints show for a fine pointer only;
- the Inbox list footer shows only with a selection;
- the Progress "first month" comparison is correct;
- the Focus "too short" message appears once;
- the Capture type switch is announced;
- native disclosures are kit rows;
- native selects are kit Select sheets.

Rows 1, 4–7, 9, 10, 14–16 and 17 belong to N203, N204, N205 and N207 or to an Owner decision.
Tests: a regression test per row (unit or e2e), each failing before its fix.
Scope: the affected v7 feature folders and src/ui/v7/**; tests/**; docs/current/N209.md.
Not: Visual redesign beyond each bug.

## N210 Copy diet

Stage: Harden (proposed) · Status: open · Needs: N203 · Assigned: —
Done = The before → after table in `docs/ui-plan/2026-11-20/COPY.md` is applied, with:
- one shared date/time formatter;
- a `FirstUseHint` that hides after 3 uses;
- keyboard hints only for a fine pointer.

First-viewport word budgets are met (Today ≤ 60, Path ≤ 60, Checkpoint ≤ 60, Calendar Month ≤ 60, Progress ≤ 50, Capture sheet ≤ 25), and the N202 raw-date/version rule passes everywhere.
Tests: unit tests for the formatter and FirstUseHint; a committed fixture of visible strings per scene, updated in this PR.
Scope: src/lib/format.ts; src/ui/v7/**; the affected feature folders; tests/**; docs/current/N210.md.
Not: Tutor or MCP instruction texts; legal or privacy pages.

## N211 Beauty pass and Owner eye test

Stage: Harden (proposed) · Status: open · Needs: N207, N208, N209, N210 · Assigned: —
Done = Per PLAN.md WP9:
- sections instead of nested cards on Today, Review, Progress and the Settings detail pages;
- one section-title style per level;
- the 8px rhythm with 16px gutters;
- subject glyph plus colour everywhere;
- charts with minimal labels and hidden when empty.

Before/after `npm run audit:ui` sheets for Today, Path, Checkpoint, Review, Atlas and Tutor are attached to the PR, and the Owner approves them.
Tests: the N202 lint stays green with the allowlist empty for these scenes; visual captures are attached.
Scope: src/ui/v7/**; v7 screen CSS; docs/current/N211.md.
Not: New features or copy beyond COPY.md.
