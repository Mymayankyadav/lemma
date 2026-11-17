## Incident #1492: deployed tools/list was 15,173 characters (gate 15,000)

N169 added six optional `save_progress` event fields, which pushed the deployed `tools/list` over the selftest's 15,000-character gate, so the `Supabase` workflow on main failed at "Verify deployed MCP endpoint" (the functions and migrations themselves deployed and run). The N169 estimate (13,510) had measured only the input schemas, not the full serialized list.

Fix: `prune()` (now `supabase/functions/mcp/schema-prune.ts`) no longer advertises `minLength: 1`, which appeared 36 times. zod still validates every call with the full schema, so behaviour is unchanged; only the advertised JSON is smaller. Measured with the real MCP server's tools/list handler: 14,669 characters. Regression test: `tests/unit/mcp/incident-1492-size.test.ts`.

To measure the real size locally, call the `tools/list` request handler of `buildServer(...)` under a module alias for the `npm:` imports, rather than serializing input schemas alone.

## Second cause: v2 resume for selftest fixtures (17 Nov)
After the size fix deployed, the selftest failed at "planning metadata, ETA and undo — ETA/target missing". The owner account has `time_block` on, so `packet` used resume v2 for the selftest's fixture project. Fixture projects are `system` projects, which the adaptive state excludes (`visibleProjects`). v2 therefore rendered the owner's global TIME and QUEUE for the fixture and dropped the legacy GOAL/ETA and ADAPT lines.
- `packet` now keeps the legacy packet for `system` projects; v2 has no state for them.
- Resume v2 for real projects now carries the ADAPT diagnostics line in BRIEF; pace diagnostics stay hidden under `recheck_v2`. It had been dropped by N169.
- Tests: `tests/unit/adaptive/resume.test.ts` (both fail without the fix).
