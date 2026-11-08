## Incident #1291 — duplicate migration version blocked the deploy

N89 and N90 were developed in parallel and both landed as version `20261208110000`.
N90 deployed first and recorded that version. When N89 merged, `supabase db push` matched
one file to the recorded version and treated the other (N90) as pending, so it tried to
re-create `proposals_command` and failed with SQLSTATE 42723. Main was not deployed and
N89's schema (versions on `push_devices`/`notify_holds`, `notify_command`) never reached
production.

Fix: N89's migration is renamed to `20261208110100_n89_notify_command.sql`, so it is a new
pending version after N90's recorded one. Migration content is unchanged. N90 keeps its
version because production already has it. `tests/unit/db/migration-versions.test.ts` now
fails any future duplicate version before merge.

Verified locally: version-uniqueness test, `notify-command.mjs`, `proposals-command.mjs`.
