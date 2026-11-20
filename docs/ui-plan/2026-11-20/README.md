# Lemma UI plan, 2026-11-20 (phone, night theme)

The plan to fix UI bugs, improve usability, remove layout bugs and make Lemma calmer and more beautiful. It is based on 492 captures of the real app (an empty and a populated account), DOM measurements per screen, the code, and the Lemma Pad chat page the Owner liked.

| File | What it is |
|---|---|
| `PLAN.md` | **Start here.** What's wrong in one page; 8 principles; work packages WP0–WP9 (problem, change, files, measurable Done, tests); screen-by-screen checklist; order of work; open decisions |
| `NEXT-ITEMS.md` | The plan as NEXT.md items N202–N211 in the repo's format, ready for agents |
| `COPY.md` | 49 before → after text changes ("fewer words") |
| `METRICS.md` / `metrics.csv` | How each number was measured, the headline numbers, and per-scene facts |
| `audit-INDEX.md` | Frame list of the capture run the plan cites (F### populated, E### empty) |
| `evidence/` | The zip only (images are not committed): contact sheets of the screens cited, and the liked chat page next to the in-app tutor chat |

## The ten things that matter most

1. **Rebuild `src/features/adaptive/AtlasPanels.tsx` with the kit** (WP1). One file draws the unfinished-looking panels on eight screens: legacy fonts, native disclosures, raw dates, a version string on Today, and the Atlas filters floating over the map.
2. **Put the Atlas in focus** (WP2). One header row, a map that fills the screen and opens on your current constellation, labels ≥ 13px, filters and legend in a sheet, no overlaps. Today the stars sit in a ~240px band and a third of the canvas is covered.
3. **Give the tutor conversation the screen** (WP3). Use the liked Lemma Pad layout: a compact header, a reading mode that hides the keyboard, a small start card, the latest question pinned, and no dead end on a new path.
4. **Scratch pad + drawings to the tutor through MCP** (WP4). Add a Scratch tool in the chat, upload cropped PNGs to a private bucket, bind them to the turn, and have `get(tutor_turn)` return MCP image content.
5. **One bottom bar** (WP6). Detail pages hide the tab bar (saves 72px). "Continue with tutor" is docked, never floating over content.
6. **Fewer words** (WP5, `COPY.md`). Cut repeats, jargon, developer strings and permanent how-to hints; use one date format.
7. **One empty state per screen** (WP7). No disabled buttons, empty charts or filter rows in an empty account.
8. **Layout bug sweep** (WP8). 21 rows, e.g. the offline banner over the title, half-width first-card fields, the clipped key row, and the duplicate Not found text.
9. **Lint gates first** (WP0). The project's own design lint learns fonts, the type scale, disclosures, overlaps, chrome budgets and raw dates, so the fixes stay fixed.
10. **Beauty pass** (WP9). Fewer boxes, one section-title style, an 8px rhythm, subject glyph plus colour, and quiet charts; then the Owner's eye test.

## Re-measure

`npm run audit:ui`, then compare `artifacts/ui-audit/manifest.json` facts with `metrics.csv` (see `METRICS.md`).
