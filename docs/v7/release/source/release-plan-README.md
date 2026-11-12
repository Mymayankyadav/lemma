# Lemma v7: release and assets plan

**Goal:** get the v7 redesign released as soon as possible, at a quality a stranger would trust (about 8–8.5 on the audit's scale), and plan the richer assets (Lottie, Rive, illustrations, signature moments) for **after** release, without blocking it.

**Decision built into this plan:** two kinds of brand asset are cheap, high-impact and code-only, so they move **before** release:
1. a new **app icon** set (the current one is the old amber "graph" mark from an earlier design, it no longer matches the product), and
2. **emblem system v2** (the generated mathematical cover art), tightened so it reads at every size.

Everything that needs a new library, a motion designer or an illustrator comes after release.

## What's in this folder

| File | What it is |
|---|---|
| `01_PHASES.md` | The phases in detail: R0–R3 before release, A1–A5 after. For each: goal, scope with audit IDs, deliverables, who does it, acceptance criteria, Owner gates, risks and rough size. |
| `02_BRAND_CORE_SPEC.md` | The pre-release brand work: app icon (three directions, every size and platform file), favicon, splash, emblem system v2 rules. |
| `03_LATER_ASSETS_SPEC.md` | The post-release asset work: motion v1 (no new libraries), icon set and illustrations, the Lottie and Rive pipeline, signature moments, distribution assets. |
| `05_ANDROID_APP_PLAN.md` | The Android app with Capacitor: architecture, phases N0–N8, the native focus timer spec, notification channels and actions, widgets, tiles, share and scan, calendar and Do Not Disturb, permissions, server changes, testing, risks. |
| `04_OWNER_DECISIONS.md` | Every decision only the Owner can make, with a recommendation and when it is needed. |
| `visuals/phase-map.png` | One-page map: phases × engineering / design / Owner, with the release line. |
| `visuals/app-icon-concepts.png` | Three app-icon directions (Compass, Constellation, Notebook), Day and Night, maskable safe zone, small sizes. |
| `visuals/icon-*-1024.png` | Each direction at full size (`.svg` sources in `visuals/src/`). |
| `visuals/emblem-v2-families.png` | Emblem v2 direction: eight subject families × three tiers × Day and Night. |
| `visuals/current-emblems-gallery.png`, `visuals/current-app-icon-512.png` | What ships today, for comparison. |
| `visuals/motion-tokens.png` | The easing curves for motion v1. |
| `visuals/android-*.png` | Android: architecture, notifications and timer (shade, lock screen, Live Update, tiles, timer states), widgets, shortcuts and share, and the Android phase map. |

All visuals are **direction sketches** drawn from the app's own colour tokens and fonts, so the Owner can choose a direction; they are not final art.

## How it relates to earlier documents

* **The independent UI audit** (`lemma-ui-audit.zip`: 80 findings F01–F80, the roadmap to 10, and the motion and assets plan): this plan adopts its Phase 0, most of Phase 1 and a slice of Phase 2 before release, and turns its Phase 3, Phase 4 and motion/asset backlog into phases A1–A5. Finding IDs (F##), motion IDs (M-…), Lottie IDs (L-…), illustration IDs (IL-…) and icon IDs (I-…) refer to that audit.
* **The v7 plan already in the PR** (`docs/v7/PLAN.md`, `docs/v7/IMPLEMENTATION.md`): its remaining gates (Owner device and screen-reader checks, the 350 KB budget decision, an independent code review, the switch PR) are folded into phase R3.

## The order in one line

**R0** stop looking broken → **R1** one system → **R2** brand core and room to breathe → **R3** release gate and switch → *(release)* → **A1** motion v1 → **A2** icons and illustrations → **A3** Lottie and Rive → **A4** signature moments → **A5** brand and distribution.

**Android** (after the web release, can overlap A1–A5): **N0** foundations → **N1** notifications → **N2** native focus timer → **N3** widgets and shortcuts → **N4** capture everywhere → **N5** calendar and Do Not Disturb → **N6** offline sync → **N7** Play release → **N8** later (Wear OS and more).
