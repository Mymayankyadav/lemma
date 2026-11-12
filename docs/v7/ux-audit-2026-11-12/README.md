# Lemma v7: UI/UX audit and enhancement plan

> **In the repository (N130, 12 Nov 2026).** This folder is the Owner's archive `lemma-v7-ux-audit-and-plan-r3`, committed so agents can work from it. **Progress is tracked in [`CHECKLIST.md`](CHECKLIST.md).** The plan's text is unchanged except that the boards are stored as 1600 px JPEGs (`visuals/*.jpg`, the same names) and references to them point there. Kept from `evidence/`: the measurements, both re-checks and the r3 measurement JSON. Kept from `visuals/src/`: the r3 proposal drawings (`r3/r3-art.json`, the `R3_ART` markup that P2 refers to) and their stylesheet. The captures, contact sheets, board sources and scripts stay in the archive; paths to them below refer to it.

> **r3 (12 Nov 2026, late evening, commit `d741617`).** Adds an audit of the new illustrations, Lottie animations and icons (`06_ILLUSTRATION_ANIMATION_ICON_AUDIT.md`, boards 15–18) and re-checks every r2 finding on the latest main. Start with `00_UPDATE_R3.md`. Everything below is r2, kept as it was; r3 notes are marked “r3”.

> **Revised 12 Nov 2026, evening, on commit `1a67b04`**, after the Android app (N123), Motion v1 (N124) and the phone fixes (N125). Start with `00_UPDATE_AFTER_ANDROID_BUILD.md`. The Android app shows the web app's screens, so **the web screens are the source of truth** for Android.

**Date:** 12 Nov 2026 · **Audited:** the v7 "Constellation" build live on that day (repository commit `bcc04a3`) · **Also reviewed:** the release-and-assets plan, including its Android (Capacitor) plan and asset specs.

**Goal:** say plainly where the released app stands, then give a plan that takes the web app and the coming Android app from "one coherent product" to "a product with a signature", without new dependencies or a new palette.

## The verdict in five lines

* **Phone: 7.5 of 10** (5.9 before the redesign; 7.4 at release; the target was 8–8.5). The system is coherent and calm.
* **Desktop: 6.9.** Released without its own approval; five visible layout defects remain.
* **Android conditions (360 px, text at 130%): 5.5.** The dock, calendar and Focus break, and the app shows these screens.
* **The Android app (built in N123)** gets the native parts right, the focus timer above all. Four gaps to fix first: large system text, an export that cannot save, no version or update path, and reminder switches for kinds the phone cannot deliver.
* **Two screens still print wrong information** (the Today strip, two disagreeing counts); the chart axes were fixed in N125.
* **The opportunity:** Lemma's own icon holds three unused ideas: a **ruler**, a **margin** and a **∎**.

## What is in this folder

| File | What it is |
|---|---|
| `00_UPDATE_AFTER_ANDROID_BUILD.md` | What changed since the audit, every finding re-checked, the Android app summarised, and how each file was revised. |
| `01_AUDIT_RELEASED_V7.md` | Method, scores, 10 strengths to protect, 43 findings (V01–V43), with their status on `1a67b04` with measurements and, where confirmed, the cause in the code. What was not tested. |
| `02_WEB_PLAN.md` | Phases U0–U4 for the web app: truth fixes with their tests, large screens, resilience, room and rhythm, and the signature ideas (S1–S16). |
| `03_ANDROID_UX_PLAN.md` | Rewritten for the app as built: the web screens as source of truth, what N123 built and how it reads, findings AW1–AW17, phases AN1–AN4 inside the Owner's decisions, a device checklist, and what is parked. |
| `04_ASSETS_AND_MOTION_PLAN.md` | A review of the asset plan and how to change it: one generated pipeline for web, Android and store; marks instead of commissioned illustrations; coded animation before Lottie or Rive; the full asset matrix. |
| `05_PHASES_AND_DECISIONS.md` | The revised order, sizes, Owner decisions E1–E17 (E7 and E13 lapsed), how it fits the repository's rules, risks, definition of done. |
| `visuals/01-scorecard.jpg` | Scores by screen group: first audit, now on phone, now on desktop. |
| `visuals/02-evidence-phone.jpg` | Annotated evidence: V01–V04, V13–V16. |
| `visuals/03-evidence-desktop.jpg` | Annotated evidence: V05–V10. |
| `visuals/04-evidence-android.jpg` | Annotated evidence: V11, V12, touch sizes. |
| `visuals/05-concept-ruler-and-qed.jpg` | S1–S4: Today's ruler; Close the day as the day's proof; the ∎ as the one ending. |
| `visuals/06-concept-review-desk.jpg` | S5–S6: review on a phone, the two-page spread, scratch paper. |
| `visuals/07-concept-calendar-path-search.jpg` | S7–S10: Calendar Day, the path spine, Search, Atlas on a phone. |
| `visuals/08-concept-desktop-workbench.jpg` | S11–S13: page and margin, task columns, chart rules, the four widths. |
| `visuals/09-android-widgets.jpg` | Widgets in Paper and Sky, the week as a constellation, Next step, On my desk, five states. |
| `visuals/10-android-system-surfaces.jpg` | Launch handoff, icon family, lock screen and notification voice, haptic vocabulary, back preview, permission sheet. |
| `visuals/11-android-large-screens.jpg` | Book and tabletop postures, tablet with margin, desk clock, what each window gets. |
| `visuals/12-asset-pipeline.jpg` | Sources → generators → outputs, with what is done, stale and new. |
| `visuals/13-phase-map.jpg` | The whole plan on one page (revised). |
| `visuals/14-android-as-built.jpg` | The Android app as built: icon family, system surfaces at a glance, and the four Android-only places in the page, annotated. |
| `00_UPDATE_R3.md` | **r3:** what changed after r2 (N126–N129), r2 re-checked on `d741617`, the r3 audit in brief, order. |
| `06_ILLUSTRATION_ANIMATION_ICON_AUDIT.md` | **r3:** the illustrations, animations and icons audited (IL1–IL8, LT1–LT10, IC1–IC6), scores, and proposals P1–P7. |
| `visuals/15-illustrations-audit.jpg` | **r3:** the nine drawings in Day and Night, measured; Night inversion, “zoom out”, sizes, accents, placement. |
| `visuals/16-animations-audit.jpg` | **r3:** the three Lottie moments frame by frame; the erase-and-redraw swap, blur at 3×, Day closed timing, the half-weight ending, cost. |
| `visuals/17-icons-audit.jpg` | **r3:** all 72 icons in use; one glyph with seven meanings, stroke drift, three line families, Android shortcuts and tiles. |
| `visuals/18-r3-proposals.jpg` | **r3:** proposals drawn and rendered: Night fix, three redraws, rules, patched animations, one meaning per glyph, Android icons. |
| `visuals/src/` | Sources of the boards (HTML, CSS, a small drawing script, the app's own fonts with their licences). |
| `evidence/` | `recheck.md` (the re-check on `1a67b04`); `measurements.md`; `captures/` (the clips and frames the boards use); `sheets/` (contact sheets of nine device profiles, 49 images); `tools/` (the scripts that produced them, so the sweep can be re-run after each phase). |
| `evidence/` (r3) | `recheck-d741617.txt`, `il-measure.json`, `icon-measure.json`, `captures/r3/` (in-app captures, every sixth frame of each animation, patched frames and Lottie files, timings) and the r3 scripts in `tools/`. |

S14 (paper and sky) and S15 (the week page) are described in `02_WEB_PLAN.md` without a sketch; S16 (desk clock) is drawn as P4 on board 11.

All concept boards are **direction sketches** drawn with the app's own tokens and fonts so the Owner can choose a direction. They are not final art, and the screens in them are not captures.

## The order in one line

**U0** truth fixes, **U2** resilience and **AN1** (make the built app right) now → **AN3** feel and **U1** large screens → **U3** and **AN4** → the signature layer (**U4**), one flag at a time. Widgets, server push and the scanner are parked by the Owner.

## How it relates to earlier documents

* **The first UI audit** (F01–F80) and **the release plan R0–R3**: this audit confirms what R0–R2 fixed, lists what is still open under new numbers (with the old F-number beside it), and adds what the first audit could not see (desktop, tablet, foldable, Android conditions, performance, the Android wrapper).
* **The release-and-assets plan** (A1–A5, N0–N8, D1–D15) and **N123–N125**: A1 and most of N0–N7 are built. This plan amends A1–A5 (`04`), re-plans Android as AN1–AN4 inside the Owner's decisions (`03`), and adds decisions E1–E17 (`05`).

## Limits

Scored from the example workspace on an emulated set of devices. Not tested: a busy account, signed-in data, physical devices, screen readers, real notifications, and the Android app itself (its code and its Android-only screens were reviewed; no APK was run). The 130% text profile and the performance figures are emulations and should be confirmed on a phone. Scores are one reviewer's judgement, tied to named findings so they can be argued with.

Nothing in the repository was changed to produce this.
