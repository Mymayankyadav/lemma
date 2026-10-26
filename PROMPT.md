You are taking over a working JavaScript app called **Lemma**, a spaced-repetition flashcard app for mathematics. The full source is in this repository. Your job is to turn it into (1) a web app served from GitHub Pages and (2) an Android app built with Capacitor, both from the same JavaScript code, with **Supabase** as the data source.

## Read first
- `README.md` – what exists and the folder layout.
- `docs/DATA_MODEL.md` – the note/profile format and the `Store` interface the UI depends on.
- `supabase/schema.sql` – a draft schema with row-level security.
- `src/app/store.js` – the current persistence layer (Claude-hosted storage with an IndexedDB fallback).

The app is plain JavaScript with no framework. `npm run build` bundles everything into one file, `dist/lemma.html`, that already works standalone in a browser using IndexedDB. Keep it framework-free and keep the single-codebase approach: the same build output must run on GitHub Pages and inside Capacitor.

## Do not change
- `src/fsrs.js` (FSRS-6 engine; it is verified against ts-fsrs by `test/compare_tsfsrs.mts`).
- `src/render.js` (Markdown/KaTeX/cloze pipeline) except for bug fixes.
- The note and profile data format in `docs/DATA_MODEL.md`, and the public `Store` interface. The UI must not call Supabase directly; only the store layer does.
- The visual design and interaction model (icon-only review tools, swipe-to-grade, bottom sheets, light/dark tokens).

## Tasks, in order

### 1. Build setup
- Add a `src/config.js` that the build fills from env vars `SUPABASE_URL` and `SUPABASE_ANON_KEY` (read in `build.js`). The anon key is public; never use or commit the service-role key.
- Bundle KaTeX, marked and DOMPurify from `node_modules` into the output instead of loading them from jsDelivr, so the Android app and the offline web app work without a network. Bundle `@supabase/supabase-js` the same way (use its UMD/ESM build; a small esbuild step is fine).
- Keep the Google Fonts link but make sure the UI degrades to system fonts offline.
- Keep `npm test` passing.

### 2. Supabase backend
- Apply `supabase/schema.sql` (review it first; fix anything wrong). Tables: `notes(user_id, id, data jsonb, deleted, updated_at …)` and `profiles(user_id, data jsonb, updated_at)`, RLS so each user only sees their own rows, realtime enabled.
- Auth: email one-time code (OTP) as the default, Google sign-in as optional. The app must open and be fully usable **before** sign-in (local-only mode), and offer “Sign in to sync” from Settings › Your data and the small sync icon in the top bar.
- Write a new store backend `src/app/store_supabase.js` implementing the exact `Store` interface:
  - **Offline-first.** IndexedDB is the source the UI reads; Supabase is synced in the background. Every `saveNote` writes IndexedDB immediately and appends to a persistent outbox; the outbox is flushed when online (upsert, batched, retry with backoff). Never lose an answer given offline.
  - **Initial sync:** pull rows where `updated_at > lastPulledAt` (paginate), merge, then subscribe to realtime changes for the user.
  - **Conflict merge per note:** union the `log` arrays (dedupe by `[ts, ord, grade, kind]`, sort by `ts`); for each card ordinal keep the card state from whichever side has the latest log entry for that ordinal; for text fields (front, back, title, tags, deck, requires, media) keep the side with the larger `modified`. Deletions are soft (`deleted = true`) so other devices learn about them.
  - **First sign-in on a device that already has local cards:** upload them (the existing “Move to account” banner flow in `view_home.js` can be reused).
  - Report `status()` as `{ mode: 'cloud', pending, offline }` so the existing sync icon keeps working; add a signed-in/out state.
  - Watch the 1 MB-ish practical row size: images in `media` are data URLs; if a note exceeds ~900 KB, move images to Supabase Storage (bucket `media`, path `<user_id>/<note_id>/<key>`, private with RLS) and store the storage path instead.
- `src/app/store.js` keeps working inside claude.ai; pick the backend at boot (`window.claude` present → current store, otherwise Supabase store).

### 3. Remove or replace Claude-only features outside claude.ai
- `src/app/ai.js` uses `window.claude.use('sample')`. Outside claude.ai, hide the AI buttons by default. Optionally add a Supabase Edge Function `ai` that calls an LLM API with a server-side secret and expose the same three calls (generate cards, check answer, explain); keep the prompts in `ai.js`.
- Export uses `window.claude.use('downloads')`. Replace with a normal Blob download on the web and Capacitor Filesystem + Share on Android.
- Remove the HTML comment for Claude agents at the top of `src/index.html` and the “Add cards from other chats” section in Settings for non-Claude builds.

### 4. Web app on GitHub Pages
- `.github/workflows/pages.yml` already builds and deploys `dist/lemma.html` as `index.html`; extend it for any new build steps and repo variables.
- Add a web app manifest and a service worker so the site installs as a PWA and opens offline (cache the app shell; never cache Supabase API responses).
- Configure Supabase Auth redirect URLs for the Pages domain.

### 5. Android app with Capacitor
- Add Capacitor (`@capacitor/core`, `@capacitor/cli`, `@capacitor/android`), `webDir` pointing at a folder containing the built `index.html`.
- Handle the Android back button: close the top bottom sheet → close the scratchpad → leave the review session → leave the app.
- Safe areas and status bar colour that follow light/dark theme; keyboard not covering the editor.
- Auth deep link (custom scheme, e.g. `app.lemma://auth`) for OTP/Google sign-in redirects.
- App icon and splash screen; release build signed via GitHub Actions secrets (keystore not committed). Add a workflow that builds a debug APK on every push and attaches it as an artifact.

### 6. Tests and acceptance
- Keep `npm test` green (FSRS golden tests, renderer tests, Playwright end-to-end).
- Add Playwright tests against a local Supabase (`supabase start`) for: sign-in, offline answers syncing after reconnect, edits on two “devices” merging without losing reviews, deletion propagating, RLS (user B cannot read user A’s notes).
- Acceptance: the same review on phone and web shows the same due counts after sync; airplane-mode reviews on Android sync when back online; GitHub Pages site and the APK both open with the example deck and work before sign-in.

Work in small, reviewable commits in the order above. After each step, run the tests and summarise what changed and anything you could not verify.
