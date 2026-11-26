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

## 2. Screens and flows

The first pass covered 19 screens in a Chromium production build with demo data, an iPad user agent and touch input. The reference viewports were **820 × 1148 pt** in portrait and **1180 × 788 pt** in landscape, accounting for the 32 pt status bar. The audit used Night in both orientations and Day in portrait. It measured header text, hit areas, clipped labels, content width, horizontal overflow and fixed bars.

The second pass covered 62 screens and flows in both orientations (124 captures), including the following entry points.

| Area | Screens and flows |
|---|---|
| Today and Paths | Today, Paths, Cards, Atlas, a path card's menu, and a Path's Plan, Sessions, Sources, Cards, Exam and menu |
| Study and review | Checkpoint, session, card detail, tutor with and without keys, exam tutor, exam ledger, Review Due, Practice, Customise and a review run |
| Calendar and Progress | Day, Week, Month, Agenda, Tasks, editing a block, task actions, Overview, Learning, Log, Your week and Add a goal |
| Settings | Index, Appearance, Tutor, Study and review, Planning, Reminders, Subjects, Data and account, and Advanced |
| Other screens | Inbox Cards and Plans, Atlas, Week, Time log, Practice, Focus, Close the day, Welcome and Lemma Pad |
| Creation and navigation | Capture a Task, expand More options, capture a Time block, Card or Thought, Search, Quick focus and New path |

## 3. Findings and layout changes

The measurements in the middle column describe the original layout. The final column describes the rules in `src/app/v7/ipad.css`. The app sets `data-ipad` before React renders.

| Finding and change | Observation | Implemented layout |
|---|---|---|
| F1 / C1 · Header inset | Header text began as high as 5 pt below the page top. The Owner's exam tutor screenshot showed blur over the title at 12–25 pt. | Hub, detail, immersive, tutor and Atlas bars add 20 pt to the top safe area. The rail aligns with the header, and the sticky Path tabs and exam summary account for the inset. |
| F2 / C2 · Today | Only 8 pt separated the date row and title. | The row is 48 pt high and the title starts 24 pt below it. |
| F3 / C3 · Calendar | The 60 pt Agenda label occupied a 56 pt segment. | The four view controls size to their labels. |
| F4 / C4 · Path step text | “Topological spaces · step 2 of 3” needed 194 pt in a 137–188 pt text column. The first pass also counted the due chip's extended hit area as label overflow. Its text fits. | Step text can wrap to two lines. The due chip uses its existing hit area. |
| F5 / C5 · Tap targets | Today's heading links were 20 pt tall, Path plan rows 40 pt and wide rail links 36–40 pt. | Today's heading links get a 44 pt hit area. Plan rows, the wide rail brand and Library links have a minimum height of 44 pt. |
| F6 / C6 · Empty review | The empty-state title sat just below the header on a 1148 pt page. | The empty state is centred in the available space. |
| F7 / C7 · Page width | Phone-width caps left broad side margins, including around Path details and the tutor. | At 700 pt and above, pages use the width available beside the rail, or the full viewport on immersive routes. Page margins are 24 pt from 700 pt and 32 pt from 1100 pt. The tutor composer, Path and Learn action bars, and chart plots fill their respective containers. Reading text keeps its own measure. |
| F8 / C8 · Capture in the wide rail | A single 48 pt square sat centred below Search in a 248 pt sidebar. | Capture is a labelled 44 pt row aligned with Search and the navigation rows. The compact rail uses the plus button. |
| F9 / C9 · Path navigation | Plan through Exam stretched across the entire detail page. | The tabs start at the leading edge with an even gap, including when the exam ledger is open. |
| F10 / C10 · Close the day | The narrow column left around 110 pt on each side in portrait and 290 pt in landscape. | The form and its footer use the page width. |
| F11 / C11 · Welcome | A 560 pt column hugged the top of an otherwise empty screen. | Content is vertically centred in a column up to 680 pt wide. |
| F12 / C12 · Review answers | The answer bar was 480 pt under a 780 pt card in portrait, and 640 pt under an 1116 pt card in landscape. | The answer bar aligns with the card. |
| F13 / C13 · Paths grid | Three landscape columns squeezed a card to about 280 pt and wrapped short titles such as “Real Analysis”. | A 320 pt minimum yields two columns at both reference sizes. |

The creation sheets and menus fit as centred dialogs at both sizes. The Calendar mini month and Progress heatmap retain their dense cells. The audit found no page-level horizontal overflow in the inspected flows.

## 4. Verification

`tests/e2e/v7-ipad-layout.spec.ts` checks header clearance, Calendar labels, Path cards and tabs, target sizes, the rail, content widths, Welcome and both review states. It also checks a tablet without the iPad marker. The header check measures the highest text line box against a 24 pt minimum. The original screenshots provide the reference for the system blur.

`tests/e2e/v7-tutor-ipad-keyboard.spec.ts` checks portrait and landscape key geometry and exercises typing, secondary characters, Tab and Hide. The matching unit tests cover desktop-mode iPad detection, narrow windows and the word decoder's coordinate conversion.

The chart regression test exercises both orientations with touch input. Before the repair, Progress in portrait stretched a 640-unit drawing across 700 pt. The recall chart in landscape stretched the same 640 units across 1116 pt while its buttons occupied only the first 640 pt. The test checks that drawing units match displayed pixels and that tapping the last visible review dot selects its review.

At the two reference sizes, Chromium touch emulation measured Path cards at 344 and 428 pt respectively. In Progress, the portrait plot filled its 700 pt column and the landscape plot filled its 426 pt column. Planning used one column in portrait and opened beside the Settings index in landscape. Capture → Task → More options opened a centred editor and Save task persisted the demo task in both orientations. Physical iPad Safari and the installed PWA still need device verification.
