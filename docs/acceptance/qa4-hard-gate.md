# QA-4b — v4 route-budget workflow gate

**Scope:** Independent, mergeable QA-4 infrastructure split. This is **not** final QA-4 visual acceptance. The approved visual truth is `docs/spec/v4-look.md` §6–7, with the inventory in `docs/design/v4/capture-routes.md`.

## Automated evidence required

- The existing `Review screenshots` workflow captures **23 route/interaction scenes × 2 worlds × 2 profiles × 2 widths = 184 viewport PNGs**, plus **64 full-page PNGs**. `scripts/qa4-screens.ts` rejects missing, invalid and repeated interaction frames. This is structural evidence, not a human visual approval.
- A **separate, parallel workflow job** must run the repository's existing `tests/e2e/stress.spec.ts` against the built app on Chromium, for the stress and extreme fixtures, Graph day/night and 360/390 px. It must use **zero retries**, must fail the workflow on any strict budget failure, and must preserve its JSON/PNG evidence even when red.
- The current ST-0 suite checks every listed route's DOM/text/marks/targets/overflow/network metrics, but it applies 4× CPU throttling **only to the cold Today route**; later routes are measured at 1× to fit the existing CI time budget. This split **does not claim** the stronger QA-4 requirement of a cold 4× first render on every route.
- No stress threshold, test fixture, retry, skip, screenshot count or acceptance criterion may be relaxed to obtain green CI.

## Remaining QA-4 acceptance (not delivered by this split)

The final QA-4 audit still requires cold 4× CPU evidence on **every** route, independent visual comparison with `docs/design/v4/`, documented deviations as separate issues, and manual review of actual day/night S/default screenshots at both phone widths. Existing intermittent Atlas, Cards and notification SQL failures remain independently tracked; a successful rerun alone is not proof they are resolved.

## Handoff

This split owns only `.github/workflows/review-shots.yml` and this acceptance note. When its workflow is green, obtain an **independent exact-head Auditor CLEAR**, then a fresh Steward merge gate. Do not close QA-4 based on this split alone.

Assisted-by: ChatGPT (OpenAI).
