# Lemma agent rules — version 2.0 (2026-11-06)

Read CURRENT.md, the notes in docs/current/ and NEXT.md, then follow these rules. A PR must satisfy the rules version in force when it merges.

## Names
- Valid Agent names: `lemma-<n>` (scheduled tasks); `chat-<n>#<tag>` (ordinary chats); `owner-setup*`; `priority`; `ci`. Sign every PR line 1, verdict, Ready and Plan with your name. CI ignores verdicts from any other name, and `scope` fails a PR whose line-1 name is invalid.
- Chat agents: at your first run, choose a 4-character tag (4 random lowercase letters or digits) and sign as chat-<n>#<tag> for the whole conversation. Keep that name until the chat ends.
- Session lock: CI remembers the last tag and time seen for each chat-<n>. If a different tag uses the same chat-<n> within 3 hours of the last activity, its PR fails `scope`, its verdicts are ignored, and CI replies: "chat-<n> is in use by session <tag> until <time>; pick another number". Choose another number and a new tag; never reuse someone else's.

## Each run: Plan first, then pick work in this order
After reading CURRENT.md and NEXT.md, post one comment on your closed issue `run-log: <base name>` (the base name is your name without `#<tag>`; if the issue is missing, create it and close it): `Plan · Agent: <name>: 1) … 2) … 3) …`. List every step from the order below that applies right now, with PR or item numbers. A plan must include every applicable step; leaving one out is recorded. Before ending the run, edit that same comment and add `Result: 1) done|skipped because … 2) … 3) …`. That comment is your only run comment.

1. An open S0 incident with no claimant: claim it and fix it. If it is already claimed, do not touch it. While an S0 is open CI merges nothing, except the claimant's `incident #<n>` PR (see Incidents).
2. Your own open PR with a failing check, a `merge-conflict: FAILED` comment, or the changes-requested label: fix it. Read the CI comment on the PR first: it names the exact failing rule, check or conflicting files and how to comply. A conflicted PR gets no fast-gate run at all until the conflict is resolved. Conflicts only in CURRENT.md or NEXT.md you never fix: CI merges main into your branch and keeps both sides (commit `ci: merge main (bookkeeping only: …)`); your Ready and approvals still count. Pull before your next push. Fix a conflict yourself only when CI's comment says it could not.
3. Review one PR labelled needs-review that you did not author (see Review and merge). Review only PRs with that label; CI adds it only to PRs that need a review.
4. Continue your own unfinished PR toward its Done. When you believe Done is met, push and comment exactly `Ready · Agent: <name>` in the same run. Do not wait for checks (see Review and merge): go straight on to the next step. If you have no unfinished PR and fewer than 3 open PRs, take over one open PR labelled lease-expired (not CI's) instead of starting a new item (see Claiming).
5. An open S1 incident with no claimant.
6. An issue labelled bug + confirmed with no open PR, if no other bug PR is open.
7. The top NEXT.md item with Status open, all Needs done, and Assigned empty or your name, if you have fewer than 3 open PRs.
8. One issue labelled bug without confirmed: try to reproduce it (see Bugs). Do this at most once per bug; if you cannot run tests, skip it.
9. Nothing applies: end the run.

After finishing a step, continue to the next applicable step in the same run. Keep working: posting Ready, pushing, or checks still running are never reasons to end a run; after Ready, take the next item (step 7). End the run only when no step applies or after about 30 minutes of work. Never invent work outside this list. If you notice a problem, file it as an issue (see Bugs) and continue.

## Claiming and PRs
- The PR is the claim. Before writing code, open a non-draft PR from branch `<agent>/<item>`. Title it `N<id> <summary>`, `bug #<issue> <summary>` or `incident #<issue> <summary>`. You may open it early and finish it over several runs, but it is reviewed only after you post Ready.
- Line 1 of the PR body: `Agent: <your name> · Item: <id>`. There is no lease: the open PR is the claim.
- An item PR also deletes its item's whole block from NEXT.md (from your first push is fine), so the item leaves main exactly when CI merges the PR. `scope` fails (NEXT-MD-DONE) an item PR that keeps it. An id in a Needs line that is no longer in NEXT.md is done.
- One PR per item: `scope` fails a PR whose Item already has another open PR. When the PR's Agent has made no commit and no comment for 1 hour, CI adds the label lease-expired (not while the Agent's Ready is newer than the last push, no required check failed and no review asked for changes: that PR is waiting on CI or a reviewer). To take it over, push commits to the existing PR's branch and change its line 1 to your name; never open a second PR for the item.
- Limits: 3 open PRs per agent, at most 20 open PRs in total.
- Push as rarely as you can: every push re-runs CI. Put all your changes for a PR into one commit per run, including your docs/current note and NEXT.md (with the REST API: create one tree with every changed file, one commit on top of the branch head, then update the branch ref). Never push a commit that only changes CURRENT.md or NEXT.md; when that is all that changed since a green fast-gate, or when the only other changes came from merging main, CI reuses the earlier result anyway.
- Stay inside the item's Scope. Anything else goes in a new issue, not in the PR.
- Never edit AGENTS.md, .github/**, ci/**, scripts/ci/**, test thresholds or budgets (the paths in ci/protected.json), and never delete, skip or loosen a test. Only PRs titled `rules:` from the priority run may do these things. The required check `scope` enforces this; the required check `fast-gate` runs typecheck, lint, affected tests and a smoke run. When either fails, CI writes the exact failing rule or check and how to comply into one comment on the PR (edited in place on later failures) and into the check's output summary; you cannot read CI logs, so use that comment.
- CI opens its own PRs as `Agent: ci` (`revert #<pr>` and `ci: perf calibration`). Do not edit or close them.

## Too big or stuck
- Finish items; do not split them. Split only a top-level item (an id with no dot) and only when finishing it would clearly need more than about 800 changed lines; otherwise keep pushing to the same PR over several runs. A sub-item (an id with a dot) is never split again: `scope` fails it (SPLIT-DEPTH). When you do split, sub-item .1 must contain the hardest part of the item end to end (its writes, undo and MCP path where it has them), not only schema or contract scaffolding.
- There is no "infeasible". If a top-level item is too large, open a PR titled `N<id> split` that replaces it in NEXT.md with sub-items N<id>.1, N<id>.2, …, each with its own Done/Scope/Not, and that also implements sub-item N<id>.1 (code plus its test) in the same PR; list only the remaining sub-items N<id>.2, N<id>.3, … in NEXT.md. In every other item whose Needs lists N<id>, replace N<id> with the sub-item(s) that finish the work (usually the last one); that is the only edit to other items `scope` allows, and it fails a split that leaves any item needing N<id>. `scope` fails a split PR that changes only NEXT.md. Each sub-item must change code and add a test.
- If a run ends without progress on an item, comment `No progress: · Agent: <name> · <one line on what you tried>`. CI adds the label escalate after 3 such comments from at least 2 different `Agent:` names. Escalated items go to the priority run; skip them until then.

## Stages (set by the priority run, never by agents)
- Build: new feature behind a flag in src/flags.ts, default off. Speed first: CI merges on Ready and green fast checks, without review, and imperfect code is fine as long as the checks pass. Known bugs go on the item's list or into issues and are fixed when they block progress or in Harden.
- Harden: bug hunting and review, once per feature. A reviewer reads the feature's merged code and files bugs; a legitimate PR is a new failing test with its fix, or a failing test filed as a bug. A flag may default on only after Harden.
- Stable: every blocking check must pass (fast-gate, scope, the full suite on main). Timing-based checks run in perf-report and never block; only the priority run changes budgets. Any regression is an incident.

## Bugs
- Anyone may file a bug: an issue labelled bug, with exact reproduction steps and the expected and actual results.
- It becomes confirmed when a different agent reproduces it and adds confirmed plus a severity label, or when a failing test shows it, including the same test failing in CI on main or on 2 or more PRs.
- A fix PR must add a regression test that fails without the fix.

## Incidents (escalation matrix)
| Level | Trigger | Action |
| S0 | main red, deploy broken, data or security risk | CI merges nothing, except the one PR titled `incident #<n>` that fixes that incident (the earliest opened, if there are several); reviewers review it before anything else. An automatic revert PR is merged by CI. Otherwise claim the incident and fix it. |
| S1 | the same failure signature on 2 or more PRs | One owner fixes it on its own PR. Affected PRs must not patch it locally; they wait, then update from main. |
| S2 | a failure on one PR only | That PR's author fixes it. |
| S3 | unreproduced report | Leave it for the priority run. |
CI creates incidents and names them by failure signature. Before acting on any failure, search open incidents for the same signature. Unresolved S1 for 2 runs becomes S0. CI also resolves them: a signature incident opened from PRs (including one escalated to S0) closes on its own once fewer than 3 open PRs still fail with it on their current head, so a fixed failure cannot keep the S0 freeze on; a main incident closes only when main is green. Never strip an S0 label by hand.

## Review and merge
CI merges. Agents never merge, never update a branch from main for the sake of merging, and never remove labels.
- Ready: when you believe your PR's Done is met, comment exactly `Ready · Agent: <your name>` right after your last push, in the same run. Do not wait for checks, and "checks still running" is never a reason to hold Ready back or to end a run: CI re-evaluates when fast-gate and scope finish. If one fails, CI comments the failure on the PR, and fixing it is step 2 of your next run (fix, push, Ready again). Any new push of yours voids your Ready: post Ready again (CI's bookkeeping merges do not void it).
- Most PRs need no review. CI squash-merges an item, bug or incident PR when all of these hold: your Ready is newer than your last push; fast-gate and scope are green on the current head; no standing changes-requested; no S0 freeze applies (except for the incident's own fix PR).
- A review is required only when the PR changes `supabase/**` (it deploys to production on merge) or turns a flag on by default in src/flags.ts (`ci/review-required.json`). For those, CI adds the label needs-review after Ready and green checks, and also needs an approval whose Agent name differs from the PR's `Agent:` line. Flagged Build work is reviewed once per feature in Harden instead.
- The reviewer reads the whole diff. It checks that the scope matches the item, the tests are meaningful, the migration is additive, and the PR complies with the current rules version. Request changes only for a real defect in the diff; never for a merge conflict, style, or anything Harden can catch later.
- To pass: comment exactly `Approve · Agent: <your name>` (nothing else in the comment).
- To fail: comment exactly `Changes requested · Agent: <your name>: <what to change>`. CI adds the label changes-requested; the author's next push removes it, and the PR then needs a fresh Ready (and, if required, a fresh approval).
- Any push after a verdict voids it. Per agent only the latest verdict on the current head counts; duplicates are ignored. Verdicts from an invalid name or a locked chat session are ignored, and CI posts one comment explaining the valid formats. `rules:` PRs are merged by the Owner only. Revert and calibration PRs keep their own CI path.
- Never approve your own PR. The full suite runs on main after merging. If it fails, CI reverts the culprit PR automatically and reopens its item. Do not fix forward, except when a merged PR changed `supabase/migrations/**`: that is already deployed, so CI does not revert and the S0 incident is fixed forward with a new migration.

## Communication
- The per-run comment is the Plan and Result on `run-log: <base name>` (see "Each run"). It is the only comment you post outside a PR.
- Comment on a PR only when you pushed a commit, posted Ready, gave a review verdict (`Approve` or `Changes requested`, exact formats above), or wrote `No progress:`. Never post a status-only comment, and re-checking your own PR is not work.
- After a push, at most one comment in this format: `Done: … / Pending: … / Next: …` (5 lines maximum), signed with a last line `Agent: <your name>`. If you also post Ready, the Ready comment is enough.
- CI keeps `agent-metrics` (plans, steps done, plans that left out a review, plans with no Result). Only the priority run reads it; agents never edit it.

## Owner tasks given directly
- If the Owner gives you a task directly, add it in your PR to NEXT.md as a new item with the next unused ID, placed where the Owner said (top if unspecified), with `Assigned: <your name>`. Put the line `Owner task: "<Owner's exact words>"` in the PR body, after line 1.

## Safety
- Never push to main or force-push. No secrets in code, PRs or comments.
- Supabase: project yemqnhnztlbyxmjxidis only, with schema changes only through migrations.
- Migrations are additive only: your PR merges straight to production. Never edit, rename or delete an existing migration. A new migration may only create things (tables, columns, indexes, policies, new functions, grants). Statements inside a new function's body are fine. `scope` fails (MIGRATION-ADDITIVE) any agent migration that drops, truncates, renames, changes a type, deletes or updates existing rows, revokes (except `revoke … on function` for a function created in the same migration, to lock it down), or alters a policy. To replace an existing function compatibly, add the PR body line `Replaces function: <name> (reviewer verified signature and behaviour)`; the reviewer checks that claim. Anything else needs an Owner `rules:` PR.
- Migration timestamps need not be in merge order: the deploy applies every migration the database has not applied yet (`supabase db push --include-all`). Never rename a migration to change its order.
- A command function trusts the provenance settings `lemma.source`, `lemma.tool` and `lemma.summary` only when `current_setting('role',true)='service_role'` (the MCP dispatcher or a worker); for any other caller it sets them to `app`, its own tool name and summary first, because any session can pre-set them (bug #1051). A new table that browsers must not write directly revokes `insert, update, delete, truncate` from `anon, authenticated` explicitly: Supabase grants new tables to them by default (bug #1094).
- No new dependencies unless the item says so.
- If you change what exists or what is broken, record it in the same PR in a new file `docs/current/<id>.md` (for example `docs/current/N52.md`, `docs/current/bug-1109.md`), starting with a `## ` heading. Never add a section to CURRENT.md: every PR appending there made every other open PR conflict and re-run CI, and `scope` fails it (CURRENT-NOTE). Edit an existing CURRENT.md section only to correct it in place. A Done line that asks for a CURRENT.md record is met by the docs/current note.
