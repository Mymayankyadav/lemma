# Lemma v6 release audit (N101)

**Release decision: HOLD (G7 defects: [#1298](https://github.com/Mymayankyadav/lemma/issues/1298), [#1299](https://github.com/Mymayankyadav/lemma/issues/1299), [#1300](https://github.com/Mymayankyadav/lemma/issues/1300), [#1302](https://github.com/Mymayankyadav/lemma/issues/1302)).** This is evidence tracking, not approval to make `v6Shell` default-on. N102 still requires the Owner's explicit approval and physical-device sign-off. Browser demo and isolated SQL results do not prove remote migration, MCP or account-delete deployment.

## Shipped behind the flag

The web v6 experience adds Today / Paths / Review / Calendar / Progress navigation, Inbox and Tasks actions, persistent Focus access, saved and corrected effort, Calendar planning, dated ritual, Practice and responsive learning views. Learning plans, study scheduling and actual measured effort remain distinct. Legacy pages remain the default with the flag off. Native timers, third-party calendar integration and recurring scheduling are not included.

## Exact-output browser audit

Run on this commit, using the Vite build rather than the standalone mockup:

```sh
npm ci
npx playwright install chromium
npm run e2e -- tests/e2e/v6-release-audit.spec.ts
```

The N101 suite visits all 18 canonical routes and five additional v6 routes (including direct deep links) at 320/360/390px, Day/Night and 200% text. It checks v6 shell navigation, responsive overflow, theme and uncaught browser exceptions. It exercises real demo APIs for Focus pause/resume/Save → reload → Time log → Progress → Calendar/Back, plus Inbox clearance → Review confidence/grade → Atlas → Planner/Escape. Review has no undo yet (#1299); a separate expected-failure test tracks it. See also `v6-harden-slice`, `v6-harden-planning`, `v6-harden-learning`, `v6-rollback` and `acceptance-journey`. These are web/demo journeys, not live-account or physical-device certification.

Every route check waits for the screen to finish loading before measuring: no "Loading…" text, no "<Thing> loading" or "<Thing> unavailable" state and no error screen. Deep links use ids that exist in the demo data (path `real-analysis`, checkpoint CP4, session 7, card N7, proposal `proposal-6`), and the path, checkpoint and card links must show their own content. Only the sideways-overflow measurement of the known #1298/#1300 cases is an expected failure; every other check on those routes must pass.

Correction (owner, #1301): the first version of this audit (#1297) measured some screens while they still showed "Loading screen…", used a proposal id that does not exist, and marked whole route tests as expected failures. Its "other routes pass" result is superseded by run [42497431997](https://github.com/Mymayankyadav/lemma/actions/runs/42497431997) at `ccad38e`: 146 tests, 141 passed and 5 expected failures (Today and Kit overflow at 320px in Day and Night, and #1299).

## Screenshot provenance and capture

The 19 checked-in PNGs under `docs/v6/screens/` are **real application** Chromium renders of the 390×844 viewport, i.e. what a phone screen shows (Day/Night on nine destinations plus Focus Day). Each capture waits for the screen to finish loading. The capture test built and served the Vite/React application with the deterministic **demo** account, on CI run [42497431997](https://github.com/Mymayankyadav/lemma/actions/runs/42497431997) at source commit `ccad38e`; no application source changed between capture and commit. The first set (#1297, run 42495300188) is superseded: several of its Day images showed the "Loading screen…" placeholder, and its full-page captures drew the bottom navigation across the middle of long screens. These images are browser evidence, not physical-device validation.

To reproduce the checked-in app captures:

```sh
LEMMA_RELEASE_CAPTURE=1 npm run e2e -- tests/e2e/v6-release-audit.spec.ts -g 'N101 screenshot capture'
```

Normal CI writes fresh renders to `test-results/v6-release/screens/` and does not overwrite tracked assets. The 320/360/390px, 200% text Day/Night geometry audit runs separately from the default-size 390px PNG captures.

## Gates G1–G7, per data/MCP contract §10

| Gate | Available evidence | Release status |
| --- | --- | --- |
| G1 schema coverage | Capability registry, N40, N94 SQL coverage assertion | Production: Supabase deploy run [42495185219](https://github.com/Mymayankyadav/lemma/actions/runs/42495185219) (main `dc6630e`) applied every migration through `20261208110100` |
| G2 command parity | N94 `tests/mcp/sql/parity.mjs` owner/app/MCP command, retry, version and undo checks | Not a production MCP smoke certificate |
| G3 complete UI data | N98/N99/N100 empty/stress hardening and N101 route matrix | Demo projections; live errors/nulls require owner test |
| G4 consistency | N94 parity, N98 effort reconciliation, N99 DST and N101 cross-route saved minutes | Second-device and real-owner refresh still required |
| G5 preserved history | N97 SQL upgrade rehearsal, N96 rollback and N95 export tests | Production backup/restore not asserted |
| G6 ownership/deletion | N94 two-owner isolation and N103 account deletion SQL | `account-delete` Edge Function deployed and active since 2026-11-08; live deletion is on the Owner checklist |
| G7 visible behavior | N98/N99/N100/N101 browser specs and capture script | Real-app PNGs checked in; physical checks and #1298/#1299/#1300/#1302 pending |

N101 found 320px Today overflow (#1298), missing durable Review undo (#1299), and 320px Kit overflow (#1300); the corrected captures also show the Atlas header losing its side padding, so the title overlaps the Demo badge (#1302). Each remains an open issue. Their expected-failure tests execute and preserve the failing assertions; CI acceptance does not certify that those experiences pass. The release is blocked until the separate bug fixes land.

**None of G1–G7 is labelled production-passed merely because the test exists.** Attach CI run IDs and test results for the exact commit and the Owner's accepted device evidence before N102.

## Known limitations

The flag is default-off. Isolated demo state does not certify cross-device sync, remote RLS, SQL deployment, MCP parity or live deletion. The account-delete deployment step that an automated revert removed was re-landed (#1232) and the function is deployed; live deletion still belongs to the Owner checklist. iOS Safari, Android Chrome, installed-PWA keyboard/IME, safe areas, screen-reader behavior and OS Back are outside CI Chromium. The screenshot directory contains real-app Chromium captures from CI run 42497431997, not physical-device screenshots. Real calendar providers, recurring blocks and native Focus surfaces are intentionally excluded.

## Owner physical-device checklist (complete before N102)

- [ ] Android Chrome / installed PWA: narrow widths, Day/Night, 200% OS text, rotation, touch targets, bottom navigation and keyboard resizing.
- [ ] iPhone Safari / installed PWA: notch/home-indicator safe areas, keyboard/visual viewport, hardware/gesture Back and reachable Focus/Inbox actions on final scroll.
- [ ] Android/iOS hardware keyboard and assistive reading: focus order/restoration, long math and source text, semantic labels, live feedback, contrast and nested scroll.
- [ ] Real current backend owner: create task and plan, Focus pause/break/reload/save/correct, compare Today/Calendar/Progress at DST and across a second device.
- [ ] Verify Review confidence/grade/undo, Inbox approve/reject/conflict/draft, app↔MCP receipt parity, export/restore and rollback to legacy without lost records.
- [ ] Verify second-owner access is denied and account deletion plus storage purge succeeds through the actually deployed endpoint.
- [ ] Attach actual-app PNG commit, CI/test run links, device models/OS/browser versions and explicit Owner approval to N102; do not activate v6 while any gate is open.
