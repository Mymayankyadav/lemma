# Lemma UI plan v2, 2026-11-20 (phone, night theme)

A complete revisit of the app's screens (492 captures, every one reviewed) and of the UI code. It ends in a redesign built on the current v7 tokens. **Start with `before-after/` and `mockups/png/`, then read `PLAN.md`.**

| Path | What it is |
|---|---|
| `before-after/*.jpg` | 8 side-by-side pairs: the app now (frame id) vs the proposed design. Covers Today, first run, Atlas, Atlas filters, Tutor, Tutor start, Path, Calendar Day |
| `mockups/png/*.png` | 9 concept screens, 390×844 at 2x, rendered with the real v7 tokens and fonts: `01` Today Next step · `02` Atlas map · `03` Atlas layers · `04` Tutor reading · `05` Tutor scratch pad · `06` Path · `07` Calendar Day · `08` new UI elements board · `09` Today first run |
| `mockups/*.html`, `mock.css`, `icons.js`, `render.mjs` | Mockup sources. They use only `src/ui/v7/tokens.css` roles and `/lemma/fonts/v7`. Re-render with `node docs/ui-plan/2026-11-20/mockups/render.mjs` after `npm run build` |
| `PLAN.md` | Diagnosis (8 root causes) · 10 principles · information architecture ("nothing more than two taps from Today") · redesigns per screen · how the tutor loop works over MCP and how to make listening and images dependable · new UI elements · theme-consistency programme · **findings register (~70 rows, each with frame, severity, fix, item)** · order of work |
| `NEXT-ITEMS.md` | The plan as NEXT.md items N202–N216, ready for agents |
| `COPY.md` | 61 before → after text changes |
| `METRICS.md`, `metrics.csv` | How each number was measured; per-scene facts (chrome, words, fonts, sizes, native controls, overlaps, map coverage) |
| `audit-INDEX.md` | The capture run's frame list (F### populated, E### empty) that the plan cites |

## Owner decisions applied
1. **Large text:** the tab bar stays icons-only.
2. **Atlas:** controls behave like a maps app, out of sight until needed (Layers sheet, floating search, Recentre).
3. **Images:** photos and drawings go to the tutor through MCP as image content.
4. **Photos:** accepted, handled like drawings.
5. **Plan estimates:** per-stage estimates in stage headers plus one total line; the unlabeled list goes.

## The five biggest moves
1. **One kit, really** (N203). A single legacy rule (`src/styles/graph.css:16`) plus v6 stylesheets still loaded under v7 make about 30 screens' headings fall back to the phone's default serif. Scope them out, and the "unstyled" look disappears app-wide.
2. **Today shows the recommended next step** (N205). The scheduler's decision becomes the hero: a Checks → Learn → Practice → Close ribbon, Now + Then, and a "time you have now" ruler (the Calendar scale) that re-plans for your free minutes. Today it is buried under "No authorized task fits this window".
3. **A readable Atlas** (N206). Full-bleed map, the current constellation in focus, labels ≥ 13px with halos, maps-app controls, Layers sheet, peek card.
4. **The tutor gets the screen and the scratch pad** (N207–N208). Reading mode, a pinned question, presence ("Listening"), a keep-listening MCP contract, and drawings and photos sent as MCP images on the same channel the replies already use.
5. **One bottom bar and docked actions** (N209), plus a compact Calendar (N214). Content stops being covered or squeezed.

## Re-measure
`npm run audit:ui`, then compare `artifacts/ui-audit/manifest.json` with `metrics.csv`.
