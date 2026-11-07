# Incident #1016 — Supabase migration-order recovery (2026-11-07)

## Evidence and blast radius

- Main commit `74ad8d6`; deployment run `42335007630` stopped at **Apply migrations** before MCP deployment or smoke verification.
- `supabase db push` reported an unapplied *older* local migration, `20261106230000_activity_presets.sql`, before remote's last recorded `20261107005000_mcp_dispatch_audit_replay.sql`.
- Read-only production checks confirmed that `public.presets` was absent. Required `subjects`, `projects`, `checkpoints`, `log_change()` and `lemma_touch_updated_at()` already existed.
- The missing migration was approved and merged in N41.1 PR #993. Preserve its exact file and its owner RLS, composite FKs, audit trigger and validation constraints.

## Safe recovery

1. Confirm the target is **only** Supabase project `yemqnhnztlbyxmjxidis` and compare its migration history to the files on main. Never print production credentials or any connector path secret.
2. Check that version `20261106230000` is not recorded **and** `public.presets` does not exist. If either precondition differs, stop and investigate rather than rerunning the SQL.
3. An authorized production operator can apply the original, unchanged migration with the supported Supabase CLI operation `supabase db push --linked --include-all`. It must execute the SQL **and** record its original version together. Never mark a migration as applied without executing it; never rewrite, rename, delete or replay an existing applied migration.
4. Check that `public.presets` exists with owner RLS, its owner policy and both triggers, and version `20261106230000` is present exactly once in `supabase_migrations.schema_migrations`. Reconcile every other unexpected pending migration before continuing.
5. Rerun the failed deployment on **main** and require both Supabase migrations and deployed MCP smoke verification to pass. The incident closes only when the main workflow is green. Do not merge other PRs during an active S0 freeze.

## Recurrence prevention

When a migration PR is opened, check its timestamp against the **latest remote applied version**, not just existing files on main. Overlapping PRs can merge out of timestamp order. The permanent deployment preflight belongs in a separate Owner-authorized `rules:` change to protected CI; do not bypass protected paths in an ordinary incident PR.
