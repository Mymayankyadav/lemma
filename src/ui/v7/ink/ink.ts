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

/** Screen CTM inversion keeps finger/pen coordinates correct when a full-screen paper is rotated.
 * Saving and model recognition still use unrotated 640 × 400 paper coordinates. */
export function transformedPaperPoint(clientX: number, clientY: number,
  matrix: Pick<DOMMatrixReadOnly, 'a' | 'b' | 'c' | 'd' | 'e' | 'f'>): PadPoint | null {
  const determinant = matrix.a * matrix.d - matrix.b * matrix.c;
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-10) return null;
  const dx = clientX - matrix.e, dy = clientY - matrix.f;
  const x = (matrix.d * dx - matrix.c * dy) / determinant;
  const y = (matrix.a * dy - matrix.b * dx) / determinant;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return {x: Math.round(Math.max(0, Math.min(PAD_PAPER.width, x))),
    y: Math.round(Math.max(0, Math.min(PAD_PAPER.height, y)))};
}

export function appendPadPoint(stroke: PadStroke, point: PadPoint): PadStroke {
  const last = stroke.at(-1);
  if (last?.x === point.x && last.y === point.y) return stroke;
  // Silently dropping the tail at 256 samples made a long handwritten stroke end
  // mid-gesture. Thin older points before appending, preserving the first point
  // and the live endpoint while keeping the database's bounded vector contract.
  if (stroke.length >= PAD_INK_LIMIT.points) {
    return [...stroke.filter((_, index) => index % 2 === 0), point];
  }
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
