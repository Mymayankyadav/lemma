# Agent rules

**Binding Owner delegation:** explicit attributable Owner directions supersede conflicting repository SOP within their actual scope. A v3-seeding delegate follows Owner-amended v3 and that assignment, without resurrecting legacy gates or fabricating global runtime activation. See `docs/agents/owner-role.md` §6; retained specific holds and truthful evidence still apply.

**Owner role:** [OPS3 addendum B](docs/agents/owner-role.md) defines the human Owner and urgent comment handling in every mode. Refresh owner directions on affected PRs/issues/reviews before consequential actions; acknowledge in the observing run and act or assign next capable capacity. The human Owner is not executable agent capacity.

**Owner authority:** [OPS3 addendum A](docs/agents/owner-override.md) applies in every mode, including preparation. A verified personal owner squash merge or specifically owner-directed squash merge is explicit scoped integration approval even with red/pending CI or missing audit. Autonomous agents retain normal gates; sharing the owner account supplies no bypass. Read the addendum before treating a merged prerequisite as approval-blocked.

- Read `docs/agents/README.md` first for the compatible startup guard and pinned record IDs; v3 is NOT ACTIVE until its transition gates and control chain are verified. Then read `plan.md` §0. It is the only task list; the specs in `docs/spec/` define behaviour.
- Read `docs/agents/registry.md`, `docs/agents/README.md` and `docs/agents/dispatch.md`: actual enrolled scheduled, interactive, CI or external agents select dynamic roles by verified capabilities, backlog, claims and reviewer availability. No fixed count, minute slots, scheduler or universal runtime is assumed. Registry #770 is the membership source; playbooks remain in `docs/agents/playbooks-v3.md` and compatible retained `prompts.md`.
- One task per PR (split large tasks into several). Claim it with a PR (non-draft by default; an explicit Owner request for a draft takes precedence) titled `<TASK-ID> <title>` from branch `t/<task-id>` before writing code, with an `Owner: <role> · Lease until <HH:MM IST>` line. An expired lease may be taken over by any agent.
- Edit only the paths your task owns (`plan.md` §5). Contract changes go through a `CONTRACT` PR (`plan.md` §7).
- Visual truth: `docs/spec/v4-look.md` (owner-approved v4 look, Route, palette and Atlas; overrides v3 where different), then `docs/spec/v3.md` (Graph paper and remaining UI rules) and `docs/spec/stress.md` (hard budgets), then older specs only where these are silent.
- Before marking ready: `npm run check` and your task's tests pass; UI PRs attach a screenshot next to the board.
- Ordinary autonomous merges require exact-head squash after all required CI and independent release evidence pass. Verified owner-authorized squash merges instead follow addendum A; unmet gates remain honestly recorded. The old pre-ci bootstrap exception is historical: `ci.yml` exists. Never force-push, never push to `main`.
- Supabase: only project `yemqnhnztlbyxmjxidis`. Schema changes only through migrations. Connector code filters every query by `user_id`.
- No secrets in the repo, no analytics, no dependency outside `plan.md` §4 without a `CONTRACT` PR.
- For an assigned runnable task, acquire and read back your own eligible claim under `docs/agents/dispatch.md#acquire-the-claim-yourself`; cite the actual conflict/access failure if blocked. Missing an unattempted claim is not `no_eligible_work`.
- After completing or blocking a task, checkpoint it and take the next eligible task within the same run; one writable PR at a time is not one task per run. Follow `docs/agents/dispatch.md` §“Continue within a run” and its authoritative §“Stop decision”; role labels do not reserve territory or supply a separate stopping test. Ask the owner only for the one-time steps in `plan.md` §10.


## OPS3 preparation guard

Owner-authorized repository preparation: PR #765. No schedules or active mode are changed by this PR. `docs/agents/v3.md` is the candidate contract; legacy/shadow retains the existing dispatcher below its guard. Never infer activation from a file, packet or higher generation number. Unknown/conflicting control stops affected new writes.

Historical reset/branch-purge and superseded design instructions in `plan.md` are reference only. No current deletion authority follows from them. For every release, identify the route in `docs/agents/release.md`: ordinary autonomous merges must pass `scripts/merge-gate.ts` and the independent supplement; a missing checklist phrase never waives audit on that route. Verified owner-authorized exceptions use addendum A's separate `OWNER_OVERRIDE` record, without falsifying a passing gate.
