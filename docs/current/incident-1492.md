## Incident #1492: deployed tools/list was 15,173 characters (gate 15,000)

N169 added six optional `save_progress` event fields, which pushed the deployed `tools/list` over the selftest's 15,000-character gate, so the `Supabase` workflow on main failed at "Verify deployed MCP endpoint" (the functions and migrations themselves deployed and run). The N169 estimate (13,510) had measured only the input schemas, not the full serialized list.

Fix: `prune()` (now `supabase/functions/mcp/schema-prune.ts`) no longer advertises `minLength: 1`, which appeared 36 times. zod still validates every call with the full schema, so behaviour is unchanged; only the advertised JSON is smaller. Measured with the real MCP server's tools/list handler: 14,669 characters. Regression test: `tests/unit/mcp/incident-1492-size.test.ts`.

To measure the real size locally, call the `tools/list` request handler of `buildServer(...)` under a module alias for the `npm:` imports, rather than serializing input schemas alone.
