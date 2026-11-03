# Lemma agent rules — version 1 (2026-11-04)

Read CURRENT.md and NEXT.md, then follow these rules. A PR must satisfy the rules version in force when it merges.

## Each run: pick work in this order. Take the first that applies.
1. An open S0 incident with no claimant: claim it and fix it. If it is already claimed, do not touch it, and do not merge anything until it is closed.
2. Your own open PR: fix its failing checks or address review.
3. One PR labelled needs-review that you did not author: review it (see Review and merge).
4. An open S1 incident with no claimant.
5. An issue labelled bug + confirmed with no open PR, if no other bug PR is open.
6. The top NEXT.md item with Status open, all Needs done, and Assigned empty or your name.
7. One issue labelled bug without confirmed: try to reproduce it (see Bugs).
8. Nothing applies: end the run.
After finishing a step, go back to 1 if time remains. Never invent work outside this list. If you notice a problem, file it as an issue (see Bugs) and continue.

## Claiming and PRs
- The PR is the claim. Before writing code, open a non-draft PR from branch `<agent>/<item>`. Title it `N<id> <summary>`, `bug #<issue> <summary>` or `incident #<issue> <summary>`.
- Line 1 of the PR body: `Agent: <your name> · Item: <id> · Lease until <ISO-8601 UTC, at most 3 hours ahead>`. Renew the lease on every push. An expired lease may be taken over by commenting `Taking over: Agent <name>`.
- Limits: 1 open PR per agent, at most 6 open PRs in total.
- Stay inside the item's Scope. Anything else goes in a new issue, not in the PR.
- Never edit AGENTS.md, .github/workflows/**, test thresholds or budgets, and never delete, skip or loosen a test. Only PRs titled `rules:` from the priority run may do these things. CI enforces this.

## Too big or stuck
- There is no "infeasible". If an item is too large, open a PR titled `N<id> split` that replaces it in NEXT.md with sub-items N<id>.1, N<id>.2, …, each with its own Done/Scope/Not. Each sub-item must change code and add a test.
- If a run ends without progress on an item, comment `No progress: <one line on what you tried>`. CI adds the label escalate after 3 such comments from at least 2 different agents. Escalated items go to the priority run; skip them until then.

## Stages (set by the priority run, never by agents)
- Build: new feature behind a flag in src/flags.ts, default off. Blocking checks are fast checks only. Known bugs go on the item's list and are fixed when they block progress.
- Harden: bug hunting. A legitimate PR is a new failing test with its fix, or a failing test filed as a bug.
- Stable: every check blocks. Any regression is an incident.

## Bugs
- Anyone may file a bug: an issue labelled bug, with exact reproduction steps and the expected and actual results.
- It becomes confirmed when a different agent reproduces it and adds confirmed plus a severity label, or when a failing test shows it.
- A fix PR must add a regression test that fails without the fix.

## Incidents (escalation matrix)
| Level | Trigger | Action |
| S0 | main red, deploy broken, data or security risk | Merges freeze. If an automatic revert PR exists, merge it first. Otherwise claim the incident and fix it. |
| S1 | the same failure signature on 2 or more PRs | One owner fixes it on its own PR. Affected PRs must not patch it locally; they wait, then update from main. |
| S2 | a failure on one PR only | That PR's author fixes it. |
| S3 | unreproduced report | Leave it for the priority run. |
CI creates incidents and names them by failure signature. Before acting on any failure, search open incidents for the same signature. Unresolved S1 for 2 runs becomes S0.

## Review and merge
- The reviewer reads the whole diff. It checks that the scope matches the item, the tests are meaningful, and the PR complies with the current rules version.
- To pass: update the branch from main if it is behind, wait for the PR checks to pass, squash-merge, then remove the label.
- To fail: comment the exact required changes and label the PR changes-requested.
- Never merge your own PR. The full suite runs on main after merging. If it fails, CI reverts the culprit PR automatically and reopens its item. Do not fix forward.

## Communication
- At most one comment per PR per run, in this format: `Done: … / Pending: … / Next: …` (5 lines maximum). No status posts anywhere else.

## Owner tasks given directly
- If the Owner gives you a task directly, add it in your PR to NEXT.md as a new item with the next unused ID, placed where the Owner said (top if unspecified), with `Assigned: <your name>`. Put the line `Owner task: "<Owner's exact words>"` in the PR body, after line 1.

## Safety
- Never push to main or force-push. No secrets in code, PRs or comments.
- Supabase: project yemqnhnztlbyxmjxidis only, with schema changes only through migrations.
- No new dependencies unless the item says so.
- If you change what exists or what is broken, update CURRENT.md in the same PR.
