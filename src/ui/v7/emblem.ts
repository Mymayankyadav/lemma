/**
 * Emblem system v3 (N166, after release plan R2 and audit F27): one mathematical object per subject family, drawn at
 * three tiers from the same seed, as a geometer would draw it in a notebook — ink lines only, no fills or gradients.
 *  - hero  (164–520 px): the rich version, at most 160 strokes, one focal stroke at full weight, the rest at 40–60%.
 *    Depth is drawn, not shaded: hidden lines are removed (a small depth buffer), nearer lines sit at 60%, farther at 40%.
 *  - tile  (40–159 px, path and plan cards): at most 24 strokes, the focal stroke plus simplified context.
 *  - glyph (16–39 px, subject marks in chips and lists): 1–3 strokes, a silhouette rather than a shrunken tile, and
 *    one that no other family shares.
 * The seed varies parameters within a family (which wave, which view of the solid, which (p, q), which multiplier, which
 * chain), never the family. Strokes are emitted in drawing order so a cover can draw itself in (A1); every path uses only
 * M, L, A and Z so `emblemExport.pathLength` can time it. Coordinates are a 200 × 200 box; art stays inside r = 92.
 */
export type EmblemKind = "radial-wave" | "icosahedron" | "torus-knot" | "multiplication-circle" | "euclid" | "hasse" | "markov" | "complete-graph" | "rose" | "compass";
export type EmblemTier = "hero" | "tile" | "glyph";
/** `width` is in CSS pixels (drawn with `vector-effect: non-scaling-stroke`). */
export type EmblemStroke = {d: string; opacity: number; width: number; focal?: true};

/** Maximum strokes per tier (the spec's budget; tests and the design lint hold every screen to it). */
export const TIER_LIMIT: Record<EmblemTier, number> = {hero: 160, tile: 24, glyph: 3};
/** Stroke rule: 1 px at tile, 1.25 px at hero, 1.7 px (1.6 at tile) for the focal stroke; glyph strokes 1.25 px. */
export const TIER_WIDTH: Record<EmblemTier, {base: number; focal: number}> = {hero: {base: 1.25, focal: 1.7}, tile: {base: 1, focal: 1.6}, glyph: {base: 1.25, focal: 1.25}};

/** The tier a rendered size uses. */
export function emblemTier(size: number): EmblemTier {
  return size >= 160 ? "hero" : size >= 40 ? "tile" : "glyph";
}

const cache = new Map<string, readonly EmblemStroke[]>();
export function emblemHash(s: string): number {let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0;}
export function emblemKind(subject: string): EmblemKind {
  const s = subject.toLowerCase();
  if (/analysis|calculus|measure/.test(s)) return "radial-wave";
  if (/number|prime|integer/.test(s)) return "multiplication-circle";
  if (/topology|manifold|knot/.test(s)) return "torus-knot";
  if (/geometry|euclid/.test(s)) return "euclid";
  if (/logic|boolean/.test(s)) return "hasse";
  if (/probability|statistics/.test(s)) return "markov";
  if (/combinatoric|counting|graph theory/.test(s)) return "complete-graph";
  if (/algebra|linear|matrix|group|ring/.test(s)) return "icosahedron";
  return "rose";
}

type P = [number, number];
type V3 = [number, number, number];
/** A projected point: screen x, screen y, depth (larger is nearer the viewer). */
type S = [number, number, number];

// ── Path writing ───────────────────────────────────────────────────────────────────────────────────────────────────
const n1 = (v: number) => {const r = Math.round(v * 10) / 10; return String(r === 0 ? 0 : r);};
const n2 = (v: number) => (Math.abs(v) < 0.005 ? 0 : v).toFixed(2);
/** Douglas–Peucker: drop points within `tol` of the chord, so dense samples cost nothing on screen. */
function simplify(points: readonly P[], tol = 0.12): P[] {
  if (points.length < 3) return points.slice();
  const keep = new Uint8Array(points.length); keep[0] = keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!, [ax, ay] = points[a], [bx, by] = points[b], dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1e-9;
    let worst = -1, far = 0;
    for (let i = a + 1; i < b; i++) {const d = Math.abs((points[i][0] - ax) * dy - (points[i][1] - ay) * dx) / len; if (d > far) {far = d; worst = i;}}
    if (far > tol && worst > 0) {keep[worst] = 1; stack.push([a, worst], [worst, b]);}
  }
  return points.filter((_, i) => keep[i]);
}
/** A polyline (implicit line-to after M), optionally closed. */
function path(points: readonly P[], close = false): string {
  const pts = simplify(points);
  let len = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return pts.length < 2 || len < 0.6 ? "" :"M" + pts.map(([x, y]) => n1(x) + " " + n1(y)).join(" ") + (close ? "Z" : "");
}
function circle(x: number, y: number, r: number): string {return "M" + n2(x + r) + " " + n2(y) + "a" + n2(r) + " " + n2(r) + " 0 1 0 " + n2(-2 * r) + " 0a" + n2(r) + " " + n2(r) + " 0 1 0 " + n2(2 * r) + " 0";}
/** A segment from a to b, trimmed by `ta` at a and `tb` at b (so edges stop at node rings). */
function segment(a: P, b: P, ta = 0, tb = ta): string {
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1e-9, ux = dx / len, uy = dy / len;
  if (len <= ta + tb + 0.5) return "";
  return path([[a[0] + ux * ta, a[1] + uy * ta], [b[0] - ux * tb, b[1] - uy * tb]]);
}
/** An open arrowhead (chevron) at `tip`, pointing along `dir`. */
function chevron(tip: P, dir: P, size: number): string {
  const len = Math.hypot(dir[0], dir[1]) || 1, ux = dir[0] / len, uy = dir[1] / len, back = size, side = size * 0.62;
  return path([[tip[0] - ux * back - uy * side, tip[1] - uy * back + ux * side], tip, [tip[0] - ux * back + uy * side, tip[1] - uy * back - ux * side]]);
}
/** Visible runs of a sampled curve as one multi-part path; isolated single samples are bridged or dropped. */
function runs(points: readonly P[], visible: readonly boolean[], minRun = 2): string {
  const vis = visible.slice();
  for (let i = 1; i < vis.length - 1; i++) if (!vis[i] && vis[i - 1] && vis[i + 1]) vis[i] = true;
  let d = "", run: P[] = [];
  const flush = () => {if (run.length >= minRun) d += path(run); run = [];};
  points.forEach((p, i) => {if (vis[i]) run.push(p); else flush();});
  flush();
  return d;
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clampOpacity = (o: number) => Math.min(0.6, Math.max(0.4, +o.toFixed(3)));
function seeded(h: number) {let x = h || 1; return () => {x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296;};}
const pick = <T,>(h: number, items: readonly T[], salt = 0): T => items[(h >>> salt) % items.length];

// ── A small depth buffer for hidden-line removal (surfaces only; lines are tested against it) ─────────────────────────
class DepthBuffer {
  private readonly res = 2; // cells per unit
  private readonly size = 240 * 2;
  private readonly z = new Float32Array(240 * 2 * 240 * 2).fill(-Infinity);
  private cell(v: number) {return Math.floor((v + 20) * this.res);}
  triangle(a: S, b: S, c: S) {
    const minX = Math.max(0, this.cell(Math.min(a[0], b[0], c[0]))), maxX = Math.min(this.size - 1, this.cell(Math.max(a[0], b[0], c[0])));
    const minY = Math.max(0, this.cell(Math.min(a[1], b[1], c[1]))), maxY = Math.min(this.size - 1, this.cell(Math.max(a[1], b[1], c[1])));
    const det = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
    if (Math.abs(det) < 1e-9) return;
    for (let gy = minY; gy <= maxY; gy++) for (let gx = minX; gx <= maxX; gx++) {
      const x = (gx + 0.5) / this.res - 20, y = (gy + 0.5) / this.res - 20;
      const l1 = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / det, l2 = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / det, l3 = 1 - l1 - l2;
      if (l1 < -0.02 || l2 < -0.02 || l3 < -0.02) continue;
      const depth = l1 * a[2] + l2 * b[2] + l3 * c[2], k = gy * this.size + gx;
      if (depth > this.z[k]) this.z[k] = depth;
    }
  }
  /** True when a point at this depth is not behind the surface (within `eps`). */
  visible([x, y, depth]: S, eps = 1.2): boolean {
    const gx = this.cell(x), gy = this.cell(y);
    if (gx < 0 || gy < 0 || gx >= this.size || gy >= this.size) return true;
    return depth >= this.z[gy * this.size + gx] - eps;
  }
}

// ── 3D helpers ─────────────────────────────────────────────────────────────────────────────────────────────────────
const rotX = (a: number) => ([x, y, z]: V3): V3 => [x, y * Math.cos(a) - z * Math.sin(a), y * Math.sin(a) + z * Math.cos(a)];
const rotY = (a: number) => ([x, y, z]: V3): V3 => [x * Math.cos(a) + z * Math.sin(a), y, -x * Math.sin(a) + z * Math.cos(a)];
const rotZ = (a: number) => ([x, y, z]: V3): V3 => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a), z];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a: V3): V3 => {const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l];};
/** Rotation taking unit vector `from` onto +z (towards the viewer). */
function alignToViewer(from: V3): (v: V3) => V3 {
  const a = unit(from), axis = cross(a, [0, 0, 1]), s = Math.hypot(...axis), c = a[2];
  if (s < 1e-9) return c > 0 ? (v) => v : rotX(Math.PI);
  const k = unit(axis);
  return (v) => {const kv = cross(k, v), kd = dot(k, v); return [v[0] * c + kv[0] * s + k[0] * kd * (1 - c), v[1] * c + kv[1] * s + k[1] * kd * (1 - c), v[2] * c + kv[2] * s + k[2] * kd * (1 - c)];};
}

/** A context stroke with its own opacity (clamped to the 40–60% rule). */
type Ctx = {d: string; o: number};

/** The mathematical construction for a family, at a tier. Deterministic, bounded, in drawing order. */
export function emblemStrokes(subject: string, seed: string, kind: EmblemKind = emblemKind(subject), tier: EmblemTier = "hero"): readonly EmblemStroke[] {
  const key = JSON.stringify([subject, seed, kind, tier]), existing = cache.get(key); if (existing) return existing;
  const h = emblemHash(seed), random = seeded(h), w = TIER_WIDTH[tier];
  const context: Ctx[] = []; let focal = "";
  const add = (d: string, o = 0.5) => {if (d) context.push({d, o});};
  const hero = tier === "hero", tile = tier === "tile", glyph = tier === "glyph";

  if (kind === "radial-wave") {
    // A radial standing wave z = cos(πmρ)(1 − δρ) on a disc: the seed picks the ripples, damping and viewing angle.
    // The focal stroke is the wave's profile through the centre — the same curve the tile and glyph draw flat.
    const m = pick(h, [2, 2.5, 2, 1.5]), damp = 0.15 + (h % 5) * 0.06, turn = ((h >>> 5) % 12) / 12 * Math.PI * 2;
    const wave = (rho: number) => Math.cos(Math.PI * m * rho) * (1 - damp * rho);
    if (hero) {
      const e = (26 + (h >>> 9) % 4 * 3) * Math.PI / 180, R = 84, H = 24, se = Math.sin(e), ce = Math.cos(e);
      const raw = (rho: number, phi: number): S => {const X = R * rho * Math.cos(phi), Y = R * rho * Math.sin(phi), Z = H * wave(rho); return [100 + X, Y * se - Z * ce, Y * ce + Z * se];};
      let top = Infinity, bottom = -Infinity;
      for (let i = 0; i <= 40; i++) for (let j = 0; j < 48; j++) {const [, y] = raw(i / 40, j / 48 * Math.PI * 2); top = Math.min(top, y); bottom = Math.max(bottom, y);}
      const cy = 100 - (top + bottom) / 2, at = (rho: number, phi: number): S => {const s = raw(rho, phi); return [s[0], s[1] + cy, s[2]];};
      const buf = new DepthBuffer(), NR = 30, NP = 90;
      for (let i = 0; i < NR; i++) for (let j = 0; j < NP; j++) {
        const r0 = i / NR, r1 = (i + 1) / NR, p0 = j / NP * Math.PI * 2, p1 = (j + 1) / NP * Math.PI * 2;
        const a = at(r0, p0), b = at(r1, p0), c = at(r1, p1), d = at(r0, p1);
        buf.triangle(a, b, c); buf.triangle(a, c, d);
      }
      const curve = (sample: (t: number) => S, n: number) => {const pts: P[] = [], vis: boolean[] = []; for (let k = 0; k <= n; k++) {const s = sample(k / n); pts.push([s[0], s[1]]); vis.push(buf.visible(s));} return runs(pts, vis);};
      const rings = 13;
      for (let k = rings; k >= 1; k--) add(curve((t) => at(k / rings, t * Math.PI * 2), 180), k === rings ? 0.6 : 0.5);
      const meridians = 36;
      for (let j = 0; j < meridians; j++) {
        const phi = turn / 6 + j / meridians * Math.PI * 2, start = j % 2 ? 0.16 : 0.02;
        add(curve((t) => at(start + (1 - start) * t, phi), 64), 0.5 + 0.1 * Math.sin(phi));
      }
      const profile = (sign: number) => curve((t) => at(t, sign > 0 ? 0 : Math.PI), 120);
      focal = profile(1) + profile(-1);
    } else {
      // Flat: the profile across the disc (it meets the circle at the rim), and on the tile a fainter later phase.
      const r = glyph ? 92 : 86, A = glyph ? 40 : 36, z1 = Math.abs(wave(1)), half = Math.sqrt(r * r - (A * z1) ** 2);
      const profile = (phase: number, n: number) => {const pts: P[] = []; for (let k = 0; k <= n; k++) {const x = -1 + 2 * k / n, rho = Math.abs(x); pts.push([100 + half * x, 100 - A * Math.cos(Math.PI * m * rho + phase) * (1 - damp * rho)]);} return path(pts);};
      add(circle(100, 100, r), 0.6);
      if (tile) add(profile(Math.PI / 2, 96), 0.4);
      focal = profile(0, glyph ? 64 : 120);
    }
  } else if (kind === "icosahedron") {
    // The icosahedron seen down one of its rotation axes (2-, 3- or 5-fold, by seed); the hero's arrows are that rotation.
    // Focal: the silhouette. Front edges at 60%; hidden edges are left out; faces turned from the light are hatched.
    const phi = (1 + Math.sqrt(5)) / 2;
    const base: V3[] = [];
    for (const a of [-1, 1]) for (const b of [-phi, phi]) base.push([0, a, b], [a, b, 0], [b, 0, a]);
    const order = glyph ? 3 : pick(h, [3, 5, 2, 3]);
    // Axes: through a vertex (5-fold), a face centre (3-fold) or an edge midpoint (2-fold).
    const axis: V3 = order === 5 ? base[0] : order === 3 ? [1, 1, 1] : [0, 0, 1];
    const toView = alignToViewer(axis), spin = rotZ(((h >>> 4) % 10) / 10 * Math.PI * 2 / order);
    const tilt = glyph ? 0 : (hero ? 0.16 + (h % 4) * 0.04 : 0.12), lean = rotX(-tilt), yaw = rotY(glyph ? 0 : 0.1);
    const verts = base.map((v) => yaw(lean(spin(toView(v)))));
    const s = hero ? 39 : glyph ? 50 : 43;
    const scr = (v: V3): P => [100 + s * v[0], 100 - s * v[1]];
    const edges: [number, number][] = [];
    for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) if (Math.abs(Math.hypot(...sub(verts[i], verts[j])) - 2) < 1e-6) edges.push([i, j]);
    const faces: [number, number, number][] = [];
    for (const [i, j] of edges) for (let k = j + 1; k < 12; k++) if (edges.some(([a, b]) => a === i && b === k) && edges.some(([a, b]) => a === j && b === k)) faces.push([i, j, k]);
    const normal = ([i, j, k]: [number, number, number]) => {let n = cross(sub(verts[j], verts[i]), sub(verts[k], verts[i])); const c = verts[i].map((_, q) => (verts[i][q] + verts[j][q] + verts[k][q]) / 3) as V3; if (dot(n, c) < 0) n = [-n[0], -n[1], -n[2]]; return unit(n);};
    const facing = faces.map((f) => normal(f)[2] > 1e-6);
    const front = edges.map(([a, b]) => faces.some((f, q) => facing[q] && f.includes(a) && f.includes(b)));
    if (hero) {
      // Engraving: faces turned from a light at upper left are hatched in one direction (30°), closer for darker faces;
      // faces seen nearly edge-on are left clear so slivers never turn into solid wedges.
      const light = unit([-0.5, 0.7, 0.6]), hd: P = [Math.cos(Math.PI / 6), -Math.sin(Math.PI / 6)], hn: P = [-hd[1], hd[0]];
      faces.forEach((f, q) => {
        const nrm = normal(f);
        if (!facing[q] || nrm[2] < 0.3) return;
        const shade = 1 - Math.max(0, dot(nrm, light)), gapAt = shade > 0.8 ? 4.8 : shade > 0.6 ? 6.4 : shade > 0.45 ? 9 : 0;
        if (!gapAt) return;
        const tri = f.map((i) => scr(verts[i])), proj = tri.map((p) => p[0] * hn[0] + p[1] * hn[1]);
        let d = "";
        for (let c = Math.ceil(Math.min(...proj) / gapAt) * gapAt; c < Math.max(...proj); c += gapAt) {
          const hits: P[] = [];
          for (let e = 0; e < 3; e++) {const a = tri[e], b = tri[(e + 1) % 3], pa = proj[e], pb = proj[(e + 1) % 3]; if ((pa - c) * (pb - c) < 0) {const t = (c - pa) / (pb - pa); hits.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t)]);}}
          if (hits.length === 2) d += segment(hits[0], hits[1], 1.8);
        }
        add(d, 0.4);
      });
      // The rotation: `order` arcs round the solid, each ending in an open arrowhead.
      const R = 86, gap = order === 2 ? 0.5 : 0.36, offset = -Math.PI / 2 + ((h >>> 7) % 7) / 7 * 0.4;
      for (let k = 0; k < order; k++) {
        const a0 = offset + k * 2 * Math.PI / order + gap / 2, a1 = offset + (k + 1) * 2 * Math.PI / order - gap / 2, pts: P[] = [];
        for (let i = 0; i <= 48; i++) {const a = lerp(a0, a1, i / 48); pts.push([100 + R * Math.cos(a), 100 + R * Math.sin(a)]);}
        add(path(pts) + chevron(pts[48], [-Math.sin(a1), Math.cos(a1)], 5.5), 0.55);
      }
    }
    if (glyph) add(edges.filter((_, q) => front[q]).map(([a, b]) => segment(scr(verts[a]), scr(verts[b]))).join(""));
    else edges.forEach(([a, b], q) => {if (front[q]) add(segment(scr(verts[a]), scr(verts[b])), 0.6);});
    // Silhouette: the convex hull of the projected vertices.
    const pts = verts.map(scr).sort((p, q) => p[0] - q[0] || p[1] - q[1]), hull: P[] = [];
    const turnSign = (o: P, a: P, b: P) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    for (const half of [pts, pts.slice().reverse()]) {const start = hull.length; for (const p of half) {while (hull.length >= start + 2 && turnSign(hull[hull.length - 2], hull[hull.length - 1], p) <= 1e-9) hull.pop(); hull.push(p);} hull.pop();}
    focal = path(hull, true);
  } else if (kind === "torus-knot") {
    // A (2, q) torus knot as a tube in plan, with true over- and under-crossings: the seed picks q (3 or 5) and the turn.
    // The tube is drawn as lines along it (spaced as a cylinder foreshortens) and rings across it; focal: the core.
    // In the plane the (2, q) torus knot is the two-circle epicycle w = e^{i(q−2)t} − 2e^{−2it} (q = 3: the classic
    // trefoil), lifted by sin(qt) so the crossings alternate.
    const q = glyph ? 3 : pick(h, [3, 3, 5, 3]), N = glyph ? 360 : 540;
    const turn = ((h >>> 3) % 12) / 12 * Math.PI * 2 / q, scale = 84 / 3, ct = Math.cos(turn), st = Math.sin(turn);
    const core: S[] = [];
    for (let i = 0; i < N; i++) {
      const t = i / N * Math.PI * 2, u = Math.cos((q - 2) * t) - 2 * Math.cos(2 * t), v = Math.sin((q - 2) * t) + 2 * Math.sin(2 * t);
      core.push([100 + scale * (u * st + v * ct), 100 - scale * (u * ct - v * st), 30 * Math.sin(q * t)]);
    }
    const normals: P[] = core.map((_, i) => {const n = core[(i + 1) % N], b = core[(i - 1 + N) % N], dx = n[0] - b[0], dy = n[1] - b[1], l = Math.hypot(dx, dy) || 1; return [-dy / l, dx / l];});
    const tube = glyph ? 0 : hero ? 9 : 8, gap = glyph ? 11 : 3.2, reach = (tube || 0) + gap;
    // Spatial hash of core samples for the crossing test.
    const grid = new Map<number, number[]>(), cellOf = (x: number, y: number) => Math.floor(x / 12) * 1000 + Math.floor(y / 12);
    core.forEach(([x, y], i) => {const k = cellOf(x, y); (grid.get(k) ?? grid.set(k, []).get(k)!).push(i);});
    const hidden = (x: number, y: number, i: number) => {
      const z = core[i][2];
      for (let gx = -1; gx <= 1; gx++) for (let gy = -1; gy <= 1; gy++) for (const j of grid.get(cellOf(x, y) + gx * 1000 + gy) ?? []) {
        const apart = Math.min(Math.abs(i - j), N - Math.abs(i - j));
        if (apart > N / 24 && core[j][2] > z + 1 && Math.hypot(core[j][0] - x, core[j][1] - y) < reach) return true;
      }
      return false;
    };
    const along = (offset: number) => {const pts: P[] = [], vis: boolean[] = []; for (let i = 0; i <= N; i++) {const k = i % N, x = core[k][0] + normals[k][0] * offset, y = core[k][1] + normals[k][1] * offset; pts.push([x, y]); vis.push(!hidden(x, y, k));} return runs(pts, vis);};
    if (hero) {
      // Rings across the tube first (faint), then the lines along it, edges strongest.
      const rings = 96;
      let ringPaths = "";
      for (let r = 0; r < rings; r++) {
        const k = Math.round(r * N / rings), pts: P[] = [], vis: boolean[] = [];
        for (let u = 0; u <= 8; u++) {const o = -tube + 2 * tube * u / 8, x = core[k][0] + normals[k][0] * o, y = core[k][1] + normals[k][1] * o; pts.push([x, y]); vis.push(!hidden(x, y, k));}
        ringPaths += runs(pts, vis);
        if (r % 8 === 7) {add(ringPaths, 0.4); ringPaths = "";}
      }
      for (const th of [-60, -35, -12, 12, 35, 60]) add(along(tube * Math.sin(th * Math.PI / 180)), 0.45);
      add(along(-tube), 0.6); add(along(tube), 0.6);
    } else if (tile) {add(along(-tube), 0.6); add(along(tube), 0.6);}
    focal = along(0);
  } else if (kind === "multiplication-circle") {
    // The times-k table mod n on a circle: chord i → k·i. Its envelope is the epicycloid with k − 1 cusps (k = 2: the
    // cardioid). Hero and tile let the envelope emerge from chords; the glyph draws the envelope itself.
    const k = glyph ? 2 : pick(h, [2, 3, 4, 5, 7]), r = glyph ? 80 : 86, turn = glyph ? -Math.PI / 2 : ((h >>> 6) % 8) / 8 * Math.PI * 2 / Math.max(1, k - 1);
    const ang = (i: number, n: number) => 2 * Math.PI * i / n - Math.PI / 2 + turn;
    const pt = (a: number): P => [100 + r * Math.cos(a), 100 + r * Math.sin(a)];
    if (glyph) {
      const env: P[] = [];
      for (let i = 0; i <= 160; i++) {const a = ang(i, 160), b = k * (a + Math.PI / 2 - turn) - Math.PI / 2 + turn; env.push([100 + r * (k * Math.cos(a) + Math.cos(b)) / (k + 1), 100 + r * (k * Math.sin(a) + Math.sin(b)) / (k + 1)]);}
      // The cardioid, set a little inside its circle so the two lines stay apart at 20 px.
      add(path(env, true));
      focal = circle(100, 100, 98);
    } else {
      const n = hero ? 96 + (h % 4) * 24 : 32, bands = hero ? 6 : 3;
      const chords: {d: string; len: number}[] = [];
      for (let i = 1; i < n; i++) {const j = (k * i) % n; if (j !== i) {const A = pt(ang(i, n)), B = pt(ang(j, n)); chords.push({d: path([A, B]), len: Math.hypot(A[0] - B[0], A[1] - B[1])});}}
      // Short chords crowd the envelope: drawn first and strongest; long chords cross the middle at 40%.
      chords.sort((x, y) => x.len - y.len);
      for (let b = 0; b < bands; b++) add(chords.slice(Math.floor(b * chords.length / bands), Math.floor((b + 1) * chords.length / bands)).map((c) => c.d).join(""), (hero ? 0.6 : 0.52) - (hero ? 0.2 : 0.12) * b / (bands - 1));
      if (hero) {let ticks = ""; for (let i = 0; i < n; i++) {const a = ang(i, n), o = i % 12 === 0 ? 7 : 3.5; ticks += path([[100 + (r + 1.5) * Math.cos(a), 100 + (r + 1.5) * Math.sin(a)], [100 + (r + 1.5 + o) * Math.cos(a), 100 + (r + 1.5 + o) * Math.sin(a)]]);} add(ticks, 0.5);}
      focal = circle(100, 100, r);
    }
  } else if (kind === "euclid") {
    // Euclid I.1: on a segment AB, circles about A and B meet at C; ABC is equilateral. The hero carries the
    // construction on (I.1 again on each side) until the hexagonal lattice of compass points appears.
    const rot = glyph ? 0 : ((h % 7) - 3) * Math.PI / 36, r = glyph ? 58 : hero ? 52 : 52;
    const R = (p: P): P => [100 + (p[0] - 100) * Math.cos(rot) - (p[1] - 100) * Math.sin(rot), 100 + (p[0] - 100) * Math.sin(rot) + (p[1] - 100) * Math.cos(rot)];
    const lift = glyph ? 17 : hero ? 0 : 15, alt = r * Math.sqrt(3) / 2;
    const A = R([100 - r / 2, 100 + lift]), B = R([100 + r / 2, 100 + lift]), C = R([100, 100 + lift - alt]), D = R([100, 100 + lift + alt]);
    const dot = (p: P, rr: number) => circle(p[0], p[1], rr);
    if (glyph) {add(circle(A[0], A[1], r) + circle(B[0], B[1], r)); focal = path([A, B, C], true);}
    else if (tile) {
      add(circle(A[0], A[1], r), 0.45); add(circle(B[0], B[1], r), 0.45);
      add(segment(R([100 - r / 2 - r, 100 + lift]), R([100 + r / 2 + r, 100 + lift])), 0.6);
      add(dot(A, 3) + dot(B, 3) + dot(C, 3), 0.6);
      focal = path([A, B, C], true);
    } else {
      const E = R([100 - r / 2 - r, 100]), F = R([100 + r / 2 + r, 100]);
      // The lattice: A, B, C, D and the outer points of the hexagon about the midpoint of AB.
      const lattice: P[] = [A, B, C, D, R([100 - r, 100 - alt]), R([100 + r, 100 - alt]), R([100 - r, 100 + alt]), R([100 + r, 100 + alt]), E, F];
      add(circle(A[0], A[1], r), 0.5); add(circle(B[0], B[1], r), 0.5);
      add(segment(E, F), 0.6);
      add(path([A, D, B]), 0.5);
      add(path([A, lattice[4], C]) + path([B, lattice[5], C]), 0.45);
      add(path([A, lattice[6], D]) + path([B, lattice[7], D]), 0.4);
      add(path([C, D]), 0.4);
      add(lattice.map((p, i) => dot(p, i < 3 ? 3 : 2.2)).join(""), 0.6);
      focal = path([A, B, C], true);
    }
  } else if (kind === "hasse") {
    // The Boolean lattice of subsets (its Hasse diagram, ∅ at the foot): B₃ — a cube on its corner — or, on the hero by
    // seed, B₄; the glyph is B₂. Edges stop at the nodes; edges adding the same element share an opacity, so the cube's parallels show.
    // Focal: one maximal chain ∅ ⊂ … ⊂ whole set, chosen by the seed, with its nodes.
    const size = hero && h % 2 ? 4 : 3, count = 1 << size;
    const xs = size === 4 ? [-1.6, -0.6, 0.35, 1.85] : [-1, 0, 1];
    const span = glyph ? 168 : hero ? 168 : 156, sx = (glyph ? 80 : 76) / (size === 4 ? 2.2 : 1), sy = span / size;
    const pos: P[] = [];
    for (let s = 0; s < count; s++) {let x = 0, y = 0; for (let b = 0; b < size; b++) if (s & (1 << b)) {x += xs[b]; y += 1;} pos.push([100 + x * sx, 100 + span / 2 - y * sy]);}
    const node = glyph ? 0 : hero ? (size === 4 ? 4.2 : 5.5) : 6.5, trim = node ? node + 2.2 : 0;
    if (glyph) {
      // B₂ — ∅, {a}, {b}, {a, b} — as a diamond of four rings: at 20 px B₃'s hexagon would read as Algebra's solid.
      const gn = 16, d2: P[] = [[100, 188], [14, 100], [186, 100], [100, 12]];
      add([[0, 1], [0, 2], [1, 3], [2, 3]].map(([a, b]) => segment(d2[a], d2[b], gn + 8)).join(""));
      add(d2.map(([x, y]) => circle(x, y, gn)).join(""));
    } else {
      for (let b = 0; b < size; b++) {
        let d = "";
        for (let s = 0; s < count; s++) if (!(s & (1 << b))) d += segment(pos[s], pos[s | (1 << b)], trim);
        add(d, 0.4 + 0.2 * b / (size - 1));
      }
      add(pos.map(([x, y]) => circle(x, y, node)).join(""), 0.6);
    }
    const order = Array.from({length: size}, (_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {const j = Math.floor(random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]];}
    const chain = [0]; let acc = 0;
    for (const bit of order) {acc |= 1 << bit; chain.push(acc);}
    if (!glyph) focal = chain.slice(1).map((s, i) => segment(pos[chain[i]], pos[s], trim)).join("") + chain.map((s) => circle(pos[s][0], pos[s][1], node)).join("");
  } else if (kind === "markov") {
    // A Markov chain on n states (by seed): forward transitions round the ring are focal, backward ones bow inwards,
    // self-loops sit outside, and the hero adds a few longer jumps. The glyph is the two-state chain.
    const n = glyph ? 2 : hero ? pick(h, [4, 5, 6, 5]) : pick(h, [3, 4, 3]), R = glyph ? 66 : hero ? 60 : 64, node = glyph ? 26 : hero ? 9 : 13;
    const start = glyph ? Math.PI : -Math.PI / 2 + ((h >>> 3) % 6) / 6 * 2 * Math.PI / n;
    const c: P[] = Array.from({length: n}, (_, i): P => [100 + R * Math.cos(start + 2 * Math.PI * i / n), 100 + R * Math.sin(start + 2 * Math.PI * i / n)]);
    const head = glyph ? 13 : hero ? 5 : 7;
    // A transition from i to j: a circular-ish arc (quadratic) leaving i's ring and landing on j's ring with a chevron.
    const arc = (i: number, j: number, bow: number) => {
      const a = c[i], b = c[j], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
      const ctrl: P = [mx - dy / len * bow, my + dx / len * bow], gapOf = node + (glyph ? 6 : 3);
      const bez = (t: number): P => [(1 - t) ** 2 * a[0] + 2 * (1 - t) * t * ctrl[0] + t * t * b[0], (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * ctrl[1] + t * t * b[1]];
      const pts: P[] = []; for (let k = 0; k <= 64; k++) {const p = bez(k / 64); if (Math.hypot(p[0] - a[0], p[1] - a[1]) > gapOf && Math.hypot(p[0] - b[0], p[1] - b[1]) > gapOf) pts.push(p);}
      if (pts.length < 2) return "";
      const tip = pts[pts.length - 1], prev = pts[pts.length - 3] ?? pts[0];
      return path(pts) + chevron(tip, [tip[0] - prev[0], tip[1] - prev[1]], head);
    };
    const loop = (i: number) => {
      const a = c[i], out = Math.atan2(a[1] - 100, a[0] - 100), lr = node * 0.95, cx = a[0] + Math.cos(out) * (node + lr * 0.5), cy = a[1] + Math.sin(out) * (node + lr * 0.5), pts: P[] = [];
      for (let k = 0; k <= 64; k++) {const t = out + Math.PI * 0.85 - k / 64 * Math.PI * 1.7, p: P = [cx + lr * Math.cos(t), cy + lr * Math.sin(t)]; if (Math.hypot(p[0] - a[0], p[1] - a[1]) > node + 2.5) pts.push(p);}
      if (pts.length < 2) return "";
      const tip = pts[pts.length - 1], prev = pts[pts.length - 3] ?? pts[0];
      return path(pts) + chevron(tip, [tip[0] - prev[0], tip[1] - prev[1]], head * 0.8);
    };
    if (glyph) {
      add(circle(c[0][0], c[0][1], node) + circle(c[1][0], c[1][1], node));
      add(arc(0, 1, 34) + arc(1, 0, 34));
    } else {
      const bowOut = R * 2 * Math.sin(Math.PI / n) * 0.22;
      if (hero) for (let i = 0; i < n; i++) if (random() < 0.5 && n > 3) add(arc(i, (i + 2) % n, 6), 0.4);
      for (let i = 0; i < n; i++) add(arc((i + 1) % n, i, -bowOut * 0.55), 0.45);
      for (let i = 0; i < n; i++) add(loop(i), 0.5);
      add(c.map(([x, y]) => circle(x, y, node)).join(""), 0.6);
      focal = c.map((_, i) => arc(i, (i + 1) % n, -bowOut)).join("");
    }
  } else if (kind === "complete-graph") {
    // The complete graph Kₙ (n by seed): edges grouped by how far round they reach, shorter ones stronger; edges stop at
    // the nodes. Focal: the Hamiltonian cycle (the polygon) with its nodes. The glyph is K₅ drawn as its convex hull
    // and its five diagonals (a K₆ wheel would share Algebra's and Logic's hexagon at 20 px).
    const n = glyph ? 5 : hero ? pick(h, [7, 8, 9, 8]) : pick(h, [6, 7, 6]), r = glyph ? 96 : hero ? 84 : 80;
    const turn = glyph ? 0 : (h % 13) / 13 * 2 * Math.PI / n, node = glyph ? 0 : hero ? 4.4 : 6, trim = node ? node + 2 : 0;
    const v = Array.from({length: n}, (_, i): P => [100 + r * Math.cos(turn + 2 * Math.PI * i / n - Math.PI / 2), 100 + r * Math.sin(turn + 2 * Math.PI * i / n - Math.PI / 2)]);
    const steps = Math.floor(n / 2);
    if (glyph) {
      // K₅: the pentagon and its five diagonals — the one star in the set, so it never reads as another family.
      add(path([0, 2, 4, 1, 3].map((i) => v[i]), true));
      focal = path(v, true);
    } else {
      for (let s = steps; s >= 2; s--) {
        if (hero) {for (let i = 0; i < n; i++) {const j = (i + s) % n; if (s * 2 === n && i >= n / 2) continue; add(segment(v[i], v[j], trim), 0.6 - 0.2 * (s - 2) / Math.max(1, steps - 2));}}
        else add(Array.from({length: s * 2 === n ? n / 2 : n}, (_, i) => segment(v[i], v[(i + s) % n], trim)).join(""), 0.6 - 0.2 * (s - 2) / Math.max(1, steps - 2));
      }
      focal = v.map((p, i) => segment(p, v[(i + 1) % n], trim)).join("") + v.map(([x, y]) => circle(x, y, node)).join("");
    }
  } else if (kind === "compass") {
    // The Lemma mark's construction (sign-in): a circle drawn by a compass, with its arm and construction line.
    const r = 88, angle = -Math.PI / 4;
    add(path([[100 - r, 100], [100 + r, 100]]), 0.4);
    add(path([[100, 100], [100 + r * Math.cos(angle), 100 + r * Math.sin(angle)]]), 0.47);
    add(circle(100, 100, 3), 0.53); add(circle(100 + r * Math.cos(angle), 100 + r * Math.sin(angle), 4), 0.6);
    focal = circle(100, 100, r);
  } else {
    // A rose r = cos(kθ); the seed picks k. The hero draws the petals as a ribbon (nested roses) inside the guide circle.
    const k = pick(h, [3, 4, 5, 7]), rose = (scale: number, samples: number, twist = 0) => {
      const pts: P[] = []; const R = (glyph ? 94 : 86) * scale;
      for (let i = 0; i <= samples; i++) {const a = i * 2 * Math.PI / samples, rr = R * Math.cos(k * a); pts.push([100 + rr * Math.cos(a + twist), 100 + rr * Math.sin(a + twist)]);}
      return path(pts, true);
    };
    if (!glyph) add(circle(100, 100, 88), 0.4);
    if (hero) for (const [s, o] of [[0.52, 0.4], [0.6, 0.42], [0.68, 0.45], [0.76, 0.5], [0.84, 0.55], [0.92, 0.6]] as const) add(rose(s, 360), o);
    if (tile) add(rose(0.66, 240), 0.55);
    focal = rose(1, glyph ? 200 : 360);
  }

  const limit = TIER_LIMIT[tier] - 1, kept = context.slice(0, limit);
  const strokes: EmblemStroke[] = kept.map(({d, o}) => ({d, width: w.base, opacity: glyph ? 1 : clampOpacity(o)}));
  if (focal) strokes.push({d: focal, width: w.focal, opacity: 1, focal: true});
  if (cache.size >= 256) cache.delete(cache.keys().next().value!);
  cache.set(key, strokes);
  return strokes;
}
