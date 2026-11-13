## Incident #1396 · N157 r3 re-landed; every e2e shard now writes a screenshot

**What happened.** PR #1392 (N157 v7 UX audit r3) merged and the full CI run on `main` failed: `e2e-3-of-4` passed all of its
tests, then its `screens-shard-3` upload failed (`if-no-files-found: error`, "No files were found with the provided path:
test-results/screens/"). CI read that as "job failed with no test report" and reverted #1392 (#1397).

**Cause.** The CI e2e job runs Playwright as four shards and requires every shard to upload at least one file from
`test-results/screens/` (`tests/unit/ci/workflow-sharding.test.ts` pins this). Playwright cuts the shards by test count in
file order. #1392 added about 200 tests in the `v7-n157-*` files, which moved the shard boundaries: shard 3 started at
`v6-n121-audit` and ended at `v7-design-lint`, and none of the specs that write screenshots (`proposals`, `st-4-…`,
`tab-bar-euclid`, …) were left in it. Nothing was wrong with N157's code. The fast-gate cannot see this: it runs only the
affected specs in its own shards.

**What this PR does.**
- Re-applies #1392 exactly (a revert of #1397); the seven U4 flags and `v7Margin`/`v7Room` stay default off.
- Adds one `page.screenshot` call to two existing tests that sit in the middle of shard 3 after the re-land
  (`v6-n121-foundations.spec.ts` "E2", `v7-atlas.spec.ts` "the seed shows 82 stars"). No test was added, removed or loosened, so
  the shard boundaries do not move.

**Still fragile.** Any later PR that adds or removes e2e tests can move the boundaries again. The durable fix is in a
protected path (`.github/workflows/ci.yml` and the pinning unit test) and needs an Owner `rules:` PR: upload the screenshots
with `if-no-files-found: ignore`, and validate the union of shards in `qa3-screens` instead of each shard.

**Also seen, not fixed here.** `tests/unit/data/demo.test.ts` "can ingest a three-file demo queue through the real PDF parser"
timed out at 5000 ms (5521 ms) on the loaded runner of the revert's own run. It is a timing flake; re-running the job clears it.
