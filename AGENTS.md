# Agent rules

- Start with `plan.md` §0. It is the only task list; the specs in `docs/spec/` define behaviour.
- Read `docs/agents/README.md`: how the scheduled agents (Steward, Fixer, Builder, Auditor) coordinate (leases, task board, logs), the owner's decisions not to regress, known traps and the current state. Their prompts are in `docs/agents/prompts.md`.
- One task per PR (split large tasks into several). Claim it with a draft PR titled `<TASK-ID> <title>` from branch `t/<task-id>` before writing code, with an `Owner: <role> · Lease until <HH:MM IST>` line. An expired lease may be taken over by any agent.
- Edit only the paths your task owns (`plan.md` §5). Contract changes go through a `CONTRACT` PR (`plan.md` §7).
- Visual truth: `docs/spec/v3.md` (the Graph paper look) and `docs/spec/stress.md`, then the older specs where v3 is silent.
- Before marking ready: `npm run check` and your task's tests pass; UI PRs attach a screenshot next to the board.
- Merge with squash when CI is green on the last commit. Before `ci.yml` exists on `main`, a local `npm ci && npm run check` pasted in the PR replaces CI. Never force-push, never push to `main`.
- Supabase: only project `yemqnhnztlbyxmjxidis`. Schema changes only through migrations. Connector code filters every query by `user_id`.
- No secrets in the repo, no analytics, no dependency outside `plan.md` §4 without a `CONTRACT` PR.
- Keep going from task to task without asking. Ask the owner only for the one-time steps in `plan.md` §10.
