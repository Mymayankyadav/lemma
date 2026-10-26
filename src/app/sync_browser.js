/* Phase 2 standalone browser transport. The active app Store is not yet switched
 * over. Supabase uses a PUBLIC publishable key and owner-only RLS. */
const LemmaCloud = (() => {
  function request(r) {
    return new Promise((resolve, reject) => {
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  function transaction(db, names, mode, callback) {
    return new Promise((resolve, reject) => {
      const t = db.transaction(names, mode);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error || new Error('IndexedDB transaction failed'));
      t.onabort = () => reject(t.error || new Error('IndexedDB transaction aborted'));
      try { callback(t); } catch (err) { t.abort(); reject(err); }
    });
  }
  async function openAccountDB(userId) {
    if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error('Invalid authenticated user ID');
    const r = indexedDB.open('lemma-user-' + userId, 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      for (const [name, keyPath] of [['notes','id'],['reviews','event_id'],['outbox','id']])
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
    };
    return request(r);
  }
  function uuid() {
    if (!globalThis.crypto?.randomUUID) throw new Error('Secure UUID required');
    return globalThis.crypto.randomUUID();
  }
  class AccountStorage {
    constructor(db, userId) { this.db = db; this.userId = userId; }
    async list() { return request(this.db.transaction('outbox').objectStore('outbox').getAll()); }
    async get(id) { return request(this.db.transaction('outbox').objectStore('outbox').get(id)); }
    async put(op) { return transaction(this.db, ['outbox'], 'readwrite', t => t.objectStore('outbox').put(op)); }
    async delete(id) { return transaction(this.db, ['outbox'], 'readwrite', t => t.objectStore('outbox').delete(id)); }
    async ack(op, result) {
      return transaction(this.db, ['outbox','notes'], 'readwrite', t => {
        const outbox = t.objectStore('outbox');
        outbox.delete(op.id);
        if (op.kind !== 'note' || !Number.isSafeInteger(result?.revision)) return;
        const q = outbox.getAll();
        q.onsuccess = () => {
          const next = q.result.filter(x => x.entityId === op.entityId &&
            x.kind === 'note' && x.state === 'pending')
            .sort((a,b) => (a.enqueuedAt-b.enqueuedAt) || a.id.localeCompare(b.id))[0];
          if (next) outbox.put({ ...next, expectedRevision: result.revision });
          const notes = t.objectStore('notes');
          const nr = notes.get(op.entityId);
          nr.onsuccess = () => {
            if (!nr.result) return;
            const clean = !next && JSON.stringify(nr.result.data) === JSON.stringify(op.data) &&
              Boolean(nr.result.deleted) === Boolean(op.deleted);
            notes.put({ ...nr.result, revision: result.revision, dirty: !clean });
          };
        };
      });
    }
    async stageNote(note, expectedRevision = 0, deleted = false) {
      if (!note?.id) throw new Error('Note ID required');
      const op = { id: uuid(), requestId: uuid(), kind: 'note', entityId: note.id,
        expectedRevision, data: deleted ? null : structuredClone(note), deleted,
        state: 'pending', attempts: 0, enqueuedAt: Date.now() };
      await transaction(this.db, ['notes','outbox'], 'readwrite', t => {
        t.objectStore('notes').put({ id: note.id, data: op.data, deleted,
          revision: expectedRevision, dirty: true });
        t.objectStore('outbox').put(op);
      });
      return op;
    }
    async stageReview(noteId, entry) {
      if (!noteId || !Array.isArray(entry) || entry.length < 6) throw new Error('Invalid review');
      const event = { event_id: /^[0-9a-f-]{36}$/i.test(entry[6] || '') ? entry[6] : uuid(),
        note_id: noteId, ordinal: Number(entry[1]), occurred_at_ms: Number(entry[0]),
        grade: Number(entry[2]), state_before: Number(entry[3]),
        duration_ms: Number(entry[4]), kind: Number(entry[5]) || 0 };
      const op = { id: uuid(), requestId: event.event_id, kind: 'review',
        entityId: noteId, data: event, state: 'pending', attempts: 0, enqueuedAt: Date.now() };
      await transaction(this.db, ['reviews','outbox'], 'readwrite', t => {
        t.objectStore('reviews').put(event);
        t.objectStore('outbox').put(op);
      });
      return op;
    }
    async notes() { return request(this.db.transaction('notes').objectStore('notes').getAll()); }
    async reviews() { return request(this.db.transaction('reviews').objectStore('reviews').getAll()); }
    async ingestRemoteNote(row) {
      return transaction(this.db, ['notes'], 'readwrite', t => {
        const store = t.objectStore('notes');
        const r = store.get(row.id);
        r.onsuccess = () => {
          if (!r.result || !r.result.dirty)
            store.put({ id: row.id, data: row.data, deleted: Boolean(row.deleted_at),
              revision: row.revision, dirty: false });
        };
      });
    }
    async ingestReview(row) {
      return transaction(this.db, ['reviews'], 'readwrite', t => t.objectStore('reviews').put(row));
    }
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
          .upsert({ ...op.data, user_id: this.userId },
            { onConflict: 'user_id,event_id', ignoreDuplicates: true });
        if (error) throw error;
        return { eventId: op.data.event_id };
      }
      if (op.kind === 'plan') {
        const { data, error } = await this.supabase.rpc('publish_study_plan', op.data);
        if (error) throw error;
        return { revision: Number(data) };
      }
      throw new Error('Unsupported operation');
    }
  }
  async function pullAll(supabase, userId, storage) {
    for (const [table, columns, callback] of [
      ['notes','id,data,revision,deleted_at',r => storage.ingestRemoteNote(r)],
      ['review_events','event_id,note_id,ordinal,occurred_at_ms,grade,state_before,duration_ms,kind',
        r => storage.ingestReview(r)]
    ]) {
      let offset = 0;
      for (;;) {
        const key = table === 'notes' ? 'id' : 'event_id';
        const { data, error } = await supabase.from(table).select(columns)
          .eq('user_id', userId).order(key, { ascending: true }).range(offset, offset + 499);
        if (error) throw error;
        for (const item of data || []) await callback(item);
        if (!data || data.length < 500) break;
        offset += 500;
      }
    }
  }
  async function startAccount(supabase, userId, notify = () => {}) {
    const db = await openAccountDB(userId);
    const storage = new AccountStorage(db, userId);
    const outbox = new LemmaOutboxCore.Processor(storage, new SupabaseTransport(supabase, userId), notify);
    return { storage, outbox, pull: () => pullAll(supabase, userId, storage),
      close: () => db.close(), userId };
  }
  return { openAccountDB, AccountStorage, SupabaseTransport, pullAll, startAccount };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = LemmaCloud;
