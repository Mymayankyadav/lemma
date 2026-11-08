## Incident #1173 — restore MCP deployment smoke within the tool-list budget

The Supabase deploy on main at 2026-11-08 01:39 UTC successfully deployed the MCP Edge Function, but the mandatory post-deploy smoke failed three times: its `tools/list` response serialized to 15,050 characters, 50 above the unchanged 15,000-character ceiling. The failure is in the tool catalogue, not in database migrations.

The MCP server now uses shorter descriptions for the same 24 tools, without changing their names, input schemas, authorization, or execution paths. This reduces the serialized catalogue by 134 characters and leaves headroom below the ceiling. A unit regression guard asserts that all 24 tool descriptions remain nonempty and their combined length stays bounded. The existing live selftest and deployment smoke continue to verify the **actual serialized payload** against the original exact limit; neither test nor budget was relaxed.

The change is only a deployment repair. It becomes effective when CI merges and deploys it; the S0 incident should remain open until the next Supabase verification succeeds.
