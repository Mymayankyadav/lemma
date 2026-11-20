# Measurements behind the plan

## How they were taken

Measurements come from the audit tool, `npm run audit:ui` (`scripts/ui-audit/`). It uses a 390×844 phone, the night theme, a frozen clock (Mon 9 Nov 2026 13:43 IST), and two accounts: populated (`?demo=1`) and empty (`?demo=first-use` plus empty tab-scoped stores).

Every frame in `manifest.json` carries `facts` from `pageFacts` in `scripts/ui-audit/lib.mjs`:

| Fact | Meaning | Caveats |
|---|---|---|
| `chrome` | Pixels at the top and bottom where a fixed or sticky element is hit (5 sample columns, 4px rows), and what is left for content | A sticky element that starts mid-page (Path tabs) counts as chrome at first paint, so the top figure for Path, Atlas list and Agenda is inflated; read those together with the frames. `null` when a sheet covers the screen |
| `words.view` / `words.all` | Visible words in the first viewport / on the whole page, excluding the tab bar | With a sheet open that is not `role=dialog`, the page behind the sheet is counted too |
| `offFonts` | Text whose computed family is not `Lemma v7 *` or KaTeX, with samples | Exact |
| `offSizes` | Text sizes off the v7 scale (12, 14, 16, 17, 19, 20, 26, 28, 32, 44, 64px) | 130%-text scenes are expected to be off-scale |
| `native` | Visible `details/summary`, `select`, `input[type=date/time/range]` | Exact |
| `overlaps` | Flow-text elements whose boxes overlap by > 25% of the smaller box | Wrapped inline spans and hidden disclosure content can give false positives: verify in the frame. Confirmed real: Atlas "Stale ⟂ Legend" (F173) |
| `picture` | For the biggest canvas or SVG in view: the share of sample points not covered by another element | Exact |

The per-scene table (first frame of each scene, both accounts) is in `metrics.csv`.

## Headline numbers (current → target)

| What | Now | Target | Plan |
|---|---|---|---|
| Atlas map: canvas not covered by overlays | 68% (F173) | ≥ 92% | WP2 |
| Atlas map: band holding all stars and labels at first paint | y≈180–420, ≈25% of the screen | ≥ 60% of the visible map | WP2 |
| Atlas list: chrome above the first row | 264px (header, two tab rows, sticky filters) | ≤ 132px total chrome | WP2, WP6 |
| Detail pages: bottom chrome (action bar + tab bar) | 152px (Checkpoint, Card, Session, Plan proposal) | ≤ 80px | WP6 |
| Calendar Day: bottom chrome (browse slider + tab bar) | 144px | ≤ 80px | WP6 |
| Tutor chat: conversation height, keyboard open | 404px of 844 | ≥ 420px | WP3 |
| Tutor chat: conversation height, keyboard hidden | 622px, then a 48px "Show keyboard" bar | ≥ 650px, no extra bar | WP3 |
| Tutor chat: start card (before Begin) | 470px hero | ≤ 140px | WP3 |
| Liked Lemma Pad page, for reference | header 64 · rail 68 · chat 325 · composer 70 · tools 51 · keyboard 266 | — | — |
| Today: words in the first viewport | 89 (populated), 93 (empty) | ≤ 60 | WP1, WP5 |
| Path: words in the first viewport | 94 | ≤ 60 | WP1, WP5 |
| Calendar Month: words in the first viewport | 114 | ≤ 60 | WP1, WP5 |
| Progress overview: words in the first viewport | 82 | ≤ 50 | WP5 |
| Cards: first card from the top | ≈ 260px | ≤ 180px | WP6 |

## Off-kit fonts (computed family is not `Lemma v7 *`)

- **Legacy `Newsreader` headings** (heading rules without the kit role) on:
  - Welcome (Connect your tutor, Start your first path)
  - Today plan card ("Checks → Learn → Practice → Close", "Next action")
  - Calendar "Suggested study times"
  - Path "Plan estimates" and the new-path title
  - Path Sources "Study sources"
  - Checkpoint "Ready"
  - Session "Recent attempts"
  - Card "Card in Real Analysis"
  - Review done ("Review complete")
  - Inbox hub title and "Atlas links"
  - Atlas Themes and Bridges
  - Focus header
  - Every Settings section title (Appearance, Tutor, Study and review, Planning, Reminders, Subjects, Data and account), plus "Math shortcuts", "Focus preferences" and "Review budget"
  - Tutor header ("Real Analysis · CP4")
  - Pad ("Lemma Pad", "Your checkpoints")
  - Progress Learning "Atlas" and Time "Goals"
- **Legacy `STIX Two Text`** for the review question and answer (F144–F149); the kit has `Lemma v7 STIX Two Text` via `--v7-glyph`.
- **Legacy `Instrument Sans`** on Review done ("Menu", "Finish a review round…").
- **`ui-monospace`** for the connector address (Welcome, Settings › Tutor); the kit has `Lemma v7 IBM Plex Mono`.

## Off-scale sizes (100% text)

- 17.5px: AtlasPanels headings (`.v7-atlas-panel h2{font-size:1.1rem}`)
- 15px: Path sources, card edit
- 18px: section heads in Settings and the Path sources tab
- 13px: Calendar suggestion meta, Path estimates
- 34px: tutor start title
- 10, 11, 18 and 24px: tutor keyboard hints, keys and the symbol strip (acceptable inside the keyboard if documented as a component exception)
- 9.5px: Inbox plan change tags "Added", "Changed" (too small)
- 38.5px: Close the day figures

## Native controls the kit replaces

- `details/summary`: Today "Decision details"; Tasks "Cancelled (1)"; Checkpoint "What counts"; Review done "Menu"; Inbox "Why this card?"; Atlas Themes; Practice "Archived topics (1)".
- `select`: Settings › Study focus mode (Pomodoro/Flowtime/Open); Pad "Choose a path".
- `input[type=range]`: Capture/Calendar block length and Calendar "Browse day". These are styled as the ruler, so keep them if they are the kit RulerSlider; otherwise replace.

## Small touch targets (controls under 40px in the first viewport, populated)

Paths list 10, New path 10, Paths "more" menu 10, Cards filters 8, Tasks filters 7, Settings › Appearance 6, Paths search 6. Chips need 44px hit areas: a visual size of 32px is fine with padding.

## Atlas drawn-extent check (reproducible)

```python
from PIL import Image
im = Image.open('artifacts/ui-audit/frames/F173-full-atlas-map.png').convert('RGB'); s = im.size[0] / 390
px = im.load(); pts = [(x, y) for y in range(int(135*s), int(425*s), 2) for x in range(0, im.size[0], 2) if max(px[x, y]) > 70]
xs, ys = zip(*pts); print(min(xs)/s, max(xs)/s, min(ys)/s, max(ys)/s)   # → x 16–359, y 213–424 (band ≈ 211–240px tall)
```
