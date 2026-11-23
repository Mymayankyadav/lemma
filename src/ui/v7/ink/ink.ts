/** One paper coordinate space for pointer input, rendering and local export. */
export const PAD_PAPER = {width: 640, height: 400} as const;
export const PAD_INK_LIMIT = {strokes: 96, points: 256, undo: 16} as const;

export interface PadPoint {readonly x: number; readonly y: number}
export type PadStroke = readonly PadPoint[];
export type PadStrokes = readonly PadStroke[];
export interface PadInkHistory {
  readonly strokes: PadStrokes;
  /** In-memory only. The future draft store persists completed strokes and revisions. */
  readonly undo: readonly PadStrokes[];
}

function validPoint(point: unknown): point is PadPoint {
  if (!point || typeof point !== 'object') return false;
  const {x, y} = point as Partial<PadPoint>;
  return typeof x === 'number' && Number.isInteger(x) && x >= 0 && x <= PAD_PAPER.width
    && typeof y === 'number' && Number.isInteger(y) && y >= 0 && y <= PAD_PAPER.height;
}

function validStroke(stroke: unknown): stroke is PadStroke {
  return Array.isArray(stroke) && stroke.length > 0 && stroke.length <= PAD_INK_LIMIT.points
    && Array.from(stroke).every(validPoint);
}

/** Fail closed on a bad snapshot; a caller may recover an earlier durable revision. */
export function initializePadInk(strokes: unknown = []): PadInkHistory | null {
  if (!Array.isArray(strokes) || strokes.length > PAD_INK_LIMIT.strokes
      || !Array.from(strokes).every(validStroke)) return null;
  return {strokes: strokes.map(stroke => stroke.map(({x, y}: PadPoint) => ({x, y}))), undo: []};
}

export function paperPoint(clientX: number, clientY: number,
  box: Pick<DOMRectReadOnly, 'left' | 'top' | 'width' | 'height'>): PadPoint | null {
  const x = (clientX - box.left) / box.width, y = (clientY - box.top) / box.height;
  if (box.width <= 0 || box.height <= 0 || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  return {
    x: Math.round(Math.min(1, Math.max(0, x)) * PAD_PAPER.width),
    y: Math.round(Math.min(1, Math.max(0, y)) * PAD_PAPER.height),
  };
}

/**
 * N228 (Owner: landscape in full screen): a paper turned a quarter on the screen. `inverse` is the inverse of the
 * canvas's screen matrix (what getScreenCTM().inverse() gives, a rotation with the viewBox's scale), so a touch lands
 * on the paper's own, upright coordinates whichever way the paper is turned.
 */
export interface PadMatrix {readonly a: number; readonly b: number; readonly c: number; readonly d: number; readonly e: number; readonly f: number}
export function matrixPoint(inverse: PadMatrix, clientX: number, clientY: number): PadPoint | null {
  const x = inverse.a * clientX + inverse.c * clientY + inverse.e, y = inverse.b * clientX + inverse.d * clientY + inverse.f;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return {x: Math.round(Math.min(PAD_PAPER.width, Math.max(0, x))), y: Math.round(Math.min(PAD_PAPER.height, Math.max(0, y)))};
}

/** A movement on the screen, as the paper's own pixels along its own axes (for scrolling a turned paper). */
export function paperDelta(screen: PadMatrix, dx: number, dy: number): [number, number] {
  const ax = Math.hypot(screen.a, screen.b) || 1, ay = Math.hypot(screen.c, screen.d) || 1;
  return [(dx * screen.a + dy * screen.b) / ax, (dx * screen.c + dy * screen.d) / ay];
}

export function appendPadPoint(stroke: PadStroke, point: PadPoint): PadStroke {
  const last = stroke.at(-1);
  if (stroke.length >= PAD_INK_LIMIT.points || (last?.x === point.x && last.y === point.y)) return stroke;
  return [...stroke, point];
}

function changeInk(history: PadInkHistory, strokes: PadStrokes): PadInkHistory {
  return {strokes, undo: [...history.undo, history.strokes].slice(-PAD_INK_LIMIT.undo)};
}

export function finishPadStroke(history: PadInkHistory, stroke: PadStroke): PadInkHistory {
  if (history.strokes.length >= PAD_INK_LIMIT.strokes || !validStroke(stroke)) return history;
  return changeInk(history, [...history.strokes, stroke]);
}

export function clearPadInk(history: PadInkHistory): PadInkHistory {
  return history.strokes.length ? changeInk(history, []) : history;
}

export function replacePadStrokes(history: PadInkHistory, strokes: PadStrokes): PadInkHistory {
  return strokes === history.strokes ? history : changeInk(history, strokes);
}

export function undoPadInk(history: PadInkHistory): PadInkHistory {
  const previous = history.undo.at(-1);
  return previous ? {strokes: previous, undo: history.undo.slice(0, -1)} : history;
}

/** The single-point stroke is a round dot. Only bounded numeric data becomes SVG geometry. */
export function padStrokePath(stroke: PadStroke): string {
  if (!validStroke(stroke)) return '';
  const points = stroke.map(({x, y}) => x + ' ' + y);
  return 'M' + points[0] + (points.length === 1 ? 'h.01' : 'L' + points.slice(1).join(' '));
}

/**
 * N228 (Owner: "drawing in both the scratch pads is laggy and unreliable"): Ramer–Douglas–Peucker. A long, slow stroke
 * has far more points than it needs; dropping the points that lie within `epsilon` paper units of the line between the
 * kept ones keeps its shape and lets it fit the per-stroke limit instead of being cut off.
 */
export function simplifyPadStroke(stroke: PadStroke, epsilon = 0.6): PadStroke {
  if (stroke.length < 3) return stroke;
  const keep = new Uint8Array(stroke.length);
  keep[0] = keep[stroke.length - 1] = 1;
  const pending: [number, number][] = [[0, stroke.length - 1]];
  while (pending.length) {
    const [from, to] = pending.pop()!;
    const a = stroke[from], b = stroke[to];
    const dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
    let far = 0, at = -1;
    for (let i = from + 1; i < to; i++) {
      const p = stroke[i];
      const t = length ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length)) : 0;
      const d = Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y);
      if (d > far) {far = d; at = i;}
    }
    if (at >= 0 && far > epsilon) {keep[at] = 1; pending.push([from, at], [at, to]);}
  }
  return stroke.filter((_, i) => keep[i]);
}

export function erasePadStroke(history: PadInkHistory, point: PadPoint, margin = 16): PadInkHistory {
  const fromEnd = [...history.strokes].reverse().findIndex(stroke => stroke.some((at, index) => {
    const previous = stroke[index - 1] ?? at;
    const dx = at.x - previous.x, dy = at.y - previous.y;
    const length = dx * dx + dy * dy;
    const position = length ? ((point.x - previous.x) * dx + (point.y - previous.y) * dy) / length : 0;
    const fraction = Math.max(0, Math.min(1, position));
    return Math.hypot(previous.x + fraction * dx - point.x, previous.y + fraction * dy - point.y) <= margin;
  }));
  const index = fromEnd < 0 ? -1 : history.strokes.length - 1 - fromEnd;
  return index < 0 ? history : changeInk(history,history.strokes.filter((_,i)=>i!==index));
}
