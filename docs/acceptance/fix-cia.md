# FIX-CIa — independently auditable CI policy and NOTIF X SQL split

Parent: [FIX-CI #744](https://github.com/Mymayankyadav/lemma/pull/744); provenance issue [AUDIT #753](https://github.com/Mymayankyadav/lemma/issues/753).

This is a main-based, non-force split of the already owner-approved CI timing policy and the isolated notification-candidate SQL performance/rollover work. It does **not** contain New-project, Review-run, Atlas, Cards, Project or notification service-worker feature code.

## Acceptance
- [ ] Adopt the owner-approved single CI browser worker, 4× CPU unchanged, strict first-attempt transitions <2s and cold renders <4s; zero performance retries; no relaxation of layout/DOM/resource/functional/security checks.
- [ ] Preserve all unchanged 150ms NOTIF X single-query acceptance, 60/2400/30000 fixture, UTC/04:00 study-day boundaries, owner scope and service-role-only grants.
- [ ] Include the two forward-only SQL migrations in timestamp order: ranked K2 candidate reuse/index, then function-local 16MB sort memory; no global/session memory settings.
- [ ] Failure diagnostics are bounded non-executing EXPLAIN, never rerun the expensive 30k-card query or mask a first-attempt failure.
- [ ] `npm run check`, all four Playwright shards, `mcp-sql`, screenshot gate and independent different-slot exact-head Auditor CLEAR.
- [ ] After merge, the remaining parent #744 must reconcile duplicate paths without force and retain all other task-owned fixes. #750's later ordinary Review migration must not merge before these SQL migrations.

This split does not claim that work_mem alone caused any observed speedup: #750 independently measured X=94.9ms without it. Keep issue #679 open until merged-main repeatability.

Assisted-by: ChatGPT (OpenAI)
Co-authored-by: ChatGPT <noreply@openai.com>
