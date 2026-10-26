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

## Phase 1 — Deployable app foundation [WEB DEPLOYED; ANDROID NOT VERIFIED]
**Tasks**
1. Import and review Phase-1 source ZIP into GitHub.
2. Install pinned dependencies and commit lockfile.
3. Build single HTML application and PWA shell without CDN dependency for essential libraries.
4. Configure GitHub Pages build, subpath routing and offline smoke tests.
5. Generate Capacitor Android project, commit Android scaffolding, verify physical-device install.

**Gate:** App is reachable through GitHub Pages, review functionality works offline, Android app opens, previous card data can be imported. Tests pass in browser and Android. **No cloud-sync claim yet.**

## Phase 2 — Authenticated Supabase data and safe sync [DURABILITY CHECKPOINT IMPLEMENTED; AUTO SYNC NOT ENABLED]

Detailed findings, implementation sequence and acceptance gates: [Sync audit](SYNC_AUDIT_2026-10-26.md).

**Completed**
- Existing web source imported; Pages build/deployment verified at the baseline. Optional magic-link login and explicit copy-missing transfer exist.
- Fourteen owner-scoped tables and revision-aware note/plan RPCs deployed. All seven applied migrations are now tracked, including four recovered missing files.
- Deployed note-write permission hardening; transactional two-identity database checks and post-change security advisor passed. No existing user rows changed.
- Active local saves are awaitable and accurately report pending/failed/saved states. Review completion and Undo await persistence, with stable review UUIDs and backup preservation.
- Prepared account adapter now has transaction-ordered sequences, atomic review staging, retry markers, monotonic remote ingestion, account-bound requests and cross-tab flush locking.
- Added IndexedDB/Store/Session tests, browser review/Undo reload coverage, and two-browser adapter tests with a fault-injected mock server; expanded CI to run the full regression suite on development branches and PRs.

**Not completed / release blockers**
1. Append-only review retractions for cloud Undo and full scheduling provenance.
2. Deterministic FSRS replay, legacy history baseline/import semantics, resets and simultaneous offline reviews.
3. Active account Store binding, profile sync, explicit anonymous enrollment and account-switch UI isolation.
4. Automatic upload/retry/pull/Realtime orchestration and reviewable content conflicts.
5. Two-device live authenticated verification, offline/reconnect fault matrix, Android lifecycle integration.

**Gate:** No lost notes/reviews under fault injection, convergent due states across devices, and no cross-account data leakage. Unit or CI success alone does not satisfy this gate.

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

**Priority:** A4 review retractions and deterministic scheduling provenance, then A5 active account-store integration. Follow the concrete sequence in [the sync audit](SYNC_AUDIT_2026-10-26.md). Do not activate automatic sync merely by wiring the current snapshot transport into `Store`: that would commit undone reviews and inconsistent FSRS state.

**Delivery status:** Development branch `astra/sync-durability` contains the browser changes. Backend note-write hardening is deployed independently. The branch is not a claim that the Pages application has those browser changes or that cloud synchronization is complete. Draft [PR #1](https://github.com/Mymayankyadav/lemma/pull/1) tracks delivery. Full [CI run 40323246207](https://github.com/Mymayankyadav/lemma/actions/runs/40323246207) passed for commit `d30cd21`; follow-up commits must pass the same suite.

**Model assignment:** Strong reasoning for concurrency/replay/security contracts; capable implementation model for UI and deterministic tests. The learning model remains user-selected.

### A4a progress (26 October 2026)
- Deployed append-only `review_retractions` with owner RLS, immutable rows, one retraction per target, and optional scheduling provenance on `review_events`.
- Added `ReviewLedger.activeEvents` for deterministic active-event filtering and tests. The account-scoped adapter now stages a retraction transactionally alongside durable outbox metadata, retains the original review, sends retries idempotently, and pulls remote retractions. This is **not** an FSRS replay engine and does not activate UI/cloud Undo. Next gate is atomic account-cache staging and crash-safe review/retraction dispatch, followed by scheduling provenance and deterministic replay.

### A4b progress — reuse the existing FSRS engine
- **No FSRS mathematics was reimplemented.** Removed redundant `ReviewLedger.replayMemory`; `ReviewLedger.fsrsInput` now validates the cloud event/retraction ledger and adapts it to the original `FSRS.replay`. This explicitly rejects missing review provenance, changed FSRS weight sets without a versioned baseline, nonmonotonic scheduling days, and ambiguous same-time timezone mapping.
- New local review log entries retain optional scheduling provenance (field 8) for FSRS-6 weights, scheduling day, rollover, timezone offset, retention, learning steps, fuzz/load-balancing settings, actual preview time, previous card state and chosen final card state from **the existing `FSRS.preview`**. Earlier six/seven-field logs remain readable but are not silently made fully replayable.
- Account review staging forwards provenance to the existing `review_events.scheduling_provenance` JSON column. A new `AccountStorage.stageUndo` stages the restored note, original-review retraction, and corresponding ordered outbox operations in one transaction; it is not wired to the live local Undo UI.
- Remote pull no longer silently overwrites immutable review/retraction IDs with contradictory payloads; JSONB object-key order is normalized for comparisons.
- **Not complete:** current-account activation, future parameter-version baselines, due-state reconciliation under offline concurrent reviews, remote conflict UI, Undo between devices, Realtime notifications, and two-device end-to-end verification. Production is not updated.

### Account enrollment and readiness checks (development branch)
- Fixed `AccountStorage.ack` so a confirmed note snapshot is **clean even when its independent immutable review remains queued**; the review operation still remains durably pending and separately retryable. Regression coverage verifies both acknowledgements.
- Added an **explicit**, user-confirmed `LemmaSync.enrollMissingLocal` operation that stages missing anonymous card snapshots in the existing per-user IndexedDB outbox (revision-zero inserts). It first requires an online account refresh, keeps the original local database, skips account tombstones and pre-existing IDs, and aborts further staging when the auth identity changes. A concurrent cloud insertion is left to the existing CAS conflict path.
- Added `AccountStorage.inspectAgainst` using the existing canonical JSON comparator to count identical, divergent, local-only, account-only, tombstoned and dirty records without mutating either workspace. The read-only comparison is available in Settings.
- Explicit enrollment **is not active editing sync**: the visible Model still uses its original browser-local Store; imported legacy review histories remain snapshots and are not represented as individually verified immutable events. Profiles, review convergence and conflict resolution must be verified before switching the active workspace to the account.
