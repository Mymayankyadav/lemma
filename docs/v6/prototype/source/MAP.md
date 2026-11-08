# v6 mockup source — what to copy from where

The mockup (`../mockup.html`, captures in `../../screens/`) was built by editing a compiled build of Lemma itself. These files are its editable source: compiled React (JSX as `(0, A.jsx)("div", { className: … })`) with the exact markup and Tailwind class strings, plus the stylesheet. The mockup HTML and these files come from the Owner's archive `Lemma_Mobile_UI_v6_Reviewed_Source.zip` (build `aabfca9c…`, identical to `../mockup.html`).

**Port, don't redesign.** Copy each screen's element structure, `className` strings, labels and CSS. Keep the repo's data hooks, commands and behaviour. Mockup values come from its demo store; wire them to the existing `get…Api()` and hooks, and show a field the hooks lack as unavailable. Never copy `window.__lemma*` globals, browser-local storage or the demo store (`modules/71__store-*`) into `src/`.

## Styles

| File | Use |
| --- | --- |
| `mockup-overrides.css` | **Start here.** The ~940 lines of mockup rules (tokens, controls, shell, screens). Port under `:root[data-v6]`. |
| `owners/design-system.css` | The full stylesheet: the app's compiled CSS with those overrides at the end. Use it to look up a utility class the mockup relies on. |
| `styles/calendar.css` | Calendar stylesheet. |
| `owners/component-roles.json` | Maps `aria-label`s to the `role-*` style hooks the CSS uses. |

## Screens → mockup module → repo target

Search the module for the quoted text to find the component. Line numbers are for `modules/53__index-DcUkykC4.js`.

| Screen (capture) | Mockup source | Repo target |
| --- | --- | --- |
| Shell: header, bottom nav, focus bar | `53__index` — `Main navigation` (l. 15515), `In focus` (l. 17748) | `src/app/AppShell.tsx`, `src/app/V6Header.tsx`, `src/app/TabBar.tsx`, `src/ui/v6/**` |
| Today (`today-*`) | `53__index` — `Also in your notebook` (l. 18494), `Return to focus` (l. 18443) | `src/features/home/` |
| Focus (`focus-day`) | `53__index` — `Take a break` (l. 17884), `Finish & log` (l. 17896) | `src/features/focus/`, `src/ui/v6/focus/` |
| Paths (`paths-*`) | `53__index` — `/projects` route, `Concept map` link (l. 15737) | `src/features/projects/` |
| Path, checkpoint, session, new path | `19__Page`, `20__Page`, `11__Page`, `14__Page` | `src/features/project/`, `checkpoint/`, `session/`, `new-project/` |
| Review (`review-*`) | `12__Page` (review), `15__Page` (round), `16__Page` (done), `28__ReviewOutlook` | `src/features/review/`, `review-run/`, `review-done/` |
| Inbox (`inbox-*`) | `23__Page` (Inbox), `13__Page` (proposal) | `src/features/proposals/`, `plan-proposal/` |
| Cards (`cards-*`) | `18__Page` (list), `21__Page` (card) | `src/features/cards/`, `card/` |
| Atlas (`atlas-*`) | `53__index` — concept map / Atlas route | `src/features/atlas/` |
| Progress (`progress-*`) | `22__Page`, `55__insights` | `src/features/insights/`, `progress-v6/` |
| Calendar (`calendar-*`) | `owners/lemma-native-calendar-runtime.js` + `styles/calendar.css` | `src/features/calendar/`, `src/app/calendarRoute.tsx` |
| Settings (`settings-*`) | `10__Page` | `src/features/settings/` |
| Shared components | `00__Button`, `01__Card`, `03__Chip`, `26__Rail`, `30__SegmentBar`, `31__Segmented`, `05__GoalCard`, `06__GoalDistance` | `src/ui/**` (v6 variants only) |

Other files: icon chunks (`36__arrow-left` …) are lucide icons the repo already has; `owners/carrel-added-behaviour.js` and `owners/lemma-*` are small runtime helpers for the mockup (behaviour reference only).

## Checking a port

Capture the app (`LEMMA_RELEASE_CAPTURE=1 npm run e2e -- tests/e2e/v6-release-audit.spec.ts -g 'N101 screenshot capture'`, which writes `docs/v6/release-captures/`). Compare each PNG with the same-named mockup in `docs/v6/screens/`. Layout, components, colour and type must match; demo data may differ.
