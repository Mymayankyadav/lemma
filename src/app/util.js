/* ---------- DOM + formatting utilities ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const DAY_MS = 86400000;

function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  appendKids(el, children);
  return el;
}
function appendKids(el, kids) {
  for (const c of kids) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) appendKids(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}
/** Replace an element's children, skipping null/false entries. */
function fill(el, ...kids) { el.replaceChildren(); appendKids(el, kids); return el; }
const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const clampN = (x, a, b) => Math.min(Math.max(x, a), b);
function debounce(fn, ms) {
  let t;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.flush = (...a) => { clearTimeout(t); fn(...a); };
  return d;
}
const fmtInt = (n) => Math.round(n).toLocaleString();
const fmtPct = (x, digits = 0) => (x == null || !Number.isFinite(x) ? '—' : (x * 100).toFixed(digits) + '%');
function fmtCompact(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M';
  if (n >= 1e4) return Math.round(n / 1e3) + 'K';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(Math.round(n));
}
function fmtDuration(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return s + 's';
  const m = Math.round(s / 60);
  if (m < 60) return m + ' min';
  const hh = Math.floor(m / 60);
  return hh + 'h ' + (m % 60) + 'm';
}
function fmtDate(ts, withTime) {
  const d = new Date(ts);
  const opts = { day: 'numeric', month: 'short' };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  if (withTime) { opts.hour = 'numeric'; opts.minute = '2-digit'; }
  return d.toLocaleString(undefined, opts);
}
function fmtRelative(ts, now = Date.now()) {
  const diff = ts - now;
  const abs = Math.abs(diff);
  const past = diff < 0;
  let s;
  if (abs < 60000) return past ? 'just now' : 'now';
  if (abs < 3600000) s = Math.round(abs / 60000) + ' min';
  else if (abs < DAY_MS) s = Math.round(abs / 3600000) + 'h';
  else if (abs < 30 * DAY_MS) s = Math.round(abs / DAY_MS) + 'd';
  else if (abs < 365 * DAY_MS) s = (abs / (30.4 * DAY_MS)).toFixed(1).replace(/\.0$/, '') + ' mo';
  else s = (abs / (365 * DAY_MS)).toFixed(1).replace(/\.0$/, '') + ' y';
  return past ? s + ' ago' : 'in ' + s;
}
const plural = (n, word, pl) => `${fmtInt(n)} ${n === 1 ? word : pl || word + 's'}`;

/* ---------- icons ---------- */
const ICON_PATHS = {
  plus: 'M12 5v14M5 12h14',
  x: 'M18 6 6 18M6 6l12 12',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-3.6-3.6',
  back: 'M15 18l-6-6 6-6',
  next: 'M9 18l6-6-6-6',
  down: 'M6 9l6 6 6-6',
  undo: 'M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  edit: 'M16.5 3.5l4 4L8 20H4v-4L16.5 3.5z',
  hint: 'M9 18h6M10 21.5h4M12 2.5a6.5 6.5 0 0 0-3.8 11.8c.6.5.8 1.1.8 1.9V17h6v-.8c0-.8.3-1.4.8-1.9A6.5 6.5 0 0 0 12 2.5z',
  pen: 'M4 20l3.6-.9L19 7.7a2 2 0 0 0-2.8-2.8L4.9 16.4 4 20zM14.5 6.5l3 3',
  type: 'M3 7.5A1.5 1.5 0 0 1 4.5 6h15A1.5 1.5 0 0 1 21 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 16.5v-9zM7 10h.01M11 10h.01M15 10h.01M8 14h8',
  spark: 'M12 3.5l1.7 4.8 4.8 1.7-4.8 1.7L12 16.5l-1.7-4.8L5.5 10l4.8-1.7L12 3.5zM18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z',
  flag: 'M5 21V4h12l-2 4 2 4H5',
  pause: 'M9 5v14M15 5v14',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v5M12 8h.01',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  download: 'M12 3v12M8 11l4 4 4-4M5 20h14',
  upload: 'M12 20V8M8 12l4-4 4 4M5 4h14',
  sliders: 'M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4v4M7 10v4M15 16v4',
  chart: 'M4 20V11M10 20V5M16 20v-6M2.5 20h19',
  decks: 'M12 3l9 4.8-9 4.8-9-4.8L12 3zM3 12.2l9 4.8 9-4.8M3 16.4l9 4.8 9-4.8',
  list: 'M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01',
  graph: 'M6 7a2.2 2.2 0 1 0 0-.01M18 7a2.2 2.2 0 1 0 0-.01M12 18a2.2 2.2 0 1 0 0-.01M7.8 8.4l3 7.6M16.2 8.4l-3 7.6M8.2 6.8h7.6',
  play: 'M7 4.5l12 7.5-12 7.5v-15z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
  eraser: 'M8 20h12M5.4 14.6l7.8-7.8a1.8 1.8 0 0 1 2.6 0l2.4 2.4a1.8 1.8 0 0 1 0 2.6L10.6 19.4H8.2l-2.8-2.8a1.4 1.4 0 0 1 0-2z',
  steps: 'M10 6h11M10 12h11M10 18h11M4 5l1.5-1V9M3.5 15.2c.3-.8 1.1-1.2 1.8-1 1.2.3 1.2 1.7.3 2.4L3.6 18.5h2.6',
  refresh: 'M20 11a8 8 0 1 0-2.4 5.8M20 4.5V11h-6.5',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  image: 'M4 5h16v14H4V5zM4 16l4.5-4.5L13 16M13 13l2.5-2.5L20 15M15.5 8.5h.01',
  lock: 'M6 11h12v9H6v-9zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  cloud: 'M7 18h10.5a4 4 0 0 0 .5-8 6 6 0 0 0-11.6 1.6A3.3 3.3 0 0 0 7 18z',
  device: 'M7 3h10v18H7V3zM11 18h2',
  sigma: 'M18 5H6l6 7-6 7h12',
  stop: 'M7 7h10v10H7V7z',
  plusc: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8v8M8 12h8',
  gauge: 'M4.2 16.5a8.5 8.5 0 1 1 15.6 0M12 15.5l3.8-4.6M12 15.5h.01',
  flame: 'M12 3c.8 3.3 4.8 5.2 4.8 9.8a4.8 4.8 0 0 1-9.6 0c0-2.1.9-3.5 2.1-4.6.3 1.5 1 2.4 2 2.8C10.6 8.6 11.1 5.6 12 3z',
  hourglass: 'M7 3h10M7 21h10M8 3v2.5c0 2.2 4 4.3 4 6.5s-4 4.3-4 6.5V21M16 3v2.5c0 2.2-4 4.3-4 6.5s4 4.3 4 6.5V21',
  cards: 'M8 4.5h10.5a1.5 1.5 0 0 1 1.5 1.5v11M5.5 7.5h9A1.5 1.5 0 0 1 16 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 4 18.5V9a1.5 1.5 0 0 1 1.5-1.5z',
  swap: 'M4 8h15l-3.5-3.5M20 16H5l3.5 3.5',
  calendar: 'M4.5 6h15v14h-15V6zM4.5 10h15M8.5 3.5v4M15.5 3.5v4',
  folderplus: 'M3.5 7A1.5 1.5 0 0 1 5 5.5h4l2 2h8A1.5 1.5 0 0 1 20.5 9v8.5A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5V7zM12 10.5v5.5M9.25 13.25h5.5',
  sort: 'M7 4.5v15M4 16.5l3 3 3-3M17 19.5v-15M14 7.5l3-3 3 3',
  moon: 'M19.5 14.6A7.8 7.8 0 1 1 9.4 4.5a6.2 6.2 0 0 0 10.1 10.1z',
  half: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 3v18',
  scribble: 'M3.5 16c2.2-4.8 4-7.4 5.4-7.4 2 0-.6 7.9 1.6 7.9 1.9 0 3.1-5.8 5-5.8 1.6 0 1.2 3.7 2.8 3.7.9 0 1.7-1 2.2-2',
};
function icon(name, size = 20) {
  return `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICON_PATHS[name] || ''}"/></svg>`;
}
function iconBtn(name, label, onClick, extra = {}) {
  return h('button', Object.assign({ class: 'icon-btn' + (extra.class ? ' ' + extra.class : ''), type: 'button', 'aria-label': label, title: label + (extra.kbd ? ` (${extra.kbd})` : ''), html: icon(name, extra.size || 20), onclick: onClick }, extra.attrs || {}));
}

/** A grid of large icon tiles with one-word captions (used for compact menus). */
function iconGrid(items, onPick) {
  return h('div', { class: 'icon-grid' }, items.filter(Boolean).map(([ic, label, fn, danger]) => {
    const b = h('button', { type: 'button', class: 'ig-item' + (danger ? ' danger' : ''), html: icon(ic, 22), onclick: () => { if (onPick) onPick(); fn(); } });
    b.append(h('span', { text: label }));
    return b;
  }));
}

/* ---------- toasts ---------- */
function toast(message, opts = {}) {
  const root = $('#toasts');
  if (!root) return;
  const el = h('div', { class: 'toast' + (opts.kind ? ' toast-' + opts.kind : ''), role: 'status' },
    h('span', { class: 'toast-msg', text: message }),
    opts.action ? h('button', { class: 'toast-act', type: 'button', text: opts.action.label, onclick: () => { opts.action.fn(); dismiss(); } }) : null);
  root.append(el);
  requestAnimationFrame(() => el.classList.add('in'));
  let gone = false;
  function dismiss() { if (gone) return; gone = true; el.classList.remove('in'); setTimeout(() => el.remove(), 250); }
  setTimeout(dismiss, opts.ms || (opts.action ? 6000 : 3200));
  return dismiss;
}

/* ---------- sheets (dialogs) ---------- */
const Sheets = (() => {
  const stack = [];
  function open({ title, body, actions, wide, onClose, className, label }) {
    const root = $('#sheets');
    const prevFocus = document.activeElement;
    const close = () => {
      const i = stack.indexOf(entry);
      if (i >= 0) stack.splice(i, 1);
      wrap.classList.remove('in');
      setTimeout(() => wrap.remove(), 200);
      if (onClose) onClose();
      if (prevFocus && prevFocus.focus) try { prevFocus.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
      document.body.classList.toggle('sheet-open', stack.length > 0);
    };
    const grip = h('div', { class: 'sheet-grip', 'aria-hidden': 'true' });
    const head = h('div', { class: 'sheet-head' },
      h('h2', { class: 'sheet-title', text: title || '' }),
      iconBtn('x', 'Close', close));
    const foot = actions && actions.filter(Boolean).length ? h('div', { class: 'sheet-foot' }, actions) : null;
    const panel = h('div', { class: 'sheet' + (wide ? ' sheet-wide' : '') + (className ? ' ' + className : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': label || title || 'Dialog' },
      grip, head, h('div', { class: 'sheet-body' }, body), foot);
    // drag the handle or header down to dismiss (phones)
    let sy = null, dy = 0, t0 = 0;
    const dragStart = (e) => {
      if (window.innerWidth >= 720 || e.target.closest('button, a, input')) return;
      sy = e.clientY; dy = 0; t0 = Date.now();
      panel.classList.add('dragging');
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    };
    const dragMove = (e) => { if (sy == null) return; dy = Math.max(0, e.clientY - sy); panel.style.transform = `translateY(${dy}px)`; };
    const dragEnd = () => {
      if (sy == null) return;
      sy = null;
      panel.classList.remove('dragging');
      const fast = dy / Math.max(1, Date.now() - t0) > 0.6;
      panel.style.transform = '';
      if (dy > 110 || (fast && dy > 30)) close();
    };
    for (const el of [grip, head]) {
      el.addEventListener('pointerdown', dragStart);
      el.addEventListener('pointermove', dragMove);
      el.addEventListener('pointerup', dragEnd);
      el.addEventListener('pointercancel', dragEnd);
    }
    const wrap = h('div', { class: 'sheet-wrap' }, h('div', { class: 'sheet-scrim', onclick: close }), panel);
    root.append(wrap);
    const entry = { close, panel };
    stack.push(entry);
    document.body.classList.add('sheet-open');
    requestAnimationFrame(() => {
      wrap.classList.add('in');
      const f = panel.querySelector('[autofocus], input:not([type=hidden]), textarea, select, .sheet-body button');
      if (f && !('ontouchstart' in window)) try { f.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    });
    return entry;
  }
  const top = () => stack[stack.length - 1];
  const closeTop = () => { const t = top(); if (t) { t.close(); return true; } return false; };
  return { open, top, closeTop, get count() { return stack.length; } };
})();

/** In-page confirmation (the viewer blocks window.confirm). */
function confirmDialog({ title, message, confirmLabel = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    const s = Sheets.open({
      title, label: title,
      body: h('p', { class: 'confirm-msg', text: message }),
      actions: [
        h('button', { class: 'btn', type: 'button', text: 'Cancel', onclick: () => { finish(false); s.close(); } }),
        h('button', { class: 'btn ' + (danger ? 'btn-danger' : 'btn-primary'), type: 'button', text: confirmLabel, onclick: () => { finish(true); s.close(); } }),
      ],
      onClose: () => finish(false),
    });
  });
}

/** Copy text; falls back to selecting it inside a read-only box. */
async function copyText(text, fallbackEl) {
  try { await navigator.clipboard.writeText(text); toast('Copied'); return true; }
  catch (e) {
    if (fallbackEl) { fallbackEl.focus(); fallbackEl.select(); toast('Press Ctrl+C or ⌘C to copy the selected text'); }
    return false;
  }
}

const isTouch = () => window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
const prefersReducedMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
