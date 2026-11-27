# Dark-mode UI audit tooling (N261)

Reproduces `docs/v7/ui-audit-2026-11-27.md`: every screen of the app in **Night** on phones and tablets (and a desktop
reference), both orientations, with the keyboard and its states, interaction states, motion keyframes and measurements.
Nothing here touches `src/`, the data or the server: the app runs in demo mode with the clock frozen at Mon 9 Nov 2026,
13:43 IST.

## Run it

```
npm ci
pip install pillow                      # strips, sheets and the zip (Python 3)
node scripts/ui-audit-2026-11-27/run-all.mjs                         # everything, all devices
node scripts/ui-audit-2026-11-27/run-all.mjs --devices=phones --skip=motion,states
```

or step by step (a device argument is a name, a comma list, `phones`, `tablets` or `all`):

| Command | What it does |
|---|---|
| `coverage.mjs` | **Static gate.** Reads every route in `src/app/*Route*.tsx`/`App.tsx`/`routes.tsx` and every enumerated mode (settings sections, Calendar views, Progress and Inbox tabs, demo profiles); exits 1 and lists any that has no scene in `catalog.mjs`. Run it first; a new screen fails it until it is added. |
| `capture.mjs <dev> [core] [id\|group …]` | Screenshots every scene in `catalog.mjs` (158: routes, tabs, sections, drawers, pickers, menus, toasts, empty / stress / first-use profiles, not-found and loading states). Per scene: the viewport (`<id>.png`), the whole page when it scrolls (`.full.png`), the end of the scroll when a fixed bar might cover content (`.end.png`), and `audit/<dev>.json` with the measurements below. `core` = one scene per distinct route plus every drawer (76): the quick pass for extra device sizes. `METRICS_ONLY=1` skips the images. |
| `keyboard.mjs <dev> [tutor\|pad\|hardware]` | **Keyboard states.** Tutor: composer, letters, Shift once, Caps lock, typed word with the suggestion strip, key-press preview, long-press secondary characters, held Backspace, `?123`, `=\<` / `#+=`, Maths symbols and every category (read from the DOM, plus the second Phrases page), Browse symbols, pin, key ink (drawing over the keys), Hide and show again, device-keyboard mode, equation mode. Pad: editor, math keyboard on, each group tab, a template, held Backspace, hidden, Draw mode. Hardware: Tab through 24 stops on ten screens (ring colour, gap, stops without a ring, stops off-screen) and the shortcuts (Ctrl+K, Escape, arrows in a radio group). The layout (Gboard / iPadOS) and key sizes are recorded. A control that is not found is listed under `missing`, never skipped silently. |
| `sweep.mjs <dev> [id …] [--max=12] [--strict]` | **Finds screens nobody listed.** Clicks every distinct control on every page (fresh page each time, nothing confirmed), records route / overlay / state / inline / none, screenshots each result, and crawls every route it reached or linked that the catalogue lacks. `--strict` exits 1 when it finds one. |
| `motion.mjs <dev> [case …]` | 42 interactions with motion on (`prefers-reduced-motion: no-preference`): CDP screencast frames, anchored to the input event with a one-frame flash; the in-page recorder lists each CSS transition / animation (property, duration, easing), frame gaps, layout shift and long frames. Run on an idle machine. |
| `strips.py <dev>` | Keyframe strips (before, +40, +80 … +800 ms with the frame-to-frame difference) and `motion/<dev>.summary.json` (first change, settle time, animated or a one-frame cut). |
| `states.mjs [dev] [scene …]` | Hover, press (`:active`) and keyboard focus for each distinct control type on eleven screens: what changed on the control's own box, whether it transitions, crops of rest / hover / press / focus. Needs a pointer: default is an iPad with a trackpad. |
| `palette.mjs [--dev=…] [--scenes=…]` | Before / after: injects the proposed token set (A) and the structural fixes (B) as CSS (nothing is edited) and measures both. Not part of `run-all`. |
| `agg.py` | Cross-device summary of `audit/*.json`: heading ring, tap targets, contrast failures, surface and border separation, content under fixed bars. |
| `groupsheet.py`, `package.py` | Contact sheets; `package.py` writes `ui-audit-images.zip` (WebP) with the data JSON. |
| `explore.mjs`, `batch-explore.mjs`, `ringcheck.mjs`, `hovercheck.mjs` | Small helpers: list a page's controls, check when the heading focus ring shows, check one control's hover. |

Environment: `AUDIT_URL` (default `http://127.0.0.1:4177/lemma/?demo=1`), `AUDIT_OUT` (default
`artifacts/ui-audit-2026-11-27`), `AUDIT_DEVICES`, `AUDIT_TEXT=130` (system text at 130 %), `AUDIT_BETA=1` (Settings > Advanced > Beta testing on; it is off by default and gates the route hand-off animations, so motion numbers differ).
Build with `VITE_ALLOW_FLAG_OVERRIDES=1` (first-use / stress / extreme profiles and `/kit` need it); flags otherwise stay
at their shipped defaults, so the audit sees what a person sees.

## Devices (mobile up)

`lib.mjs` lists 15 sizes, chosen to straddle every breakpoint in `src` (359/360, 560, 600, 699/700, 840, 1024, 1100 px
and the landscape-phone heights 480/500/559): 320 × 568, 360 × 740, 390 × 844, 430 × 932, 844 × 390, 932 × 430,
600 × 960, 960 × 600, 744 × 1101, 1133 × 712, 820 × 1148, 1180 × 788 (the Owner's iPad, see `docs/v7/ipad-audit-2026-11-26.md`),
1032 × 1344, 1376 × 1000 and a 1440 × 900 pointer desktop. iPhone and iPad entries use their user agents (the app keys
its iPad layout off it) and emulate safe areas.

## Measurements (`audit/<dev>.json`)

Per scene: focused element and whether a focus ring shows (`focus`), horizontal overflow, text contrast for every text
element against its composited background (failures at 4.5:1, 3:1 for large text; text the colour of its own surface is
ignored), tap targets under 44 px, clipped text, elements with a pink border or outline, near-miss left/right edges of
wide blocks (rail alignment), surface-to-parent and border-to-surface contrast of every card, fixed and sticky bars, radii,
type sizes, and the clearance between the last content and a fixed bottom bar.

## Limits

Chromium emulates the devices; it is not WebKit. Safari-only behaviour (iPadOS status-bar blur, `100vh`, backdrop
filters, native keyboard geometry) and real touch, Pencil and haptics need a device. Contrast is computed over flat
colours; gradients and images are not sampled.
