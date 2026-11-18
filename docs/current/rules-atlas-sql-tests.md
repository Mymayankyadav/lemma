## rules: SQL baselines for Atlas v3 (Owner, 18 Nov 2026: "use new pr of owner setup to edit protected paths")

Three SQL tests assumed that no migration later than N170 exists, which is true on main but not once Atlas v3 (PR #1501, migrations `20261218*`) lands. No assertion is removed or weakened.

- `tests/mcp/sql/n170-items.mjs` and `tests/mcp/sql/adaptive-rollback.mjs` build their baseline from migrations dated before `20261218`. The later Atlas v3 migrations build on N170 and are covered by `tests/mcp/sql/atlas-v2.mjs`.
- `tests/mcp/sql/parity.mjs` expects `kind` among the payload-only fields of the `concepts` command only while `concepts.kind` is not a documented column. Atlas v3 adds that column, after which `kind` is a documented field of the table. On main the expectation is unchanged.

All three pass on main with these changes and on the PR #1501 tree.
