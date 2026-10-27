# Sync architecture reference

Supporting contract, reviewed against source at `480117d` on 26 October 2026. **Task order, gates and current status live only in [../plan.md](../plan.md).** This document does not assert that migrations are currently applied or automatic sync is released.

## Existing components

- Original `src/app/store.js` supports local IndexedDB and legacy Claude-host storage. Local/account saves expose commit promises; `whenSaved()` tracks durable local writes and failures.
- `workspace_lifecycle.js` and `App` guard account boundaries, pending work and stale asynchronous callbacks. Activation remains internal; sign-in is not automatic enrollment.
- `sync_browser.js` contains per-user IndexedDB storage, atomic staging, account transport, server-revision ingestion and independent immutable event acknowledgments.
- `outbox_core.js` processes durable operations with ordered per-record writes, retries and conflict isolation. `account_sync.js` orchestrates account cache refresh, explicit copy-missing enrollment and read-only comparison.
- `review_ledger.js` filters review retractions and adapts validated provenance to the original `src/fsrs.js`. It is not a second scheduler. Full concurrent replay convergence remains unfinished.
- Profile staging and `commit_profile` exist; do not recreate them. User-facing conflicts and safe activation still need the plan's gates.

## Server contracts to preserve

Tracked migrations define owner-scoped notes/profiles; immutable reviews and retractions; idempotency receipts; source/section/card links; context, plan versions/checkpoints; sessions, learning events and tutor handoffs.

The revision RPCs are `commit_note`, `commit_profile` and `publish_study_plan`. Read their current signatures and permission migrations before editing; the historical schema draft is not an installation script. Public entry points delegate to constrained private implementations. Verify current live grants, ownership checks, RLS and exposed schemas when changing backend behavior.

- Stable request IDs identify a logical mutation. After uncertain network acknowledgment, retry the same payload/ID; a different payload is not a retry.
- Notes/profiles compare expected revision; deletes retain tombstones. A content conflict preserves local/remote/base versions and pending intent.
- Review IDs and retraction IDs are immutable. Undo retracts an event; it does not erase history. Event acknowledgment and note-snapshot acknowledgment are independent.
- Stage the local snapshot and corresponding review/retraction/outbox operation transactionally. Do not report cloud confirmation merely because local storage committed.
- Keep anonymous originals until explicit enrollment; never show or send account A's work under account B.

## Unfinished contracts / verification limits

Scheduling must converge from the ledger with versioned parameter/time provenance and an explicit policy for incomplete legacy histories. Never resolve conflicting schedules by latest snapshot. Existing `fsrsInput` rejects unsupported/ambiguous provenance; preserve that safety until a tested policy exists.

Learning-event immutability, context revision history and plan-publication approval/idempotency need verification before the study UI and tutor tools ship. Some earlier audit findings were fixed by subsequent migrations; compare actual SQL before adding fixes.

Realtime is an invalidation signal, not proof that every change arrived. Recovery must pull again on reconnect/resume. Any incremental cursor must be commit-safe; a naive timestamp watermark may miss records.

Current tests include fault-injected browser/account adapters. They do not establish live authenticated convergence or physical Android behavior. The release gates in `plan.md` define the remaining evidence.

## Durable conflict evidence

Account note/profile operations retain `base: {revision, known, data, deleted}`
when staged; `known:false` explicitly represents missing historical content in
older dirty caches or a caller-supplied revision that the cache cannot supply.
Revision zero with known null data means no existing server row. Acknowledgment
rebases the next queued operation's expected revision and base atomically without
changing its payload or request ID. Note deletion receipts retain the preceding
server content because `commit_note` preserves it in the tombstone.

Dirty cache rows keep their latest local projection plus the most recent pulled
`remote` snapshot. Stale RPC responses call `AccountStorage.markConflict` to
persist an operation's `conflict: {version:1, base, local, remote}`. The local side
is that operation's immutable intent (`expectedRevision`, `data`, `deleted`), not
a later edit; later edits remain separate queued operations. Remote is null until
observed. Pulls update cache and conflict evidence in one transaction, reject
contradictory same-revision content and ignore older snapshots. Legacy conflicts
are populated on pull without inventing missing bases. Fields are additive in
existing IndexedDB stores; no schema upgrade or destructive cache migration.

A pull alone does not mark a pending operation conflicted: its server commit may
have succeeded before an acknowledgment was lost. Retry still uses its original
request ID. No evidence capture path invokes `SyncMerge.mergeNotes`, chooses a
winner, clears queued edits or resumes a blocked conflict. Resolution remains a
separate operation with explicit intent and a new revision/request ID; its UI is
unfinished. The transaction contract follows below. The existing snapshot-merging helper is
not a review convergence algorithm.


## Conflict-resolution transaction

`AccountStorage.inspectConflict(id)` returns one consistent view: original base,
latest local projection, latest observed remote version, all related queued
intents and an equality token. The token is account-scoped data, not an auth
credential. `resolveConflict(id, token, decision)` rechecks it inside a write
transaction; newer edits, pulls, acknowledgments or resumed requests require a
fresh comparison. Only the first conflicting snapshot for that entity can be
resolved, with a known remote revision newer than its expected revision. Pending
requests with uncertain receipts cannot be superseded.

`decision.choice` is `local` (latest local projection, including later queued
edits), `remote`, or `merge` (explicit `data`, optional `deleted:true`). Merging
requires a known base. Deletion requires `confirmDelete:true`; keeping live data
across a local or remote tombstone requires `confirmRestore:true`. These flags
represent explicit choices in the future UI. Any different note `cards`/`log`
snapshot, including queued intermediate versions or supplied merge data, blocks
with `review_replay_required`; this API does not implement schedule convergence.

One IndexedDB transaction archives the entire reviewed queue and choice under
`meta['conflict-resolution:' + id]`, removes only superseded note/profile
snapshots from the active outbox, and stages a new snapshot/request ID against
the observed remote revision. Review/retraction operations and immutable ledgers
remain untouched. The new projection stays dirty until acknowledged. A second
identical call returns the original operation even after acknowledgment; another
choice for that same conflict is rejected. Persist the token/decision before
calling if a UI needs crash recovery. Server retries use the new operation's
unchanged request ID. A newer server edit still rejects the resolution by CAS.

`resolution(id)` reads the durable archive, including original payloads/request
IDs, the new operation, its acknowledgment revision when received, and a
`supersededBy` link if that operation later conflicts and is resolved again.
Archives are local to the account cache; no automatic pruning or cloud backup is
implemented. Resume is transactional so an old retry cannot resurrect archived
work. No store/version/backend migration is required. Future UI callers must
retain workspace leases, await the transaction before projecting into Model or
reporting success, and explain blocked review histories without dropping them.


## Review replay policy v1 (SYNC-03, moved from plan.md)

**Background you need (verified in source, `main@4bfe3ab`):**
- A scheduled review appends a log entry `[occurred_at_ms, ord, grade, state_before, duration_ms, kind, event_id, scheduling_provenance]` in `Session.answer` (`src/app/session.js`). `kind` 0 = scheduled, 1 = cram (does not change the schedule).
- `scheduling_provenance` (version 1) contains: `weights` (21 numbers), `day_index`, `rollover_hour`, `timezone_offset_minutes` (`Date#getTimezoneOffset`, e.g. −330 for IST), `retention`, `max_interval_days`, `learn_steps`, `relearn_steps` (strings like `"1m 10m"`), `fuzz`, `load_balance`, `preview_at_ms`, `card_before`.
- Undo writes an immutable retraction `{retraction_id, target_event_id, reason:'undo'|'correction'|'reset'}`; `ReviewLedger.activeEvents(events, retractions)` removes retracted events.
- `FSRS.preview(card, now, cfg, env)` returns results for grades 1–4; `cfg` is built by `schedCfg()` in `src/app/model.js`; `env = {clock, key: noteId + ':' + ord, loadAt}`. Fuzz is seeded from `key` and `card.reps`, so it is deterministic. **`loadAt` (load balancing) depends on each device's local card load and is NOT deterministic.** `FSRS.makeClock` uses the device's local timezone, so it is NOT deterministic across devices either.

**Decisions (do not change without asking the owner):**
- D1 Order: active scheduled events per ordinal, sorted by `occurred_at_ms`, then `event_id` by plain code-unit comparison (`a < b ? -1 : a > b ? 1 : 0`). Never use `localeCompare` (it is locale-dependent).
- D2 Baseline: the first event's `card_before` must be a new card (`st === 0 && reps === 0`); otherwise block with `legacy_baseline_required` (already done in `inspect`).
- D3 Per-event parameters: each step uses **that event's** provenance (weights, retention, steps, maxIvl, fuzz). Parameter changes between events are therefore allowed in the schedule fold.
- D4 Clock: build a fixed-offset clock from each event's provenance: `dayIndex(ts) = Math.floor((ts − tz·60000 − rollover·3600000) / 86400000)`, `dayStart(i) = i·86400000 + rollover·3600000 + tz·60000`, where `tz = timezone_offset_minutes`, `rollover = rollover_hour`. If `clock.dayIndex(occurred_at_ms) !== provenance.day_index`, block with `clock_mismatch`.
- D5 Load balancing is **ignored** in replay (`loadAt: undefined`, `cfg.loadBalance = false`). Fuzz stays as recorded.
- D6 Step: `card = FSRS.preview(card, p.preview_at_ms, cfg, {clock, key}) [grade].card`. Only schedule fields `st, due, s, d, last, step, reps, lapses` come from replay; `flag`, `susp` and all other fields come from the chosen snapshot. Do not re-run leech logic.
- D7 Resets (`reason:'reset'`) and any missing provenance field stay **blocked** (`reset_policy_required` / `replay_unsupported`). This is an accepted SYNC-03 limitation.
- D8 Replay is used **only** to resolve divergent schedules (where `review_replay_required` is thrown today). Never rewrite a non-conflicting card's schedule on load.
