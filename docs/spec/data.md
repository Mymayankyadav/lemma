# Data specification

Source of truth for the database, the app's data layer and the demo dataset. The connector (`connector.md`) and every screen (`design.md`) read and write only what is defined here. If you need something that is not here, follow the contract-change rule in `plan.md` §7.

## 1. Principles

- One owner. Every row carries `user_id` and every table has row-level security (RLS) that limits rows to `auth.uid()`.
- The web app talks to Supabase with the publishable key and the owner's session (RLS applies).
- The connector (Edge Function) uses the secret key, which **bypasses RLS**. Therefore every connector query must filter by the `user_id` resolved from the connector secret. A query without `user_id` filter in connector code is a bug.
- Supabase project: **Lemma, ref `yemqnhnztlbyxmjxidis`** (region ap-south-1). Never touch any other project (the "Carrel" project belongs to another app).
- Times are `timestamptz` in UTC. "Today" for scheduling uses the owner's local time with the rollover hour from settings (default 04:00).
- Short codes keep chatbot prompts cheap: projects use a `slug` (`real-analysis`), checkpoints a `code` (`CP4`, `CP4a`), sessions a per-project `number` (shown as `S7`), notes a global `no` (shown as `N123`), comments a global `no` (shown as `#12`). Tools and URLs use these codes, never UUIDs.
- Text limits below are enforced by `check` constraints and repeated in the connector's input validation.

## 2. Tables

All tables below also have:

| Column | Type | Notes |
| --- | --- | --- |
| `user_id` | uuid not null, default `auth.uid()` | FK `auth.users(id)` on delete cascade |
| `created_at` | timestamptz not null default `now()` | |

Primary keys are `id uuid default gen_random_uuid()` unless stated.

### 2.1 `settings` (one row per owner; PK `user_id`)

| Column | Type / default | Notes |
| --- | --- | --- |
| `desired_retention` | real, 0.90 | check 0.80–0.97 |
| `new_per_day` | int, 20 | check 0–200 |
| `reviews_per_day` | int, 200 | check 0–2000 |
| `learn_steps` | text, `'1m 10m'` | parsed by `FSRS.parseSteps` |
| `relearn_steps` | text, `'10m'` | |
| `rollover_hour` | int, 4 | check 0–23 |
| `max_interval_days` | int, 36500 | |
| `fuzz` | bool, true | |
| `load_balance` | bool, true | |
| `learn_ahead_minutes` | int, 20 | |
| `fsrs_weights` | real[] null | null = FSRS defaults; length 21 when set |
| `fsrs_tuned_at` | timestamptz null | |
| `macros` | text | default = the KaTeX macro block in §12 |
| `default_style` | text, `'socratic'` | FK-like reference to `styles.key` (checked in app) |
| `tutor_rules` | text null | null = built-in rules from `connector.md` §6 |
| `mix_decks` | bool, true | interleave decks in review |
| `preferred_chat` | text, `'claude'` | check in (`claude`, `chatgpt`) |
| `connector_secret` | text not null unique | default: 48 hex chars from `extensions.gen_random_bytes(24)` |
| `connector_last_seen_at` | timestamptz null | written by connector |
| `master_prompt` | text null | ≤ 2000; the owner's standing instructions for every chat (e.g. "Write all maths in LaTeX, never Unicode symbols. Be Socratic."); sent first in every packet and overrides style and rules |
| `time_zone` | text, `'UTC'` | IANA name; the app sets it from the browser after sign-in; the connector uses it for "today" and dates |
| `connector_last_client` | text null | `claude` / `chatgpt` / `other` |
| `updated_at` | timestamptz default now() | trigger keeps it current |

### 2.2 `subjects`

| Column | Type / default | Notes |
| --- | --- | --- |
| `name` | text not null | 1–40 chars; unique (`user_id`, lower(`name`)) |
| `glyph` | text not null | 1–2 characters shown in serif italic, e.g. `∫`, `τ`, `λ` |
| `hue` | text not null | check in (`amber`, `violet`, `cyan`, `rose`, `lime`, `slate`) |
| `position` | int, 0 | sort order |

### 2.3 `projects`

| Column | Type / default | Notes |
| --- | --- | --- |
| `slug` | text not null | regex `^[a-z0-9]+(-[a-z0-9]+)*$`, 2–40 chars; unique (`user_id`, `slug`) |
| `subject_id` | uuid not null | FK `subjects` on delete restrict |
| `title` | text not null | 1–80 chars |
| `goal` | text not null | 1–1200 chars; the owner's precise prompt |
| `style` | text, `'socratic'` | `styles.key` |
| `status` | text, `'planning'` | check in (`planning`, `active`, `paused`, `done`, `archived`); `archived` hides the project everywhere (reversible) |
| `prompt` | text null | ≤ 1000; extra standing instructions for this project only, sent after `master_prompt` |
| `next_session_number` | int, 1 | incremented when a session starts |
| `last_activity_at` | timestamptz null | any session event or review in this project |
| `updated_at` | timestamptz | trigger |

> **v3 list contract:** `ProjectSummary.sourceTitles?: string[]` returns the titles of the project's own sources for Paths library search. Both data adapters populate it from sources they already read; the UI must not issue one network request per project to search source names. This is additive and does not expose source page content.

> **ST-5 additive Paths contract:** `ProjectSummary.stageProgress?: ProjectStageProgress[]` supplies ordered, bounded stage segments `{label, firstCode, lastCode, done, total, overdue, schedule}` from the server summary. `schedule` is `complete`, `behind`, `dated`, or `unscheduled`; absent tutor stages are grouped in consecutive checkpoint ranges of at most eight. `ProjectSummary.scheduleHeadline?: string | null` is a date-grounded short summary (`N overdue`, `Target passed`, `Dates planned`, `Complete`, or null when no evidence). These optional fields must not trigger per-project detail fetches. The live adapter receives them from `project_summaries()` (ST-5); demo/stress adapters may populate them when available. ST-1 consumes the fields for the Paths mini Metro. No existing contract fields change.

### 2.4 `sources` (uploaded PDFs)

| Column | Type / default | Notes |
| --- | --- | --- |
| `project_id` | uuid not null | FK `projects` on delete cascade |
| `title` | text not null | 1–120 chars; default from file name |
| `short` | text not null | 1–20 chars, lowercase word used by tools, e.g. `rudin`; unique per project |
| `filename` | text not null | |
| `storage_path` | text null | `sources/<user_id>/<source_id>.pdf` |
| `bytes` | bigint null | |
| `page_count` | int null | |
| `status` | text, `'uploading'` | check in (`uploading`, `extracting`, `ready`, `failed`) |
| `has_text` | bool, true | false when average extracted text < 30 chars per page |
| `plan_checked_at` | timestamptz null | set when the tutor has compared this source with the plan (§2.22); null = new material not yet reflected in the plan |
| `outline` | jsonb, `'[]'` | array of `{title, page, level}` (page = PDF page index, 1-based) |
| `error` | text null | |

### 2.5 `source_pages`

| Column | Type / default | Notes |
| --- | --- | --- |
| `source_id` | uuid not null | FK `sources` on delete cascade |
| `page` | int not null | 1-based PDF page index |
| `label` | text null | printed page label (e.g. `"28"`, `"xiv"`) |
| `body` | text not null default `''` | extracted text, max 20,000 chars |
| `chars` | int generated | `length(body)` |
| `tsv` | tsvector generated stored | `to_tsvector('english', body)` |

PK (`source_id`, `page`). GIN index on `tsv`. Index (`source_id`, `label`).

### 2.6 `concepts` (Atlas nodes; shared across projects of a subject)

| Column | Type / default | Notes |
| --- | --- | --- |
| `subject_id` | uuid not null | FK `subjects` on delete cascade |
| `slug` | text not null | slugified name; unique (`user_id`, `subject_id`, `slug`) |
| `name` | text not null | 1–60 chars |
| `blurb` | text null | ≤ 200 chars, one sentence |
| `pin_x`, `pin_y` | real null | set when the owner drags a node |

### 2.7 `concept_links`

| Column | Type | Notes |
| --- | --- | --- |
| `from_id` | uuid | FK `concepts` cascade; the prerequisite or related idea |
| `to_id` | uuid | FK `concepts` cascade; the dependent idea |
| `kind` | text | check in (`prereq`, `related`) |

PK (`from_id`, `to_id`). Check `from_id <> to_id`.

### 2.8 `checkpoints`

| Column | Type / default | Notes |
| --- | --- | --- |
| `project_id` | uuid not null | FK `projects` cascade |
| `code` | text not null | regex `^CP[0-9]{1,3}[a-z]?$`; unique (`project_id`, `code`) |
| `position` | real not null | sort key; inserts use the midpoint between neighbours |
| `title` | text not null | 1–80 |
| `objective` | text not null | 1–400; what the student will be able to do |
| `criterion` | text not null | 1–400; observable evidence of mastery (never "read section X") |
| `steps` | jsonb not null default `'[]'` | array of 1–8 short strings (≤ 80 chars each) |
| `pages` | text null | page range in printed labels, e.g. `36-40` |
| `source_id` | uuid null | FK `sources` on delete set null |
| `status` | text, `'not_started'` | check in (`not_started`, `in_progress`, `demonstrated`) |
| `current_step` | int, 0 | 0 = not started, else 1..len(steps) |
| `demonstrated_at` | timestamptz null | |
| `recheck_level` | int, 0 | 0–4, see §6.3 |
| `recheck_due` | date null | |
| `recheck_prompt` | text null | ≤ 300; a retrieval question used as a warm-up |
| `needs_revisit` | bool, false | set by a failed re-check or a criterion change |
| `updated_at` | timestamptz | trigger |

### 2.9 `checkpoint_prereqs` — PK (`checkpoint_id`, `prereq_id`), both FK `checkpoints` cascade, check not equal.

### 2.10 `checkpoint_concepts` — PK (`checkpoint_id`, `concept_id`), FKs cascade.

### 2.11 `styles` (teaching styles; PK (`user_id`, `key`))

| Column | Type | Notes |
| --- | --- | --- |
| `key` | text | regex `^[a-z_]{2,20}$` |
| `name` | text | 1–24 |
| `icon` | text | a Lucide icon name |
| `instructions` | text | 1–500; sent to the chatbot in the resume packet |
| `position` | int | |

Seeded by `bootstrap()` with the six presets in `connector.md` §7.

### 2.12 `sessions`

| Column | Type / default | Notes |
| --- | --- | --- |
| `project_id` | uuid not null | FK `projects` cascade |
| `number` | int not null | unique (`project_id`, `number`) |
| `goal` | text not null | 1–200 |
| `style` | text not null | `styles.key` |
| `checkpoint_id` | uuid null | FK `checkpoints` set null |
| `client` | text, `'other'` | check in (`claude`, `chatgpt`, `other`) |
| `state` | text, `'open'` | check in (`open`, `ended`) |
| `goal_met` | text null | check in (`yes`, `partial`, `no`) |
| `summary` | text null | ≤ 600 |
| `resume_step` | int null | checkpoint step to continue at |
| `resume_question` | text null | ≤ 300; the open question to ask first |
| `resume_note` | text null | ≤ 300 |
| `started_at` | timestamptz default now() | |
| `last_activity_at` | timestamptz default now() | updated by every save |
| `ended_at` | timestamptz null | |
| `minutes` | int null | set at end: minutes between start and last activity, max 600 |

### 2.13 `session_events`

| Column | Type / default | Notes |
| --- | --- | --- |
| `id` | bigint identity PK | |
| `session_id` | uuid not null | FK `sessions` cascade |
| `checkpoint_id` | uuid null | FK `checkpoints` set null |
| `kind` | text | check in (`pretest`, `attempt`, `hint`, `explanation`, `misconception`, `evidence`, `recheck`, `note`) |
| `body` | text not null | 1–600 |
| `outcome` | text null | check in (`demonstrated`, `partial`, `failed`) |
| `hint_level` | smallint null | 1–4 |

Index (`session_id`, `id`).

### 2.14 `misconceptions`

| Column | Type / default | Notes |
| --- | --- | --- |
| `project_id` | uuid not null | FK cascade |
| `concept_id` | uuid null | FK set null |
| `label` | text not null | 1–120, e.g. "open cover vs open set" |
| `times` | int, 1 | |
| `last_seen_at` | timestamptz default now() | |
| `resolved_at` | timestamptz null | set when a later event explains it correctly (tool flag) or the owner taps Resolve |

Unique (`project_id`, lower(`label`)).

### 2.15 `notes` (card content)

| Column | Type / default | Notes |
| --- | --- | --- |
| `no` | bigint generated always as identity | unique; shown as `N123` |
| `project_id` | uuid not null | FK cascade |
| `checkpoint_id` | uuid null | FK set null |
| `session_id` | uuid null | FK set null |
| `concept_id` | uuid null | FK set null |
| `kind` | text, `'other'` | check in (`definition`, `theorem`, `why`, `example`, `counterexample`, `proof`, `other`) |
| `type` | text, `'basic'` | check in (`basic`, `cloze`, `reverse`) |
| `front` | text not null | 1–1500; Markdown + LaTeX; cloze markers `{{c1::…}}` for type cloze |
| `back` | text not null default `''` | ≤ 3000 |
| `source_id` | uuid null | FK `sources` set null |
| `page_label` | text null | printed page, e.g. `40` |
| `tags` | text[] default `'{}'` | |
| `status` | text, `'active'` | check in (`active`, `suspended`, `deleted`) |
| `origin` | text, `'user'` | check in (`user`, `claude`, `chatgpt`, `other`) |
| `updated_at` | timestamptz | trigger |

### 2.16 `cards` (schedulable; one per note ordinal)

| Column | Type / default | Notes |
| --- | --- | --- |
| `note_id` | uuid not null | FK `notes` cascade |
| `ord` | int not null | 1 for basic; 1–2 for reverse; cloze number for cloze; unique (`note_id`, `ord`) |
| `state` | smallint, 0 | 0 new, 1 learning, 2 review, 3 relearning (same as FSRS engine) |
| `due` | timestamptz default now() | |
| `stability` | real, 0 | days |
| `difficulty` | real, 0 | 1–10 |
| `last_review` | timestamptz null | |
| `step` | int, 0 | learning step index |
| `reps` | int, 0 | |
| `lapses` | int, 0 | |

Index (`user_id`, `due`).

### 2.17 `reviews`

| Column | Type / default | Notes |
| --- | --- | --- |
| `id` | bigint identity PK | |
| `card_id` | uuid not null | FK `cards` cascade |
| `reviewed_at` | timestamptz default now() | |
| `rating` | smallint | 1 Again, 2 Hard, 3 Good, 4 Easy |
| `state_before` | smallint | card state before the answer |
| `confidence` | text null | check in (`sure`, `unsure`, `guess`) |
| `duration_ms` | int | 0–600000 |
| `prev` | jsonb not null | full card state before (for undo) |
| `undone_at` | timestamptz null | |

Indexes (`card_id`, `reviewed_at`) and (`user_id`, `reviewed_at`).

### 2.18 `card_comments` (owner notes for the tutor)

| Column | Type / default | Notes |
| --- | --- | --- |
| `no` | bigint generated always as identity | unique; shown as `#12` |
| `note_id` | uuid not null | FK `notes` cascade |
| `body` | text not null | 1–500 |
| `status` | text, `'open'` | check in (`open`, `addressed`, `dismissed`) |
| `resolved_at` | timestamptz null | |
| `resolved_by_proposal` | uuid null | FK `proposals` set null |

### 2.19 `proposals`

| Column | Type / default | Notes |
| --- | --- | --- |
| `no` | bigint generated always as identity | unique; shown as `P12` in chat |
| `project_id` | uuid not null | FK cascade |
| `session_id` | uuid null | FK set null |
| `kind` | text | check in (`card`, `card_edit`, `plan`, `plan_change`) |
| `payload` | jsonb not null | shapes in §5.4 |
| `reason` | text null | ≤ 300; shown under the proposal |
| `status` | text, `'pending'` | check in (`pending`, `approved`, `rejected`) |
| `origin` | text | check in (`claude`, `chatgpt`, `other`) |
| `decided_at` | timestamptz null | |
| `result` | jsonb null | ids created or changed |

Index (`user_id`, `status`).

### 2.22 `diagnostics` (evidence that the plan should adapt)

Evidence the tutor collects while teaching, shown as `D7`. When it is strong enough the tutor proposes a plan change that cites it (`connector.md` §6.4).

| Column | Type / default | Notes |
| --- | --- | --- |
| `no` | bigint generated always as identity | unique; shown as `D7` |
| `project_id` | uuid not null | FK cascade |
| `checkpoint_id` | uuid null | FK set null; where it showed up |
| `session_id` | uuid null | FK set null; latest session that saw it |
| `kind` | text | check in (`gap`, `strength`, `material`, `pace`): a missing prerequisite (e.g. ring theory before quotient rings), something already known (skip or compress), new or changed course material, or a pace problem |
| `topic` | text not null | 1–120, e.g. "ring theory basics" |
| `evidence` | text not null | ≤ 600; latest concrete observation ("could not state the ideal test; guessed at kernels") |
| `severity` | smallint, 1 | 1 minor, 2 slows progress, 3 blocks the current checkpoint |
| `times` | int, 1 | sightings across sessions |
| `status` | text, `'open'` | check in (`open`, `confirmed`, `planned`, `resolved`, `dismissed`) |
| `proposal_id` | uuid null | FK `proposals` set null; the plan change that answers it |
| `last_seen_at` | timestamptz default now() | |

Unique (`project_id`, `kind`, lower(`topic`)). Status flow: `open` → `confirmed` (a short diagnostic quiz confirmed it) → `planned` (a plan change citing it was proposed) → `resolved` (the bridge checkpoint was demonstrated, the change was applied for `material`, or the strength was verified) or `dismissed`. A rejected proposal returns its diagnostics to `confirmed`.

### 2.20 Triggers

- `updated_at` trigger on `settings`, `projects`, `checkpoints`, `notes`.
- After insert on `session_events` and `reviews`: set `projects.last_activity_at = now()` for the related project (reviews: via card → note → project). Keep these triggers simple and `security invoker`.

### 2.21 Action log (`actions`, `action_changes`) — every change is reversible

Nothing the owner or a tutor does is ever lost. Every write to any table in §2.1–2.19, from the app or the connector, is recorded with the row before and after, and any recorded action can be undone through the connector (`connector.md` §5.15–5.17). Undoing is itself an action, so an undo can be undone (redo).

`actions`:

| Column | Type / default | Notes |
| --- | --- | --- |
| `no` | bigint generated always as identity PK | shown as `A123` |
| `user_id` | uuid not null | owner of the changed rows |
| `txid` | bigint not null unique | `txid_current()`; one action per database transaction |
| `source` | text, `'app'` | check in (`app`, `claude`, `chatgpt`, `other`, `system`); from `current_setting('lemma.source', true)` |
| `tool` | text null | connector tool or app method name, from `current_setting('lemma.tool', true)` |
| `summary` | text null | ≤ 200, from `current_setting('lemma.summary', true)`; else generated: `insert notes 1, cards 2` |
| `undoes` | bigint null | FK `actions(no)`: set when this action is an undo |
| `undone_by` | bigint null | FK `actions(no)`: set on the original when it is undone; cleared when that undo is itself undone |
| `created_at` | timestamptz default now() | |

`action_changes`: `id` bigint identity PK, `action_no` FK `actions` (never deleted), `seq` int (order within the action), `table_name` text, `row_pk` jsonb (primary key values), `op` text check in (`insert`, `update`, `delete`), `old` jsonb null, `new` jsonb null. Index (`table_name`, `row_pk`), (`action_no`, `seq`).

Capture: one generic `after insert or update or delete ... for each row` trigger function `public.log_change()` (`security definer`, `search_path = ''`) on every table of §2.1–2.19. It finds or creates the `actions` row for `txid_current()` (taking `user_id` from `NEW`/`OLD`), then appends the change with `to_jsonb(OLD)` / `to_jsonb(NEW)`. Updates that change only `updated_at` or `last_activity_at` are not logged. The app and the connector set `lemma.source`, `lemma.tool` and `lemma.summary` with `set_config(..., true)` at the start of each RPC; plain PostgREST writes from the app get `source = 'app'` and a generated summary.

Both tables have RLS `owner_all` (select only for `authenticated`; writes only through the trigger and `undo_action`). Rows are never deleted.

Hard deletes on user tables happen only inside `undo_action` (undoing an insert), and the deleted row stays in `action_changes`, so redo restores it with the same primary key. The connector's `delete` tool performs real deletes (with cascades) inside one action; nothing is lost because every deleted row is in `action_changes`. All foreign keys are `deferrable initially immediate` (DB-2 alters the existing ones) and `undo_action` runs `set constraints all deferred`, so restoring parents and children in any order succeeds.

## 3. Row-level security and grants

- Enable RLS on every table in §2.
- One policy per table named `owner_all`: `for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())`.
- `anon` has no table access. `anon` may execute only `ping()`.
- All functions set `search_path = ''` and use schema-qualified names.
- After applying, run the Supabase security advisor; fix every RLS or search-path warning before merging.

## 4. Storage

- Private bucket `sources`, 50 MB file limit (Free plan maximum), allowed MIME `application/pdf`.
- Object path: `<user_id>/<source_id>.pdf`.
- Policies on `storage.objects` for bucket `sources`: authenticated users may select/insert/update/delete only when the first path segment equals `auth.uid()::text`.
- The connector never needs the PDF file; it reads `source_pages`.

## 5. Server functions and views

All functions are `security invoker` (RLS applies) unless stated, run in one transaction, and raise a clear exception message on invalid input (the app shows the message in a toast).

### 5.1 `bootstrap() returns settings`
Idempotent. Inserts the `settings` row for `auth.uid()` if missing; inserts the six style presets if the owner has no styles; returns the settings row. Called by the app after every sign-in. Before the app exists, DB-1 calls it once for the owner (impersonating them with `set_config('request.jwt.claims', …)`), so the connector works from day one.

### 5.2 `record_review(p_card uuid, p_rating int, p_confidence text, p_duration_ms int, p_next jsonb) returns bigint`
1. Lock the card row (`for update`). Error if not found.
2. Insert a `reviews` row: `prev` = the card's current state as JSON (`state, due, stability, difficulty, last_review, step, reps, lapses`), `state_before` = current `state`, the given rating, confidence, duration.
3. Update the card with `p_next` (same keys as `prev`).
4. Return the review id.
The app computes `p_next` with the FSRS engine (`src/lib/fsrs`). The database does no scheduling.

### 5.3 `undo_review(p_review bigint) returns jsonb`
Only the newest not-undone review of its card may be undone; else raise "Only the last answer can be undone". Restore `prev` into the card, set `undone_at = now()`, return the restored state.

### 5.4 `approve_proposal(p_id uuid, p_edit jsonb default null) returns jsonb`
Raise if the proposal is not `pending`. Apply by kind, set `status = 'approved'`, `decided_at = now()`, `result`, and return `result`.
Read `user_id` from the proposal row and set it explicitly on every row the function inserts. This makes the function work both for the owner (RLS) and for the connector, which calls it with the secret key for `direct` cards (no `auth.uid()` there).

**kind `card`** — payload:
`{front, back, type, kind, checkpoint?: "CP4", concept?: "compactness", source?: "rudin", page?: "40", tags?: [], direct?: false}`
1. `p_edit` may override `front`, `back`, `type`.
2. Resolve `checkpoint` (by code in the proposal's project), `concept` (by slug in the project's subject; create it if missing with `name` = the given text), `source` (by `short` in the project).
3. Insert the note (`origin` = proposal origin, `session_id` = proposal session).
4. Insert cards: basic → ord 1; reverse → ords 1 and 2; cloze → every distinct number N in `{{cN::` (if none, treat as basic with ord 1). New cards: state 0, due now.
5. `result = {"note_no": 123}`.

**kind `card_edit`** — payload: `{note_no, front?, back?, type?, resolves?: [12, 13]}`
1. Update the note's given fields.
2. If the set of ordinals changed (cloze or type change): insert cards for new ordinals (new state), delete cards for removed ordinals. Keep scheduling of ordinals that remain.
3. Set listed comments to `addressed`, `resolved_at = now()`, `resolved_by_proposal = p_id`.
4. `result = {"note_no": …, "resolved": [12, 13]}`.

**kind `plan`** — payload:
`{checkpoints: [{code?, title, objective, criterion, steps: [..], pages?, source?, prereqs?: ["CP1"], concepts?: ["Compactness"], recheck_prompt?}], concepts?: [{name, blurb?, prereqs?: [names], related?: [names]}]}`
1. Raise if the project already has checkpoints ("This project already has a plan; propose changes instead").
2. Assign codes `CP1…CPn` in order when missing; `position = index × 10`.
3. Upsert concepts by slug in the project's subject (update blurb if given); insert `concept_links` (`prereq`/`related`), ignoring duplicates.
4. Insert checkpoints, `checkpoint_prereqs` (by code), `checkpoint_concepts` (by slug of name; create missing concepts).
5. Set `projects.status = 'active'`.
6. `result = {"checkpoints": n, "concepts": m}`.

**kind `plan_change`** — payload: `{ops: [op…]}`, applied in order, all or nothing:
- `{op:"add", after?: "CP4", code?, title, objective, criterion, steps, pages?, source?, prereqs?, concepts?, recheck_prompt?}` — position = midpoint between `after` and the next checkpoint (end of list if no `after`). Code when missing: the `after` code plus the next free letter (`CP4a`, `CP4b`), or `CP<max+1>` at the end.
- `{op:"update", code, title?, objective?, criterion?, steps?, pages?, recheck_prompt?}` — if `criterion` changes on a demonstrated checkpoint, set `needs_revisit = true` (evidence is kept; the owner re-demonstrates).
- `{op:"remove", code}` — only when `status = 'not_started'` and the checkpoint has no events or notes; else raise.
- `{op:"move", code, after}` — new position = midpoint after `after`.
- `{op:"prereq_add" | "prereq_remove", code, prereq}`.
- `result = {"applied": n}`.
- Diagnostics: proposals of kind `plan_change` carry `payload.diagnostics` (D-numbers) and optional `payload.book`. Creating the proposal sets those diagnostics to `planned` with `proposal_id`; approval keeps them `planned` (they become `resolved` when the added checkpoint is demonstrated, or immediately for `material`) and sets the book's `plan_checked_at = now()`; rejection sets them back to `confirmed`.

### 5.5 `reject_proposal(p_id uuid) returns void`
Pending only; set `rejected` and `decided_at`.

### 5.6 `ping() returns timestamptz`
`select now()`; `security definer`; granted to `anon`. Used by the keep-alive workflow (Free projects pause after 7 days without database activity).

Privilege clarification: the pure timestamp implementation uses `security invoker`, superseding the definer designation above; the anonymous RPC contract is unchanged. See [keepalive-security.md](keepalive-security.md).

### 5.7 View `v_due_cards` (`security_invoker = true`)
Columns: `user_id, card_id, note_id, note_no, ord, project_id, checkpoint_id, session_id, state, due`. Rows: cards of notes with `status = 'active'`. Clients filter by `due` and `state`.

### 5.8 `save_progress(p_user_id uuid, p_project_id uuid, p_session_id uuid, p_payload jsonb) returns jsonb`

Connector-only, `security invoker`; execute granted to `service_role` only. This is the atomic implementation of connector.md §5.6, not a new frontend LemmaApi method. The connector resolves the owner/project/session before calling it and passes only `step`, `events`, `misconception`, `resolved`, `next_question` in `p_payload` (the same names and limits as the tool). The function validates owner/project/session/checkpoint relationships, locks the project and open session, and applies all events, misconception changes, checkpoint steps/evidence/re-check ladder and session question/activity in one transaction. Any error rolls back the entire save. Dates use the owner's time zone and rollover hour. Returns `{step: number | null, events: number}`, where events includes a generated misconception event. No scheduling or curriculum approval happens here.

### 5.9 `undo_action(p_user uuid, p_no bigint, p_force boolean default false) returns jsonb`
`security definer`; callable by `service_role` (connector, passing the resolved owner) and by `authenticated` (where `p_user` must equal `auth.uid()`).
1. Lock the action; raise `A<n> is not yours` / `A<n> is already undone (by A<m>)`.
2. Conflict check: if any later action that is not undone changed one of the same rows (`table_name`, `row_pk`), raise `Undo A<later> first` listing them (newest first).
3. Set `lemma.source`/`lemma.tool = 'undo'`/`lemma.summary = 'undo A<n>: <summary>'`; the trigger logs this transaction as the new action; set its `undoes = p_no`.
4. Apply the inverse of each change in reverse `seq` order: insert → delete the row by `row_pk`; update → set the columns back to `old` (only columns that differ); delete → re-insert `old` (same primary key, identity values with `overriding system value`).
5. Cascade check: if step 4 deleted rows that were not in the original action's changes (foreign-key cascades), raise `Undo would also remove: <table counts>; undo those actions first or confirm` unless `p_force` (then the cascade is logged and redo restores it).
6. Mark the original `undone_by`. If the original was itself an undo (`undoes` set), clear `undone_by` on the action it had undone (this is redo).
7. Return `{undone: n, as: m, changes: k}`.

### 5.10 View `v_history` (`security_invoker = true`)
`actions` with change counts per table and `undone_by`, newest first; used by the connector's `history` tool and later by an app screen.

## 6. Derived states (computed in `src/lib/derive.ts`, mirrored in the connector)

### 6.1 Checkpoint UI status (one of)
- `proposed` — only for checkpoints that exist in a pending `plan_change` `add` op (rendered from the proposal, not a table row).
- `revisit` — `status = 'demonstrated'` and (`needs_revisit` or `recheck_due <= today`).
- `done` — `status = 'demonstrated'` otherwise.
- `now` — `status = 'in_progress'`.
- `next` — `not_started` and every prerequisite is `done` or `revisit`.
- `locked` — `not_started` with an unfinished prerequisite.

Project progress = count(`done` + `revisit`) / count(all checkpoints).

### 6.2 Session display state
- `ended` when `state = 'ended'`.
- `paused` when open and `last_activity_at` older than 30 minutes (shown as "Paused 2 h ago"; the connector calls this "interrupted").
- `live` otherwise.

### 6.3 Re-check ladder (spacing for checkpoints)
- When a checkpoint becomes demonstrated: `recheck_level = 0`, `recheck_due = today + 3 days`.
- A re-check event with outcome `demonstrated`: level + 1; next due = today + [3, 10, 30, 90][level]; after level 4 set `recheck_due = null` (retired).
- Outcome `partial` or `failed`: `needs_revisit = true`, `recheck_level = 0`, `recheck_due = today + 1`.
- A later `evidence` event with outcome `demonstrated` clears `needs_revisit`.

### 6.4 Concept status (Atlas)
- `revisit` — any linked checkpoint is `revisit`, or an unresolved misconception is linked to it, or its cards had ≥ 2 Again answers in the last 14 days.
- `demonstrated` — has linked checkpoints and all are `done`.
- `in_progress` — any linked checkpoint is `now`, `done` or `revisit`.
- `not_started` — otherwise.

### 6.5 Due today
"Due" = cards in state 1–3 with `due` ≤ end of today (rollover), plus new cards (state 0) up to `new_per_day` minus new cards answered today, limited by `reviews_per_day`. One number is shown everywhere ("23 due").

## 7. Domain types (`src/data/types.ts`)

Names are fixed; fields use camelCase. Dates are ISO strings. `Glyph` is a 1–2 character string. `Hue` = `'amber' | 'violet' | 'cyan' | 'rose' | 'lime' | 'slate'`.

| Type | Fields |
| --- | --- |
| `Settings` | desiredRetention, newPerDay, reviewsPerDay, learnSteps, relearnSteps, rolloverHour, maxIntervalDays, fuzz, loadBalance, learnAheadMinutes, fsrsWeights (number[] or null), fsrsTunedAt, macros, defaultStyle, tutorRules (string or null), mixDecks, preferredChat (`'claude' \| 'chatgpt'`), connectorUrl (computed: `<SUPABASE_URL>/functions/v1/mcp/<secret>`), connectorLastSeenAt, connectorLastClient, timeZone |
| `Style` | key, name, icon, instructions, position |
| `Subject` | id, name, glyph, hue, position |
| `ProjectSummary` | id, slug, title, subject (`Subject`), status, done, total, current (`{code, title, step, stepsTotal} \| null`), lastActivityAt, cardsCount, sessionsCount (ended sessions), sourcesCount |
| `Project` | id, slug, title, goal, style, status, subjectId, createdAt |
| `CheckpointView` | id, code, title, position, ui (`'proposed' \| 'revisit' \| 'done' \| 'now' \| 'next' \| 'locked'`), currentStep, stepsTotal, recheckDue, dueCards |
| `ProjectDetail` | project (`Project`), subject (`Subject`), checkpoints (`CheckpointView[]`, includes proposed ones), done, total, sources (`Source[]`), sessions (`SessionSummary[]`), pendingProposals (number) |
| `CheckpointDetail` | view (`CheckpointView`), objective, criterion, steps (string[]), pages, sourceShort, prereqs (codes), concepts (`{slug, name}[]`), recheckPrompt, events (`SessionEvent[]`, newest 20), cardsCount, sessions (`SessionSummary[]`) |
| `Source` | id, projectId, title, short, filename, optional bytes (original PDF size in bytes; null when unknown), pageCount, status, hasText, outline (`{title, page, level}[]`), createdAt |
| `IngestProgress` | phase (`'reading' \| 'uploading' \| 'saving' \| 'done' \| 'failed'`), page, pageCount, message |
| `SessionSummary` | id, projectSlug, number, goal, checkpointCode, client, display (`'live' \| 'paused' \| 'ended'`), goalMet, startedAt, lastActivityAt, minutes |
| `SessionEvent` | id, kind, body, outcome, hintLevel, checkpointCode, createdAt |
| `SessionDetail` | summary (`SessionSummary`), styleName, summaryText, resumeQuestion, resumeStep, events (`SessionEvent[]`), misconceptions (`Misconception[]`), cards (`{noteNo, front, state: 'pending' \| 'active'}[]`), pendingProposals (`{cards, planChanges}`), pages (string or null) |
| `Misconception` | id, label, times, lastSeenAt, resolvedAt |
| `Proposal` | id, kind, projectSlug, projectGlyph, sessionNumber, origin, reason, createdAt, card (card payload or null), cardEdit (payload + current note front/back + comments, or null), plan (payload or null), planChange (payload or null) |
| `DeckNode` | key (`project:<slug>` or `cp:<slug>:<code>`), label, glyph, level (0 project, 1 checkpoint), due, children (`DeckNode[]`) |
| `QueueFilter` | decks (DeckNode keys, empty = all), sessionId (or null), conceptSlug (or null), includeNew (boolean), newOnly (boolean; "5 new from S7") |
| `CardState` | state, due, stability, difficulty, lastReview, step, reps, lapses |
| `ReviewItem` | cardId, noteId, noteNo, ord, type, kind, front, back, projectSlug, glyph, checkpointCode, checkpointTitle, sessionNumber, sourceShort, pageLabel, state (`CardState`) |
| `RecordReviewInput` | cardId, rating (1–4), confidence (`'sure' \| 'unsure' \| 'guess' \| null`), durationMs, next (`CardState`) |
| `CardRow` | noteNo, front, type, kind, projectSlug, glyph, checkpointCode, due, status, openComments |
| `CardSearchFilters` | query, projectSlug?, checkpointCode?, state? (`SchedulingState`), noteStatus?, hasOpenComments?, offset?; default offset 0, 50 rows/page |
| `CardSearchPage` | rows (`CardRow[]`), nextOffset (`number \| null`) |
| `CardDetail` | note (noteId, noteNo, front, back, type, kind, tags, status, origin, projectSlug, checkpointCode, sessionNumber, sourceShort, pageLabel), cards (`{ord, state: CardState}[]`), history (`{reviewedAt, rating, confidence}[]`), comments (`CardComment[]`) |
| `CardComment` | no, body, status, createdAt, resolvedAt, resolvedByOrigin |
| `AtlasGraph` | subjects (`Subject[]`), concepts (`{id, slug, name, blurb, subjectId, status, pinX, pinY, checkpointRefs: {projectSlug, code}[], dueCards}[]`), links (`{fromId, toId, kind}[]`) |
| `InsightData` | reviews (`{reviewedAt, rating, stateBefore, confidence, durationMs, projectId}[]`), sessions (`{startedAt, minutes, projectId, goalMet}[]`), checkpointEvents (`{at, kind: 'demonstrated' \| 'recheck_ok' \| 'recheck_fail', checkpointCode, projectId}[]`), projects (`{id, title, subject: Subject}[]`), misconceptions (`{label, times, conceptName}[]`) |

> **ST-5 additive Insights contract:** `InsightData.aggregate?: InsightAggregate` is an optional, bounded, owner-scoped payload from `insights(days)` (7/30/90 study days). It contains `days`, `reviews`, `right`, `reviewDays` (daily date, count, rating counts and right count), `calibration` (confidence, total and right), `sessions`, `minutes`, `typicalSession`, `subjectMinutes` (`{subject: Subject, minutes}[]`), `checkpointDays` (28 daily demonstrated/rechecked counts), and `mostRevisited` (`{label,times,conceptName}` or null). The live adapter uses one RPC and may return empty legacy arrays; `buildInsights` must prefer the aggregate when present. The demo adapter may continue supplying the existing raw rows. No existing field or hook is removed.
| `HomeSummary` | resume (`{projectSlug, projectTitle, glyph, checkpointCode, checkpointTitle, step, stepsTotal, question, objective, pausedAt, sessionNumber} \| null`), due, pendingProposals, projects (`ProjectSummary[]`) |
| `NewProjectInput` | title, slug (optional; derived from title), subjectId, goal, style |

### 7.1 DB-3 additive planning and appearance fields

Per `lab.md` §6 and `ui-euclid.md`, add `checkpoints.stage` (nullable text, ≤40), `projects.target_date` (nullable date), `projects.target_label` (nullable text, ≤20), `concepts.topic` (nullable text, ≤40), and `settings.ui` (nullable JSON object). The migration is DB-3; MCP-3 fills connector planning/editing and proposal application support. UI screen/data-adapter integration follows without changing existing methods here.

Additive domain fields are optional during migration: `CheckpointView.stage`, `PlanCheckpoint.stage`, `PlanChangeOp` update `stage`, plan concepts and Atlas concepts `topic`, `Project` and `ProjectSummary` `targetDate`/`targetLabel`, and `Settings.ui`. Missing and null mean unset; current adapters remain valid until their DB-3 field mapping is implemented. Target dates use ISO calendar dates (`YYYY-MM-DD`), without a time zone conversion.

`UiPreferences` is an extensible object with optional `world`, `keep`/`fav` (world ID arrays), `timeline` (`ascent`, `metro`, retained `line`), `timelineKeep`, `atlas` (`orbits`, `branches`, `outline`), `atlasKeep`, `density` (`compact`, `cozy`, `comfortable`), `motion` (`calm`, `lively`), and system-pairing `follow`, `day`, `night`. Retain unknown keys when updating preferences. UI defaults come from `ui-euclid.md`; a null stored object does not override them. This contract adds no API methods and does not claim adapter persistence or live columns before DB-3 ships.

### 7.2 CONTRACT DB-4 — additive v3 data surface

This is the contract for `docs/spec/v3.md` §§2a–6. It is additive until DB-4's migration and the corresponding adapters ship; existing values and methods retain their meanings. New API methods initially throw `LemmaError('not_implemented')` in both adapters.

- Projects may later be pinned and marked `system` (both optional booleans in the client model); archived projects can be represented by `ProjectStatus='archived'`. DB-4 introduces nullable `projects.subject_id` and the sources-first creation path; existing `NewProjectInput` and the existing createProject method remain usable.
- `UiPreferences.mode?: 'auto' | 'day' | 'night'` supports the two graph-paper worlds. Legacy keys are readable during migration and removed by UI-6a when settings are updated.
- `CheckpointView.dueOn` and `demonstratedAt` are optional ISO dates. Plan checkpoint wire payloads may carry `due_on` plus `sources: {source,pages?}[]`; the connector validates and persists these after MCP-4.
- `AtlasGraph.concepts` can contain `level?: 'cluster'|'galaxy'|'system'|'planet'|'moon'`, `parentId?: string|null`, `isStar?: boolean`. Their absence is treated as legacy planet data until DB-4.
- `Source` may contain `kind` (book, notes, slides, problems, syllabus, exam, other), `sha256`, `position`, `addedAt` and `planCheckedAt`. Read/save progress includes queued/reading/uploading/saving/ready/failed. The existing `addSource` method remains available for serial multi-file queues.
- `ProjectDetail.planRevisions` optionally reports approved revisions; `PlanRevision` records revision, approvedAt, summary and proposalId.
- New methods: `updateSubject(id, patch)` (name, glyph, position), `mergeSubjects(sourceId, targetId)` (owner-scoped, logged and undoable), `createProjectDraft({title,sources?})` (name-only flow), `updateSource(id, {title?,kind?})`, `listPlanRevisions(slug)`. Hooks are `useUpdateSubject`, `useMergeSubjects`, `useCreateProjectDraft`, `useUpdateSource`, `usePlanRevisions`. Mutations invalidate project, home, subjects, Atlas and revision caches as applicable.
- Production schema, project subject nullability and the implementations of these calls are **not** changed by this contract PR. DB-4 must supply and test migrations, owner isolation, undo logging, system-row exclusion and adapters before dependent UI uses these methods.

### 7.3 CONTRACT-546 — bounded Card detail history (additive)

Audit #546 / ST-4 D7 requires a Card detail screen to load at most 20 recent reviews and 20 recent comments at a time, rather than downloading every owner row and slicing in the browser. This contract adds two independent cursor reads; it does **not** remove or rename any field in `CardDetail` or change the existing `getCard` inputs; CONTRACT-546c adds optional initial-page cursor metadata to its return value. FIX-546a first scopes the initial note query; FIX-546b implements these reads and the bounded stability-chart summary.

- `CardHistoryPage`: `rows: CardDetail['history']`, `nextCursor: string | null`. `getCardHistoryPage(noteNo, cursor?)` returns at most 20 non-undone reviews for cards of that note, newest first.
- `CardCommentsPage`: `rows: CardComment[]`, `nextCursor: string | null`. `getCardCommentsPage(noteNo, cursor?)` returns at most 20 comments for the note, newest first, including status and resolution metadata.
- A cursor is opaque to UI code. Each implementation orders by timestamp descending and unique row ID descending, and encodes both keys in the continuation cursor; ties must not duplicate or skip rows. Query at most 21 rows to decide whether to return `nextCursor`. No offset paging or whole-table fetches.
- Every query is explicitly filtered by `user_id` and by the selected note/card IDs; RLS remains enabled. A missing note or an invalid cursor returns a typed `LemmaError`. The demo adapter applies the same order and page limit in memory.
- React Query keys are `['card-history-page', noteNo, cursor ?? null]` and `['card-comments-page', noteNo, cursor ?? null]`. Both hooks retain the 30-second stale time. Existing `useCard` is unchanged. Review/undo invalidates `card-history-page`; comment add/dismiss invalidates `card-comments-page` (in addition to existing card keys).
- This contract introduces `notImplemented` stubs in both adapters; no screen may call them until FIX-546b supplies the implementations, 20/21-row paging tests, X-like network budget tests and bounded chart data.
- **CONTRACT-546c (additive, audit boundary):** `CardDetail` may include `historyNextCursor?: string | null` and `commentsNextCursor?: string | null`. These are the exact 21-row probe continuations for the initial 20-row `history` and `comments` arrays returned by `getCard`. `null` means no older rows, even when exactly 20 were returned; absence is supported for legacy adapters and treated as no continuation. UI never infers continuation from array length and reuses these cursors to avoid a duplicate first-page query. FIX-546b implements the fields in both adapters; no new method, schema change, write or migration is needed.


### 7.4 CONTRACT NOTIF-0 — reminder data surface (additive)

Reminders are optional and default off until the owner enables them. `Settings.notify?: NotifyPrefs | null` is a JSON object with optional `enabled`, `mode` (live/daily/weekly/off), `studyTime`, `quiet`, `maxPerDay`, `kinds`, `dueThreshold`, `approveCards`, `digest`, `backoff`, and `offered`. Unknown preference keys survive partial updates. See `docs/spec/notifications.md` §6a and §6g.

- `PushDevice`: id, label, platform, lastSeenAt, lastOkAt, disabledAt, disabledReason and isThisDevice. Devices are soft-disabled and restored using the same id.
- `SentNotification`: id, kind, title, body, sentAt, action, actionAt. The recent list is bounded to 20 rows.
- `NotifyHold`: scope, label, until. `NotifyPreviewRow`: at, kind, title, reason, held.
- `LemmaApi` adds `listPushDevices`, `addPushDevice`, `renamePushDevice`, `removePushDevice`, `restorePushDevice`, `touchPushDevice`, `listRecentNotifications`, `listNotifyHolds`, `clearNotifyHold`, `sendTestNotification`, `previewNotifications`. No existing method is removed or renamed.
- React Query keys: `['push-devices']`, `['notifications-recent']`, `['notify-holds']`, `['notify-preview']`. Matching mutation hooks invalidate only affected keys.
- The demo adapter supplies two in-memory devices, five recent rows, one hold and three preview rows; the live adapter explicitly raises `not_implemented` until NOTIF-6.
- `VITE_VAPID_PUBLIC_KEY` is a **public** environment variable; no private signing material is stored in the app.

## 8. Data API (`src/data/api.ts`, interface `LemmaApi`)

Both adapters (`src/data/live`, `src/data/demo`) implement every method with identical behavior. Errors are thrown as `LemmaError {code, message}` with codes `not_found`, `invalid`, `conflict`, `offline`, `auth`, `server`, `not_implemented` (stubs only).

| Method | Input | Returns | Notes |
| --- | --- | --- | --- |
| `mode` | — | `'live' \| 'demo'` | property |
| `getAuth()` | — | `{email} \| null` | demo returns `{email: 'demo@lemma.app'}` |
| `signIn()` | — | void | Google OAuth redirect back to the current URL |
| `signOut()` | — | void | |
| `bootstrap()` | — | `Settings` | calls RPC `bootstrap` |
| `getSettings()` | — | `Settings` | |
| `updateSettings(patch)` | partial `Settings` (not connector fields) | `Settings` | |
| `rotateConnectorSecret()` | — | `Settings` | new 48-hex secret; old URL stops working |
| `listStyles()` | — | `Style[]` | |
| `updateStyle(key, patch)` | name/instructions | `Style` | |
| `getHome()` | — | `HomeSummary` | resume target: newest open session (paused or live); else the project with newest activity and its `now` checkpoint |
| `getReviewForecast()` | — | `{day: string, due: number}[]` | Seven study-day buckets (today first), based on settings timezone and rollover; count every scheduled card (`state > 0`) of active notes in non-archived projects, with overdue cards in today's bucket; no daily limits or search cap. `day` is the study date `YYYY-MM-DD`. UI-5e implements both adapters. |
| `listSubjects()` | — | `Subject[]` | |
| `createSubject(input)` | name, glyph, hue | `Subject` | |
| `listProjects()` | — | `ProjectSummary[]` | ordered by lastActivityAt desc |
| `getProject(slug)` | slug | `ProjectDetail` | includes proposed checkpoints from pending plan changes |
| `createProject(input)` | `NewProjectInput` | `Project` | slug collisions get `-2`, `-3`… |
| `updateProject(id, patch)` | title, goal, style, status, subjectId | `Project` | |
| `getCheckpoint(slug, code)` | | `CheckpointDetail` | |
| `addSource(projectId, file, onProgress)` | PDF `File` | `Source` | runs `src/pdf/ingest.ts`; see `design.md` §6.4 |
| `deleteSource(id)` | | void | deletes pages, storage object, row |
| `listSessions(slug?)` | | `SessionSummary[]` | newest first |
| `getSession(slug, number)` | | `SessionDetail` | |
| `listProposals()` | | `Proposal[]` | pending only, oldest first |
| `getProposal(id)` | | `Proposal` | any status |
| `approveProposal(id, edit?)` | `{front?, back?, type?}` for cards | void | RPC `approve_proposal` |
| `rejectProposal(id)` | | void | |
| `approveAllCards()` | | number | approves every pending `card` proposal in order |
| `getDeckTree()` | | `DeckNode[]` | due counts per §6.5 |
| `getReviewItems(filter)` | `QueueFilter` | `ReviewItem[]` | exactly the due set of §6.5 (limits applied) restricted by the filter; ordering in `src/lib/queue` |
| `recordReview(input)` | `RecordReviewInput` | `{reviewId}` | RPC `record_review` |
| `undoReview(reviewId)` | | `CardState` | RPC `undo_review` |
| `searchCards(query, slug?)` | text | `CardRow[]` | front/back `ilike`; max 100 |
| `searchCardsPage(filter)` | `CardSearchFilters` | `CardSearchPage` | ST-5 additive: owner-scoped, stable newest-first server search, 50 rows per page; optional project, checkpoint, scheduling state, note status, open-comment filters; `nextOffset` is null at the end |
| `getCard(noteNo)` | | `CardDetail` | |
| `getCardHistoryPage(noteNo, cursor?)` | note number, opaque cursor | `CardHistoryPage` | CONTRACT-546: 20 reviews newest-first, 21-row probe, owner/note scope; FIX-546b implements |
| `getCardCommentsPage(noteNo, cursor?)` | note number, opaque cursor | `CardCommentsPage` | CONTRACT-546: 20 comments newest-first, 21-row probe, owner/note scope; FIX-546b implements |
| `createNote(input)` | projectSlug, front, back, type, kind, checkpointCode? | `{noteNo}` | owner-made cards skip approval |
| `updateNote(noteNo, patch)` | front, back, type, kind, tags | void | same ordinal rules as §5.4 card_edit |
| `setNoteStatus(noteNo, status)` | active, suspended, deleted | void | |
| `addComment(noteNo, body)` | | `CardComment` | |
| `dismissComment(no)` | | void | |
| `resolveMisconception(id)` | | void | |
| `getAtlas()` | | `AtlasGraph` | |
| `pinConcept(id, x, y)` | | void | |
| `getReviewLog()` | | `{cardId, reviewedAt, rating}[]` | non-undone reviews, for the FSRS optimizer in Settings |
| `getInsightData(days)` | 7, 30 or 90 | `InsightData` | raw rows; math in `src/lib/insights` |
| `exportAll()` | | `Blob` | JSON of every table for this owner |

## 9. React Query hooks (`src/data/hooks.ts`)

- CONTRACT-546 adds `useCardHistoryPage(noteNo, cursor?)` and `useCardCommentsPage(noteNo, cursor?)` with per-card/per-cursor keys; both throw `not_implemented` until FIX-546b supplies adapters.
- One hook per read method: `useHome`, `useProjects`, `useProject(slug)`, `useCheckpoint(slug, code)`, `useSessions(slug?)`, `useSession(slug, n)`, `useProposals`, `useProposal(id)`, `useDeckTree`, `useReviewItems(filter)`, `useSearchCards(q, slug?)`, `useSearchCardsPage(filter)`, `useCard(noteNo)`, `useAtlas`, `useInsightData(days)`, `useSettings`, `useStyles`, `useSubjects`, `useAuth`.
- Query keys: `['home']`, `['projects']`, `['project', slug]`, `['checkpoint', slug, code]`, `['sessions', slug ?? 'all']`, `['session', slug, n]`, `['proposals']`, `['proposal', id]`, `['decks']`, `['review-items', filter]`, `['cards', q, slug]`, `['card', noteNo]`, `['atlas']`, `['insights', days]`, `['settings']`, `['styles']`, `['subjects']`, `['auth']`.
- One mutation hook per write method (`useApproveProposal`, …). After success, invalidate: proposals, home, decks, project and session keys for approvals; card, decks, home after reviews and note edits; settings after settings changes; projects and home after project changes; atlas after plan approvals and pins.
- `staleTime` 30 s; refetch on window focus (the owner comes back from the chat app and sees new proposals).

## 10. Demo dataset (`src/data/demo/fixture.json`)

Generated by `scripts/make-demo-data.ts` with a fixed seed; the demo adapter loads it into memory and applies writes in memory (reload resets). Times are relative to "now" when the adapter loads, so due counts stay stable. The numbers below must hold; the screens and e2e tests rely on them.

- Owner settings: defaults; `preferredChat = 'claude'`; `connectorLastSeenAt` = 2 h ago, client `claude`.
- Subjects: Analysis (`∫`, amber), Topology (`τ`, violet), Linear Algebra (`λ`, cyan).
- Projects:
  - `real-analysis` "Real Analysis", goal "Prove the main theorems of Rudin ch. 2–4. Comfortable with ε–δ, shaky on topology arguments.", style socratic, active. 12 checkpoints: CP1 Metric spaces (done), CP2 Open and closed sets (done, re-check due today, recheck prompt "What makes a set open in a metric space?"), CP3 Sequences (done), CP4 Compactness (now, step 2 of 4; steps "Set up the cover", "Separate x from K", "Use a finite subcover", "Conclude"; criterion "Writes, unaided, a proof that compact sets in a Hausdorff space are closed."; pages 36-40), CP5 Continuity (next), CP6 Limits of functions, CP7 Heine–Borel, CP8 Uniform continuity, CP9 Extreme value theorem, CP10 Connectedness, CP11 Intermediate value theorem, CP12 Capstone proofs (CP6–CP12 locked by prerequisites). Progress 3/12. 48 cards. Sessions S1–S7; S7 "Prove compact sets in a Hausdorff space are closed", Claude, 42 min, goal met, ended yesterday; plus an open session S8 on CP4 paused 2 h ago with resume question "Why is a finite subcover enough to separate x from K?". One source `rudin` "Principles of Mathematical Analysis", 342 pages, 11 outline chapters, page labels offset by 12.
  - `linear-algebra` "Linear Algebra", 14 checkpoints, 8 done, now: CP9 Diagonalization; 30 cards; sessions S1–S16 (all 26 sessions of the three projects fall within the last 30 days).
  - `topology` "Topology", 9 checkpoints, 1 done, now: CP2 Topological spaces; 12 cards; sessions S1–S2.
- Due today: 23 (Compactness 9, Sequences 5, Linear Algebra 6, Topology 3). 18 due tomorrow.
- Pending proposals: 6 — four `card` proposals from real-analysis S7 (the Why/Theorem/Counterexample/Cloze cards shown on the Approve board), one `card` from linear-algebra S12 (eigenvalue definition), one `plan_change` adding "CP4a Finite subcover lemma" after CP4 and making CP5 need CP4a, reason "Same gap in S6 and S7".
- Comments: N7 (Heine–Borel card) has one open comment "Too wordy. Make the hypotheses a cloze." from 2 h ago and one addressed comment resolved by a Claude proposal in S6.
- Misconceptions: real-analysis "open cover vs open set", times 2, unresolved, linked to concept Open cover.
- Concepts: 22 across the three subjects; 9 demonstrated, 3 revisit (Open sets, Open cover, Hausdorff), Compactness in progress; links as drawn on the Atlas board.
- Reviews: 90 days of history (≈1,300 reviews) whose recall is 91% over the last 30 days, with confidence on about half of them (sure right 94%, unsure 71%, guess 38%). Sessions give 18 h 40 m in the last 30 days (Analysis 9 h 20 m, Linear Algebra 6 h 10 m, Topology 3 h 10 m), 26 sessions, 412 reviews in 30 days, median session 38 min.

## 11. Reset procedure (task DB-1 step 1)

The old schema from the retired plan is still in the project (19 tables in `public`, schema `lemma_private`, 17 rows in `supabase_migrations.schema_migrations`). The owner approved deleting it on 29 Oct 2026; a first attempt was stopped at the tool's confirmation prompt, so expect to confirm.

1. Drop schema `lemma_private` with cascade.
2. Drop every table, view, function, type and sequence in `public` (cascade).
3. Delete all rows of `supabase_migrations.schema_migrations`.
4. Keep `auth.users` (the owner's Google account) and the `storage` schema.
5. Verify: `public` has no tables; migration history is empty.

## 12. Default KaTeX macros (`settings.macros`)

```
\newcommand{\R}{\mathbb{R}}
\newcommand{\N}{\mathbb{N}}
\newcommand{\Z}{\mathbb{Z}}
\newcommand{\Q}{\mathbb{Q}}
\newcommand{\C}{\mathbb{C}}
\newcommand{\abs}[1]{\left\lvert #1 \right\rvert}
\newcommand{\norm}[1]{\left\lVert #1 \right\rVert}
\newcommand{\inner}[2]{\left\langle #1, #2 \right\rangle}
\newcommand{\eps}{\varepsilon}
\DeclareMathOperator{\tr}{tr}
\DeclareMathOperator{\rank}{rank}
\DeclareMathOperator*{\argmax}{arg\,max}
\DeclareMathOperator*{\argmin}{arg\,min}
```
(Carried over from the owner's previous profile.)
