/* ---------- import, export, generate ---------- */
const ImportSheet = (() => {
  function open() {
    let parsed = null;
    const fileIn = h('input', { id: 'imp-file', type: 'file', accept: '.md,.markdown,.txt,.tsv,.csv,.json,text/plain,application/json', class: 'file-input' });
    const ta = h('textarea', { id: 'imp-text', class: 'input code-input', rows: 8, spellcheck: 'false', placeholder: 'Paste cards here. For example:\n\nQ: State Rolle’s theorem.\nA: If $f$ is continuous on $[a,b]$, differentiable on $(a,b)$ and $f(a)=f(b)$, then $f\'(c)=0$ for some $c\\in(a,b)$.\n\nThe Gaussian integral is $\\int_{-\\infty}^{\\infty} e^{-x^2}\\,dx = {{c1::\\sqrt{\\pi}}}$.' });
    const deckIn = h('input', { id: 'imp-deck', class: 'input', value: 'Imported', list: 'imp-decks', autocomplete: 'off' });
    const decks = h('datalist', { id: 'imp-decks' }, Model.deckNames().map((d) => h('option', { value: d })));
    const tagIn = h('input', { id: 'imp-tag', class: 'input', placeholder: 'optional', autocomplete: 'off' });
    const restore = h('input', { id: 'imp-restore', type: 'checkbox', class: 'switch' });
    const restoreRow = h('div', { class: 'setting', hidden: true }, h('label', { for: 'imp-restore', class: 'setting-label', text: 'Also restore settings from the backup' }), restore);
    const summary = h('div', { class: 'imp-summary', 'aria-live': 'polite' });
    const go = h('button', { class: 'btn btn-primary', type: 'button', text: 'Import', disabled: true });
    const analyse = debounce(() => {
      parsed = IO.parse(ta.value, { deck: deckIn.value.trim() || 'Imported' });
      restoreRow.hidden = parsed.format !== 'backup';
      const n = parsed.notes.length;
      go.disabled = !n;
      go.textContent = parsed.format === 'backup' ? `Restore ${plural(n, 'note')}` : `Import ${plural(n, 'card')}`;
      fill(summary);
      if (!ta.value.trim()) return;
      if (parsed.warnings.length) summary.append(h('p', { class: 'ai-error small', text: parsed.warnings.join(' ') }));
      if (!n) return;
      const fmtName = { backup: 'Lemma backup', json: 'JSON', lemma: 'Lemma Markdown', anki: 'Anki text export', tsv: 'tab-separated rows', qa: 'Q:/A: blocks', text: 'plain text' }[parsed.format] || parsed.format;
      const types = {};
      for (const x of parsed.notes) types[x.type] = (types[x.type] || 0) + 1;
      summary.append(h('p', { class: 'small' }, h('b', { text: plural(n, 'card') }), ` found (${fmtName}): ` + Object.entries(types).map(([k, v]) => `${v} ${k}`).join(', ') + '.'));
      if (parsed.format !== 'backup') {
        const list = h('div', { class: 'imp-preview' });
        for (const x of parsed.notes.slice(0, 3)) {
          const pv = h('div', { class: 'prose small' });
          renderCardHTML(pv, x.front, { cloze: x.type === 'cloze' ? 'all' : null });
          list.append(h('div', { class: 'imp-item' }, pv));
        }
        if (n > 3) list.append(h('p', { class: 'muted small', text: `and ${n - 3} more` }));
        summary.append(list);
      }
    }, 200);
    ta.addEventListener('input', analyse);
    deckIn.addEventListener('input', analyse);
    fileIn.addEventListener('change', () => {
      const file = fileIn.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => { ta.value = String(reader.result || ''); analyse(); };
      reader.onerror = () => toast('That file couldn’t be read.', { kind: 'error' });
      reader.readAsText(file);
    });
    go.addEventListener('click', () => {
      if (!parsed || !parsed.notes.length) return;
      const extraTags = tagIn.value.split(/[\s,]+/).filter(Boolean);
      const res = IO.commit(parsed, { restoreSettings: restore.checked, extraTags });
      if (parsed.format !== 'backup') Model.addDeck(deckIn.value.trim() || 'Imported');
      s.close();
      toast(parsed.format === 'backup'
        ? `Restored ${plural(res.added, 'note')}${res.updated ? `, updated ${res.updated}` : ''}${res.skipped ? `, kept ${res.skipped} existing` : ''}.`
        : `Imported ${plural(res.added, 'card')}${res.skipped ? ` (${res.skipped} duplicates skipped)` : ''}.`);
      App.refresh();
    });
    const s = Sheets.open({
      title: 'Import cards', wide: true,
      body: h('div', { class: 'imp' },
        h('p', { class: 'muted small', text: 'Accepts Lemma exports and backups, Anki “Notes in plain text” files, tab-separated rows (front, back, tags), Q:/A: blocks, “front :: back” lines, and paragraphs with {{c1::cloze}} deletions. Anki’s \\( \\) and \\[ \\] math works as is.' }),
        h('div', { class: 'field' }, h('label', { for: 'imp-file', class: 'field-label', text: 'Choose a file' }), fileIn),
        h('div', { class: 'field' }, h('label', { for: 'imp-text', class: 'field-label', text: 'or paste text' }), ta),
        h('div', { class: 'field-row' },
          h('div', { class: 'field' }, h('label', { for: 'imp-deck', class: 'field-label', text: 'Deck (unless the file names one)' }), deckIn, decks),
          h('div', { class: 'field' }, h('label', { for: 'imp-tag', class: 'field-label', text: 'Add a tag' }), tagIn)),
        restoreRow, summary),
      actions: [h('span', { class: 'spacer' }), go],
    });
  }
  return { open };
})();

const ExportSheet = (() => {
  let downloads;
  async function getDownloads() {
    if (downloads !== undefined) return downloads;
    downloads = null;
    if (window.claude && typeof window.claude.use === 'function') {
      downloads = await Promise.race([window.claude.use('downloads').catch(() => null), new Promise((r) => setTimeout(() => r(null), 4000))]);
    }
    return downloads;
  }
  function open(deck) {
    let format = 'json';
    const deckSel = h('select', { id: 'exp-deck', class: 'input select' }, h('option', { value: '', text: 'All decks' }), Model.deckNames().map((d) => h('option', { value: d, selected: d === deck, text: d })));
    const out = h('textarea', { id: 'exp-text', class: 'input code-input', rows: 8, readonly: true, 'aria-label': 'Exported text' });
    const radio = (v, label, help) => h('label', { class: 'radio-row' },
      h('input', { type: 'radio', name: 'exp-fmt', value: v, checked: v === format, onchange: () => { format = v; build(); } }),
      h('span', null, h('b', { text: label }), h('span', { class: 'muted small block', text: help })));
    const info = h('p', { class: 'muted small' });
    function content() {
      const d = deckSel.value;
      const notes = [...Model.notes.values()].filter((n) => !d || Model.inDeck(n, d));
      if (format === 'json') {
        if (!d) return { text: IO.exportJSON(), n: notes.length };
        return { text: JSON.stringify({ app: 'lemma', version: 1, exported: new Date().toISOString(), profile: Model.profile(), notes }, null, 1), n: notes.length };
      }
      return { text: IO.exportMarkdown(notes), n: notes.length };
    }
    function build() {
      const c = content();
      out.value = c.text;
      info.textContent = `${plural(c.n, 'note')} · ${(c.text.length / 1024).toFixed(0)} KB`;
    }
    deckSel.addEventListener('change', build);
    const fname = () => {
      const d = deckSel.value ? deckSel.value.replace(/::/g, '-').replace(/[^\w.-]+/g, '-') : 'all';
      const stamp = new Date().toISOString().slice(0, 10);
      return `lemma-${d}-${stamp}.${format === 'json' ? 'json' : 'md'}`;
    };
    const dlBtn = h('button', { class: 'btn btn-primary', type: 'button', html: icon('download', 16) + '<span>Download</span>', hidden: true, onclick: async () => {
      const d = await getDownloads();
      if (!d) return;
      try { await d.save({ filename: fname(), data: out.value }); toast('Saved'); }
      catch (e) { if (e && e.code !== 'declined') toast('The file couldn’t be saved here. Copy the text instead.', { kind: 'error' }); }
    } });
    const copyBtn = h('button', { class: 'btn', type: 'button', html: icon('check', 16) + '<span>Copy</span>', onclick: () => copyText(out.value, out) });
    getDownloads().then((d) => { dlBtn.hidden = !d; });
    Sheets.open({
      title: 'Export', wide: true,
      body: h('div', { class: 'exp' },
        h('div', { class: 'field' }, h('label', { for: 'exp-deck', class: 'field-label', text: 'Cards' }), deckSel),
        h('fieldset', { class: 'radios' }, h('legend', { class: 'field-label', text: 'Format' }),
          radio('json', 'Backup (JSON)', 'Everything, including review history and settings. Import it here to restore.'),
          radio('md', 'Markdown', 'Card text only, readable in any editor and importable here.')),
        info, out),
      actions: [h('span', { class: 'spacer' }), copyBtn, dlBtn],
    });
    build();
  }
  return { open };
})();

const GenerateSheet = (() => {
  function open(preset = {}) {
    let image = null;
    let results = [];
    let ctl = null;
    const ta = h('textarea', { id: 'gen-text', class: 'input code-input', rows: 9, spellcheck: 'false', placeholder: 'Paste lecture notes, a theorem with its proof, or a section of a textbook (LaTeX is fine).' });
    ta.value = preset.text || '';
    const count = h('select', { id: 'gen-count', class: 'input select' }, [5, 8, 12, 20].map((n) => h('option', { value: n, selected: n === 8, text: n + ' cards' })));
    const style = h('select', { id: 'gen-style', class: 'input select' }, [['balanced', 'Balanced'], ['statements', 'Definitions & statements'], ['proofs', 'Proof ideas & steps'], ['cloze', 'Formulas as clozes']].map(([v, l]) => h('option', { value: v, text: l })));
    const deckIn = h('input', { id: 'gen-deck', class: 'input', value: preset.deck || Model.meta.lastDeck || 'Generated', list: 'gen-decks', autocomplete: 'off' });
    const decks = h('datalist', { id: 'gen-decks' }, Model.deckNames().map((d) => h('option', { value: d })));
    const imgName = h('span', { class: 'muted small' });
    const imgIn = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', hidden: true, id: 'gen-img' });
    imgIn.addEventListener('change', () => { image = imgIn.files[0] || null; imgName.textContent = image ? image.name : ''; });
    const imgBtn = AI.canSendImages() ? h('label', { class: 'btn btn-sm', for: 'gen-img', html: icon('image', 16) + '<span>Add a photo of notes</span>' }) : null;
    const status = h('div', { class: 'gen-status', 'aria-live': 'polite' });
    const list = h('div', { class: 'gen-list' });
    const genBtn = h('button', { class: 'btn btn-primary', type: 'button', html: icon('spark', 16) + '<span>Generate</span>' });
    const addBtn = h('button', { class: 'btn btn-primary', type: 'button', text: 'Add cards', hidden: true });
    const stopBtn = h('button', { class: 'btn', type: 'button', text: 'Stop', hidden: true, onclick: () => ctl && ctl.abort() });
    genBtn.addEventListener('click', async () => {
      if (!ta.value.trim() && !image) { toast('Paste some material or add a photo first.'); return; }
      ctl = new AbortController();
      genBtn.disabled = true; stopBtn.hidden = false; addBtn.hidden = true;
      fill(status, h('p', { class: 'thinking', text: 'Claude is reading your material and writing cards…' }));
      fill(list);
      try {
        results = await AI.generate({ material: ta.value, count: +count.value, style: style.value, image, signal: ctl.signal });
        results.forEach((r) => { r.keep = true; });
        fill(status, h('p', { class: 'small' }, h('b', { text: plural(results.length, 'card') }), ' ready. Review them, untick any you don’t want, and edit freely.'));
        drawList();
      } catch (e) {
        fill(status, e && e.code === 'cancelled' ? h('p', { class: 'muted small', text: 'Stopped.' }) : h('p', { class: 'ai-error', text: AI.errorMessage(e) }));
      }
      genBtn.disabled = false; stopBtn.hidden = true;
    });
    function drawList() {
      fill(list, ...results.map((r, i) => {
        const cb = h('input', { type: 'checkbox', class: 'gen-check', checked: r.keep, 'aria-label': 'Keep card ' + (i + 1), onchange: (e) => { r.keep = e.target.checked; sync(); } });
        const front = h('div', { class: 'prose small' });
        const back = h('div', { class: 'prose small gen-back' });
        const paint = () => {
          renderCardHTML(front, r.front, { cloze: r.type === 'cloze' ? 'all' : null });
          back.hidden = !r.back.trim();
          if (r.back.trim()) renderCardHTML(back, r.back);
        };
        paint();
        const editBox = h('div', { class: 'gen-edit', hidden: true });
        const fT = h('textarea', { class: 'input code-input', rows: 4, 'aria-label': 'Front' });
        const bT = h('textarea', { class: 'input code-input', rows: 4, 'aria-label': 'Back' });
        fT.value = r.front; bT.value = r.back;
        fT.addEventListener('input', () => { r.front = fT.value; if (/\{\{c\d+::/.test(r.front)) r.type = 'cloze'; else if (r.type === 'cloze') r.type = 'basic'; paint(); });
        bT.addEventListener('input', () => { r.back = bT.value; paint(); });
        editBox.append(fT, bT);
        return h('div', { class: 'gen-item' + (r.keep ? '' : ' off') },
          h('div', { class: 'gen-item-head' }, cb,
            h('span', { class: 'chip', text: r.type === 'reverse' ? 'Basic + reverse' : r.type === 'cloze' ? 'Cloze' : 'Basic' }),
            r.title ? h('span', { class: 'gen-title', text: r.title }) : null,
            r.requires.length ? h('span', { class: 'muted small', text: 'builds on ' + r.requires.join(', ') }) : null,
            h('span', { class: 'spacer' }),
            h('button', { class: 'link-btn', type: 'button', text: 'Edit', onclick: (e) => { editBox.hidden = !editBox.hidden; e.target.textContent = editBox.hidden ? 'Edit' : 'Done'; } })),
          front, back, editBox);
      }));
      sync();
    }
    function sync() {
      const n = results.filter((r) => r.keep).length;
      addBtn.hidden = !results.length;
      addBtn.disabled = !n;
      addBtn.textContent = `Add ${plural(n, 'card')}`;
      list.querySelectorAll('.gen-item').forEach((el, i) => el.classList.toggle('off', !results[i].keep));
    }
    addBtn.addEventListener('click', () => {
      const deck = deckIn.value.trim() || 'Generated';
      const keep = results.filter((r) => r.keep);
      const res = IO.commit({ format: 'json', notes: keep.map((r) => ({ deck, type: r.type, title: r.title, front: r.front, back: r.back, tags: r.tags, requiresTitles: r.requires })) }, {});
      Model.addDeck(deck);
      Model.setMeta({ lastDeck: deck });
      s.close();
      toast(`Added ${plural(res.added, 'card')} to ${deck.split('::').pop()}${res.skipped ? ` (${res.skipped} duplicates skipped)` : ''}.`);
      App.refresh();
    });
    const s = Sheets.open({
      title: 'Generate cards with Claude', wide: true,
      body: h('div', { class: 'gen' },
        h('div', { class: 'field' }, h('label', { for: 'gen-text', class: 'field-label', text: 'Material' }), ta,
          imgBtn ? h('div', { class: 'gen-img' }, imgBtn, imgIn, imgName) : null),
        h('div', { class: 'field-row three' },
          h('div', { class: 'field' }, h('label', { for: 'gen-count', class: 'field-label', text: 'How many' }), count),
          h('div', { class: 'field' }, h('label', { for: 'gen-style', class: 'field-label', text: 'Focus' }), style),
          h('div', { class: 'field' }, h('label', { for: 'gen-deck', class: 'field-label', text: 'Deck' }), deckIn, decks)),
        h('p', { class: 'muted small', text: 'Uses your Claude account. Cards are only added after you review them.' }),
        status, list),
      actions: [stopBtn, h('span', { class: 'spacer' }), genBtn, addBtn],
      onClose: () => { if (ctl) ctl.abort(); },
    });
  }
  return { open };
})();
