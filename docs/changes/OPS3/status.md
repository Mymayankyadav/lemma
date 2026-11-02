# OPS3 adoption evidence and honest status

Repository preparation: PR #765. Owner supplied exact source and requested implementation; explicitly **no schedule create/modify operations here**. Agent-authored authority handoff: https://github.com/Mymayankyadav/lemma/issues/455#issuecomment-6571926727 . This is not an owner-authored GitHub comment. No product redesign, live deployment, destructive cleanup or activation is inferred.

| Gate | Status / evidence |
| --- | --- |
| Exact source preserved | `source.md`; SHA-256 in `baseline.json` |
| Reproducible baseline | commit/tree/inventory, 28 open PR heads, pinned coordination issues, main failures and claim scan recorded |
| Mandatory instruction cleanup | proposed in #765; no moves/deletes or app/data edits |
| Contract, playbooks, templates, executable scenarios | prepared in #765; validation results in PR handoff |
| Independent exact-head review / full CI | pending; preparation author cannot issue CLEAR |
| Conditional audit enforcement gap | current #748/#749; use mandatory `docs/agents/release.md` supplement, independently reviewed with this PR |
| Saved identities, enabled state, extra Planner | UNKNOWN; not inspected or changed here |
| Scheduled capabilities, supported runtime | UNKNOWN; interactive REST/node successes are not scheduled proof |
| Five saved prompts + digest readback + runtime guard acks | pending external setup; generated prompt is not an installed prompt |
| Shadow assignment/intake/failure runtime evidence | pending; local scenarios are supplemental only |
| Pause/drain old/queued invocations | pending; no expiry-based termination assumption |
| Authorized activation, first future packet and five receipts | pending; NOT ACTIVE |
| At least 24 healthy stabilization epochs | pending; no performance-improvement claim |
| Optional archives/branch cleanup | deferred; no destructive scope authorized |

Stages OPS3-5 through OPS3-8 are tracked in `plan.md`; issues are projections, not a competing task list. Do not mark adoption complete because docs or packet templates exist.

## External OPS3-5 setup attempt (2026-11-02; evidence PR pending independent review)

See [sanitized setup evidence](setup-evidence-2026-11-02.md), [immutable interactive RUN](https://github.com/Mymayankyadav/lemma/issues/455#issuecomment-6572371195) and [read-back exclusive evidence claim](https://github.com/Mymayankyadav/lemma/issues/455#issuecomment-6572375602). A separate owner interactive request authorized this gated setup; this paragraph is **agent-authored** and is not an owner-authored GitHub decision. GitHub scheduler inventory via both list and peek exposed **zero accessible automations** (null cursor), so no five saved IDs/prompts/states or extra Planner could be verified and no schedules were changed. Do not interpret zero accessible tasks as proof of deletion. Required #765 independent full-head audit is absent; exact-head CI run 41410885575 failed (`check`, `e2e-1-of-4`; `qa3-screens` skipped). #749 remains open. The seven-file canonical merged protocol digest at `63a4e59b3bd2b7be1a6e19c3019633abf0e96978` was recalculated as `22c076a9583d59e6cc81ec6b114b90ff9a892a757efb02adca3e95e03c1fe1dd`. This is **not** a saved-prompt digest. The stage is blocked before installation. No genesis, control/cutover/active transition or completed receipts are asserted. Evidence PR requires independent review and CI before merge.
