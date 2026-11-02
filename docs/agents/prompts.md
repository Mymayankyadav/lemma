# Agent startup and release quick reference

Use the canonical [startup](README.md), [v3](v3.md), [Owner directives/delegation](owner-role.md), [registry](registry.md) and [role playbooks](playbooks-v3.md). The old duplicated scheduled-role prompts are retired. No count, scheduler, cadence or runtime is assumed. A seeding agent follows the Owner's actual v3-scoped delegation; ordinary workers receive no automatic override.

## 1. Steward / release reference

For ordinary autonomous merges use the **fresh REST PR body**, full current head, accepted revision, current holds/claims, complete checks/statuses and **chronologically ordered Auditor comments**. Invoke `evaluateMergeGate` from `scripts/merge-gate.ts`, then the release supplement. **log the gate result** with actual input/evidence: `ok=false` refuses on the autonomous route. An explicit Owner instruction may instead authorize the scoped OWNER_OVERRIDE route; retain the rejection and unmet facts, never invent CLEAR or green checks.

**Nonempty exact-head CI set, fail closed:** require `check`, `mcp-sql`, `e2e-1-of-4`, `e2e-2-of-4`, `e2e-3-of-4`, `e2e-4-of-4`, `qa3-screens` plus applicable task/attempt evidence. Ordinary autonomous merges refuse zero check runs, missing/unfinished/non-successful required evidence, stale-head/revision clearance, missing independent provenance, or unresolved AUDIT BLOCK without applicable later AUDIT CLEAR. Owner acceptance can override the merge-blocking effect in its actual scope without rewriting a failed test or an audit finding as passed.

Squash exact SHA after fresh mergeability/authority readback; reconcile unknown remote results before retries. Record actual merge SHA, pending verification, eligible verifier and failure action. PR verdicts and linked fix records are canonical audit evidence; no duplicate role/audit log is required.

## 2. Fixer and other roles

Use [playbooks-v3.md](playbooks-v3.md) for Fixer, Builder, Planner, UI/architecture specialists, independent Auditor and verification responsibilities. Those playbooks preserve actual capability, owner-scope, contribution-lineage and one-writer requirements. Do not execute archived foundation/reset instructions or resurrect fixed-role schedules.
