# 03 One-shot migration and cutover

No transition: one run moves the data, and the next deploy switches every reader and writer.

## RPC `atlas_v2_migrate(p jsonb)`
- Runs as service role; dry_run defaults to true.
- Idempotent: keyed by source ids.
- One journalled action per step, so each step can be undone.
- Returns counts, a diff, and an unresolved list.

## Steps
0. **Snapshot.** Write an `owner_export_snapshots` row with per-table counts and sha256 (same as N169 step 0).
1. **Kinds.** `concepts.kind` = 'topic' by default; no row updates.
2. **evidence → attempts + attempt_tags.**
   - Source: `evidence` where `voided_at` is null.
   - **Merge:** rows with the same (second, concept_id, level, outcome) become one attempt. Keep the lowest id; list the others in `context.merged`.
   - **item_kind by `evidence.kind`:** pretest → prepare; attempt, evidence, explanation → legacy; recheck → recheck; recall → recall.
   - **Attempt fields:**
     - `legacy_outcome` = outcome; `grader` = migration; `origin` = migration.
     - `weight` = confidence × novelty factor (01 §4).
   - **Tag:** concept_id; facet = level; role: primary → target, secondary → required, used → incidental; hint_level copied; stage null.
   - `concept_id` null → an attempt with no tag, listed as unresolved.
3. **Implied instruction events.** For each (session, concept), add one at the first non-pretest row that follows a pretest (origin migration).
4. **Assumptions:** no rows. They are read as two-state priors (01 §6).
5. **Fit.** Run the nightly fit (PFA refit, diagnostics D1–D5) and write a `model_fits` row.
6. **Recompute** posteriors, cards, rechecks and the calibration log. Store the report.
7. **Model state** (01, 10). Replay all facts through the information model:
   - the Kalman duration state from completed CPs;
   - attendance from study entries (9 today, so the priors dominate);
   - KC memory from attempts, starting at the first instruction or first attempt.
   - `pace_factor` is no longer read. Open N169 rechecks are kept and deduplicated under 10 §6.
8. **Course conversion** (12). One LLM pass per project → one `plan_conversion` proposal each → Owner approval.
9. **Cutover deploy.**
   - MCP and app read v2; scheduler v2 replaces the N169 decisions.
   - `save_progress` writes attempts; `propose_plan` validates against the template.
   - Old code paths are deleted.
   - `evidence` is frozen.

## Expected on production today
| | Count |
|---|---|
| evidence (non-voided) | 146 |
| attempts | 134: 110 tagged, 24 untagged |
| merged rows | 12 |
| implied instruction events | 7 |
| concepts → topic | 400 |
| links / items | unchanged / 0 |
| conversion proposals | 4 (one per project) |

## Gate before step 9 (all must pass)
- attempts + merged = 146.
- Every tag has a valid concept, and its facet is valid for the kind.
- Replay run twice gives byte-identical output.
- No NaN or Inf in any posterior.
- `resume` ≤ 1,500 tokens and every card ≤ 100 for all 4 projects.
- Calibration report exists.
- P_all and P_core are finite for all 4 projects.
- Every project has an approved conversion, or the Owner has flagged it to stay as is.
- No reviewed card is deleted and no done CP changes status (12 hard rules).
- The Owner approves the dry-run diff.

## Rollback
- Undo each conversion approval (one action per project), then run `N17x.down.sql` and redeploy the previous app.
- `evidence` is untouched, so N170 behaviour returns.
- Attempts written after cutover would be lost, so export them first (`get(what=export, id=attempts)`).
