# Agent handbook

This is how work on Lemma is run, written on 31 Oct 2026 so that any new agent can continue without the owner's chat history. Read it together with `AGENTS.md` (the rules), `plan.md` (the task list) and `docs/spec/` (behaviour).

## 1. The team

Five scheduled agents run hourly (ChatGPT scheduled tasks) and a Planner runs every 12 hours (a Claude scheduled task); each run is a fresh session with no memory. They coordinate only through GitHub. Their full prompts are in `docs/agents/prompts.md`. **Every agent reads its own section of `docs/agents/prompts.md` at the start of each run; where it differs from the prompt pasted into its schedule, the repo version wins.** That way rule changes reach the agents without anyone re-pasting prompts.

| Role | Runs (IST) | Does |
| --- | --- | --- |
| Steward | :00 | Builds the task board from `plan.md`; merges every green, complete PR, even if it is behind main, unless it conflicts or overlaps recent changes; flags a red main |
| Fixer | :15 | Turns every red PR green, fixes `FIX main` and `audit` issues, fixes bugs; works several in parallel |
| Builder | :30 | Writes as much code as possible across 3–5 tasks in parallel; takes over any stalled PR |
| Auditor | :45 | Audits every merged and "Ready to merge" PR against the specs and the owner's intent; files `audit` issues; verifies fixes |
| Planner | every 12 h (about 08:40 and 20:40) | Plans major feature drops, UI and aesthetic changes, the Android app and notifications; writes specs in `docs/spec/` and task sections in `plan.md` through "PLAN …" PRs; never writes app code |
| Builder-2 | :50 | Unblocks the critical path: takes the 2–4 tasks that hold up the most other work (red, stalled or unstarted), splits large PRs so the most important parts land first |

More agents can be added at any time: copy the Builder or Fixer prompt, give it a new role name (for example "Builder-3") and a different minute. The lease convention below stops agents from colliding.

## 2. Coordination conventions (all agents)

- **One task, one PR.** Each task is one PR titled `<TASK-ID> <title>` from branch `t/<task-id>`. A large task may be split into `<TASK-ID>a`, `b` and so on, each able to land on its own.
- **Lease.** Every PR description carries the line `Owner: <role> · Lease until <HH:MM IST>`.
  - Only the lease holder pushes to that PR.
  - When the lease has expired, any agent may take over the PR, and comments "<role> taking this" when it does.
  - There are no "my PR" exceptions: every open PR belongs to the team.
- **PR description.** It holds a checklist of the spec's acceptance items, a line "Next step: …", and "Ready to merge" once the owner of the lease believes it is complete.
- **Do not wait for CI.** Push, move on to the next task, and come back later (in the same run or the next) to read the results.
- **Merging.** Squash-merge only, and only when every check on the exact head commit has completed successfully (never pending), the description says "Ready to merge", and there is no unresolved "AUDIT BLOCK" comment (one with no later "AUDIT CLEAR"). Being behind main is not a blocker: merge unless GitHub reports a conflict, or files the PR touches have changed on main since its CI ran. Never push to main, never force-push or rebase; bring main in with a merge.
- **Auditor blocks.** The Auditor blocks a PR with a comment starting "AUDIT BLOCK" (listing the findings) and lifts it with a later comment starting "AUDIT CLEAR". The Steward never merges while the latest of the two is a block.
- **Tests.** Never weaken, skip or delete a test to make CI pass. Fix the code.
- **Shared issues.**
  - "Task board": the Steward rewrites its body each run.
  - "Audit log": the Auditor's verdict table.
  - "Agent log": every run appends one line.
  - Issues labelled `audit` are the Auditor's findings. The Fixer fixes them and the Auditor closes them.
- **Adding work.** Add a section to `plan.md` with task IDs, spec references and "depends on". The Steward puts it on the board and the Builder starts it.
- **Planner PRs and owner approval.** The Planner opens "PLAN <name>: …" PRs (docs/spec/ and plan.md only).
  - A major drop says "Owner approval needed" in its description, and its tasks are marked "awaiting owner" in plan.md.
  - **No agent picks a task marked "awaiting owner", and no agent other than the owner writes "Ready to merge" on a PR that says "Owner approval needed".** The Steward never merges a PR whose description still says "Owner approval needed".
  - The owner approves by replacing "Owner approval needed" with "Ready to merge". After it merges, the "awaiting owner" marks are removed and the tasks join the board like any other.
  - Small Planner refinements say "Ready to merge" and merge normally.

## 3. Ground rules (from AGENTS.md, repeated because they matter)

- **Supabase:** project `yemqnhnztlbyxmjxidis` only, never any other project. Schema changes go through migrations only. Connector code filters every query by `user_id`. Every write is reversible through the action log (`undo`).
- **Secrets:** none in code, PRs, issues or comments. Never print the connector URL (it contains a secret).
- **GitHub:** use `gh api` REST.
  - **Never open draft PRs.** Create every PR with `draft: false`. Work in progress is signalled by the lease line and by the absence of "Ready to merge", not by GitHub's draft flag. REST cannot mark a draft ready (only the web UI or GraphQL can), so a draft is a PR that REST-only agents can never merge.
  - Merge with `PUT /repos/{o}/{r}/pulls/{n}/merge` (`merge_method=squash`, `sha=<head>`).
  - If you find an old draft that is green and "Ready to merge", list it on the Task board under "Owner action: mark ready for review". The owner clicks "Ready for review" on GitHub, and the next Steward run merges it.
  - Some agent runtimes cannot clone github.com. They edit through the contents API (`PUT /repos/{o}/{r}/contents/{path}` on the task branch) and rely on CI for tests. That is fine: never claim that a local test run happened when it did not.
- **Commits and PRs** end with the attribution lines your environment specifies.

## 4. Owner's decisions to protect (do not regress)

- **Look:** Graph paper only, day and night, chosen automatically from the device, with an Automatic/Day/Night override. Compact text, calm motion, a docked tab bar with icon-first tabs and a label on the active tab only. No other themes or appearance controls. A simple graph-paper background with one curve per screen (Atlas and card review: grid only).
- **LaTeX everywhere:** every displayed text and every input renders LaTeX (`$…$`, `$$…$$`).
- **Metro timeline** with schedule colours between stations (early, on time, late). Above about 14 checkpoints it becomes a stage Metro (stress.md A1).
- **Atlas** (v3.md §4): a foldable outline of ideas (Field › Area › Topic › Idea › Detail) with prerequisite links drawn as arcs in a right-hand margin.
  - Folding redraws links to the folded branch and bundles them with counts.
  - Selecting an idea marks what it builds on (blue) and opens up (accent).
  - No zoom camera, orbits or minimap: the solar-system words were an analogy only.
- **Plan review:**
  - The checkpoint map is a left-to-right tree: every prerequisite is a dashed line, columns are prerequisite depth and are centred, and the tree spans out from its root.
  - Tapping a checkpoint opens a drawer with previous/next.
  - "Ideas in this plan" uses the same collapsible graph as the Atlas.
- **Sources-first projects:** create a project with a name plus many PDFs, and append sources any time. The tutor fills in goal, subject and target, and appends plans.
- **No permanent hint bars, no style tabs, no blank screens.**
- **Stress principle** (stress.md): every element keeps its job at 100× data by changing form above a measured switch point, never by shrinking marks.

## 5. Where things are

- **Plan and specs:**
  - `plan.md`: the tasks; the newest sections are "Tutor transcriptions" and "Stress".
  - `docs/spec/v3.md`: the final look, the Atlas, plan review and sources-first projects.
  - `docs/spec/stress.md`: the stress test and tasks ST-0 … ST-7, MCP-5 and QA-3.
  - `docs/spec/transcribe.md`: tutor transcriptions (DB-5, MCP-6, UI-8).
  - `docs/spec/connector.md`: the MCP connector (Supabase Edge Function `mcp`); its `tools/list` must stay under 15,000 characters, and each self-test part under 150 s.
  - `docs/acceptance/`: QA reports.
- **CI:** `ci.yml` (check and e2e), `pages.yml` (GitHub Pages under `/lemma/`), `supabase.yml` (deploy plus the post-deploy MCP smoke check), `mcp-smoke.yml`.
- **Demo mode:**
  - `?demo=1` (fixture in `src/data/demo/fixture.json`, generated by `scripts/make-demo-data.ts`).
  - Stress profiles: `?demo=stress` and `?demo=extreme` (ST-0).

## 6. Known traps

- The graph theme deliberately un-truncates `.truncate` app-wide (`src/styles/graph.css`) to keep formulas whole. In fixed-height rows, clip explicitly (see `clip` in `src/features/atlas/Outline.tsx`).
- Plan-change previews: checkpoints the project shows as "proposed" are excluded from the base, so they don't appear twice. Existing checkpoints carry no prerequisites in `CheckpointView`, so a plan-change map shows them in the first column.
- The live database only had self-test projects (hidden, `system=true`, slug `zz-selftest-…`) until the owner's Algebra 1 (36 checkpoints, no stages). The self-test sweeps stale fixtures older than 15 minutes.
- Some agent environments cannot read GitHub Actions logs. Read check-run annotations (`/check-runs/{id}/annotations`), or reproduce locally.

## 7. State at hand-off (31 Oct 2026, 10:25 IST)

- **Merged:** v3 (DB-4, MCP-4, DEMO-2, UI-6a … e, QA-2), UI-7 (Atlas outline, plan drawer, plan ideas graph, plan map tree), ST-0, ST-2, ST-3, ST-5, ST-7, MCP-5, the transcription plan (#436) and its fix (#444).
- **Open:**
  - ST-1 (#432);
  - ST-4 (#433, red);
  - ST-6 (#435, red);
  - DB-5 (#437);
  - UI-8 (#439);
  - audit findings #440 (ST-2 sorts CP10 before CP2), #441 (ST-3 extreme render and DOM budgets not asserted) and #443 (save_pages confidence; spec fixed in #444, awaiting verification).
- **Not started:** MCP-6 (after DB-5) and QA-3 (after ST-1, ST-2, ST-4 and ST-6).
- **`.tex` and `.md` uploads:** specified in `transcribe.md` §2b and built in UI-8b.
