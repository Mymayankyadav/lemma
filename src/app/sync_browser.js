/* Lemma Phase 2: browser + Capacitor offline sync primitives.
 * This is a standalone integration layer. The existing app Store remains active
 * until auth UI, event migration and two-device tests are complete.
 * No service-role key or elevated database access is used here.
 */
const LemmaCloud = (() => {
  const dbVersion = 1;
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
      if (!d.objectStoreNames.contains('outbox')) d.createObjectStore('outbox', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta');
    };
    return request(req);
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
  const uuid = () => {
    if (!globalThis.crypto || !globalThis.crypto.randomUUID) throw new Error('Secure random UUID unavailable');
    return globalThis.crypto.randomUUID();
  };
  class AccountStorage {
    constructor(db, userId) { this.db = db; this.userId = userId; }
    async list() { return request(this.db.transaction('outbox').objectStore('outbox').getAll()); }
    async get(id) { return request(this.db.transaction('outbox').objectStore('outbox').get(id)); }
    async put(op) { return tx(this.db, ['outbox'], 'readwrite', t => t.objectStore('outbox').put(op)); }
    async delete(id) { return tx(this.db, ['outbox'], 'readwrite', t => t.objectStore('outbox').delete(id)); }
    async ack(op, result) {
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
            .sort((a,b) => (a.enqueuedAt-b.enqueuedAt) || a.id.localeCompare(b.id))[0];
          if (next) {
            outbox.put({ ...next, expectedRevision: result.revision });
          }
          const notes = t.objectStore('notes');
          const nr = notes.get(op.entityId);
          nr.onsuccess = () => {
            if (!nr.result) return;
            // Avoid marking clean when a later local snapshot was staged.
            const clean = !next && JSON.stringify(nr.result.data) === JSON.stringify(op.data)
              && Boolean(nr.result.deleted) === Boolean(op.deleted);
            notes.put({ ...nr.result, revision: result.revision, dirty: !clean });
          };
        };
      });
    }
    async stageNote(note, expectedRevision = 0, deleted = false) {
      if (!note || !note.id) throw new Error('Note ID required');
      const op = { id: uuid(), requestId: uuid(), kind: 'note', entityId: note.id,
        expectedRevision, data: deleted ? null : structuredClone(note), deleted,
        state: 'pending', attempts: 0, enqueuedAt: Date.now() };
      // Local view + durable outbound change commit as ONE IndexedDB transaction.
      await tx(this.db, ['notes','outbox'], 'readwrite', t => {
        t.objectStore('notes').put({ id: note.id, data: op.data, deleted, revision: expectedRevision, dirty: true });
        t.objectStore('outbox').put(op);
      });
      return op;
    }
    async stageReview(noteId, entry) {
      if (!noteId || !Array.isArray(entry) || entry.length < 6) throw new Error('Invalid review event');
      const event = { event_id: (entry[6] && /^[0-9a-f-]{36}$/i.test(entry[6])) ? entry[6] : uuid(),
        note_id: noteId, ordinal: Number(entry[1]), occurred_at_ms: Number(entry[0]),
        grade: Number(entry[2]), state_before: Number(entry[3]),
        duration_ms: Number(entry[4]), kind: Number(entry[5]) || 0 };
      const op = { id: uuid(), requestId: event.event_id, kind: 'review',
        entityId: noteId, data: event, enqueuedAt: Date.now(), state: 'pending', attempts: 0 };
      await tx(this.db, ['reviews','outbox'], 'readwrite', t => {
        t.objectStore('reviews').put(event);
        t.objectStore('outbox').put(op);
      });
      return op;
    }
    async notes() { return request(this.db.transaction('notes').objectStore('notes').getAll()); }
    async reviews() { return request(this.db.transaction('reviews').objectStore('reviews').getAll()); }
    async ingestRemoteNote(row) {
      return tx(this.db, ['notes'], 'readwrite', t => {
        const s = t.objectStore('notes');
        const r = s.get(row.id);
        r.onsuccess = () => {
          const local = r.result;
          if (!local || !local.dirty) s.put({ id: row.id, data: row.data, deleted: Boolean(row.deleted_at), revision: row.revision, dirty: false });
          // Dirty data is NEVER overwritten by a remote snapshot.
        };
      });
    }
    async ingestReview(row) { return tx(this.db, ['reviews'], 'readwrite', t => t.objectStore('reviews').put(row)); }
  }
  class SupabaseTransport {
    constructor(supabase, userId) { this.supabase = supabase; this.userId = userId; }
    async send(op) {
      if (op.kind === 'note') {
        const { data, error } = await this.supabase.rpc('commit_note', {
          p_note_id: op.entityId, p_expected_revision: op.expectedRevision,
          p_request_id: op.requestId, p_data: op.data, p_delete: Boolean(op.deleted)
        });
        if (error) throw error;
        return { revision: Number(data) };
      }
      if (op.kind === 'review') {
        const { error } = await this.supabase.from('review_events')
          .upsert({ ...op.data, user_id: this.userId }, { onConflict: 'user_id,event_id', ignoreDuplicates: true });
        if (error) throw error;
        return { eventId: op.data.event_id };
      }
      if (op.kind === 'plan') {
        const { data, error } = await this.supabase.rpc('publish_study_plan', op.data);
        if (error) throw error;
        return { revision: Number(data) };
      }
      throw new Error('Unsupported operation: ' + op.kind);
    }
  }
  async function pullAll(supabase, userId, storage) {
    // First version uses bounded pages, not an unsafe timestamp cursor. Realtime
    // notifications are only refresh triggers; this also runs on reconnect.
    let offset = 0;
    for (;;) {
      const { data, error } = await supabase.from('notes')
        .select('id,data,revision,deleted_at').eq('user_id', userId)
        .order('id', { ascending: true }).range(offset, offset + 499);
      if (error) throw error;
      for (const row of data || []) await storage.ingestRemoteNote(row);
      if (!data || data.length < 500) break;
      offset += 500;
    }
    offset = 0;
    for (;;) {
      const { data, error } = await supabase.from('review_events')
        .select('event_id,note_id,ordinal,occurred_at_ms,grade,state_before,duration_ms,kind')
        .eq('user_id', userId).order('event_id', { ascending: true }).range(offset, offset + 499);
      if (error) throw error;
      for (const row of data || []) await storage.ingestReview(row);
      if (!data || data.length < 500) break;
      offset += 500;
    }
  }
  async function startAccount(supabase, userId, notify = () => {}) {
    const db = await openAccountDB(userId);
    const storage = new AccountStorage(db, userId);
    const outbox = new LemmaOutboxCore.Processor(storage, new SupabaseTransport(supabase, userId), notify);
    return { storage, outbox, pull: () => pullAll(supabase, userId, storage),
      close: () => db.close(),
      // Caller controls auth; never silently transfer anonymous data into an account.
      userId };
  }
  return { openAccountDB, AccountStorage, SupabaseTransport, pullAll, startAccount };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = LemmaCloud;
