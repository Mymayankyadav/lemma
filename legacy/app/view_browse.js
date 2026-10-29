/* ---------- browse: search, card details, knowledge graph ---------- */
function noteSummary(n, now = Date.now()) {
  const cards = Object.values(n.cards);
  const active = cards.filter((c) => !c.susp);
  const eod = Model.endOfToday(now);
  let state = 'review';
  if (!active.length) state = 'suspended';
  else if (active.some((c) => Model.isLearning(c))) state = 'learning';
  else if (active.some((c) => c.st === 2 && c.due < eod)) state = 'due';
  else if (active.every((c) => c.st === 0)) state = 'new';
  const studied = active.filter((c) => c.st !== 0);
  const rs = studied.map((c) => Model.recallNow(c, now));
  const R = rs.length ? Math.min(...rs) : null;
  const due = studied.length ? Math.min(...studied.map((c) => c.due)) : null;
  const D = studied.length ? Math.max(...studied.map((c) => c.d)) : null;
  const lapses = cards.reduce((m, c) => m + (c.lapses || 0), 0);
  return { state, R, due, D, lapses, studied: studied.length, total: cards.length };
}
const STATE_LABEL = { new: 'New', learning: 'Learning', due: 'Due', review: 'Scheduled', suspended: 'Suspended' };

function parseQuery(q) {
  const terms = [], filters = [];
  for (const tok of String(q || '').match(/(\w+:"[^"]*"|\w+:\S+|"[^"]*"|\S+)/g) || []) {
    const m = /^(deck|tag|is|type|title):(.*)$/i.exec(tok);
    if (m) filters.push([m[1].toLowerCase(), m[2].replace(/^"|"$/g, '').toLowerCase()]);
    else terms.push(tok.replace(/^"|"$/g, '').toLowerCase());
  }
  return { terms, filters };
}
function matchNote(n, pq, now) {
  for (const [k, v] of pq.filters) {
    if (k === 'deck') { const d = n.deck.toLowerCase(); if (!(d === v || d.startsWith(v + '::') || d.split('::').some((p) => p === v))) return false; }
    else if (k === 'tag') { if (!n.tags.some((t) => t.toLowerCase() === v || t.toLowerCase().startsWith(v + '::'))) return false; }
    else if (k === 'type') { if (n.type !== v && !(v === 'reverse' && n.type === 'reverse')) return false; }
    else if (k === 'title') { if (!n.title.toLowerCase().includes(v)) return false; }
    else if (k === 'is') {
      const cs = Object.values(n.cards);
      const eod = Model.endOfToday(now);
      const ok = {
        new: () => cs.some((c) => c.st === 0 && !c.susp),
        learning: () => cs.some((c) => Model.isLearning(c)),
        review: () => cs.some((c) => c.st === 2),
        due: () => cs.some((c) => !c.susp && c.st !== 0 && c.due < eod),
        suspended: () => cs.some((c) => c.susp),
        buried: () => cs.some((c) => Model.isBuried(c, now)),
        flagged: () => cs.some((c) => c.flag),
        leech: () => n.tags.includes('leech'),
        example: () => !!n.example,
        linked: () => Model.prereqIds(n).length > 0 || Model.dependents(n.id).length > 0,
      }[v];
      if (!ok || !ok()) return false;
    }
  }
  if (pq.terms.length) {
    const hay = (n.title + '\n' + n.front + '\n' + n.back + '\n' + n.tags.join(' ') + '\n' + n.deck).toLowerCase();
    for (const t of pq.terms) if (!hay.includes(t)) return false;
  }
  return true;
}

const BrowseView = (() => {
  const st = { q: '', sort: 'due', mode: 'list', limit: 60 };
  let listEl = null, countEl = null, graphHost = null;

  function render(params = {}) {
    if (params.q !== undefined) st.q = params.q;
    if (params.mode) st.mode = params.mode;
    const search = h('input', { id: 'browse-q', class: 'input search-input', type: 'search', value: st.q, placeholder: 'Search · deck: tag: is:due', 'aria-label': 'Search cards', autocomplete: 'off' });
    const runSearch = debounce(() => { st.q = search.value; st.limit = 60; draw(); }, 140);
    search.addEventListener('input', runSearch);
    const chips = h('div', { class: 'filter-chips', role: 'group', 'aria-label': 'Quick filters' },
      [['All', ''], ['Due', 'is:due'], ['New', 'is:new'], ['Learning', 'is:learning'], ['Linked', 'is:linked'], ['Flagged', 'is:flagged'], ['Leech', 'is:leech'], ['Paused', 'is:suspended']].map(([label, token]) => {
        const on = token ? st.q.includes(token) : !/is:\w+/.test(st.q);
        return h('button', { type: 'button', class: 'fchip' + (on ? ' on' : ''), 'aria-pressed': String(on), text: label, onclick: () => {
          let q = st.q.replace(/\bis:\w+\s*/g, '').trim();
          if (token) q = (q + ' ' + token).trim();
          st.q = q; st.limit = 60; App.render();
        } });
      }));
    const SORTS = [['due', 'Due date'], ['recall', 'Lowest recall'], ['created', 'Newest'], ['difficulty', 'Hardest'], ['lapses', 'Most lapses'], ['alpha', 'A–Z']];
    const sortBtn = iconBtn('sort', 'Sort', () => {
      const s2 = Sheets.open({ title: 'Sort', body: h('div', { class: 'menu-list' }, SORTS.map(([v, l]) => {
        const b2 = h('button', { type: 'button', class: 'menu-item' + (st.sort === v ? ' on' : ''), 'aria-pressed': String(st.sort === v), onclick: () => { st.sort = v; s2.close(); draw(); } }, h('span', { text: l }));
        if (st.sort === v) b2.insertAdjacentHTML('beforeend', icon('check', 18));
        return b2;
      })) });
    }, { class: 'boxed' });
    const viewBtn = iconBtn(st.mode === 'graph' ? 'list' : 'graph', st.mode === 'graph' ? 'List view' : 'Graph view', () => { st.mode = st.mode === 'graph' ? 'list' : 'graph'; App.render(); }, { class: 'boxed' });
    countEl = h('span', { class: 'muted result-count' });
    listEl = h('div', { class: 'note-list' });
    graphHost = h('div', { class: 'graph-host' });
    const page = h('div', { class: 'page browse' },
      h('div', { class: 'page-head' }, h('h1', { class: 'page-title', text: 'Cards' }), countEl),
      h('div', { class: 'browse-bar' }, h('div', { class: 'search-wrap', html: icon('search', 18) }, search), sortBtn, viewBtn),
      chips,
      st.mode === 'graph' ? graphHost : listEl);
    setTimeout(draw, 0);
    return page;
  }

  function results() {
    const now = Date.now();
    const pq = parseQuery(st.q);
    const out = [];
    for (const n of Model.notes.values()) if (matchNote(n, pq, now)) out.push(n);
    return out;
  }

  function draw() {
    if (!listEl) return;
    const now = Date.now();
    const notes = results();
    countEl.textContent = plural(notes.length, 'note');
    if (st.mode === 'graph') { GraphView.mount(graphHost, notes); return; }
    const sums = new Map(notes.map((n) => [n.id, noteSummary(n, now)]));
    const key = {
      due: (n) => { const s = sums.get(n.id); return s.state === 'new' ? Infinity : s.due ?? Infinity; },
      recall: (n) => sums.get(n.id).R ?? 2,
      created: (n) => -n.created,
      difficulty: (n) => -(sums.get(n.id).D ?? -1),
      lapses: (n) => -sums.get(n.id).lapses,
      alpha: (n) => 0,
    }[st.sort];
    notes.sort((a, b) => (st.sort === 'alpha' ? (a.title || a.front).localeCompare(b.title || b.front) : key(a) - key(b) || b.created - a.created));
    if (!notes.length) {
      fill(listEl, h('div', { class: 'empty' },
        h('p', { class: 'empty-title', text: Model.notes.size ? 'No cards match' : 'No cards yet' }),
        h('p', { class: 'muted', text: Model.notes.size ? 'Try fewer words or clear filters.' : 'Add, import or generate cards.' })));
      return;
    }
    const rows = notes.slice(0, st.limit).map((n) => row(n, sums.get(n.id), now));
    fill(listEl, ...rows);
    if (notes.length > st.limit) listEl.append(h('button', { class: 'btn btn-block', type: 'button', text: `Show ${Math.min(100, notes.length - st.limit)} more`, onclick: () => { st.limit += 100; draw(); } }));
  }

  function row(n, s, now) {
    const preview = h('div', { class: 'row-preview prose' });
    renderCardHTML(preview, n.front, { cloze: n.type === 'cloze' ? 'all' : null, media: n.media, mediaKey: n.id + n.modified });
    const dueText = s.state === 'new' || s.state === 'suspended' || !s.due ? '' : s.due < Model.endOfToday(now) ? 'today' : FSRS.formatIvl(s.due - now);
    return h('div', { role: 'button', tabindex: '0', class: 'note-row', onclick: () => NoteDetail.open(n.id),
      onkeydown: (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); NoteDetail.open(n.id); } } },
      h('span', { class: 'state-dot sd-' + s.state, title: STATE_LABEL[s.state], 'aria-label': STATE_LABEL[s.state] }),
      h('div', { class: 'row-main' },
        n.title ? h('div', { class: 'row-title', text: n.title }) : null,
        preview,
        h('div', { class: 'row-meta', text: n.deck.split('::').pop() })),
      h('div', { class: 'row-side' },
        s.R != null ? h('span', { class: 'row-r', title: 'Recall now', text: fmtPct(s.R) }) : null,
        s.state === 'suspended' ? h('span', { title: 'Suspended', html: icon('pause', 14) }) : dueText ? h('span', { class: 'row-due', title: 'Next review', text: dueText }) : null));
  }

  return { render, refresh: draw, setQuery(q) { st.q = q; st.limit = 60; } };
})();

/* ---------- card details sheet ---------- */
const NoteDetail = (() => {
  function open(id) {
    const n = Model.notes.get(id);
    if (!n) return;
    const now = Date.now();
    const body = h('div', { class: 'detail' });
    const front = h('div', { class: 'prose' });
    const back = h('div', { class: 'prose' });
    const media = n.media && Object.keys(n.media).length ? n.media : null;
    renderCardHTML(front, n.front, { cloze: n.type === 'cloze' ? 'all' : null, media, mediaKey: n.id + n.modified });
    if (n.back.trim()) renderCardHTML(back, n.back, { media, mediaKey: n.id + n.modified });
    front.querySelectorAll('details.env-hint').forEach((d) => { d.open = true; });
    const sheetCard = h('article', { class: 'card-sheet card-sheet-preview' }, front, n.back.trim() ? h('hr', { class: 'card-rule' }) : null, n.back.trim() ? back : null);
    sheetCard.style.setProperty('--card-font', Math.max(15, Model.settings.cardFont - 2) + 'px');
    const allSusp = Object.values(n.cards).every((c) => c.susp);
    const acts = h('div', { class: 'detail-actions' },
      h('button', { class: 'btn', type: 'button', html: icon('edit', 16) + '<span>Edit</span>', onclick: () => { s.close(); EditorSheet.open(n.id, () => App.refresh()); } }),
      h('button', { class: 'btn', type: 'button', title: 'Study with prerequisites', 'aria-label': 'Study with prerequisites', html: icon('play', 16) + '<span>Study</span>', onclick: () => {
        s.close();
        const path = prerequisitePath(n.id);
        const sess = new Session({ noteIds: path, title: n.title || 'Topic' });
        if (!sess.reviewQ.length && !sess.newQ.length && !sess.learningRefs().length) { App.startSession(new Session({ noteIds: path, cram: true, title: (n.title || 'Topic') + ' · practice' })); return; }
        App.startSession(sess);
      } }),
      h('button', { class: 'btn', type: 'button', html: icon('pause', 16) + `<span>${allSusp ? 'Resume' : 'Pause'}</span>`, onclick: () => {
        for (const c of Object.values(n.cards)) c.susp = !allSusp;
        Model.saveScheduling(n); s.close(); App.refresh(); toast(allSusp ? 'Resumed' : 'Paused');
      } }),
      h('button', { class: 'btn btn-ghost-danger', type: 'button', html: icon('trash', 16) + '<span>Delete</span>', onclick: async () => {
        if (!(await confirmDialog({ title: 'Delete this note?', message: 'Its cards and review history will be removed.', confirmLabel: 'Delete', danger: true }))) return;
        Model.deleteNote(n.id); s.close(); App.refresh(); toast('Deleted');
      } }));
    body.append(sheetCard, acts);

    // cards
    for (const ord of Object.keys(n.cards)) body.append(cardBlock(n, ord, now));

    // links
    const pre = Model.prereqIds(n).map((pid) => Model.notes.get(pid)).filter(Boolean);
    const dep = Model.dependents(n.id).map((pid) => Model.notes.get(pid)).filter(Boolean);
    if (pre.length || dep.length) {
      const linkList = (list) => h('div', { class: 'link-list' }, list.map((p) => h('button', { type: 'button', class: 'link-chip', onclick: () => { s.close(); open(p.id); } },
        h('span', { class: 'state-dot sd-' + noteSummary(p, now).state }), h('span', { text: p.title || Render.plainText(p.front, 50) }))));
      body.append(h('section', { class: 'detail-sec' },
        pre.length ? h('div', null, h('h3', { class: 'sec-h', text: 'Builds on' }), linkList(pre)) : null,
        dep.length ? h('div', null, h('h3', { class: 'sec-h', text: 'Used by' }), linkList(dep)) : null));
    }
    body.append(h('p', { class: 'muted small' }, `Created ${fmtDate(n.created)} · deck ${n.deck}` + (n.tags.length ? ' · ' + n.tags.map((t) => '#' + t).join(' ') : '')));
    const s = Sheets.open({ title: n.title || 'Card details', body, wide: true });
  }

  function cardBlock(n, ord, now) {
    const c = n.cards[ord];
    const label = n.type === 'cloze' ? 'Cloze ' + ord : n.type === 'reverse' ? (ord === '1' ? 'Forward' : 'Reverse') : 'Card';
    const R = Model.recallNow(c, now);
    const entries = n.log.filter((l) => String(l[1]) === ord);
    const replay = FSRS.replay(Model.settings.w, entries.map((l) => [l[0], l[2], l[5] || 0]), Model.clock).trace;
    const facts = [
      ['State', c.susp ? 'Suspended' : ST_NAMES[c.st]],
      ['Due', c.st === 0 ? '—' : fmtDate(c.due, Model.isLearning(c)) + ' (' + fmtRelative(c.due, now) + ')'],
      ['Recall now', R == null ? '—' : fmtPct(R, 1)],
      ['Stability', c.st === 0 ? '—' : FSRS.formatDays(c.s)],
      ['Difficulty', c.st === 0 ? '—' : c.d.toFixed(2) + ' / 10'],
      ['Reviews', String(c.reps || 0)],
      ['Lapses', String(c.lapses || 0)],
    ];
    const block = h('section', { class: 'detail-sec' }, h('h3', { class: 'sec-h', text: label }),
      h('dl', { class: 'facts' }, facts.map(([k, v]) => h('div', null, h('dt', { text: k }), h('dd', { text: v })))));
    if (c.st !== 0 && c.last && c.s > 0) {
      const horizon = Math.max((c.due - c.last) / DAY_MS * 1.6, (now - c.last) / DAY_MS * 1.2, 3);
      const pts = [];
      for (let i = 0; i <= 60; i++) { const t = (horizon * i) / 60; pts.push({ x: t, y: FSRS.retrievability(Model.settings.w, t, c.s), tip: 'Day ' + t.toFixed(t < 10 ? 1 : 0) + ' after last review' }); }
      const tNow = (now - c.last) / DAY_MS;
      const tDue = (c.due - c.last) / DAY_MS;
      const markers = [];
      if (tNow <= horizon) markers.push({ x: tNow, y: FSRS.retrievability(Model.settings.w, tNow, c.s), cls: 'c-dot-now' });
      if (tDue <= horizon) markers.push({ x: tDue, y: FSRS.retrievability(Model.settings.w, tDue, c.s), cls: 'c-dot-due' });
      block.append(Charts.line({
        title: 'Forgetting curve since the last review',
        subtitle: 'Filled dot: now · ring: next review',
        points: pts, xMin: 0, xMax: horizon, yMin: 0, yMax: 1, yTicks: [0, 0.5, 0.9, 1],
        xFmt: (v) => FSRS.formatDays(v).replace('<1m', '0d'), yFmt: (v) => fmtPct(v), markers, height: 150,
        table: { columns: ['Days after review', 'Recall'], rows: pts.filter((_, i) => i % 6 === 0).map((p) => [p.x.toFixed(1), fmtPct(p.y, 1)]) },
      }));
    }
    if (entries.length) {
      const rows = entries.slice().reverse().slice(0, 40).map((l, idx) => {
        const tr = replay[replay.length - 1 - idx] || {};
        const rating = l[5] === 2 ? 'Reset' : l[5] === 1 ? 'Practice' : GRADES[l[2] - 1] ? GRADES[l[2] - 1].label : '';
        return [fmtDate(l[0], true), rating, tr.t != null ? tr.t + 'd' : '', tr.r != null ? fmtPct(tr.r) : '—', tr.s != null ? FSRS.formatDays(tr.s) : ''];
      });
      block.append(h('details', { class: 'history' }, h('summary', { text: `Review history (${entries.length})` }),
        h('div', { class: 'table-scroll' }, h('table', { class: 'data-table' },
          h('thead', null, h('tr', null, ['When', 'Answer', 'Gap', 'Predicted', 'Stability after'].map((t) => h('th', { scope: 'col', text: t })))),
          h('tbody', null, rows.map((r) => h('tr', null, r.map((v) => h('td', { text: v })))))))));
    }
    return block;
  }

  /** Small preview when a [[link]] is tapped. */
  function peek(id) {
    const n = Model.notes.get(id);
    if (!n) return;
    const front = h('div', { class: 'prose' });
    renderCardHTML(front, n.front, { cloze: n.type === 'cloze' ? 'all' : null, media: n.media, mediaKey: n.id + n.modified });
    const back = h('div', { class: 'prose' });
    if (n.back.trim()) renderCardHTML(back, n.back, { media: n.media, mediaKey: n.id + n.modified });
    const card = h('article', { class: 'card-sheet card-sheet-preview' }, front, n.back.trim() ? h('hr', { class: 'card-rule' }) : null, n.back.trim() ? back : null);
    card.style.setProperty('--card-font', Math.max(15, Model.settings.cardFont - 2) + 'px');
    const s = Sheets.open({
      title: n.title || 'Linked card', body: card,
      actions: [h('button', { class: 'btn', type: 'button', text: 'Card details', onclick: () => { s.close(); open(n.id); } })],
    });
  }
  return { open, peek };
})();

/* ---------- knowledge graph ---------- */
const GraphView = (() => {
  let raf = 0;
  function mount(host, notes) {
    cancelAnimationFrame(raf);
    const now = Date.now();
    const ids = new Set(notes.map((n) => n.id));
    const edges = [];
    const linked = new Set();
    for (const n of notes) for (const p of Model.prereqIds(n)) if (ids.has(p)) { edges.push([p, n.id]); linked.add(p); linked.add(n.id); }
    const shown = notes.filter((n) => linked.has(n.id)).slice(0, 400);
    const hidden = notes.length - shown.length;
    if (!shown.length) {
      fill(host, h('div', { class: 'empty' },
        h('p', { class: 'empty-title', text: 'No links yet' }),
        h('p', { class: 'muted', text: 'Link cards with [[Title]] or the “Builds on” field.' })));
      return;
    }
    const index = new Map(shown.map((n, i) => [n.id, i]));
    // depth = longest prerequisite chain
    const depth = new Map();
    const dep = (id, seen = new Set()) => {
      if (depth.has(id)) return depth.get(id);
      if (seen.has(id)) return 0;
      seen.add(id);
      let d = 0;
      for (const p of Model.prereqIds(Model.notes.get(id))) if (index.has(p)) d = Math.max(d, dep(p, seen) + 1);
      depth.set(id, d);
      return d;
    };
    const nodes = shown.map((n) => {
      const s = noteSummary(n, now);
      const d = dep(n.id);
      return { id: n.id, n, s, d, x: (Math.random() - 0.5) * 300, y: d * 90 + (Math.random() - 0.5) * 20, vx: 0, vy: 0, label: n.title || Render.plainText(n.front, 28) };
    });
    const E = edges.filter(([a, b]) => index.has(a) && index.has(b)).map(([a, b]) => [index.get(a), index.get(b)]);
    // layout
    for (let it = 0; it < 360; it++) {
      const alpha = 1 - it / 360;
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          let dx = a.x - b.x, dy = a.y - b.y;
          let d2 = dx * dx + dy * dy;
          if (d2 < 1) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 1; }
          if (d2 > 90000) continue;
          const f = (1600 / d2) * alpha;
          const d = Math.sqrt(d2);
          a.vx += (dx / d) * f; a.vy += (dy / d) * f;
          b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
        }
      }
      for (const [si, ti] of E) {
        const a = nodes[si], b = nodes[ti];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.max(1, Math.hypot(dx, dy));
        const f = (d - 80) * 0.03 * alpha;
        a.vx += (dx / d) * f; a.vy += (dy / d) * f;
        b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
      }
      for (const a of nodes) {
        a.vy += (a.d * 90 - a.y) * 0.02 * alpha;
        a.vx += -a.x * 0.004 * alpha;
        a.vx *= 0.6; a.vy *= 0.6;
        a.x += clampN(a.vx, -30, 30); a.y += clampN(a.vy, -30, 30);
      }
    }
    // view
    const canvas = h('canvas', { class: 'graph-canvas', tabindex: '0', 'aria-label': `Prerequisite graph of ${shown.length} cards. Use Tab to reach the list below.` });
    const info = h('div', { class: 'graph-info', 'aria-live': 'polite' }, h('p', { class: 'muted', text: 'Tap a node · arrows point to what builds on it' }));
    const legend = h('div', { class: 'graph-legend' },
      [['good', '90%+'], ['warn', '70–90%'], ['bad', '<70%'], ['new', 'New']].map(([k, l]) => h('span', { class: 'lg' }, h('span', { class: 'lg-dot lg-' + k }), l)),
      hidden > 0 ? h('span', { class: 'muted', text: `${hidden} unlinked hidden` }) : null);
    const fallback = h('details', { class: 'graph-list' }, h('summary', { text: 'Prerequisites as a list' }),
      h('ul', null, shown.slice().sort((a, b) => dep(a.id) - dep(b.id)).map((n) => h('li', null, h('button', { type: 'button', class: 'link-btn', text: n.title || Render.plainText(n.front, 50), onclick: () => NoteDetail.open(n.id) }),
        Model.prereqIds(n).length ? h('span', { class: 'muted', text: ' ← ' + Model.prereqIds(n).map((p) => { const pn = Model.notes.get(p); return pn ? pn.title || Render.plainText(pn.front, 30) : ''; }).join(', ') }) : null))));
    fill(host, legend, h('div', { class: 'graph-frame' }, canvas), info, fallback);

    const ctx = canvas.getContext('2d');
    let W = 0, H = 0, dpr = 1;
    let scale = 1, tx = 0, ty = 0, sel = -1, hover = -1;
    const fitView = () => {
      const xs = nodes.map((n) => n.x), ys = nodes.map((n) => n.y);
      const minX = Math.min(...xs) - 60, maxX = Math.max(...xs) + 60, minY = Math.min(...ys) - 40, maxY = Math.max(...ys) + 40;
      scale = clampN(Math.min(W / (maxX - minX), H / (maxY - minY)), 0.25, 2.2);
      tx = W / 2 - ((minX + maxX) / 2) * scale;
      ty = H / 2 - ((minY + maxY) / 2) * scale;
    };
    const size = () => {
      const r = canvas.getBoundingClientRect();
      dpr = window.devicePixelRatio || 1;
      W = r.width; H = r.height;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    };
    const colors = () => ({
      ink: cssVar('--ink'), ink2: cssVar('--ink-2'), ink3: cssVar('--ink-3'), rule: cssVar('--rule-2'), sheet: cssVar('--sheet'),
      good: cssVar('--status-good'), warn: cssVar('--status-warn'), bad: cssVar('--status-bad'), accent: cssVar('--accent'),
    });
    let C = colors();
    const fillFor = (nd) => {
      if (nd.s.state === 'suspended') return C.ink3;
      if (nd.s.R == null) return C.sheet;
      return nd.s.R >= 0.9 ? C.good : nd.s.R >= 0.7 ? C.warn : C.bad;
    };
    function draw() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.save();
      ctx.translate(tx, ty);
      ctx.scale(scale, scale);
      ctx.lineWidth = 1.2 / scale;
      for (const [si, ti] of E) {
        const a = nodes[si], b = nodes[ti];
        const hl = sel >= 0 && (si === sel || ti === sel);
        ctx.strokeStyle = hl ? C.accent : C.rule;
        ctx.fillStyle = ctx.strokeStyle;
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.max(1, Math.hypot(dx, dy));
        const ux = dx / d, uy = dy / d;
        const ex = b.x - ux * 10, ey = b.y - uy * 10;
        ctx.beginPath(); ctx.moveTo(a.x + ux * 9, a.y + uy * 9); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex - ux * 7 - uy * 4, ey - uy * 7 + ux * 4); ctx.lineTo(ex - ux * 7 + uy * 4, ey - uy * 7 - ux * 4); ctx.closePath(); ctx.fill();
      }
      nodes.forEach((nd, i) => {
        const r = i === sel ? 10 : 8;
        ctx.beginPath(); ctx.arc(nd.x, nd.y, r + 2, 0, Math.PI * 2); ctx.fillStyle = C.sheet; ctx.fill();
        ctx.beginPath(); ctx.arc(nd.x, nd.y, r, 0, Math.PI * 2);
        ctx.fillStyle = fillFor(nd); ctx.fill();
        ctx.lineWidth = (nd.s.R == null ? 1.6 : 1) / scale;
        ctx.strokeStyle = i === sel ? C.accent : nd.s.R == null ? C.ink3 : C.sheet;
        ctx.stroke();
        if (i === sel) { ctx.lineWidth = 2.5 / scale; ctx.strokeStyle = C.accent; ctx.beginPath(); ctx.arc(nd.x, nd.y, r + 3, 0, Math.PI * 2); ctx.stroke(); }
      });
      const fs = 11.5 / Math.max(scale, 0.6);
      ctx.font = `500 ${fs}px ${cssVar('--font-ui') || 'sans-serif'}`;
      ctx.textAlign = 'center';
      nodes.forEach((nd, i) => {
        if (scale < 0.55 && i !== sel && i !== hover) return;
        ctx.fillStyle = i === sel ? C.ink : C.ink2;
        ctx.fillText(nd.label, nd.x, nd.y + 22 / Math.max(scale, 0.8) + 2);
      });
      ctx.restore();
    }
    const toWorld = (cx, cy) => [(cx - tx) / scale, (cy - ty) / scale];
    const hit = (cx, cy) => {
      const [x, y] = toWorld(cx, cy);
      let best = -1, bd = (18 / scale) ** 2;
      nodes.forEach((nd, i) => { const d = (nd.x - x) ** 2 + (nd.y - y) ** 2; if (d < bd) { bd = d; best = i; } });
      return best;
    };
    function select(i) {
      sel = i;
      draw();
      if (i < 0) return;
      const nd = nodes[i];
      const pv = h('div', { class: 'prose small' });
      renderCardHTML(pv, nd.n.front, { cloze: nd.n.type === 'cloze' ? 'all' : null, media: nd.n.media, mediaKey: nd.n.id + nd.n.modified });
      fill(info, h('div', { class: 'gi-head' },
        h('div', null, h('div', { class: 'gi-title', text: nd.n.title || 'Untitled card' }), h('div', { class: 'muted small', text: `${STATE_LABEL[nd.s.state]}${nd.s.R != null ? ' · recall ' + fmtPct(nd.s.R) : ''} · ${plural(Model.prereqIds(nd.n).length, 'prerequisite')}` })),
        h('div', { class: 'gi-actions' },
          h('button', { class: 'btn btn-sm', type: 'button', text: 'Details', onclick: () => NoteDetail.open(nd.id) }),
          h('button', { class: 'btn btn-sm btn-primary', type: 'button', text: 'Study path', title: 'Study this card after its prerequisites', onclick: () => {
            const path = prerequisitePath(nd.id);
            const sess = new Session({ noteIds: path, title: nd.n.title || 'Topic' });
            if (!sess.reviewQ.length && !sess.newQ.length && !sess.learningRefs().length) App.startSession(new Session({ noteIds: path, cram: true, title: (nd.n.title || 'Topic') + ' · practice' }));
            else App.startSession(sess);
          } }))), pv);
    }
    // pointer interaction: pan, drag node, pinch zoom
    const pointers = new Map();
    let dragNode = -1, moved = false, pinch = null;
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      moved = false;
      if (pointers.size === 2) {
        const [p1, p2] = [...pointers.values()];
        pinch = { d: Math.hypot(p1.x - p2.x, p1.y - p2.y), scale, cx: (p1.x + p2.x) / 2, cy: (p1.y + p2.y) / 2, tx, ty };
        dragNode = -1;
      } else dragNode = hit(e.offsetX, e.offsetY);
    });
    canvas.addEventListener('pointermove', (e) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) { const hv = hit(e.offsetX, e.offsetY); if (hv !== hover) { hover = hv; canvas.style.cursor = hv >= 0 ? 'pointer' : 'grab'; draw(); } return; }
      const dx = e.offsetX - prev.x, dy = e.offsetY - prev.y;
      pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      if (Math.abs(dx) + Math.abs(dy) > 1) moved = true;
      if (pinch && pointers.size === 2) {
        const [p1, p2] = [...pointers.values()];
        const d = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        const ns = clampN(pinch.scale * (d / pinch.d), 0.2, 4);
        const wx = (pinch.cx - pinch.tx) / pinch.scale, wy = (pinch.cy - pinch.ty) / pinch.scale;
        scale = ns; tx = pinch.cx - wx * ns; ty = pinch.cy - wy * ns;
      } else if (dragNode >= 0) {
        nodes[dragNode].x += dx / scale; nodes[dragNode].y += dy / scale;
      } else { tx += dx; ty += dy; }
      draw();
    });
    const end = (e) => {
      const wasDrag = moved;
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (!wasDrag && e.type === 'pointerup') select(hit(e.offsetX, e.offsetY));
      dragNode = -1;
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const f = Math.exp(-e.deltaY * 0.0015);
      const ns = clampN(scale * f, 0.2, 4);
      const [wx, wy] = toWorld(e.offsetX, e.offsetY);
      scale = ns; tx = e.offsetX - wx * ns; ty = e.offsetY - wy * ns;
      draw();
    }, { passive: false });
    canvas.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { select((sel + 1) % nodes.length); e.preventDefault(); }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { select((sel - 1 + nodes.length) % nodes.length); e.preventDefault(); }
      if (e.key === 'Enter' && sel >= 0) NoteDetail.open(nodes[sel].id);
    });
    const ro = new ResizeObserver(() => { size(); C = colors(); draw(); });
    ro.observe(canvas);
    raf = requestAnimationFrame(() => { size(); fitView(); draw(); });
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onTheme = () => { C = colors(); draw(); };
    if (mq.addEventListener) mq.addEventListener('change', onTheme);
  }
  return { mount };
})();
