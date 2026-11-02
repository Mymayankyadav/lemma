# Lemma Agent System v3 — Adaptive Plans, Repository Cleanup and Five-Slot Transition

**Status:** PROPOSAL ONLY — NOT ACTIVE  
**Prepared:** 2 November 2026, IST  
**Repository:** `Mymayankyadav/lemma`  
**Capacity:** The five existing ordinary ChatGPT hourly scheduled tasks at `:00`, `:15`, `:30`, `:45`, `:50` IST  
**Coordination:** GitHub REST; no GraphQL dependency, additional recurring task, external dispatcher service or background daemon  
**Supersedes as a proposal:** `Lemma_Agent_System_v2_Cleanup_Transition_Plan.md`  
**Inputs:** The v2 proposal, its 2 November audit, and the requirement that relevant roles discover and adopt future UI, product and architectural plans.

> This is a new planning artifact, not an implementation or authorization. Producing it changes no repository file, issue, PR, branch, saved schedule, deployment or application data. The original proposal and audit remain unchanged. All paths, new records, task identifiers and control mechanisms described below are proposed until explicitly adopted.

## 0. Intended result and essential decisions

Five fresh-session scheduled executions should move approved work from specification to verified release with little repeated discovery. They should also respond when the owner introduces a new UI design, architectural revision, implementation plan, or change to an existing plan.

The operating cycle is:

1. Discover a new proposal or amendment through the agreed GitHub intake channel.
2. Establish its provenance, revision, authority and relationship to existing work.
3. Assign suitable assessment roles: for example UI Designer, Architect, Security Reviewer or Migration Planner.
4. Produce an implementation-ready change package, including conflicts, acceptance criteria, dependencies and review requirements.
5. Obtain any required owner decision; merge the canonical approved specification and task changes through normal review.
6. Dispatch eligible implementation work to the existing five slots.
7. Independently review, merge, verify and close the change against its accepted requirements.

Roles are disposable capabilities. Workstream appointments can persist across runs. Neither is an edit lease. Current owner holds and safety rules override a ticket or lease.

The `:00` execution ordinarily performs the one global reconciliation per hour, then works. Other slots normally consume compact assignments. Missing or stale dispatch invokes a bounded fallback, not unrestricted simultaneous rediscovery.

New plans do not automatically become implementation authority merely because an agent finds them, a document was edited, or a prototype looks convincing. Conversely, an approved plan must not remain inert: discovery, assessment, task publication and dispatch have explicit owners and follow-up rules.

No finite document covers every possible incident. This protocol defines the invariants, failure classes and safe defaults needed to handle unlisted cases: preserve work and evidence; stop only affected unsafe actions; continue independent authorized work; record the uncertainty; seek one concrete owner decision when authority genuinely cannot be resolved.

## 1. Non-negotiable invariants

| Invariant | Meaning |
| --- | --- |
| Five recurring tasks | Reuse the five existing identities and schedules. No separate recurring Planner or sixth dispatcher is required. Verify actual enabled tasks before transition. |
| GitHub coordination | Durable operating state and decisions must be accessible through approved GitHub REST paths. Private chat and unshared artifacts are not assumed visible to scheduled runs. |
| One canonical task list | `plan.md` contains approved task IDs, acceptance references and dependency definitions. Other records link to tasks rather than invent competing task lists. |
| Explicit authority | Product approval, technical review, implementation permission and deployment permission are distinct. Evidence states which was granted. |
| One writer per scope | A cooperative claimant must establish current run ownership before editing. No ticket overrides an existing valid claim, an owner hold or path rules. |
| Review remains possible | Assigning writers must preserve an independent reviewer for the resulting contribution lineage. |
| Exact evidence | Review and release bind to full commit SHAs, accepted requirement revisions and applicable CI evidence. |
| No hidden bypass | A role change, plan revision, green job, copied source or new branch does not remove provenance or acceptance requirements. |
| Safe cleanup | Preserve migrations, audit evidence, owner decisions and active dependencies. Deletion requires approved scope and source/reference verification. |
| Honest limits | GitHub comments are not transactional locks; shared credentials do not enforce agent independence; scheduled capabilities must be demonstrated. |
| Bounded autonomy | Proceed within approved scope without repeated permission requests. Stop for new destructive scope, unresolved owner decisions or unavailable safety evidence. |
| Observable completion | A merge is not verified delivery. Main/deployment checks and accepted behavior have named follow-up ownership. |

All existing applicable security and project restrictions remain, including designated-project limits, migrations for schema changes, per-user isolation, secrets protection, no direct or force push to `main`, task path ownership, contract review and authorized deployment. Adopt the actual current approved policy at implementation time; do not treat this document's historical observations as fresh verification.

## 2. Authority and record ownership

### 2.1 Separate four kinds of version

| Version | Changes when | Consequence |
| --- | --- | --- |
| Protocol generation | Coordination rules, startup precedence or claim semantics change | Controlled system transition; incompatible old runs must drain |
| Change revision | An initiative's accepted UI, architecture or behavior changes | Reassess affected tasks, evidence and PRs; unrelated work can continue |
| Task/acceptance revision | A task's scope, dependencies or completion requirements change | Worker acknowledgement and appropriate revalidation |
| Dispatch epoch | Hourly allocation is published or replaced | Scheduling advice changes; it does not revoke a lease or rewrite requirements |

Routine product changes must not force a global protocol cutover. A dispatch epoch must not serve as a product approval or a claim identity.

### 2.2 Precedence by subject

| Subject | Authority after approved adoption |
| --- | --- |
| Owner intent and holds | Attributable owner decisions, within their explicit scope; unresolved conflicts hold affected work |
| Safety and allowed operations | `AGENTS.md` and approved applicable policy; weaker text elsewhere cannot waive these |
| Active operating mode and protocol | Versioned control events plus the canonical adopted coordination contract |
| Required product behavior | Approved canonical specs and explicit supersession/decision records |
| Runnable work and dependencies | Current approved `plan.md` entries linked to those specs |
| Current PR edit authority | Append-only claims, releases and dated PR leases bound to an immutable run ID |
| Audit and release eligibility | Actual exact-revision/head evidence, independent verdicts and fresh merge metadata |
| Convenience summaries | Dispatch packets, Task Board and latest handoffs; refresh underlying facts before consequential actions |

There is no blanket rule that a newer filename or higher document version overrides everything else. Supersession must identify the exact requirements it replaces. A historical setup instruction cannot override a current safety restriction.

### 2.3 Proposed records

Keep the number of entry points small. Resolve actual issue IDs during implementation and pin them in the canonical startup document; do not rely on issue titles alone.

| Record | Purpose | Writer |
| --- | --- | --- |
| `AGENTS.md` plus `docs/agents/README.md` | Short canonical startup, precedence and links | Independently reviewed PR |
| `docs/agents/dispatch.md` | Current complete protocol and mode behavior | Independently reviewed policy PR |
| `docs/agents/prompts.md` | Role playbooks that conform to the current protocol | Independently reviewed PR |
| Agent Control events in Agent Log | Append-only protocol generation/mode changes and pause instructions | Authorized transition controller |
| Agent Dispatch State issue | Compact current advisory packet | One claimed dispatcher per epoch |
| Plan Intake issue | New-plan receipts, triage and links to change packages | Claimed intake/assessment executions |
| `docs/changes/<change-id>/` | Versioned source manifest, decisions, requirement mapping and supersession | Scoped change-package PR |
| `docs/spec/**` | Canonical accepted behavior | Scoped specification/contract PR |
| `plan.md` | Approved tasks and dependency definitions | Scoped planning PR |
| Task PR and linked handoff | Branch head, lease, actual work, blockers and next action | Current scope holder; Auditor posts own verdict |
| Release records in Agent/Audit Log or PR | Merge decision, merge SHA and pending verification | Claimed Steward/Verifier |

The Task Board projects these records. It does not independently authorize a task. Intake may track proposal lifecycle, while `plan.md` remains the task definition authority and PR/evidence records show execution state. Disagreement is reconciled explicitly.

## 3. Five slots, disposable roles and capabilities

### 3.1 Normal affinities

| Slot | Default affinity | Reallocation rule |
| --- | --- | --- |
| `:00` | Lead Dispatcher, intake reconciliation, then Steward/Integrator | Publish a packet first; reduce coordination scope during incidents |
| `:15` | Critical fixes, CI, architecture or backend work | Follow actual bottleneck and skill availability |
| `:30` | Implementation, UI or architecture workstream | Prefer continuity when still useful |
| `:45` | Independent review or visual QA | Preserve required reviewer availability; use other eligible work when no review is due |
| `:50` | Implementation, integration or specialist follow-up | Respect cross-hour claims and its own deadline |

These are affinities, not reserved permanent identities. Several slots may become Reviewers or Builders when useful. No slot may self-clear its contributions by changing roles. Specialist work does not require a new scheduled task.

### 3.2 Role catalog and outputs

| Role/capability | Main output | Typical restrictions |
| --- | --- | --- |
| Lead Dispatcher | Current allocations, eligible fallbacks, reviewer capacity | Does not invent product approval |
| Intake Steward | Deduplicated proposal receipt and source manifest | Discovery is not acceptance |
| Product Planner | Requirements, acceptance matrix and task decomposition | No implementation of unapproved scope |
| UI Designer | Screen/flow specification, component and interaction mapping | Prototype-to-app gaps must be explicit |
| Architect | Boundaries, contracts, alternatives and staged migration | Contract changes follow repository process |
| Migration Planner | Compatibility, data/asset transition and rollback strategy | No live data changes from planning authority |
| Builder / UI Engineer | Scoped code and meaningful verification | Valid lease and accepted requirement revision |
| Backend / DB / MCP Engineer | Scoped contract/backend implementation | Current isolation, migration and project restrictions |
| Fixer / CI Engineer | Root-cause repair and reproducible evidence | No weakening checks merely to turn CI green |
| Integration Engineer | Ordered reconciliation of dependent work | Separate source lineage; no umbrella provenance laundering |
| Independent Auditor | Exact-head CLEAR/BLOCK and coverage evidence | Read-only for the audit; no pushes or merges in that audit execution |
| Visual QA / Accessibility Reviewer | Rendered behavior, states and accessibility evidence | Independent final acceptance where required |
| Security / Performance Reviewer | Risk-specific review and measured results | Specialist review does not replace full independent audit |
| Release Steward | Fresh release decision and exact-head squash merge | Must have actual merge capability and complete evidence |
| Post-Merge Verifier | Main/deployment verification and incident follow-up | Does not claim success while results are pending |

Every role must map to an adopted full playbook. Combining compatible capabilities in a run is allowed within its claims and deadline. Switching from authorship to independent audit of that same work is not allowed. A review execution remains read-only; a later eligible execution may have another role.

### 3.3 Capability preflight

Before assigning a role, demonstrate the required path in the **scheduled environment**, not merely an interactive Codex session:

- Required GitHub reads and permitted REST writes, including pagination and error handling.
- Branch/code editing and non-force pushes where needed.
- Meaningful test execution, or an approved CI path when local execution is unavailable.
- Check-run attempts, statuses, logs and artifacts needed for acceptance.
- Rendered screenshot/image inspection and browser interaction where the task requires them.
- Gate evaluation and exact-SHA REST merge for release roles.
- Safe handoff publication and actual execution/runtime limits.

Record `verified`, `unavailable`, or `unknown`, with dated evidence. Recheck after relevant tool, permission or runtime changes. Never assign a capability-dependent final decision to a run lacking it. Such a run can prepare evidence or perform another eligible task; the unavailable acceptance step remains blocked.

An approved one-time transition controller may operate from an interactive session or an existing capable run. It is not a sixth recurring agent. If saved-task pause/update/readback cannot be done safely, keep the new protocol inactive and identify the concrete owner operation needed.

## 4. Discovery of future UI and architecture plans

### 4.1 Accepted intake routes

| Where the new plan appears | How it enters the workflow | What agents may do immediately |
| --- | --- | --- |
| Open GitHub plan/spec PR | Intake sees the proposal and records its source revision | Read, classify, assess and review |
| Merged plan/spec PR | Verify owner authority and accepted scope; map canonical revision | Publish/reconcile tasks if authorized; dispatch eligible work |
| Owner GitHub issue/comment | Capture exact URL, author, scope and source revision | Assess or implement only the explicitly authorized scope |
| HTML/mockup/image/source bundle linked in GitHub | Create a source manifest and identify which parts are approved | Extract requirements and gaps; do not infer all prototype behavior is accepted |
| Private chat or Library artifact | An authorized owner/interactive execution makes an accessible GitHub handoff | Scheduled runs act only after that handoff is visible and verifiable |
| External design source | Record stable revision and permitted access; mirror approved requirements if needed | Read if capable; block only the inaccessible assessment/acceptance step |
| Agent-generated idea | Register as a proposal with rationale | Investigate and propose under existing authority; no self-approval of major scope |

There is no assumption that an hourly agent can read every private conversation, Library file, design account or attachment. The minimum handoff is one accessible source or faithful canonical extract, requested outcome, proposal/approval status, and owner attribution. If the owner asks to implement an accessible exact revision, record that authorization rather than asking the same question again.

### 4.2 Discovery responsibility and cost

The `:00` Lead ordinarily reconciles intake once per hour. Use GitHub REST to examine the known Intake issue, relevant open/merged PR activity, `plan.md` and spec/change-package modifications, and owner decisions since a recorded watermark. Fetch the actual content of relevant candidates; search excerpts alone are not specifications.

Use an overlap window and deduplicate by stable source identifiers/revision. Advance the watermark only after complete successful reads. Pagination failure, permission denial or rate limiting is an incomplete scan, not proof of no new plans. GitHub issue/event APIs alone do not constitute a complete repository-change feed: compare canonical refs/commits and relevant changed paths as well. Perform a bounded full reconciliation at least daily while runs are healthy.

Other workers consume the intake assignments in the packet. Before writing or merging they check holds and accepted revisions for their own scope; they do not each scan every new design. If a worker independently notices a relevant unseen proposal, append one deduplicated receipt and alert the Lead through GitHub. It may assess within authorized scope but must not silently switch product direction.

Target discovery is the next healthy hourly reconciliation for an accessible GitHub proposal. An owner-marked urgent change may be noticed earlier by an affected worker. These are service targets, not guarantees that paused tasks or inaccessible sources will be read.

### 4.3 Minimal intake receipt

Record change ID, source URL(s), immutable revision or content digest, observed time, origin/owner authority, requested outcome, affected product areas, suspected existing initiative, lifecycle state, assessment owner/next action, and unresolved decisions. If the source lacks a revision, snapshot/hash its exact content before seeking approval.

Do not paste private credentials, signed download URLs or unnecessary user data into GitHub. Preserve any source's access restrictions. If a safe public/private repository handoff cannot contain the source, record the access blocker and a sanitized requirement extract approved for that location.

## 5. Proposal lifecycle and approval semantics

### 5.1 States

| State | Meaning | Allowed next work |
| --- | --- | --- |
| `DISCOVERED` | Accessible source identified; authority not yet resolved | Deduplication and source verification |
| `ASSESSING` | Impact, conflicts, risk and feasibility under investigation | Planning, design, review and non-shipping probes within authority |
| `DECISION_REQUIRED` | Specific product, scope or risk decision missing | Present alternatives and continue unaffected work |
| `APPROVED_FOR_SPEC` | Owner authorized the identified direction/scope | Prepare canonical specs, contracts and task package |
| `SPEC_REVIEW` | Package PR being technically and independently reviewed | Repair package; no implied product implementation authority |
| `IMPLEMENTATION_READY` | Accepted package is merged, task dependencies/permissions are satisfied | Dispatch runnable tasks |
| `IMPLEMENTING` | One or more accepted tasks in progress | Build, fix, test and review within revision |
| `VERIFYING` | Required code is merged; acceptance/release verification pending | Complete verification and incident work |
| `COMPLETE` | Accepted scope verified, or explicitly reduced by owner decision | Close/index initiative with evidence |
| `HELD` | Temporary owner/safety/dependency/access hold | Continue unaffected work; investigate within allowed scope |
| `SUPERSEDED` | Explicit replacement covers specified requirements | Reconcile affected tasks/PRs; preserve provenance |
| `REJECTED` / `WITHDRAWN` | Proposal will not proceed as described | Preserve decision; release unused assignments |

Approval stages can be combined when the owner explicitly approves an implementation-ready exact package. A label or state string is a projection; the linked decision and merged canonical package provide authority.

### 5.2 Approval record

An approval binds to change ID, exact revision/digest, approved requirements, exclusions, accepted alternatives, permitted implementation/cleanup/deployment scope, and decision URL/attribution. Record whether it is full, partial or conditional. A material scope change requires a new decision; spelling/link corrections that do not alter meaning can proceed under the approved editorial policy.

“Looks good” is evaluated in its actual context. If it clearly approves the displayed exact proposal, record it. If several materially different alternatives remain, ask one focused decision rather than guessing. An implementation request already authorizes the necessary routine work within its scope; do not manufacture a second approval gate.

Automatic discovery never supplies missing owner authority. Merging an unapproved proposal also does not retroactively approve it: hold affected implementation, reconcile the accidental merge and preserve the evidence.

### 5.3 Partial and conditional acceptance

Split accepted and deferred requirements explicitly. For example, the owner may approve a new Today layout while leaving notifications or a backend rewrite undecided. Only tasks whose own requirements, dependencies and permissions are satisfied become runnable.

Conditions such as performance measurement, owner-provided signing material or a two-user live acceptance test remain named gates. Do not block unrelated tasks merely because one condition is unresolved. Do not remove the condition from a summary to make the initiative appear complete.

## 6. Change package: from plan to executable work

### 6.1 Required package contents

Scale detail to risk. A tiny isolated UI correction may use a short existing task/PR record. A new architecture or multi-screen redesign needs a versioned package covering:

1. Problem, intended user outcome, approved scope and non-goals.
2. Source manifest and exact owner decisions; proposal vs accepted status.
3. Canonical requirement IDs and affected specification sections.
4. Mapping from existing behavior/tasks/PRs to the proposed behavior.
5. Dependency graph, shared contracts, owned paths and integration order.
6. UI, data, offline, API, security, performance and platform impacts as applicable.
7. Acceptance evidence for each requirement, including who can gather and independently assess it.
8. Compatibility, migration, rollout and rollback/forward-repair approach where applicable.
9. Task decomposition, reviewer eligibility and required capabilities.
10. Supersession boundaries, unresolved decisions, risk and release conditions.

Do not duplicate full specs into dispatch packets. Link precise sections. Every required behavior must map to a task and acceptance check, or an explicit owner-approved exclusion/deferment.

### 6.2 UI plan assessment

UI Designer and Product Planner assess screen hierarchy, navigation, project-progress visibility, information density, typography, tokens/themes, component reuse and interaction behavior. Record mobile and desktop layouts, narrow widths, text/math overflow, touch targets, focus/keyboard behavior, motion preferences and accessibility.

Specify loading, empty, error, offline, unauthorized, stale-data and long-content states. Include real product actions and data contracts; a polished static mockup does not prove live behavior. Identify which prototype elements are illustrative, decorative or unsupported by current data.

Map approved screens to actual routes/components and identify consistency rules across themes/platforms. Define rendered screenshots and functional checks at the accepted viewports/states. Do not accept a screenshot envelope, contact-sheet file count or agent description as proof that the UI was inspected. Required live/interactive acceptance remains required if the available worker cannot perform it.

### 6.3 Architecture plan assessment

Architect assesses current boundaries and the smallest change that satisfies the approved outcome, alternatives and tradeoffs, contract/API/schema changes, authentication/authorization, user isolation, offline synchronization/conflict behavior, caches, device/platform constraints, dependency policy and operational cost.

Record old/new compatibility, version skew, mixed client/server behavior, partial rollout, observability, resource budgets and the intended end state. For data changes, specify reviewed migrations, data reconciliation and which operations cannot be safely reversed. No live writes, destructive migrations or secret provisioning follow merely from architectural approval.

Prefer staged compatible transitions when justified: introduce the new contract behind an approved seam, migrate consumers, verify, then retire the old path. Temporary adapters, flags or dual paths need owners and retirement conditions; do not create permanent complexity without an accepted reason. A speculative rewrite without a demonstrated need remains a proposal.

### 6.4 UI and architecture arriving together

Prepare one coherent initiative with distinct tasks and contracts. Align UI requirements with the data/backend capability that enables them. Separate design assessment from schema/contract authorization; neither role silently overrides the other.

If UI can ship independently, give it an independent accepted milestone. If it depends on a new contract, land the contract or an approved compatible adapter first. Use parallel implementation only where owned paths/contracts and review capacity permit it. Do not disguise fake UI data as completion of live integration.

## 7. Amendments, supersession and in-flight reconciliation

### 7.1 Classify the relationship before dispatch

| New material | Required handling |
| --- | --- |
| Duplicate source / same digest | Link the existing receipt; do not open competing tasks/PRs |
| Independent additive work | New change ID/tasks; check shared paths and release dependencies |
| Clarification without behavior change | Record interpretation and evidence; use authorized minor refinement path |
| Requirement amendment | New change revision; impact only affected tasks/evidence |
| Replacement of part of a plan | Explicit requirement-level supersession map |
| Replacement architecture/UI direction | Owner decision plus staged reconciliation/transition plan |
| Conflicting simultaneous proposals | Hold the conflicting decision; assess alternatives; continue independent work |
| Urgent stop/security finding | Contain affected actions immediately under approved incident authority |

“Latest wins” is not a conflict-resolution algorithm. A more recent unapproved draft cannot displace an approved spec. Independent initiatives can coexist if their accepted contracts and owned paths are compatible.

### 7.2 Reconcile every affected task/PR

| Current state | Response to an accepted material change |
| --- | --- |
| Not started | Amend/deprecate task definitions before assignment |
| Actively authored | Mark affected revision hold; current holder checkpoints and records salvageable work; replan before more affected writes |
| Awaiting review | Update acceptance mapping; Auditor reviews the current diff and revised requirements |
| CLEAR but not merged | Hold affected release; obtain an explicit reaffirmation or renewed audit for the new acceptance revision |
| Merged, not verified | Reassess verification against the accepted rollout; schedule corrective task if necessary |
| Released | Plan compatible migration/fix or approved rollback; never erase evidence or assume an old database state can be restored by a code revert |
| Owner-held | Preserve the hold unless an attributable owner decision actually changes it |
| Superseded PR with useful source | Record source parity/lineage and canonical replacement before closure; no copied-source audit loophole |

A spec-only change can invalidate acceptance even when the PR head is unchanged. Bind review to both code head and acceptance/spec revision. Unaffected requirements may retain evidence if the reviewer explicitly records why it remains applicable.

### 7.3 Safe stop and resumption

An owner hold or accepted safety stop overrides a lease's permission to continue affected work. At the next available checkpoint, stop new affected operations; cancel an in-flight action if safely possible; preserve work without pushing through an invalid gate. Do not terminate another execution by assuming its lease has expired. Do not discard unmerged source.

Resume only after current authority, accepted revision, dependencies, reviewer availability and ownership are reconciled. A packet assigning the old task cannot override a newly recorded hold.

### 7.4 Revision acknowledgements

For each affected active task, publish an acknowledgement containing old/new requirement revision, impact, retained/discarded/deferred requirements, head SHA, evidence invalidated, next action and eligible reviewer. One run may prepare a shared impact matrix; each consequential worker verifies its own current scope before acting.

If a new revision arrives during review or release, pause that decision and re-evaluate the affected scope. If it arrives immediately after release, create a visible verification/remediation record. No client-side protocol can retroactively prevent a completed remote action; recovery is part of correctness.

## 8. Run identity, time boundaries and edit claims

### 8.1 Immutable execution identity

At startup, create or recover one append-only RUN record. Its GitHub comment ID becomes the immutable `run_id`, for example `run:<actual-comment-id>`. Record saved-task identity if exposed, slot, nominal scheduled time, actual observed start, invocation nonce, protocol generation, role history and deadline. The nonce helps reconcile uncertain retries; it is not a security credential.

Changing role or task does not change `run_id`. A repeated invocation at the same scheduled time gets a separate run record and must resolve conflicts normally. If a comment creation response is lost, search/reconcile the invocation marker before retrying; never assume the mutation failed. If identity cannot be established, do not perform consequential writes.

### 8.2 Time rules

Use full RFC3339 timestamps with date and offset; render schedules in IST (`+05:30`) and compare instants consistently. Never use `HH:MM` alone to establish expiry.

Default bounds, subject to the verified runtime's shorter limit:

- `finish_by` is no later than nominal scheduled time plus 50 minutes, and no later than actual start plus the observed supported runtime limit.
- Stop starting substantive new work 10 minutes before `finish_by`; finish a safe checkpoint, push only if still authorized, and hand off.
- A run starting after its new-work boundary performs only safe reconciliation/handoff/read-only work. Do not infer an extra 50 minutes from a late start.
- A run does not extend a lease beyond its allowed finish merely to reserve the task for its next invocation.
- If the environment can terminate earlier without notice, checkpoint incrementally; never rely on an unwritten final summary.

The 50-minute value is an operating ceiling inherited from the intended workflow, not a guarantee that ordinary scheduled tasks can run that long. Capability preflight may establish a smaller practical budget. Use actual start/delay data when setting trial targets. If the runtime exposes no trustworthy start timestamp, record the first observed server timestamp as a proxy and label it accordingly; do not invent scheduler-delay or overhead measurements. Use conservative nominal-time boundaries when timing is uncertain.

### 8.3 Claim and PR lease binding

A claim contains `run_id`, scope key, task/change revision, PR/branch if any, role, full start/expiry timestamps, protocol generation and claim-comment ID. Claim scopes include task/PR, intake item, dispatch epoch, shared integration/release scope and shared issue-body writer scope.

The PR description retains a readable Owner line but also binds it to `run_id` and the claim-comment URL with a dated lease expiry. Two Builders are never treated as the same holder because their role names match. Read the actual holder binding when interpreting a legacy role-only lease; ambiguity blocks takeover until reconciled.

### 8.4 Cooperative collision procedure

1. Read current scope claims, matching releases, PR lease and relevant holds, with complete pagination.
2. Post an append-only CLAIM only if no established active holder excludes it.
3. Read back claims and PR metadata before the first write. The existing valid PR holder wins; otherwise the earliest eligible conflicting GitHub claim-comment ID wins among known contenders.
4. The losing claimant records RELEASE and moves to an eligible fallback. It does not rewrite the winner's lease.
5. Bind/update the PR lease only after establishing claim ownership, then re-read the result. A shared issue body has its own writer claim.
6. Before **each** push, consequential metadata change, audit verdict or merge, revalidate current holder, expiry, holds, protocol generation, task revision and actual head.
7. On release, reference the exact claim being ended. A delayed release must not cancel a newer claim by the same slot or role.

Comments and issue bodies do not provide transactional mutual exclusion. This protocol is a cooperative coordination rule under healthy, sufficiently fresh reads, not a proof of distributed locking or protection against a misbehaving actor sharing credentials. Use exact-head merge checks and non-force branch updates as server-side guards against stale mutations; they do not themselves enforce lease ownership.

If competing authority remains unresolved, reads are incomplete, or a previously active writer cannot be reconciled, stop conflicting writes and escalate the scope. Do not claim a formal exclusivity guarantee that the available GitHub interface cannot supply. If strict server-enforced ownership becomes a requirement, it needs a separately approved mechanism; do not quietly add a service or lock-branch system.

Keep ordinary claim retrieval bounded without omitting relevant claims: after transition, active claims cannot outlive their verified run bounds, so read the complete recent interval covering every potentially unexpired claim and matching release, plus the assigned PR's actual lease and linked handoff. Use supported REST time filters and complete pagination within that interval. Include clock/observation margin; reconcile longer legacy claims during cutover. A compact claim projection may accelerate navigation but cannot prove a scope is free by itself. If the safe lookback bound is unknown, widen/reconcile it or hold the scope; do not read the entire historical Agent Log reflexively in every normal run.

### 8.5 Expiry, takeover and interruption

Expiry releases an entitlement; it does not prove that a process has died. The new claimant verifies the expired claim, current head and any heartbeat/handoff, announces takeover and applies the collision procedure. The old claimant must stop upon observing lost/expired ownership and must never force-push a prepared change. Reconcile reusable commits/patches through the new holder with full provenance.

Retries of push, merge, issue update or approval-state mutation must first inspect actual remote state. A timeout is an unknown result, not permission to duplicate the operation. After any head change, invalidate stale audit/release decisions as required.

## 9. Reviewer availability and provenance

### 9.1 Prospective independence

For every writable task/PR, track contributor slots/runs, copied/cherry-picked sources, relevant prior mergers, eligible independent reviewers and required review capabilities. Before assigning another writer or creating a composite PR, ensure at least one eligible reviewer remains under the adopted repository policy.

Reserve a review path, not necessarily a permanently dedicated person or `:45` slot. If a takeover would consume the last eligible reviewer, assign another task or preserve that slot for review. Do not postpone the problem until the PR is ready.

Apply provenance to the actual contribution lineage. Authoring a specification disqualifies self-clearance of that specification PR. It does not automatically make every future code-only PR implementing the independently accepted spec the author's own contribution; inspect actual contributions and the adopted policy. Copied implementation source, substantial supplied patches and composite diffs retain their authorship. Where policy requires stronger separation, use the stronger rule.

### 9.2 Independent verdict

An Auditor reviews the entire current PR diff, accepted requirement revisions, source lineage, required artifacts, security/behavioral implications, CI and task-specific evidence. It must be an eligible different execution/slot where required, must not clear its own contribution, and must not audit work it merged when that exclusion applies. Shared GitHub account identity is insufficient evidence of independence.

New verdicts record full head SHA, accepted requirement/task revision, reviewer run/slot, provenance basis, reviewed evidence URLs/run IDs, coverage, unresolved issues and `AUDIT CLEAR` or `AUDIT BLOCK`. No later unresolved block may remain. Absence of a block is not clearance. Historical short-SHA or unrecorded-slot evidence requires explicit legacy reconciliation; do not invent provenance or reject all legacy work solely because a new field was absent.

Any head change invalidates head-bound CLEAR. A material requirement change invalidates affected acceptance even if head remains unchanged. Additional specialist reviews supplement rather than silently replace the required full independent audit.

If no independent reviewer remains, hold that scope. Split only when it creates truly separable reviewable contributions; splitting cannot wash source lineage away. An owner-authorized external review is an exceptional recovery path, not a sixth recurring worker or an automatic approval bypass.

## 10. Dispatch packet and worker startup

### 10.1 Packet authority and writing

The packet is a compact scheduling cache. It is not a task lease, approval record or replacement specification. One eligible dispatcher holds the epoch-specific writer claim. Another run may perform bounded recovery dispatch only after the dispatcher claim is absent/released/expired and a recovery scope claim is won; it does not overwrite a still-active writer.

Issue-body updates are not compare-and-swap operations. Re-read immediately before and after publication, log the publication comment/revision, and stop if another active writer or contradictory epoch is discovered. Preserve the last valid packet in history. An invalid/partial body is rejected rather than guessed into a valid assignment.

### 10.2 Required contract

| Field group | Required content |
| --- | --- |
| Envelope | Protocol name/version, generation, mode, epoch ID, publisher run/claim, publication time and source control-event reference |
| Admission | Packet admission start/end; per-ticket nominal execution instance and latest admission time |
| Sources | Observed repository commit, `plan.md` blob revision, relevant accepted change/spec/task revisions, latest reconciled intake watermark |
| Ticket | Ticket ID, slot, role/playbook, task/change ID or explicit read-only queue, purpose, exact next action |
| Authority checks | Source links for scope, owner holds, dependencies, capabilities and reviewer eligibility; observed values are advisory snapshots |
| Write scope | Owned paths and PR/branch references when writable; explicit read-only scope otherwise |
| Continuity | Appointment ID and review point, existing claim reference if any, observed head SHA when applicable |
| Fallback | Bounded resolver key, allowed role/scope and reason; `none` means report blocker/read-only work |

Required information can be a precise canonical link rather than copied text. A field may be `not_applicable` only for a stated reason. Safety facts must still be fetched fresh when an action depends on them. Use full SHAs and distinguish repository commit, file blob and PR head. Do not place a plan file's blob hash in a field that claims a repository commit.

One slot's ticket has one primary action and one bounded fallback. Role names must map to a playbook. Allowed modes are `legacy`, `shadow`, `cutover`, `active`, `rollback`; unknown values are rejected.

### 10.3 Admission vs continuation

A packet admits new work only within its admission window and only for the named nominal execution instance. Normally the window ends at the next hour; each ticket also has an explicitly bounded late-start allowance, initially five minutes or earlier packet expiry. These values are trial policy and must be adjusted to measured scheduler behavior through a reviewed change.

Once admitted, a run continues under its own claim and dated lease until its deadline, even if the packet expires. It still refreshes holds, protocol generation and task revision. Packet expiry does not extend the run, revoke a valid lease or authorize new work. A replacement packet must preserve active claims as occupied.

For example, an admitted 13:50 run may continue to its 14:40 ceiling. A delayed 14:05 invocation cannot claim the expired 13:50 ticket; it uses the late-run fallback within its original finish boundary. It also cannot consume a ticket intended for 14:50 merely because the slot label matches.

### 10.4 Normal worker path

1. Establish actual run identity/deadline and read canonical startup/control generation.
2. Read the compact packet, validate mode, publication, generation, admission and ticket identity.
3. Read only the assigned task/PR, accepted requirement sections, latest handoff and required role playbook.
4. Refresh scope-specific owner holds, dependencies, capability and reviewer eligibility.
5. Claim/continue the scope through §8; verify head and revision before consequential work.
6. Execute the task with incremental evidence and checkpoints.
7. If the primary finishes or becomes blocked, use its eligible fallback or a narrowly claimed queue transition; do not wait idly or hold unrelated leases.
8. Record outcome, release/expiry, pending verification and one concrete next action.

Read mandatory safety instructions at the applicable exact version. No unverifiable persistent cache is assumed in a fresh session. Keep the canonical entry point short instead of skipping required reads to hit a timing target.

### 10.5 Mode behavior

| Mode | Worker behavior |
| --- | --- |
| `legacy` | Follow the approved legacy protocol; v3 packets grant no assignment authority |
| `shadow` | Legacy remains authoritative; compare proposed tickets without claiming work from them |
| `cutover` | No new affected writable claims; existing authorized work drains/checkpoints as instructed |
| `active` | Follow valid v3 tickets and bounded fallback |
| `rollback` | Stop new v3 claims; drain/checkpoint; resume legacy only after consistent restoration is declared |
| Missing/unknown/conflicting control | No inferred new authority; validate any safely continuing unaffected work or remain read-only |

### 10.6 Fallback and recovery

Try in order: current eligible appointment with a valid/reacquired claim; the ticket's bounded fallback; the Task Board's linked canonical next-up queue; a limited scope-specific reconciliation. Validate current `plan.md` status before claiming any task. Suggested bounded resolvers are `ready-release`, `eligible-audit`, `main-incident`, `approved-intake-assessment`, and `independent-task-next-up`.

Default local triage budget is five minutes and a small paginated candidate set, initially up to ten candidates. This is a budget, not permission to truncate evidence for a decision. If pagination or access prevents complete evidence for one candidate, skip/hold that candidate rather than certify it. A healthy replacement dispatcher may reconcile more broadly under its own claim.

If GitHub cannot establish current holds/ownership/evidence, no code push, audit CLEAR or merge is permitted. Safe local investigation/read-only planning may continue. Do not describe such a safe stop as productive implementation, and do not promise work can continue through a total coordination outage.

## 11. Allocation, continuity and work-in-progress limits

### 11.1 Priority rules

| Priority | Work | Notes |
| --- | --- | --- |
| P0 | Owner stop, security/data-loss issue, broken main/production incident | Contain first; assign disjoint work only |
| P1 | Shared blocker preventing many approved tasks or safe release | One canonical root-cause stream |
| P2 | Fully eligible release and urgent pending post-merge verification | Drain ready delivery; recheck all gates |
| P3 | Independent audit/review needed to unlock accepted work | Add reviewers when review is the bottleneck |
| P4 | Intake/impact/contract decisions for owner-prioritized plans; reproducible defects | Urgent owner plans can rise according to impact |
| P5 | Runnable approved UI/architecture/features | Preserve useful workstream affinity |
| P6 | Nonurgent speculative planning and archival hygiene | Never fabricate work to fill a slot |

Use impact, aging, dependencies and eligible capacity rather than a rigid numeric score. A P0 problem can justify several Fixers only for disjoint scopes. Merging one ready PR must not crowd out an actual incident. New owner plans get assessment capacity rather than indefinite P6 treatment.

### 11.2 Aging and queue thresholds

Initial reviewed trial defaults:

- A fully eligible ready merge waiting two healthy dispatch cycles receives an explicit Steward action or a concrete blocking reason in the next packet.
- An accessible unassessed owner plan waiting two healthy dispatch cycles receives an assessment assignment or a visible reason/decision request.
- More than two eligible ready PRs awaiting review, or one waiting two cycles, triggers additional eligible reviewer capacity before opening more feature PRs.
- Start with at most two concurrent assessed-but-not-yet-canonical change packages and at most one substantive writable PR per execution. Raise limits only with measured capacity and reviewer availability.

These thresholds are operational defaults, not promises during owner holds, missing capabilities or outages. Count healthy cycles separately from wall-clock latency. Keep incidents and explicit owner priorities visible.

### 11.3 Sticky workstreams

An appointment identifies a change/task stream, preferred slot(s), next checkpoint and review point, normally after two to four starts. A productive run may resume it after the old lease expires by winning a fresh claim. Routine lease expiry releases edit authority without automatically cancelling affinity.

Reassign if the work is complete, blocked without a useful investigation, displaced by an incident/owner decision, claimed elsewhere, or repeatedly produces no new evidence. After two consecutive healthy starts without new evidence, require an investigation change, narrower scope, specialist review or explicit reassignment. Do not punish a well-documented difficult investigation merely because no code merged.

The appointment creates no exclusive right to idle capacity. An unconflicted reviewer may work on another task, but must not take authorship that destroys a reserved review path.

### 11.4 Typical allocations for new plans

| Situation | Example use of the five slots |
| --- | --- |
| New UI plan, assessment stage | Lead/intake; UI Designer; behavior/data mapper; independent package reviewer; existing approved task |
| New architecture plan | Lead/dependencies; Architect; migration/security assessment; independent contract review; unaffected implementation |
| Approved UI and architecture together | Lead/integration; contract/backend implementation; UI implementation on accepted seam; independent review; tests/QA or another independent slice |
| Large review queue | Lead/Steward; two eligible Auditors; one Fixer; one Builder if capacity permits |
| Owner decision pending | One concise decision package; other slots continue unrelated approved work |
| No useful runnable scope | Record the real blocker; do not create duplicate plans, empty PRs or cosmetic activity |

Appointments are task-specific and disposable. Specialists can change next run once their output is accepted. None of these examples adds a sixth schedule.

## 12. CI, independent audit and release

### 12.1 Canonical evidence policy

At adoption, verify the current required workflow/check names and task-specific requirements against the approved repository policy. The audit's observed canonical seven were:

`check`, `mcp-sql`, `e2e-1-of-4`, `e2e-2-of-4`, `e2e-3-of-4`, `e2e-4-of-4`, `qa3-screens`.

Do not silently weaken, skip, delete or rename required checks to obtain green CI. Legitimate changes to test policy, workflow topology, budgets or check names require their own justified reviewed authorization and consistent protection/gate updates. This plan does not grant that authorization or undo any separately approved current policy.

Check presence, full head SHA, completion/conclusion, required attempts, workflow identity and applicable statuses. Fetch complete relevant pages. A missing API result is not a passing or absent requirement. If jobs share names across workflows, use the accepted workflow/app/context mapping rather than trusting a string alone.

Latest-success retry policy and first-attempt/no-retry policy are different. Apply the actual task/spec rule and retain relevant attempt evidence. A generic latest-green summary cannot erase a strict first-attempt condition. A PR's accepted behavior, required screenshot inspection and live acceptance may require more than the canonical seven jobs.

### 12.2 Close the known enforcement gap before activation

The 2 November audit found that the observed `scripts/merge-gate.ts` enforced exact-head CLEAR conditionally on a phrase in the PR body and did not structurally establish reviewer provenance. Verify its current state; do not assume this remains unfixed or that a green function result is sufficient.

Active v3 requires either an independently reviewed enforcement fix or a documented, mandatory supplemental release decision that refuses every merge lacking eligible exact-head CLEAR and applicable acceptance evidence. Demonstrate rejection paths before activation. A body omitting the checklist phrase cannot bypass review.

### 12.3 Fresh release decision

Before each merge record:

- PR, full head SHA, observed base/main SHA and accepted task/change/spec revisions.
- Current owner permissions/holds, accepted checklist and standalone Ready marker.
- Valid merge authority, run/claim/lease, non-draft state and mergeability.
- Required exact-head CI/statuses, attempt policy, evidence URLs and task-specific acceptance.
- Explicit eligible independent CLEAR with no later unresolved block.
- Dependencies, changed-path/contract interactions, migration order and required integration freshness.
- Gate result/reason and supplemental checks where the generic gate does not encode the full policy.

Squash-merge through REST using the specified head SHA. A conflict, changed head or unknown mergeability blocks the attempt. If the merge request times out, inspect actual PR/main state before retrying. Never merge merely because a previous run logged `ok=true`.

### 12.4 Sequential integration and verification

Serialize merges that share contracts, migrations or integration scope. After each, refresh downstream heads, dependency state and tested base context. Follow the current approved integration policy for refreshing branches/re-running affected evidence; record why prior evidence remains valid if it does. Do not equate independently green old bases with a verified combined release.

Create a durable release record with merge SHA, required main/deployment checks, verification owner/eligible next slot, pending results and failure action. If verification outlasts the run, hand it off rather than wait idly or claim completion. Do not release a dependent batch past a failed relevant integration gate.

Code rollback, configuration rollback and database rollback are different operations. Use the accepted incident and migration plan. Never reverse a data migration or manipulate migration history as an improvised coordination fix.

## 13. Handoffs and compact state

Each active scope has a latest-state handoff linked from its PR/intake/release record. Keep long troubleshooting in append-only comments/commits. Summaries may be refreshed by the scope holder but must preserve links to provenance and decisions.

```text
RUN / SLOT / CLAIM:
TASK / CHANGE / ACCEPTED REVISION:
PR / FULL HEAD / OBSERVED BASE:
ROLE / OWNED PATHS / FINISH BY:
STATE: progressing | held | blocked | review-ready | merge-ready | verifying
VERIFIED: results with exact run/artifact/decision URLs
ATTEMPTED: specific investigation/change and outcome
REQUIREMENTS: coverage, changed acceptance, unmet conditions
DEPENDENCIES / OWNER HOLDS:
PROVENANCE: contributors, copied source, mergers, eligible reviewer(s)
PENDING: CI, review, owner decision, rollout or verification record
NEXT: one executable action, named scope and required capability
CLAIM: released | expires at <dated timestamp> | safely continued
```

Do not claim tests ran locally when only CI was read. Do not describe an uninspected screenshot as visually accepted. A replacement execution should resume from this state and the relevant canonical source without reading hundreds of comments, while remaining able to inspect the underlying evidence when a decision requires it.

## 14. Repository cleanup before transition

### 14.1 Baseline and finite mandatory scope

Capture one reproducible baseline: repository commit/tree SHA, timestamp, tracked-file inventory method, applicable specs/decisions, open PR heads and active claims, required CI/gate policy, current issue IDs, actual saved-task identities/prompts/enabled state, capabilities and outstanding safety blockers. Verify these facts during implementation; the old proposal's inventory counts and PR examples are historical evidence only.

Mandatory pre-transition cleanup is limited to the entry points and contradictions that can misdirect an agent:

- `AGENTS.md`, `plan.md` quick start and operational sections, agent handbook/dispatch/playbooks.
- Historical setup instructions, especially broad branch deletion and reset steps that could be mistaken for runnable work.
- Superseded tasks/spec directions that still look current, including old theme/role/schedule instructions.
- Current README/guide/design indexes where they contradict approved shipped behavior or source precedence.
- Links and references needed to discover current specs, owner decisions, audit evidence and intake/control records.

In particular, review the audit-observed `plan.md` instructions describing four fixed-role workers, old remote-branch deletion steps, superseded theme work and task-first discovery. Confirm current contents rather than copying the audit as a fresh fact. Mark completed/historical setup work unambiguously without deleting its provenance.

Do not make full historical archival or unsafe deletion a prerequisite to a safe instruction cleanup. Critical main/security/merge-safety repairs may proceed under the existing approved protocol while cleanup is being prepared; avoid a circular dependency where red CI prevents the repair needed to review cleanup.

### 14.2 Manifest and dispositions

Record path, source commit, category, current/active-PR references, reason, disposition, replacement/archive path, risk, reviewer and validation. Use `KEEP_CURRENT`, `UPDATE`, `ARCHIVE`, `DELETE_CANDIDATE`, `DEFER`.

Check tracked references, relative links/anchors, imports/build/test/workflow inputs, open PRs, unresolved audits, product tasks and owner decisions before moving or removing anything. Superseded is not synonymous with unreferenced. A runtime asset or regression fixture may be old and still required.

Prefer in-place historical labels and indexed provenance when moving would break immutable PR links or obscure evidence. If safe archival is useful, preserve original paths/commit references in an index. Do not move current assets or evidence merely to reduce file count.

### 14.3 Protected material and GitHub hygiene

Preserve migrations, audit/security findings, source lineage, permanent acceptance evidence, owner decisions, active screenshots/fixtures and unresolved PR dependencies. Narrowly approved deletion requires a reference/source-parity audit and an independently reviewed reversible PR; branch deletion requires the separately authorized branch scope.

Close a duplicate PR only after identifying the canonical replacement, preserving source/tests/acceptance/provenance and recording supersession. Close an obsolete issue with a reason and successor, never by deleting its history. Keep Agent/Audit Log histories append-only. Compact the Task Board without erasing evidence. Do not bulk-delete branches or execute an old clean-slate instruction during active work.

### 14.4 Proposed cleanup units and exit gate

| Proposed unit | Scope | Completion evidence |
| --- | --- | --- |
| `CLN3-0` | Baseline, manifest and reference audit | Pinned source inventory and dispositions |
| `CLN3-1` | Dangerous/stale canonical instructions | Fresh-start readthrough cannot select historical destructive work |
| `CLN3-2` | Current docs accuracy and precedence links | Correct approved behavior, valid references |
| `CLN3-3` | Optional design/evidence indexing and safe archives | No loss of active references; deferred items explicit |
| `CLN3-4` | Post-stabilization legacy-playbook retirement | Coherent rollback snapshot and preserved provenance |
| `CLN3-5` | Later branch/issue hygiene | Approved canonical replacements and source parity |

Introduce these IDs through the normal approved task process; they are not asserted to exist. Keep scopes small and avoid simultaneous edits to shared entry points.

Cleanup is sufficient for shadow/transition preparation when the mandatory instruction conflicts are resolved, current references work, active PR dependencies/evidence remain intact, required reviews/checks pass, and nonblocking historical work has a visible disposition. It is not necessary to classify every historical comment before trying shadow dispatch.

## 15. Protocol control, holds and authorization

### 15.1 Control events

Use an append-only `PROTOCOL CONTROL` event in the pinned Agent Log, authored by the authorized transition controller and linked to the actual owner authorization. Required fields:

```text
event_type: PROTOCOL_CONTROL
controller_run_or_owner_reference: <actual reference>
authorization_reference: <actual decision URL/reference>
generation: <monotonic adopted protocol generation>
mode: legacy | shadow | cutover | active | rollback
effective_at: <dated timestamp>
canonical_protocol_reference_and_digest: <actual pinned reference>
applies_to: <five saved-task identities / affected scopes>
supersedes_control_event: <actual previous event ID>
permitted_claim_behavior: <drain / legacy / active / read-only>
rollback_snapshot_reference: <actual retained version>
```

These placeholders describe a contract; they are not a valid published event. Only an authorized event with a valid predecessor and compatible adopted protocol may advance control. An issue title, unapproved comment, arbitrary higher generation number or dispatch packet cannot activate a protocol.

Controller writes are serialized by an exclusive transition scope claim and the approved runbook. A conflicting event chain freezes new affected claims until reconciled. Read the authoritative event history when the compact control projection is missing, stale or contradictory. A projection is not an independent authority.

This provides auditable cooperative fencing, not cryptographic isolation between agents sharing an account. Product approval attributable only through a private interaction needs an authorized handoff with sufficient context; do not manufacture approval by posting an agent comment as though it were the owner.

### 15.2 Owner holds and emergency containment

Maintain scoped owner/safety holds with affected task/change/PR, reason, source decision, effective time, required resolver and release condition. The Lead projects them into tickets; affected workers refresh them before actions. A new hold does not wait for the next packet to become binding once observed.

Initial adoption should authorize immediate non-destructive containment of suspected unsafe actions: stop new affected claims/merges, preserve evidence and alert the owner in the agreed channel. It does not authorize destructive recovery, live migration reversal, revocation of unrelated permissions or changing the user's schedules without the agreed authority.

### 15.3 Reusable approval scope

The owner can authorize one concrete implementation package covering read-only inventory, reversible docs/policy PRs, capability tests, shadow trials and progression through objective exit checks. Routine steps within it do not require repeated approval. Record separate scope for moves/deletions, saved-task changes, activation and rollback/containment authority, live deployments, secrets/accounts and material product/architecture decisions.

Major UI/architecture proposals and disputed tradeoffs remain owner decisions unless already explicitly authorized. Technical refinement within accepted boundaries is routine engineering. If a decision is missing, present the concrete alternatives, recommendation, consequences and affected tasks once; continue independent work.

This proposal alone grants none of those implementation permissions. Do not ask for approval merely to perform the document-writing work requested here.

## 16. Transition from the current system

### Stage 0 — Verify baseline and capabilities

Read the actual current approved repository rules and saved-task configuration. Determine whether the five tasks are enabled or paused, whether any separate Planner really exists, whether runs can be listed/stopped or only schedules paused, and what runtime bounds are known. Do not infer running-task state from a repository handbook.

If a separate Planner or other sixth recurring execution actually serves this workflow, inventory its unfinished responsibilities and assign them within the five slots. Obtain explicit authorization to disable or repurpose the extra schedule before active v3; do not delete its history. Verify the resulting recurring execution count at activation. If no extra task exists, do not invent a disabling step.

Capture the §14 baseline. Prove relevant scheduled capabilities in safe scopes. Resolve merge-policy enforcement gaps and main/safety blockers through the existing approved process. Unavailable capabilities reduce assignable roles; they do not justify imaginary verification.

**Exit:** Known current identities, policy, capabilities, limitations and authorized implementation scope.

### Stage 1 — Minimal cleanup and prepare inactive v3

Complete mandatory cleanup. Prepare independently reviewed inactive v3 docs, startup guard, role mappings, schemas, intake/change-package templates, audit/release procedure and rollback snapshot. Establish the proposed issue IDs through the approved process.

Reconcile `AGENTS.md`, `plan.md`, handbook and playbook precedence. Preserve the old protocol as the current authority while v3 is inactive. New docs must say `NOT ACTIVE`; their presence alone grants no new claims. Do not archive away the live operating rules yet.

**Exit:** No dangerous instruction ambiguity; reviewed v3 contract; known rollback version; required safety enforcement demonstrated.

### Stage 2 — Install compatible startup guard and run shadow trials

Under the approved scheduling-change scope, update the same five saved prompts to a compatible guard that understands control modes while retaining legacy authority in `legacy`/`shadow`. This installation does not switch ownership rules. Read back saved prompts and record their exact versions/digests. Verify all five have successfully entered through the guard before relying on it to fence a later transition.

Use existing runs for non-authoritative shadow dispatch and intake assessment. Compare suggested assignments with live eligible queues and provenance. Conduct controlled protocol/failure tests from §18; two quiet shadow hours alone do not suffice. Legacy workers do not claim work because of a shadow ticket.

If old in-flight runs cannot be shown to honor the guard, they remain legacy writers and must drain before activation. If a saved-prompt update is partial, remain legacy/shadow, reconcile versions and repeat verification. No sixth schedule is created for testing.

**Exit:** All five startup paths verified, shadow assignment quality measured, required failure tests passed, exact cutover/rollback authority and controller identified.

### Stage 3 — Pause, drain and activate

The following is a controlled runbook, not an atomic transaction claim:

1. Choose an approved activation window and future activation time. Publish `cutover` with no new affected writable claims.
2. Pause the **same** five schedules if capability and authorization permit. Pausing future starts does not imply active runs have stopped.
3. Inventory active/queued invocations and claims. Let writers reach safe checkpoints/release, or use verified runtime termination/finish evidence. Check for late or retried invocations.
4. Verify no incompatible writer can start/continue conflicting work at activation. Use startup-guard acknowledgements and actual lifecycle evidence, not lease expiry alone.
5. Merge the final reviewed canonical docs under the old safety gate. Keep intake, task and provenance records consistent; do not reset the repository.
6. Finalize/read back all five saved prompts to the same protocol digest/generation and slot identities. Confirm schedules, enabled-state intentions, authority references and fallback rules. Preserve complete old prompt snapshots.
7. Reconcile live heads, leases, owner holds, accepted change revisions and review eligibility. Prepare the first valid future packet.
8. Publish the authorized `active` event only after all conditions agree, then resume the same schedules at the agreed boundary. Do not enable an extra Planner.
9. Inspect each slot's first runtime acknowledgement and packet consumption. A mismatch performs read-only/handoff behavior and triggers reconciliation before that slot writes.

If pause/drain APIs are unavailable, use the verified guard to stop new claims and a bounded, evidenced drain of existing runs. If active runs, queued retries or maximum lifetime cannot be verified sufficiently, **do not activate**. Record the exact owner/runtime operation needed. Uncertain old-process termination cannot be solved by declaring a time in an issue.

Any failure before activation leaves legacy/shadow authoritative or enters controlled rollback. Do not unpause into a half-updated policy.

**Exit:** Exactly the intended five identities/schedules, coherent generation/prompts/docs, no incompatible live writers, active packet admitted correctly, first-slot acknowledgements reconciled.

### Stage 4 — Supervised stabilization

Observe at least 24 healthy dispatch epochs, extending the window for outages, queued starts, missing capabilities or nonrepresentative workloads. Exercise both routine implementation and new-plan intake when possible; use controlled examples if no real new plan arrives.

Measure safety, overhead, intake latency, claim collisions, fallback use, reviewer availability, CI/review/release latency, pending verification and completed acceptance. Do not optimize timing by dropping reads or reviews. Apply thresholds in §19 and repair causes through reviewed changes.

**Exit:** Safety scenarios pass; no unresolved unauthorized action/provenance failure; handoffs and fallback work; normal assigned work uses less repeated triage; new accepted plans reach runnable tasks; pending verification is not lost.

### Stage 5 — Retire duplication, preserve recovery

Only after stabilization, label/archive old playbooks and confusing fixed-slot language, update indexes, and close superseded coordination issues with successors. Preserve audit/source histories and the rollback bundle. Complete deferred nonessential archival and branch cleanup only within separately authorized scope.

**Exit:** A fresh run finds one operating policy, one task authority and one clear intake path; historical material remains retrievable and cannot masquerade as current instructions.

## 17. Rollback and incident recovery

### 17.1 Triggers and extent

Contain affected scopes immediately for self-audit, unverifiable authority, an unsafe merge attempt, conflicting generations or suspected security/data-loss behavior. Repeated conflicting claims, partial activation, unreadable control state or recurring Lead failures may justify protocol rollback. A single late packet with working safe fallback is an operational incident, not automatic proof that the whole system must revert.

Distinguish coordination rollback from application release rollback and from data recovery. Roll back only the needed layer under its actual authorization.

### 17.2 Coordination rollback runbook

1. Authorized controller records `rollback`; stop new v3 claims in affected scopes.
2. Pause future starts if permitted; drain/checkpoint active work. Preserve source, claims, evidence and pending verification.
3. Restore coherent retained legacy startup/docs/prompts through the agreed process. Preserve valid safety fixes, owner holds, new task approvals and provenance; do not blanket-revert product or data commits.
4. Read back all five prompts and reconcile current PR heads, leases and accepted task/spec revisions. The legacy system must understand the current work or receive an explicit compatibility handoff.
5. Declare the restored authority and resume only when no conflicting live writer remains. Re-run critical smoke/coordination checks.
6. Record root cause and propose a reviewed repair before attempting another activation.

If the retained legacy protocol cannot safely represent current requirements, keep affected work paused rather than force an incoherent rollback. Emergency read-only containment remains available while a consistent recovery package is prepared.

### 17.3 Recovery from partial external operations

For uncertain merges, pushes, issue updates, schedule changes or deployments, inspect actual state before retrying. Record known/unknown outcomes and use idempotent reconciliation where possible. Never use force push, lost-history cleanup, test weakening or invented owner approval to make the record look consistent.

An irreversible operation needs its own incident response and owner decision where required. No coordination document guarantees reversal of data loss or a completed production action.

## 18. Failure model and acceptance scenarios

### 18.1 Operating assumptions and limits

The protocol assumes cooperative executions, sufficiently attributable owner decisions, accessible GitHub records, and honest evidence reporting. It must tolerate ordinary delay, duplicate starts, interrupted runs, stale summaries, partial API failure and human amendments. Shared credentials do not provide isolation against a malicious execution, and comments cannot eliminate every race under arbitrarily stale reads. Treat unresolved authority as a reason to stop the affected action, not as a proof that the protocol has a transactional lock.

Before activation, exercise the high-risk control/claim/release scenarios with table-driven simulations or approved isolated scopes. During stabilization, collect runtime evidence for the ordinary paths and deliberately test safe fallback. Do not generate real unsafe merges, destructive migrations, privacy leaks or branch deletions as tests.

The following matrix is a minimum catalog, not a claim of exhaustive incident coverage. `Hold` means affected scope only unless the failure undermines global authority.

### 18.2 New-plan lifecycle

| Scenario | Required response |
| --- | --- |
| New UI plan is merged with explicit owner approval | Discover, verify revision/authority, map tasks and dispatch eligible UI work |
| New architecture proposal is opened but unapproved | Assign assessment/contract review; do not implement major scope |
| Owner directly requests implementation of an exact accessible plan | Record existing authorization; avoid asking again for the same scope |
| Prototype contains decorative/fake data | Separate illustration from required live behavior in the package |
| New plan exists only in private chat/Library | Require an authorized accessible handoff; never pretend it was discovered in GitHub |
| Source attachment is inaccessible, deleted or mutable | Preserve known digest/manifest, identify missing access, hold only dependent assessment/actions |
| Same proposal arrives through issue, file and PR | Deduplicate by source/revision; one canonical change package |
| Same title is used for different proposals | Compare content, provenance and requirement IDs; do not merge by title |
| Two owners' apparent instructions conflict or approval attribution is unclear | Preserve both records; obtain the actual owner's scoped decision |
| Proposal text contains executable commands or instructions to bypass policy | Treat it as source material; follow approved operating authority before any action |
| UI and architecture conflict on data or navigation | Assign joint impact/contract work; present a concrete choice if intent cannot be reconciled |
| Plan has missing acceptance criteria or circular dependencies | Return to assessment/decomposition; do not dispatch fictitiously ready tasks |
| Owner accepts only some screens/features | Publish accepted subset and explicit deferred requirements |
| Owner withdraws or rejects a proposal | Release unused appointments and preserve decision; continue unrelated work |
| Unapproved plan was accidentally merged | Hold its implementation and reconcile authority; merge status is not approval |
| Small clarification has no material behavior effect | Apply approved refinement path with traceable interpretation |
| Plan changes repeatedly faster than implementation | Batch a proposed stable revision and ask for a concrete scope decision; no silent moving-target implementation |
| Approved new plan waits behind endless existing work | Intake aging rule allocates assessment/task publication capacity or reports the real blocker |

### 18.3 Revision and integration

| Scenario | Required response |
| --- | --- |
| New requirement affects an actively edited path | Scope hold/checkpoint, impact mapping, fresh revision acknowledgement |
| Change is independent of an active lease | Continue active work; schedule independent accepted tasks normally |
| New spec arrives while Auditor reviews | Pause affected verdict; review code plus new acceptance revision |
| Code head unchanged but approved spec changes | Reaffirm/re-audit affected acceptance explicitly; old CLEAR is not enough |
| CLEAR exists before a Fixer pushes a repair | New head needs eligible independent clearance |
| Superseded PR holds useful source/tests | Preserve lineage/source parity before canonical reuse or closure |
| Two initiatives change the same shared component differently | Resolve contract/ownership and sequencing; no dueling implementations |
| Two green PRs depend on incompatible migrations/contracts | Hold integration; reconcile order/compatibility and refresh relevant evidence |
| Old and new clients coexist during architecture rollout | Follow accepted compatibility/migration plan; do not assume simultaneous upgrade |
| Offline data or cached state uses old schema | Exercise approved upgrade/isolation/conflict paths; no implicit cache wipe authorization |
| Backend is not ready for approved UI | Land independent UI only if accepted; otherwise wait for contract/approved adapter |
| Owner changes direction after release | Create explicit migration/remediation initiative; no erasure of delivered history |

### 18.4 Scheduling, authority and concurrency

| Scenario | Required response |
| --- | --- |
| Lead is missing for one hour | Bounded eligible continuation/fallback; recovery dispatch only under a won claim |
| Lead is missing repeatedly | Visible incident; prevent all workers reverting indefinitely to broad triage |
| Packet missing, malformed or from unknown generation | Reject ticket authority; apply control-aware safe fallback |
| Packet is future-dated or names another nominal invocation | Do not admit this run to that ticket |
| `:50` crosses hourly packet expiry | Continue only an already admitted valid claim within its dated finish boundary |
| Late `:50` invocation starts after admission expiry | Do not claim old ticket or next hour's ticket; bounded late-run fallback |
| Duplicate invocation shares slot/time | Distinct immutable run IDs and claim arbitration |
| Two same-role workers request one PR | Actual run/claim binding determines authority; role name is insufficient |
| Lease expires across midnight | Dated timestamps and actual head/holder are unambiguous |
| Old writer returns after takeover | It does not push; reconcile its work through the current holder |
| Claim POST times out | Reconcile invocation/claim marker before retrying |
| API read is truncated, rate-limited or permission-denied | Mark evidence incomplete; do not infer absence of holds/claims/checks |
| Issue-body writer races with another writer | Preserve history, detect mismatch, stop overwriting and reconcile |
| Owner stops an active task | Stop affected operations at next safe checkpoint; ticket/lease does not overrule hold |
| Execution is terminated before final handoff | Recover last durable checkpoint/evidence; reconcile actual remote state |
| No capability for the assigned role | Record blocker, use eligible fallback, preserve unmet acceptance requirement |

### 18.5 Review, release and protocol transition

| Scenario | Required response |
| --- | --- |
| Last eligible reviewer is about to become a contributor | Change allocation before authorship; preserve a review path |
| Composite contains copied multi-slot source | Carry union of relevant provenance exclusions; splitting does not erase them |
| Auditor previously merged the work | Enforce current merger exclusion for that review |
| Legacy PR has no recorded slot | Reconstruct documented provenance; no invented independence |
| Seven green jobs but no CLEAR/checklist phrase | Refuse merge under unconditional policy |
| CLEAR belongs to an old head or acceptance revision | Refuse until renewed applicable verdict |
| Later unresolved BLOCK exists | Refuse even if an earlier CLEAR was valid |
| Latest retry is green but first-attempt evidence is required | Apply the accepted attempt rule; do not hide failed required evidence |
| Screenshot files exist but were not visually inspected | Visual acceptance remains incomplete |
| Required live/manual test cannot run | Keep that gate visible; continue unrelated work without claiming completion |
| Merge times out | Inspect actual merge/main state before retrying |
| Main/deployment check completes after Steward ends | Next eligible Verifier owns the durable pending record |
| Main verification fails after a batch starts | Contain dependent releases and initiate scoped incident response |
| Three prompts update, two fail | Stay legacy/shadow or enter controlled recovery; no partial activation |
| Pause stops schedules but a legacy run remains active | Drain/verify it separately; no assumption that pause killed it |
| Run cannot prove whether old queued invocations remain | Hold activation until lifecycle/guard evidence is sufficient |
| Control-event chains conflict | Freeze new affected claims and reconcile under authorized controller |
| Rollback begins with active v3 work | Drain/checkpoint; preserve tasks/approvals/evidence; restore one coherent protocol |
| Legacy cannot safely represent current approved work | Remain contained and prepare compatible recovery; do not force rollback |
| Cleanup moves a referenced image/spec/fixture | Reference/parity validation blocks the cleanup merge |
| Historical task requests branch purge/reset | Canonical status/precedence prevents execution without fresh explicit authorization |

## 19. Measurement and operating thresholds

### 19.1 Baseline and collection

Use existing GitHub timestamps and brief run records; no external telemetry service is necessary. Assign collection to the Lead's reconciliation or a bounded reporting appointment within the five slots. The Task Board can show a compact projection with source links.

Compare at least 24 healthy baseline and stabilization epochs when practicable. If a clean baseline is unavailable, report raw observations and confounders instead of claiming a causal percentage improvement. Account for task size, CI outages, owner waits, scheduler delay and review capability. Do not reward splitting a task into many trivial PRs.

| Metric | Definition/source |
| --- | --- |
| Scheduler delay | Actual start minus nominal scheduled time |
| Startup overhead | Actual start to first task-specific useful action; distinguish mandatory safety work from redundant triage |
| Packet availability | Valid packet available before a worker's admission time, per healthy epoch |
| Ticket usefulness | Assignments that are current, eligible and executable when consumed |
| Intake latency | Accessible source observed/approved to assessment assignment and runnable task publication; distinguish decision waits |
| Claim health | Collisions, unresolved ownership, duplicate starts, expired-writer attempts and fallback frequency |
| Reviewer availability | Tasks with an identified eligible capable independent reviewer before authorship |
| Delivery latency | Accepted task ready-to-build through merged and verified acceptance |
| Review/release latency | CI-ready to review; applicable CLEAR to merge; merge to verification |
| Throughput | Verified acceptance items or coherent milestones plus audited PRs, with scope notes |
| Safety/quality | Unauthorized actions, self-audits, lost evidence, regressions and incomplete verification |
| Human cost | Owner interventions for routine coordination vs genuine product/risk decisions |

### 19.2 Initial trial thresholds

These are proposed defaults for the adoption approval, not claims about current performance:

- Zero tolerated unsafe merges, self-clearances, unauthorized destructive operations or knowingly invalid owner-hold bypasses. Any suspected event triggers immediate scoped containment and investigation.
- Every writable active task must have a recorded eligible review path; every release must have complete applicable evidence.
- Every relevant merge must have a durable verification record; every accessible owner plan older than two healthy cycles must have an assignment or concrete blocker.
- Target at least 95% eligible/current tickets and 90% on-time packet availability over healthy stabilization epochs. Report sample sizes; timing misses are investigated, not used as a reason to skip validation.
- Initial overhead goals: Lead median under five minutes; ordinary assigned-worker median under three minutes. Measure before promising them. Runtime/tool constraints may justify reviewed target changes.
- Repeated global triage in fallback, two consecutive unproductive healthy starts on one appointment, or the aging thresholds in §11 trigger a specific allocation/process correction.

Final adoption requires safe operation and usable new-plan intake. If efficiency gains are unproven, report that honestly and extend or revise the trial. Do not call the transition successful solely because packets are being published.

## 20. Worked examples

All IDs below are illustrative, not current repository tasks or authorizations.

### 20.1 An approved UI redesign arrives while features are being built

The owner submits `CHG-UI-001`, a new Today/Project layout. Intake records the exact artifact and decision. UI Designer maps screens, states and reusable components; Planner maps required project-progress data to existing behavior. Architect is assigned only if contracts/boundaries change. An eligible independent reviewer assesses the canonical package.

The package marks unchanged tasks as unaffected, identifies active PRs touching the redesigned components, and gives them a requirement-level keep/amend/supersede disposition. Builders continue unrelated work. Affected release decisions hold until reconciled. After accepted specs/tasks merge, the Lead assigns UI slices and a capable independent visual/audit path. Code authors do not clear their own screenshots or changes.

If the mockup omits an error state, the package supplies a consistent proposed behavior for review rather than implementing arbitrary behavior. If the owner approves only Today, Project remains deferred. No backend rewrite follows merely because the design source includes hypothetical data.

### 20.2 A new architecture plan replaces a current direction

The owner introduces `CHG-ARCH-001` to change a boundary/data flow. Architect and Migration Planner assess affected contracts, old/new client coexistence, data/offline behavior and staged cutover. Security/Performance roles contribute only where the risk warrants them. The owner decides any material alternatives not already settled.

Accepted contract/spec tasks land before dependent feature work. A compatibility seam permits independently approved UI progress where feasible. Active old-direction PRs are checkpointed and mapped to reused/superseded work; source lineage remains. Architecture completion includes removal of approved temporary adapters and verification of migration outcomes, not merely creation of the new module.

If a live migration is irreversible, the package distinguishes prevention, backup/restore permissions and forward repair from a code revert. Implementation authority does not imply permission to execute that migration live.

### 20.3 The owner provides a new plan during an existing plan review

Intake compares exact revisions. If it is a clarification, reviewers acknowledge the interpretation. If it changes acceptance, the task revision advances and affected CLEAR/release decisions are held. If it is an alternative, the owner chooses before conflicting implementation begins. Independent unaffected tasks continue throughout.

### 20.4 New planning demand exceeds five-slot capacity

The Lead does not create new schedules. It prioritizes the owner's urgent initiative, keeps at most the accepted assessment WIP, preserves review/release capacity, and records other proposals as queued with a next review point. A specialist appointment can persist for several runs, then be released. If all work needs an owner decision, produce one concise decision package instead of five competing proposals.

## 21. Proposed implementation work packages

Introduce approved task IDs into `plan.md` before implementation. The following are a proposed decomposition, not opened tasks or a request to begin work now.

| Package | Deliverable | Depends on / acceptance |
| --- | --- | --- |
| `OPS3-0` Baseline and capability map | Reproducible current-state record | Scoped implementation authorization; no destructive actions |
| `CLN3-0/1/2` Mandatory cleanup | Clear current entry points and safe historical labels | Reference audit; independent review/current CI |
| `OPS3-1` Canonical contract | Authority, modes, role mapping, claims and bounded fallback | Baseline; all relevant entry points agree |
| `OPS3-2` Plan intake/package workflow | Intake receipt, lifecycle, approval and supersession templates | Contract; demonstrate UI and architecture examples |
| `OPS3-3` Review/release enforcement | Unconditional independent acceptance validation | Current gate audit; negative release scenarios pass |
| `OPS3-4` Schemas and protocol checks | Envelope/claim/control/hand-off validation and meaningful scenario tests | Contracts; no false atomic-lock claim |
| `OPS3-5` Compatible startup guard | Same five identities, saved prompt readback and mode handling | Scheduling authorization; safe legacy/shadow behavior |
| `OPS3-6` Shadow and failure rehearsal | Evidence from assignment/intake/failure tests | Capability and enforcement preconditions |
| `OPS3-7` Controlled activation | Paused/drained/reconciled transition and first receipts | Explicit activation authority; full exit gates |
| `OPS3-8` Stabilization | Metrics, delivery/intake evidence and pending-verification audit | At least 24 healthy epochs or explained extension |
| `CLN3-4/5` Deferred retirement/hygiene | Historical index, retained rollback, approved closures/removals | Proven operation; separate destructive scope where needed |

A package can be split into independently mergeable PRs with preserved lineage and dependencies. Do not combine product redesign implementation with coordination cleanup in one umbrella PR. Product initiative tasks follow the same normal planning process and are scheduled as actual capacity permits.

## 22. Proposed saved-task foundation

The adopted canonical contract and exact saved prompt text must agree. This foundation describes the required behavior; it is not a replacement for a slot's verified identity, actual runtime bounds and linked role playbooks.

> You are one of the five existing hourly capacity slots for `Mymayankyadav/lemma`. Use GitHub REST for coordination. Establish your immutable run identity, slot, nominal instance and deadline. Read the short canonical startup and current authorized protocol-control generation/mode. In legacy/shadow, retain legacy authority; in cutover/rollback, do not make new affected writable claims. In active mode, consume your valid current-instance ticket, then read its task, accepted change/requirement revisions, handoff and role playbook. Check current owner holds, dependencies, capability, scope ownership and future independent review availability. Claim/revalidate using run-bound dated leases; never infer ownership from a role name. Recheck before pushes, verdicts and merges. Follow bounded fallback if the ticket is invalid or finished. Discover/register an unseen relevant plan without silently treating it as approved. Assessment, product approval, runnable tasks and live deployment are distinct. Perform useful authorized work, preserve provenance and report exact evidence/next action. Never self-clear, bypass a hold, force-push, execute historical cleanup commands as current work, weaken acceptance to obtain green CI, or merge without unconditional eligible exact-head and accepted-revision clearance plus all applicable evidence. Respect your finish boundary and hand off pending release verification. The `:00` slot normally performs the single hourly intake/global reconciliation and publishes a compact packet, then works; other slots avoid full-backlog triage in the normal path.

Each saved task adds its actual slot/task identity, startup references, role capability limits and verified scheduling/runtime behavior. Unknown fields are not filled with invented values. A prompt cannot grant capabilities the runtime lacks.

## 23. Audit resolution map

This maps each original audit finding to the proposed control. It does not claim those controls have been implemented or tested.

| Audit finding | Proposed resolution | Required future evidence |
| --- | --- | --- |
| F01 Transition barrier | §§15–17: guard, control chain, pause/drain/readback and no activation on uncertainty | Partial-update and old-run/rollback rehearsal |
| F02 Writer identity | §8: immutable run ID, dated claim/lease binding and retry reconciliation | Duplicate, same-role, midnight and takeover scenarios |
| F03 Cross-hour expiry | §§8.2, 10.2–10.3: nominal-instance admission vs claimed-run lifetime | Late and cross-hour start traces |
| F04 Future reviewer | §9 and §11: prospective eligibility and retained lineage | Multi-author/split/composite reviewer mapping |
| F05 Release gap | §12: verify current code; unconditional supplemental/enforced decision and task-specific attempts | Negative gate cases and independently reviewed fix/procedure |
| F06 Scheduled capabilities | §3.3 and Stage 0 | Actual scheduled-role capability evidence |
| F07 Task-source contradictions | §§2, 14 and Stage 1 | Canonical fresh-start readthrough and historical setup labels |
| F08 Packet contract | §10 and §15 | Valid/invalid schema and mode/role/fallback scenarios |
| F09 Merge starvation | §11 priorities/aging | Ready-to-merge latency and assigned Steward actions |
| F10 Affinity vs expiry | §11.3 | Multi-run continuity without idle exclusive lease |
| F11 Cleanup/trial scope | §14 and §§16, 18 | Finite critical cleanup plus controlled failure evidence |
| F12 Integration/verification | §§12.4, 13, 17 | Ordered integration and durable pending verification recovery |
| F13 Measurement | §19 | Defined baseline, sample sizes, collection and decision thresholds |
| F14 Approval overhead | §§5.2, 15.3 | One recorded scope, routine autonomous progression, separate material decisions |
| F15 Snapshot provenance | §§4.3, 14.1 and source note below | Pinned repository baseline, source revisions and manifest |

## 24. Definition of done

### Operating-system adoption

- [ ] Exactly the intended five recurring task identities/schedules serve this workflow; actual state verified.
- [ ] One coherent current startup/protocol and one canonical task definition source exist.
- [ ] Historical destructive instructions cannot be mistaken for runnable work.
- [ ] Scheduled capabilities and real runtime constraints are documented.
- [ ] Claims identify actual runs, dated leases and exact releases; ambiguity stops conflicting actions.
- [ ] Cross-hour admission/continuation and delayed/duplicate starts behave as specified.
- [ ] Control/transition/rollback paths have been rehearsed without losing work or evidence.
- [ ] Every writable task preserves an eligible independent review path.
- [ ] Every release applies unconditional independent acceptance plus current CI/task/owner rules.
- [ ] Pending main/deployment verification is durably assigned and completed.
- [ ] Safety and useful overhead/throughput are measured through stabilization.

### Adaptation to future plans

- [ ] Accessible owner UI/architecture proposals are discovered within healthy reconciliation targets or visibly blocked.
- [ ] Proposal source, approval, accepted revision and supersession boundaries are explicit.
- [ ] Relevant roles receive assessment and implementation assignments without new recurring schedules.
- [ ] Each accepted requirement maps to an approved task and meaningful acceptance evidence or explicit exclusion.
- [ ] Active PRs are reconciled when requirements change; unaffected work continues.
- [ ] Material spec changes cannot reuse stale code-only clearance without reviewer acknowledgement.
- [ ] Duplicates, conflicts, private-source handoffs, partial acceptance and withdrawn plans are handled visibly.
- [ ] Completed initiatives include verified accepted behavior and any required migration/retirement outcome.

### Source and scope note

This revision was prepared from the supplied v2 plan and its audit, without new repository or automation writes or a new live-state inventory. The audit's six read-only repository observations are historical inputs, not a fresh guarantee about current `main` or saved schedules. Implementation starts by revalidating the actual baseline.

Source artifact digests:

```text
Lemma_Agent_System_v2_Cleanup_Transition_Plan.md
SHA-256: 3fd88bcd61b654ae8eef02ec1696cb0cb4e857ba1a770d578feba9f5a524598e

Lemma_Agent_System_v2_Audit_Report.md
SHA-256: 2bfcef0ce226ab416899f724e87a999053894caf3e1edd11d20dc6a22a9ac407
```

**End of proposal. No repository, automation, deployment or application-data changes have been applied.**
