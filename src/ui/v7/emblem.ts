/**
 * Emblem system v2 (release plan R2, audit F27): one mathematical object per subject family, drawn at three tiers
 * from the same seed.
 *  - hero  (164–520 px): the rich version, at most 160 strokes, one focal stroke at full weight, the rest at 40–60%.
 *  - tile  (40–159 px, path and plan cards): at most 24 strokes, the focal stroke plus simplified context.
 *  - glyph (16–39 px, subject marks in chips and lists): 1–3 strokes, a silhouette rather than a shrunken tile.
 * The seed varies parameters within a family (which partial sums, which (p, q), which modulus, which rotation), never
 * the family. Strokes are emitted in drawing order so a cover can draw itself in (A1). Coordinates are a 200 × 200 box.
 */
export type EmblemKind = "partial-sums" | "mapped-plane" | "torus-knot" | "multiplication-circle" | "euclid" | "hasse" | "galton" | "complete-graph" | "rose" | "compass";
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
  if (/analysis|calculus|measure/.test(s)) return "partial-sums";
  if (/number|prime|integer/.test(s)) return "multiplication-circle";
  if (/topology|manifold|knot/.test(s)) return "torus-knot";
  if (/geometry|euclid/.test(s)) return "euclid";
  if (/logic|boolean/.test(s)) return "hasse";
  if (/probability|statistics/.test(s)) return "galton";
  if (/combinatoric|counting|graph theory/.test(s)) return "complete-graph";
  if (/algebra|linear|matrix|group|ring/.test(s)) return "mapped-plane";
  return "rose";
}

type P = [number, number];
const n2 = (v: number) => (Math.abs(v) < 0.005 ? 0 : v).toFixed(2);
function path(points: readonly P[], close = false): string {return points.map(([x, y], i) => (i ? "L" : "M") + n2(x) + " " + n2(y)).join("") + (close ? "Z" : "");}
function circle(x: number, y: number, r: number): string {return "M" + n2(x + r) + " " + n2(y) + "a" + n2(r) + " " + n2(r) + " 0 1 0 " + n2(-2 * r) + " 0a" + n2(r) + " " + n2(r) + " 0 1 0 " + n2(2 * r) + " 0";}
function seeded(h: number) {let x = h || 1; return () => {x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296;};}
const pick = <T,>(h: number, items: readonly T[], salt = 0): T => items[(h >>> salt) % items.length];
const rotate = (theta: number) => ([x, y]: P): P => [100 + (x - 100) * Math.cos(theta) - (y - 100) * Math.sin(theta), 100 + (x - 100) * Math.sin(theta) + (y - 100) * Math.cos(theta)];

/** The mathematical construction for a family, at a tier. Deterministic, bounded, in drawing order. */
export function emblemStrokes(subject: string, seed: string, kind: EmblemKind = emblemKind(subject), tier: EmblemTier = "hero"): readonly EmblemStroke[] {
  const key = JSON.stringify([subject, seed, kind, tier]), existing = cache.get(key); if (existing) return existing;
  const h = emblemHash(seed), random = seeded(h), w = TIER_WIDTH[tier];
  const context: string[] = []; let focal = "";
  const add = (d: string) => context.push(d);
  const hero = tier === "hero", tile = tier === "tile";

  if (kind === "partial-sums") {
    // Fourier partial sums of a square wave; the seed picks how many terms and the phase.
    const top = pick(h, [7, 9, 11, 13]), phase = (h % 7) / 7 * Math.PI / 2, amp = 40;
    const curve = (n: number, samples: number) => {
      const pts: P[] = [];
      for (let j = 0; j <= samples; j++) {const x = phase - 2 * Math.PI + j * 4 * Math.PI / samples; let y = 0; for (let k = 1; k <= n; k += 2) y += Math.sin(k * x) / k; pts.push([j * 200 / samples, 100 - amp * 4 / Math.PI * y]);}
      return path(pts);
    };
    if (tier === "glyph") {add(path([[0, 100], [200, 100]])); focal = curve(3, 48);}
    else {
      add(path([[0, 100], [200, 100]]));
      const sums = hero ? Array.from({length: (top - 1) / 2}, (_, i) => 2 * i + 1) : [1, 3];
      for (const n of sums) add(curve(n, hero ? 200 : 96));
      focal = curve(top, hero ? 240 : 120);
    }
  } else if (kind === "mapped-plane") {
    // A unit grid under a linear map; the seed picks the shear and rotation. Focal: the dominant eigenvector line.
    const shear = 0.3 + (h % 5) * 0.1, theta = ((h >>> 3) % 9 - 4) * 0.06;
    const m = [1.1 * Math.cos(theta) - 0.2 * Math.sin(theta), shear * Math.cos(theta) - 0.9 * Math.sin(theta), 1.1 * Math.sin(theta) + 0.2 * Math.cos(theta), shear * Math.sin(theta) + 0.9 * Math.cos(theta)];
    const map = ([x, y]: P): P => [100 + m[0] * x + m[1] * y, 100 + m[2] * x + m[3] * y];
    const lines = hero ? [-4, -3, -2, -1, 0, 1, 2, 3, 4] : tile ? [-4, -2, 0, 2, 4] : [];
    const step = 17;
    if (hero) for (const i of lines) {add(path([[100 + i * step, 32], [100 + i * step, 168]])); add(path([[32, 100 + i * step], [168, 100 + i * step]]));}
    for (const i of lines) {add(path([map([i * step, -68]), map([i * step, 68])])); add(path([map([-68, i * step]), map([68, i * step])]));}
    if (tier === "glyph") add(path([map([-50, -50]), map([50, -50]), map([50, 50]), map([-50, 50])], true));
    const tr = m[0] + m[3], det = m[0] * m[3] - m[1] * m[2], disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
    const eigen = tr / 2 + disc, angle = Math.atan2(eigen - m[0], m[1] || 1e-6);
    focal = path([[100 - 96 * Math.cos(angle), 100 - 96 * Math.sin(angle)], [100 + 96 * Math.cos(angle), 100 + 96 * Math.sin(angle)]]);
  } else if (kind === "torus-knot") {
    // A (p, q) torus knot seen obliquely; the seed picks (p, q) and the view angle. Focal: the knot's core.
    const [p, q] = pick(h, [[2, 3], [2, 5], [3, 4], [3, 5], [2, 7]] as const), tilt = 0.5 + (h % 5) * 0.05;
    const knot = (offset: number, samples: number) => {
      const pts: P[] = [];
      for (let j = 0; j <= samples; j++) {const t = j * 2 * Math.PI / samples, tube = 24 + offset, r = 52 + tube * Math.cos(q * t);
        pts.push([100 + r * Math.cos(p * t), 100 + 0.7 * r * Math.sin(p * t) + tilt * tube * Math.sin(q * t)]);}
      return path(pts);
    };
    const offsets = hero ? [-7, -5, -3, 3, 5, 7] : tile ? [-5, 5] : [];
    for (const o of offsets) add(knot(o, hero ? 360 : 180));
    focal = knot(0, tier === "glyph" ? 120 : 360);
  } else if (kind === "multiplication-circle") {
    // The times-k table mod n on a circle; the seed picks k and n. Focal: the circle itself.
    const k = pick(h, [2, 3, 4, 5, 7]), n = hero ? 90 + (h % 4) * 15 : tile ? 23 : 9, r = 88;
    const pt = (i: number): P => [100 + r * Math.cos(2 * Math.PI * i / n - Math.PI / 2), 100 + r * Math.sin(2 * Math.PI * i / n - Math.PI / 2)];
    focal = circle(100, 100, r);
    const chords: string[] = [];
    for (let i = 1; i < n; i++) {const j = (k * i) % n; if (j !== i) chords.push(path([pt(i), pt(j)]));}
    if (tier === "glyph") add(chords.join(""));
    else for (const c of chords.slice(0, TIER_LIMIT[tier] - 1)) add(c);
  } else if (kind === "euclid") {
    // Euclid I.1: an equilateral triangle on a segment from two circles; the seed rotates the construction.
    const rot = rotate(((h % 12) - 6) * Math.PI / 36), r = 62, a: P = [100 - r / 2, 118], b: P = [100 + r / 2, 118], c: P = [100, 118 - r * Math.sqrt(3) / 2];
    const ra = rot(a), rb = rot(b), rc = rot(c);
    if (tier === "glyph") add(circle(ra[0], ra[1], r) + circle(rb[0], rb[1], r));
    else {
      add(circle(ra[0], ra[1], r)); add(circle(rb[0], rb[1], r));
      add(path([rot([a[0] - r, a[1]]), rot([b[0] + r, b[1]])]));
      for (const v of [ra, rb, rc]) add(circle(v[0], v[1], 2.5));
      if (hero) {
        // The construction repeated outward on each side, fainter (I.1 applied again).
        for (const [u, v] of [[a, c], [c, b], [b, a]] as [P, P][]) {
          const mx = (u[0] + v[0]) / 2, my = (u[1] + v[1]) / 2, dx = v[0] - u[0], dy = v[1] - u[1];
          const apex: P = [mx + dy * Math.sqrt(3) / 2, my - dx * Math.sqrt(3) / 2];
          add(path([rot(u), rot(apex), rot(v)]));
          add(circle(...rot(apex), 2));
        }
        const below: P = [100, 118 + r * Math.sqrt(3) / 2];
        add(path([rot(a), rot(below), rot(b)]));
      }
    }
    focal = path([ra, rb, rc], true);
  } else if (kind === "hasse") {
    // The Hasse diagram of subsets of a 3- or 4-set; the seed picks the size and the highlighted maximal chain.
    const size = hero && h % 2 ? 4 : 3, count = 1 << size, rows: number[][] = Array.from({length: size + 1}, () => []);
    for (let s = 0; s < count; s++) rows[bits(s)].push(s);
    const pos = new Map<number, P>();
    rows.forEach((row, level) => row.forEach((s, i) => pos.set(s, [100 + (i - (row.length - 1) / 2) * (size === 4 ? 30 : 55), 175 - level * (150 / size)])));
    if (tier === "glyph") {
      add(path([pos.get(0)!, pos.get(1)!, pos.get(3)!, pos.get(7)!, pos.get(6)!, pos.get(4)!], true));
      add(path([pos.get(0)!, pos.get(2)!, pos.get(7)!]));
    } else {
      for (let s = 0; s < count; s++) for (let bit = 0; bit < size; bit++) if (!(s & (1 << bit))) add(path([pos.get(s)!, pos.get(s | (1 << bit))!]));
      if (hero) for (const [, [x, y]] of pos) add(circle(x, y, 4));
      else add(Array.from(pos.values()).map(([x, y]) => circle(x, y, 3.5)).join(""));
    }
    const order = Array.from({length: size}, (_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {const j = Math.floor(random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]];}
    const chain: P[] = [pos.get(0)!]; let acc = 0;
    for (const bit of order) {acc |= 1 << bit; chain.push(pos.get(acc)!);}
    if (tier !== "glyph") focal = path(chain);
  } else if (kind === "galton") {
    // A Galton board's ball paths over a normal curve; the seed drives the walks and the curve's spread.
    const rows = 8, sigma = 26 + (h % 5) * 2;
    const bell: P[] = []; for (let x = 20; x <= 180; x += 4) bell.push([x, 176 - 92 * Math.exp(-((x - 100) ** 2) / (2 * sigma * sigma))]);
    add(path([[20, 176], [180, 176]]));
    if (hero) {
      add(Array.from({length: rows}, (_, r) => Array.from({length: r + 1}, (_, k) => circle(100 + (k - r / 2) * 16, 24 + r * 16, 1.2)).join("")).join(""));
      for (let i = 0; i < 120; i++) {const pts: P[] = [[100, 16]]; let x = 100; for (let k = 0; k < rows; k++) {x += (random() > 0.5 ? 1 : -1) * 8; pts.push([x, 24 + k * 16 + 16]);} add(path(pts));}
    } else if (tile) {
      for (let k = 0; k <= rows; k++) {const x = 100 + (k - rows / 2) * 16, hgt = 92 * Math.exp(-((x - 100) ** 2) / (2 * sigma * sigma)); add(path([[x - 6, 176], [x - 6, 176 - hgt], [x + 6, 176 - hgt], [x + 6, 176]]));}
      for (let i = 0; i < 6; i++) {const pts: P[] = [[100, 16]]; let x = 100; for (let k = 0; k < rows; k++) {x += (random() > 0.5 ? 1 : -1) * 8; pts.push([x, 24 + k * 12]);} add(path(pts));}
    }
    focal = path(bell);
  } else if (kind === "complete-graph") {
    // The complete graph K_n; the seed picks n and the rotation. Focal: its Hamiltonian cycle (the polygon).
    const n = hero ? pick(h, [6, 7, 8, 9]) : tile ? 6 : 5, turn = (h % 13) / 13 * 2 * Math.PI / n, r = 82;
    const v = Array.from({length: n}, (_, i): P => [100 + r * Math.cos(turn + 2 * Math.PI * i / n - Math.PI / 2), 100 + r * Math.sin(turn + 2 * Math.PI * i / n - Math.PI / 2)]);
    if (tier === "glyph") add(path([0, 2, 4, 1, 3].map((i) => v[i]), true));
    else {
      for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) if (!(i === 0 && j === n - 1)) add(path([v[i], v[j]]));
      if (hero) for (const [x, y] of v) add(circle(x, y, 3.5));
    }
    focal = path(v, true);
  } else if (kind === "compass") {
    // The Lemma mark's construction (sign-in): a circle drawn by a compass, with its arm and construction line.
    const r = 88, angle = -Math.PI / 4;
    add(path([[100 - r, 100], [100 + r, 100]]));
    add(path([[100, 100], [100 + r * Math.cos(angle), 100 + r * Math.sin(angle)]]));
    add(circle(100, 100, 3)); add(circle(100 + r * Math.cos(angle), 100 + r * Math.sin(angle), 4));
    focal = circle(100, 100, r);
  } else {
    // A rose r = cos(kθ); the seed picks k. Hero adds the guide circle and two inner copies.
    const k = pick(h, [3, 4, 5, 7]), rose = (scale: number, samples: number) => {
      const pts: P[] = []; for (let i = 0; i <= samples; i++) {const a = i * 2 * Math.PI / samples, rr = 86 * scale * Math.cos(k * a); pts.push([100 + rr * Math.cos(a), 100 + rr * Math.sin(a)]);}
      return path(pts);
    };
    if (tier !== "glyph") add(circle(100, 100, 86));
    if (hero) {add(rose(0.66, 240)); add(rose(0.4, 200));}
    focal = rose(1, tier === "glyph" ? 160 : 320);
  }

  const limit = TIER_LIMIT[tier] - 1, kept = context.slice(0, limit);
  const strokes: EmblemStroke[] = kept.map((d, i) => ({d, width: w.base, opacity: tier === "glyph" ? 1 : +(0.4 + 0.2 * (kept.length < 2 ? 1 : i / (kept.length - 1))).toFixed(3)}));
  if (focal) strokes.push({d: focal, width: w.focal, opacity: 1, focal: true});
  if (cache.size >= 256) cache.delete(cache.keys().next().value!);
  cache.set(key, strokes);
  return strokes;
}
function bits(n: number): number {let c = 0; while (n) {c += n & 1; n >>= 1;} return c;}
