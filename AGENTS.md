# Agent rules

- Start with `plan.md` §0. It is the only task list; the specs in `docs/spec/` define behaviour.
- One task per PR. Claim it with a draft PR titled `<TASK-ID> <title>` from branch `t/<task-id>` before writing code.
- Edit only the paths your task owns (`plan.md` §5). Contract changes go through a `CONTRACT` PR (`plan.md` §7).
- Visual truth: `docs/spec/design.md`, then the boards in `docs/design/canvas/`, then `docs/design/reference-amber-on-obsidian.png`.
- Before marking ready: `npm run check` and your task's tests pass; UI PRs attach a screenshot next to the board.
- Merge with squash when CI is green on the last commit. Before `ci.yml` exists on `main` (P0-A and P0-C only), a local `npm ci && npm run check` pasted in the PR replaces CI. Never force-push, never push to `main`.
- Supabase: only project `yemqnhnztlbyxmjxidis`. Schema changes only through migrations. Connector code filters every query by `user_id`.
- No secrets in the repo, no analytics, no dependency outside `plan.md` §4 without a `CONTRACT` PR.
- Keep going from task to task without asking. Ask the owner only for the one-time steps in `plan.md` §10.
