/* ---------- domain model: notes, cards, decks, prerequisites ---------- */
const DEFAULT_PREAMBLE = [
  '\\newcommand{\\R}{\\mathbb{R}}',
  '\\newcommand{\\N}{\\mathbb{N}}',
  '\\newcommand{\\Z}{\\mathbb{Z}}',
  '\\newcommand{\\Q}{\\mathbb{Q}}',
  '\\newcommand{\\C}{\\mathbb{C}}',
  '\\newcommand{\\abs}[1]{\\left\\lvert #1 \\right\\rvert}',
  '\\newcommand{\\norm}[1]{\\left\\lVert #1 \\right\\rVert}',
  '\\newcommand{\\inner}[2]{\\left\\langle #1, #2 \\right\\rangle}',
  '\\newcommand{\\eps}{\\varepsilon}',
  '\\DeclareMathOperator{\\tr}{tr}',
  '\\DeclareMathOperator{\\rank}{rank}',
  '\\DeclareMathOperator*{\\argmax}{arg\\,max}',
  '\\DeclareMathOperator*{\\argmin}{arg\\,min}',
].join('\n');

const DEFAULT_SETTINGS = {
  retention: 0.9,
  maxIvl: 36500,
  learnSteps: '1m 10m',
  relearnSteps: '10m',
  newPerDay: 20,
  reviewsPerDay: 200,
  rollover: 4,
  fuzz: true,
  loadBalance: true,
  w: FSRS.DEFAULT_W.slice(),
  wSource: 'default',
  wInfo: null,
  reviewOrder: 'retrievability',
  newOrder: 'prereq',
  newMix: 'mix',
  burySiblings: true,
  gatePrereqs: true,
  refreshPrereqs: true,
  leechThreshold: 8,
  leechAction: 'tag',
  preamble: DEFAULT_PREAMBLE,
  cardFont: 19,
  showRecall: true,
  learnAhead: 20,
  aiTier: 'default',
};

const ST_NAMES = ['New', 'Learning', 'Review', 'Relearning'];
const GRADES = [
  { g: 1, key: 'again', label: 'Again' },
  { g: 2, key: 'hard', label: 'Hard' },
  { g: 3, key: 'good', label: 'Good' },
  { g: 4, key: 'easy', label: 'Easy' },
];

const Model = (() => {
  const notes = new Map();
  let settings = clone(DEFAULT_SETTINGS);
  let extraDecks = [];
  let profileMeta = {};
  let version = 0;
  let clock = FSRS.makeClock(settings.rollover);
  const listeners = new Set();
  const memo = new Map();

  const bump = () => { version++; memo.clear(); for (const fn of listeners) fn(); };
  function cached(key, fn) {
    if (memo.has(key)) return memo.get(key);
    const v = fn();
    memo.set(key, v);
    return v;
  }

  // ----- settings -----
  function normalizeSettings(s) {
    const out = Object.assign(clone(DEFAULT_SETTINGS), s || {});
    out.w = FSRS.normalizeParams(out.w) || FSRS.DEFAULT_W.slice();
    out.retention = clampN(Number(out.retention) || 0.9, 0.7, 0.99);
    out.maxIvl = clampN(Math.round(Number(out.maxIvl) || 36500), 1, 36500);
    out.newPerDay = clampN(Math.round(Number(out.newPerDay)), 0, 9999);
    out.reviewsPerDay = clampN(Math.round(Number(out.reviewsPerDay)), 0, 99999);
    out.rollover = clampN(Math.round(Number(out.rollover)), 0, 23);
    if (!FSRS.parseSteps(out.learnSteps) && String(out.learnSteps).trim()) out.learnSteps = DEFAULT_SETTINGS.learnSteps;
    if (!FSRS.parseSteps(out.relearnSteps) && String(out.relearnSteps).trim()) out.relearnSteps = DEFAULT_SETTINGS.relearnSteps;
    return out;
  }
  function loadProfile(p) {
    p = p || {};
    settings = normalizeSettings(p.settings);
    extraDecks = Array.isArray(p.decks) ? p.decks.filter((d) => typeof d === 'string') : [];
    profileMeta = { examplesHidden: !!p.examplesHidden, lastDeck: p.lastDeck || '' };
    clock = FSRS.makeClock(settings.rollover);
    Render.setPreamble(settings.preamble);
    bump();
  }
  function profile() {
    return { v: 1, settings, decks: extraDecks, examplesHidden: profileMeta.examplesHidden, lastDeck: profileMeta.lastDeck, updated: Date.now() };
  }
  function setSettings(patch) {
    const before = settings;
    settings = normalizeSettings(Object.assign({}, settings, patch));
    if (patch.preamble !== undefined && patch.preamble !== before.preamble) Render.setPreamble(settings.preamble);
    if (settings.rollover !== before.rollover) clock = FSRS.makeClock(settings.rollover);
    Store.saveProfile(profile());
    bump();
  }
  function setMeta(patch) { Object.assign(profileMeta, patch); Store.saveProfile(profile()); }
  function schedCfg() {
    return {
      w: settings.w, retention: settings.retention, maxIvl: settings.maxIvl,
      learn: FSRS.parseSteps(settings.learnSteps) || [], relearn: FSRS.parseSteps(settings.relearnSteps) || [],
      fuzz: settings.fuzz, loadBalance: settings.loadBalance,
    };
  }

  // ----- notes and cards -----
  const newCardState = () => ({ st: 0, due: 0, s: 0, d: 0, last: 0, step: 0, reps: 0, lapses: 0 });
  function ordsFor(note) {
    if (note.type === 'cloze') {
      const o = Render.clozeOrds(note.front);
      return o.length ? o.map(String) : ['1'];
    }
    if (note.type === 'reverse') return ['1', '2'];
    return ['1'];
  }
  function syncCards(note) {
    const want = ordsFor(note);
    note.cards = note.cards || {};
    for (const o of want) if (!note.cards[o]) note.cards[o] = newCardState();
    for (const o of Object.keys(note.cards)) if (!want.includes(o)) delete note.cards[o];
  }
  function sanitizeNote(n) {
    n.deck = String(n.deck || 'Default').trim() || 'Default';
    n.type = ['basic', 'reverse', 'cloze'].includes(n.type) ? n.type : 'basic';
    n.title = String(n.title || '').trim();
    n.front = String(n.front || '');
    n.back = String(n.back || '');
    n.tags = Array.isArray(n.tags) ? [...new Set(n.tags.map((t) => String(t).trim()).filter(Boolean))] : [];
    n.requires = Array.isArray(n.requires) ? [...new Set(n.requires.map(String))] : [];
    n.media = n.media && typeof n.media === 'object' ? n.media : {};
    n.log = Array.isArray(n.log) ? n.log : [];
    n.created = n.created || Date.now();
    n.modified = n.modified || n.created;
    syncCards(n);
    return n;
  }
  function createNote(fields, opts = {}) {
    const n = sanitizeNote(Object.assign({ id: uid(), cards: {}, log: [] }, clone(fields)));
    notes.set(n.id, n);
    if (!opts.silent) bump();
    Store.saveNote(n);
    return n;
  }
  function updateNote(n, fields) {
    Object.assign(n, clone(fields));
    n.modified = Date.now();
    sanitizeNote(n);
    bump();
    Store.saveNote(n);
  }
  // Editor writes use a detached candidate: a failed transaction must not
  // change the visible note, its schedule or the draft's base revision.
  async function commitEditorNote(base, fields, isCurrent) {
    const candidate = sanitizeNote(Object.assign(clone(base), clone(fields), { modified: Date.now() }));
    await Store.saveNote(candidate, { durable: true });
    // Auth recovery may have replaced the entire Model while storage awaited.
    if (!isCurrent()) return candidate;
    const existing = notes.get(candidate.id);
    if (existing) Object.assign(existing, candidate);
    else notes.set(candidate.id, candidate);
    bump();
    return existing || candidate;
  }
  function saveScheduling(n, reviewEntry = null) { bump(); return reviewEntry ? Store.saveReview(n, reviewEntry) : Store.saveNote(n); }
  function deleteNote(id) {
    notes.delete(id);
    for (const other of notes.values()) {
      if (other.requires && other.requires.includes(id)) {
        other.requires = other.requires.filter((x) => x !== id);
        Store.saveNote(other);
      }
    }
    bump();
    Store.deleteNote(id);
  }
  function replaceAll(map) {
    notes.clear();
    for (const [id, n] of map) { if (!n.id) n.id = id; notes.set(id, sanitizeNote(n)); }
    bump();
  }
  function applyRemote(changes) {
    for (const { id, note } of changes) {
      if (note === null) notes.delete(id);
      else { if (!note.id) note.id = id; notes.set(id, sanitizeNote(note)); }
    }
    bump();
  }

  function cardRefs() {
    return cached('refs', () => {
      const out = [];
      for (const n of notes.values()) for (const ord of Object.keys(n.cards)) out.push({ key: n.id + ':' + ord, note: n, ord, c: n.cards[ord] });
      return out;
    });
  }
  function ref(noteId, ord) {
    const n = notes.get(noteId);
    if (!n || !n.cards[ord]) return null;
    return { key: noteId + ':' + ord, note: n, ord, c: n.cards[ord] };
  }
  /** What to show for one card: sources and cloze modes. */
  function sides(note, ord) {
    const media = note.media && Object.keys(note.media).length ? note.media : null;
    const mk = media ? note.id + note.modified : '';
    if (note.type === 'cloze') {
      const o = +ord;
      const hasCloze = Render.clozeOrds(note.front).length > 0;
      return {
        front: { src: note.front, opts: { cloze: hasCloze ? { ord: o, side: 'front' } : null, media, mediaKey: mk } },
        back: { src: note.front, opts: { cloze: hasCloze ? { ord: o, side: 'back' } : null, media, mediaKey: mk } },
        extra: note.back.trim() ? { src: note.back, opts: { media, mediaKey: mk } } : null,
      };
    }
    if (note.type === 'reverse' && ord === '2') {
      return { front: { src: note.back, opts: { media, mediaKey: mk } }, back: { src: note.front, opts: { media, mediaKey: mk } }, extra: null, reversed: true };
    }
    return { front: { src: note.front, opts: { media, mediaKey: mk } }, back: { src: note.back, opts: { media, mediaKey: mk } }, extra: null };
  }

  // ----- time helpers -----
  const dayIndex = (ts = Date.now()) => clock.dayIndex(ts);
  const dayStart = (idx) => clock.dayStart(idx);
  const endOfToday = (now = Date.now()) => clock.dayStart(clock.dayIndex(now) + 1);
  const isSuspended = (c) => !!c.susp;
  const isBuried = (c, now = Date.now()) => !!c.bury && c.bury > now;
  const isLearning = (c) => c.st === 1 || c.st === 3;
  function recallNow(c, now = Date.now()) {
    if (!c || c.st === 0 || !c.last) return null;
    return FSRS.retrievability(settings.w, Math.max(0, (now - c.last) / DAY_MS), Math.max(c.s, FSRS.S_MIN));
  }

  // ----- decks -----
  const inDeck = (note, deck) => !deck || note.deck === deck || note.deck.startsWith(deck + '::');
  function deckNames() {
    return cached('decks', () => {
      const set = new Set(extraDecks);
      for (const n of notes.values()) set.add(n.deck);
      const all = new Set();
      for (const d of set) {
        const parts = d.split('::');
        for (let i = 1; i <= parts.length; i++) all.add(parts.slice(0, i).join('::'));
      }
      return [...all].sort((a, b) => a.localeCompare(b));
    });
  }
  function addDeck(name) {
    name = String(name || '').split('::').map((s) => s.trim()).filter(Boolean).join('::');
    if (!name) return null;
    if (!extraDecks.includes(name)) { extraDecks.push(name); Store.saveProfile(profile()); bump(); }
    return name;
  }
  function renameDeck(from, to) {
    to = String(to || '').split('::').map((s) => s.trim()).filter(Boolean).join('::');
    if (!to || to === from) return;
    for (const n of notes.values()) {
      if (n.deck === from || n.deck.startsWith(from + '::')) {
        n.deck = to + n.deck.slice(from.length);
        Store.saveNote(n);
      }
    }
    extraDecks = extraDecks.map((d) => (d === from || d.startsWith(from + '::') ? to + d.slice(from.length) : d));
    Store.saveProfile(profile());
    bump();
  }
  function removeDeckEntry(name) {
    extraDecks = extraDecks.filter((d) => !(d === name || d.startsWith(name + '::')));
    Store.saveProfile(profile());
    bump();
  }

  // ----- links and prerequisites -----
  function titleIndex() {
    return cached('titles', () => {
      const m = new Map();
      for (const n of notes.values()) if (n.title) m.set(n.title.toLowerCase(), n.id);
      return m;
    });
  }
  function resolveTarget(target) {
    const key = String(target || '').trim().toLowerCase();
    const id = titleIndex().get(key);
    if (id) return notes.get(id);
    return notes.get(String(target).trim()) || null;
  }
  function linkTargets(note) {
    const out = [];
    const re = /\[\[([^[\]\n|]+)(?:\|[^[\]\n]+)?\]\]/g;
    for (const src of [note.front, note.back]) {
      let m;
      while ((m = re.exec(src || ''))) out.push(m[1].trim());
    }
    return out;
  }
  function prereqIds(note) {
    return cached('pre:' + note.id, () => {
      const set = new Set();
      for (const id of note.requires || []) {
        if (id === note.id) continue;
        if (notes.has(id)) set.add(id);
        else { const r = resolveTarget(id); if (r && r.id !== note.id) set.add(r.id); }
      }
      for (const t of linkTargets(note)) {
        const r = resolveTarget(t);
        if (r && r.id !== note.id) set.add(r.id);
      }
      return [...set];
    });
  }
  function dependents(id) {
    const idx = cached('dependents', () => {
      const m = new Map();
      for (const n of notes.values()) for (const p of prereqIds(n)) {
        if (!m.has(p)) m.set(p, []);
        m.get(p).push(n.id);
      }
      return m;
    });
    return idx.get(id) || [];
  }
  /** true when `to` is reachable from `from` along prerequisite edges. */
  function reaches(from, to) {
    return cached('reach:' + from + '>' + to, () => {
      const seen = new Set([from]);
      const stack = [from];
      while (stack.length) {
        const cur = notes.get(stack.pop());
        if (!cur) continue;
        for (const p of prereqIds(cur)) {
          if (p === to) return true;
          if (!seen.has(p)) { seen.add(p); stack.push(p); }
        }
      }
      return false;
    });
  }
  const introduced = (n) => Object.values(n.cards).some((c) => c.st !== 0);
  const allSuspended = (n) => Object.values(n.cards).every((c) => c.susp);
  /** Prerequisites that are not yet introduced (ignoring cycles and suspended ones). */
  function blockers(note) {
    if (!settings.gatePrereqs) return [];
    return prereqIds(note).filter((pid) => {
      const p = notes.get(pid);
      return p && !introduced(p) && !allSuspended(p) && !reaches(pid, note.id);
    });
  }

  // ----- today -----
  function today(now = Date.now()) {
    const key = 'today:' + dayIndex(now);
    return cached(key, () => {
      const start = dayStart(dayIndex(now));
      const t = { newCount: 0, reviewCount: 0, all: 0, time: 0, again: 0, reviewPass: 0, learnAgain: 0 };
      for (const n of notes.values()) {
        const log = n.log;
        for (let i = log.length - 1; i >= 0; i--) {
          const l = log[i];
          if (l[0] < start) break;
          if (l[5]) continue;
          t.all++; t.time += l[4] || 0;
          if (l[3] === 0) t.newCount++;
          else if (l[3] === 2) { t.reviewCount++; if (l[2] === 1) t.again++; else t.reviewPass++; }
        }
      }
      return t;
    });
  }

  /** Counts of what is available to study now in a deck (respecting daily limits). */
  function counts(deck, now = Date.now()) {
    const key = 'counts:' + (deck || '*') + ':' + Math.floor(now / 60000);
    return cached(key, () => {
      const eod = endOfToday(now);
      let nw = 0, learn = 0, rev = 0, total = 0, suspended = 0;
      const seenNew = new Set();
      for (const r of cardRefs()) {
        if (!inDeck(r.note, deck)) continue;
        total++;
        const c = r.c;
        if (c.susp) { suspended++; continue; }
        if (isBuried(c, now)) continue;
        if (c.st === 0) {
          if (settings.burySiblings && seenNew.has(r.note.id)) continue;
          if (blockers(r.note).length) continue;
          seenNew.add(r.note.id);
          nw++;
        } else if (isLearning(c)) { if (c.due < eod) learn++; }
        else if (c.due < eod) rev++;
      }
      const t = today(now);
      return {
        new: Math.max(0, Math.min(nw, settings.newPerDay - t.newCount)),
        newAvailable: nw,
        learn,
        review: Math.max(0, Math.min(rev, settings.reviewsPerDay - t.reviewCount)),
        reviewAvailable: rev,
        total, suspended,
      };
    });
  }

  function knowledge(deck, now = Date.now()) {
    let cards = 0, studied = 0, sumR = 0;
    for (const r of cardRefs()) {
      if (!inDeck(r.note, deck) || r.c.susp) continue;
      cards++;
      const R = recallNow(r.c, now);
      if (R != null) { studied++; sumR += R; }
    }
    return { cards, studied, sumR, avgR: studied ? sumR / studied : null };
  }

  /** Review-state cards per due day (for load balancing). */
  function loadMap() {
    return cached('load', () => {
      const m = new Map();
      for (const r of cardRefs()) {
        if (r.c.st !== 2 || r.c.susp) continue;
        const d = dayIndex(r.c.due);
        m.set(d, (m.get(d) || 0) + 1);
      }
      return m;
    });
  }
  function previewFor(r, now = Date.now()) {
    const lm = loadMap();
    const ownDay = r.c.st === 2 ? dayIndex(r.c.due) : null;
    return FSRS.preview(r.c, now, schedCfg(), {
      clock, key: r.key,
      loadAt: (d) => (lm.get(d) || 0) - (d === ownDay ? 1 : 0),
    });
  }

  /** Recompute stability/difficulty of every card from its history (after parameters change). */
  function recomputeMemory() {
    let changed = 0;
    for (const n of notes.values()) {
      let dirty = false;
      for (const ord of Object.keys(n.cards)) {
        const c = n.cards[ord];
        if (c.st === 0) continue;
        const list = n.log.filter((l) => String(l[1]) === ord).map((l) => [l[0], l[2], l[5] || 0]);
        const { mem } = FSRS.replay(settings.w, list, clock);
        if (mem && (Math.abs(mem.s - c.s) > 1e-6 || Math.abs(mem.d - c.d) > 1e-6)) { c.s = mem.s; c.d = mem.d; dirty = true; }
      }
      if (dirty) { changed++; Store.saveNote(n); }
    }
    bump();
    return changed;
  }

  /** Review histories for the optimizer: one list per card. */
  function histories(deck) {
    const out = [];
    for (const n of notes.values()) {
      if (!inDeck(n, deck)) continue;
      const by = new Map();
      for (const l of n.log) {
        const k = String(l[1]);
        if (!by.has(k)) by.set(k, []);
        by.get(k).push([l[0], l[2], l[5] || 0]);
      }
      for (const list of by.values()) out.push(list.sort((a, b) => a[0] - b[0]));
    }
    return out;
  }
  function reviewCount() {
    return cached('rc', () => { let k = 0; for (const n of notes.values()) for (const l of n.log) if (!l[5]) k++; return k; });
  }

  return {
    get notes() { return notes; }, get settings() { return settings; }, get version() { return version; },
    get clock() { return clock; }, get meta() { return profileMeta; },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    bump, loadProfile, profile, setSettings, setMeta, schedCfg,
    newCardState, syncCards, sanitizeNote, createNote, updateNote, commitEditorNote, saveScheduling, deleteNote, replaceAll, applyRemote,
    cardRefs, ref, sides, dayIndex, dayStart, endOfToday, isSuspended, isBuried, isLearning, recallNow,
    inDeck, deckNames, addDeck, renameDeck, removeDeckEntry,
    titleIndex, resolveTarget, linkTargets, prereqIds, dependents, reaches, introduced, blockers,
    today, counts, knowledge, loadMap, previewFor, recomputeMemory, histories, reviewCount, ordsFor,
  };
})();

