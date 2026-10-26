/* ---------- card editor: Markdown + LaTeX with live preview ---------- */
const TEX_SNIPPETS = (() => {
  const plain = ('alpha beta gamma delta epsilon varepsilon zeta eta theta vartheta iota kappa lambda mu nu xi pi varpi rho varrho sigma ' +
    'tau upsilon phi varphi chi psi omega Gamma Delta Theta Lambda Xi Pi Sigma Upsilon Phi Psi Omega infty partial nabla forall exists nexists ' +
    'in notin ni subset subseteq supset supseteq subsetneq cup cap setminus emptyset varnothing to mapsto implies impliedby iff le leq ge geq ne neq ' +
    'approx equiv sim simeq cong propto cdot cdots ldots vdots ddots times div pm mp circ otimes oplus perp parallel mid nmid neg land lor top bot ' +
    'vdash models aleph ell hbar Re Im langle rangle lVert rVert lvert rvert lfloor rfloor lceil rceil quad qquad displaystyle sin cos tan sec csc cot ' +
    'arcsin arccos arctan sinh cosh tanh log ln exp det ker dim deg gcd lcm max min sup inf limsup liminf Pr bmod rightarrow leftarrow Rightarrow ' +
    'Leftarrow leftrightarrow Leftrightarrow hookrightarrow twoheadrightarrow uparrow downarrow star ast dagger angle triangle square checkmark').split(' ');
  const withArgs = [
    ['frac', '\\frac{|}{}'], ['dfrac', '\\dfrac{|}{}'], ['tfrac', '\\tfrac{|}{}'], ['sqrt', '\\sqrt{|}'], ['binom', '\\binom{|}{}'],
    ['sum', '\\sum_{|}^{}'], ['prod', '\\prod_{|}^{}'], ['int', '\\int_{|}^{}'], ['iint', '\\iint_{|}'], ['oint', '\\oint_{|}'],
    ['lim', '\\lim_{| \\to }'], ['bigcup', '\\bigcup_{|}'], ['bigcap', '\\bigcap_{|}'],
    ['mathbb', '\\mathbb{|}'], ['mathcal', '\\mathcal{|}'], ['mathfrak', '\\mathfrak{|}'], ['mathscr', '\\mathscr{|}'], ['mathrm', '\\mathrm{|}'],
    ['mathbf', '\\mathbf{|}'], ['boldsymbol', '\\boldsymbol{|}'], ['operatorname', '\\operatorname{|}'], ['text', '\\text{|}'], ['textbf', '\\textbf{|}'],
    ['vec', '\\vec{|}'], ['hat', '\\hat{|}'], ['widehat', '\\widehat{|}'], ['bar', '\\bar{|}'], ['overline', '\\overline{|}'], ['underline', '\\underline{|}'],
    ['tilde', '\\tilde{|}'], ['widetilde', '\\widetilde{|}'], ['dot', '\\dot{|}'], ['ddot', '\\ddot{|}'], ['overset', '\\overset{|}{}'], ['underset', '\\underset{|}{}'],
    ['underbrace', '\\underbrace{|}_{}'], ['overbrace', '\\overbrace{|}^{}'], ['xrightarrow', '\\xrightarrow{|}'], ['pmod', '\\pmod{|}'],
    ['left(', '\\left( | \\right)'], ['left[', '\\left[ | \\right]'], ['left|', '\\left| | \\right|'], ['left\\{', '\\left\\{ | \\right\\}'],
    ['begin{align*}', '\\begin{align*}\n  |\n\\end{align*}'], ['begin{cases}', '\\begin{cases} | & \\text{if } \\\\  & \\text{otherwise} \\end{cases}'],
    ['begin{pmatrix}', '\\begin{pmatrix} | & \\\\ & \\end{pmatrix}'], ['begin{bmatrix}', '\\begin{bmatrix} | & \\\\ & \\end{bmatrix}'],
    ['begin{vmatrix}', '\\begin{vmatrix} | & \\\\ & \\end{vmatrix}'],
    ['abs', '\\abs{|}'], ['norm', '\\norm{|}'], ['inner', '\\inner{|}{}'],
  ];
  const list = withArgs.map(([k, s]) => ({ k, s }));
  for (const k of plain) list.push({ k, s: '\\' + k + '|' });
  return list;
})();

const QUICK_INSERTS = [
  ['$x$', 'Inline math (Ctrl+M)', (ed) => ed.wrap('$', '$', 'x')],
  ['$$', 'Display math', (ed) => ed.block('$$\n', '\n$$', 'x')],
  ['[…]', 'Cloze deletion (Ctrl+Shift+C)', (ed) => ed.cloze(false)],
  ['Thm', 'Theorem block', (ed) => ed.block(':::theorem[Name]\n', '\n:::', 'Statement')],
  ['Def', 'Definition block', (ed) => ed.block(':::definition[Name]\n', '\n:::', 'Definition')],
  ['Pf', 'Proof block', (ed) => ed.block(':::proof\n', '\n:::', 'Proof')],
  ['Pf*', 'Step-by-step proof', (ed) => ed.block(':::proof*\n1. ', '\n2. \n:::', 'First step')],
  ['Hint', 'Hint (revealed on demand)', (ed) => ed.block(':::hint\n', '\n:::', 'Hint')],
  ['[[ ]]', 'Link to another card', (ed) => ed.wrap('[[', ']]', 'Title')],
  ['ℝ', '\\R', (ed) => ed.insert('\\R')], ['∫', '\\int', (ed) => ed.insert('\\int_{a}^{b} ')], ['∑', '\\sum', (ed) => ed.insert('\\sum_{n=1}^{\\infty} ')],
  ['a/b', '\\frac', (ed) => ed.snippet('\\frac{|}{}')], ['√', '\\sqrt', (ed) => ed.snippet('\\sqrt{|}')], ['xⁿ', 'superscript', (ed) => ed.snippet('^{|}')],
  ['xₙ', 'subscript', (ed) => ed.snippet('_{|}')], ['∀', '\\forall', (ed) => ed.insert('\\forall ')], ['∃', '\\exists', (ed) => ed.insert('\\exists ')],
  ['∈', '\\in', (ed) => ed.insert('\\in ')], ['→', '\\to', (ed) => ed.insert('\\to ')], ['⇒', '\\implies', (ed) => ed.insert('\\implies ')],
  ['≤', '\\le', (ed) => ed.insert('\\le ')], ['≠', '\\ne', (ed) => ed.insert('\\ne ')], ['ε', '\\varepsilon', (ed) => ed.insert('\\varepsilon')], ['∞', '\\infty', (ed) => ed.insert('\\infty')],
];

const EditorSheet = (() => {
  // Legacy anonymous draft stays at its original key. Account drafts are
  // segregated by authenticated ID, never exposed in another workspace.
  function draftKey(noteId) {
    if (Store.mode === 'account') {
      const id = LemmaAccount.user?.id;
      if (!id) throw new Error('Account identity unavailable for draft');
      return 'lemma.draft.account.' + id + (noteId ? '.edit.' + noteId : '');
    }
    return noteId ? 'lemma.draft.edit.' + noteId : 'lemma.draft.v1';
  }
  const readDraft = key => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; } };
  const writeDraft = (key,d) => { try { localStorage.setItem(key, JSON.stringify(d)); } catch (e) { /* ignore */ } };
  const clearDraft = key => { try { localStorage.removeItem(key); } catch (e) { /* ignore */ } };
  const content = n => ({ type:n.type, deck:n.deck, title:n.title, front:n.front,
    back:n.back, tags:n.tags, requires:n.requires, media:n.media || {} });
  const canonical = x => x && typeof x === 'object'
    ? Array.isArray(x) ? '[' + x.map(canonical).join(',') + ']'
      : '{' + Object.keys(x).sort().map(k => JSON.stringify(k) + ':' + canonical(x[k])).join(',') + '}'
    : JSON.stringify(x);
  const sameContent = (a,b) => canonical(content(a)) === canonical(content(b));
  function draftContent(d) {
    const used = new Set(((d.front || '') + '\n' + (d.back || '')).match(/media:([\w-]+)/g)?.map(x => x.slice(6)) || []);
    const media = Object.fromEntries(Object.entries(d.media || {}).filter(([id]) => used.has(id)));
    return Model.sanitizeNote({ id:'draft', cards:{}, log:[], ...d,
      tags: typeof d.tags === 'string' ? d.tags.split(/[\s,]+/).filter(Boolean) : d.tags,
      media });
  }

  function open(noteId, onSaved, preset = {}) {
    const originRevision = App.workspaceRevision;
    const originMode = Store.mode;
    const key = draftKey(noteId);
    let closed = false;
    let committed = false;
    let saving = false;
    let saveError = '';
    let saveBase = null; // Retain the same ID across failed new-card attempts.
    let recoveredSave = false;
    const currentWorkspace = () => !App.workspaceBlocked &&
      App.workspaceRevision === originRevision && Store.mode === originMode &&
      (originMode !== 'account' || key === 'lemma.draft.account.' + LemmaAccount.user?.id + (noteId ? '.edit.' + noteId : ''));
    const valid = () => !closed && currentWorkspace();
    const editing = noteId ? Model.notes.get(noteId) : null;
    let draftRestored = false;
    let staleDraft = false;
    let f;
    if (editing) {
      f = { type: editing.type, deck: editing.deck, title: editing.title, front: editing.front, back: editing.back, tags: editing.tags.join(' '), requires: editing.requires.slice(), media: clone(editing.media || {}) };
      const d = readDraft(key);
      if (d && d.baseModified === editing.modified) {
        f = { ...f, type:d.type, deck:d.deck, title:d.title,
          front:d.front, back:d.back, tags:d.tags, requires:d.requires || f.requires, media:d.media || f.media };
        draftRestored = true;
      } else if (d) staleDraft = true; // do not overwrite a newer version
    } else {
      const d = !preset.front && !preset.title && readDraft(key);
      const pending = d?.pendingSave;
      const existing = pending?.id && Model.notes.get(pending.id);
      if (pending?.id && typeof pending.id === 'string')
        saveBase = { id:pending.id, cards:{}, log:[] };
      if (existing && pending.fields && sameContent(existing, pending.fields) &&
          sameContent(draftContent(d), pending.fields)) {
        // The transaction committed, but the browser closed before its receipt.
        // Existing review history remains authoritative: never resave the draft.
        clearDraft(key);
        recoveredSave = true;
        saveBase = null;
      } else if (existing) {
        saveError = 'This card changed since the interrupted save. Your draft is kept; compare it with the saved card before creating another.';
      }
      if (d && !recoveredSave && (d.front || d.back)) { f = Object.assign({ media: {} }, d); draftRestored = true; }
      else f = { type: preset.type || 'basic', deck: preset.deck || Model.meta.lastDeck || Model.deckNames()[0] || 'Default', title: preset.title || '', front: preset.front || '', back: preset.back || '', tags: '', requires: preset.requires || [], media: {} };
    }
    let lastTa = null;
    let previewSide = 'front';
    let previewOrd = 1;

    // ----- fields -----
    const seg = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Card type' },
      [['basic', 'Basic'], ['reverse', 'Reverse'], ['cloze', 'Cloze']].map(([v, label]) =>
        h('button', { type: 'button', role: 'radio', 'aria-checked': String(f.type === v), class: f.type === v ? 'on' : '', dataset: { v }, text: label, onclick: () => setType(v) })));
    const deckList = h('datalist', { id: 'deck-options' }, Model.deckNames().map((d) => h('option', { value: d })));
    const deckIn = h('input', { id: 'ed-deck', class: 'input', list: 'deck-options', value: f.deck, autocomplete: 'off', 'aria-label': 'Deck' });
    const titleIn = h('input', { id: 'ed-title', class: 'input', value: f.title, placeholder: 'e.g. Mean Value Theorem', autocomplete: 'off', 'aria-label': 'Title' });
    const frontTa = h('textarea', { id: 'ed-front', class: 'input code-input', rows: 6, spellcheck: 'false', 'aria-label': 'Front' });
    const backTa = h('textarea', { id: 'ed-back', class: 'input code-input', rows: 5, spellcheck: 'false', 'aria-label': 'Back' });
    frontTa.value = f.front;
    backTa.value = f.back;
    const tagsIn = h('input', { id: 'ed-tags', class: 'input', value: f.tags, placeholder: 'analysis continuity', autocomplete: 'off', 'aria-label': 'Tags' });
    const frontLabel = h('label', { for: 'ed-front', class: 'field-label' });
    const backLabel = h('label', { for: 'ed-back', class: 'field-label' });
    const warn = h('div', { class: 'ed-warn', role: 'status' });
    if (staleDraft) warn.textContent =
      'An older unsaved edit is kept on this device, but the card changed. ' +
      'The older draft was not applied. Make a backup before resolving.';
    const suggest = h('div', { class: 'ed-suggest', hidden: true, role: 'listbox', 'aria-label': 'LaTeX suggestions' });

    // prerequisites picker
    const reqChips = h('div', { class: 'chips' });
    const reqIn = h('input', { id: 'ed-req', class: 'input', placeholder: 'Search cards…', autocomplete: 'off', 'aria-label': 'Builds on' });
    const reqList = h('div', { class: 'req-results', hidden: true });
    function drawReq() {
      fill(reqChips, ...f.requires.map((id) => {
        const n = Model.notes.get(id);
        if (!n) return null;
        return h('span', { class: 'chip chip-x' }, h('span', { text: n.title || Render.plainText(n.front, 40) }),
          h('button', { type: 'button', 'aria-label': 'Remove', html: icon('x', 14), onclick: () => { f.requires = f.requires.filter((x) => x !== id); drawReq(); } }));
      }));
    }
    reqIn.addEventListener('input', () => {
      const q = reqIn.value.trim().toLowerCase();
      if (!q) { reqList.hidden = true; return; }
      const res = [];
      for (const n of Model.notes.values()) {
        if (editing && n.id === editing.id) continue;
        if (f.requires.includes(n.id)) continue;
        const label = n.title || Render.plainText(n.front, 70);
        if (label.toLowerCase().includes(q)) res.push([n, label]);
        if (res.length >= 8) break;
      }
      fill(reqList, ...(res.length ? res.map(([n, label]) => h('button', { type: 'button', class: 'req-item', onclick: () => { f.requires.push(n.id); reqIn.value = ''; reqList.hidden = true; drawReq(); } },
        h('span', { text: label }), h('span', { class: 'muted', text: n.deck }))) : [h('div', { class: 'muted req-none', text: 'No matching cards' })]));
      reqList.hidden = false;
    });
    drawReq();

    // ----- preview -----
    const pvTabs = h('div', { class: 'pv-tabs', role: 'tablist' });
    const pvCard = h('article', { class: 'card-sheet card-sheet-preview' });
    const pvFront = h('div', { class: 'prose' });
    const pvBack = h('div', { class: 'prose' });
    pvCard.append(pvFront, pvBack);
    pvCard.style.setProperty('--card-font', Math.max(15, Model.settings.cardFont - 2) + 'px');

    function currentFields() {
      return { type: f.type, deck: deckIn.value.trim() || 'Default', title: titleIn.value.trim(), front: frontTa.value, back: backTa.value, tags: tagsIn.value.split(/[\s,]+/).filter(Boolean), requires: f.requires.slice(), media: f.media };
    }
    const drawPreview = () => {
      const c = currentFields();
      const media = Object.keys(c.media).length ? c.media : null;
      const mk = media ? 'ed' + Object.keys(c.media).join('') : '';
      const ords = c.type === 'cloze' ? Render.clozeOrds(c.front) : [];
      if (ords.length && !ords.includes(previewOrd)) previewOrd = ords[0];
      const tabs = [];
      const mkTab = (label, active, fn) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(active), class: active ? 'on' : '', text: label, onclick: fn });
      tabs.push(mkTab('Front', previewSide === 'front', () => { previewSide = 'front'; drawPreview(); }));
      tabs.push(mkTab('Back', previewSide === 'back', () => { previewSide = 'back'; drawPreview(); }));
      if (c.type === 'reverse') tabs.push(mkTab('Reverse', previewSide === 'rev', () => { previewSide = 'rev'; drawPreview(); }));
      if (ords.length > 1) {
        tabs.push(h('span', { class: 'pv-sep' }));
        for (const o of ords) tabs.push(mkTab('c' + o, previewOrd === o, () => { previewOrd = o; drawPreview(); }));
      }
      fill(pvTabs, ...tabs);
      if (c.type === 'cloze') {
        renderCardHTML(pvFront, c.front, { cloze: ords.length ? { ord: previewOrd, side: previewSide === 'back' ? 'back' : 'front' } : null, media, mediaKey: mk });
        pvBack.hidden = previewSide !== 'back' || !c.back.trim();
        if (!pvBack.hidden) renderCardHTML(pvBack, c.back, { media, mediaKey: mk });
        pvBack.classList.add('card-extra');
      } else {
        pvBack.classList.remove('card-extra');
        const frontSrc = previewSide === 'rev' ? c.back : c.front;
        const backSrc = previewSide === 'rev' ? c.front : c.back;
        renderCardHTML(pvFront, frontSrc, { media, mediaKey: mk });
        pvBack.hidden = previewSide === 'front';
        if (!pvBack.hidden) renderCardHTML(pvBack, backSrc, { media, mediaKey: mk });
      }
      pvFront.querySelectorAll('details.env-hint').forEach((d) => { d.open = true; });
      // validation
      const msgs = [];
      if (c.type === 'cloze' && !ords.length) msgs.push('Add at least one cloze like {{c1::answer}} (select text and press the […] button).');
      if (!c.front.trim()) msgs.push('');
      const errs = pvCard.querySelectorAll('.katex-error').length;
      if (errs) msgs.push(`${plural(errs, 'formula')} ${errs === 1 ? 'has' : 'have'} a LaTeX error (shown in red).`);
      if (c.title && Model.titleIndex().get(c.title.toLowerCase()) && (!editing || Model.titleIndex().get(c.title.toLowerCase()) !== editing.id)) msgs.push('Another card already uses this title; links will go to that one.');
      warn.textContent = saveError || msgs.filter(Boolean).join(' ');
      saveBtn.disabled = saving || !c.front.trim() || (c.type === 'cloze' && !ords.length);
      if (saveNewBtn) saveNewBtn.disabled = saveBtn.disabled;
    };
    const schedulePreview = debounce(drawPreview, 140);
    const draftFields = () => {
      const c = currentFields();
      return { type:c.type,deck:c.deck,title:c.title,front:c.front,
        back:c.back,tags:tagsIn.value,requires:c.requires,media:clone(c.media),
        ...(editing ? {baseModified:editing.modified} : {}) };
    };
    const draftChanged = d => editing
      ? d.type !== editing.type || d.deck !== editing.deck ||
        d.title !== editing.title || d.front !== editing.front ||
        d.back !== editing.back || d.tags !== editing.tags.join(' ') ||
        JSON.stringify(d.requires) !== JSON.stringify(editing.requires)
      : !!(d.front || d.back);
    const saveDraft = debounce(() => {
      if (!valid() || saving) return;
      const d = draftFields();
      if (draftChanged(d)) {
        if (!editing) d.pendingSave = readDraft(key)?.pendingSave;
        writeDraft(key,d);
      }
    }, 500);

    function setType(v) {
      f.type = v;
      for (const b of seg.children) { const on = b.dataset.v === v; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); }
      frontLabel.textContent = v === 'cloze' ? 'Text' : 'Front';
      backLabel.textContent = v === 'cloze' ? 'Extra · optional' : 'Back';
      frontTa.placeholder = v === 'cloze'
        ? 'The derivative of $\\sin x$ is {{c1::$\\cos x$}}.\n\nClozes work inside math too: $$\\int_a^b f\'(x)\\,dx = {{c1::f(b)-f(a)}}$$'
        : 'State the Mean Value Theorem.';
      backTa.placeholder = v === 'cloze' ? 'Optional context, a proof sketch, a source…' : ':::theorem[Mean Value Theorem]\nIf $f$ is continuous on $[a,b]$ and differentiable on $(a,b)$, then $\\exists\\, c\\in(a,b)$ with $f\'(c)=\\frac{f(b)-f(a)}{b-a}$.\n:::';
      drawPreview();
    }

    // ----- text editing helpers -----
    function edApi(ta) {
      const api = {
        replace(start, end, text, selStart, selEnd) {
          ta.focus();
          ta.setSelectionRange(start, end);
          let ok = false;
          try { ok = document.execCommand && document.execCommand('insertText', false, text); } catch (e) { ok = false; }
          if (!ok) ta.setRangeText(text, start, end, 'end');
          ta.setSelectionRange(start + selStart, start + selEnd);
          ta.dispatchEvent(new Event('input', { bubbles: true }));
        },
        wrap(before, after, placeholder) {
          const s = ta.selectionStart, e = ta.selectionEnd;
          const sel = ta.value.slice(s, e) || placeholder;
          api.replace(s, e, before + sel + after, before.length, before.length + sel.length);
        },
        block(before, after, placeholder) {
          const s = ta.selectionStart, e = ta.selectionEnd;
          const sel = ta.value.slice(s, e) || placeholder;
          const pre = s > 0 && ta.value[s - 1] !== '\n' ? '\n' : '';
          const post = ta.value[e] && ta.value[e] !== '\n' ? '\n' : '';
          api.replace(s, e, pre + before + sel + after + post, pre.length + before.length, pre.length + before.length + sel.length);
        },
        insert(text) { const s = ta.selectionStart, e = ta.selectionEnd; api.replace(s, e, text, text.length, text.length); },
        snippet(tpl) {
          const s = ta.selectionStart, e = ta.selectionEnd;
          const sel = ta.value.slice(s, e);
          const i = tpl.indexOf('|');
          const text = tpl.replace('|', sel);
          api.replace(s, e, text, i, i + sel.length);
        },
        cloze(same) {
          const ords = Render.clozeOrds(frontTa.value);
          const n = ords.length ? (same ? Math.max(...ords) : Math.max(...ords) + 1) : 1;
          if (ta !== frontTa) { frontTa.focus(); }
          const t = frontTa;
          const s = t.selectionStart, e = t.selectionEnd;
          const sel = t.value.slice(s, e) || 'answer';
          const before = `{{c${n}::`;
          edApi(t).replace(s, e, before + sel + '}}', before.length, before.length + sel.length);
          if (f.type !== 'cloze') setType('cloze');
        },
      };
      return api;
    }
    const ed = () => edApi(lastTa || frontTa);

    const toolbar = h('div', { class: 'ed-toolbar', role: 'toolbar', 'aria-label': 'Insert' },
      QUICK_INSERTS.map(([label, title, fn]) => h('button', { type: 'button', class: 'tb-btn' + (label.length > 3 ? ' tb-wide' : ''), title, 'aria-label': title, text: label, onmousedown: (e) => e.preventDefault(), onclick: () => fn(ed()) })),
      h('label', { class: 'tb-btn tb-img', title: 'Insert image', 'aria-label': 'Insert image', html: icon('image', 16) }, h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: (e) => { const file = e.target.files[0]; if (file) addImage(file); e.target.value = ''; } })));

    // LaTeX autocomplete strip
    let suggestItems = [];
    function updateSuggest(ta) {
      const pos = ta.selectionStart;
      const before = ta.value.slice(Math.max(0, pos - 30), pos);
      const m = /\\([A-Za-z]{1,20}(?:\{[a-z*]*)?)$/.exec(before);
      if (!m || ta.selectionStart !== ta.selectionEnd) { suggest.hidden = true; suggestItems = []; return; }
      const q = m[1].toLowerCase();
      const res = TEX_SNIPPETS.filter((x) => x.k.toLowerCase().startsWith(q)).slice(0, 10);
      if (!res.length || (res.length === 1 && res[0].k === m[1])) { suggest.hidden = true; suggestItems = []; return; }
      suggestItems = res.map((x) => ({ x, from: pos - m[0].length, ta }));
      fill(suggest, ...suggestItems.map((it, i) => h('button', { type: 'button', role: 'option', class: 'sg' + (i === 0 ? ' on' : ''), onmousedown: (e) => e.preventDefault(), onclick: () => acceptSuggest(it) },
        h('span', { class: 'sg-k', text: '\\' + it.x.k }))));
      suggest.hidden = false;
    }
    function acceptSuggest(it) {
      const ta = it.ta;
      const tpl = it.x.s;
      const i = tpl.indexOf('|');
      edApi(ta).replace(it.from, ta.selectionStart, tpl.replace('|', ''), i, i);
      suggest.hidden = true;
      suggestItems = [];
    }

    for (const ta of [frontTa, backTa]) {
      ta.addEventListener('focus', () => { lastTa = ta; });
      ta.addEventListener('input', () => { updateSuggest(ta); schedulePreview(); saveDraft(); autoGrow(ta); });
      ta.addEventListener('click', () => updateSuggest(ta));
      ta.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== frontTa && document.activeElement !== backTa) suggest.hidden = true; }, 150));
      ta.addEventListener('keydown', (e) => {
        const mod = e.metaKey || e.ctrlKey;
        if (!suggest.hidden && suggestItems.length && (e.key === 'Tab' || (e.key === 'Enter' && !mod))) { e.preventDefault(); acceptSuggest(suggestItems[0]); return; }
        if (e.key === 'Escape' && !suggest.hidden) { e.preventDefault(); e.stopPropagation(); suggest.hidden = true; return; }
        if (mod && e.key === 'Enter') { e.preventDefault(); save(false); return; }
        if (mod && e.shiftKey && (e.key === 'C' || e.key === 'c')) { e.preventDefault(); edApi(ta).cloze(e.altKey); return; }
        if (mod && (e.key === 'm' || e.key === 'M')) { e.preventDefault(); if (e.shiftKey) edApi(ta).block('$$\n', '\n$$', 'x'); else edApi(ta).wrap('$', '$', 'x'); return; }
      });
      ta.addEventListener('paste', (e) => {
        const items = e.clipboardData && e.clipboardData.files;
        if (items && items.length && /^image\//.test(items[0].type)) { e.preventDefault(); lastTa = ta; addImage(items[0]); }
      });
      ta.addEventListener('drop', (e) => {
        const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (file && /^image\//.test(file.type)) { e.preventDefault(); lastTa = ta; addImage(file); }
      });
    }
    function autoGrow(ta) {
      ta.style.height = 'auto';
      ta.style.height = Math.min(window.innerHeight * 0.5, Math.max(ta.scrollHeight + 2, 96)) + 'px';
    }

    async function addImage(file) {
      try {
        const dataUrl = await compressImage(file, 1100, 0.82);
        if (!valid()) return;
        const id = 'img' + Math.random().toString(36).slice(2, 7);
        f.media[id] = dataUrl;
        ed().insert(`![](media:${id})`);
        if (dataUrl.length > 160000) toast('Large image: cards are limited to about 250 KB in total.', { ms: 5000 });
      } catch (e) { toast('That image couldn’t be read.', { kind: 'error' }); }
    }

    // ----- save -----
    const saveBtn = h('button', { class: 'btn btn-primary', type: 'button', text: editing ? 'Save' : 'Add card', onclick: () => save(false) });
    const saveNewBtn = editing ? null : h('button', { class: 'btn', type: 'button', text: 'Add & next', title: 'Add this card and start another in the same deck', onclick: () => save(true) });
    const delBtn = editing ? h('button', { class: 'btn btn-ghost-danger', type: 'button', html: icon('trash', 16) + '<span>Delete</span>', onclick: async () => {
      if (!valid() || saving) return;
      if (!(await confirmDialog({ title: 'Delete this card?', message: `This deletes the note, its ${plural(Object.keys(editing.cards).length, 'card')} and review history.`, confirmLabel: 'Delete', danger: true }))) return;
      if (!valid() || saving) return;
      Model.deleteNote(editing.id);
      sheet.close();
      toast('Card deleted');
      if (onSaved) onSaved(null);
    } }) : null;

    async function save(again) {
      if (!valid() || saving) return;
      const c = currentFields();
      if (!c.front.trim()) return;
      if (c.type === 'cloze' && !Render.clozeOrds(c.front).length) return;
      const used = (c.front + '\n' + c.back).match(/media:([\w-]+)/g) || [];
      const keep = new Set(used.map((u) => u.slice(6)));
      const media = {};
      for (const k of Object.keys(c.media)) if (keep.has(k)) media[k] = c.media[k];
      const fields = { type: c.type, deck: c.deck, title: c.title, front: c.front, back: c.back, tags: c.tags, requires: c.requires, media };
      if (!editing && saveBase && Model.notes.has(saveBase.id)) {
        saveError = 'This card was already saved. Open it from Cards before making changes.';
        drawPreview();
        return;
      }
      saving = true;
      saveError = '';
      const inputs = [...body.querySelectorAll('input, textarea, button')];
      const disabled = inputs.map(el => el.disabled);
      inputs.forEach(el => { el.disabled = true; });
      if (delBtn) delBtn.disabled = true;
      saveBtn.textContent = 'Saving…';
      drawPreview();
      let note;
      try {
        saveBase ||= editing ? clone(editing) : { id: uid(), cards: {}, log: [] };
        // Record the exact attempted content and ID before starting the write.
        // Reload can distinguish a committed card from an interrupted attempt.
        const draft = draftFields();
        if (!editing) draft.pendingSave = { id:saveBase.id, fields:content(draftContent(fields)) };
        writeDraft(key, draft);
        note = await Model.commitEditorNote(saveBase, fields, currentWorkspace, { createOnly: !editing });
      } catch (error) {
        if (valid()) {
          saveError = 'Could not save. Your input is kept here; retry Save or copy it before leaving.';
          toast(saveError, { kind: 'error' });
        }
        return;
      } finally {
        saving = false;
        if (valid()) {
          inputs.forEach((el, i) => { el.disabled = disabled[i]; });
          if (delBtn) delBtn.disabled = false;
          saveBtn.textContent = editing ? 'Save' : 'Add card';
          drawPreview();
        }
      }
      if (!valid()) return;
      Model.addDeck(c.deck);
      Model.setMeta({ lastDeck: c.deck });
      clearDraft(key);
      committed = true;
      toast(editing ? 'Saved' : `Added to ${c.deck.split('::').pop()}`);
      if (again) {
        committed = false;
        saveBase = null;
        titleIn.value = ''; frontTa.value = ''; backTa.value = ''; f.requires = []; f.media = {};
        drawReq(); drawPreview(); frontTa.focus();
        return;
      }
      sheet.close();
      if (onSaved) onSaved(note);
    }

    // ----- layout -----
    const mTabs = h('div', { class: 'seg ed-mtabs', role: 'tablist', 'aria-label': 'Editor view' },
      [['write', 'Write'], ['preview', 'Preview']].map(([v, l]) => h('button', { type: 'button', role: 'tab', class: v === 'write' ? 'on' : '', 'aria-selected': String(v === 'write'), text: l, onclick: (e) => {
        body.classList.toggle('show-preview', v === 'preview');
        for (const b of mTabs.children) { const on = b === e.currentTarget; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); }
        if (v === 'preview') drawPreview();
      } })));
    const body = h('div', { class: 'editor' }, mTabs,
      h('div', { class: 'ed-form' },
        recoveredSave ? h('div', { class: 'ed-restored', text: 'Your previous card was saved.' }) : null,
        draftRestored ? h('div', { class: 'ed-restored' }, h('span', { text: 'Draft restored' }), h('button', { class: 'link-btn', type: 'button', text: 'Discard', onclick: () => {
          if (!valid()) return;
          clearDraft(key);
          saveBase = null;
          saveError = '';
          if (editing) {
            frontTa.value = editing.front; backTa.value = editing.back;
            titleIn.value = editing.title; deckIn.value = editing.deck;
            tagsIn.value = editing.tags.join(' '); f.requires = editing.requires.slice();
          } else { frontTa.value = ''; backTa.value = ''; titleIn.value = ''; }
          drawReq(); drawPreview();
        } })) : null,
        seg,
        h('div', { class: 'field-row' },
          h('div', { class: 'field' }, h('label', { for: 'ed-deck', class: 'field-label', text: 'Deck' }), deckIn, deckList),
          h('div', { class: 'field' }, h('label', { for: 'ed-title', class: 'field-label' }, 'Title ', h('span', { class: 'muted', text: 'optional' })), titleIn)),
        h('div', { class: 'field' }, frontLabel, toolbar, frontTa, suggest),
        h('div', { class: 'field' }, backLabel, backTa),
        h('div', { class: 'field-row' },
          h('div', { class: 'field' }, h('label', { for: 'ed-tags', class: 'field-label', text: 'Tags' }), tagsIn),
          h('div', { class: 'field field-req' }, h('label', { for: 'ed-req', class: 'field-label', text: 'Builds on' }), reqChips, reqIn, reqList)),
        warn),
      h('div', { class: 'ed-preview' }, h('div', { class: 'ed-preview-head' }, h('span', { class: 'field-label', text: 'Preview' }), pvTabs), pvCard,
        h('details', { class: 'ed-help' }, h('summary', { text: 'Syntax' }), h('div', { class: 'prose small', html: Render.render(HELP_MD) }))));

    const sheet = Sheets.open({
      title: editing ? 'Edit card' : 'New card', wide: true, className: 'sheet-editor', body,
      actions: [delBtn, h('span', { class: 'spacer' }), saveNewBtn, saveBtn],
      onClose: () => {
        // Preserve unsaved new-card text on forced account change. Do not
        // write a stale draft under whichever workspace happens to be active.
        if (!closed && !committed) {
          const draft = draftFields();
          if (draftChanged(draft)) {
            if (!editing) draft.pendingSave = readDraft(key)?.pendingSave;
            writeDraft(key,draft);
          }
        }
        closed = true;
      },
    });
    setType(f.type);
    autoGrow(frontTa);
    autoGrow(backTa);
    if (!isTouch()) setTimeout(() => frontTa.focus(), 60);
    return sheet;
  }

  const HELP_MD = [
    '- Math: `$x^2$` inline, `$$\\int_0^1 f$$` display, `\\begin{align*}…\\end{align*}`.',
    '- Cloze: `{{c1::answer}}` or `{{c1::answer::hint}}`, also inside math.',
    '- Blocks: `:::theorem[Name]` … `:::` (also lemma, definition, corollary, example, remark, proof).',
    '- `:::proof*` with a numbered list reveals one step at a time.',
    '- `:::hint` … `:::` on the front is revealed on demand (H).',
    '- `[[Title]]` links to another card and marks it as a prerequisite.',
    '- `==highlight==`, **bold**, *italic*, lists, tables, `code`.',
    '- Macros such as `\\R`, `\\norm{x}`, `\\tr` come from Settings › Math.',
  ].join('\n');

  return { open };
})();

function compressImage(file, maxSide, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('decode'));
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * scale));
        c.height = Math.max(1, Math.round(img.height * scale));
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        let url = c.toDataURL('image/webp', quality);
        if (!/^data:image\/webp/.test(url)) url = c.toDataURL('image/jpeg', quality);
        resolve(url);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
