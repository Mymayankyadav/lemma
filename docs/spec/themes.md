# Themes, density and calm (task UI-3)

The owner finds the app's text too large, its space use loose, and its glow too flashy, and wants to try many colour schemes on the phone before choosing one. This spec adds a theme lab: 15 colour schemes, three densities and two effect levels, switchable live on any screen. When the owner names a winner, it becomes the default and the lab can stay as a setting.

Defaults after this task: theme `obsidian`, density `compact`, effects `calm`.

## 1. Mechanism

- Three attributes on `<html>`: `data-theme="<id>"`, `data-density="compact | cozy | comfortable"`, `data-effects="calm | rich"`.
- Choice is stored per device in `localStorage['lemma.ui']` as `{theme, density, effects}` (wrapped in try/catch). URL overrides for testing and sharing: `?theme=nord&density=cozy&effects=rich` (applied and saved).
- An inline script in `index.html` applies the saved attributes before first paint (no flash). `<meta name="theme-color">` follows the theme's `bg`.
- Components keep using the existing token names. In themes, `--amber*` means "accent", `--obsidian*` means "background"; do not rename them (too much churn). Document this in `tokens.css`.

## 2. Colour schemes

Source of truth: `src/styles/themes.ts`, an array of `{id, name, mode: 'dark' | 'light', c: {...}}` with the core values below. `scripts/make-themes.ts` generates `src/styles/themes.css` (one `[data-theme="id"]` block per theme, committed) and fails if any theme breaks contrast (§2.3). The switcher reads names and swatches from the same array.

### 2.1 Core values

Columns: bg (`--obsidian`), deep (`--obsidian-deep`), surface (`--slab`), tile (`--tile`), raised (`--raised`), raised2 (`--raised-2`), sheet (`--sheet`), well (`--well`), ink, soft (`--ink-soft`), ink2, ink3, ink4, accent (`--amber`), hi (`--amber-hi`), deep accent (`--amber-deep`), on-accent (`--amber-ink`).

| id | name | mode | bg | deep | surface | tile | raised | raised2 | sheet | well | ink | soft | ink2 | ink3 | ink4 | accent | hi | deep acc. | on-accent |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `obsidian` | Amber on Obsidian | dark | #0D0C11 | #09080D | #17161D | #141319 | #1B1A22 | #24232C | #16151C | #0F0E14 | #F4F0E6 | #C9C4D1 | #ACA7B5 | #8C8796 | #5F5B68 | #F7B538 | #FFD47E | #D98E1C | #1E1405 |
| `graphite` | Graphite | dark | #111213 | #0B0C0D | #191A1C | #161718 | #1E2022 | #282A2D | #1A1B1D | #0E0F10 | #ECECEA | #C8C9C6 | #A9AAA7 | #8B8C89 | #55575A | #E8E6E1 | #FFFFFF | #BDBBB5 | #121314 |
| `chalk` | Chalkboard | dark | #18211E | #121916 | #1F2A26 | #1C2622 | #24302B | #2D3A35 | #1E2824 | #141C19 | #EEF0E8 | #CDD3C8 | #AEB7AC | #8F9A8E | #5B665C | #F1E3B5 | #FFF4D1 | #CDBB86 | #1A1A12 |
| `midnight` | Midnight | dark | #0A0F1C | #070B15 | #111829 | #0F1524 | #151D31 | #1E2840 | #121A2C | #0B1120 | #E8EDFB | #C3CBE2 | #A3ADC8 | #8590AE | #545E7A | #7FA6FF | #B3CAFF | #4F7BE0 | #0A1020 |
| `nord` | Nord | dark | #2B303B | #242833 | #343A47 | #313643 | #3B4252 | #434C5E | #353B48 | #262A34 | #ECEFF4 | #D8DEE9 | #C0C7D4 | #AAB2C1 | #6B7385 | #88C0D0 | #B5DCE6 | #5E9DB0 | #1F2630 |
| `solar-dark` | Solarized dark | dark | #002B36 | #00222B | #073642 | #05313C | #0B3D4A | #134957 | #063440 | #00252F | #EEE8D5 | #D3CDBA | #ADB8B8 | #9CA9A9 | #586E75 | #B58900 | #D9AE2B | #8F6C00 | #001F27 |
| `plum` | Plum | dark | #141018 | #0E0B11 | #1D1722 | #19141E | #221B28 | #2C2433 | #1B1620 | #110D14 | #F1EAF4 | #D2C6D9 | #B3A6BC | #958AA0 | #5E5468 | #C9A0FF | #E2CCFF | #9D6FE0 | #170F20 |
| `forest` | Forest | dark | #0E1411 | #0A0F0C | #151E19 | #131A16 | #19241E | #222F28 | #141C18 | #0C120F | #E8F0EA | #C6D3CA | #A6B5AA | #889A8D | #546459 | #7FD48C | #B2EBBB | #52A862 | #0B1A0F |
| `ember` | Ember | dark | #131010 | #0E0B0B | #1C1716 | #181413 | #211B1A | #2B2422 | #1A1514 | #100D0C | #F3ECE6 | #D6CBC3 | #B7AAA1 | #998C83 | #62574F | #FF8F5A | #FFB892 | #E0663A | #1E0E06 |
| `contrast` | High contrast | dark | #000000 | #000000 | #0F0F0F | #0A0A0A | #141414 | #222222 | #0D0D0D | #050505 | #FFFFFF | #E6E6E6 | #CFCFCF | #B3B3B3 | #6E6E6E | #FFD60A | #FFE666 | #E6B800 | #000000 |
| `night` | Night shift (dim, low blue) | dark | #12100C | #0D0B08 | #1A1712 | #17140F | #1F1B15 | #29241C | #191611 | #0F0D0A | #D8CCB6 | #BFB39E | #A69A85 | #8E836F | #5A5244 | #C99A4E | #E0BC7D | #A17630 | #17120A |
| `paper` | Paper | light | #F6F4EF | #EFECE5 | #FFFFFF | #FBFAF7 | #FFFFFF | #EDEAE3 | #FFFFFF | #F0EDE6 | #1C1A17 | #3D3933 | #57524A | #6E685F | #A39D93 | #A8650A | #C98A2E | #8A5206 | #FFFFFF |
| `solar-light` | Solarized light | light | #FDF6E3 | #F5EDD6 | #FFFBF0 | #FAF3DF | #FFFBF0 | #EEE8D5 | #FFFBF0 | #F3ECD7 | #073642 | #2E4A53 | #4B6169 | #5A6C73 | #93A1A1 | #1D6BB8 | #4A95DD | #175A9C | #FFFFFF |
| `blueprint` | Blueprint | light | #F3F6FA | #EAEFF6 | #FFFFFF | #F9FBFD | #FFFFFF | #E4EAF2 | #FFFFFF | #EDF1F7 | #13203A | #2E3D5A | #48587A | #5F6E8C | #A2ADC0 | #2459D6 | #4F7FEA | #1B45A8 | #FFFFFF |
| `sepia` | Sepia | light | #F2E9D8 | #EADFCA | #FAF4E8 | #F6EEDF | #FBF6EC | #E7DCC6 | #FBF6EC | #EDE3D0 | #33291E | #4C3F30 | #64553F | #6F5E47 | #AE9F87 | #8C4F1E | #B0703A | #6E3C14 | #FFF8EE |

### 2.2 Derived tokens (computed by the generator)

- Dark themes: `--edge` = ink at 7 %, `--edge-2` 12 %, `--edge-3` 18 %; `--fill-1` = ink at 4 %, `--fill-2` 8 %; `--glass` = surface at 82 %, `--glass-strong` = sheet at 88 %.
- Light themes: `--edge` = ink at 10 %, `--edge-2` 16 %, `--edge-3` 24 %; `--fill-1` = ink at 4 %, `--fill-2` 8 %; `--glass` = surface at 86 %, `--glass-strong` = surface at 92 %; shadows use ink at 8–14 % instead of black at 85–95 %; `color-scheme: light`.
- Accent family: `--amber-glow` = mix(hi, white, 40 %); `--amber-tint` = accent at 10 %, `-tint-2` 12 %, `--amber-line` 25 %, `--amber-line-2` 55 %; `--grad-lit` = hi → accent; `--grad-orb` = radial hi → accent → deep; `--grad-rail` = deep → accent; `--e-lit`, `--e-orb` use the accent colour.
- Grades: dark themes keep `--again #F2545B`, `--hard #F39A4B`, `--easy #4FC88E`; light themes use `#C9363E`, `#C46A1F`, `#23885A`. `--good` = accent in every theme.
- Subject hues stay; light themes darken them by 35 % for text use.

### 2.3 Contrast gate (generator fails otherwise)

ink3 on bg, surface and raised ≥ 4.5 : 1; ink on every surface ≥ 7 : 1; accent on bg ≥ 3 : 1 (it is used for numbers and icons, not body text); on-accent on accent ≥ 4.5 : 1. Print a table of the ratios.

## 3. Density

Replace every hard-coded size (`text-[13px]` and the like, about 270 uses) with semantic tokens mapped in `@theme`: `text-micro`, `text-caption`, `text-label`, `text-body`, `text-body-l`, `text-headline`, `text-title-s`, `text-title`, `text-num-l`, `text-num-xl`, `text-card`, `text-answer`, `text-question`. Spacing tokens: `--gutter`, `--pad` (slabs and cards), `--pad-tile`, `--gap`, `--row` (list row height), `--ctl` (button height), `--tab` (tab bar height).

| Token | compact (default) | cozy | comfortable (old) |
| --- | --- | --- | --- |
| micro / caption / label | 10 / 11 / 12 | 10.5 / 11.5 / 12.5 | 11 / 12 / 13 |
| body / body-l | 14 / 15 | 14.5 / 15.5 | 15 / 16 |
| headline | 16 | 17.5 | 19 |
| title-s / title | 18 / 21 | 21 / 24 | 24 / 28 |
| num-l / num-xl | 26 / 40 | 32 / 52 | 38 / 64 |
| card / answer / question (serif) | 20 / 17 / 17 | 23 / 20 / 19 | 27 / 23 / 21 |
| gutter / pad / pad-tile / gap | 14 / 14 / 12 / 10 | 18 / 18 / 14 / 12 | 24 / 22 / 16 / 12 |
| row / ctl / tab | 44 / 44 / 56 | 50 / 48 / 60 | 56 / 52 / 64 |
| radii (hero / slab / ctl) | 20 / 16 / 12 | 24 / 19 / 13 | 28 / 22 / 14 |

Touch targets stay ≥ 44 px (pad hit areas when visuals are smaller).

## 4. Effects

- `calm` (default): no lamp gradient, no grain, no sheen; flat elevations (1 px `--edge` border and one soft shadow); primary buttons solid accent with no glow; the orb halo, breathing, pulses, spark orbit and count-up are off (final state shown); entrances are a 160 ms fade; illustrations show their final frame. Amber/accent only on the one primary action per screen, progress fills and due counts: checkboxes, toggles and selected segments use `--ink` on `--raised-2` instead of accent fills.
- `rich`: the current look (`design.md` §2–3, §7).

## 5. Space use (applies in every density)

- Home: resume card as one compact block (title row with step ring 44 px, question at `text-question` max 3 lines, buttons 44 px); due and approve tiles 72 px tall; project rows `--row`.
- Projects: featured project at most 30 % of the screen; other projects as rows, not big tiles.
- Review run: the card hugs its content (min 220 px) and grade buttons sit right under it; no empty half-screen.
- Insights: tiles never wrap their number ("18h 40m" on one line; shrink to fit).
- Atlas: fit the graph to the viewport on load (24 px padding) and avoid label overlaps (hide labels of non-selected nodes when they collide).
- Lists (cards, sessions, decks) use `--row` with one line of meta.

## 6. Theme lab (switcher)

- Settings › Appearance: a grid of theme swatches (name, three colour dots, a mini mock card), density segmented control, effects switch. Tapping applies instantly.
- Lab button: when `localStorage['lemma.lab']` is on (toggle in Appearance, default on until the owner picks a final theme) a small round palette button floats bottom-left above the tab bar on every screen. Tap → bottom sheet with the swatch grid and the two controls; swipe left/right on the sheet header cycles themes so the owner can compare the same screen quickly.
- Review screenshots: `scripts/review-shots.mjs` accepts `THEMES=all` and `DENSITY=` and writes `review-shots/<theme>/<screen>.png`; the `review/**` workflow builds contact sheets per theme (`review-shots/sheets/<theme>.png`, five screens side by side: Home, Project, Card review, Insights, Settings).

## 7. Done when

- All 15 themes × 3 densities × 2 effects render every screen with no hard-coded colours or sizes (`grep -rE "text-\[[0-9]+px\]|#[0-9A-Fa-f]{6}" src --include=*.tsx` prints nothing except chart data colours documented in `design.md`).
- The contrast table passes; `kit.spec.ts` runs for `obsidian` and `paper` in compact and comfortable.
- Contact sheets for every theme are on a `review/themes` branch for the owner.
