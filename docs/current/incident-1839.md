## Incident #1839 — command-only Atlas graph resource was counted as a table

N226 merged an audited `atlas_graph_edits` MCP command but no `public.atlas_graph_edits` table. Its capability registry JSON incorrectly declared `table: atlas_graph_edits`, so the existing migration-derived unit inventory counted 100 documents for 99 database tables and made main CI red.

The fix changes only the metadata description to a `resource` of classification `command-only` and adds a regression test. The SQL command and all production graph rows are unchanged. The existing `tests/unit/contract/capability-registry.test.ts` remains unmodified and must pass.
