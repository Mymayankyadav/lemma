# Lane F — release and ship (RELEASE-01)

Next action: RELEASE-01 R1 — add `test/release_pwa.js` that serves `dist/` over HTTPS-equivalent localhost with the service worker **enabled**, verifies offline reload of the app shell and that a new build replaces the cached one without losing IndexedDB data; fix `src/service-worker.js` only if the test exposes a defect. Meanwhile watch `main` CI and record any red run and its culprit commit here.

| Field | Value |
| --- | --- |
| Status | New lane (integration 28 Oct). No work started. |
| Task | RELEASE-01 — gate in `plan.md` §2 and `docs/SHIP_PLAN.md`; owns the 22:00 IST ship cut (SHIP-F1) |
| Owns | see `lanes.json` lane F |
| Slices | R1 PWA offline/update test · R2 backup/restore round-trip test for cards, schedules and review history using existing export/import (`test/release_backup.js`); extend to contexts/plans/events after D's `StudyPlan` merges · R3 `.github/workflows/release.yml` on tag `v*`: build, attach APK + metadata to a GitHub release · R4 `docs/RELEASE.md` checklist and release notes; 21:00 freeze notice; 22:00 cut and tag on green `main` |
| Not yours | App code (request fixes from the owning lane), production database (A). Account erasure is expected to miss today: list it in the release notes. |

**Main CI watch log:** (append `time · commit · workflow · result · owning lane`)

**Requests from other lanes:** none yet.
