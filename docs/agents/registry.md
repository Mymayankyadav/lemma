# OPS3 addendum C — extensible agent membership and capacity

**Owner-adopted capacity amendment, 2 November 2026.** There is no assumed agent count, scheduler, minute-slot set, task cadence or universal runtime. Any earlier fixed-capacity statements in OPS3 are historical inputs, not current limits. The Owner role and squash-merge exceptions remain in addenda B/A. This amendment covers repository preparation, legacy/shadow compatibility and active operation; it does not authorize any schedule mutation here or activate a protocol by itself.

## Registry and identity

Agent Registry **#770** is the durable enrollment/capability/lifecycle source. A claimed registry writer maintains a compact projection with append-only source links, revision and SHA-256 digest. Complete relevant source reads are required; a projection is not independent authorization. Initial inventory is UNKNOWN, not a seed list of invented workers. A registry coordination issue is not an agent, scheduler or dispatcher service.

Each entry binds stable `agent_id`, actual execution source (`scheduled`, `interactive`, `ci`, `external`), source identity/reference, owner enrollment authorization, allowed role capabilities/evidence, runtime/invocation policy, current state (`active`, `paused`, `draining`, `retired`), protocol compatibility/ACK and contribution-lineage aliases. Scheduled task IDs/cadences/time zones are recorded only when actually known and relevant. Display names, old slot labels and GitHub credentials are not identities. A new name/registration cannot erase contribution or merger lineage.

Owner-authorized ephemeral/manual participants can enroll through an actual append-only record, using its returned identity; they need not impersonate a scheduled worker. Enrollment does not establish independent review, runtime capabilities, merge rights or an edit claim. The human Owner is governance, not an assignable registry worker. Retired records and evidence remain preserved.

## Admission and changes

Discover current participants and owner-requested additions; do not infer that a missing API listing proves there are no other workers. Report limited visibility. Admit only the positively verified authorized subset, containing conflicts with unresolved writers. Missing an unrelated/inaccessible participant does not freeze independent approved work; unknown conflicting writers do block their affected scopes.

Addition/removal or cadence changes revise membership/capacity, not automatically the protocol generation. Compatible arrivals obtain their own verified guard/role capabilities before writes; incompatible ones drain/reconcile under a scoped control transition. Existing admitted claims survive packet/registry refresh while their holders remain eligible and current holds/revisions/deadlines permit. A removed/paused/draining holder may checkpoint/handoff but must not infer continuing write authority. Deactivation is not proof a process died.

No count mismatch is a reason to disable an “extra” Planner, create a missing scheduled task or reassign an unrelated workflow. External schedule/worker lifecycle changes need their actual owner scope. No participant receives more authority merely because more workers are available.

## Dispatch and scaling

One claimed Lead Dispatcher per overlapping dispatch/integration scope performs global reconciliation at a measured agreed cadence. Any eligible enrolled execution can hold the Lead appointment; it is not tied to a clock minute, named model or fixed schedule. Specialized planning, UI, architecture, fix, review, release and verification roles can be assigned to any capable unconflicted participant. Register appointments/claims centrally in GitHub so scheduled, manual and external executions collide safely.

Packets in #764 bind exact registry revision/digest and contain **zero or more** tickets for actual `(agent_id, invocation_id)` pairs. Zero needs an explicit idle/blocker reason. A packet may cover a subset of available participants; it is not a worker census. Ticket IDs and agent/invocation pairs are unique, and each role needs the agent's verified capability. Busy or held agents remain visible as occupied; adding participants does not preempt valid claims. Optional batching/partitioning must use disjoint scopes and claimed writers, not competing dispatch bodies.

Every ticket carries its explicit admission start/end, target invocation, requirements, owned paths/PR, capability/reviewer references and bounded fallback. No slot/minute convention supplies authority. A scheduled nominal instance is whatever the actual scheduler specifies; an interactive/CI/external invocation uses its actual unique source/nonce. Packet expiry does not kill an admitted claim or extend an execution deadline. Late/duplicate starts use exact invocation matching and normal claim arbitration.

`finish_by` is bounded by the execution's verified runtime and actual source/invocation deadline policy. Record `runtime_policy_ref`, `deadline_ceiling`, runtime budget and handoff reserve explicitly; unknown values allow only safe capability/identity reconciliation. There is no universal minute ceiling or clock cutoff. Claims include the actual `run_finish_by`; registry lookback covers every potentially live overlapping run, widening/reconciling if a reliable bound is unknown. Never assume a short scheduled lifetime for a long-running external agent.

Scale productive WIP from disjoint path/contract scopes, reviewer capacity, CI/database resource capacity and incident priority. Additional agents may expose shared test/merge bottlenecks; they do not justify weakening checks or simultaneous contract/migration merges. Preserve at least one eligible capable reviewer for every ordinary autonomous change. Independence follows actual agent/run/contributor/merger lineage across all execution sources; equal labels are not identity and unequal labels do not prove independence.

## Transition and evidence

Transition/control events name an **explicit positively verified target cohort**, of any size, authorized from the registry. Read back prompts/configuration and obtain ACKs for that cohort. Reconcile actual active/queued/retried conflicting runs from every known source. Do not require an imagined universal agent census to begin compatible guarded enrollment, and do not activate affected writes while conflicting lifecycle/authority is unresolved. Expansion uses the same scoped enrollment/guard checks without reconstructing all existing schedules.

The original supplied proposal and baseline snapshots remain byte-preserved in Git history through `docs/changes/OPS3/README.md` recovery links; redundant worktree copies are removed by the Owner cleanup directive. This amendment supersedes their fixed-count, fixed-slot and universal timing constraints; unamended authority, source lineage, one-writer, owner holds and truthful acceptance requirements continue. Templates are placeholders, not real enrollment or activation events.
