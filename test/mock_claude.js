// In-page mock of window.claude (db, user, sample, downloads) for local testing.
(() => {
  const SEED = window.__SEED__ || {};
  const store = new Map(Object.entries(SEED)); // path -> data
  const listeners = []; // {kind:'doc'|'col', path, cb, last}
  window.__mockStore = store;
  window.__mockWrites = [];
  const deep = (o) => JSON.parse(JSON.stringify(o));
  const snapDoc = (path) => {
    const data = store.get(path);
    const id = path.split('/').pop();
    return { id, exists: data !== undefined, data: () => (data === undefined ? undefined : deep(data)), metadata: { fromCache: false, hasPendingWrites: false } };
  };
  const inCol = (col, p) => p.startsWith(col + '/') && p.slice(col.length + 1).indexOf('/') === -1;
  function notify(changedPath) {
    setTimeout(() => {
      for (const l of listeners) {
        if (l.dead) continue;
        if (l.kind === 'doc' && l.path === changedPath) l.cb(snapDoc(l.path));
        if (l.kind === 'col' && inCol(l.path, changedPath)) {
          const docs = [...store.keys()].filter((p) => inCol(l.path, p)).sort().map(snapDoc);
          const exists = store.has(changedPath);
          const prevHad = l.seen.has(changedPath);
          const type = !exists ? 'removed' : prevHad ? 'modified' : 'added';
          if (exists) l.seen.add(changedPath); else l.seen.delete(changedPath);
          const doc = snapDoc(changedPath);
          l.cb({ docs, size: docs.length, empty: !docs.length, docChanges: () => [{ type, doc: type === 'removed' ? Object.assign(doc, { exists: true, data: () => ({}) }) : doc, oldIndex: -1, newIndex: -1 }], metadata: { fromCache: false, hasPendingWrites: false } });
        }
      }
    }, 5);
  }
  function docRef(path) {
    return {
      id: path.split('/').pop(), path,
      async get() { return snapDoc(path); },
      async set(data) { if (JSON.stringify(data).length > 262144) throw { code: 'invalid_argument', message: 'too big' }; store.set(path, deep(data)); window.__mockWrites.push(['set', path]); notify(path); },
      async update(data) { if (!store.has(path)) throw { code: 'invalid_argument' }; store.set(path, Object.assign(store.get(path), deep(data))); notify(path); },
      async delete() { store.delete(path); window.__mockWrites.push(['delete', path]); notify(path); },
      onSnapshot(cb, err) {
        const l = { kind: 'doc', path, cb };
        listeners.push(l);
        setTimeout(() => cb(snapDoc(path)), 10);
        return () => { l.dead = true; };
      },
      collection(sub) { return colRef(path + '/' + sub); },
    };
  }
  function colRef(path) {
    const q = {
      path,
      doc(id) { return docRef(path + '/' + (id || Math.random().toString(36).slice(2))); },
      async add(data) { const r = q.doc(); await r.set(data); return r; },
      where() { return q; }, orderBy() { return q; }, limit() { return q; },
      async get() { const docs = [...store.keys()].filter((p) => inCol(path, p)).sort().map(snapDoc); return { docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: { fromCache: false, hasPendingWrites: false } }; },
      onSnapshot(cb) {
        const l = { kind: 'col', path, cb, seen: new Set() };
        listeners.push(l);
        setTimeout(() => {
          const docs = [...store.keys()].filter((p) => inCol(path, p)).sort().map(snapDoc);
          docs.forEach((d) => l.seen.add(path + '/' + d.id));
          cb({ docs, size: docs.length, empty: !docs.length, docChanges: () => docs.map((d) => ({ type: 'added', doc: d, oldIndex: -1, newIndex: -1 })), metadata: { fromCache: false, hasPendingWrites: false } });
        }, 15);
        return () => { l.dead = true; };
      },
    };
    return q;
  }
  const db = { doc: docRef, collection: colRef };
  const user = { id: async () => 'u_test', isOwner: async () => true, canEdit: async () => true, can: async () => true, me: async () => ({ id: 'u_test', name: '', avatarUrl: '', color: '#888', email: null, isOwner: true, canEdit: true }) };
  window.__samplePrompts = [];
  const respond = (input) => {
    const p = typeof input === 'string' ? input : input.map((t) => t.content).join('\n');
    window.__samplePrompts.push(p.slice(0, 200));
    if (p.includes('You write spaced-repetition flashcards')) {
      return JSON.stringify([
        { type: 'basic', title: 'Compactness (Heine–Borel)', front: 'When is a subset of $\\R^n$ compact?', back: ':::theorem[Heine–Borel]\nA subset of $\\R^n$ is compact iff it is closed and bounded.\n:::', tags: ['topology'], requires: [] },
        { type: 'cloze', title: '', front: 'A continuous image of a compact set is {{c1::compact}}.', back: 'Used in the proof of the [[Extreme Value Theorem]].', tags: ['topology'], requires: ['Compactness (Heine–Borel)'] },
      ]);
    }
    if (p.includes('grading a student')) return JSON.stringify({ verdict: 'partial', grade: 2, feedback: 'You stated the conclusion but forgot that $f$ must be **continuous** on $[a,b]$.', missing: ['continuity on $[a,b]$'] });
    return 'The key idea is that $f$ cannot jump over $y$: think of $\\sup\\{x : f(x)\\le y\\}$.\n\n$$f(c)=y$$';
  };
  const sample = async (input, opts = {}) => {
    const text = respond(input);
    await new Promise((r) => setTimeout(r, 30));
    if (opts.onText) opts.onText({ text, delta: text });
    return { text, truncated: false, modelTierApplied: opts.modelTier || 'default' };
  };
  sample.json = async (input, opts = {}) => JSON.parse((await sample(input, opts)).text);
  sample.limits = async () => ({ maxPromptBytes: 262144, images: { maxCount: 4, maxInputBytes: 20e6, mediaTypes: ['image/png', 'image/jpeg'] }, tools: { maxCount: 8 } });
  window.__downloads = [];
  const downloads = { save: async (req) => { window.__downloads.push(req.filename); return { status: 'saved' }; } };
  const caps = { db, user, sample, downloads };
  window.claude = { use: (name) => Promise.resolve(caps[name] || null) };
})();
