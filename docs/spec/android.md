# Lemma on Android (Planner, 31 Oct 2026)

**Status: owner-requested 31 Oct 23:33 IST; Auditor audits first.** The owner asked for this plan on 31 Oct 2026 at 23:33 IST. The Auditor audits it against the owner's decisions (`docs/agents/README.md` §4), the hard stress budgets and `v4-look.md`. Only after a CLEAR comment on the PR does the Steward merge it, and then Fixer and Builder agents start AND-1 … AND-8. The owner's one-time steps in §8 (Play Console, upload key, fingerprints, asset-links repo) gate the live parts. **AND-9 stays blocked:** it also needs the owner to change decision §2 #1 ("online-first, no offline sync"), which this request does not do.

Visual truth: `v4-look.md`, then `v3.md`, then `stress.md`. Notifications are specified in `notifications.md`, and this spec only adds what is specific to Android.

## 1. The problem, in the owner's terms

Lemma is "installable" today: open the site, then Share › Add to Home Screen. On Android that gives an icon, but:

- **No app identity.** It is a Chrome shortcut. It cannot be found in the Play Store, cannot be updated or restored from it, and there is no "Lemma" entry in Android's app and notification settings.
- **Nothing at a glance.** The question asked ten times a day ("how many cards are due, where was I?") needs the app to be opened.
- **Nothing reaches the phone.** That is covered by `notifications.md`. On Android those notifications should come from "Lemma", not from "Chrome".
- **No signal, no app.** On a train with no signal, Lemma opens to an error (`data.md` §1: online-first).

**Who it is for:** the owner, one person, on his own Android phone. Publishing to everyone is optional (§7, Q3).

## 2. Approach: compare, then recommend

| | **Trusted Web Activity (TWA)** — the existing PWA in a thin Android shell, rendered by Chrome | **Capacitor** — the web build inside an Android WebView with native plugins | **Native** (Kotlin + Compose) |
| --- | --- | --- | --- |
| Code reused | 100 %: the shell loads `https://mymayankyadav.github.io/lemma/` | ~95 %: the same build bundled into the APK, plus plugin glue | ~0 %: every screen, KaTeX, pdf.js, FSRS and the Atlas rebuilt |
| Google sign-in (Supabase OAuth) | works as today (it is Chrome) | **breaks**: Google blocks OAuth in embedded WebViews (`disallowed_useragent`). It needs a native Google Sign-In plugin or a system-browser + deep-link PKCE flow, plus auth changes | native SDK; new auth code |
| Updates | instant: every Pages deploy is live; a store release is only needed for shell changes | each web change needs a store release (bundled), or a remote `server.url`, which loses offline use and is a WebView anyway | store release for everything |
| Notifications | Web Push from `notifications.md`, delegated to the app (they appear as "Lemma") | FCM: Firebase project, `google-services.json`, a second push path | FCM |
| Home-screen widget | native code added to the shell project (§4d) | native code, same effort | native, same effort |
| Offline | the service worker (same as the PWA) | bundled assets offline; data still online | anything, at great cost |
| What the owner provides | Play Console, an upload key, asset links at the domain root | the same, plus a Firebase project and OAuth client changes | the same, plus a Firebase project |
| Effort | days | 1–2 weeks, mostly auth and push | months |
| Agents can build and audit it | yes: a small generated Gradle project, built in CI | yes, but auth and push need device testing | poorly: no shared code, a second UI to keep at v4 |

**Recommendation: a TWA**, generated in the shape of Bubblewrap / `android-browser-helper`'s `twa-basic`. It is the only option where:
- Google sign-in, KaTeX, pdf.js and every v4 screen work unchanged;
- the web app stays the **single codebase**, and every merged PR reaches the phone with no store release;
- notifications need no Firebase project.

The Android-only parts are small and isolated:
- the shell (`android/`);
- the home-screen widget (native Kotlin, reading a narrow read-only endpoint);
- launcher shortcuts generated from the web manifest.

Revisit Capacitor only if a future need cannot be met from Chrome, such as exact-time alarms or on-device notifications with no server.

## 3. Stages

| Stage | What the owner gets | Tasks |
| --- | --- | --- |
| 1. Installable app | "Lemma" from the Play Store (internal testing track), full screen, no URL bar, launcher shortcuts Review · Approve · Today | AND-1, AND-2, AND-3, AND-4 |
| 2. Notifications as the app | `notifications.md` reminders shown as "Lemma", with Android 13 permission handled | AND-5 (after NOTIF-6) |
| 3. Widget | due count, Continue and next checkpoint on the home screen | AND-6, AND-7 |
| 4. Offline reading | the last-seen Today, projects, checkpoints and decks open with no signal, read-only | AND-8 |
| 5. Offline review (decision change) | review due cards offline; answers sync later | AND-9 (awaiting a separate owner decision) |

## 4. Design

### 4a. The shell (`android/`)

- **Package** `io.github.mymayankyadav.lemma` (Q2). App name "Lemma".
- **Launch URL** `https://mymayankyadav.github.io/lemma/`. Scope `/lemma/`.
- **Display:** `standalone`, any orientation, status and navigation bars in the paper colour of the current world. The day and night values come from LOOK-9's manifest colours, and night follows the system.
- **Splash:** the paper colour with the 512 px icon; it fades within 300 ms of first paint.
- **Fallback:** if Digital Asset Links do not verify, `fallbackType: customtabs` shows a thin URL bar. QA-6 checks that it never shows in the store build.
- **Notification delegation** on (`enableNotifications: true`): web notifications from the scope show as Lemma's, with a monochrome small icon `ic_stat_lemma` (∂, the same glyph as the web badge in `notifications.md` §5c).
- **Launcher shortcuts** (long-press on the icon), generated from the manifest `shortcuts`:
  - **Review** → `#/review`;
  - **Approve** → `#/proposals`;
  - **Atlas** → `#/atlas`.
  The icons are 96 px monochrome glyphs from the existing icon set.
- **Deep links:** an intent with a URL inside the scope opens that URL in the TWA. The widget and notifications use this.
- **minSdk 23.** targetSdk is the level Play requires on the build date (35 or newer). Versions come from `twa-manifest.json`: `appVersionName` is the date, and `appVersionCode` is the CI run number.
- **No keystore, `google-services.json` or password in the repo**, ever. `.gitignore` covers `*.jks`, `*.keystore` and `android/local.properties`, and the CI checks this (AND-3).

### 4b. Asset links (the shell's proof that it owns the site)

- Android checks `https://mymayankyadav.github.io/.well-known/assetlinks.json`. That is the **origin root**, not `/lemma/`, so this repo's Pages site cannot serve it.
- The owner creates the user-site repository `Mymayankyadav/mymayankyadav.github.io` with two files:
  - `.nojekyll` (so Pages serves the dot-folder);
  - `.well-known/assetlinks.json`, from the template `docs/android/assetlinks.template.json` (AND-2).
- The template lists `io.github.mymayankyadav.lemma` and two SHA-256 fingerprints, both public values:
  - the Play **app signing** certificate (Play Console › Test and release › App integrity);
  - the owner's **upload** certificate (for sideloaded test builds).
- Alternative: a custom domain for the whole app (Q4).

### 4c. One codebase: what the web app changes

`src/lib/platform.ts`, pure and unit-tested:
- `isTwa()`: true when `document.referrer` starts with `android-app://io.github.mymayankyadav.lemma`, remembered in `sessionStorage` for the visit (the referrer only exists on the first page);
- `isStandalone()`: `matchMedia('(display-mode: standalone)')`;
- `pushSupport()`: `'yes' | 'blocked' | 'unsupported'`.

They are used only for:
1. the device label "This phone · Lemma app" (`notifications.md` §5b);
2. the **Home-screen widget** row in Settings, shown only in the app (§4d);
3. hiding the "Install Lemma" hint, if one exists, in the app.

There are no Android-only screens and no forked components. Any other difference between the app and the web is a bug.

### 4d. Home-screen widget

Two sizes. Paper background and ink text, following the system's day or night, using `v4-look.md` §2a colours (night `--paper` `#1A2028`, day `#FFFFFF`). The red pencil (`--accent`) is used only on the one primary button, and ochre `--late` only for "behind". System sans font; numbers use tabular figures.

```
 Small (2×1)                    Medium (4×2)
┌───────────────────────┐      ┌─────────────────────────────────────────┐
│ 23 due     ( Review ) │      │ 23 cards due · about 9 min   ( Review ) │
│ about 9 min           │      │─────────────────────────────────────────│
└───────────────────────┘      │ Continue  Algebra 1 · step 2 of 5     › │
                               │ Next      CP5 Equivalence relations     │
                               │           Thu · 2 days ahead            │
                               │ 6 proposals waiting               18:40 │
                               └─────────────────────────────────────────┘
```

- **Taps:**
  - **Review** → `#/review?start=5` (from `notifications.md` NOTIF-7; before that ships, `#/review`);
  - the Continue row → `#/s/{slug}/{n}`, or `#/` when there is no session;
  - the Next row → `#/p/{slug}/cp/{code}`;
  - the proposals line → `#/proposals`;
  - the time "18:40" is the "as of" time, and tapping it refreshes.
  Every tap target is ≥ 48 dp (Android's guideline; above the web's 44 px).
- **Text:** plain text from the server through `notifyText()` (`notifications.md` §4f), so there is never raw LaTeX. Titles get one line with an ellipsis.

**States**

| State | Small | Medium |
| --- | --- | --- |
| Not connected | "Connect in Lemma" (tap opens `#/settings?widget=connect`) | the same, centred, with one sentence: "Show cards due and where you stopped." |
| Loading (first fetch) | "–" in `--ink-4` | three rows of "–" |
| All clear | "All clear" with an `--early` check; no Review button | "All clear · next cards Mon" |
| Behind | — | the Next row's second line reads "Thu · 6 days behind" in `--late` |
| Offline or error | the last data, with the time in `--ink-3` and a dot | the same; after 24 h, "Open Lemma to refresh" |
| Revoked token (401) | "Connect in Lemma" | the same |
| Stress | "999+ due", today's share (`stress.md` D) | an 80-character title clips with an ellipsis; "999+ proposals" |

**Data:**
- `GET /notify/widget` on the `notify` Edge Function (`notifications.md` §6f), with `Authorization: Bearer wt_<64 hex>`.
- The response is built from `notify_candidates()` (no second aggregate). It is about 600 bytes, contains no card content, and has `Cache-Control: no-store`:
  `{asOf, due:{count, minutes}, resume:{slug, project, number, step, steps}|null, next:{slug, project, code, title, dueOn, state:'early'|'on_time'|'late'|null, days}|null, proposals}`.

**Token:**
- Table `widget_tokens`: `id`, `user_id`, `token_hash` (sha256 hex, unique), `label` (≤ 40), `created_at`, `last_used_at`, `revoked_at`. RLS `owner_all`.
- RPC `create_widget_token(p_label text) returns text` (`security invoker`, owner): creates the token with `extensions.gen_random_bytes(32)`, stores only its hash, and returns `wt_` + hex **once**.
- At most 5 active tokens per owner; the 6th raises "Remove a widget connection first."
- The token can only read this summary. It cannot write and it reaches no other route. This follows the connector secret's precedent (decision 3).

**Pairing (Settings › Reminders › Home-screen widget, app only):**

```
 ┌──────────────────────────────────────────────┐
 │ Home-screen widget                           │
 │ Shows cards due and where you stopped.       │  ← Meta
 │ ( Connect widget )                           │  ← primary only in this sheet
 │──────────────────────────────────────────────│
 │ Pixel 8 · connected 31 Oct · used 18:40  ⋯   │  ← ⋯ = Disconnect
 └──────────────────────────────────────────────┘
```

1. **Connect widget** calls `create_widget_token('<device label>')`.
2. It then navigates to `intent://pair?t=<token>#Intent;scheme=lemma-widget;package=io.github.mymayankyadav.lemma;end`. Chrome hands that to the shell's `PairActivity`, which stores the token in `EncryptedSharedPreferences`, refreshes every widget and returns to the TWA.
3. Lemma shows the toast "Widget connected".
4. If nothing happens within 3 s (no app), it shows "Open this in the Lemma app" and revokes the token.

**Disconnect:** sets `revoked_at` and shows the toast `Disconnected · Undo` (10 s; Undo clears `revoked_at`). Token rows are not in the action log, as for `push_devices` (`notifications.md` §6c).

**Refresh:**
- a `WorkManager` periodic job every 30 min (network required);
- on tapping the time;
- when the widget is placed;
- when the TWA returns from the background. `PairActivity` is also called with `?refresh` when Settings opens in the app; this is optional and best effort.

### 4e. Offline reading (AND-8; keeps decision #1)

**What it keeps:**
- After each successful read, a small allowlist of React Query results is saved to IndexedDB (`lemma-offline`, one store, at most 2 MB):
  - `['home']`, `['projects']`;
  - `['project', slug]` and `['checkpoint', slug, code]` for the last 5 projects opened;
  - `['decks']`, `['settings']`, `['styles']`.
- Entries older than 7 days are dropped, and everything is cleared on sign-out.
- On start with `navigator.onLine === false` or a failed first fetch, the saved results hydrate the cache and the app renders.

**Banner** (replaces today's offline banner text, same position, `--late` icon, not red):
- `You're offline · showing Lemma as of 18:40. Answers and approvals need a connection.`

**Writes are not queued.** Every write control is disabled while offline. Its accessible name gains ", needs a connection", and tapping it shows the toast "Needs a connection". This is decision #1 as it stands: nothing is synced.

**Review while offline:**
- The Review page shows the deck tree from the cache, and **Start** is disabled with Meta "Reviewing needs a connection".
- AND-9 is the only thing that changes this.

**Never cached:** card faces (`review-items`), PDFs, pages, Atlas, insights, sessions. They are too big or too sensitive for a small read-only snapshot.

### 4f. Offline review (AND-9; awaiting a decision change)

Specified here so that the owner can decide. **Do not build** until the owner changes `plan.md` §2 decision 1.

1. **Caching cards:** when online, Review caches today's due set (`review-items` for the default filter, at most 200 cards, faces included) in IndexedDB.
2. **Answering offline:** the app computes FSRS on the device as today, shows the next card, and appends `{cardId, rating, confidence, durationMs, next, expectedPrev, answeredAt}` to an IndexedDB outbox.
3. **Replay when back online:**
   - The outbox replays in order through a new RPC `record_review_offline(p_card, p_rating, p_confidence, p_duration_ms, p_next, p_expected_prev, p_reviewed_at)`.
   - It is the same as `record_review`, but it raises `conflict` if the card's current state ≠ `p_expected_prev` (the card was answered elsewhere). On a conflict, that answer and later answers to the same card are dropped.
4. **Banner:** "12 answers saved" or "11 answers saved · 1 was already answered on another device". Undo is unchanged (`undo_review`, newest answer only).
5. **Not offline:** approvals, edits, notes and sessions remain online-only.

## 5. Store listing and privacy (AND-4)

- **Track:** **Internal testing** (up to 100 testers, no review wait, no production requirements). It is the recommended home for a one-person app, and the owner adds his own Google account.
- **Production (Q3):** a personal developer account created after Nov 2023 must first run a closed test with at least 12 testers for 14 days. The owner decides whether that is worth it.
- **Listing text** (`docs/android/listing.md`; Play limits in brackets):
  - title "Lemma: maths study" [30];
  - short description "Your maths plan, cards and tutor notes, with Claude or ChatGPT." [80];
  - a full description of about 1,200 characters, written in the v4 voice, without claims about AI tutoring outcomes.
- **Privacy:** `public/privacy.html`, served at `/lemma/privacy.html`. It is a static page in the graph-paper look, light and dark, and covers:
  - what is stored: account email, study data and uploaded PDFs, in Supabase (ap-south-1);
  - no ads, no analytics, no third-party sharing;
  - deletion: Settings › Export, then email the owner.
- **Data safety answers** are in `listing.md` as a table: collected email, app activity and files; not shared; encrypted in transit; deletion on request.
- **Screenshots:** `scripts/play-shots.mjs` captures 1080 × 1920 PNGs from `?demo=1` (Today, Project with Route, Review run, Atlas; day and night) into `docs/android/shots/`.

## 6. Tasks

Order: AND-1 and AND-2 → AND-3 → AND-4. AND-5 after AND-3 and NOTIF-6. AND-6 after AND-2, NOTIF-1 and NOTIF-4. AND-7 after AND-3 and AND-6. AND-8 after LOOK-9. QA-6 last. AND-9 only after the owner changes decision 1.

Every UI task attaches screenshots: day and night, 360 and 390 px, default and S.

| Task | Depends on | Owns | Scope and acceptance |
| --- | --- | --- | --- |
| AND-1 Install quality | LOOK-9 (manifest colours) | `vite.config.ts` (manifest keys other than colours and `workbox.importScripts`), `public/icons/shortcut-*.png`, `public/screenshots/*`, `scripts/generate-icons.mjs` (shortcut icons), `scripts/check-pwa.mjs`, `index.html` (`theme-color` metas only) | §4a. The manifest gains `display_override: ['standalone']`, `launch_handler: {client_mode: 'focus-existing'}`, `categories: ['education','productivity']`, three `shortcuts` with 96 px monochrome icons, two `screenshots` (`form_factor: 'narrow'`, from demo), `orientation: 'any'`, and `prefer_related_applications: false`. **Accept:** `check-pwa.mjs` asserts each key and that every icon and screenshot file exists at its declared size; `theme-color` has day and night `media` variants matching LOOK-9; existing PWA tests pass; Lighthouse-style installability checks (manifest, service worker, icons ≥ 512, maskable) pass in a Playwright test. |
| AND-2 Platform detection and asset links | — | `src/lib/platform.ts`, `tests/unit/lib/platform.test.ts`, `docs/android/assetlinks.template.json`, `docs/android/setup.md` | §4b, §4c. **Accept:** unit tests for `isTwa()` (referrer on the first page, remembered across navigations in the same visit, false in a browser), `isStandalone()` and `pushSupport()` (stubs for granted, denied, default and missing `PushManager`); the template is valid JSON with `relation: ["delegate_permission/common.handle_all_urls"]`, the package name and two `"<FINGERPRINT…>"` placeholders; `setup.md` lists the owner steps of §8 in order, with no secret values. |
| AND-3 TWA shell and CI build | AND-1, AND-2 | `android/**` (Gradle project, `twa-manifest.json`), `.github/workflows/android.yml`, `.gitignore` (Android lines) | §4a. Project in the `twa-basic` shape with `androidbrowserhelper` (latest stable, pinned), notification delegation on, `ic_stat_lemma`, shortcuts, fallback to Custom Tabs. CI: JDK 17; `./gradlew lint bundleRelease` on `workflow_dispatch` and on tags `android-v*`. Signs with secrets `ANDROID_UPLOAD_KEYSTORE_BASE64`, `ANDROID_UPLOAD_KEYSTORE_PASSWORD`, `ANDROID_UPLOAD_KEY_ALIAS` and `ANDROID_UPLOAD_KEY_PASSWORD` when present, else builds unsigned and prints a notice. Uploads the `.aab` as an artifact. **Accept:** the workflow succeeds without secrets and produces an unsigned `.aab`; `lint` shows no errors; a CI step fails if any `*.jks`, `*.keystore`, `google-services.json` or `local.properties` is tracked; `AndroidManifest.xml` holds the launch URL, the asset statements resource and the `lemma-widget` intent filter placeholder (used by AND-7); `npm run check` is unaffected (the `android/` folder is outside `tsconfig` and Vite). |
| AND-4 Store listing kit and privacy page | AND-1, LOOK-5 | `docs/android/listing.md`, `public/privacy.html`, `scripts/play-shots.mjs`, `docs/android/shots/*` | §5. **Accept:** listing strings within Play limits (test counts characters); `privacy.html` passes the layout check at 360 px in day and night, with no external requests except Google Fonts; the screenshots exist at 1080 × 1920 for the 4 screens × 2 worlds; the data safety table matches what `data.md` stores. |
| AND-5 Notifications inside the app | AND-3, NOTIF-6 | `android/**` (delegation and permission config only), `docs/android/notifications-check.md` | §4a delegation. Android 13+: turning on Reminders in the app shows the system permission prompt for **Lemma** (not Chrome); notifications show "Lemma" with `ic_stat_lemma`; actions and deep links open inside the app. **Accept:** a written device checklist in `notifications-check.md` that the owner runs (agents do not tick it); a unit or instrumented test that the delegation service is declared in the manifest; Settings shows "This phone · Lemma app" when `isTwa()`. |
| AND-6 Widget data and pairing | AND-2, NOTIF-1, NOTIF-4 | `supabase/migrations/<ts>_widget_tokens.sql`, `supabase/functions/notify/widget.ts`, `tests/mcp/and6.mjs`, `tests/unit/notify/widget.test.ts`, `src/features/settings/Widget*.tsx`, `src/data/{types,api,hooks}.ts` (additive: `listWidgetTokens`, `createWidgetToken`, `revokeWidgetToken`, `restoreWidgetToken`), demo and live adapters (widget methods) | §4d data, token and pairing. **Accept (PGlite):** RLS isolates two owners; the hash is stored and the plain token never is (the test scans the table); the 6th active token raises the exact message; revoke + restore works. **Function:** valid token → 200 with exactly the documented keys and no card text; revoked, unknown or malformed token → 401; `last_used_at` updates; the response stays ≤ 1 KB on the X fixture; text passes `notifyText`. **App:** the row shows only when `isTwa()` (stubbed); the intent URL is exact; the 3-second fallback revokes; Disconnect + Undo works; ≥ 44 px targets; no overflow at 360 px. |
| AND-7 Native widget | AND-3, AND-6 | `android/app/src/main/java/**/widget/**`, `android/app/src/main/res/{layout,xml,drawable,values,values-night}/widget_*`, `android/app/src/test/**` | §4d layouts, states, taps and refresh. `AppWidgetProvider` for 2×1 and 4×2, `RemoteViews`, `WorkManager` 30-min job, `PairActivity` for `lemma-widget://pair`, `EncryptedSharedPreferences`. **Accept:** JVM unit tests: JSON → view model for every state in the §4d table (including 999+, an 80-character title, behind, all clear, 401 → not connected, stale > 24 h); deep-link URLs exactly as listed; colours from the v4 tokens per night mode; `./gradlew testDebugUnitTest lint` passes in `android.yml`. Device check by the owner: `docs/android/widget-check.md`. |
| AND-8 Read-only offline snapshot | LOOK-9 | `src/lib/offline-cache.ts`, `src/app/OfflineBanner.tsx`, `src/app/AppShell.tsx` (hydrate on start), `src/ui/Button.tsx` (`needsNetwork` prop), `tests/unit/lib/offline-cache.test.ts`, `tests/e2e/offline.spec.ts` | §4e. **Accept:** with Playwright `context.setOffline(true)` after one online visit, Today, Paths, a project, a checkpoint and Review render from the cache with the exact banner text and time; every write button is disabled with the toast "Needs a connection" and nothing is queued (no IndexedDB writes other than the cache, asserted); the cache is ≤ 2 MB on the X profile (oldest project entries evicted first); entries older than 7 days are ignored; sign-out clears the store; with no cache, offline shows the existing offline state (no blank screen). No new dependency (plain IndexedDB). |
| AND-9a CONTRACT offline answers (**awaiting owner decision change §2 #1**) | the owner's decision | `src/data/{types,api,hooks}.ts`, `supabase/migrations/<ts>_record_review_offline.sql`, `tests/mcp/and9.mjs` | §4f step 3. **Accept:** an expected-prev mismatch raises `conflict` and writes nothing; a match behaves exactly like `record_review` (same review row, action log, undo); `p_reviewed_at` is at most 7 days in the past and not in the future. |
| AND-9b Offline review queue (**awaiting owner decision change §2 #1**) | AND-8, AND-9a | `src/lib/review-outbox.ts`, `src/features/review*/*` (offline paths only), `tests/e2e/offline-review.spec.ts` | §4f. **Accept:** 20 answers offline replay in order once online; a conflicting card drops only its own answers and reports the exact banner text; killing the page mid-replay resumes without duplicates (idempotency key per answer); undo after replay undoes the newest. |
| QA-6 Android acceptance | AND-1 … AND-8 | `docs/acceptance/android.md` | Runs AND-1's installability test and AND-8's offline suite in S and X profiles. Owner checklist (the owner runs it on the phone): install from internal testing; no URL bar; sign in with Google; launcher shortcuts; a notification arrives as Lemma and its actions work; the widget connects, shows due and Continue, and refreshes; airplane mode shows the snapshot. Files one issue per deviation. |

## 7. Risks

- **Asset links at the origin root.** If `mymayankyadav.github.io` is not set up, the TWA shows a URL bar. AND-3 builds anyway, and QA-6 catches it.
- **Play policy for website wrappers.** Lemma is an installable app with sign-in, offline reading, a widget and shortcuts, which is more than a wrapper. Internal testing is not reviewed for this.
- **Chrome dependency.** A TWA needs Chrome (or another TWA-capable browser) on the phone. If it is missing, it falls back to Custom Tabs and then the browser.
- **Notification delegation and the Android 13 permission** behave differently across Chrome versions. AND-5 has a device checklist rather than relying on emulators.
- **Widget token on the device.** It reads only counts and titles, and it is revocable. `EncryptedSharedPreferences` protects it at rest.
- **The offline snapshot holds study titles on the device.** It is cleared on sign-out and never holds card faces or PDFs.

## 8. What the owner must provide (one-time; never committed)

1. **Google Play Console** developer account (one-time US$25, identity verification). Create the app "Lemma" with package `io.github.mymayankyadav.lemma`, and turn on Play App Signing.
2. **Upload key:** generate it on your computer, for example `keytool -genkeypair -v -keystore lemma-upload.jks -alias lemma -keyalg RSA -keysize 4096 -validity 10000`. Keep it safe; agents never see it. For CI signing, add it to the repo secrets as `ANDROID_UPLOAD_KEYSTORE_BASE64` (`base64 -w0 lemma-upload.jks`) with the three password and alias secrets. Without them, CI builds unsigned and you sign locally.
3. **Fingerprints:** copy the SHA-256 of the Play **app signing** certificate (App integrity) and of your upload key (`keytool -list -v -keystore lemma-upload.jks`) into `assetlinks.json`.
4. **Asset links:** create the repo `Mymayankyadav/mymayankyadav.github.io` with `.nojekyll` and `.well-known/assetlinks.json`, and turn on Pages for it (or choose a custom domain, Q4).
5. **First upload:** Play requires the first `.aab` to be uploaded by hand. Download it from the `android.yml` run artifacts, upload it to Internal testing, and add yourself as a tester.
6. **No Firebase project is needed:** notifications use Web Push (`notifications.md` §10).

## 9. Out of scope

- iOS apps.
- Wear OS.
- Capacitor or native rewrites.
- Firebase/FCM.
- In-app purchases.
- Publishing to production (unless Q3).
- Tablets beyond what the responsive web layout already does.
- An offline Atlas, PDFs or sessions.
- Background sync of anything except AND-9's answers.
- Using the widget to answer cards.

## 10. Open questions for the owner

1. Approve the TWA approach and stages 1–4? (Stage 5 is a separate decision.)
2. Package name `io.github.mymayankyadav.lemma`? It cannot be changed after the first upload.
3. Internal testing only (recommended for personal use), or a public Play listing later (needs a 14-day closed test with 12 testers)?
4. Asset links: create the `mymayankyadav.github.io` repo (free), or move Lemma to a custom domain?
5. Offline: is the read-only snapshot (AND-8) enough, or do you want offline review (AND-9), which changes decision 1 ("online-first, no offline sync")?
6. Widget: are you happy with a revocable, read-only widget token kept on the phone (like the connector address)?
