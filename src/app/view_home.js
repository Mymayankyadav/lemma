/* ---------- home: today + decks ---------- */
const HomeView = (() => {
  const COLLAPSE_KEY = 'lemma.collapsed.v1';
  let collapsed;
  try { collapsed = new Set(JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '[]')); } catch (e) { collapsed = new Set(); }
  const saveCollapsed = () => { try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...collapsed])); } catch (e) { /* ignore */ } };

  function avgSeconds() {
    const durs = [];
    for (const n of Model.notes.values()) for (const l of n.log) if (!l[5] && l[4] > 0) durs.push(Math.min(l[4], 60000));
    if (durs.length < 10) return 9;
    durs.sort((a, b) => a - b);
    return durs[Math.floor(durs.length / 2)] / 1000;
  }
  function streakDays() {
    const days = new Set();
    for (const n of Model.notes.values()) for (const l of n.log) days.add(Model.dayIndex(l[0]));
    let d = Model.dayIndex();
    if (!days.has(d)) d--;
    let s = 0;
    while (days.has(d)) { s++; d--; }
    return s;
  }
  function ringSVG(frac, size = 104, stroke = 7) {
    const c = size / 2, r = (size - stroke) / 2, len = 2 * Math.PI * r;
    const fg = frac > 0.001 ? `<circle class="tr-fg" cx="${c}" cy="${c}" r="${r}" stroke-width="${stroke}" stroke-dasharray="${(Math.min(1, frac) * len).toFixed(1)} ${len.toFixed(1)}" transform="rotate(-90 ${c} ${c})"/>` : '';
    return `<svg viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle class="tr-bg" cx="${c}" cy="${c}" r="${r}" stroke-width="${stroke}"/>${fg}</svg>`;
  }
  const countChip = (kind, ic, n, label) => h('span', { class: `tc tc-${kind}` + (n ? '' : ' zero'), title: label, 'aria-label': `${n} ${label.toLowerCase()}` },
    h('span', { html: icon(ic, 16) }), h('b', { text: fmtInt(n) }));
  const metaChip = (ic, value, label) => h('span', { class: 'tm', title: label, 'aria-label': `${label}: ${value}` },
    h('span', { html: icon(ic, 14) }), h('b', { text: value }));

  function render() {
    if (App.loading) {
      return h('div', { class: 'page home' }, h('div', { class: 'loading-card', role: 'status', 'aria-label': 'Loading' },
        h('div', { class: 'loading-mark', 'aria-hidden': 'true', html: '<span></span><span></span><span></span>' })));
    }
    const page = h('div', { class: 'page home' });
    for (const b of banners()) page.append(b);
    if (!Model.notes.size) { page.append(emptyState()); return page; }
    const now = Date.now();
    const c = Model.counts(null, now);
    const k = Model.knowledge(null, now);
    const t = Model.today(now);
    const due = c.new + c.learn + c.review;
    const frac = t.all + due ? t.all / (t.all + due) : 0;
    const mins = Math.max(1, Math.round((avgSeconds() * (c.review + c.learn + c.new * 2.5)) / 60));
    const streak = streakDays();
    const hero = h('section', { class: 'today', 'aria-label': 'Today' },
      h('div', { class: 'today-ring', html: ringSVG(frac), title: t.all ? `${t.all} answered today` : '' },
        h('div', { class: 'ring-center' }, h('span', { class: 'hero-num', text: fmtInt(due) }), h('span', { class: 'ring-cap', text: 'due' }))),
      h('div', { class: 'today-info' },
        h('div', { class: 'today-split' },
          countChip('new', 'plusc', c.new, 'New'),
          countChip('learn', 'clock', c.learn, 'Learning'),
          countChip('review', 'refresh', c.review, 'Review')),
        h('div', { class: 'today-meta' },
          k.studied ? metaChip('gauge', fmtPct(k.avgR), 'Average recall now') : null,
          streak ? metaChip('flame', String(streak), 'Day streak') : null,
          due ? metaChip('hourglass', '~' + mins + 'm', 'Estimated time') : null)),
      h('button', { class: 'btn btn-primary study-btn', type: 'button', disabled: !due, title: due ? 'Study now (Space)' : nextDueText(now),
        onclick: () => App.startSession(new Session({ deck: null })), html: icon(due ? 'play' : 'check', 18) + `<span>${due ? 'Study' : 'Done'}</span>` }));
    page.append(hero);
    page.append(h('p', { class: 'stats-link-row' }, h('button', { class: 'link-btn stats-link', type: 'button', dataset: { go: 'stats' }, text: 'Statistics', onclick: () => App.go('stats') })));

    const list = h('div', { class: 'deck-list', role: 'list' });
    const names = Model.deckNames();
    for (const name of names) {
      const parts = name.split('::');
      if (parts.length > 1 && [...collapsed].some((cd) => name.startsWith(cd + '::'))) continue;
      list.append(deckRow(name, parts.length - 1, names.some((n) => n.startsWith(name + '::')), now));
    }
    page.append(h('section', { class: 'decks', 'aria-labelledby': 'decks-h' },
      h('div', { class: 'section-head' },
        h('h2', { class: 'section-title', id: 'decks-h', text: 'Decks' }),
        h('div', { class: 'head-actions' },
          AI.available() ? iconBtn('spark', 'Generate with Claude', () => GenerateSheet.open(), { class: 'ai' }) : null,
          iconBtn('upload', 'Import', () => ImportSheet.open()),
          iconBtn('download', 'Export', () => ExportSheet.open()),
          iconBtn('folderplus', 'New deck', newDeck))),
      list));
    return page;
  }

  function nextDueText(now) {
    let next = Infinity;
    for (const r of Model.cardRefs()) if (!r.c.susp && r.c.st !== 0 && r.c.due > now) next = Math.min(next, r.c.due);
    return next < Infinity ? 'Next review ' + fmtRelative(next, now) : 'Nothing scheduled';
  }

  function deckRow(name, depth, hasKids, now) {
    const c = Model.counts(name, now);
    const k = Model.knowledge(name, now);
    const leaf = name.split('::').pop();
    const due = c.new + c.learn + c.review;
    const isCollapsed = collapsed.has(name);
    const toggle = hasKids ? h('button', { class: 'deck-toggle' + (isCollapsed ? '' : ' open'), type: 'button', 'aria-label': (isCollapsed ? 'Expand ' : 'Collapse ') + leaf, 'aria-expanded': String(!isCollapsed), html: icon('next', 16), onclick: (e) => {
      e.stopPropagation();
      if (collapsed.has(name)) collapsed.delete(name); else collapsed.add(name);
      saveCollapsed(); App.render();
    } }) : h('span', { class: 'deck-toggle-space' });
    const pill = (cls, n, label) => h('span', { class: n ? 'pill ' + cls : 'pill-empty', title: label, text: n ? fmtInt(n) : '' });
    return h('div', { class: 'deck-row', role: 'listitem', style: { '--depth': depth } },
      toggle,
      h('button', { class: 'deck-name', type: 'button', onclick: () => { if (due) App.startSession(new Session({ deck: name })); else { BrowseView.setQuery('deck:"' + name + '"'); App.go('browse'); } } },
        h('span', { class: 'deck-leaf', text: leaf }),
        h('span', { class: 'deck-sub' },
          h('span', { class: 'deck-n', title: plural(c.total, 'card'), html: icon('cards', 13) }, h('span', { text: fmtInt(c.total) })),
          k.studied ? h('span', { class: 'mini-bar', title: 'Average recall ' + fmtPct(k.avgR), 'aria-hidden': 'true' }, h('span', { style: { width: (k.avgR * 100).toFixed(0) + '%' } })) : null,
          k.studied ? h('span', { class: 'deck-r', text: fmtPct(k.avgR) }) : null)),
      h('div', { class: 'deck-counts', 'aria-label': `${c.new} new, ${c.learn} learning, ${c.review} due` },
        pill('p-new', c.new, 'New'), pill('p-learn', c.learn, 'Learning'), pill('p-due', c.review, 'Due')),
      iconBtn('more', 'Deck options for ' + leaf, () => deckMenu(name)));
  }

  function deckMenu(name) {
    const leaf = name.split('::').pop();
    const items = [
      ['play', 'Study', () => App.startSession(new Session({ deck: name }))],
      ['refresh', 'Practice', () => App.startSession(new Session({ deck: name, cram: true, title: leaf + ' · practice' }))],
      ['plus', 'Add card', () => App.newCard({ deck: name })],
      ['list', 'Browse', () => { BrowseView.setQuery('deck:"' + name + '"'); App.go('browse'); }],
      ['graph', 'Graph', () => { BrowseView.setQuery('deck:"' + name + '"'); App.go('browse', { mode: 'graph' }); }],
      ['download', 'Export', () => ExportSheet.open(name)],
      ['edit', 'Rename', () => renameDeck(name)],
      ['trash', 'Delete', () => deleteDeck(name), true],
    ];
    const s = Sheets.open({ title: leaf, body: iconGrid(items, () => s.close()) });
  }
  function newDeck() {
    const input = h('input', { id: 'new-deck', class: 'input', placeholder: 'Math::Analysis', autocomplete: 'off', 'aria-label': 'Deck name' });
    const go = () => { const n = Model.addDeck(input.value); if (n) { s.close(); toast('Deck created'); App.render(); } };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    const s = Sheets.open({ title: 'New deck', body: h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'new-deck', text: 'Name · use :: for subdecks' }), input),
      actions: [h('button', { class: 'btn btn-primary', type: 'button', text: 'Create', onclick: go })] });
  }
  function renameDeck(name) {
    const input = h('input', { id: 'rename-deck', class: 'input', value: name, autocomplete: 'off', 'aria-label': 'Deck name' });
    const go = () => { Model.renameDeck(name, input.value); s.close(); toast('Renamed'); App.render(); };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    const s = Sheets.open({ title: 'Rename deck', body: h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'rename-deck', text: 'Name' }), input),
      actions: [h('button', { class: 'btn btn-primary', type: 'button', text: 'Rename', onclick: go })] });
  }
  async function deleteDeck(name) {
    const generation = App.workspaceRevision;
    const notes = [...Model.notes.values()].filter((n) => Model.inDeck(n, name));
    const ok = await confirmDialog({ title: `Delete “${name.split('::').pop()}”?`, message: notes.length ? `${plural(notes.length, 'note')} and their history will be deleted.` : 'The deck is empty.', confirmLabel: 'Delete', danger: true });
    if (!ok || App.workspaceBlocked || generation !== App.workspaceRevision) return;
    for (const n of notes) Model.deleteNote(n.id);
    Model.removeDeckEntry(name);
    toast('Deck deleted');
    App.render();
  }

  function banner(ic, text, actions, cls) {
    return h('div', { class: 'banner' + (cls ? ' ' + cls : ''), role: 'note' }, h('span', { class: 'banner-ico', html: icon(ic, 18) }), h('p', { text }), actions);
  }
  function banners() {
    const out = [];
    const st = Store.status();
    if (st.mode === 'memory') out.push(banner('device', 'Not saved here. Export before leaving.'));
    else if (st.mode === 'local') out.push(banner('device', st.reason === 'read-only' ? 'View-only page · saved on this device' : 'Saved on this device only · sign in to Claude to sync'));
    if (App.leftovers && App.leftovers.length && st.mode === 'cloud') {
      out.push(banner('cloud', `${plural(App.leftovers.length, 'card')} on this device`, [
        h('button', { class: 'btn btn-sm btn-primary', type: 'button', text: 'Move to account', onclick: () => App.migrateLeftovers() }),
        iconBtn('x', 'Not now', () => { App.leftovers = []; App.render(); }, { size: 16 }),
      ], 'banner-accent'));
    }
    const examples = [...Model.notes.values()].filter((n) => n.example);
    if (examples.length && !Model.meta.examplesHidden) {
      out.push(banner('info', 'Example cards', [
        h('button', { class: 'btn btn-sm', type: 'button', html: icon('trash', 15) + '<span>Remove</span>', onclick: async () => {
          const generation = App.workspaceRevision;
          if (!(await confirmDialog({ title: 'Remove example cards?', message: `${plural(examples.length, 'example note')} and their history will be deleted.`, confirmLabel: 'Remove', danger: true }))) return;
          if (generation !== App.workspaceRevision || App.workspaceBlocked) return;
          for (const n of examples) Model.deleteNote(n.id);
          Model.removeDeckEntry('Examples');
          toast('Examples removed');
          App.render();
        } }),
        iconBtn('x', 'Hide', () => { Model.setMeta({ examplesHidden: true }); App.render(); }, { size: 16 }),
      ]));
    }
    return out;
  }

  function emptyState() {
    const demo = h('div', { class: 'prose' });
    renderCardHTML(demo, ':::theorem[Mean value]\nIf $f$ is continuous on $[a,b]$ and differentiable on $(a,b)$, then $f\'(c) = {{c1::\\dfrac{f(b)-f(a)}{b-a}}}$ for some $c\\in(a,b)$.\n:::', { cloze: { ord: 1, side: 'back' } });
    const srcBox = h('pre', { class: 'demo-src' }, h('code', { text: ':::theorem[Mean value]\n… $f\'(c) = {{c1::\\dfrac{f(b)-f(a)}{b-a}}}$\n:::' }));
    const demoCard = h('article', { class: 'card-sheet card-sheet-preview demo-card' }, demo);
    demoCard.style.setProperty('--card-font', '18px');
    return h('section', { class: 'onboard' },
      h('div', { class: 'onboard-copy' },
        h('h1', { class: 'onboard-title', text: 'Remember every theorem.' }),
        h('p', { class: 'muted', text: 'Markdown + LaTeX cards, scheduled by FSRS-6.' }),
        h('div', { class: 'quick-actions' },
          h('button', { class: 'btn btn-primary', type: 'button', html: icon('plus', 16) + '<span>New card</span>', onclick: () => App.newCard() }),
          AI.available() ? h('button', { class: 'btn btn-ai', type: 'button', html: icon('spark', 16) + '<span>Generate</span>', onclick: () => GenerateSheet.open() }) : null,
          h('button', { class: 'btn', type: 'button', html: icon('upload', 16) + '<span>Import</span>', onclick: () => ImportSheet.open() }))),
      h('div', { class: 'onboard-demo' }, demoCard, srcBox));
  }

  return { render };
})();
