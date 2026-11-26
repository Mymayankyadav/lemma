# iPad UI audit (2026-11-26)

Owner: "Ok create comprehensive ui audit for my ipad use the sentout screenshots for size and ratios." Then: "Ok don't apply the pallette just fix layout for ipad". This audit covers layout only; colours are unchanged.

## 1. The Owner's iPad, measured on the Owner's screenshots

The screenshots are 1640 × 2360 px at 2×, so the screen is **820 × 1180 pt** in portrait and 1180 × 820 pt in landscape.

| What | Measured | Source |
|---|---|---|
| Status bar | 32 pt tall, above the page | Every screenshot. The page starts under it: the rail's + sits 14 pt below it, as it does at the page top. |
| Safe area reported to the page | none at the top | Lemma's headers sit exactly where a zero top inset puts them. |
| iPadOS blur under the status bar | Text up to about 25 pt below the status bar is blurred; text 32 pt below is sharp | Exam tutor: the header title (12–25 pt into the page) is blurred, and the status line under it (32–44 pt) is sharp. Today's date row (30–42 pt) is sharp. Lemma applies no blur there, so this is the system's own. |
| Claude app: header | 44 pt buttons from 33 to 76 pt on screen | Claude app screenshot |
| Claude app: content | First text about 20 pt under the header; 17 pt body on 27 pt lines | Claude app screenshot |
| Claude app: sidebar | 320 pt wide, 50 pt rows | Claude app screenshot |
| Native keyboard | Caps 54 × 54 pt, 10 pt apart, 64 pt row pitch, 9 pt side margins, a 50 pt shortcut bar | Claude app screenshot |
| Lemma Today: rail | 72 pt; the + from 44 to 91 pt on screen | Today screenshot |
| Lemma Today: header | Row centre 68 pt on screen; the title only 8 pt below the row | Today screenshot |
| Lemma exam tutor: header | 36–84 pt on screen; title blurred | Tutor screenshot |
| Lemma exam tutor: composer and keyboard | 720 pt wide with 50 pt gutters; keyboard 262 pt tall | Tutor screenshot |

## 2. Method

A production build (`VITE_FLAGS=-v6Shell,-v7Shell`, opened with `?demo=1&flags=v7Shell,v6Shell`) ran in Chromium with:
- an iPad user agent and a touch pointer (`isMobile`, so the app uses its 44 px touch controls, not the 40 px mouse ones);
- the page at **820 × 1148** in portrait and **1180 × 788** in landscape (the screen less the status bar);
- Night in portrait and landscape, Day in portrait.

It covered 19 screens: Today, Paths, a Path, a checkpoint, the tutor with its keyboard open, Review, a review run, Cards, Calendar, Week, Tasks, Progress, Atlas, Inbox, Settings, Practice, Focus, Time log and Lemma Pad.

Each capture recorded:
- horizontal overflow;
- controls under 44 pt (inline text links excepted);
- text under 13 px;
- clipped labels;
- header and title positions;
- the content column;
- fixed bars.

## 3. Findings

| # | Finding | Where | Measured (page px = pt) | Severity |
|---|---|---|---|---|
| F1 | **Header text in the status-bar blur.** Page headers start 0–8 pt from the page top, so their text sits where iPadOS blurs it (the exam tutor's title in the Owner's screenshot). | Hub titles: Paths, Review, Calendar, Progress, Settings, Tasks, Log, Practice (5–51). Detail headers: Path, Checkpoint, Inbox, Week (title 13–39, icons 4–48). The tutor and exam tutor header (4–48). Focus and Review run. Today's date row (14–42 after the first N252 commit). The rail's + (4–50) and the rail's brand row at 1100 px and wider. | Text from 5 pt into the page; sharp only from about 28 pt | High: titles unreadable at the top of most screens |
| F2 | **Today's title pressed against the header.** The 56 pt header row was followed by 8 pt before the 62 pt display title. | Today | Title 8 pt under the header row | Medium: the Owner's report |
| F3 | **Calendar's view switch clips "Agenda".** The fourth segment's label is wider than its button. | Calendar, portrait and landscape | Label 60 px in a 56 px button | Medium |
| F4 | **Paths cards clip and truncate.** The due chips clip their own text, the step line is cut to one line, and titles wrap. | Paths, portrait (2 columns, 188 px text) and landscape (3 columns, 137 px text) | "14 due": 58 px in 54 px. "Topological spaces · step 2 of 3": 194 px in 137–188 px. | Medium |
| F5 | **Touch targets under 44 pt** on a touch-only screen. | Today: ruler card links ("50 min planned", "All paths", "Open calendar"), 20 pt tall. Paths: title links 36 pt, due chips 24 pt. Path: Set time 28 pt, row badges 24 pt, plan rows 40 pt. Progress: Your week 28 pt. Rail at 1100 px and wider: brand 36 pt, Library links 40 pt. | 20–40 pt | Medium: Apple's minimum is 44 pt |
| F6 | **Review run's empty state hugs the header**, while Focus centres the same kind of message. | Review run, portrait and landscape | Title 8 pt under the header in a 1148 pt page | Low |

**Observations (no change in this PR):**
- **O1.** No screen overflows horizontally, and no screen threw an error. Every route renders at both sizes in both themes.
- **O2.** The tutor's composer and keyboard keep the 720 pt reading column, as the Owner's screenshot shows (50 pt gutters). The native keyboard spans the screen; widening Lemma's would also widen the composer.
- **O3.** Path and checkpoint pages keep their 640 pt column in landscape. That leaves 270 pt each side, but the measure (about 75 characters) is right for reading.
- **O4.** Dense date grids keep smaller cells: Calendar's mini month (32 pt) and Progress's heatmap (24 pt). Growing them would not fit their panels; each day is also reachable from the day view and its list.
- **O5.** Captions of 11–12 px are the design system's caption size on every device. They are not an iPad layout issue.
- **O6.** At 1100 px and wider (iPad landscape), the rail is the 248 pt labelled sidebar. Its search field shows "⌘ / Ctrl K", which works with an iPad keyboard.

## 4. Changes (each applies only on an iPad: `html[data-ipad]`, set before the first paint)

| # | Change | Fixes |
|---|---|---|
| C1 | **An iPad top inset of 16 pt.** Every page header starts 16 pt (plus any safe area) below the page top: Today's header, the hub bars, detail and immersive headers, and the tutor and exam tutor header (Lemma Pad's bar already starts 16 pt down). So does the rail's top (its + and, when wide, its brand). Sticky offsets that assume the 52 pt header (the Path tabs, the exam tutor's sheet anchor) add the inset. Header text then starts about 28 pt or more below the status bar, out of iPadOS's blur. | F1 |
| C2 | **Today's header row is 48 pt and the title has 24 pt above it.** This replaces the first N252 commit's 4 pt top, which put the date row in the blur. | F1, F2 |
| C3 | **Calendar's view switch sizes each segment to its label.** No label is ever clipped. | F3 |
| C4 | **Paths cards: due chips never clip** (no shrinking, no wrapping), and the step line wraps to at most two lines instead of being cut. | F4 |
| C5 | **44 pt touch targets without changing what is drawn.** The small links and chips in F5 get an invisible 44 pt hit area. The Path plan rows and the wide rail's links become 44 pt tall. | F5 |
| C6 | **Review run's empty state is centred** in the page, as Focus does. | F6 |
| C7 | (Done earlier in this PR) The tutor's keyboard follows iPadOS's layout on an iPad, and Android keeps Gboard's. | Owner task |

**Tests.** `tests/e2e/v7-ipad-layout.spec.ts` covers:
- every header's text at least 28 pt from the top on an iPad;
- Today's spacing;
- Calendar's labels unclipped;
- Paths chips and step lines;
- the 44 pt hit areas;
- Review run's centring;
- that a non-iPad tablet keeps the old layout.
