# UI audit capture

Drives the built Lemma app through every screen and flow on a phone (390×844, night theme) and writes **contact sheets**
(several phone frames side by side, captioned) for a reviewer that only sees images.

```
npm run audit:ui                                   # builds if needed, serves, captures both profiles → artifacts/ui-audit/
npm run audit:ui -- --profiles full,empty,heavy    # add the stress-data profile (list and chart screens only)
npm run audit:ui -- --only tasks,capture           # a subset (scene id or group substring); --list shows the scenes
npm run audit:ui -- --base http://localhost:4173/lemma/ --no-build   # reuse a running preview
```

Needs a build made with `VITE_ALLOW_FLAG_OVERRIDES=1` (the script does this itself when it has to build) because the empty
profile uses the dev-only `?demo=first-use`. Chromium comes from Playwright (`CHROMIUM_PATH` overrides). About 4 minutes, no network.

Output (`artifacts/ui-audit/`, git-ignored): `REVIEW_BRIEF.md` (what to judge, the output format) · `INDEX.md` (read first) ·
`sheets/*.png` (1568px wide, 4 frames each) · `frames/*.png` (2x originals) · `manifest.json`.

Profiles: **full** = typical demo account; **empty** = brand-new account (`?demo=first-use` plus empty tab-scoped stores for
tasks, blocks, thoughts, goals, deadlines, practice, review runs); **heavy** = `?demo=stress`.

Files: `capture.mjs` (runner) · `scenes.mjs` (the walkthrough: edit here to add a screen or flow) · `lib.mjs` (browser setup,
the `p` helper, scroll frames, sheet composer) · `index-md.mjs` (INDEX.md) · `REVIEW_BRIEF.md` (copied to the output).
Clock is frozen at Mon 9 Nov 2026 13:43 IST like `tests/e2e/v7-scenes.ts`; flows that need time to pass call `p.advance(minutes)`.
A step that cannot be performed becomes a warning on its frame and in INDEX.md; the scene still leaves a frame of where it stopped.
