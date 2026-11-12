# r3 · Illustrations, animations and icons

**New in r3 (12 Nov 2026, late evening), on commit `d741617`.** An audit of the drawings, motion and iconography that landed after r2: the A2 empty-state illustrations (N127, redrawn in N128), the A3 Lottie moments (N129), the icon set the v7 screens use, and the Android launcher, shortcut and Quick Settings icons. Read as an illustrator, a motion designer and an icon designer would.

This file **adds to** r2. It does not replace any r2 recommendation except where §6 says so, and it respects the Owner's decisions: D6 (the plain line-art house style), D7 (the dotLottie player and its cost) and D8 (Claude draws the assets).

Boards: `visuals/15-illustrations-audit.jpg`, `16-animations-audit.png`, `17-icons-audit.png`, `18-r3-proposals.png`.

---

## 1. Method

| What | How |
|---|---|
| Illustrations | The nine drawings re-drawn from the exact markup in `src/ui/v7/Illustration.tsx` with the v7 role colours (Day and Night), measured in their own 240 × 180 units (extent, centre offset from the disc, ink area), contrast computed from `design-tokens.json` for the brand accent and all eight subject colours, and captured in context in the app (390 × 844, Day and Night) |
| Animations | The three files in `src/ui/v7/lottie/` rendered frame by frame (every sixth frame, Day and Night) with the app's own player (`@lottiefiles/dotlottie-web` 0.81.0) and the same theming as `lottie.ts`; the last frame compared with its still pixel by pixel; timed inside the running app with a recorder in the page (motion allowed); a 3× screen captured to compare sharpness |
| Icons | Every icon the v7 code imports (72 from lucide-react 1.64.0) drawn from the installed package; rendered size and stroke measured on twelve screens at 390 and 1280 px; each icon's uses traced in the code; the Android shortcut and tile icons read from `android/` and drawn as the launcher shows them |
| Not done | No device, so Android shortcut and tile icons are shown as the code builds them, not photographed; no screen reader; the busy account |

Scripts: `evidence/tools/` (`lottie-frames.*`, `lottie-patched.cjs`, `still-diff.cjs`, `il-measure.cjs`, `icon-measure.cjs`, `r3-incontext.cjs`, `r3-timing.cjs`, `r3-fullpage.cjs`).

---

## 2. Scores

On the same scale as the main audit (“would a stranger trust this?”), out of 10.

| Area | Score | In one line |
|---|:-:|---|
| Illustrations, Day | **7.5** | A clean, consistent family. One drawing says the wrong thing; sizes drift |
| Illustrations, Night | **6** | The tonal order inverts: objects become holes, the moon goes dark |
| Animations | **6.5** | Well paced and on-brand frame by frame; the swap from the still, the ending timers and one half-weight outline let it down |
| Icons (web) | **6.5** | One good library used loosely: one glyph for seven ideas, weights from 1.2 to 2.3 px |
| Android icons | **5.5** | The launcher icon is good; the shortcut menu mixes two styles and both Quick Settings tiles look the same |

**What is right and should be protected:** one line weight, round caps and joins, a single accent per drawing, every colour a theme role, under 520 bytes per drawing, decorative to screen readers (`aria-hidden`), badges at a consistent 4-unit inset from the object's corner; animations that play once, ease out with no overshoot, take colours from the theme at play time, never load under reduced motion, self-host the renderer and keep it out of the precache; two of three animations end on their still to the pixel.

---

## 3. Findings

### 3.1 Illustrations (IL)

| # | Severity | Finding | Evidence |
|---|---|---|---|
| **IL1** | Major | **Night inverts the tonal order.** Objects are filled with `surface-raised`. By day that is lighter than the disc (paper #FEFCF9 on #E9E4DC); at night it is darker (#11192C on #1E263B, 1.16 : 1 the wrong way). The tray, lens, calendar page, clock, clipboard and cards read as cut-outs, and the moon of Day closed, the one object that should glow, is the darkest shape on screen. The Lottie theming reads the same role, so the animations invert too | Board 15; in-app Night captures |
| **IL2** | Major | **“No cards match” draws “zoom out”.** A lens with a minus sign is the standard zoom-out control in browsers, maps and image viewers. The empty state means “searched, found nothing” | Board 15; `evidence/captures/r3/il-cards-*.png` |
| **IL3** | Moderate | **Optical size varies by about half.** Ink area runs from 4.5k units² (the tray) to 7.8k (the route); the tray, clock and lens cover 57–66% of the route's area, so the same disc looks emptier on Inbox, Progress and Cards. Day closed sits 8 units low and 4 left of the disc's centre (its ∎ hangs below the moon); every other drawing is within 4 | `evidence/il-measure.json` |
| **IL4** | Moderate | **Subject accents under 3 : 1 on the disc, by day.** The accent is each drawing's one meaningful detail. Against the disc: topology 2.72, number theory 2.86, probability 3.05, combinatorics 3.08; the tick on a topology badge 3.17. Brand indigo is 7.14; Night passes for every subject (4.9–9.0) | Board 15 |
| **IL5** | Moderate | **Two empty states start below the fold.** Calendar Day with nothing planned shows an empty grid; the drawing and its line (“Nothing planned. Tap the grid to add a block.”) sit at 915 px of an 844 px screen. Progress on Today shows “0 min”, an empty chart and stats first; its drawing is at 1,114 px, inside “Time by subject”. Progress also prints “You studied 0 min in this range, most on Thu 12 Nov.” | Full-page captures |
| **IL6** | Minor | **Two marks for “done”.** A ✓ badge on Review (caught up), Inbox zero, Tasks and Round complete; ∎ only on Day closed. Both say “done”, so neither carries a specific meaning | Board 15 |
| **IL7** | Minor | **Six sizes without a rule.** Drawn at 120, 140, 144, 150, 160 and 180 px on different screens, so the 3-unit line is 1.5 to 2.25 px | In-app measurement |
| IL8 | Minor | The Progress clock is described as “waiting at twelve” but its hands read about 12:20 | `Illustration.tsx` |

### 3.2 Animations (LT)

| # | Severity | Finding | Evidence |
|---|---|---|---|
| **LT1** | Major | **Drawn, erased, drawn again.** `LottieMoment` shows the finished still at once, then replaces it with the canvas, which starts at frame 1: an empty disc. Measured on Inbox zero: still at 88 ms, playing at 144 ms. With the player cached that is a 56 ms flash of the finished picture; on a first visit, by design, up to 700 ms of it, then it vanishes and is drawn again | `evidence/captures/r3/timing.json` |
| **LT2** | Major | **Softer than the still on most Android phones.** The canvas is always twice the CSS size (`width * 2` in `LottieMoment.tsx`). On 2.6–3.5× screens it is upscaled, so the line and the tick blur at the moment the picture should settle | `lt-inbox-dpr3-*.png` |
| **LT3** | Major | **Day closed leaves before it is read.** `CloseDayV7.tsx` returns to Today on a timer (`reduced ? 400 : 2600` ms). Measured: 2.66 s with motion (one second to read the finished picture), **0.46 s with reduced motion**. People who turned motion off barely see the day's ending | `timing.json`; line 116 |
| **LT4** | Moderate | **Paint before ink.** The tray's and the moon's fills fade in (frames 4–16 and 6–26) while their outlines are still being drawn (4–40 and 4–44), so a pale ghost shape appears and is then traced | Board 16, frames 6–12 |
| **LT5** | Moderate | **A bare dot before the tick.** The badge's disc grows over 18 frames before its tick starts, so for about 0.2 s it reads as an unread-notification dot | Board 16, frames 48–54 |
| **LT6** | Moderate | **Round complete ends lighter than its still.** In `scripts/lottie/build.mjs` both card groups list their fill before their stroke; Lottie paints the first style on top, so the paper covers the inner half of each outline and the cards finish at 1.5 units instead of 3. 1,214 pixels of the last frame differ from the still; with the order swapped, 8 do | Board 16; `round-complete-diff.png` |
| **LT7** | Moderate | **1.24 MB of renderer for three 4 KB drawings.** About 505 KB compressed, plus a 63 KB player script, fetched on the first moment that plays. On a first web visit it often misses the 700 ms window, so it is downloaded and not shown. No check for Save-Data or a slow connection. The Owner approved the cost (D7); guard rails are cheap | Build output |
| LT8 | Minor | **Endings with no feel.** No haptic when the ✓ or ∎ lands, though the vocabulary defines `complete` and the Android app now plays it through the system engine | Code |
| LT9 | Minor | **Stars and badges grow from nothing** (scale 0 → 100). Against “drawn with a compass”, stars could fade in from 70% and a badge's ring could draw before it fills | Frames |
| LT10 | Minor | If the theme changes while a finished animation is on screen, the canvas keeps the old colours (it is themed once at play) | Code |

Measured timing:

| Moment | Length | Drawing | Accent lands |
|---|---|---|---|
| Inbox zero (L-11) | 1.50 s | 0.07–0.77 s | 0.73–1.23 s |
| Round complete (L-10) | 1.60 s | 0.10–0.83 s | 0.83–1.33 s |
| Day closed (L-12) | 1.60 s | 0.07–0.73 s | 1.07–1.33 s (∎) |

### 3.3 Icons (IC)

| # | Severity | Finding | Evidence |
|---|---|---|---|
| **IC1** | Major | **One glyph, seven meanings.** `Layers` (a stack) is Review in the tab bar, Cards in Search, “Review now”, a single card in Capture, “23 cards due”, “Practice due today” and “Switch path”. `Target` is Checkpoints in Search, practice due in the Calendar and a block linked to a checkpoint. `Flag` is both a target date and a deadline. `Star` is concepts, the Easy grade and a demonstrated checkpoint. Today's “Needs you” card shows the same stack for two different jobs, one above the other | Code: `searchIcons.ts`, `CaptureSheet.tsx`, `V7Today.tsx`, `V7Path.tsx`, `V7CalendarDay.tsx`, `AgendaList.tsx`, `DayGrid.tsx`, `Status.tsx` |
| **IC2** | Moderate | **Line weight drifts with size: 1.17 to 2.33 px.** Lucide's 2-unit stroke scales with the icon. Measured on screen: 57 icons at 1.67 px (20 px icons), 48 at 1.83 px (22 px), 13 at 2.0 px (24 px), and outliers at 1.17 (14 px dates and flags), 1.33 (16 px chevrons) and 2.33 (the 28 px tick). The plan specifies 1.75 px | `evidence/icon-measure.json` |
| **IC3** | Moderate | **Three line families side by side.** Lucide at 2 units, the drawn marks (`marks.tsx`) at 1.75, the grade glyphs at 1.6 on a 16-unit grid (2 px when shown at 20 px). The drawn Inbox-zero mark and lucide's Inbox are the same object at two weights and corner radii | Board 17 |
| **IC4** | Major | **Android: two styles in one menu, two tiles with one face.** The long-press menu shows three notebook-page icons from the web generator (Review, Inbox, and a star) beside two solid indigo discs from N123 (Quick focus, Capture). The dynamic “Review *n*” repeats the static Review's icon, and **“Resume *path*” borrows the Atlas star**. Both Quick Settings tiles (Focus and Capture) use the ℓ notification mark, so in a full panel they differ only by their words | `shortcuts.xml`, `Shortcuts.java`, `AndroidManifest.xml` |
| **IC5** | Minor | **Shapes that say something else.** An outline `Triangle` for “Changed” reads as a warning or play (the meaning is Δ); `Sparkle` for suggested blocks now signals “AI”, though they come from the learner's own planner; `Brain` for Study settings is a cliché next to literal glyphs; Atlas is `Waypoints` in one menu and `Star` elsewhere | Code |
| IC6 | Minor | Launcher icon, as r2 AW14: the themed layer drops the ∎; the foreground carries the whole page, so the grid cannot move against its background | Unchanged since r2 |

---

## 4. Re-check of r2 on `d741617`

The four merges after r2 (N126–N129) touched empty states, endings and the Android bridge. Every r2 web finding was re-measured and reads exactly as on `1a67b04`; every r2 Android finding (AW1–AW17) was checked against the new code and stands. Detail: `00_UPDATE_R3.md` §2.

One improvement outside r2's list: **N126** stopped the “could not open what was shared” toast that appeared on every return to the Android app.

---

## 5. Proposals

All within the Owner's decisions; no new dependency, no server change. Board 18 shows each one.

### P1 · Night keeps the Day's tonal order (IL1) · size S

* In Night, the illustration object fill becomes `surface-muted-hover` (#273045), lighter than the disc (#1E263B), which is lighter than the page (#091023), the same order as by day.
* Implementation: a role `--v7-il-paper` (Day: `surface-raised`; Night: `surface-muted-hover`) used by `.v7-il .page` in `illustration.css`, and by `roleColours().paper` in `lottie.ts`, so the animations follow.
* Test: in both themes, the luminance order is page < disc < object (Day reversed: object > disc and page) for every drawing.

### P2 · Three redraws in the same hand (IL2, IL3, IL6, IL8) · size S

Same 240 × 180 grid, 3-unit line, one accent, the roles of `Illustration.tsx`. Markup in `visuals/src/r3/art.js` (`R3_ART`).

| Drawing | Now | Proposed |
|---|---|---|
| IL-05 Cards, no match | Lens with a minus (“zoom out”) | The lens over an empty, dashed card; no minus |
| IL-07 Progress, no time yet | A clock at about 12:20, two thirds the size of its neighbours | An hourglass whose sand has not started to fall: fills the live area like the route and star |
| Day closed | 8 units low, 4 left | The same drawing moved up 8 and right 4 |
| Round complete | Shares Review's still (✓) | Its own still: the same cards with a ∎ badge |

**The rule behind the last row:** ✓ means *nothing is waiting* (Inbox zero, Tasks clear, Review caught up); ∎ means *you finished something* (a round, a day, a checkpoint, a path). This is r2's “one ending everywhere” narrowed to what it should mean, and it keeps the shipped Inbox, Tasks and Review drawings unchanged. The L-10 animation's last frames change accordingly (the badge draws a ∎ instead of a tick).

### P3 · Rules for the set (IL3, IL4, IL5, IL7) · size S

* **Live area:** the object fits an 80-unit box (round objects 86) inside the 132-unit disc; badges sit outside it at the bottom-right, 4 units in (as now).
* **Two sizes:** 160 px for a page's only empty state, 120 px inline; the line is then 2 or 1.5 px.
* **Placement:** the empty state appears in the first viewport. Calendar Day draws it over the visible hours, not below the grid. Progress with no time in the range shows one empty state in place of the hero, the empty chart and the stats, and never prints “most on …” for zero.
* **Accent:** the badge is always the brand indigo (it is a status mark). The subject colour goes on the object's own detail (flag, waypoint, star) and is checked at 3 : 1 against the disc; in Day, mix 20% ink into topology and number theory (and check probability and combinatorics).
* **Test:** a unit test per drawing for the live area (extent within 80 ± 6 units, centre within 3 units of the disc's), and a contrast test per subject per theme.

### P4 · Animation fixes in the files (LT4, LT5, LT6) · size S

All in `scripts/lottie/build.mjs`, then regenerate. Rendered results on board 18; patched files in `evidence/captures/r3/lottie-patched/`.

| Fix | Change | Verified |
|---|---|---|
| Ink before paint | Tray fill opacity from frames 4–16 to 30–42; moon fill from 6–26 to 34–46 (the fill follows the outline) | Frames 6 and 12 show only the line being drawn |
| Tick with its disc | The tick's trim starts 8 frames earlier, so it draws while the disc grows | Frames 48–54 never show a bare dot |
| Round complete outline | In both card groups list `stroke` before `fill` | Last frame vs still: 1,214 → 8 pixels differ |

### P5 · Playback fixes (LT1, LT2, LT3, LT7, LT8, LT10) · size S

All in `src/ui/v7/LottieMoment.tsx`, `lottiePlayer.ts` and `CloseDayV7.tsx`.

| Fix | Change |
|---|---|
| Never erase (LT1) | While the player loads, render frame 1 (the bare disc, i.e. the `bg` circle alone) instead of the still. If the player is not ready within 700 ms, fade the still in over 200 ms and stay on it. Under reduced motion the still shows at once, as now |
| Crisp (LT2) | Canvas size `width × min(devicePixelRatio, 3)` (and the same height), not `× 2` |
| Endings that stay (LT3) | Day closed stays until **Done** (it already has the button), or 5 s, **the same with or without motion**. Reduced motion means less movement, not less time |
| Guard rails (LT7) | Skip the player when `navigator.connection.saveData` or `effectiveType` is `2g`/`slow-2g`. Warm it in idle time (`requestIdleCallback`: import the module and fetch the WebAssembly) when one card is left in the Inbox or in the round, so the 700 ms window is met on the web too |
| Feel (LT8) | Fire `haptic('complete')` on the frame the ✓ or ∎ finishes (after P4: Inbox zero frame 66, Round complete 72, Day closed 80), through the player's frame event |
| Theme change (LT10) | On a theme change after play, show the still again |

### P6 · One meaning per glyph, one weight (IC1, IC2, IC3, IC5) · size M

* **Weight:** wrap the v7 shell in `<LucideProvider strokeWidth={1.75} absoluteStrokeWidth>` (lucide-react 1.64 exports it; no dependency). Every lucide icon then draws at 1.75 px whatever its size, matching `marks.tsx`. Redraw the grade glyphs on the 24-unit grid at the same weight.
* **Meanings:**

| Meaning | Now | Proposed |
|---|---|---|
| Review, cards due | Layers | Layers (its only job) |
| A card | Layers | A single card (drawn mark) |
| Practice | Layers, Target | ∫ on a card (drawn mark): a problem |
| Switch path | Layers | Arrows left and right (`ArrowLeftRight`) |
| Atlas, concepts | Waypoints, Star | A three-star constellation (drawn mark), one place one glyph |
| Checkpoint | Target | Target (its only job) |
| Target date | Flag | Flag |
| Deadline | Flag | A calendar with “!” (drawn mark) |
| Changed | Triangle | ± (drawn mark) |
| Suggested | Sparkle | A dashed square with + (drawn mark), like suggestions in the grid |

* **Where:** `marks.tsx` (six new marks, drawn on the 24 grid at 1.75 px; drafts on board 18), then `searchIcons.ts`, `CaptureSheet.tsx`, `V7Today.tsx`, `V7Path.tsx`, `V7CalendarDay.tsx`, `AgendaList.tsx`, `DayGrid.tsx`, `Status.tsx`, `SettingsV7.tsx`. The icon-resolution test gains a rule: one icon per meaning key.

### P7 · Android shortcut and tile icons (IC4, IC6) · size S

* **One recipe for every shortcut:** indigo glyph on the selection tint (as selected items look in the app), generated by `scripts/android-icons.mjs` as adaptive icons: Review (Layers), Quick focus (Timer), Capture (Plus), Inbox (Inbox).
* **Resume *path*:** that path's emblem glyph in its subject colour on its subtle tint. The web layer already draws emblems; it can pass a PNG with `shortcutsSet`. Until then, a route glyph, never the Atlas star.
* **The dynamic “Review *n*”** replaces the static Review entry rather than repeating it.
* **Quick Settings tiles:** Focus gets a timer glyph, Capture a plus; both monochrome 24 dp vectors.
* **Themed icon:** ℓ and ∎ in the monochrome layer; the grid and margin rule move to the background layer (r2 AW14).

---

## 6. What this changes in r2

| r2 says | r3 |
|---|---|
| `04` §5 “Marks, not illustrations” | **Superseded by the Owner's decision D6** (N127, N128). The illustrated set stays; P1–P3 refine it. The ∅ / ∎ / construction marks remain a fallback for “Reduce effects” only if wanted |
| `04` §7 “Coded first, defer Lottie”; E4 | **Superseded by D7** (N129). P4–P5 make the Lottie moments right; “coded first” still applies to any new moment (stamps, loader, theme transition), where an SVG prototype costs nothing to try |
| `02` U4 S2–S4 “the ∎ as the one ending” | **Narrowed:** ✓ = clear, ∎ = finished (P2). Day closed already ends on ∎; Round complete should; Inbox zero keeps its ✓ |
| `03` AN3 haptic vocabulary | Gains the ending moments (P5) |
| `03` AW14 icon details | Extended by P7 (shortcuts and tiles) |

Everything else in r2 stands.
