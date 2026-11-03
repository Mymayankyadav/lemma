# Dynamic dispatch — actual enrolled capacity

Follow [registry](registry.md), [v3](v3.md), [Owner directives](owner-role.md) and [Owner integration](owner-override.md) first. No fixed count, scheduler, minute slots, runtime or permanently reserved roles are assumed. This contract supersedes legacy roster/cutoff examples, retaining unamended safety and exact acceptance rules. No scheduling configuration changes follow from this document.

## Startup and mode

Read AGENTS, plan.md §0, registry/control/holds and assigned source/task evidence. GitHub REST coordination: Registry #770, Agent Log #455, Task Board #456, Intake #763 and Dispatch State #764. Complete required pages; a failed read is unknown, never an absent claimant or passing check. Establish actual enrolled agent identity, unique invocation, immutable run, the source or accepted work-policy timing route in [practical admission](runtime-admission.md), and capability.

Legacy/shadow uses compatible retained role responsibilities plus owner amendments and actual registry membership; shadow packets grant no write authority. Cutover/rollback stops new affected claims and checkpoints as authorized. Active mode consumes validated registry/control-bound exact-agent/invocation tickets, including winning one-time run-start bindings for future tickets. Unknown adopted authority contains affected scopes, not an invented mode or global census.

## Lead and worker paths

A claimed Lead appointment, available to any capable unconflicted enrolled execution, reconciles global refs/intake/queues once per agreed epoch. It is not tied to a named clock minute. Read actual heads, holds, live claims, dependencies, accepted revisions, review capability and resource capacity. Deduplicate source changes, preserve occupied claims and publish zero or more precise tickets bound to registry revision/digest. Zero tickets must name the actual idle/blocker reason. Shared body writers need their own claims and before/after readback; no competing dispatcher overwrites a live writer.

Workers normally read their assigned task/requirements/PR/handoff/playbook, refresh scope-specific facts, establish actual claim ownership and work. If no valid ticket exists, use bounded eligible fallback: compatible appointment, named resolver, canonical next-up, limited scope triage. No broad repeated global triage by every worker. Unenrolled/incompatible participants first reconcile identity/authority and cannot infer a write ticket from their name or account.

Owner instructions get the urgent acknowledgement/action path in addendum B. Then prioritize real security/data-loss/main incidents, shared blockers, eligible release/verification, independent review, owner-prioritized intake/defects, runnable implementation and optional hygiene. Increase fix/review/build capacity according to actual queues and disjoint scopes, retaining reviewer availability. Do not reserve idle roles or consume the last eligible reviewer as another author. Capacity beyond CI/backend/integration throughput requires measured contention control, not weakened checks.

## Continue within a run

Completing or blocking one task triggers another work-selection step, not an automatic final response.

**Definitions used in this section.** A *useful action* produces a durable result for an approved task, review, verification, release or Owner direction: a commit, an evidenced review/audit verdict, a reproduction, a precise proposed patch, or a claim/admission that unblocks such work. Re-reading unchanged state, restating status, or posting acknowledgements without new evidence is not a useful action. The *no-new-work boundary* is `finish_by - handoff_minutes` from [practical admission](runtime-admission.md#work-budget-v1). *Authorized bounded fallbacks* are the fallback order in [v3](v3.md#dispatch) plus any fallback named in the current queue entry or packet; nothing else. Optimize verified useful progress, not elapsed time, task count or coordination posts. This rule applies in every mode within its actual authority; it does not activate v3 or grant new product/production permissions.

1. **Keep a ready queue.** The claimed Lead maintains a compact ordered queue in #764 and packet handoffs: primary work plus useful named fallbacks where available. Each entry links its approved task/revision, next useful step, required role/capability, paths, dependencies/holds and independent reviewer path. A queue entry is not a lease or a substitute for admission. Do not reserve idle scopes or make every worker reconstruct global state.
2. **Work and checkpoint.** Refresh actual Owner directions, requirements, head and overlapping ownership for the selected scope, then claim and perform a useful bounded slice. Check the tools actually exposed to this execution. Where a bounded operation is already authorized and owned, its first safe task operation can establish capability; “not yet demonstrated” alone is not proof that a tool is unavailable. Record an actual missing tool, denied operation or other concrete limit. A large task can continue through durable incremental checkpoints; it need not fit wholly in one run. On completion or blockage, record exact source/evidence, unmet verification, named resolver and next action. Release or explicitly hand off the old writable scope before claiming another writable PR; an unfinished independent-review/CI step remains pending.
3. **Select again.** Before the no-new-work boundary, take the next eligible priority item or authorized fallback. Preserve one substantive writable PR at a time, actual capabilities and reviewer availability. Role changes keep the same run/invocation, contribution lineage and deadline. An audit execution stays read-only throughout but can review multiple independent PRs. Lead/activation accountability persists until completed or accepted handoff.
4. **Avoid idle waits.** Pending CI, a merge/review dependency, missing live-write permission or a tool failure blocks the affected action, not all useful work. Take another eligible task, relevant source/dependency analysis, review or verification. Retry only with new evidence or a changed approach. Refresh task-local changed facts instead of repeating unchanged startup acknowledgements or full-history discovery; required ownership/authority reads must still be complete.
5. **Preserve admission.** In ACTIVE, each next scope needs current same-agent/invocation authority through a valid assignment or its explicitly authorized bounded fallback and its own claim. Obtain a fresh ticket when required; never reuse a consumed future BIND, broaden a ticket's task/paths or infer authority from the queue. Request the claimed Lead's next admission or recover an eligible vacant Lead under its own claim; meanwhile use an already authorized read-only fallback. Legacy/shadow uses retained authority and applicable scoped Owner recovery. An unavailable next admission is a concrete coordination gap with a named resolver.
6. **Apply the stop decision.** Use the single [Stop decision](#stop-decision) below before finalizing. Completion, blockage and handoff all return to work selection unless that decision permits ending the execution.

## Role eligibility

An appointment sets initial priority, not exclusive territory. Builder/Fixer/Verifier labels alone neither reserve work nor exclude another capable execution. A Builder may repair an approved defect under a new claim when its existing authority and capabilities permit that repair. An existing branch, past contribution or another agent's appointment is not a live ownership lock. Use actual current claims, holds and contribution lineage.

This is not permission to broaden an ACTIVE ticket, self-assert specialist capability, become an independent reviewer of contributed source, or change a read-only audit execution into a writer. Where another appointment or admission is actually required, acquiring or requesting it is useful work; record the exact missing authority and resolver if unavailable. The audit execution may continue source review or review another independent PR without issuing a final CLEAR. A blocked final verdict, merge, deployment or production mutation does not by itself block analysis, a permitted source patch, a precise proposed patch or other authorized work.

## Stop decision

This section is the authoritative repository rule for voluntarily ending an execution, in every mode. Other role playbooks, templates, startup prompts and historical instructions must refer here rather than define a different completion or stopping test. Specific Owner directions, actual permissions/admission, ownership, independence and safety constraints still govern their affected actions; this rule grants none of those permissions.

Before finalizing, ask: **Does any known, authorized, useful next action fit safely before the recorded no-new-work boundary?** If yes, continue. Check the finite known ready queue and authorized bounded fallbacks, including other compatible roles and intermediate actions on blocked tasks. Do not search the entire repository indefinitely. Do not restrict the candidates to the initial role, final verdicts or already-owned scopes. Acquire routine eligible claims under [Acquire the claim yourself](#acquire-the-claim-yourself); preserve complete relevant authority/ownership reads.

Use exactly one primary `stop_reason` from this table and record any secondary blockers. If several apply, the primary is the first that applies in this order: `owner_stop`, `platform_limit`, `deadline`, `access_blocked`, `no_eligible_work`.

| Reason | Required evidence |
| --- | --- |
| `owner_stop` | Link the attributable Owner direction ending this execution or its entire authorized scope. A hold on one PR/action only excludes that scope/action from work selection. |
| `deadline` | Record observed time, unchanged `finish_by`, handoff reserve and no-new-work boundary; show the boundary is reached or why no safe useful next step fits. Checkpoint/release within the reserve. Completing a task cannot shorten or reset the budget. |
| `platform_limit` | Identify an observed provider/tool limit or failure that actually prevents continuation of remaining useful actions. Duration guesses, a voluntary budget and one unavailable operation are insufficient. If interrupted before a final record is possible, the durable checkpoint remains evidence of partial work. |
| `access_blocked` | For the remaining known useful actions, cite concrete denied/missing access, unresolved required reads, live conflicting claims/holds or unavailable admission, with source/attempt and resolver. Check permitted analysis, patch preparation, review and other fallbacks before concluding all are blocked. |
| `no_eligible_work` | Name the bounded queue/fallback candidates checked and show each is completed, has no useful remaining action, or is concretely ineligible under current authority/capability/ownership/independence. Initial role labels, existing branches, pending CI, an unattempted routine claim or a missing final verdict are insufficient by themselves. |

Record the finish as one line in Agent Log #455, linking the HANDOFF record (templates/records.md):

`STOP run_id=<run> agent_id=<actual> at=<RFC3339> finish_by=<RFC3339> stop_reason=<one value above> evidence=<URLs> candidates_checked=<task/PR IDs with one-line action-level blocker each> released=<claim IDs or none> pending=<unverified items or none> next=<resolver + one action>`

The final handoff records completed work and exact head/revision/evidence, pending verification, released or handed-off claims, observed time/budget, primary reason, candidates with action-level blockers and the next resolver/action. Link evidence already recorded rather than duplicate a history. Do not claim the whole repository has no work when only a bounded queue was checked.

A stopping explanation that omits a known eligible useful action or relies only on an insufficient reason above is invalid. The Lead records that continuation gap and carries/reassigns the unfinished action; it must not count the task as completed delivery. These are cooperative decision/reporting rules, not a mechanism guaranteeing provider runtime or preventing process termination. No minimum duration, task quota, repeated empty scans or invented busywork is required.

### Decision examples

| Observed situation | Required next decision |
| --- | --- |
| Assigned approved task has no claim and no identified barrier | Acquire/read back your eligible claim, then work; do not hand it to an unnamed writer. |
| Next approved repair is labelled Fixer; current execution is a capable Builder | Check actual authority/admission, holds and claims; take it if eligible. The label alone is no blocker. |
| CI is pending or merge/review is held | Check useful source/test analysis, another independent task or another permitted fallback. Preserve the blocked release gate. |
| Auditor cannot yet issue CLEAR | Continue relevant source review/evidence or another independent audit if useful; remain read-only. |
| Recorded boundary is reached, or bounded candidates have no eligible useful action | Checkpoint/release and finish with the corresponding evidenced reason. |


## Ownership and deadlines

### Acquire the claim yourself

For an assigned runnable task, acquiring ownership is part of the worker's job:

1. Check actual task/admission authority, current head, Owner holds and all potentially live overlapping claims/releases. An appointment is permission to seek a claim, not an existing lock.
2. If a valid conflicting holder or hold exists, link its actual source and scope, seek checkpoint/handoff where authorized, and take another eligible action. Do not infer a live holder from a role label or another agent's appointment.
3. Otherwise append your own dated CLAIM with the current run, scope/paths, task revision, head and deadline; immediately read back relevant claims/releases and arbitrate with the accepted claim rules. Do not wait for a different “eligible writer” to perform a claim you are authorized and capable of acquiring.
4. Proceed only after winning and verifying ownership, refreshing authority/head before consequential actions. Claim acquisition does not prove source-write capability, reviewer independence or merge permission; check actual exposed tools and use safe authorized operations to establish those capabilities.
5. If acquisition cannot proceed, record the exact conflicting claim/hold URL, missing/denied claim tool, failed coordination read or missing admission authority with its named resolver. No claim exists yet is not itself evidence of a blocker. Preserve incomplete reads as unknown; do not push through them.

Claim acquisition outcomes feed the [Stop decision](#stop-decision); they do not create a separate stopping test.

Read all potentially live overlapping claims/releases/PR lease/holds across execution sources. Record run/agent, scope/paths/revision/head and dated start/expiry no later than actual run finish. Existing valid PR holder wins; otherwise earliest eligible claim-comment ID wins after immediate readback. RELEASE names the exact claim/run, never a display label. Revalidate before each consequential mutation. Unknown ownership means no push/CLEAR/merge; comments are not atomic locks and expiry is not process-death proof.

Time boundaries and handoff reserve come from verified source constraints OR an accepted voluntary work policy under runtime-admission.md. An unknown provider maximum is not by itself a write ban; work-policy limits are not scheduler guarantees. Do not extend late invocation deadlines or reserve an idle future lease. An admitted claim may continue after packet expiry only within its own deadline, current membership/holds/revision and ownership. New invocation must match its own ticket. Registry changes do not automatically cancel admitted work; withdrawals/conflicts need scoped checkpoint/reconciliation.

## Review, release and handoff

Independent audit follows actual agent/run/contributor/copy/merger lineage across every source; it is not a scheduler-slot whitelist. Audit executions remain read-only and cannot self-clear by role/name changes. Ordinary autonomous merges require executable gate plus release supplement, eligible exact-head/current-acceptance CLEAR, required CI/status/attempt/task/visual/live evidence, permissions/lease/mergeability and integration order. Verified owner-authorized squash uses separate OWNER_OVERRIDE, preserving unmet facts and default autonomous gates. No force/direct-main push or invented successful evidence.

After merge name exact merge SHA, pending main/deploy/live verification, eligible verifier and failure action. End every run with current source/head/revision/claims, findings/evidence, eligible review path and one next action. Release only actual claimed scopes before actual deadline. Pending is not completed delivery.

