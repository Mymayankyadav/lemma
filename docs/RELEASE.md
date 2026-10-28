# Lemma web release checklist (RELEASE-01)

This is a **gate**, not an announcement that a release has passed. The 28 October 2026 ship scope is **web first**; Android and its hardware/notifications gates are paused. The intended tag is `v1.0.0` on a verified `main` commit, **never** on an unmerged PR or a red deployment. The canonical requirements are [plan.md](../plan.md), [ship plan](SHIP_PLAN.md), and [Lane F handoff](lanes/F.md).

## Operator checklist — fail closed

- [ ] Feature freeze: only tested fixes and gate evidence after **21:00 IST (15:30 UTC)**; ship cut **22:00 IST (16:30 UTC)**. Record actual UTC timestamps and commit SHAs.
- [ ] No active unmerged feature PR is being mistaken for deployed behavior. Record which Study/tutor features are **hidden until ready** and which tests use mocks. Release Pages smoke must verify that Study navigation matches the deployed `StudyView.ready` flag, a direct `#study` reload falls back to Today while false, and unready tutor action controls are not exposed.
- [ ] A confirms Lemma-only production migration history and source-version parity, including all merged knowledge/plan/tutor migrations, and security advisors. Never modify Carrel. If any required migration is absent, **hold** release.
- [ ] At the chosen exact `main` SHA, regression and local Supabase/security workflows succeed. Android workflow is only a lane/syntax guard for this web cut, **not** APK/device acceptance.
- [ ] At the same `main` SHA, Pages deploy finishes successfully. The downstream release smoke run opens the **deployed** https://mymayankyadav.github.io/lemma/ and passes anonymous create/review/reload, Today/Cards/Settings navigation, sign-in entry, no console/same-origin failures and negative-URL rejection. Record both workflow URLs. A PR smoke alone is insufficient.
- [ ] Release PWA test passes with the service worker **enabled**: offline shell reload, cache version replacement and retention of IndexedDB cards. This does not prove cloud sync or Android offline.
- [ ] Back up/restore validation: durable card/profile round trip, exact card scheduling and review histories, prerequisites, duplicate import and newer-review preservation. Separately document whether account-scoped context revisions, sources, approved plans and append-only learning events have an export/import path and validated round trip. **Current legacy `IO.exportJSON()` exports only `profile` and `notes`; do not call this full workspace recovery.**
- [ ] Confirm cross-owner read denial/security parity, approved-revision tutor packet integrity, both tutor handoff directions and stale-write rejection **when those features are marked ready**. For hidden features, explicitly state the missing gate; never imply success from mocked transport.
- [ ] Check user-visible account erasure. If unimplemented, state the limitation prominently in the notes. Never mark erasure complete merely because sign-out or local clear is present.
- [ ] Verify the intended release tag equals **current `main` HEAD** (not just an ancestor), the latest exact-SHA regression/local Supabase/Pages workflows are successful, and the latest downstream live Pages smoke started **after** the final Pages deployment completed. Recheck main HEAD immediately before publishing. Then create the release **only after** all other gates pass. Record tag SHA, linked runs, and rollback reference.

If any mandatory gate fails, **do not tag**. Leave unaccepted Study/tutor entry points hidden and continue fixes in later PRs. A missing production migration or unrecoverable data safety defect blocks even the reduced web cut.

## Release notes draft — not yet shipped

### Included (after verified merge + deployed smoke)
- Existing Lemma flashcard/notebook experience with FSRS scheduling and local durable storage; web account synchronization per its separately documented gates.
- Automated deployed Pages anonymous smoke and service-worker offline/update regression coverage.
- Private knowledge editor/read features **only when production migrations and release gates are verified**.

### Not yet accepted / deferred
- Android APK, device authentication, physical-device sync and notification checks: **paused**, not part of this web release.
- Study tab, approved plans and cross-model tutor handoff: **hidden unless each owning lane sets its `ready` flag after its acceptance gate**.
- Complete account-scoped backup/restore (knowledge sources, plan revisions and events): legacy card JSON export is not sufficient; verify expanded capability separately.
- Account erasure: expected post-release follow-up; disclose if still absent.
- Two-device production smoke: no claim without actual evidence.

## Recovery and rollback

Preserve the previous successful Pages deploy SHA and prior tested `main` SHA. Roll back the static web deploy to a known-good build through the normal Pages workflow rather than force-pushing or rewriting history. PWA caches update on subsequent loads; this does **not** roll back user data or Supabase migrations. All database changes require A's forward-only, exact-version production protocol and a separately tested recovery plan. Keep full exports and test artifacts private, never attach personal study content to a public issue or release.

## Evidence record (fill at ship cut)

| Gate | Exact SHA / run | Result / remaining blocker |
| --- | --- | --- |
| Main regression | — | Not yet recorded |
| Local Supabase + isolation | — | Not yet recorded |
| Pages deployment | — | Not yet recorded |
| Live Pages smoke | — | Not yet recorded |
| PWA offline + update | [R1 PR #90](https://github.com/Mymayankyadav/lemma/pull/90) | R1 passed; recheck exact ship SHA |
| Backup/restore | [R2 regression 40674426637](https://github.com/Mymayankyadav/lemma/actions/runs/40674426637) | Legacy card/profile round trip PASS, [PR #96](https://github.com/Mymayankyadav/lemma/pull/96) merged; account knowledge/plans/events still unverified |
| Production migration parity | — | A must verify |
| Ready state for Study / Tutor | — | D/E must verify |
| Release tag | — | **Not created** |

## 28 October 2026 read-only production preflight (not an apply)

The connected Supabase **Lemma** project `yemqnhnztlbyxmjxidis` reported PostgreSQL **17.11**, **nine** applied migration versions, and **zero** granted/waiting AccessExclusive locks at inspection. GitHub `main` contained **thirteen** sorted migration SQL files. The four committed-but-unapplied versions were:

- `20261028031800_knowledge_context_cas.sql`
- `20261028043000_knowledge_source_revisions.sql`
- `20261028051500_structured_context_v1.sql`
- `20261028094500_plan01_append_only_events.sql`

A read-only `pg_proc` audit found only one matching function among `get_accepted_study_context`, `commit_structured_study_context`, `get_knowledge_excerpts`, and `publish_study_plan`. It does not establish which callable signature is available; in particular `get_accepted_study_context(uuid)` was not present. Supabase security advisors returned one Auth configuration warning: leaked-password protection disabled ([remediation](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)); no advisor errors were reported. This was **metadata only**, not an authenticated production feature test, a Supabase deployment, or a claim that release is safe.

**Blocker:** the version-preserving operator `.github/workflows/deploy-knowledge.yml` is dispatched through the GitHub Actions UI with an explicit `preflight` followed by `apply`. Its existing staged set ends at the first twelve versions; after those are deployed, the merged `plan01` migration must also be applied by a reviewed exact-version, forward-only Lane A operation. The tag release workflow now rejects missing production versions automatically. Do **not** use connector migration actions that generate new version timestamps, manually edit migration history, or touch Carrel. Reinspect remote versions/locks/current SHA immediately before any production write.

## Full account recovery — executable acceptance contract (R2b)

`test/release_workspace_archive.js` now defines the **data inventory and validation contract** for a future account-scoped transactional archive. It must retain all 18 public data tables from the merged SQL migrations, including: user-scoped notes/profiles and mutation receipts; immutable review events and retractions; accepted study context and historical revisions; text sources, sections, immutable source/section revisions; approved plans, plan versions and checkpoints; sessions, append-only learning evidence, tutor handoffs and card links. Valid archives must contain **every** required table (including empty tables), every row must belong to the same owner, each table's composite primary keys must be unique, and referenced records—including the exact pinned source revision—must be present.

The archive includes exact migration versions, per-table record counts and SHA-256 digests, plus an aggregate digest. A missing history item, mismatched owner, duplicate event, tampered payload, unsupported schema or dangling foreign key fails closed. SHA-256 detects accidental file corruption; it is **not** a signature, encryption or proof that the producer used one database transaction.

**Not implemented or accepted:** the authenticated server-side consistent snapshot exporter; an actual, non-destructive, empty-destination restore transaction; proof of owner-only SQL access and restart-safe receipts; device-local unsynced drafts and outbox recovery; a user-invoked export/download and consent-based restore flow. A may implement these in its owned backend/client files, D in plan data interfaces, and F will run real disposable-stack roundtrip and account isolation acceptance. No release can claim full recovery based on the synthetic validator. Protect exported files as sensitive private study data; do not put them in CI artifacts or public issues.

## Anonymous feature-readiness browser acceptance (R5)

`test/release_live_smoke.js` checks *visible* controls on the actual public Pages site, not only the source flag. If Study is unready, it must have no Study nav and a full reload with `#study` must display Today, never the checkpoint screen. If Study readiness becomes true, navigation must be present; if Tutor handoff is still unready, visible tutor launch buttons and sheets must remain absent. The browser stays anonymous, uses an ephemeral profile and never tests authenticated account data. This does **not** prove that D/E's approval/security gates are complete; the release operator must inspect their individual acceptance evidence before marking those features ready.

## Exact deployed-SHA release attestation (R6)

`test/release_tag_guard.js` includes negative controls for an ancestor-only tag, failed/latest-red/missing jobs, wrong branch or event, and a smoke run that predates a newer deployment. The tag-triggered workflow now checks **latest successful exact-SHA** regression, local Supabase, main Pages deploy and its downstream workflow-run smoke, in addition to the existing live PWA/anonymous smoke and production migration parity checks. It compares the tag SHA to the current main HEAD before and after potentially long preflight checks. This is a machine release integrity check, **not** substitute evidence for unimplemented user-workspace recovery, ownership checks or explicit D/E readiness.
