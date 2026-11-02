# Stress test: when the UI stops doing its job (owner, 31 Oct 2026)

## Owner-approved CI timing revision — 2 November 2026

The owner authorized relaxing performance conditions after identical code passed local checks but repeatedly exceeded timing limits on GitHub runners. This section supersedes older timing ceilings in this spec and task handoffs.

- Run the shared CI browser suite with one worker to avoid competing timed browsers on the same runner.
- Keep 4× CPU throttling, full S/X datasets, actual visible content and the first navigation/paint timing origin.
- Atlas C2 and Cards D6 transitions: under 2,000 ms (previously 1,000 ms).
- Cold first renders, including the 144-cell matrix: under 4,000 ms (previously 1,500 ms).
- Retain zero retries for performance cases and continue recording individual measurements. These are CI regression ceilings, not measured phone latency or a guarantee of smoothness.
- DOM <1,500, overflow, font sizes, tap targets, resource budgets, SQL correctness, security, owner isolation and all functional assertions remain unchanged. SQL timing budgets are unchanged.


The owner's live Algebra 1 project (36 checkpoints, no stages) showed two failures:

- On **Paths**, the mini Metro is a barcode of 36 ticks. The 0 % beside it is the only readable part.
- On the **project page**, the Metro is a chain of overlapping rings. You cannot see where you are, what comes next or how far is left, which is the only reason the element exists.

This spec stress-tests every UI element the same way. Each element is fed 10 to 100 times realistic sizes to find where it becomes useless or ugly. It then says how to keep the element's **job** at any size. It is a plan: nothing here is built yet.

## 0. Method and stress profiles

Breaking points below are computed from the code (file references given) and from the two owner screenshots. The first task (ST-0) turns this into a repeatable automated stress suite.

| Quantity | Typical | Stress (S) | Extreme (X) | Hard limit today |
| --- | --- | --- | --- | --- |
| Checkpoints per project | 12 | 40 | 100 | 40 per `propose_plan` (more by plan changes) |
| Stages per project | 4 | 0 (tutor set none) | 15 | none |
| Active projects | 3 | 15 | 60 | none |
| Subjects | 3 | 15 | 40 | none |
| Ideas (Atlas) | 80 | 600 | 2,500 | 80 per proposal |
| Idea links | 100 | 1,500 | 8,000 | none |
| Cards | 300 | 5,000 | 30,000 | none |
| Due today | 25 | 600 | 4,000 | none |
| Cards in one review round | 20 | 150 | 400 | none |
| Reviews stored | 2,000 | 50,000 | 300,000 | none |
| Card front / back length | 80 / 250 chars | 1,500 / 3,000 | same | 1,500 / 3,000 (connector) |
| Display maths | one line | 10×10 matrix, 25-line `aligned` | 60-term sum | none |
| Sessions per project | 20 | 300 | 1,000 | none |
| Events per session | 15 | 150 | 400 | none |
| Sources per project | 3 | 30 | 100 | none |
| Pages per PDF | 300 | 1,200 | 3,000 | 50 MB per file |
| Pending proposals | 6 | 150 | 600 | none |
| Title length | 25 chars | 80 chars with LaTeX | 80 chars, one unbroken token | 80 (connector) |

Phone widths under test: 390 px and 360 px. Themes: graph and graph-night.

## 1. Principles (apply to every fix)

1. **Keep the job, change the form.** Every element states its job in one line ("where am I in the plan and what is next"). When the data outgrows the form, switch to a different representation that still does the job. Never shrink marks until they merge.
2. **Measured switch points.** Marks never sit closer than 8 px. Tap targets are never smaller than 44 px. Text is never smaller than 12 px, and maths never below 16 px. Each element computes its own threshold from its width (for example `maxStations = floor(width / 8)`) and switches representation above it.
3. **Detail near "now", summary elsewhere.** Show the current neighbourhood in full (the current stage, the next card, this week) and aggregate the rest, with counts.
4. **Group by the owner's own structure** (stage, subject, deck, session) and let the groups collapse. If the structure is missing, create neutral groups (CP1–8, CP9–16) rather than one flat run.
5. **Every list is bounded.** Show a first page, then search, filters and "more". Virtualise anything that can pass 100 rows.
6. **Counts cap; exact numbers are one tap away.** Show "999+" in badges. Format large numbers with grouping (12 345) and long durations in days ("52 h" becomes "2 d 4 h").
7. **Content is clamped, never cut.** Long text and maths scroll inside a frame with a visible edge fade, and open in full on request. Fixed-height rows clip to one line and show the full text in the sheet they open.
8. **No screen downloads whole tables.** Lists, counts and charts come from server-side aggregates. A screen loads at most a page of rows.
9. **Every fix ships with a stress fixture and an assertion** (ST-0), so the element cannot quietly regress.

## 2. Findings and fixes

Each entry gives: the element and its job; where it breaks (with the cause); the fix; and the acceptance test.

### A. Progress and timelines

**A1. Project Metro** (`src/ui/timeline/ProjectTimeline.tsx`). *Job: where am I, what is next, am I on schedule.*
- **Breaks:**
  - Stations are spread evenly over 324 view units, so at 36 checkpoints they are about 8 px apart on a phone. Station circles (radius 2.7–4.4) and the current halo (radius 9) overlap: this is the owner's screenshot.
  - Stage labels are hidden whenever a name does not fit its segment, so with long or missing stages none show.
  - Tapping picks the nearest station from the tap's x position, so each station's tap area is about 8 px wide.
  - It degrades from about 20 checkpoints and is unreadable from about 30.
- **Fix: "stage Metro".**
  - Up to `floor(width / 22)` stations (about 14), draw as today.
  - Above that, each stage becomes one **segment** whose length follows its checkpoint count. Its fill shows the share done; its colour shows the stage's worst schedule state; its label reads "Groups 2/6".
  - The **current stage is expanded** in place into its stations, showing at most 9 (the current one ± 4) with "+3" ends.
  - Tapping a stage segment expands that stage instead. Arrow keys move station by station across stages.
  - With no stages, use automatic groups of 8 (CP1–8 …), labelled by checkpoint range.
  - The header always says "CP14 of 36 · Stage 3 of 7".
- **Accept:** at 100 checkpoints and 15 stages (and at 100 with none), there are no two marks closer than 8 px, the current station and its code are visible, every station is reachable through 44 px targets, and nothing overlaps (the layout check).

**A2. Paths mini Metro** (`src/features/projects/Page.tsx`, `MiniMetro`). *Job: progress and schedule at a glance.*
- **Breaks:**
  - It draws one tick per checkpoint across about 200 px: 5.5 px apart at 36, a barcode at 60 or more.
  - Every row also fetches its project's full detail (`useProject` per row), so a library of 60 projects makes 60 detail requests on open.
- **Fix:**
  - Draw a **stage-segmented bar**: one segment per stage (or automatic group) sized by checkpoint count, filled by done, tinted by schedule, with a marker at the current checkpoint.
  - Show ticks only when there are 16 checkpoints or fewer.
  - Data comes from the project summary (stage progress and schedule headline computed by the server, see ST-5). Rows make no per-row requests.
- **Accept:** a library of 60 projects with 100 checkpoints each opens with one request for the list, with no bars below 8 px per mark.

**A3. Today goal cards** (`src/features/home/GoalDistance.tsx`). *Job: how far am I from my goals.*
- **Breaks:** there is one full card (about 320 px) with a Metro per active project. With 15 active projects, about 4,800 px of cards sit before Cards and Last chat.
- **Fix:**
  - Show at most **3 full cards**, chosen by urgency: behind schedule first, then the nearest target, then the most recent activity.
  - The rest go in a compact list ("12 more · 10 on schedule, 2 behind"), each one row with a stage bar.
- **Accept:** with 60 active projects, Today stays under 2.5 screens on a 390 × 844 phone.

**A4. Finish estimate.**
- **Breaks:** a new plan uses the baseline pace of 0.25 checkpoints a week, so 36 checkpoints read "Finish ≈ Aug 4, 2029" (owner screenshot). That is technically true and misleading.
- **Fix:** until there are 28 days of evidence, take the pace from the plan's own dates (due dates or target) and label it "from your plan". Switch to measured pace afterwards and say so.
- **Accept:** a fresh 36-checkpoint plan with a target in January shows a January estimate labelled "from your plan".

**A5. Stages list on the project page** (`src/features/project/PathsView.tsx`). *Job: what is in this plan and where am I.*
- **Breaks:** with no stages, all 36 checkpoints fall into one "Unassigned checkpoints" group (owner screenshot). Done checkpoints keep their full rows forever.
- **Fix:**
  - Use automatic groups when stages are missing.
  - In each stage, fold finished checkpoints into one row ("6 done ✓").
  - Open the current stage by default and fold the others.
  - Add a jump bar of stage chips when there are more than 5 stages.
- **Accept:** a 100-checkpoint, 15-stage project opens at its current stage in under one screen.

**A6. Connector side (MCP).** Plans with no stages are the root cause of A1, A2 and A5 for real data.
- `propose_plan` and `propose_plan_change` must reject a plan with more than 8 checkpoints and no stages. The error asks for 3–7 stages.
- When the project's goal is empty, `create_project` and `propose_plan` ask for one: the owner's project still shows "Your tutor fills this in" after its plan was approved.

### B. Plan review

**B1. Checkpoint map** (`src/features/plan-proposal/planMap.ts`). *Job: see the shape of the plan and its dependencies.*
- **Breaks:**
  - A 40-checkpoint chain is a 40-column strip about 2,700 px wide, so you only see 5 columns at a time with no overview.
  - A checkpoint needed by 15 others makes a 750 px column.
- **Fix:**
  - Above 16 checkpoints, open as a **stage graph**: one node per stage with "8 checkpoints", plus edges bundled between stages (the count shows on the edge), fitted to the width.
  - Tap a stage to expand it in place, as the current tree. "Expand all" gives today's full tree.
  - Same collapse rules as the Atlas.
- **Accept:** a 40-checkpoint, 7-stage plan fits within 1.5 screens collapsed, and expanding any one stage keeps the others collapsed.

**B2. Ideas in the plan** (`src/features/atlas/IdeaGraph.tsx`).
- **Breaks:** a plan whose ideas have no levels or parents shows 80 rows under one root.
- **Fix:**
  - When there is no hierarchy, group the ideas by the checkpoint that teaches them ("Taught in CP3").
  - The connector requires levels and parents when a proposal has more than 20 ideas.
- **Accept:** 80 flat ideas open as 40 or fewer checkpoint groups, folded.

**B3. Plan list and drawer.** These are fine up to 40. Add stage jump chips when there are more than 5 stages (as in A5).

### C. Atlas

**C1. Link gutter.**
- **Breaks:** bundling only merges identical row pairs. With "All" unfolded on 600 ideas and 1,500 links, the 84 px gutter becomes a solid mesh.
- **Fix:**
  - Above 60 visible arcs, draw only the arcs that touch a folded branch boundary or the current selection, and show "312 links hidden — fold or select an idea".
  - "All" asks for confirmation above 300 ideas.
- **Accept:** in profile X with "All" selected, the screen never shows more than 60 arcs.

**C2. Rows.**
- **Breaks:**
  - All visible rows are in the DOM, and 2,500 rows with KaTeX names stall the first render.
  - Five indent levels (80 px) plus a long name leave about 120 px for text at 360 width.
- **Fix:**
  - Virtualise rows above 200, rendering only the visible window plus a margin.
  - Indent 16 px for three levels, then 8 px.
  - A **sticky parent row** shows which branch you are in while scrolling.
- **Accept:** opening profile X renders in under 1 s with 4× CPU throttle, with fewer than 1,500 DOM nodes.

**C3. Hub ideas.**
- **Breaks:** an idea needed by 40 others lists all 40 in its details.
- **Fix:** group "Opens up" by area and show the first 8 with "Show all 40".

### D. Flashcards and review

**D1. Long card faces** (`src/features/review-run/Page.tsx`). *Job: recall one idea quickly.*
- **Breaks:**
  - The connector allows 1,500 characters on the front and 3,000 on the back.
  - At the review font of 21 px, a full front is about 50 lines (1,400 px). It pushes the reveal and grade controls off screen, and a 3,000-character back is a document.
- **Fix:**
  - **Authoring (MCP):**
    - `propose_cards` warns above 300 characters on the front or 1,200 on the back, and suggests splitting.
    - The card editor shows the same hint.
    - "One idea per card" is enforced by advice, not truncation.
  - **Display:**
    - The card body scrolls inside its frame with an edge fade and "12 more lines".
    - The confidence and grade bar is **sticky at the bottom** and always visible.
    - Text steps down from 21 to 18 px above 200 characters, and never below 16.
- **Accept:** a 1,500 / 3,000-character card keeps all controls visible at 360 × 740, and the content is fully reachable by scrolling inside the card.

**D2. Big maths.**
- **Breaks:**
  - Display maths scrolls sideways (`math.css`), but there is no cue that more is hidden.
  - Inline formulas are `nowrap`, so a long inline formula widens its line beyond the card.
  - A 10×10 matrix at 21 px is about 600 px wide, and a 25-line `aligned` block is about 900 px tall.
- **Fix:**
  - Display maths gets an edge fade and a **⤢ full-screen maths view**: landscape-friendly, pinch to zoom, white-space preserved.
  - Inline formulas longer than about 40 characters are promoted to display.
  - Long `aligned` and matrix blocks show their first 8 lines, then "Show all 25 lines".
  - The KaTeX font size never drops below 16 px; width overflow scrolls instead.
- **Accept:** the stress card set (10×10 matrix, 25-line `aligned`, 60-term sum, 120-character inline formula) has no element wider than its card, and every formula is readable at 100 % zoom in the full-screen view.

**D3. Review round progress** (`src/features/review-run/PolygonProgress.tsx`).
- **Breaks:** the polygon has one edge per card on a 58 px figure. At 150 cards each edge is under 1 px; at 300 it is a circle.
- **Fix:**
  - Up to 24 cards, keep the polygon.
  - Above that, draw a **segmented ring of 12 arcs**, each standing for an equal share of the round and filled as it is answered, plus "37 / 300" and "missed 4".
  - The Q.E.D. summary lists missed cards first and folds the rest into "263 recalled".
- **Accept:** a 400-card round shows no mark under 4 px, and the summary fits in two screens.

**D4. Large backlog.**
- **Breaks:** the tab badge prints the raw count ("4000" overflows the icon). The hub offers "4000 due · about 5 h" as one Start button.
- **Fix:**
  - The badge shows "999+".
  - The hub offers **today's share** (settings `reviewsPerDay`, default 200): "Start 200 · about 15 min". The rest is shown as backlog: "3,800 overdue · spread over 19 days".
  - Add a **catch-up plan** option that raises the daily share for a week.
  - The ordering puts overdue cards for the current checkpoint first.
- **Accept:** profile X shows a 15-minute start, an honest backlog line, and a badge that fits.

**D5. Deck tree** (`src/features/review/Page.tsx`).
- **Breaks:** 15 projects × 40 checkpoints is 600 rows of checkboxes, all expanded.
- **Fix:** projects folded by default; only decks with cards due; the first 5 checkpoints plus "more"; search when there are more than 8 projects.
- **Accept:** profile S opens in under one screen.

**D6. Cards list** (`src/features/cards/Page.tsx`).
- **Breaks:** every card is rendered, each with KaTeX. 5,000 rows freeze the page; 30,000 crash a mid-range phone.
- **Fix:** server-side paging and search (50 at a time), a virtualised list, and filters (project, checkpoint, state, has comments) with counts.
- **Accept:** profile X opens in under 1 s and scrolls at 60 fps.

**D7. Card detail.** Comments and history are unbounded. Show the latest 20 with "more".

### E. Insights and data

**E1. Whole-table downloads** (`src/data/live/helpers.ts` `rows()`, used by `getInsightData`, the home summary, the deck tree and others).
- **Breaks:** every screen pages through entire tables 1,000 rows at a time. 300,000 reviews means 300 requests and tens of MB each time Insights or Today opens.
- **Fix (ST-5):**
  - Add server-side aggregate RPCs, all owner-scoped and fast with indexes:
    - `insights(days)` returns buckets;
    - `home_summary()`;
    - `deck_tree()`;
    - `project_summaries()` returns stage progress, schedule headline and next checkpoint.
  - Lists page from the server.
  - The client cache keeps the last aggregate for instant open.
- **Accept:** profile X opens Today in 3 requests or fewer, Insights in 1, and neither transfers more than 200 kB.

**E2. Time by subject** (`HBars`).
- **Breaks:** each subject takes 43 px, so 40 subjects is 1,700 px. Labels are cut at 13 characters mid-word.
- **Fix:** the top 6 plus "Other (34)", expandable; labels clipped with an ellipsis, full name on tap.

**E3. Legends and stacked bars by project (Today cards).**
- **Breaks:** 25 projects make 25 slivers and a legend that wraps over several lines.
- **Fix:** the top 4 projects plus "Other", consistently across Today and Insights.

**E4. Large numbers.**
- **Breaks:** studied time shows as "1240h 0m", review totals are ungrouped, and stat tiles clip.
- **Fix:** shared number and duration formatting (12 345; 52 h; 2 d 4 h; 31 d), and stat tiles that never wrap digits.

### F. Paths, projects and sources

**F1. Paths library.**
- **Breaks:** the per-row detail fetch (A2), and 60 projects × 15 subjects all rendered.
- **Fix:** summary-only rows (ST-5), and a virtualised list when there are more than 50 rows. The groups, search and status filters already exist.

**F2. Sources** (`src/features/project/SourcesPanel.tsx`).
- **Breaks:**
  - 100 sources are listed in full.
  - A 3,000-page PDF is read in the browser's main thread, page by page, and the text is capped at 20,000 characters per page.
- **Fix:**
  - Group sources by kind, folded beyond 10 rows.
  - Ingest runs in a Web Worker with progress and cancel.
  - Above 1,200 pages, warn that it is slow and suggest splitting by chapter.

**F3. Long titles and book names.** These wrap correctly today. Keep them wrapping in headers and use one-line clips only in fixed rows (see I1).

### G. Sessions

**G1. Sessions tab.**
- **Breaks:** all sessions are listed. Show the latest 20, grouped by month, with "more".

**G2. Session detail** (`src/features/session/Page.tsx`).
- **Breaks:** 300 events make one very long timeline, and the horizontal card strip has 50 tiles.
- **Fix:**
  - Fold runs of the same kind ("9 hints"), and always show attempts, evidence and rechecks.
  - Replace the card strip with "24 cards · 3 waiting" linking to the filtered cards list.

### H. Tutor proposals

**H1. Inbox** (`src/features/proposals`).
- **Breaks:** 150 pending cards is 150 swipe cards with no batch actions.
- **Fix:**
  - Group by session and checkpoint.
  - Add **Approve all from S7 / CP4**, with a preview count and undo.
  - Page 20 at a time.
  - Today's line stays "150 tutor proposals".

### I. Text and maths everywhere

**I1. Clipping rules.**
- **Breaks:**
  - The graph theme switches `.truncate` to wrap anywhere app-wide (`src/styles/graph.css`). This was right for prose but wrong for fixed-height rows: Atlas names ran under the link gutter until UI-7b clipped them explicitly.
  - One unbroken token (a URL or a long `\operatorname{...}`) can force one-word-per-line wrapping in chips.
- **Fix:** three explicit content roles, used instead of ad hoc classes:
  - `clip-1`: one line, ellipsis, full text in the sheet it opens;
  - `wrap`: multi-line, breaks long tokens;
  - `math-block`: scrolls with an edge fade, with the D2 view.
  - The layout check fails any fixed-height row whose text wraps.

**I2. Toasts.** Clamp to two lines; long messages link to details.

**I3. Badges and chips.** Cap counts (principle 6). Chips never grow beyond the screen width minus the gutter.

## 3. Tasks

| Task | Scope | Depends on |
| --- | --- | --- |
| **ST-0** | Stress fixtures and suite (see below) | — |
| **ST-5** | Server aggregates and paging: `insights`, `home_summary`, `deck_tree`, `project_summaries` RPCs, card paging and search, indexes (E1, A2 data, F1, D6 data) | — |
| **MCP-5** | Connector guards: stages required above 8 checkpoints, goal requested, card length advice, idea hierarchy required above 20 ideas (A6, B2, D1) | — |
| **ST-1** | Progress at scale: stage Metro, segmented mini bar, Today top-3, plan-based pace, stage folding (A1–A5) | ST-0, ST-5 |
| **ST-2** | Plan review at scale: stage graph map, checkpoint grouping of flat ideas, jump chips (B1–B3) | ST-0 |
| **ST-3** | Atlas at scale: arc cap, virtual rows, sticky parents, hub lists (C1–C3) | ST-0 |
| **ST-4** | Cards and review at scale: scrolling faces with a sticky grade bar, maths view, segmented ring, daily share and backlog, deck tree, virtual cards list (D1–D7) | ST-0, ST-5 |
| **ST-6** | Lists at scale: sessions, session detail, inbox batch actions, sources (F2, G, H) | ST-0, ST-5 |
| **ST-7** | Text and number system: content roles, number and duration formatting, legends and "Other", toasts (E2–E4, I) | ST-0 |
| **QA-3** | Stress acceptance: run ST-0 in S and X profiles in both themes at both widths, owner screenshot review, record PASS/FAIL per element | all |

**ST-0 builds the means to see all of this:**
- A deterministic generator (`scripts/make-stress-data.ts`) and two demo modes, `?demo=stress` (profile S) and `?demo=extreme` (profile X), using the demo adapter.
- The generated data includes:
  - the owner's real shape: a 36-checkpoint plan with no stages;
  - a 100-checkpoint, 15-stage plan;
  - 2,500 ideas with 8,000 links;
  - the stress card set (maximum-length faces, the matrix, `aligned`, sum and inline-formula cards);
  - 400-card rounds;
  - 4,000 due;
  - 60 projects, 40 subjects, 600 proposals and 1,000 sessions.
- `tests/e2e/stress.spec.ts` visits every route in both profiles. It saves screenshots to `test-results/screens/stress/` and asserts:
  - marks at least 8 px apart, wherever a chart marks a count;
  - no horizontal overflow, and tap targets at least 44 px (the existing layout check);
  - no text under 12 px, and no maths under 16 px;
  - fewer than 1,500 DOM nodes per screen;
  - first render under 1.5 s with a 4× CPU throttle;
  - request count and transfer size under the E1 budgets.

**Order:** start ST-0, ST-5 and MCP-5 at once. Then ST-1 to ST-7 in parallel (ST-1 and ST-4 first: they hold the owner's two daily screens). QA-3 comes last.

**Done for each task:**
- its section's acceptance tests pass in profiles S and X, in graph and graph-night, at 390 and 360 widths;
- the screenshots are attached to the PR;
- no regression in the existing suite.
