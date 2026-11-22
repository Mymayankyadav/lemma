import {insertPadSymbol, scanPad, type PadEdit} from '../../pad/padEdit';
import {symbolById, type SymbolDefinition} from './symbolCatalog';

/** Selections must stay in one prose or math span, clear of its delimiters. */
export function tutorMathContext(edit: PadEdit): 'prose' | 'tex' | undefined {
  let end = 0;
  for (const segment of scanPad(edit.text)) {
    const start = end;
    end += segment.source.length;
    if (segment.kind === 'text') continue;
    const delimiterLength = segment.source.startsWith('$$') || segment.source.startsWith('\\') ? 2 : 1;
    const mathStart = start + delimiterLength;
    const mathEnd = segment.kind === 'math' ? end - delimiterLength : end;
    if (edit.start >= mathStart && edit.end <= mathEnd) return 'tex';
    if (edit.end > start && edit.start < end) return undefined;
  }
  return 'prose';
}

function insertSymbol(edit: PadEdit, symbol: SymbolDefinition): PadEdit | undefined {
  // Keep the Pad control-word separator so the learner can type a letter
  // immediately after the chosen symbol.
  if (tutorMathContext(edit)) return insertPadSymbol(edit, {...symbol, label: symbol.name});
}

export function encodeTutorSymbol(edit: PadEdit, symbol: SymbolDefinition): string | undefined {
  const inserted = insertSymbol(edit, symbol);
  return inserted?.text.slice(edit.start, inserted.start);
}

export function insertTutorSymbol(edit: PadEdit, symbolId: string): PadEdit | undefined {
  const symbol = symbolById(symbolId);
  if (symbol) return insertSymbol(edit, symbol);
}
