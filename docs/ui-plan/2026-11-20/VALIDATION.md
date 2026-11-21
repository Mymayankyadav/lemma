# November 21 revision validation

The follow-up to PR #1738 covers the November 20 UI plan and the requested mobile proof input beta. The visual baseline is the app at `24c8a225`. The revised comparisons replace the eight sheets the owner rejected. [UI acceptance criteria](NEXT-ITEMS.md) · [Mobile input specification](../../implementation/2026-11-21/mobile-math-input.md) · [Revision checklist](REVISION-CHECKLIST.md)

## Integrated refresh

The final production build passed typecheck, static lint across 1,998 files, Kit lint and the PWA and brand asset checks. Across the integrated and follow-up Chromium runs, 181 distinct product regression cases and 27 rendered design cases passed. The final 11-case run verified visible Atlas result names at 320px and enlarged text, and Calendar Week's compact suggestion controls. The 20-case input run used the real worker after an offline restart and tested typo or shape search at the saved caret. Local logs include `build-final-readability.log`, `lint-final-readability.log`, `kit-final-readability.log`, `browser-final-readability.log` and `browser-symbols-final.log`.

The affected unit run passed 1,277 tests across 164 files. A separate 33-test run passed after the manual geometry change, including the new tilted-stroke regression. The guarded card status tests include an account switch during the asynchronous owner lookup. Local log `unit-delivery-integrated.log` records the integrated run.

## Targeted evidence

Local audit logs are under `/tmp/lemma-owner-audit/`. The checks below cover specific flows.

| Check | Confirmed result | Log or evidence |
| --- | --- | --- |
| N211 findings | The browser regression and its attached frames cover all 21 IDs. | [N211 findings tests](../../../tests/e2e/v7-ui-plan-v2-findings.spec.ts) |
| Owner layout | Focused Chromium checks covered Path at narrow widths and large text, Undo in the split layout, and Day contrast in Review and Teaching style. | [Owner layout tests](../../../tests/e2e/v7-owner-layout.spec.ts) |
| Card deletion and Undo | Guard tests verify atomic note and status filters and reject stale accounts. Both production browser cases restored the prior active or paused status, source and review history. | [Guard tests](../../../tests/unit/data/card-status-guard.test.ts) · [Undo browser tests](../../../tests/e2e/v7-card-delete-undo.spec.ts) |
| Ordinary MCP connector and images | Three Deno tests passed for normal turn discovery, authorized image access and in-order image/prose content | `mcp-inline.log` |
| Real symbol recognition | Desktop Chromium initialized the pinned worker and ran real inference on the production web and Android-mode bundles. The web run repeated inference after an offline reload. Model and checksum failures kept manual Symbols usable. | [Runtime measurements and asset provenance](../../../public/models/tutor-symbols/detypify-0.3.0-lemma-v1/README.md) |

The earlier Supabase test ran the migration chain against an isolated Storage, PostgREST and PostgreSQL stack. It used two signed test owners to verify object access, MIME and size limits, attachment binding, receipt replay and cleanup. [Tutor image verification](../../current/N208.md)

The N211 checks cover record and navigation states (B1, B2, B9, B16 and B20), task and Capture actions (B3, B10 and L13), Inbox and Focus (B12, B13 and T11), Tutor Settings and library filters (B14, B23, B24 and T9), card and Review layout (L8, L9, L10 and T10), and kit controls and the Pad route (T7 and U6). Separate tests exercise the additional card deletion Undo.

## Follow-up symbol input checks

The compact strip shows up to three matches and three possible extensions in one row, with accessible group labels and a loading spinner. Local fuzzy search uses names, TeX commands and shape descriptions. Production browser checks cover both the strip and search. The phone evidence includes the spinner, settled recognition choices and a shape description that finds ∀.

The first simulation ran 980 synthetic traces through the shipped Detypify worker across two seeded splits. On the test split, model-only top-1 recall was 192/200 and top-3, top-5 and top-7 were each 200/200 for targets the model can represent. Lowering the explicit geometry cutoff from 0.94 to 0.86 while keeping the 0.07 separation improved visible completed matches from 204/240 to 216/240. The four geometry-only relations improved from 4/40 to 16/40. Both splits produced zero wrong additional geometry choices at the selected floor. [Manual geometry sweep](../../implementation/2026-11-21/ink-simulation/geometry-sweep.json)

The intended extension appeared in the matcher's first three proposals for 53/100 partial traces. Giving the extension group priority when a glyph qualifies for both groups preserves all 53 in the visible **Could become** group. A valid shorter match appeared for 50/80 annotated partial traces, up from 41/80 at the prior cutoff. The independent completion decisions and model eligibility were identical before and after the geometry change. [Visible shortlist counts](../../implementation/2026-11-21/ink-simulation/geometry-sweep.json)

With a 0.75 score cutoff, 0.15 minimum margin and 0.20 cap on unsupported mass, identity alone would accept 178 correct and 116 incorrect attempts, including 60 partial drawings. The independent completion check reduced that to 11 correct accepts and zero incorrect across 490 traces. The sweep keeps unsupported class mass and uses uncalibrated scores. These fixtures inform coverage and show why completion requires separate evidence. Automatic insertion still requires representative writer and device data. [Simulation report](../../implementation/2026-11-21/ink-simulation/README.md) · [Mobile qualification design](../../implementation/2026-11-21/mobile-math-input.md#11-performance-and-recognition-qualification)

The second simulation ran 696 stress traces with distinct style groups, adaptive sampling, pen lifts, and omitted or extra strokes. On its test split, the visible strip recalled 172/204 completed shapes and 22/66 intended extensions in **Could become**. Geometry-only matches fell to 4/36. The prototype-exclusive subset recalled 50/60 completed shapes and 2/12 extensions in their group. The same identity-only rule would accept 132 correct and 83 incorrect attempts, including 41 partial drawings. Adding the completion gate accepted zero attempts in this stress test. These are generated stroke traces, and the results describe those fixtures. [Stress results](../../implementation/2026-11-21/ink-simulation/humanlike-stress/summary.json) · [Stress fixture generator](../../../scripts/v7/tutor-ink-humanlike-fixtures.ts)

The alternate model research compares offline language and handwriting runtimes against the target handset's constraints. It records model and licensing evidence and identifies work that would need its own device measurements. [Local model options](local-input-model-options.md) · [Handwriting recognizers](handwriting-model-options.md)

## Visual evidence

The supplied ZIP contained 50 visual assets, including composites. Its referenced 492 individual audit captures were unavailable. The replacement pack pairs the supplied evidence with newly captured reachable states from the baseline. The reconstructed baseline has 367 frames across 202 states. The final phone archive has 395 frames across 241 states, including empty and populated states, menus, editors and scroll positions. Review covered every frame in the initial 393-frame phone run and both new beta examples. Focused follow-up captures update Atlas search and Calendar Week. [Baseline archive](before-after/revision-2026-11-21/before/gallery.md) · [Revision archive](before-after/revision-2026-11-21/after/gallery.md)

The responsive archive has 366 frames across 200 states with zero capture or horizontal overflow errors. Profiles include small phones, enlarged text, short landscape screens, tablets and desktops in Day and Night. Review found that subject labels compressed Atlas result names on narrow screens and short Calendar Week suggestions clipped their action. The follow-up places the subject below its name and uses a centered plus in Week suggestions. Both changes passed the focused browser checks and received replacement captures in every responsive profile. [Responsive archive](before-after/revision-2026-11-21/responsive/gallery.md) · [Capture runner](../../../scripts/v7/parity-audit.mjs) · [Atlas browser checks](../../../tests/e2e/v7-atlas-layers.spec.ts) · [Calendar browser checks](../../../tests/e2e/v7-calendar-large-text.spec.ts)

## Remaining qualification and acceptance

- The requested Settings opt-in ships with explicit candidate choice. Automatic insertion remains inactive for the shipped asset set until it has representative writer and device data, compatible calibration and audited extension coverage. Physical-phone latency, writer accuracy, memory and haptics have yet to be measured. [Recognition qualification](../../../public/models/tutor-symbols/detypify-0.3.0-lemma-v1/README.md)
- The Android-mode browser check served the packaged files with external requests blocked and no service worker. Initialization in the installed Android WebView with networking disabled remains unverified. Physical devices are follow-up qualification for the requested beta. [Mobile verification requirements](../../implementation/2026-11-21/mobile-math-input.md#12-tests-and-acceptance-cases)
- Owner visual acceptance of the replacement evidence and independent review of the PR's existing migrations remain pending. [Owner acceptance criteria](NEXT-ITEMS.md#n216-beauty-pass-and-the-owners-eye-test)
