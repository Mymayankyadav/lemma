# Lemma: UI audit pack

An independent visual audit of the Lemma study app from the supplied screenshot packs. It has three parts, as requested:

| Part | File | What's inside |
|---|---|---|
| **A · Audit and rating** | `01_VISUAL_AUDIT.md` | The verdict and scores, a scorecard for every screen group, **80 findings** (F01–F80) with file names, severity and a fix, **12 things to protect** (P01–P12), a consistency map, the top 10 fixes and what could not be judged. |
| **B · Getting to 10/10** | `02_ROADMAP_TO_10.md` | A phased plan (6 → 7 → 8 → 8.7 → 9.4 → 10); type, colour, spacing and icon rules; component specs (ActionSheet, sheets, toast, chips, stepper, empty states, headers); chart rules; a screen-by-screen redesign with wireframes; volume patterns; a Day/Night parity checklist; an acceptance checklist for 10/10. |
| **C · Motion and assets** | `03_MOTION_AND_ASSETS.md` | The motion language ("drawn with a compass"), tokens, haptics and reduced motion; **75 motion specs** (M-…) by screen; **20 Lottie and Rive animations** (L-01–L-20); a generative **emblem system v2**; **16 illustrations** (IL-…); the icon list (I-…); app icon, widgets, textures, seals and share images; production pipeline, budgets and a prioritised backlog. |
| **Evidence** | `annotated/B00–B14.jpg` | A scorecard heat map plus 14 annotated boards. Numbered callouts on the real screenshots match the finding IDs. |

## Scores at a glance

| | Score |
|---|:-:|
| **Overall** | **5.9 ≈ 6 / 10** |
| Phone Day | 5.8 |
| Phone Night | 5.9 |
| Busy account (volume) | 4.5 |

**In one line:** a distinctive, scholarly identity (serif on paper, a night observatory, mathematical emblems, typeset maths) let down by broken shared components (every overflow menu, two native forms), a Settings area from an older product, numbers that disagree, and empty or ending states with no craft.

## The annotated boards

| Board | Topic |
|---|---|
| B00 | Scorecard heat map |
| B01 | Every overflow menu is broken (F01) |
| B02 | Forms from an older product (F02, F03) |
| B03 | Today and the Review hub |
| B04 | Calendar day: half the screen is chrome (F10, F25, F26) |
| B05 | Path detail: header eats the page (F11) |
| B06 | Inbox: swipe, undo and inbox-zero states (F07, F08, F40) |
| B07 | Charts: collisions and naming (F06, F45–F47) |
| B08 | Atlas: the missing "wow" screen (F12, F57) |
| B09 | "Every colour has one job" is broken (F20–F22) |
| B10 | Numbers that disagree (F05) |
| B11 | Day vs Night parity (F24, F44, F66) |
| B12 | Volume: what breaks with a heavy user (F13, F75–F77) |
| B13 | Two typographic voices (F15, F16, F18) |
| B14 | Empty, end and broken states (F36, F55, F74) |

Callout colours: **red** Major · **orange** Moderate · **blue** Minor · **green** Praise.

## Scope and limits
- **Reviewed:** `lemma-audit-1-phone.zip` (sample account, phone Day and Night) and `lemma-audit-4-busy.zip` (busy account, phone Day and Night), about 720 frames.
- **Not reviewed:** the tablet and desktop packs were not supplied, so they are not scored. Motion, gestures, real-device rendering and performance can't be judged from reduced-motion stills; Part C specifies what they *should* be.
- No code was read or written; this is a design critique from the screenshots alone, as the pack's brief asked.
