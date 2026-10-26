/* ---------- persistence: Claude account (db capability) with a browser fallback ---------- */
const Store = (() => {
  const IDB_NAME = 'lemma-flashcards';
  let mode = 'loading'; // 'cloud' | 'local' | 'memory'
  let reason = '';
  let db = null, uid = null, profileRef = null, notesCol = null;
  let idb = null;
  let handlers = { notes() {}, profile() {}, status() {} };
  const queue = new Map(); // id -> {busy, next}
  let active = 0;
  const waiting = [];
  const MAX_CONCURRENT = 4;
  let pendingCount = 0;
  let offline = false;
  let profileTimer = null, profilePending = null, profileBusy = false;
  const localWrites = new Set();
  const localErrors = new Map();
  const localGenerations = new Map();
  // Explicit future account-workspace mode. Not selected by ordinary sign-in.
  let accountHandle = null;

  // ----- IndexedDB -----
  function idbOpen() {
    return new Promise((resolve, reject) => {
      let req;
      try { req = indexedDB.open(IDB_NAME, 1); } catch (e) { reject(e); return; }
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('notes')) d.createObjectStore('notes', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('blocked'));
    });
  }
  function idbTx(store, modeRW, fn) {
    return new Promise((resolve, reject) => {
      try {
        const tx = idb.transaction(store, modeRW);
        const st = tx.objectStore(store);
        const r = fn(st);
        tx.oncomplete = () => resolve(r && 'result' in r ? r.result : undefined);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      } catch (e) { reject(e); }
    });
  }
  const idbAll = (store) => idbTx(store, 'readonly', (st) => st.getAll());
  const idbGet = (store, key) => idbTx(store, 'readonly', (st) => st.get(key));
  const idbPut = (store, value, key) => idbTx(store, 'readwrite', (st) => (key === undefined ? st.put(value) : st.put(value, key)));
  const idbAdd = (store, value) => idbTx(store, 'readwrite', (st) => st.add(value));
  const idbDel = (store, key) => idbTx(store, 'readwrite', (st) => st.delete(key));
  const idbClear = (store) => idbTx(store, 'readwrite', (st) => st.clear());

  function status() {
    return { mode, reason, pending: pendingCount + localWrites.size + (profilePending || profileBusy ? 1 : 0),
      failed: localErrors.size, offline };
  }
  const emitStatus = () => handlers.status(status());

  async function useCap(name, ms) {
    if (!window.claude || typeof window.claude.use !== 'function') return null;
    return Promise.race([
      window.claude.use(name).catch(() => null),
      new Promise((r) => setTimeout(() => r(null), ms)),
    ]);
  }

  async function init(h) {
    handlers = Object.assign(handlers, h);
    const [dbCap, userCap] = await Promise.all([useCap('db', 9000), useCap('user', 9000)]);
    if (dbCap && userCap) {
      try { uid = await userCap.id(); } catch (e) { uid = null; }
    }
    if (dbCap && uid) {
      try { return await startCloud(dbCap); } catch (e) { reason = 'cloud-failed'; }
    }
    if (!reason) reason = dbCap ? 'signed-out' : 'no-account';
    return startLocal();
  }

  function startCloud(dbCap) {
    db = dbCap;
    mode = 'cloud';
    profileRef = db.doc('data/users/' + uid + '/profile');
    notesCol = profileRef.collection('notes');
    emitStatus();
    return new Promise((resolve) => {
      let settled = false, notesReady = false, profileReady = false;
      let profileData = null;
      const initial = new Map();
      const finish = () => {
        if (settled || !notesReady || !profileReady) return;
        settled = true;
        resolve({ notes: initial, profile: profileData, mode });
      };
      profileRef.onSnapshot((snap) => {
        const data = snap.exists ? clone(snap.data()) : null;
        if (!profileReady) { profileData = data; profileReady = true; finish(); return; }
        if (!profileBusy && !profilePending && data) handlers.profile(data);
      }, (err) => fatal(err));
      notesCol.onSnapshot((snap) => {
        if (!notesReady) {
          if (snap.metadata.fromCache && snap.empty) return; // wait for the server's answer
          for (const d of snap.docs) if (d.exists) initial.set(d.id, clone(d.data()));
          notesReady = true;
          finish();
          return;
        }
        const changes = [];
        for (const ch of snap.docChanges()) {
          const id = ch.doc.id;
          if (queue.has(id)) continue; // our own write is still in flight
          changes.push({ id, note: ch.type === 'removed' ? null : clone(ch.doc.data()) });
        }
        if (changes.length) handlers.notes(changes);
      }, (err) => fatal(err));
      setTimeout(() => { notesReady = true; profileReady = true; finish(); }, 10000);
    });
  }

  async function startLocal() {
    try {
      idb = await idbOpen();
      mode = 'local';
      const [notes, profile] = await Promise.all([idbAll('notes'), idbGet('meta', 'profile')]);
      const map = new Map();
      for (const n of notes || []) map.set(n.id, n);
      emitStatus();
      return { notes: map, profile: profile || null, mode };
    } catch (e) {
      mode = 'memory';
      reason = 'no-storage';
      emitStatus();
      return { notes: new Map(), profile: null, mode };
    }
  }

  function fatal(err) {
    const code = err && err.code;
    if (code === 'revoked' || code === 'not_granted' || code === 'capability_disabled' || code === 'capability_removed') {
      switchToLocal('revoked');
    } else if (code === 'unavailable') {
      offline = true; emitStatus();
    }
  }

  let switching = null;
  async function switchToLocal(why) {
    if (mode !== 'cloud' || switching) return switching;
    switching = (async () => {
      reason = why;
      try { idb = idb || await idbOpen(); mode = 'local'; } catch (e) { mode = 'memory'; }
      if (handlers.snapshotAll && mode === 'local') {
        const all = handlers.snapshotAll();
        for (const n of all.notes) await idbPut('notes', clone(n)).catch(() => {});
        if (all.profile) await idbPut('meta', clone(all.profile), 'profile').catch(() => {});
      }
      emitStatus();
      switching = null;
    })();
    return switching;
  }

  // ----- write queue: one write at a time per document, a few documents at once -----
  function acquire() {
    if (active < MAX_CONCURRENT) { active++; return Promise.resolve(); }
    return new Promise((r) => waiting.push(r));
  }
  function release() {
    const next = waiting.shift();
    if (next) next(); else active--;
  }
  // Begin the IndexedDB transaction immediately, without an in-memory queue or
  // debounce. Resolve only on transaction completion (request success is not enough).
  function durableLocal(key, write) {
    const generation = (localGenerations.get(key) || 0) + 1;
    localGenerations.set(key, generation);
    const promise = write();
    localWrites.add(promise);
    emitStatus();
    promise.then(() => {
      if (localGenerations.get(key) === generation) localErrors.delete(key);
    }, err => {
      if (localGenerations.get(key) === generation) localErrors.set(key, err);
      toast('Could not save to this browser’s storage. Keep this page open and export a backup.', { kind: 'error' });
    }).finally(() => {
      localWrites.delete(promise);
      emitStatus();
    });
    return promise;
  }
  function accountWrite(key, writer) {
    const handle = accountHandle;
    if (!handle || mode !== 'account')
      return Promise.reject(new Error('No active account workspace'));
    return durableLocal('account:' + handle.userId + ':' + key, async () => {
      if (accountHandle !== handle || LemmaAccount.user?.id !== handle.userId)
        throw new Error('Account changed before local write');
      const result = await writer(handle.storage);
      if (accountHandle === handle && typeof LemmaSync !== 'undefined') LemmaSync.kick();
      return result;
    });
  }
  function saveNote(note, opts = {}) {
    const data = clone(note);
    if (mode === 'account')
      return accountWrite('note:' + note.id, storage => storage.stageNote(data, undefined, false, null, !!opts.createOnly));
    if (mode === 'local') return durableLocal('note:' + note.id,
      () => opts.createOnly ? idbAdd('notes', data) : idbPut('notes', data));
    if (opts.durable && mode !== 'cloud')
      return Promise.reject(new Error('Persistent storage is unavailable'));
    return enqueue(note.id, data, opts.durable);
  }
  function saveReview(note, entry) {
    if (mode === 'account') {
      const snapshot = clone(note);
      return accountWrite('review:' + note.id, storage => storage.stageReview(snapshot, clone(entry)));
    }
    return saveNote(note);
  }
  function undoReview(restored, eventId) {
    if (mode === 'account') {
      const snapshot = clone(restored);
      return accountWrite('undo:' + restored.id, storage => storage.stageUndo(snapshot, eventId));
    }
    return saveNote(restored);
  }
  function deleteNote(id) {
    if (mode === 'account')
      return accountWrite('note:' + id, storage => storage.stageNote({ id }, undefined, true));
    if (mode === 'local') return durableLocal('note:' + id, () => idbDel('notes', id));
    return enqueue(id, null);
  }
  async function whenSaved() {
    await Promise.all([...localWrites]);
    if (localErrors.size) throw new Error('Some local changes have not been saved');
  }
  function enqueue(id, data, acknowledge = false) {
    if (mode === 'memory' || mode === 'loading') return;
    deferred.delete(id);
    let e = queue.get(id);
    if (!e) { e = { busy: false, next: undefined, receipts: [] }; queue.set(id, e); pendingCount++; emitStatus(); }
    e.next = data;
    const receipt = acknowledge ? new Promise((resolve, reject) => e.receipts.push({ resolve, reject })) : undefined;
    if (!e.busy) pump(id, e);
    return receipt;
  }
  async function pump(id, e) {
    e.busy = true;
    while (e.next !== undefined) {
      const data = e.next;
      e.next = undefined;
      const receipts = e.receipts.splice(0);
      await acquire();
      try {
        await writeOne(id, data);
        for (const receipt of receipts) receipt.resolve();
        e.tries = 0;
        if (offline) { offline = false; emitStatus(); }
      }
      catch (err) {
        for (const receipt of receipts) receipt.reject(err);
        await onWriteError(err, id, data, e);
      }
      finally { release(); }
    }
    e.busy = false;
    queue.delete(id);
    pendingCount = Math.max(0, pendingCount - 1);
    emitStatus();
    if (!pendingCount && handlers.drained) handlers.drained();
  }
  async function writeOne(id, data) {
    if (mode === 'cloud') {
      const ref = notesCol.doc(id);
      if (data === null) return ref.delete();
      return ref.set(data);
    }
    if (mode === 'local') return data === null ? idbDel('notes', id) : idbPut('notes', data);
    return undefined;
  }
  const deferred = new Map();
  let deferredTimer = null;
  function scheduleDeferred() {
    if (deferredTimer) return;
    deferredTimer = setTimeout(() => {
      deferredTimer = null;
      const items = [...deferred.entries()];
      deferred.clear();
      for (const [id, data] of items) enqueue(id, data);
    }, 45000);
  }
  async function onWriteError(err, id, data, e) {
    const code = err && err.code;
    if (code === 'unavailable' || code === 'resource_exhausted') {
      offline = true; emitStatus();
      e.tries = (e.tries || 0) + 1;
      if (e.tries <= 2) {
        await new Promise((r) => setTimeout(r, 1200 * e.tries + Math.random() * 1500));
        if (e.next === undefined) e.next = data; // retry unless superseded
      } else if (e.next === undefined) {
        deferred.set(id, data);
        scheduleDeferred();
      }
      return;
    }
    if (code === 'quota_exceeded') {
      toast('Your account storage for Lemma is full. Delete unused cards or images, then try again.', { kind: 'error', ms: 8000 });
      return;
    }
    if (code === 'invalid_argument' && data && JSON.stringify(data).length > 250000) {
      toast('This card is too large to save (over 250 KB). Use smaller images.', { kind: 'error', ms: 8000 });
      return;
    }
    if (code === 'invalid_argument' || code === 'revoked' || code === 'not_granted') {
      await switchToLocal(code === 'invalid_argument' ? 'read-only' : 'revoked');
      if (e.next === undefined) e.next = data;
      return;
    }
    if (mode === 'local') {
      toast('Could not save to this browser’s storage.', { kind: 'error' });
    }
  }

  function saveProfile(profile) {
    // Account profile CAS + conflict UI must ship before any active profile editing.
    if (mode === 'account') return accountWrite('profile', storage => storage.stageProfile(clone(profile)));
    if (mode === 'local') {
      const data = clone(profile);
      return durableLocal('profile', () => idbPut('meta', data, 'profile'));
    }
    profilePending = clone(profile);
    clearTimeout(profileTimer);
    profileTimer = setTimeout(flushProfile, 500);
  }
  async function flushProfile() {
    if (profileBusy || !profilePending) return;
    profileBusy = true;
    const data = profilePending;
    profilePending = null;
    try {
      if (mode === 'cloud') await profileRef.set(data);
      else if (mode === 'local') await idbPut('meta', data, 'profile');
    } catch (err) {
      const code = err && err.code;
      if (code === 'invalid_argument' || code === 'revoked') { await switchToLocal('read-only'); await idbPut('meta', data, 'profile').catch(() => {}); }
      else if (!profilePending) profilePending = data;
    }
    profileBusy = false;
    if (profilePending) { clearTimeout(profileTimer); profileTimer = setTimeout(flushProfile, 800); }
  }

  /** Notes saved in this browser while signed out, for moving into the account. */
  async function localLeftovers() {
    try {
      idb = idb || await idbOpen();
      const notes = await idbAll('notes');
      return notes || [];
    } catch (e) { return []; }
  }
  async function clearLocal() {
    try { idb = idb || await idbOpen(); await idbClear('notes'); await idbDel('meta', 'profile'); } catch (e) { /* ignore */ }
  }

  let accountTransition = false;
  async function localSnapshot() {
    idb = idb || await idbOpen();
    const [notes, profile] = await Promise.all([idbAll('notes'), idbGet('meta', 'profile')]);
    return { notes: new Map((notes || []).map(n => [n.id, clone(n)])),
      profile: profile || null, mode: 'local' };
  }
  async function activateAccount(handle) {
    if (mode !== 'local' || accountHandle || accountTransition)
      throw new Error('Account workspace requires idle local mode');
    accountTransition = true;
    try {
    if (!handle?.userId || !handle.storage) throw new Error('Invalid account workspace');
    if (LemmaAccount.user?.id !== handle.userId) throw new Error('Account identity changed');
    await whenSaved();
    const [rows, accountProfile] = await Promise.all([handle.storage.notes(), handle.storage.profile()]);
    if (LemmaAccount.user?.id !== handle.userId) throw new Error('Account identity changed');
    const notes = new Map();
    for (const row of rows) {
      if (!row.deleted && row.data) notes.set(row.id, clone(row.data));
    }
    accountHandle = handle;
    mode = 'account';
    emitStatus();
    return { notes, profile: accountProfile?.data || null, mode: 'account' };
    } finally { accountTransition = false; }
  }
  async function deactivateAccount() {
    if (mode !== 'account') throw new Error('No active account workspace');
    await whenSaved();
    accountHandle = null;
    mode = 'loading'; // reject account writes while anonymous data is restored
    emitStatus();
    return startLocal(); // original browser-local data were never deleted
  }
  // Auth expiry/sign-out is not an ordinary switch: never keep the previous
  // account on screen merely because a cache write failed during identity change.
  async function emergencyExitAccount() {
    if (mode !== 'account') return mode === 'local' ? localSnapshot() : startLocal();
    accountHandle = null;
    mode = 'loading';
    emitStatus();
    const results = await Promise.allSettled([...localWrites]);
    if (results.some(x => x.status === 'rejected')) reason = 'account-save-interrupted';
    return startLocal();
  }
  return {
    init, saveNote, saveReview, undoReview, deleteNote, saveProfile,
    activateAccount, deactivateAccount, emergencyExitAccount, localSnapshot,
    localLeftovers, clearLocal, status, whenSaved,
    get mode() { return mode; },
    setHandler(name, fn) { handlers[name] = fn; },
    flushProfile,
  };
})();

