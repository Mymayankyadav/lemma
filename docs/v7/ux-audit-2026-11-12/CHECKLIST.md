# v7 UX plan r3 — checklist

The one place to see what is done, what is open and what waits for the Owner. It covers every item in this folder: findings V01–V43 (`01`), web phases U0–U4 (`02`), Android findings AW1–AW17 and phases AN1–AN4 (`03`), assets G0–G2 (`04`, `06`), r3 findings IL, LT and IC with proposals P1–P7 (`06`), Owner decisions E1–E23 (`05`) and the device checks (`03` §5).

Started 12 Nov 2026 on `d741617` (Owner task N130). The order is the plan's: **Now** → **Next** → **Then** → **Later**.

## How to use this checklist

1. **Pick** an unticked item under **Now** whose gate is clear. A gate is an Owner decision (`needs E5`), another phase (`needs U1`) or a device. Items with no gate can start today.
2. **Claim** it in the normal way (AGENTS.md): an open PR for a NEXT.md item. Owner-directed work becomes an Owner task item. Put the checklist ids (for example `V14, V16`) in the PR body.
3. **Tick** the item in the same PR and append ` — N### (#PR)`. The tick lands on main when CI merges the PR, so this file stays true. Edit only your own items' lines; that keeps parallel PRs from conflicting.
4. **Record** what changed in `docs/current/<id>.md`, as usual.
5. **Owner decisions:** the Owner ticks a decision here, or says it in a chat or PR, and the agent records it with the date.

Legend: `- [x]` merged · `- [ ]` open · *(gate)* in italics · **Major** in bold. Sizes: S about a day, M two to four days, L a week or more.

## Progress

| Phase | Done | Open | Gate |
|---|:-:|:-:|---|
| U0 Truth | 20 | 0 | none (E1) |
| G2 Illustration, motion, icon polish | 9 | 5 | E19, E21, E22 for some |
| U2 Resilience (= AN2) | 5 | 4 | E12; device check 1 |
| AN1 Make the built app right | 6 | 4 | E23, a device |
| G0 Refresh what is stale | 2 | 0 | none |
| AN3 Feel | 2 | 4 | E17 |
| U1 Large screens | 0 | 11 | E2 |
| G1 Pipeline | 2 | 2 | E23 for the themed ∎ |
| U3 Room and rhythm | 0 | 9 | sheets, E11 |
| AN4 Large screens and postures | 0 | 4 | U1 |
| A5′ Share and release pages | 0 | 2 | none |
| U4 Signature | 0 | 8 | a sheet per flag, E3, E9, E10 |
| Owner decisions | 8 | 12 | Owner |
| Device checks | 0 | 10 | a phone |
| Definition of done | 0 | 4 | a re-audit |

---

## Now

### U0 · Truth (web, M) — `02` §2

Fixes with no design decision. Each gets a regression test that fails without the fix.

- [x] **V01** Chart value axes read "0 min" on every tick — N125
- [x] **V04** Selected duration chips show two ticks — N125
- [x] **V02** Today strip: each hour label at its own position, last label = window end — N130 (#1363)
- [x] **V03** One number, two values: practice "0 of 1" vs "0 of 2"; review estimate 9 vs 10 min — N130 (#1363)
- [x] V17 Plan proposal: Reject left, Approve right — N130 (#1363)
- [x] V24 Quick focus: two options called "Open" — N130 (#1363)
- [x] V14 Capture stays in the dock (no fade that kept its slot); tabs and Capture sit at the same inset, so the bar is symmetric — N132
- [x] V15 Calendar Month heat numerals ≥ 4.5 : 1 on every step, Day and Night (step 2 was 2.93 : 1) — N132
- [x] V16 Almanac opens at today; one roving focus, starting on today; no empty weeks before the first study day — N132
- [x] V18 Names, not codes: "CP4", "CP1 · Foundations", "S6", "S7" (`nameCodes`) — N132
- [x] V32 Unknown address → "This page isn't in the notebook" with Search and Today — N132
- [x] V33 Example deck: Linear Algebra and Topology repeat no card (Real Analysis still repeats a few further down) — N132
- [x] V34 Copy: "India Standard Time", subject rows without "glyph", the tutor tile, exact durations in chart sentences, the card editor's first helpers — N132
- [x] V35 Cloze highlight: selection tint and ink (7.4 : 1 Day, 8.3 : 1 Night), not danger red — N132
- [x] V43 Data and account: grouped lists (Account, Export, Delete account in a sheet), kit sizes and checkbox — N132
- [x] V37 Inbox triage: three round buttons, one size, one baseline — N132
- [x] V38 Card detail: "Thu 12 Nov" on one line; "Review now" is the pinned primary when due ("Edit card" stays as a secondary button: an existing §6.11 test requires it) — N132
- [x] V39 Sign-in: the construction drawing passes behind the title, never the links or the note — N132
- [x] V40 Session: the button reads "Mark resolved" — N132
- [x] V42 Calendar Month: out-of-month days dimmed; Week blocks show a two-word title from 40 px (a 390 px phone's column is 42 px) — N132

### G2 · Illustration, motion and icon polish (M) — `06` §5

- [x] LT1 *(P5)* **Never erase:** only the backdrop shows while the player loads; a late player fades the still in — N130 (#1363)
- [x] LT2 *(P5)* **Crisp:** canvas at the screen's density (at most 3×), not always 2× — N130 (#1363)
- [x] LT4 *(P4)* Ink before paint: the tray and moon fills fade in after their outlines — N130 (#1363)
- [x] LT5 *(P4)* The badge's tick draws while its disc grows, so there is no bare dot — N130 (#1363)
- [x] LT6 *(P4)* Round complete: stroke before fill, so the cards end at full line weight — N130 (#1363)
- [x] LT10 *(P5)* Theme change after play shows the still in the new colours — N130 (#1363)
- [x] **LT3** *(P5, E20)* Day closed stays until Done or 5 s, with or without motion (was 2.6 s, or 0.4 s under reduced motion) — N130 (#1363)
- [ ] LT7 *(P5, needs E22)* Skip the player on Save-Data and 2G; warm it in idle time near an ending
- [ ] LT8 *(P5, with AN3)* `haptic('complete')` on the frame the ✓ or ∎ lands (Inbox 66, Round 72, Day closed 80)
- [ ] LT9 Stars fade in from 70%; a badge's ring draws before it fills
- [x] **IL1** *(P1, E18)* Night: object fill lighter than the disc (`--v7-il-paper`, also in `lottie.ts`) — N130 (#1363)
- [x] **IL2** IL8 IL3 *(P2)* Redraws: Cards (no "zoom out"), Progress (hourglass), Day closed re-centred with its animation — N135
- [ ] IL6 *(P2, needs E19)* Round complete gets its own still and ending with ∎. Markup: `visuals/src/r3/r3-art.json` (`round`)
- [ ] IL3 IL4 IL5 IL7 *(P3)* Rules: live area 80 units, two sizes (160 and 120 px), empty state in the first viewport (Calendar Day, Progress), accent ≥ 3 : 1 on the disc
- [ ] **IC1** IC2 IC3 IC5 *(P6, needs E21)* 1.75 px strokes at every size (`LucideProvider`), one meaning per glyph, six drawn marks

### U2 · Resilience = AN2 (web, M) — `02` §4 · the most urgent web phase

- [ ] **V11** Every v7 scene clean at 100%, 130% and 200% text at 360 and 390 px; the design lint gains "360 at 130%" (the key screens are checked by `v7-n134-text-scale.spec.ts`, N134)
- [x] **V11** Dock at large text: icons, with only the selected tab's label shown — N134
- [x] **V11** Gutters (calendar times, tiles; chart gutters were N125) sized from their content; rows that wrap (Focus, segmented controls: a menu above three options) — N134
- [x] V36 / AW12 *(E6)* Touch token 48 px in the app (44 px on the web) — N130 (#1363)
- [x] **V36** The six controls whose hit area is under 44 px (almanac cells, "Adjust", "3 overdue · Triage", "14 due", narrow tabs, time-log days) — N138
- [x] V36 leftovers: the Inbox list's checkboxes (20 px) and the card's recall-chart review dots (34 px tall at 360 px) take a tap within 44 px — N153
- [x] V22 / AW10 *(E8)* Phones held in portrait in the app (tablets and unfolded foldables rotate) — N130 (#1363)
- [ ] V22 Landscape designed (one-row headers, full-height sheets, the desk clock), then the phone lock lifted
- [ ] V21 *(needs E12)* First load ≤ 350 KB and ≤ 30 requests on Today cold; review, atlas, calendar and KaTeX on demand
- [ ] **AW1** *(E5 approved; after the three V11 items and device check 1)* Honour the system font size, capped at 200%

### AN1 · Make the built app right (Android, M) — `03` §4

- [x] **AW2** *(E14)* "Save a backup" in the app goes to Android's share sheet (Files, Drive, email) and says so — N130 (#1363)
- [x] **AW3** *(E15, first stage)* About this app: version, "Check for updates", "What changed in …" (release pages) — N130 (#1363)
- [ ] AW3 *(E15, second stage)* One quiet check a day for a newer release, a dot on Settings, and a line in the privacy page
- [x] **AW4** *(E16)* In the app only Cards due and Study blocks are switches; the rest are listed under "In your Inbox on this phone" — N130 (#1363)
- [x] AW5 Welcome sheet: three rows with glyphs, no focus ring on open, notification note — N133
- [x] AW9 Study mode in one trip (the request is remembered for ten minutes across system settings) — N133
- [x] AW13 The drift question as a card on Focus with Yes / No, not a 10 s toast — N133
- [ ] AW14 AW15 AW16 Names ("Study blocks" vs "time block") and icon details
- [ ] **IC4** IC6 *(P7, needs E23)* One shortcut recipe; "Resume *path*" not the Atlas star; distinct tile glyphs; ∎ in the themed icon
- [ ] AW17 *(verify on a device)* Sign-in failure says something useful

### G0 · Refresh what is stale (S) — `04` §2

- [x] V12 Install-dialog screenshots and labels: v7 Today in Day and Night (`scripts/v7/install-shots.mjs`; no wide one: the PWA gate allows two) — N133
- [x] V12 `index.html` pre-paint and theme colours: the v7 page colours, from the build's v7 flag — N133

---

## Next

### AN3 · Feel (Android, M) — `03` §4

- [ ] AW6 *(needs E17)* Haptic vocabulary: reveal, grades, Again, task tick, endings (with LT8), pomodoro end
- [x] **AW7** Splash released on first paint (cap 800 ms); WebView background from the Day/Night colour — N136
- [x] **AW8** Back preview on Today: release the back handler at the root with no sheet open — N136
- [x] Offline made visible: "as of 14:05" chips on Today and the Review hub — N151
- [ ] Offline made visible: the header ℓ as the sync light
- [ ] Edges: no Lemma gesture within 24 dp of a screen edge
- [x] V20 Adopt or delete `transitionPresets`, `dismissSheet`, `interpolateNumber` (no callers) — N152

### U1 · Large screens (web, L) — `02` §3 · *(needs E2 for the direction)*

- [ ] **V05** Rail: the count badge covers "Review"
- [ ] **V10** Rail: Settings pinned to the bottom, the Library scrolls above it
- [ ] **V06** Floating actions sit in the content column; Path's "Continue" moves onto the checkpoint card
- [ ] **V07** Detail header no wider than the content; no sideways scroll from 320 to 1728 px
- [ ] **V09** Reading measure ≤ 34 em; the review spread from 840 px
- [ ] **V08** Chart text 12 px at every width; strokes do not scale; charts ≤ 640 px, two abreast
- [ ] Tasks: three columns from 900 px (S12)
- [ ] Settings: index left, section right, from 840 px
- [ ] V23 Control heights follow the pointer, not the width (40 px only for a fine pointer)
- [ ] The margin (S11), flag `v7Margin`
- [ ] Owner approves desktop goldens: Today, Review, Path, Calendar, Inbox, Progress

### G1 · Pipeline (assets, M) — `04` §3

- [x] `assets.manifest.json` and the asset lint in `postbuild` (wiring it into CI is an Owner `rules:` PR) — N137
- [x] Android colours generated from `design-tokens.json` — N137
- [ ] Icon layers split: grid and margin in the background; ℓ and ∎ in the foreground and themed layers — background and foreground split in N137; *(needs E23)* the ∎ in the themed layer
- [ ] Emblem exporter (SVG, PNG, stroke order) and the scene camera — the exporter in N137 (`src/ui/v7/emblemExport.ts`, `npm run emblem`); the scene camera is open (builds on N133's `scripts/v7/install-shots.mjs`)

---

## Then

### U3 · Room and rhythm (web, M) — `02` §5 · flag `v7Room`, each part after its sheet is approved

- [ ] **V13** Calendar Day: the grid gets ≥ 75% of the screen (now 46%) (S7)
- [ ] V31 Tasks: banner, switch and filters in ≤ 200 px; "3 overdue" names its parts
- [ ] V26 Path spine: every checkpoint as a star by stage; opens at the current one (S8)
- [ ] V28 Search: the field is the header; "Jump back in"; actions as chips (S9)
- [ ] V29 *(needs E11)* First run: subject, then rhythm, then the tutor connection
- [ ] V27 Atlas on a phone: fitted to the last constellation; grouped list with an index (S10)
- [ ] V19 One header voice: serif titles; a hub's title is the selected tab
- [ ] V30 "Reviews by day": one ink ramp; colour only for Again
- [ ] V41 Hero emblem: whole or absent, never a fragment

### AN4 · Large screens and postures (Android, M) — `03` §4 · *(needs U1)*

- [ ] List beside detail from 600 dp
- [ ] Review spread from 840 dp and in book posture
- [ ] Focus as a clock in tabletop posture
- [ ] 48 px at every width; nothing interactive across a hinge

### A5′ · Share and release pages — `04` §8

- [ ] Release page per APK (plain words, the APK, one image)
- [x] "Share the page" images: Day closed, the week page, a finished path — N131 (#1364)

A2′ "marks, not illustrations" is **superseded** by the Owner's decision D6 (N127, N128): the illustrated set stays and G2 refines it.

---

## Later

### U4 · Signature (web, L) — `02` §6 · one flag at a time, each with an Owner-approved sheet

- [ ] S1 The ruler, flag `v7Ruler`
- [ ] S2–S4 The ∎ as the one ending, flag `v7Qed` *(needs E3, narrowed by E19)*; V25 Close the day as one page
- [ ] S5 Review as an open notebook, flag `v7Spread`
- [ ] S6 Scratch paper, flag `v7Scratch` *(needs E10)*
- [ ] S14 Paper and sky, flag `v7Paper` *(needs E9)*
- [ ] S15 The week page
- [ ] S16 Desk clock, flag `v7DeskClock`
- [ ] Errata and empty-state copy ("Erratum: …", "as of", ∅)

A4 (the Atlas sky, the drawn path map) follows U3's path spine and phone Atlas.

### Parked by the Owner (12 Nov 2026)

Not open work: home-screen widgets (board 09), server-sent notifications, document scanner. The plan reopens them only on a new decision.

---

## Owner decisions — `05` §3 and §8

Recommendations are the plan's. Tick a decision and add the date when the Owner takes it. On 12 Nov 2026 the Owner approved E5, E6, E8, E14, E15, E16, E18 and E20 as recommended ("I approve each of them.").

- [ ] E1 U0, G0 and AN1 are fixes that need no new visual approval — *recommended: yes* (N130 started U0 on the Owner's "start working on it")
- [ ] E2 Desktop direction: page and margin, review spread, task columns (board 08); six desktop goldens at the end of U1
- [ ] E3 The ∎ as the single mark of completion, behind `v7Qed` (board 05)
- [x] E5 Honour the system font size in the app, capped at 200% (after device check 1) — **approved by the Owner, 12 Nov 2026** (built after U2's large-text layouts, as the plan orders it)
- [x] E6 Touch size 48 px in the app, 44 px on the web — **approved by the Owner, 12 Nov 2026**
- [x] E8 Phone landscape: lock to portrait now, landscape with the desk clock later — **approved by the Owner, 12 Nov 2026**
- [ ] E9 Paper and sky in Appearance, as a small flag after U0–U2
- [ ] E10 Scratch paper in review, behind `v7Scratch`
- [ ] E11 First-run order: subject, rhythm, then the tutor connection
- [ ] E12 Targets: app readable in 1 s and live in 2 s; web first load ≤ 350 KB (CI budgets stay an Owner `rules:` PR)
- [x] E14 Backup in the app: the share sheet (recommended) or straight to Downloads — **approved by the Owner, 12 Nov 2026**: the share sheet
- [x] E15 "Check for updates": the release-page link first, then one quiet daily check with a privacy-page line — **approved by the Owner, 12 Nov 2026**
- [x] E16 Undeliverable reminder kinds: shown, grouped, without switches — **approved by the Owner, 12 Nov 2026**
- [ ] E17 Haptic vocabulary on by default, following the system and Lemma's Haptics switch
- [x] E18 Night: illustration objects lighter than their disc (one token) — **approved by the Owner, 12 Nov 2026**
- [ ] E19 ✓ means nothing is waiting; ∎ means you finished something; Round complete gets a ∎ still
- [x] E20 Day closed stays until Done (or 5 s), the same with or without motion — **approved by the Owner, 12 Nov 2026**
- [ ] E21 Icons: 1.75 px at every size, one meaning per glyph, six new drawn marks (review on one sheet)
- [ ] E22 Lottie guard rails: skip on Save-Data and 2G; warm in idle time
- [ ] E23 Android: one shortcut recipe, distinct tile glyphs, ∎ in the themed icon

Lapsed or superseded: E4 "coded first" (superseded by D7 for the three shipped moments), E7 widgets (parked), E13 store listing (no Play Console).

## Device checks (Owner, one phone, about half an hour) — `03` §5

- [ ] 1 Largest system font: Today, Calendar Day, Focus, Capture (AW1)
- [ ] 2 Settings › Data and account › Download a backup: is there a file? (AW2)
- [ ] 3 Dark theme, force-stop, open: is there a light frame? (AW7)
- [ ] 4 On Today, start the back gesture slowly: is there a home preview? (AW8)
- [ ] 5 Rotate on Review and Calendar (AW10)
- [ ] 6 Long-press the icon; Quick Settings; the themed icon on a dark wallpaper (AW14, AW16)
- [ ] 7 Sign in before and after adding the redirect address (AW17)
- [ ] 8 TalkBack: the timer notification, the tiles, Review
- [ ] 9 Long-press the icon: the shortcut icons side by side (IC4)
- [ ] 10 Inbox zero and Day closed with motion on: the finished picture against the still (LT1, LT2)

## Definition of done — `05` §7

- [ ] A re-audit with the same method: phone ≥ 8.5, desktop ≥ 8, Android conditions ≥ 8, no Major open
- [ ] In the app: a backup saves; the version and an update path are visible; every reminder switch does what it says; the largest system font leaves every screen usable
- [ ] The rendered design lint covers 360 px at 130% text and 1280 px
- [ ] Every ending in the product is the same small square
