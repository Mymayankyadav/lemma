# Practical admission and work budgets

OPS3-ACCEPT candidate, prepared at the Owner's request on 3 November 2026. Effective only after this exact amendment is accepted through the ordinary release route or a specific Owner-authorized integration. It does not activate agents or resume schedules.

This amendment supersedes conflicting requirements for provider-certified runtime maxima and pre-known future invocation IDs in v3, registry, dispatch, startup and record templates. Actual capability evidence, one-writer claims, Owner holds, source lineage and ordinary release gates remain required.

## Two honest timing routes

1. **Source route:** retain existing `runtime_basis: "source"` (also the default for older records), verified source runtime, actual deadline ceiling and handoff. A provider deadline, when known, is always respected. Nominal scheduled time identifies an instance; early dispatch is valid when its actual-start budget and ceiling are valid. Late dispatch never extends a known source ceiling.
2. **Work-policy route:** when no contractual maximum is exposed, use `runtime_basis: "work-policy"` and the accepted work policy below. This limits how long the worker is allowed to act; it is not evidence of how long the scheduler will keep a process alive. Record `runtime_verified: false` and `deadline_ceiling: null` when the provider ceiling is unknown. A known provider ceiling still caps the run. Missing accepted policy or practical clock/identity/claim capability blocks consequential work; absence of a provider maximum alone does not.

### work-budget-v1

Accepted repository policy values, to be read from the accepted commit before use:

- policy reference: `docs/agents/runtime-admission.md#work-budget-v1`;
- maximum voluntary work window: **30 minutes from observed execution start**;
- minimum handoff reserve: **5 minutes**;
- workers may select a shorter work window, longer reserve, and earlier finish;
- `finish_by` is no later than observed start + selected work window and any known source ceiling;
- stop admitting new work at `finish_by - handoff_minutes`; checkpoint and release before finish.

These are cooperative work limits, not a universal scheduler/runtime claim. A different accepted per-source policy may be registered explicitly. No worker may self-extend a run or turn elapsed observations into provider guarantees.

For the pure validator, pass a policy object with `ref`, `max_work_minutes`, `min_handoff_minutes`, `authorization_ref`, and `verified: true` only after reading the exact accepted source and authority. Admission and continuation receive `runtime_policies_verified: true` and the actual verified `runtime_policies` array; it is insufficient to put a self-asserted policy flag in a RUN. Registry `runtime_basis` and policy reference must match the run. Older source-route records continue to validate without new work-policy fields.

If the runtime stops early, the last durable checkpoint remains authoritative. Expiry never proves process death. Takeovers reconcile known live overlapping claims, current branch heads and uncertain remote outcomes, then use expected-head updates. A stale worker re-reads entitlement and actual head before each consequential mutation; no force or direct-main push is introduced.

## Actual run identity

Prefer the actual scheduler invocation ID when exposed and record `invocation_source: "scheduler"`. Otherwise generate a unique nonce for this execution, record `invocation_source: "local-nonce"` and `invocation_id: "local:<same nonce>"`, then bind the immutable returned GitHub RUN comment ID. This is accurately labelled execution identity, not a fabricated scheduler certificate. Never reuse another execution's RUN, nonce or binding. Observed/proxy starts retain their real provenance.

No provider-issued invocation ID needs to be known before a future run exists. Stable enrolled agent IDs, run IDs, actual invocation identities and contribution/merger lineage remain distinct.

## One-time ticket binding

An exact known invocation can use the existing ticket shape unchanged. A future ticket instead uses `binding_mode: "claim-on-start"` and `invocation_id: null`, with one positively identified agent, one primary task/role/scope, capability/reviewer references, accepted revision and explicit admission window. It is not a wildcard ticket. The packet contains at most one unbound ticket per agent.

At startup:

1. Read accepted control, registry, packet and scope evidence; establish the actual immutable RUN and timing route.
2. Append a BIND with returned numeric comment ID, packet reference, ticket ID, agent, generation, RUN, actual invocation and actual bound timestamp. Read back all relevant bindings for this exact packet/ticket.
3. Run `resolveTicketBinding`: earliest valid immutable comment ID wins. Wrong source/generation/agent/run, incomplete reads, conflicting readback, future or expired binding and a consumed ticket reject.
4. Pass the winning binding and complete readback to `admitTicket`, then independently win the normal path/PR claim. A binding grants no edit lease, review independence or merge permission.
5. A retry/new run cannot recycle a consumed ticket even if the former run finished. The Lead publishes a fresh ticket preserving occupied claims.

The context supplies `packet_reference`, `ticket_binding`, `ticket_bindings` (complete relevant readback) and `binding_reads_complete`. Synthetic tests verify decision logic; only linked real comments establish actual readback. GitHub records remain cooperative, not atomic locks. If conflicting writers appear after a race, stop the affected scope and reconcile rather than treating a successful local decision as a distributed lock.

## Pauses and scoped cutover

Check the Owner's pause against accessible task state and last-run completion, plus relevant claims and branch heads. A pause alone does not terminate a run. Do not demand an impossible census of every hypothetical worker: disclose visibility limits, and contain concrete unresolved overlapping claims or writes in their affected scopes. There is no universal freeze for an unobserved possible worker.

Current paused agents stay paused until authorized to resume. Do not publish ACTIVE for them merely because code/tests or static rehearsals pass. After acceptance, install/read back coherent startup, register the actual timing policy and proven role capabilities, prepare scoped control and a bindable packet, then collect real receipts during an authorized trial. An interactive scoped trial establishes only its own capability/receipt evidence.

The **24 healthy epochs** remain post-activation stabilization/measurement. They are not a prerequisite to productive scoped activation and cannot be manufactured by counting old idle shadow checks or accelerated local loops. Keep incomplete review, deployment and live checks visible.
