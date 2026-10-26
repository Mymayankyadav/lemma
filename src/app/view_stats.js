/* ---------- statistics ---------- */
const StatsView = (() => {
  let deck = '';

  function compute() {
    const now = Date.now();
    const todayIdx = Model.dayIndex(now);
    const daily = new Map();
    const ratings = [0, 0, 0, 0];
    const ret = { d7: [0, 0], d30: [0, 0], d365: [0, 0], young: [0, 0], mature: [0, 0] };
    let totalReviews = 0, totalTime = 0;
    for (const n of Model.notes.values()) {
      if (deck && !Model.inDeck(n, deck)) continue;
      const lastBy = new Map();
      for (const l of n.log) {
        if (l[5] === 2) { lastBy.delete(String(l[1])); continue; }
        const d = Model.dayIndex(l[0]);
        daily.set(d, (daily.get(d) || 0) + 1);
        if (l[5]) continue;
        totalReviews++;
        totalTime += Math.min(l[4] || 0, 60000);
        if (l[2] >= 1 && l[2] <= 4) ratings[l[2] - 1]++;
        const prev = lastBy.get(String(l[1]));
        lastBy.set(String(l[1]), l[0]);
        if (l[3] !== 2) continue;
        const pass = l[2] > 1 ? 1 : 0;
        const age = todayIdx - d;
        if (age < 7) { ret.d7[0]++; ret.d7[1] += pass; }
        if (age < 30) {
          ret.d30[0]++; ret.d30[1] += pass;
          const gap = prev ? (l[0] - prev) / DAY_MS : 0;
          const bucket = gap >= 21 ? ret.mature : ret.young;
          bucket[0]++; bucket[1] += pass;
        }
        if (age < 365) { ret.d365[0]++; ret.d365[1] += pass; }
      }
    }
    const forecast = new Array(30).fill(0);
    const rBins = new Array(10).fill(0);
    const sEdges = [1, 3, 7, 14, 30, 90, 180, 365, Infinity];
    const sLabels = ['<1d', '1–3d', '3d–1w', '1–2w', '2w–1mo', '1–3mo', '3–6mo', '6mo–1y', '1y+'];
    const sBins = new Array(sEdges.length).fill(0);
    const dBins = new Array(9).fill(0);
    let studied = 0, sumR = 0, cards = 0, newCards = 0, suspended = 0;
    for (const r of Model.cardRefs()) {
      if (deck && !Model.inDeck(r.note, deck)) continue;
      cards++;
      const c = r.c;
      if (c.susp) { suspended++; continue; }
      if (c.st === 0) { newCards++; continue; }
      studied++;
      const R = Model.recallNow(c, now);
      sumR += R;
      rBins[Math.min(9, Math.floor(R * 10))]++;
      sBins[sEdges.findIndex((e) => c.s < e)]++;
      dBins[Math.min(8, Math.max(0, Math.floor(c.d) - 1))]++;
      const dd = Math.max(0, Model.dayIndex(c.due) - todayIdx);
      if (dd < 30) forecast[dd]++;
    }
    let streak = 0;
    for (let d = todayIdx - (daily.get(todayIdx) ? 0 : 1); daily.get(d); d--) streak++;
    return { now, todayIdx, daily, ratings, ret, forecast, rBins, sBins, sLabels, dBins, studied, sumR, cards, newCards, suspended, streak, totalReviews, totalTime };
  }

  function tile(label, value, sub) {
    return h('div', { class: 'tile' }, h('div', { class: 'tile-label', text: label }), h('div', { class: 'tile-value', text: value }), sub ? h('div', { class: 'tile-sub', text: sub }) : null);
  }

  function render() {
    const s = compute();
    const deckSel = h('select', { id: 'stats-deck', class: 'input select', 'aria-label': 'Deck', onchange: (e) => { deck = e.target.value; App.render(); } },
      h('option', { value: '', text: 'All decks' }), Model.deckNames().map((d) => h('option', { value: d, selected: d === deck, text: d.split('::').join(' › ') })));
    const page = h('div', { class: 'page stats' },
      h('div', { class: 'page-head' }, h('h1', { class: 'page-title', text: 'Statistics' }), h('div', { class: 'filter-row' }, deckSel)));
    if (!s.cards) {
      page.append(h('div', { class: 'empty' }, h('p', { class: 'empty-title', text: 'No cards here yet' }), h('p', { class: 'muted', text: 'Statistics appear once you add and review cards.' })));
      return page;
    }
    const pct = (a) => (a[0] ? fmtPct(a[1] / a[0]) : '—');
    page.append(h('div', { class: 'tiles' },
      tile('Recall now', s.studied ? fmtPct(s.sumR / s.studied) : '—', s.studied ? plural(s.studied, 'card') : ''),
      tile('Remembered', s.studied ? fmtInt(s.sumR) : '—', `of ${fmtInt(s.cards)}`),
      tile('Retention · 30d', pct(s.ret.d30), `target ${fmtPct(Model.settings.retention)}`),
      tile('Streak', plural(s.streak, 'day'), `${fmtInt(s.totalReviews)} answers`)));

    const grid = h('div', { class: 'chart-grid' });
    const weeks = window.innerWidth > 900 ? 52 : 26;
    grid.append(h('div', { class: 'chart-card wide' }, Charts.heatmap({
      title: 'Reviews per day', subtitle: `${weeks} weeks`, counts: s.daily, todayIdx: s.todayIdx, weeks,
      dayToDate: (idx) => new Date(Model.dayStart(idx) + 6 * 3600000),
      empty: s.daily.size ? null : 'Your review calendar fills in as you study.',
      table: { columns: ['Date', 'Reviews'], rows: [...s.daily.entries()].sort((a, b) => b[0] - a[0]).slice(0, 120).map(([d, n]) => [new Date(Model.dayStart(d) + 6 * 3600000).toLocaleDateString(), String(n)]) },
    })));
    const fLabels = s.forecast.map((_, i) => (i === 0 ? 'Today' : i === 1 ? 'Tmrw' : '+' + i + 'd'));
    grid.append(h('div', { class: 'chart-card' }, Charts.columns({
      title: 'Due · next 30 days',
      data: s.forecast.map((v, i) => ({ label: i % 7 === 0 ? fLabels[i] : '', value: v, tip: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : 'In ' + i + ' days', accent: i === 0 })),
      labelEvery: 1, empty: s.studied ? null : 'Nothing scheduled yet.',
      table: { columns: ['Day', 'Due'], rows: s.forecast.map((v, i) => [fLabels[i], String(v)]) },
    })));
    grid.append(h('div', { class: 'chart-card' }, Charts.columns({
      title: 'Recall now', subtitle: 'Darker: at or above target',
      data: s.rBins.map((v, i) => ({ label: i % 2 === 0 ? i * 10 + '%' : '', value: v, tip: `${i * 10}–${i * 10 + 10}%`, accent: i >= Math.floor(Model.settings.retention * 10) })),
      labelEvery: 1, empty: s.studied ? null : 'Review some cards to see this.',
      table: { columns: ['Recall', 'Cards'], rows: s.rBins.map((v, i) => [`${i * 10}–${i * 10 + 10}%`, String(v)]) },
    })));
    grid.append(h('div', { class: 'chart-card' }, Charts.columns({
      title: 'Stability', subtitle: 'Days until 90% recall',
      data: s.sBins.map((v, i) => ({ label: [0, 2, 4, 6, 8].includes(i) ? s.sLabels[i] : '', value: v, tip: s.sLabels[i] })),
      labelEvery: 1, empty: s.studied ? null : 'Review some cards to see this.',
      table: { columns: ['Stability', 'Cards'], rows: s.sBins.map((v, i) => [s.sLabels[i], String(v)]) },
    })));
    grid.append(h('div', { class: 'chart-card' }, Charts.columns({
      title: 'Difficulty', subtitle: '1 easy · 10 hard',
      data: s.dBins.map((v, i) => ({ label: String(i + 1), value: v, tip: `Difficulty ${i + 1}–${i + 2}` })),
      labelEvery: 1, empty: s.studied ? null : 'Review some cards to see this.',
      table: { columns: ['Difficulty', 'Cards'], rows: s.dBins.map((v, i) => [`${i + 1}–${i + 2}`, String(v)]) },
    })));
    const totalR = s.ratings.reduce((a, b) => a + b, 0);
    grid.append(h('div', { class: 'chart-card' }, Charts.columns({
      title: 'Answers', subtitle: totalR ? fmtInt(totalR) : '',
      data: GRADES.map(({ g, label }) => ({ label, value: s.ratings[g - 1], tip: `${label} · ${totalR ? fmtPct(s.ratings[g - 1] / totalR) : '0%'}` })),
      labelEvery: 1, empty: totalR ? null : 'No answers yet.',
      table: { columns: ['Answer', 'Count', 'Share'], rows: GRADES.map(({ g, label }) => [label, String(s.ratings[g - 1]), totalR ? fmtPct(s.ratings[g - 1] / totalR) : '—']) },
    })));
    page.append(grid);

    // retention table
    page.append(h('section', { class: 'panel' }, h('h2', { class: 'section-title', text: 'True retention' }),
      h('p', { class: 'muted small', text: 'Reviews answered Hard, Good or Easy.' }),
      h('div', { class: 'table-scroll' }, h('table', { class: 'data-table' },
        h('thead', null, h('tr', null, ['Period', 'Reviews', 'Retention'].map((t) => h('th', { scope: 'col', text: t })))),
        h('tbody', null, [['Last 7 days', s.ret.d7], ['Last 30 days', s.ret.d30], ['  short intervals (< 21 days)', s.ret.young], ['  long intervals (21+ days)', s.ret.mature], ['Last 365 days', s.ret.d365]].map(([l, a]) =>
          h('tr', null, h('td', { text: l }), h('td', { text: fmtInt(a[0]) }), h('td', { text: pct(a) }))))))));

    // calibration
    const cal = h('section', { class: 'panel' });
    page.append(cal);
    drawCalibration(cal);
    return page;
  }

  function drawCalibration(host) {
    const hist = Model.histories(deck || null);
    const ds = FSRS.buildDataset(hist, Model.clock);
    host.append(h('h2', { class: 'section-title', text: 'FSRS accuracy' }));
    if (ds.items < 30) {
      host.append(h('p', { class: 'muted small', text: `Appears after 30 spaced reviews · ${ds.items} so far` }));
      return;
    }
    const ev = FSRS.evaluate(Model.settings.w, ds.seqs);
    const pts = ev.bins.filter((b) => b.n >= 3).map((b) => ({ x: b.pred, y: b.actual, tip: `${plural(b.n, 'review')} · predicted ${fmtPct(b.pred)}` }));
    const lo = Math.max(0, Math.floor(Math.min(0.5, ...pts.map((p) => p.x), ...pts.map((p) => p.y)) * 10) / 10);
    host.append(h('p', { class: 'muted small' }, `Log loss ${ev.logLoss.toFixed(3)} · RMSE ${fmtPct(ev.rmse, 1)} · ${plural(ev.n, 'review')} · `,
      h('button', { class: 'link-btn', type: 'button', text: 'Personalize parameters', onclick: () => App.go('settings', { anchor: 'fsrs-opt' }) })));
    host.append(Charts.line({
      title: 'Predicted vs actual', subtitle: 'Diagonal = perfect',
      points: pts, hoverPoints: pts, markers: pts.map((p) => ({ x: p.x, y: p.y })), xMin: lo, xMax: 1, yMin: lo, yMax: 1, area: false,
      refLine: [[lo, lo], [1, 1]], xFmt: (v) => fmtPct(v), yFmt: (v) => fmtPct(v), xTicks: [lo, (lo + 1) / 2, 1], yTicks: [lo, (lo + 1) / 2, 1], height: 200,
      table: { columns: ['Predicted', 'Actual', 'Reviews'], rows: ev.bins.filter((b) => b.n).map((b) => [fmtPct(b.pred, 1), fmtPct(b.actual, 1), String(b.n)]) },
    }));
  }

  return { render };
})();
