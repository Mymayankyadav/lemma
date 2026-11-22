/** Local editor snapshots use the same UTF-16 offsets as HTMLTextAreaElement. */
export interface PadEdit {
  readonly text: string;
  readonly start: number;
  readonly end: number;
  readonly direction: 'forward' | 'backward' | 'none';
}

export const PAD_PREVIEW_LIMIT = 8192;
export const PAD_SLOT = '\\padslot';
export interface PadSymbol {readonly label: string; readonly glyph: string; readonly tex: string;}

export function padEdit(text: string, start = text.length, end = start, direction: PadEdit['direction'] = 'none'): PadEdit {
  const bound = (offset: number) => Number.isFinite(offset) ? Math.min(text.length, Math.max(0, Math.trunc(offset))) : text.length;
  const a = bound(start), b = bound(end);
  return {text, start: Math.min(a, b), end: Math.max(a, b), direction: a === b ? 'none' : direction};
}

const DELIMITERS: ReadonlyMap<string, string> = new Map([['$', '$'], ['$$', '$$'], ['\\(', '\\)'], ['\\[', '\\]']]);

export type PadSegment =
  | {kind: 'text'; source: string}
  | {kind: 'unfinished'; source: string}
  | {kind: 'math'; source: string; tex: string; display: boolean};

/** Plain text + explicit TeX delimiters. Escaped delimiters and all other markup stay literal. */
export function scanPad(source: string): PadSegment[] {
  const segments: PadSegment[] = [];
  let cursor = 0, open: RegExpMatchArray | undefined;
  // Consume escaped dollars/backslashes before considering any delimiters.
  for (const match of source.matchAll(/\\[\\$()[\]]|\$\$?/g)) {
    if (!open) {
      if (DELIMITERS.has(match[0])) {
        if (match.index > cursor) segments.push({kind: 'text', source: source.slice(cursor, match.index)});
        open = match;
      }
    } else if (match[0] === DELIMITERS.get(open[0])) {
      cursor = match.index + match[0].length;
      segments.push({
        kind: 'math',
        source: source.slice(open.index, cursor),
        tex: source.slice(open.index! + open[0].length, match.index),
        display: open[0] === '$$' || open[0] === '\\[',
      });
      open = undefined;
    }
  }
  if (open) segments.push({kind: 'unfinished', source: source.slice(open.index)});
  else if (cursor < source.length) segments.push({kind: 'text', source: source.slice(cursor)});
  return segments;
}

export const PAD_SYMBOLS = [
  {label: 'For all', glyph: '∀', tex: '\\forall'},
  {label: 'Exists', glyph: '∃', tex: '\\exists'},
  {label: 'Element of', glyph: '∈', tex: '\\in'},
  {label: 'Implies', glyph: '⇒', tex: '\\implies'},
  {label: 'Less than or equal', glyph: '≤', tex: '\\leq'},
  {label: 'Not equal', glyph: '≠', tex: '\\neq'},
  {label: 'Infinity', glyph: '∞', tex: '\\infty'},
] as const;

const TEMPLATE_BODY = {
  Fraction: [String.raw`\frac{`, '}{', '}'],
  'Square root': [String.raw`\sqrt{`, '}'],
  Exponent: ['{', '}^{', '}'],
  Subscript: ['{', '}_{', '}'],
  Parentheses: [String.raw`\left(`, String.raw`\right)`],
  Brackets: [String.raw`\left[`, String.raw`\right]`],
  'Absolute value': [String.raw`\left|`, String.raw`\right|`],
  'Definite integral': [String.raw`\int_{`, '}^{', '}{', String.raw`}\,d{`, '}'],
  Summation: [String.raw`\sum_{`, '}^{', '}', ''],
  '2 × 2 matrix': [String.raw`\begin{pmatrix}`, '&', String.raw`\\`, '&', String.raw`\end{pmatrix}`],
} as const;
export type PadTemplate = keyof typeof TEMPLATE_BODY;
export const PAD_TEMPLATES = Object.keys(TEMPLATE_BODY) as PadTemplate[];

function inMath(edit: PadEdit): boolean {
  return scanPad(edit.text.slice(0, edit.start)).at(-1)?.kind === 'unfinished';
}

function replace(edit: PadEdit, text: string, selectFrom = text.length, selectTo = selectFrom): PadEdit {
  return padEdit(edit.text.slice(0, edit.start) + text + edit.text.slice(edit.end), edit.start + selectFrom, edit.start + selectTo);
}

export function insertPadSymbol(edit: PadEdit, symbol: PadSymbol): PadEdit {
  return replace(edit, inMath(edit) ? symbol.tex + (/\\[a-z]+$/i.test(symbol.tex) ? ' ' : '') : symbol.glyph);
}

export function insertPadText(edit: PadEdit, text: string): PadEdit {return replace(edit, text);}

function characterBoundaries(text: string): number[] {
  // Native selections use UTF-16 offsets, but a key must not split an emoji,
  // combining mark or other grapheme. Segmenter is available in the app's browsers.
  const boundaries = [0];
  for (const part of new Intl.Segmenter(undefined, {granularity: 'grapheme'}).segment(text)) {
    boundaries.push(part.index + part.segment.length);
  }
  return boundaries;
}

export function deletePadBackward(edit: PadEdit): PadEdit {
  const boundaries = characterBoundaries(edit.text);
  // Restored UTF-16 carets and selections can fall inside a grapheme. Expand
  // both edges so Backspace never leaves a surrogate or combining mark behind.
  const start = boundaries.filter(offset => edit.start === edit.end ? offset < edit.start : offset <= edit.start).at(-1) ?? 0;
  const end = boundaries.find(offset => offset >= edit.end) ?? edit.text.length;
  return replace(padEdit(edit.text, start, end), '');
}

export function movePadCaret(edit: PadEdit, action: 'left' | 'right' | 'home' | 'end'): PadEdit {
  const focus = edit.direction === 'backward' ? edit.start : edit.end;
  const boundaries = characterBoundaries(edit.text);
  const selected = edit.start !== edit.end;
  let next: number;
  if (action === 'left') next = boundaries.filter(offset => selected ? offset <= edit.start : offset < focus).at(-1) ?? 0;
  else if (action === 'right') next = boundaries.find(offset => selected ? offset >= edit.end : offset > focus) ?? edit.text.length;
  else if (action === 'home') next = focus === 0 ? 0 : edit.text.lastIndexOf('\n', focus - 1) + 1;
  else {const end = edit.text.indexOf('\n', focus); next = end < 0 ? edit.text.length : end;}
  return padEdit(edit.text, next);
}

export interface PadTextHistory {past: readonly PadEdit[]; present: PadEdit; future: readonly PadEdit[];}
export const createPadTextHistory = (present: PadEdit): PadTextHistory => ({past: [], present, future: []});
function boundedHistory(edits: readonly PadEdit[]): PadEdit[] {
  const result: PadEdit[] = []; let size = 0;
  for (const edit of edits.slice(-50).reverse()) {
    if (result.length && size + edit.text.length > 262144) break;
    result.unshift(edit); size += edit.text.length;
  }
  return result;
}
/** Selection changes do not consume undo or discard redo; only local text edits do. */
export function changePadText(history: PadTextHistory, present: PadEdit): PadTextHistory {
  return history.present.text === present.text ? {...history, present}
    : {past: boundedHistory([...history.past, history.present]), present, future: []};
}
export function undoPadText(history: PadTextHistory): PadTextHistory {
  const previous = history.past.at(-1);
  return previous ? {past: history.past.slice(0, -1), present: previous,
    future: boundedHistory([...history.future].reverse().concat(history.present)).reverse()} : history;
}
export function redoPadText(history: PadTextHistory): PadTextHistory {
  const next = history.future[0];
  return next ? {past: boundedHistory([...history.past, history.present]), present: next, future: history.future.slice(1)} : history;
}

export function insertPadTemplate(edit: PadEdit, template: PadTemplate): PadEdit {
  const parts = TEMPLATE_BODY[template], selection = edit.text.slice(edit.start, edit.end);
  const display = template === '2 × 2 matrix';
  const alreadyMath = inMath(edit);
  const open = alreadyMath ? '' : display ? '\\[' : '\\(';
  const close = alreadyMath ? '' : display ? '\\]' : '\\)';
  const selectedPart = template === 'Definite integral' || template === 'Summation' ? 3 : 1;
  let text = open + parts[0], first = -1;
  for (let i = 1; i < parts.length; i++) {
    if (i === selectedPart && selection) text += selection;
    else {
      if (first < 0) first = text.length;
      text += PAD_SLOT;
    }
    text += parts[i];
  }
  const end = text.length + close.length;
  return replace(edit, text + close, first < 0 ? end : first, first < 0 ? end : first + PAD_SLOT.length);
}

export function nextPadSlot(edit: PadEdit): PadEdit | null {
  let index = -1;
  for (const slot of edit.text.matchAll(/\\[\\]|\\padslot(?![a-z])/gi)) {
    if (slot[0] !== PAD_SLOT) continue;
    if (index < 0) index = slot.index;
    if (slot.index >= edit.end) {index = slot.index; break;}
  }
  return index < 0 ? null : padEdit(edit.text, index, index + PAD_SLOT.length);
}

const COMMANDS = [...PAD_SYMBOLS.map(symbol => symbol.tex), '\\alpha', '\\beta', '\\delta', '\\frac',
  '\\gamma', '\\lambda', '\\rightarrow', '\\sqrt', '\\subseteq', '\\sum', '\\theta', '\\times'];

export function padSuggestions(edit: PadEdit): readonly {command: string; start: number}[] {
  if (edit.start !== edit.end) return [];
  const prefix = edit.text.slice(Math.max(0, edit.start - 24), edit.start).match(/\\[a-z]+$/i)?.[0];
  if (!prefix || /[a-z]/i.test(edit.text[edit.start] ?? '')) return [];
  const start = edit.start - prefix.length;
  if (edit.text[start - 1] === '\\' || !inMath(edit)) return [];
  return COMMANDS.filter(command => command.startsWith(prefix) && command !== prefix)
    .slice(0, 4).map(command => ({command, start}));
}

export function applyPadSuggestion(edit: PadEdit, suggestion: ReturnType<typeof padSuggestions>[number]): PadEdit {
  return replace(padEdit(edit.text, suggestion.start, edit.end), suggestion.command + ' ');
}


const TYPABLE_TEMPLATES = {
  sqrt: 'Square root',
  frac: 'Fraction',
  sum: 'Summation',
  int: 'Definite integral',
} as const satisfies Record<string, PadTemplate>;

interface PadNotationSuggestion {
  template: PadTemplate;
  start: number;
  base?: string;
}

/** Suggest the notation scaffold for a half-typed token. All new slots are empty. */
export function padNotationSuggestion(edit: PadEdit): PadNotationSuggestion | null {
  if (edit.start !== edit.end || /[a-z0-9_(]/i.test(edit.text[edit.end] ?? '')) return null;
  const before = edit.text.slice(Math.max(0, edit.start - 24), edit.start);
  const command = before.match(/(?<![a-z0-9_\\])\\?(sqrt|frac|sum|int)\($/);
  if (command) {
    return {template:TYPABLE_TEMPLATES[command[1] as keyof typeof TYPABLE_TEMPLATES],
      start:edit.end - command[0].length};
  }
  const script = before.match(/(?<![a-z0-9_\\])([a-z]|\d+)([\^_])$/i);
  return script ? {template:script[2] === '^' ? 'Exponent' : 'Subscript',
    start:edit.end - script[0].length, base:script[1]} : null;
}

export function applyPadNotation(edit: PadEdit, suggestion: PadNotationSuggestion): PadEdit {
  const start = suggestion.start;
  const base = suggestion.base ?? '';
  // Stage the prefix removal and template insertion as a single Pad edit.
  const inserted = replace(padEdit(edit.text, start, edit.end), base, 0, base.length);
  return insertPadTemplate(inserted, suggestion.template);
}
