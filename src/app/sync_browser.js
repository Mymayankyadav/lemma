/* Lemma Phase 2: browser + Capacitor offline sync primitives.
 * This is a standalone integration layer. The existing app Store remains active
 * until auth UI, event migration and two-device tests are complete.
 * No service-role key or elevated database access is used here.
 */
const LemmaCloud = (() => {
  const core = typeof module !== 'undefined' && module.exports ? require('./outbox_core.js') : LemmaOutboxCore;
  const replay = typeof module !== 'undefined' && module.exports ? require('./review_replay.js') : LemmaReviewReplay;
  const dbVersion = 3;
  function request(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function openAccountDB(userId) {
    if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error('Invalid user ID for local namespace');
    const req = indexedDB.open('lemma-user-' + userId, dbVersion);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains('notes')) d.createObjectStore('notes', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('reviews')) d.createObjectStore('reviews', { keyPath: 'event_id' });
      if (!d.objectStoreNames.contains('retractions')) d.createObjectStore('retractions', { keyPath: 'retraction_id' });
      if (!d.objectStoreNames.contains('outbox')) d.createObjectStore('outbox', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta');
      // Preserve v1 pending work and its previous ordering; sequence future
      // writes transactionally so wall-clock rollback and UUID order cannot reorder them.
      const outbox = req.transaction.objectStore('outbox');
      const rows = outbox.getAll();
      rows.onsuccess = () => {
        let sequence = 0;
        for (const op of rows.result.sort(core.compare)) outbox.put({ ...op, sequence: ++sequence });
        req.transaction.objectStore('meta').put(sequence, 'sequence');
      };
    };
    const db = await request(req);
    db.onversionchange = () => db.close();
    return db;
  }
  function tx(db, stores, mode, callback) {
    return new Promise((resolve, reject) => {
      const t = db.transaction(stores, mode);
      let value;
      t.oncomplete = () => resolve(value);
      t.onerror = () => reject(t.error || new Error('IndexedDB transaction failed'));
      t.onabort = () => reject(t.error || new Error('IndexedDB transaction aborted'));
      try { value = callback(t); } catch (err) { t.abort(); reject(err); }
    });
  }
  // JSONB reorders object keys on the server; compare immutable payloads
  // structurally instead of relying on insertion-order JSON.stringify().
  function canonical(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    return '{' + Object.keys(value).sort().filter(k => value[k] !== undefined)
      .map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  }
  const eventFields = ['event_id','note_id','ordinal','occurred_at_ms',
    'grade','state_before','duration_ms','kind','scheduling_provenance'];
  function sameFields(a, b, fields) {
    return fields.every(k => canonical(a[k] ?? null) === canonical(b[k] ?? null));
  }
  const uuid = () => {
    if (!globalThis.crypto || !globalThis.crypto.randomUUID) throw new Error('Secure random UUID unavailable');
    return globalThis.crypto.randomUUID();
  };
  const version = (revision, data, deleted = false) =>
    ({ revision, known: true, data: structuredClone(data ?? null), deleted: Boolean(deleted) });
  function baseVersion(row, revision) {
    if (row?.base?.revision === revision) return structuredClone(row.base);
    if (row && !row.dirty && row.revision === revision && !(row.deleted && row.data == null))
      return version(revision, row.data, row.deleted);
    if (!row && revision === 0) return version(0, null);
    // Old dirty caches never retained the base content. Do not invent it from
    // the local edit or a newer pull; expose that limit to the future resolver.
    return { revision, known: false };
  }
  function acknowledgedVersion(op, revision) {
    // commit_note retains the previous server content when deleting. The
    // outbound delete payload is null, not the tombstone's retained content.
    if (op.deleted && !op.base?.known) return { revision, known: false, deleted: true };
    return version(revision, op.deleted ? op.base.data : op.data, op.deleted);
  }
  function conflictRecord(op, row) {
    return { version: 1, base: op.base || baseVersion(row, op.expectedRevision),
      local: { expectedRevision: op.expectedRevision, data: op.data, deleted: Boolean(op.deleted) },
      remote: row?.remote || null };
  }
  function retainRemote(t, row, incoming) {
    const previous = row?.remote || (row && baseVersion(row, row.revision));
    if (previous && incoming.revision < previous.revision) return false;
    if (previous?.known && incoming.revision === previous.revision &&
        canonical(previous) !== canonical(incoming)) { t.abort(); return false; }
    return true;
  }
  function refreshConflicts(t, kind, entityId, remote) {
    const store = t.objectStore('outbox');
    const queue = store.getAll();
    queue.onsuccess = () => {
      for (const op of queue.result) {
        if (op.kind === kind && op.entityId === entityId && op.state === 'conflict')
          store.put({ ...op, conflict: { ...conflictRecord(op, null), ...op.conflict, remote } });
      }
    };
  }
  const resolutionKey = id => 'conflict-resolution:' + id;
  const isActive = op => op.state === 'pending' || op.state === 'conflict';
  function readConflict(t, userId, id, done) {
    const request = t.objectStore('outbox').getAll();
    request.onsuccess = () => {
      const operation = request.result.find(op => op.id === id);
      if (!operation || operation.state !== 'conflict' || !['note','profile'].includes(operation.kind)) {
        done(null); return;
      }
      const { kind, entityId } = operation;
      const queued = request.result.filter(op => isActive(op) && op.entityId === entityId &&
        (kind === 'profile' ? op.kind === 'profile' : ['note','review','retraction'].includes(op.kind)))
        .sort(core.compare);
      const row = kind === 'note' ? t.objectStore('notes').get(entityId) :
        t.objectStore('meta').get('accountProfile');
      row.onsuccess = () => {
        if (!row.result) { done(null); return; }
        const view = { version: 1, userId, id, kind, entityId,
          base: operation.conflict?.base || operation.base || baseVersion(row.result, operation.expectedRevision),
          local: { data: row.result.data, deleted: Boolean(row.result.deleted),
            expectedRevision: row.result.revision },
          remote: row.result.remote || operation.conflict?.remote || null, queued };
        // An equality token, not an authorization credential. Include every
        // reviewed intent so a later edit, pull or acknowledgment invalidates it.
        if (kind === 'profile') { done({ ...view, token: canonical(view) }); return; }
        // Inspect the entire immutable account ledger in this same IndexedDB
        // transaction. Include it in the CAS token: another tab's review or
        // Undo must invalidate an old conflict decision.
        const reviews = t.objectStore('reviews').getAll();
        reviews.onsuccess = () => {
          const retractions = t.objectStore('retractions').getAll();
          retractions.onsuccess = () => {
            const snapshot = { ...view, ledger: {
              events: reviews.result, retractions: retractions.result
            }};
            done({ ...snapshot, token: canonical(snapshot) });
          };
        };
      };
    };
  }
  const scheduleFields = ['st','due','s','d','last','step','reps','lapses'];
  const scheduleSignature = data => canonical({
    cards: Object.fromEntries(Object.entries(data.cards || {}).map(([ord, card]) =>
      [ord, Object.fromEntries(scheduleFields.map(key => [key, card?.[key] ?? null]))])),
    log: data.log || []
  });
  function resolutionSnapshot(view, decision) {
    const remote = view.remote;
    const snapshots = view.queued.filter(op => op.kind === view.kind);
    if (snapshots[0]?.id !== view.id) throw new Error('Resolve the first conflicting mutation');
    if (!remote?.known || !Number.isSafeInteger(remote.revision) ||
        remote.revision <= snapshots[0].expectedRevision) throw new Error('Fresh remote version required');
    // A timeout may hide a committed request. Only a definite stale rejection
    // can be superseded; never discard another attempted, uncertain mutation.
    if (snapshots.some(op => op.state === 'pending' && op.attempted))
      throw new Error('Retry uncertain mutations before resolving');
    let selected;
    if (decision.choice === 'local') selected = view.local;
    else if (decision.choice === 'remote') selected = remote;
    else if (decision.choice === 'merge') {
      if (!view.base?.known) throw new Error('Cannot merge an unknown base');
      selected = { data: decision.data, deleted: decision.deleted === true };
    } else throw new Error('Invalid conflict choice');
    const deleted = Boolean(selected.deleted);
    if (deleted && (view.kind !== 'note' || decision.confirmDelete !== true))
      throw new Error('Explicit deletion confirmation required');
    if (!deleted && (remote.deleted || snapshots.some(op => op.deleted)) && decision.confirmRestore !== true)
      throw new Error('Explicit restoration confirmation required');
    if (!deleted && (!selected.data || typeof selected.data !== 'object' || Array.isArray(selected.data) ||
        (view.kind === 'note' && selected.data.id !== view.entityId))) throw new Error('Invalid resolution data');
    if (view.kind === 'note') {
      const versions = [view.base?.known && view.base.data, view.local.data, remote.data,
        ...snapshots.map(op => op.data), selected.data].filter(Boolean);
      const schedules = versions.map(scheduleSignature);
      if (schedules.some(value => value !== schedules[0])) {
        // Do not pick a schedule by snapshot revision. Reconstruct it only
        // from complete immutable evidence, using the reviewed ledger snapshot.
        const result = replay.project({
          id:view.entityId, data:view.local.data || selected.data, base:view.base, remote,
          deleted:false
        }, view.ledger?.events || [], view.ledger?.retractions || [], view.queued);
        if (result.status !== 'projected')
          throw new Error('review_replay_required: ' + (result.code || result.status));
        if (deleted)
          throw new Error('review_replay_required: schedule_while_deleting');
        const data = structuredClone(selected.data);
        const projectedOrds = new Set(Object.keys(result.cards));
        for (const ord of new Set(versions.flatMap(v => Object.keys(v.cards || {})))) {
          if (projectedOrds.has(ord)) continue;
          const unchanged = versions.map(v => canonical(Object.fromEntries(
            scheduleFields.map(key => [key, v.cards?.[ord]?.[key] ?? null]))));
          if (unchanged.some(value => value !== unchanged[0]))
            throw new Error('review_replay_required: unexplained_schedule');
        }
        data.cards = data.cards || {};
        for (const [ord, fields] of Object.entries(result.cards)) {
          if (!Object.prototype.hasOwnProperty.call(data.cards, ord))
            throw new Error('review_replay_required: missing_selected_card');
          data.cards[ord] = { ...data.cards[ord], ...fields };
        }

        // Immutable IDs disambiguate equal timestamps. Keep cram entries,
        // but never invent a scheduled event absent from all snapshots.
        const union = new Map();
        for (const v of versions) for (const entry of v.log || []) {
          const id = entry[6] || (entry[5] === 1 ? 'legacy-cram:' + canonical(entry) : null);
          if (!id) throw new Error('review_replay_required: legacy_history');
          const previous = union.get(id);
          if (previous && canonical(previous) !== canonical(entry))
            throw new Error('review_replay_required: inconsistent_log');
          union.set(id, entry);
        }
        for (const id of result.eventIds)
          if (!union.has(id)) throw new Error('review_replay_required: missing_log_event');
        const removed = new Set((view.ledger?.retractions || []).map(r => r.target_event_id));
        data.log = [...union.values()].filter(entry => !removed.has(entry[6]))
          .sort((a,b) => a[0] - b[0] ||
            ((a[6] || '') < (b[6] || '') ? -1 : (a[6] || '') > (b[6] || '') ? 1 : 0));
        return { data, deleted:false, snapshots };
      }
    }
    return { data: deleted ? null : structuredClone(selected.data), deleted, snapshots };
  }
  // The account's existing IndexedDB meta store hosts *unaccepted* study
  // context drafts. Do not put these in the note/review outbox or presume
  // a tutor proposal is an approved user write.
  const knowledgeDraftKey = id => {
    if (typeof id !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))
      throw new Error('Invalid knowledge context ID');
    return 'knowledge:draft:v1:' + id.toLowerCase();
  };
  const knowledgeBytes = text => new TextEncoder().encode(text).byteLength;
  function knowledgeDraftInput(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data) ||
        !Number.isSafeInteger(data.expectedLocalRevision) || data.expectedLocalRevision < 0 ||
        !Number.isSafeInteger(data.expectedRevision) || data.expectedRevision < 0 ||
        typeof data.title !== 'string' || !data.title.trim() ||
        knowledgeBytes(data.title) > 512 ||
        typeof data.markdown !== 'string' || knowledgeBytes(data.markdown) > 65536 ||
        !['student','tutor'].includes(data.authorKind) ||
        data.payload === null || typeof data.payload !== 'object' ||
        Array.isArray(data.payload) || data.payload.schema_version !== 1 ||
        data.studentApproved === true || data.status === 'accepted')
      throw new Error('Invalid unaccepted knowledge draft');
    let payload;
    try {
      payload = JSON.parse(JSON.stringify(data.payload));
    } catch (_) { throw new Error('Invalid unaccepted knowledge draft'); }
    if (!payload || payload.schema_version !== 1 ||
        knowledgeBytes(JSON.stringify(payload)) > 32768)
      throw new Error('Invalid unaccepted knowledge draft');
    return { contextId: data.contextId.toLowerCase(),
      expectedRevision: data.expectedRevision,
      title: data.title, markdown: data.markdown,
      payload, authorKind: data.authorKind };
  }
  function portableRecovery(value, depth = 0, seen = new WeakSet()) {
        if (depth > 32) throw new Error('Local recovery JSON depth exceeded');
        if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
        if (typeof value === 'number' && Number.isFinite(value)) return;
        if (!value || typeof value !== 'object')
          throw new Error('Local recovery contains non-JSON data');
        if (seen.has(value)) throw new Error('Local recovery contains a circular value');
        if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype &&
            Object.getPrototypeOf(value) !== null)
          throw new Error('Local recovery contains a non-JSON object');
        seen.add(value);
        for (const key of Object.keys(value)) {
          if (['__proto__','prototype','constructor'].includes(key))
            throw new Error('Local recovery contains an unsafe key');
          portableRecovery(value[key], depth + 1, seen);
        }
        seen.delete(value);
      }

  class AccountStorage {
    constructor(db, userId) { this.db = db; this.userId = userId; }
    async knowledgeDraft(contextId) {
      const key = knowledgeDraftKey(contextId);
      const row = await request(this.db.transaction('meta','readonly')
        .objectStore('meta').get(key));
      if (row && (row.userId !== this.userId || row.contextId !== contextId.toLowerCase() ||
          !['draft','approved_pending','needs_review'].includes(row.status) ||
          !Number.isSafeInteger(row.localRevision) ||
          (['approved_pending','needs_review'].includes(row.status) &&
            (typeof row.requestId !== 'string' ||
              !/^[0-9a-f-]{36}$/i.test(row.requestId)))))
        throw new Error('Invalid locally saved knowledge draft');
      return row ? structuredClone(row) : null;
    }
    async saveKnowledgeDraft(input) {
      const key = knowledgeDraftKey(input?.contextId);
      const data = knowledgeDraftInput(input);
      let result, failure;
      try {
        // The conditional read and write share ONE transaction: two tabs
        // cannot overwrite each other's unreviewed proof or context edits.
        await tx(this.db, ['meta'], 'readwrite', t => {
          const store = t.objectStore('meta');
          const lookup = store.get(key);
          lookup.onsuccess = () => {
            const previous = lookup.result;
            if (['approved_pending','needs_review'].includes(previous?.status) && previous.userId === this.userId) {
              failure = new Error('Approved knowledge intent is pending; no editing allowed');
              t.abort(); return;
            }
            if (previous && (previous.userId !== this.userId ||
                previous.contextId !== data.contextId || previous.status !== 'draft')) {
              failure = new Error('Invalid locally saved knowledge draft'); t.abort(); return;
            }
            if ((previous?.localRevision ?? 0) !== input.expectedLocalRevision) {
              failure = new Error('Knowledge draft changed; reload before editing'); t.abort(); return;
            }
            const stamp = Date.now();
            result = {
              v: 1, userId: this.userId, ...data, localRevision: input.expectedLocalRevision + 1,
              status: 'draft', createdAt: previous?.createdAt ?? stamp, updatedAt: stamp
            };
            store.put(result, key);
          };
        });
      } catch (err) { throw failure || err; }
      // A saved local draft is NOT a cloud receipt, and this result is never
      // interpreted as approval to call commit_structured_study_context.
      return structuredClone(result);
    }
    async approveKnowledgeDraft(contextId, expectedLocalRevision, studentApproved) {
      const key = knowledgeDraftKey(contextId);
      if (studentApproved !== true)
        throw new Error('Explicit student approval required');
      if (!Number.isSafeInteger(expectedLocalRevision) || expectedLocalRevision < 1)
        throw new Error('Reviewed local draft revision required');
      // Generate once per call; a duplicate approval of an already-staged
      // revision reads the persisted request ID instead of replacing it.
      const proposedRequestId = uuid();
      let result, failure;
      try {
        await tx(this.db, ['meta'], 'readwrite', t => {
          const store = t.objectStore('meta'), lookup = store.get(key);
          lookup.onsuccess = () => {
            const previous = lookup.result;
            if (!previous || previous.userId !== this.userId ||
                previous.contextId !== contextId.toLowerCase()) {
              failure = new Error('Knowledge draft not available for this account');
              t.abort(); return;
            }
            if (previous.status === 'approved_pending' &&
                previous.approvedFromLocalRevision === expectedLocalRevision) {
              // Local response lost: the exact snapshot and request key were
              // already recorded, do not duplicate or rewrite the approval.
              result = previous;
              return;
            }
            if (previous.status !== 'draft' ||
                previous.localRevision !== expectedLocalRevision) {
              failure = new Error('Knowledge draft changed; review before approval');
              t.abort(); return;
            }
            result = { ...previous, status:'approved_pending',
              localRevision:previous.localRevision + 1,
              approvedFromLocalRevision:previous.localRevision,
              requestId:proposedRequestId, approvedBy:'student',
              approvedAt:Date.now() };
            store.put(result, key);
          };
        });
      } catch (err) { throw failure || err; }
      // The resulting intent has NOT been sent to Supabase, and may remain
      // offline indefinitely. Later submission MUST reuse requestId exactly.
      return structuredClone(result);
    }
    async knowledgeIntentReceipt(contextId) {
      const key = knowledgeDraftKey(contextId).replace(':draft:',':receipt:');
      const receipt = await request(this.db.transaction('meta','readonly')
        .objectStore('meta').get(key));
      if (receipt && (receipt.userId !== this.userId ||
          receipt.contextId !== contextId.toLowerCase() ||
          !Number.isSafeInteger(receipt.revision) || receipt.revision < 1))
        throw new Error('Invalid saved knowledge receipt');
      return receipt ? structuredClone(receipt) : null;
    }
    async markKnowledgeIntentAttempt(contextId, requestId) {
      const key = knowledgeDraftKey(contextId);
      let result, failure;
      try {
        await tx(this.db,['meta'],'readwrite', t => {
          const store=t.objectStore('meta'), lookup=store.get(key);
          lookup.onsuccess=()=>{
            const row=lookup.result;
            if (!row || row.userId!==this.userId ||
                row.status!=='approved_pending' || row.requestId!==requestId) {
              failure=new Error('Approved knowledge intent no longer pending');
              t.abort();return;
            }
            result={...row,attempted:true,
              attempts:(row.attempts??0)+1};
            store.put(result,key);
          };
        });
      } catch(err){throw failure||err;}
      return structuredClone(result);
    }
    async markKnowledgeIntentConflict(contextId, requestId) {
      const key=knowledgeDraftKey(contextId);
      let result,failure;
      try {
        await tx(this.db,['meta'],'readwrite', t=>{
          const store=t.objectStore('meta'), lookup=store.get(key);
          lookup.onsuccess=()=>{
            const row=lookup.result;
            if (!row || row.userId!==this.userId || row.requestId!==requestId ||
                !['approved_pending','needs_review'].includes(row.status)) {
              failure=new Error('Approved knowledge intent changed');
              t.abort();return;
            }
            result={...row,status:'needs_review',conflict:'stale_context_revision'};
            store.put(result,key);
          };
        });
      } catch(err){throw failure||err;}
      return structuredClone(result);
    }
    async acknowledgeKnowledgeIntent(contextId, requestId, acceptedRevision) {
      const key=knowledgeDraftKey(contextId);
      const receiptKey=key.replace(':draft:',':receipt:');
      if (!Number.isSafeInteger(acceptedRevision) || acceptedRevision < 1)
        throw new Error('Invalid knowledge acceptance receipt');
      let result,failure;
      try {
        // A confirmed server revision and draft removal commit atomically.
        // If the local response was lost, the stable receipt is returned
        // without deleting any newer pending draft.
        await tx(this.db,['meta'],'readwrite',t=>{
          const store=t.objectStore('meta'), lookup=store.get(key);
          lookup.onsuccess=()=>{
            const row=lookup.result;
            if (!row) {
              const archived=store.get(receiptKey);
              archived.onsuccess=()=>{
                const r=archived.result;
                if (!r || r.userId!==this.userId || r.requestId!==requestId ||
                    r.revision!==acceptedRevision) {
                  failure=new Error('Knowledge receipt no longer matches intent');
                  t.abort();return;
                }
                result=r;
              };
              return;
            }
            if (row.userId!==this.userId || row.requestId!==requestId ||
                row.status!=='approved_pending' ||
                acceptedRevision <= row.expectedRevision) {
              failure=new Error('Knowledge receipt no longer matches intent');
              t.abort();return;
            }
            result={v:1,userId:this.userId,contextId:row.contextId,
              requestId,revision:acceptedRevision,confirmedAt:Date.now()};
            store.put(result,receiptKey);
            store.delete(key);
          };
        });
      } catch(err){throw failure||err;}
      return structuredClone(result);
    }
    // K2h2: a stale, already-approved request is immutable evidence. A
    // student may explicitly restart review against a newly inspected server
    // revision, but this NEVER grants approval to the replacement draft.
    // The old request and the replacement are committed in ONE transaction.
    async reopenKnowledgeConflictDraft(contextId, expectedLocalRevision,
      requestId, acceptedRevision, studentReviewed) {
      const key=knowledgeDraftKey(contextId);
      if (studentReviewed !== true)
        throw new Error('Explicit student conflict review required');
      if (!Number.isSafeInteger(expectedLocalRevision) || expectedLocalRevision < 1 ||
          !Number.isSafeInteger(acceptedRevision) || acceptedRevision < 1 ||
          typeof requestId !== 'string' ||
          !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(requestId))
        throw new Error('Invalid reviewed knowledge conflict');
      const archiveKey=key.replace(':draft:',':conflict:')+':'+requestId.toLowerCase();
      let result,failure;
      try {
        await tx(this.db,['meta'],'readwrite',t=>{
          const store=t.objectStore('meta'), lookup=store.get(key);
          lookup.onsuccess=()=>{
            const previous=lookup.result;
            // Lost local receipt: return the exact reopened draft, but only
            // before another tab has edited or reapproved it.
            if (previous?.userId===this.userId && previous.status==='draft' &&
                previous.reopenedFromRequestId===requestId &&
                previous.reopenedFromLocalRevision===expectedLocalRevision &&
                previous.expectedRevision===acceptedRevision &&
                previous.localRevision===expectedLocalRevision+1) {
              result=previous;return;
            }
            if (!previous || previous.userId!==this.userId ||
                previous.contextId!==contextId.toLowerCase() ||
                previous.status!=='needs_review' ||
                previous.approvedBy!=='student' ||
                previous.requestId!==requestId ||
                previous.localRevision!==expectedLocalRevision ||
                acceptedRevision<=previous.expectedRevision) {
              failure=new Error('Knowledge conflict changed; compare again');
              t.abort();return;
            }
            const archive=store.get(archiveKey);
            archive.onsuccess=()=>{
              if (archive.result) {
                failure=new Error('Knowledge conflict already archived');
                t.abort();return;
              }
              const stamp=Date.now();
              store.add({v:1,userId:this.userId,contextId:previous.contextId,
                requestId,acceptedRevision,reviewedAt:stamp,
                original:structuredClone(previous)},archiveKey);
              result={v:1,userId:this.userId,contextId:previous.contextId,
                expectedRevision:acceptedRevision,title:previous.title,
                markdown:previous.markdown,payload:structuredClone(previous.payload),
                authorKind:previous.authorKind,localRevision:previous.localRevision+1,
                status:'draft',createdAt:previous.createdAt,updatedAt:stamp,
                reopenedFromRequestId:requestId,
                reopenedFromLocalRevision:previous.localRevision,reopenedAt:stamp};
              store.put(result,key);
            };
          };
        });
      } catch(err){throw failure||err;}
      return structuredClone(result);
    }
    async discardKnowledgeDraft(contextId, expectedLocalRevision) {
      const key = knowledgeDraftKey(contextId);
      if (!Number.isSafeInteger(expectedLocalRevision) || expectedLocalRevision < 1)
        throw new Error('Reviewed local draft revision required');
      let discarded = false, failure;
      try {
        await tx(this.db, ['meta'], 'readwrite', t => {
          const store = t.objectStore('meta'), lookup = store.get(key);
          lookup.onsuccess = () => {
            if (!lookup.result || lookup.result.userId !== this.userId ||
                lookup.result.status !== 'draft' ||
                lookup.result.localRevision !== expectedLocalRevision) {
              failure = new Error('Knowledge draft changed; reload before discarding');
              t.abort(); return;
            }
            store.delete(key);
            discarded = true;
          };
        });
      } catch (err) { throw failure || err; }
      return discarded;
    }
    // Read-only companion to a future *server* archive. The five stores are
    // captured in ONE IndexedDB transaction, not five drifting async reads.
    // This preserves pending mutations, their conflict/receipt metadata,
    // unaccepted knowledge drafts, and the immutable local review ledger.
    // Nothing here is an approved cloud revision or a restore instruction.
    async localRecoverySnapshot({ maxBytes = 64 * 1024 * 1024, maxRows = 200000 } = {}) {
      if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 64 * 1024 * 1024 ||
          !Number.isSafeInteger(maxRows) || maxRows < 1 || maxRows > 200000)
        throw new Error('Invalid local recovery safety bounds');
      const names = ['notes','reviews','retractions','outbox','meta'];
      const entries = {};
      await tx(this.db, names, 'readonly', t => {
        for (const name of names) {
          const store = t.objectStore(name);
          const values = store.getAll(), keys = store.getAllKeys();
          const part = { values: null, keys: null };
          entries[name] = part;
          values.onsuccess = () => { part.values = values.result; };
          keys.onsuccess = () => { part.keys = keys.result; };
        }
      });
      const stores = {};
      let count = 0;
      // IndexedDB can persist Dates, Blobs and cyclic structures, but silently
      // JSON-encoding those would make an archive unrecoverable. Reject them.
      for (const name of names) {
        const part = entries[name];
        if (!Array.isArray(part.keys) || !Array.isArray(part.values) ||
            part.keys.length !== part.values.length)
          throw new Error('Incomplete local recovery transaction');
        count += part.keys.length;
        if (count > maxRows) throw new Error('Local recovery record limit exceeded');
        stores[name] = part.keys.map((key, i) => {
          const value = part.values[i];
          if (typeof key !== 'string' &&
              !(typeof key === 'number' && Number.isSafeInteger(key)))
            throw new Error('Unsupported local recovery record key');
          portableRecovery(value);
          if (value && typeof value === 'object' && !Array.isArray(value) &&
              ((value.userId !== undefined && value.userId !== this.userId) ||
               (value.user_id !== undefined && value.user_id !== this.userId)))
            throw new Error('Foreign owner row in local recovery cache');
          return { key, value };
        });
      }
      const snapshot = { app:'lemma',version:1,scope:'account-local-recovery',
        capture:'single-indexeddb-readonly-transaction',ownerId:this.userId,
        capturedAt:new Date().toISOString(),stores };
      const serialized = JSON.stringify(snapshot);
      if (new TextEncoder().encode(serialized).byteLength > maxBytes)
        throw new Error('Local recovery byte limit exceeded');
      return snapshot;
    }
    async restoreLocalRecoverySnapshot(snapshot,{requestId,sha256,studentConfirmed=false,
      dryRun=true,active=()=>true}={}) {
      if(studentConfirmed!==true || !/^[0-9a-f-]{36}$/i.test(requestId||'') ||
         !/^[0-9a-f]{64}$/.test(sha256||'') || typeof dryRun!=='boolean')
        throw new Error('Explicit local restore confirmation and receipt required');
      portableRecovery(snapshot);
      const names=['notes','reviews','retractions','outbox','meta'];
      if(snapshot?.app!=='lemma'||snapshot.version!==1 ||
         snapshot.scope!=='account-local-recovery'||snapshot.ownerId!==this.userId ||
         snapshot.capture!=='single-indexeddb-readonly-transaction' ||
         JSON.stringify(Object.keys(snapshot.stores||{}))!==JSON.stringify(names) ||
         new TextEncoder().encode(JSON.stringify(snapshot)).byteLength>64*1024*1024)
        throw new Error('Invalid local restore snapshot or owner');
      const receiptKey='recovery:restore:v1:'+requestId;
      let count=0;
      for(const name of names){
        const seen=new Set(),rows=snapshot.stores[name];
        if(!Array.isArray(rows))throw new Error('Invalid local restore table');
        for(const row of rows){
          const key=JSON.stringify(row.key);
          if((typeof row.key!=='string' && !(typeof row.key==='number'&&Number.isSafeInteger(row.key))) ||
             seen.has(key) || (name==='meta' && row.key===receiptKey))
            throw new Error('Invalid or duplicate local restore key');
          seen.add(key);
          const field={notes:'id',reviews:'event_id',retractions:'retraction_id',outbox:'id'}[name];
          if(field && row.value?.[field]!==row.key)
            throw new Error('Local restore key does not match record');
          if(row.value && ((row.value.userId!==undefined&&row.value.userId!==this.userId)||
            (row.value.user_id!==undefined&&row.value.user_id!==this.userId)))
            throw new Error('Foreign owner local restore row');
        }
        count+=rows.length;
      }
      if(count>200000)throw new Error('Local restore row limit');
      let result,failure;
      const check=()=>{if(!active())throw new Error('Account changed during local restore');};
      try {
        await tx(this.db,names,'readwrite',t=>{
          const present={};let remaining=names.length;
          const finish=()=>{
            try {
              check();
              const prior=present.meta.find(r=>r.key===receiptKey)?.value;
              if(prior){
                if(prior.userId!==this.userId||prior.sha256!==sha256)
                  throw new Error('Local restore request payload mismatch');
                result=prior;return;
              }
              for(const name of names){
                if(present[name].some(r=>!(name==='meta'&&r.key==='sequence'&&r.value===0)))
                  throw new Error('Local restore destination is not empty');
              }
              result={status:dryRun?'validated':'restored',userId:this.userId,
                requestId,sha256,rows:count};
              if(dryRun)return;
              for(const name of names){
                const store=t.objectStore(name);
                for(const row of snapshot.stores[name]){
                  if(store.keyPath===null)store.put(structuredClone(row.value),row.key);
                  else store.add(structuredClone(row.value));
                }
              }
              t.objectStore('meta').add(result,receiptKey);
            }catch(err){failure=err;t.abort();}
          };
          for(const name of names){
            const store=t.objectStore(name),values=store.getAll(),keys=store.getAllKeys();
            const part={};present[name]=[];
            const done=()=>{
              if(!part.values||!part.keys)return;
              present[name]=part.keys.map((key,i)=>({key,value:part.values[i]}));
              if(--remaining===0)finish();
            };
            values.onsuccess=()=>{part.values=values.result;done();};
            keys.onsuccess=()=>{part.keys=keys.result;done();};
          }
        });
      }catch(err){throw failure||err;}
      check();return result;
    }
    async note(id) { return request(this.db.transaction('notes').objectStore('notes').get(id)); }
    async list() { return request(this.db.transaction('outbox').objectStore('outbox').getAll()); }
    async get(id) { return request(this.db.transaction('outbox').objectStore('outbox').get(id)); }
    async put(op) {
      return tx(this.db, ['outbox','meta'], 'readwrite', t => {
        const outbox = t.objectStore('outbox');
        const existing = outbox.get(op.id);
        existing.onsuccess = () => {
          if (existing.result) { outbox.put({ ...op, sequence: existing.result.sequence }); return; }
          const meta = t.objectStore('meta');
          const count = meta.get('sequence');
          count.onsuccess = () => {
            const sequence = (count.result ?? 0) + 1;
            if (!Number.isSafeInteger(sequence) || sequence < 1) { t.abort(); return; }
            meta.put(sequence, 'sequence');
            outbox.add({ ...op, sequence });
          };
        };
      });
    }
    async delete(id) { return tx(this.db, ['outbox'], 'readwrite', t => t.objectStore('outbox').delete(id)); }
    async markAttempt(id) {
      return tx(this.db, ['outbox'], 'readwrite', t => {
        const store = t.objectStore('outbox');
        const r = store.get(id);
        r.onsuccess = () => { if (r.result) store.put({ ...r.result, attempted: true }); };
      });
    }
    async resumeConflict(id) {
      // Do not let a delayed read/put resurrect an already archived conflict.
      return tx(this.db, ['outbox'], 'readwrite', t => {
        const store = t.objectStore('outbox'), r = store.get(id);
        r.onsuccess = () => { if (r.result?.state === 'conflict') store.put({ ...r.result, state: 'pending' }); };
      });
    }
    async inspectConflict(id) {
      let view;
      await tx(this.db, ['outbox','notes','meta','reviews','retractions'], 'readonly', t => readConflict(t, this.userId, id, value => { view = value; }));
      return view;
    }
    async resolution(id) {
      return request(this.db.transaction('meta').objectStore('meta').get(resolutionKey(id)));
    }
    async resolveConflict(id, expectedToken, decision) {
      if (typeof expectedToken !== 'string' || !expectedToken || !decision || typeof decision !== 'object')
        throw new Error('Reviewed conflict and explicit choice required');
      const choice = structuredClone(decision);
      const fingerprint = canonical({ expectedToken, decision: choice });
      let result, failure;
      try {
        await tx(this.db, ['outbox','notes','meta','reviews','retractions'], 'readwrite', t => {
          const fail = error => { failure = error; t.abort(); };
          const meta = t.objectStore('meta');
          const previous = meta.get(resolutionKey(id));
          previous.onsuccess = () => {
            if (previous.result) {
              if (previous.result.fingerprint !== fingerprint) { fail(new Error('Resolution already recorded')); return; }
              result = previous.result.operation; return; // Lost local receipt: same operation, no second write.
            }
            readConflict(t, this.userId, id, view => {
              if (!view || view.token !== expectedToken) { fail(new Error('Conflict changed; inspect it again')); return; }
              let selected;
              try { selected = resolutionSnapshot(view, choice); } catch (error) { fail(error); return; }
              const counter = meta.get('sequence');
              counter.onsuccess = () => {
                const sequence = (counter.result ?? 0) + 1;
                if (!Number.isSafeInteger(sequence) || sequence < 1) { fail(new Error('Invalid outbox sequence')); return; }
                const operation = { id: uuid(), requestId: uuid(), kind: view.kind, entityId: view.entityId,
                  data: selected.data, expectedRevision: view.remote.revision, base: view.remote,
                  state: 'pending', attempts: 0, enqueuedAt: Date.now(), sequence, resolves: id,
                  ...(view.kind === 'note' ? { deleted: selected.deleted } : {}) };
                // Archive before removing any queued snapshots, in the SAME
                // transaction as the new intent and projection. Events stay queued.
                meta.add({ version: 1, fingerprint, decision: choice, reviewed: view, operation }, resolutionKey(id));
                const outbox = t.objectStore('outbox');
                for (const old of selected.snapshots) {
                  outbox.delete(old.id);
                  if (old.resolves) {
                    const archive = meta.get(resolutionKey(old.resolves));
                    archive.onsuccess = () => {
                      if (archive.result) meta.put({ ...archive.result, supersededBy: operation.id }, resolutionKey(old.resolves));
                    };
                  }
                }
                outbox.add(operation);
                meta.put(sequence, 'sequence');
                const row = { data: selected.data, deleted: selected.deleted,
                  revision: view.remote.revision, base: view.remote, remote: view.remote, dirty: true };
                if (view.kind === 'note') t.objectStore('notes').put({ ...row, id: view.entityId });
                else meta.put(row, 'accountProfile');
                result = operation;
              };
            });
          };
        });
      } catch (error) { throw failure || error; }
      return result;
    }
    async markConflict(id, error) {
      return tx(this.db, ['outbox','notes','meta'], 'readwrite', t => {
        const store = t.objectStore('outbox');
        const current = store.get(id);
        current.onsuccess = () => {
          const op = current.result;
          if (!op) return;
          const save = row => store.put({ ...op, state: 'conflict',
            attempts: op.attempts + 1, lastError: String(error.message || error),
            ...(['note','profile'].includes(op.kind) ? { conflict: conflictRecord(op, row) } : {}) });
          if (!['note','profile'].includes(op.kind)) { save(null); return; }
          const row = op.kind === 'note' ? t.objectStore('notes').get(op.entityId) :
            t.objectStore('meta').get('accountProfile');
          row.onsuccess = () => save(row.result);
        };
      });
    }
    async ack(op, result) {
      if (op.kind === 'note' && (!Number.isSafeInteger(result?.revision) || result.revision < 1)) {
        throw new Error('Invalid note acknowledgement');
      }
      // Clear the acknowledged mutation and rebase the next local operation
      // atomically; the current user-visible note remains dirty until all
      // changes for it are committed. Concurrent remote changes still 409.
      return tx(this.db, ['outbox','notes','meta'], 'readwrite', t => {
        const outbox = t.objectStore('outbox');
        outbox.delete(op.id);
        if (op.resolves) {
          const meta = t.objectStore('meta'), archive = meta.get(resolutionKey(op.resolves));
          archive.onsuccess = () => {
            if (archive.result?.operation.id === op.id)
              meta.put({ ...archive.result, acknowledgment: { revision: result.revision } }, resolutionKey(op.resolves));
          };
        }
        if (op.kind === 'profile') {
          if (!Number.isSafeInteger(result?.revision) || result.revision < 1) { t.abort(); return; }
          const queue = outbox.getAll();
          queue.onsuccess = () => {
            const next = queue.result.filter(x => x.kind === 'profile' && x.state === 'pending')
              .sort(core.compare)[0];
            const base = version(result.revision, op.data);
            if (next) outbox.put({ ...next, expectedRevision:result.revision, base });
            const meta = t.objectStore('meta');
            const current = meta.get('accountProfile');
            current.onsuccess = () => {
              if (current.result) meta.put({ ...current.result, base,
                remote: current.result.remote?.revision > result.revision ? current.result.remote : null,
                revision:Math.max(current.result.revision,result.revision),
                dirty:queue.result.some(x => x.kind === 'profile') ||
                  canonical(current.result.data) !== canonical(op.data)
              },'accountProfile');
            };
          };
          return;
        }
        if (op.kind !== 'note' || !Number.isSafeInteger(result?.revision)) return;
        const q = outbox.getAll();
        q.onsuccess = () => {
          const next = q.result.filter(x => x.entityId === op.entityId && x.kind === 'note' && x.state === 'pending')
            .sort(core.compare)[0];
          if (next) {
            outbox.put({ ...next, expectedRevision: result.revision,
              base: acknowledgedVersion(op, result.revision) });
          }
          const notes = t.objectStore('notes');
          const nr = notes.get(op.entityId);
          nr.onsuccess = () => {
            if (!nr.result) return;
            // Avoid marking clean when a later local snapshot was staged.
            // The immutable review/retraction ledger has its own pending state.
            // Only unacknowledged NOTE snapshots make the note projection dirty.
            const clean = !q.result.some(x => x.entityId === op.entityId && x.kind === 'note') &&
              JSON.stringify(nr.result.data) === JSON.stringify(op.data) &&
              Boolean(nr.result.deleted) === Boolean(op.deleted);
            notes.put({ ...nr.result, revision: Math.max(nr.result.revision, result.revision), dirty: !clean,
              base: acknowledgedVersion(op, result.revision),
              remote: nr.result.remote?.revision > result.revision ? nr.result.remote : null });
          };
        };
      });
    }
    async stageNote(note, expectedRevision, deleted = false, review = null, createOnly = false) {
      if (!note || !note.id) throw new Error('Note ID required');
      const snapshot = deleted ? null : structuredClone(note);
      const op = { id: uuid(), requestId: uuid(), kind: 'note', entityId: note.id,
        data: snapshot, deleted, state: 'pending', attempts: 0, enqueuedAt: Date.now() };
      const reviewOp = review ? { id: uuid(), requestId: review.event_id, kind: 'review',
        entityId: note.id, data: structuredClone(review), enqueuedAt: op.enqueuedAt,
        state: 'pending', attempts: 0 } : null;
      if (review) op.reviewEventId = review.event_id;
      await tx(this.db, ['notes','reviews','outbox','meta'], 'readwrite', t => {
        const meta = t.objectStore('meta');
        const count = meta.get('sequence');
        count.onsuccess = () => {
          const previous = count.result ?? 0;
          if (!Number.isSafeInteger(previous) || previous < 0 || previous > Number.MAX_SAFE_INTEGER - 2) {
            t.abort(); return;
          }
          op.sequence = previous + 1;
          if (reviewOp) reviewOp.sequence = previous + 2;
          meta.put(previous + (reviewOp ? 2 : 1), 'sequence');
          const notes = t.objectStore('notes');
          const existing = notes.get(note.id);
          existing.onsuccess = () => {
            // A recovered new-card draft must never replace a committed card
            // whose reviews or text may have changed since the first attempt.
            if (createOnly && existing.result) { t.abort(); return; }
            op.expectedRevision = expectedRevision ?? existing.result?.revision ?? 0;
            if (!Number.isSafeInteger(op.expectedRevision) || op.expectedRevision < 0) { t.abort(); return; }
            op.base = baseVersion(existing.result, op.expectedRevision);
            notes.put({ ...existing.result, id: note.id, data: snapshot, deleted,
              revision: op.expectedRevision, base: op.base, dirty: true });
            t.objectStore('outbox').add(op);
            if (reviewOp) {
              t.objectStore('reviews').add(review);
              t.objectStore('outbox').add(reviewOp);
            }
          };
        };
      });
      return op;
    }
    async stageReview(note, entry, expectedRevision) {
      if (!note?.id || !Array.isArray(entry) || entry.length < 7 ||
          !/^[0-9a-f-]{36}$/i.test(entry[6]) ||
          !note.log?.some(x => x[6] === entry[6])) throw new Error('A snapshot and stable review ID are required');
      const event = { event_id: entry[6], note_id: note.id, ordinal: Number(entry[1]),
        occurred_at_ms: Number(entry[0]), grade: Number(entry[2]), state_before: Number(entry[3]),
        duration_ms: Number(entry[4]), kind: Number(entry[5]),
        scheduling_provenance: entry[7] && typeof entry[7] === 'object' ? structuredClone(entry[7]) : null };
      if (!['ordinal','occurred_at_ms','grade','state_before','duration_ms','kind'].every(k => Number.isSafeInteger(event[k])) ||
          event.ordinal < 0 || event.occurred_at_ms <= 0 || event.grade < 1 || event.grade > 4 ||
          event.state_before < 0 || event.state_before > 3 || event.duration_ms < 0 || ![0,1].includes(event.kind)) {
        throw new Error('Invalid review event');
      }
      // Snapshot, event, both outbound operations and sequence commit together.
      return this.stageNote(note, expectedRevision, false, event);
    }
    // Undo is a single durable transaction: restore the note snapshot and
    // append a retraction. The original review remains permanently recorded.
    // Standalone retractions (without a note snapshot) are also supported.
    async stageRetraction(targetEventId, reason = 'undo', restoredNote = null, expectedRevision) {
      if (!/^[0-9a-f-]{36}$/i.test(targetEventId) ||
          !['undo','correction','reset'].includes(reason)) throw new Error('Invalid retraction');
      if (restoredNote && typeof restoredNote.id !== 'string')
        throw new Error('Undo requires the original note ID');
      const snapshot = restoredNote ? structuredClone(restoredNote) : null;
      const row = { retraction_id: uuid(), target_event_id: targetEventId, reason };
      const op = { id: uuid(), requestId: row.retraction_id, kind: 'retraction',
        entityId: targetEventId, data: row, state: 'pending', attempts: 0, enqueuedAt: Date.now() };
      const noteOp = snapshot ? { id: uuid(), requestId: uuid(), kind: 'note',
        entityId: snapshot.id, data: snapshot, deleted: false, state: 'pending',
        attempts: 0, enqueuedAt: op.enqueuedAt } : null;
      await tx(this.db, ['notes','reviews','retractions','outbox','meta'], 'readwrite', t => {
        const target = t.objectStore('reviews').get(targetEventId);
        target.onsuccess = () => {
          if (!target.result || (snapshot && target.result.note_id !== snapshot.id)) { t.abort(); return; }
          const existing = t.objectStore('retractions').getAll();
          existing.onsuccess = () => {
            if (existing.result.some(x => x.target_event_id === targetEventId)) { t.abort(); return; }
            const counter = t.objectStore('meta').get('sequence');
            counter.onsuccess = () => {
              const previous = counter.result ?? 0;
              const needed = noteOp ? 2 : 1;
              if (!Number.isSafeInteger(previous) || previous < 0 ||
                  previous > Number.MAX_SAFE_INTEGER - needed) { t.abort(); return; }
              t.objectStore('meta').put(previous + needed, 'sequence');
              op.entityId = target.result.note_id;
              op.sequence = previous + needed;
              const finish = () => {
                t.objectStore('retractions').add(row);
                t.objectStore('outbox').add(op);
              };
              if (!noteOp) { finish(); return; }
              const notes = t.objectStore('notes');
              const current = notes.get(snapshot.id);
              current.onsuccess = () => {
                if (!current.result || current.result.deleted) { t.abort(); return; }
                noteOp.expectedRevision = expectedRevision ?? current.result.revision;
                if (!Number.isSafeInteger(noteOp.expectedRevision) || noteOp.expectedRevision < 0) {
                  t.abort(); return;
                }
                noteOp.sequence = previous + 1;
                noteOp.base = baseVersion(current.result, noteOp.expectedRevision);
                notes.put({ ...current.result, id: snapshot.id, data: snapshot, deleted: false,
                  revision: noteOp.expectedRevision, base: noteOp.base, dirty: true });
                t.objectStore('outbox').add(noteOp);
                finish();
              };
            };
          };
        };
      });
      return op;
    }
    async stageUndo(restoredNote, targetEventId, expectedRevision) {
      return this.stageRetraction(targetEventId, 'undo', restoredNote, expectedRevision);
    }
    async retractions() { return request(this.db.transaction('retractions').objectStore('retractions').getAll()); }
    async ingestRetraction(row) {
      return tx(this.db, ['retractions'], 'readwrite', t => {
        const store = t.objectStore('retractions');
        const req = store.get(row.retraction_id);
        req.onsuccess = () => {
          if (!req.result) store.add(row);
          else if (!sameFields(req.result, row,
              ['retraction_id','target_event_id','reason'])) t.abort();
        };
      });
    }
    async inspectAgainst(localNotes) {
      // Read-only account/local comparison. Never merge distinct card histories.
      const rows = await this.notes();
      const account = new Map(rows.map(row => [row.id, row]));
      const local = new Map(localNotes.map(note => [note.id, note]));
      const result = { localOnly: 0, accountOnly: 0, identical: 0,
        divergent: 0, cloudTombstone: 0, dirtyAccount: 0,
        legacyHistory: 0 };
      for (const row of rows) {
        if (row.dirty) result.dirtyAccount++;
        if (!row.deleted && Array.isArray(row.data?.log) && row.data.log.length)
          result.legacyHistory++;
      }
      for (const [id, note] of local) {
        const remote = account.get(id);
        if (!remote) { result.localOnly++; continue; }
        if (remote.deleted) { result.cloudTombstone++; continue; }
        if (canonical(note) === canonical(remote.data)) result.identical++;
        else result.divergent++;
      }
      for (const row of rows) {
        if (!local.has(row.id) && !row.deleted) result.accountOnly++;
      }
      return result;
    }
    async profile() { return request(this.db.transaction('meta').objectStore('meta').get('accountProfile')); }
    async stageProfile(data) {
      const snapshot = structuredClone(data);
      if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot))
        throw new Error('Invalid account profile');
      const op = { id: uuid(), requestId: uuid(), kind: 'profile', entityId: 'profile',
        data: snapshot, state: 'pending', attempts: 0, enqueuedAt: Date.now() };
      await tx(this.db, ['meta','outbox'], 'readwrite', t => {
        const meta = t.objectStore('meta');
        const old = meta.get('accountProfile');
        old.onsuccess = () => {
          const prior = old.result || { revision: 0 };
          const seq = meta.get('sequence');
          seq.onsuccess = () => {
            const n = (seq.result ?? 0) + 1;
            if (!Number.isSafeInteger(n)) { t.abort(); return; }
            op.sequence = n;
            op.expectedRevision = prior.revision;
            op.base = baseVersion(old.result, op.expectedRevision);
            meta.put(n,'sequence');
            meta.put({ ...prior, data:snapshot, revision:prior.revision, base:op.base, dirty:true },'accountProfile');
            t.objectStore('outbox').add(op);
          };
        };
      });
      return op;
    }
    async ingestRemoteProfile(row) {
      if (row && (row.user_id !== this.userId || !Number.isSafeInteger(row.revision) ||
          row.revision < 1 || !row.data || typeof row.data !== 'object' ||
          Array.isArray(row.data))) throw new Error('Invalid account profile');
      return tx(this.db, ['meta','outbox'], 'readwrite', t => {
        const meta = t.objectStore('meta');
        const existing = meta.get('accountProfile');
        existing.onsuccess = () => {
          const old = existing.result;
          const remote = row ? version(row.revision, row.data) : version(0, null);
          if (old?.dirty) {
            if (!retainRemote(t, old, remote)) return;
            meta.put({ ...old, remote }, 'accountProfile');
            refreshConflicts(t, 'profile', 'profile', remote);
            return;
          }
          if (!row) { meta.delete('accountProfile'); return; }
          if (old && old.revision > row.revision) return;
          if (old && old.revision === row.revision && canonical(old.data) !== canonical(row.data)) {
            t.abort(); return;
          }
          meta.put({ data: row.data, revision: row.revision,
            updatedAt: row.updated_at, dirty: false }, 'accountProfile');
        };
      });
    }
    async notes() { return request(this.db.transaction('notes').objectStore('notes').getAll()); }
    async reviews() { return request(this.db.transaction('reviews').objectStore('reviews').getAll()); }
    async ingestRemoteNote(row) {
      if (!row?.id || !Number.isSafeInteger(row.revision) || row.revision < 1 ||
          (!row.deleted_at && (!row.data || typeof row.data !== 'object' || Array.isArray(row.data))))
        throw new Error('Invalid remote note');
      return tx(this.db, ['notes','outbox'], 'readwrite', t => {
        const s = t.objectStore('notes');
        const r = s.get(row.id);
        r.onsuccess = () => {
          const local = r.result;
          const remote = version(row.revision, row.data, Boolean(row.deleted_at));
          if (!retainRemote(t, local, remote)) return;
          if (local?.dirty) {
            s.put({ ...local, remote });
            refreshConflicts(t, 'note', row.id, remote);
          } else s.put({ id: row.id, data: row.data, deleted: remote.deleted,
            revision: row.revision, dirty: false });
          // Pulling never rejects a pending request: it may have committed with
          // a lost acknowledgement. Retry its original ID before declaring conflict.
        };
      });
    }
    async ingestReview(row) {
      if (!row || !row.event_id) throw new Error('Remote review ID missing');
      return tx(this.db, ['reviews'], 'readwrite', t => {
        const s = t.objectStore('reviews');
        const r = s.get(row.event_id);
        r.onsuccess = () => {
          if (!r.result) s.add(row);
          else if (!sameFields(r.result, row, eventFields)) t.abort();
        };
      });
    }
  }
  class SupabaseTransport {
    constructor(supabase, userId, active = () => true) { this.supabase = supabase; this.userId = userId; this.active = active; }
    async send(op) {
      const token = await accountToken(this.supabase, this.userId, this.active);
      if (op.kind === 'profile') {
        const {data,error} = await this.supabase.rpc('commit_profile',{
          p_expected_revision:op.expectedRevision,p_request_id:op.requestId,p_data:op.data
        }).setHeader('Authorization','Bearer '+token);
        if (error) throw error;
        return {revision:Number(data)};
      }
      if (op.kind === 'note') {
        const { data, error } = await this.supabase.rpc('commit_note', {
          p_note_id: op.entityId, p_expected_revision: op.expectedRevision,
          p_request_id: op.requestId, p_data: op.data, p_delete: Boolean(op.deleted)
        }).setHeader('Authorization', 'Bearer ' + token);
        if (error) throw error;
        return { revision: Number(data) };
      }
      if (op.kind === 'review') {
        const { error } = await this.supabase.from('review_events')
          .upsert({ ...op.data, user_id: this.userId }, { onConflict: 'user_id,event_id', ignoreDuplicates: true }).setHeader('Authorization', 'Bearer ' + token);
        if (error) throw error;
        return { eventId: op.data.event_id };
      }
      if (op.kind === 'retraction') {
        const { error } = await this.supabase.from('review_retractions')
          .upsert({ ...op.data, user_id: this.userId },
            { onConflict: 'user_id,retraction_id', ignoreDuplicates: true })
          .setHeader('Authorization', 'Bearer ' + token);
        if (error) throw error;
        return { retractionId: op.data.retraction_id };
      }
      if (op.kind === 'plan') {
        const { data, error } = await this.supabase.rpc('publish_study_plan', op.data).setHeader('Authorization', 'Bearer ' + token);
        if (error) throw error;
        return { revision: Number(data) };
      }
      throw new Error('Unsupported operation: ' + op.kind);
    }
  }
  async function accountToken(supabase, userId, active = () => true) {
    if (!active()) throw new Error('not_authenticated: account closed');
    const { data, error } = await supabase.auth.getSession();
    if (error || !active() || data?.session?.user?.id !== userId || !data.session.access_token) {
      throw new Error('not_authenticated: account changed');
    }
    // Bind this request to this JWT. The shared Supabase client may change users
    // while its async fetch obtains an access token; an explicit header survives that race.
    return data.session.access_token;
  }
  async function pullAll(supabase, userId, storage, active = () => true) {
    for (const [table, key, columns, ingest] of [
      ['notes','id','id,data,revision,deleted_at', row => storage.ingestRemoteNote(row)],
      ['review_events','event_id','event_id,note_id,ordinal,occurred_at_ms,grade,state_before,duration_ms,kind,scheduling_provenance', row => storage.ingestReview(row)],
      ['review_retractions','retraction_id','retraction_id,target_event_id,reason,recorded_at', row => storage.ingestRetraction(row)]
    ]) {
      let cursor = null;
      for (;;) {
        const token = await accountToken(supabase, userId, active);
        let query = supabase.from(table).select(columns).eq('user_id', userId)
          .order(key, { ascending: true }).limit(500);
        if (cursor !== null) query = query.gt(key, cursor);
        const { data, error } = await query.setHeader('Authorization', 'Bearer ' + token);
        if (error) throw error;
        if (!active()) throw new Error('not_authenticated: account closed');
        for (const row of data || []) {
          if (!active()) throw new Error('not_authenticated: account closed');
          await ingest(row);
        }
        if (!data || data.length < 500) break;
        cursor = data[data.length - 1][key];
      }
    }
    // Profiles have a single owner-scoped row and are read into the account
    // namespace only; versioned profile writes are not activated yet.
    const profileToken = await accountToken(supabase, userId, active);
    const { data: profiles, error: profileError } = await supabase.from('profiles')
      .select('user_id,data,revision,updated_at').eq('user_id', userId)
      .limit(1).setHeader('Authorization', 'Bearer ' + profileToken);
    if (profileError) throw profileError;
    if (!active()) throw new Error('not_authenticated: account closed');
    await storage.ingestRemoteProfile(profiles?.[0] || null);
    if (!active()) throw new Error('not_authenticated: account closed');
    // Full scans must repeat on invalidation/resume. Inserts behind this cursor
    // are seen on the next scan; this is NOT a durable incremental change cursor.
  }
  async function startAccount(supabase, userId, notify = () => {}) {
    if (!globalThis.navigator?.locks) throw new Error('Safe sync requires Web Locks');
    await accountToken(supabase, userId);
    const db = await openAccountDB(userId);
    let active = true;
    const storage = new AccountStorage(db, userId);
    const outbox = new core.Processor(storage, new SupabaseTransport(supabase, userId, () => active), notify);
    const flush = outbox.flush.bind(outbox);
    outbox.flush = () => navigator.locks.request('lemma-sync-' + userId, () => flush());
    let subscription;
    const close = () => {
      active = false; outbox.stopped = true; db.close(); subscription?.unsubscribe();
    };
    subscription = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user?.id !== userId) close();
    }).data.subscription;
    try { await accountToken(supabase, userId, () => active); }
    catch (error) { close(); throw error; }
    return { storage, outbox, pull: () => navigator.locks.request('lemma-sync-' + userId, () => pullAll(supabase, userId, storage, () => active)), close, userId };
  }
  return { openAccountDB, AccountStorage, SupabaseTransport, accountToken, pullAll, startAccount };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = LemmaCloud;
