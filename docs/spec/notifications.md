# Notifications: Lemma reaches you, kindly (Planner, 31 Oct 2026)

**Status: owner-requested 31 Oct 23:33 IST; Auditor audits first.** The owner asked for this plan on 31 Oct 2026 at 23:33 IST. The Auditor audits it against the owner's decisions (`docs/agents/README.md` §4), the hard stress budgets and `v4-look.md`. Only after a CLEAR comment on the PR does the Steward merge it, and then Fixer and Builder agents start the NOTIF tasks. The three decision changes in §9 and the open questions are the Planner's proposed defaults; the owner may override any of them in a reply on the PR or in the issue "Planner log", and an override wins. This spec moves "push notifications" and "daily reminder notifications" out of "Not in v1" (`product.md` §5, `plan.md` §11). §9 lists the owner decisions it changes.

It works for the web app (installed PWA or browser) on its own. The Android app (`android.md`) reuses it unchanged: a Trusted Web Activity shows these same Web Push notifications as Android app notifications.

Visual truth for every screen here: `v4-look.md`, then `v3.md`, then `stress.md`.

## 1. The problem, in the owner's terms

Lemma only helps when it is open. Today:

- **Cards decay silently.** FSRS assumes you review when cards are due. A three-day gap turns 25 due into 90 due, and the first session back feels like punishment.
- **Plans slip without anyone saying so.** The owner's two live projects have 76 checkpoints, all with planned dates (`checkpoints.due_on`). Nothing tells him that CP4 is planned for tomorrow, or that Algebra 1 drifted six days behind. He finds out when he opens the project, by which time the gap is larger and harder to face.
- **The tutor's work waits unseen.** Claude or ChatGPT proposes cards and plan changes at the end of a chat. They sit in the inbox until the owner happens to open Lemma.
- **A paused session goes cold.** The tutor saved "step 2 of 5, open question: is the map well-defined?", but nothing invites the owner back to it the next evening.

**Who it is for:** one person studying serious mathematics alongside other work, on an Android phone, in the Asia/Calcutta time zone (from `settings.time_zone`; nothing is hard-coded to it).

**What good looks like:** at most a few notifications a day, each saying one thing, each offering one *smaller* next step that is one tap away, never at night, and never making the owner feel behind. If Lemma has nothing useful to say, it says nothing.

### 1a. Tone rules (apply to every string)

- Kind and concrete: name the project, the checkpoint and the size of the next step ("one step, about 15 min").
- Never use: "missed", "failed", "overdue" (in notifications), "streak", "don't break", "only", "still", "again", "hurry", "!" or emoji.
- A notification about being behind always offers a **smaller step** and a **re-plan** option. It never shows a count of days missed in the title.
- No red. The notification badge icon is monochrome (§5c). In the app, lateness keeps the `--late` ochre of `v4-look.md` §2a.
- Maths in notifications is plain text (§4f). The app always shows it typeset.

## 2. Channel and architecture

```
 pg_cron (every 5 min) ──net.http_post──► Edge Function "notify"  /tick
                                             │  1. notify_candidates(user, now)   (SQL, one bounded read)
                                             │  2. rules.ts decides (pure; quiet hours, caps, priority)
                                             │  3. writes rows in notifications (outbox + history)
                                             │  4. Web Push (VAPID, RFC 8291/8292) to each push_devices row
                                             ▼
                      Browser / installed PWA / Android TWA  ── service worker (public/push-sw.js)
                                             │  shows the notification; on tap opens a deep link
                                             │  on an action button: POST /notify/act {token}
                                             ▼
                                   Edge Function "notify" /act  ──► approve_proposal / undo_action / holds
```

- **Web Push only.** VAPID keys, no Firebase SDK and no Firebase project. Chrome on Android delivers Web Push through its own FCM connection, so this works on Android browsers, the installed PWA and the TWA (`android.md`). It also works in desktop Chrome, Edge and Firefox, and in an iOS home-screen PWA (16.4+).
- **The server decides; devices only display.** Scheduling, quiet hours and caps live in one place, so two devices never double-notify. Each send goes to every enabled device of the owner, and the same `tag` makes a later notification replace an earlier one.
- **No connector change.** No new tool and no description changes, so `tools/list` stays byte-identical (QA-5 checks the length is unchanged).
- **No analytics.** The `notifications` table is the owner's own outbox and history, visible in Settings, pruned after 90 days, and never sent anywhere else.

## 3. The six kinds

All times are the owner's local time (`settings.time_zone`). A **study day** starts at `settings.rollover_hour` (default 04:00), as for cards (`data.md` §6.5). **Study time** is a setting (default 19:00). **Studied today** means at least one review answered or one session event saved since the study day began.

Each kind has a fixed `tag`. A newer notification of the same tag replaces the older one on the device (`renotify: false`, so a replacement does not buzz twice).

Android shows at most two action buttons. Every kind below uses at most two.

| # | Kind (`tag`) | Trigger | When | Caps |
| --- | --- | --- | --- | --- |
| K1 | Cards due (`due`) | due count (§6.5 quota applied) ≥ threshold (default 10) | study time; skipped if already studied today | 1 per study day; "Later" allows one re-send 2 h later |
| K2 | Checkpoint tomorrow (`deadline`) | a pending checkpoint of an active project has `due_on` = tomorrow | study time | 1 per study day (all projects in one) |
| K3 | A smaller step (`behind`) | a project becomes ≥ 3 days late (§3c) | next study time after the transition; then weekly while still late | 1 per project per 7 days; 1 per day overall |
| K4 | Pick up where you stopped (`resume`) | an open session paused ≥ 18 h and not studied today | study time | 1 per day; at most 2 per session |
| K5 | From your tutor (`tutor`) | pending proposals created since the last tutor notification, and the newest is ≥ 15 min old; or a session ended with a summary | next tick after the condition | 1 per 2 h |
| K6 | Digest (`digest`) | weekly (default Sunday 09:00) or daily (study time) | as set | 1 per period |
| K7 | Plan past target (`plan`) | a project with `target_date` whose last pending checkpoint's `due_on` is now after the target | next study time after the transition | once per transition |
| — | Gentle rhythm (`rhythm`) | nothing studied for 2 study days and nothing else sent today | study time | 1 per 3 days |

Rhythm is listed separately because it is the only kind about *not* studying. It is off by default (open question Q4).

### 3a. K1 Cards due

- Count: `notify_candidates` returns `due.count` with exactly the §6.5 rules (daily limits applied), plus `due.backlog` (all due before limits) and `due.minutes`. `due.minutes` is the count × the median answer time of the last 30 days, defaulting to 25 s, rounded up to whole minutes.
- Threshold options: 1, 10 (default), 25, 50.
- Copy:
  - title: `{n} cards due` (`n` capped at "999+", stress.md §1.6);
  - body when the backlog is not larger than the count: `About {m} min. Start with 5?`;
  - body when the backlog is larger: `Today's share is {n} (about {m} min). Start with 5?`.
- Actions:
  - **Review 5** opens `#/review?start=5` (§5d);
  - **Later** holds K1 for 2 h, once per day (`/act`).
- Tapping the body opens `#/review`.
- Grouping: one per day; a "Later" re-send replaces it.

### 3b. K2 Checkpoint tomorrow

- Fires when an active, non-system project has a checkpoint with `due_on` = tomorrow and UI status `now` or `next` (`data.md` §6.1).
- One project, copy:
  - title: `{code} is planned for tomorrow`;
  - body: `{Project} · {title}. You're on step {k} of {s}; about 20 min today keeps it on time.`
  - With step 0: `{Project} · {title}. Starting today keeps it on time.`
- Several projects, copy:
  - title: `{n} checkpoints planned for tomorrow`;
  - body: one line per project, up to 3, then `+{r} more`. Each line reads `{Project}: {code} {title}`.
- Actions:
  - **Study now** opens the chat link `chatLink(preferredChat, studyPrompt(project, code, title))` (`src/lib/chat.ts`);
  - **Not today** holds K2 for that project until tomorrow's study time.
- Tapping the body opens `#/p/{slug}/cp/{code}`. With several projects it opens `#/`.

### 3c. K3 A smaller step (behind schedule)

- **Late** means the project's most-late pending checkpoint has `due_on` ≤ today − 3 days. This is the same 3-day threshold `buildSchedule` uses for the `late` state.
- **Transition:** K3 fires on the first study time after the project becomes late. It repeats at most every 7 days while the project stays late. After the project stops being late and becomes late again, it counts as a new transition.
- When several projects are late on the same day, only the one with the soonest `target_date` (else the soonest late `due_on`) is sent. The others wait at least a day.
- Copy (never a day count in the title):
  - title: `{Project}: a smaller step today?`;
  - body: `The plan had {code} by {d MMM}. One step of it (about 15 min) is enough for today, or ask your tutor to re-plan.`
- Actions:
  - **One step** opens the chat link with `studyPrompt(project, code, title)`;
  - **Re-plan** opens the chat link with `revisePlanPrompt(project, "I'm about {n} days behind. Keep the target {target} if it is realistic, otherwise suggest a new one, and make the next steps smaller.")`. Without a target, the second sentence is "Make the next steps smaller."
- Tapping the body opens `#/p/{slug}`. The Route there shows the lateness in ochre.
- Re-planning goes through a tutor proposal that the owner approves (decision 4). Lemma never changes dates by itself.

### 3d. K4 Pick up where you stopped

- Fires for the newest open session (`data.md` §6.2 `paused`) whose `last_activity_at` is ≥ 18 h ago, when nothing has been studied today.
- Copy:
  - title: `Pick up {Project}`;
  - body: `Step {k} of {s} · {resume_question}`, or `{checkpoint title}` when there is no question.
- Actions:
  - **Resume in Claude** (or **Resume in ChatGPT**, from `settings.preferred_chat`) opens `chatLink(client, resumePrompt(project))`;
  - **Not today** holds K4 until tomorrow.
- Tapping the body opens `#/s/{slug}/{n}`.
- Stops after 2 sends for the same session. Starts again when a newer session is paused.

### 3e. K5 From your tutor

This covers new proposals, finished sessions and answers to the owner's card notes.

**Trigger**, at the first tick where all of these hold:
- there are pending proposals created after the last K5 send;
- the newest pending proposal is ≥ 15 minutes old (the chat has most likely ended);
- no session is `live`.

An `end_session` with a summary triggers it at the next tick, even with no proposals.

**Copy:**
- title: `{Claude|ChatGPT|Your tutor} left {n} proposals`. With proposals from both, `Your tutor left {n} proposals`. With no proposals: `Session {S#} saved`.
- body: the counts by kind joined by " · ", then the project names. For example `5 cards · 1 plan change · Algebra 1`.
  - When `card_edit` proposals resolve owner card notes, the body adds `· answers {k} of your card notes`.
  - With no proposals: the first 120 characters of the session summary (plain maths, §4f).
- **Actions:**
  - only `card` proposals and the setting "Approve cards from notifications" on:
    - **Approve {n} cards** approves the listed card proposals that are still pending, all in **one transaction and one action number** (`approve_card_proposals`, §6c);
    - **Review** opens `#/proposals`;
  - any `plan`, `plan_change` or `card_edit`: **Review** opens `#/proposals`, **Later** holds K5 for 3 h. Plans are never approved from a notification.
- **After "Approve n cards":** `/act` writes a **new** `notifications` row (kind `confirm`, its own id) and returns a **new single-use undo token** bound to that row and to the batch's one action number. The service worker replaces the original notification (same `tag`) with:
  - title `Approved {n} cards` (or `Approved {n} of {m} cards` when some were no longer pending);
  - body `Undo is in the app, or here for 48 hours.`;
  - one action, **Undo**, carrying the new token.

  The original notification's token is already spent, so replaying it returns "Already done". **Undo** claims the confirm row, then runs `undo_action` on the batch's action number, which reverses every card it approved in one step. If a later action touched the same cards, `undo_action` refuses: the claim is rolled back, the reply is "Open Lemma to undo", and it opens `#/proposals`. Undo never reverses part of a batch.
- Tapping the body opens `#/proposals`.

### 3f. K6 Digest

- **Weekly** (default on, Sunday 09:00):
  - title: `Your week in Lemma`;
  - body: `{d} days studied · {r} cards · {c} checkpoints demonstrated. Next: {code} {title} ({d MMM}).`
  - Parts with a zero are left out, except "days studied", which shows "0 days studied" only when it is the only part.
- **Daily** (when the "How often" setting is "One a day"): at study time it replaces K1–K4 and K7.
  - title: `Today in Lemma`;
  - body: up to three short clauses in priority order, for example `23 cards (9 min) · CP4 planned for tomorrow · Pick up Algebra 1 at step 2`.
- Actions: **Open** opens `#/` (weekly: `#/insights?days=7`); **Review 5** appears only when cards are due.

### 3g. K7 Plan past target

- Fires when a project's target date is set and the latest `due_on` among its pending checkpoints moves after it (for example, after an approved plan change).
- Copy:
  - title: `{Project} now ends after your target`;
  - body: `The plan ends {d MMM}; the target is {d MMM}. Ask your tutor to tighten it, or move the target.`
- Actions: **Re-plan** (chat link, as in K3); **Open** opens `#/p/{slug}`.

### 3h. Gentle rhythm (off by default)

- copy: title `A short session?`, body `{n} cards (about {m} min), or one step of {code} in {Project}.`;
- actions: **Review 5**, **Not now** (holds rhythm for 3 days).

## 4. Rules shared by every kind

### 4a. Quiet hours

Default 22:30–07:30, as a setting with a start and an end.
- Anything that becomes due in quiet hours waits until the end, plus a deterministic 0–10 min offset (hash of the notification key).
- At send time the condition is checked again. If it no longer holds (cards answered, proposals approved), the row becomes `skipped` with reason `resolved`.
- A window that crosses midnight is supported, and a start equal to the end means "no quiet hours".

### 4b. Daily cap and priority

- At most **3** sends per study day by default (setting: 1–5). Action confirmations (§3e) do not count.
- At least **60 min** between two sends, except action confirmations.
- When more is due than the cap allows, the order is: K5 tutor › K2 tomorrow › K1 due › K4 resume › K3 behind › K7 plan › rhythm. The digest is outside the order: in daily mode it is the only send.
- What loses is logged `suppressed` with reason `cap` or `spacing`. It is not re-queued, because the next study time decides afresh.

### 4c. Do not interrupt study

- **Active use:** if any device's `last_seen_at` is within 10 min (the app updates it at most once a minute while visible, §5e), or a session is `live`, K1–K4, K7 and rhythm are deferred by 30 min, up to twice. After that they are suppressed with reason `active`.
- K5 already waits for the chat to end (§3e).

### 4d. Dismissals lower the volume

- A notification swiped away without a tap is reported by the service worker's `notificationclose` handler (`/act` with action `dismiss`).
- After **3 dismissals in a row** of the same kind, Lemma backs off:
  - K1 asks for twice the threshold;
  - K3 waits 14 days instead of 7;
  - K4 and rhythm turn off.
- Settings › Reminders then shows one line: "Lemma sends fewer due-card reminders because the last 3 were dismissed. Restore". It disappears after Restore or after 30 days.
- A tap or an action resets the count.

### 4e. "How often" modes

| Mode | Sends |
| --- | --- |
| As things happen (default) | K1–K7 by their own rules, the weekly digest, caps |
| One a day | the daily digest at study time, plus K5 |
| Weekly only | the weekly digest |
| Off | nothing (devices stay registered) |

Each kind also has its own switch.

### 4f. Text in notifications

- Notifications are drawn by the operating system, so they cannot render KaTeX.
- All text goes through `notifyText()` (`supabase/functions/_shared/notify-text.ts`). It is a copy of `src/lib/plain-math.ts` `plainMath`, kept equal by a parity test, with these extra rules:
  - a `$…$` span that still contains a `\command`, `{` or `^{` after conversion is replaced by `…`, so raw LaTeX is never shown;
  - `$$…$$` display maths is always replaced by `…`;
  - the title is clamped to 48 characters and the body to 140, at a word boundary, ending in `…`;
  - project and checkpoint titles are converted the same way.
- Examples (tests): `Why is $\mathbb R$ not compact?` → `Why is ℝ not compact?`; `$x^2 \to 0$` → `x² → 0`; `$\int_0^1 f \,dx$` → `…`; `$$\sum_{k=1}^n k$$` → `…`.

### 4g. Delivery

- Payload ≤ 3 KB of JSON: `{v:1, id, kind, tag, title, body, url, actions:[{action, title, url?, token?}], ts}`.
- **Passive signed receipts (additive v1 contract, FIX #714):** an optional
  `openToken?: string` and `dismissToken?: string` may accompany the v1 payload
  as **top-level fields**, separate from the at-most-two visible `actions`.
  These are opaque HMAC-SHA256 `/act` tokens with the existing
  `{u,n,a,exp,x?}` format: `u` is the owner, `n` the notification row,
  `a` is exactly `open` or `dismiss`, and `exp` is no later than 48 h
  after minting. The producer generates them for the same owner and notification
  id as the visible actions, never embeds auth/session/connector secrets, and
  enforces the existing **3 KB UTF-8 JSON** limit including both receipts.
  Do not replace Review 5/Later or add a third action. A missing token means
  **no passive `/act` request**; never send unsigned receipts or reinterpret
  a visible action as a passive one. The worker posts `openToken` before body
  navigation, without a second confirmation notification, and posts
  `dismissToken` on `notificationclose`; receipt transport failures do not
  block navigation or create a false action-failure notification. `notify_act`
  claims the row atomically, so duplicate open/dismiss is idempotently rejected
  without a second mutation. Producer/worker tests cover two visible actions,
  signed open/dismiss, invalid/missing tokens, and the 3 KB bound.
- Web Push settings by kind:
  - TTL 6 h; K6 24 h; action confirmations 10 min;
  - `Urgency: normal`; K6 and rhythm `low`;
  - `Topic` = tag, so an undelivered older message of the same kind is replaced in the push service.
- Responses from the push service:
  - 201: `sent`.
  - 404 or 410: the device row is disabled (`disabled_at`, reason `gone`), and the app shows that device as "Stopped receiving · Remove".
  - 413: a bug; logged `failed`.
  - 429 and 5xx: retried on the next two ticks, then `failed`.
- A tick processes at most 50 sends and must finish in under 20 s.

## 5. Screens

### 5a. Settings › Reminders (new section, after "Memory")

Phone width, 390 px, v4 type and surfaces. One paper card, rows separated by hairlines, no box inside a box.

```
 Reminders                                         ← Section (Newsreader italic)
┌──────────────────────────────────────────────────┐
│ Reminders                              [ On  ●]  │  ← Switch, 44 px row
│ This phone · Lemma app                           │  ← Meta
│──────────────────────────────────────────────────│
│ How often          As things happen          ›   │  ← opens a single-select sheet
│ Study time         19:00                     ›   │  ← time picker sheet
│ Quiet hours        22:30 – 07:30             ›   │
│ At most            3 a day                   ›   │
│──────────────────────────────────────────────────│
│ Cards due          when 10 or more        [●]    │
│ Checkpoints        the day before         [●]    │
│ A smaller step     when behind plan       [●]    │
│ Pick up a session  after a pause          [●]    │
│ From your tutor    proposals, summaries   [●]    │
│   Approve cards from notifications        [●]    │  ← indented sub-row
│ Weekly digest      Sunday 09:00           [●]    │
│ Plan past target                          [●]    │
│ A short session    after 2 quiet days     [ ]    │
│──────────────────────────────────────────────────│
│ Devices                                          │
│ ▢ This phone · Lemma app     Today 18:02   ⋯     │  ← ⋯ = Send a test · Remove
│ ▢ Chrome on Windows          2 days ago    ⋯     │
│──────────────────────────────────────────────────│
│ Preview today                                ›   │  ← sheet: what would be sent and why
│ Recent                                       ›   │  ← sheet: last 20 sent
└──────────────────────────────────────────────────┘
```

- Each kind row is one 44 px+ row. The switch is the control; the row text is the switch's label. The rows are typed per `v4-look.md` §2c: Title for the name, Meta for the description.
- The threshold for "Cards due" opens a sheet with 1 · 10 · 25 · 50.
- Changing any value saves at once (`updateSettings({notify})`) and shows the toast `Saved · Undo`. Undo writes the previous value back through the same mutation and is logged.
- The back-off line from §4d, when present, sits under the affected row in Meta `--late` with a text button **Restore**.

**States**

| State | What shows |
| --- | --- |
| Loading | the card with two 44 px skeleton rows |
| Not supported | one row: "This browser can't show reminders. On Android, use Chrome or the Lemma app." (no switch) |
| Off, never asked | switch off; Meta "Lemma asks your phone for permission when you turn this on." |
| Permission prompt dismissed | switch off; Meta "Your phone didn't allow notifications yet. Turn on to ask again." |
| Blocked | switch disabled; Meta "Notifications are blocked for Lemma." plus a text button **How to allow**, which opens a sheet with two lines: browser ("Site settings › Notifications › Allow") and Lemma app ("Android Settings › Apps › Lemma › Notifications") |
| Offline | rows disabled; Meta "Connect to change reminders." |
| Error saving | toast "Couldn't save. Try again." (`--danger`); the control reverts |
| Demo (`?demo=1`) | everything renders from the fixture; **Send a test** shows a local notification if permission is granted, else a toast preview; nothing is written |
| Stress (S/X) | 10 devices and 20 recent rows render without overflow at 360 px; device labels clip with `clip` |

### 5b. Turning reminders on (permission flow)

1. The owner turns the switch on (a user gesture, which browsers require).
2. `Notification.requestPermission()`.
3. On "granted": `registration.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: VITE_VAPID_PUBLIC_KEY})`, then `addPushDevice({endpoint, keys, label, platform})`.
4. Lemma sends a test notification:
   - title: `Reminders are on`;
   - body: `Lemma will write at most 3 times a day, never between 22:30 and 07:30.` (live values).
5. On "denied" or dismissal: the matching state in the table above. No retry loop, and no banner elsewhere.

Device label: "This phone · Lemma app" (TWA, `android.md` AND-2 `isTwa()`), "This phone · Chrome", "Chrome on Windows", "Safari on iPhone"… from `navigator.userAgentData` when available, else the user agent. The owner can rename a device in its ⋯ menu (≤ 40 characters).

### 5c. What a notification looks like (Android)

```
 ┌──────────────────────────────────────────────┐
 │ ∂ Lemma · now                                │  ← monochrome badge "∂" (badge-96.png)
 │ 23 cards due                                 │
 │ About 9 min. Start with 5?                   │
 │  REVIEW 5            LATER                   │
 └──────────────────────────────────────────────┘
```

- `icon`: `icons/lemma-192.png`.
- `badge`: a new 96 px white-on-transparent ∂ (`public/icons/badge-96.png`, made by `scripts/generate-icons.mjs`). It is used for every kind, and there is no colour signal.
- `lang: 'en-GB'`, `dir: 'ltr'`, `timestamp` = when the condition arose.

### 5d. Deep links and entry points

| Link | Behaviour |
| --- | --- |
| `#/review?start=N` (N 1–50) | The Review page builds the queue exactly as the **Start** button does (current deck filter, mixed), takes the first N, calls `initialize` and replaces the route with `#/review/run`. With 0 due it stays on Review and shows the toast "All clear". |
| `#/review` | unchanged |
| `#/proposals` | unchanged |
| `#/p/{slug}`, `#/p/{slug}/cp/{code}`, `#/s/{slug}/{n}` | unchanged |
| `#/insights?days=7` | Insights opens on the 7-day range (accepts 7, 30 or 90) |
| any link + `&n={id}` | the app ignores `n`. The service worker reports `open` for notification `id` before navigating. |

**Service worker click handling:**
- If a Lemma window is open, focus it and navigate it (`client.navigate`, falling back to `postMessage({type:'lemma:navigate', url})`, which `AppShell` listens for). Otherwise `clients.openWindow(url)`.
- Chat links (claude.ai, chatgpt.com) always use `clients.openWindow`.

**Review done offer:**
- The Review done screen shows one line under the stats when reminders are off, the browser supports push, permission is not blocked, and the offer has been shown fewer than 2 times ever (`settings.notify.offered`): "Want a reminder when cards are due?" with **Turn on** (the §5b flow) and **Not now**.
- It is not shown anywhere else. It is a one-off offer, not a permanent hint bar (`docs/agents/README.md` §4).

### 5e. Presence ping

- While the app is visible, the live adapter updates `push_devices.last_seen_at` for this device at most once per 60 s, on `visibilitychange` and on route changes.
- It is not an action-log write (§6c). Demo mode never pings.

### 5f. Preview today and Recent (sheets)

**Preview today:**
- calls `/notify/preview` (owner JWT);
- lists what would be sent today and why, one row each: time, kind, the exact title and the reason, for example "19:00 · Cards due · 23 cards due · threshold 10";
- also lists what would be held back, for example "Pick up Algebra 1 · held: daily cap".
- Empty state: "Nothing to send today. Lemma stays quiet when there's nothing useful to say."

**Recent:** the last 20 rows of `notifications` with status `sent`, newest first, each row "Sat 19:02 · 23 cards due · Tapped Review 5". There is no paging (bounded by design).

## 6. Data

### 6a. Settings

Add `settings.notify jsonb null`. Null means all defaults. It is checked with `jsonb_typeof = 'object'` and `pg_column_size ≤ 4096`. The domain type:

```ts
interface NotifyPrefs {
  enabled?: boolean                      // default false until the owner turns it on
  mode?: 'live' | 'daily' | 'weekly' | 'off'   // §4e, default 'live'
  studyTime?: string                     // 'HH:MM', default '19:00'
  quiet?: { start: string; end: string } // default 22:30–07:30
  maxPerDay?: number                     // 1–5, default 3
  kinds?: Partial<Record<'due'|'deadline'|'behind'|'resume'|'tutor'|'digest'|'plan'|'rhythm', boolean>>
  dueThreshold?: 1 | 10 | 25 | 50        // default 10
  approveCards?: boolean                 // default true (open question Q3)
  digest?: { weekday: 0|1|2|3|4|5|6; time: string }  // default Sunday 09:00
  backoff?: Partial<Record<string, string>>  // kind → ISO time the back-off started (§4d)
  offered?: number                       // Review done offers shown (§5d)
}
```

`settings` is already in the action log, so every change is undoable. Unknown keys are kept on update, as for `settings.ui`.

### 6b. New tables (migration `<ts>_notifications.sql`)

`push_devices`:

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `user_id`, `created_at` | standard | |
| `endpoint` | text not null | unique; https only; ≤ 1000 |
| `p256dh` | text not null | base64url, ≤ 200 |
| `auth` | text not null | base64url, ≤ 50 |
| `label` | text not null | 1–40 |
| `platform` | text not null | check in (`android_app`, `android_web`, `desktop`, `ios`, `other`) |
| `last_seen_at` | timestamptz null | §5e |
| `last_ok_at` | timestamptz null | last 201 from the push service |
| `failures` | int not null default 0 | consecutive |
| `disabled_at` | timestamptz null | 404/410 or removed |
| `disabled_reason` | text null | check in (`gone`, `removed`, `failing`) |

- **Device lifecycle.** Rows are never hard-deleted by the app. *Remove* is a soft disable (`disabled_at = now()`, `disabled_reason = 'removed'`), and *Undo* or *Turn on again* re-enables **the same row** (same id, keys and label) with an `UPDATE` that clears `disabled_at` and `disabled_reason`. Nothing is ever re-inserted.
- **At most 10 enabled devices per owner**, checked by one trigger `push_devices_cap` (`before insert or update of disabled_at`). It fires when a row becomes enabled: an insert with `disabled_at` null, or an update from not-null to null. It first takes `pg_advisory_xact_lock(hashtext('push_devices:' || NEW.user_id::text))`, so concurrent adds and restores for one owner are serialised. It then counts that owner's *other* enabled rows; at 10 or more it raises `You have 10 devices with reminders. Remove one first.` The cap therefore holds for add, restore and re-enable alike (10 → remove → add → Undo raises).
- **Adding is an owner-scoped upsert on `endpoint`.** If this browser's endpoint already has a row of the same owner, that row is updated: new keys and label, `disabled_at` cleared, so the cap check runs. A new row is never created. If the endpoint belongs to another owner, `addPushDevice` raises `This browser gets reminders for another Lemma account.` Endpoints stay unique, and RLS is unchanged.
- **Disabled rows** older than 90 days are deleted by the prune job (§6e), like old notification history.
- RLS `owner_all`.

`notifications` (outbox and history):

| Column | Type | Notes |
| --- | --- | --- |
| `id` | bigint identity PK | |
| `user_id`, `created_at` | standard | |
| `kind` | text | check in the eight tags of §3 plus `confirm` and `test` |
| `key` | text not null | dedupe key, e.g. `due:2026-10-31`, `behind:<project>:2026-W44`; unique (`user_id`, `key`) |
| `project_id` | uuid null | FK `projects` on delete set null |
| `title`, `body` | text | ≤ 48 / ≤ 140 after `notifyText` |
| `url` | text | the deep link |
| `actions` | jsonb | the action list without tokens |
| `facts` | jsonb | the inputs that justified it (counts, codes, proposal numbers); ≤ 2 KB |
| `due_at` | timestamptz | when it should go out |
| `status` | text | check in (`queued`, `sent`, `skipped`, `suppressed`, `failed`) |
| `reason` | text null | `resolved`, `cap`, `spacing`, `active`, `quiet`, `kind_off`, `mode`, `no_device`, `push_error` |
| `sent_at` | timestamptz null | |
| `opened_at` | timestamptz null | |
| `action` | text null | `open`, `dismiss`, or the action id, set once |
| `action_at` | timestamptz null | |

- Index (`user_id`, `due_at`) where `status = 'queued'`; index (`user_id`, `sent_at` desc).
- `confirm` rows are written by `/act` with `status = 'sent'` and `key = 'confirm:<original id>'` (so one confirmation per original). Their `facts` hold `{action, approved, skipped}`. They are delivered through the service worker's reply, not the queue, and never count towards the daily cap or spacing (§4b).
- RLS: `select` for the owner only. Inserts and updates come only from the service role (the `notify` function).

`notify_holds`: PK (`user_id`, `scope`). `scope` is a kind, or kind + `:` + project id. `until` timestamptz not null. RLS `owner_all`, so Settings can show and clear holds.

### 6c. Undo and the action log

| Write | Undo |
| --- | --- |
| `settings.notify` changes | already logged; toast **Undo** plus connector `undo` |
| Approve cards from a notification | New function `approve_card_proposals(p_user uuid, p_ids uuid[]) returns jsonb` (NOTIF-1; `security definer`, `search_path = ''`, execute granted to `service_role` only). In **one transaction**: it sets `lemma.source = 'system'`, `lemma.tool = 'notification'` and the summary `approve P12–P16 from notification`; locks the listed proposals `for update` in id order; skips any that are not `pending` `card` proposals of `p_user`; and calls `approve_proposal` for the rest. Because the action log makes one action per transaction (`data.md` §2, `txid`), the whole batch is **one action number**. Returns `{approved: [...], skipped: [...], action: n}`, or `action: null` when nothing was pending, in which case no confirm row is written. That one action is undone, all or nothing, through the notification's **Undo**, the app's history, or the connector's `undo` |
| `push_devices` insert, remove, rename | not in the action log (device plumbing, like a login session). Remove shows the toast `Removed · Undo`. Undo calls `restorePushDevice(id)`, an owner-scoped `UPDATE` that re-enables the same row and is subject to the cap trigger. If the cap is reached in the meantime, Undo shows the toast `Can't turn it back on: 10 devices already get reminders. Remove one first.` and the device stays in the list as *Removed* with **Turn on** (same path), so the subscription is never lost. |
| `push_devices.last_seen_at`, `last_ok_at`, `failures` | not logged (bookkeeping, like `last_activity_at`) |
| `notify_holds` (Later, Not today) | not logged; Settings lists active holds under "Paused until…" with **Resume now** |
| `notifications` rows | system history, never edited by the owner |

`log_change()` is **not** attached to `push_devices`, `notifications` or `notify_holds`. `data.md` gets a sentence saying so. NOTIF-1 also adds `approve_card_proposals` to `data.md` §5, next to `approve_proposal`.

**One entry point for every notification action: `notify_act(p_user uuid, p_notification bigint, p_action text, p_extra jsonb) returns jsonb`** (NOTIF-1 migration; `security definer`, `search_path = ''`; execute granted to `service_role` only and revoked from `public`, `anon` and `authenticated`). The Edge Function cannot make several REST calls atomic, because each commits on its own, so the whole action lives in this one function and therefore one transaction:
1. **Claim:** `update notifications set action = p_action, action_at = now() where id = p_notification and user_id = p_user and action is null returning kind`. If no row, return `{status: 'already_done'}` and change nothing. The row lock also serialises concurrent calls: a second call waits, then finds `action` set and returns `already_done`.
2. **Check:** `undo` only on a `confirm` row; `approve_cards` only on a `tutor` row (otherwise raise `bad_action`).
3. **Act:**
   - `later` / `not_today`: upsert `notify_holds`;
   - `approve_cards`: `approve_card_proposals(p_user, p_extra.ids)`. When it returns an action, insert the `confirm` row (`key = 'confirm:' || p_notification`, `facts = {action, approved, skipped}`) and return its id;
   - `undo`: `undo_action(p_user, (p_extra->>'action')::bigint)`;
   - `open` / `dismiss`: record only.
4. **Any exception** (a conflicting later action, a lock timeout or a validation error) aborts the function, so the claim, approvals and confirm row all roll back together and the token stays usable until it expires. The Edge Function maps the error to its reply: `Undo A<n> first` → 409 "Open Lemma to undo"; anything else → 409 "Open Lemma to finish".

Returns `{status: 'done', kind, approved?, skipped?, action?, confirmId?}`.

### 6d. `notify_candidates(p_user uuid, p_now timestamptz) returns jsonb`

- `security definer`, `search_path = ''`. Execute is granted to `service_role` only and revoked from `public`, `anon` and `authenticated`.
- **Every query filters by `p_user`**, and the function ignores `auth.uid()`.
- It excludes `system` and `archived` projects.
- It is one bounded read: no per-project loops in the Edge function.

Returns:

```json
{
  "tz":"Asia/Calcutta","rollover":4,"today":"2026-10-31","localTime":"19:02",
  "studiedToday":false,"lastStudyAt":"…","quietDays":0,
  "due":{"count":23,"backlog":23,"minutes":9},
  "tomorrow":[{"slug":"algebra-1","project":"Algebra 1","code":"CP4","title":"…","step":2,"steps":5}],
  "late":[{"slug":"…","project":"…","code":"CP3","title":"…","dueOn":"2026-10-25","daysLate":6,"targetDate":null}],
  "pastTarget":[{"slug":"…","project":"…","lastDueOn":"…","targetDate":"…"}],
  "paused":{"slug":"…","project":"…","number":7,"step":2,"steps":5,"question":"…","checkpointTitle":"…","lastActivityAt":"…"},
  "live":false,
  "tutor":{"pending":{"card":5,"card_edit":0,"plan":0,"plan_change":1},"numbers":[12,13,14,15,16,17],
           "cardNumbers":[12,13,14,15,16],"cardIds":["<uuid>","<uuid>","<uuid>","<uuid>","<uuid>"],"newestAt":"…","origins":["claude"],"projects":["Algebra 1"],
           "answeredNotes":2,"endedSession":{"slug":"…","number":7,"summary":"…","endedAt":"…"}},
  "week":{"daysStudied":4,"reviews":63,"demonstrated":["CP3","CP4"],"next":{"code":"CP5","title":"…","dueOn":"…"}},
  "devices":{"enabled":2,"lastSeenAt":"…"},
  "history":{"sentToday":1,"lastSentAt":"…","lastByKey":{"…":"…"},"dismissStreak":{"due":0}}
}
```

- `due.count` must equal what `deck_tree()` and the app report for the same owner and time; a test checks it.
- The `tutor` fields only count proposals created after the last `tutor` send, and `endedSession` only appears if it ended after that send.
- **Bounds:** at most 20 `tomorrow`, 20 `late` and 20 `pastTarget` rows; `numbers` at most 50, with the rest summarised as counts.
- **Identity:** `cardNumbers` (the human P-numbers) are for display only. `cardIds` holds the same proposals' stable `id` uuids, in the same order and with the same bound of 50. Only `cardIds` ever goes into an action token or reaches `approve_card_proposals`; nothing converts numbers to ids.
- Performance: < 150 ms on the X profile (60 projects, 30,000 cards), measured in the PGlite harness by query count. It must use the existing `cards_owner_scheduled_due` and `(user_id, status)` indexes.

### 6e. Scheduling (migration `<ts>_notify_cron.sql`, separate file)

- `create extension if not exists pg_cron; create extension if not exists pg_net;`
- `select cron.schedule('lemma-notify-tick', '*/5 * * * *', $$ select net.http_post(...) $$)`:
  - URL: `https://yemqnhnztlbyxmjxidis.supabase.co/functions/v1/notify/tick`, public;
  - header `x-lemma-cron`: read at run time from `vault.decrypted_secrets` where `name = 'lemma_notify_cron'`;
  - timeout 20 s.
- Until the owner creates that Vault secret (§10), the call is rejected with 401 and nothing happens.
- A second job, `lemma-notify-prune`, runs daily at 03:17 UTC and deletes `notifications` rows older than 90 days.
- **Down:** `select cron.unschedule('lemma-notify-tick'); select cron.unschedule('lemma-notify-prune');`. Extensions stay.
- The PGlite harness skips this file; there is no pg_cron there. The NOTIF-4 PR description shows the `cron.job` row (SELECT only) after deploy.

**Down migration for §6b–6d** (in the PR description and as a comment at the end of the file), in dependency-safe order: `drop trigger push_devices_cap on push_devices; drop function push_devices_cap(); drop function notify_act(uuid, bigint, text, jsonb); drop function approve_card_proposals(uuid, uuid[]); drop function notify_candidates(uuid, timestamptz); drop table notify_holds, notifications, push_devices; alter table settings drop column notify;`. Every function and table the up migration creates appears here. NOTIF-1 tests up → down → up in PGlite, and after the second up the RLS policies and grants are identical to the first.

### 6f. Edge Function `notify` (new; `supabase/functions/notify/`)

Deployed with `--no-verify-jwt`; each route does its own authentication. CORS allows only `https://mymayankyadav.github.io` and `http://localhost:*`.

| Route | Auth | Does |
| --- | --- | --- |
| `POST /tick` | header `x-lemma-cron` equals Edge secret `NOTIFY_CRON_SECRET` (constant-time compare) | For each owner with `settings.notify.enabled`: call `notify_candidates`; run the rules (§4); insert `notifications` rows (unique `key` makes ticks idempotent); send queued rows whose `due_at ≤ now`; record results. Returns `{owners, queued, sent, skipped, failed, ms}`. |
| `POST /act` | body `{token}`: HMAC-SHA256 with `NOTIFY_ACTION_SECRET`, payload `{u, n, a, exp, x?}` (owner, notification id, action, expiry ≤ 48 h, extra: proposal uuids `ids` (≤ 50) or an action number) | Verifies the HMAC, expiry (410) and that `a` is a known action (400). Then it makes **exactly one** database call, `notify_act(u, n, a, x)` (§6c), which claims the notification, runs the action and writes any `confirm` row in one transaction, and rolls all of it back on failure. Results: `already_done` → 409 `{message:'Already done'}`; an exception → 409 "Open Lemma to undo" or "Open Lemma to finish" (claim rolled back); `done` → 200 with the JSON the service worker needs. After an approval with `confirmId`, the function mints the undo token `{u, n: confirmId, a: 'undo', exp: now + 48 h, x: {action}}`. It never writes to the database through any other path. `x.ids` are proposal uuids taken from `notify_candidates.tutor.cardIds` when the notification was built. |
| `POST /test` | owner JWT (`Authorization: Bearer`, verified with `supabase.auth.getUser`) | Sends kind `test` to one of the owner's devices (`{deviceId}`), bypassing caps and quiet hours. |
| `GET /preview` | owner JWT | Runs `notify_candidates` and the rules in dry-run for the rest of today; returns the rows of §5f. Writes nothing. |

Rules (`rules.ts`):
- Pure, with no I/O: `decide(facts, prefs, history, now) → {queue: Draft[], skip: Skipped[]}`.
- Every copy string of §3 lives in `copy.ts`, and the tests assert them exactly.

Web Push (`_shared/webpush.ts`):
- RFC 8291 `aes128gcm` payload encryption and RFC 8292 VAPID (ES256 JWT, `exp` ≤ 12 h, `sub` = Edge secret `VAPID_SUBJECT`), with WebCrypto only and **no new dependency**.
- Keys come from `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` (Edge secrets).

`supabase.yml` deploys `notify` next to `mcp`. If the secrets are missing, the function answers 503 `{message:'Reminders are not set up yet'}` on every route, and the app shows that message in the Settings card.

### 6g. Data contract (CONTRACT NOTIF-0, additive)

- **Types:** `NotifyPrefs`; `Settings.notify?: NotifyPrefs | null`; `PushDevice {id, label, platform, lastSeenAt, lastOkAt, disabledAt, disabledReason, isThisDevice}`; `SentNotification {id, kind, title, body, sentAt, action, actionAt}`; `NotifyHold {scope, label, until}`; `NotifyPreviewRow {at, kind, title, reason, held: boolean}`.
- **`LemmaApi` methods:** `listPushDevices()`, `addPushDevice({endpoint, p256dh, auth, label, platform})`, `renamePushDevice(id, label)`, `removePushDevice(id)` (sets `disabled_at`, reason `removed`), `restorePushDevice(id)` (clears them on the same row; raises the cap message), `touchPushDevice(endpoint)` (§5e), `listRecentNotifications()` (20), `listNotifyHolds()`, `clearNotifyHold(scope)`, `sendTestNotification(deviceId)`, `previewNotifications()`.
- **Hooks:** `usePushDevices`, `useRecentNotifications`, `useNotifyHolds` and `useNotifyPreview`, with keys `['push-devices']`, `['notifications-recent']`, `['notify-holds']` and `['notify-preview']`, plus one mutation hook per write.
- **Adapters:** the demo adapter implements all of them in memory with fixture rows; the live adapter stubs throw `not_implemented` until NOTIF-6.
- **Env:** `VITE_VAPID_PUBLIC_KEY` in `src/data/env.ts` and `.env.example`. It is public, like the publishable key. `.env.production` gets the value once the owner supplies it (§10).

## 7. Tasks

Order: NOTIF-0, NOTIF-1 and NOTIF-2 in parallel → NOTIF-3 → NOTIF-4; NOTIF-5 after NOTIF-0; NOTIF-6 after NOTIF-0, NOTIF-5 and LOOK-9; NOTIF-7 after NOTIF-0 and LOOK-7; QA-5 last. **All are pending the Auditor's audit of this plan.** NOTIF-4's live deployment also needs the owner's one-time steps in §10.

Every UI task attaches screenshots: day and night, 360 and 390 px, default and S profiles.

| Task | Depends on | Owns | Scope and acceptance |
| --- | --- | --- | --- |
| NOTIF-0 CONTRACT reminders data surface | — | `src/data/types.ts`, `api.ts`, `hooks.ts`, `env.ts`, `.env.example`, `src/data/demo/**` (notify fixture rows only), `docs/spec/data.md` §7.4 | §6g. **Accept:** typecheck passes; demo adapter returns 2 devices, 5 recent rows, 1 hold and a 3-row preview; live stubs throw `not_implemented`; unit test that `updateSettings({notify})` keeps unknown keys. |
| NOTIF-1 Reminders schema | — | `supabase/migrations/<ts>_notifications.sql`, `tests/mcp/notif1.mjs`, `.github/workflows/ci.yml` (one step in `mcp-sql`) | §6a–6d. **Accept (PGlite):** tables, checks and RLS exist; a second user cannot read or write the first user's devices, holds or notifications; `authenticated` cannot insert into `notifications`; the 11th enabled device raises the exact message; **device lifecycle:** 10 enabled → remove one → add a new one → restore the removed one raises the cap message and leaves exactly 10 enabled; restore re-enables the **same id** (no new row, `count(*)` unchanged); with two connections at 9 enabled, two concurrent restores (or a restore and an add) let exactly one through and the other raises; re-adding an endpoint the owner already has updates that row instead of inserting; another owner's endpoint raises the exact message; RLS still stops a second user reading or updating the rows; `notify_candidates` is not executable by `authenticated` or `anon`; it returns the documented shape for a fixture owner, with `due.count` equal to `deck_tree()` for the same owner and time; `tomorrow` and `late` follow the owner's time zone and rollover across midnight (test zones Asia/Calcutta and Europe/London); system and archived projects are excluded; bounds hold with 100 late checkpoints; the statement count stays below 12 on the X fixture; settings changes to `notify` appear in the action log and `undo_action` restores them; `approve_card_proposals` with 5 pending card proposals creates exactly **one** action, and one `undo_action` on it removes all 5 notes and their cards and returns the proposals to `pending`; with 3 pending and 2 already approved (mixed), it approves the 3, reports the 2 as skipped and still makes one action; a non-card or another owner's proposal id is skipped, never approved; an empty or all-skipped list returns `action: null` and logs nothing; it is not executable by `authenticated` or `anon`. **`notify_act`** (real SQL transactions in PGlite, not a stub): a second call on the same notification returns `already_done` and changes nothing; with two connections, a call that waits on the first's row lock returns `already_done`; an injected failure (a test trigger that raises inside `approve_card_proposals`, and a real `Undo A<n> first` conflict) leaves `notifications.action` null, no approved cards, no confirm row and no new action; `undo` on a `tutor` row raises `bad_action`; another owner's notification id returns `already_done`. **End-to-end in SQL:** a fixture with 5 pending card proposals → `notify_candidates` → its `cardIds` → `notify_act(..., 'approve_cards', {ids})` → 5 approved cards and one action → `notify_act(confirmId, 'undo', {action})` → proposals pending again and no notes left; foreign, non-card and already-approved ids among `cardIds` are skipped. **Down:** up → down → up runs cleanly and leaves identical RLS policies and grants. |
| NOTIF-2 Web Push and notification text | — | `supabase/functions/_shared/webpush.ts`, `_shared/notify-text.ts`, `tests/unit/notify/webpush.test.ts`, `tests/unit/notify/text.test.ts` | §4f, §6f Web Push. **Accept:** encrypting the RFC 8291 Appendix A plaintext with its fixed keys and salt reproduces the RFC's ciphertext exactly; the VAPID JWT verifies with the public key, has `aud` = endpoint origin and `exp` ≤ 12 h; `notifyText` parity with `plainMath` on 30 shared cases; the four §4f examples and the clamps (48/140, word boundary, `…`) hold exactly; no raw `\` or `$` ever appears in the output (property test over 500 random LaTeX strings); no new dependency. |
| NOTIF-3 Rules and copy | NOTIF-2 | `supabase/functions/notify/rules.ts`, `notify/copy.ts`, `tests/unit/notify/rules.test.ts` | §3, §4. **Accept:** table-driven tests with a fake clock covering every row of the §3 table; quiet hours (including across midnight, and start = end); the cap of 3 with the priority order; 60-min spacing; active-use deferral twice, then suppression; K3 transition, the 7-day repeat and the one-per-day pick; K4's two-per-session limit; K5's 15-min settle and live-session wait; K5 actions with and without plan proposals and with `approveCards` off; dismissal back-off after 3 in a row and reset on tap; the four modes; every title and body string matches §3 exactly, including the singular forms ("1 card due", "1 proposal"), and none contains a word from the §1a list (test). |
| NOTIF-4 `notify` Edge Function and schedule | NOTIF-1, NOTIF-3 | `supabase/functions/notify/**` (except `rules.ts`, `copy.ts`), `supabase/migrations/<ts>_notify_cron.sql`, `supabase/config.toml` (`[functions.notify]`), `.github/workflows/supabase.yml` (deploy line), `tests/unit/notify/routes.test.ts` | §6e, §6f. **Accept:** route tests with an in-memory database and push stub: `/tick` without or with a wrong cron header → 401; two ticks in a row queue nothing twice (unique key); 404/410 disables the device; 429 retries twice, then `failed`; `/act` token tampering → 401, expired → 410, reuse → 409; `approve_cards` approves only pending `card` proposals from the token, in one call to `approve_card_proposals`, and reports skipped ones; on success a `confirm` row exists with key `confirm:<original id>` and the reply carries a new undo token for it; **approve → Undo** succeeds once and reverses the whole batch; replaying the approve token → 409; double-tapping Undo (two concurrent requests) → exactly one succeeds and the other gets 409; Undo after 48 h → 410; an `undo` token on a non-`confirm` row → 400; when a later action touched one of the cards, Undo → 409 "Open Lemma to undo" and the confirm row's `action` stays null (claim rolled back); `undo` calls `undo_action` with the token's action number and owner; every `/act` path makes exactly one database call (`notify_act`; asserted on the stub); a token whose `x.ids` are P-numbers rather than uuids is rejected with 400; `/preview` writes nothing (assert no insert); `/test` needs a valid owner JWT; missing secrets → 503 with the exact message; CORS rejects other origins; a tick with 50 queued rows finishes under 20 s with a 200 ms push stub. After deploy, the PR shows (SELECT only) the `cron.job` rows and one tick result from the function logs. |
| NOTIF-5 Service worker push handling | NOTIF-0 | `public/push-sw.js`, `src/lib/push-sw-core.js` (pure helpers imported by both), `vite.config.ts` (`workbox.importScripts: ['push-sw.js']` only), `scripts/generate-icons.mjs` (badge), `public/icons/badge-96.png`, `scripts/check-pwa.mjs`, `tests/unit/notify/sw.test.ts`, `tests/e2e/push-sw.spec.ts` | §4g payload, §5c, §5d. **Accept:** unit tests: payload → `showNotification` options (title, body, tag, `renotify:false`, badge, icon, ≤ 2 actions, `data`); click → the right URL for the body and each action; chat links open in a new window; `notificationclose` posts `dismiss`; an action posts `{token}` to `/act` and shows the confirmation from its reply; a failed `/act` shows "Open Lemma to finish" and opens the deep link. `check-pwa.mjs` asserts that the built `sw.js` imports `push-sw.js` and that the badge exists and is monochrome. e2e: the built app registers a service worker whose script contains a `push` listener, and `postMessage({type:'lemma:navigate'})` navigates the open app. The existing PWA update prompt (`registerType: 'prompt'`) keeps working (existing tests pass). |
| NOTIF-6 Settings › Reminders | NOTIF-0, NOTIF-5, LOOK-9; the live adapter part after NOTIF-1 and NOTIF-4 | `src/features/settings/Reminders*.tsx`, `src/features/settings/Page.tsx` (one line to place the section), `src/lib/push.ts`, `src/data/live/**` (notify methods), `src/app/AppShell.tsx` (navigate listener and presence ping), `tests/e2e/reminders.spec.ts` | §5a, §5b, §5e, §5f; live adapter for every §6g method. **Accept:** every §5a state renders with its exact copy (stub `Notification`, `PushManager`, permission); turning on runs request → subscribe → `addPushDevice` → test send in that order; a toggle saves at once and Undo restores; remove + Undo restores the same device id; when Undo hits the cap, the exact toast shows and the row stays as *Removed* with **Turn on**; every row and switch ≥ 44 × 44 px; no text under 12 px; no horizontal overflow at 360 px with 10 devices whose labels are 40 characters long; presence ping at most once per 60 s (fake timers); demo mode writes nothing (network log); < 1,500 DOM nodes on Settings in the X profile. |
| NOTIF-7 Notification entry points | NOTIF-0, LOOK-7 | `src/features/review/Page.tsx` (`start` param), `src/features/review-done/*` (offer), `src/features/insights/Page.tsx` (`days` param), `tests/e2e/notify-links.spec.ts` | §5d. **Accept:** `#/review?start=5` with 23 due lands on `#/review/run` with exactly 5 cards, in the same order the Start button would give; `start=0`, `start=99` and non-numeric values clamp to 1–50; with 0 due, Review stays and shows "All clear"; the Review done offer appears only under the §5d conditions, at most twice (counter in `settings.notify.offered`), and never when permission is blocked; `#/insights?days=7` selects 7 days. |
| QA-5 Reminders acceptance | all NOTIF | `docs/acceptance/notifications.md`, `scripts/notify-dry-run.ts` | Runs `/preview` on the S and X fixtures and records the results. Owner checklist (the owner runs it on the phone; agents do not tick it): turn on, test arrives, Review 5 opens a round of 5, Approve cards from a notification then Undo, quiet hours respected overnight, at most 3 a day for a week. Verifies the `tools/list` length is unchanged against `main` before NOTIF (MCP smoke log). Files one issue per deviation. |

## 8. Risks

- **Delivery timing.** Android Doze can delay `normal`-urgency pushes by minutes. That is acceptable for study reminders; nothing here is time-critical.
- **Chrome's notification permission UI** can be auto-quieted if a site asks without a gesture. We only ask from the switch, and from the Review done offer's button.
- **pg_cron and pg_net on the Free plan** are available (checked: extensions are listed but not yet installed). If the project pauses after 7 days without activity, ticks stop too. The keep-alive workflow already covers that.
- **Approving from a notification** writes without the owner seeing the card faces. Mitigations: cards only, never plans; the signed tokens carry the exact proposal ids (uuids, shown to the owner as P-numbers); Undo sits on the confirmation for 48 h; the setting defaults per Q3.
- **Tone drift.** Copy is centralised in `copy.ts`, and a test forbids the §1a words.
- **Two codebases for maths text.** `notifyText` duplicates `plainMath`; the parity test keeps them equal.

## 9. Owner decisions this changes (needs approval)

| Decision (where) | Today | With this spec |
| --- | --- | --- |
| Not in v1 (`product.md` §5; `plan.md` §11) | push notifications and reminders are out of scope | Web Push reminders as specified here |
| LaTeX everywhere (`docs/agents/README.md` §4) | every displayed text renders LaTeX | notifications are drawn by the OS: maths becomes Unicode (ℝ, x², →), and anything that can't be shown cleanly becomes "…". The app is unchanged. |
| Every write is reversible through the action log (`data.md` §2.21) | all user tables are logged | device rows, holds and the notification history are not logged; they get the in-app undo described in §6c |

## 10. What the owner must provide (one-time; never committed)

1. **VAPID keys:** run `npx web-push generate-vapid-keys` on your computer. Put the private key in Supabase › Edge Functions › Secrets as `VAPID_PRIVATE_KEY`, and the public key as `VAPID_PUBLIC_KEY`. Post the **public** key in the Planner log so an agent can add it to `.env.production`; it is public by design.
2. **`VAPID_SUBJECT`:** `mailto:` plus your email, as an Edge secret.
3. **`NOTIFY_ACTION_SECRET` and `NOTIFY_CRON_SECRET`:** two values from `openssl rand -hex 32`, as Edge secrets.
4. **The cron secret in Vault:** in the Supabase SQL editor, once: `select vault.create_secret('<the same NOTIFY_CRON_SECRET>', 'lemma_notify_cron');`.
5. On the phone: Settings › Reminders › turn on.

## 11. Out of scope

- Email or SMS.
- Notifications about other people (there is one user).
- Notifications from inside the chat apps: Claude and ChatGPT own their own chat notifications. "Tutor replies" here means what the tutor leaves in Lemma (proposals, session summaries, answers to card notes).
- Rich notifications with images or rendered maths.
- A native FCM path (`android.md` keeps the TWA on Web Push).
- Exact-time alarms.
- Per-project study times (open question Q6).

## 12. Open questions for the owner

1. Approve this drop, including the three decision changes in §9?
2. Study time 19:00 and quiet hours 22:30–07:30 as defaults? (Both can be changed in Settings.)
3. "Approve cards from notifications": on by default (with Undo for 48 h), or off?
4. "A short session" after 2 quiet days: off by default (recommended), or on? No streak counter is planned. Do you want a "days studied this week" count in the weekly digest (planned), and nothing more?
5. Weekly digest on Sunday 09:00?
6. Is one study time for all projects enough, or do you want a time per project later?
