/* ---------- settings ---------- */
const AGENT_HELP = [
  'Add flashcards to my Lemma deck (the artifact link is below). Do not read the page source; the format is:',
  '- Use ArtifactData on that link. Write each card with action "set" (use "batch" for several) to collection "data/users/me/profile/notes", one document per card, doc_id = a short unique id such as "c-<topic>-<n>".',
  '- Fields: {"deck": "Math::Topic", "type": "basic" | "reverse" | "cloze", "title": "short name or empty", "front": "...", "back": "...", "tags": ["..."], "requires": ["titles of prerequisite cards"]}. Nothing else is needed; scheduling fields are added automatically.',
  '- Text is Markdown with KaTeX: $inline$, $$display$$. Blocks: ":::theorem[Name]" ... ":::" (also definition, lemma, proof, hint). ":::proof*" with a numbered list reveals one step at a time.',
  '- Cloze cards put {{c1::hidden}} or {{c1::hidden::hint}} in "front" (works inside math). [[Title]] links to another card.',
  'Cards:',
].join('\n');

const SettingsView = (() => {
  let optResult = null;
  let optResultGeneration = -1;
  let sweep = null;
  let sweepGeneration = -1;

  function numField(id, label, key, opts = {}) {
    const input = h('input', { id, class: 'input input-num', type: 'number', inputmode: 'numeric', min: opts.min, max: opts.max, step: opts.step || 1, value: Model.settings[key] });
    input.addEventListener('change', () => {
      const v = Number(input.value);
      if (!Number.isFinite(v)) { input.value = Model.settings[key]; return; }
      Model.setSettings({ [key]: v });
      input.value = Model.settings[key];
    });
    return h('div', { class: 'setting' }, h('label', { for: id, class: 'setting-label' }, label, opts.help ? h('span', { class: 'setting-help', text: opts.help }) : null), input);
  }
  function toggleField(id, label, key, help) {
    const input = h('input', { id, type: 'checkbox', class: 'switch', checked: !!Model.settings[key] });
    input.addEventListener('change', () => Model.setSettings({ [key]: input.checked }));
    return h('div', { class: 'setting' }, h('label', { for: id, class: 'setting-label' }, label, help ? h('span', { class: 'setting-help', text: help }) : null), input);
  }
  function selectField(id, label, key, options, help) {
    const sel = h('select', { id, class: 'input select' }, options.map(([v, l]) => h('option', { value: v, selected: String(Model.settings[key]) === String(v), text: l })));
    sel.addEventListener('change', () => Model.setSettings({ [key]: isNaN(+sel.value) || sel.value === '' ? sel.value : +sel.value }));
    return h('div', { class: 'setting' }, h('label', { for: id, class: 'setting-label' }, label, help ? h('span', { class: 'setting-help', text: help }) : null), sel);
  }
  function stepsField(id, label, key, help) {
    const input = h('input', { id, class: 'input input-steps', value: Model.settings[key], autocomplete: 'off', spellcheck: 'false' });
    input.addEventListener('change', () => {
      const parsed = FSRS.parseSteps(input.value);
      if (parsed === null) { toast('Use values like “1m 10m” or “10m 1h”.', { kind: 'error' }); input.value = Model.settings[key]; return; }
      Model.setSettings({ [key]: FSRS.formatSteps(parsed) });
      input.value = Model.settings[key];
    });
    return h('div', { class: 'setting' }, h('label', { for: id, class: 'setting-label' }, label, help ? h('span', { class: 'setting-help', text: help }) : null), input);
  }
  const section = (id, title, intro, ...kids) => h('section', { class: 'panel settings-sec', id }, h('h2', { class: 'section-title', text: title }), intro ? h('p', { class: 'muted small sec-intro', text: intro }) : null, ...kids);

  function render(params = {}) {
    const s = Model.settings;
    const page = h('div', { class: 'page settings' }, h('div', { class: 'page-head' }, h('h1', { class: 'page-title', text: 'Settings' })));

    page.append(section('set-daily', 'Daily limits', null,
      numField('s-new', 'New cards per day', 'newPerDay', { min: 0, max: 9999 }),
      numField('s-rev', 'Maximum reviews per day', 'reviewsPerDay', { min: 0, max: 99999, help: 'Extra reviews wait until tomorrow' }),
      selectField('s-roll', 'A new day starts at', 'rollover', Array.from({ length: 24 }, (_, i) => [i, new Date(2020, 0, 1, i).toLocaleTimeString(undefined, { hour: 'numeric' })]), 'Late-night study counts toward the previous day.')));

    // memory model
    const retOut = h('output', { class: 'ret-val', for: 's-ret', text: fmtPct(s.retention) });
    const retIn = h('input', { id: 's-ret', type: 'range', class: 'range', min: 0.7, max: 0.97, step: 0.01, value: s.retention });
    retIn.addEventListener('input', () => { retOut.textContent = fmtPct(+retIn.value); drawSweepMarker(); });
    retIn.addEventListener('change', () => Model.setSettings({ retention: +retIn.value }));
    const sweepHost = h('div', { class: 'sweep' });
    const sweepBtn = h('button', { class: 'btn btn-sm', type: 'button', html: icon('chart', 16) + '<span>Estimate workload</span>', onclick: runSweep });
    function drawSweep() {
      fill(sweepHost);
      if (!sweep || sweepGeneration !== App.workspaceRevision || App.workspaceBlocked) return;
      const cur = +retIn.value;
      const at = sweep.find((x) => Math.abs(x.retention - cur) < 0.005) || sweep[0];
      const best = sweep.reduce((a, b) => (b.memorized / (b.reviewsPerDay * 365 + b.learned) > a.memorized / (a.reviewsPerDay * 365 + a.learned) ? b : a));
      sweepHost.append(h('p', { class: 'sweep-sum' }, `At ${fmtPct(cur)}: about `, h('b', { text: fmtInt(at.reviewsPerDay) + ' reviews a day' }), ' and ', h('b', { text: fmtInt(at.memorized) + ' cards remembered' }), ` after a year of ${Model.settings.newPerDay || 20} new cards a day. The most knowledge per review is near ${fmtPct(best.retention)}.`));
      const xT = [0.7, 0.8, 0.9, 0.97];
      sweepHost.append(h('div', { class: 'sweep-charts' },
        Charts.line({ title: 'Reviews per day', points: sweep.map((x) => ({ x: x.retention, y: x.reviewsPerDay, tip: 'Retention ' + fmtPct(x.retention) })), xMin: 0.7, xMax: 0.97, yMin: 0, yMax: Charts.niceMax(Math.max(...sweep.map((x) => x.reviewsPerDay))), yTicks: null, xTicks: xT, xFmt: (v) => fmtPct(v), yFmt: (v) => fmtInt(v), markers: [{ x: at.retention, y: at.reviewsPerDay, cls: 'c-dot-now' }], height: 150,
          table: { columns: ['Retention', 'Reviews/day'], rows: sweep.map((x) => [fmtPct(x.retention), x.reviewsPerDay.toFixed(1)]) } }),
        Charts.line({ title: 'Cards remembered after a year', points: sweep.map((x) => ({ x: x.retention, y: x.memorized, tip: 'Retention ' + fmtPct(x.retention) })), xMin: 0.7, xMax: 0.97, yMin: 0, yMax: Charts.niceMax(Math.max(...sweep.map((x) => x.learned))), xTicks: xT, xFmt: (v) => fmtPct(v), yFmt: (v) => fmtInt(v), markers: [{ x: at.retention, y: at.memorized, cls: 'c-dot-now' }], height: 150,
          table: { columns: ['Retention', 'Remembered'], rows: sweep.map((x) => [fmtPct(x.retention), fmtInt(x.memorized)]) } })));
    }
    const drawSweepMarker = debounce(drawSweep, 60);
    async function runSweep() {
      const generation = App.workspaceRevision;
      sweepBtn.disabled = true;
      fill(sweepHost, h('p', { class: 'muted small thinking', text: 'Simulating a year of reviews at each retention…' }));
      try {
        const probs = ratingProbs();
        const deckSize = clampN(Math.max(Model.cardRefs().length, (Model.settings.newPerDay || 20) * 120), 300, 4000);
        const result = await Jobs.exec('sweep', { w: Model.settings.w, opts: { from: 0.7, to: 0.97, stepSize: 0.01, days: 365, newPerDay: Model.settings.newPerDay || 20, deckSize, maxIvl: Model.settings.maxIvl, firstProbs: probs.first, recallProbs: probs.recall } });
        if (generation !== App.workspaceRevision || App.workspaceBlocked) return;
        sweep = result;
        sweepGeneration = generation;
        drawSweep();
      } catch (e) {
        if (generation === App.workspaceRevision && !App.workspaceBlocked)
          fill(sweepHost, h('p', { class: 'ai-error', text: 'The simulation failed: ' + e.message }));
      }
      if (generation === App.workspaceRevision) sweepBtn.disabled = false;
    }
    page.append(section('set-fsrs', 'Memory model', 'FSRS-6 shows each card again when its recall falls to your target.',
      h('div', { class: 'setting setting-col' },
        h('div', { class: 'setting-row' }, h('label', { for: 's-ret', class: 'setting-label' }, 'Desired retention', h('span', { class: 'setting-help', text: 'Higher = fewer lapses, more reviews' })), retOut),
        retIn,
        h('div', { class: 'sweep-head' }, sweepBtn),
        sweepHost),
      stepsField('s-learn', 'Learning steps', 'learnSteps', 'e.g. 1m 10m'),
      stepsField('s-relearn', 'Relearning steps', 'relearnSteps', 'e.g. 10m'),
      numField('s-max', 'Maximum interval (days)', 'maxIvl', { min: 1, max: 36500 }),
      toggleField('s-fuzz', 'Spread out intervals', 'fuzz', 'Small random spread'),
      toggleField('s-lb', 'Balance daily load', 'loadBalance', 'Prefer lighter days')));
    if (sweep && sweepGeneration === App.workspaceRevision && !App.workspaceBlocked) setTimeout(drawSweep, 0);

    page.append(optimizerSection());

    page.append(section('set-study', 'Study', null,
      selectField('s-order', 'Review order', 'reviewOrder', [['retrievability', 'Weakest memories first'], ['due', 'Oldest due first'], ['random', 'Random']]),
      selectField('s-neworder', 'New card order', 'newOrder', [['prereq', 'Prerequisites first, then oldest'], ['created', 'Oldest first'], ['random', 'Random']]),
      selectField('s-mix', 'New cards appear', 'newMix', [['mix', 'Mixed in with reviews'], ['after', 'After reviews'], ['before', 'Before reviews']]),
      toggleField('s-gate', 'Wait for prerequisites', 'gatePrereqs', 'New cards wait for what they build on'),
      toggleField('s-refresh', 'Refresh prerequisites after a lapse', 'refreshPrereqs', 'Missed card → review its basics'),
      toggleField('s-bury', 'One card per note per day', 'burySiblings', 'Siblings wait until tomorrow'),
      numField('s-ahead', 'Learn ahead limit (minutes)', 'learnAhead', { min: 0, max: 120, help: 'Show learning cards early' }),
      numField('s-leech', 'Leech threshold (lapses)', 'leechThreshold', { min: 0, max: 99 }),
      selectField('s-leechact', 'When a card becomes a leech', 'leechAction', [['tag', 'Tag it “leech”'], ['suspend', 'Tag and suspend it']]),
      toggleField('s-recall', 'Show recall ring', 'showRecall', 'Predicted recall under review cards')));

    // math
    const pre = h('textarea', { id: 's-preamble', class: 'input code-input', rows: 8, spellcheck: 'false' });
    pre.value = s.preamble;
    const preMsg = h('p', { class: 'small', role: 'status' });
    const preTest = h('div', { class: 'prose preamble-test' });
    const checkPre = () => {
      Model.setSettings({ preamble: pre.value });
      const res = Render.setPreamble(pre.value);
      preMsg.className = 'small ' + (res.ok ? 'muted' : 'ai-error');
      preMsg.textContent = res.ok ? `${plural(res.count, 'macro')} loaded.` : res.errors.map((e) => `Line ${e.line}: ${e.message}`).join(' · ');
      preTest.innerHTML = Render.render('$\\R^n,\\ \\norm{x},\\ \\tr(A),\\ \\abs{z},\\ \\inner{u}{v}$');
    };
    pre.addEventListener('change', checkPre);
    const fontSel = h('input', { id: 's-font', type: 'range', class: 'range', min: 13, max: 26, step: 1, value: s.cardFont });
    const fontOut = h('output', { class: 'ret-val', for: 's-font', text: s.cardFont + ' px' });
    fontSel.addEventListener('input', () => { fontOut.textContent = fontSel.value + ' px'; });
    fontSel.addEventListener('change', () => Model.setSettings({ cardFont: +fontSel.value }));
    page.append(section('set-math', 'Math', '\\newcommand, \\def or \\DeclareMathOperator, one per line.',
      h('div', { class: 'setting setting-col' }, h('label', { for: 's-preamble', class: 'setting-label', text: 'LaTeX macros' }), pre, preMsg, preTest),
      h('div', { class: 'setting setting-col' }, h('div', { class: 'setting-row' }, h('label', { for: 's-font', class: 'setting-label', text: 'Card text size' }), fontOut), fontSel)));
    setTimeout(checkPre, 0);

    if (AI.available()) {
      page.append(section('set-ai', 'Claude', 'Uses your Claude account, only when you tap a Claude button.',
        selectField('s-tier', 'Model for Claude features', 'aiTier', [['quick', 'Fast'], ['default', 'Balanced'], ['complex', 'Most capable (slower)']])));
    }

    // Cloud account is optional. Existing local cards are never migrated automatically.
    if (LemmaAccount.client) {
      const accountState = h('p', { class: 'muted small', role: 'status',
        text: LemmaAccount.user ? 'Signed in: ' + LemmaAccount.user.email + (Store.mode === 'account' ? '. Account workspace is active; edits save to this device and sync automatically.' : '. Your device workspace remains separate until you explicitly switch.') : 'Not signed in. Cards remain on this device.' });
      const email = h('input', { type: 'email', class: 'input', placeholder: 'Email for sign-in link', autocomplete: 'email' });
      const send = h('button', { class: 'btn btn-primary btn-sm', type: 'button', text: 'Send sign-in link' });
      const logout = h('button', { class: 'btn btn-sm', type: 'button', text: 'Sign out' });
      const message = h('p', { class: 'muted small', role: 'status' });
      send.onclick = async () => {
        send.disabled = true;
        try { await LemmaAccount.signIn(email.value.trim()); message.textContent = 'Check your email for a sign-in link.'; }
        catch (err) { message.textContent = 'Sign-in error: ' + err.message; }
        finally { send.disabled = false; }
      };
      logout.onclick = async () => {
        logout.disabled = true;
        try { await Store.whenSaved(); await LemmaAccount.signOut(); accountState.textContent = 'Signed out. Device cards remain available.'; }
        catch (err) { message.textContent = 'Sign-out error: ' + err.message; }
        finally { logout.disabled = false; }
      };
      const upload = h('button', { class: 'btn btn-sm', type: 'button', text: 'Queue missing cards to account' });
      const download = h('button', { class: 'btn btn-sm', type: 'button', text: 'Copy missing cloud cards to this device' });
      const transfer = async (button, fn) => {
        button.disabled = true;
        try {
          const result = await fn();
          message.textContent = result.copied + ' cards copied; ' + result.skipped + ' skipped. This is a one-time copy, not continuous synchronization.';
          App.refresh();
        } catch (err) { message.textContent = 'Transfer error: ' + err.message; }
        finally { button.disabled = false; }
      };
      upload.onclick = async () => {
        const ok = await confirmDialog({
          title: 'Copy local cards into your account?',
          message: 'This copies missing card snapshots into your private account outbox. The original local cards remain untouched. Older review logs are copied as history, not independently reconstructed as cloud events. Conflicting card IDs are never overwritten. Export a backup first.',
          confirmLabel: 'Queue missing cards'
        });
        if (!ok) return;
        upload.disabled = true;
        try {
          const result = await LemmaSync.enrollMissingLocal();
          message.textContent = result.queued + ' card snapshots durably queued; ' +
            result.skipped + ' skipped. The account cache will attempt cloud delivery. ' +
            'Switch to the account workspace below for automatic sync of future edits.';
          showCache();
        } catch (err) {
          message.textContent = 'Account enrollment: ' + err.message;
        } finally { upload.disabled = false; }
      };
      download.onclick = () => transfer(download, () => LemmaCloudBridge.importMissing());
      const cacheState = h('p', { class: 'muted small', role: 'status' });
      const showCache = () => {
        const s = LemmaSync.status;
        cacheState.textContent = 'Private account cache: ' + s.phase +
          (s.pending ? ' · ' + s.pending + ' pending operations' : '') +
          (s.error ? ' · ' + s.error : '') +
          (Store.mode === 'account' ? '. Active account workspace.' : '. Separate from the device cards displayed by Lemma.');
      };
      const refreshCache = h('button', { class: 'btn btn-sm', type: 'button', text: 'Refresh account cache' });
      refreshCache.onclick = async () => {
        refreshCache.disabled = true;
        try { await LemmaSync.refresh(); showCache(); }
        catch (err) { message.textContent = 'Cache refresh: ' + err.message; showCache(); }
        finally { refreshCache.disabled = false; }
      };
      const comparison = h('p', { class: 'muted small', role: 'status' });
      const compare = h('button', { class: 'btn btn-sm', type: 'button',
        text: 'Compare local and account cards' });
      compare.onclick = async () => {
        compare.disabled = true;
        try {
          const r = await LemmaSync.compareLocal();
          comparison.textContent =
            r.identical + ' identical · ' + r.localOnly + ' only on device · ' +
            r.accountOnly + ' only in account · ' + r.divergent +
            ' same-ID conflicts · ' + r.cloudTombstone + ' account deletions · ' +
            r.dirtyAccount + ' pending account snapshots.' +
            (r.fresh ? '' : ' Account cache may be stale; refresh while online.');
          if (r.divergent || r.cloudTombstone) {
            comparison.textContent += ' Nothing was overwritten or merged.';
          }
        } catch (err) { comparison.textContent = 'Comparison unavailable: ' + err.message; }
        finally { compare.disabled = false; }
      };
      const backupCheck = h('input', {type:'checkbox'});
      const backupLabel = h('label', {class:'conflict-confirm'}, backupCheck,
        h('span', {text:'I have exported a backup of my device cards and reviewed the account comparison.'}));
      const useAccount = h('button', {class:'btn btn-primary btn-sm', type:'button',
        text:'Use account workspace'});
      const useDevice = h('button', {class:'btn btn-sm', type:'button',
        text:'Return to device workspace'});
      backupLabel.hidden = Store.mode === 'account';
      useAccount.hidden = Store.mode === 'account';
      useDevice.hidden = Store.mode !== 'account';
      useAccount.onclick = async () => {
        if (!backupCheck.checked) {
          message.textContent = 'Export a backup and check the acknowledgment before switching.';
          return;
        }
        const confirmed = await confirmDialog({
          title:'Switch to account workspace?',
          message:'Your device cards stay in their original storage. Account cards form a separate workspace; only changes made after switching sync automatically. Verify any missing cards are enrolled and cloud-confirmed first.',
          confirmLabel:'Use account workspace'
        });
        if (!confirmed) return;
        useAccount.disabled = true;
        try {
          if (navigator.onLine) await LemmaSync.refresh();
          await App.workspaceController.activate();
          App.rememberAccountWorkspace(LemmaAccount.user.id);
          App.go('home');
        } catch (err) {
          message.textContent = 'Cannot switch: ' + err.message;
          useAccount.disabled = false;
        }
      };
      useDevice.onclick = async () => {
        useDevice.disabled = true;
        try { await App.workspaceController.deactivate(); App.rememberAccountWorkspace(null); App.go('home'); }
        catch (err) { message.textContent = 'Cannot switch: ' + err.message; useDevice.disabled = false; }
      };
      showCache();
      page.append(section('set-cloud-account', 'Lemma account', 'Private account data syncs automatically after you explicitly enter the account workspace. Device cards are never enrolled by signing in.',
        accountState, h('div', { class: 'btn-row' }, email, send, logout),
        h('div', { class: 'btn-row' }, upload, download),
        cacheState, h('div', { class: 'btn-row' }, refreshCache, compare),
        comparison, backupLabel, h('div', {class:'btn-row'}, useAccount, useDevice),
        LemmaConflicts.mount(), message));
    }

    // data
    const st = Store.status();
    const where = st.mode === 'cloud' ? 'Synced to your Claude account.' : st.mode === 'local' ? 'This browser only.' : 'Not saved here.';
    page.append(section('set-data', 'Your data', where,
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn', type: 'button', html: icon('download', 16) + '<span>Export</span>', onclick: () => ExportSheet.open() }),
        h('button', { class: 'btn', type: 'button', html: icon('upload', 16) + '<span>Import</span>', onclick: () => ImportSheet.open() }),
        h('button', { class: 'btn btn-ghost-danger', type: 'button', html: icon('trash', 16) + '<span>Delete all cards…</span>', onclick: deleteAll })),
      h('p', { class: 'muted small', text: `${plural(Model.notes.size, 'note')}, ${plural(Model.cardRefs().length, 'card')}, ${plural(Model.reviewCount(), 'review')} stored.` })));

    const howTo = AGENT_HELP;
    const howBox = h('textarea', { id: 's-agent', class: 'input code-input', rows: 6, readonly: true, 'aria-label': 'Instructions for Claude' });
    howBox.value = howTo;
    page.append(section('set-agent', 'Add cards from other chats', 'Paste with this page’s link into any chat; add your topic.',
      howBox, h('div', { class: 'btn-row' }, h('button', { class: 'btn btn-primary btn-sm', type: 'button', html: icon('check', 16) + '<span>Copy instructions</span>', onclick: () => copyText(howTo, howBox) }))));

    page.append(section('set-keys', 'Keyboard', null, h('dl', { class: 'keys' },
      [['Space / Enter', 'Show answer, then Good (or the next proof step)'], ['1 2 3 4', 'Again, Hard, Good, Easy'], ['H', 'Next hint'], ['T', 'Type your answer'], ['D', 'Scratchpad'], ['E', 'Edit card'], ['U or Ctrl+Z', 'Undo last answer'], ['I', 'Card details'], ['N', 'New card (outside review)'], ['/', 'Search'], ['Ctrl+Enter', 'Save in the editor'], ['Ctrl+M', 'Wrap selection in $…$'], ['Ctrl+Shift+C', 'Make a cloze from the selection']]
        .map(([k, v]) => h('div', null, h('dt', null, h('kbd', { text: k })), h('dd', { text: v }))))));

    if (params.anchor) setTimeout(() => { const el = document.getElementById(params.anchor); if (el) el.scrollIntoView({ block: 'start' }); }, 30);
    return page;
  }

  function ratingProbs() {
    const first = [0, 0, 0, 0], rec = [0, 0, 0];
    const seen = new Set();
    for (const n of Model.notes.values()) for (const l of n.log) {
      if (l[5]) continue;
      const key = n.id + ':' + l[1];
      if (l[3] === 0 && !seen.has(key)) { seen.add(key); first[l[2] - 1]++; }
      else if (l[3] === 2 && l[2] > 1) rec[l[2] - 2]++;
    }
    const norm = (a, def) => { const t = a.reduce((x, y) => x + y, 0); return t >= 50 ? a.map((x) => x / t) : def; };
    return { first: norm(first, [0.24, 0.094, 0.495, 0.171]), recall: norm(rec, [0.224, 0.631, 0.145]) };
  }

  function optimizerSection() {
    const s = Model.settings;
    const hist = Model.histories(null);
    const ds = FSRS.buildDataset(hist, Model.clock);
    const enough = ds.items >= 64;
    const status = s.wSource === 'optimized' && s.wInfo
      ? `Personalized on ${fmtDate(s.wInfo.at)} from ${plural(s.wInfo.items, 'review')}.`
      : s.wSource === 'custom' ? 'Using parameters you entered.' : 'Using FSRS-6 defaults.';
    const out = h('div', { class: 'opt-out', 'aria-live': 'polite' });
    const bar = h('div', { class: 'opt-progress', hidden: true }, h('span'));
    const btn = h('button', { class: 'btn btn-primary btn-sm', type: 'button', disabled: !enough, html: icon('sigma', 16) + '<span>Optimize from my reviews</span>', onclick: async () => {
      const generation = App.workspaceRevision;
      btn.disabled = true;
      bar.hidden = false;
      fill(out, h('p', { class: 'muted small thinking', text: 'Fitting the 21 parameters to your review history…' }));
      try {
        const res = await Jobs.exec('optimize', {
          histories: hist, rollover: s.rollover, current: s.w,
          numRelearnSteps: (FSRS.parseSteps(s.relearnSteps) || []).length || 1,
        }, (p) => { bar.firstChild.style.width = (p * 100).toFixed(0) + '%'; });
        if (generation !== App.workspaceRevision || App.workspaceBlocked) return;
        optResult = res;
        optResultGeneration = generation;
        showResult();
      } catch (e) {
        if (generation === App.workspaceRevision && !App.workspaceBlocked)
          fill(out, h('p', { class: 'ai-error', text: 'Optimization failed: ' + e.message }));
      }
      if (generation === App.workspaceRevision) {
        bar.hidden = true;
        btn.disabled = !enough;
      }
    } });
    function showResult() {
      const r = optResult;
      if (!r || optResultGeneration !== App.workspaceRevision || App.workspaceBlocked) return;
      if (r.skipped) { fill(out, h('p', { class: 'muted small', text: 'Not enough history yet. Keep reviewing and try again.' })); return; }
      const better = r.after.logLoss < r.before.logLoss - 1e-4;
      const row = (label, ev) => h('tr', null, h('td', { text: label }), h('td', { text: ev.logLoss.toFixed(4) }), h('td', { text: fmtPct(ev.rmse, 2) }));
      fill(out, 
        h('div', { class: 'table-scroll' }, h('table', { class: 'data-table' },
          h('thead', null, h('tr', null, ['Parameters', 'Log loss', 'Calibration error'].map((t) => h('th', { scope: 'col', text: t })))),
          h('tbody', null, row('Current', r.before), row('Defaults', r.defaults), row('Optimized', r.after)))),
        h('p', { class: 'small ' + (better ? '' : 'muted'), text: r.pretrainOnly
          ? 'With this much history only the starting stabilities were fitted; the rest stay at their defaults.'
          : better ? 'The optimized parameters predict your reviews better. Lower is better for both numbers.' : 'Your current parameters already fit about as well, so there is no need to change them.' }),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn btn-primary btn-sm', type: 'button', text: 'Use optimized parameters', onclick: () => {
            if (optResultGeneration !== App.workspaceRevision || App.workspaceBlocked) return;
            Model.setSettings({ w: r.w, wSource: 'optimized', wInfo: { at: Date.now(), items: r.items, logLoss: r.after.logLoss, rmse: r.after.rmse } });
            const n = Model.recomputeMemory();
            optResult = null;
            toast(`Parameters updated; memory recalculated for ${plural(n, 'note')}.`);
            App.render();
          } }),
          h('button', { class: 'btn btn-sm', type: 'button', text: 'Discard', onclick: () => { optResult = null; fill(out); } })));
    }
    const params = h('textarea', { id: 's-w', class: 'input code-input', rows: 3, spellcheck: 'false' });
    params.value = s.w.map((x) => +x.toFixed(4)).join(', ');
    const applyParams = h('button', { class: 'btn btn-sm', type: 'button', text: 'Apply', onclick: () => {
      const w = FSRS.normalizeParams(params.value);
      if (!w) { toast('Enter 21 numbers (FSRS-6), or 19 / 17 from older versions.', { kind: 'error' }); return; }
      Model.setSettings({ w, wSource: 'custom', wInfo: null });
      const n = Model.recomputeMemory();
      toast(`Parameters applied; memory recalculated for ${plural(n, 'note')}.`);
      App.render();
    } });
    const reset = h('button', { class: 'btn btn-sm', type: 'button', text: 'Reset to defaults', onclick: () => {
      Model.setSettings({ w: FSRS.DEFAULT_W.slice(), wSource: 'default', wInfo: null });
      Model.recomputeMemory();
      toast('Default parameters restored.');
      App.render();
    } });
    const sec = h('section', { class: 'panel settings-sec', id: 'fsrs-opt' },
      h('h2', { class: 'section-title', text: 'Personalize FSRS' }),
      h('p', { class: 'muted small sec-intro', text: status }),
      h('p', { class: 'small', text: enough
        ? `${plural(ds.items, 'spaced review')} · runs on this device`
        : `Needs 64 spaced reviews · ${ds.items} so far` }),
      h('div', { class: 'btn-row' }, btn), bar, out,
      h('details', { class: 'adv' }, h('summary', { text: 'Parameters' }),
        h('p', { class: 'muted small', text: 'Paste 21 numbers from Anki’s FSRS options.' }),
        params, h('div', { class: 'btn-row' }, applyParams, reset)));
    if (optResult) setTimeout(showResult, 0);
    return sec;
  }

  async function deleteAll() {
    const n = Model.notes.size;
    if (!n) return;
    const generation = App.workspaceRevision;
    const ok = await confirmDialog({ title: `Delete all ${plural(n, 'note')}?`, message: 'Every card and its review history will be removed. Export a backup first if you might want them back. This can’t be undone.', confirmLabel: 'Delete everything', danger: true });
    if (!ok || App.workspaceBlocked || generation !== App.workspaceRevision) return;
    for (const id of [...Model.notes.keys()]) Model.deleteNote(id);
    toast('All cards deleted');
    App.go('home');
  }

  return { render };
})();
