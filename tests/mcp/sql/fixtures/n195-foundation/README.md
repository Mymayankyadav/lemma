# N195 dependency integration fixture

These files are byte-identical snapshots of the shared receipt, release capability,
and seven-writer cutover candidates. `manifest.json` records their repository
commits, source URLs and Git blob hashes. The loader validates every hash and uses
the matching production migration when it exists. A diverged production file
fails the test and requires a fresh compatibility review; it is never silently
substituted by the snapshot.

The N195 SQL tests install these **only in disposable test databases**, alongside
the complete production migration chain, and then exercise real receipts, role
privileges, RLS, rollback and concurrency. No feature assertions are skipped.
`first-study-upgrade.mjs` separately installs only the production chain and verifies
that missing dependencies leave N195 unavailable while ordinary review and all
existing data retain their behavior.

Passing this fixture demonstrates integration with the recorded dependency
candidates. It does not mean N191/N197 were merged, reviewed for release, or
deployed. The N197 cutover remains subject to its separate Owner-approved rules
change and full seven-writer acceptance.
