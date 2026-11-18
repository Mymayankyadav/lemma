# 12 Legacy conversion (one LLM pass per project)

Each existing project is converted to the template (11) by one large-model run. The result is one plan proposal per project, which the Owner approves. There is no parallel old format.

## Model and run
- **Model:** Opus 5.5 in one fresh tutor chat over MCP, one pass per project; no API key needed. The output is a plan proposal, not a worker decision, so I8 holds.
- **Run:**
  1. `get(what=conversion_input, id=<project>)` returns the input below plus the fixed instructions.
  2. The model writes `plan_template_v1` JSON with `study` → `proposal_drafts` create, kind `plan_conversion`.
  3. The server checks the hard rules; submit creates one plan proposal.
- **Input:** the project header; checkpoints (code, title, objective, criterion, steps, pages, status, tier, estimate, plan_state); concepts in its subject (name, level, parent, links); existing notes/cards (front, back, reps, lapses); legacy recheck prompts and plan probes; misconceptions; page labels only, never full text.
- **Output:** template JSON plus a `map`.
  - `map`: old CP → new CP id, or "skipped" with a reason.
  - `kcs`: name, kind, home topic, family, matching existing concept_id.
  - `cards`: keep | revise (new text) | suspend | new, each with a reason.
  - `items`: criterion, practice and stretch specs.

## Hard rules (checked by code, not trusted to the model)
1. Every old CP appears in `map`. Demonstrated CPs keep their status, evidence and dates.
2. Cards with reviews are never deleted: suspend or revise only, and history stays.
3. New KCs reuse existing concept ids where names match (normalised). New nodes become concept rows with a kind.
4. Open CPs of kind `cards` ("Cards K…"): their card steps move to the close steps of that stage's CPs, and the CP gets plan_state `skipped` with reason `template:cards-in-close`. Done ones stay as history.
5. Card counts are within 11 §4 limits. Excess cards are proposed as suspend; nothing is suspended without approval.
6. Steps, the I2 lint and acyclic prerequisites are validated as in 11 §5.
7. If any rule fails: one automatic retry with the error list; then the project is flagged for the Owner.

## Order in the cutover (03)
1. Run `atlas_v2_migrate` (attempts exist).
2. Convert each of the 4 projects; create the proposals.
3. Owner approves. Each approval is one undoable action per project.
4. Recompute: refit time estimates (10 §1), then run the scheduler. Attempt tags are not changed; legacy tags stay on topic nodes.

## Fixed instructions (served with conversion_input)
- Role: convert to the template; preserve meaning; never invent sources or pages; prefer fewer cards.
- Given: template rules (11), these hard rules, the input JSON.
- Return: JSON only, schema `plan_template_v1`.
