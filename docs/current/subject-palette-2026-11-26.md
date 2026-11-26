## Balanced subject palette and HTML token reference — review draft

The owner requested the warm-theme subject colors for chips, emblems, progress bars and related UI, plus a standalone HTML token reference. N254 includes this follow-up to `palette-2026-11-26.md` and awaits the owner's approval.

`src/ui/v7/design-tokens.json` contains the exact supplied five-color palette, OKLCH formula metadata, reserved hue range, emblem dimensions and light/dark progress-track values. Existing role names remain stable. Analysis uses sky, Algebra ochre and Topology teal. The other families use the same five supplied colors: Number theory uses ochre; Logic and Combinatorics sage; Geometry and Probability lavender. Family glyphs and labels remain distinct even when a hue is shared. The palette generator checks these aliases against the named colors and generates CSS, Figma values and the HTML reference together.

Subject chips, settings swatches, charts, calendar subject indicators, tutor subject accents, illustrations, and progress fills inherit the new colors. Legacy calendar indicators no longer use rose or status colors for subjects. Progress tracks use `#e8e6dc` by day and `#45453f` at night; due badges stay neutral. The old per-subject darkening adjustment is removed because the supplied strokes pass the same 3:1 illustration-contrast requirement directly.

Path-card tiles are 72 × 72px with 10px corners; the corresponding card column shrinks to 72px. Other layout, typography and behavior are preserved. At the inspected 1280px width, Real Analysis and Linear Algebra each fit on one line. Every emblem tier uses 1.75px non-scaling strokes, full-opacity main shapes and 50% helpers, in a 64-unit SVG frame. Topology uses one knot line with preserved over/under crossings instead of parallel tube outlines. SVG and PNG exports use the same coordinate transform as the app.

`public/ui-tokens.html` is a self-contained review file with embedded fonts, both themes, five subject tiles, all family assignments, path cards, chips, buttons, status and neutral-badge samples, live contrast ratios, copyable token values and CSS/JSON downloads. It is visibly marked as awaiting approval. Regenerate or check it with `node scripts/v7/generate-tokens.mjs [--check]`; the separate `scripts/v7/generate-token-preview.mjs` also works.

Validation:

- The production build, TypeScript, PWA artifacts and 55-asset brand checks pass.
- 562 unit tests across the v7, calendar and legacy-token suites pass across the main run and the focused correction run. The obsolete darkening test now checks the actual supplied strokes against the unchanged 3:1 threshold. Emblem snapshots reflect the requested line weight, opacity and single knot; stroke budgets and determinism remain checked.
- 12 browser checks pass: both themes at 390px/1280px, exact subject and track colors, neutral due badges, 72px/10px tile geometry, 1.75px strokes, 50% helper opacity, single-line Topology, visible background grids, illustration contrast, and HTML theme switching/downloads/mobile overflow.
- Rendered the app and token reference in both modes; inspected the desktop Paths view and desktop/mobile HTML previews.

The existing design lint still flags color-distance separation: 104 subject-pair reports across normal and high-contrast modes, plus the prior eight status-pair reports. Its older rule expects eight distinct, widely separated subject colors, while the supplied palette intentionally has five calmer hues shared across eight families. Some distinct supplied hues also fall below its separation threshold. Text, subject/background and illustration contrast checks pass. Supplied colors and checker thresholds are preserved for the owner's review.
