# N195 dependency integration fixture

These files are byte-identical snapshots of the canonical N191 shared receipt and
release capability migrations, and the reviewed N197 eight-writer cutover at
`6f0534453a8b7d6c0094abe34033da93a75a5cee` (PR #1725).
`manifest.json` records their repository
commits, source URLs and Git blob hashes. The loader validates every hash and uses
the matching production migration when it exists. A diverged production file
fails the test and requires a fresh compatibility review; it is never silently
substituted by the snapshot.

The N195 SQL tests install these **only in disposable test databases**, alongside
the complete production migration chain, and then exercise real receipts, role
privileges, RLS, rollback and concurrency. No feature assertions are skipped.
`first-study-upgrade.mjs` defers only the two real receipt/release foundation
migrations while retaining the other current migrations and reviewed cutover. It
compares legacy review signatures, ACLs, queues and data before and after N195,
checks the absent and release-only partial foundation, then installs the canonical
foundation and repeats those checks with its real default-off release.

Passing this fixture demonstrates integration with the recorded dependency
revisions, including current main's N191, N193 and N196 migrations. It does not
prove deployment or public release readiness. The N197 snapshot remains test-only
until its separate Owner-approved rules PR lands; its independent review covers
all eight legacy writers, sixteen native PostgreSQL races, receipt exports and
account purge. N195 never deploys that cutover from this fixture.
