## Owner fixes 2026-11-07 night (bugs #1074, #1119, #1123, #1126, #1140, #1145, #1146)

- **#1126 / #1145 (CI v2.7):** `scripts/ci/migrations.mjs` accepts `revoke <table privileges> on <tables> from <roles>` when every table is created by a plain `create table` in the same migration. This is the browser-DML revoke AGENTS.md requires. Revokes on existing tables, schema-wide revokes and `truncate` statements are still rejected. Unblocks N53 (#1106), N91 (#1142) and N45 (#1030).
- **#1146:** no `notify` Edge function is deployed (only `mcp`), so N53's due-command worker now runs from a `pg_cron` job its migration schedules. The scheduling is guarded so it is a no-op where `pg_cron` is absent (PGlite). `pg_cron` is available but not yet installed on the project.
- **#1123:** N77 may mount `PresetPicker` in `TodayFocus.tsx` behind `v6Shell`.
- **#1119:** N82 may mount the v6 sources panel in `V6Project.tsx`.
- **#1140:** N84 and N86 now ask only for actions that have a write path today. Card reschedule/reset and concept create/edit/reparent/link/merge become N104 and N105, each with its own command, undo and MCP registration.
- **#1074:** already resolved in the merged N46.2 (#1053). The SQL bound is `0..2147483647`, matching the typed model.
- **main red after N92 (#1141):** it bumped `docs/v6/capability-registry/proposals.json` to `"version": 2`. The N40 contract pins owner-table inventories to version 1 (only the two D8 registry tables use 2), so `capability-registry.test.ts` failed on main. The version is set back to 1; the new `payload_version` column classification stays.
