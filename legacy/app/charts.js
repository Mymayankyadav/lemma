/* ---------- small SVG chart kit: columns, line, calendar heatmap (with tooltips + table view) ---------- */
const Charts = (() => {
  const NS = 'http://www.w3.org/2000/svg';
  const s = (tag, attrs) => {
    const el = document.createElementNS(NS, tag);
    for (const k in attrs || {}) if (attrs[k] != null) el.setAttribute(k, attrs[k]);
    return el;
  };
  function niceMax(v) {
    if (v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / p;
    const m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
    return m * p;
  }
  function ticks(max, count = 4) {
    const step = niceMax(max / count);
    const out = [];
    for (let v = 0; v <= max + 1e-9; v += step) out.push(+v.toFixed(6));
    return out;
  }

  /** Wrap a plot in a figure with title, optional subtitle, table toggle and tooltip layer. */
  function figure({ title, subtitle, table, empty }) {
    const tip = h('div', { class: 'chart-tip', role: 'status', 'aria-live': 'polite' });
    const plot = h('div', { class: 'chart-plot' });
    const tbl = h('div', { class: 'chart-table', hidden: true });
    const toggle = table ? h('button', { class: 'link-btn chart-toggle', type: 'button', text: 'Table', 'aria-pressed': 'false' }) : null;
    const fig = h('figure', { class: 'chart' },
      h('figcaption', { class: 'chart-head' },
        h('div', null, h('div', { class: 'chart-title', text: title }), subtitle ? h('div', { class: 'chart-sub', text: subtitle }) : null),
        toggle),
      empty ? h('div', { class: 'chart-empty', text: empty }) : plot, tbl, tip);
    if (toggle) {
      toggle.addEventListener('click', () => {
        const show = tbl.hidden;
        if (show && !tbl.firstChild) tbl.append(buildTable(table));
        tbl.hidden = !show;
        plot.hidden = show;
        toggle.textContent = show ? 'Chart' : 'Table';
        toggle.setAttribute('aria-pressed', String(show));
      });
    }
    return { fig, plot, tip };
  }
  function buildTable({ columns, rows }) {
    return h('div', { class: 'table-scroll' }, h('table', { class: 'data-table' },
      h('thead', null, h('tr', null, columns.map((c) => h('th', { scope: 'col', text: c })))),
      h('tbody', null, rows.map((r) => h('tr', null, r.map((v) => h('td', { text: v })))))));
  }
  function showTip(tip, plot, x, y, lines) {
    fill(tip, ...lines.map((l, i) => h('div', { class: i === 0 ? 'tip-value' : 'tip-label', text: l })));
    tip.classList.add('on');
    const pw = plot.clientWidth;
    const tw = tip.offsetWidth;
    tip.style.left = clampN(x - tw / 2, 0, Math.max(0, pw - tw)) + 'px';
    tip.style.top = Math.max(0, y - tip.offsetHeight - 10) + 'px';
  }
  const hideTip = (tip) => tip.classList.remove('on');
  function observe(plot, draw) {
    let lastW = 0;
    const run = () => {
      const w = Math.floor(plot.clientWidth);
      if (!w || w === lastW) return;
      lastW = w;
      draw(w);
    };
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(run).observe(plot);
    requestAnimationFrame(run);
  }

  /** Columns: data = [{label, value, tip?}] */
  function columns(opts) {
    const { data, height = 160, format = fmtInt, labelEvery } = opts;
    const fx = figure(opts);
    if (opts.empty) return fx.fig;
    const draw = (W) => {
      const m = { l: 34, r: 6, t: 8, b: 22 };
      const iw = W - m.l - m.r, ih = height - m.t - m.b;
      const max = niceMax(Math.max(1, ...data.map((d) => d.value)));
      const band = iw / data.length;
      const bw = Math.max(2, Math.min(24, band - 2));
      const svg = s('svg', { width: W, height, viewBox: `0 0 ${W} ${height}`, role: 'img', 'aria-label': opts.title });
      for (const tv of ticks(max, 3)) {
        const y = m.t + ih - (tv / max) * ih;
        svg.append(s('line', { x1: m.l, x2: W - m.r, y1: y, y2: y, class: tv === 0 ? 'c-base' : 'c-grid' }));
        const t = s('text', { x: m.l - 6, y: y + 4, class: 'c-tick', 'text-anchor': 'end' });
        t.textContent = fmtCompact(tv);
        svg.append(t);
      }
      const every = labelEvery || Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(iw / 44))));
      data.forEach((d, i) => {
        const cx = m.l + band * i + band / 2;
        const bh = (d.value / max) * ih;
        const x = cx - bw / 2, y = m.t + ih - bh;
        if (bh > 0) {
          const r = Math.min(4, bw / 2, bh);
          svg.append(s('path', { class: 'c-bar' + (d.accent ? ' c-bar-accent' : ''), d: `M${x},${m.t + ih}V${y + r}Q${x},${y} ${x + r},${y}H${x + bw - r}Q${x + bw},${y} ${x + bw},${y + r}V${m.t + ih}Z` }));
        }
        if (i % every === 0 && d.label) {
          const t = s('text', { x: cx, y: height - 6, class: 'c-tick', 'text-anchor': 'middle' });
          t.textContent = d.label;
          svg.append(t);
        }
        const hit = s('rect', { x: m.l + band * i, y: m.t, width: Math.max(band, 1), height: ih, class: 'c-hit', tabindex: '0', 'aria-label': `${d.tip || d.label}: ${format(d.value)}` });
        const show = () => { hit.classList.add('on'); showTip(fx.tip, fx.plot, cx, y, [format(d.value), d.tip || d.label]); };
        hit.addEventListener('pointerenter', show);
        hit.addEventListener('focus', show);
        hit.addEventListener('pointerleave', () => { hit.classList.remove('on'); hideTip(fx.tip); });
        hit.addEventListener('blur', () => { hit.classList.remove('on'); hideTip(fx.tip); });
        svg.append(hit);
      });
      fill(fx.plot, svg);
    };
    observe(fx.plot, draw);
    return fx.fig;
  }

  /** Line: points = [{x, y, tip}], numeric x. Optional reference segment and markers. */
  function line(opts) {
    const { points, height = 180, xMin, xMax, yMin = 0, yMax = 1, xFmt = String, yFmt = fmtPct, refLine, area = true, markers } = opts;
    const fx = figure(opts);
    if (opts.empty) return fx.fig;
    const draw = (W) => {
      const m = { l: 40, r: 10, t: 10, b: 24 };
      const iw = W - m.l - m.r, ih = height - m.t - m.b;
      const x0 = xMin ?? Math.min(...points.map((p) => p.x)), x1 = xMax ?? Math.max(...points.map((p) => p.x));
      const X = (v) => m.l + ((v - x0) / Math.max(1e-9, x1 - x0)) * iw;
      const Y = (v) => m.t + ih - ((v - yMin) / Math.max(1e-9, yMax - yMin)) * ih;
      const svg = s('svg', { width: W, height, viewBox: `0 0 ${W} ${height}`, role: 'img', 'aria-label': opts.title });
      const yt = opts.yTicks || [yMin, (yMin + yMax) / 2, yMax];
      for (const tv of yt) {
        svg.append(s('line', { x1: m.l, x2: W - m.r, y1: Y(tv), y2: Y(tv), class: tv === yMin ? 'c-base' : 'c-grid' }));
        const t = s('text', { x: m.l - 6, y: Y(tv) + 4, class: 'c-tick', 'text-anchor': 'end' });
        t.textContent = yFmt(tv);
        svg.append(t);
      }
      const xt = opts.xTicks || [x0, (x0 + x1) / 2, x1];
      for (const tv of xt) {
        const t = s('text', { x: X(tv), y: height - 6, class: 'c-tick', 'text-anchor': tv === xt[0] ? 'start' : tv === xt[xt.length - 1] ? 'end' : 'middle' });
        t.textContent = xFmt(tv);
        svg.append(t);
      }
      if (refLine) svg.append(s('line', { x1: X(refLine[0][0]), y1: Y(refLine[0][1]), x2: X(refLine[1][0]), y2: Y(refLine[1][1]), class: 'c-ref' }));
      if (points.length) {
        const d = points.map((p, i) => (i ? 'L' : 'M') + X(p.x).toFixed(1) + ',' + Y(p.y).toFixed(1)).join('');
        if (area) svg.append(s('path', { d: d + `L${X(points[points.length - 1].x)},${Y(yMin)}L${X(points[0].x)},${Y(yMin)}Z`, class: 'c-area' }));
        svg.append(s('path', { d, class: 'c-line' }));
      }
      for (const mk of markers || []) svg.append(s('circle', { cx: X(mk.x), cy: Y(mk.y), r: 4.5, class: 'c-dot' + (mk.cls ? ' ' + mk.cls : '') }));
      const cross = s('line', { y1: m.t, y2: m.t + ih, class: 'c-cross', visibility: 'hidden' });
      const dot = s('circle', { r: 4.5, class: 'c-dot', visibility: 'hidden' });
      svg.append(cross, dot);
      const hit = s('rect', { x: m.l, y: m.t, width: iw, height: ih, class: 'c-hit', tabindex: '0', 'aria-label': opts.title + ' — use arrow keys to read values' });
      const pool = (opts.hoverPoints || points);
      let idx = -1;
      const at = (i) => {
        if (!pool.length) return;
        idx = clampN(i, 0, pool.length - 1);
        const p = pool[idx];
        cross.setAttribute('x1', X(p.x)); cross.setAttribute('x2', X(p.x)); cross.setAttribute('visibility', 'visible');
        dot.setAttribute('cx', X(p.x)); dot.setAttribute('cy', Y(p.y)); dot.setAttribute('visibility', 'visible');
        showTip(fx.tip, fx.plot, X(p.x), Y(p.y), [yFmt(p.y), p.tip || xFmt(p.x)]);
      };
      hit.addEventListener('pointermove', (e) => {
        const rect = svg.getBoundingClientRect();
        const xv = x0 + ((e.clientX - rect.left - m.l) / iw) * (x1 - x0);
        let best = 0, bd = Infinity;
        pool.forEach((p, i) => { const dd = Math.abs(p.x - xv); if (dd < bd) { bd = dd; best = i; } });
        at(best);
      });
      hit.addEventListener('focus', () => at(idx < 0 ? pool.length - 1 : idx));
      hit.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') { at(idx - 1); e.preventDefault(); }
        if (e.key === 'ArrowRight') { at(idx + 1); e.preventDefault(); }
      });
      const off = () => { cross.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); hideTip(fx.tip); };
      hit.addEventListener('pointerleave', off);
      hit.addEventListener('blur', off);
      svg.append(hit);
      fill(fx.plot, svg);
    };
    observe(fx.plot, draw);
    return fx.fig;
  }

  /** Calendar heatmap: counts = Map(dayIndex -> n); ends today. */
  function heatmap(opts) {
    const { counts, todayIdx, weeks = 26, dayToDate } = opts;
    const fx = figure(opts);
    if (opts.empty) return fx.fig;
    const vals = [...counts.values()].filter((v) => v > 0).sort((a, b) => a - b);
    const q = (p) => (vals.length ? vals[Math.min(vals.length - 1, Math.floor(p * (vals.length - 1)))] : 1);
    const cuts = [q(0.25), q(0.5), q(0.75)];
    const level = (v) => (v <= 0 ? 0 : v <= cuts[0] ? 1 : v <= cuts[1] ? 2 : v <= cuts[2] ? 3 : 4);
    const draw = (W) => {
      const left = 22, top = 16;
      const cell = clampN(Math.floor((W - left) / weeks) - 2, 6, 14);
      const step = cell + 2;
      const usedW = left + weeks * step;
      const H = top + 7 * step + 22;
      const svg = s('svg', { width: Math.min(W, usedW + 4), height: H, viewBox: `0 0 ${Math.min(W, usedW + 4)} ${H}`, role: 'img', 'aria-label': opts.title });
      const todayDate = dayToDate(todayIdx);
      const dow = (todayDate.getDay() + 6) % 7; // Monday = 0
      const startIdx = todayIdx - dow - (weeks - 1) * 7;
      ['Mon', '', 'Wed', '', 'Fri', '', ''].forEach((lab, i) => {
        if (!lab) return;
        const t = s('text', { x: 0, y: top + i * step + cell - 1, class: 'c-tick' });
        t.textContent = lab[0];
        svg.append(t);
      });
      let lastMonth = -1, lastLabelX = -99;
      for (let wk = 0; wk < weeks; wk++) {
        for (let d = 0; d < 7; d++) {
          const idx = startIdx + wk * 7 + d;
          if (idx > todayIdx) continue;
          const date = dayToDate(idx);
          if (d === 0 && date.getMonth() !== lastMonth) {
            lastMonth = date.getMonth();
            if (wk < weeks - 1 && left + wk * step - lastLabelX >= 30) {
              lastLabelX = left + wk * step;
              const t = s('text', { x: left + wk * step, y: 10, class: 'c-tick' });
              t.textContent = date.toLocaleString(undefined, { month: 'short' });
              svg.append(t);
            }
          }
          const v = counts.get(idx) || 0;
          const rect = s('rect', { x: left + wk * step, y: top + d * step, width: cell, height: cell, rx: 2, class: 'c-heat h' + level(v), tabindex: idx === todayIdx ? '0' : '-1', 'aria-label': `${date.toDateString()}: ${v} reviews` });
          const show = () => showTip(fx.tip, fx.plot, left + wk * step + cell / 2, top + d * step, [plural(v, 'review'), date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })]);
          rect.addEventListener('pointerenter', show);
          rect.addEventListener('focus', show);
          rect.addEventListener('pointerleave', () => hideTip(fx.tip));
          rect.addEventListener('blur', () => hideTip(fx.tip));
          svg.append(rect);
        }
      }
      const ly = top + 7 * step + 8;
      const lt = s('text', { x: left, y: ly + cell - 1, class: 'c-tick' });
      lt.textContent = 'Less';
      svg.append(lt);
      for (let i = 0; i < 5; i++) svg.append(s('rect', { x: left + 30 + i * step, y: ly, width: cell, height: cell, rx: 2, class: 'c-heat h' + i }));
      const mt = s('text', { x: left + 34 + 5 * step, y: ly + cell - 1, class: 'c-tick' });
      mt.textContent = 'More';
      svg.append(mt);
      fill(fx.plot, svg);
    };
    observe(fx.plot, draw);
    return fx.fig;
  }

  return { columns, line, heatmap, niceMax };
})();
