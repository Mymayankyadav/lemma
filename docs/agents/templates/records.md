# Append-only record shapes (replace every placeholder)

## RUN

`RUN nonce=<invocation-marker> agent_id=<verified enrollment ID> invocation_id=<actual unique source instance> kind=<scheduled|interactive|ci|external> nominal_at=<actual RFC3339 or null when not applicable> started_at=<RFC3339> timing_source=<actual/proxy> runtime_minutes=<verified value/evidence> runtime_policy_ref=<actual policy> deadline_ceiling=<actual source deadline> handoff_minutes=<actual reserve> finish_by=<RFC3339> generation=<adopted> role_history=<roles>`

Returned GitHub comment ID supplies `run_id=run:<id>`. Follow ../runtime-admission.md: use verified source runtime OR an accepted work policy, recording runtime_basis, runtime_verified=false for work-policy, known source ceiling or null, and actual work-policy reference. Missing source maximum alone does not block the accepted work-policy route. Prefer scheduler invocation ID; otherwise use labelled local:<nonce> bound to immutable RUN.

## BIND (future tickets only)

`BIND id=<returned numeric comment ID> packet_reference=<actual packet URL> ticket_id=<actual one-time future ticket> agent_id=<enrolled agent> generation=<adopted> run_id=<actual immutable RUN> invocation_id=<actual scheduler ID or labelled local nonce> bound_at=<actual RFC3339>`

Read all relevant bindings, call resolveTicketBinding, then admitTicket and the independent scope claim. Earliest valid immutable BIND wins; a consumed ticket cannot be reused by another run. A binding does not grant a write lease or merge authority.

## CLAIM / RELEASE

`CLAIM id=<returned-comment-id> run_id=<run> agent_id=<actual registered identity> scope=<canonical scope + overlapping paths> accepted_revision=<task/change revision> branch_or_pr=<ref> head_sha=<40 hex> role=<playbook> generation=<adopted> starts_at=<RFC3339> expires_at=<RFC3339 no later than run_finish_by> run_finish_by=<actual invocation finish>`

PR: `Owner: <role> · Run: <run> · Claim: <exact comment URL> · Lease until <RFC3339>`

`RELEASE claim_id=<exact claim ended> run_id=<same holder> at=<RFC3339> outcome=<checkpoint/completed/blocked> next=<one action>`

## PROTOCOL CONTROL

```json
{"event_type":"PROTOCOL_CONTROL","id":"actual returned numeric comment ID","controller_run_id":"actual controller run","authorization_reference":"actual scoped owner decision/handoff","generation":"adopted positive integer","mode":"legacy/shadow/cutover/active/rollback","effective_at":"RFC3339","repository_commit":"full canonical commit","protocol_digest":"actual canonical SHA-256","applies_to":["actual verified target agent IDs (any authorized cohort size)"],"supersedes":"actual predecessor numeric ID; null only authorized legacy genesis","claim_reference":"exclusive transition claim URL","rollback_reference":"coherent retained snapshot"}
```

This placeholder JSON is deliberately not a valid event. Resolve actual authorization, predecessor/chain and capability/install/drain gates outside this record before calling validateControl; never set evidence booleans without linked readback. Mode projections cannot authorize control.

## HANDOFF

RUN / AGENT / INVOCATION / CLAIM / ROLE / PATHS / FINISH BY; TASK / CHANGE / ACCEPTED REVISION; PR / FULL HEAD / OBSERVED BASE; STATE; VERIFIED exact runs/artifacts; ATTEMPTED and outcome; REQUIREMENTS coverage/unmet changes; DEPENDENCIES / HOLDS; PROVENANCE contributor/copy/merger/eligible reviewer; PENDING; NEXT one action; RELEASE or exact dated expiry. Preserve detailed history, refresh compact latest links only under claimed ownership.

## AUDIT

`AUDIT CLEAR|BLOCK head_sha=<40 hex> accepted_revision=<exact> reviewer_run=<run> agent_id=<actual verified enrollment> provenance=<contributors/copies/mergers/exclusions + evidence URL> coverage=<whole diff and requirements> evidence=<CI/run/attempt/artifact/visual/live URLs> findings=<none or concrete unresolved> next=<action>`

## RELEASE DECISION / VERIFY

DECISION: PR/head/base/task/change/spec revisions; run/claim; fresh source URLs; owner holds/permission; seven exact-head CI identities/attempts + task acceptance; independent verdict URL/provenance; dependencies/integration/migration order; generic gate and supplement result/reasons; verification destination. VERIFY after merge: actual merge SHA; main/deploy/smoke/live required checks; state pending/pass/fail; eligible verifier/next participant; evidence; failure containment action. Do not fill merge SHA before the remote outcome is known.

## CAPABILITY

actual agent/source environment + date; capability; verified/unavailable/unknown; exact safe test/evidence URL; tool/runtime limits; valid-through/recheck trigger; eligible roles; missing acceptance steps. Interactive capabilities do not transfer to scheduled environments.

## EPOCH MEASUREMENT

epoch + healthy/affected status; scheduled delay with actual/proxy source; first useful action/startup cost; packet ready/admission/current eligibility; intake ready/assessment/task-publication times minus owner waits; claim collisions/fallbacks; preserved reviewer paths; task ready/build/review/merge/verified times; accepted milestone scope; incidents and owner interventions. Raw sample sizes/confounders first; no causal percentage without comparable baseline.
