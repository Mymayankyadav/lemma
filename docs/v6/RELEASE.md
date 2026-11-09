# Lemma v6 release audit (N101)

**Release decision: HOLD (G7 fails). Open G7 bugs: the eight design differences [#1330](https://github.com/Mymayankyadav/lemma/issues/1330)–[#1337](https://github.com/Mymayankyadav/lemma/issues/1337) found by the second N118 audit round. The first round's bugs (#1299, #1300, #1302, #1312–#1326) were fixed by #1329.**

**Historical N118 fidelity audit, round 2 (2026-11-09, `main` at `c67ec34`, after the N119 fixes in #1329).** All 19 app captures in `docs/v6/release-captures/` were regenerated in one run and compared one by one with the same-named mockup in `docs/v6/screens/`, Day and Night. Where a difference was unclear, computed styles were also measured against `docs/v6/prototype/mockup.html`. Paths, Review, Cards and Today match apart from demo data. Header, bottom navigation, focus dock, palette (Day and Night), type and control styles match on every screen. Every round-1 difference (#1312–#1326) is gone. Eight differences were found at that revision; all were subsequently fixed in N120 (#1338):

| Screen | Historical difference, since fixed | Closed issue |
| --- | --- | --- |
| Progress | "Small steps, seen over time." sits below the header rule, not in the header, so the page starts about 24px low | [#1330](https://github.com/Mymayankyadav/lemma/issues/1330) |
| Calendar | date labels include the year ("Mon, Nov 9, 2026") | [#1331](https://github.com/Mymayankyadav/lemma/issues/1331) |
| Calendar | logged sessions and due items are grey rows that lead with the title; only planned blocks are time-first cards | [#1332](https://github.com/Mymayankyadav/lemma/issues/1332) |
| Atlas | the list is a tree with expanders and indentation; the mockup list is flat | [#1333](https://github.com/Mymayankyadav/lemma/issues/1333) |
| Atlas | the selected List/Map segment is white, not the mockup's tint, and sits about 20px low | [#1334](https://github.com/Mymayankyadav/lemma/issues/1334) |
| Settings | rows are 88px; the reference PNG shows about 112px (the runnable prototype also measures 88px) | [#1335](https://github.com/Mymayankyadav/lemma/issues/1335) |
| Inbox | the proposal "Edit" button is grey-filled, not outlined | [#1336](https://github.com/Mymayankyadav/lemma/issues/1336) |
| Focus | the "Notices: N · Drift is recorded…" caption is always shown | [#1337](https://github.com/Mymayankyadav/lemma/issues/1337) |

**Round 3 reconciliation (2026-11-09, after N120 [#1338](https://github.com/Mymayankyadav/lemma/pull/1338)).** N120 implemented all eight findings from round 2 (#1330–#1337), added a regression check per issue in `tests/e2e/v6-g7-fixes.spec.ts`, and regenerated all 19 release captures in a single local run using the e2e/CI build settings. The eight issue records are closed, and the PR gate passed ([run 42558394168](https://github.com/Mymayankyadav/lemma/actions/runs/42558394168)). The captures now on `main` come from N120, not this audit branch's superseded round-2 PNGs. A separate reviewer still needs to compare all 19 final app PNGs with `docs/v6/screens/` and record any new visible difference; no new independent visual sign-off is claimed here. Physical-device and live-account checks remain outstanding.

Kept on purpose and not filed: the mockup draws Finish & log with a dim label (about 1.4:1 contrast); the app keeps a readable label (see `docs/current/N119.md`). The app Focus page also has a "Timer details" disclosure, which holds the lease controls that #1315 moved off the main page. Differences that come only from demo data are not filed. Examples: counts, dates, which blocks exist, Today showing "Your learning paths" and "Today's plan" when no block is coming up, and the Focus capture having no checkpoint line because the demo activity is not linked to a path. The detail routes with no mockup PNG were compared against `docs/v6/prototype/mockup.html` during the port (#1309) and are not among the 19 captures. All eight issues are closed. Independent visual comparison of the final N120 captures against the same-named mockups is still required for G7 sign-off.

This is evidence tracking, not approval to make `v6Shell` default-on. N102 still requires the Owner's explicit approval and physical-device sign-off. Browser demo and isolated SQL results do not prove remote migration, MCP or account-delete deployment.

## Shipped behind the flag

The web v6 experience adds Today / Paths / Review / Calendar / Progress navigation, Inbox and Tasks actions, persistent Focus access, saved and corrected effort, Calendar planning, dated ritual, Practice and responsive learning views. Learning plans, study scheduling and actual measured effort remain distinct. Legacy pages remain the default with the flag off. Native timers, third-party calendar integration and recurring scheduling are not included.

## Exact-output browser audit

Run on this commit, using the Vite build rather than the standalone mockup:

```sh
npm ci
npx playwright install chromium
npm run e2e -- tests/e2e/v6-release-audit.spec.ts
```

The N101 suite visits all 18 canonical routes and five additional v6 routes (including direct deep links) at 320/360/390px, Day/Night and 200% text. It checks v6 shell navigation, responsive overflow, theme and uncaught browser exceptions. It exercises real demo APIs for Focus pause/resume/Save → reload → Time log → Progress → Calendar/Back, plus Inbox clearance → Review confidence/grade → Atlas → Planner/Escape. Review undo (#1299, fixed by #1329) is a passing regression test. See also `v6-harden-slice`, `v6-harden-planning`, `v6-harden-learning`, `v6-rollback` and `acceptance-journey`. These are web/demo journeys, not live-account or physical-device certification.

Every route check waits for the screen to finish loading before measuring: no "Loading…" text, no "<Thing> loading" or "<Thing> unavailable" state and no error screen. Deep links use ids that exist in the demo data (path `real-analysis`, checkpoint CP4, session 7, card N7, proposal `proposal-6`), and the path, checkpoint and card links must show their own content. No route has an expected failure or overflow exemption any more: #1298 and #1300 are fixed.

Correction (owner, #1301): the first version of this audit (#1297) measured some screens while they still showed "Loading screen…", used a proposal id that does not exist, and marked whole route tests as expected failures. Its "other routes pass" result is superseded by run [42497431997](https://github.com/Mymayankyadav/lemma/actions/runs/42497431997) at `ccad38e`: 146 tests, 141 passed and 5 expected failures (Today and Kit overflow at 320px in Day and Night, and #1299).

## Screenshot provenance and capture

The 19 PNGs under `docs/v6/release-captures/` are **real application** Chromium renders of the 390×844 viewport, i.e. what a phone screen shows (Day/Night on nine destinations plus Focus Day), with a running Pomodoro focus so that the focus dock is on screen as in the mockup. The current captures were regenerated for N120 in one local run on 2026-11-09 from PR head `146d7be` (merged into `main` as `5c696dce`) using CI-equivalent build settings (`VITE_ALLOW_FLAG_OVERRIDES=1 VITE_FLAGS=-v6Shell`, `?flags=v6Shell`) and the deterministic **demo** account. CI does not keep screenshots as artifacts, so this run was local rather than "one CI run" as N118 asked; the command below reproduces it. These images are browser evidence, not physical-device validation. `docs/v6/screens/` holds the design mockup captures and is protected by `tests/unit/docs/mockup-screens.test.ts`.

To reproduce the checked-in app captures:

```sh
LEMMA_RELEASE_CAPTURE=1 npm run e2e -- tests/e2e/v6-release-audit.spec.ts -g 'N101 screenshot capture'
```

Normal CI writes fresh renders to `test-results/v6-release/screens/` and does not overwrite tracked assets. The 320/360/390px, 200% text Day/Night geometry audit runs separately from the default-size 390px PNG captures.

## Gates G1–G7, per data/MCP contract §10

| Gate | Available evidence | Release status |
| --- | --- | --- |
| G1 schema coverage | Capability registry, N40, N94 SQL coverage assertion | Production: Supabase deploy run [42495185219](https://github.com/Mymayankyadav/lemma/actions/runs/42495185219) (main `dc6630e`) applied migrations through `20261208110100`; confirm deployment of N119's newer `20261209100000_review_runs_undo_last.sql` before release |
| G2 command parity | N94 `tests/mcp/sql/parity.mjs` owner/app/MCP command, retry, version and undo checks | Not a production MCP smoke certificate |
| G3 complete UI data | N98/N99/N100 empty/stress hardening and N101 route matrix | Demo projections; live errors/nulls require owner test |
| G4 consistency | N94 parity, N98 effort reconciliation, N99 DST and N101 cross-route saved minutes | Second-device and real-owner refresh still required |
| G5 preserved history | N97 SQL upgrade rehearsal, N96 rollback and N95 export tests | Production backup/restore not asserted |
| G6 ownership/deletion | N94 two-owner isolation and N103 account deletion SQL | `account-delete` Edge Function deployed and active since 2026-11-08; live deletion is on the Owner checklist |
| G7 visible behavior | N98/N99/N100/N101 browser specs, `v6-g7-fixes`, capture script and both N118 audit rounds | **Pending**: #1330–#1337 fixed and closed by N120; independent final-capture comparison and physical-device checks outstanding |

N101 found 320px Today overflow (#1298), missing durable Review undo (#1299), 320px Kit overflow (#1300) and the Atlas header overlap (#1302). All four are fixed (#1298 earlier; the rest by #1329), and the release audit now runs them as ordinary passing checks. N120 subsequently fixed #1330–#1337. Release remains on hold for independent visual review, live/backend verification and the Owner's device checks.

**None of G1–G7 is labelled production-passed merely because the test exists.** Attach CI run IDs and test results for the exact commit and the Owner's accepted device evidence before N102.

## Known limitations

The flag is default-off until N102. Isolated demo state does not certify cross-device sync, remote RLS, SQL deployment, MCP parity or live deletion. The account-delete deployment step that an automated revert removed was re-landed (#1232) and the function is deployed; live deletion still belongs to the Owner checklist. iOS Safari, Android Chrome, installed-PWA keyboard/IME, safe areas, screen-reader behavior and OS Back are outside CI Chromium. The screenshot directory contains real-app Chromium captures from N120's single local capture run (see Screenshot provenance), not physical-device screenshots. Real calendar providers, recurring blocks and native Focus surfaces are intentionally excluded.

## Owner physical-device checklist (complete before N102)

- [ ] Android Chrome / installed PWA: narrow widths, Day/Night, 200% OS text, rotation, touch targets, bottom navigation and keyboard resizing.
- [ ] iPhone Safari / installed PWA: notch/home-indicator safe areas, keyboard/visual viewport, hardware/gesture Back and reachable Focus/Inbox actions on final scroll.
- [ ] Android/iOS hardware keyboard and assistive reading: focus order/restoration, long math and source text, semantic labels, live feedback, contrast and nested scroll.
- [ ] Real current backend owner: create task and plan, Focus pause/break/reload/save/correct, compare Today/Calendar/Progress at DST and across a second device.
- [ ] Verify Review confidence/grade/undo, Inbox approve/reject/conflict/draft, app↔MCP receipt parity, export/restore and rollback to legacy without lost records.
- [ ] Verify second-owner access is denied and account deletion plus storage purge succeeds through the actually deployed endpoint.
- [ ] Attach actual-app PNG commit, CI/test run links, device models/OS/browser versions and explicit Owner approval to N102; do not activate v6 while any gate is open.
