# Design specification: Amber on Obsidian

Home, the project timeline, the Atlas and Appearance are now governed by `lab.md` (round 2, 30 Oct). Sizes, colours, elevations and effect defaults are governed by `themes.md` (owner feedback, 30 Oct: smaller text, denser layout, calmer look, selectable themes). Visual source of truth, in this order: this file, the boards in `docs/design/canvas/` (open them in a browser or read their inline styles for exact values), and the owner's reference image `docs/design/reference-amber-on-obsidian.png`. The owner approved the canvas on 29 Oct 2026. When this file and a board disagree, this file wins.

## 1. Direction

**Principle: light marks what you know.** Amber appears only on the one primary action per screen, progress, learned things (done checkpoints, demonstrated ideas), due counts and live items (the current checkpoint, the resume spark). Everything else is dark glass.

Kept from the reference image: obsidian ground; amber accent and amber primary buttons; rounded slabs; bottom tab bar (Home, Projects, Review, Insights) with the active item in amber; the Resume card on Home; numbered checkpoints with the current one expanded; the Knowledge Atlas as clustered constellations with filter chips, zoom controls and a bottom sheet; card review with breadcrumb, progress, Sure/Unsure/Guess and Again/Hard/Good/Easy with coloured dots and intervals; the session record with goal badge, reasoning record, misconception and proposals; Insights with range switch, tiles, recall line, reviews by day, time by subject and checkpoint activity.

Changed or added on purpose:
- Less text: icons and numbers carry meaning; labels only where a number would be ambiguous.
- More negative space: 24 px gutters, fewer elements per screen, no decorative widgets.
- Depth: layered slabs, glass overlays, inner top light, long soft shadows, an amber "lamp" glow and film grain.
- Motion with purpose (§7), animated SVG illustrations, a serif math face.
- Confidence before reveal (one tap reveals), calibration insight, swipe-to-approve stack, proposed checkpoints shown on the path, re-check rings, a plug animation for the connector.
- No fake status bar. Real devices draw their own.

## 2. Tokens (`src/styles/tokens.css`)

Define every value below as a CSS custom property on `:root` and map colours, radii and fonts into Tailwind with `@theme` (task P0-A). The app is dark only (`color-scheme: dark`).

### 2.1 Colour

| Token | Value | Use |
| --- | --- | --- |
| `--obsidian` | `#0D0C11` | page ground |
| `--obsidian-deep` | `#09080D` | Atlas ground |
| `--slab` | `#17161D` | hero slabs |
| `--tile` | `#141319` | tiles, quiet slabs |
| `--raised` | `#1B1A22` | review and proposal cards |
| `--raised-2` | `#24232C` | segmented thumb, pressed |
| `--sheet` | `#16151C` | sheets |
| `--well` | `#0F0E14` | inputs, code |
| `--glass` | `rgba(26,25,33,0.78)` | tab bar, floating controls |
| `--glass-strong` | `rgba(24,23,31,0.82)` | bottom sheets |
| `--edge` | `rgba(255,255,255,0.07)` | default border |
| `--edge-2` | `rgba(255,255,255,0.12)` | raised border |
| `--edge-3` | `rgba(255,255,255,0.18)` | grabbers, strong lines |
| `--fill-1` | `rgba(255,255,255,0.04)` | ghost buttons |
| `--fill-2` | `rgba(255,255,255,0.08)` | tracks, empty rails |
| `--ink` | `#F4F0E6` | primary text |
| `--ink-soft` | `#C9C4D1` | answers, secondary serif |
| `--ink-2` | `#ACA7B5` | labels |
| `--ink-3` | `#8C8796` | captions (lowest allowed for text) |
| `--ink-4` | `#5F5B68` | decoration only, never text |
| `--amber` | `#F7B538` | accent |
| `--amber-hi` | `#FFD47E` | current item core |
| `--amber-glow` | `#FFE3A6` | sparks, end dots |
| `--amber-deep` | `#D98E1C` | gradient end |
| `--amber-ink` | `#1E1405` | text on amber |
| `--amber-tint` | `rgba(247,181,56,0.10)` | glyph tiles, callouts |
| `--amber-tint-2` | `rgba(247,181,56,0.12)` | selected chips |
| `--amber-line` | `rgba(247,181,56,0.25)` | amber borders |
| `--amber-line-2` | `rgba(247,181,56,0.55)` | selected borders |
| `--again` | `#F2545B` | grade Again, danger |
| `--hard` | `#F39A4B` | grade Hard |
| `--good` | `#F7B538` | grade Good |
| `--easy` | `#4FC88E` | grade Easy, success |
| `--success-tint` | `rgba(79,200,142,0.12)` | goal met |
| `--danger-tint` | `rgba(242,84,91,0.08)` | reject |
| `--violet` | `#A495FF` | slab sheen, Topology nebula |
| `--cyan` | `#62CBE6` | Linear Algebra nebula |
| `--rose` | `#F28FAD` | subject hue option |
| `--lime` | `#A8D66B` | subject hue option |

Subject hues (`amber`, `violet`, `cyan`, `rose`, `lime`, `slate` = `#8C8796`) appear only as faint Atlas nebulae and subject glyphs.

Gradients:

| Token | Value |
| --- | --- |
| `--grad-lit` | `linear-gradient(180deg, #FFCD66 0%, #F2A92C 100%)` |
| `--grad-orb` | `radial-gradient(circle at 35% 30%, #FFE08F, #F7B538 55%, #D98E1C)` |
| `--grad-rail` | `linear-gradient(90deg, #D98E1C, #F7B538)` |
| `--grad-sheen` | `linear-gradient(165deg, rgba(164,149,255,0.08) 0%, rgba(164,149,255,0) 42%)` |
| `--grad-lamp` | `radial-gradient(85% 50% at 8% -6%, rgba(247,181,56,0.13), rgba(247,181,56,0) 62%), radial-gradient(70% 40% at 108% 26%, rgba(164,149,255,0.08), rgba(164,149,255,0) 60%)` |

### 2.2 Type

- `--font-ui`: `'Instrument Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif` (Google Fonts, weights 400, 500, 600, 700, italic 400).
- `--font-math`: `'STIX Two Text', 'Times New Roman', serif` (Google Fonts, 400, 500, 600, italic 400, 500). Card text, tutor questions and goals in serif. KaTeX draws formulas with its own fonts.
- All numbers: `font-variant-numeric: tabular-nums`.

| Role | Size / weight / tracking / line height |
| --- | --- |
| Numeral XL | 64 / 600 / −0.04em / 0.9 |
| Numeral L | 38–40 / 600 / −0.03em / 1 |
| Title | 28 / 600 / −0.02em |
| Title S | 24–26 / 600 / −0.02em |
| Headline | 19 / 600 / −0.01em |
| Body L | 16 / 500 |
| Body | 15 / 400 |
| Label | 13 / 400, `--ink-2` |
| Caption | 12 / 400, `--ink-3` |
| Micro | 11 / 600 (tab label, legends) |
| Math card front | serif 27 / 1.3 (24 in proposals, 22 in card detail) |
| Math answer | serif 23 / 1.45, `--ink-soft` |
| Tutor question | serif italic 21 / 1.32 |

No all-caps labels. Sentence case everywhere.

### 2.3 Shape, space, depth

| Token | Value | Use |
| --- | --- | --- |
| `--r-hero` | 28px | hero slabs, review and proposal cards |
| `--r-sheet` | 32px | top corners of sheets |
| `--r-slab` | 22px | slabs, tiles |
| `--r-btn` | 17px | 52–56 px buttons |
| `--r-ctl` | 14px | icon buttons, inputs, segmented |
| `--r-chip` | 999px | pills |
| `--r-s` | 10px | small chips, glyph tiles 32 px |
| `--gutter` | 24px | screen side padding |
| `--e-slab` | `inset 0 1px 0 rgba(255,255,255,0.06), 0 34px 60px -30px rgba(0,0,0,0.95)` | |
| `--e-card` | `inset 0 1px 0 rgba(255,255,255,0.07), 0 40px 70px -30px rgba(0,0,0,0.95)` | |
| `--e-float` | `inset 0 1px 0 rgba(255,255,255,0.07), 0 26px 50px -14px rgba(0,0,0,0.85)` | |
| `--e-lit` | `inset 0 1px 0 rgba(255,255,255,0.5), 0 14px 32px -12px rgba(247,181,56,0.75)` | |
| `--e-orb` | `inset 0 1px 0 rgba(255,255,255,0.55), 0 16px 40px -10px rgba(247,181,56,0.8)` | |
| `--blur-glass` | `blur(22px) saturate(150%)` | |

Layout constants: top inset = `max(env(safe-area-inset-top), 12px) + 16px` (the boards use 58 px because they assume a 42 px status bar); tab bar 64 px high, inset 16 px left/right and `20px + env(safe-area-inset-bottom)` from the bottom; scrolling content leaves `108px + env(safe-area-inset-bottom)` at the bottom when the tab bar shows.

### 2.4 Motion tokens

| Token | Value |
| --- | --- |
| `--ease-out` | `cubic-bezier(.16, 1, .3, 1)` |
| `--ease-in-out` | `cubic-bezier(.65, 0, .35, 1)` |
| `--ease-in` | `cubic-bezier(.4, 0, .6, 1)` |
| durations | fast 140 ms, base 220 ms, slow 360 ms, enter 600 ms, reveal 500 ms, deal 550 ms, grade 420 ms |
| springs (`motion`) | gesture `{stiffness: 380, damping: 32}`, sheet `{300, 30}`, snappy `{500, 40}`, pop `{420, 18}` |

`src/ui/motion.ts` exports the same values plus the variants in §7.

## 3. Surfaces (`src/styles/surfaces.css` classes, wrapped by components)

| Class / component | Recipe |
| --- | --- |
| `.ground` / `Ground` | `--obsidian` + `--grad-lamp` (fixed, behind content) + grain: an SVG `feTurbulence` (`baseFrequency 0.85`, `numOctaves 2`) at opacity 0.07 with `mix-blend-mode: overlay`. Lamp position per screen: Home top-left, Review top-right, Card and Approve centre, Atlas none (deep ground and starfield). |
| `.slab` / `Slab` | radius 28, padding 22, background `--grad-sheen` over `--slab`, 1 px `--edge` border, `--e-slab`. Optional inner lamp: absolute 280 px circle at top-right, `radial-gradient(closest-side, rgba(247,181,56,0.30), transparent)`, breathing 7 s. |
| `.tile` / `Tile` | radius 22, padding 16, `--tile`, 1 px `rgba(255,255,255,0.06)`, inset top light only. |
| `.card` / `Card` | radius 28, padding 26 × 24, `--grad-sheen` over `--raised`, 1 px `rgba(255,255,255,0.08)`, `--e-card`. Stack mode adds two ghost layers behind: inset 11 px / 22 px, shifted down 13 px / 26 px, colours `#16151C` / `#121117`. |
| `.glass` / `Glass` | `--glass` (or `--glass-strong`), `backdrop-filter: var(--blur-glass)` (with `-webkit-` prefix), 1 px `rgba(255,255,255,0.07–0.09)`, `--e-float`. |
| `.lit` | primary button: `--grad-lit`, `--amber-ink` text 600, `--e-lit`, height 52 (56 for bottom actions), radius 17–18. |
| `.orb` | round primary (Start, Approve): 64–76 px circle, `--grad-orb`, `--e-orb`, halo ring (1.5 px amber at 0.55–0.6) expanding 1 → 1.45–1.55 and fading, 2.8 s loop. |
| `.ghost` | `--fill-1` background, 1 px `rgba(255,255,255,0.08)`, `--ink`. |
| `.well` | inputs: `--well`, 1 px `rgba(255,255,255,0.09)`, radius 14, height 48, 16 px text. |

## 4. Icons

Lucide via `lucide-react`. Default 22 px, stroke 1.75 (checks 2.2–2.6). Icon-only buttons always have `aria-label`.

| Meaning | Lucide name | Meaning | Lucide name |
| --- | --- | --- | --- |
| Home | `house` | Projects | `folder` |
| Review, cards | `layers` | Insights | `chart-column` |
| Atlas | `waypoints` | Proposals | `inbox` |
| Settings | `sliders-horizontal` | Resume, session | `message-circle` |
| Claude | `sparkles` | ChatGPT | `bot` |
| Goal | `target` | Hint | `lightbulb` |
| Attempt, edit | `pencil-line` | Misconception | `triangle-alert` |
| Book, source | `book-open` | PDF | `file-text` |
| Time | `clock` | Paused, history | `history` |
| Re-check | `rotate-ccw` | Mix decks | `shuffle` |
| Undo | `undo-2` | Note for tutor | `message-square-plus` |
| Copy | `copy` | Show key | `eye` / `eye-off` |
| Delete | `trash-2` | Pause card | `pause` |
| Connector | `plug` | New address | `refresh-cw` |
| Locked | `lock` | Pretest, Why | `circle-help` |
| Sure | `circle-check` | Unsure | `circle-dashed` |
| Guess | `circle-help` | Explanation | `message-circle` |
| Evidence | `circle-check` | Download | `download` |
| Zoom | `zoom-in` / `zoom-out` | Fit | `maximize` |
| Calendar | `calendar` | Sign out | `log-out` |
| Quiz style | `zap` | Examples style | `list` |
| Visual style | `eye` | Link, prerequisite | `link` |

Subject glyphs are characters, not icons: serif italic in a rounded tile (32–40 px, radius 10–13). Featured or active project: `--amber` on `--amber-tint`; others: `--ink-2` on `--fill-1`. Glyph choices offered: `∫ ∑ τ λ ∂ ∇ ℝ ℂ π ∞ ⊗ ≅`.

No Claude or ChatGPT logos: use the icons above with the product name in text.

## 5. Components (`src/ui/`, tasks UI-1 and UI-2)

Every component lives in its own file, exports a typed props interface, follows tokens only (no raw hex in feature code) and appears in the `/kit` gallery in every state.

| Component | Props (key ones) | Notes |
| --- | --- | --- |
| `Ground` | `lamp: 'tl' \| 'tr' \| 'center' \| 'none'`, `deep?` | background layers |
| `Screen` | `title?`, `back?: string`, `actions?`, `tabBar?: boolean`, `children` | top inset, gutter, bottom padding, entrance stagger |
| `TabBar` | — | 4 items; active: icon + 11/600 label + amber drop-shadow glow; inactive: icon only (`--ink-3`) with `aria-label`; Review shows a due badge (amber pill, 10/700, `--amber-ink`) |
| `IconButton` | `icon`, `label`, `to? \| onClick?`, `tone: 'glass' \| 'plain' \| 'amber'`, `badge?: 'dot' \| number` | 44 × 44, radius 14; dot badge pings (scale 1 → 1.6, 2.6 s) |
| `Button` | `variant: 'lit' \| 'ghost' \| 'danger' \| 'text'`, `size: 'm' \| 'l' \| 'xl'` (48/52/56), `icon?`, `loading?` | press: scale 0.97, 120 ms |
| `Orb` | `icon`, `label`, `size: 64 \| 76`, `halo?` | |
| `Slab`, `Tile`, `Card`, `Glass` | `as?`, `lamp?` (Slab), `stack?` (Card) | §3 |
| `Chip` | `icon?`, `tone: 'quiet' \| 'amber' \| 'success' \| 'danger'`, `selected?`, `onClick?` | heights 28/32/36/40 |
| `Segmented` | `options [{value, label, count?}]`, `value`, `onChange`, `tone: 'raised' \| 'amber'` | thumb slides 350 ms `--ease-out`; amber tone = amber thumb with `--amber-ink` text |
| `Switch` | `checked`, `onChange`, `label` | 52 × 32, knob 26, amber track when on |
| `Check` | `checked \| 'mixed'`, `onChange`, `size: 20 \| 22` | amber square with check; mixed shows a dash |
| `Rail` | `value 0–1`, `sheen?`, `delay?` | 3–4 px; grows 1.1 s; one sheen pass on the active project |
| `SegmentBar` | `total`, `done`, `current?` | path progress and step dots; current segment pulses (opacity 0.35 ↔ 1, 2.2 s) |
| `StepRing` | `steps`, `current`, `spark?` | 76 px; `steps` arc segments with 8 px gaps; done amber with glow; current pulses; spark orbits once per 10 s; centre `2/4` 16/600 |
| `ProgressRing` | `value`, `label` | 52 px, stroke 4; draws on entry 1.2 s |
| `StatusNode` | `status: 'done' \| 'revisit' \| 'now' \| 'next' \| 'locked' \| 'proposed'` | 28 px: done = amber disc + check; revisit = done + dashed ring spinning (12 s); now = 2.5 px amber ring, `--amber-hi` core, glow, breathing halo; next = 1.5 px `--edge-3` ring; locked = `#15141A` disc + lock (`--ink-4`); proposed = dashed amber ring + plus |
| `Glyph` | `subject`, `size`, `active?` | §4 |
| `MathText` | `source`, `variant: 'card' \| 'answer' \| 'body'`, `cloze?: {ord, revealed}` | Markdown + LaTeX through `src/lib/render`; cloze blank shows `[ … ]` with an amber underline; revealed cloze gets an amber highlight with glow |
| `Sheet` | `open`, `onClose`, `title?`, `children` | glass-strong, radius 32 top, grabber 40 × 5; drag down to close; backdrop dims to 55 % and blurs 3 px |
| `Toast` / `useToast()` | `message`, `action?`, `tone?` | glass pill above the tab bar; `aria-live="polite"`; 4 s |
| `Skeleton` | `w`, `h`, `radius` | shimmer 1.6 s; only after 300 ms of loading |
| `EmptyState` | `art: 'compass' \| 'deck' \| 'plug' \| 'inbox'`, `title`, `body`, `action?` | see States board |
| Illustrations | `CompassArt`, `CardFanArt`, `PlugArt {connected}`, `PageStackArt`, `DoneBurst`, `Starfield` | animated SVG; static under reduced motion |
| Charts (`src/ui/charts/`) | `LineArea`, `StackedBars`, `HBars`, `GroupedBars`, `Sparkline`, `CalibrationBars` | d3-scale/d3-shape; draw-in on mount; tokens only |
| `KeyHints` | `items` | keyboard hints in review on wide screens |

## 6. Screens

Routes use a hash router (`/#/...`). Each screen lists its board, owner task and data hooks (`data.md` §9). Copy shown in quotes is exact.

### 6.1 Home `/` — `Main.dc.html` — SCR-HOME — `useHome`

1. Header (44 px): left a two-line date ("Thursday" 13 `--ink-2`, "29 October" 24/600). Right three glass `IconButton`s: Atlas (`waypoints` → `/atlas`), Proposals (`inbox`, dot badge when pending > 0 → `/proposals`), Settings (`sliders-horizontal` → `/settings`).
2. Resume slab (lamp on): `Glyph` 40 + project title (13 `--ink-2`) + checkpoint title (19/600) + state line (`history` 14 + "Paused 2 h ago" / "Live now" / "Last session 28 Oct", 12 `--ink-3`). Right: `StepRing` (current step of the checkpoint). Below: the tutor's open question (`resume.question`) in serif italic 21; if none, the checkpoint objective. Bottom row: `Button lit` "Resume" (`message-circle`), flex 1; ghost chip with the preferred app ("Claude" with `sparkles` or "ChatGPT" with `bot`, chevron) that opens a menu: Claude, ChatGPT, Copy prompt.
   - Resume builds the prompt `Resume <project title>` (open session) or `Study <project title>`, copies it to the clipboard, shows the toast "Prompt copied", and opens `https://claude.ai/new?q=<prompt>` or `https://chatgpt.com/?q=<prompt>` in a new tab. The menu choice updates `settings.preferredChat`.
   - No projects: `EmptyState compass` "Start with a book and a goal", body "Your tutor turns them into a plan.", action "New project".
3. Two tiles (grid of 2, gap 12, height 100): Due ("23", "cards due", `CardFanArt` top-right; → `/review`) and Proposals ("6", "to approve", amber inbox tile; → `/proposals`). Zero due shows "0" and "all clear".
4. Projects: header "Projects" (15/600 `--ink-2`) with an amber plus `IconButton` (→ `/projects/new`). Up to 4 rows (56 px): `Glyph` 36, title 16/500, `Rail` under the title, "3/12" right (14 `--ink-2`). Row → `/p/:slug`. More than 4: a text link "All projects".
5. `TabBar` (Home active).
- Motion: hero rises 0.7 s; tiles 0.12 s later; projects 0.22 s later; rails grow staggered by 0.1 s; lamp breathes 7 s; step ring segment pulses; spark orbits; inbox dot pings; card fan splays every 6 s.
- States: skeleton hero + tiles; error toast "Couldn't load your desk." with "Try again".

### 6.2 Projects `/projects` — `Projects.dc.html` — SCR-PROJ — `useProjects`

1. Header "Projects" (28/600) with an `Orb` 44 plus (→ `/projects/new`).
2. Featured slab: the most recently active project. A 250 px serif italic glyph at 7 % amber bleeds off the top-right and floats (±6 px, 9 s). Title 22/600; goal on one line in serif italic 16 `--ink-2`; `ProgressRing` "3/12" right; meta icons ("1 book", `layers` 48, `message-circle` 7); divider; next row (amber dot + "Compactness, step 2" + chevron) → `/p/:slug`.
3. Other active projects as tiles (radius 24, padding 18 × 20) with a 150 px ghost glyph at 3.5 % white; title 18/600, "8/14" right, `Rail`, "Next: Diagonalization" 14 `--ink-3`.
4. Projects in `planning`: tile with an amber outline chip "Needs a plan" and a copy chip "Plan <title>".
5. Paused and done projects under quiet collapsed headings "Paused" and "Done".
6. Atlas tile (96 px, deep ground, drifting mini constellation): "Atlas", "22 ideas, 3 to revisit" → `/atlas`.
7. `TabBar` (Projects active).

### 6.3 New project `/projects/new` — `NewProject.dc.html` — SCR-PROJ — `useSubjects`, `useStyles`, mutations `createProject`, `addSource`

A `Sheet` over the Projects screen (top 84 px).
1. Header "New project" (22/600) + close.
2. "Name" (well input). Default slug derives from the name.
3. Subject radio chips (glyph + name; selected: `--amber-line-2` border, `--amber-tint-2` fill). A dashed plus chip opens an inline form: name, glyph (choices in §4), hue (6 swatches).
4. "Goal" textarea (3 rows, 15/1.45). Placeholder: "What should you be able to do? What do you know already?"
5. Source: before a file, a dashed tile "Add a PDF" (`file-text`) with "Up to 50 MB". During ingest: `PageStackArt`, file name, "128/342", rail with sheen, and a status line: "Reading pages", "Uploading", check "Contents found, 11 chapters", or warning "No text found. Your tutor can't read scanned PDFs."
6. Teaching style radio chips (scroll): Socratic, Examples first, Proof workshop, Quick quiz, Visual, Short lecture.
7. `Button lit` "Create project", enabled when name, subject and goal are set (PDF optional). On press: create the project, then ingest the PDF while the sheet shows progress (button text "Reading pages 128/342"). When done, go to `/p/:slug` and show the toast "Project created. Tell your tutor: Plan <title>" with "Copy".
8. Under the button a copy chip: "Then tell your tutor" + "Plan <title>" (600) + `copy`.

### 6.4 PDF ingestion (PDF-1 provides `src/pdf/ingest.ts`; used by 6.3 and 6.5)

- Reject non-PDF and files over 50 MB with a toast ("Choose a PDF under 50 MB").
- Phases reported through `onProgress`: `reading` (page i of n), `uploading`, `saving`, `done` or `failed`.
- Extract per page with pdf.js: join text items, add a newline where `hasEOL`, merge hyphenated line breaks, collapse spaces, cap 20,000 chars per page. Page labels from `getPageLabels()`; outline from `getOutline()` resolved to page indexes (flattened with level).
- Upload the file to storage while reading; insert `source_pages` in batches of 50; set `has_text = false` when the average is under 30 chars per page.
- `short` defaults to the first word of the title, lowercase, letters only (`rudin`); de-duplicated with a number.
- A failed ingest keeps the project and shows "Couldn't read this PDF" with "Try again".

### 6.5 Project `/p/:slug` — `Path.dc.html` — SCR-PATH — `useProject`

1. Header: back (→ `/projects`), title (26/600), sub line (`book-open` + first source title, or the subject name). Right: Atlas `IconButton` (→ `/atlas?focus=<concept of the now checkpoint>`).
2. Progress: "3" (40/600) + "/ 12" (16 `--ink-3`), `SegmentBar` with all checkpoints (done amber with glow, current pulsing, rest `--fill-2`).
3. `Segmented` Path / Sessions / Sources, kept in `?tab=`.
4. Path tab: an ordered list on a rail. Each row: 36 px node column + content. Connector line under each node: solid amber (0.7) between done nodes, amber fading into the current node, dashed `rgba(255,255,255,0.14–0.18)` after it.
   - done: title 16, code 12 `--ink-3` right.
   - revisit: as done plus an amber line "Re-check due" with `rotate-ccw` 13; the node has a dashed ring spinning slowly.
   - now: breathing halo node and an expanded slab (radius 22, `--amber-line` border, sheen): title 17/600 with the code in amber; objective in serif 17/1.4 `--ink-soft`; step `SegmentBar` + "Step 2: Separate x from K" (13 `--ink-2`); chips (page "p. 36", cards "9" → `/review/run?deck=cp:<slug>:<code>`, sessions "2" → newest session); `Button lit` "Resume" (48).
   - proposed: dashed amber node with plus; title `--ink-soft` and an outline chip "Proposed"; caption "Tap to approve" → `/proposals?tab=plan`.
   - next: hollow node, title.
   - locked: lock node; title `--ink-3`.
   - After 8 rows: "5 more" with chevron.
   - Tapping any row except now opens the checkpoint sheet (6.6).
5. Sessions tab: rows of 64 px: a 36 px status tile (goal met: `--success-tint` + check; partial: amber half disc; paused: pause; not met: x), the goal (15/600), meta "S7, Wed, Claude" (12 `--ink-3`), minutes right. Row → `/s/:slug/:n`.
6. Sources tab: a tile per PDF (46 × 58 badge with amber "PDF", title 15/600, "342 pages, 11 chapters", status icon) and a dashed tile "Add a PDF" that runs 6.4 inline.
- Motion: thumb slide 350 ms; tab content rises 0.4 s; the now slab opens from scaleY 0.96 in 0.5 s.

### 6.6 Checkpoint sheet `/p/:slug/cp/:code` — SCR-PATH — `useCheckpoint`

`Sheet` over the project: title + code + status chip; objective (serif); criterion with `target`; numbered steps (done check, current dot, hollow); pages chip; prerequisite chips (tap opens that checkpoint); concept chips (→ `/atlas?focus=<slug>`); up to 8 latest events with kind icons (§4) and hint level pips; re-check line ("Next re-check 1 Nov" or "Re-check due"); buttons `lit` "Study this" (deep link `Study <project>, <code> <title>`) and ghost "Cards 9".

### 6.7 Approve `/proposals` — `Proposals.dc.html` — SCR-PROP — `useProposals`

1. Header: back (→ `/`), "Approve" (24/600), text button "Approve all" (amber 15/600) which opens a confirm sheet "Approve 5 cards?" (Approve, Cancel).
2. `Segmented` Cards (count in amber) / Plan (count), kept in `?tab=`.
3. Cards tab: a stack (two ghost slabs behind). The top proposal `Card`: meta row (kind icon + label; right: glyph, CP code, session chip "S7"), front (serif 24/1.3 via `MathText`), divider, back (serif 19 `--ink-soft`) or cloze with the amber-underlined deletion, spacer, reason line (`sparkles` + reason, 13 `--ink-3`). A `card_edit` shows "Fix for N7", a Before/After `Segmented`, and the owner's note it resolves.
4. Dots under the stack (current dot 18 px wide `--ink`, done dots amber, others `--fill-2`).
5. Actions: reject circle 62 (`--danger-tint`, `--again` x), edit circle 50 (`pencil-line`; opens an edit sheet with front/back fields and live `MathText` preview; "Approve" there approves with edits), approve `Orb` 76 (check, halo).
6. Gesture: drag the top card horizontally; it follows the finger and rotates (x / 20 degrees). Past 15 % a stamp shows (green check or red x). Release past 30 % of the width or faster than 600 px/s commits (right approve, left reject); otherwise it springs back (gesture spring).
7. Commit animation: the card flies off in 420 ms (`--ease-in`) and the next deals in 550 ms (from y 26, scale 0.95).
8. Empty: drawn ring + check, "All clear", "New cards join your next review."
9. Plan tab: one slab per pending `plan` or `plan_change` (glyph + project, "from S7"; diff rows: add = `--success-tint` plus, update = pencil, remove = x, move = arrow, prerequisite = `link`; each with a one-line explanation; reason with `sparkles`); buttons Reject (ghost) and Approve (`lit`); "See the whole plan" → `/proposals/:id`.

### 6.8 Plan proposal `/proposals/:id` — `PlanReview.dc.html` — SCR-PROP — `useProposal`

1. Header: back, "New plan" or "Plan change", meta (`sparkles` Claude or `bot` ChatGPT, glyph + project, "12 checkpoints").
2. Prerequisite map in a deep tile (radius 24): nodes placed by depth (x = 20 + level × 52, evenly spread per level), dashed edges flowing toward dependents, the selected checkpoint filled amber; nodes pop in with 70 ms stagger.
3. List: code + title + comment button per row. The selected row expands: criterion (`target`, serif 15), "Rudin pp. 36–40, 4 steps". "7 more" expander.
4. Footer line: `waypoints` "Adds 7 ideas to your Atlas".
5. Buttons: ghost "Ask for changes" and `lit` "Approve plan". "Ask for changes" opens a sheet with a text field; Send rejects the proposal, copies `Revise the plan for <project>: <text>` and opens the preferred chat (same deep link as Home). Approve → toast "Plan approved" → `/p/:slug`.

### 6.9 Session record `/s/:slug/:n` — `Session.dc.html` — SCR-SESS — `useSession`

1. Header: back (→ `/p/:slug?tab=sessions`), "Session 7" (26/600), meta row (`clock` "42 min", client icon + name, `calendar` weekday). More menu: "Copy summary", "Open project".
2. Goal slab: `target` tile 42 + goal (16) + badge: goal met = success circle with check drawn; partial = amber half disc; not met = danger x; live or paused = chip "Live" / "Paused".
3. "Reasoning": a timeline. The line draws top to bottom in 0.9 s (gradient `--ink` 0.12 → amber 0.6). Nodes 40 px with kind icons; content = kind label (15/600, hints add three 14 × 4 level pips) + body (14 `--ink-2`, math in serif). A demonstrated evidence node is filled amber with a slow glow pulse.
4. Misconception callouts: `--amber-tint` fill, `--amber-line` border, `triangle-alert`, label, "2×" chip, text button "Resolved".
5. "Cards": horizontal mini cards 150 × 112 (serif 16 front; pending = glowing amber dot, active = success check) → `/cards/:no` or `/proposals`.
6. Proposals strip (if pending from this session): `inbox` + "4 cards, 1 plan change" + "Waiting for you" + small `lit` "Review" → `/proposals`.
7. Pages row: `book-open` "Rudin, pp. 36–38" → a sheet showing the extracted text of those pages (what the tutor reads).
8. Bottom: copy `IconButton` (copies summary) + `lit` button: open session → "Resume S8" (deep link `Resume <project>`); ended → "Start <next checkpoint code and title>" (deep link `Study <project>`).

### 6.10 Review `/review` — `Review.dc.html` — SCR-REV — `useDeckTree`, `useSettings`

1. Header "Review" (28/600) + search `IconButton` (→ `/cards`).
2. Hero slab: count (64/600) + "due"; `clock` "about 9 min" (count × the owner's average seconds per card over 30 days, default 25 s). `Orb` 76 play (→ `/review/run` with the selection). Divider. Row: `shuffle` (amber) + "Mix decks" + `Switch` (saved to `settings.mixDecks`).
3. "Decks" tree: projects (level 0: `Check` 22, `Glyph` 32, title 16/500, due 15/600 amber) and checkpoints with due cards (level 1, indented 28: `Check` 20, code 12/600 `--ink-3`, title 15 `--ink-soft`, due 14 amber). Parent toggles children; partial shows mixed. Projects with nothing due show "0" in `--ink-3` and start unchecked. The selection drives the hero count.
4. "From sessions": chips of recent sessions with new or due cards (code in amber for the newest, title, count) → `/review/run?session=<id>`.
5. `TabBar` (Review active).

### 6.11 Card review `/review/run` — `Card.dc.html` — SCR-REV — `useReviewItems`, `recordReview`, `undoReview`

Full screen, no tab bar.
1. Top: close (→ `/review`, or `/review/done` after at least one answer); centre a breadcrumb (glyph + checkpoint title, 12 `--ink-3`) and "12 / 23" with a 4 px amber progress bar with glow; right `undo-2` (disabled until an answer) and `message-square-plus` (note for tutor sheet with quick actions: suspend, edit).
2. Card stack (22 px margins, about 430 px high): two ghost layers; the top card shows kind icon + label (confidence chip appears right after reveal), the front in serif 27/1.3. After reveal: a divider with a small amber diamond spark, the answer in serif 23/1.45 (cloze: filled span highlighted amber), then chips (`book-open` "Rudin p. 40", session "S7" → `/s/...`).
3. Before reveal, bottom: caption "How sure? Tap to reveal" (13 `--ink-3`), three 60 px buttons: "Sure" (`circle-check`, amber tint and text), "Unsure" (`circle-dashed`), "Guess" (`circle-help`). Each sets confidence and reveals. Under them a text button "Show answer" reveals without confidence. Keys: Space or Enter shows; 1/2/3 pick Sure/Unsure/Guess.
4. After reveal: 2 × 2 grade grid (60 px, radius 18): Again (`--again` dot) "1m", Hard "6m", Good "2d", Easy "5d". Intervals come from `FSRS.preview` formatted with `FSRS.formatIvl`. Good gets a lit amber ring when confidence was Sure. Keys 1–4 grade; Space = Good. Android: `navigator.vibrate?.(8)` on grade.
5. Grading records the review, then the card flies (Again left, Hard down-left, Good up, Easy right; 420 ms) while the next card deals. Learning cards come back as the queue says (`src/lib/queue`).
6. Undo restores the previous card (deal in reverse) and its state.
7. Empty queue → `/review/done`.

### 6.12 Review complete `/review/done` — `Done.dc.html` — SCR-REV

`DoneBurst` (ring draws 1.1 s, check draws, 8 sparks burst), "23" (64/600) "cards reviewed"; three tiles: `target` "91%" recalled, `clock` "9m" time, `rotate-ccw` "3" again; calibration line "When sure, right 19 of 20" (only with ≥ 5 Sure answers); `calendar` "18 due tomorrow"; `lit` "Done" (→ `/`); ghost "5 new from S7" when new cards remain (→ `/review/run?session=<id>&new=1`).

### 6.13 Cards `/cards` — SCR-CARD — `useSearchCards`

Same visual language as Review (no board). Header: back + "Cards" + plus `IconButton` (new card sheet). Search well (debounced 250 ms). Filter chips: All, one per project (glyph), "Has notes", "Paused". Rows (64 px): front as one line of plain serif 16 with ellipsis; meta (glyph, CP code, "in 2d", amber dot when a note is open). Row → `/cards/:no`. New card sheet: front, back, type, kind, project, checkpoint, live `MathText` preview → `createNote`. Empty: "No cards match" + "Clear filters".

### 6.14 Card detail `/cards/:no` — `CardDetail.dc.html` — SCR-CARD — `useCard`

1. Header: back, breadcrumb (glyph + checkpoint), `IconButton`s edit (sheet with front/back/type/kind/tags + preview → `updateNote`), pause/resume card, delete (confirm sheet).
2. Card slab: front serif 22, divider, back serif 18 `--ink-soft`, chips (page, session, kind).
3. Memory: "Next" "2 days", "Stability" "12 d", "Recall now" "94%" (amber); `Sparkline` (342 × 64) of interval growth with dots coloured by rating, drawn in 1.2 s.
4. "For your tutor": open notes (tile with `--amber-line` border; body 15; status line with a pulsing amber dot "Next time you ask to update cards" and age; text button "Dismiss"); addressed notes collapsed: success check + "Shortened by Claude in S6" (the proposal's origin and session).
5. Composer (glass, bottom): input "Note for your tutor" + amber send button 44 (`arrow-right`) → `addComment` → toast "Saved for your tutor".

### 6.15 Atlas `/atlas` — `Atlas.dc.html` — SCR-ATLAS — `useAtlas`

1. Deep ground with `Starfield` (two dot layers drifting over 26 s and 34 s, alternate, a few twinkles).
2. Graph SVG fills the screen behind a header overlay.
   - Nebula per subject: smooth closed path around its nodes (convex hull padded 28 px, Catmull-Rom closed curve), radial fill of the subject hue (10–12 % → 0), 1 px dashed stroke (3 6) at 28–32 %, subject label (12/600, hue at 75–85 %) at the hull's top-left.
   - Nodes: demonstrated = amber star r 6 (radial `#FFF1C9 → #F7B538 → #D98E1C`, glow); revisit = amber core r 5 + ring r 11 pulsing (scale 1 → 2.1, 2.4 s, staggered 0.6 s); in progress = r 6 dark fill, 2 px amber ring, inner dot; not started = r 4.5 hollow `--ink-4`; selected = r 10 star + 22 px halo breathing 3 s + label 13/600 `--ink`. Labels 11.5 `--ink-2`.
   - Edges: prerequisite 1 px `rgba(255,255,255,0.13)`; related dashed (2 5); edges into the selected node run an amber dash flow (1.4 s) toward it.
   - Layout: d3-force (link distance 70, charge −160, collide 26, pull toward subject centres spaced on a circle of radius 160); 300 ticks before first paint; pinned concepts fixed at `pin_x`, `pin_y`; dragging pins (`pinConcept` on drag end); long-press menu "Unpin".
   - Zoom and pan with d3-zoom (scale 0.4–3, pinch); glass pill on the right: zoom in, zoom out, fit (animates to bounds in 600 ms).
3. Header overlay: back + "Atlas" (24/600); radio chips "All 22", "Revisit 3" (`rotate-ccw`), "Demonstrated 9" (check). Selected chip: amber fill, `--amber-ink` text. A filter dims other nodes to 18 % and edges to 35 % (0.4 s).
4. Bottom sheet (glass-strong, radius 30): name (21/600) + status chip (in progress amber, revisit amber outline, demonstrated success, not started quiet); blurb (serif 16 `--ink-soft`); meta (CP codes, due cards, subject glyphs); `lit` "Open checkpoint" (first linked checkpoint sheet) and ghost "Review 9" (→ `/review/run?concept=<slug>`). Tapping empty space collapses the sheet to a hint "Tap an idea".
5. `?focus=<slug>` centres and selects that concept. Entrance: graph settles from scale 0.92 with fade (1 s); sheet rises 0.6 s after 0.3 s.

### 6.16 Insights `/insights` — `Insights.dc.html` — SCR-INS — `useInsightData`

All numbers come from `src/lib/insights` (LIB-1).
1. Header "Insights" (28/600). `Segmented` amber: "7 days", "30 days", "90 days".
2. Tiles (3 columns): `clock` "18h 40m" studied, `message-circle` "26" sessions, `layers` "412" reviews.
3. Recall slab: label "Recall" + amber percentage (30/600). `LineArea` 316 × 132: y from 80 % to 100 % with grid lines at 100/90/80 ("100%" and "80%" labels, 10 px `--ink-3`), dashed target line at `settings.desiredRetention` labelled "target 90%", amber line 2.2 px with glow, area gradient 35 % → 0, glowing end dot; x labels "30 days ago" and "today". Buckets: days for 7, weeks for 30 and 90.
4. "Reviews by day" (or "Reviews by week" for 90): legend (Again, Hard, Good, Easy) and `StackedBars` 120 px (7 or 30 daily bars, 13 weekly), growing from the bottom with an 18 ms stagger (60 ms for 7 bars).
5. "When you said": three `CalibrationBars` rows (Sure, Unsure, Guess) with the share of correct answers. Footer: "Close to ideal." when Sure ≥ 85 % and Guess ≤ 60 %; "Your sure answers miss often." when Sure < 75 %; "You know more than you think." when Unsure ≥ 85 %.
6. "Time by subject": `HBars` (glyph, bar, "9h 20m").
7. "Checkpoints": `GroupedBars` for 4 weeks (demonstrated amber, re-checked `#6B6775`), labels "W1", "W2", "W3", "This week".
8. Tiles: "Typical session" (median minutes), "Most revisited" (→ `/atlas?focus=`).
9. `TabBar` (Insights active).

### 6.17 Settings `/settings` — `Connect.dc.html` — SCR-SET — `useSettings`, `useStyles`

1. Header: back + "Settings" (26/600).
2. Connector slab: `PlugArt` (halves meet with a spark every 3.2 s when connected; apart when never used), status ("Connected" with a pulsing success dot, or "Not connected yet"), "Last call 2 h ago, Claude"; a well with the connector URL, secret masked as `••••••` (eye toggles), copy button (amber 40); text button "Make a new address" (`refresh-cw`) with a confirm sheet "The old address stops working in Claude and ChatGPT."
3. "Apps": Claude row (`sparkles`, "Phone and web", check once Claude has called) and ChatGPT row (`bot`, "Web, developer mode", amber chip "Set up" expanding the numbered steps from `connector.md` §10).
4. "Say this to start": copy chips "Resume <newest project>", "Plan <a project in planning>", "Update my cards".
5. "Teaching style": 3 × 2 radio tiles (icon + name) set `defaultStyle`; link "Tutor rules" opens a sheet with the rules text (editable, "Reset to default").
6. "Memory": "Target recall" slider 80–97 % (amber track, value 17/600 amber) with "Higher means more reviews each day."; "New cards a day" stepper (− value +, step 5, 0–60); "Tune to my reviews" runs the FSRS optimizer in a worker (needs 400 reviews; otherwise disabled with "Needs 400 reviews (you have 212)"); a result sheet shows before/after log loss and "Apply".
7. "More": "Math shortcuts" (`ℝ` glyph; sheet with the macros text and a live preview), "Download a backup" (`lemma-backup-YYYY-MM-DD.json`), "Sign out" (danger).
8. Footer: version and a "Demo data" chip in demo mode.

### 6.18 Sign in `/sign-in` — SCR-SET

Ground with lamp; a 120 px serif italic `∫` in amber with glow; "Lemma" (28/600); "Your math study record."; `lit` "Continue with Google". Skipped in demo mode. After sign-in the app calls `bootstrap()` and returns to the page the owner came from.

### 6.19 Kit `/kit` — UI-1

A gallery of every component and state in §5, grouped by section, used for review and screenshots. Visible in demo mode only.

### 6.20 Empty, loading and error states — `States.dc.html`

| Situation | Where | Design |
| --- | --- | --- |
| No projects | Home, Projects | `CompassArt`, "Start with a book and a goal", "Your tutor turns them into a plan.", `lit` "New project" |
| Nothing due | Review, Home tile | `CardFanArt`, "Nothing due", "18 cards come back tomorrow.", ghost "Learn 5 new cards" |
| Loading | any data screen | skeletons in the real layout after 300 ms |
| Offline | top of any screen | `PlugArt` apart, "Offline", "Reconnect to review and see new proposals.", ghost "Try again" (`refresh-cw`) |
| Save failed | review, approvals | toast with spinning `refresh-cw` "Answer not saved. Retrying." and "Undo"; after 3 failed retries: "Couldn't save. Check your connection." |
| Tutor not connected | Home (until the first connector call), Settings | `plug` tile, "Connect your tutor", "Add Lemma to Claude or ChatGPT once. It takes a minute.", `lit` "Show me how" (→ `/settings`) |

## 7. Motion

Motion answers a touch or marks something live. One entrance per screen; loops only on the current checkpoint, ideas to revisit, the resume spark and illustrations. Animate `transform` and `opacity` only. Pause loops when the page is hidden.

| Motion | Trigger | Spec |
| --- | --- | --- |
| Screen entrance | mount | groups rise 12 px and fade in, 600 ms `--ease-out`, 100 ms stagger; skipped when returning to a screen within 60 s |
| Tab switch | tab bar | crossfade 200 ms + rise 8 px |
| Drill-in | push route | new page slides from 24 % right and fades in (360 ms `--ease-out`); the page behind scales to 0.94 and dims (brightness 0.6); back reverses |
| Segmented | tap | thumb slides 350 ms `--ease-out`; content rises 0.4 s |
| Sheet | open/close | sheet spring; backdrop to 55 %; drag down past 25 % or 500 px/s closes |
| Deal | next card | 550 ms `--ease-out` from y 34, scale 0.94, rotate −1.5° |
| Reveal | show answer | 500 ms: rotateX −62° → 0 from the divider, blur 2 px → 0 |
| Grade | answer | 420 ms `--ease-in` exit by grade direction; next deals 120 ms later |
| Approve swipe | drag | follows finger (gesture spring); commit thresholds 30 % or 600 px/s; stamp at 15 % |
| Arc and rings | mount | draw 1.1–1.2 s `--ease-in-out` |
| Current checkpoint | live | halo scale 1 → 2, opacity 0.6 → 0, 2.4 s loop |
| Revisit | live | ring scale 1 → 2.1, 2.4 s, staggered 0.6 s |
| Prerequisite flow | selected idea | dash offset loop 1.4 s linear on incoming edges |
| Rails | mount | grow 1.1 s, 100 ms stagger; one sheen pass on the active project |
| Spark | Home hero | orbit once per 10 s |
| Count | numbers on Home, Done | count up 0 → value in 600 ms on first mount only |

Reduced motion (`prefers-reduced-motion: reduce` or `useReducedMotion()`): every transition becomes a 150 ms fade; loops and illustrations stop at their final frame; swipe still works.

## 8. Larger screens

- Under 900 px wide: the phone layout above.
- 900 px and wider: the tab bar becomes a left glass rail (88 px, icon + label); phone-style screens sit in a centred 560 px column.
- Atlas uses the full width; Insights uses two columns from 1,100 px; the project screen shows the checkpoint sheet as a right panel from 1,200 px; card review keeps the card at most 640 px wide and shows `KeyHints`.

## 9. Accessibility

- Text contrast ≥ 4.5:1: `--ink-3` is the lowest text colour; `--ink-4` is decoration only.
- Focus ring: 2 px `--amber` with 2 px offset on every interactive element.
- Touch targets ≥ 44 px.
- Icon-only buttons have `aria-label`; status nodes have text alternatives ("Done", "In progress", "Locked").
- KaTeX renders with `output: 'htmlAndMathml'` so screen readers read formulas.
- Toasts use `aria-live="polite"`. Review is fully keyboard operable (§6.11).
- Lists are `ol`/`ul`; navigation uses links; actions use buttons.
- Every screen has exactly one `h1` (visually hidden where the design shows no title, e.g. card review).

## 10. PWA look

Name "Lemma"; icon = amber serif italic `∫` on `--obsidian` with a soft glow (also maskable); theme and background colour `#0D0C11`; standalone display; portrait; start URL `/lemma/#/`. When a new version is ready, a toast "New version ready" with "Reload".

## 11. Copy rules

Sentence case; short; verbs on buttons ("Resume", "Approve", "Create project"); digits instead of number words; no exclamation marks; errors say what happened and what to do; call the chatbot "your tutor"; relative dates ("2 h ago", "Wed", "28 Oct").
