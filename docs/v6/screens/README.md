# Real application screenshots — N101

These 19 PNGs were captured from the **actual built Vite/React application**, replacing the historic standalone v6 mockup images. The screenshot test `tests/e2e/v6-release-audit.spec.ts` renders the real app at 390×844 CSS pixels with `?demo=1&flags=v6Shell`: both Day/Night on nine screens and Focus in Day. Provenance: source commit `073e9e9`, [CI run 42495300188](https://github.com/Mymayankyadav/lemma/actions/runs/42495300188). App source files were not modified between this run and the image commit.

Reproduce/overwrite the screenshots with `LEMMA_RELEASE_CAPTURE=1 npm run e2e -- tests/e2e/v6-release-audit.spec.ts -g 'N101 screenshot capture'`. A normal CI test writes renders to `test-results/v6-release/screens/` instead.

These files do **not** certify the 320/360/390px audit at 200% text or physical-device behavior. Known G7 defects [#1298](https://github.com/Mymayankyadav/lemma/issues/1298) (Today overflow), [#1299](https://github.com/Mymayankyadav/lemma/issues/1299) (Review Undo), and [#1300](https://github.com/Mymayankyadav/lemma/issues/1300) (Kit overflow) remain open.
