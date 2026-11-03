# Agent startup

Read `AGENTS.md`, [Owner authority](owner-role.md), [v3](v3.md), [registry](registry.md), current scoped owner directives and `plan.md` §0. Follow owner-amended v3 within actual authorization. The seeding exception in owner-role.md is not a claim that other agents or schedules are active.

## Current records

- Agent Registry #770: actual enrolled sources/capabilities; no presumed count or scheduler.
- Agent Log #455: one append-only source for RUN/claim/control/owner handoffs. Do not maintain duplicate role logs.
- Dispatch State #764: current registry-bound advisory assignments.
- Plan Intake #763: owner plans and approved-source/change references.
- Task Board #456: optional projection of canonical `plan.md`, never separate authority.
- Current audit verdicts belong on the affected PR; substantive findings belong in their linked fix issue/PR. Audit Log #442, Planner Log #585 and archive #691 are historical, retired indexes; no new writes or mandatory full-history startup scan.

[Playbooks](playbooks-v3.md) define roles; [release](release.md) distinguishes ordinary autonomous gates from scoped owner exceptions; [transition](transition.md) separates repository preparation from factual runtime activation. [Setup](setup-prompt.md) applies only to actual authorized target sources. Evidence/source recovery links and current dispositions are in [OPS3 record](../changes/OPS3/README.md).

Practical timing and future-ticket admission: [runtime-admission.md](runtime-admission.md) preserves verified-source limits and adds explicit voluntary work budgets plus one-time run-start binding. Missing scheduler maxima or future invocation IDs alone must not cause repeated idle diagnostics once that policy is accepted.

## Required behavior

After each completed or blocked task, checkpoint and follow [Continue within a run](dispatch.md#continue-within-a-run). Keep taking eligible work until a concrete stopping condition applies; a handoff or one useful result alone does not end a run.

No fixed participant count, clock slot, scheduler or universal runtime. Use real agent/run/invocation identity, scoped one-writer claims and actual capabilities. Refresh attributable Owner instructions before consequential actions; acknowledge observed directives in the same healthy run and act or name the next capable execution. Never open draft PRs in REST-only workflows. No force/direct-main push, secrets exposure, invented CI/CLEAR or fake runtime evidence.

Ordinary autonomous releases require **nonempty** exact-head CI and applicable independent acceptance via `scripts/merge-gate.ts` plus the release supplement. Verified scoped owner instructions supersede conflicting repository SOP through addenda A/B; record the actual waiver/result without pretending normal gates passed. Closing a finding as owner-accepted/deferred is not claiming a technical fix.

## Owner product decisions

Accepted specs are authoritative: `docs/spec/v4-look.md` overrides v3 where different, then `docs/spec/v3.md`, stress constraints and older specs where silent. Preserve Graph day/night, math rendering, project-progress content, the Route/Atlas behavior and actual product data/contract requirements. Historical canvas/setup directions are not current reset, theme or branch-purge authority. Product decisions are in specs and attributable owner records, not duplicated legacy handoff lists.

