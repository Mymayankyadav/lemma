# Lemma web release checklist (RELEASE-01)

This is a **gate**, not an announcement that a release has passed. The 28 October 2026 ship scope is **web first**; Android and its hardware/notifications gates are paused. The intended tag is `v1.0.0` on a verified `main` commit, **never** on an unmerged PR or a red deployment. The canonical requirements are [plan.md](../plan.md), [ship plan](SHIP_PLAN.md), and [Lane F handoff](lanes/F.md).

## Operator checklist — fail closed

- [ ] Feature freeze: only tested fixes and gate evidence after **21:00 IST (15:30 UTC)**; ship cut **22:00 IST (16:30 UTC)**. Record actual UTC timestamps and commit SHAs.
- [ ] No active unmerged feature PR is being mistaken for deployed behavior. Record which Study/tutor features are **hidden until ready** and which tests use mocks.
- [ ] A confirms Lemma-only production migration history and source-version parity, including all merged knowledge/plan/tutor migrations, and security advisors. Never modify Carrel. If any required migration is absent, **hold** release.
- [ ] At the chosen exact `main` SHA, regression and local Supabase/security workflows succeed. Android workflow is only a lane/syntax guard for this web cut, **not** APK/device acceptance.
- [ ] At the same `main` SHA, Pages deploy finishes successfully. The downstream release smoke run opens the **deployed** https://mymayankyadav.github.io/lemma/ and passes anonymous create/review/reload, Today/Cards/Settings navigation, sign-in entry, no console/same-origin failures and negative-URL rejection. Record both workflow URLs. A PR smoke alone is insufficient.
- [ ] Release PWA test passes with the service worker **enabled**: offline shell reload, cache version replacement and retention of IndexedDB cards. This does not prove cloud sync or Android offline.
- [ ] Back up/restore validation: durable card/profile round trip, exact card scheduling and review histories, prerequisites, duplicate import and newer-review preservation. Separately document whether account-scoped context revisions, sources, approved plans and append-only learning events have an export/import path and validated round trip. **Current legacy `IO.exportJSON()` exports only `profile` and `notes`; do not call this full workspace recovery.**
- [ ] Confirm cross-owner read denial/security parity, approved-revision tutor packet integrity, both tutor handoff directions and stale-write rejection **when those features are marked ready**. For hidden features, explicitly state the missing gate; never imply success from mocked transport.
- [ ] Check user-visible account erasure. If unimplemented, state the limitation prominently in the notes. Never mark erasure complete merely because sign-out or local clear is present.
- [ ] Verify production site and deployment against the chosen tag commit, then create the version tag/release **only after** the above gates pass. Record tag SHA, linked runs, and rollback reference.

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
| PWA offline + update | — | R1 PR #90 merged; recheck exact ship SHA |
| Backup/restore | — | R2 PR #96 in progress; full workspace coverage pending |
| Production migration parity | — | A must verify |
| Ready state for Study / Tutor | — | D/E must verify |
| Release tag | — | **Not created** |
