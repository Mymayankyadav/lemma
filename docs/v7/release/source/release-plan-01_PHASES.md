# Phases

Sizes are relative effort for one engineering agent with review (S ≈ a day, M ≈ 2–4 days, L ≈ a week+), not calendar promises. Every phase ends with: typecheck, lint, the kit token lint, the full unit suite, all v7 browser specs, a v6 regression sample, fresh screenshots in Day and Night, and CI green on the PR head. Nothing in R0–R3 adds a dependency or touches the backend.

---

## Before release

### R0 · Stop looking broken  — size M, blocks release

**Goal:** remove every defect a new user would read as "half-built".

| Item | Audit ID | What "done" means |
|---|---|---|
| Action menus | F01 | One `ActionSheet`: 56 pt rows, 24 px icon in a 40 px tile, label and optional hint; hairline before destructive rows, which are red with their icon. Used by every ⋯ (tasks, paths, path, card, time log, inbox). |
| Native edit forms | F02 | Task edit and time-log edit rebuilt in the standard sheet: fields stack, the app's own date and time pickers, indigo primary, ghost Cancel. No native `<select>` / date / time, no red Save. |
| Missing glyphs | F08 | The two icons that render as black boxes (Inbox zero mark, "Close the day" in Search) drawn; a unit test that every icon key resolves. |
| Overlaps | F04 | One stacking contract: sheets above the tab bar (which hides while a sheet is open); content padding = tab bar + sticky bar + 16; toasts dock above the top-most bar and never cover a primary action; chart readouts flip upward. |
| Numbers that disagree | F05 | One source per metric. Review says "23 due + 2 new" when it includes new cards; the tab badge, Today and Review agree; card counts are exact, never "50+". (Some mismatches in the audit came from the capture run itself grading cards mid-way; verify on a clean session.) |
| Chart labels | F06 | Ticks thinned by available width (≥ 8 px gap; week/month starts on long ranges); reference-line labels at the plot edge with collision avoidance; no value labels on bars thinner than the label. |
| Inbox swipe | F07 | Directional wash (approve = success from the right, reject = danger from the left) and a stamped label that fades in with distance; the next card visible beneath at 96%. |
| Toasts | F13, F40 | Errors de-duplicate, never stack, and clear on navigation; one toast style (ink pill Day, raised navy Night, bold indigo action). |
| Focus timer error | F09 | No raw validation text; finishing a 0-minute session offers "Discard" instead. |
| Steppers | F14 | One stepper, always with a label and unit. |

**Acceptance:** the audit's annotated boards B01, B02, B06, B07, B10 and B14 re-shot and clean; a browser test for each row above.
**Owner gate:** approve this scope (no visual direction change).

### R1 · One system  — size L, blocks release

**Goal:** every screen speaks the same visual language, inside the approved kit.

| Item | Audit ID | Note |
|---|---|---|
| Settings sub-pages rebuilt as grouped lists | F03 | Rows with label, value, chevron or switch; edits in small sheets; save on change with a toast; "Advanced" row for numerics (flowtime ratio etc.); one Delete account card. Already on the PR's remaining list. |
| Colour meanings enforced | F20, F21, F23 | Red only for destructive and errors; amber only for overdue and at-risk; green only for success; status icons only for status. A lint rule for the obvious cases. |
| One grade language | F22 | Again / Hard / Good / Easy with one colour and one glyph each, in review, history, results, practice and charts. |
| Sheet templates | F17, F71 | Pick, form and confirm templates; negative action left, positive right, everywhere. |
| Controls unified | F32–F35, F37 | Selected state on filter chips; disabled looks disabled and explains why; no focus ring on open (only on keyboard focus); no textarea resize grips. |
| Typography voices | F15, F16, F18 | Serif for every page title (detail and settings included), no Black-weight hero numerals, no title duplicated in the bar and the H1. **Within the kit's existing type roles**, unless the Owner chooses to revise the kit (see decisions). |
| Copy and formats | F43, F49, F50, F51 | No internal IDs (N4951, CP19) as labels; no developer wording; one date and time formatter everywhere. |

**Acceptance:** board B09 and B13 re-shot and clean; the design lint extended with the new rules; every Settings scene in the lint.
**Owner gate:** decide "kit numbers vs audit numbers" (decision D1).

### R2 · Brand core and room to breathe  — size L, blocks release

**Goal:** the first things a user sees (home-screen icon, cover art, the main screens' first viewport) look intentional; heavy chrome is reduced.

**Brand core (see `02_BRAND_CORE_SPEC.md`):**
* **App icon** in the direction the Owner picks (A Compass, B Constellation or C Notebook): PWA 192/512, maskable 512, Apple touch icon 180, an SVG favicon that follows the device theme, and new shortcut icons (Review, Approve, Atlas) in the same family. `theme_color`/`background_color` updated to the v7 page colour.
* **Emblem system v2**: eight subject families with three detail tiers (hero, tile ≤ 24 strokes, glyph 1–3 strokes), deterministic per path seed, one stroke rule per tier, contrast-checked in Day and Night. Replaces the current generator's dense tiles (audit F27). Pure SVG code in the existing generator; no assets to download, no dependency.

**Room to breathe (subset of the audit's Phase 2):**

| Item | Audit ID |
|---|---|
| Path header collapses on scroll; one bottom action layer | F11, F18 |
| Calendar Day header compacted (date row + view switch in one line) | F10 |
| No bordered box inside a bordered box | F31 |
| Night data palette (indigo ramp) and Night calendar event surfaces | F24, F25 |
| Long content clamped; chip pickers that scale (search + list beyond 8 options) | F76, F77 |
| Atlas at volume falls back to the list (or clusters) instead of a hairball | F12 |
| Empty states: a simple mark (from emblem v2 / existing glyphs) + one sentence + one action | F36 (simple version; illustrated version is A2) |

**Acceptance:** board B04, B05, B11, B12 re-shot; busy-account captures pass "no hairball, no unclamped text, no unusable picker".
**Owner gates:** pick the icon direction (D3); approve the emblem v2 sheet (D4); re-approve the golden phone screens that change (D2).

### R3 · Release gate and switch  — size M (plus Owner time)

1. Fresh screenshot pack (phone, tablet, desktop; sample and busy accounts) and a **short re-audit of changed screens** by the same independent reviewer; target ≥ 8 overall, no Major findings open.
2. **Golden re-approval** of any of the six approved phone screens that changed.
3. **350 KB budget decision** (D5) and the performance probe on the release build.
4. Accessibility pass (keyboard, names, 200% text, reduced motion; automated) and the **Owner's device and screen-reader checks** (Android Chrome and installed, iPhone Safari and installed, a hardware keyboard, VoiceOver or TalkBack on the golden screens).
5. Independent full-PR code review.
6. **Switch PR**: `v7Shell` on by default, v6 kept for rollback, rollback verified (flag off restores v6 with no data lost). Google Fonts link removed for v7.

**Owner gates:** D2, D5, device checks, approve the switch.

---

## After release

### A1 · Motion v1 (no new libraries)  — size M

Built with the `motion` library already in the app and CSS; every item has a reduced-motion alternative (crossfade or still).

* Tokens: instant 90 ms, quick 160 ms, base 240 ms, draw 600–900 ms, sheet spring (380 / 36), stagger 30 ms capped at 6 (see `visuals/motion-tokens.png`). Mapped onto the kit's existing motion presets, not a second system.
* System: sheets rise (M-SYS-02), toast in/out (M-SYS-04), collapsing header (M-SYS-01), list insert/remove, check-draw on completion (L-06 done as an SVG stroke animation, not Lottie).
* Screens: inbox stamps scrubbed by the drag (M-INB-01…04), review card flip and grade feedback (M-REV-01…05), calendar block drag and suggested-block accept (M-CAL-02…04), task complete (M-TSK-01), emblem v2 stroke-in on path covers (the "draw, don't slide" signature).
* Haptics: the existing helper on Android; documented as "no effect" on iPhone Safari (web vibration is unsupported there).

**Acceptance:** no frame over 50 ms during the eight signature transitions at 4× CPU slowdown; reduced-motion snapshots identical in layout.

### A2 · Icons and illustrations  — size M (design) + S (engineering)

* Icon normalisation: one stroke set (1.75 px on 24 px, round caps), I-14…I-27, subject glyphs (I-30) kept as their own mathematical family, never used as action icons.
* Illustrated empty states IL-01…IL-08 (line-art "notebook" style, ≤ 12 KB SVG each, `currentColor`, Day and Night), replacing R2's simple marks.
* Graph-paper and starfield textures as tileable SVG (≤ 4 KB).

**Owner gate:** approve the illustration style from three sample states first (D6).

### A3 · Lottie and Rive  — size M (design) + M (engineering), needs a dependency approval

* **Dependency (Owner approval required, D7):** a dotLottie web player loaded **lazily** only where an animation plays (never on Today's first load), or the lighter `lottie-web` light build; Rive runtime only if L-04 (focus orbit) goes ahead. Budget: player ≤ 60 KB gzip loaded on demand; each `.lottie` ≤ 60 KB (≤ 120 KB for L-01, L-04).
* Assets (from the audit's list): L-07 approve/reject stamps (scrubbed by gesture), L-08 copy confirmation, L-09 loader, L-10…L-13 endings (round complete, inbox zero, day closed, checkpoint demonstrated), L-04 focus orbit (Rive), L-16 theme transition.
* **Theme slots** named after design tokens (`ink`, `paper`, `subject`, `accent`, `success`, `danger`) so one file serves Day, Night and every subject.
* Frame 1 of every file is a valid still for reduced motion; celebrations ≤ 1.6 s and tappable through.

**Acceptance:** first load of Today unchanged in bytes; each animation verified Day/Night, reduced motion, 60 fps on a mid-range Android.

### A4 · Signature moments  — size L (design-led)

Atlas as a living sky (F12, F57; M-ATL-01…06), the path map as a real map (F56; M-PTH-02…05), endings with ceremony (F55, F70), the focus orbit (F38; M-FOC-01…07). Each starts as an Owner-approved design, then is built behind its own flag.

### A5 · Brand and distribution  — size M

Share images (OG 1200×630: path completed, weekly summary), app-store / PWA screenshot templates, achievement seals (used sparingly), splash refinement, optional sound (off by default). **Widgets** only if a native wrapper is ever built: the app is a PWA, which cannot provide home-screen widgets.

---

## Dependencies between phases

* R1 depends on R0 (shared components first). R2's brand core can run **in parallel** with R0/R1 because it touches only the generator and icon files.
* R3 needs R0–R2 and the Owner.
* A1 can start right after release; A2 and A3 need design work that can begin **now**, in parallel, so assets are ready when engineering gets to them.
* A4 needs A1 (motion tokens) and, for the Atlas, A2's textures.
