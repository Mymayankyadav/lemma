# Lemma · Constellation — Plan to a 10/10 UI Kit

A complete, implementable plan for rebuilding the Day and Night kit as one system. Every colour value below was generated in OKLCH and checked with the WCAG 2.x contrast formula. Colour-blind separation was checked with the Machado (2009) deuteranopia/protanopia simulation and is reported as OKLab distance × 100 ("ΔE"). Tune any value by eye if you like, but re-run the same checks after you change it.

---

## The 12 big moves (summary)

1. **One source of truth.** Three-tier tokens (raw → role → component). Both themes are generated from the same role names, which removes every Day/Night mismatch at the root.
2. **Graph paper by day, star chart by night.** A concept that ties both themes to the mathematics instead of just inverting colours.
3. **One hue family for every neutral surface in each theme.** Day surfaces are warm paper and Night surfaces are ink-blue. Text is always "ink".
4. **A strict text ladder:** primary → secondary → tertiary → disabled, each one clearly dimmer than the one above.
5. **Indigo means "act, selected or focused" and nothing else.**
6. **Status = shape first, words second, colour third.** "Serious" is removed and "info" has no hue.
7. **Subjects = emblem first, colour second.** There are eight subject hues with alternating lightness, so they stay distinct for colour-blind users.
8. **One state model** (hover, pressed, selected, focus, disabled, read-only, loading, invalid) shared by every interactive component.
9. **Split the overloaded components.** Chip becomes Tag, Badge and Filter chip; the pressed button becomes a Toggle button; the time inputs become a Time range field.
10. **Signature systems:** generative emblems with defined mathematics, "Constellation" checkpoint progress, Statement cards (Lemma / Theorem / Definition) and a "∎ moment" on completion.
11. **Data-viz rules and ramps** that pass 3:1, plus a written summary sentence for every chart.
12. **Quality gates** (contrast, colour-blind checks, token lint, visual regression) so the kit stays at 10/10.

---

## 1. Concept and principles

### Concept: "Notebook and Observatory"
- **Day = Paper.** Warm paper, ink-navy text and a very faint graph-paper grid on the page background (see 3.8). It should feel like working in a good notebook.
- **Night = Sky.** Ink-blue sky, starlight text and a few faint stars in hero areas only. Data "lights up" like stars (the heatmap goes from dim to bright starlight).
- The **emblems** are the bridge between the two: in Day they are drawn in ink, and in Night they glow.

### Design principles (put these at the top of the kit)
1. **Quiet by default, bright on purpose.** Each screen has one bright thing: the next step.
2. **Every colour has one job.** If a colour means two things, one of them is wrong.
3. **Shape before hue.** Status, subject and state can always be told apart without colour.
4. **One system, two lights.** Day and Night differ only in token values, never in component behaviour.
5. **Mathematics is the ornament.** No generic illustration anywhere. Every decorative element is a real mathematical construction.
6. **Explain, don't block.** A disabled control says why it is unavailable.

---

## 2. Token architecture

### Three tiers
| Tier | Purpose | Example names | Rule |
|---|---|---|---|
| Raw | Raw values, generated from OKLCH | `ink.50…950`, `paper.50…950`, `indigo.100…900`, `subject.analysis.solid` | Components never reference these |
| Role | Meaning, shared by both themes | `surface.page`, `text.secondary`, `border.default`, `action.bg`, `status.danger.fg` | Every role token has a Day value and a Night value |
| Component | Only where a component must differ | `button.primary.bg`, `chip.filter.selected.bg` | Must point to a role token, never a raw value |

### Naming convention
`category.role.variant.state`, for example `action.bg.hover`, `status.warning.subtle`, `text.on-action`.

### Modes
- **Theme:** `day`, `night`, `day-hc`, `night-hc` (high contrast; see 13).
- **Density:** `comfortable` (default on mobile) and `compact` (desktop data views). Density changes only control heights and the vertical rhythm.

### Format and pipeline
- Store tokens in the W3C Design Tokens (DTCG) JSON format, as the single source.
- Generate CSS custom properties and native Figma Variables (one collection per tier, with modes for the themes) from that file.
- Every role token carries metadata: its intended background pairings (for the automated contrast checks) and a one-line description of its job.

---

## 3. Colour

### 3.1 Neutral surfaces and borders
Day surfaces use the warm **paper** hue (OKLCH h ≈ 80). Night surfaces use the **ink** hue (h ≈ 267). The lavender greys currently on Day buttons, icon tiles, the segmented control and progress tracks are retired.

| Role | Day | Night | Used for |
|---|---|---|---|
| `surface.page` | `#F8F5F0` | `#091023` | Page background |
| `surface.sunken` | `#F0ECE5` | `#050A1B` | Input fills, wells |
| `surface.raised` | `#FEFCF9` | `#11192C` | Cards |
| `surface.overlay` | `#FFFFFF` | `#192135` | Menus, toasts, sheets, popovers |
| `surface.muted` | `#E9E4DC` | `#1E263B` | Secondary buttons, tags (neutral), icon tiles, segmented track |
| `surface.muted.hover` | `#E1DCD2` | `#273045` | Hover on muted surfaces, segmented thumb (Night) |
| `border.subtle` | `#DDD8D0` (1.3:1) | `#262D40` (1.4:1) | Dividers and card edges (decorative) |
| `border.default` | `#857F77` (3.6:1) | `#687082` (3.8:1) | Input, checkbox, radio and switch boundaries (must be ≥3:1) |
| `border.strong` | `#625D55` (6.0:1) | `#8A92A4` (6.1:1) | High-contrast mode, selected outlines |

Ratios are against `surface.page`. `border.default` stays ≥3:1 on every surface it sits on: Day 3.1–4.0, Night 3.0–4.0.

### 3.2 Text ladder
Text always uses the **ink** hue in both themes. Each step is clearly dimmer than the one above, and disabled is the dimmest.

| Role | Day | On page / on muted | Night | On page / on muted |
|---|---|---|---|---|
| `text.primary` | `#121B31` | 15.7 / 13.5 | `#EEF2FA` | 16.9 / 13.4 |
| `text.secondary` | `#40495C` | 8.3 / 7.1 | `#B1B7C6` | 9.4 / 7.5 |
| `text.tertiary` (also placeholder) | `#5B6375` | 5.5 / 4.8 | `#8B92A2` | 6.1 / 4.8 |
| `text.disabled` | `#878C99` | 3.1 | `#676D7C` | 3.7 |
| `text.on-action` | `#FFFFFF` | — | `#FFFFFF` | — |

Rules:
- Placeholder = `text.tertiary`. On Day sunken inputs it is 5.1:1, which fixes the current 4.36:1 failure.
- Disabled text is exempt from WCAG, but keep it around 3:1 so it is still readable and clearly "off".
- Never put `text.tertiary` on `selection.subtle` or on a status subtle background. Use `text.secondary` there.

### 3.3 Accent (indigo): action, selection and focus only
| Role | Day | Night | Checks |
|---|---|---|---|
| `action.bg` | `#4246C2` | `#5159D7` | White text: Day 7.3, Night 5.6 |
| `action.bg.hover` | `#393BAF` | `#5862E1` | White text: Day 8.7, Night 4.9 |
| `action.bg.pressed` | `#313498` | `#4C52D0` | White text: Day 10.1, Night 6.1 |
| `selection.subtle` | `#E2E8FF` | `#232953` | Background for selected filters, toggles and menu items |
| `selection.subtle.hover` | `#D5DEFF` | `#2C3363` | — |
| `selection.fg` | `#3738AC` | `#B9C6FF` | On `selection.subtle`: Day 7.4, Night 8.3 |
| `focus.ring` | `#4246C2` | `#B1BFFF` | Against page: Day 6.7, Night 10.6 |
| `link` | `#4246C2` | `#A9B8FF` | Against page: Day 6.7, Night 9.9 |

Indigo is **allowed** on: primary buttons, links, focus rings, checked checkboxes and radios, switch "on", slider fill, tab underline, selected filter chips and toggle buttons.

Indigo is **not allowed** on: progress and mastery bars, charts, the heatmap, status badges ("Due today"), segmented-control thumbs, decorative glows, or the hero card gradient.

### 3.4 Status: four levels, shape first
"Serious" is removed: on Day it was indistinguishable from Warning under deuteranopia (ΔE 0.1). "Info" has no hue: it uses neutral text plus an info icon.

| Level | Icon shape (filled) | Day fg / subtle | Night fg / subtle |
|---|---|---|---|
| Info | Circle with "i" | `text.secondary` / `surface.muted` | `text.secondary` / `surface.muted` |
| Success | Circle with check | `#107C40` / `#E2F6E6` (4.9 · 4.7) | `#75D78D` / `#112917` (10.7 · 8.8) |
| Warning | Triangle with "!" | `#9B610E` / `#FFF0DF` (4.7 · 4.6) | `#FFBF67` / `#301F07` (11.6 · 9.7) |
| Danger | Octagon with "×" | `#9E1D1C` / `#FFE9E5` (7.3 · 6.8) | `#FF8579` / `#361A17` (8.0 · 6.8) |
| Danger solid (confirm buttons) | — | `#9E1D1C`, white text 7.9; hover `#94020D` | `#BA2B28`, white text 6.1 |

The figures in brackets are the text colour's contrast against the page and against the status subtle background.

Colour-blind separation between the text colours (ΔE; higher is better):
- **Day:** Success/Warning 16.7 normal, 6.7 deuteranopia, 4.9 protanopia. Success/Danger 26.9, 5.9, 18.0. Warning/Danger 14.0, 8.7, 15.0. Lightness is deliberately spread: Danger darker, Warning lighter.
- **Night:** Success/Warning 17.3, 8.4, 4.3. Success/Danger 26.0, 4.4, 15.6. Warning/Danger 14.7, 10.6, 14.9.

Rules:
- Status is always **icon + text**. Never show it as a bare coloured dot, and never as coloured text without its icon.
- Use the formula `Label · what it means or what to do`, for example "Warning · Needs a moment".
- Replace the current text glyphs (✓ △ ! ×) with drawn icons from the icon set (see 5.5).

### 3.5 Subjects: emblem first, colour second
Eight hues spaced 40° apart, avoiding the indigo band (h 255–295). Lightness **alternates** between neighbouring hues, which is what keeps them distinct for colour-blind users.

| Subject | Hue | Day solid (vs page) | Day subtle | Night solid (vs page) | Night subtle |
|---|---|---|---|---|---|
| Analysis | 220 | `#00789C` (4.6) | `#D9F4FD` | `#17A9CB` (6.8) | `#082831` |
| Topology | 180 | `#009F89` (3.1) | `#DAF6EF` | `#52D7C1` (10.7) | `#082A25` |
| Logic | 140 | `#417934` (4.8) | `#E4F4E1` | `#74A968` (6.9) | `#192916` |
| Number theory | 100 | `#978722` (3.3) | `#F3EFD9` | `#CEC06A` (10.3) | `#28240C` |
| Algebra | 60 | `#9D5300` (5.3) | `#FEEADB` | `#CE8545` (6.4) | `#321F0F` |
| Combinatorics | 20 | `#C86265` (3.6) | `#FFE7E6` | `#FF9D9E` (9.5) | `#351C1C` |
| Geometry | 340 | `#984780` (5.4) | `#FDE7F5` | `#C97AAF` (6.2) | `#311C2A` |
| Probability | 310 | `#9E6EC0` (3.6) | `#F5E9FE` | `#D5A8F8` (9.7) | `#2A1E33` |
| Other / uncategorised | — | `text.secondary` | `surface.muted` | `text.secondary` | `surface.muted` |

The closest pair of any two subjects (ΔE):
- **Day:** 12.0 normal, 4.2 deuteranopia, 5.7 protanopia.
- **Night:** 13.6 normal, 4.5 deuteranopia, 6.6 protanopia.

The weakest pair under deuteranopia is Logic and Algebra. That is why the mini-emblem glyph is **required** wherever a subject colour appears.

Rules:
- Every subject solid is ≥3:1 against the page in both themes, so it is safe for dots, glyphs, chart marks and emblem strokes.
- Subject colour is **never used for text**. Labels are always `text.primary` or `text.secondary`.
- Use subject colour **everywhere a subject appears**: tags, list-row tiles, mastery bars, chart series, emblems and statement cards. That is consistency, not decoration.
- Rename "Linear algebra" to "Algebra" everywhere, or the reverse. One name per subject.

### 3.6 Data-viz colour
| Role | Day | Night |
|---|---|---|
| Categorical series | Subject solids | Subject solids |
| Sequential ramp, 4 steps (heatmap) | "Ink": `#7E8CAB` (3.1) → `#516494` (5.4) → `#2F4275` (9.0) → `#172448` (14.0) | "Starlight": `#756B51` (3.6) → `#9E8E65` (5.9) → `#CFB883` (9.8) → `#FCEABE` (15.9) |
| Empty cell | 1px `border.subtle` outline, no fill | 1px `border.subtle` outline, no fill |
| Gridline | `border.subtle` | `border.subtle` |
| Baseline / axis line | `border.default` | `border.default` |
| Axis labels | `text.tertiary` | `text.tertiary` |
| Data labels | `text.secondary` | `text.secondary` |
| Goal / target line | `text.primary`, 1px dashed | `text.primary`, 1px dashed |

Every filled heatmap step is ≥3:1 against the page, and neighbouring steps differ by roughly ΔE 12–15. Day ink "darkens like ink on paper"; Night starlight "brightens like stars".

### 3.7 Elevation
Day uses ink-tinted shadows (never pure black). Night uses lightness, a border and a "rim light" instead of shadows, keeping shadows for overlays only.

| Level | Used for | Day | Night |
|---|---|---|---|
| 0 | Page content | Flat | Flat |
| 1 | Cards, statement cards | `surface.raised` + `border.subtle` + shadow y 1 / blur 2, ink at 6% | `surface.raised` + `border.subtle` + 1px inner top highlight, white at 5% |
| 2 | Menus, toasts, popovers | `surface.overlay` + `border.subtle` + shadows y 4 / blur 12 (ink 8%) and y 12 / blur 32 (ink 10%) | `surface.overlay` + `border.subtle` + shadow y 12 / blur 32, black at 50% + rim highlight |
| 3 | Sheets, dialogs | `surface.overlay` + shadow y 24 / blur 64 (ink 18%) + scrim (ink at 40%) | `surface.overlay` + scrim (black at 60%) + rim highlight |

"Ink" means `#121B31`. The toast is level 2 in **both** themes; today it floats in Day but is flat in Night.

### 3.8 Background texture (signature, optional but recommended)
- **Day:** a 24px graph-paper grid of 1px lines in `border.subtle` at 35% opacity, on `surface.page` only. Never on cards or inputs. It fades out behind long text.
- **Night:** a sparse star field (0.5–1.5px dots, 1 per roughly 4,000px², 20–60% opacity) in hero and empty-state areas only.
- Neither texture may change text contrast by more than 0.1. Both are turned off in high-contrast modes and when "reduce transparency" is on.

---

## 4. Typography

### 4.1 Families and their jobs
| Family | Job |
|---|---|
| Current serif | Display, titles, section headings, **reading** prose (statements, proofs, descriptions) |
| Instrument Sans | UI: body, labels, buttons, captions, numbers |
| Math font with OpenType MATH support | Inline and display mathematics, math glyphs in tiles. Pick the one closest to your serif's x-height: STIX Two Math, Libertinus Math or similar |
| Current mono | Code, IDs, version strings |

This fixes the current contradiction: the spec says body text is sans, but all prose is set in the serif. Both are now named, separate roles.

### 4.2 Role scale (mobile → desktop)
| Role | Family | Size / line height | Weight | Tracking | Notes |
|---|---|---|---|---|---|
| `display` | Serif | 44/48 → 56/60 | 400 | −1.5% | One per page |
| `title` | Serif | 32/38 → 40/46 | 400 | −1% | Page title |
| `headline` (h2) | Serif | 26/32 → 30/36 | 450 | −0.5% | Section heading |
| `subhead` (h3) | Serif | 20/26 → 22/28 | 500 | 0 | Clearly smaller than h2 (today they are identical) |
| `lead` | Serif | 19/30 | 400 | 0 | Intro paragraph |
| `reading` | Serif | 17/28 | 400 | 0 | Statements and proofs. Old-style proportional numerals |
| `reading.italic` | Serif italic | 17/28 | 400 | 0 | Emphasis and variables in prose |
| `body` | Sans | 16/24 | 400 | 0 | UI text |
| `body.strong` | Sans | 16/24 | 600 | 0 | List-row titles |
| `label` | Sans | 14/20 | 600 | 0 | Field labels, group labels |
| `supporting` | Sans | 14/20 | 400 | 0 | Helper text, metadata |
| `caption` | Sans | 12/16 | 500 | +1% | Chart axes, timestamps |
| `eyebrow` | Sans | 12/16 | 600 | +8%, uppercase | "LEMMA 4.2 · TOPOLOGY" |
| `numeric.xl / lg / md` | Sans | 64/64, 40/44, 28/32 | 600 | −2% | Tabular lining numerals, always |
| `code` | Mono | 14/20 | 400 | 0 | — |

Rules:
- Every number in the UI (charts, measures, times, steppers) uses tabular lining figures.
- Units are set smaller than the number, at 60% of its size, in `text.secondary`, with a non-breaking space: "50 min".
- Keep reading text to 60–75 characters per line on tablet and desktop.
- Use proper characters: "…" (not "..."), en dash for ranges ("09:00–09:50"), true minus in deltas ("−5 min") and "×" for multiplication.
- In the type specimen, label every style with its role name, size and family. "A proof begins with a question." currently has no label.

---

## 5. Space, size, shape and icons

### 5.1 Spacing scale (4-point)
`space.1` 4 · `space.2` 8 · `space.3` 12 · `space.4` 16 · `space.5` 20 · `space.6` 24 · `space.8` 32 · `space.10` 40 · `space.12` 48 · `space.16` 64 · `space.20` 80

### 5.2 Layout tokens
| Token | Mobile | Tablet | Desktop |
|---|---|---|---|
| Page margin | 16 | 32 | 48 |
| Section gap | 48 | 64 | 80 |
| Group gap (between related blocks) | 24 | 24 | 32 |
| Field gap (between form fields) | 16 | 20 | 20 |
| Label to control | 8 | 8 | 8 |
| Control to helper text | 6 | 6 | 6 |
| Grid | 4 columns, 16 gutter | 8 columns, 24 gutter | 12 columns, 24 gutter |

The section gap is fixed, which removes the ~190px gap under "Open menu" in Night. The open menu floats over content as a level-2 overlay and never reserves space.

### 5.3 Control sizes
| Size | Height | Horizontal padding | Radius | Use |
|---|---|---|---|---|
| sm | 32 | 12 | 8 | Dense toolbars, filter chips. The touch area is padded out to 44 |
| md | 40 | 16 | 12 | Default on desktop |
| lg | 48 | 20 | 12 | Default on mobile, primary actions |

The minimum touch target is 44×44 everywhere, including the "…" overflow button and the stepper's −/+ buttons.

### 5.4 Radius
`radius.xs` 4 (checkbox) · `radius.sm` 8 · `radius.md` 12 (controls) · `radius.lg` 16 (cards, banners) · `radius.xl` 24 (hero card, sheets) · `radius.full` (tags, filter chips, switch, avatars).

Nesting rule: when the padding is smaller than the outer radius, inner radius = outer radius − padding. Otherwise each element keeps its own radius.

Badges use `radius.sm`, not full. Their **shape** is what tells them apart from tags and filters.

### 5.5 Iconography
- One icon set: 20px grid, 1.5px stroke, round joins, 2px corner radius. Sizes 16, 20 and 24.
- Status icons use a filled shape (see 3.4). Everything else is outline.
- Math symbols are **typography**, not icons. They are set in the math font.
- Every icon-only button has an accessible name and a tooltip on desktop.

---

## 6. The state model

One definition, used by every interactive component in both themes.

| State | Visual rule | Tokens | Notes |
|---|---|---|---|
| Rest | Base styling | Component tokens | — |
| Hover (pointer only) | State layer: text colour at 6% over the surface | `state.hover` = ink 6% (Day), white 6% (Night) | Filled primary buttons use `action.bg.hover` |
| Pressed | State layer at 12% plus a 0.98 scale on buttons | `state.pressed` | Primary uses `action.bg.pressed` |
| Focus-visible | 2px ring with a 2px gap filled with the page colour | `focus.ring` | Keyboard only, never removed, same in both themes |
| Selected / on | `selection.subtle` background + `selection.fg` + check or indicator | `selection.*` | Used by Toggle button, Filter chip, menu item and list selection |
| Disabled | `text.disabled`, transparent fill, `border.subtle`, no state layers | `text.disabled`, `border.subtle` | No dashed borders, no hatching, no "raised" fill. Add the reason in a tooltip or helper text |
| Read-only | No fill, no border, value in `text.primary`, lock icon after the label | `text.primary` | The value can be focused and copied. It must never look more editable than an editable field |
| Loading | Same variant and **locked width**, spinner before the label, label changes to "Saving…" | Unchanged | `aria-busy`. On success: check icon plus "Saved" for 1.2s, then back to rest |
| Invalid | 1px `status.danger.fg` border + danger icon inside the field + message with icon below | `status.danger.*` | Validate on blur or submit, not on every keystroke |
| Dragging | State layer at 16% + level-2 elevation | — | Lists, sliders |

**Dashed borders are reserved for drop zones.** That frees them from disabled and read-only states.

**Parity rule:** a state may differ between Day and Night **only in token values**. The current mismatches (pressed ring in Night only, native radio in Night only, flat toast in Night only, disabled text brighter than supporting text in Night but the same as it in Day) are all removed by this table.

---

## 7. Components

### 7.1 Buttons
| Variant | Fill | Text | Border | When to use |
|---|---|---|---|---|
| Primary | `action.bg` | `text.on-action` | None | One per view: the next step |
| Secondary | `surface.muted` | `text.primary` | None | Alternative actions |
| Tertiary | Transparent | `link` | None | Low-emphasis actions |
| Destructive (in page) | Transparent | `status.danger.fg` | None | Starts a destructive flow |
| Destructive (confirm) | `danger.solid` | White | None | Only inside a confirmation sheet |

- Tertiary and destructive-in-page buttons get a negative inline margin equal to their padding, so the **label lines up with the column edge**. This fixes the indented "Delete session".
- Icons are 20px with an 8px gap. A trailing arrow is only for "go somewhere", never for "do something".
- Loading follows the state model: same variant, locked width.
- The current "Pressed state" demo becomes a **Toggle button** (`aria-pressed`). On: `selection.subtle` + `selection.fg` + leading check. Off: secondary. It never uses the primary fill.

### 7.2 Tags, badges and filter chips (replacing "chip")
| Component | Shape | Anatomy | Interactive | Example |
|---|---|---|---|---|
| **Tag** (subject) | Pill, 28 high | Mini emblem 14px in subject solid + label in `text.primary`, on subject subtle | No | "Analysis" |
| **Badge** (status or proof state) | Rounded rectangle (`radius.sm`), 24 high | Status icon 14px + label in status fg, on status subtle | No | "Due today" (warning), "Demonstrated" (success) |
| **Filter chip** | Pill, 32 high (44 touch area) | Label in `text.secondary` + 1px `border.default`. Selected: `selection.subtle` + `selection.fg` + leading check | Yes, multi-select | "All cards", "Due today" |

Three shapes for three jobs, so a glance tells you what is tappable.

**Proof-state badges** (a creative standard set, used everywhere progress is shown):
| State | Glyph | Colour |
|---|---|---|
| Conjecture (not started) | ○ hollow circle | `text.secondary` on `surface.muted` |
| In progress | ◐ half circle | `text.primary` on `surface.muted` |
| Demonstrated | ∎ tombstone (end of proof) | Success |
| Review due | ↻ cycle arrow | Warning |

The ∎ only works once it is **explained** in the legend and paired with its label. Never show it alone.

### 7.3 Fields
- **Anatomy:** label (`label`) + optional "Optional" suffix in `supporting` (no asterisks) → control → helper or error.
- **Control:** `surface.sunken` + 1px `border.default`, `radius.md`, height lg (48) on mobile and md (40) on desktop, 16px text.
- **States:** follow section 6. Read-only has no field chrome at all.
- **Error:** the message starts with what to do: "Add a name before continuing" (already good). Link it with `aria-describedby`.
- **Select:** chevron on the right. On mobile it opens a bottom sheet of radio rows; on desktop, a listbox popover.
- **Time range field (new):** a "Start" and "End" pair. Labels sit above, values are inside with a trailing clock icon, joined by an en dash. Duration presets (25 / 50 / 90 / Custom) sit underneath as **filter chips** and move the End time. Choosing "Custom" shows a slider with units. This replaces the three competing duration controls (chips, radio and slider) with one pattern.

### 7.4 Selection controls
| Control | Spec |
|---|---|
| Radio | 20px; off: 1.5px `border.default` on `surface.sunken`; on: `action.bg` border + 8px dot. Rows are 44 high with a 4px gap. Fully themed (no native control) |
| Checkbox | 20px, `radius.xs`; checked: `action.bg` fill + 2px white check; indeterminate: 10×2 bar |
| Switch | 48×28 track, 22px thumb. Off: `surface.muted.hover` + `border.default`; on: `action.bg`. The thumb shows a small ✓ or – so state doesn't depend on colour |
| Slider | 4px track, `action.bg` fill, 24px thumb with a focus ring, value bubble while dragging, **units in the value** ("45 min"), min/max labels, tick marks at the presets. Arrow keys ±5, Page Up/Down ±15 |
| Stepper | Height 40; −/+ are 44×44 touch targets; the button at min or max is disabled; tabular value; press and hold repeats |
| Segmented control | For switching views **within** a page; 2–4 options. Thumb is a raised neutral (Day `surface.overlay` + level-1 shadow, Night `surface.muted.hover`) with text in `text.primary`. **Not indigo**, which keeps the accent free for actions |
| Tabs | For switching content panels. 2px underline in `action.bg` on the selected tab; selected label `text.primary`, others `text.tertiary`. Scrolls with fade edges when there are too many |

### 7.5 Menus
- Opens 4px below its trigger and scales in from the trigger's position. On mobile it becomes a bottom action sheet.
- The trigger shows a chevron or "…" and announces `aria-expanded`.
- Items are 44 high with a 20px leading icon. Groups are separated by dividers. **Destructive items go last, after a divider, in `status.danger.fg`.** Today "Delete session" looks like every other item.
- Desktop: keyboard shortcuts aligned right in `caption`; type-to-jump; arrow keys move; Esc closes and returns focus to the trigger.

### 7.6 Feedback
| Component | Spec |
|---|---|
| **Banner** (inline, persistent) | Full status subtle background, `radius.lg`, **no side stripe** (it bends into a crescent on rounded corners), 20px status icon, optional title + body, actions **right-aligned**. Below 360px of content width, actions move under the text |
| Offline banner | "Offline · Changes are saved on this device. Retrying in 10 s" with the action "Retry now". Say what is being retried |
| **Toast** (temporary) | Level-2 overlay. Bottom centre on mobile (above the bottom nav), bottom left on desktop. Max width 400. One action + close. Shows for 6s, or 8s if it has Undo; pauses on hover or focus; `aria-live="polite"`; never takes focus. Optional thin countdown line (static when reduce-motion is on) |
| **Confirmation sheet** | The title states the consequence ("Delete this session and its 12 cards?"). Buttons: Cancel (secondary) + Delete (danger solid) |
| Undo or confirm? | Rule: if it can be reversed → act immediately and offer an Undo toast. If it is permanent → ask in a confirmation sheet. Never both |
| **Skeleton** | Shapes copy the real layout; `surface.muted`; shimmer is a 1.6s sweep (a light sweep in Night). Static when reduce-motion is on. Only for waits over 300ms |
| **Empty state** | A hero-size emblem for the relevant subject drawing itself in → serif headline → one sentence → one action. No generic line art |
| **Error state (full page)** | An emblem drawn "broken" (one stroke dashed) + what happened + what to do + Retry |

### 7.7 Cards and rows
- **Hero "next step" card:** one per screen. At most 3 badges in a single row; the duration becomes metadata text ("50 min"), not a chip. The subject emblem sits as a large background element (8–12% opacity, anchored bottom right, cropped by the card). Replace the indigo gradient with flat `surface.raised`; the emblem provides the atmosphere.
- **List row:** 64 high for two lines. The leading tile is 40px, `radius.md`, on subject subtle, with a math glyph in the subject solid. Title in `body.strong`, metadata in `supporting`. The trailing chevron is **always present** if the row navigates; a completed row shows a Demonstrated badge in its metadata instead of swapping the chevron for a check. The whole row is the touch target.
- **Statement card:** see 8.3.

### 7.8 Measures
- **Stat tile:** label (`supporting`) → value (`numeric.lg`, unit at 60%) → change row with ▲/▼ + signed value + comparison ("+25 min vs yesterday"). The change row is **always reserved** so tiles line up ("No change yesterday" when empty). Change text is neutral by default; it turns success or danger only when tied to a goal the user set. Optional 24px sparkline.
- **Mastery bar:** 6px, `radius.full`, filled in the **subject solid** on `border.subtle`, with a label row above (subject name + "65 of 100"). At 100%: the bar stays the subject colour and gets a ∎ at its end plus a "Demonstrated" badge, so completion is shown by meaning rather than by turning the bar green. At 0%: show "Not started" as text.
- **Constellation progress:** see 8.2.

---

## 8. Signature systems (what makes it a 10)

### 8.1 Emblem system
Each subject's emblem is a real mathematical construction, drawn in its subject solid.

| Subject | Construction | Notes |
|---|---|---|
| Analysis | Fourier partial sums S₁…S₇ of a square wave, overlaid; shows the Gibbs overshoot | Refines today's square-wave drawing |
| Algebra | Unit lattice under a linear map (shear + rotation), with both eigenvectors drawn in bold | Refines today's grid |
| Topology | (2,3) torus knot drawn as a ribbon of 12–24 offset paths | Refines today's interlaced loops |
| Number theory | Modular times-table circle: k = 2 makes a cardioid, k = 3 a nephroid | Today's drawing |
| Geometry | Euclid's construction of the equilateral triangle (two circles + triangle) with nested rotated polygons | New |
| Logic | Hasse diagram of the Boolean lattice 2³ (a cube of 8 nodes) | New |
| Probability | 60–200 random-walk paths through a Galton board that pile up into a bell curve | New |
| Combinatorics | Pascal's triangle mod 2 (Sierpiński pattern), or the complete graph K₇ | New |
| Other | Rose curve r = cos(kθ) in `text.secondary` | Today's flower, made neutral |

**Three sizes, three levels of detail**
| Size | Pixels | Detail | Stroke |
|---|---|---|---|
| Glyph | 14–24 | Hand-drawn simplified pictogram, 1–3 strokes, **not** generated | 1.5px |
| Tile | 40–64 | Simplified generation, 12–24 strokes | 1px |
| Hero | 160+ | Full generation, 60–400 strokes, layered opacity | 0.5–0.75px |

- **Day:** ink strokes with no glow. The stroke must be ≥3:1 against its surface (subject solids already are). Today's Day emblems measure only 1.7–2.8:1.
- **Night:** the same strokes plus a soft glow at hero size only (6px blur, 30% opacity).
- **Seeded variation:** each learning path gets a stable variant from its ID within safe ranges (for example times-table k ∈ {2, 3, 4, 5}, knot (p, q) ∈ {(2,3), (2,5), (3,4)}, walk count 60–200). This makes "the same path keeps the same mathematical drawing" a guarantee. Document the ranges and exclude values that look broken.
- Emblems are decorative to screen readers. The subject name is always in nearby text.
- Performance budget: at most 400 paths at hero size, and no more than 3 hero emblems drawn at once.

### 8.2 Constellation progress (named after the kit)
- A path's checkpoints are drawn as **stars joined by thin lines**: a constellation.
- Not started: hollow star, 1px `border.default`. In progress: half-filled. Demonstrated: filled in the subject solid (glows in Night, ink-filled in Day). Current checkpoint: a gentle 2s glow pulse (static when reduce-motion is on).
- Mobile: a horizontal, slightly zig-zag line. Desktop: the stars follow the path's emblem outline.
- Accessible as an ordered list: "Checkpoint 4 of 7, in progress".

### 8.3 Statement cards (mathematical typesetting as UI)
- Variants: Definition, Lemma, Theorem, Example, Exercise, Proof.
- Anatomy: eyebrow with number and subject ("LEMMA 4.2 · TOPOLOGY") → serif title → `reading` body with inline maths → optional "Proof" block in `reading.italic` lead-in → a **∎ at the end** once demonstrated.
- Definition: 2px left rule in the subject solid inside the padding (not a side stripe on the card edge). Theorem: `surface.raised` + level 1. Exercise: `surface.sunken`.
- This replaces the generic "Every open cover…" card and gives the product a voice nobody else has.

### 8.4 The ∎ moment (completion)
- When a checkpoint is demonstrated, in order: the button turns into a check → the ∎ draws in (300ms) → that checkpoint's star fills → the subject emblem finishes its last stroke (900ms) → caption "Demonstrated".
- Light haptic on mobile. No confetti and no exclamation marks: calm, earned satisfaction.
- With reduce-motion on: everything appears in its final state with a 120ms fade.

---

## 9. Data visualisation rules

1. **Every chart has** a serif title, a one-sentence summary written from the data ("You studied 11 h this week, most on Tuesday"), the chart, and "Show as table" (keep this). The summary is what screen readers hear first.
2. **Axes:** ticks are round numbers (1, 2, 2.5 or 5 × 10ⁿ). A percentage axis always runs 0–100% (not today's 0 / 46 / 91%). Gridlines use `border.subtle`; the baseline uses `border.default`.
3. **Bars:** width 40–60% of the slot, 4px top radius, 2px page-coloured gap between stacked segments. Label every total or none (today Mon has no total but Tue and Wed do).
4. **Lines:** 2px stroke, 6px points with a 2px page-coloured ring, last point labelled, optional 8% area fill.
5. **Heatmap:** fills the available width (week columns × 7 rows). Five bins, including empty. The legend shows **five swatches labelled with ranges** ("0", "1–15", "16–30", "31–60", "60+ min"). Today gets a 1.5px `text.primary` outline. Tap or hover shows the exact value.
6. **Legends:** use direct labels when there are 3 series or fewer. Otherwise the legend uses mini-emblem glyphs, not dots.
7. **Two kinds of horizontal bar, never confused:** "Time by subject" (amounts, scaled to the largest value, with a note "scaled to highest") and "Mastery" (progress out of 100). They differ in label format, thickness (10 vs 6) and track (none vs `border.subtle`).
8. Data points can be reached by keyboard (arrow keys move between points and announce the value).

---

## 10. Motion

| Token | Value | Use |
|---|---|---|
| `duration.xs` | 80ms | Colour and opacity state changes |
| `duration.sm` | 120ms | Hover, press, toggles |
| `duration.md` | 200ms | Menus, popovers, tab underline |
| `duration.lg` | 320ms | Sheets, page transitions |
| `duration.xl` | 600ms | Statement reveals, the ∎ moment |
| `duration.emblem` | 900ms | Emblem drawing in |
| `ease.standard` | cubic-bezier(0.2, 0, 0, 1) | Most movement |
| `ease.enter` | cubic-bezier(0, 0, 0, 1) | Things arriving |
| `ease.exit` | cubic-bezier(0.3, 0, 1, 1) | Things leaving (about 70% of the enter duration) |
| `ease.emphasized` | cubic-bezier(0.05, 0.7, 0.1, 1) | Sheets, completion |

Rules:
- In-page movement is 24px or less.
- Menus scale from 0.96 to 1 from the trigger's position.
- Toasts rise 16px.
- Theme switching cross-fades colours over 200ms, but not on page load.
- **Reduce motion:** all movement becomes a 120ms opacity fade; shimmer, pulses and emblem drawing are off; emblems appear complete.

---

## 11. Content and voice

- **Voice:** calm, precise, encouraging, never cute. Second person. Sentence case. No exclamation marks.
- **Buttons** start with a verb and say what happens: "Start session", "Save changes", "Delete session".
- **Errors** say what happened, then what to do: "Couldn't save. Check your connection, then retry."
- **Disabled controls explain themselves:** "Unavailable · Finish Checkpoint 3 first."
- **Status** uses the formula `Label · meaning`.
- **Numbers:** "50 min", "6 h", "65 of 100" (rather than "65 / 100" in sentences), ranges with an en dash, a non-breaking space before units.
- **Maths language** is used precisely: "Demonstrated" only for completed proofs; "Conjecture", "Lemma" and "Theorem" keep their real meanings.

---

## 12. Accessibility specification

| Area | Requirement |
|---|---|
| Text contrast | All text ≥4.5:1 (tertiary is the floor); large text ≥3:1. Checked for every declared foreground/background pair in all 4 theme modes |
| Non-text contrast | Control borders, focus rings, icons, chart marks, subject solids and heatmap steps ≥3:1 |
| Colour independence | Status = icon + text; subject = glyph + text; switch = thumb icon; charts = direct labels or glyphs |
| Touch targets | ≥44×44 (WCAG 2.2 requires 24; aim for 44) |
| Focus | Always visible, 2px ring + 2px offset; never hidden behind sticky headers or toasts (WCAG 2.2, 2.4.11) |
| Keyboard | Documented keys per component: radios and tabs (arrows), menu (arrows, Esc, type-to-jump), slider (arrows, Page Up/Down, Home, End), sheet (traps focus, Esc closes, focus returns to the trigger) |
| Screen readers | Proper names and roles; toasts `polite`; errors on submit `assertive`; chart summaries; emblems hidden; maths in MathML |
| Text scaling | Usable at 200% text size and down to 320px width without horizontal scrolling; labels wrap, never truncate |
| Motion | Respects reduce-motion; nothing animates on its own for longer than 5s |
| Forced colours | In Windows high-contrast mode, components fall back to system colours. Borders must exist (transparent if needed) so they reappear |
| Testing | VoiceOver (iOS, macOS), TalkBack, NVDA; automated checker with zero serious issues |

---

## 13. Themes and modes

| Mode | How it is made |
|---|---|
| Day (Paper) | Role tokens above |
| Night (Sky) | Role tokens above |
| Day high contrast | `text.secondary` and `text.tertiary` → `text.primary`; `border.default` → `border.strong`; subtle fills 2 steps stronger; focus ring 3px; textures off |
| Night high contrast | Same rules, using Night values |

- The default follows the system setting; a manual choice is remembered.
- **Parity checklist** (run on every component): same anatomy, same states, same elevation level, same icons, same spacing. Only token values change.
- On the kit page, show components **side by side in Day and Night** (a split view), not only behind a global toggle. Mismatches become obvious immediately.

---

## 14. How the kit itself is presented

Page order:
1. Principles (section 1)
2. Tokens:
   - Colour swatches showing name, value and **live contrast badges** for their intended pairings, in both themes
   - Type specimens labelled with role, size and family
   - Spacing, radius, elevation and motion tokens (with a play button for each motion token)
3. Icons and emblems: all 9 constructions × 3 sizes × 2 themes
4. Components. Each one has:
   - Anatomy diagram
   - Variants
   - **State matrix** (every state × both themes)
   - Do / don't pairs
   - Keyboard and screen-reader notes
   - Content guidance
5. Patterns: forms, undo vs confirm, empty / loading / error / success flows, the ∎ moment
6. Data visualisation: rules + every chart type with its table view
7. Changelog with semantic versions

Demo triggers ("Show undo toast", "Try completion feedback") are styled as **kit chrome**: a dashed outline, a mono "DEMO" label and kept to one side, so they are never mistaken for real components.

---

## 15. Quality gates

| Gate | Pass criteria |
|---|---|
| Contrast | Every declared pair in all 4 modes meets section 12; the build fails otherwise |
| Colour-blind separation | Categorical palettes: smallest pair ΔE ≥10 normal and ≥4 under deuteranopia and protanopia. Status: ≥4 under both |
| Token lint | No raw colour, size or duration values in components; every component token points to a role token |
| Parity | Automated screenshots of every component × state × theme; a difference in anatomy between themes fails |
| Accessibility | Automated checker: zero serious or critical issues; manual screen-reader pass on each release |
| Emblem performance | Hero ≤400 paths; drawing does not drop frames on a mid-range phone |
| Content | Labels follow the voice rules; no "..."; units use non-breaking spaces |

---

## 16. Migration map (current → new)

| Current | New |
|---|---|
| "Pressed state" button (primary fill + ring) | Toggle button using selection tokens + check |
| "Saving changes" in the secondary style, wider | Same variant as its idle button, locked width |
| Dashed disabled and read-only fields | Disabled: transparent + `border.subtle` + disabled text. Read-only: no chrome, lock icon |
| Hatched disabled switch | Standard disabled state |
| Native grey radio (Night) | Fully themed radio |
| Hero chips (dot, ring, plain text, ∎) | At most 3 badges; duration becomes metadata |
| "Neutral / Complete / Due today / All cards" row | Badges for status; filter chips for filtering |
| "Serious" status | Removed (use Warning or Danger) |
| Text glyphs ✓ △ ! × | Filled status icons |
| Banner with a curved left stripe | Fully tinted banner, actions right-aligned |
| Flat toast (Night) | Level-2 overlay in both themes |
| Start/End buttons + duration chips + pace radio + length slider | One Time range field with presets and Custom |
| Indigo segmented thumb | Neutral raised thumb |
| Indigo progress bars | Subject-coloured mastery bars + ∎ at 100% |
| Indigo heatmap, ¼ width, legend without swatches | Ink / Starlight ramp, full width, 5-swatch legend |
| Recall axis 0 / 46 / 91% | 0 / 50 / 100% |
| Lavender greys in Day | Warm paper greys |
| One grey (#676E81) for four jobs in Day | Tertiary / placeholder `#5B6375`, disabled `#878C99` |
| Generic empty-state drawing | Subject emblem drawing itself in |
| "Delete session" indented 16px | Tertiary button with negative margin, aligned |
| "Every open cover…" card | Statement card (Theorem variant) |
| "Linear algebra" / "Algebra" | One name |

---

## 17. Roadmap

Phases are ordered by dependency. Each phase ends with its acceptance criteria met.

**Phase 1: Foundations**
- Role tokens for colour, type, space, radius, elevation and motion, in all 4 modes, exported to code and Figma.
- *Done when:* the contrast, colour-blind and token-lint gates pass, and no component references a raw value.

**Phase 2: State model and core controls**
- Buttons, toggle button, fields, time range, select, radio, checkbox, switch, slider, stepper, segmented control, tabs, menu.
- *Done when:* every component's state matrix is complete in both themes and the parity check shows zero anatomy differences.

**Phase 3: Composite components**
- Tags, badges, filter chips, banners, toast, sheet, skeleton, empty and error states, cards, rows, stat tiles, mastery bars.
- *Done when:* the migration map (16) is fully ticked off.

**Phase 4: Signature**
- 9 emblem constructions × 3 sizes, seeded variation, constellation progress, statement cards, the ∎ moment, background textures, motion.
- *Done when:* the emblem performance budget is met, reduce-motion fallbacks are verified, and emblems are ≥3:1 in Day.

**Phase 5: Data visualisation**
- Chart rules, ramps, summary sentences, keyboard navigation, table views.
- *Done when:* every chart passes non-text contrast and has a summary and a table.

**Phase 6: Documentation and release**
- Kit page in the order of section 14, do/don'ts, changelog, version 1.0.
- *Done when:* the 10/10 scorecard below is all yes.

---

## 18. The 10/10 scorecard

Answer each with yes or no. A 10 is every row "yes".

| # | Criterion |
|---|---|
| 1 | Every component reads from role tokens only; Day and Night differ in values only |
| 2 | Every text pair ≥4.5:1 and every non-text pair ≥3:1, in all 4 modes |
| 3 | Every colour has exactly one job; indigo appears only on actions, selection and focus |
| 4 | Status, subject and state can each be told apart in greyscale |
| 5 | Every interactive component shows its full state matrix in both themes |
| 6 | Disabled is visibly dimmer than every text level, and read-only is never more prominent than editable |
| 7 | One component per job: no two components with the same look and different meanings |
| 8 | Every chart has round-number ticks, a summary sentence, a table view and keyboard access |
| 9 | Emblems are defined mathematically, legible at all 3 sizes and ≥3:1 in both themes |
| 10 | Motion has tokens, every animation has a reduce-motion version, and nothing moves without a reason |
| 11 | The signature systems (emblems, constellation progress, statement cards, ∎ moment) appear in real components, not just the specimen |
| 12 | Quality gates run automatically and block a release that regresses |
