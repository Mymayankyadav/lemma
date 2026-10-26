/* ---------- import / export ---------- */
const IO = (() => {
  const attrQuote = (s) => '"' + String(s).replace(/"/g, '&quot;') + '"';
  const unQuote = (s) => String(s).replace(/&quot;/g, '"');

  function exportMarkdown(notes) {
    const out = ['<!-- Lemma flashcards: Markdown + LaTeX. Each card starts with a lemma:card comment. -->', ''];
    for (const n of notes) {
      const req = (n.requires || []).map((id) => Model.notes.get(id)).filter((p) => p && p.title).map((p) => p.title);
      const attrs = [`type=${n.type}`, `deck=${attrQuote(n.deck)}`];
      if (n.title) attrs.push(`title=${attrQuote(n.title)}`);
      if (n.tags && n.tags.length) attrs.push(`tags=${attrQuote(n.tags.join(' '))}`);
      if (req.length) attrs.push(`requires=${attrQuote(req.join('; '))}`);
      out.push(`<!-- lemma:card ${attrs.join(' ')} -->`);
      out.push(n.front.trim());
      if (n.back.trim()) { out.push('', '<!-- lemma:back -->', n.back.trim()); }
      out.push('', '');
    }
    return out.join('\n');
  }
  function exportJSON() {
    return JSON.stringify({ app: 'lemma', version: 1, exported: new Date().toISOString(), profile: Model.profile(), notes: [...Model.notes.values()] }, null, 1);
  }

  function parseAttrs(s) {
    const out = {};
    const re = /([a-zA-Z]+)\s*=\s*(?:"([^"]*)"|([^\s"]+))/g;
    let m;
    while ((m = re.exec(s))) out[m[1].toLowerCase()] = unQuote(m[2] !== undefined ? m[2] : m[3]);
    return out;
  }
  function guessType(front, back, hint) {
    if (hint && ['basic', 'reverse', 'cloze'].includes(hint)) return hint;
    if (/\{\{c\d+::/.test(front)) return 'cloze';
    return 'basic';
  }

  /** Delimited text with quoted fields (Anki "notes in plain text", CSV, TSV). */
  function parseDelimited(text, sep) {
    const rows = [];
    let row = [], field = '', i = 0, q = false;
    while (i < text.length) {
      const ch = text[i];
      if (q) {
        if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 2; continue; }
        if (ch === '"') { q = false; i++; continue; }
        field += ch; i++; continue;
      }
      if (ch === '"' && field === '') { q = true; i++; continue; }
      if (ch === sep) { row.push(field); field = ''; i++; continue; }
      if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
      if (ch === '\r') { i++; continue; }
      field += ch; i++;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows;
  }
  function ankiHtmlToMd(s) {
    return String(s || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(div|p)>\s*<(div|p)[^>]*>/gi, '\n')
      .replace(/<\/?(div|p|span)[^>]*>/gi, '')
      .replace(/<img[^>]*>/gi, '')
      .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
      .replace(/\n{3,}/g, '\n\n').trim();
  }

  /**
   * Parse pasted or uploaded text into note fields.
   * Returns {format, notes: [...], backup?: {profile, notes}, warnings: []}
   */
  function parse(text, { deck = 'Default' } = {}) {
    text = String(text || '').replace(/\r\n?/g, '\n').replace(/^\uFEFF/, '');
    const warnings = [];
    const trimmed = text.trim();
    if (!trimmed) return { format: 'empty', notes: [], warnings: ['Nothing to import.'] };

    if (trimmed[0] === '{' || trimmed[0] === '[') {
      try {
        const data = JSON.parse(trimmed);
        if (data && data.app === 'lemma' && Array.isArray(data.notes)) return { format: 'backup', notes: data.notes, backup: data, warnings };
        const arr = Array.isArray(data) ? data : Array.isArray(data.cards) ? data.cards : Array.isArray(data.notes) ? data.notes : null;
        if (arr) {
          const notes = arr.filter((x) => x && (x.front || x.question)).map((x) => ({
            deck: x.deck || deck, type: guessType(String(x.front || x.question || ''), '', x.type), title: x.title || '',
            front: String(x.front || x.question || ''), back: String(x.back || x.answer || ''),
            tags: Array.isArray(x.tags) ? x.tags : typeof x.tags === 'string' ? x.tags.split(/\s+/) : [],
            requiresTitles: Array.isArray(x.requires) ? x.requires.map(String) : [],
          }));
          return { format: 'json', notes, warnings };
        }
      } catch (e) { warnings.push('That looks like JSON but could not be read: ' + e.message); }
    }

    if (/<!--\s*lemma:card\b/.test(text)) {
      const parts = text.split(/<!--\s*lemma:card\b([^>]*?)-->/);
      const notes = [];
      for (let i = 1; i < parts.length; i += 2) {
        const a = parseAttrs(parts[i]);
        const body = parts[i + 1] || '';
        const [front, back = ''] = body.split(/<!--\s*lemma:back\s*-->/);
        notes.push({
          deck: a.deck || deck, type: guessType(front, back, a.type), title: a.title || '',
          front: front.trim(), back: back.trim(),
          tags: (a.tags || '').split(/\s+/).filter(Boolean),
          requiresTitles: (a.requires || '').split(';').map((x) => x.trim()).filter(Boolean),
        });
      }
      return { format: 'lemma', notes, warnings };
    }

    const lines = text.split('\n');
    const tabbed = lines.filter((l) => l.includes('\t')).length;
    const content = lines.filter((l) => l.trim() && !l.startsWith('#')).length;
    if (tabbed && tabbed >= content * 0.6) {
      let tagCol = -1;
      const header = lines.filter((l) => l.startsWith('#'));
      for (const hl of header) { const m = /^#tags column:(\d+)/.exec(hl); if (m) tagCol = +m[1] - 1; }
      const isHtml = header.some((l) => /^#html:true/.test(l)) || /<br|<div|&nbsp;/.test(text);
      const body = lines.filter((l) => !l.startsWith('#')).join('\n');
      const rows = parseDelimited(body, '\t').filter((r) => r.some((f) => f.trim()));
      const notes = rows.map((r) => {
        const conv = (s) => (isHtml ? ankiHtmlToMd(s) : String(s || '').trim());
        const front = conv(r[0]);
        const back = conv(r[1]);
        const tagsField = tagCol >= 0 ? r[tagCol] : r.length > 2 ? r[r.length - 1] : '';
        return { deck, type: guessType(front, back), title: '', front, back, tags: String(tagsField || '').split(/\s+/).filter(Boolean), requiresTitles: [] };
      }).filter((n) => n.front);
      return { format: isHtml ? 'anki' : 'tsv', notes, warnings };
    }

    // Q:/A: blocks, "front :: back" lines, cloze paragraphs; "# Deck: name" switches deck
    const notes = [];
    let curDeck = deck;
    let q = null, a = null, mode = null;
    const flushQA = () => {
      if (q != null && q.trim()) notes.push({ deck: curDeck, type: guessType(q, a || ''), title: '', front: q.trim(), back: (a || '').trim(), tags: [], requiresTitles: [] });
      q = a = mode = null;
    };
    const hasQA = /^Q:\s?/m.test(text) && /^A:\s?/m.test(text);
    if (hasQA) {
      for (const line of lines) {
        const dm = /^#+\s*Deck:\s*(.+)$/i.exec(line);
        if (dm) { flushQA(); curDeck = dm[1].trim(); continue; }
        if (/^Q:\s?/.test(line)) { flushQA(); q = line.replace(/^Q:\s?/, ''); mode = 'q'; continue; }
        if (/^A:\s?/.test(line) && mode === 'q') { a = line.replace(/^A:\s?/, ''); mode = 'a'; continue; }
        if (mode === 'q') q += '\n' + line;
        else if (mode === 'a') a += '\n' + line;
      }
      flushQA();
      return { format: 'qa', notes, warnings };
    }
    const blocks = text.split(/\n\s*\n/);
    for (const block of blocks) {
      const b = block.trim();
      if (!b) continue;
      const dm = /^#+\s*Deck:\s*(.+)$/im.exec(b);
      if (dm && b.split('\n').length === 1) { curDeck = dm[1].trim(); continue; }
      const blines = b.split('\n');
      if (blines.every((l) => / :: /.test(l) && !/^:::/.test(l))) {
        for (const l of blines) {
          const i = l.indexOf(' :: ');
          notes.push({ deck: curDeck, type: 'basic', title: '', front: l.slice(0, i).trim(), back: l.slice(i + 4).trim(), tags: [], requiresTitles: [] });
        }
        continue;
      }
      if (/\{\{c\d+::/.test(b)) {
        notes.push({ deck: curDeck, type: 'cloze', title: '', front: b, back: '', tags: [], requiresTitles: [] });
        continue;
      }
    }
    if (!notes.length) warnings.push('No cards found. Use Q:/A: lines, "front :: back" lines, cloze deletions {{c1::…}}, tab-separated rows, or a Lemma export.');
    return { format: 'text', notes, warnings };
  }

  /** Add parsed notes to the collection. Returns {added, skipped, updated}. */
  function commit(parsed, opts = {}) {
    let added = 0, skipped = 0, updated = 0;
    if (parsed.format === 'backup') {
      for (const raw of parsed.notes) {
        if (!raw || !raw.id) continue;
        const existing = Model.notes.get(raw.id);
        if (existing) {
          if ((raw.modified || 0) > (existing.modified || 0) || (raw.log || []).length > (existing.log || []).length) {
            Model.notes.set(raw.id, Model.sanitizeNote(clone(raw)));
            Store.saveNote(Model.notes.get(raw.id));
            updated++;
          } else skipped++;
        } else {
          const n = Model.sanitizeNote(clone(raw));
          Model.notes.set(n.id, n);
          Store.saveNote(n);
          added++;
        }
      }
      if (opts.restoreSettings && parsed.backup.profile && parsed.backup.profile.settings) Model.setSettings(parsed.backup.profile.settings);
      Model.bump();
      return { added, skipped, updated };
    }
    const existingFronts = new Set([...Model.notes.values()].map((n) => n.deck + '\u0000' + n.front.trim()));
    const created = [];
    for (const f of parsed.notes) {
      const key = f.deck + '\u0000' + f.front.trim();
      if (existingFronts.has(key)) { skipped++; continue; }
      existingFronts.add(key);
      const n = Model.createNote({ deck: f.deck, type: f.type, title: f.title, front: f.front, back: f.back, tags: (f.tags || []).concat(opts.extraTags || []) }, { silent: true });
      created.push([n, f.requiresTitles || []]);
      added++;
    }
    // resolve prerequisite titles once everything exists
    Model.bump();
    for (const [n, titles] of created) {
      if (!titles.length) continue;
      const ids = titles.map((t) => Model.resolveTarget(t)).filter(Boolean).map((p) => p.id).filter((id) => id !== n.id);
      if (ids.length) { n.requires = [...new Set([...(n.requires || []), ...ids])]; Store.saveNote(n); }
    }
    Model.bump();
    return { added, skipped, updated, created: created.map(([n]) => n) };
  }

  return { exportMarkdown, exportJSON, parse, commit };
})();
