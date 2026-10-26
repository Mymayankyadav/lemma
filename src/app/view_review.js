/* ---------- review screen ---------- */
function renderCardHTML(el, src, opts) {
  el.innerHTML = Render.render(src, opts || {});
  enhanceContent(el);
}
function fitMath(el) {
  requestAnimationFrame(() => {
    for (const d of el.querySelectorAll('.katex-display')) {
      const k = d.firstElementChild;
      if (!k) continue;
      k.style.fontSize = '';
      const avail = d.clientWidth, need = k.scrollWidth;
      if (avail > 0 && need > avail + 1) k.style.fontSize = Math.max(0.62, (avail / need) * 0.98).toFixed(3) + 'em';
    }
  });
}
let fitTimer;
window.addEventListener('resize', () => { clearTimeout(fitTimer); fitTimer = setTimeout(() => document.querySelectorAll('.prose').forEach(fitMath), 150); });
function enhanceContent(el) {
  fitMath(el);
  for (const a of el.querySelectorAll('a[href]')) {
    if (/^https?:/i.test(a.getAttribute('href') || '')) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
  }
  for (const a of el.querySelectorAll('a.ref')) {
    const t = Model.resolveTarget(a.dataset.ref);
    if (t) { a.dataset.noteId = t.id; a.classList.remove('ref-missing'); a.title = 'Open “' + (t.title || Render.plainText(t.front, 60)) + '”'; }
    else { a.classList.add('ref-missing'); a.title = 'No card titled “' + a.dataset.ref + '” yet'; }
  }
  for (const t of el.querySelectorAll('table')) {
    if (t.parentElement && t.parentElement.classList.contains('table-scroll')) continue;
    const w = h('div', { class: 'table-scroll' });
    t.replaceWith(w);
    w.append(t);
  }
}

const ReviewView = (() => {
  let S = null; // session
  let ui = null;
  let state = null; // {item, phase, pv, shownAt, hintsUsed, steps}
  let waitTimer = null;
  let busy = false; // a graded card is animating out
  let suppressClick = false;

  function start(session) {
    S = session;
    App.go('review');
  }

  function render() {
    if (!S) { App.go('home'); return h('div'); }
    clearInterval(waitTimer);
    busy = false;
    ui = {};
    ui.counts = h('div', { class: 'rv-counts', role: 'status' });
    ui.progress = h('div', { class: 'rv-progress', 'aria-hidden': 'true' }, h('span'));
    ui.undo = iconBtn('undo', 'Undo', () => undo(), { kbd: 'U' });
    ui.more = iconBtn('more', 'Card menu', () => moreMenu());
    const head = h('header', { class: 'rv-head' },
      ui.progress,
      h('div', { class: 'rv-head-row' },
        iconBtn('x', 'End session', () => finish(true), { kbd: 'Esc' }),
        h('div', { class: 'rv-title' }, h('span', { class: 'rv-deck', text: S.title }), ui.counts),
        h('div', { class: 'rv-head-tools' }, ui.undo, ui.more)));
    ui.banner = h('div', { class: 'rv-banner', hidden: true });
    ui.swipeTag = h('div', { class: 'swipe-tag', 'aria-hidden': 'true' });
    ui.meta = h('div', { class: 'card-meta' });
    ui.front = h('div', { class: 'prose card-front' });
    ui.typedShow = h('div', { class: 'typed-answer', hidden: true });
    ui.rule = h('hr', { class: 'card-rule', hidden: true });
    ui.back = h('div', { class: 'prose card-back', hidden: true });
    ui.extra = h('div', { class: 'prose card-extra', hidden: true });
    ui.sheet = h('article', { class: 'card-sheet', 'aria-live': 'polite' }, ui.swipeTag, ui.meta, ui.front, ui.typedShow, ui.rule, ui.back, ui.extra);
    ui.sheet.addEventListener('click', (e) => {
      if (suppressClick || !state || busy) return;
      if (e.target.closest('a, button, summary, details, input, textarea, .katex-display')) return;
      if (window.getSelection && String(window.getSelection()).length) return;
      if (state.phase === 'front') reveal(); else nextStep();
    });
    attachSwipe(ui.sheet);
    ui.recall = h('div', { class: 'rv-recall', hidden: true });
    ui.tools = h('div', { class: 'rv-tools', role: 'toolbar', 'aria-label': 'Card tools' });
    ui.ai = h('section', { class: 'ai-panel', hidden: true, 'aria-live': 'polite' });
    ui.typeBox = buildTypeBox();
    ui.stage = h('div', { class: 'rv-stage' }, h('div', { class: 'rv-col' }, ui.banner, ui.sheet, h('div', { class: 'rv-toolrow' }, ui.recall, ui.tools), ui.typeBox.el, ui.ai));
    ui.action = h('div', { class: 'rv-action' });
    const foot = h('footer', { class: 'rv-foot' }, h('div', { class: 'rv-foot-inner' }, ui.action));
    ui.root = h('div', { class: 'review' }, head, ui.stage, foot);
    ui.root.addEventListener('click', (e) => { if (e.target.closest('[data-step-next]')) nextStep(); });
    const mine = S;
    setTimeout(() => { if (S === mine) advance(); }, 0);
    return ui.root;
  }

  function setCounts() {
    const r = S.remaining();
    const cur = state && state.item && state.item.ref;
    const curKind = cur ? (cur.c.st === 0 ? 'new' : Model.isLearning(cur.c) ? 'learn' : 'review') : '';
    const item = (k, n, label) => h('span', { class: 'rc rc-' + k + (curKind === k ? ' cur' : '') + (n ? '' : ' zero'), title: label }, h('i'), h('b', { text: fmtInt(n) }));
    fill(ui.counts, item('new', r.new, 'New'), item('learn', r.learn, 'Learning'), item('review', r.review, S.cram ? 'Left' : 'Due'));
    ui.counts.setAttribute('aria-label', `${r.new} new, ${r.learn} learning, ${r.review} ${S.cram ? 'left' : 'due'}`);
    const left = r.new + r.learn + r.review;
    const done = S.stats.count;
    const frac = done + left ? done / (done + left) : 1;
    ui.progress.firstChild.style.width = (frac * 100).toFixed(1) + '%';
    ui.undo.disabled = !S.history.length;
  }

  function advance() {
    clearInterval(waitTimer);
    if (!S || !ui) return;
    const nx = S.next();
    if (!nx) return showDone();
    if (nx.wait) return showWait(nx.wait);
    show(nx);
  }

  function show(item) {
    const r = item.ref;
    S.current = item;
    const sides = Model.sides(r.note, r.ord);
    const pv = S.cram ? null : Model.previewFor(r);
    item.preview = pv;
    item.previewAt = Date.now();
    state = { item, phase: 'front', pv, sides, shownAt: Date.now(), hintsUsed: 0, steps: null, typed: '' };
    if (!ui.sheet.contains(ui.meta)) fill(ui.sheet, ui.swipeTag, ui.meta, ui.front, ui.typedShow, ui.rule, ui.back, ui.extra);
    ui.sheet.classList.remove('is-done');
    ui.front.hidden = false;
    ui.back.classList.remove('reveal-in');
    ui.sheet.classList.remove('flip-in');
    void ui.sheet.offsetWidth;
    if (!prefersReducedMotion()) ui.sheet.classList.add('flip-in');
    ui.sheet.style.setProperty('--card-font', Model.settings.cardFont + 'px');
    if (item.kind === 'prereq' && item.reason) {
      const of = Model.notes.get(item.reason.of);
      ui.banner.hidden = false;
      ui.banner.title = 'Prerequisite of a card you missed';
      fill(ui.banner, h('span', { html: icon('link', 14) }), h('span', { text: of ? (of.title || Render.plainText(of.front, 40)) : '' }));
    } else ui.banner.hidden = true;
    const c = r.c;
    const kind = S.cram ? 'practice' : c.st === 0 ? 'new' : Model.isLearning(c) ? 'learn' : 'review';
    const kindLabel = { practice: 'Practice', new: 'New', learn: 'Learning', review: 'Review' }[kind];
    const ords = r.note.type === 'cloze' ? Render.clozeOrds(r.note.front) : [];
    fill(ui.meta,
      h('span', { class: 'meta-dot md-' + kind, title: kindLabel, 'aria-label': kindLabel }),
      h('span', { class: 'meta-deck', text: r.note.deck.split('::').pop() }),
      h('span', { class: 'spacer' }),
      sides.reversed ? h('span', { class: 'meta-ico', title: 'Reverse card', html: icon('swap', 14) }) : null,
      ords.length > 1 ? h('span', { class: 'meta-tag', title: 'Cloze ' + r.ord, text: 'c' + r.ord }) : null,
      c.flag ? h('span', { class: 'meta-ico flag', title: 'Flagged', html: icon('flag', 14) }) : null);
    renderCardHTML(ui.front, sides.front.src, sides.front.opts);
    prepareHints(ui.front);
    ui.typedShow.hidden = true;
    ui.rule.hidden = true;
    ui.back.hidden = true;
    ui.extra.hidden = true;
    ui.ai.hidden = true;
    fill(ui.ai);
    ui.typeBox.reset();
    Scratch.clear();
    resetDrag();
    renderRecall();
    renderTools();
    renderAction();
    setCounts();
    window.scrollTo(0, 0);
  }

  function prepareHints(root) {
    for (const d of root.querySelectorAll('details.env-hint')) {
      d.open = false;
      d.addEventListener('toggle', () => { if (d.open && state && state.phase === 'front') { state.hintsUsed++; renderTools(); renderAction(); } });
    }
  }
  function hintsLeft() { return ui.front.querySelectorAll('details.env-hint:not([open])').length; }
  function useHint() {
    const d = ui.front.querySelector('details.env-hint:not([open])');
    if (d) { d.open = true; d.scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' }); }
  }

  function reveal() {
    if (!state || state.phase !== 'front' || busy) return;
    state.phase = 'back';
    state.answerAt = Date.now();
    const sd = state.sides;
    renderCardHTML(ui.back, sd.back.src, sd.back.opts);
    if (state.item.ref.note.type === 'cloze') {
      ui.front.hidden = true; // the back already shows the full text with the answer marked
      ui.rule.hidden = true;
    } else ui.rule.hidden = false;
    ui.back.hidden = false;
    if (sd.extra) { renderCardHTML(ui.extra, sd.extra.src, sd.extra.opts); ui.extra.hidden = false; }
    const typed = ui.typeBox.value();
    if (typed.trim()) {
      ui.typedShow.hidden = false;
      fill(ui.typedShow, h('span', { class: 'typed-ico', title: 'Your answer', html: icon('type', 16) }), h('div', { class: 'prose', html: Render.render(typed) }));
      enhanceContent(ui.typedShow);
    }
    ui.typeBox.collapse();
    setupSteps();
    renderRecall();
    renderTools();
    renderAction();
    if (ui.back.firstElementChild && !prefersReducedMotion()) ui.back.classList.add('reveal-in');
    swipeTip();
  }

  function swipeTip() {
    if (!isTouch() || S.cram) return;
    let seen = false;
    try { seen = localStorage.getItem('lemma.swipeTip') === '1'; localStorage.setItem('lemma.swipeTip', '1'); } catch (e) { seen = true; }
    if (!seen) toast('Swipe the card → Good, ← Again', { ms: 4000 });
  }

  function setupSteps() {
    const block = ui.back.querySelector('[data-steps]');
    if (!block) { state.steps = null; return; }
    const body = block.querySelector('.env-body');
    let items = Array.from(body.children);
    if (items.length === 1 && /^(OL|UL)$/.test(items[0].tagName)) items = Array.from(items[0].children);
    if (!items.length) { state.steps = null; return; }
    items.forEach((it) => it.classList.add('step', 'step-hidden'));
    const qed = block.querySelector('.qed-line');
    if (qed) qed.classList.add('step-hidden');
    state.steps = { items, shown: 0, qed };
    block.classList.add('steps-live');
  }
  function nextStep() {
    const st = state && state.steps;
    if (!st || st.shown >= st.items.length) return false;
    const it = st.items[st.shown++];
    it.classList.remove('step-hidden');
    it.classList.add('step-in');
    if (st.shown === st.items.length && st.qed) st.qed.classList.remove('step-hidden');
    it.scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    renderAction();
    return true;
  }
  const stepsLeft = () => (state && state.steps ? state.steps.items.length - state.steps.shown : 0);

  /** Small recall ring under the card (review cards, after the answer is shown). */
  function renderRecall() {
    const c = state && state.item.ref.c;
    if (!state || state.phase !== 'back' || !Model.settings.showRecall || S.cram || !c || c.st !== 2 || !state.pv || state.pv.r == null) { ui.recall.hidden = true; return; }
    const r = state.pv.r;
    const R = 7.5, C = 2 * Math.PI * R;
    const label = `Predicted recall ${fmtPct(r)} · stability ${FSRS.formatDays(c.s)} · difficulty ${c.d.toFixed(1)}/10`;
    ui.recall.hidden = false;
    ui.recall.title = label;
    ui.recall.setAttribute('aria-label', label);
    fill(ui.recall,
      h('span', { class: 'ring', html: `<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="${R}" class="ring-bg"/><circle cx="10" cy="10" r="${R}" class="ring-fg" stroke-dasharray="${(r * C).toFixed(2)} ${C.toFixed(2)}" transform="rotate(-90 10 10)"/></svg>` }),
      h('span', { text: fmtPct(r) }));
  }

  function tool(ic, label, fn, x = {}) {
    return h('button', {
      class: 'tool' + (x.on ? ' on' : '') + (x.cls ? ' ' + x.cls : ''), type: 'button', 'aria-label': label,
      title: label + (x.kbd ? ` (${x.kbd})` : ''), disabled: x.disabled, onclick: fn,
      html: icon(ic, 19) + (x.badge ? `<span class="tool-badge">${x.badge}</span>` : ''),
    });
  }
  function renderTools() {
    const front = state && state.phase === 'front';
    const nh = front ? hintsLeft() : 0;
    const t = [];
    if (front && (nh || state.hintsUsed)) t.push(tool('hint', 'Hint', useHint, { kbd: 'H', disabled: !nh, badge: nh || '' }));
    if (front) t.push(tool('type', 'Type answer', () => { ui.typeBox.toggle(); renderTools(); }, { kbd: 'T', on: ui.typeBox.isOpen() }));
    t.push(tool('scribble', 'Scratchpad', () => Scratch.open(), { kbd: 'D' }));
    if (AI.available()) t.push(front ? tool('spark', 'Check with Claude', () => aiCheck(), { cls: 'tool-ai' }) : tool('spark', 'Explain with Claude', () => aiExplain(), { cls: 'tool-ai' }));
    t.push(tool('edit', 'Edit', () => editCurrent(), { kbd: 'E' }));
    fill(ui.tools, ...t);
  }

  function renderAction() {
    if (!state) return;
    if (state.phase === 'front') {
      fill(ui.action, h('button', { class: 'btn-reveal', type: 'button', onclick: reveal, title: 'Show answer (Space)', html: icon('eye', 18) + '<span>Show</span>' }));
      return;
    }
    const left = stepsLeft();
    const pv = state.pv;
    const sugg = state.suggested || (state.hintsUsed ? 2 : 0);
    const grades = GRADES.map(({ g, key, label }) => {
      const o = S.cram ? null : pv[g];
      const ivl = !o ? '' : o.ivl > 0 ? FSRS.formatDays(o.ivl) : FSRS.formatIvl(o.delay);
      return h('button', { class: 'grade grade-' + key + (sugg === g ? ' suggested' : ''), type: 'button', onclick: () => grade(g), title: `${label} (${g})`, 'aria-label': `${label}${ivl ? ', next in ' + ivl : ''}` },
        h('span', { class: 'grade-label', text: label }),
        ivl ? h('span', { class: 'grade-ivl', text: ivl }) : null);
    });
    const parts = [];
    if (left > 0) {
      const n = state.steps.items.length;
      parts.push(h('button', { class: 'btn-step', type: 'button', 'data-step-next': '1', title: 'Next step (Space)', 'aria-label': `Next step, ${state.steps.shown + 1} of ${n}`, html: icon('steps', 16) + `<span>${state.steps.shown}/${n}</span>` }));
    }
    parts.push(h('div', { class: 'grades', role: 'group', 'aria-label': 'Grade your recall' }, grades));
    fill(ui.action, ...parts);
  }

  /* ----- swipe to grade (touch): right = Good, left = Again ----- */
  function attachSwipe(el) {
    let id = null, sx = 0, sy = 0, dx = 0, mode = null;
    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' || !state || state.phase !== 'back' || busy) return;
      if (e.target.closest('a, button, summary, input, textarea')) return;
      id = e.pointerId; sx = e.clientX; sy = e.clientY; dx = 0; mode = null;
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      const mx = e.clientX - sx, my = e.clientY - sy;
      if (!mode) {
        if (Math.abs(mx) < 10 && Math.abs(my) < 10) return;
        mode = Math.abs(mx) > Math.abs(my) * 1.3 ? 'h' : 'v';
        if (mode === 'h') { try { el.setPointerCapture(id); } catch (err) { /* ignore */ } el.classList.add('dragging'); }
      }
      if (mode !== 'h') return;
      dx = mx;
      paintDrag(dx);
    });
    const end = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      const wasH = mode === 'h';
      mode = null;
      if (!wasH) return;
      el.classList.remove('dragging');
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 60);
      if (Math.abs(dx) >= swipeThreshold() && state && state.phase === 'back') grade(dx > 0 ? 3 : 1, dx > 0 ? 1 : -1);
      else resetDrag();
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', (e) => {
      if (e.pointerId !== id) return;
      id = null; mode = null;
      el.classList.remove('dragging');
      resetDrag();
    });
  }
  const swipeThreshold = () => Math.min(110, (ui.sheet.offsetWidth || 320) * 0.28);
  function paintDrag(dx) {
    const p = clampN(Math.abs(dx) / swipeThreshold(), 0, 1);
    const g = dx > 0 ? 'good' : 'again';
    ui.sheet.style.transform = `translateX(${dx}px) rotate(${(dx / 45).toFixed(2)}deg)`;
    ui.swipeTag.className = 'swipe-tag tag-' + g;
    ui.swipeTag.innerHTML = icon(dx > 0 ? 'check' : 'undo', 22);
    ui.swipeTag.style.opacity = (0.25 + 0.75 * p).toFixed(2);
    for (const b of ui.action.querySelectorAll('.grade')) b.classList.toggle('armed', p >= 1 && b.classList.contains('grade-' + g));
  }
  function resetDrag() {
    if (!ui) return;
    ui.sheet.style.transform = '';
    ui.swipeTag.style.opacity = '0';
    for (const b of ui.action.querySelectorAll('.grade.armed')) b.classList.remove('armed');
  }
  /** Fly the card off-screen, then resolve. */
  function leave(dir) {
    const el = ui.sheet;
    if (prefersReducedMotion()) { resetDrag(); return Promise.resolve(); }
    busy = true;
    ui.action.classList.add('leaving');
    el.classList.remove('flip-in', 'dragging');
    el.classList.add('leaving');
    el.style.transform = `translateX(${dir * 115}%) rotate(${dir * 8}deg)`;
    return new Promise((res) => setTimeout(() => {
      el.classList.remove('leaving');
      el.style.transform = '';
      ui.swipeTag.style.opacity = '0';
      ui.action.classList.remove('leaving');
      busy = false;
      res();
    }, 200));
  }

  function grade(g, dir) {
    if (!state || state.phase !== 'back' || busy) return;
    const dur = (state.answerAt || Date.now()) - state.shownAt;
    const events = S.answer(g, dur) || [];
    for (const ev of events) {
      if (ev.type === 'leech') toast(ev.suspended ? 'Leech · suspended' : 'Leech · tagged', { ms: 4000 });
      if (ev.type === 'prereqs') toast(`+${ev.count} prerequisite${ev.count === 1 ? '' : 's'}`);
    }
    state = null;
    try { if (navigator.vibrate) navigator.vibrate(8); } catch (e) { /* ignore */ }
    const mine = S;
    leave(dir != null ? dir : g === 1 ? -1 : 1).then(() => { if (S === mine) advance(); });
  }

  function undo() {
    if (busy) return;
    const item = S.undo();
    if (!item) return;
    show(item);
    toast('Undone');
  }

  function stat(ic, value, label) {
    return h('span', { class: 'ds', title: label, 'aria-label': `${label}: ${value}` }, h('span', { html: icon(ic, 15) }), h('b', { text: value }));
  }
  function clearStage() {
    ui.banner.hidden = true;
    ui.typeBox.el.hidden = true;
    ui.ai.hidden = true;
    ui.recall.hidden = true;
    fill(ui.tools);
    resetDrag();
    ui.sheet.classList.add('is-done');
  }

  function showWait(due) {
    state = null;
    S.current = null;
    setCounts();
    clearStage();
    const msg = h('p', { class: 'wait-time', 'aria-live': 'polite' });
    const tick = () => {
      const ms = due - Date.now();
      if (ms <= 0) { clearInterval(waitTimer); advance(); return; }
      const s = Math.ceil(ms / 1000);
      msg.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    };
    tick();
    waitTimer = setInterval(tick, 1000);
    fill(ui.sheet, h('div', { class: 'done', title: 'Learning cards come back after a short gap' }, h('span', { class: 'wait-ico', html: icon('hourglass', 26) }), msg));
    fill(ui.action, h('div', { class: 'rv-btns' },
      h('button', { class: 'btn', type: 'button', html: icon('x', 16) + '<span>End</span>', onclick: () => finish() }),
      h('button', { class: 'btn btn-primary', type: 'button', html: icon('play', 16) + '<span>Now</span>', onclick: () => {
        const l = S.learningRefs()[0];
        if (l) show({ ref: l, kind: 'learning' }); else advance();
      } })));
  }

  function showDone() {
    state = null;
    S.current = null;
    setCounts();
    clearStage();
    const st = S.stats;
    const retention = st.reviews ? st.reviewPass / st.reviews : null;
    const tomorrow = (() => {
      const t1 = Model.dayIndex() + 1;
      let n = 0;
      for (const r of Model.cardRefs()) if (!r.c.susp && r.c.st !== 0 && Model.dayIndex(r.c.due) === t1 && S.includes(r.note)) n++;
      return n;
    })();
    fill(ui.sheet, h('div', { class: 'done' },
      h('h2', { class: 'done-title', text: st.count ? 'Q.E.D.' : 'Nothing due' }),
      st.count ? h('div', { class: 'done-stats' },
        stat('cards', fmtInt(st.count), 'Cards'),
        stat('clock', fmtDuration(st.time), 'Time'),
        retention != null ? stat('check', fmtPct(retention), 'Recalled on review') : null,
        st.newSeen ? stat('plusc', fmtInt(st.newSeen), 'New cards') : null) : null,
      h('p', { class: 'done-next', title: 'Due tomorrow' }, h('span', { html: icon('calendar', 14) }), h('span', { text: tomorrow ? `${fmtInt(tomorrow)} tomorrow` : 'Free tomorrow' }))));
    const extra = Model.counts(S.noteIds ? null : S.deck).newAvailable;
    fill(ui.action, h('div', { class: 'rv-btns' },
      !S.cram && !S.noteIds && extra > 0 && Model.today().newCount >= Model.settings.newPerDay
        ? h('button', { class: 'btn', type: 'button', title: 'Raise today’s new-card limit by 10', html: icon('plus', 16) + '<span>10 new</span>', onclick: () => {
          Model.setSettings({ newPerDay: Model.today().newCount + 10 });
          S.build(); advance();
        } }) : null,
      h('button', { class: 'btn btn-primary', type: 'button', html: icon('check', 16) + '<span>Done</span>', onclick: () => finish() })));
  }

  function finish(early) {
    clearInterval(waitTimer);
    Scratch.close();
    if (early && S && S.stats.count) toast(`Saved · ${plural(S.stats.count, 'answer')}`);
    S = null;
    state = null;
    App.go('home');
  }

  function editCurrent() {
    if (!state || !state.item) return;
    const r = state.item.ref;
    EditorSheet.open(r.note.id, () => {
      const nr = Model.ref(r.note.id, r.ord);
      if (!nr) { advance(); return; }
      const keepPhase = state && state.phase;
      show(Object.assign({}, state ? state.item : {}, { ref: nr }));
      if (keepPhase === 'back') reveal();
    });
  }

  function moreMenu() {
    const item = state && state.item;
    const r = item && item.ref;
    if (!r) return;
    const items = [
      ['info', 'Details', () => NoteDetail.open(r.note.id)],
      ['edit', 'Edit', () => editCurrent()],
      ['flag', r.c.flag ? 'Unflag' : 'Flag', () => { r.c.flag = r.c.flag ? 0 : 1; Model.saveScheduling(r.note); show(item); }],
      ['moon', 'Bury', () => { r.c.bury = Model.endOfToday(); Model.saveScheduling(r.note); toast('Buried until tomorrow'); state = null; advance(); }],
      ['pause', 'Suspend', () => { r.c.susp = true; Model.saveScheduling(r.note); toast('Suspended'); state = null; advance(); }],
      ['refresh', 'Reset', async () => {
        if (!(await confirmDialog({ title: 'Reset this card?', message: 'It becomes new again. Its history stays in your stats.', confirmLabel: 'Reset', danger: true }))) return;
        r.note.cards[r.ord] = Model.newCardState();
        r.note.log.push([Date.now(), +r.ord, 0, r.c.st, 0, 2]);
        Model.saveScheduling(r.note);
        state = null; advance();
      }, true],
    ];
    const sheet = Sheets.open({ title: 'Card', body: iconGrid(items, () => sheet.close()) });
  }

  /* ----- typed answers ----- */
  function buildTypeBox() {
    const ta = h('textarea', { id: 'typed-answer', class: 'input mono-ish', rows: 3, placeholder: 'Your answer ($LaTeX$ works)', 'aria-label': 'Your answer', spellcheck: 'false' });
    const pv = h('div', { class: 'prose typed-preview' });
    const el = h('div', { class: 'type-box', hidden: true }, ta, pv);
    const upd = debounce(() => { pv.innerHTML = ta.value.trim() ? Render.render(ta.value) : ''; }, 150);
    ta.addEventListener('input', upd);
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); reveal(); }
      if (e.key === 'Escape') { e.preventDefault(); ta.blur(); }
    });
    return {
      el,
      value: () => ta.value,
      isOpen: () => !el.hidden,
      toggle() { el.hidden = !el.hidden; if (!el.hidden) ta.focus(); },
      collapse() { el.hidden = true; },
      reset() { ta.value = ''; pv.innerHTML = ''; el.hidden = true; },
      focus() { el.hidden = false; ta.focus(); },
    };
  }

  /* ----- Claude ----- */
  async function aiCheck() {
    if (!state || state.phase !== 'front') return;
    const typed = ui.typeBox.value().trim();
    const hasInk = Scratch.hasInk();
    if (!typed && !hasInk) {
      ui.typeBox.focus();
      renderTools();
      toast('Type or draw an answer first');
      return;
    }
    const sd = state.sides;
    const r = state.item.ref;
    const front = r.note.type === 'cloze' ? Render.transformCloze(r.note.front, { ord: +r.ord, side: 'front' }).replace(/([^]*)/g, (m, hnt) => '[…' + (hnt ? ' ' + hnt : '') + ']') : sd.front.src;
    const back = r.note.type === 'cloze' ? 'The hidden part(s): ' + clozeAnswers(r.note.front, +r.ord) + (r.note.back ? '\n\nContext: ' + r.note.back : '') : sd.back.src;
    const image = hasInk ? await Scratch.toBlob() : null;
    const ctl = new AbortController();
    const panel = aiPanel('Checking', ctl);
    try {
      const res = await AI.check({ front, back, typed, image, signal: ctl.signal });
      if (!state || state.item.ref !== r) return;
      const g = clampN(Math.round(Number(res.grade) || 0), 1, 4);
      reveal();
      state.suggested = g;
      const label = GRADES[g - 1].label;
      renderAction();
      const verdict = String(res.verdict || '').toLowerCase();
      fill(panel.body, 
        h('div', { class: 'ai-verdict v-' + (verdict === 'correct' ? 'good' : verdict === 'partial' ? 'warn' : 'bad'), title: 'Suggested grade: ' + label },
          h('span', { html: icon(verdict === 'correct' ? 'check' : verdict === 'partial' ? 'half' : 'x', 16) }),
          h('b', { text: verdict === 'correct' ? 'Correct' : verdict === 'partial' ? 'Partly' : 'Not quite' }),
          h('span', { class: 'muted', text: '→ ' + label })),
        h('div', { class: 'prose', html: Render.render(String(res.feedback || '')) }),
        Array.isArray(res.missing) && res.missing.length ? h('ul', { class: 'ai-missing' }, res.missing.slice(0, 5).map((m) => h('li', { html: Render.renderInline(String(m)) }))) : null);
      enhanceContent(panel.body);
      panel.done();
    } catch (e) {
      panel.fail(e);
    }
  }
  function clozeAnswers(src, ord) {
    const marked = Render.transformCloze(src, { ord, side: 'back' });
    const out = [];
    const re = /([^]*)/g;
    let m;
    while ((m = re.exec(marked))) out.push(m[1]);
    return out.join(' ; ');
  }
  async function aiExplain() {
    if (!state || state.phase !== 'back') return;
    const r = state.item.ref;
    const ctl = new AbortController();
    const panel = aiPanel('Thinking', ctl);
    const out = h('div', { class: 'prose' });
    let latest = '';
    const paint = () => { out.innerHTML = Render.render(latest); enhanceContent(out); };
    const schedule = debounce(paint, 120);
    try {
      let first = true;
      const text = await AI.explain({
        front: r.note.front, back: r.note.back, type: r.note.type, signal: ctl.signal,
        onText: ({ text: t }) => { latest = t; if (first) { first = false; fill(panel.body, out); } schedule(); },
      });
      if (typeof text === 'string' && text) latest = text;
      if (first) fill(panel.body, out);
      paint();
      panel.done();
    } catch (e) {
      panel.fail(e);
    }
  }
  function aiPanel(waitingText, ctl) {
    ui.ai.hidden = false;
    const body = h('div', { class: 'ai-body' }, h('p', { class: 'thinking', text: waitingText }));
    const stop = iconBtn('stop', 'Stop', () => ctl.abort(), { size: 16, class: 'ai-stop' });
    fill(ui.ai, h('div', { class: 'ai-head' }, h('span', { class: 'ai-mark', title: 'Claude', html: icon('spark', 16) }), stop), body);
    ui.ai.scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    return {
      body,
      done() { stop.remove(); },
      fail(e) {
        stop.remove();
        if (e && e.code === 'cancelled') { if (!body.querySelector('.prose')) ui.ai.hidden = true; return; }
        body.append(h('p', { class: 'ai-error', text: AI.errorMessage(e) }));
        if (AI.isPermanent(e)) renderTools();
      },
    };
  }

  function onKey(e) {
    if (!S) return;
    const tag = (e.target && e.target.tagName) || '';
    const typing = tag === 'TEXTAREA' || tag === 'INPUT' || e.target.isContentEditable;
    if (Scratch.isOpen()) {
      if (e.key === 'Escape') { Scratch.close(); e.preventDefault(); }
      return;
    }
    if (typing) return;
    if (Sheets.count) return;
    const k = e.key;
    if ((e.metaKey || e.ctrlKey) && k.toLowerCase() === 'z') { undo(); e.preventDefault(); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (!state) {
      if (k === 'Escape') finish();
      return;
    }
    if (state.phase === 'front') {
      if (k === ' ' || k === 'Enter') { reveal(); e.preventDefault(); }
      else if (k === 'h' || k === 'H') useHint();
      else if (k === 't' || k === 'T') { ui.typeBox.focus(); renderTools(); e.preventDefault(); }
    } else {
      if (k === ' ' || k === 'Enter') { if (!nextStep()) grade(3); e.preventDefault(); }
      else if (k === 'n' || k === 'N') nextStep();
      else if (k >= '1' && k <= '4') { grade(+k); e.preventDefault(); }
    }
    if (k === 'd' || k === 'D') { Scratch.open(); e.preventDefault(); }
    else if (k === 'e' || k === 'E') editCurrent();
    else if (k === 'u' || k === 'U') undo();
    else if (k === 'i' || k === 'I') { if (state.item) NoteDetail.open(state.item.ref.note.id); }
    else if (k === 'Escape') finish(true);
  }

  return { start, render, onKey, get active() { return !!S; }, refreshTools: () => { if (state) renderTools(); } };
})();

/* ---------- scratchpad: draw your working before revealing ---------- */
const Scratch = (() => {
  let el = null, canvas = null, ctx = null;
  let strokes = [], cur = null, tool = 'pen', open = false;
  let dpr = 1;
  function build() {
    canvas = h('canvas', { class: 'scratch-canvas', 'aria-label': 'Scratchpad. Draw with a mouse, finger or stylus.' });
    ctx = canvas.getContext('2d');
    const toolBtn = (name, label, ic) => h('button', { class: 'tool' + (tool === name ? ' on' : ''), type: 'button', 'data-tool': name, 'aria-label': label, title: label, html: icon(ic, 19), onclick: () => { tool = name; sync(); } });
    const bar = h('div', { class: 'scratch-bar' },
      toolBtn('pen', 'Pen', 'pen'),
      toolBtn('eraser', 'Eraser', 'eraser'),
      h('button', { class: 'tool', type: 'button', 'aria-label': 'Undo stroke', title: 'Undo stroke', html: icon('undo', 19), onclick: () => { strokes.pop(); redraw(); } }),
      h('button', { class: 'tool', type: 'button', 'aria-label': 'Clear', title: 'Clear', html: icon('trash', 19), onclick: () => { strokes = []; redraw(); } }),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn btn-primary btn-sm scratch-done', type: 'button', 'aria-label': 'Done', html: icon('check', 16) + '<span>Done</span>', onclick: () => closePad() }));
    el = h('div', { class: 'scratch', hidden: true, role: 'dialog', 'aria-label': 'Scratchpad' }, bar, h('div', { class: 'scratch-area' }, canvas));
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('pointerleave', up);
    new ResizeObserver(() => { if (open) fit(); }).observe(canvas);
    function sync() { for (const b of bar.querySelectorAll('[data-tool]')) b.classList.toggle('on', b.dataset.tool === tool); }
    document.body.append(el);
  }
  function fit() {
    const r = canvas.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    redraw();
  }
  function pt(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, p: e.pointerType === 'pen' ? (e.pressure || 0.5) : 0.5 };
  }
  function down(e) {
    canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
    cur = { tool, pts: [pt(e)] };
    strokes.push(cur);
    redraw();
    e.preventDefault();
  }
  function move(e) {
    if (!cur) return;
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of evs) cur.pts.push(pt(ev));
    redraw();
    e.preventDefault();
  }
  function up() { cur = null; }
  function drawStrokes(c, scale, ink, bg) {
    c.lineCap = 'round';
    c.lineJoin = 'round';
    for (const s of strokes) {
      const pts = s.pts;
      c.strokeStyle = s.tool === 'eraser' ? bg : ink;
      c.globalCompositeOperation = s.tool === 'eraser' && !bg ? 'destination-out' : 'source-over';
      if (s.tool === 'eraser' && !bg) c.strokeStyle = '#000';
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        c.lineWidth = (s.tool === 'eraser' ? 22 : 1.4 + 2.6 * b.p) * scale;
        c.beginPath();
        c.moveTo(a.x * scale, a.y * scale);
        c.lineTo(b.x * scale, b.y * scale);
        c.stroke();
      }
      if (pts.length === 1) {
        c.beginPath();
        c.fillStyle = c.strokeStyle;
        c.arc(pts[0].x * scale, pts[0].y * scale, (s.tool === 'eraser' ? 11 : 1.8) * scale, 0, Math.PI * 2);
        c.fill();
      }
    }
    c.globalCompositeOperation = 'source-over';
  }
  function redraw() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawStrokes(ctx, dpr, cssVar('--ink') || '#111', null);
  }
  function hasInk() { return strokes.some((s) => s.tool === 'pen'); }
  function toBlob() {
    return new Promise((resolve) => {
      const r = canvas.getBoundingClientRect();
      const scale = Math.min(2, 1600 / Math.max(1, r.width));
      const off = document.createElement('canvas');
      off.width = Math.round(r.width * scale);
      off.height = Math.round(r.height * scale);
      const c = off.getContext('2d');
      c.fillStyle = '#ffffff';
      c.fillRect(0, 0, off.width, off.height);
      drawStrokes(c, scale, '#111111', '#ffffff');
      off.toBlob((b) => resolve(b), 'image/png');
    });
  }
  function openPad() { if (!el) build(); el.hidden = false; open = true; document.body.classList.add('scratch-open'); requestAnimationFrame(fit); }
  function closePad() { if (!el) return; el.hidden = true; open = false; document.body.classList.remove('scratch-open'); }
  return {
    open: openPad,
    close: closePad,
    clear() { strokes = []; if (ctx) redraw(); },
    isOpen: () => open,
    hasInk, toBlob,
  };
})();
