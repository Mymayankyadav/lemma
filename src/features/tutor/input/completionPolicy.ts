import {padEdit, type PadEdit} from '../../pad/padEdit';
import {SYMBOL_CATALOG, symbolById, type SymbolDefinition} from './symbolCatalog';
import {encodeTutorSymbol, tutorMathContext} from './symbolEdit';

export type SourceRange = Readonly<{start: number; end: number}>;
export type CompletionRule = 'word-prefix' | 'spelling-correction' | 'keep-original' | 'exact-alias'
  | 'supplied-declaration' | 'supplied-quantifier' | 'symbol-choice';
export interface ApprovedCompletion {
  readonly text: string;
  readonly kind: 'word' | 'sym' | 'fix' | 'keep';
  readonly replace: SourceRange;
  readonly replacement: string;
  readonly policyRuleId: CompletionRule;
  readonly sourceRanges: readonly SourceRange[];
}

const INPUT_WINDOW = 120;
const TOKEN_BEFORE = /[\p{L}\p{M}\p{N}_\\]$/u;
const TOKEN_AFTER = /^[\p{L}\p{M}\p{N}_]/u;
const MATH_BOUNDARY = /[\p{Math}\\$*\/^_{}()[\]|-]/u;
const COMMAND = /^\\[a-z]+(?:\{[a-z]\})?$/i;

function inputTail(edit: PadEdit): {start: number; text: string} {
  const lineStart = edit.start === 0 ? 0 : edit.text.lastIndexOf('\n', edit.start - 1) + 1;
  const start = Math.max(lineStart, edit.start - INPUT_WINDOW);
  return {start, text: edit.text.slice(start, edit.start)};
}

export function wordAtCaret(edit: PadEdit): string | undefined {
  if (edit.start !== edit.end || TOKEN_AFTER.test(edit.text.slice(edit.end, edit.end + 2))) return;
  const word = inputTail(edit).text.match(/\p{L}[\p{L}\p{M}'’\p{Pd}]{0,23}$/u)?.[0];
  const start = edit.start - (word?.length ?? 0);
  if (word && !TOKEN_BEFORE.test(edit.text.slice(Math.max(0, start - 2), start))) return word;
}

export function plainProse(edit: PadEdit, word: string): boolean {
  const left = edit.text.slice(0, edit.start - word.length);
  const right = edit.text.slice(edit.end);
  return tutorMathContext(edit) === 'prose'
    && !MATH_BOUNDARY.test(left.trimEnd().at(-1) ?? '') && !MATH_BOUNDARY.test(right.trimStart()[0] ?? '')
    && !/[.\p{L}\p{N}]/u.test(left.at(-1) ?? '')
    && !/\b(?:let|choose|denote|define|take)\s+$/i.test(left);
}

export function trailingSpace(suffix: string): string {
  return /^[\s,.;:!?%…)}\]]/u.test(suffix) ? '' : ' ';
}

// Picker search is broad. A text alias is offered only for an exact spelling
// in this list or for an explicit TeX command in the same catalogue.
const WORD_ALIASES: Readonly<Record<string, readonly string[]>> = {
  forall: ['for all', 'for every', 'for each', 'forall'],
  exists: ['there exists', 'there exist', 'exists'],
  'not-exists': ['there does not exist', 'nexists'],
  equal: ['is equal to', 'equal to', 'equals', 'equal'],
  'not-equal': ['is not equal to', 'not equal to', 'not equal', 'neq'],
  'less-than': ['less than'],
  'less-than-or-equal': ['less than or equal to', 'less than or equal', 'at most', 'leq'],
  'greater-than': ['greater than'],
  'greater-than-or-equal': ['greater than or equal to', 'greater than or equal', 'at least', 'geq'],
  'element-of': ['is an element of', 'an element of', 'element of', 'belongs to', 'is in'],
  'not-element-of': ['is not an element of', 'not an element of', 'not element of', 'is not in', 'not in'],
  subset: ['is a subset of', 'subset of', 'contained in', 'subset'],
  'subset-or-equal': ['is a subset of', 'subset of', 'contained in', 'subset', 'subseteq'],
  'proper-subset': ['proper subset of', 'proper subset', 'strict subset'],
  'not-subset': ['is not a subset of', 'not a subset of', 'not a subset'],
  'not-subset-or-equal': ['is not a subset of', 'not a subset of', 'not a subset'],
  superset: ['superset of', 'superset'],
  'superset-or-equal': ['superset of', 'superset', 'supseteq'],
  union: ['union', 'cup'],
  intersection: ['intersection', 'cap'],
  'set-minus': ['set minus', 'setminus'],
  'empty-set': ['empty set', 'emptyset'],
  implies: ['implies that', 'implies'],
  iff: ['if and only if', 'iff'],
  'maps-to': ['maps to', 'mapsto'],
  'right-arrow': ['tends to', 'rightarrow'],
  composition: ['composed with', 'circ'],
  times: ['times'],
  infinity: ['infinity', 'infty'],
  therefore: ['therefore'],
  because: ['because'],
  qed: ['qed'],
  naturals: ['natural numbers', 'naturals'],
  integers: ['integers'],
  rationals: ['rational numbers', 'rationals'],
  reals: ['real numbers', 'reals'],
  complexes: ['complex numbers'],
  'approximately-equal': ['approximately equal', 'approximately', 'approx'],
  'plus-minus': ['plus or minus'],
  integral: ['integral'],
  summation: ['sum', 'summation'],
  'square-root': ['square root', 'sqrt'],
  partial: ['partial derivative'],
  nabla: ['nabla'],
};

interface Alias {
  readonly spelling: string;
  readonly symbol: SymbolDefinition;
  readonly affix?: string;
}

const SYMBOL_ALIASES: readonly Alias[] = SYMBOL_CATALOG.flatMap(symbol => {
  const words = WORD_ALIASES[symbol.id] ?? (symbol.category === 'Greek' && /^[a-z]+$/.test(symbol.id)
    ? [symbol.id, ...symbol.aliases] : []);
  return [...words, ...new Set([symbol.tex, ...symbol.aliases].filter(alias => COMMAND.test(alias)))]
    .map(spelling => ({spelling, symbol}));
});
const EXISTS = symbolById('exists')!;
const ALIASES: readonly Alias[] = [
  ...SYMBOL_ALIASES,
  ...['there exists a unique', 'exists a unique', 'exists unique', '\\exists!']
    .map(spelling => ({spelling, symbol: EXISTS, affix: '!'})),
];

function sameAlias(expected: string, actual: string): boolean {
  return expected.startsWith('\\') ? expected === actual : expected === actual.toLowerCase();
}

export function aliasCompletions(edit: PadEdit, recent: readonly string[]): ApprovedCompletion[] {
  if (edit.start !== edit.end) return [];
  const {start: offset, text} = inputTail(edit);
  const body = text.replace(/[ \t]+$/, '');
  const suffix = edit.text.slice(edit.end);
  if (!body || (body === text && TOKEN_AFTER.test(suffix))) return [];
  const matches: {alias: Alias; start: number}[] = [];
  for (const alias of ALIASES) {
    if (body.length < alias.spelling.length || !sameAlias(alias.spelling, body.slice(-alias.spelling.length))) continue;
    const start = offset + body.length - alias.spelling.length;
    if (TOKEN_BEFORE.test(edit.text.slice(Math.max(0, start - 2), start))) continue;
    matches.push({alias, start});
  }
  if (!matches.length) return [];
  const earliest = Math.min(...matches.map(({start}) => start));
  const preferred = (glyph: string) => {
    const index = recent.indexOf(glyph);
    return index < 0 ? recent.length : index;
  };
  const following = (text.slice(body.length) + suffix.slice(0, INPUT_WINDOW)).match(/^[ \t]+[a-z ]+/i)?.[0]?.toLowerCase();
  return matches.filter(({start}) => start === earliest)
    .sort((a, b) => preferred(a.alias.symbol.glyph) - preferred(b.alias.symbol.glyph))
    .flatMap(({alias, start}) => {
      if (following && ALIASES.some(longer =>
        longer.spelling.startsWith(alias.spelling + ' ') && (alias.spelling + following).startsWith(longer.spelling))) return [];
      const replace = {start, end: edit.end};
      const source = {start, end: offset + body.length};
      const range = padEdit(edit.text, start, edit.end);
      const encoded = encodeTutorSymbol(range, alias.symbol);
      if (encoded === undefined) return [];
      const tex = tutorMathContext(range) === 'tex';
      const value = encoded.trimEnd() + (alias.affix ?? '');
      const trailing = text.slice(body.length) || (tex && !encoded.endsWith(' ') ? '' : trailingSpace(suffix));
      const replacement = value + trailing;
      if (replacement === edit.text.slice(start, edit.end)) return [];
      return [{
        text: alias.symbol.glyph + (alias.affix ?? ''), kind: 'sym', replace, replacement,
        policyRuleId: 'exact-alias', sourceRanges: [source],
      }];
    });
}

// A full shorthand line is either "let ID in ID" or "for all/every/each ID in
// ID, PREDICATE". A predicate is a named identifier or an application to
// one to three identifiers. Each operand and the predicate are copied verbatim.
const ID = String.raw`\p{L}[\p{L}\p{M}\p{N}_]{0,23}`;
const DECLARATION = new RegExp(String.raw`^([ \t]*)(let) +(${ID}) +(in) +(${ID})(\.?)[ \t]*$`, 'diu');
const ARGUMENTS = String.raw`\( *${ID} *(?:, *${ID} *){0,2}\)`;
const QUANTIFIER = new RegExp(String.raw`^([ \t]*)(for (?:all|every|each)) +(${ID}) +(in) +(${ID}), *(${ID}(?:${ARGUMENTS})?)(\.?)[ \t]*$`, 'diu');

export function suppliedShorthand(edit: PadEdit): ApprovedCompletion | undefined {
  if (edit.start !== edit.end || tutorMathContext(edit) !== 'prose') return;
  const {start, text} = inputTail(edit);
  if (start > 0 && edit.text[start - 1] !== '\n') return;
  const suffix = edit.text.slice(edit.end);
  // A further operand on the same line could extend the domain or predicate.
  if (!/^(?:[ \t]*$|[ \t]*[.!?;\n])/u.test(suffix)) return;
  const replace = {start, end: edit.end};
  const declaration = DECLARATION.exec(text);
  const quantifier = declaration ? null : QUANTIFIER.exec(text);
  const match = declaration ?? quantifier;
  if (!match) return;
  const trail = text.match(/[ \t]+$/)?.[0] ?? '';
  const period = /^[ \t]*[.!?;]/u.test(suffix) ? '' : '.';
  const value = declaration
    ? `Let ${match[3]} ∈ ${match[5]}${match[6] || period}`
    : `∀${match[3]} ∈ ${match[5]}, ${match[6]}${match[7]}`;
  const sourceRanges = match.indices!.slice(2, declaration ? 6 : 7).flatMap(range =>
    range ? [{start: start + range[0], end: start + range[1]}] : [],
  );
  return {
    text: value, kind: 'word', replace, replacement: match[1] + value + trail,
    policyRuleId: declaration ? 'supplied-declaration' : 'supplied-quantifier', sourceRanges,
  };
}
