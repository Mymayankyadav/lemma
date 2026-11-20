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

## N193 Finish durable checkpoint tutoring, MCP grants and recovery

Owner task: "Ok add on new schedular and the algorithm is shipped with default on and optional switch and in settings and the lemma pad should be shipped as page with its custom keyboard. Then publish"
Stage: Build · Status: open · Needs: N191 · Assigned: chat-84293#kzbq
Existing PR: #1537 (https://github.com/Mymayankyadav/lemma/pull/1537)
Done = Complete existing PR #1537 so each checkpoint has an owner-bound conversation, one accepted answer per sealed turn, explicit context and source citations, retained losing/manual replies, recoverable ambiguous acknowledgements, narrow per-turn MCP authorization and owner-reviewed change proposals. Expose the canonical receiving contract for Pad excerpts.
Tests: `node tests/mcp/sql/n193-tutor.mjs`; `tests/mcp/n193-tutor-profile.test.ts`; `tests/e2e/v7-tutor-{live,route-status,local-excerpt,demo-manual}.spec.ts`; `tests/unit/tutor/{live-manual,local-excerpt,turn-model}.test.ts`; `combined export/deletion and real-permission check after N197`.
Scope: src/features/tutor/DemoCheckpointTutor.tsx; src/data/tutor/{manual-api,live-manual,turn-model,local-excerpt}.ts; supabase/functions/mcp/tutor-profile.ts; supabase/migrations/20261120045827_n193_tutor_threads.sql; docs/current/N193.md.
Not: Automatic inference using an unverified provider; Implicit Pad submission; Broad connected-host access or new secret exposure.
Agent packet: [N193.md](docs/implementation/2026-11-20/tasks/N193.md). 

## N195 Complete live first study, scoped review, UI and accessibility repairs

Owner task: "Ok add on new schedular and the algorithm is shipped with default on and optional switch and in settings and the lemma pad should be shipped as page with its custom keyboard. Then publish"
Stage: Build · Status: open · Needs: N191 · Assigned: chat-671983#wxm1
Existing PR: #1546 (https://github.com/Mymayankyadav/lemma/pull/1546)
Done = Finish existing PR #1546's live first-card and exact grading, task/calendar write recovery, frozen per-scope review, Today/Atlas/capture repairs and accessibility. Demonstrate 1-card, 23-card, 90-future-card, lost-ack, account-switch and focus/keyboard pathways.
Tests: `npx tsc -b; node scripts/ci/lint.mjs`; `node tests/mcp/sql/first-study.mjs`; `node tests/mcp/sql/first-study-concurrency.mjs`; `tests/e2e/v7-n195-{live-first-study,study-repairs,task-live,task-planner}.spec.ts`; `full affected unit/browser suites and physical phone acceptance`.
Scope: src/data/StudyUiRelease.tsx; src/features/practice/v7/PracticeV7.tsx; src/features/atlas/v7/{AtlasV7,AtlasMap}.tsx; src/features/settings/v7/SettingsV7.tsx; supabase/migrations/20261218002000_n195_study_review_targets.sql; docs/current/N195.md.
Not: Rewriting N191 evidence core; Moving the scheduler default into the wrong PR; Skipping tests because a shared dependency is absent.
Agent packet: [N195.md](docs/implementation/2026-11-20/tasks/N195.md). 

## N196 Ship new scheduler and learning algorithm with default New and Settings override

Owner task: "Ok add on new schedular and the algorithm is shipped with default on and optional switch and in settings and the lemma pad should be shipped as page with its custom keyboard. Then publish"
Stage: Build · Status: open · Needs: N191 · Assigned: chat-917364#0hiq
Existing PR: #1547 (https://github.com/Mymayankyadav/lemma/pull/1547)
Done = Finish PR #1547's owner-bound constrained agenda and four-state forecast/qualified practice routing. Implement a clear persistent Settings > Planning engine choice (New/Legacy). At the coordinated shipping release N198, NEW IS THE DEFAULT for existing and new owners, with no hidden opt-in; user can switch to Legacy and back. Both Today and authenticated MCP queue/resume honor the same choice, preserve already materialized rounds and fail safely to native when invalid.
Tests: `npx tsc -b; node scripts/ci/lint.mjs`; `node tests/mcp/sql/n196-agenda.mjs`; `tests/e2e/v7-{agenda-decision,scheduling-preference}.spec.ts`; `tests/unit/agenda/** and tests/unit/forecast/parity.test.ts`; `node scripts/atlas/qualify-agenda.mjs with retained reference suite`; `deployment-side read-only shadow, rollback and cross-client tests`.
Scope: src/data/adaptive/{agenda-api,demo-agenda}.ts; src/features/settings/v7/SettingsLists.tsx; supabase/functions/_shared/agenda/**; supabase/functions/_shared/practice/{router,questions}.ts; supabase/functions/mcp/{agenda,agenda-http}.ts; supabase/migrations/2026121800160*_n196_*.sql; docs/current/N196.md.
Not: Quietly defaulting all users to Legacy; Unobservable fallback or a hidden opt-in; Unqualified randomized practice exposure; Changing protected test thresholds or bypassing Owner approval.
Agent packet: [N196.md](docs/implementation/2026-11-20/tasks/N196.md). 

## N192 Ship dedicated Lemma Pad page, custom math keyboard and offline editor

Owner task: "Ok add on new schedular and the algorithm is shipped with default on and optional switch and in settings and the lemma pad should be shipped as page with its custom keyboard. Then publish"
Stage: Build · Status: open · Needs: N193 · Assigned: chat-84293#kzbq
Existing PR: #1535 (https://github.com/Mymayankyadav/lemma/pull/1535)
Done = Extend existing PR #1535 into a shipped, discoverable full-page Lemma Pad—not merely an embedded checkpoint panel or hidden offline shortcut. Add a first-class route, in-app entry and deep-link recovery; ship a usable custom mathematics keyboard while retaining native keyboard/IME and caret support. Preserve current revisioned offline text, KaTeX preview, ink, backup/export, owner isolation and explicit tutor selection.
Tests: `tests/e2e/pad-{local,live-offline}.spec.ts plus dedicated route/math-keyboard flows`; `tests/unit/pad/{local-pad-editor,pad-draft,pad-edit,pad-ink,pad-checkpoint,pad-import}.test.ts[x]`; `Android export unit tests and POCO M8 Power Android 16 physical acceptance`; `offline PWA cold start, keyboard IME, TalkBack and landscape reachability`.
Scope: src/features/pad/{OfflinePadPage,LocalPadWorkspace,LocalPadEditor,LocalPadInk,CheckpointPad,LocalPadDraftPanel}.tsx; new PadMathKeyboard component and CSS in src/features/pad; src/app/routes.tsx; src/app/v7/V7Shell.tsx; src/features/pad/padDraftStore.ts; src/data/tutor/local-excerpt.ts; docs/current/N192.md.
Not: Only offering Pad as a checkpoint subsection; Removing native keyboard or keyboard accessibility; A cloud-sync rewrite or insecure offline authorization; Unrequested automatic tutor submission.
Agent packet: [N192.md](docs/implementation/2026-11-20/tasks/N192.md). 

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
