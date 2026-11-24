import {PAD_INK_LIMIT, type PadPoint, type PadStroke, type PadStrokes} from './ink';

type Interval = [number, number];
const EPSILON = 1e-9;
type Bounds = {minX: number; maxX: number; minY: number; maxY: number};
// PadStrokes are immutable snapshots. Weak keys release bounds with old undo states.
const boundsCache = new WeakMap<PadStroke, Bounds>();
function bounds(stroke: PadStroke): Bounds {
  const cached = boundsCache.get(stroke);
  if (cached) return cached;
  const box = {minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity};
  for (const point of stroke) {
    box.minX = Math.min(box.minX, point.x); box.maxX = Math.max(box.maxX, point.x);
    box.minY = Math.min(box.minY, point.y); box.maxY = Math.max(box.maxY, point.y);
  }
  boundsCache.set(stroke, box);
  return box;
}

/** Intersect a line segment with a disk; a tangent does not remove a length of ink. */
function disk(a: PadPoint, b: PadPoint, center: PadPoint, radius: number): Interval | null {
  const dx = b.x - a.x, dy = b.y - a.y, x = a.x - center.x, y = a.y - center.y;
  const length = dx * dx + dy * dy, c = x * x + y * y - radius * radius;
  if (!length) return c < 0 ? [0, 1] : null;
  const dot = x * dx + y * dy, discriminant = dot * dot - length * c;
  if (discriminant <= 0) return null;
  const root = Math.sqrt(discriminant);
  const lo = Math.max(0, (-dot - root) / length), hi = Math.min(1, (-dot + root) / length);
  return hi - lo > EPSILON ? [lo, hi] : null;
}

/** A swept disk is two endpoint disks plus their connecting rectangle. */
function contact(a: PadPoint, b: PadPoint, from: PadPoint, to: PadPoint, radius: number): Interval | null {
  // Cheap rejection before any square roots. No resampling proportional to pointer speed.
  if (Math.max(a.x, b.x) < Math.min(from.x, to.x) - radius
      || Math.min(a.x, b.x) > Math.max(from.x, to.x) + radius
      || Math.max(a.y, b.y) < Math.min(from.y, to.y) - radius
      || Math.min(a.y, b.y) > Math.max(from.y, to.y) + radius) return null;
  let interval = disk(a, b, from, radius);
  const merge = (next: Interval | null) => {
    if (next) interval = interval ? [Math.min(interval[0], next[0]), Math.max(interval[1], next[1])] : next;
  };
  const dx = to.x - from.x, dy = to.y - from.y, length = Math.hypot(dx, dy);
  if (!length) return interval;
  merge(disk(a, b, to, radius));
  const ux = dx / length, uy = dy / length;
  const x = (a.x - from.x) * ux + (a.y - from.y) * uy;
  const y = -(a.x - from.x) * uy + (a.y - from.y) * ux;
  const vx = (b.x - a.x) * ux + (b.y - a.y) * uy;
  const vy = -(b.x - a.x) * uy + (b.y - a.y) * ux;
  let lo = 0, hi = 1;
  for (const [origin, delta, min, max] of [[x, vx, 0, length], [y, vy, -radius, radius]]) {
    if (Math.abs(delta) < EPSILON) {
      if (origin <= min || origin >= max) {hi = -1; break;}
    } else {
      const t1 = (min - origin) / delta, t2 = (max - origin) / delta;
      lo = Math.max(lo, Math.min(t1, t2)); hi = Math.min(hi, Math.max(t1, t2));
    }
  }
  if (hi - lo > EPSILON) merge([lo, hi]);
  return interval;
}

function pointAt(a: PadPoint, b: PadPoint, t: number): PadPoint {
  if (t <= 0) return a;
  if (t >= 1) return b;
  // The persisted ink format requires integer coordinates. Cut accuracy is within
  // sqrt(0.5) paper units; the existing round SVG end caps are intentionally retained.
  return {x: Math.round(a.x + (b.x - a.x) * t), y: Math.round(a.y + (b.y - a.y) * t)};
}

function cut(stroke: PadStroke, from: PadPoint, to: PadPoint, radius: number): PadStrokes {
  const parts: PadPoint[][] = [];
  let current: PadPoint[] = [], changed = false;
  const append = (point: PadPoint) => {
    const last = current.at(-1);
    if (!last || point.x !== last.x || point.y !== last.y) current.push(point);
  };
  const finish = () => {
    if (current.length) {
      // Clipping can add boundary points. Preserve all geometry at the point cap.
      for (let i = 0; i < current.length; i += PAD_INK_LIMIT.points - 1) {
        parts.push(current.slice(i, i + PAD_INK_LIMIT.points));
        if (i + PAD_INK_LIMIT.points >= current.length) break;
      }
    }
    current = [];
  };
  if (stroke.length === 1) return contact(stroke[0], stroke[0], from, to, radius) ? [] : [stroke];
  for (let i = 1; i < stroke.length; i++) {
    const a = stroke[i - 1], b = stroke[i], hit = contact(a, b, from, to, radius);
    if (!hit) {append(a); append(b); continue;}
    changed = true;
    if (hit[0] > EPSILON) {append(a); append(pointAt(a, b, hit[0]));}
    finish();
    if (hit[1] < 1 - EPSILON) {append(pointAt(a, b, hit[1])); append(b);}
  }
  if (!changed) return [stroke];
  finish();
  // Integer quantization can leave a boundary unchanged on repeated contact.
  // Preserve identity in that case, avoiding redundant renders and undo entries.
  if (parts.length === 1 && parts[0].length === stroke.length
      && parts[0].every((point, i) => point.x === stroke[i].x && point.y === stroke[i].y)) return [stroke];
  return parts;
}

/**
 * Remove only centerline portions under a swept circular eraser. This is geometric
 * partial erasing, not destructive rasterization: surviving points and untouched
 * strokes keep their references (the current model contains XY only, no IDs or pressure).
 * Work is O(total points) worst case, independent of sweep length. Cached bounds
 * reject untouched distant strokes in O(strokes) after the first pass. No input is mutated.
 *
 * If a split would exceed the persisted stroke budget, reject this entire step,
 * rather than drop unrelated ink or reconnect across erased gaps. The caller can
 * detect no change by identity, preview several steps, then commit exactly once
 * with replacePadStrokes so one undo restores the whole pre-gesture snapshot.
 */
export function eraseStrokesPartial(strokes: PadStrokes, from: PadPoint, to: PadPoint, radius: number): PadStrokes {
  if (![from.x, from.y, to.x, to.y, radius].every(Number.isFinite) || radius <= 0) return strokes;
  const result: PadStroke[] = [];
  let changed = false;
  const minX = Math.min(from.x, to.x) - radius, maxX = Math.max(from.x, to.x) + radius;
  const minY = Math.min(from.y, to.y) - radius, maxY = Math.max(from.y, to.y) + radius;
  for (const stroke of strokes) {
    const box = bounds(stroke);
    if (box.maxX < minX || box.minX > maxX || box.maxY < minY || box.minY > maxY) {
      result.push(stroke);
      continue;
    }
    const parts = cut(stroke, from, to, radius);
    if (parts.length !== 1 || parts[0] !== stroke) changed = true;
    result.push(...parts);
  }
  return changed && result.length <= PAD_INK_LIMIT.strokes ? result : strokes;
}
