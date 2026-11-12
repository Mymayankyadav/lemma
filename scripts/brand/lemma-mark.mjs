/**
 * The Lemma "Compass" mark (release plan R2, Owner decision D3 = A · Compass): the ℓ inside a circle being drawn,
 * with a compass arm and pivot and a faint construction line. One geometry, two outputs:
 *  - `markSvg()` writes vector masters (the theme-following favicon and the 1024 reference), and
 *  - `rasterMark()` rasterises the same geometry to RGBA with analytic anti-aliasing, so every PNG is generated on
 *    each build with no native canvas, font or image dependency (like the earlier generator).
 * Coordinates are in the unit square (0..1, y down). The ℓ is the STIX Two Math glyph that the v7 shell already uses
 * for its ℓ mark (the Newsreader Latin subset has no U+2113), stored as its outline so no font is needed at build time.
 */

/** STIX Two Math U+2113, font units (1000/em, y up), M/L/Q/Z only. OFL: public/fonts/v7/stixtwomath-OFL.txt. */
export const ELL_PATH = 'M18 249Q41 254 66 259.5Q91 265 117 272Q144 342 177.5 412.5Q211 483 249.5 541Q288 599 331.5 634.5Q375 670 421 670Q465 670 487 643.5Q509 617 509 572Q509 509 481 459.5Q453 410 406.5 372.5Q360 335 303 308Q246 281 188 263Q171 219 159 177Q147 135 147 97Q147 72 159 51Q171 30 196 30Q234 30 270 69Q306 108 362 190L386 173Q326 79 281.5 34.5Q237 -10 182 -10Q158 -10 133.5 -0.5Q109 9 93 35Q77 61 77 112Q77 140 85 172.5Q93 205 105 239Q58 228 22 222ZM414 625Q390 625 366.5 605Q343 585 322 553Q301 521 283 485Q265 449 251 416Q237 383 228 361L203 299Q270 323 328.5 359Q387 395 424 445Q461 495 461 562Q461 598 447 611.5Q433 625 414 625Z';
const ELL_BOUNDS = {x0: 18, y0: -10, x1: 509, y1: 670};

/** v7 palette (src/ui/v7/tokens.css): page, primary text, brand indigo. */
export const MARK_THEMES = {
 night: {page: '#091023', ink: '#EEF2FA', brand: '#5159D7'},
 day: {page: '#F8F5F0', ink: '#121B31', brand: '#4246C2'},
};

/**
 * Layouts. `full` is the installed icon (64 px and up): ring, construction line and dashed construction circle, arm,
 * pivot and pencil point. `simple` is the favicon and anything under 64 px: ring and ℓ only (spec: the arm is busy at 16 px).
 * The meaningful art of `full` stays inside the maskable safe zone (the central circle of radius 0.4).
 */
export const LAYOUTS = {
 full: {ring: 0.293, ellHeight: 0.35, ellCentre: [0.5, 0.49], arm: true, construction: true},
 simple: {ring: 0.42, ellHeight: 0.56, ellCentre: [0.5, 0.49], arm: false, construction: false},
};
const ARM_ANGLE = -Math.PI / 4; // up and to the right

/** Stroke widths in unit coordinates, scaled so the ring is never thinner than 1.5 px at the target size. */
export function strokes(size, layout = 'full') {
 const px = 1 / size;
 const base = layout === 'simple' ? 0.065 : 11 / 1024;
 return {
  ring: Math.max(base, 1.5 * px),
  arm: Math.max(6 / 1024, 1.25 * px),
  pivot: Math.max(10 / 1024, 1.25 * px),
  pencil: Math.max(14 / 1024, 1.5 * px),
  construction: Math.max(3 / 1024, 1 * px),
  dashed: Math.max(2 / 1024, 1 * px),
 };
}

/** The ℓ placement: scale and offset from font units to the unit square (y flipped). Optically centred, not by advance. */
export function ellTransform(layout = 'full') {
 const l = LAYOUTS[layout];
 const s = l.ellHeight / (ELL_BOUNDS.y1 - ELL_BOUNDS.y0);
 const cx = (ELL_BOUNDS.x0 + ELL_BOUNDS.x1) / 2, cy = (ELL_BOUNDS.y0 + ELL_BOUNDS.y1) / 2;
 return {s, tx: l.ellCentre[0] - cx * s, ty: l.ellCentre[1] + cy * s};
}

/** The glyph as closed polygons in unit coordinates (quadratics flattened). */
export function ellPolygons(layout = 'full', steps = 12) {
 const {s, tx, ty} = ellTransform(layout);
 const map = (x, y) => [tx + x * s, ty - y * s];
 const tokens = ELL_PATH.match(/[MLQZ]|-?\d*\.?\d+/g);
 const polys = []; let cur = []; let pen = [0, 0]; let i = 0;
 const num = () => Number(tokens[i++]);
 while (i < tokens.length) {
  const cmd = tokens[i++];
  if (cmd === 'M') { if (cur.length) polys.push(cur); pen = [num(), num()]; cur = [map(...pen)]; }
  else if (cmd === 'L') { pen = [num(), num()]; cur.push(map(...pen)); }
  else if (cmd === 'Q') {
   const c = [num(), num()], e = [num(), num()];
   for (let k = 1; k <= steps; k++) {
    const t = k / steps, u = 1 - t;
    cur.push(map(u * u * pen[0] + 2 * u * t * c[0] + t * t * e[0], u * u * pen[1] + 2 * u * t * c[1] + t * t * e[1]));
   }
   pen = e;
  } else if (cmd === 'Z') { if (cur.length) polys.push(cur); cur = []; }
 }
 if (cur.length) polys.push(cur);
 return polys;
}

const armEnd = (r) => [0.5 + r * Math.cos(ARM_ANGLE), 0.5 + r * Math.sin(ARM_ANGLE)];
const f = (n) => +n.toFixed(2);

/** SVG path data for the ℓ in a 1024 viewBox. */
export function ellPathData(layout = 'full', box = 1024) {
 const {s, tx, ty} = ellTransform(layout);
 return ELL_PATH.replace(/([MLQ])([^MLQZ]+)/g, (_, c, args) => {
  const n = args.trim().split(/\s+/).map(Number), out = [];
  for (let k = 0; k < n.length; k += 2) out.push(f((tx + n[k] * s) * box), f((ty - n[k + 1] * s) * box));
  return c + out.join(' ');
 });
}

/**
 * Vector mark. `theme` is 'night', 'day' or 'auto' (a prefers-color-scheme media query switches the colours, Day
 * first). `background`: 'square' (full bleed), 'disc' (favicon) or 'none'.
 */
export function markSvg({theme = 'night', layout = 'full', background = 'square', size = 1024} = {}) {
 const B = 1024, l = LAYOUTS[layout], w = strokes(size, layout);
 const t = theme === 'auto' ? MARK_THEMES.day : MARK_THEMES[theme];
 const style = theme === 'auto'
  ? `<style>.p{fill:${MARK_THEMES.day.page}}.i{fill:${MARK_THEMES.day.ink}}.b{stroke:${MARK_THEMES.day.brand}}.bf{fill:${MARK_THEMES.day.brand}}.c{stroke:${MARK_THEMES.day.ink}}@media (prefers-color-scheme: dark){.p{fill:${MARK_THEMES.night.page}}.i{fill:${MARK_THEMES.night.ink}}.b{stroke:${MARK_THEMES.night.brand}}.bf{fill:${MARK_THEMES.night.brand}}.c{stroke:${MARK_THEMES.night.ink}}}</style>`
  : `<style>.p{fill:${t.page}}.i{fill:${t.ink}}.b{stroke:${t.brand}}.bf{fill:${t.brand}}.c{stroke:${t.ink}}</style>`;
 const parts = [style];
 if (background === 'square') parts.push(`<rect class="p" width="${B}" height="${B}"/>`);
 if (background === 'disc') parts.push(`<circle class="p" cx="512" cy="512" r="512"/>`);
 const r = l.ring * B;
 if (l.construction) {
  parts.push(`<line class="c" x1="${f(512 - r)}" y1="512" x2="${f(512 + r)}" y2="512" stroke-opacity=".14" stroke-width="${f(w.construction * B)}"/>`);
  parts.push(`<circle class="c" cx="512" cy="512" r="${f(r)}" fill="none" stroke-opacity=".18" stroke-width="${f(w.dashed * B)}" stroke-dasharray="6 14" transform="rotate(-20 512 512)"/>`);
 }
 parts.push(`<circle class="b" cx="512" cy="512" r="${f(r)}" fill="none" stroke-width="${f(w.ring * B)}"/>`);
 if (l.arm) {
  const [ex, ey] = armEnd(l.ring);
  parts.push(`<line class="b" x1="512" y1="512" x2="${f(ex * B)}" y2="${f(ey * B)}" stroke-width="${f(w.arm * B)}" stroke-linecap="round"/>`);
  parts.push(`<circle class="bf" cx="512" cy="512" r="${f(w.pivot * B)}"/><circle class="bf" cx="${f(ex * B)}" cy="${f(ey * B)}" r="${f(w.pencil * B)}"/>`);
 }
 parts.push(`<path class="i" d="${ellPathData(layout, B)}"/>`);
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${B} ${B}" width="${size}" height="${size}">${parts.join('')}</svg>\n`;
}

// ---------- raster ----------
const hex = (h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16));
const clamp = (x) => Math.max(0, Math.min(1, x));
const segDist = (x, y, ax, ay, bx, by) => {
 const dx = bx - ax, dy = by - ay, t = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy));
 return Math.hypot(x - ax - t * dx, y - ay - t * dy);
};

/** Nonzero-winding coverage of closed polygons (unit coords) on a size×size grid, 8 sub-rows, exact horizontal spans. */
export function polygonCoverage(polys, size, sub = 8) {
 const cov = new Float32Array(size * size);
 const edges = [];
 for (const p of polys) for (let k = 0; k < p.length; k++) {
  const a = p[k], b = p[(k + 1) % p.length];
  if (a[1] !== b[1]) edges.push([a[0] * size, a[1] * size, b[0] * size, b[1] * size]);
 }
 for (let row = 0; row < size; row++) for (let s = 0; s < sub; s++) {
  const y = row + (s + 0.5) / sub, xs = [];
  for (const [x0, y0, x1, y1] of edges) {
   if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) xs.push([x0 + ((y - y0) / (y1 - y0)) * (x1 - x0), y1 > y0 ? 1 : -1]);
  }
  xs.sort((a, b) => a[0] - b[0]);
  let wind = 0;
  for (let k = 0; k < xs.length - 1; k++) {
   wind += xs[k][1];
   if (wind === 0) continue;
   const a = Math.max(0, xs[k][0]), b = Math.min(size, xs[k + 1][0]);
   for (let x = Math.floor(a); x < b && x < size; x++) {
    const span = Math.min(b, x + 1) - Math.max(a, x);
    if (span > 0) cov[row * size + x] += span / sub;
   }
  }
 }
 return cov;
}

/** A pixel-accurate RGBA raster of `markSvg` with the same options; `background: 'none'` leaves alpha transparent. */
export function rasterMark({size, theme = 'night', layout = 'full', background = 'square'}) {
 const l = LAYOUTS[layout], w = strokes(size, layout), t = MARK_THEMES[theme];
 const page = hex(t.page), ink = hex(t.ink), brand = hex(t.brand);
 const glyph = polygonCoverage(ellPolygons(layout), size);
 const out = new Uint8ClampedArray(size * size * 4), px = 1 / size;
 const [ex, ey] = armEnd(l.ring), dashRot = (-20 * Math.PI) / 180, period = (20 / 1024) / l.ring;
 for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
  const x = (i + 0.5) * px, y = (j + 0.5) * px, d = Math.hypot(x - 0.5, y - 0.5);
  let rgb = [...page], alpha = background === 'none' ? 0 : 1;
  if (background === 'disc') alpha = clamp((0.5 - d) / px + 0.5);
  const paint = (colour, a) => {
   if (a <= 0) return;
   const total = a + alpha * (1 - a);
   rgb = rgb.map((c, k) => (colour[k] * a + c * alpha * (1 - a)) / (total || 1));
   alpha = total;
  };
  if (l.construction) {
   paint(ink, 0.14 * clamp((w.construction / 2 - Math.abs(y - 0.5)) / px + 0.5) * (Math.abs(x - 0.5) <= l.ring ? 1 : 0));
   const ang = (Math.atan2(y - 0.5, x - 0.5) - dashRot + 4 * Math.PI) % (2 * Math.PI);
   const inDash = ((ang / period) % 1) < 6 / 20 ? 1 : 0;
   paint(ink, 0.18 * inDash * clamp((w.dashed / 2 - Math.abs(d - l.ring)) / px + 0.5));
  }
  paint(brand, clamp((w.ring / 2 - Math.abs(d - l.ring)) / px + 0.5));
  if (l.arm) {
   paint(brand, clamp((w.arm / 2 - segDist(x, y, 0.5, 0.5, ex, ey)) / px + 0.5));
   paint(brand, clamp((w.pivot - d) / px + 0.5));
   paint(brand, clamp((w.pencil - Math.hypot(x - ex, y - ey)) / px + 0.5));
  }
  paint(ink, clamp(glyph[j * size + i]));
  const o = (j * size + i) * 4;
  out[o] = rgb[0]; out[o + 1] = rgb[1]; out[o + 2] = rgb[2]; out[o + 3] = Math.round(alpha * 255);
 }
 return out;
}

/** WCAG relative-luminance contrast between two #RRGGBB colours. */
export function contrast(a, b) {
 const lum = (h) => {
  const [r, g, bl] = hex(h).map((c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
 };
 const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
 return (x + 0.05) / (y + 0.05);
}
