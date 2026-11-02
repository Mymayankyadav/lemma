# OPS3 addendum A — owner squash-merge authority

**Owner-adopted policy, 2 November 2026. Applies immediately to repository preparation and every operating mode: legacy, shadow, cutover, active and rollback.** This is a subject-specific exception to autonomous agent release gates in `AGENTS.md`, OPS3 source §§1–2,9,12,15–16, the release supplement, retained legacy rules and any saved setup/worker prompt. Those gates remain defaults for autonomous agents; they do not constrain the owner's own merge decision. A prompt requiring pre-merge green CI/CLEAR must recognize the alternative below rather than reject the owner's recorded decision or demand that it be repeated.

## 1. What constitutes permission

The owner, **Mymayankyadav**, may personally squash-merge **any PR** to `Mymayankyadav/lemma`'s `main` to expedite work. A verified owner squash merge is itself **explicit approval and permission to integrate that exact PR's merged contents**, including its plan/spec/task/policy amendments. No additional approval comment, Ready marker, independent CLEAR, successful CI, performance-budget result, lease expiry or protocol-mode transition is required for that owner merge to be legitimate under this protocol. This is `OWNER_OVERRIDE`, a separate valid release route, not an `AUDIT CLEAR` or a successful ordinary gate.

The same rule applies when the owner explicitly instructs an agent to squash-merge a specific PR/current identified revision, including an instruction such as “Merge this PR without waiting for CI.” The agent may perform that one requested merge, recording its own execution and the actual owner instruction. It must bind the request to a fresh full head SHA; a material new change after the instruction is not silently included. A batch request covers only the identified batch. An owner instruction directed at one PR is not permission to merge every PR later.

An explicit request to implement/edit a PR or add a policy, by itself, does not delegate arbitrary immediate merges. This addendum gives the owner freedom to merge; it does not give agents standing freedom to merge as the owner.

## 2. Attribution and evidence

Confirm actual merged state, repository/base, full source head at merge, squash merge commit SHA, merger attribution and decision reference using GitHub PR/commit/timeline records. A personally performed owner squash merge needs no second permission message. An owner's attributable statement that they personally performed the merge is also sufficient attribution when linked to the actual merged PR. For delegated merges, link the specific instruction or an accurate agent-authored handoff of that instruction; never present the handoff as an owner-authored GitHub comment.

Agents and owner may share a GitHub identity. `merged_by.login=Mymayankyadav` or a commit author alone therefore does not turn a known autonomous agent merge into an owner decision. Agents must identify their own merges in PR/Agent Log records. If a merge is attributed to an agent, its specific owner instruction is required for this route; absence of CLEAR/CI does not itself prove owner authorization. Where origin is genuinely ambiguous, reconcile actual records or seek one provenance clarification, without asking the owner to reapprove an already evidenced decision. Never fabricate a human action, owner instruction or passing gate.

Record `OWNER_OVERRIDE` with PR URL, source head, merge SHA, owner action or delegated-instruction reference, actual executing actor/run, permission scope, available CI/audit findings and follow-up. Record failures as failed, missing review as not performed, and pending checks as pending. Do not require agents to tick unmet normal-release checklist items or erase a BLOCK to acknowledge the merge.

## 3. Scope of the exception

| Owner action / merged contents | Binding effect |
| --- | --- |
| Owner squash-merges a PR while CI is failing/pending/missing, including strict performance failures | Accept that exact integration and its disclosed/unmet release gates; do not treat missing pre-merge green CI/CLEAR as an approval violation or automatically undo it |
| Owner squash-merges a plan/spec/protocol amendment | Approve the exact merged scope and explicit supersession; approved task definitions may proceed when their remaining factual dependencies are met |
| PR explicitly changes a named performance budget, retry/measurement rule, required check or gate | The merged documented policy change is owner-approved at that scope/revision; agents may align affected specs, tests, workflows and operational references consistently within the approved change |
| PR contains no budget/test-policy change | Its integration exception does **not** silently change a global threshold or authorize deleting/skipping unrelated tests; report the existing failure honestly and propose a scoped correction if needed |
| Owner-approved prerequisite is already merged, but an old setup prompt requires its pre-merge CI/CLEAR | Recognize `OWNER_OVERRIDE` as satisfying the prerequisite's release/approval gate and continue authorized guarded setup; do not recreate the same approval deadlock |

An owner merge approves source integration and any explicit policy changes in that source. It does not assert that broken behavior is correct, that tests passed, that work is independently audited or that live acceptance has happened. Keep substantive findings open until repaired, verified, or explicitly accepted/deferred/withdrawn by a scoped owner decision. An audit BLOCK is not silently converted to CLEAR; its **merge-blocking effect for that exact owner decision** is overridden.

No owner merge is automatic permission to access another project, reveal secrets, reset live data, purge branches, provision accounts, mutate schedules or perform a separate production/migration operation. Such operations follow their actual requested scope. A merged approved schedule-installation package is allowed to be installed under an existing owner setup request; it must not wait for scheduled-runtime evidence that can only be gathered after installing the compatible guard.

## 4. Installation and activation are separate

For OPS3 prerequisites accept **either** (a) ordinary CI/independent-release acceptance **or** (b) verified `OWNER_OVERRIDE` for the exact merged package. A stricter retained sentence is qualified by this addendum. Do not require green historical checks or a retroactive independent CLEAR merely to install compatible guarded prompts, assess plans or continue unrelated authorized work.

Install the same five prompts under the existing explicit setup authorization, preserve initial enabled states and legacy/shadow authority, read back actual identities/text/digests, then collect runtime capabilities and guard acknowledgements through existing invocations. No one must first prove runtime acknowledgements from uninstalled v3 prompts. If any required identity/access is unavailable, report that concrete blocker; an owner merge cannot manufacture tool access or task IDs.

A preparation/policy merge is **not automatic active mode**. Actual installed-prompt coherence, control events, live/queued writer reconciliation and factual capability/drain evidence remain required before consequential active-mode operation. If the owner explicitly directs a different transition, record that scope accurately; never describe a waived prerequisite as evidence that it was completed.

## 5. Verification after an owner merge

Record owner-authorized integration as complete immediately. Record runtime/test/rollout verification separately as pending, passed, failed, or explicitly owner-accepted/deferred risk. Name the next capable verifier and repair/review task where needed. Follow up without automatically reopening the same pre-merge approval requirement, demanding rollback solely for red CI, or freezing independent approved work. A specific demonstrated correctness/security/data-loss incident may justify scoped containment; a timing-budget failure or missing former merge evidence alone is not a blanket freeze.

Ordinary autonomous merges still use `evaluateMergeGate` and `evaluateRelease` unchanged. For an owner-authorized exception, retain any actual ordinary-gate rejection and log the separate `OWNER_OVERRIDE` evidence instead of setting `generic_gate_ok`, CI booleans, reviewer provenance or audit fields to fictitious values. Server-enforced GitHub restrictions still apply; this policy does not disable protections or provide unavailable credentials.

## 6. Existing OPS3 decision

PR **#765**, source head `24e76848d2ab8eb1e84d33b5581362398da84442`, was squash-merged as `63a4e59b3bd2b7be1a6e19c3019633abf0e96978` following the owner's explicit instruction **“Merge pr without waiting for ci”**. The instruction and delegated execution are recorded in [PR comment 6572254151](https://github.com/Mymayankyadav/lemma/pull/765#issuecomment-6572254151) and [Agent Log handoff 6572261643](https://github.com/Mymayankyadav/lemma/issues/455#issuecomment-6572261643).

Treat #765 as owner-approved repository preparation. Its missing pre-merge independent review and CI success no longer block compatible guarded installation under the separately given setup request. Report and repair actual CI findings separately. Do not require #765 to be remerged or pretend its historical checks passed. No schedules were changed by that merge and no active-mode evidence is inferred.
