# Lemma: motion, Lottie, SVG and asset plan (Part C)

A brief for the design team. It covers the motion language, every animation by screen, the Lottie and Rive list, the emblem system, illustrations, icons and the other brand assets, with formats and budgets. IDs are referenced from `01_VISUAL_AUDIT.md` and `02_ROADMAP_TO_10.md`.

---

## 1. The motion language: "drawn with a compass"

Lemma is a geometer's notebook. Its motion should feel like **ink being drawn with a compass and ruler**, and at night like **stars resolving in a telescope**. It should never feel bouncy or "app-y".

### 1.1 Principles
1. **Draw, don't slide.** Lines, rings and emblems *stroke in* (path-length animation). Surfaces fade and rise a few points; they don't fly.
2. **One thing moves at a time.** It follows "Quiet by default": the eye always knows where to look.
3. **Motion explains cause.** An approved card flies *to* the deck; a logged block *inks in* where it lives; a completed checkpoint *lights* its star.
4. **Rewards are earned and short.** Celebrations happen only at real endings (round complete, inbox zero, day closed, checkpoint demonstrated), last under 1.6 s, and can be tapped through.
5. **Reduced motion is designed, not removed.** Every animation has a static or crossfade alternative (§1.4).

### 1.2 Motion tokens

| Token | Duration | Easing | Use |
|---|---|---|---|
| `instant` | 90 ms | linear | Pressed states, checkbox tick start |
| `quick` | 160 ms | `cubic-bezier(.2,0,0,1)` (standard) | Chips, toggles, icon swaps |
| `base` | 240 ms | standard | Sheets' content, list insert/remove, header collapse |
| `sheet` | spring (stiffness 380, damping 36, mass 1) | spring | Sheets, cards following the finger, tab-bar hide |
| `draw` | 600–900 ms | `cubic-bezier(.65,0,.35,1)` (in-out) | Emblem and ring stroke-in, map edges, check-draw |
| `celebrate` | 1200–1600 ms | composed | Lottie rewards (L-10 to L-13) |
| `ambient` | 8–30 s loops | sine | Night starfield parallax, focus orbit, star twinkle |

- **Stagger:** 30 ms per item, capped at 6 items (after that, everything arrives together).
- **Distance:** surfaces translate at most 12 pt; sheets translate their own height.
- **Opacity:** fade from 0 → 1 together with 4 pt of rise; never fade text below 0.4 while it moves.

### 1.3 Haptics (iOS UIFeedback / Android equivalent)

| Moment | Haptic |
|---|---|
| Grade tapped (Again / Hard / Good / Easy) | light impact |
| Swipe crosses the commit threshold (inbox, review, tasks) | selection tick |
| Approve or complete committed | soft success |
| Reject or delete committed | rigid impact |
| Round complete, inbox zero, day closed, checkpoint demonstrated | success notification |
| Timer start, pause, finish | medium impact |
| Error banner | warning notification |

### 1.4 Reduced motion
- Stroke-in becomes an instant draw plus a 160 ms fade.
- Springs become a 160 ms crossfade.
- Ambient loops stop on a designed still frame (frame 1 of each Lottie must be a valid static illustration).
- Swipes keep their colour tint and stamp, but the card does not rotate.
- Count-ups show the final number.

---

## 2. Motion spec by screen

### System-wide (M-SYS)

| ID | Moment | Behaviour |
|---|---|---|
| M-SYS-01 | **Collapsing header** | The large serif title scales and translates into the 56 pt bar over the first 64 pt of scroll (scrubbed, not timed). The emblem thumbnail fades in at 50%. A hairline appears when the content passes under. |
| M-SYS-02 | **Sheet open / close** | `sheet` spring from the bottom; the scrim fades 0 → 40% over 200 ms; the tab bar slides down 8 pt and fades. Drag-to-dismiss follows the finger with rubber-banding at the top. On close the content fades 60 ms before the sheet leaves. |
| M-SYS-03 | **ActionSheet rows** | Rows stagger in (30 ms, 4 pt rise). The destructive row arrives last, after the divider draws from left to right. |
| M-SYS-04 | **Toast with Undo** | Rises 12 pt and fades in 200 ms. A 2 px **countdown hairline** shrinks from right to left over the undo window (6 s). On Undo, the hairline snaps back and the affected item *reverses* its own motion (for example, a card flies back from the deck). |
| M-SYS-05 | **Tab switch** | Crossfade content (160 ms). The active pill *morphs* position (shared element) rather than jumping. The icon swaps from outline to filled with a 90 ms scale of 0.9 → 1. |
| M-SYS-06 | **Copy to clipboard** | The icon morphs from copy to ✓ (stroke draw, 300 ms), the label changes to "Copied" for 1.6 s, with a light haptic. Used for the connector address, prompts and summaries. |
| M-SYS-07 | **Capture button** | Press: scale 0.94. Long-press: a radial menu of the four types fans out from the button (M-CAP-02). It never hides independently of the tab bar. |
| M-SYS-08 | **Skeletons** | A graph-paper shimmer: a faint diagonal sheen moves across a 4 pt grid pattern (1.4 s loop) rather than generic grey bars. |
| M-SYS-09 | **Pull to refresh** | A compass draws a circle that completes as you pull; release spins it once (L-18). |
| M-SYS-10 | **Error banner** | Slides down 8 pt and fades in. The icon gives a single 2° shake. Never loops. |
| M-SYS-11 | **Number change** | Changing figures roll per digit (odometer) with tabular figures (due counts, timers, progress). |

### Today (M-TOD)
| ID | Moment | Behaviour |
|---|---|---|
| M-TOD-01 | Hero emblem | On first view of the day, the subject emblem **draws itself** in the hero card's corner (L-03 family, 900 ms), then stays still. |
| M-TOD-02 | Day strip | The "now" tick eases to the current time on appear. The next block gently pulses its outline once (not a loop). |
| M-TOD-03 | Meters | Fill from 0 with `draw` easing, staggered. On reaching the target, the bar turns success colour and a ✓ end cap draws. |
| M-TOD-04 | Needs-you row resolved | The row's check draws, the row collapses (height animation 240 ms) and the list closes the gap. |
| M-TOD-05 | Greeting | A crossfade between greetings at time-of-day boundaries; in Night the greeting sits on a faint starfield (static). |

### Focus (M-FOC)
| ID | Moment | Behaviour |
|---|---|---|
| M-FOC-01 | Start | A shared-element transition: the "Start now" button expands into the full-screen timer. The emblem scales from the hero card to the background orbit. |
| M-FOC-02 | Orbit | **L-04 / Rive:** a thin ring around the clock traces the emblem's path once per minute (Open mode) or fills as a progress arc (Pomodoro). Ambient and calm. |
| M-FOC-03 | Pause | The orbit dims to 40% and the digits soften. The pause icon morphs into play. |
| M-FOC-04 | Break | The orbit relaxes into a slow breathing circle (4 s in, 4 s out) with "Break · 4:32". |
| M-FOC-05 | Park a thought | The typed thought shrinks into a small dot that floats to a "parked" counter at the top. |
| M-FOC-06 | Drifted | A short wobble of the orbit line, plus a "Drifted · 13:52" marker that drops into place on the ring. |
| M-FOC-07 | Finish | The orbit closes into a full circle, the digits count up to the total and a "page" slides up as the finish sheet. |

### Capture and Search (M-CAP)
| ID | Moment | Behaviour |
|---|---|---|
| M-CAP-01 | Parsing | As tokens are recognised, they get a tint underline in the field, and their chip **pops out of the text** (shared element) into the chip row. |
| M-CAP-02 | Type radial | Long-press on +: four icons fan out on an arc with stagger. Releasing on one selects it. |
| M-CAP-03 | Card capture | Typing "::" flips a mini card preview (front, then back) with a 3D Y-rotation of 180° over 320 ms. |
| M-CAP-04 | Added | The sheet closes and a small token flies to its destination tab (Calendar, Review, Tasks), which bounces its icon once. |

### Review (M-REV)
| ID | Moment | Behaviour |
|---|---|---|
| M-REV-01 | Show answer | The divider **draws** across the card; the answer fades in line by line (stagger 40 ms). Maths renders before the fade starts, never mid-animation. |
| M-REV-02 | Grade | The chosen grade tile fills with its grade colour from the touch point (ink spread, 200 ms). The card exits toward the matching swipe direction. |
| M-REV-03 | Swipe | The card rotates up to 6° with the finger. A grade-colour tint grows from the leading edge, and the grade stamp ("Good · 31 days") fades in from 30% of the threshold onward. |
| M-REV-04 | Progress | The segmented progress bar fills the next dash with a short draw. |
| M-REV-05 | Undo | The previous card returns from its exit direction with a reverse spring. |
| M-REV-06 | Round complete | **L-10 "Q.E.D. seal"**, then the stats count up, then the grade bar fills segment by segment. |
| M-REV-07 | Forecast chart | Bars rise with stagger from left to right on first view only. |

### Calendar and Tasks (M-CAL, M-TSK)
| ID | Moment | Behaviour |
|---|---|---|
| M-CAL-01 | Now line | Moves continuously (once per minute) with a soft tick. The pill shows tabular time. |
| M-CAL-02 | **Drag to create** | Long-press on the grid draws the ghost block (the existing preview in `34`) and stretches it with the finger in 5-minute snaps with selection haptics. Release opens Quick add. |
| M-CAL-03 | **Accept suggestion** | Tapping a dashed suggestion "inks in": the dashed outline becomes solid with a stroke draw, then the fill floods from the left. |
| M-CAL-04 | Logged | When time is logged, the block fills with a hatch drawn on a diagonal, and a ✓ draws. |
| M-CAL-05 | View switch | Day → Week → Month morph: blocks shrink into week columns, then into dots in month cells (shared elements). |
| M-CAL-06 | Overdue triage | Each triaged item slides out in its chosen direction (Tomorrow → right, Drop → down and fade). |
| M-TSK-01 | Complete task | Swipe right or tap the checkbox: the circle fills, a ✓ draws, the title gets a strikethrough line that draws from left to right, and the row collapses after 400 ms. |
| M-TSK-02 | Reorder | The lifted row scales to 1.02 with a level-2 shadow; the others make room with a spring. |
| M-CDY-01 | Close the day | The step dots draw a line between themselves as you progress. Final: **L-11 "notebook page closes"**. |

### Paths and Checkpoints (M-PTH)
| ID | Moment | Behaviour |
|---|---|---|
| M-PTH-01 | Path card to detail | A shared-element emblem: the tile expands into the detail header emblem. |
| M-PTH-02 | Map | On open, the metro line **draws** from the first stage to "you are here" (800 ms). The current node has a slow halo pulse (3 s loop, 6% opacity change). Locked nodes fade in last. |
| M-PTH-03 | Checkpoint demonstrated | **L-13 "star lights"**: the hollow ring fills, the star points draw out, and a soft glow rings outward once. The path progress bar advances. |
| M-PTH-04 | Prerequisite tap | The connecting edge highlights and the map scrolls to the prerequisite node. |
| M-PTH-05 | Stage complete | The stage band's title underline draws, and the next stage's nodes "light" in sequence (stagger 60 ms). |

### Atlas (M-ATL)
| ID | Moment | Behaviour |
|---|---|---|
| M-ATL-01 | Night sky | **Parallax starfield** (2–3 depth layers of background points) reacting to pan and, optionally, to device tilt (gyro; off with reduced motion). |
| M-ATL-02 | Open | Constellations fade in by subject, each with a nebula glow that blooms (600 ms). Fit-to-content camera move. |
| M-ATL-03 | Select a star | Ring scales in; first-degree edges **draw** from the star outward; other edges dim to 8%; the sheet rises above the tab bar. |
| M-ATL-04 | Semantic zoom | Pinching in, a constellation glyph dissolves into its stars, whose labels fade in at a readable scale. |
| M-ATL-05 | Twinkle | In-progress stars twinkle subtly (random phase, 6–10 s). Demonstrated stars hold a steady glow. |
| M-ATL-06 | Day mode | No glow or starfield: an ink chart. Selection draws a pencil-like circle around the star (hand-drawn path, 400 ms). |

### Cards (M-CRD)
| ID | Moment | Behaviour |
|---|---|---|
| M-CRD-01 | Recall chart | The line draws from left to right; review dots pop in at their points (stagger). Selecting a dot pins a readout above the chart with a connector line. |
| M-CRD-02 | Editor preview | Switching Write ↔ Preview cross-dissolves; changed maths blocks re-typeset with a 120 ms fade, not a flash. |
| M-CRD-03 | Delete | The card shrinks to 0.96, fades and the row collapses. The toast offers Undo (M-SYS-04). |

### Inbox (M-INB)
| ID | Moment | Behaviour |
|---|---|---|
| M-INB-01 | Drag | The card follows the finger with up to 8° rotation. The next card scales 0.96 → 1 in proportion to the drag. |
| M-INB-02 | Tint and stamp | Right: a success tint from the right edge plus an "APPROVE ✓" stamp (rotated −8°, ink-stamp texture). Left: a danger tint plus "REJECT ✕". Up: a neutral tint plus "LATER". The opacity of each follows the drag distance. |
| M-INB-03 | Approve committed | The card flies along an arc into the "Cards" tab icon or deck counter, which ticks up (odometer) with a soft success haptic. |
| M-INB-04 | Reject committed | The card falls away to the left and fades; a rigid haptic. |
| M-INB-05 | Why this card? | Expands with a height animation; the reason text fades in and the source chip draws its underline. |
| M-INB-06 | Approve all | Cards fan out and stack into the deck in sequence (50 ms stagger), then a single toast appears. |
| M-INB-07 | Inbox zero | **L-12 "quiet desk"**. |
| M-INB-08 | Plan diff | Added nodes draw in with a dashed-to-solid outline; changed edges re-route with a morph. |

### Progress (M-PRG)
| ID | Moment | Behaviour |
|---|---|---|
| M-PRG-01 | Hero figure | Counts up (odometer, 600 ms) on first view per day. The delta chip slides in afterwards. |
| M-PRG-02 | Range switch | Bars morph between ranges (shared bars where possible), and the axis labels crossfade. |
| M-PRG-03 | Almanac | Active days fade in like stars appearing (random order, 400 ms total). Tapping a day shows a pinned readout. |
| M-PRG-04 | Goal reached | The meter fills, the end cap blooms into a small star (L-15 "goal star"). |
| M-PRG-05 | Calibration chart | The bars grow to their values, and the ideal markers slide into place after them. |

### Settings and onboarding (M-SET, M-ONB)
| ID | Moment | Behaviour |
|---|---|---|
| M-SET-01 | Theme switch | **Day ↔ Night transition**: a circular reveal from the tapped theme card, with the paper texture dissolving into the starfield (L-16). |
| M-SET-02 | Subject colour pick | The emblem preview recolours with a 240 ms crossfade and redraws its stroke (draw, 600 ms). |
| M-ONB-01 | Sign-in | **L-01 "emblem constructs itself"**: compass arcs and ruler lines construct the emblem behind the wordmark, then settle to 20% opacity. |
| M-ONB-02 | First-run steps | The progress dashes fill with a draw. Each step's illustration (IL-10 to IL-12) has a short entrance loop. |
| M-ONB-03 | Finish | **L-02 "notebook opens"**: the cover opens to the first page, where the first path's emblem draws. |

---

## 3. Lottie and Rive list

**Format:** dotLottie (`.lottie`) with **theme slots** for Day and Night colours, or Rive (`.riv`) where a state machine is needed (marked **R**). Budgets: **≤ 60 KB** each (≤ 120 KB for L-01 and L-04), 60 fps, no raster images inside, and frame 1 must be a valid static still.

| ID | Name | Trigger | Length / loop | Size on screen | Description |
|---|---|---|---|---|---|
| L-01 | **Emblem constructs itself** | Sign-in, splash | 1.8 s once → hold | 280 pt | Compass arcs and ruler strokes construct the Lemma ℓ emblem: points appear, arcs sweep, lines join, then everything settles to 20% behind the wordmark. Day = ink on paper; Night = white lines with soft glow. |
| L-02 | **Notebook opens** | End of first run | 1.6 s once | 220 pt | A notebook cover with a geometric pattern opens; on the first page the user's first path emblem draws; the caption "Your notebook is ready" fades in. |
| L-03 | **Subject emblem draw-on** (×8+) | Today hero, path header, subject editor | 0.9 s once | 64–200 pt | One per subject family (§4): Fourier wave, lattice, knot, spiral, polygon, tree, probability bell, combinatorial grid. Built from the same SVG source as the static emblems. |
| L-04 | **Focus orbit** **R** | Focus timer | Ambient loop, 60 s | 300 pt | A state machine with states *open* (traces the emblem path slowly), *pomodoro* (progress arc), *paused* (dimmed), *break* (breathing circle), *drifted* (wobble), *finished* (closes the ring). |
| L-05 | **Breathing break** | Focus break | 8 s loop | 160 pt | A circle expanding and contracting with the subject hue; label "breathe in / out" is optional. |
| L-06 | **Check draw** | Task complete, logged block, step complete | 0.4 s once | 20–32 pt | A circle fill plus a ✓ stroke, with an optional sparkle dot. Tinted with the success token. |
| L-07 | **Approve / Reject stamps** | Inbox swipe | Scrubbed by gesture | 120 pt | Ink-stamp textures for "APPROVE ✓", "REJECT ✕" and "LATER" (drag drives the progress). |
| L-08 | **Copy → Copied** | Copy buttons | 0.3 s | 20 pt | An icon morph from copy to check. |
| L-09 | **Compass loader** | Loading > 600 ms, pull to refresh | 1.2 s loop | 32–48 pt | A compass needle draws a circle; the pencil lifts and redraws. Replaces spinners. |
| L-10 | **Q.E.D. seal** | Review round complete | 1.4 s once | 120 pt | A tombstone ∎ / "Q.E.D." wax-seal stamp presses onto the page; tiny ink particles; the ring around the seal draws. The variant with more than 90% recall adds a gold rim. |
| L-11 | **Day closes** | Close the day, step 3 | 1.5 s once | 180 pt | Today's "page" (with tiny blocks) folds into the notebook spine; a bookmark ribbon drops; Night variant: the page becomes a star in the sky. |
| L-12 | **Quiet desk (inbox zero)** | Inbox empty | 2 s intro, then 10 s ambient loop | 200 pt | A desk lamp clicks on over an empty tray; a single star appears through the window (Night) or a sunbeam moves (Day). Very slow ambient loop. |
| L-13 | **Star lights** | Checkpoint demonstrated | 1.2 s once | 96 pt | A hollow ring fills, five points extend, a glow ring expands and fades; the star settles in subject hue. |
| L-14 | **Streak / rhythm line** | Round complete, Progress | 0.8 s | full width | A sine-like rhythm line draws through this week's study days (dots on active days). |
| L-15 | **Goal star** | Goal reached | 0.8 s | 32 pt | A meter end cap blooms into a small star. |
| L-16 | **Theme transition** | Appearance switch | 0.9 s | full screen | A circular reveal: graph paper dissolves into a starfield (or the reverse). |
| L-17 | **Error knot** | Error banner icon, offline state | 0.6 s once | 24 pt | A small trefoil knot that tangles once (a calm "something's wrong" mark, not an alarm). |
| L-18 | **Pull-to-refresh compass** | Pull gesture | Scrubbed | 40 pt | The arc completes with the pull distance; release spins it once. |
| L-19 | **Empty-state loops** (set) | Empty screens (§5) | 4–8 s subtle loops | 160 pt | Animated versions of IL-01 to IL-08 (one moving element each: a page turning, a star blinking, a pencil tapping). |
| L-20 | **Splash** | App launch | ≤ 1.2 s | 120 pt | The ℓ monogram draws in one continuous stroke, then crossfades to the app (for native wrappers). |

---

## 4. The emblem system v2 (generative SVG)

The emblems are the soul of the brand (P05), but today they vary in quality and repeat at volume (F27, F75).

**4.1 Families.** Each subject gets a mathematical family; each *path* gets a seeded variant within it.

| Subject | Family | Parameters to seed |
|---|---|---|
| Analysis | Fourier partial sums / Gibbs wave (keep: it's the best) | harmonics count, phase, amplitude envelope |
| Linear algebra | Lattice under a linear map (a sheared grid with eigen-directions) | matrix entries, grid density, highlighted eigenvectors |
| Topology | Knot / trefoil / torus curve | knot type (p, q), twist, line weight |
| Abstract algebra | Rosette / symmetry group (dihedral star) | order n, inner radius, rotation |
| Number theory | Ulam spiral or modular-multiplication circle | modulus, multiplier |
| Geometry | Ruler-and-compass construction | construction recipe, number of arcs |
| Probability | Galton board or overlapping bells | distribution parameters |
| Combinatorics | Young tableau or Catalan path grid | partition or path |
| Logic | Truth-tree or Hasse diagram | depth, branching |
| Other / unassigned | **No more identical flowers**: a seeded Lissajous curve with random a:b and δ | a, b, δ |

**4.2 Rules**
- **Seed** = hash(path id). No two paths ever share an emblem (F75).
- **Stroke widths** are designed at three sizes: tile 48–96 pt (1.5 pt), card header 160 pt (1.25 pt), hero 280 pt (1 pt plus a secondary line at 0.5 pt).
- **Colour:** Day uses the subject ink on a 10% subject paper tile; Night uses the subject line plus a 6 px outer glow at 30% on a deep subject tile.
- **Composition:** the emblem always sits *in its own area* (tile, corner, header band) and never runs behind text or buttons (F38, F53, F73). Watermarks are allowed only at 6% or less, and only behind empty space.
- **Animation:** every emblem is a single path or a small set of paths, ordered for stroke-draw (L-03).
- **Glyph** (small subject icon, I-30) and **emblem** (illustration) are a pair, designed together, so `143`'s mismatch disappears.
- **Deliverables:** a generator spec (parameters to SVG), 10 families × 6 reference seeds × 2 themes as a review sheet, plus static exports for marketing.

---

## 5. Illustrations (SVG, line-art "notebook" style)

**Style:** single-weight ink line (1.5 pt at 160 pt), one accent hue (subject or indigo), graph-paper hints, and maths motifs (compass, protractor, ∎, ∞, stars). No people and no gradients in Day; in Night, the same line art in light ink with a soft glow on the accent. Every illustration ships as SVG in two themes, plus an L-19 animated variant where noted.

| ID | Where | Concept |
|---|---|---|
| IL-01 | Search: no results (`52`, `84`) | A magnifier over graph paper, with a dashed circle around an empty cell. |
| IL-02 | Archived / Paused / Done path filters empty (`53`) | A closed notebook with a ribbon, labelled "Archive". |
| IL-03 | Review: nothing due (`161`) | A clear night sky, or a sunlit empty desk, with a single checked card. |
| IL-04 | Tasks: all done | A ruled page with all lines ticked and a pencil resting. |
| IL-05 | Inbox zero (`112`) | An empty tray beneath a desk lamp, with a star through the window (animated as L-12). |
| IL-06 | Time log: empty week (`126`) | An hourglass made of two triangles, a geometric drawing. |
| IL-07 | Calendar day empty (`39`) | A sundial whose shadow line points to "now". |
| IL-08 | New path, waiting for the tutor (`62`) | A blank map with a dotted path and a "?" star. |
| IL-09 | Insight cards (Progress) | A small set of 6 glyph-illustrations: calibration scale, rising curve, streak line, clock, brain-as-graph, balance. |
| IL-10 | First run 1: connect your tutor | Two notebooks connected by a dashed line, labelled "tutor ↔ notebook". |
| IL-11 | First run 2: first path | A compass drawing the first arc on a blank page. |
| IL-12 | First run 3: your day | A day strip as a ruler, with blocks as pencil marks. |
| IL-13 | Offline / error | The L-17 knot plus a cloud with a broken dashed line. |
| IL-14 | Sign-in background | The construction lines of L-01 as a static SVG (it must not cross the controls). |
| IL-15 | Account deleted / signed out | A notebook closing gently. |
| IL-16 | Settings › Tutor header | A small "connector" diagram. |

---

## 6. Icon set (SVG, 24 pt grid, 1.75 pt stroke)

**Must draw (missing or broken today):**
- **I-14** Close the day (a moon over a page) — today a black rectangle (F08)
- **I-15** Inbox-zero mark (a tray with ✓) — today a black rectangle (F08)
- **I-16** Suggested block (dashed rectangle with +)
- **I-17** Logged block (hatched rectangle with ✓)
- **I-18** Target date (flag)
- **I-19** Diff added (+ in a square)
- **I-20** Diff changed (Δ)
- **I-21** Drifted (a wavy arrow)
- **I-22** Park a thought (a pin on a page)
- **I-23** Concept (star; replaces the sparkle icon)
- **I-24** Checkpoint states (5 glyphs: filled star, ringed, dashed ring, hollow, faint dot)
- **I-25** Grades (↺, half-filled circle, filled circle, ★)
- **I-26** Compass (loader still)
- **I-27** Today's calendar (a calendar with a dot; replaces the sun)

**Normalise:** every existing icon is redrawn to the same stroke, corner radius and optical size. Filled variants are used only for the selected tab.

**I-30 Subject glyph set:** ∫ (Analysis), λ (Linear algebra), τ (Topology), G (Algebra), ℤ (Number theory), △ (Geometry), ℙ (Probability), (n k) (Combinatorics), ⊢ (Logic), and a custom glyph slot. These are drawn as custom icons that match the emblem families, not typed characters.

---

## 7. Other brand assets
- **App icon** (iOS / Android adaptive / PWA): the ℓ monogram constructed on a compass circle; Day = ink on paper, Night = luminous on navy (iOS 18+ dark and tinted variants).
- **Splash** (static plus L-20).
- **Notification icons:** a monochrome ℓ; reminder notifications with the subject glyph.
- **Widgets** (iOS / Android): "Next block", "Cards due" (odometer number) and "This week" (rhythm line); in two themes.
- **Textures:** graph paper (4 pt minor and 20 pt major grid at 3% / 6%), hatch pattern for logged time, Night starfield (3 layers, seeded points). All as tileable SVG.
- **Achievement seals** (SVG plus L-10 variants): First round, 7-day rhythm, 100 cards, first checkpoint demonstrated, path completed ("Q.E.D." gold). Use them sparingly and never as a gamified badge wall.
- **Share images** (OG 1200×630): a path completed or a weekly summary, rendered as a notebook page with the emblem.
- **App-store screenshot templates:** Today, Review round, Atlas (Night), Path map and Progress, in both themes, with serif captions.
- **Sound (optional, off by default):** a soft pencil tick for grading, a page turn for round complete, a low chime for day closed. Each ≤ 200 ms and ≤ 20 KB.

---

## 8. Production pipeline and QA
1. **Design source:** Figma variables for the colour, type, radius and motion tokens (`motion/duration/*`, `motion/easing/*`).
2. **Lottie:** author in After Effects or Figma (LottieFiles plugin). Export **dotLottie with theme slots** named after design tokens (`ink`, `paper`, `subject`, `accent`, `success`, `danger`), so one file serves Day, Night and all 8+ subject hues.
3. **Rive:** for L-04 (focus orbit) and, optionally, the Atlas selection ring; state machine inputs `mode`, `progress`, `paused`, `drifted`.
4. **SVG:** run SVGO (preserve `viewBox` and `id`s used for stroke-draw ordering); use `currentColor` for icons; set `vector-effect="non-scaling-stroke"` for emblems shown at many sizes.
5. **Budgets:** Lottie ≤ 60 KB (≤ 120 KB for L-01 and L-04); SVG icons ≤ 1.5 KB; illustrations ≤ 12 KB; total above-the-fold motion assets on Today ≤ 150 KB.
6. **QA:** each asset is reviewed in Day and Night, at 1× / 2× / 3×, with reduced motion on, on a mid-range Android (60 fps target, no dropped frames during sheets and swipes), and against the principle "one thing moves at a time".

---

## 9. Prioritised backlog for the design team

| Priority | Items | Why first |
|---|---|---|
| **P0 (with Phase 0)** | I-14, I-15 (broken glyphs); M-SYS-02 sheets; M-SYS-04 toast; M-INB-01 to 04 and L-07 stamps; L-06 check draw; L-08 copy | They remove "looks broken" moments |
| **P1 (with Phase 1–2)** | Icon normalisation and I-16 to I-27; I-30 glyphs; emblem v2 families (§4); IL-01 to IL-08 empty states; M-SYS-01 collapsing header; M-REV-01 to 05; M-CAL-02 to 04; M-TSK-01; L-09 loader | System coherence and everyday polish |
| **P2 (Phase 3 signature)** | L-01, L-02, L-04 (Rive), L-10, L-11, L-12, L-13; M-ATL-01 to 06; M-PTH-02 to 05; M-FOC-01 to 07; L-16 theme transition | The moments people screenshot and share |
| **P3 (Phase 4 brand)** | App icon set, widgets, splash, seals, share images, store templates, optional sound | Distribution and retention |

**Suggested team split:** a motion designer (Lottie / Rive: L-series), an illustrator (IL and emblem families), an icon designer (I-series), a product designer (component specs and the M-SYS pieces) and a data-viz designer (chart rules, Atlas, map). Each pair reviews the others' work against `154`'s six principles.
