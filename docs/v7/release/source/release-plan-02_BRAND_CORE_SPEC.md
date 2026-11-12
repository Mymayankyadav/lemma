# Brand core spec (phase R2, before release)

Two pieces of brand work that are worth doing **before** release because every user sees them, they are code and SVG only (no new library, no runtime cost), and they fix audit findings (F27 emblem control; the app icon no longer matching the product).

---

## 1. App icon

### Why now
The installed icon is still the earlier design's amber "graph" mark (`visuals/current-app-icon-512.png`). v7 has no amber, uses an ink-and-indigo palette, a serif identity and the ℓ mark in its sidebar and sign-in screen. The home-screen icon is the most-seen brand asset; it should match.

### Three directions (see `visuals/app-icon-concepts.png`)

| | Idea | Strengths | Risks |
|---|---|---|---|
| **A · Compass** | The serif ℓ inside a circle that is being drawn: a compass arm and pivot, a faint construction line. | Most "geometer's notebook"; reads clearly at 32 px; works on the maskable circle; easy to animate later (the circle draws in on the splash, A3). | The circle plus arm can look busy at 16 px (favicon uses ℓ + circle only). |
| **B · Constellation** | The ℓ traced as a line of stars. | Ties to the Night "observatory" and the Atlas. | Loses legibility below 64 px (the stars become noise); weaker in Day. |
| **C · Notebook** | A large ℓ on graph paper with a margin rule and an indigo ∎ (end of proof). | Warm, scholarly, the ∎ is a nice "done" signal. | The grid disappears at small sizes; the ∎ can read as a bug at 32 px. |

**Recommendation: A · Compass**, with the favicon simplified to ℓ in a circle (no arm). Night as the default installed icon (it is the stronger silhouette on most wallpapers); Day available where the platform lets the user choose.

### Files to produce (all from one SVG master)

| File | Size | Notes |
|---|---|---|
| `icons/lemma-192.png`, `icons/lemma-512.png` | 192, 512 | Manifest `purpose: any`; full-bleed square, platform applies its own mask. |
| `icons/lemma-maskable-512.png` | 512 | All meaningful art inside the central 80% circle (the dashed red guide on the board). |
| `icons/apple-touch-icon.png` | 180 | No transparency; iOS rounds corners itself. Linked with `<link rel="apple-touch-icon">`. |
| `favicon.svg` | vector | Contains a `prefers-color-scheme` media query so the tab icon follows the device theme; ℓ in a circle only. |
| `favicon-32.png` / `.ico` | 32, 16 | Fallback for older browsers. |
| `icons/shortcut-review.png`, `shortcut-approve.png`, `shortcut-atlas.png` | 96 | Redrawn in the same family: the circle with a cards glyph, a check, a star. |
| Manifest | n/a | `theme_color` and `background_color` = v7 Night page (#091023) or Day page (#F8F5F0); currently the old #13171D. |

**Rules:** ℓ set in the app's serif italic (Newsreader), optically centred (not mathematically); stroke weights scale so the circle is ≥ 1.5 px at 32 px; contrast of ℓ on background ≥ 7:1; no text other than ℓ; no gradients (they band on Android adaptive icons).

**Acceptance:** rendered at 1024 / 512 / 180 / 64 / 32 / 16 and inspected; maskable preview checked in a maskable-icon tester; installed on one Android and one iPhone by the Owner.

---

## 2. Emblem system v2

### What exists
The generator (`src/ui/v7/emblem.ts`) draws nine constructions (partial sums, mapped plane, torus knot, multiplication circle, Euclid, Hasse, Galton, Pascal, rose), seeded per path. It already works and is deterministic. The audit (F27) found it **uncontrolled**: tiles are as dense as heroes (the Algebra and Geometry tiles turn into a mesh), stroke weights vary, emblems are cropped differently screen to screen, and on Day the faint cover sits behind text (`visuals/current-emblems-gallery.png`).

### v2 rules (see `visuals/emblem-v2-families.png`)

1. **One family per subject, one mathematical object each:** Analysis = Fourier partial sums; Algebra = a grid under a linear map; Topology = a (p, q) torus knot; Number theory = times table mod n; Geometry = Euclid I.1 construction; Logic = Hasse diagram of subsets; Probability = Galton board and normal curve; Combinatorics = complete graph Kₙ; Other = rose curve.
2. **Three tiers, generated from the same seed:**
   * **Hero (164–320 px):** the rich version, at most 160 strokes, with one "focal" stroke at full weight and the rest at 40–60% opacity.
   * **Tile (96 px, path cards, plan cards):** at most 24 strokes; the focal stroke plus a simplified context.
   * **Glyph (16–24 px, subject marks in chips and lists):** 1–3 strokes, designed to be recognisable as a silhouette; not a shrunken tile.
3. **Stroke rule:** 1 px at tile, 1.25 px at hero, 1.6–1.8 px for the focal stroke; `vector-effect: non-scaling-stroke`; round caps and joins.
4. **Seed rule:** the seed varies parameters within a family (which partial sums, which (p, q), which modulus, which rotation), never the family; two paths in the same subject look related but never identical.
5. **Placement rule:** a hero is always cropped by its container on the same side (bottom-right) at the same opacity; it never sits behind body text (audit F27, KC11).
6. **Colour:** the subject colour at full strength for the focal stroke; tints from the subject's subtle token for the tile background; Night uses the Night subject colours (already in the tokens).
7. **Contrast check:** a unit test computes stroke-on-background contrast per subject per theme (≥ 3:1 for the focal stroke).
8. **Motion hook (used in A1):** strokes are emitted in drawing order so the cover can "draw in" with a stroke-dash animation; reduced motion shows the final frame.

**Acceptance:** the gallery's emblem section regenerated and Owner-approved; snapshot tests for each family × tier × theme (deterministic SVG strings); no screen shows an emblem tile with more than 24 strokes.

---

## 3. Splash and theme colours (small)
* PWA splash uses the manifest background and the 512 icon; set the background to the v7 page colour so the launch doesn't flash the old dark grey.
* Sign-in already draws an emblem behind the ℓ; switch it to the **Compass** construction drawing itself (A1 animates it; R2 ships the still).
