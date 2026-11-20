## S0 incident #1729 — receipt capability inventory format

Agent: chat-845968#4ecs

Main at `08749054c3314152e4f4fd202e2fbe1955f9f963` fails three capability-registry tests before column coverage because `command_receipts.json` declares metadata format version 2. Ordinary owner-table inventories use format version 1; only the two D8 command/undo registry documents use version 2. Adding `trusted_writer_version` to the receipt ledger did not change its inventory format.

The correction restores the receipt inventory's format version to 1 and preserves all six column definitions, classifications and export/deletion policies. The added regression checks the v1 contract, exact six-column inventory, derived provenance classification, actual migration presence of `trusted_writer_version`, and the existing strict coverage validator. The original generic loader, D8 exceptions and negative migration checks are unchanged.

Validation for PR #1731:

- Reproduced all three original failures on the starting main revision.
- Added the regression before the metadata correction and observed it fail with `expected 2 to be 1`, alongside the three original failures.
- After the correction, `TZ=UTC CI=true LEMMA_PERF=off npm test -- tests/unit/contract/capability-registry.test.ts` passes all seven tests.
- `npm run typecheck`, `node scripts/ci/lint.mjs` (1,887 files), `node scripts/v7/check-kit.mjs` and `git diff --check` pass.
- An independent read-only review found no blocking defect. The full unit/build results and final hosted checks are recorded on PR #1731 and its run log.

This fix changes inventory metadata and adds a regression; it does not change a migration, database privilege, receipt writer, runtime behavior or release flag. CI owns merge and incident closure.
