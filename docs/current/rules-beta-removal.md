## Beta proficiency model removed (Atlas v3 cutover prerequisite)

`supabase/functions/_shared/adaptive/proficiency.ts` (the Beta(α, β) model per concept class and level) and its test are deleted, as 07 Acceptance 5 requires before `atlas_v2_activate` can pass `no_beta_imports`. Nothing imports it any more; `tests/unit/adaptive/items.test.ts` checks that no source file does.

What changes for an owner who has not migrated (production today; the `proficiency` flag is off there):
- `get(what=node)` cards count live evidence per level as passes/attempts (`Us3/4`) instead of a Beta mean ± sd; recheck retrievability still shows (`~.71`). The PLANETS roll-up orders children by pass share. Digest, raw and trail are unchanged.
- `get(what=calibration)` reports no predictions until Atlas v3 is active (it said "not enough evidence" before for a new owner).
- The LBU flag line (only shown with `proficiency` on) is gone.
- `items.ts` keeps fingerprints, prior and Elo difficulty, templates and the learning profile; the Beta-based item choice (`chooseItem`, `nextItem`, `targetB`), which nothing in production called, is removed.

A migrated owner already reads node cards and calibration from Atlas v3 (`renderAtlasRead`), so the cutover path is unaffected.
