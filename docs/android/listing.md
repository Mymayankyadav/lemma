# Lemma — Google Play listing kit (AND-4)

**Track:** Internal testing (one owner). Do not publish to production without the owner's separate decision. Package: `io.github.mymayankyadav.lemma`.

## Copy for Play Console

Title: Lemma: maths study

Short description: Your maths plan, cards and tutor notes, with Claude or ChatGPT.

### Full description

Lemma is a quiet place to keep a serious mathematics study project moving.

See the checkpoint you are working on, the route ahead, and what you have finished. Organise projects around a goal, a reading plan and your own notes. The Today screen brings your next step, due cards and proposals together without turning study into a dashboard of deadlines.

Use Claude or ChatGPT as your tutor. Lemma keeps the plan, progress and notes between conversations, so you can resume from where you stopped. Suggestions to change your plan or add cards wait for your approval. You decide what becomes part of your study record.

Review flashcards with spaced repetition, mix decks, and record confidence before seeing an answer. Explore the Atlas to follow connections between ideas. Attach PDF sources to a project and keep their extracted page text beside your checkpoints.

Graph-paper day and night themes, clear typography and small, deliberate controls keep the interface focused on mathematics. The app is designed for one owner and syncs study data through Supabase. An internet connection is needed for current data and most actions.

Lemma is an independent study organiser. It is not affiliated with Claude, ChatGPT or their providers, and it does not promise learning outcomes.

## Data safety — draft for the owner to verify in Play Console

| Data category | Collected | Shared with third parties | Purpose | Security / deletion |
| --- | --- | --- | --- | --- |
| Email | Yes | No | Account authentication through Supabase | HTTPS in transit; delete on request |
| App activity | Yes | No | Projects, plans, checkpoints, sessions, reviews, progress, tutor notes and optional reminder preferences | HTTPS in transit; delete on request |
| Files | Yes, when uploaded | No | Uploaded PDFs and their extracted page text for the owner's study projects | HTTPS in transit; delete on request |

Supabase is the app's storage/authentication service provider, hosted in **ap-south-1 (Mumbai)**. No ads, analytics SDK or data brokerage. The owner should verify these answers against the final shipped features, especially notifications and any optional integrations, before submitting the Play form. "Not shared" follows the approved app specification's processor distinction; Play Console may require its own processing disclosure.

**Privacy policy URL:** `https://mymayankyadav.github.io/lemma/privacy.html`

**Deletion path:** Settings → Export for a copy, then email the app owner using the developer contact email listed in Play Console. The developer contact email is **owner-supplied**; do not invent or commit an address. Do not ask users to post private deletion requests publicly.

## Store screenshots

Eight real phone captures at **360×640 CSS px × 3 DPR = 1080×1920 PNG** (day and night for each): Today, Project Route, Review run, Atlas.

```sh
npm ci
npm run build
npm run preview -- --port 4173
# In another terminal:
node scripts/play-shots.mjs --capture
node scripts/play-shots.mjs --verify
```

The capture script waits for actual screen content, blocks horizontal overflow, checks PNG headers and dimensions, and writes `docs/android/shots/{today,project,review,atlas}-{day,night}-1080x1920.png`. Commit only genuine browser captures; never replace them with illustrations or empty placeholders.

For a checkout without a local Chromium environment, the dedicated
`tests/e2e/and4-play-shots.spec.ts` acceptance test runs the same capture
script in GitHub's Playwright CI and copies **actual Chromium PNG bytes** into
`test-results/screens/android/`. Download the corresponding
`screens-shard-<n>` artifact from the **exact-head** CI run, visually inspect
all eight images, and commit the six missing Project/Review/Atlas day/night
PNGs (and replace the two Today images only if the new captures are correct).
The test fails if the Review run contains only a loading skeleton or no
actual card, if a theme is wrong, or if any image is corrupt or not 3× DPR.
An artifact is evidence, **not** a substitute for committing the verified
images to `docs/android/shots/` before marking AND-4 Ready.

## Owner-only publication checklist

- [ ] Confirm the developer contact email and privacy/deletion process in Play Console.
- [ ] Confirm the final Data safety form against deployed features.
- [ ] Upload the first signed AAB manually to Internal testing and add the owner's tester account.
- [ ] Verify the origin-root Digital Asset Links and both signing fingerprints.
- [ ] Approve any future public listing/closed-test requirement separately.

Source: [Android spec §5–6](../spec/android.md#5-store-listing-and-privacy-and-4).