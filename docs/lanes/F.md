# Lane F — release and ship (RELEASE-01)

R0 implementation is in [PR #87](https://github.com/Mymayankyadav/lemma/pull/87). Next action: verify exact-head CI and merge R0, then build R1 PWA offline/update test. Original R0 scope: create `.github/workflows/release.yml` + `test/release_live_smoke.js`: after each successful "Deploy Lemma web" run on `main` (`workflow_run`) and on `workflow_dispatch`, run Playwright against `https://mymayankyadav.github.io/lemma/` with the checks in `docs/SHIP_PLAN.md`, upload screenshots, and record each result in the watch log below. `test/release_live_smoke.js` must exit 0 without running when `LEMMA_LIVE_URL` is unset so `npm test` stays offline. Then RELEASE-01 R1 — add `test/release_pwa.js` that serves `dist/` over HTTPS-equivalent localhost with the service worker **enabled**, verifies offline reload of the app shell and that a new build replaces the cached one without losing IndexedDB data; fix `src/service-worker.js` only if the test exposes a defect. Meanwhile watch `main` CI and record any red run and its culprit commit here.

| Field | Value |
| --- | --- |
| Status | SHIP-F0 R0 implemented in PR #87. **Live Pages test SUCCESS** at head `08ad98116f958fc4d9366d452f73267748c33913`: [run 40666883246](https://github.com/Mymayankyadav/lemma/actions/runs/40666883246), including intentionally broken URL rejection. This is live anonymous web only, not production authenticated/two-device verification. Merge gate still requires exact final head regression/Android CI. |
| Task | RELEASE-01 — gate in `plan.md` §2 and `docs/SHIP_PLAN.md`; owns the 22:00 IST ship cut (SHIP-F1) |
| Owns | see `lanes.json` lane F |
| Slices | R0 live-site smoke (SHIP-F0) · R1 PWA offline/update test · R2 backup/restore round-trip test for cards, schedules and review history using existing export/import (`test/release_backup.js`); extend to contexts/plans/events after D's `StudyPlan` merges · R3 tag `v*` creates a GitHub release with notes (no APK: Android paused) · R4 `docs/RELEASE.md` checklist and release notes; 21:00 freeze notice; 22:00 cut and tag on green `main` |
| Not yours | App code (request fixes from the owning lane), production database (A). Account erasure is expected to miss today: list it in the release notes. |

**Main CI watch log** (time UTC · commit · workflow · result · owning lane):

- 2026-10-28 09:37 · `1653e401` · [regression 40665652911](https://github.com/Mymayankyadav/lemma/actions/runs/40665652911) / [local Supabase 40665653019](https://github.com/Mymayankyadav/lemma/actions/runs/40665653019) / [Android lane guard 40665653015](https://github.com/Mymayankyadav/lemma/actions/runs/40665653015) / [Pages 40665653044](https://github.com/Mymayankyadav/lemma/actions/runs/40665653044) · SUCCESS all · integration.
- 2026-10-28 09:46 · `ae14fe6` (PR #87) · [live smoke 40666690085](https://github.com/Mymayankyadav/lemma/actions/runs/40666690085) · FAILURE, test-only mobile hidden desktop button; owning F; fixed by `08ad981`.
- 2026-10-28 09:48 · `08ad981` (PR #87) · [live smoke 40666883246](https://github.com/Mymayankyadav/lemma/actions/runs/40666883246) · SUCCESS, anonymous create/review/reload, Settings sign-in button, navigation, no console/same-origin failure; **not yet a post-merge main run**.

**Requests from other lanes:** none yet.

**R0 claim:** SHIP-F0; owned paths `.github/workflows/release.yml`, `test/release_live_smoke.js`, `docs/lanes/F.md`. Start from main@1653e401; implement dispatch/workflow-run health check with fail-closed browser assertions, red-URL negative case; next run PR CI and verify green live Pages workflow before ship. No Android, production DB, or account writes.

**R0 boundary:** `test/release_live_smoke.js` skips without `LEMMA_LIVE_URL` in offline npm tests. PR job tests the real deployed URL and a local 404 negative control, with screenshot artifact. Service workers are deliberately disabled for this test; R1 must test them enabled. The live success verifies current Pages deployment, not any unmerged D/E feature.
