/** Local editor snapshots use the same UTF-16 offsets as HTMLTextAreaElement. */
export interface PadEdit {
  readonly text: string;
  readonly start: number;
  readonly end: number;
  readonly direction: 'forward' | 'backward' | 'none';
}

export const PAD_PREVIEW_LIMIT = 8192;
export const PAD_SLOT = '\\padslot';

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

export function insertPadSymbol(edit: PadEdit, symbol: (typeof PAD_SYMBOLS)[number]): PadEdit {
  return replace(edit, inMath(edit) ? symbol.tex + ' ' : symbol.glyph);
}

export function insertPadTemplate(edit: PadEdit, template: PadTemplate): PadEdit {
  const parts = TEMPLATE_BODY[template], selection = edit.text.slice(edit.start, edit.end);
  const display = template === '2 × 2 matrix';
  const alreadyMath = inMath(edit);
  const open = alreadyMath ? '' : display ? '\\[' : '\\(';
  const close = alreadyMath ? '' : display ? '\\]' : '\\)';
  let text = open + parts[0], first = -1;
  for (let i = 1; i < parts.length; i++) {
    if (i === 1 && selection) text += selection;
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
