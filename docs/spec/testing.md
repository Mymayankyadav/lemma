# Testing specification

## 1. Policy

- Few tests, all automated, no human steps. The app has one user; tests protect the logic that is easy to break and prove each screen works.
- Every screen test runs in **demo mode** (`?demo=1`), so no sign-in or network is needed. This is also what lets ChatGPT's browser agent run the acceptance checklist (§7) without help.
- Logic gets unit tests; screens get one Playwright spec each; the connector gets one self-test. Nothing else.
- A failing test is fixed, never deleted or loosened to pass.

## 2. Commands (defined in task P0-A)

| Command | Runs |
| --- | --- |
| `npm run typecheck` | `tsc -b --noEmit` |
| `npm test` | Vitest unit tests (`tests/unit/**`, jsdom) |
| `npm run build` | type check + Vite production build |
| `npm run check` | typecheck + test + build (required before every PR) |
| `npm run e2e` | Playwright specs (`tests/e2e/**`) against `vite preview` in demo mode |
| `node tests/mcp/smoke.mjs` | connector self-test against `MCP_URL` (§5) |

## 3. Unit tests (Vitest)

| File | Owner task | Must cover |
| --- | --- | --- |
| `tests/unit/lib/fsrs.test.ts` | LIB-1 | Port `legacy/test/compare_tsfsrs.mts` (golden comparison with ts-fsrs 5.4.1, same tolerances) and `legacy/test/optimizer_synthetic.js` (optimizer moves toward true weights). |
| `tests/unit/lib/render.test.ts` | LIB-1 | Port the cases of `legacy/test/render_test.js`: inline and display math, cloze ordinals (`clozeOrds`), cloze front/back rendering, sanitizing script tags, macros from the preamble. |
| `tests/unit/lib/queue.test.ts` | LIB-1 | Learning cards due now come first; new cards interleave at the ratio in `product.md` F8; daily limits; siblings never together; Mix decks avoids same checkpoint back to back when possible; session and concept filters. |
| `tests/unit/lib/derive.test.ts` | LIB-1 | Checkpoint UI status for each case in `data.md` §6.1; re-check ladder transitions §6.3; concept status §6.4; session display state §6.2. |
| `tests/unit/lib/insights.test.ts` | LIB-1 | Recall buckets (day/week), stacked counts, calibration percentages, time by subject, medians, on a small hand-made dataset. |
| `tests/unit/pdf/ingest.test.ts` | PDF-1 | On `tests/fixtures/sample.pdf` (3 pages, page labels `i, 1, 2`, one outline entry, one hyphenated line break): page texts, labels, outline page index, de-hyphenation, `has_text`. |
| `tests/unit/data/demo.test.ts` | DEMO-1 | Demo numbers from `data.md` §10 (23 due, 6 proposals, 3/12); approving a cloze card with `c1` and `c2` creates 2 cards; plan change approval inserts CP4a between CP4 and CP5; record and undo review restore state. |

## 4. Screen tests (Playwright)

Config (task P0-C): Chromium only, viewport 390 × 844, device scale 2, `colorScheme: 'dark'`, `reducedMotion: 'reduce'`, base URL `http://localhost:4173/lemma/?demo=1#/`, web server `npm run build && npm run preview -- --port 4173`. Each spec ends with a full-page screenshot saved to `test-results/screens/<spec>.png` (uploaded by CI as an artifact for visual review).

| Spec | Owner task | Assertions |
| --- | --- | --- |
| `routes.spec.ts` | P0-B | Every route in `design.md` §6 renders its `h1` without console errors. |
| `kit.spec.ts` | UI-1 | `/kit` shows every component section; tab bar has 4 items; reduced motion leaves no element with an infinite animation running. |
| `home.spec.ts` | SCR-HOME | Shows "Compactness", "23" due, "6" to approve, 3 project rows (first "Real Analysis" with "3/12"); Resume copies "Resume Real Analysis" (clipboard permission granted) and shows "Prompt copied". |
| `projects.spec.ts` | SCR-PROJ | Featured project "Real Analysis"; Atlas tile "22 ideas, 3 to revisit"; New project: fill name, subject, goal, attach `tests/fixtures/sample.pdf`, see "3/3" pages read, Create → lands on the new project with "Needs a plan". |
| `project.spec.ts` | SCR-PATH | "3 / 12"; CP4 expanded with "Step 2"; CP4a shows "Proposed"; Sessions tab lists S7 with "42m"; Sources tab shows "342 pages"; tapping CP5 opens the checkpoint sheet. |
| `session.spec.ts` | SCR-SESS | `/s/real-analysis/7` shows goal met, 4 reasoning items, misconception "open cover vs open set", 5 cards, "Review" proposals button. |
| `proposals.spec.ts` | SCR-PROP | Cards tab count 5; approve via button → count 4; reject → 3; swipe gesture (mouse drag right) approves; Plan tab shows "Finite subcover lemma"; approve → project path shows CP4a as next or locked (not proposed). |
| `review.spec.ts` | SCR-REV | Hub shows 23; unchecking Topology → 20; start; tap "Sure" reveals the answer; grade Good; progress advances; undo returns the card; finishing the queue shows the summary with "cards reviewed". |
| `cards.spec.ts` | SCR-CARD | Search "Heine" finds N7; detail shows the open note; add a note → it appears with "Next time you ask to update cards". |
| `atlas.spec.ts` | SCR-ATLAS | 22 nodes rendered; "Revisit" filter dims all but 3; `?focus=compactness` opens the sheet with "Compactness" and "In progress". |
| `insights.spec.ts` | SCR-INS | 30 days: "18h 40m", "26", "412", recall "91%"; switching to 7 days changes the tiles; calibration shows "94%". |
| `settings.spec.ts` | SCR-SET | Connector shows "Connected" and a masked address; eye reveals; ChatGPT "Set up" expands 3 steps; target recall slider changes the value label; "Download a backup" triggers a download. |

## 5. Connector test

- `GET <MCP_URL>/selftest` (built in MCP-1, specified in `connector.md` §9) runs the full tool sequence on throwaway data and cleans up.
- `tests/mcp/smoke.mjs` calls the self-test, then speaks MCP (`initialize`, `tools/list`) and checks names and size.
- Workflow `.github/workflows/mcp-smoke.yml`: manual trigger and after every successful connector deploy; reads the `MCP_URL` repository secret; skips with a notice if it is missing.

## 6. CI gates

- Every PR: `npm ci`, `npm run check`, `npm run e2e` (only specs that exist).
- `main`: the same, then deploy Pages; connector and migrations deploy when `supabase/**` changed; then the MCP smoke.
- A PR merges only when CI is green on its last commit. Exception: PRs merged before `ci.yml` exists on `main` merge on a local `npm ci && npm run check` (pasted in the PR), because CI does not exist yet; connector PRs paste the smoke output instead.

## 7. Acceptance checklist for ChatGPT's browser agent (task QA-1)

Give ChatGPT (agent mode with a browser) this whole section as the prompt. It needs no login.

> Open https://mymayankyadav.github.io/lemma/?demo=1#/ on a phone-sized window (about 390 × 844). Work through the checks below in order. For each, report PASS or FAIL, and for FAIL describe what you saw and attach a screenshot. Do not stop at the first failure.
>
> 1. Home shows today's date, a Resume card for "Compactness" with "2/4" and a question in italics, tiles "23 cards due" and "6 to approve", and three projects with progress bars.
> 2. Tap the inbox icon (top right). The Approve screen shows "Cards 5" and a card asking why two sets must be disjoint.
> 3. Tap the check button. The next card appears and the count shows 4. Tap the x button; the count shows 3.
> 4. Switch to the Plan tab. It shows "Finite subcover lemma" with a reason. Tap Approve. Go back to Home.
> 5. Tap Projects in the tab bar, then Real Analysis. The path shows 3 of 12 done, Compactness expanded at step 2, and Finite subcover lemma as a normal checkpoint after Compactness.
> 6. Open the Sessions tab and tap the session with 42m. It shows "Goal met", a reasoning timeline, and the misconception "open cover vs open set".
> 7. Tap Review in the tab bar. It shows a due count with decks. Uncheck Topology; the count drops by 3. Tap the round play button.
> 8. On the card, tap "Sure". The answer appears with four grade buttons showing intervals. Tap Good. The progress number increases. Tap the undo arrow; the same card returns.
> 9. Close the review. Tap the search icon, search "Heine", open the card, add the note "Shorter please", and check it appears under "For your tutor".
> 10. Open the Atlas from Home (constellation icon). Ideas appear in three groups. Tap "Revisit": only three ideas stay bright. Tap "Compactness": a sheet shows "In progress".
> 11. Open Insights. With 30 days selected, tiles show "18h 40m", "26" and "412", and Recall shows "91%". Select 7 days; the numbers change.
> 12. Open Settings (sliders icon on Home). The connector shows "Connected" and a hidden address; the eye shows it. Tap ChatGPT "Set up"; three steps appear.
> 13. Check the look on every screen: dark background, amber highlights, no overlapping or cut-off text, no English typos, tab bar visible on the four main screens.
>
> Finish with a table: check number, PASS/FAIL, note.

QA-1 runs this after Phase 2 and again after Phase 3, files one issue per FAIL, and links the report in the PR.
