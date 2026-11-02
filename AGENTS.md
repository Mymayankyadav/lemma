# Agent rules

- Read `docs/agents/README.md` first for the compatible startup guard and pinned record IDs; v3 is NOT ACTIVE until its transition gates and control chain are verified. Then read `plan.md` §0. It is the only task list; the specs in `docs/spec/` define behaviour.
- Read `docs/agents/README.md` and `docs/agents/dispatch.md`: the five hourly slots select a **dynamic** Steward/Fixer/Builder/Auditor role on every run using GitHub backlog and leases (v3 absorbs planning into these five slots only after controlled activation). The role playbooks are in `docs/agents/prompts.md`. Follow their existing audit and merge safety gates.
- One task per PR (split large tasks into several). Claim it with a PR (never a draft: REST cannot un-draft it) titled `<TASK-ID> <title>` from branch `t/<task-id>` before writing code, with an `Owner: <role> · Lease until <HH:MM IST>` line. An expired lease may be taken over by any agent.
- Edit only the paths your task owns (`plan.md` §5). Contract changes go through a `CONTRACT` PR (`plan.md` §7).
- Visual truth: `docs/spec/v4-look.md` (owner-approved v4 look, Route, palette and Atlas; overrides v3 where different), then `docs/spec/v3.md` (Graph paper and remaining UI rules) and `docs/spec/stress.md` (hard budgets), then older specs only where these are silent.
- Before marking ready: `npm run check` and your task's tests pass; UI PRs attach a screenshot next to the board.
- Merge exact-head with squash only after all required CI and unconditional independent release evidence pass. The old pre-ci bootstrap exception is historical: `ci.yml` exists. Never force-push, never push to `main`.
- Supabase: only project `yemqnhnztlbyxmjxidis`. Schema changes only through migrations. Connector code filters every query by `user_id`.
- No secrets in the repo, no analytics, no dependency outside `plan.md` §4 without a `CONTRACT` PR.
- Keep going from task to task without asking. Ask the owner only for the one-time steps in `plan.md` §10.


## OPS3 preparation guard

Owner-authorized repository preparation: PR #765. No schedules or active mode are changed by this PR. `docs/agents/v3.md` is the candidate contract; legacy/shadow retains the existing dispatcher below its guard. Never infer activation from a file, packet or higher generation number. Unknown/conflicting control stops affected new writes.

Historical reset/branch-purge and superseded design instructions in `plan.md` are reference only. No current deletion authority follows from them. For every release, apply `docs/agents/release.md` unconditionally as well as `scripts/merge-gate.ts`; a missing checklist phrase never waives audit.
