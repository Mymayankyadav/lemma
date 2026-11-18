## incident #1505 — the Atlas v3 deploy advertised an oversize tools/list

PR #1501 merged on 2026-11-18 (d599847). Its migrations applied (additive, and dormant: nothing is activated) and the MCP function deployed, but the deploy's `Verify deployed MCP endpoint` step failed: `tools/list too large: 15078` against the 15,000-character budget of incident #1492 (`FAIL MCP tool list and size`, then the selftest's HTTP 500).

Cause: the `template` field added to `propose_plan` (independent review fix 11, so a tutor can send a plan template after cutover) was a full zod object with a literal schema and a nested array, about 270 characters; `.passthrough()` on the top-level `save_progress` schema (not needed: the top-level `attempt` is never forwarded) added about 25 more. Measured with zod 4.3.6 and `@modelcontextprotocol/server` 2.4.0, the packages the function deploys with, through the same `initialize` → `tools/list` calls as the selftest: before PR #1501 14,753; main 15,078; with this fix 14,793, a headroom of 207.

Fix: `template` is advertised as an open value (`z.any()`); `validateTemplate` still checks it after cutover and names every violation. Passthrough stays on the `events` of `save_progress`, where structured attempts and `concepts[]` arrive. `tests/unit/mcp/incident-tool-list.test.ts` pins both choices; the real size is still only measurable where those packages exist (the deploy smoke), so keep adding to a tool's schema in view of the 207 characters left.

What is not known: the deploy stopped at that step, so the later parts of the selftest (database checks against the deployed migrations) have not run on production yet; the next deploy's smoke will be the first.
