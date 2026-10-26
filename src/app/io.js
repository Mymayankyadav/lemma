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

  const canonical = value => value && typeof value === 'object'
    ? Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']'
      : '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}'
    : JSON.stringify(value);
  const content = n => ({ id:n.id, deck:n.deck, type:n.type, title:n.title, front:n.front,
    back:n.back, tags:n.tags, requires:n.requires, media:n.media || {}, modified:n.modified });
  const profileContent = p => ({ settings:p.settings, decks:p.decks,
    examplesHidden:p.examplesHidden, lastDeck:p.lastDeck });

  // Prepare once, before the first write. Persist this job with the import
  // source so IDs and prerequisites survive partial failure and browser reload.
  function prepare(parsed, opts = {}) {
    const job = { v:1, format:parsed.format, items:[], skipped:0, profile:null };
    if (parsed.format === 'backup') {
      for (const raw of parsed.notes) {
        if (!raw || !raw.id) continue;
        const existing = Model.notes.get(raw.id);
        if (existing && !((raw.modified || 0) > (existing.modified || 0) ||
            (raw.log || []).length > (existing.log || []).length)) { job.skipped++; continue; }
        job.items.push({ note:Model.sanitizeNote(clone(raw)), base:existing ? clone(existing) : null, done:false });
      }
      if (opts.restoreSettings && parsed.backup?.profile?.settings) {
        job.profile = { before:clone(Model.profile()),
          after:Model.profileForSettings(parsed.backup.profile.settings), done:false };
      }
      return job;
    }
    const fronts = new Set([...Model.notes.values()].map(n => n.deck + '\u0000' + n.front.trim()));
    const titles = new Map();
    for (const n of Model.notes.values()) if (n.title) titles.set(n.title.toLowerCase(),n.id);
    const created = [];
    for (const f of parsed.notes) {
      const key = f.deck + '\u0000' + f.front.trim();
      if (fronts.has(key)) { job.skipped++; continue; }
      fronts.add(key);
      const note = Model.sanitizeNote({ id:uid(), cards:{}, log:[], deck:f.deck,
        type:f.type, title:f.title, front:f.front, back:f.back,
        tags:(f.tags || []).concat(opts.extraTags || []) });
      job.items.push({ note, base:null, done:false });
      created.push([note,f.requiresTitles || []]);
      if (note.title) titles.set(note.title.toLowerCase(),note.id);
    }
    for (const [note,requirements] of created) {
      note.requires = [...new Set(requirements.map(t => titles.get(t.toLowerCase()) ||
        (Model.notes.has(t) ? t : null)).filter(id => id && id !== note.id))];
    }
    return job;
  }

  /** Resolve only after each write commits; failed jobs remain safe to retry. */
  async function commit(parsed, opts = {}) {
    const job = opts.job || prepare(parsed,opts);
    const current = opts.isCurrent || (() => true);
    const checkpoint = () => opts.checkpoint?.(job);
    const requireCurrent = () => { if (!current()) throw new Error('Workspace changed during import'); };
    checkpoint();
    for (const item of job.items) {
      requireCurrent();
      if (item.done) continue;
      const existing = await Store.readNote(item.note.id);
      requireCurrent();
      if (existing && canonical(content(existing)) === canonical(content(item.note))) {
        // Receipt was lost after commit; preserve any subsequent reviews.
        const visible = Model.notes.get(item.note.id);
        if (!visible || canonical(visible) === canonical(item.base))
          Model.applyRemote([{id:item.note.id,note:clone(existing)}]);
        item.done = true; checkpoint(); continue;
      }
      if (item.base ? canonical(existing) !== canonical(item.base) : !!existing)
        throw new Error('A card changed since this import was prepared. Compare it with the retained source before retrying.');
      await Store.saveNote(item.note,{durable:true,createOnly:!item.base});
      item.done = true;
      if (current()) Model.applyRemote([{id:item.note.id,note:clone(item.note)}]);
      checkpoint(); // origin-scoped checkpoint remains useful after sign-out
      requireCurrent();
    }
    if (job.profile && !job.profile.done) {
      requireCurrent();
      const now = profileContent(Model.profile());
      if (canonical(now) !== canonical(profileContent(job.profile.after))) {
        if (canonical(now) !== canonical(profileContent(job.profile.before)))
          throw new Error('Settings changed during import. The source is retained for comparison.');
        await Model.commitImportedProfile(job.profile.after,current);
      }
      job.profile.done = true; checkpoint(); requireCurrent();
    }
    return { added:job.items.filter(x => !x.base).length,
      updated:job.items.filter(x => x.base).length, skipped:job.skipped,
      created:job.items.filter(x => !x.base).map(x => Model.notes.get(x.note.id)).filter(Boolean) };
  }

  return { exportMarkdown, exportJSON, parse, prepare, commit };
})();
