# Lemma · owner guide

Lemma is a private, proof-first mathematics study environment. Your tutor does not automatically decide what you know: only you approve plans, cards and changes. The web app runs at [Lemma on GitHub Pages](https://mymayankyadav.github.io/lemma/).

## Starting and installing

Visit the site in Chrome on Android, sign in with your Google account and choose **Install app** or **Add to Home screen** from Chrome's menu. After your first online visit, the installed app shell, icons and fonts can open offline. Your live study records remain in Supabase: **offline edits and reviews do not auto-save**. Reconnect, inspect the pending item and retry. Lemma never silently replays a review or approval whose server acknowledgement was lost.

A new release appears as an **Update** prompt. You decide when to refresh, so an update cannot interrupt a proof or a card mid-review.

For a safe walkthrough without touching your real account, use [the deterministic demo](https://mymayankyadav.github.io/lemma/?demo=1#/). Select `?demo=0` to return to live mode. Demo actions are local test data, not real cloud records.

## Study workflow

1. **Today:** resume your checkpoint or tutor session, see due cards and pending tutor proposals, and jump to projects. The tutor connection banner appears until the connector has reported activity.
2. **Projects:** create a project with a subject, precise learning goal and teaching style. Upload a source PDF (up to 50 MB) if desired. The reader extracts page text locally before storing it in your private Supabase bucket. Scanned pages may not contain selectable text.
3. **Tutor:** from a project, checkpoint or session, copy the prepared handoff prompt and open your preferred AI chat. Ask the tutor to set a path and work through proofs rather than reveal solutions. The connected tutor proposes evidence, checkpoint updates and cards.
4. **Approve:** read card or study-plan proposals. Swiping a card right approves; left rejects. Inspect edits before approval. Nothing is silently accepted.
5. **Review:** select decks, sessions or a concept from Atlas; choose a confidence level **before** seeing the answer, then grade Again, Hard, Good or Easy. FSRS schedules the next due time. Undo the last answer if necessary.
6. **Atlas:** pinch or scroll to zoom; drag to pan; tap a concept for its checkpoint and review cards. Drag a node to pin its position. Hold a pinned node to unpin it.
7. **Insights:** inspect retention, review, study-session and checkpoint trends. Reading your own statistics is not proof of mastery; mastery comes from evidence supplied by you.
8. **Settings:** choose your preferred chat, teaching style and spaced-repetition options. Export a JSON backup. Private connector secrets are not included in a backup.

## Connecting your AI tutor

In **Settings**, find the **Connector** URL and add it as a remote MCP server in your supported AI chat application. Connect with the exact private URL from your Settings page. Do **not** paste or publish it in a repository, public issue, screenshot, chat message or support request. Rotating the connector secret invalidates the old URL; update any connected AI clients after rotation. The API includes 14 approved tools and remains owner-scoped.

If the tutor does not appear connected, open Settings, confirm the URL in the AI client's connector configuration, then have the tutor list your projects. In the app, refresh the Home page to update connection status. You retain the right to approve all proposals and amendments.

## Offline, sync and safety

The PWA service worker only caches **static app assets and fonts**. It does not cache authenticated Supabase REST responses, private PDFs or connector endpoints. A connectivity banner appears offline, and active views are re-fetched on reconnect. Non-idempotent actions such as reviews and proposal approvals require an explicit retry when the outcome is uncertain; they are never silently queued for replay.

A user account is required in live mode. Supabase row-level security limits reads and writes to that owner. Use only the publishable client key in the browser. Never embed a service-role key or access token into the web build. The connector secret should be handled like a password; rotate it if exposed.

## Verification for maintainers

Run `npm ci`, `npm run check` and `npm run e2e` on the repository. `predev` and `prebuild` generate the required 192/512/maskable PNG app icons from a dependency-free script. Check `dist/manifest.webmanifest` and `dist/sw.js` after a production build, and test installability and the update prompt in Chrome on Android.

The owner-authenticated smoke command `npx tsx scripts/live-read-check.ts` requires a short-lived **local** `LEMMA_TOKEN` and the project's public `VITE_SUPABASE_PUBLISHABLE_KEY` environment variable. Do not copy a token into a chat or CI log. Test MCP with `node tests/mcp/smoke.mjs` in a trusted environment with its required secret in local environment variables. These live checks are separate from the deterministic demo and cannot be inferred from passing build or Playwright tests.

If a migration/deployment or sign-in test fails, diagnose it before real owner data is migrated. Production data must not be reset to make a smoke test pass.
