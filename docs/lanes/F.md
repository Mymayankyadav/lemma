# Lane F — release and ship (RELEASE-01)

Next action: SHIP-F0 (P0, web priority) — create `.github/workflows/release.yml` + `test/release_live_smoke.js`: after each successful "Deploy Lemma web" run on `main` (`workflow_run`) and on `workflow_dispatch`, run Playwright against `https://mymayankyadav.github.io/lemma/` with the checks in `docs/SHIP_PLAN.md`, upload screenshots, and record each result in the watch log below. `test/release_live_smoke.js` must exit 0 without running when `LEMMA_LIVE_URL` is unset so `npm test` stays offline. Then RELEASE-01 R1 — add `test/release_pwa.js` that serves `dist/` over HTTPS-equivalent localhost with the service worker **enabled**, verifies offline reload of the app shell and that a new build replaces the cached one without losing IndexedDB data; fix `src/service-worker.js` only if the test exposes a defect. Meanwhile watch `main` CI and record any red run and its culprit commit here.

| Field | Value |
| --- | --- |
| Status | R0 claimed 2026-10-28 09:45 UTC, run `chat-20261028-lane-f-r0-1512`; implementing on `lane-f/release-01-r0-live-smoke`; no live acceptance yet. |
| Task | RELEASE-01 — gate in `plan.md` §2 and `docs/SHIP_PLAN.md`; owns the 22:00 IST ship cut (SHIP-F1) |
| Owns | see `lanes.json` lane F |
| Slices | R0 live-site smoke (SHIP-F0) · R1 PWA offline/update test · R2 backup/restore round-trip test for cards, schedules and review history using existing export/import (`test/release_backup.js`); extend to contexts/plans/events after D's `StudyPlan` merges · R3 tag `v*` creates a GitHub release with notes (no APK: Android paused) · R4 `docs/RELEASE.md` checklist and release notes; 21:00 freeze notice; 22:00 cut and tag on green `main` |
| Not yours | App code (request fixes from the owning lane), production database (A). Account erasure is expected to miss today: list it in the release notes. |

**Main CI watch log:** (append `time · commit · workflow · result · owning lane`)

**Requests from other lanes:** none yet.

**R0 claim:** SHIP-F0; owned paths `.github/workflows/release.yml`, `test/release_live_smoke.js`, `docs/lanes/F.md`. Start from main@1653e401; implement dispatch/workflow-run health check with fail-closed browser assertions, red-URL negative case; next run PR CI and verify green live Pages workflow before ship. No Android, production DB, or account writes.
