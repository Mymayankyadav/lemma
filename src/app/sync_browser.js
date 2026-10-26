/* Lemma Phase 2: browser + Capacitor offline sync primitives.
 * This is a standalone integration layer. The existing app Store remains active
 * until auth UI, event migration and two-device tests are complete.
 * No service-role key or elevated database access is used here.
 */
const LemmaCloud = (() => {
  const core = typeof module !== 'undefined' && module.exports ? require('./outbox_core.js') : LemmaOutboxCore;
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
  class AccountStorage {
    constructor(db, userId) { this.db = db; this.userId = userId; }
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
    async ack(op, result) {
      if (op.kind === 'note' && (!Number.isSafeInteger(result?.revision) || result.revision < 1)) {
        throw new Error('Invalid note acknowledgement');
      }
      // Clear the acknowledged mutation and rebase the next local operation
      // atomically; the current user-visible note remains dirty until all
      // changes for it are committed. Concurrent remote changes still 409.
      return tx(this.db, ['outbox','notes'], 'readwrite', t => {
        const outbox = t.objectStore('outbox');
        outbox.delete(op.id);
        if (op.kind !== 'note' || !Number.isSafeInteger(result?.revision)) return;
        const q = outbox.getAll();
        q.onsuccess = () => {
          const next = q.result.filter(x => x.entityId === op.entityId && x.kind === 'note' && x.state === 'pending')
            .sort(core.compare)[0];
          if (next) {
            outbox.put({ ...next, expectedRevision: result.revision });
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
            notes.put({ ...nr.result, revision: Math.max(nr.result.revision, result.revision), dirty: !clean });
          };
        };
      });
    }
    async stageNote(note, expectedRevision, deleted = false, review = null) {
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
            op.expectedRevision = expectedRevision ?? existing.result?.revision ?? 0;
            if (!Number.isSafeInteger(op.expectedRevision) || op.expectedRevision < 0) { t.abort(); return; }
            notes.put({ id: note.id, data: snapshot, deleted, revision: op.expectedRevision, dirty: true });
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
                notes.put({ id: snapshot.id, data: snapshot, deleted: false,
                  revision: noteOp.expectedRevision, dirty: true });
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
    async ingestRemoteProfile(row) {
      if (row && (row.user_id !== this.userId || !Number.isSafeInteger(row.revision) ||
          row.revision < 1 || !row.data || typeof row.data !== 'object' ||
          Array.isArray(row.data))) throw new Error('Invalid account profile');
      return tx(this.db, ['meta'], 'readwrite', t => {
        const meta = t.objectStore('meta');
        const existing = meta.get('accountProfile');
        existing.onsuccess = () => {
          const old = existing.result;
          if (old?.dirty) return;
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
      return tx(this.db, ['notes'], 'readwrite', t => {
        const s = t.objectStore('notes');
        const r = s.get(row.id);
        r.onsuccess = () => {
          const local = r.result;
          if (!local || (!local.dirty && row.revision > local.revision)) s.put({ id: row.id, data: row.data, deleted: Boolean(row.deleted_at), revision: row.revision, dirty: false });
          // Dirty data is NEVER overwritten by a remote snapshot.
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
    return { storage, outbox, pull: () => pullAll(supabase, userId, storage, () => active), close, userId };
  }
  return { openAccountDB, AccountStorage, SupabaseTransport, accountToken, pullAll, startAccount };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = LemmaCloud;
