# NEXT — consolidated remaining Lemma work (Owner decision 2026-11-20)

**Owner release decision (supersedes earlier opt-in/default-off shipping language):** the **new scheduler and learning algorithm ship New by default** with an accessible persistent **Settings > Planning: New / Legacy** selector. **Lemma Pad ships as a full page with its custom math keyboard, enabled by default.** Build flags may remain off until integrated acceptance; N198 must turn them on for the coordinated public release. Prospective randomized practice remains independently safety-qualified, with native fallback when ineligible. Never skip migration, owner isolation, Android or release validation to turn on a flag.

This is the **working queue**, ranked for future chats. The 44-entry previous queue is preserved unmodified in [NEXT-before-reconciliation.md](docs/implementation/2026-11-20/NEXT-before-reconciliation.md); individual dispositions and uncertainties are in [LEGACY-DISPOSITION.md](docs/implementation/2026-11-20/LEGACY-DISPOSITION.md). Do not treat archival as proof of completion. The nine task packets live at [implementation handoff](docs/implementation/2026-11-20/README.md).

**Picking:** obey `AGENTS.md` incident/review/own-PR order first. An **existing open PR is its claim**; continue or take it over only under the lease-expired rule. Choose the highest **open** item whose `Needs` are done. An unverified provider/asset entry condition keeps a conditional item **blocked**. If an existing PR is already claimed, independent fixes on that same PR can proceed before its final integration dependency, but may not be called complete. Agents must not open replacement PRs for N191/N192/N193/N195/N196.

## N197 Finish shared receipt privileges and seven legacy-writer cutover

Owner task: "Ok add on new schedular and the algorithm is shipped with default on and optional switch and in settings and the lemma pad should be shipped as page with its custom keyboard. Then publish"
Stage: Harden · Status: open · Needs: N191 · Assigned: —
Existing PR: —
Done = Reuse and finish the recovered receipt-permissions cutover. Revoke direct browser write privilege for protected receipts without breaking seven existing legitimate commands; verify app/service callers, replay, account separation, exports and deletion. Route any non-additive privilege changes through an explicit Owner `rules:` PR.
Tests: `real PostgreSQL role and grant inspection`; `seven-writer compatibility and concurrency fixture`; `existing account-export, deletion and undo suites`; `cross-account and unauthorized direct-write regression`.
Scope: supabase/migrations/** (new authorized migration only); tests/mcp/sql/**; docs/current/N197.md; docs/v6/capability-registry/**.
Not: New learning policy or UI; Co-mingling unrelated feature migrations; Changing protected CI permissions to hide failures.
Agent packet: [N197.md](docs/implementation/2026-11-20/tasks/N197.md). 

## N198 Qualify and ship New defaults, Settings switches, full Pad page and integrated release

Owner task: "Ok add on new schedular and the algorithm is shipped with default on and optional switch and in settings and the lemma pad should be shipped as page with its custom keyboard. Then publish"
Stage: Harden · Status: open · Needs: N191, N197, N193, N195, N196, N192 · Assigned: —
Existing PR: —
Done = Qualify the complete signed-in release and turn on the NEW scheduler/algorithm by default for all eligible owners while preserving a persistent Settings > Planning New/Legacy switch; ship the full Lemma Pad page and on-screen custom math keyboard enabled by default. Require independent migration, service, PWA/Android, accessibility, owner isolation, rollback and observability evidence before activation. Deliver one ordered Owner-approved release and rollback record.
Tests: `full `npm run check`, SQL, parity, Playwright and build on a combined candidate`; `fresh + upgrade PostgreSQL 17 migration, export/purge, privilege checks and rollback rehearsal`; `signed-in first card -> study -> pad -> tutor -> review -> new agenda -> MCP queue flow`; `PWA offline and Android POCO M8 Power 16 keyboard/share/focus acceptance`; `deployed read-only agenda shadow and fallback latency`; `feature-default and account-toggle regression with user setting absence/presence`.
Scope: src/flags.ts (reviewed default-on changes); src/features/settings/v7/**; src/app/routes.tsx; src/features/pad/**; src/data/adaptive/**; docs/current/N198.md; docs/implementation/2026-11-20/**.
Not: A default-off public release; Dropping Legacy switch; Blindly enabling unsafe prospective experiment arms; Claiming an unrun device/deployment gate has passed.
Agent packet: [N198.md](docs/implementation/2026-11-20/tasks/N198.md). 

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
