# 02 Schema (additive)

Every fact table gets:
- RLS `user_id = auth.uid()`, plus `version`, `created_at`, `updated_at`, `updated_source` (app | mcp | worker);
- `revoke insert, update, delete, truncate` from anon and authenticated (writes go through service-role functions);
- an entry in `lemma_undo_tables`, and in `lemma_command_resources` where the tutor or app edits it.

## New fact tables
**attempts.** Append-only, with void and supersede as on `evidence`.
- `id` bigint identity, `user_id`, `occurred_at`, `session_id`, `session_event_id`, `project_id`, `checkpoint_id`, `item_id`.
- `item_kind` check: practice | stretch | prepare | select | micro | recall | recheck | retry | holdout | legacy.
- `cued` uuid[] default '{}'.
- `context` jsonb: {subject_id, system_id, merged:[evidence ids]}.
- `confidence_before` real null, 0..1.
- `minutes` real null.
- `furthest_stage` null | U | S | E | C | done.
- `legacy_outcome` null | pass | partial | fail.
- `plan_score` smallint null, 0..3.
- `grader`: tutor | learner | migration.
- `origin`: tutor | scribe | migration | user.
- `weight` real default 1, 0..1.
- `voided_at`, `superseded_by`.

**attempt_tags**
- `id`, `user_id`, `attempt_id` FK cascade, `concept_id` FK.
- `facet` check: recall | understand | use | select | execute | recognise | construct | transfer | perform.
- `role`: target | required | incidental.
- `stage`: null | U | S | E | C.
- `result`: null | ok | fail | not_reached.
- `hint_level` 0..4.
- `demand`: −1 | 0.
- `error_tag`: null | misread_definition | quantifier_order | unjustified_step | missing_case | wrong_approach | slip.
- `confidence` real default 1 (scribe tags < 1).
- Unique (attempt_id, concept_id, facet, stage).

**instruction_events**
- `id`, `user_id`, `occurred_at`, `session_id`, `concept_id`, `origin` (tutor | migration).

**atlas_links**
- `id` uuid, `user_id`, `from_id`, `to_id`.
- `kind`: equivalent | generalises | instance_of | uses_technique | contrasts | analogous | part_of.
- `status`: proposed | approved | rejected.
- `origin`: auto | worker | tutor | user.
- `confidence` real, `rationale` text ≤ 200, `from_hash`, `to_hash` (name+blurb hash; a change re-opens a rejected pair).
- Unique (user_id, from_id, to_id, kind); check from_id <> to_id.

## New columns
- `concepts.kind` text not null default 'topic': topic | definition | result | example | technique | heuristic | control | theme | notation.
- `concepts.family_id` uuid null: skill family (self FK).
- `items.cued` uuid[] default '{}'; `items.item_kind`; `items.b_sd` real default 0.7; `items.est_minutes` int null.
- `settings.atlas` jsonb default {threshold_p 0.85, stretch_share 0.2, plan_first_min 10, ask_confidence true, card_quota_share 0.5, card_cap 0.125, card_weight 0.4}.
- **Template and cards (11):**
  - `checkpoints.template` jsonb null: {prepare, practice[], criterion, stretch, close, card_plan[]}, validated against `plan_template_v1`;
  - `items.checkpoint_id` uuid null (the criterion item is item_kind holdout);
  - `notes.facet` text null: recall | understand | select;
  - `notes.kind` check gains `skeleton` and `technique`.
- **Scheduler (10):** `scheduler_runs.p_all`, `p_core` real null; `projects.share_weight` real null.
- **Conversion (12):** `proposals.kind` and `proposal_drafts.kind` accept `plan_conversion`; `checkpoints.kind` stops accepting new `cards` rows in `propose_plan` (existing rows stay valid).
- Widening a check constraint keeps every existing row valid, so it counts as additive.

## Derived (select-only, not undoable)
- `model_fits`: id, user_id, input_hash, fitted_at, params jsonb {pfa, card_w, pi_H, mix_w}, scores jsonb {per stream: logloss, baseline, a, b, z[], pit_p, n}.
- **Facts the information model reads that already exist:** timer intervals, study entries, calendar blocks (planned, moved, skipped), card reviews. No new fact tables.
- Posteriors, cards, profiles, link strengths and the prediction log are computed on read.
- So are duration and attendance states, P_all/P_core and the card quota (01 §8, 10, 11). Add `atlas_cache(input_hash, payload)` only if the perf test fails.

## Frozen after cutover
`evidence`: no writes, kept for audit. `items.b` and `b_n` are kept, and b is updated as a component.

## Removed code paths (no schema drop)
- Beta proficiency, `calibrationPairs`, Elo `updateB`.
- `settings.flags.proficiency` and `atlas_memory` are ignored.

## Rollback
`supabase/rollback/N17x.down.sql` drops the new tables and columns. Tested up → down → up in PGlite.
