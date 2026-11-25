import {padEdit, scanPad, type PadEdit} from '../../pad/padEdit';

export interface MenuEdit {
  readonly start: number;
  readonly end: number;
  readonly insert: string;
  readonly caret: number;
  readonly selectionEnd?: number;
  readonly direction?: PadEdit['direction'];
}
export type OriginRange = Readonly<{start: number; end: number}>;

export function learnerAuthored(spans: readonly OriginRange[] | undefined, start: number, end: number) {
  return !spans?.some(span => span.start < end && start < span.end);
}

export function applyMenuEdit(text: string, edit: MenuEdit): PadEdit | null {
  const {start, end, insert, caret} = edit;
  if (![start, end, caret].every(Number.isSafeInteger) || start < 0 || start > end || end > text.length) return null;
  const result = text.slice(0, start) + insert + text.slice(end);
  const tail = edit.selectionEnd ?? caret;
  if (!Number.isSafeInteger(tail) || caret < 0 || tail < caret || tail > result.length) return null;
  return padEdit(result, caret, tail, edit.direction);
}

/** Respect written notation without letting an accepted suggestion establish its own convention. */
export function proseSymbol(before: string, symbol: string, spacing: string, spans?: readonly OriginRange[]) {
  const paragraph = /(?:\n[ \t]*\n)(?![\s\S]*\n[ \t]*\n)/u.exec(before);
  let start = paragraph ? paragraph.index + paragraph[0].length : 0;
  let delimiter = '';
  for (const part of scanPad(before.slice(start))) {
    const end = start + part.source.length;
    if (part.kind === 'math' && !part.display && learnerAuthored(spans, start, end)) {
      delimiter = part.source.startsWith('$') ? '$' : '\\(';
    }
    if (part.kind === 'unfinished') return symbol;
    start = end;
  }
  if (delimiter === '$') return '$' + symbol + '$';
  if (delimiter) return '\\(' + symbol + '\\)';
  return symbol + spacing;
}
