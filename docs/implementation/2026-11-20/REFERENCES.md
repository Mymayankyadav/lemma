# Agent-specific source map

Start with [AGENTS.md](https://github.com/Mymayankyadav/lemma/blob/main/AGENTS.md), [CURRENT.md](https://github.com/Mymayankyadav/lemma/blob/main/CURRENT.md), [NEXT.md](https://github.com/Mymayankyadav/lemma/blob/main/NEXT.md) and the selected packet. Use the **PR's branch docs** for branch-only implementation; `docs/current/N192.md`, `N193.md`, `N195.md`, `N196.md` do not all exist on main.

| Topic | Specific upstream evidence |
|---|---|
| N191 evidence/calendar/receipts | [PR #1533](https://github.com/Mymayankyadav/lemma/pull/1533); `supabase/migrations/20261120044716_n191_evidence_receipts.sql`, `20261120045749_n191_plan_release_capability.sql`, `tests/mcp/sql/parity.mjs`, `docs/current/N191.md` on PR |
| N192 Pad and keyboard | [PR #1535](https://github.com/Mymayankyadav/lemma/pull/1535); `src/features/pad/LocalPadEditor.tsx`, `OfflinePadPage.tsx`, `local-pad.css`, `tests/e2e/pad-live-offline.spec.ts`, `docs/current/N192.md`. **New requirement**: `/pad` full route and custom on-screen math keyboard |
| N193 tutor | [PR #1537](https://github.com/Mymayankyadav/lemma/pull/1537); `src/data/tutor/local-excerpt.ts`, `src/features/tutor/DemoCheckpointTutor.tsx`, `tests/e2e/v7-tutor-local-excerpt.spec.ts`, `docs/current/N193.md` |
| N195 live first study | [PR #1546](https://github.com/Mymayankyadav/lemma/pull/1546); `tests/mcp/sql/first-study.mjs`, `tests/e2e/v7-n195-live-first-study.spec.ts`, `docs/current/N195.md` |
| N196 New scheduling + algorithm | [PR #1547](https://github.com/Mymayankyadav/lemma/pull/1547); `src/features/settings/v7/SettingsLists.tsx`, `src/data/adaptive/agenda-api.ts`, `supabase/functions/_shared/agenda/**`, `scripts/atlas/qualify-agenda.mjs`, `docs/current/N196.md` |
| Main route and flag conventions | `src/app/routes.tsx` (canonical route inventory), `src/app/v7/V7Shell.tsx`, `src/flags.ts`; read release review rules in AGENTS.md |
| SQL permissions | `tests/mcp/sql/parity.mjs`, `docs/v6/capability-registry/**`, `supabase/migrations/**`; don't rewrite existing migrations or bypass reviewer requirements |
| Old backlog | `docs/implementation/2026-11-20/NEXT-before-reconciliation.md` and `docs/implementation/2026-11-20/LEGACY-DISPOSITION.md` (recorded status, not proof of merge) |
| Original research archive | Owner-supplied Drive archive discussed in prior handoff. The 118 MB research package was not copied into this public rules PR. Use previously authorized source access if a specific research threshold needs checking; independently reproduce deployed gates. |

**Conflict hot spots:** `src/data/usePlanRelease.ts`, `src/features/settings/v7/**`, `src/app/routes.tsx`, release flags, export registry and migration ordering. Agents should coordinate through existing PRs and N198 instead of creating competing broad edits.
