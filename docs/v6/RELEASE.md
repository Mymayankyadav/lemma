# Lemma v6 release audit (N101)

**Release decision: HOLD (known G7 defects: [#1298](https://github.com/Mymayankyadav/lemma/issues/1298), [#1299](https://github.com/Mymayankyadav/lemma/issues/1299)).** This is evidence tracking, not approval to make `v6Shell` default-on. N102 still requires the Owner's explicit approval and physical-device sign-off. Browser demo and isolated SQL results do not prove remote migration, MCP or account-delete deployment.

## Shipped behind the flag

The web v6 experience adds Today / Paths / Review / Calendar / Progress navigation, Inbox and Tasks actions, persistent Focus access, saved and corrected effort, Calendar planning, dated ritual, Practice and responsive learning views. Learning plans, study scheduling and actual measured effort remain distinct. Legacy pages remain the default with the flag off. Native timers, third-party calendar integration and recurring scheduling are not included.

## Exact-output browser audit

Run on this commit, using the Vite build rather than the standalone mockup:

```sh
npm ci
npx playwright install chromium
npm run e2e -- tests/e2e/v6-release-audit.spec.ts
```

The N101 suite visits all 18 canonical routes and five additional v6 routes (including direct deep links) at 320/360/390px, Day/Night and 200% text. It checks v6 shell navigation, responsive overflow, theme and uncaught browser exceptions. It exercises real demo APIs for Focus pause/resume/Save → reload → Time log → Progress → Calendar/Back, plus Inbox clearance → Review confidence/grade/undo → Atlas → Planner/Escape. See also `v6-harden-slice`, `v6-harden-planning`, `v6-harden-learning`, `v6-rollback` and `acceptance-journey`. These are web/demo journeys, not live-account or physical-device certification.

## Screenshot provenance and capture

The 19 existing `docs/v6/screens/*.png` images were generated from the **standalone mockup**. They must **not** be passed off as actual-app screenshots. The N101 screenshot test renders the real Vite build at 390×844 and both palettes, writing nine Day/Night pairs and Focus Day under `test-results/v6-release/screens/`. To overwrite the canonical screenshots in a local checkout with the real app's output, run:

```sh
LEMMA_RELEASE_CAPTURE=1 npm run e2e -- tests/e2e/v6-release-audit.spec.ts -g 'N101 screenshot capture'
```

Review each PNG and commit the generated actual-app images. The screenshot files **have not been refreshed in this commit**, so G7 is not yet release-complete. CI-generated uncommitted images are not repository evidence.

## Gates G1–G7, per data/MCP contract §10

| Gate | Available evidence | Release status |
| --- | --- | --- |
| G1 schema coverage | Capability registry, N40, N94 SQL coverage assertion | Isolated audit; remote schema still needs verification |
| G2 command parity | N94 `tests/mcp/parity.mjs` owner/app/MCP command, retry, version and undo checks | Not a production MCP smoke certificate |
| G3 complete UI data | N98/N99/N100 empty/stress hardening and N101 route matrix | Demo projections; live errors/nulls require owner test |
| G4 consistency | N94 parity, N98 effort reconciliation, N99 DST and N101 cross-route saved minutes | Second-device and real-owner refresh still required |
| G5 preserved history | N97 SQL upgrade rehearsal, N96 rollback and N95 export tests | Production backup/restore not asserted |
| G6 ownership/deletion | N94 two-owner isolation and N103 account deletion SQL | Actual account-delete Edge deployment must be checked |
| G7 visible behavior | N98/N99/N100/N101 browser specs and capture script | Actual-app PNG commit and physical checks pending |

N101's 320px Today overflow and missing durable Review undo are active bug issues #1298 and #1299. Their expected-failure tests execute and preserve the failing assertions; CI acceptance does not certify that those experiences pass. The release is blocked until the separate bug fixes land.

**None of G1–G7 is labelled production-passed merely because the test exists.** Attach CI run IDs and test results for the exact commit and the Owner's accepted device evidence before N102.

## Known limitations

The flag is default-off. Isolated demo state does not certify cross-device sync, remote RLS, SQL deployment, MCP parity or live deletion. The N103 completion note identifies an account-delete deployment-step regression after an automated revert; verify the endpoint rather than assuming it is deployed. iOS Safari, Android Chrome, installed-PWA keyboard/IME, safe areas, screen-reader behavior and OS Back are outside CI Chromium. The screenshot directory still contains prototype PNGs until the capture is run and those real images are committed. Real calendar providers, recurring blocks and native Focus surfaces are intentionally excluded.

## Owner physical-device checklist (complete before N102)

- [ ] Android Chrome / installed PWA: narrow widths, Day/Night, 200% OS text, rotation, touch targets, bottom navigation and keyboard resizing.
- [ ] iPhone Safari / installed PWA: notch/home-indicator safe areas, keyboard/visual viewport, hardware/gesture Back and reachable Focus/Inbox actions on final scroll.
- [ ] Android/iOS hardware keyboard and assistive reading: focus order/restoration, long math and source text, semantic labels, live feedback, contrast and nested scroll.
- [ ] Real current backend owner: create task and plan, Focus pause/break/reload/save/correct, compare Today/Calendar/Progress at DST and across a second device.
- [ ] Verify Review confidence/grade/undo, Inbox approve/reject/conflict/draft, app↔MCP receipt parity, export/restore and rollback to legacy without lost records.
- [ ] Verify second-owner access is denied and account deletion plus storage purge succeeds through the actually deployed endpoint.
- [ ] Attach actual-app PNG commit, CI/test run links, device models/OS/browser versions and explicit Owner approval to N102; do not activate v6 while any gate is open.
