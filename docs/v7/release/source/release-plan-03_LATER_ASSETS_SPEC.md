# Later assets spec (phases A1–A5, after release)

## A1 · Motion v1 (no new libraries)
* **Language:** "drawn with a compass": lines and rings stroke in; surfaces fade and rise a few points; nothing bounces; one thing moves at a time; celebrations only at real endings, ≤ 1.6 s, tappable through.
* **Tokens:** `instant` 90 ms linear · `quick` 160 ms standard (0.2, 0, 0, 1) · `base` 240 ms standard · `draw` 600–900 ms in-out (0.65, 0, 0.35, 1) · `sheet` spring stiffness 380 / damping 36 · `ambient` 8–30 s sine loops (Night only, paused when off-screen). Stagger 30 ms, capped at 6 items. Translate ≤ 12 pt. See `visuals/motion-tokens.png`.
* **Implementation:** the existing `motion` package and CSS. Tokens live with the kit's motion presets (one system). Every animation reads `prefers-reduced-motion` and the in-app "Reduce effects" switch.
* **Priority list:** sheets, toast, collapsing header, list insert/remove, inbox stamps, review flip and grade, calendar block drag/accept, task complete, check-draw, emblem stroke-in on covers.
* **Budget:** zero new bytes on Today's first load (motion code loaded with the screens that use it).

## A2 · Icons and illustrations
* **Icons:** one 24 px grid, 1.75 px stroke, round caps, 2 px corner radius; filled only for selected states; ≤ 1.5 KB each, `currentColor`. Build check that every icon key resolves (introduced in R0).
* **Illustrations (empty states):** IL-01 Paths (a blank notebook page with a compass), IL-02 Calendar day (an empty ruler), IL-03 Review "all caught up" (a closed deck with ∎), IL-04 Inbox zero (an empty tray with a check), IL-05 Cards no match, IL-06 Atlas empty sky, IL-07 Progress no time yet, IL-08 Tasks done. Line-art, ≤ 12 KB SVG, `currentColor` plus one subject accent, Day/Night from tokens.
* **Process:** illustrator delivers three samples first (Owner picks the style), then the set; engineering replaces R2's simple marks.

## A3 · Lottie and Rive
* **Needs Owner approval for a new dependency.** Options: dotLottie web player (smallest maintained), lottie-web "light" build, Rive web runtime (only for the focus orbit). All loaded on demand, never on the first load of Today.
* **Format:** `.lottie` with theme slots (`ink`, `paper`, `subject`, `accent`, `success`, `danger`) so one file serves both themes and every subject; Rive state machine inputs `mode`, `progress`, `paused`, `drifted` for the orbit.
* **Budgets:** ≤ 60 KB per file (≤ 120 KB for L-01 and L-04); 60 fps on a mid-range Android; no raster images inside; frame 1 a valid still.
* **List (from the audit):** L-04 focus orbit (Rive), L-06 check-draw (if the A1 SVG version isn't enough), L-07 approve/reject stamps, L-08 copied, L-09 loader, L-10 round complete, L-11 inbox zero, L-12 day closed, L-13 checkpoint demonstrated, L-16 theme transition, L-20 splash.
* **QA:** Day and Night, 1×/2×/3×, reduced motion on, mid-range Android; the "one thing moves at a time" principle.
* **Licensing:** commissioned work owned by the Owner; no marketplace animations with attribution requirements.

## A4 · Signature moments
* **Atlas as a living sky:** stars sized by mastery, constellations drawn as subject-coloured lines, labels that avoid collisions, gentle parallax at Night, a tap that "focuses the telescope"; list view remains the accessible path.
* **Path map as a real map:** stages as regions, checkpoints placed along a drawn route, the current checkpoint lit; today's vertical list stays as the reduced-motion and screen-reader view.
* **Endings:** round complete, inbox zero, day closed, checkpoint demonstrated, each with its L-1x animation and a one-line summary.
* **Focus orbit:** a ring tracing the path's emblem once per minute (open mode) or filling as progress (Pomodoro).
* Each designed and approved first, then built behind its own flag.

## A5 · Brand and distribution
* Share images (OG 1200×630) rendered as a notebook page with the emblem: path completed, weekly summary.
* PWA / store screenshot templates: Today, Review round, Atlas (Night), Path map, Progress, in both themes with serif captions.
* Achievement seals (SVG, plus L-10 variants): first round, 7-day rhythm, 100 cards, first checkpoint, path completed ("Q.E.D."). Sparing; never a badge wall.
* Optional sound, off by default: pencil tick (grade), page turn (round complete), low chime (day closed); each ≤ 200 ms, ≤ 20 KB.
* Widgets and notification icons only if a native wrapper is built later (a PWA cannot add home-screen widgets).
