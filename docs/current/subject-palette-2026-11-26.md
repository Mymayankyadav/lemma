## Balanced subject palette and HTML token reference — review draft

The owner requested the warm-theme subject colors for chips, emblems, progress bars and related UI, plus a standalone HTML token reference. N254 includes this follow-up to `palette-2026-11-26.md` and awaits the owner's approval.

The palette in `src/ui/v7/design-tokens.json` starts with the supplied OKLCH targets. The owner authorized small adjustments to meet the existing separation requirements. Analysis uses sky, Algebra ochre, Topology teal, Logic sage and Geometry lavender. Number theory uses copper, Probability periwinkle and Combinatorics olive. All eight remain outside the reserved 330°–30° region. The generator checks family assignments and emits matching CSS, Figma variables and standalone HTML.

The neutral and accent tokens, original five tiles, and ochre and teal strokes retain their supplied values. The sky stroke is `#2b71a6` in light mode and `#7bb3ed` in dark mode. The HTML reference lists the original and adjusted strokes, status colors and three additions.

Subject chips, settings swatches, charts, calendar subject indicators, tutor subject accents, illustrations, and progress fills inherit the new colors. Legacy calendar indicators no longer use rose or status colors for subjects. Progress tracks use `#e8e6dc` by day and `#45453f` at night; due badges stay neutral. The old per-subject darkening adjustment is removed because the calibrated strokes pass the same 3:1 illustration-contrast requirement directly.

Path-card tiles are 72 × 72px with 10px corners; the corresponding card column shrinks to 72px. Other layout, typography and behavior are preserved. At the inspected 1280px width, Real Analysis and Linear Algebra each fit on one line. Every emblem tier uses 1.75px non-scaling strokes, full-opacity main shapes and 50% helpers, in a 64-unit SVG frame. Topology uses one knot line with preserved over/under crossings instead of parallel tube outlines. SVG and PNG exports use the same coordinate transform as the app.

`public/ui-tokens.html` is a self-contained review file with embedded fonts, both themes, eight subject tiles, all family assignments, path cards, chips, buttons, status and neutral-badge samples, live contrast ratios, copyable token values and CSS/JSON downloads. It is visibly marked as awaiting approval. Regenerate or check it with `node scripts/v7/generate-tokens.mjs [--check]`; the separate `scripts/v7/generate-token-preview.mjs` also works.

Validation:

- The production build, TypeScript, PWA artifacts and 55-asset brand checks pass.
- 562 unit tests across the v7, calendar and legacy-token suites pass across the main run and the focused correction run. The obsolete darkening test now checks the actual supplied strokes against the unchanged 3:1 threshold. Emblem snapshots reflect the requested line weight, opacity and single knot; stroke budgets and determinism remain checked.
- 12 browser checks pass: both themes at 390px/1280px, exact subject and track colors, neutral due badges, 72px/10px tile geometry, 1.75px strokes, 50% helper opacity, single-line Topology, visible background grids, illustration contrast, and HTML theme switching/downloads/mobile overflow.
- Rendered the app and token reference in both modes; inspected the desktop Paths view and desktop/mobile HTML previews.

After calibration, the existing four-mode design gate passes text and illustration contrast and all eight categories under normal vision, protanopia and deuteranopia. The legacy CIEDE2000 test also passes for the rose accent, warning and error. The calibration uses the existing thresholds.
