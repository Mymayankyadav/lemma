# Roadmap amendment 2026-10-26 — planning-first mathematical study

This amendment has precedence over the earlier generic “versioned study plans” description in the engineering roadmap.

**Requirement:** The student normally runs one deliberate, high-effort session with a strong model to build a *detailed* learning plan from a curated context file. They then execute that plan with any available tutor, checking off milestones only when evidence warrants it. Plans must evolve without erasing prior versions, completed work, or active proof attempts.

**New critical path:**
1. Phase 2: establish authenticated private storage, offline outbox and revision-safe sync.
2. Phase 3A: context-file editor, cited source links, plan generation and approval, stable checkpoint IDs, immutable plan revisions, mastery-evidence links.
3. Phase 3B: checkpoint-oriented study screen; tutor retrieves plan + checkpoint + latest evidence.
4. Phase 4: Claude ↔ ChatGPT bridge uses exact `plan_id/revision/checkpoint_id` and detects revision conflicts.
5. Phase 5: adaptive hints and guided proofs work *inside* the approved checkpoint; re-planning requires explicit amendment workflow.
6. Phase 6+: integrate source-linked flashcards, Android polish, stress tests and backups.

The plan must be editable when course pacing, evidence, priorities or sources change. Routine tutors may draft amendments, but changes to the approved structure are reviewable and versioned. Strong-model planning should be repeated **only when useful**, not for every session.

See [Study planning protocol](STUDY_PLANNING_PROTOCOL.md) for data contract, safety rules and acceptance tests.

**Current infrastructure:** GitHub `Mymayankyadav/lemma`; Supabase project `yemqnhnztlbyxmjxidis` in Mumbai. Four initial learning-state tables were deployed with per-user RLS. Phase 1 app source is prepared locally but not yet imported into GitHub; authentication and sync are not implemented.


## Astra audit amendment — 26 October 2026

The earlier infrastructure paragraph is historical: source and web deployment now exist. Restore missing migration history and establish local durability before enabling automatic sync. Active review/Undo now wait for local commit; account primitives are hardened but not wired into the UI. Cloud Undo requires append-only retractions and deterministic FSRS replay; snapshot restore cannot substitute for either. See `SYNC_AUDIT_2026-10-26.md` for evidence and ordered release gates. Backend note writes now require the revision RPC.
