# Adaptive learning: Phase 0 report and plan (2026-11-17)

Spec: `docs/spec/adaptive-learning-spec.md` (the Owner's document, verbatim; "§n" below means its sections).
Phase 0 is discovery only. No schema, data or code has changed. Building starts after the Owner approves this plan and answers §9.

## 1. Delivery: two PRs, five stints

| Stint | Work | Model | Effort | Why this model |
|---|---|---|---|---|
| A | Phase 0: discovery, decisions, this plan | Opus 5.5 | xhigh | Done. |
| B | **PR 1** (item N169), build: spec Phases 1–3 + migration steps 0–8 and 11–12 for their flags | **Sonnet 5.5** | **high** | The spec and §4–§6 below fix every formula and table, so this is volume work. Sonnet costs half as much as Opus. Keep effort high: the invariants, the SQL undo path and the property tests punish shortcuts. |
| C | PR 1: independent review (CI requires an approval from a different agent name for `supabase/**`) + sign-off of the `adaptive_migrate` dry run on production | Opus 5.5 | high | Highest stakes, because merging deploys to production. Mostly reading, so the token volume is small. Must be a new chat with its own `chat-<n>#<tag>` name. |
| D | **PR 2** (item N170), build: Phases 4–6 + migration steps 9–10 | Sonnet 5.5 | medium (raise to high only if the proficiency/item-selection property tests keep failing) | The formulas are given verbatim; the workers are plumbing. |
| E | PR 2: independent review | Opus 5.5 | medium | Smaller blast radius: everything is behind default-off flags, and the workers have a kill switch. |
| runtime | Workers: scribe, curator, gardener, digest compression | Haiku 5.5 | low (scribe, curator), medium (gardener alias proposals) | $0.10/$0.50 per 1M tokens. The 200k-input/day cap costs about $0.02 a day; the Batch API halves nightly jobs. |
| runtime | Weekly scribe audit (5%, at least 10 events) | Opus 5.5 via Batch | medium | Only cents a week. |

Not used: **Fable 5.2** (twice the price of Opus; no part needs it). **Haiku 5.5 for development**: the CI rules, the SQL undo journal and the migration rules make rework cost more than it saves.

Switch points: A→B (now, after approval), B→C (after PR 1 is Ready and green), C→D (after PR 1 merges), D→E (after PR 2 is Ready and green). Each switch is a new chat started with the prompt in §10, because a fresh context is cheaper than carrying this one.

### Constraints from AGENTS.md and `scripts/ci/scope.mjs` that shape the plan
- An Owner-task PR may add exactly one new NEXT.md item (`ITEM-ID`), so it is one item per PR: N169 now, N170 when PR 2 opens. Each PR body carries `Owner task: "<exact words>"` after line 1.
- `MIGRATION-ADDITIVE`: a new migration may only create things. Consequences:
  1. `checkpoints.status` keeps its CHECK (`not_started|in_progress|demonstrated`), so deferral goes in a new column (D4).
  2. `concept_links.kind` keeps its CHECK (`prereq|related`), so `same_as` needs a new table, `concept_aliases` (PR 2).
  3. The data migration cannot be UPDATEs in a migration file. It is a new RPC, `adaptive_migrate` (D9).
  4. Changing `save_progress` and `lemma_rederive_checkpoint_evidence` needs the PR body line `Replaces function: … (reviewer verified signature and behaviour)`. Both stay byte-for-byte equivalent with the flags off.
  5. Down-migrations live in `supabase/rollback/N169.down.sql`, which the deploy never applies. They are tested in PGlite (up → down → up, schema equal).
- Branch: the harness requires `ccr-949daf2a-akvnvy`. `scope.mjs` does not check branch names. PR 2 restarts the branch from main after PR 1 merges.
- The build stints post the run-log Plan/Result comment (they are the runs that open PRs).
- New dependency: `fast-check` (devDependency) for the property tests. The item text must name it ("No new dependencies unless the item says so").

## 2. Code map

**`resume` and WARM**
- `supabase/functions/mcp/packet.ts` `basePacket`: WARM for a single project (demonstrated and (`needs_revisit` or `recheck_due ≤ today`) with a `recheck_prompt`, top 2) and in mix mode.
- The GOAL line appends `goalEta` (`derive.ts`: "finish ≈ <date>", a projection that breaks I1) and `scheduleHint` (`v3.ts`).
- `packet()` prepends OWNER and appends ADAPT (top 3 open/confirmed diagnostics, `pace` included). The budget is 2400 chars.
- `server.ts:54`: NEXT is "start_session, then WARM questions".
- `rules.ts`:
  - STUDY line 1: "Ask WARM questions first…";
  - ADAPT and INSTRUCTIONS: "behind schedule…".

**Recheck write paths** (all stop writing under `recheck_v2`)
1. SQL `save_progress` (`20261029165642_lemma_atomic_progress.sql:43-56`). `evidence/demonstrated` sets `recheck_due = today+3`, which is **the loop**. Kind `recheck` follows a 10/30/90-day ladder; a fail sets `today+1` and `needs_revisit`.
2. SQL `lemma_rederive_checkpoint_evidence` (`20261116010000_n91_history_correction.sql` ≈ L80-110) replays the same ladder after event corrections.
3. `tools/write.ts:51`: `end_session` writes the generic `recheck_prompt`.
4. `derive.ts`: `ladder()` (a TS copy of the ladder) and `ui()` ('revisit').
5. `approve_proposal` (latest `20261215090007_n165_approve_proposal.sql:141`) sets `needs_revisit` when a demonstrated CP's criterion changes.
6. `tools/control.ts:16,225`: `edit`/`add` accept `recheck_due`, `needs_revisit` and `recheck_prompt`.
7. `tools/read.ts:81`: `get(checkpoint)` prints a RECHECK line. `read.ts:129` gives Atlas status 'revisit'.

**App reads** (keep these columns readable; never drop them)
- `src/data/live/helpers.ts:94-96`: `needs_revisit` and `recheck_due` drive the checkpoint "revisit" state.
- `src/data/live/adapter.ts:363`: `recheckPrompt` on the Checkpoint page.
- `src/features/plan-proposal/nodes.ts`: `recheck_prompt` in plan proposals; these are plan probes.
- `src/data/demo/*` and `src/data/types.ts`.
- Under `recheck_v2` the "revisit" chip disappears for CPs that were simply demonstrated. That is the intended fix, and no app change is needed.

**Other paths**
- **Export / snapshot:** `owner_export_snapshots(id, user_id, created_at, data jsonb)` and the N95 owner export (`20261119010000_n95_owner_export.sql`); `get(what=export)` pages it. Migration step 0 writes one snapshot and records per-table row counts and sha256 in the migration action.
- **Undo:**
  - `lemma_undo_tables(table_name)` has 42 tables;
  - `actions`, `action_changes` and `owner_changes` form the journal;
  - `lemma_command_resources` has 25 MCP resources (`schema.fields` / `schema.operations`).
  - New fact tables are added to both registries; derived caches to neither.
- **FSRS:** `supabase/functions/_shared/fsrs.js` (FSRS-6, 21 params; the same engine as `src/lib/fsrs`). `settings.fsrs_weights` is null, so the defaults apply; `desired_retention` is 0.91.
- **Time:** `derive.ts day()` already computes the local study day correctly (IANA zone, then rollover). SQL uses `(now() at time zone tz) - rollover`.
- **Flags:** `src/flags.ts` is build-wide and app-only. Per-user flags need a new `settings.flags jsonb`, read by the MCP and by SQL (`lemma_flag(user, name)`).
- **Tests:**
  - Vitest (unit; the MCP modules are tested from `tests/unit/mcp*`);
  - PGlite full-migration SQL tests in `tests/mcp/sql/*.mjs`, which serve as the "local stack";
  - the tools/list budget in `tests/mcp/sweep-budget.test.mjs` (15,000 chars).

## 3. Production facts (read-only queries, 2026-11-17)

- **Settings:**
  - Asia/Calcutta, rollover 4;
  - planning window 08:00–22:00, `daily_minimum_minutes` 20, `max_consecutive_minutes` 120;
  - `review_budget` {cards 20, minutes 20};
  - no weekday capacity is stored anywhere.
- **Projects:** all four are active with `target_date` 2026-11-20. complex-analysis and analysis-1-probability share one subject.

  | project | CPs | done | sessions | first session | minutes | target_label |
  |---|---|---|---|---|---|---|
  | topology-1 | 39 | 3 | 7 | 2026-11-16 | 608 | "10-day deep pass" |
  | algebra-1 | 35 | 3 | 6 | 2026-11-10 | 716 | "Algebra I in 10 days" |
  | complex-analysis | 35 | 0 | 0 | — | — | "7-day intensive" |
  | analysis-1-probability | 30 | 0 | 0 | — | — | "7-day plan" |

  The spec's example TIME block shows `first_session=2026-11-10` for topology-1, but the data says 2026-11-16 (2026-11-10 is algebra-1's). Acceptance test 1 follows the data.
- **Checkpoint shape:** `steps` is a JSON array of strings in every row.
- **Recheck columns today:**
  - topology-1 CP1 and CP2 (due 11-19) and CP3 (due 11-20) have generic prompts and no gap evidence, so they are **dropped**.
  - algebra-1 CP1 has level 1, `needs_revisit`, due 11-24 and a concrete prompt: a real gap, so it **becomes a recheck**.
  - algebra-1 CP2 (due 11-18) and CP3 (due 11-19) have concrete prompts but no gap, partial, hint ≥ 2 or misconception evidence. Under the §14.7 rule they are dropped as rechecks, and their prompts are kept as `plan_probe` items (§9 Q11).
- 48 not-started CPs carry a `recheck_prompt`. They become `plan_probe` items.
- 10 "Cards K…" CPs; 38 "Venture:" steps.
- **session_events** (189 rows):
  - gradable (147): attempt 98, pretest 30, evidence 12, recheck 4, explanation 3;
  - not gradable: note 32, misconception 8, hint 2;
  - none with `hint_level ≥ 2`.
- **misconceptions:** 6 unresolved, and **none has a `concept_id`** (the spec assumed they do). T4 backfill maps through the session CP's concepts only when there is exactly one candidate; otherwise the row is listed as unresolved.
- concepts 400; `checkpoint_concepts` 305; 7 CPs have no concept; `concept_links`: prereq 77, related 4.
- cards 0, study_entries 9, calendar_blocks 0, deadlines 0, practice_topics/events 0, actions 24,875.
- diagnostics: gap 1, pace 2, strength 3.
- **The resources bug:** all 25 registry rows pass the current validator. It was fixed on main by incident #1402 (PR #1406, 2026-11-14, which allowed camelCase fields). One defect remains: a single malformed row still fails the whole listing. The Phase 1 fix lists the good rows and reports the bad ones as `skipped:[{resource, reason}]`, with a test. Also confirm the deployed `mcp` function includes #1406.

## 4. Decisions

**D1 Recheck storage: a new `rechecks` table, not `practice_topics`.**
- `practice_topics`/`practice_events` is a typed, learner-facing resource (N57: contract, live and demo adapters, an MCP resource). Its topics are chosen by the learner and its due value is a date only. It has no FSRS memory, no origin evidence, no state machine and no (class, level) key.
- Extending it would mean altering its CHECKs (forbidden by MIGRATION-ADDITIVE) and changing a contract the app reads. Having 0 rows does not remove that cost.
- `rechecks` is a **derived cache**, rebuilt by a pure replay of facts in `occurred_at` order. The facts are evidence, misconceptions, assumptions, `plan_state`, and the learner's recheck decisions.
  - Undo or redo of any fact therefore restores exactly the previous set (I7), with no undo registration.
  - Identical inputs give identical output (I3).
- Learner actions on a recheck (convert to card, rate Easy, log a remediation) are facts in `recheck_decisions`, which is undoable.
- Data volume is tiny, so a full replay per user per request is fine. A perf test asserts < 50 ms for 5,000 evidence rows.
- Columns: §7, plus `class_id` and `input_hash`. A unique partial index on (user_id, class_id, level) where `state = 'open'` enforces deduplication.

**D2 Derived state** (rechecks, queue, feasibility; PR 2 adds proficiency and node cards):
- Computed in TypeScript by the pure core and written by the MCP adapter on read, with `input_hash` and `computed_at`.
- Writers mark the user dirty: a trigger on each fact table bumps `settings.facts_epoch`. This catches app writes and undo/redo too.
- Readers recompute when the epoch or the study day changed.
- Hysteresis (restore needs slack > 10% on 2 consecutive study days) reads `scheduler_runs`, which freezes the first feasibility of each study day. So I3 holds within a day.

**D3 Per-step metadata:** a new `checkpoints.step_meta jsonb`, an array aligned with `steps`: `[{tier, estimate_minutes, state}]`. `steps` stays `string[]` for the app and for the 80-char step validation.

**D4 Deferral:** new columns on `checkpoints`. `status` is untouched; until a UI item exists, the app shows a deferred CP as not started.
- `plan_state text not null default 'active'`, one of `active`, `deferred`, `skipped`;
- `deferred_reason`, `deferred_at`;
- `kind`, `tier`, `estimate_minutes`, `pinned`, `self_reported`.

**D5 Time facts**
- **Projects:**
  - `deadline_at timestamptz`, `last_study_on date`;
  - `time_confirmed bool` (the spec's `needs_confirmation`);
  - `share_weight real`, `auto_prune_standard bool`;
  - PR 2 adds `learning_profile jsonb`.
- **Settings:** `capacity jsonb {weekday_minutes[7], review_share}` and `flags jsonb`.
- **Sessions:** `study_day date` and `time_zone text`, set at start, so past days keep their recorded zone.
- **Capacity overrides:** a new fact table, `capacity_overrides(on_date, minutes)`, undoable and registered as a resource.
- The empty `deadlines` table (N42) is a separate, generic, learner-facing feature. The project deadline lives on `projects`, as the spec says.

**D6 Workers:**
- Run in a new Supabase Edge Function, `workers`, driven by `pg_cron` (the same pattern as the `notify`/`push` ticks).
- Jobs queue in `worker_jobs`, unique on (job, input_id); telemetry goes to `worker_runs`.
- The scribe is enqueued at session end or abandon and drained every 5 minutes. The gardener and curator run nightly through the Message Batches API.
- The key is `ANTHROPIC_API_KEY` in Supabase secrets, added by the Owner.
- The MCP process was rejected: invocations are request-scoped, it has no scheduler, and work there would add latency to `end_session`.

**D7 Pure core** lives in `supabase/functions/_shared/adaptive/`. It does no I/O and is imported by the MCP adapters.
- PR 1: `time.ts`, `lint.ts`, `recheck.ts` (replay + FSRS clamp), `scheduler.ts`, `feasibility.ts`, `prune.ts`, `estimate.ts`.
- PR 2: `proficiency.ts`, `modes.ts`, `items.ts`, `cards.ts` (the node-card format), `digest.ts`.

**D8 The I2 lint** is one module, applied on writes to the §4 I2 fields. It warns in the tool output and offers to move the value into a structured field; it never blocks. Patterns:
- ISO dates;
- `10 Nov`, `Nov 10`;
- ranges such as `10-19 Nov`;
- `~4 h/day`, `N-day`;
- "behind/ahead", "days behind", "finish by".

**D9 Data migration:** a new RPC, `adaptive_migrate(p jsonb)`, with `{steps:[…], dry_run: true}` as the default.
- A dry run returns the diff and counts and writes nothing.
- A real run writes through the journalled command path, one action per step, so `undo A<n>` reverts that step.
- It is idempotent: keyed by source row ids.
- Free-text edits (§14.2) only ever become proposals.

**D10 Concept class in PR 1** is the identity: class = concept. All code goes through `classOf()`, which PR 2 extends with `concept_aliases`.

**D11 Evidence backfill in PR 1** writes an evidence row only for events with exactly one candidate concept. Every other gradable event gets a row with `concept_id null` and `unresolved=true`, which is counted and listed, never dropped. PR 2's scribe resolves these.

## 5. PR 1: N169 "Adaptive core: time block, evidence-driven rechecks, daily scheduler"

**Flags** (per user, default off): `time_block`, `recheck_v2`, `scheduler_v2`.

**Migrations** (new files, additive):
1. `settings.flags`, `settings.capacity`, `settings.facts_epoch`, and the `lemma_flag()` function.
2. The project time columns and `sessions.study_day`/`time_zone` (a trigger fills them at insert).
3. `capacity_overrides` (RLS, `version`, `updated_at`, `updated_source`; registered for undo and as a resource; insert/update/delete revoked from anon and authenticated per bug #1094).
4. The checkpoint columns (D3, D4).
5. `plan_baselines`.
6. `evidence`: append-only, with `voided_at`/`superseded_by`, registered.
7. `recheck_decisions` (registered).
8. `rechecks` and `scheduler_runs` (derived; RLS select-only for the owner; not registered).
9. `save_progress` and `lemma_rederive_checkpoint_evidence` replaced, gated by `lemma_flag(…,'recheck_v2')`: they stop writing the legacy recheck columns and write `evidence`. With the flag off their behaviour is identical.
10. `adaptive_migrate`.
11. The epoch triggers.

Every new table follows the existing conventions (RLS `user_id = auth.uid()`, `version`, `created_at`/`updated_at`, `updated_source`). Copy them from `20261107222010_deadlines_command.sql`.

**MCP changes**
- **TIME block** (§5): `get(what=time|queue|feasibility|forecast)`.
- **`resume` v2**, with `time_block` on:
  - fixed order OWNER, RULES (≤ 10 lines), TIME, QUEUE, BRIEF, FLAGS, NEXT;
  - BRIEF holds today's CP and the mandatory rechecks until PR 2 adds node cards;
  - `goalEta`/pace lines and the ADAPT pace diagnostics are dropped;
  - a budget test: ≤ 1500 tokens excluding OWNER.
- **With `recheck_v2` on:**
  - WARM is removed;
  - `end_session` ignores `recheck_prompt`;
  - three recall questions failed or partial create T3 rechecks;
  - `edit`/`add` refuse the deprecated fields.
- **`save_progress` events** gain optional `concept`, `level`, `role`, `novelty` and `item` fields. Evidence is written directly with `origin='tutor'`.
- **I2 lint** on prompt, goal, `target_label`, diagnostics, `master_prompt`, `tutor_rules` and the `end_session` summary.
- **Resources listing** fix.
- **Protocol text** updated per §13.5, terse; check the tools/list budget test.

**Pure-core coverage**
- Time: study day, rollover, travel, `study_days_left`, capacity.
- Rechecks: triggers T1–T5, initial grades, the FSRS clamp (I5, core ≤ `last_study_on − 1`, `beyond_deadline`), merge, the state machine, escalation at 4 fails, expire/reopen, the superseded rule, prompt validation (`^Recheck CP\d+` is rejected).
- Scheduler (§8.1): review budget, priority, interleave, mandatory prerequisite rechecks, overflow spread over the next 3 study days, learning fill at step level, the "if time permits" tail.
- Estimates and `pace_factor` (§8.2).
- Feasibility with buffer and hysteresis (§8.3).
- Multi-project earliest-deadline-first with a "ask" result when core would be cut in more than one project (§8.4).
- Pruning order and constraints, and exact reverse restore (§8.5).
- Absences (§8.6).

**Tests**
- Each invariant I1–I7 gets a named test.
- Every §16 case under Time, Plan, Rechecks, Scheduler and Concurrency/undo.
- Acceptance criteria 1, 2, 3, 4 (recheck and queue parts), 5, 6, 7 (`resume`), 9 and 10 (all flags off, then each flag on in order).
- PGlite: up → down → up, and `adaptive_migrate` dry run vs real run plus undo on a fixture.
- Property tests (fast-check):
  - the scheduler is byte-identical across runs and callers;
  - pruning never touches core, pinned, done or in-progress items, or a prerequisite of a kept CP;
  - replay after undo equals the state before.

**Fixture:** `tests/fixtures/adaptive-2026-11-17.json`, a reduced copy of production (§7 R4).

**Docs:** `docs/current/N169.md`; the NEXT.md block for N169 is added and deleted in the same PR.

**Rollout after merge:**
1. Owner runs `adaptive_migrate` as a dry run → Stint C checks it → real run.
2. Turn on `time_block` and `recheck_v2`, which fix the observed problems 1–3.
3. Turn on `scheduler_v2` after a shadow run (§7 R3).

## 6. PR 2: N170 "Adaptive pace and Atlas memory: proficiency, items, workers, calibration"

**Flags:** `proficiency`, `items`, `atlas_memory`, `workers`.

**Proficiency and pace**
- `proficiency.ts`: Beta per class × level; weights, novelty, role, fatigue, downward implications, forgetting through recheck R; recomputed from evidence in one pass; I7 test.
- `modes.ts`: fast-track (core needs `understand` on the star concept), scrutiny (prerequisite walk ≤ 2 deep), hysteresis.
- `assumptions` (fact table, T5) and the LBU flag.

**Items and profiles**
- `items` (fact table) with templates, selection (p\* 0.85 within [0.70, 0.90]), Elo-style `b` updates, hold-out, teaching exercises, `needs_transcription`.
- Migration step 7c: the 48 plan probes become `plan_probe` items.
- `projects.learning_profile` (drafted, then approved).
- `concept_aliases` (`same_as`; automatic only for an exact normalised name under the same-named parent; otherwise proposals).

**Atlas memory**
- `node_digests` (derived from evidence only, I10) and node cards.
- `get(what=node, depth, trail)` with the token budgets.

**Workers**
- The `workers` Edge Function, `worker_jobs`, `worker_runs`, kill switch, daily token cap, idempotency and watermarks.
- Scribe: candidates only, never changes outcome or hint.
- Gardener, curator, and briefer compression.
- The weekly audit.

**Calibration:** Brier score, calibration buckets, `b` recalibration, a weekly report in `get(what=calibration)`.

**Tests:** §16 Proficiency, Items and Workers; acceptance criteria 7 (node card ≤ 100 tokens) and 8 (property test with a mocked model).

## 7. Risks

- **R1 Review dependency.** Both PRs need an approval from a second agent. If the reviewer requests changes, Stint B (or D) resumes in its own chat.
- **R2 Size.** PR 1 is roughly 4–5k changed lines, including tests. Mitigation: the pure core sits in small files; migrations are numbered and each does one thing.
- **R3 The deadline is in 3 days.** PR 1 can reach production before 2026-11-20, but a 2-study-day scheduler shadow run cannot finish before the deadline. Proposal:
  - turn on `time_block` and `recheck_v2` as soon as the migration is done (they fix the loop and the date misquoting);
  - run `scheduler_v2` in shadow for 1 day, or set new deadlines (§9 Q1, Q12).
- **R4 Fixture privacy.** The acceptance fixtures copy production data. Commit only codes, statuses, dates, counts and the exact lint-target strings; replace all other free text (§9 Q13).
- **R5 Rollback.** The deploy never applies down-migrations. Switching flags off is the first-line rollback; `supabase/rollback/N169.down.sql` is a manual Owner step.
- **R6 Missing concept links.** Misconceptions without `concept_id` and the 7 CPs without concepts leave some evidence and rechecks unresolved. They are listed, never dropped.
- **R7 CI revert.** If the full suite fails on main after merge, CI reverts the code but not the migrations (S0 fix-forward). Keep the migrations conservative and fully tested in PGlite before Ready.

## 8. What stays unchanged

The flashcard FSRS (cards, reviews, `review_parameter_sets`), the app UI, `practice_topics`, existing migrations and the existing columns: deprecated columns are only no longer written.

## 9. Open questions (spec §15, plus what discovery found), each with the default used if unanswered

1. Is 2026-11-20 the exam day, the last study day, or both, for each project? What time is the exam? *Default:* `last_study_on = target_date` with `time_confirmed=false`, exam 09:00 IST.
2. Daily capacity per weekday, and the split between projects? *Default:* 240 min every day (the topology-1 prompt says about 4 h), earliest deadline first.
3. Tiers and pins: drafted in the `adaptive_migrate` dry run, then approved.
4. Worker model and budget? *Default:* Haiku 5.5 for the workers and Opus 5.5 for the weekly audit; the Owner adds `ANTHROPIC_API_KEY` as a Supabase secret; monthly cap $5 (expected spend ≈ $1–2).
5. Where workers run? *Default:* Edge Function + `pg_cron`.
6. Session transcripts are not stored anywhere today; the scribe uses `session_events` only. *Default:* don't add transcript storage.
7. Learning profiles: drafted in PR 2, then approved.
8. Concept merges across subjects? *Default:* auto-link exact matches only.
9. Are past exam papers available to upload as hold-out items?
10. Do "Cards K…" stay as checkpoints? *Default:* yes.
11. algebra-1 CP2 and CP3 have concrete recheck prompts but no gap evidence. Drop them as rechecks and keep the prompts as probe items? *Default:* yes.
12. Given the 2026-11-20 deadline: turn on `time_block` and `recheck_v2` right after the migration, and shorten the scheduler shadow run to 1 study day? *Default:* yes.
13. Is the GitHub repo public? If yes, the fixture is reduced as in R4. *Default:* reduce it anyway.

## 10. Start prompts for the next stints

**Stint B (Sonnet 5.5, effort high), new chat on branch `ccr-949daf2a-akvnvy`:**
> Implement PR 1 (item N169) exactly as `docs/spec/adaptive-learning-plan.md` §1, §4 and §5 describe, against `docs/spec/adaptive-learning-spec.md`. Owner answers: <paste>. Follow AGENTS.md (Owner task item N169, run-log Plan/Result, one commit per run, Ready when Done). Do not run `adaptive_migrate` with dry_run=false against production. Stop when PR 1 is Ready and give me the next model name.

**Stint C (Opus 5.5, effort high), new chat:**
> Review PR <n> (N169) as an independent reviewer per AGENTS.md: the whole diff against `docs/spec/adaptive-learning-plan.md` and the spec; additive migrations; the "Replaces function" claims; undo and derived-cache correctness (I7); tests. Then run `adaptive_migrate` dry run on production read-only and report the diff for my approval.

**Stint D (Sonnet 5.5, effort medium):** the same as B, for PR 2 (N170, §6), after PR 1 merges and the branch restarts from main.

**Stint E (Opus 5.5, effort medium):** the same as C, for PR 2.
