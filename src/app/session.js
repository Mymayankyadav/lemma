/* ---------- review session: queue building, interleaving, prerequisites ---------- */
class Session {
  constructor({ deck = null, cram = false, noteIds = null, title = '' } = {}) {
    this.deck = deck;
    this.cram = cram;
    this.noteIds = noteIds ? new Set(noteIds) : null;
    this.title = title || (deck ? deck.split('::').pop() : cram ? 'Practice' : 'All decks');
    this.reviewQ = [];
    this.newQ = [];
    this.extra = [];
    this.cramQ = [];
    this.history = [];
    this.stats = { count: 0, again: 0, time: 0, newSeen: 0, reviews: 0, reviewPass: 0, started: Date.now() };
    this.sinceNew = 0;
    this.current = null;
    this.build();
  }

  includes(note) {
    if (this.noteIds) return this.noteIds.has(note.id);
    return Model.inDeck(note, this.deck);
  }

  build(now = Date.now()) {
    const s = Model.settings;
    const eod = Model.endOfToday(now);
    const refs = Model.cardRefs().filter((r) => this.includes(r.note) && !r.c.susp && !Model.isBuried(r.c, now));
    if (this.cram) {
      const pool = refs.slice();
      pool.sort((a, b) => (Model.recallNow(a.c, now) ?? 2) - (Model.recallNow(b.c, now) ?? 2));
      this.cramQ = pool.map((r) => r.key);
      this.total = this.cramQ.length;
      return;
    }
    const t = Model.today(now);
    const custom = !!this.noteIds;
    const reviewLeft = custom ? Infinity : Math.max(0, s.reviewsPerDay - t.reviewCount);
    const newLeft = custom ? Infinity : Math.max(0, s.newPerDay - t.newCount);

    let reviews = refs.filter((r) => r.c.st === 2 && r.c.due < eod);
    if (s.reviewOrder === 'due') reviews.sort((a, b) => a.c.due - b.c.due);
    else if (s.reviewOrder === 'random') reviews = shuffle(reviews);
    else reviews.sort((a, b) => Model.recallNow(a.c, now) - Model.recallNow(b.c, now));
    const usedNotes = new Set();
    if (s.burySiblings) {
      reviews = reviews.filter((r) => (usedNotes.has(r.note.id) ? false : (usedNotes.add(r.note.id), true)));
    }
    this.reviewQ = reviews.slice(0, reviewLeft).map((r) => r.key);

    // A study path introduces prerequisites first within the same session, so it skips the gate.
    let news = refs.filter((r) => r.c.st === 0 && (custom || Model.blockers(r.note).length === 0));
    news.sort((a, b) => a.note.created - b.note.created || +a.ord - +b.ord);
    if (s.burySiblings) {
      const seen = new Set(usedNotes);
      news = news.filter((r) => (seen.has(r.note.id) ? false : (seen.add(r.note.id), true)));
    }
    if (custom || s.newOrder === 'prereq') news = topoOrder(news);
    else if (s.newOrder === 'random') news = shuffle(news);
    this.newQ = news.slice(0, newLeft).map((r) => r.key);
    this.total = this.reviewQ.length + this.newQ.length + this.learningRefs(now).length;
  }

  learningRefs(now = Date.now()) {
    if (this.cram) return [];
    const eod = Model.endOfToday(now);
    return Model.cardRefs().filter((r) => Model.isLearning(r.c) && !r.c.susp && r.c.due < eod && this.includes(r.note))
      .sort((a, b) => a.c.due - b.c.due);
  }

  valid(key, kind, now) {
    const [nid, ord] = key.split(':');
    const r = Model.ref(nid, ord);
    if (!r || r.c.susp || Model.isBuried(r.c, now)) return null;
    if (kind === 'review' && r.c.st !== 2) return null;
    if (kind === 'new' && r.c.st !== 0) return null;
    return r;
  }

  /** Next card to show, a wait instruction, or null when finished. */
  next(now = Date.now()) {
    if (this.cram) {
      while (this.cramQ.length) {
        const key = this.cramQ.shift();
        const r = this.valid(key, 'any', now);
        if (r) return { ref: r, kind: 'cram' };
      }
      return null;
    }
    const learning = this.learningRefs(now);
    const dueLearn = learning.find((r) => r.c.due <= now);
    if (dueLearn) return { ref: dueLearn, kind: 'learning' };
    while (this.extra.length) {
      const x = this.extra.shift();
      const r = this.valid(x.key, 'review', now);
      if (r) return { ref: r, kind: 'prereq', reason: x.reason };
    }
    const mix = Model.settings.newMix;
    for (;;) {
      let pickNew;
      if (!this.newQ.length && !this.reviewQ.length) break;
      if (!this.newQ.length) pickNew = false;
      else if (!this.reviewQ.length) pickNew = true;
      else if (mix === 'before') pickNew = true;
      else if (mix === 'after') pickNew = false;
      else {
        const ratio = Math.max(1, Math.floor(this.reviewQ.length / (this.newQ.length + 1)));
        pickNew = this.sinceNew >= ratio;
      }
      const key = pickNew ? this.newQ.shift() : this.reviewQ.shift();
      const r = this.valid(key, pickNew ? 'new' : 'review', now);
      if (!r) continue;
      this.sinceNew = pickNew ? 0 : this.sinceNew + 1;
      return { ref: r, kind: pickNew ? 'new' : 'review' };
    }
    const aheadLimit = now + Model.settings.learnAhead * 60000;
    const ahead = learning.find((r) => r.c.due <= aheadLimit);
    if (ahead) return { ref: ahead, kind: 'learning' };
    if (learning.length) return { wait: learning[0].c.due };
    return null;
  }

  remaining(now = Date.now()) {
    if (this.cram) return { new: 0, learn: 0, review: this.cramQ.length + (this.current ? 1 : 0) };
    const cur = this.current && this.current.ref;
    let nw = this.newQ.length, rv = this.reviewQ.length + this.extra.length, ln = this.learningRefs(now).length;
    if (cur) {
      if (cur.c.st === 0) nw++;
      else if (cur.c.st === 2) rv++;
    }
    return { new: nw, learn: ln, review: rv };
  }

  async answer(g, durationMs, now = Date.now()) {
    if (this.saving) return null;
    const cur = this.current;
    if (!cur) return null;
    const r = cur.ref;
    const note = r.note;
    const ord = r.ord;
    const before = clone(note);
    const queues = { reviewQ: this.reviewQ.slice(), newQ: this.newQ.slice(), extra: clone(this.extra), cramQ: this.cramQ.slice(), sinceNew: this.sinceNew, stats: clone(this.stats) };
    const prev = note.cards[ord];
    this.saving = true;
    const eventId = crypto.randomUUID();
    try {
    const dur = Math.min(Math.max(0, durationMs || 0), 120000);
    const events = [];
    this.stats.count++;
    this.stats.time += dur;
    if (g === 1) this.stats.again++;
    if (prev.st === 0) this.stats.newSeen++;
    if (prev.st === 2) { this.stats.reviews++; if (g > 1) this.stats.reviewPass++; }

    if (this.cram) {
      note.log.push([now, +ord, g, prev.st, Math.round(dur), 1, eventId]);
      if (g === 1) this.cramQ.splice(Math.min(3, this.cramQ.length), 0, r.key);
      await Model.saveScheduling(note);
    } else {
      // intervals shown on the buttons are applied as-is unless the card sat unanswered for a long time
      const pv = cur.preview && now - (cur.previewAt || now) < 15 * 60000 ? cur.preview : Model.previewFor(r, now);
      const nc = Object.assign({}, pv[g].card);
      if (prev.flag) nc.flag = prev.flag;
      note.cards[ord] = nc;
      note.log.push([now, +ord, g, prev.st, Math.round(dur), 0, eventId]);
      // leech handling
      const thr = Model.settings.leechThreshold;
      if (prev.st === 2 && g === 1 && thr > 0 && nc.lapses >= thr && (nc.lapses - thr) % Math.max(1, Math.ceil(thr / 2)) === 0) {
        if (!note.tags.includes('leech')) note.tags.push('leech');
        if (Model.settings.leechAction === 'suspend') nc.susp = true;
        events.push({ type: 'leech', suspended: Model.settings.leechAction === 'suspend' });
      }
      // siblings wait until tomorrow
      if (Model.settings.burySiblings) {
        const eod = Model.endOfToday(now);
        for (const o of Object.keys(note.cards)) {
          if (o === ord) continue;
          const sc = note.cards[o];
          if (sc.st === 0 || (sc.st === 2 && sc.due < eod)) sc.bury = eod;
        }
        const k = (x) => x.split(':')[0] !== note.id;
        this.reviewQ = this.reviewQ.filter(k);
        this.newQ = this.newQ.filter(k);
      }
      await Model.saveScheduling(note);
      // a lapse pulls shaky prerequisites into the session
      if (g === 1 && Model.settings.refreshPrereqs) {
        const added = this.queuePrereqs(note, now);
        if (added) events.push({ type: 'prereqs', count: added });
      }
    }
    this.history.push({ noteId: note.id, before, afterCards: clone(note.cards), eventId, queues, key: r.key, kind: cur.kind });
    if (this.history.length > 30) this.history.shift();
    this.current = null;
    return events;
    } catch (error) {
      Object.assign(note, before);
      this.reviewQ = queues.reviewQ; this.newQ = queues.newQ;
      this.extra = queues.extra; this.cramQ = queues.cramQ;
      this.sinceNew = queues.sinceNew; this.stats = queues.stats;
      cur.ref.c = note.cards[ord];
      Model.bump();
      throw error;
    } finally { this.saving = false; }
  }

  queuePrereqs(note, now) {
    const startToday = Model.dayStart(Model.dayIndex(now));
    const queued = new Set([...this.reviewQ, ...this.extra.map((x) => x.key)]);
    let added = 0;
    for (const pid of Model.prereqIds(note)) {
      const p = Model.notes.get(pid);
      if (!p) continue;
      for (const ord of Object.keys(p.cards)) {
        const c = p.cards[ord];
        const key = p.id + ':' + ord;
        if (c.st !== 2 || c.susp || queued.has(key) || c.last >= startToday) continue;
        const R = Model.recallNow(c, now);
        if (R == null || R > 0.97) continue;
        this.reviewQ = this.reviewQ.filter((k) => k !== key);
        this.extra.push({ key, reason: { of: note.id } });
        queued.add(key);
        added++;
        if (added >= 3) return added;
      }
    }
    return added;
  }

  async undo() {
    if (this.saving) return null;
    const last = this.history[this.history.length - 1];
    if (!last) return null;
    const current = Model.notes.get(last.noteId);
    if (!current || current.type !== last.before.type ||
        JSON.stringify(current.cards) !== JSON.stringify(last.afterCards) ||
        current.log.length !== last.before.log.length + 1 ||
        current.log[current.log.length - 1]?.[6] !== last.eventId ||
        JSON.stringify(current.log.slice(0,-1)) !== JSON.stringify(last.before.log)) {
      throw new Error('This card changed after the review; Undo needs reconciliation.');
    }
    // Preserve text edits made after answering. Only review-owned state rolls back.
    const restored = Model.sanitizeNote({ ...clone(current), cards: clone(last.before.cards), log: clone(last.before.log),
      tags: last.before.tags.includes('leech') ? current.tags : current.tags.filter(t => t !== 'leech') });
    this.saving = true;
    try {
      await Store.saveNote(restored);
      this.history.pop();
      Model.notes.set(last.noteId, restored);
      Model.bump();
      this.reviewQ = last.queues.reviewQ;
      this.newQ = last.queues.newQ;
      this.extra = last.queues.extra;
      this.cramQ = last.queues.cramQ;
      this.sinceNew = last.queues.sinceNew;
      this.stats = last.queues.stats;
      const [nid, ord] = last.key.split(':');
      const r = Model.ref(nid, ord);
      return r ? { ref: r, kind: last.kind } : null;
    } finally { this.saving = false; }
  }

}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** Order new cards so prerequisites come first; ties keep their existing order. */
function topoOrder(refs) {
  const byNote = new Map();
  refs.forEach((r, i) => { if (!byNote.has(r.note.id)) byNote.set(r.note.id, { refs: [], idx: i }); byNote.get(r.note.id).refs.push(r); });
  const ids = [...byNote.keys()];
  const indeg = new Map(ids.map((id) => [id, 0]));
  const out = new Map(ids.map((id) => [id, []]));
  for (const id of ids) {
    for (const p of Model.prereqIds(Model.notes.get(id))) {
      if (byNote.has(p) && !Model.reaches(p, id)) { out.get(p).push(id); indeg.set(id, indeg.get(id) + 1); }
    }
  }
  const ready = ids.filter((id) => indeg.get(id) === 0).sort((a, b) => byNote.get(a).idx - byNote.get(b).idx);
  const order = [];
  while (ready.length) {
    const id = ready.shift();
    order.push(id);
    for (const nx of out.get(id)) {
      indeg.set(nx, indeg.get(nx) - 1);
      if (indeg.get(nx) === 0) {
        const pos = ready.findIndex((x) => byNote.get(x).idx > byNote.get(nx).idx);
        if (pos < 0) ready.push(nx); else ready.splice(pos, 0, nx);
      }
    }
  }
  for (const id of ids) if (!order.includes(id)) order.push(id);
  return order.flatMap((id) => byNote.get(id).refs);
}

/** Notes reachable as prerequisites of a note (closure), in study order, ending with the note. */
function prerequisitePath(noteId) {
  const seen = new Set();
  const order = [];
  const visit = (id, depth) => {
    if (seen.has(id) || depth > 50) return;
    seen.add(id);
    const n = Model.notes.get(id);
    if (!n) return;
    for (const p of Model.prereqIds(n)) visit(p, depth + 1);
    order.push(id);
  };
  visit(noteId, 0);
  return order;
}

