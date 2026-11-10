# Lemma v7 implementation decisions

The Owner authorized one combined `rules:` PR, Agent `owner-setup-v7`, for the whole attached plan, including all `[New]` features. This is an incremental working PR, not a claim that the redesign is complete. The Owner chooses the model and effort for each part before it starts; Parts 1–3 have been selected.

## Accepted constraints and gates

- Build behind `v7Shell`, initially off. Activate only after hardening and Owner gallery, golden-screen, responsive and physical-device gates. The Owner merges the rules PR. Retain all v6 code and styles for rollback, an explicit L6 exception; retain conditional Google Fonts fallback for v6/legacy. Preserve existing deep links and tests.
- Keep the five-link navigation landmark on immersive screens, visually hidden with keyboard reveal. Self-host v7 fonts. Canonical UI radii are 10, 14, 20, 28 and round; choose the nearest token, ties up, except chart marks.
- Persist v7 preferences and subject identity in a typed `settings.attention.v7` namespace, within the existing 4 KB section cap, with live/demo recursive-merge parity and stable creation timestamp plus ID allocation. Handle concurrent changes and capacity explicitly.
- Preserve the existing seven-day Today forecast RPC; the 14-day Review forecast is an additive frontend read. Atlas card counts derive from existing loaded records. Running Focus intention edits are recoverable device-local drafts; correct them after logging through the existing API.
- Today compressed cold first load must be at most 350 KB as a blocking deterministic check; timing metrics are reported without blocking. Design checks and byte accounting will be added to existing CI without weakening checks. No backend, migration, MCP, or new dependency changes.
- Gallery approval follows Part 3; six golden-screen approvals follow Part 5; responsive approval follows Part 11; physical-device approval precedes final activation. The new review paths are separate from the existing v6 baseline and review policy.

The later performance gate must measure actual cold Today transfers, including first-install service-worker precache traffic and self-hosted fonts, under a documented reproducible cache and network setup. CI should block the deterministic byte budget and v7 design invariants while reporting first paint, largest paint and main-thread timing separately; timing thresholds do not block. Preserve existing performance jobs and assertions. The exact probe and golden captures are implemented with the relevant screens, not by this foundation.

## Parts and proposed models

The Owner selected Parts 1–3; later entries are proposals pending the Owner's choice.

Part 1 baseline evidence at main `a4f8e86`: typecheck, lint and production build passed, as did 1,964 unit tests and 1,154 browser tests. On the Part 1 foundation, typecheck, lint, 27 focused unit tests and four v6 browser checks passed; CI `scope` and `fast-gate` passed at `98c306b`. The interface and release gates remain pending.

1. Setup, baseline and integration — GPT-6.1 Terra, high (selected).
2. Tokens, typography, fonts, components and gallery — GPT-6.1 Sol, medium (selected).
3. Mathematical emblems, motion, haptics and chart primitives — GPT-6.1 Terra, high (selected).
4. Shell and Today, Focus, review-round, Calendar-Day and Path golden screens — GPT-6.1 Terra, xhigh.
5. Atlas golden canvas and worker — GPT-6 Astra, xhigh.
6. Remaining daily loop, capture, search and completion — GPT-6.1 Terra, high.
7. Calendar, planner, Tasks and day-close — GPT-6.1 Terra, xhigh.
8. Paths, New path, Checkpoint, Session, Cards and editor — GPT-6.1 Sol, medium.
9. Inbox and Plan proposal — GPT-6.1 Terra, high.
10. Progress, Log, Practice, Settings, subjects, sign-in, first-run and states — GPT-6.1 Sol, high.
11. Sizes and keys — GPT-6.1 Sol, high.
12. Performance, accessibility, rollback and default switch — GPT-6.1 Terra, xhigh.
13. Independent complete-PR review — GPT-6 Astra, xhigh.


## Part 2 status

Implemented with GPT-6.1 Sol, medium effort: scoped Day/Night design tokens; the nine-size typography system; shared standard components from §4.7; licensed, namespaced WOFF2 fonts; and an interactive v7 branch of `/kit`. Canonical radii are 10, 14, 20, 28 and round, including the checkbox's nearest radius of 10. The phone date grid preserves 44 px days at 320 px; desktop subject selection uses a keyboard menu. Sheets use native `dialog.showModal()`, Escape cancellation, focus return, a scrolling body and fixed footer. The gallery demonstrates errors, disabled/loading controls, mixed selection, empty/loading feedback and meter endpoints in both themes.

The implemented v7 root is limited to `/kit`, applied before first React paint and in a layout effect when routes change. Other routes continue using v6/legacy. Font loading follows route changes in both directions, retaining original Google font family names for v6 and using app-local `Lemma v7` names for v7. Official Google Fonts assets and individual OFL files live in `public/fonts/v7/`; identical variable font binaries are deduplicated. STIX Two Text omits several mathematical symbols, so its glyph stack includes an official 5 KB STIX Two Math symbol subset, with its own OFL, rather than system-font fallback. v7 assets are excluded from global Workbox precache to preserve flag-off traffic.

Typecheck, lint, production build and PWA release checks pass. Seven new unit tests cover component behavior and every specified Day/Night contrast pair; the five unchanged v6 token tests also pass. All 16 targeted built-app browser checks pass (ten new v7 checks and six unchanged kit/v6 checks); details are in `docs/current/N122.md`. Intermediate 390 × 844 Day/Night viewport and full-gallery PNGs live beside this document. These have been visually inspected and are not golden-screen approvals.

Part 2 was completed before the Part 3 additions below. Golden screens, default activation and release approval remain pending.


## Part 3 status

Implemented with GPT-6.1 Terra, high effort: deterministic mathematical SVG emblems for all five subject families, seeded identity and bounded generation cache; Day/Night rendering, optional drawing and Focus rotation with reduced-motion support; token-backed motion presets, haptic patterns and an optional phase chime; and accessible line/area, grouped, stacked and horizontal bar and heatmap chart primitives. The gallery demonstrates the emblem families, completion feedback and graphics in both themes. Charts expose interactive values and text tables.

Validation: typecheck, repository lint, production build/PWA artifact checks, 16 v7 unit tests and 13 built-app browser tests passed. The new browser tests cover Day and Night, 96 px emblem sizing, graphics interaction and tables, and reduced-motion rendering; the ten existing gallery tests also pass. Day/Night gallery captures are intermediate review artifacts, not approved golden references.

The visual transitions are reusable presets; their integration into actual screens happens in subsequent parts. The Owner’s gallery approval, design lint, first-load budget and all later screen and release gates remain outstanding. `v7Shell` remains off by default; v6 remains available.
