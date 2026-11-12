# Android app plan (Capacitor)

**Goal:** turn Lemma's Android presence from a thin web wrapper into a real Android app that uses what Android offers (rich notifications, a native focus timer on the lock screen, widgets, Quick Settings tiles, share-to-Lemma, document scanning, the device calendar, Do Not Disturb), while keeping **one codebase**: the same React app, screens and kit as the web.

**When:** after the web release (R3). Design and server preparation can start earlier; nothing here blocks the web release.

Visuals: `visuals/android-architecture.png`, `visuals/android-notifications-and-timer.png`, `visuals/android-widgets-shortcuts-share.png`, `visuals/android-phase-map.png`.

---

## 1. Where we start

| Today | Detail |
|---|---|
| Android package | A **Trusted Web Activity** built with Bubblewrap (`android/`, `android/twa-manifest.json`), package `io.github.mymayankyadav.lemma`, loading `https://mymayankyadav.github.io/lemma/`, minSdk 23, targetSdk 35, Play listing material in `docs/android/`. |
| Notifications | **Web Push** (VAPID) from the `notify` server function, with ten kinds: `due`, `deadline`, `behind`, `resume`, `tutor`, `digest`, `plan`, `rhythm`, `confirm`, `test`. Copy, rules and quiet hours live on the server. Up to two actions per notification, carried as **signed, 48-hour action tokens** (`open`, `dismiss`, `later`, `not_today`, `approve_cards`, `undo`). |
| Offline | A bounded, read-only offline snapshot (no auth, connector or push state is persisted). |
| Timer | The focus timer is a web screen; the server **study entry** (timestamps of focus and break intervals) is the source of truth. |

**What a TWA cannot do** (and why Capacitor): ongoing notifications with a ticking chronometer and buttons, Android 16 Live Updates, per-kind notification channels the user can tune in system settings, exact alarms for "pomodoro ends", home-screen widgets, Quick Settings tiles, dynamic app shortcuts, document scanning, the device calendar, Do Not Disturb and Modes, and background work.

**Why Capacitor (not a rewrite):** it bundles the existing React build into a native app and lets us add Kotlin where Android needs it. Everything visual stays in the kit; Android adds system surfaces around it.

---

## 2. Principles
1. **One codebase.** The web app runs unchanged in the browser. A small platform layer (`src/platform/`) exposes each capability with a native implementation on Android and a web fallback (or a no-op) elsewhere.
2. **The server stays the source of truth.** The phone displays and schedules; it never invents state. The timer is computed from the server study entry, so web, phone, widget and lock screen always agree.
3. **Additive server changes only**, through migrations and the existing review rules.
4. **Ask for permissions in context**, once, with a reason, and keep working when the answer is no.
5. **Respect the user's attention:** channels they can mute, quiet hours on the device as well as the server, no notification without a clear action.
6. **Same package, smooth upgrade:** the Capacitor app ships as an update to the existing Play package with the same signing identity.

---

## 3. Architecture

* **Web layer:** the existing Vite + React build, with an `android` build mode: no service worker (Capacitor serves the files), web push disabled on device (FCM replaces it), and `isNative()` from `@capacitor/core` to pick native implementations.
* **Bridge:** Capacitor plugins. Official ones where they exist (Push Notifications, Local Notifications, App, Haptics, Status Bar, Splash Screen, Share, Preferences, Browser); **custom Kotlin plugins** for the focus timer, widgets, tiles, calendar, Modes/DND, document scanner and native Google sign-in.
* **Native layer (Kotlin):** notification channels; the focus-timer notification and alarms; Glance widgets; tile services; a `WorkManager` job for background refresh; a boot receiver that restores a running session; secure storage of the session for actions that run without opening the app.
* **Server:** unchanged rules and copy; an **FCM transport** next to the Web Push transport, a device-token table, and one small read-only "widget summary" RPC.
* **Auth:** Google sign-in inside a WebView is blocked by Google, so sign-in uses Android's **Credential Manager** to get a Google ID token, exchanged with Supabase (`signInWithIdToken`). Session refresh continues in the web layer; a copy of the refresh token is kept in Android Keystore-backed storage for notification and widget actions.

---

## 4. Phases

### N0 · Foundations  (size L)
* Replace the TWA project with a Capacitor Android project: **same package id**, same Play app (Play App Signing; upload key continuity checked before anything else).
* `capacitor.config.ts`, the `android` build mode, `npx cap sync` in the build; CI job to build an AAB (needs a workflow change, which is a protected path: Owner `rules:` PR).
* Platform layer `src/platform/` with: `notifications`, `timer`, `haptics`, `share`, `calendar`, `widgets`, `links`, `storage`.
* Native Google sign-in (Credential Manager) and sign-out; Supabase redirect configuration for the app.
* **App Links** (the existing `assetlinks` template) so `https://…/lemma/#/review` links open the app; Android back button wired to sheets and router; edge-to-edge with correct insets; status bar and navigation bar follow Day/Night; Android 12+ splash screen with the new icon; adaptive and **themed (monochrome) icon** from the brand work (R2).
* Real haptics (`@capacitor/haptics`) behind the existing haptic helper.
* **Upgrade path:** TWA users' data lived in Chrome's storage, so the first run of the Capacitor app asks them to sign in again; nothing on the server is lost. A one-time "Welcome to the new app" sheet explains it.
* **Acceptance:** feature parity with the TWA on Android 8–16; sign-in, deep links, back, theme, haptics verified on a Pixel and a Samsung device.

### N1 · Notifications  (size L, server change)
* **FCM** via `@capacitor/push-notifications`; device tokens stored in a new **`device_tokens`** table (owner, token, platform, app version, created, last seen); token refresh and removal on sign-out.
* **Server:** the `notify` tick gains an FCM HTTP v1 transport beside Web Push (same kinds, copy, rules, quiet hours, retry and batch limits). If a device has the app, its web push subscription is removed so it never gets both.
* **Data messages, rendered natively**, so each kind can use its channel, style and actions.
* **Channels** (users can tune each in Android settings):

| Channel | Kinds | Importance | Lock screen | Notes |
|---|---|---|---|---|
| Focus timer | (local) | Low, ongoing | Full | No sound; chronometer; never dismissible while running |
| Review | `due`, `rhythm` | Default | Private (count only) | Actions: Start review · Later · Not today |
| Tutor | `tutor`, `confirm` | Default | Private | Actions: Approve all · Open (signed `approve_cards` token) |
| Plan and deadlines | `deadline`, `behind`, `plan` | High | Private | Heads-up for deadlines only |
| Calendar | (local) block starts | High | Full | Actions: Start now · Snooze 10 min |
| Resume | `resume` | Default | Private | Opens the path at its step |
| Digest | `digest` | Low | Private | BigText summary |
* **Actions** reuse the server's signed action tokens: handled natively (no app launch) for `later`, `not_today`, `approve_cards` and `undo`, then the notification updates to "Approved 4 · Undo".
* **Local notifications** for things the device can compute offline: today's block starts, "cards due at your study time" from the last snapshot; cancelled when the server sends the same kind.
* **Grouping** per channel with a summary; **badge** = review due count.
* **Permission (Android 13+):** asked after the first meaningful moment (after the first review round or when the user turns reminders on), never at launch; Settings › Reminders shows the state and links to system settings.
* **Acceptance:** each kind delivered and actionable on a locked phone; quiet hours respected; no duplicate web + FCM delivery.

### N2 · Focus timer, native  (size L)
See §5 for the full spec. In short: an ongoing notification with a **system chronometer**, Pause / Break / Finish actions that work from the lock screen, an **Android 16 Live Update** with pomodoro segments and a status-bar chip, an **alarm** at the end of each pomodoro or block, a **Quick Settings tile** to start or pause focus, a boot receiver that restores a running session, and an opt-in **Study mode** that turns on Do Not Disturb or an Android Mode during focus.

### N3 · Widgets and shortcuts  (size M, small server change)
* **Glance** widgets (Day/Night follow the system; Material You corners; subject colours from the kit):
  * **Review** (2×2): cards due, minutes, Start.
  * **Today** (4×2): next block, the day strip, Start now, task count.
  * **Focus** (4×1): running time, Pause/Finish; or "Start focus".
  * **Inbox** (4×1): tutor proposals waiting, Open.
  * **This week** (4×2): total and daily columns by subject.
* **Data:** a read-only `widget_summary` RPC (counts and next block only, no card content), fetched by a `WorkManager` job every 30 minutes and after any change in the app; widgets never show card text on the lock screen or home screen.
* **App shortcuts:** static (Review, Quick focus, Capture, Inbox) and dynamic (Resume *current path*, Start review *n*); pinned shortcuts for a path.
* **Acceptance:** widgets correct after reboot, offline (last known values with "as of 14:05") and after sign-out (cleared).

### N4 · Capture everywhere  (size M)
* **Share target:** text or link → Capture sheet (task, card or thought); **PDF** → New path or "add as a source" to an existing path (reusing the existing upload pipeline); **images** → pages for transcription.
* **Document scanner** (Google ML Kit document scanner, no camera permission needed): scan handwritten proofs into a path's pages for the tutor to transcribe.
* **Voice capture:** a microphone button in the Capture sheet using Android speech recognition; text goes through the same recogniser (dates, lengths, #path).
* **Capture tile** in Quick Settings and a **notification action** "Add a thought" during focus (the existing "park a thought").
* **Acceptance:** share from Chrome, Files, Gmail and the camera roll; a 3-page scan lands as pages; voice capture recognises "review Rudin tomorrow 2 h #real".

### N5 · Calendar, Do Not Disturb and Modes  (size M)
* **Device calendar (opt-in):** write Lemma study blocks into a dedicated "Lemma" calendar (CalendarContract) so they appear in Google Calendar; optionally **read busy times** from chosen calendars so suggested blocks avoid meetings.
* **Study mode:** with permission (notification-policy access, or an Android 15+ **AutomaticZenRule**/Mode), focus sessions turn on a "Lemma study" mode and turn it off at the end; never left on after a crash (boot and next-open checks).
* **Acceptance:** blocks appear and update in Google Calendar; deleting in Lemma deletes there; the mode is always cleared.

### N6 · Offline and background sync  (size M)
* `WorkManager` periodic refresh of the offline snapshot and the widget summary on unmetered networks.
* A queue for writes made offline that the server can accept later (capture, task complete, time log), retried with backoff; conflicts surface as the app's existing "changed elsewhere" messages.
* Offline review rounds only if the existing durable-run design supports it; otherwise "Review needs a connection" with the due count.

### N7 · Play release and polish  (size M)
* Play internal → closed → production tracks; staged rollout; **in-app updates** (flexible) and **in-app review** (after a good streak, at most once per quarter).
* Store listing refresh (screenshots from the A5 templates), data-safety form (account data, study records, device tokens; no ads, no tracking), privacy policy update.
* **Large screens and foldables:** the tablet and desktop layouts from the web, plus Android window-size classes; predictive back; per-app language.
* Android vitals budgets: crash-free ≥ 99.5%, ANR-free ≥ 99.8%, cold start ≤ 2 s on a mid-range phone.
* TalkBack pass on every native surface (notifications, widgets, tiles).

### N8 · Later
Wear OS (timer tile and complication, cards-due complication), Health Connect "mindfulness/focus" minutes (only if useful), Gemini/Assistant app actions ("Start a focus session"), a home-screen "glanceable" Live Update for review rounds.

---

## 5. Feature spec: the native focus timer

**States** (see the state diagram in `visuals/android-notifications-and-timer.png`): Idle → Running ⇄ Paused → Break → Running … → Finished; plus Interrupted (process killed or rebooted).

| Surface | Running | Paused | Break | Finished |
|---|---|---|---|---|
| Ongoing notification (Focus channel) | Title = intention; text = "Focus · until 15:50 · Pomodoro 2 of 4"; **chronometer** counting up (open) or down (pomodoro); actions Pause · Break · Finish | Frozen time, "Paused"; Resume · Finish | Countdown to break end; Skip break · Finish | Heads-up "Log this session": rating chips 1–5 as actions; tap opens the finish sheet |
| Live Update (Android 16) | `ProgressStyle` with one segment per pomodoro, current segment animated; status-bar chip with the time | Chip shows "Paused" | Break segment | Removed |
| Lock screen | Full content (no secrets) | Same | Same | Private |
| Tile | "Focus · 18:42" (on) | "Paused" | "Break 03:10" | "Start focus" (off) |
| Widget | Time, Pause, Finish | Resume | Skip | Start focus |

**Rules**
* **No running service needed to tick:** the chronometer is drawn by the system from the start timestamp. The app only updates the notification on state changes.
* **End of a pomodoro, block or break:** an alarm at the exact time. Android 14+ requires the user to grant "Alarms & reminders" (`SCHEDULE_EXACT_ALARM`); we ask once with a reason, and fall back to a windowed alarm (± 1 min) if refused. Not `USE_EXACT_ALARM` (Play limits it to alarm-clock and calendar apps).
* **Actions work without opening the app:** a native receiver calls the existing study-entry API (pause, resume, finish) with the stored session; on failure it opens the app on the focus screen. The server version check (`expectedVersion`) prevents double actions.
* **Interrupted:** on boot or next open, the app reads the active study entry from the server and rebuilds the notification, alarm, tile and widget.
* **Study mode (opt-in):** turns on Do Not Disturb or an Android Mode at Running and off at Paused/Finished; the switch lives in Settings › Planning and on the tile.
* **"Park a thought"** as a notification action with inline reply (`RemoteInput`).
* **Drift:** if the user opens another app for more than 2 minutes during focus, the next time Lemma opens it asks "Were you drifting?" (uses only Lemma's own lifecycle, no usage-access permission).
* **Haptics:** a short pattern at the end of each pomodoro (respecting the system's haptic setting).
* **Acceptance:** start on the tile, lock the phone, pause from the lock screen, reboot, and the timer is correct to the second on phone, widget and web.

---

## 6. Permissions

| Permission | Why | When asked | If refused |
|---|---|---|---|
| `POST_NOTIFICATIONS` (13+) | Reminders, tutor, timer | After a first meaningful moment or when turning reminders on | In-app inbox and Today still show everything; Settings explains |
| `SCHEDULE_EXACT_ALARM` (14+) | On-time pomodoro and block ends | When starting a timed session the first time | ± 1 minute alarms |
| `RECEIVE_BOOT_COMPLETED` | Restore a running session | Install time (normal permission) | — |
| Notification policy access / Modes | Study mode | When turning Study mode on | Study mode unavailable |
| `READ_CALENDAR` / `WRITE_CALENDAR` | Show blocks in the calendar, avoid busy times | When turning calendar sync on | Sync off |
| `RECORD_AUDIO` (only if the system recogniser needs it) | Voice capture | First tap on the microphone | Typing only |
| No camera, location, contacts or usage-access permissions. The document scanner runs in Google Play services' own UI. |

---

## 7. Server changes (additive, reviewed)
1. `device_tokens` table: owner-scoped, RLS, insert/update via a command function, revoked from anon/authenticated writes per the repo's rules.
2. `notify` FCM transport: HTTP v1 with a service-account secret (stored as a function secret, never in the repo), payloads ≤ 4 KB data-only, the same retry and batch limits as Web Push, token cleanup on `UNREGISTERED`.
3. `widget_summary` RPC: read-only counts (due, minutes, next block, inbox count, week minutes).
4. Notification action endpoint: already exists; add the `start_review` and `snooze` actions if wanted.
All four go through migrations, are additive, and need the review the rules require for `supabase/**` changes.

---

## 8. Testing
* **Unit:** the platform layer's web fallbacks; Kotlin unit tests for the timer state machine, channel mapping and action handling.
* **Instrumented:** UI Automator tests on an emulator for the notification actions, tile, widget update and boot restore.
* **Device matrix (Owner or tester):** Pixel on Android 16 (Live Updates), Samsung on One UI (aggressive battery management), one Android 10 device; a TalkBack pass.
* **Battery:** Doze and App Standby checks: the timer stays correct because it is timestamp-based and alarm-driven; document "Don't optimise" only as a last resort for OEMs that kill alarms.

---

## 9. Risks
| Risk | Mitigation |
|---|---|
| Google sign-in blocked in WebViews | Native Credential Manager + `signInWithIdToken` (N0). |
| Users get both web push and FCM | Unsubscribe web push on devices with the app (N1). |
| OEM battery killers (Samsung, Xiaomi) delay alarms | Exact alarms, boot restore, server truth; a help page. |
| Web updates now need a Play release | Ship through Play with staged rollout; consider an over-the-air web-bundle updater later (Owner decision). |
| WebView performance on low-end phones | The 350 KB budget and route splitting from the web release; profile on a low-end device in N7. |
| Play policy on exact alarms and foreground services | No foreground service; `SCHEDULE_EXACT_ALARM` with user grant and a fallback. |
| Scope creep | Each phase ships to the internal track on its own; N3–N8 are optional increments. |

---

## 10. Repo impact (rules)
* New dependencies (Capacitor core and plugins, Firebase messaging on Android, ML Kit document scanner, Glance) need the Owner's approval.
* CI workflow changes (`.github/**`) need an Owner `rules:` PR.
* `supabase/**` changes need review and are additive.
* The current `android/` TWA project is replaced in N0; keep it on a branch until the Capacitor build has passed internal testing.
