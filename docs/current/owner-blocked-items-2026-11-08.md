# Owner decisions for blocked items (2026-11-08)

Seven open PRs were stopped by contradictions between an item's Done and its Scope. Each is resolved without weakening a guarantee and without letting an agent invent behaviour.

| Issue | Item | Decision |
|---|---|---|
| #1212 | N103 (#1194) | Fixed in the PR branch: the deletion marker now blocks INSERT/UPDATE for every role, including the MCP `service_role` path. Cleanup deletes stay open; the function purges and retries Auth deletion. |
| #1205 | N52 (#1103) | A browser can no longer INSERT a running or paused timer at all. The N10 fixture seeds its row from the trusted context and asserts the refusal. Scope now allows that one test edit. |
| #1147 | N54 (#1108) | Scope adds the one notify-tick call and its unit test. |
| #1177 | N68 (#1154) | New prerequisite N107 (one atomic planner commit command, one receipt, one Undo). N68 Needs N107. |
| #1178 | N69 | N69 is done with ritual JSON; canonical carry-over and tomorrow's-first-task transitions are new N108. |
| #1200 | N85 (#1198) | Scope adds a read-only `ProposalDraftApi.getSource` returning the real target ID and both versions. |
| #1197 | N87 (#1188) | `connector_last_client` is command-managed (the master registry already said so); the settings edit path refuses it. |
| #1206 | N94 (#1189) | Done is per resource and operation, on the real target rows, and never requires a verb a resource does not register. |
| #1129 | CI | Already fixed by v2.7 (revokes on tables created in the same migration). |

No code in `scripts/ci/**`, `AGENTS.md` or `.github/**` changed.

## Afternoon (owner PR after incident #1228)

- #1222 re-landed: CI's auto-revert (#1229) removed it for a clock-dependent unit test it did not cause (fixed by #1227).
- #1216 (N54): the scheduled caller is a database `pg_cron` job, following the pending-commands pattern; the tick hook becomes required.
- #1231 (N94): the static command manifest now mirrors the database (18 resources) and a SQL test enforces it. The two owner-editable columns MCP cannot write yet are recorded truthfully and tracked by new N109; the frozen N36.1 baseline rows are not changed here.
- Owner waived independent review for the currently open PRs (instruction 2026-11-08 16:05 IST); owner-setup reviews each diff and merges directly, noting the waiver on the PR.
