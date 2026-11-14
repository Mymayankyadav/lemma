## incident #1402 — the deployed MCP registry listing threw on camelCase command fields

The `Supabase` deploy of a1d20fe (N160) failed at "Verify deployed MCP endpoint": `get(what=resources)` returned `Malformed registered resource field or operation`, which the smoke test then tried to parse as JSON (`tests/mcp/smoke.mjs`, the check N160 added).

- **Cause.** `supabase/functions/mcp/tools/registry.ts` accepted only `^[a-z][a-z0-9_]{0,60}$` for resources, operations *and* fields. Two registered commands carry camelCase payload fields: `review_corrections` (`reviewedAt`, `durationMs`, `replacementState`, `schedulerParams`) and `session_event_corrections` (`hintLevel`, `occurredAt`). The N160 listing reads every registered row, so one bad row failed the whole list. Checked against the deployed `lemma_command_resources` (read-only select): these two rows are the only ones outside the pattern.
- **Fix.** Fields use `^[A-Za-z][A-Za-z0-9_]{0,60}$` (`FIELD`); resource and operation names stay lower-case. Output filtering of secret-like names (`HIDDEN`) is unchanged, and a name such as `a;b` or `1x` is still rejected.
- **Tests.** `tests/unit/mcp/generic-registry.test.ts`: every `mcp_ok` row of the manifest lists, camelCase fields included (fails without the fix), and malformed names are still rejected.
- **Deploy.** The change is in `supabase/functions/mcp/**`, so merging it redeploys the connector; it needs a reviewer. No migration.
