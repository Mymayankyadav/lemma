# r3 update: after the illustrations and animations

**12 Nov 2026, late evening. Re-checked on commit `d741617`.** Read this first in r3. r3 is **additive**: every r2 file is kept as it was, with short r3 notes added where something changed. The new material is `06_ILLUSTRATION_ANIMATION_ICON_AUDIT.md` and boards 15–18.

## 1. What changed on main since r2

| Merge | What it did | Effect on the plan |
|---|---|---|
| **N126** | Stopped the “could not open what was shared” toast that appeared on every return to the Android app (a plugin returned `null` lists) | A fix outside r2's list; no r2 item changes |
| **N127** | A2 empty-state illustrations: the Owner chose line art (D6) and asked Claude to draw them (D8) | Supersedes r2's “marks, not illustrations” (`04` §5) |
| **N128** | The illustrations redrawn plainer and symmetric after the Owner found the first set “too weird” | The set audited in r3 |
| **N129** | A3 Lottie moments for Inbox zero, Round complete and Day closed, with the dotLottie player the Owner approved (D7) | Supersedes r2's “coded first, defer Lottie” (`04` §7, E4) for these three moments |

## 2. r2, re-checked

**Web findings.** All re-measured on `d741617`; every value is identical to `1a67b04` (`evidence/recheck-d741617.txt`).

| r2 finding | Status on `d741617` |
|---|---|
| V01 chart axes, V04 double tick | Fixed (N125), still fixed |
| V02 Today strip, V03 two values, V05–V11, V13–V18, V24, V31, V32, V34 | Open, unchanged |
| V12 old Android identity | Mostly fixed (N123); install screenshots and pre-paint colours still stale |
| V20 motion and haptics | Motion v1 and now A3 shipped; haptics still fire only in the Inbox and calendar drags |
| V43 Data and account | Open, unchanged |
| Empty states (F36 in the first audit; r2 phase U3) | **Addressed by N127–N128**: Paths, Calendar Day, Review, Inbox, Cards, Atlas, Progress and Tasks have drawn empty states. r3 refines them (IL1–IL7) |
| V25 Close the day is a form; endings without ceremony (F55) | **Partly addressed by N129**: Day closed and Round complete now end with an animation. The three-step form remains; Day closed leaves too soon (LT3) |

**Android findings (AW1–AW17).** Checked against the new code; all stand: no download handler (AW2), no version or update path (AW3), reminder kinds unchanged (AW4), welcome sheet unchanged (AW5), seven haptic calls (AW6), splash and WebView background unchanged (AW7), back handler never released (AW8), icons unchanged (AW14).

**Scores.** Unchanged for screens: phone 7.5, desktop 6.9, Android conditions 5.5. New in r3: illustrations 7.5 Day and 6 Night, animations 6.5, icons 6.5, Android icons 5.5.

## 3. The r3 audit in brief

Detail and evidence in `06_ILLUSTRATION_ANIMATION_ICON_AUDIT.md`.

**Illustrations** (board 15). A clean, consistent family. Fix: Night turns every object into a hole (IL1); the Cards drawing reads “zoom out” (IL2); sizes drift by half and Day closed sits low (IL3); four subject accents fall under 3 : 1 by day (IL4); two empty states start below the fold (IL5); ✓ and ∎ both mean “done” (IL6).

**Animations** (board 16). Well paced and on-brand frame by frame. Fix: the finished still is shown, erased and drawn again (LT1); the canvas is fixed at 2×, so it blurs on 3× phones (LT2); Day closed leaves after 2.66 s, or 0.46 s with reduced motion (LT3); fills appear before their outlines (LT4); the badge shows as a bare dot (LT5); Round complete ends at half line weight because of fill/stroke order (LT6, verified fix); 1.24 MB renderer with no Save-Data guard (LT7).

**Icons** (board 17). One good library used loosely. Fix: the stack glyph means seven things (IC1); strokes drift from 1.17 to 2.33 px (IC2); three line families (IC3); the Android shortcut menu mixes two styles, “Resume *path*” borrows the Atlas star, and both Quick Settings tiles show the same ℓ (IC4).

**Proposals** (board 18). P1 one Night token; P2 three redraws (Cards, Progress, Day closed) and a Round complete still with ∎; P3 rules for live area, sizes, placement and accent; P4 three fixes in the Lottie generator, rendered and verified; P5 playback fixes; P6 one stroke rule and one meaning per glyph; P7 one Android shortcut recipe and distinct tile glyphs.

## 4. Order and decisions

r3 adds phase **G2 · Illustration, motion and icon polish** (size M), parallel to r2's U0/U2/AN1 because it touches different files:

1. **Now:** P4 and P5 (the animations' bugs: LT1, LT3, LT6 first), P1 (Night).
2. **Next:** P2 and P3 (redraws and rules), P6 (stroke rule first, then the meaning map).
3. **With AN1:** P7 (Android shortcuts and tiles).

New decisions E18–E23 are in `05_PHASES_AND_DECISIONS.md` §8 (added in r3).

## 5. Files in r3

| File | r3 change |
|---|---|
| `00_UPDATE_R3.md` | New (this file) |
| `06_ILLUSTRATION_ANIMATION_ICON_AUDIT.md` | New |
| `visuals/15`–`18` | New boards |
| `README.md` | An r3 note at the top and r3 rows in the table |
| `01`, `03`, `04`, `05` | An r3 note or section appended; r2 text unchanged |
| `evidence/` | `recheck-d741617.txt`, `il-measure.json`, `icon-measure.json`, `captures/r3/` (in-app captures, every sixth animation frame, patched frames and files, timings), new scripts in `tools/` |
| `00_UPDATE_AFTER_ANDROID_BUILD.md`, `02`, boards 01–14 | Unchanged from r2 |
