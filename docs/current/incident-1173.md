## Incident #1173 — deployed MCP tools/list exceeded the 15,000-character limit

The Supabase deployment job for main at 04c62f0 failed its real Edge endpoint verification three times on 2026-11-08 with `tools/list too large: 15050`. The N37 dynamic registry implementation had serialized both a fixed legacy `z.enum` and a superset generic identifier regex as an `anyOf` schema for `study.command.resource` and `study.command.operation`. Every listed legacy enum value already matched the regex, so these branches added schema bytes without restricting any accepted command.

The fix keeps the exact identifier pattern for both fields and removes only redundant enum branches; the service-role registered dispatcher still enforces which resources and operations can execute, and legacy study/task routing, receipt envelopes, tool names, read paths and permissions stay unchanged. No smoke limit, CI threshold, test budget or protected path is altered. A unit regression records the bounded-schema invariant and unchanged input fields; real deployed MCP selftest remains the authoritative 15,000-character gate.

The incident PR needs green CI, an independent production Edge review and CI-managed merge/deploy; creation alone does not restore the endpoint.
