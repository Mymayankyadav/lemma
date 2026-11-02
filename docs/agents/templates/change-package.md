# <CHG-ID> revision <exact revision> — <outcome>

Status: DISCOVERED / ASSESSING / DECISION_REQUIRED / APPROVED_FOR_SPEC / SPEC_REVIEW / IMPLEMENTATION_READY / IMPLEMENTING / VERIFYING / COMPLETE / HELD / SUPERSEDED / REJECTED / WITHDRAWN.

## Source and authority manifest

Record immutable source URL/commit or SHA-256 of authorized snapshot, observed time, owner/origin attribution, requested outcome, access restrictions and deduplication key. Private source handoff names the authorized execution and exact request without impersonating an owner GitHub decision. Authority separately covers product direction, spec preparation, implementation, cleanup and live deployment. Full/partial/conditional approval binds exact requirements, exclusions, accepted alternatives and source/decision URLs. Source in a PR or merged filename alone is not approval.

## Scope and mapping

| Requirement ID / accepted revision | Source/decision | Existing route/behavior/spec | Task ID / owned paths | Dependencies / contract | Acceptance evidence / capable collector | Independent reviewer | Accepted/deferred/excluded |
| --- | --- | --- | --- | --- | --- | --- | --- |

Every requirement maps to approved plan.md task + meaningful acceptance, or explicit owner-approved deferment/exclusion. No fake live behavior. Canonical specs remain the behavior source; this matrix links them.

## UI assessment where relevant

Screen hierarchy/navigation/project-progress data, component reuse, tokens/themes, mobile/desktop/narrow widths, math/text overflow, loading/empty/error/offline/unauthorized/stale/long content, touch/focus/keyboard/motion/accessibility. Identify illustrative/decorative prototype elements and unavailable data. Map screenshot viewports/states and live interactive checks; name who can actually inspect them.

## Architecture/migration assessment where relevant

Actual boundaries and smallest sufficient alternatives; contracts/API/schema/auth/user isolation; offline/cache/conflict/version skew; old/new clients/partial rollout; resource/dependency policy and costs; migration sequence/parity/reconciliation; reversible vs irreversible actions; rollout/rollback/forward repair authority; temporary adapter/flag owner and retirement criteria. Architecture approval alone grants no live migration or credentials/deployment permission.

## Supersession and active work

| Existing requirement/task/PR + full head | Old → new revision | Unaffected / keep / amend / supersede / hold | Salvage/source lineage | Invalidated evidence | Current holder acknowledgement | Fresh review/next action |
| --- | --- | --- | --- | --- | --- | --- |

Check not-started, actively-authored, awaiting-review, cleared, merged-unverified, released and owner-held work. Preserve source/tests and canonical replacement before closing duplicates. New acceptance can invalidate unchanged code-head CLEAR. Unaffected work continues.

## Decisions, ordering and completion

List unresolved concrete alternatives with recommendation/consequence and affected tasks; request one scoped owner decision when needed. Show dependency/order and reviewer-capability/WIP feasibility. Completion includes required live acceptance, deployed verification, migration/temporary-path retirement and evidence, not only a merged PR. Withdrawn/conflicting/inaccessible sources hold dependent actions only; preserve records.
