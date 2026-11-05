# Lemma agent rules — version 1.4 (2026-11-05)

Read CURRENT.md and NEXT.md, then follow these rules. A PR must satisfy the rules version in force when it merges.

## Names
- Valid Agent names: `lemma-<n>` (scheduled tasks); `chat-<n>#<tag>` (ordinary chats); `owner-setup*`; `priority`; `ci`. Sign every PR line 1, verdict, Ready and Plan with your name. CI ignores verdicts from any other name, and `scope` fails a PR whose line-1 name is invalid.
- Chat agents: at your first run, choose a 4-character tag (4 random lowercase letters or digits) and sign as chat-<n>#<tag> for the whole conversation. Keep that name until the chat ends.
- Session lock: CI remembers the last tag and time seen for each chat-<n>. If a different tag uses the same chat-<n> within 3 hours of the last activity, its PR fails `scope`, its verdicts are ignored, and CI replies: "chat-<n> is in use by session <tag> until <time>; pick another number". Choose another number and a new tag; never reuse someone else's.

## Each run: Plan first, then pick work in this order
After reading CURRENT.md and NEXT.md, post one comment on your closed issue `run-log: <base name>` (the base name is your name without `#<tag>`; if the issue is missing, create it and close it): `Plan · Agent: <name>: 1) … 2) … 3) …`. List every step from the order below that applies right now, with PR or item numbers. A plan must include every applicable step; leaving one out is recorded. Before ending the run, edit that same comment and add `Result: 1) done|skipped because … 2) … 3) …`. That comment is your only run comment.

1. An open S0 incident with no claimant: claim it and fix it. If it is already claimed, do not touch it. While an S0 is open CI merges nothing, except the claimant's `incident #<n>` PR (see Incidents).
2. Your own open PR with a failing check or the changes-requested label: fix it. Read the CI comment on the PR first: it names the exact failing rule or check and how to comply.
3. Review one PR labelled needs-review that you did not author (see Review and merge). Review only PRs with that label.
4. Continue your own unfinished PR toward its Done. When you believe Done is met, comment exactly `Ready · Agent: <name>`.
5. An open S1 incident with no claimant.
6. An issue labelled bug + confirmed with no open PR, if no other bug PR is open.
7. The top NEXT.md item with Status open, all Needs done, and Assigned empty or your name, only if you have no open PR.
8. One issue labelled bug without confirmed: try to reproduce it (see Bugs).
9. Nothing applies: end the run.

After finishing a step, continue to the next applicable step in the same run. Never invent work outside this list. If you notice a problem, file it as an issue (see Bugs) and continue.

## Claiming and PRs
- The PR is the claim. Before writing code, open a non-draft PR from branch `<agent>/<item>`. Title it `N<id> <summary>`, `bug #<issue> <summary>` or `incident #<issue> <summary>`. You may open it early and finish it over several runs, but it is reviewed only after you post Ready.
- Line 1 of the PR body: `Agent: <your name> · Item: <id>`. There is no lease: the open PR is the claim.
- One PR per item: `scope` fails a PR whose Item already has another open PR. When the PR's Agent has made no commit and no comment for 3 hours, CI adds the label lease-expired. To take it over, push commits to the existing PR's branch and change its line 1 to your name; never open a second PR for the item.
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
- Ready: when you believe your PR's Done is met, comment exactly `Ready · Agent: <your name>`. CI adds the label needs-review when that comment is newer than your last push and fast-gate and scope pass. Any new push removes needs-review: post Ready again. Reviewers review only PRs labelled needs-review.
- The reviewer reads the whole diff. It checks that the scope matches the item, the tests are meaningful, and the PR complies with the current rules version.
- To pass: comment exactly `Approve · Agent: <your name>` (nothing else in the comment).
- To fail: comment exactly `Changes requested · Agent: <your name>: <what to change>`. CI adds the label changes-requested; the author's next push removes it, and the PR then needs a fresh Ready and a fresh approval.
- CI squash-merges when all of these hold: an approval whose Agent name differs from the PR's `Agent:` line; fast-gate and scope are green on the current head; no standing changes-requested; no S0 freeze applies (except for the incident's own fix PR). Any push after a verdict voids it. Per agent only the latest verdict on the current head counts; duplicates are ignored. Verdicts from an invalid name or a locked chat session are ignored, and CI posts one comment explaining the valid formats. `rules:` PRs are merged by the Owner only. Revert and calibration PRs keep their own CI path.
- Never approve your own PR. The full suite runs on main after merging. If it fails, CI reverts the culprit PR automatically and reopens its item. Do not fix forward.

## Communication
- The per-run comment is the Plan and Result on `run-log: <base name>` (see "Each run"). It is the only comment you post outside a PR.
- Comment on a PR only when you pushed a commit, posted Ready, gave a review verdict (`Approve` or `Changes requested`, exact formats above), or wrote `No progress:`. Never post a status-only comment, and re-checking your own PR is not work.
- After a push, one comment in this format: `Done: … / Pending: … / Next: …` (5 lines maximum), signed with a last line `Agent: <your name>`.
- CI keeps `agent-metrics` (plans, steps done, plans that left out a review, plans with no Result). Only the priority run reads it; agents never edit it.

## Owner tasks given directly
- If the Owner gives you a task directly, add it in your PR to NEXT.md as a new item with the next unused ID, placed where the Owner said (top if unspecified), with `Assigned: <your name>`. Put the line `Owner task: "<Owner's exact words>"` in the PR body, after line 1.

## Safety
- Never push to main or force-push. No secrets in code, PRs or comments.
- Supabase: project yemqnhnztlbyxmjxidis only, with schema changes only through migrations.
- No new dependencies unless the item says so.
- If you change what exists or what is broken, update CURRENT.md in the same PR.
