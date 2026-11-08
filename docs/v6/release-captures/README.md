# v6 app captures (release evidence)

These 19 PNGs are captures of the **actual built Vite/React app**, not the design. The screenshot test `tests/e2e/v6-release-audit.spec.ts` renders the 390×844 viewport with `?demo=1&flags=v6Shell` after each screen has finished loading (Day and Night on nine screens, Focus in Day). Provenance: source commit `ccad38e`, [CI run 42497431997](https://github.com/Mymayankyadav/lemma/actions/runs/42497431997); no app source changed between that run and the image commit.

Compare them with the design target in `docs/v6/screens/`. As of 2026-11-08 the app does **not** match the mockup on any screen; see `docs/v6/RELEASE.md` (G7) and the tracking issue linked there.

Reproduce: `LEMMA_RELEASE_CAPTURE=1 npm run e2e -- tests/e2e/v6-release-audit.spec.ts -g 'N101 screenshot capture'` (normal CI writes to `test-results/v6-release/screens/`).
