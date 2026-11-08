# Screenshot provenance (N101)

The 19 original `<screen>-<day|night>.png` captures in this folder depict the **standalone v6 mockup**, not the React app. They are design references, not G7 evidence.

From a checkout with npm/Playwright installed, run `LEMMA_RELEASE_CAPTURE=1 npm run e2e -- tests/e2e/v6-release-audit.spec.ts -g 'N101 screenshot capture'`. This runs the actual Vite preview and overwrites the nine Day/Night pairs and Focus Day capture at 390×844. Inspect at 320/360/390 widths and 200% text and **commit the new images**. Normal CI runs write the renders to `test-results/v6-release/screens/` instead; passing CI does not update checked-in assets.

Until replaced by those real renders, the existing images must not be labelled as release screenshots.
