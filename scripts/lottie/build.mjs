/**
 * N129 · A3 the Lottie animations, drawn in code (no design tool) in the house style of the A2 illustrations: a soft
 * round backdrop, one line weight, round caps, one accent. Writes src/ui/v7/lottie/*.json (committed; run
 * `node scripts/lottie/build.mjs` after editing). Colours are placeholders: every fill and stroke is named after a theme
 * role (bg, ink, muted, paper, accent, onAccent) and src/ui/v7/lottie.ts swaps in the page's colours before playing,
 * so Day, Night and the subject colour follow. "Nothing bounces": every move eases out without overshoot; each plays
 * once, at most 1.6 s, and its last frame is the still drawing.
 *
 * N130 (v7 UX audit r3, P4): ink before paint (a fill fades in only after its outline is drawn, LT4); a badge's tick
 * draws while its disc grows, so it never reads as a bare dot (LT5); and a shape that has both lists its stroke before
 * its fill, so the paper never covers the inner half of the line (LT6: Round complete ended at half weight).
 *
 * N154 (LT9, "drawn with a compass"): nothing grows from nothing. A star fades in from 70% of its size; a badge's ring is
 * drawn first, then its disc fades in from 70% under the ring, and the tick is drawn on it. The ✓ and ∎ land on the same
 * frames as before (Inbox zero 66, Round complete 72, Day closed 80), where the `complete` haptic is felt (LT8).
 */
import {mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

const FPS = 60, W = 240, H = 180;
const out = join(process.cwd(), 'src', 'ui', 'v7', 'lottie');

// ---- keyframes -----------------------------------------------------------------------------------------------------
const easeOut = {o: {x: [0.16], y: [1]}, i: {x: [0.3], y: [1]}};
const still = v => ({a: 0, k: v});
/** An animated property from [frame, value] pairs (values are arrays or numbers). */
function anim(...pairs) {
  return {a: 1, k: pairs.map(([t, s], index) => index < pairs.length - 1
    ? {t, s: Array.isArray(s) ? s : [s], ...easeOut}
    : {t, s: Array.isArray(s) ? s : [s]})};
}

// ---- shapes --------------------------------------------------------------------------------------------------------
const placeholder = [0.5, 0.5, 0.5, 1];
const stroke = (role, width = 3) => ({ty: 'st', nm: role, c: still(placeholder), o: still(100), w: still(width), lc: 2, lj: 2, ml: 4});
const fill = role => ({ty: 'fl', nm: role, c: still(placeholder), o: still(100), r: 1});
const rect = (cx, cy, w, h, r) => ({ty: 'rc', d: 1, p: still([cx, cy]), s: still([w, h]), r: still(r)});
const ellipse = (cx, cy, r) => ({ty: 'el', d: 1, p: still([cx, cy]), s: still([2 * r, 2 * r])});
/** A path through points with optional cubic handles: [[x, y, inX, inY, outX, outY], …] (handles relative). */
function path(points, closed = false) {
  return {ty: 'sh', ks: still({
    c: closed,
    v: points.map(p => [p[0], p[1]]),
    i: points.map(p => [p[2] ?? 0, p[3] ?? 0]),
    o: points.map(p => [p[4] ?? 0, p[5] ?? 0]),
  })};
}
const trim = (from, to) => ({ty: 'tm', s: still(0), e: anim([from, 0], [to, 100]), o: still(0), m: 1});
function transform({anchor = [0, 0], position = anchor, scale = still([100, 100]), opacity = still(100), rotation = still(0)} = {}) {
  return {ty: 'tr', p: typeof position[0] === 'number' ? still(position) : position, a: still(anchor), s: scale, r: rotation, o: opacity,
    sk: still(0), sa: still(0)};
}
const group = (nm, items, tr = transform()) => ({ty: 'gr', nm, it: [...items, tr]});

// In a Lottie layer or group the first item is drawn on top: list lines before the fills they sit on (LT6).

// ---- layers and composition ----------------------------------------------------------------------------------------
let index = 0;
function layer(nm, shapes, op, offset = [0, 0]) {
  return {ddd: 0, ind: ++index, ty: 4, nm, sr: 1, ao: 0, ip: 0, op, st: 0, bm: 0,
    ks: {o: still(100), r: still(0), p: still([offset[0], offset[1], 0]), a: still([0, 0, 0]), s: still([100, 100, 100])}, shapes};
}
function composition(nm, op, layers) {
  index = 0;
  // Lottie draws the first layer on top: callers list layers back to front, so reverse them here.
  return {v: '5.7.4', fr: FPS, ip: 0, op, w: W, h: H, nm, ddd: 0, assets: [], layers: layers(op).reverse()};
}
/** The A2 backdrop, there from the first frame, so frame 1 is a calm still (the plan's "frame 1 a valid still"). */
const backdrop = op => layer('backdrop', [group('bg', [ellipse(120, 90, 66), fill('bg')])], op);
/** A shape that fades in from 70% of its size, from frame `from` to `to` (LT9: nothing grows from nothing). */
const emerge = (anchor, from, to) => transform({anchor, scale: anim([from, [70, 70]], [to, [100, 100]]), opacity: anim([from, 0], [to, 100])});
/** A badge: its ring is drawn, then its disc fades in from 70% under it, and a tick is drawn on the disc while it settles
 *  (LT5: the tick starts in the first half of the disc's growth, so the disc is never a bare dot; LT9: the ring before
 *  the fill). The ring sits inside the disc's edge in the same colour, so the last frame is the still's plain disc. The
 *  tick lands at `from + TICK_LANDS`. */
const TICK_LANDS = 22, RING = 3;
function badge(op, cx, cy, from, kind = 'check') {
  const mark = kind === 'check' ? path([[cx - 6, cy], [cx - 2, cy + 4], [cx + 6, cy - 4]]) : null;
  return layer('badge', [
    group('tick', [mark, stroke('onAccent'), trim(from + 10, from + TICK_LANDS)]),
    group('ring', [ellipse(cx, cy, 13 - RING / 2), stroke('accent', RING), trim(from, from + 12)]),
    group('disc', [ellipse(cx, cy, 13), fill('accent')], emerge([cx, cy], from + 6, from + 18)),
  ], op);
}

// L-11 · Inbox zero: the tray draws itself, then a badge appears with a tick (the still is IL-04).
const inboxZero = composition('inbox-zero', 90, op => [
  backdrop(op),
  layer('tray', [
    group('tray-outline', [path([[80, 92], [94, 62], [146, 62], [160, 92], [160, 112, 0, 0, 0, 3.3], [154, 118, 3.3, 0, 0, 0],
      [86, 118, 0, 0, -3.3, 0], [80, 112, 0, 3.3, 0, 0]], true), stroke('ink'), trim(4, 40)]),
    group('tray-lip', [path([[80, 92], [104, 92], [110, 102], [130, 102], [136, 92], [160, 92]]), stroke('ink'), trim(22, 46)]),
    group('tray-fill', [path([[80, 92], [94, 62], [146, 62], [160, 92], [160, 112], [154, 118], [86, 118], [80, 112]], true), fill('paper')],
      transform({opacity: anim([30, 0], [42, 100])})),
  ], op),
  badge(op, 156, 114, 44),
]);

// L-10 · Round complete: a card settles onto the deck, its lines are written, then the tick.
const roundComplete = composition('round-complete', 96, op => [
  backdrop(op),
  layer('deck', [group('back-card', [rect(120, 83, 68, 50, 8), stroke('muted'), fill('paper')],
    transform({anchor: [120, 83], position: anim([0, [120, 91]], [20, [120, 83]]), rotation: still(-8), opacity: anim([0, 0], [14, 100])}))], op),
  layer('card', [group('front-card', [
    group('lines', [path([[96, 84], [144, 84]]), path([[96, 98], [130, 98]]), stroke('muted'), trim(28, 50)]),
    rect(120, 92, 76, 52, 8), stroke('ink'), fill('paper'),
  ], transform({anchor: [120, 92], position: anim([6, [120, 104]], [32, [120, 92]]), opacity: anim([6, 0], [22, 100])}))], op),
  badge(op, 154, 114, 50),
]);

// L-12 · Day closed: a crescent moon is drawn, two small stars come out in its hollow, and ∎ closes the day.
// The crescent: the right half of a circle (r 30 at 116, 88) closed by a curve through (126, 88). Same as IL "closed".
const crescent = path([
  [116, 58, 13.3, 20, 16.57, 0], [146, 88, 0, -16.57, 0, 16.57], [116, 118, 16.57, 0, 13.3, -20],
], true);
function star(x, y, r) {
  const q = r * 0.2;
  return path([[x, y - r, -q, q * 3, q, q * 3], [x + r, y, -q * 3, -q, -q * 3, q], [x, y + r, q, -q * 3, -q, -q * 3], [x - r, y, q * 3, q, q * 3, -q]], true);
}
// P2 (v7 UX audit r3): the drawing sits on the disc's centre, 4 right and 8 up of where it was drawn (its ∎ hung low);
// the still "closed" in Illustration.tsx moves by the same amount, so the last frame still equals it.
const CLOSED_OFFSET = [4, -8];
const dayClosed = composition('day-closed', 96, op => [
  backdrop(op),
  layer('moon', [
    group('moon-outline', [crescent, stroke('ink'), trim(4, 44)]),
    group('moon-fill', [crescent, fill('paper')], transform({opacity: anim([34, 0], [46, 100])})),
  ], op, CLOSED_OFFSET),
  layer('stars', [
    group('star-1', [star(94, 70, 9), fill('accent')], emerge([94, 70], 40, 58)),
    group('star-2', [star(100, 104, 6), fill('accent')], emerge([100, 104], 50, 66)),
  ], op, CLOSED_OFFSET),
  layer('qed', [group('qed', [rect(120, 134, 10, 10, 1.5), fill('accent')],
    transform({anchor: [120, 134], scale: anim([64, [0, 0]], [80, [100, 100]])}))], op, CLOSED_OFFSET),
]);

mkdirSync(out, {recursive: true});
for (const [name, data] of Object.entries({'inbox-zero': inboxZero, 'round-complete': roundComplete, 'day-closed': dayClosed})) {
  const text = JSON.stringify(data);
  writeFileSync(join(out, name + '.json'), text + '\n');
  console.log(name + '.json', text.length, 'bytes');
}
