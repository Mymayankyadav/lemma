# Lemma v7 release plan: R0–R3 (before release)

> **Released 12 Nov 2026.** The Owner chose the graph-paper icon (D3 = C · Notebook), approved the other results (D2 golden screens, D4 emblems), raised the D5 budget and waived the remaining release gates: "I needed the graph paper icon. I approve the other result and can increase the D5. I approve to waive off release gates as I checked those and it looks fine. Just change the icon and release". `v7Shell` is now **on by default** (`src/flags.ts`); `v6Shell` stays on underneath as the rollback. See "Release" at the end.

The Owner asked for the "before release" phases of the release and assets plan to be built on this PR (#1348). The plan and the independent UI audit it builds on are archived in `docs/v7/release/source/` (`release-plan-*.md`, `ui-audit-*.md`). Finding IDs (F##) refer to `ui-audit-01_VISUAL_AUDIT.md`. Everything stays behind `v7Shell` (still **off**); no dependency, backend, migration or flag default changed. The new app icon and favicons are shared by every shell (see R2 below).

## Owner decisions applied by default

The plan needs Owner choices before R1 and R2. The work followed each recommendation, so a different choice changes only the named files.

| # | Decision | Applied (the plan's recommendation) | Where to change it |
|---|---|---|---|
| D1 | Kit numbers or audit numbers | Kept the kit's type sizes and colour values; adopted the audit's rules (one voice per job, one meaning per colour) | `src/ui/v7/tokens.css`, `design-tokens.json` |
| D3 | App icon direction | First built as A · Compass; the Owner then chose **C · Notebook** (graph paper), now shipped | `scripts/brand/lemma-mark.mjs` |
| D4 | Emblem v2 | The eight families and the three-tier rule, tuned against the plan's sheet | `src/ui/v7/emblem.ts` |

Still open: D2 (re-approve the changed golden screens), D5 (the 350 KB budget), D9 (release criteria: re-audit, devices). Review sheets for D2–D4 are in `docs/v7/release/`.

## R0 · Stop looking broken

| Audit | What changed | Proof |
|---|---|---|
| F01 | One `ActionSheet` (`src/ui/v7/ActionSheet.tsx`): 56 px rows, a 24 px icon in a 40 px tile, the label and an optional hint; destructive rows last, after a hairline, red with their icon; arrow keys move between rows. Used by every ⋯: Tasks, Paths, Path, Card, Checkpoint, Time log, Focus. The old menus rendered as a run-on string because their styles only loaded on `/kit`. | Browser: `v7-learning`, `v7-part6` (menu items by role) |
| F02 | v7 Form sheets for editing a task (`tasks/v7/TaskSheetV7.tsx`) and a time-log entry (`time-log/v7/EntrySheetV7.tsx`): fields stack, the app's own date picker, segmented controls and pickers, 24-hour time fields, ghost Cancel left and indigo Save right. No native select, date or time controls. Validation and API calls are reused unchanged. | Unit: `release-r0.test.tsx` (next-day intervals, time typing, due times); design lint |
| F08 | The two glyphs that rendered as black boxes are drawn: I-14 Close the day and I-15 Inbox zero (`src/ui/v7/marks.tsx`). Search icons moved to `app/v7/searchIcons.ts`; concepts use the star (I-23). | Unit: `icons-resolve.test.tsx` (every icon key renders an SVG) |
| F04 | Stacking contract: the tab bar and Capture hide while a sheet is open (phones); pages pad for the tab bar plus any sticky bar; toasts dock 12 px above the top-most bottom layer; chart readouts sit above the plot. | Design lint; browser suites |
| F05 | Review says "23 due + 2 new" when the round includes new cards; card totals are exact (path card counts), never "50+", with thin-space grouping. | Unit: `release-r0.test.tsx` |
| F06 | Chart ticks are thinned by available width (8-unit gap; week starts preferred); the goal line is labelled outside the plot at the right edge; no value label when it doesn't fit its bar or is zero; legend swatches match the mark; count summaries say "412 reviews", not "You studied 412". | Unit: `release-r0.test.tsx` |
| F07 | Inbox swipe: a directional wash (approve = success from the right, reject = danger from the left) and a stamped "✓ Approve" / "× Reject" that settles in with distance; the next card shows beneath at 96%. | Unit: `release-r0.test.tsx` |
| F13, F40 | Toasts: identical messages refresh instead of stacking (all shells); under v7 one toast at a time, errors clear on navigation, and the toast is an ink pill (Day) or raised navy pill (Night) with an icon, a bold action and an undo countdown hairline. `.v7-alert` carries the danger icon. | `st7-toast` (v6) and v7 suites |
| F09 | Focus errors are sentences with an icon and Dismiss, never validation text; finishing with under a minute focused offers "Discard session" instead of a 1-minute save. | Unit: `release-r0.test.tsx` |
| F14 | One stepper: a pill with 44 px caps, a tabular value, and always a visible label and unit (`Stepper` now requires `unit`). | Unit: `release-r0.test.tsx` |

## R1 · One system

| Audit | What changed |
|---|---|
| F03 | Settings sub-pages are grouped lists (`settings/v7/SettingsLists.tsx`): Study and review (Memory, Focus, Review time), Planning (Your day, Calendar) and Reminders (Reminders, Remind me about, Quiet hours, Weekly digest). Rows show the current value with a chevron or an inline switch; values open a Pick sheet (closes on choice) or a small Form sheet; every change saves at once with "Saved · Undo". Numerics sit behind an Advanced row (cycles, flowtime ratio, guard, shortcuts, optimiser, activities still use the existing forms there). Data and account has one Delete heading. |
| F20, F21, F23 | Colour jobs: `MetaChip` (`ui/v7/Status.tsx`) for things that are not status (target dates take a flag, "Next" a ring, diffs + Added in success and Δ Changed, suggestions); met targets and complete meters fill with success. The static lint (`scripts/v7/check-kit.mjs`) fails a status badge on dates, "Next", diffs, suggestions or grades, and a red Save or Undo. |
| F22 | One grade language (`ui/v7/grades.tsx`): Again ↺ danger, Hard half circle warning, Good filled circle success, Easy ★ indigo — in review buttons, round complete, card history, practice ("Again", not "Couldn't recall") and the Progress chart. |
| F17, F71 | Sheet templates: Pick sheets close on choice; Form sheets put ghost Cancel left and the primary right, or one full-width primary; confirms put Keep left and the destructive action right (Void entry, Delete card and Approve n fixed). Focus finish: full-width Save, Discard last in the body. |
| F32–F35, F37 | Selected filter chips (pressed or checked) get the indigo tint, a ✓ and a bolder label; disabled buttons are 40% of their own style, with a reason line where one was missing (New path); focus rings only on keyboard focus; no textarea resize grips anywhere in v7; settings use switches. |
| F15, F16, F18 | Page titles and section heads on checkpoint, session, plan proposal, settings and first run are serif; hero numerals use the medium weight; the bar's small title stays hidden until the page's large title scrolls under it. |
| F43, F49, F50, F51 | Names, not codes ("Real Analysis · due in 7 days", not "N49 · CP9"; "Card", not "Card N1"); developer copy removed ("bars are scaled to highest", "Scroll horizontally…", "Nothing selected for this round", "same export as the original Settings screen"); date pickers read "Sat 7 Nov" or "Today · Mon 9 Nov". |

The rendered design lint (`tests/e2e/v7-design-lint.spec.ts`) now also covers the three rebuilt Settings pages, every emblem's stroke budget and textarea grips.

## R2 · Brand core and room to breathe

**App icon (D3 = C · Notebook, the Owner's choice).** `scripts/brand/lemma-mark.mjs` holds one geometry for the mark: a large ℓ (the STIX Two Math outline the v7 shell already uses for its ℓ, stored as a path) on graph paper — a faint indigo 48/1024 grid on the Day paper colour — with a red margin rule and an indigo ∎ (end of proof). The installed icon is the Day paper page; a Night variant is generated as a reference. At tab size the favicon keeps the ℓ on a coarse grid and drops the margin rule and ∎ (the plan warns they read as noise at 32 px). `scripts/generate-icons.mjs` rasterises it on every build with no dependency (analytic anti-aliasing and a scanline glyph fill): `lemma-192/512.png`, `lemma-maskable-512.png` (all art inside the central 80% circle), `apple-touch-icon.png` (180, opaque), `favicon.svg` (ℓ on a small graph-paper page, Day/Night by `prefers-color-scheme`), `favicon-32.png`, `favicon.ico` (16 + 32) and the three 96 px shortcut icons redrawn as a notebook page with a margin rule holding cards, a check and a star. Grid lines never drop below 1 px and the margin rule below 1.5 px; the ℓ keeps ≥ 7:1. `index.html` links the favicons and touch icon; `scripts/check-pwa.mjs` checks them. The manifest's `theme_color`/`background_color` follow the build's shell: the Day paper page (#F8F5F0, matching the icon) under v7, the v6 Graph-night page if v7 is rolled back. Under v7 the browser chrome uses the v7 page colour (`syncThemeColour`). Proof: `tests/unit/v7/brand-mark.test.ts`; sheet `docs/v7/release/d3-app-icon-notebook.png`. The icon replaces the old amber mark for every shell as soon as this PR merges.

**Emblem system v2 (D4).** `src/ui/v7/emblem.ts`: one object per family (Fourier partial sums, a grid under a linear map, a (p, q) torus knot, times-k mod n, Euclid I.1, the Hasse diagram of subsets, a Galton board under a normal curve, the complete graph Kₙ, a rose; plus the Compass construction for sign-in), each at three tiers from the same seed: hero ≤ 160 strokes, tile ≤ 24, glyph 1–3 (the glyph is now the subject mark in chips and lists). One focal stroke at full strength, context at 40–60%; 1 px tile, 1.25 px hero, 1.7 px focal, non-scaling; strokes in drawing order. The seed varies parameters within a family, never the family. Hero placement shows only the bottom-right corner, never behind the title or text. Sign-in draws the Compass construction (still; A1 animates it). Proof: `tests/unit/v7/emblem.test.ts` (budgets, stroke rule, seed rule, contrast ≥ 3:1 for every subject on its page and tile in Day and Night, a family × tier snapshot); sheet `docs/v7/release/d4-emblem-v2-families.png`.

**Room to breathe.**

| Audit | What changed |
|---|---|
| F11, F18 | Path: one floating "Continue with tutor" pill above the tab bar; Review moved to a header pill; tabs stick under the bar; after scroll the bar shows the emblem glyph, a progress ring and the title. |
| F10 | Calendar Day: no change beyond earlier B4/CD2 work (one-line date row, grid above 45%). Merging the overdue lane with suggestions and a compact view switch remain open; the view switch's radio semantics are relied on by tests. |
| F31 | One surface per region: a session's evidence is one card with divided rows; the Advanced settings forms sit flat in their card. |
| F24, F25 | Night heat ramp from the indigo family (`viz.heat1–4` night: #5560B8 → #D6DDFF, each ≥ 3:1 on the page); "today" stays a ring. Night calendar events are a raised surface with a 14% subject tint and a 1 px subject border. |
| F76, F77 | Pickers with more than 8 options gain a search field; Quick add shows four path chips plus a searchable picker of every path; the Tasks path filter searches beyond 8; card fronts, path and task titles clamp at two lines in lists. |
| F12 | Atlas opens as the list when the sky has more than 250 concepts or 600 links, with a note and the map one tap away (`?view=map`). |
| F36 | `EmptyMoment` (`ui/v7/EmptyMoment.tsx`): a mark, a serif one-liner, one sentence and one context-correct action (filter-empty states offer Clear filters) on Paths, Tasks, Cards, Time log and Path. |

## R3 · Release gate and switch

Done in this PR:

- Fresh golden candidates in `docs/v7/golden-candidates/` (approved PNGs in `docs/v7/golden/` untouched) and, for D2, `docs/v7/release/d2-*-approved-vs-candidate.png`: approved and candidate side by side, Night and Day, for all six screens. Atlas is unchanged; Today, Focus, Calendar Day, Review round and Path differ by the emblem v2 glyphs and covers, the corner-only hero emblem, Path's single Continue pill and header Review, serif section heads and medium-weight numerals.
- **D5 measurement:** Today cold first load on the example workspace, built as in CI, with `v7Shell` on: **589 KB** transferred (419 KB scripts, 111 KB fonts, 58 KB styles, 2 KB document), up 11 KB from 578 KB. The Owner's decision on where to split the eager v6 pages still stands (recommendation: in the switch PR).
- Accessibility automation: the existing 200% text, rollback and design-lint suites pass on the changed screens.

Not done, and not authorised by these results: the independent re-audit (D9, target ≥ 8 with no Major findings), the Owner's D2 re-approval, physical-device and screen-reader checks, the independent full-PR code review, and the switch PR (`v7Shell` on by default, Google Fonts link removed for v7, rollback verified).

## Verification (this pass, local)

| Check | Result |
|---|---|
| Typecheck, kit token lint, production build and PWA artifact check | Passed |
| Full unit suite | 380 files, 2,145 tests passed |
| All v7 browser specs, including the rendered design lint (Day/Night, 390 and 320 px) | 381 passed |
| v6/PWA specs touched by shared changes (`and1-install`, `android-install`, `look-9a`, `st7-toast`, `v6-n121-audit`, `layout`, `kit`, `v6-harden-learning`) | 72 passed |

Tests changed only where a locator named the old design: menu items are now `menuitem`s, Path's Review link is in the header, "Added" is a diff mark, the empty-paths text dropped its full stop, and card meta lines show the path instead of codes. No assertion was removed or loosened.

## Release · 12 Nov 2026

- `v7Shell` defaults to **on** (`src/flags.ts`); `v6Shell` stays on underneath, so changing the v7 default back to `false` restores v6 with no data change. The rollback suite (`tests/e2e/v7-harden.spec.ts`, sixteen routes with `v7Shell` off) passes. v7 never loads Google Fonts: the boot script in `index.html` now uses the same v7-route check as the app (it only recognised `/kit` before, so every v7 route requested Google Fonts once); v6 keeps its conditional loader for rollback.
- Unit tests keep their legacy/v6 shells through `VITE_FLAGS=-v7Shell` (vitest), and browser builds through `VITE_FLAGS=-v6Shell,-v7Shell`; v7 suites opt in with `?flags=v7Shell,v6Shell`. `tests/unit/flags.test.ts` now states both defaults.
- D2: the six golden screens in `docs/v7/golden/` are the R0–R2 captures the Owner approved (`GOLDEN_APPROVAL.md`).
- D5: the Owner raised the first-load budget. Recorded number: Today cold first load **586 KB** on the production build with v7 on by default (418 KB scripts, 111 KB fonts, 55 KB styles, 2 KB document; 589 KB on the test build). The eager v6 Paths/Atlas/Today imports and their v6 guards are unchanged; splitting them is follow-up work.
- Waived by the Owner: the independent re-audit (D9), physical-device and screen-reader checks, the independent full-PR review and the separate tablet/desktop approval.
