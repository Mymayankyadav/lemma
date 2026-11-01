# Dynamic hourly agent dispatch

Owner-approved operations policy (OPS-1, 2 Nov 2026). **The five hourly scheduled tasks are capacity slots, not permanently assigned job titles.** Every slot first runs a short, read-only Steward-style triage, then serves the role that currently has useful work. This file overrides the old minute-specific role assignments and stopping times in `docs/agents/prompts.md`; the safety and acceptance rules in the role playbooks are unchanged. The 12-hour Planner is separate and is not reassigned by this policy.

## Slots, source of truth and timing

Existing hourly slots are **:00, :15, :30, :45, :50 IST**. Never change their frequency merely to reallocate work. Every run is independent. Use GitHub REST (`gh api`, no GraphQL) as the sole coordination channel; consult `plan.md` §0, `AGENTS.md`, `docs/agents/README.md`, this file, the relevant role playbook in `docs/agents/prompts.md`, the live **Task board #456**, **Agent log #455**, **Audit log #442**, open issues and PRs. Read live exact-head CI and comments whenever a decision depends on them; board snapshots can be stale.

Each run may spend a few minutes on **dispatcher triage** (not a full board rewrite). Once a role is claimed, perform its full work, not just diagnosis. Leave enough time for pushes, PR descriptions, verification and log updates. Stop starting new work **40 minutes after the slot begins** and finish/handoff by **50 minutes after slot start**, including across midnight. This timing replaces the legacy fixed-role minute cutoffs. Never wait idly for another role: if your queue clears, re-evaluate and claim another eligible task/role in the same run.

## Dynamic selection (on *every* execution)

1. **Observe and count actionable independent work, not just PR totals:**
   - **Steward queue:** complete, independently audited, exact-head green, lease-eligible and mergeable PRs; main/board status or dependency triage overdue by 60 minutes. Re-check the full merge gate at merge time, not at dispatch.
   - **Auditor queue:** Ready PRs awaiting independent exact-head audit, unaudited merges, audit fixes awaiting verification. Blocked/owner-held PRs are not audit-cleared by assumption.
   - **Fixer queue:** failing main/Pages/Supabase/MCP checks, red PRs with lease available, reproducible `FIX`/`audit` defects.
   - **Builder queue:** runnable plan tasks with dependencies merged, unclaimed work, expired/stalled PRs, and critical-path tasks that can be independently progressed. Exclude `awaiting owner` and actively leased/blocked tasks.
2. **Read the latest `DISPATCH CLAIM` comments on Agent log #455** and active PR leases. Treat only unexpired claims as occupied. Claims specify a concrete role and task/PR scope, so there can be several Builders or Fixers, and multiple Stewards/Auditors only for *disjoint* scopes. Do not seize a task under a valid lease. **Comments are not atomic locks:** two simultaneous readers can both think a scope is free; re-read claims immediately after posting and before the first write. If another unexpired claim covers the same scope, the earliest comment ID wins, and the later claimant must hand off/re-dispatch. If a PR lease is held by a different valid holder, the PR lease wins even over the earliest dispatch comment.
3. **Choose the most valuable currently unoccupied queue, dynamically:**
   - Failing **main/release** gets urgent Fixer coverage; more than one Fixer is useful only for disjoint failures.
   - Pending **independent audit** gets Auditor coverage before creating additional unmergeable Ready PRs; use additional Auditors for an actual backlog of separate PRs.
   - Eligible **merge/release** backlog gets Steward coverage; one Steward is enough for a short queue, multiple only for genuinely independent, merge-ready PRs. Only one Steward writes the Task board at a time.
   - Red **PRs** and audit fixes get Fixers as needed.
   - Assign **all remaining useful capacity to Builders**, favoring independent critical-path tasks and parallel work. Builder-2 is a Builder specialization, not a protected permanent slot.
   - When no coding/fixing/merging/auditing is immediately possible, become Steward to resolve stale dependencies and refresh the board, or Auditor to check untouched accepted work. Report a genuine blocker rather than inventing progress.
   This is a priority guideline, not a fixed quota: factor urgency, blocker fan-out, availability of independent tasks and currently active claims. **Do not reserve a Builder, Fixer, Auditor or Steward every hour if its queue is empty.** In particular, three or more slots may become Builders when coding dominates.
4. **Claim before doing role work.** Post an issue *comment* (append-only; do not race to overwrite the log body) to Agent log #455:
   `DISPATCH CLAIM · slot=:30 · at=2026-11-02T00:30+05:30 · role=Builder · scope=TASK-ID/#PR · until=2026-11-02T01:20+05:30 · reason=independent runnable work`.
   Use your actual slot, role, scope and timestamps. **Immediately read back the claims and resolve any collision by earliest GitHub comment ID before editing or merging.** When a role is reassigned mid-run, post a new claim and record a handoff/release of the previous scope. For code edits also claim or take over the individual PR using its existing `Owner: <role> · Lease until <HH:MM IST>` convention and takeover comment. Dispatch claims **do not** override valid PR leases. Before changing a shared issue body, re-fetch it and avoid overwriting concurrent updates. Shared Task board writer must make an exclusive `scope=taskboard` claim and confirm no earlier active conflicting claim.
5. Work using the **full corresponding role playbook** in `docs/agents/prompts.md`: Steward, Fixer, Builder (including critical path), or Auditor. End with a GitHub-visible handoff listing role, slot, PRs, commits, checks, unresolved blockers and next action.

## Non-negotiable separation and gates

- **Independent audit is mandatory.** An Auditor run is read-only on app code, never pushes/merges, and must not clear work it authored or merged in a prior run. The audit claimant must use a *different slot* from the slot that authored or merged the PR, verify provenance using PR/Agent-log records, and state the independently reviewed exact head in its `AUDIT CLEAR` comment. If provenance cannot establish independence, do not issue CLEAR; route to a different slot. Switching the same slot's role to Auditor is **not** independent verification of its own previous changes. Existing exact-head Auditor CLEAR/block, owner-approval, and independent-audit checklist requirements still apply.
- **Steward never shortcuts merging.** Execute `scripts/merge-gate.ts` or its identical fail-closed decision on *fresh* PR metadata, exact-head seven required successful jobs, statuses, independent Auditor verdict, approval, lease, and mergeability; log the verdict. Never merge on stale, empty or pending checks, never merge a draft or owner-held PR. Squash-merge exact SHA through REST only after the gate passes.
- Preserve one-task-per-PR boundaries, path ownership, owner decisions, tests, secrets rules, and no direct/force pushes to main. A role switch does not grant extra permission.
- If GitHub cannot be read or a dispatch claim cannot be posted, **do not assume** a lease, perform concurrent writes, clear an audit, or merge. Report the access problem; safe read-only planning is allowed.

## Example workload allocations (illustrative, not quotas)

- 8 runnable tasks, no red CI, no audit or merges due → **5 Builders**.
- Main CI red, 3 independent red PRs, 1 merge-ready PR → **1 Steward + up to 4 Fixers** if they have disjoint scopes.
- 6 Ready PRs needing independent audit, 2 runnable tasks → **3 Auditors + 2 Builders**; after CLEAR, later slots turn into Stewards.
- Nothing runnable until dependencies merge → **Steward/Auditor/Fixer as needed**, not an idle Builder.

The schedule is a clock; **GitHub backlog determines the role**.
