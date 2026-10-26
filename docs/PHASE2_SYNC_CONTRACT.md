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
