/**
 * The Lemma "Notebook" mark (release plan R2, Owner decision D3 = C · Notebook, 12 Nov 2026): a large ℓ on graph paper,
 * with a red margin rule and an indigo ∎ (end of proof). One geometry, two outputs:
 *  - `markSvg()` writes vector masters (the theme-following favicon and the 1024 references), and
 *  - `rasterMark()` rasterises the same geometry to RGBA with analytic anti-aliasing, so every PNG is generated on
 *    each build with no native canvas, font or image dependency.
 * Coordinates are in the unit square (0..1, y down). The ℓ is the STIX Two Math glyph that the v7 shell already uses
 * for its ℓ mark (the Newsreader Latin subset has no U+2113), stored as its outline so no font is needed at build time.
 */

/** STIX Two Math U+2113, font units (1000/em, y up), M/L/Q/Z only. OFL: public/fonts/v7/stixtwomath-OFL.txt. */
export const ELL_PATH = 'M18 249Q41 254 66 259.5Q91 265 117 272Q144 342 177.5 412.5Q211 483 249.5 541Q288 599 331.5 634.5Q375 670 421 670Q465 670 487 643.5Q509 617 509 572Q509 509 481 459.5Q453 410 406.5 372.5Q360 335 303 308Q246 281 188 263Q171 219 159 177Q147 135 147 97Q147 72 159 51Q171 30 196 30Q234 30 270 69Q306 108 362 190L386 173Q326 79 281.5 34.5Q237 -10 182 -10Q158 -10 133.5 -0.5Q109 9 93 35Q77 61 77 112Q77 140 85 172.5Q93 205 105 239Q58 228 22 222ZM414 625Q390 625 366.5 605Q343 585 322 553Q301 521 283 485Q265 449 251 416Q237 383 228 361L203 299Q270 323 328.5 359Q387 395 424 445Q461 495 461 562Q461 598 447 611.5Q433 625 414 625Z';
const ELL_BOUNDS = {x0: 18, y0: -10, x1: 509, y1: 670};

/** v7 palette (src/ui/v7/tokens.css): paper (page), ink (primary text), the brand indigo grid and ∎, the margin red. */
export const MARK_THEMES = {
 day: {page: '#F8F5F0', ink: '#121B31', brand: '#4246C2', margin: '#C86265'},
 night: {page: '#091023', ink: '#EEF2FA', brand: '#5159D7', margin: '#FF9D9E'},
};

/**
 * Layouts. `full` is the installed icon (64 px and up): a 48/1024 graph grid, the margin rule, the ℓ and the ∎.
 * `simple` is the favicon and anything under 64 px: a coarse 4 × 4 grid and a larger ℓ, without the margin rule or the
 * ∎ (the plan warns the grid vanishes and the ∎ reads as a bug at 32 px). All meaningful art of `full` (the ℓ and ∎)
 * stays inside the maskable safe zone, the central circle of radius 0.4.
 */
export const LAYOUTS = {
 full: {grid: 48 / 1024, gridAlpha: 0.12, margin: 0.215, ellHeight: 0.4, ellCentre: [0.5, 0.49], qed: [0.66, 0.632, 0.072]},
 simple: {grid: 0.25, gridAlpha: 0.22, margin: null, ellHeight: 0.66, ellCentre: [0.5, 0.5], qed: null},
};

/** Line widths in unit coordinates: the grid never thinner than 1 px, the margin rule never thinner than 1.5 px. */
export function strokes(size, layout = 'full') {
 const px = 1 / size;
 return {grid: Math.max(2 / 1024, px), margin: Math.max(4 / 1024, 1.5 * px)};
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
const gridLines = (step) => {const out = []; for (let v = step; v < 1 - 1e-9; v += step) out.push(v); return out;};

/**
 * Vector mark. `theme` is 'day', 'night' or 'auto' (a prefers-color-scheme media query switches the colours, Day
 * first). `background`: 'square' (full bleed) or 'rounded' (the favicon's page with 18% corners).
 */
export function markSvg({theme = 'day', layout = 'full', background = 'square', size = 1024} = {}) {
 const B = 1024, l = LAYOUTS[layout], w = strokes(size, layout);
 const css = (t) => `.p{fill:${t.page}}.i{fill:${t.ink}}.b{stroke:${t.brand}}.bf{fill:${t.brand}}.m{stroke:${t.margin}}`;
 const style = theme === 'auto' ? `<style>${css(MARK_THEMES.day)}@media (prefers-color-scheme: dark){${css(MARK_THEMES.night)}}</style>` : `<style>${css(MARK_THEMES[theme])}</style>`;
 const parts = [style];
 const radius = background === 'rounded' ? 0.18 * B : 0;
 if (radius) parts.push(`<clipPath id="page"><rect width="${B}" height="${B}" rx="${radius}"/></clipPath>`);
 parts.push(`<g${radius ? ' clip-path="url(#page)"' : ''}><rect class="p" width="${B}" height="${B}"/>`);
 const g = gridLines(l.grid).map((v) => f(v * B));
 parts.push(`<path class="b" stroke-opacity="${l.gridAlpha}" stroke-width="${f(w.grid * B)}" d="${g.map((v) => `M${v} 0V${B}M0 ${v}H${B}`).join('')}"/>`);
 if (l.margin !== null) parts.push(`<path class="m" stroke-opacity=".55" stroke-width="${f(w.margin * B)}" d="M${f(l.margin * B)} 0V${B}"/>`);
 parts.push(`<path class="i" d="${ellPathData(layout, B)}"/>`);
 if (l.qed) {const [x, y, q] = l.qed; parts.push(`<rect class="bf" x="${f(x * B)}" y="${f(y * B)}" width="${f(q * B)}" height="${f(q * B)}"/>`);}
 parts.push('</g>');
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${B} ${B}" width="${size}" height="${size}">${parts.join('')}</svg>\n`;
}

// ---------- raster ----------
const hex = (h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16));
const clamp = (x) => Math.max(0, Math.min(1, x));

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

/** Every part of the mark; `rasterMark({parts})` can draw a subset (N137 · G1: the adaptive icon's two layers). */
export const MARK_PARTS = {page: true, grid: true, margin: true, ell: true, qed: true};

/**
 * A pixel-accurate RGBA raster of `markSvg` with the same options; 'rounded' leaves the corners transparent. `parts`
 * picks what to draw: without `page` the paper is transparent and the other parts keep their own coverage as alpha.
 */
export function rasterMark({size, theme = 'day', layout = 'full', background = 'square', parts = MARK_PARTS}) {
 const want = {...MARK_PARTS, ...parts};
 const l = LAYOUTS[layout], w = strokes(size, layout), t = MARK_THEMES[theme];
 const page = hex(t.page), ink = hex(t.ink), brand = hex(t.brand), margin = hex(t.margin);
 const glyph = polygonCoverage(ellPolygons(layout), size);
 const out = new Uint8ClampedArray(size * size * 4), px = 1 / size, lines = gridLines(l.grid);
 const near = (v) => Math.min(...lines.map((g) => Math.abs(v - g)));
 for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
  const x = (i + 0.5) * px, y = (j + 0.5) * px;
  // Without the page, start from transparent and composite each part over it ("over", premultiplied).
  let rgb = want.page ? [...page] : [0, 0, 0], cover = want.page ? 1 : 0, alpha = 1;
  if (background === 'rounded') {
   const r = 0.18, qx = Math.max(Math.abs(x - 0.5) - (0.5 - r), 0), qy = Math.max(Math.abs(y - 0.5) - (0.5 - r), 0);
   alpha = clamp((r - Math.hypot(qx, qy)) / px + 0.5);
  }
  const paint = (colour, a) => {
   if (a <= 0) return;
   const next = a + cover * (1 - a);
   rgb = rgb.map((c, k) => (colour[k] * a + c * cover * (1 - a)) / next);
   cover = next;
  };
  const gridCover = Math.max(clamp((w.grid / 2 - near(x)) / px + 0.5), clamp((w.grid / 2 - near(y)) / px + 0.5));
  if (want.grid) paint(brand, l.gridAlpha * gridCover);
  if (want.margin && l.margin !== null) paint(margin, 0.55 * clamp((w.margin / 2 - Math.abs(x - l.margin)) / px + 0.5));
  if (want.ell) paint(ink, clamp(glyph[j * size + i]));
  if (want.qed && l.qed) {
   const [qx0, qy0, q] = l.qed;
   const qedCover = clamp(Math.min(x - qx0, qx0 + q - x) / px + 0.5) * clamp(Math.min(y - qy0, qy0 + q - y) / px + 0.5);
   paint(brand, qedCover);
  }
  const o = (j * size + i) * 4;
  out[o] = Math.round(rgb[0]); out[o + 1] = Math.round(rgb[1]); out[o + 2] = Math.round(rgb[2]); out[o + 3] = Math.round(alpha * cover * 255);
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
