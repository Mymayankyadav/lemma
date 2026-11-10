# Lemma v7 implementation decisions

The Owner authorized one combined `rules:` PR, Agent `owner-setup-v7`, for the whole attached plan, including all `[New]` features. This is an incremental working PR, not a claim that the redesign is complete. The Owner chooses the model and effort for each part before it starts; Parts 1–3 have been selected.

## Accepted constraints and gates

- Build behind `v7Shell`, initially off. Activate only after hardening and Owner gallery, golden-screen, responsive and physical-device gates. The Owner merges the rules PR. Retain all v6 code and styles for rollback, an explicit L6 exception; retain conditional Google Fonts fallback for v6/legacy. Preserve existing deep links and tests.
- Keep the five-link navigation landmark on immersive screens, visually hidden with keyboard reveal. Self-host v7 fonts. Canonical UI radii are 10, 14, 20, 28 and round; choose the nearest token, ties up, except chart marks and the 4 px checkbox corner necessary to distinguish multi-select from circular radio controls.
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

Implemented with GPT-6.1 Sol, medium effort: scoped Day/Night design tokens; the nine-size typography system; shared standard components from §4.7; licensed, namespaced WOFF2 fonts; and an interactive v7 branch of `/kit`. Canonical radii are 10, 14, 20, 28 and round, with a documented 4 px checkbox exception after Owner review: a 24 px checkbox at 10 px corners was visually indistinguishable from a radio button. The phone date grid preserves 44 px days at 320 px; desktop subject selection uses a keyboard menu. Sheets use native `dialog.showModal()`, Escape cancellation, focus return, a scrolling body and fixed footer. The gallery demonstrates errors, disabled/loading controls, mixed selection, empty/loading feedback and meter endpoints in both themes.

The implemented v7 root is limited to `/kit`, applied before first React paint and in a layout effect when routes change. Other routes continue using v6/legacy. Font loading follows route changes in both directions, retaining original Google font family names for v6 and using app-local `Lemma v7` names for v7. Official Google Fonts assets and individual OFL files live in `public/fonts/v7/`; identical variable font binaries are deduplicated. STIX Two Text omits several mathematical symbols, so its glyph stack includes an official 5 KB STIX Two Math symbol subset, with its own OFL, rather than system-font fallback. v7 assets are excluded from global Workbox precache to preserve flag-off traffic.

Typecheck, lint, production build and PWA release checks pass. Seven new unit tests cover component behavior and every specified Day/Night contrast pair; the five unchanged v6 token tests also pass. All 16 targeted built-app browser checks pass (ten new v7 checks and six unchanged kit/v6 checks); details are in `docs/current/N122.md`. Intermediate 390 × 844 Day/Night viewport and full-gallery PNGs live beside this document. These have been visually inspected and are not golden-screen approvals.

Part 2 was completed before the Part 3 additions below. Golden screens, default activation and release approval remain pending.


## Part 3 status

Implemented with GPT-6.1 Terra, high effort: deterministic mathematical SVG emblems for all five subject families, seeded identity and bounded generation cache; Day/Night rendering, optional drawing and Focus rotation with reduced-motion support; token-backed motion presets, haptic patterns and an optional phase chime; and accessible line/area, grouped, stacked and horizontal bar and heatmap chart primitives. The gallery demonstrates the emblem families, completion feedback and graphics in both themes. Charts expose interactive values and text tables.

Validation: typecheck, repository lint, production build/PWA artifact checks, 16 v7 unit tests and 13 built-app browser tests passed. The new browser tests cover Day and Night, 96 px emblem sizing, graphics interaction and tables, and reduced-motion rendering; the ten existing gallery tests also pass. Day/Night gallery captures are intermediate review artifacts, not approved golden references.

The visual transitions are reusable presets; their integration into actual screens happens in subsequent parts. The Owner’s gallery approval, design lint, first-load budget and all later screen and release gates remain outstanding. `v7Shell` remains off by default; v6 remains available.

## Part 2 visual review follow-up (PR #1348)

The Owner's Step 2 review identified conflicts between subject identity and status, weak selected states and control edges, missing gallery states, and inconsistent action/feedback affordances. The gallery and shared components have been amended on the existing PR branch (without enabling `v7Shell`): subject colours are restricted to identity/emblems while progress uses brand and complete uses Good; Ready/Complete/Demonstrated have different marks and semantic colours. Day/Night control borders are tested against all form surfaces at WCAG 3:1, with a 3 px focus ring and distinctive editable/read-only/disabled presentation. Selected segments, filters, preset durations and slider fill are now visible, and the gallery exposes focus, pressed, radio, open-menu, toast and confirmation-sheet examples. Save is primary, loading retains its label and indicator space, error banners use tone-specific icons, and explanatory specimen notes are replaced with actual copy. Spacing, typography hierarchy, checkbox/switch alignment, and redundant metrics are also corrected.

The original Part 2 and Part 3 PNG captures predate these corrections, so they are historical review artifacts rather than updated evidence. Both themes require fresh captures, and Owner gallery approval remains open. The added visual regression and contrast checks have not yet been confirmed by an executed build in this editing environment; retain the previous validation statements above as historical, not as validation of this follow-up.

## Constellation 10/10 UI kit specification (single-commit rewrite)

The Owner's supplied plan is retained verbatim as `docs/v7/KIT_10_PLAN.md`. This kit contract supersedes the earlier Part 2 intermediate gallery decisions wherever they conflict (especially colour meaning, neutral segmented thumbs, subject-coloured mastery, no dashed disabled borders, the multi-mode state model, and the 8 px proof badge shape).

The candidate 1.0 kit is generated from `src/ui/v7/design-tokens.json` (DTCG raw → semantic role → component alias). `node scripts/v7/generate-tokens.mjs` generates `tokens.css` and `figma-variables.json` from the same source. The JSON is an interchange manifest for Figma-variable import; it is not evidence of a live Figma import. Both themes and high-contrast variants use one component anatomy. The complete kit demonstrates principles, tokens, typography, all nine mathematical subject families, shared component states, proof-first patterns, charts with summaries and tables, and a semantic-versioned changelog in that order. Interaction specimens are deliberately separated from actual product actions.

The original Day Topology solid `#009F89` is tuned slightly to `#009C85` to meet a 3:1 mark-on-subtle-background check. The palette and both colour-blind simulations must continue to pass automated tests after this modification. The design gate `node scripts/v7/check-kit.mjs` is blocking in the PR typecheck/lint job and enforces role aliases, generated-artifact currency, four-mode foreground/background contrast, and category colour-blind separation. The v7 browser tests also exercise theme parity, forms, chart tables, mobile widths, and keyboard interactions. CI screenshots are uploaded as ephemeral workflow artifacts rather than committing generated screenshots, to keep the PR history compact.

**Scope and release:** This work rebuilds the v7 *kit* specified by `KIT_10_PLAN.md`. It does not claim that the app's six golden screens or its other legacy routes have been migrated to the new design system. Those remain Parts 4–13 of the existing v7 implementation plan with separate Owner approval and release requirements. Keep `v7Shell` off by default and do not merge or label this PR Ready until the original gates are met.
