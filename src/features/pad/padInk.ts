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
