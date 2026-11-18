## Incident #1514: deploy smoke ran out of Edge worker resources on delete

From 18:02 on 2026-11-18 the post-deploy and scheduled MCP smokes failed in selftest part 4: the worker returned HTTP 546 (resource limit) during "delete preview cascade and undo", or the 300-second smoke window ran out before part 4 finished. Parts 1–3 passed every time, and the passing deploy at 18:01 already used about 260 of the 300 seconds, with part 4 alone at 91 s.

Cause: `remove` (the `delete` tool, `mcp/tools/control.ts`) counted what a delete cascades by loading every row, with every column, of each related table: source texts, page transcriptions, session events, notes and more, for the whole account, twice per delete (preview, then confirm). Only the counts were used; the delete itself is one row, cascaded by the database and journalled for undo. As the Owner's account grew (sources, transcriptions, the Atlas conversions), that request crossed the Edge worker's memory and CPU budget.

Fix: the preview loads only the tables that can be cascaded into, and only their `id` and link columns, and follows links through Sets instead of nested scans. Counts and the delete are unchanged. `tests/unit/mcp/incident-1514-delete-preview.test.ts` pins both: no related table is read with `*` or a text column, and the counts across every link are exactly the previous ones.

The 1,000-row read cap per table (`all`) is unchanged; a delete preview of a table with more rows than that undercounts, as before.
