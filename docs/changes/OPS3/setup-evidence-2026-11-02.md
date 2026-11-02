# OPS3-5 external setup evidence — blocked inventory (2 November 2026)

**Status: BLOCKED BEFORE SAVED-PROMPT INSTALLATION. Retain legacy authority. No active v3 protocol.**

This is an agent-authored handoff of the owner's interactive setup authorization. It is **not** an owner-authored GitHub approval, scheduled-run receipt, new protocol control event, or claim that a task was changed.

## Reconciled immutable setup evidence

- Setup RUN: [#455 comment 6572371195](https://github.com/Mymayankyadav/lemma/issues/455#issuecomment-6572371195), returned GitHub run/comment ID **6572371195**; invocation nonce `ops3-setup-20261102T081712108Z`; interactive clock proxy `2026-11-02T08:17:12.108Z` (not an actual scheduler start).
- Exclusive OPS3-5 **evidence-only** claim: [#455 comment 6572375602](https://github.com/Mymayankyadav/lemma/issues/455#issuecomment-6572375602). Read back both comments against all 1,059 #455 comments then visible, with no new conflicting claim. The earlier interactive OPS3-PREP claim [6571926727](https://github.com/Mymayankyadav/lemma/issues/455#issuecomment-6571926727) was explicitly released by [6572261643](https://github.com/Mymayankyadav/lemma/issues/455#issuecomment-6572261643). Claim expiry is **not** proof of writer termination.
- The current user's separate interactive setup instruction authorizes the specified gated schedule installation; that authority has not yet been exercised because identity and release evidence are missing. Do not attribute this chat instruction to a GitHub owner comment.
- [#764](https://github.com/Mymayankyadav/lemma/issues/764) remains the NOT ACTIVE placeholder with zero observed packet comments. #455 had no adopted OPS3 control/genesis event in the complete observed scan. No control generation or mode transition invented.

## Pinned repository protocol

- OPS3-PREP [PR #765](https://github.com/Mymayankyadav/lemma/pull/765) **merged** with source full head `24e76848d2ab8eb1e84d33b5581362398da84442`; squash merge commit `63a4e59b3bd2b7be1a6e19c3019633abf0e96978`.
- Canonical `lemma.agent.v3` digest **independently recalculated from the seven sorted files at that merged commit**, using `path + LF + UTF-8 file bytes + LF` for each, SHA-256: `22c076a9583d59e6cc81ec6b114b90ff9a892a757efb02adca3e95e03c1fe1dd`; matches #765 candidate digest. This pins repository content, **not** an installed task prompt.
- Required independent full-head review of #765 was **not present**: observed review submissions = 0; no AUDIT CLEAR. Exact-head workflow [CI run 41410885575](https://github.com/Mymayankyadav/lemma/actions/runs/41410885575) = **failure**, with `check` and `e2e-1-of-4` failed; `qa3-screens` skipped; `mcp-sql` and the other three E2E shards passed. Owner's exceptional early merge was logged explicitly, not a passing release gate. Post-merge protocol/main verification remains required.
- Canonical executable release-enforcement [PR #749](https://github.com/Mymayankyadav/lemma/pull/749) was observed OPEN and not green/independently cleared. Mandatory [release supplement](../../agents/release.md) applies; do not create a competing fix or waive its independent review.

## Exhaustive accessible scheduler inventory

The authenticated Automations **list and peek** both returned **"Found 0 automations"**; list showed `automations=[]`, `cursor=null`, `paused_count=0`. There were no additional returned pages. This establishes **zero tasks exposed to this setup context**, **NOT** proof that five Lemma schedules or the unrelated Carrel workflow do not exist in another scope.

| Requested IST slot | Actual saved task ID | Complete saved prompt and digest | Actual recurrence/zone | Enabled / running / queued |
| --- | --- | --- | --- | --- |
| :00 | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |
| :15 | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |
| :30 | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |
| :45 | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |
| :50 | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |

The requested target titles are Lead / Worker / Worker / Review / Worker for the slots above; **none were applied**. An additional Planner cannot be identified or paused. Actual identities, old prompts, prompt hashes, enabled-state rollback snapshot, observed runtime ceiling, full runtime capabilities and any active/queued invocations all remain **UNKNOWN**. Interactive GitHub connector success is **not** scheduled capability evidence.

**No automation was created, edited, enabled, paused, run-now, or deleted.** No unrelated schedule/Carrel workflow was touched. No genesis, control adoption, shadow packet, activation, cutover, live database action, deployment, branch purge or product scope change occurred.

## Gate and precise next action

1. Restore visibility/access to the **actual existing five saved ordinary ChatGPT tasks**, or provide a verified inventory in a controller context that can act on those same IDs. Reconcile account/team scope, paging, intended slots, duplicates, extra Planner and any active/queued runs. Do **not** create five replacement schedules.
2. Independently audit merged #765 content and required exact-head/main verification after its failed CI; repair under existing safe release authority with reviewed PR and rerun full non-weakened required CI. Preserve #749 as the canonical executable fix and independently reviewed mandatory release supplement.
3. Only after these gates: capture private rollback prompt/config snapshots, install/read back all five byte-exact shared prompts using actual IDs and slots under retained legacy/shadow, collect five scheduled startup ACKs plus runtime capability/guard evidence, shadow/rehearsal and safe lifecycle/drain proof; publish future #764 packet and active control only when transition.md gates actually pass.
4. This documentation PR is **evidence-only** and requires independent review plus eligible CI before merge; do not mark it Ready or infer delivery while pending. The authorized controller alone may later perform externally permitted schedule/control mutations. Pending tasks may gather evidence but cannot install schedules by assumption.

No schedule or approval claims are inferred from the current repo's older agent logs. Pending release/main incidents remain owned under existing safe authority.
