# Lemma Lab: worlds, goal-first Home, timelines and Atlas v2 (tasks DB-3, MCP-3, UI-4a/b/c)

The owner tried the theme lab (UI-3) and asked for more: themes that change how the app looks and feels (background, materials, depth, type), not only colours; checkboxes to eliminate options; demo data inside the real app to judge designs; a Home that first answers "how far am I from each goal" and "how many cards are pending"; a horizontal timeline that fits the screen; and an Atlas that is not cluttered, with hierarchy, collapsible nodes, a minimap and visible names.

**Reference implementation:** `docs/design/lab/lemma-lab.html`. It is a single-file, working prototype with demo data. Port its behaviour and visuals; where this spec and the file differ, this spec wins. The owner uses the published copy to choose; the app must offer the same choices.

Open it locally by wrapping it: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>` + file + `</body></html>`.

## 0. Owner's choices (30 Oct, 10:42; final choice and UI plan in `ui-euclid.md`)

- **World: Euclid.** Kept: Obsidian lamp, Graph paper, Euclid. The other nine original worlds are eliminated: do not port them.
- **New dark worlds** made from those choices, to be judged next (port all five): Euclid at night, Scriptorium, Astrolabe, Lamp and compass, Graph paper at night (§1.1).
- **Timeline: Ascent** (default). Metro is kept as the alternative. Do not build Number line.
- **Atlas: Orbits** (default). Branches and Outline are kept.
- **Text: compact. Motion: lively** (defaults; the owner can still change them).
- **Day and night** (§1.2): default pairing Euclid by day and Euclid at night by night, off until the owner turns it on.

## 1. Worlds (replace UI-3 colour themes as the top-level choice)

A world = colour tokens + material + type + background renderer. Port the worlds the owner kept (§0) from the lab's `WORLDS` array exactly (ids, names, token values, radius, border, shadow, blur, fonts, `ds` display scale, `css` background, `draw` renderer):

| id | Look |
| --- | --- |
| `obsidian` | glass over plotted curves (Fourier sum, damped cosine, cubic) with amber lamp light |
| `graph` | paper cut-outs with hard offset shadows on a 5 mm blue grid; red-pencil plot of y = x³ − 3x; Newsreader headings |
| `chalk` | blackboard dust, smudges and faint chalk equations; dashed outlines; Caveat headings; outline buttons |
| `blueprint` | drafting grid, construction circle with angle and radius; corner tick marks on every card; IBM Plex Mono labels |
| `polar` | heavy glass over a polar grid and the rose r = cos 3θ |
| `contour` | matte slabs over contour lines of a sum of Gaussians (marching squares) |
| `field` | plum glass over streamlines of the damped pendulum field |
| `euclid` | sepia vellum, Elements I.1 construction, EB Garamond |
| `soft` | neumorphic relief on a dot matrix |
| `journal` | a typeset paper: no boxes, rules above sections, small caps, numbered section titles, STIX throughout, running head |
| `tiles` | frosted glass over Truchet tiles |
| `nebula` | stars, nebulae and a constellation behind cyan glass |

### 1.1 Dark worlds in the spirit of the owner's picks

| id | Look |
| --- | --- |
| `euclid-night` | Euclid's construction in parchment lines on walnut ink; rubric-red accent and red first letters on section titles; Garamond; thin rules, almost no shadow |
| `scriptorium` | manuscript ruling (double margins, faint lines, prick marks) and Elements I.47 (the Pythagoras windmill) in gold leaf; double-ruled card frames; small-caps headings; outline buttons with an inner rule |
| `astrolabe` | engraved brass limb with degree scale, almucantars, ecliptic and star pointers on night blue; verdigris accent; round glyph seals; light glass |
| `lamp-compass` | Obsidian lamp's glass and amber lamp light over Euclid's construction; Garamond titles |
| `graph-night` | dark grid pad with blue rules, cut-out cards with hard black offset shadows and light borders, coral pencil plot; Newsreader titles; IBM Plex Mono numbers |

Token values, renderers (`euclid`, `ruling`, `astrolabe`, `lampcompass`, `graph`) and material rules are in the lab. All five pass the contrast gate of `themes.md` §2.3.

### 1.2 Day and night pairing

Settings › Appearance › Day and night: a switch "Switch with my phone's light and dark mode", a Day world picker (light worlds plus kept ones) and a Night world picker (dark worlds). When on, the app follows `prefers-color-scheme` live (listen for changes); the ‹ › switcher then changes the slot that is currently showing. Stored in `settings.ui` as `{follow, day, night}`.

Implementation:
- `src/styles/worlds.ts` holds the array; the generator writes `html[data-world="id"]` blocks (note the `html` prefix: a bare `[data-world]` selector loses to `:root` and the world silently does not apply). Per-world material rules (buttons, bars, cards, headings) are the `[data-world="…"] …` rules in the lab's `<style>`; port them to `src/styles/worlds.css`.
- Background renderers: one module per renderer in `src/ui/backgrounds/`, each `draw(ctx, w, h, tokens)`, ported from the lab's `BG` object. A fixed `<canvas>` behind the app, redrawn on world change and resize (debounced), device pixel ratio capped at 2. Grid patterns are CSS backgrounds (`css`).
- The UI-3 colour themes remain available as "Colour only" variants inside Settings › Appearance › More, so nothing the owner already tried is lost.
- Text size (compact / cozy / comfortable) and Motion (calm / lively) stay global. Lively = slow background drift and the pulse on current markers; calm = static. Respect `prefers-reduced-motion`.

## 2. Eliminate and choose (Settings › Appearance)

- Worlds grid (2 columns): each tile shows a live preview (its background renderer at tile size, a sample card in that world's material), the name, a **Keep** checkbox and a **star**. Tapping the tile applies the world.
- The header world switcher (‹ name ›) and the floating lab button cycle only kept worlds.
- Timeline style (Number line, Metro, Ascent) and Atlas style (Orbits, Branches, Outline): each with a mini preview, **Keep** checkbox and a radio to use it. Unkept styles show struck through in their switchers.
- "Your choice": the sentence produced by the lab's `choiceText()` with a Copy button, so the owner can tell Claude which options to make final.
- Choices persist per device (`localStorage['lemma.ui.v2']`, try/catch) and, when signed in, in `settings.ui` (jsonb, see §6) so they follow the owner across devices.

## 3. Demo data inside the real app

- Settings › Appearance has **Preview with demo data**: switches to demo mode (`?demo=1`) in the same tab, keeping the current world and choices. A persistent "Demo, tap to return" chip at the top returns to the owner's data.
- Extend the demo fixture (`data.md` §10) with the lab's four projects: add `algebra-1` "Algebra 1" (Lang, 40 checkpoints in 5 stages, CP11 now at step 2 of 4, CP5 revisit, proposed CP11a "Permutation notation bridge" citing D3, target 15 Jan "Prelim", pace 3.1 per week) alongside the existing three, and give every project stages and pace as in the lab's `PROJECTS`. Keep every existing §10 number true for the original projects; add the new totals to the e2e specs.
- Diagnostics in the fixture: the lab's `SIGNALS` (D3 gap, NEW notes, D5 strength, D2 pace).

## 4. Home (goal-first; replaces the resume-first Home)

Order, top to bottom:
1. **Distance to your goals**: one card per active project: glyph, title, "10/40 checkpoints, now CP11 Group actions", percentage in accent; the horizontal timeline (§5) at 70 px; an ETA line: target flag and date if set, "finish ≈ 6 Jan at 3.1/wk", and "9 days spare" (good colour) or "4 days late" (warn colour).
2. **Cards**: total due (large number) with a Review button; a stacked bar of due cards by project with a legend; chips for proposals to approve, open notes, new cards; a 7-day forecast of due counts (bars with numbers).
3. **From your tutor**: open diagnostics and new material (code chip coloured by kind, title, project); tap opens a sheet; D-gaps with a proposed bridge link to it.
4. **Last chat** (one small row): last session and a Copy prompt button. Resume is not a hero any more.

## 5. Horizontal timeline component (`src/ui/timeline/`)

Props: `project`, `variant: 'line' | 'metro' | 'ascent'`, `height`, `mini?`. It always fits the container width (no horizontal scroll), measured with a `ResizeObserver`.
- Positions: checkpoints (including proposed ones, placed after their `after` code) evenly spaced; stages from `checkpoints.stage`.
- Number line: axis, done portion in accent, ticks (stage starts and the goal taller), revisit = small warn ring above, proposed = dashed tick with a diamond, current = accent dot with halo and its code above, stage names below in two alternating rows (a name is cut with an ellipsis only to the space before the stage after next), goal flag with the target label.
- Metro: one line segment per stage with gaps, done portions in accent, stations (stage ends larger), current as a ring, stage names alternating above and below.
- Ascent: cumulative difficulty as elevation (difficulty = steps count, or 1–4 if unknown), done area filled, climber dot at the current checkpoint, summit flag.
- Every checkpoint has a full-height invisible hit area (width = spacing) that opens the checkpoint sheet: title, status chip, stage, criterion, current step, book, cards due, sessions, the reason for proposed ones, and actions (Study in chat; Approve/Reject for proposed).
- Accessible name: "<project>: n of m checkpoints, now <code> <title>"; the sheet is reachable by keyboard (arrow keys move between checkpoints when the timeline has focus).

## 6. Data and connector changes (tasks DB-3 and MCP-3, a `CONTRACT` PR first)

- `checkpoints.stage text null` (≤ 40): the stage or milestone group; `propose_plan` gains `checkpoints[].stage` (planning rules: group checkpoints into 3–7 stages named after the book's parts or chapters); `propose_plan_change` add/update accept `stage`; `edit` accepts `stage`.
- `projects.target_date date null` and `projects.target_label text null` (≤ 20, e.g. "Prelim"): `create_project` and `edit` accept them.
- Pace: checkpoints demonstrated per week over the last 28 days (minimum 1 per 4 weeks when nothing yet); computed in `src/lib/derive.ts` and the connector (`resume` packet line `GOAL` gains `| finish ≈ 6 Jan, prelim 15 Jan`).
- `concepts.topic text null` (≤ 40): the Atlas middle level. `propose_plan` `concepts[]` gains `topic`; ideas without a topic fall under "Other".
- `settings.ui jsonb null`: `{world, keep, fav, timeline, timelineKeep, atlas, atlasKeep, density, motion}`.
- Backfill the owner's Algebra 1 with stages from its plan (Foundations, Groups, Rings, Modules, Fields and Galois by code ranges) through a logged, undoable update, and ask the tutor to set concept topics with `edit` on the next "update my plan".

## 7. Atlas v2 (`src/features/atlas/`)

Shared: a camera `{x, y, k}` with drag to pan, pinch and wheel to zoom (zoom about the pointer), double-tap to zoom in, buttons + / − / fit, an animated `camTo` (420 ms, instant under reduced motion), filter chips (All, Revisit, Learning, Done) that dim non-matching ideas to 18 %, and a **minimap** (104 px, bottom-right): the whole map in miniature with the visible viewport as an accent rectangle; tap or drag in it to move. Render in screen space so labels keep a constant size. Labels get a halo in the background colour.

- **Orbits** (default): subjects laid out in a 2-column grid (sizes from their content), topics on a ring inside each subject, ideas on a ring inside each topic. Semantic zoom: subject names (glyph, name, "10/30 ideas") are always visible, below the circle until the subject fills the screen; topic names appear when a topic is at least 44 px in radius; idea names appear, placed radially outward, when their topic is at least 105 px in radius. Tap a subject or topic to focus it (breadcrumb "All › Algebra › Group theory" at the top-left; tap empty space to go up a level). Topic circles carry a progress arc. Selecting an idea draws its prerequisite (dashed) and dependent (solid) links across subjects and opens the idea sheet (status, subject, topic, cards, checkpoints, builds on, unlocks; Quiz me in chat).
- **Branches**: a left-to-right tree (subject → topic → idea, columns at 0 / 120 / 250, rows 34 px). Subjects and topics are collapsible (tap; collapsed nodes show "+n"); by default only topics with an idea in progress are open. Internal labels sit above their node, idea labels to the right; the camera keeps the tapped node in place when the tree relayouts.
- **Outline**: an indented list (subject › topic › idea) with progress bars and counts; collapsible; same filters.

## 8. Tasks

| Task | Depends on | Owns | Done when |
| --- | --- | --- | --- |
| DB-3 | — | migration for §6 columns and backfill | columns exist, advisors clean, backfill logged in `actions` |
| MCP-3 | DB-3 | connector §6 params, packet ETA, rules for stages and topics | self-test plans with stages and topics; `resume` shows the ETA |
| UI-4a Worlds and Appearance | — (can start now) | `src/styles/worlds.*`, `src/ui/backgrounds/**`, Settings › Appearance, demo toggle, demo fixture additions (with DEMO owner rules) | all 12 worlds render every screen; keep/star/use work; demo preview toggle; contact sheets on `review/worlds` |
| UI-4b Home and timelines | UI-4a merged for tokens; DB-3 for live stages (demo first) | `src/ui/timeline/**`, `src/features/home/**`, project screen timeline | Home matches the lab's Today tab; three variants; checkpoint sheet; e2e `home.spec.ts` updated |
| UI-4c Atlas v2 | DB-3 for live topics (demo first) | `src/features/atlas/**` | Orbits, Branches, Outline as §7; minimap; no overlapping labels at any zoom in the review screenshots |

Every UI-4 PR attaches screenshots from the `review/**` workflow for at least `obsidian`, `graph`, `journal` and `nebula`, and the lab's matching screen for comparison.
