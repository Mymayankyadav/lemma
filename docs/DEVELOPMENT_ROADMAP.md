# Lemma delivery roadmap (living plan)

**Purpose:** One portable mathematics learning environment for web (GitHub Pages) and Android (Capacitor), Supabase-backed and usable with Claude, ChatGPT or another model. The user can study, prove, forget, review and continue without losing intellectual state when a model quota runs out.

**Plan governance:** This engineering roadmap is a versioned artifact. Product behavior for strong-model planning sessions is defined in [STUDY_PLANNING_PROTOCOL.md](STUDY_PLANNING_PROTOCOL.md); [ROADMAP_AMENDMENTS.md](ROADMAP_AMENDMENTS.md) records decisions that supersede earlier text. Update this document as phases actually ship, rather than claiming completion based on a design or a successful SQL migration.

## Core rules
- Protect existing mathematical flashcard functionality: FSRS-6, proof-step cards, KaTeX/Markdown, prerequisite graphs and IndexedDB offline data.
- Keep one source tree for web and Android, bundled into Capacitor, with reproducible GitHub Actions builds.
- Supabase is the authenticated canonical sync target; device-side writes require a durable local outbox.
- Review events, proof attempts and tutor feedback are append-only, idempotent records. Do not silently overwrite human work.
- Personal documents are private; source citations are stable and material retrieval is narrow.
- Never use a service-role key in the browser, Android application or publicly exposed chatbot connector.
- Never mark a learning checkpoint mastered solely because a lesson was displayed or a model says it was covered.
- Significant study-plan changes require versioned, reviewable amendments preserving valid checkpoints.
- Treat backend database migrations, application behavior, and cross-model connector capability as distinct milestones.

## Phase 0 — Existing-source assessment [DONE]
**Scope:** Audit source ZIP, reusable app modules, IndexedDB storage, FSRS, rendering, import/export, tests.

**Evidence:** Phase-1 package prepared locally; inspected existing source.

**Gate:** A written baseline of what can be reused and what is still missing.

## Phase 1 — Deployable app foundation [SOURCE PREPARED; NOT MERGED]
**Tasks**
1. Import and review Phase-1 source ZIP into GitHub.
2. Install pinned dependencies and commit lockfile.
3. Build single HTML application and PWA shell without CDN dependency for essential libraries.
4. Configure GitHub Pages build, subpath routing and offline smoke tests.
5. Generate Capacitor Android project, commit Android scaffolding, verify physical-device install.

**Gate:** App is reachable through GitHub Pages, review functionality works offline, Android app opens, previous card data can be imported. Tests pass in browser and Android. **No cloud-sync claim yet.**

## Phase 2 — Authenticated Supabase data and safe sync [FOUNDATION IN PROGRESS]
**Done**
- Separate Lemma Supabase project: `yemqnhnztlbyxmjxidis`, Mumbai, separate from Carrel.
- Initial private tables `study_plans`, `learning_sessions`, `learning_events`, `tutor_handoffs`.
- Versioned study-planning tables `study_context_files`, `study_plan_versions`, `study_checkpoints`.
- Owner-scoped RLS enabled; security advisor returned no findings. Two deployed migrations are tracked in `supabase/migrations/`.

**Not done**
1. Design and deploy complete flashcard, card-content and immutable review-event schema.
2. Implement authentication and per-account IndexedDB namespaces.
3. Implement an atomic offline outbox; show saved locally / uploading / cloud confirmed accurately.
4. Implement idempotent writes, server change cursors, realtime invalidation and reconnect delta pull.
5. Use revision checks for shared text and keep all review events before recomputing FSRS state.
6. Test cross-device simultaneous edits, offline deletes, logout/relogin and cross-user isolation.

**Gate:** No lost reviews or notes in fault-injection tests; correct due counts across two devices; RLS isolation verified by two real identities.

## Phase 3 — Planning-first mathematics study [SCHEMA ONLY]
1. Versioned context-file editor: mathematical background, desired level, goals, preferences, source locators, prior verified learning.
2. Dedicated high-effort planning-session flow using user-selected strong model; save draft first and publish after review.
3. Structured, ordered plan with prerequisite graph, stable checkpoint IDs, assessment tasks, measurable mastery criteria, and concise public rationale.
4. Checkpoint execution screen: prompt, student proof attempt, graded hints, error classification and evidential progress.
5. Versioned amendment proposal and approval UI with diff preview, conflict detection, checkpoint preservation and rollback-as-new-revision.
6. Source ingestion/retrieval from private library with exact citations, math formatting and constrained context size.

**Gate:** Student can create a 12-checkpoint plan from a curated context file; show real mastery evidence for two checkpoints; accept an amendment without losing the other checkpoints or the original plan.

## Phase 4 — Claude/ChatGPT portable tutor connector [NOT STARTED]
1. Implement a least-privilege authenticated connector/API for `get_learning_context`, `get_source_material`, `append_learning_event`, `manage_lemma_cards`, `save_tutor_handoff`.
2. Extend tools with `get_planning_context`, `get_active_checkpoint`, `propose_plan_amendment`, `accept_plan_revision`.
3. Every handoff carries `context_revision`, `plan_id`, `plan_revision`, `checkpoint_id`, current proof question, last student attempt, misconceptions, hints already used, cited references, and next Socratic action.
4. Compare-and-swap writes on active plan revisions; reject stale tutors and reconcile explicitly.
5. Maintain model-independent tutoring instructions: don't reveal full proof unless asked; seek genuine independent attempts.

**Gate:** Start an unfinished mathematical proof on Claude, continue at the same checkpoint in ChatGPT, and switch back without restating the lesson or rewriting the plan. Verify both models respect accepted revisions and pending amendments.

## Phase 5 — Adaptive learning and card integration [NOT STARTED]
- Connect checked proof attempts to mastery decisions and persistent misconceptions.
- Improve card proposals with provenance, duplicate detection, hypothesis/definition/proof-skeleton/counterexample retrieval prompts.
- Keep student review/edit approval before cards are inserted into canonical collections.
- Use real review events for FSRS state, never a last-write-wins merge of card counters.

**Gate:** Card added through either model is reviewed offline on Android and correctly appears on web without duplication or lost scheduling history.

## Phase 6 — Native Android polish [NOT STARTED]
- Material-feeling UI, adaptive insets/IME, status/navigation bar, back button, local file import.
- Optional, contextual review notifications without distracting persistent notifications.
- Correct account login/deep-link handling; resume sync on foreground; obey Android background execution limits.
- Versioned APK builds (web asset changes alone do not update bundled APK).

**Gate:** Tested APK runs offline, resumes with unsynced events, imports files, sends a due-review notification when permitted.

## Phase 7 — Reliability and release [NOT STARTED]
- Backup/export and restore; migration/rollback strategy; source provenance and user data deletion.
- Continuous browser, sync conflict, security, and Android smoke testing.
- Performance and token-efficiency metrics: quota consumed per completed checkpoint, handoff continuity success, average source-context size.
- Threat model for assistant connectors, secret handling and per-user permissions.

**Gate:** 0 lost event records in concurrency/failure tests, no cross-user leakage, source-linked plans restore cleanly, both cross-model handoff directions pass.

## Next implementation checkpoint
**Priority:** Commit prepared Phase-1 app source and validate GitHub Pages build. In parallel, design the immutable review-event ledger and safe plan-publish transaction. The initial planning tables do **not** yet enforce optimistic revision commits; this must be implemented before making live editing available.

**Model assignment for development:** Opus High (architecture, concurrency review, math tutoring spec); Sonnet High (implementation, complex testing); Sonnet Medium (routine components, docs); inexpensive model for mechanical work. The study-planning model itself remains user-selected.
