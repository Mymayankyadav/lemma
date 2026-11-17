# Lemma: adaptive scheduling, rechecks, proficiency and Atlas memory

You are working on **Lemma**, a personal maths-study system. Its parts:

- a Supabase backend (project ref `yemqnhnztlbyxmjxidis`, Postgres 17, region ap-south-1),
- an MCP server that exposes the tutor tools (`resume`, `start_session`, `save_progress`, `end_session`, `get`, `edit`, `add`, `grade`, `review`, `propose_*`, `decide`, `study`, `undo`, …),
- a phone/web app.

The tutor is a large Claude model that talks to the learner through these tools.

This document is the full specification. Read all of it before writing anything. **Phase 0 is discovery only: no schema changes and no code edits.**

---

## 0. Why this work exists

These problems were observed in production data on 2026-11-17:

1. **Recheck loop.** Each time a checkpoint (CP) is demonstrated, `checkpoints.recheck_due` is set about 3 days later with a generic `recheck_prompt` ("Recheck CP2: Equivalence relations…"). `resume` then returns `NEXT: start_session, then WARM questions`, so the tutor rechecks the checkpoint that was just finished. Rechecks are tied to checkpoint order, not to evidence or memory state. Examples:
   - topology-1 CP1 and CP2: demonstrated 2026-11-16, `recheck_due` 2026-11-19.
   - topology-1 CP3: demonstrated 2026-11-17, `recheck_due` 2026-11-20.
2. **Date misquoting.** Date facts are kept in several places that disagree, and the tutor reads all of them.
   - topology-1 `projects.prompt` contains "Track pace vs the 10-day plan (10-19 Nov 2026, ~4 h/day)".
   - `projects.target_date` is 2026-11-20.
   - The CP `due_on` dates start at 2026-11-14.
3. **Derived numbers stored as facts.**
   - Diagnostic D543 (`kind=pace`, status confirmed) says "~30 days behind plan", which is impossible for a 10-day plan.
   - A second `pace` diagnostic embeds stale dates ("scheduled for 10 Nov").
4. **No deadline feasibility, pruning or replanning.**
   - All four projects have `target_date` 2026-11-20.
   - Two projects (complex-analysis, analysis-1-probability) have never had a session.
   - topology-1 has 35+ checkpoints left with about 3–4 days to go.
5. **Progress is per checkpoint, not per concept.**
   - `session_events` has no `concept_id`.
   - There is no proficiency model and no sharing of evidence across subjects.
   - "Uses Zorn's lemma constantly but has never examined it" cannot be represented.

## 1. Goals and non-goals

**Goals.** Build these in order; each phase ships on its own.

1. A single server-computed time block, so the tutor never does date arithmetic.
2. Evidence-driven rechecks, scheduled with FSRS, which removes the loop.
3. A deterministic daily scheduler with feasibility checks, automatic pruning and restoring, resilience to missed days, and allocation across projects.
4. A per-concept, per-level proficiency model shared across subjects, which drives pace: fast-track, normal or scrutiny.
5. A generic "item" layer (exercises and probes) that works whether or not a subject has an exercise bank.
6. Atlas-centred memory (node card, digest, raw log), maintained by small worker models, with tutor briefs kept within a token budget.
7. Feedback and calibration loops.
8. A migration of all existing data into the new model, reversible and dry-run first.

**Non-goals.**

- Neural knowledge tracing. Interpretable Beta/Rasch models are enough here.
- Changing the flashcard FSRS algorithm (`cards`, `reviews`, `review_parameter_sets`).
- A UI redesign beyond what the app needs to stay compatible.
- Any LLM in a deterministic path (dates, scheduling, proficiency arithmetic).
- Editing the learner's free text (prompts, goals) without showing a diff and getting approval.

## 2. How to work

1. **Phase 0 (discovery) ends with a written report and a plan. Stop there and wait for approval.** Ask the open questions in §15 at the same time.
2. **Never change production directly.** Use a Supabase branch or the local stack. Every migration needs a tested down-migration. Before any data migration, take a full export snapshot (check whether `owner_export_snapshots` or the existing export path can do this).
3. **Keep undo working.** Lemma has an undo system (`actions`, `action_changes`, `lemma_undo_tables`, `lemma_command_resources`, `owner_changes`).
   - Every new table that holds user facts must be registered and undoable.
   - Derived caches must not be registered for undo. They are recomputed whenever any fact they depend on changes, including through undo or redo.
4. **Every new table:** RLS with `user_id = auth.uid()`; `version` integer for optimistic concurrency; `created_at`/`updated_at`; `updated_source`. Follow the existing conventions exactly; check how current tables do it.
5. **Stay compatible with the app.** Do not drop or rename columns the app reads (find them in the app code). Deprecate instead: stop writing, keep reading, document it. The app must keep working at every phase.
6. **Feature flags.** Add one flag per subsystem (`time_block`, `recheck_v2`, `scheduler_v2`, `proficiency`, `items`, `atlas_memory`, `workers`), stored per user, for example a new `settings.flags jsonb`. Old behaviour stays available until each flag is switched on.
7. **Pure core.** Time, scheduling, pruning, proficiency and item selection are pure, deterministic functions with no I/O. They are unit tested and property tested. Adapters read and write the database.
8. **Fix the known bug first.** `get(what=resources)` fails with "Malformed registered resource field or operation". `review_corrections` and `session_event_corrections` register camelCase fields that the lowercase check rejects, and one bad row fails the whole listing. Fix it in Phase 1, because you will register new resources.
9. **Watch token cost.** Tool descriptions and server instructions are paid in every session. Prefer new `get(what=…)` values and optional fields on existing tools over new tools. Keep every description terse.

## 3. Glossary

- **Local study day:** the date in `settings.time_zone`, where a day starts at `settings.rollover_hour` (currently 4, so 04:00). A session belongs to the study day of its `started_at`.
- **Concept:** a row in `concepts`. Concepts are scoped to a subject. Levels: cluster > galaxy > system > planet > moon, linked by `parent_id`; one `is_star` per system. Prerequisites live in `concept_links(kind='prereq')`.
- **Concept class:** the set of concepts joined by `same_as` links (new link kind) across subjects. Proficiency is pooled per class.
- **Proficiency levels (dimensions):**
  - `recall`: states it exactly, with hypotheses.
  - `use`: applies it as a tool.
  - `understand`: proves it, says why each hypothesis is needed, gives counterexamples.
  - `transfer`: applies it in an unfamiliar setting or another subject.
- **Evidence:** one graded observation of one concept at one level.
- **Item:** anything posed to the learner that produces evidence: an exercise, a probe, a recall question, a proof task, a flashcard front.
- **Recheck:** a scheduled re-test of one (concept class, level), created only from evidence (§7).
- **Fact vs derived:**
  - Facts are entered or observed: sessions, events, evidence, completions, approved plans, deadlines, capacity.
  - Derived values are computed: proficiency, queue, feasibility, forecast, pace.
  - **Derived values are never stored as facts.**

## 4. Invariants

Every invariant needs at least one test.

- **I1.** Every date, count or duration the tutor quotes comes from a server-computed block. Tool output never contains a number that cannot be recomputed from stored facts.
- **I2.** No free-text field (`projects.prompt`, `projects.goal`, `projects.target_label`, `diagnostics.evidence/topic`, `settings.master_prompt`, `settings.tutor_rules`) may contain a date, a date range, hours per day, or a pace or forecast claim. Enforce this with a lint on write: warn and offer to move the value into a structured field.
- **I3.** The scheduler is deterministic. The same facts on the same local study day give byte-identical output.
- **I4.** The scheduler deletes nothing. Pruning sets a reversible `deferred` state, and every change is logged with a reason code.
- **I5.** A recheck is never due on the same local study day as the evidence that created it.
- **I6.** Done, in-progress and pinned items are never pruned. Core items are never pruned automatically.
- **I7.** Undo or redo of any fact recomputes all affected derived state exactly. Proficiency after an undo equals the proficiency before the undone action.
- **I8.** Small (worker) models extract, tag, summarise and propose. They never decide correctness, never set outcomes, and never merge concepts or change tiers without a deterministic rule or an approval.
- **I9.** Every digest line and every worker-written row links back to the raw rows it came from (`session_event_id`, `evidence_id`, `source_id` + page).
- **I10.** Digests are rebuilt from raw evidence, never from earlier digests.

## 5. Time model

- **Facts to store:**
  - `settings.time_zone` and `settings.rollover_hour` (both exist).
  - Per project:
    - `deadline_at timestamptz`: start of the exam or deliverable.
    - `last_study_on date`: last local study day available. It may equal the exam date if studying on exam morning is allowed.
    - `first_session_on`: derived from `min(sessions.started_at)`; never stored as free text.
    - Reuse `target_date` as the deadline date for compatibility. Treat `target_label` as a display-only name and keep it free of numbers per I2.
- **Capacity:**
  - Weekly default minutes per weekday, in `settings.planning` (it already has `window_start`, `window_end`, `daily_minimum_minutes`, `max_consecutive_minutes`).
  - Per-date overrides in a new table, `capacity_overrides(date, minutes)`.
  - `capacity(d) = min(override or weekday default, window minutes − busy calendar_blocks on d)`.
  - For today, subtract minutes already logged in `study_entries`.
  - Capacity is shared across projects.
- **Project shares:** optional per-project weights. Default: allocate by earliest deadline first (§8.4).
- **The TIME block**, returned by `resume` and `get(what=time)`. Fixed format, each field on one line, all computed:
  ```
  TIME today=2026-11-17 (Tue) tz=Asia/Calcutta
  deadline=2026-11-20 last_study=2026-11-20 study_days_left=4 (incl. today)
  first_session=2026-11-10
  due_today=[CP5,CP6] overdue_vs_baseline=[CP4:+3d,CP5:+2d,…] (max 8 listed, then "+N more")
  capacity_today=180m used_today=45m
  ```
  - No pace, forecast or projected finish appears here.
  - `get(what=forecast)` returns a clearly labelled estimate, only when asked, and it is never stored.

## 6. Checkpoints and plan baselines

Add to `checkpoints`:

- `kind text not null default 'learn'`, one of: `learn`, `cards`, `milestone`.
  - Migrate CPs titled `Cards K…` to `cards`.
  - `cards` CPs are never prerequisites. Their content is drafting cards for material actually studied in that stage. **Reviewing due cards moves to the daily queue**, not the CP.
  - If every `learn` CP in a stage is deferred, that stage's `cards` CP is deferred automatically.
- `tier text not null default 'standard'`, one of: `core`, `standard`, `venture`.
  - Steps prefixed "Venture:" become venture steps.
  - Course-notes CPs default to `core`.
  - The learner approves the tier list per project before pruning goes live.
- `estimate_minutes int`, `pinned bool default false`.
- Status gains `deferred` and `skipped` (find the existing status vocabulary first; don't break the app). Add `deferred_reason text`, `deferred_at timestamptz`.
- Per-step `tier` and `estimate_minutes` inside `steps jsonb`. Inspect the current shape first, and keep it backward compatible.
- `done` counts only when `demonstrated_at` is set by evidence meeting the criterion independently. A manual completion sets `self_reported=true` and is excluded as evidence.

Baselines:

- New table `plan_baselines(id, project_id, version, approved_at, reason, entries jsonb [{checkpoint_id, due_on}])`.
- Version 0 = the original plan, reconstructed from `plan_revisions` and proposals if possible. Version 1 = the current `due_on` values.
- Every approved re-date creates a new version. "Behind" is reported against the latest approved baseline; earlier versions are kept for honesty.

Deprecate `checkpoints.recheck_level`, `recheck_due`, `recheck_prompt` and `needs_revisit`. After migration, stop writing them and keep them readable until the app no longer reads them.

## 7. Rechecks (replaces the checkpoint-level recheck)

**Storage.** Decide between extending `practice_topics`/`practice_events` (0 rows; they already have `concept_id`, `checkpoint_id`, `next_due_date`) and a new `rechecks` table. Justify the choice in the Phase 0 report. Either way, each recheck needs: `concept_id` (canonical of its class), `level`, `state`, `origin_evidence_ids[]`, `prompt` (concrete), FSRS memory fields (`stability`, `difficulty`, `due`, `last_review`, `reps`, `lapses`), `fail_count`, `created_at`, `closed_at`, `close_reason`.

**What creates a recheck.** Nothing else creates one:

| Code | Trigger |
|---|---|
| T1 | A gap that was fixed: evidence `fail` or `partial` on (concept, level), followed by a `pass` on the same pair in the same session. |
| T2 | A pass that needed `hint_level ≥ 2` (ladder: 1 nudge question, 2 key idea, 3 one step, 4 worked step). |
| T3 | An end-of-session recall question answered `fail` or `partial`. |
| T4 | A misconception logged (`misconceptions` row): creates a recheck at the `understand` level. |
| T5 | An assumption withdrawn (§9.5). |

These **never** create a recheck: completing a checkpoint, a clean pass with no hints, or a generic end-of-session prompt.

**Initial scheduling.**

- The creating evidence counts as the first review: T1 = Again, T2 = Hard, T3 partial = Hard, T3 fail = Again, T4 = Again, T5 = Again.
- Use the same FSRS implementation and parameters as `cards` (`settings.fsrs_weights`, `desired_retention` 0.91), clamped as follows:
  - due date ≥ the next local study day (I5),
  - for `core` concepts, due date ≤ `last_study_on − 1`, leaving one final check in the buffer.
  - If FSRS would schedule past `last_study_on`: a core concept gets one check in the buffer; a non-core one retires with `close_reason='beyond_deadline'`.

**Deduplication.** One open recheck per (concept class, level). A new trigger on an open recheck merges into it: `due = min(existing, new)`, origins are appended, and the reason is logged.

**States and transitions.**

- `open` → `passed` (pass, hint 0) → FSRS reschedules with Good, or Easy if the learner says so.
- `partial` → Hard. `fail` → Again, and `fail_count++`.
- `retired`: after 2 passes in a row, or 1 pass at least 3 days after creation.
- `superseded`: a later pass outside the recheck on the same class, at the same or a higher level, with hint 0 on a novel item, counts as a pass.
- `escalated`: at `fail_count ≥ 4`, raise the matching gap diagnostic's severity, flag it to the learner, and pause the recheck until a remediation step is logged. No infinite loops.
- `expired`: every CP linked to the concept is deferred or skipped, or the project is archived. This is restorable: it reopens if those CPs are restored.
- `converted`: the learner or tutor turns it into a card proposal.

**Prompts.** Each recheck stores a concrete prompt aimed at its level. A generic "recheck CPn" is invalid; validation rejects prompts that match `^Recheck CP\d+`.

## 8. Daily scheduler

The scheduler is pure. Inputs: facts plus the local study day. Output: the queue and the feasibility result. It runs on `resume`, `end_session`, and any write that changes its inputs. The output is cached with `computed_at` and an input hash.

### 8.1 Today's queue

1. `available = capacity(today) − used_today`.
2. **Review budget:** `R = min(estimated minutes of due reviews, review_share × capacity(today))`.
   - `review_share` default 0.25, floor 0.10.
   - Reconcile with the existing `settings.review_budget` (`cards`: 20, `minutes`: 20); `minutes` is a floor, not a cap.
   - Reviews are due rechecks plus due cards.
   - Order by `priority = (1 − R_retrievability) × importance × (prereq_of_todays_cp ? 2 : 1)`.
   - Interleave: no two consecutive items on the same concept class, and alternate systems where possible.
   - Rechecks whose concept is a prerequisite of today's CP are **mandatory before that CP**, even beyond R.
   - Overflow is spread over the next 3 study days, never piled onto one day.
3. **Learning budget** `L = available − R`. Fill it in prerequisite order with the current CP's remaining steps, then the next available CPs, working at step level. A CP may span days.
4. Output an ordered list of `{type, ref, est_minutes, reason_code}`. Items beyond `available` go into an "if time permits" tail.

### 8.2 Estimates and pace

- `est_remaining(cp)`:
  - if a test-out is likely (§9.3), use `test_out_minutes` (default 15);
  - otherwise `estimate_minutes × (1 − completed_step_fraction)`.
- `pace_factor(project)`: an EWMA (α = 0.3) of `actual / estimated` over completed CPs, clamped to [0.5, 3]. It stays at 1.0 until there are at least 3 samples.
  - Actual minutes come from `study_entries` linked to the CP. Otherwise apportion `sessions.minutes` by each CP's share of the session's events.
- Missing estimate: a default by kind (`learn`: stage minutes ÷ learn CPs in the stage, else 60; `cards`: 20; `milestone`: 30), flagged `uncalibrated` until calibrated.

### 8.3 Feasibility

```
supply   = Σ_{d = today .. last_study_on} capacity_share(project, d) − used_today − buffer
buffer   = max(0.5 × mean daily capacity_share, 0.10 × raw supply)
required = Σ est_remaining(cp) × pace_factor   (over CPs not done/deferred/skipped)
         + projected review minutes until last_study_on (FSRS due dates × mean minutes per item;
           defaults 3 min per recheck, 0.5 min per card, recalibrated from history)
slack    = supply − required
```

- `slack < 0`: prune (§8.5).
- `slack > +0.10 × supply` on 2 consecutive study days: restore. This gap between thresholds stops items flipping back and forth.

### 8.4 Across projects

Capacity is shared.

- Allocate by earliest deadline first. Among projects with the same deadline, give more to the project with the lower slack ratio.
- Explicit project weights, if set, override this.
- If more than one project would need core material cut, **ask the learner which project gets priority**; never decide it.
- Projects with no plan or no sessions still reserve their share, so the problem is visible early.

### 8.5 Pruning order

Apply each step in turn and recompute slack after each one; stop as soon as `slack ≥ 0`.

1. Venture steps.
2. Venture CPs.
3. **Compress** standard CPs whose test-out is likely (§9.3) to a test-out item.
4. Standard steps.
5. Standard CPs. Order by lowest `value/minute`, where `value = tier_weight × (1 + dependents) × exam_weight` (venture 1, standard 3, core 9). Ties go to the later CP first.
6. Lower `review_share` toward its floor.
7. Shrink the buffer toward its minimum.
8. Core: **never automatic.** Produce an "at risk" list with three choices for the learner: extend the deadline, add capacity, or cut named items.

Constraints:

- Never prune a CP that a kept CP depends on. The alternative is a "prerequisite summary" step of about 15 minutes.
- Never prune done, in-progress or pinned items. For a partly done CP, only its remaining steps can be pruned.
- A project preference `auto_prune_standard bool` (migrated from D543's "student requested skipping material") lets steps 4 and 5 run without a proposal. Otherwise they are proposals.
- Give one notification per pruning run, not one per item. Restoring runs in exactly the reverse order.

### 8.6 Absences and interruptions

- **Missed days:** nothing piles up. Each day is recomputed from what's left; "overdue" is used only for reporting against the baseline.
- **Absence of more than 3 study days:** the next session starts with a re-entry probe of at most 3 items on the current CP's prerequisite concepts.
- **Session not ended:** auto-close after 12 h with `state='abandoned'`. Its evidence counts, but it generates no T3 rechecks.
- **Deadline is today:** only reviews and buffer items, plus pinned items.
- **Deadline has passed:** post-deadline mode, nothing is due. Ask for a new deadline or archive the project.
- **Zero capacity on every remaining day:** report infeasible immediately and ask.

## 9. Proficiency model

### 9.1 Evidence

New table `evidence`, append-only with void/supersede like `session_events`:

```
id, user_id, occurred_at, session_id, session_event_id (provenance, nullable for migration/user),
project_id, checkpoint_id, concept_id, level, role ('primary'|'secondary'|'used'),
outcome ('pass'|'partial'|'fail'), hint_level 0..4,
novelty ('novel'|'familiar'|'seen_solution'|'self_reported'),
item_id nullable, origin ('tutor'|'scribe'|'migration'|'user'), confidence real (1.0 unless scribe-inferred),
ctx jsonb {minutes_into_session, local_hour}, weight real (computed, stored for audit), voided_at, superseded_by
```

### 9.2 Updating proficiency

- Keep a `Beta(α, β)` per (concept class, level). Prior: Beta(1, 1).
- Optional prior from the parent system's mean with one pseudo-observation, behind a config switch, off by default.
- **Weight on α for a pass:**
  - by hint level: 0 → 1.0, 1 → 0.7, 2 → 0.4, 3 → 0.2, 4 → 0.0 (counts as exposure only).
  - multiplied by novelty: `novel` 1.0, `familiar` 0.5, `seen_solution` 0.2; `self_reported` is a flat 0.2.
  - multiplied by `confidence`, then by role: `primary` 1.0, `secondary` 0.5, `used` 0.3, and `used` contributes to the `use` level only.
- **Fail:** weight 1.0 on β, scaled the same way by role and confidence.
- **Partial:** half of the pass weight on α and 0.5 on β.
- **Fatigue:** if `minutes_into_session > 150`, or the local hour is outside the planning window, multiply the β weight by 0.7.
- **Implications between levels**, applied as extra pass weight, downward only:
  - an `understand` pass adds ×0.5 to `recall`,
  - a `transfer` pass adds ×0.7 to `use`,
  - a `use` pass adds ×0.3 to `recall`.
  - Nothing implies upward. In particular, `use` never implies `understand`.
- **Repeats:** the same item fingerprint within 30 days counts as `familiar`, whatever subject or project it appears in.
- **Forgetting:**
  - `R` comes from the (class, level) FSRS memory state, if one exists (from rechecks); otherwise R = 1.
  - `mean_eff = R·mean + (1 − R)·0.5`.
  - `n_eff = α + β − 2`.
- **Recomputation:** proficiency is a derived cache, recomputable from `evidence` in a single pass. Undo of any evidence row triggers recomputation for the affected classes (I7).

### 9.3 Predicted success and checkpoint modes

- **Predicted success:** `p(item) = σ(logit(mean_eff) − b_item)`, the minimum over the item's primary concepts. `b_item` is in logits (§10).
- **Fast-track (test-out):**
  - Conditions: `p(criterion item) ≥ 0.85` and `n_eff ≥ 2` at the criterion level on the CP's primary concepts.
  - Pose a **novel** criterion item. If it passes with hint 0, the CP is demonstrated, plus one stretch item. A recheck is scheduled at the first FSRS interval, because test-out evidence is thinner.
  - **Core CPs** also need `understand` evidence on their star concept (`mean_eff ≥ 0.7`, `n_eff ≥ 1`) before a test-out counts.
- **Scrutiny:**
  - Triggers: 2 fails, or `hint_level ≥ 3`, on the same concept in a session, or `p(criterion) < 0.5` at the CP's start.
  - Go back through `prereq` links, at most 2 deep. Probe the concept with the lowest `mean_eff − 1/√(n_eff + 1)` first.
  - Insert a remediation step: logged and local to the session, not a plan change.
- **Normal:** everything else.
- **Asymmetry and hysteresis:**
  - Moving up a mode needs 2 consecutive consistent signals plus the thresholds above.
  - Moving down needs 2 signals as well.
  - The thresholds are configurable.

### 9.4 Load-bearing but unexamined

Flag a concept class when `used_count ≥ 5` and `understand.n_eff < 1`. Flagged classes get priority in item selection (value ×2) and a self-explanation probe: why each hypothesis is needed, where it is used, or a counterexample when a hypothesis is dropped.

### 9.5 Assumptions

The tutor may assume a concept, recorded in a new table `assumptions(concept_id, level, mean_at, n_eff_at, reason, created_at, revoked_at, revoke_evidence_id)`. A gap or fail on that class later revokes it, which triggers T5 and a depth item. Assumptions appear on node cards.

## 10. Items: every subject, with or without an exercise bank

Subjects are learned differently. **Never assume a bank exists.**

### 10.1 Learning-mode profile per project

New `projects.learning_profile jsonb`: weights over `prove`, `solve`, `compute`, `recall`, `explain`, `read`, `construct` (examples and counterexamples), summing to 1. Draft it from the sources (do they have exercise sections, theorem density, worked examples) and have the learner approve it. The profile drives:

- the mix of probe types,
- the criterion type for new CPs,
- which levels count as core in fast-track rules (proof subjects: `understand`; computational subjects: `use` + `transfer`; reading-led subjects: `recall` + `understand` through explanation).

### 10.2 Item origins

New table `items`:

```
id, user_id, origin ('source_exercise'|'source_example'|'source_theorem'|'plan_probe'|'template'|'tutor_generated'|'past_exam'|'card'|'user_supplied'),
text, source_id, page_label, concept_tags jsonb [{concept_id, level, role}], b real, b_n int, has_reference_solution bool,
fingerprint text, teaches bool, holdout bool, status ('active'|'needs_transcription'|'retired'), created_by ('curator'|'tutor'|'migration'|'user')
```

- **The bank fills lazily.** Items are created when:
  1. the curator extracts exercises for CPs due in the next 3 study days, from that CP's `checkpoint_sources` pages only, never a whole book;
  2. the tutor uses a novel item, registered through the evidence write (text → fingerprint);
  3. the learner supplies one;
  4. migration converts existing plan probes.
- **Templates:** generic probes per level, instantiated per concept with no stored bank:
  - recall: "state X with all hypotheses",
  - understand: "why is hypothesis H needed / counterexample without H / prove the key lemma",
  - use: "apply X to …",
  - transfer: "apply X in setting Y from another subject".
  - These guarantee there is always something to ask.
- **Teaching exercises:** items whose `teaches=true` introduce new content (common in Munkres-style books, where results are proved in the exercises). Evidence on them is **first exposure**, not proof of prior mastery: α weight ×0.5 on the first attempt.
- **Reference solutions:** if `has_reference_solution`, the tutor may compare against it after the attempt. It is never shown before the attempt.
- **Hold-out:** `past_exam` items default to `holdout=true`, reserved for readiness checks and calibration, and kept out of practice until a readiness check.
- **Untranscribed pages:** pages with no text get `status='needs_transcription'` and are skipped. The learner is told once.

### 10.3 Difficulty

- `b` is in logits.
- The prior comes from an estimate of 1–5, mapped to −2, −1, 0, +1, +2. Defaults by origin: template recall −1, template understand +0.5, source exercise 0, past exam +0.5.
- Online update after each attempt: an Elo-style step with `K = 0.4/√(1 + b_n)`.
- Items with `b_n < 3` are `uncalibrated` and weigh less in calibration statistics.

### 10.4 Choosing the next item

- Target `p* = 0.85` within the band [0.70, 0.90].
- `score = value(class) × (1 − |p − p*| / 0.15)`, where `value = tier_weight × (1 + prereq_of_next_cp) × (1 − mean_eff) × (LBU ? 2 : 1)`.
- If no candidate is in the band, the tutor generates one aimed at p\*, declaring an estimated `b`. If that isn't possible, use a template. **Never block.**
- New material may be practised in blocks within a CP. Reviews and rechecks are always interleaved (§8.1).

## 11. Atlas memory and node visits

### 11.1 Layers per concept class

1. **Node card** (derived, ≤ 100 tokens), in a fixed compact format, for example:
   `C:compactness R.82±.08 Us.90±.05 Un.35±.30 T- gaps:[fin-subcover-quantifiers] assume:[] seen:2026-11-16 flags:[LBU]`
2. **Digest** (≤ 300 tokens): one line per episode, newest first, each ending with provenance ids, for example `S7 proved X, hint2, gap: quantifier order [ev:812,813]`. Stored in `node_digests(concept_id, lines jsonb, rebuilt_at, watermark)`. Rebuilt from evidence only (I10).
3. **Raw log:** `evidence`, `session_events` and source pages. Fetched only by id.

### 11.2 Tutor access

`get(what=node, id=<concept slug|id>, depth='card'|'digest'|'raw', trail=bool)`:

- `trail=true` adds the cards of prerequisites and dependents one step out, plus their last 2 digest lines.
- Budgets: card ≤ 100 tokens, trail ≤ 600, digest ≤ 300, raw ≤ 1500 per call (paged).
- The Atlas hierarchy is the summarisation tree: `system` nodes carry a roll-up card of their planets. The tutor works at system level and drills down only when a gap points there.

## 12. Worker pipeline (small models)

- **Model config:** default `claude-haiku-5-5`. Use the Batch API for nightly jobs, prompt caching for fixed worker system prompts, and strict JSON-schema outputs.
- **Where they run:** decide in Phase 0 (Supabase Edge Functions + `pg_cron`, or the MCP server process). Keep secrets in Supabase secrets.
- **Every job:**
  - idempotent per `(job, input_id)`, with watermarks (process only rows after the last processed id);
  - transactional writes;
  - one retry on failure, then the job is logged as failed;
  - a kill switch;
  - a per-day token cap (default 200k input tokens per user, configurable);
  - telemetry in `worker_runs(job, model, input_tokens, output_tokens, cached_tokens, status, watermark_from, watermark_to, error, started_at, ended_at)`.

| Job | When | Input | Output | Rules |
|---|---|---|---|---|
| **Scribe** | session end or abandon | that session's `session_events` after the watermark; candidate concepts = the CP's `checkpoint_concepts`, their prereqs/children, and the top 20 subject concepts by text match | per event: `{event_id, concept_id ∈ candidates, level, role, novelty, item_text?, confidence}` → `evidence` rows with `origin='scribe'` | Never sets or changes `outcome` or `hint_level` (copied from the event). An unknown concept goes to `unresolved` and is never invented. Tutor-supplied tags (§13.3) win, and the scribe skips those events. |
| **Gardener** | nightly | classes touched since the watermark | rebuilt digests; `same_as` proposals; LBU flags; checks (evidence without a concept, orphan rechecks, assumptions to revoke) | Mostly SQL; the LLM writes only digest text and alias proposals. `same_as` is automatic only for an exact normalised name match under the same-named parent topic (undoable); otherwise it goes through the existing proposal flow. |
| **Curator** | nightly, plus on demand when a CP becomes current | `checkpoint_sources` pages for CPs due in the next 3 study days | `items` with page labels, concept tags from candidates, `b` prior, `has_reference_solution`, `teaches` | At most 15 pages per run. Skips untranscribed pages. Fingerprint dedup across sources. |
| **Briefer** | `resume` / `start_session` | caches | brief | **Plain code by default.** The LLM is used only to compress digests that exceed the budget. |

Weekly, the large model audits a 5% sample of scribe output (at least 10 events). If disagreement is above 15%, raise a flag and reduce the weight of `confidence` for scribe evidence until it is fixed.

## 13. Tutor-facing contract changes

### 13.1 `resume` output

Fixed order: `OWNER`, `RULES` (≤ 10 lines), `TIME`, `QUEUE` (top 8 items, then "+N more"), `BRIEF` (node cards for today's CP concepts and mandatory rechecks), `FLAGS` (LBU, escalations, at-risk core, infeasible), `NEXT`.

- Budget: ≤ 1500 tokens, excluding OWNER. Add a test.
- **Remove** WARM questions built from the last session's recheck prompt. Warm-up = due items in `QUEUE`, possibly none.
- Remove every forecast or pace number.

### 13.2 `end_session`

- Drop the required generic "recheck prompt".
- Keep the three recall questions. Their failures create T3 rechecks automatically.
- `summary` is lint-checked against I2.

### 13.3 `save_progress` events

Add optional fields: `concept` (slug/id), `level`, `role`, `novelty`, `item` (id or text). When present, write `evidence` directly with `origin='tutor'` and `confidence=1`. When absent, the scribe infers them later. Keep the existing event kinds (`pretest`, `attempt`, `hint`, `explanation`, `evidence`, `recheck`, `misconception`, `note`) and outcomes (`demonstrated`, `partial`, `failed`). Map `demonstrated` → `pass`, `failed` → `fail`.

### 13.4 New `get` values

`time`, `queue`, `node`, `forecast` (labelled estimate, on request only), `feasibility`.

### 13.5 Protocol text

Update the MCP server instructions and the tutor protocol so they match:

- the TIME block is the only source of dates;
- rechecks come only from evidence;
- stage-end card steps draft cards; review happens through the queue;
- log `concept` and `level` on evidence where obvious;
- use `get(what=node)` before teaching a concept that has history.

## 14. Migration (dry-run first, idempotent, reversible)

0. **Snapshot** all user tables (export). Record row counts and checksums.
1. **Time facts.**
   - Per project: `deadline_at` and `last_study_on` (from §15 answers; until answered, `last_study_on = target_date` with `needs_confirmation=true`).
   - Capacity from §15. The topology-1 prompt states about 240 min/day; propose it, don't assume it.
   - `first_session_on` is derived.
2. **Free-text cleanup (proposal + diff, learner approves):**
   - Remove "(10-19 Nov 2026, ~4 h/day)" and "Track pace vs the 10-day plan" from the topology-1 `projects.prompt`.
   - Neutralise `target_label` values that contain day counts ("10-day deep pass", "7-day plan", "Algebra I in 10 days", "7-day intensive").
   - Lint every remaining free-text field for I2.
3. **Diagnostics:**
   - Void the derived claims in D543 ("~30 days behind plan") and in the other `pace` diagnostic ("scheduled for 10 Nov…").
   - Convert "student requested skipping material" into `projects.auto_prune_standard=true` for topology-1, recorded as a fact with provenance.
   - `strength` diagnostics create no rechecks.
   - `gap` diagnostics ("totality of maps in examples") become T1 rechecks with a concrete prompt.
4. **Baselines:** v0 from plan revisions if they can be reconstructed, v1 from the current `due_on`.
5. **Checkpoint typing and tiers:** `Cards K…` → `kind='cards'`; "Venture:" steps → venture; the tier draft goes to the learner for approval.
6. **Estimates:** stage capacity ÷ CPs in the stage (cards CPs fixed at 20 min). Calibrate `pace_factor` from the demonstrated CPs' actual minutes (topology-1 CP1–CP3, algebra-1 CP1–CP3).
7. **Existing recheck fields:**
   - On **demonstrated** CPs with a generic prompt matching `^Recheck CP\d+` and no gap, partial, hint ≥ 2 or misconception evidence on their concepts: **drop** (no recheck). This removes the loop for topology-1 CP1–CP3.
   - On demonstrated CPs with real evidence of a gap (for example algebra-1 CP1: `recheck_level=1`, `needs_revisit=true`, a concrete prompt, and the open gap diagnostic): create a recheck per (concept, level), with FSRS state seeded from `recheck_level` and the last outcome.
   - On **not-started** CPs, `recheck_prompt` holds real criterion-style problems (for example topology-1 CP9 "Prove that a continuous bijection from a compact space to a Hausdorff space is a homeomorphism"). Convert these to `items` with `origin='plan_probe'`, tagged with the CP's concepts and usable as test-out or criterion items. **They are not rechecks.**
8. **Evidence backfill:**
   - Create `evidence` from all non-voided `session_events` with gradable kinds (`pretest`, `attempt`, `evidence`, `recheck`, `explanation`).
   - Concepts come from `checkpoint_concepts` (at most 4 per CP). If there is exactly one candidate, use it directly. Otherwise the scribe runs with candidates and confidence.
   - Mark `origin='migration'`.
   - `misconceptions` rows (which have `concept_id`) become evidence plus T4 checks, but only for unresolved rows.
9. **Concept classes:** run the gardener's alias pass across the 3 subjects (complex-analysis and analysis-1-probability share a subject). Exact matches are linked automatically; the rest become proposals.
10. **Learning profiles:** a draft from the sources (`topologynotescomp` + `topologymunkres1`, `algebraicompleten` + `langalgebrapart01`, `complexanalysisco` + `steinandshakarchi`, `completedprobabil` + `measuresintegrals`) goes to the learner for approval.
11. **Switch-over, per flag:** stop writing the deprecated recheck columns; `resume` emits TIME/QUEUE/BRIEF; WARM is removed.
12. **Shadow run** for 2 study days: compute queues and feasibility without exposing them; diff against actual sessions; then go live after the learner says yes.

**Validation queries.** All must pass before switch-over:

- every CP has `kind`, `tier`, `estimate_minutes`;
- no open recheck has a generic prompt or a missing concept;
- no free text matches the date, pace or hours lint;
- evidence count ≥ gradable event count, where unresolved ones are listed and not dropped;
- proficiency recomputed from scratch equals the incremental cache;
- `resume` is within budget for all 4 projects.

## 15. Open questions: ask before building the parts they affect

1. For each of the 4 projects, is 2026-11-20 the exam day, the last study day, or both? What time is the exam?
2. Total daily study capacity, and the split between projects (or confirm earliest-deadline-first)?
3. Approve the drafted tiers per project; which items should be pinned?
4. Worker model(s), API key handling, and a monthly token budget cap?
5. Where should workers run: Edge Functions + `pg_cron`, or the MCP server process?
6. Are session transcripts stored anywhere? If not, the scribe works only on `session_events`. Is adding transcript storage acceptable (privacy, size)?
7. Approve the learning-mode profile per project.
8. Policy for merging concepts across subjects: auto-link exact matches only (default), or always propose?
9. Are past exam papers available to upload as hold-out items?
10. Should "Cards K…" checkpoints stay as checkpoints (default, following the topology-1 rules) or become stage-end steps?

## 16. Edge cases: each needs a test

**Time**

- A session crossing midnight belongs to the study day of `started_at`.
- A session started at 01:00 belongs to the previous day (rollover 04:00).
- Timezone change while travelling: past days keep their recorded timezone.
- The deadline is today; the deadline has passed; `last_study_on` < today < `deadline_at`.
- Capacity is 0 today; capacity is 0 on every remaining day.
- A calendar busy block covers the whole window.

**Plan**

- A CP is completed out of order: prerequisites block starting, not completing.
- A done CP is reopened: its evidence, cards and rechecks remain.
- New sources are added mid-plan: new CPs default to `standard`, get an estimate, and trigger a feasibility check. Baselines are unchanged unless a re-date is approved.
- A CP has no concepts; a concept has no CP.
- A prerequisite cycle is introduced: reject it at write time.
- A `cards` CP whose stage is fully deferred.
- A project with no plan; an archived project.

**Rechecks**

- A trigger fires while a recheck is already open: merge.
- A recheck is due on a day with no session.
- FSRS would schedule past the deadline.
- 4 fails: escalate.
- The concept's CP is deferred, then restored: expire, then reopen.
- The same concept in two projects: one recheck, scheduled under the nearer deadline.
- An undo of the evidence that created a recheck: delete the recheck if it has no other origins.

**Proficiency**

- No evidence: prior only.
- Only scribe evidence, low confidence.
- The same item repeated across subjects: counts as familiar.
- Use-heavy with no understand evidence: LBU flag.
- An assumption is revoked.
- Late-session fails: fatigue weighting.
- Self-reported "I know this": a 2-item check or the flat self-reported weight.

**Items**

- A subject with no exercises anywhere: templates plus tutor-generated items only.
- Exercises only in the book and not in the notes.
- Untranscribed (handwritten) pages.
- An exercise that teaches new content.
- An item with a reference solution.
- A hold-out past exam.
- No item within the target band: generate, else template.

**Scheduler**

- Overflow from a review backlog after a 10-day absence.
- Pruning would cut core in two projects: ask.
- Slack oscillating around 0: hysteresis holds.
- Pinned items exceed capacity: infeasible, ask.
- A partly done CP is pruned: only its remaining steps.

**Concurrency and undo**

- The app and the tutor write at the same time: version conflicts are handled.
- Undo and redo of evidence, a tier change, a deferral, an alias link.
- A scheduler run during a migration step: blocked by a lock.

**Workers**

- A failed job; partial output; a token cap is hit; a model returns a concept not in the candidate list; a duplicate run; a watermark gap.

## 17. Acceptance criteria

1. With fixtures copied from the 2026-11-17 production data, `resume(topology-1)` shows `deadline=2026-11-20`, the correct `study_days_left`, and no other date-like token that isn't derived from facts.
2. Demonstrating a CP with clean, hint-0 evidence creates **zero** rechecks. Demonstrating it after a fixed gap creates exactly one per (class, level), due ≥ the next local study day.
3. The scheduler produces byte-identical output across 2 runs and across app and tutor callers (snapshot test).
4. Undoing any evidence row restores the proficiency cache, queue and recheck set to exactly their prior state.
5. With the topology-1 fixture, feasibility is negative. The pruning proposal never contains core, pinned, done or in-progress items, or a prerequisite of a kept CP.
6. After migration, the I2 lint finds nothing in any free-text field.
7. `resume` is ≤ 1500 tokens (excluding OWNER) for every project. `get(what=node, depth=card)` is ≤ 100 tokens.
8. The scribe never writes a concept outside its candidate list, and never changes an outcome (property test with a mocked model).
9. `get(what=resources)` lists every resource without error.
10. The app works unchanged with every flag off, and with each flag turned on in order.

## 18. Phase plan and deliverables

| Phase | Scope | Fixes |
|---|---|---|
| 0 | Discovery report: code map (MCP server, `resume`/WARM source, end_session recheck write path, app reads of recheck fields, export/snapshot path, undo registry), schema notes, the §7 storage decision, worker hosting decision, answers to §15, risks | (plan only) |
| 1 | Time model + TIME block + I2 lint + diagnostics cleanup + the resources bug | date misquoting |
| 2 | Evidence table + recheck v2 + migration steps 7–8 | the loop |
| 3 | Checkpoint kind/tier/estimate, baselines, scheduler, feasibility, pruning, multi-project | deadlines |
| 4 | Proficiency, modes, assumptions, LBU, items, learning profiles | adaptive pace |
| 5 | Atlas layers, `get(what=node)`, workers, briefs | tokens and memory |
| 6 | Calibration loop: Brier score and calibration buckets of predicted p vs outcome, item `b` recalibration, scribe audit, weekly report | model drift |

At the end of each phase, deliver: migration files (up and down), tests that pass, a short changelog, before/after `resume` output for all 4 projects, and token measurements.
