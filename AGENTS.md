# Lemma agent rules — version 1.3 (2026-11-04)

Read CURRENT.md and NEXT.md, then follow these rules. A PR must satisfy the rules version in force when it merges.

## Each run: pick work in this order. Take the first that applies.
1. An open S0 incident with no claimant: claim it and fix it. If it is already claimed, do not touch it. While an S0 is open CI merges nothing, except the claimant's `incident #<n>` PR (see Incidents).
2. Your own open PR, only if it has a failing check or the changes-requested label: fix it. Read the CI comment on the PR first: it names the exact failing rule or check and how to comply. Re-checking your own PR is not work.
3. Any open PR not authored by you whose fast-gate and scope passed and that is not labelled changes-requested: review it (see Review and merge). The label needs-review is only a visual aid; do not wait for it.
4. An open S1 incident with no claimant.
5. An issue labelled bug + confirmed with no open PR, if no other bug PR is open.
6. The top NEXT.md item with Status open, all Needs done, and Assigned empty or your name.
7. One issue labelled bug without confirmed: try to reproduce it (see Bugs).
8. Nothing applies: end the run.
After finishing any step, continue to the next applicable step in the same run. Never invent work outside this list. If you notice a problem, file it as an issue (see Bugs) and continue.

## Claiming and PRs
- The PR is the claim. Before writing code, open a non-draft PR from branch `<agent>/<item>`. Title it `N<id> <summary>`, `bug #<issue> <summary>` or `incident #<issue> <summary>`.
- Line 1 of the PR body: `Agent: <your name> · Item: <id>`. There is no lease: the open PR is the claim. When the PR's Agent has made no commit and no comment for 3 hours, CI adds the label lease-expired and any agent may take the PR over by commenting `Taking over: Agent <name>`.
- Limits: 1 open PR per agent, at most 6 open PRs in total.
- Stay inside the item's Scope. Anything else goes in a new issue, not in the PR.
- Never edit AGENTS.md, .github/**, ci/**, scripts/ci/**, test thresholds or budgets (the paths in ci/protected.json), and never delete, skip or loosen a test. Only PRs titled `rules:` from the priority run may do these things. The required check `scope` enforces this; the required check `fast-gate` runs typecheck, lint, affected tests and a smoke run. When either fails, CI writes the exact failing rule or check and how to comply into one comment on the PR (edited in place on later failures) and into the check's output summary; you cannot read CI logs, so use that comment.
- CI opens its own PRs as `Agent: ci` (`revert #<pr>` and `ci: perf calibration`). Do not edit or close them.

## Too big or stuck
- There is no "infeasible". If an item is too large, open a PR titled `N<id> split` that replaces it in NEXT.md with sub-items N<id>.1, N<id>.2, …, each with its own Done/Scope/Not, and that also implements sub-item N<id>.1 (code plus its test) in the same PR; list only the remaining sub-items N<id>.2, N<id>.3, … in NEXT.md. `scope` fails a split PR that changes only NEXT.md. Each sub-item must change code and add a test.
- If a run ends without progress on an item, comment `No progress: · Agent: <name> · <one line on what you tried>`. CI adds the label escalate after 3 such comments from at least 2 different `Agent:` names. Escalated items go to the priority run; skip them until then.

## Stages (set by the priority run, never by agents)
- Build: new feature behind a flag in src/flags.ts, default off. Blocking checks are fast checks only. Known bugs go on the item's list and are fixed when they block progress.
- Harden: bug hunting. A legitimate PR is a new failing test with its fix, or a failing test filed as a bug.
- Stable: every blocking check must pass (fast-gate, scope, the full suite on main). Timing-based checks run in perf-report and never block; only the priority run changes budgets. Any regression is an incident.

## Bugs
- Anyone may file a bug: an issue labelled bug, with exact reproduction steps and the expected and actual results.
- It becomes confirmed when a different agent reproduces it and adds confirmed plus a severity label, or when a failing test shows it.
- A fix PR must add a regression test that fails without the fix.

## Incidents (escalation matrix)
| Level | Trigger | Action |
| S0 | main red, deploy broken, data or security risk | CI merges nothing, except the one PR titled `incident #<n>` that fixes that incident (the earliest opened, if there are several); reviewers review it before anything else. An automatic revert PR is merged by CI. Otherwise claim the incident and fix it. |
| S1 | the same failure signature on 2 or more PRs | One owner fixes it on its own PR. Affected PRs must not patch it locally; they wait, then update from main. |
| S2 | a failure on one PR only | That PR's author fixes it. |
| S3 | unreproduced report | Leave it for the priority run. |
CI creates incidents and names them by failure signature. Before acting on any failure, search open incidents for the same signature. Unresolved S1 for 2 runs becomes S0.

## Review and merge
CI merges. Agents never merge, never update a branch from main for the sake of merging, and never remove labels.
- The reviewer reads the whole diff. It checks that the scope matches the item, the tests are meaningful, and the PR complies with the current rules version.
- To pass: comment exactly `Approve · Agent: <your name>` (nothing else in the comment).
- To fail: comment exactly `Changes requested · Agent: <your name>: <what to change>`. CI adds the label changes-requested; the author's next push removes it, and the PR then needs a fresh approval.
- CI squash-merges when all of these hold: the approval's Agent name differs from the PR's `Agent:` line; fast-gate and scope are green on the current head; the label changes-requested is absent; no S0 freeze applies (except for the incident's own fix PR). Any push after an approval voids it. `rules:` PRs are merged by the Owner only. Revert and calibration PRs keep their own CI path.
- Never approve your own PR. The full suite runs on main after merging. If it fails, CI reverts the culprit PR automatically and reopens its item. Do not fix forward.

## Communication
- Comment on a PR only when you pushed a commit, gave a review verdict (`Approve` or `Changes requested`, exact formats above), wrote `No progress:`, or are taking over an expired PR. Never post a status-only comment, and re-checking your own PR is not work.
- After a push, one comment in this format: `Done: … / Pending: … / Next: …` (5 lines maximum), signed with a last line `Agent: <your name>`.

## Owner tasks given directly
- If the Owner gives you a task directly, add it in your PR to NEXT.md as a new item with the next unused ID, placed where the Owner said (top if unspecified), with `Assigned: <your name>`. Put the line `Owner task: "<Owner's exact words>"` in the PR body, after line 1.

## Safety
- Never push to main or force-push. No secrets in code, PRs or comments.
- Supabase: project yemqnhnztlbyxmjxidis only, with schema changes only through migrations.
- No new dependencies unless the item says so.
- If you change what exists or what is broken, update CURRENT.md in the same PR.
