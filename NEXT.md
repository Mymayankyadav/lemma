# NEXT — consolidated remaining Lemma work (Owner decision 2026-11-20)

**Owner release decision (supersedes earlier opt-in/default-off shipping language):** the **new scheduler and learning algorithm ship New by default** with an accessible persistent **Settings > Planning: New / Legacy** selector. **Lemma Pad ships as a full page with its custom math keyboard, enabled by default.** Build flags may remain off until integrated acceptance; N198 must turn them on for the coordinated public release. Prospective randomized practice remains independently safety-qualified, with native fallback when ineligible. Never skip migration, owner isolation, Android or release validation to turn on a flag.

This is the **working queue**, ranked for future chats. The 44-entry previous queue is preserved unmodified in [NEXT-before-reconciliation.md](docs/implementation/2026-11-20/NEXT-before-reconciliation.md); individual dispositions and uncertainties are in [LEGACY-DISPOSITION.md](docs/implementation/2026-11-20/LEGACY-DISPOSITION.md). Do not treat archival as proof of completion. The nine task packets live at [implementation handoff](docs/implementation/2026-11-20/README.md).

**Picking:** obey `AGENTS.md` incident/review/own-PR order first. An **existing open PR is its claim**; continue or take it over only under the lease-expired rule. Choose the highest **open** item whose `Needs` are done. An unverified provider/asset entry condition keeps a conditional item **blocked**. If an existing PR is already claimed, independent fixes on that same PR can proceed before its final integration dependency, but may not be called complete. Agents must not open replacement PRs for N191/N192/N193/N195/N196.

## N217 Rank-sensitive Scribe replay measurement

Stage: Build · Status: open · Needs: — · Assigned: chat-917642#x8q2
Done = Reproduce actual baseline display order on synthetic math-writing examples and report candidate recall, Top-1, Top-3, MRR@3, exact random expectations and pool-size slices. Mechanically verify safety filtering, suppression, deterministic controls and rank-shuffle detection without claiming human results.
Tests: actual baseline visible parity; finite six-candidate chance and smaller pools; blocked/suppressed cases; deterministic synthetic replay.
Scope: a development-only replay script, tests, protocol and N217 documentation.
Not: product behavior, policy or flags; learner data; logging, collection or upload; training, APKs, performance or release claims.

## N201 Open the checkpoint tutor chat from the study path

Owner task: "I want exactly this page as chatbot in lemma app when I click on continue with tutor. You can us le already existing contracts to make this page work as it was intended usage. Remove ugly pad and shit"
Stage: Harden · Status: done · Needs: — · Assigned: chat-174602#75tl
Done = Both Continue with tutor entry points open the supplied chat design for the selected checkpoint inside Lemma's shared app shell. Navigation hides on phone and desktop to enlarge the conversation; shared Back, Search and session controls remain available. The Gboard-style keyboard provides local autocomplete and respects the app's haptics setting and theme tokens. Sending an answer grants the connected Lemma MCP tutor that turn. The next tutor question appears in the same conversation. Leaving and returning preserves the conversation and draft. Existing saved Pad notes remain accessible through Settings.
Tests: phone and desktop chat space, full question reading, navigation recovery, keyboard layout and autocomplete, haptics setting, persisted drafts, signed-in grant and reply recovery, ordinary MCP tool discovery and PostgreSQL owner/lease/reply isolation.
Scope: app routing and v7 navigation, tutor UI, browser adapters, checkpoint and Settings entry points, existing Lemma MCP tutor tools, an additive grant lookup migration and their regression tests.

## N199 Optional direct native tutor transport when provider eligibility is verified

Owner task: "Ok add on new schedular and the algorithm is shipped with default on and optional switch and in settings and the lemma pad should be shipped as page with its custom keyboard. Then publish"
Stage: Build · Status: blocked · Needs: N193 · Assigned: —
Existing PR: —
Done = Only if a real provider, client, device and account offer a supported authorized transport: build and test direct native tutoring with protected credentials, explicit per-turn grants, expiry/revocation, the same one-final-answer contract and manual fallback. No promised direct plan access without evidence.
Tests: `provider-specific authorized test account/device`; `credential scoping, rotation, lease expiry, owner separation and recovery`; `manual fallback under network/host absence`.
Scope: src/data/tutor/**; src/platform/**; supabase/functions/mcp/tutor-profile.ts; docs/current/N199.md.
Not: Secrets in browser/PR; Screen scraping private chats or bypassing host controls; Blocking N198 while eligibility is absent.
Agent packet: [N199.md](docs/implementation/2026-11-20/tasks/N199.md). Do not auto-select: External provider/entitlement/device eligibility NOT YET VERIFIED; stays blocked and outside core release.

## N200 Optional bounded on-device equation recognition after asset and corpus qualification

Owner task: "Ok add on new schedular and the algorithm is shipped with default on and optional switch and in settings and the lemma pad should be shipped as page with its custom keyboard. Then publish"
Stage: Build · Status: blocked · Needs: N192 · Assigned: —
Existing PR: —
Done = If licensed model/assets and a representative test corpus qualify: add bounded on-device image-to-equation recognition to the Pad page, preview editable output, let the learner insert explicitly and preserve all offline/keyboard/undo behavior. Reject the feature when it cannot pass quality and performance gates.
Tests: `representative formula and handwriting corpus`; `slow/offline device cancellation and memory limits`; `malformed image and equation limits, user edit/undo`; `comparison with manual custom keyboard entry`.
Scope: src/features/pad/**; tests/unit/pad/**; tests/e2e/pad-local.spec.ts; docs/current/N200.md.
Not: Replacing the custom math keyboard; Shipping an unlicensed model; Requiring the optional OCR for N198.
Agent packet: [N200.md](docs/implementation/2026-11-20/tasks/N200.md). Do not auto-select: Needs verified model rights, assets, device and representative corpus; remains blocked and optional.
