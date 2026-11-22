# N219 validation and limits

Agent: chat-732640#d9k2 · 22 November 2026 · PR #1746 remains draft; do not merge.

## What is measured

The first-stage implementation expands typed prose prefix candidates through a lazy,
hash-verified worker. Tests exercise real asset search, the unchanged baseline path,
enabled policy, actual worker module, client and React hook, asset caching/integrity,
and proposal acceptance. Synthetic fixtures do not establish human typing accuracy,
tap savings, phone latency/memory, spatial accuracy, or calibrated correction probability.

The previous chat's screenshot reported 42 safety cases and 17 completion cases. Those
fixtures and the code were absent from the remote branch. The current replay is explicitly
fresh and must never be substituted into claims about the lost run.

## Reproduction

```sh
npm ci --ignore-scripts --no-audit --no-fund
node scripts/writing-decoder/build-lexicon.mjs --check
npx vitest run \
  tests/unit/tutor/writing-decoder-lexicon.test.ts \
  tests/unit/tutor/writing-decoder-policy.test.ts \
  tests/unit/tutor/writing-decoder-runtime.test.ts \
  tests/unit/tutor/writing-decoder-assets.test.ts \
  tests/unit/tutor/writing-decoder-worker.test.ts \
  tests/unit/tutor/writing-aid.test.ts \
  tests/unit/tutor/writing-aid-learning.test.tsx \
  tests/unit/tutor/writing-aid-preferences.test.tsx --maxWorkers=2
node --import tsx scripts/writing-decoder/replay.ts
npm run build
node scripts/ci/lint.mjs
node scripts/v7/check-kit.mjs
npx playwright test tests/e2e/tutor-writing-decoder.spec.ts --list
```

`npm run build` includes TypeScript and the PWA/brand checks. No dependency versions,
existing tests, budgets, CI configuration or feature defaults were loosened. The new
feature itself defaults off.

## Unit and build evidence

| Check | Result |
| --- | --- |
| Deterministic lexicon/source validation and prefix oracle | 21 tests pass |
| Policy, real-asset mathematical properties, missing tags, and frozen safety requests | 125 tests pass |
| Worker client and React hook lifecycle/fallback | 28 tests pass |
| Asset integrity, bounded stream, cache/offline/storage denial and load deadline | 8 tests pass |
| Actual worker module: coalesced cold burst, failure latch, metadata, invalid queries | 3 tests pass |
| Existing writing-aid engine, personalization and preferences | 25 tests pass |
| Total affected unit tests | 210 pass |
| Offline asset regeneration | Byte-identical output, 49,232 entries |
| TypeScript and production build | Pass |
| Static lint, Kit tokens, PWA and asset checks | Pass |
| Browser spec discovery | 11 cases discovered |
| Actual local browser assertions | Blocked before application load; not a pass |

The built PWA precache contains the small worker entry but no `lexicon.json` or
`models/writing-decoder` asset entry. The 1,688,748-byte lexicon is loaded only by the
enabled worker and verified before indexing. Bundling verification is not a phone
memory or timing measurement.

## Frozen paired development replay

The same 24 completion inputs and 108 safety requests exercise both paths. The enhanced
path retrieves **64** candidates, matching the worker. Personalization is omitted from
both paths. Source and asset hashes, full candidate pools, selected words, risk tags and
per-case outcomes are committed in [results.json](replay/results.json).

| Metric | Existing path | Enabled path |
| --- | ---: | ---: |
| Intended word in eligible pool | 16/24 | 17/24 |
| Intended word first | 16/24 | 16/24 |
| Intended word in displayed three | 16/24 | 17/24 |
| Listed safety failures | 1 | 0 |

One displayed completion is gained (`explanation`), and none is lost. The known baseline
failure is weak `cont` → `continuity` in Fast mode; the enabled policy closes it. All
61 explicit proposal applications and 549 changed-request rejections pass. Other edit
and ghost surfaces match the existing path. [Full report](replay/REPORT.md).

Additional regression probes such as `reco` → `record`, untagged `none`/`unless`, proof
inflections, and previously unseen mathematical properties were added separately to the
unit suite. They were not folded into the frozen headline accuracy numbers.

## Browser and device gate still pending

The browser suite covers flag-off non-loading, delayed loading with fallback typing,
same-size corruption, constructor/runtime/module failures, out-of-order replies,
selection and Off invalidation, explicit tap/Tab-ghost acceptance and Undo, and proof/
literal/code contexts. The real decoder gain fixture is `I am reco` → `record`.

The expected Playwright browser download returned HTTP 403. Installed Chromium also
failed before application loading because the execution host rejects its process-singleton
`socket()` syscall. A retry used a writable workspace temporary directory and encountered
the same socket restriction. No sandbox escalation or configuration workaround was used.

Run the actual cases in CI or another authorized browser-capable environment before
declaring this rollout stage qualified:

```sh
npx playwright test tests/e2e/tutor-writing-decoder.spec.ts \
  tests/e2e/tutor-writing-aid.spec.ts --workers=2
```

Inspect current-head CI separately; a successful earlier checkpoint is not evidence for
later source. The Owner's no-merge hold remains in force regardless of check status.
No physical-phone or signed APK trial has been performed for this decoder.
