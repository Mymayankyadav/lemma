import {insertPadText, padEdit, type PadEdit} from '../../pad/padEdit';
import {aliasCompletions, plainProse, suppliedShorthand, trailingSpace, wordAtCaret,
  type ApprovedCompletion} from './completionPolicy';
import {symbolById} from './symbolCatalog';
import {proofWritingWords} from './proofVocabulary';
import {encodeTutorSymbol} from './symbolEdit';

export interface CompletionRevisions {
  readonly editorRevision: number;
  readonly selectionRevision: number;
}
export interface CompletionProposal extends ApprovedCompletion, CompletionRevisions {
  readonly id: string;
  readonly snapshot: PadEdit;
}

const INITIAL_REVISIONS: CompletionRevisions = {editorRevision: 0, selectionRevision: 0};
const QUICK_SYMBOLS = ['forall', 'exists', 'element-of'] as const;
const COMMON_TYPOS: ReadonlyMap<string, string> = new Map(Object.entries({
  teh: 'the', thier: 'their', becuase: 'because', shwo: 'show',
  asusme: 'assume', therfore: 'therefore',
}));
const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const KEY_POSITIONS = new Map(ROWS.flatMap((row, y) => [...row].map((letter, x) => [letter, [x + [0, 0.5, 1.5][y], y]] as const)));
const WORDS = /(?<![\p{L}\p{M}\p{N}_\\])[\p{L}][\p{L}\p{M}]{2,23}(?![\p{L}\p{M}\p{N}_])/gu;

function lexicalSources(edit: PadEdit, prefix: string, context: readonly string[]) {
  const tokenStart = edit.start - prefix.length;
  const previous = edit.text.slice(Math.max(0, tokenStart - 2000), tokenStart);
  const following = edit.text.slice(edit.end, edit.end + 2000);
  const authored = (previous + ' ' + following).match(WORDS) ?? [];
  const topical = context.slice(0, 3).flatMap(source => source.slice(0, 2000).match(WORDS) ?? []);
  return new Map([...topical, ...authored].map(word => [word.toLowerCase(), word]));
}

function caseLike(word: string, candidate: string): string {
  const [first, ...rest] = candidate;
  if (word.length > 1 && word === word.toUpperCase()) return candidate.toUpperCase();
  return /^\p{Lu}/u.test(word) ? first.toUpperCase() + rest.join('') : candidate;
}

function typoCost(word: string, candidate: string): number {
  if (Math.abs(word.length - candidate.length) > 1 || word === candidate) return Infinity;
  const offset = [...word].findIndex((letter, index) => letter !== candidate[index]);
  const first = offset < 0 ? word.length : offset;
  const left = word.slice(first), right = candidate.slice(first);
  if (left.length === right.length) {
    if (left[0] === right[1] && left[1] === right[0] && left.slice(2) === right.slice(2)) return 1;
    const a = KEY_POSITIONS.get(left[0]), b = KEY_POSITIONS.get(right[0]);
    if (a && b && left.slice(1) === right.slice(1) && Math.abs(a[0] - b[0]) <= 1.1 && Math.abs(a[1] - b[1]) <= 1) return 2;
    return Infinity;
  }
  const [long, short] = left.length > right.length ? [left, right] : [right, left];
  if (long.slice(1) !== short) return Infinity;
  return left === long && (long[0] === long[1] || word[first - 1] === long[0]) ? 1 : 3;
}

function offeredCorrection(lower: string): string | undefined {
  if (!/^[a-z]{3,24}$/.test(lower)) return;
  const common = COMMON_TYPOS.get(lower);
  if (common) return common;
  let best: string | undefined;
  let bestCost = Infinity;
  for (const word of proofWritingWords) {
    if (word[0] !== lower[0] && word[1] !== lower[1]) continue;
    const cost = typoCost(lower, word);
    if (cost < bestCost) {
      best = word;
      bestCost = cost;
    } else if (cost === bestCost) best = undefined;
  }
  return best;
}

function lexicalCompletions(edit: PadEdit, context: readonly string[], keptWords: readonly string[]): ApprovedCompletion[] {
  const prefix = wordAtCaret(edit);
  if (!prefix || prefix.length < 2 || !plainProse(edit, prefix)) return [];
  const lower = prefix.toLowerCase();
  // Completed words carry their own meaning. For example, "if" is a complete
  // connective even when "iff" appears in the checkpoint vocabulary.
  if (proofWritingWords.has(lower)) return [];
  const spellings = lexicalSources(edit, prefix, context);
  const range = {start: edit.start - prefix.length, end: edit.end};
  const trail = trailingSpace(edit.text.slice(edit.end));
  const make = (text: string, kind: ApprovedCompletion['kind'], policyRuleId: ApprovedCompletion['policyRuleId']): ApprovedCompletion =>
    ({text, kind, policyRuleId, replace: range, replacement: text + trail, sourceRanges: [range]});
  const prefixMatches = [...new Set([...proofWritingWords, ...spellings.keys()])].filter(word => word.startsWith(lower));
  const fix = !keptWords.includes(lower) && !prefixMatches.length ? offeredCorrection(lower) : undefined;
  if (fix) return [make(prefix, 'keep', 'keep-original'), make(caseLike(prefix, fix), 'fix', 'spelling-correction')];
  return prefixMatches.filter(word => word.length > lower.length).slice(0, 2)
    .map(word => make(caseLike(prefix, proofWritingWords.has(word) ? word : spellings.get(word)!), 'word', 'word-prefix'));
}

function quickSymbols(edit: PadEdit): ApprovedCompletion[] {
  return QUICK_SYMBOLS.flatMap(id => {
    const symbol = symbolById(id)!;
    const replacement = encodeTutorSymbol(edit, symbol);
    return replacement === undefined ? [] : [{
      text: symbol.glyph, kind: 'sym', replacement, policyRuleId: 'symbol-choice',
      replace: {start: edit.start, end: edit.end}, sourceRanges: [],
    }];
  });
}

export function completionProposals(
  edit: PadEdit, context: readonly string[], recent: readonly string[], keptWords: readonly string[] = [],
  revisions: CompletionRevisions = INITIAL_REVISIONS,
): CompletionProposal[] {
  const shorthand = suppliedShorthand(edit);
  const candidates = [
    ...(shorthand ? [shorthand] : []), ...aliasCompletions(edit, recent),
    ...lexicalCompletions(edit, context, keptWords), ...quickSymbols(edit),
  ];
  const unique = new Map<string, ApprovedCompletion>();
  for (const candidate of candidates) {
    if (!unique.has(candidate.text)) unique.set(candidate.text, candidate);
    if (unique.size === 3) break;
  }
  const ranked = [...unique.values()];
  if (ranked.length >= 2 && ranked[0].kind !== 'keep') [ranked[0], ranked[1]] = [ranked[1], ranked[0]];
  const snapshot = {...edit};
  return ranked.map(proposal => ({
    ...proposal, ...revisions, snapshot,
    id: JSON.stringify([revisions.editorRevision, revisions.selectionRevision, proposal.policyRuleId,
      proposal.replace.start, proposal.replace.end, proposal.text]),
  }));
}

export function applyCompletion(
  edit: PadEdit, proposal: CompletionProposal, revisions: CompletionRevisions = INITIAL_REVISIONS,
): PadEdit {
  const {snapshot, replace} = proposal;
  if (proposal.editorRevision !== revisions.editorRevision || proposal.selectionRevision !== revisions.selectionRevision
    || edit.text !== snapshot.text || edit.start !== snapshot.start || edit.end !== snapshot.end
    || edit.direction !== snapshot.direction || !Number.isInteger(replace.start)
    || replace.start < 0 || replace.start > edit.start || replace.end !== edit.end) return edit;
  return insertPadText(padEdit(edit.text, replace.start, replace.end), proposal.replacement);
}

export function automaticSpelling(
  edit: PadEdit, separator: string, context: readonly string[], keptWords: ReadonlySet<string>,
): PadEdit | undefined {
  const word = wordAtCaret(edit);
  if (!word || !/^[ ,.;]$/.test(separator) || keptWords.has(word)) return;
  const fix = COMMON_TYPOS.get(word);
  if (!fix || !plainProse(edit, word) || lexicalSources(edit, word, context).has(word)) return;
  return insertPadText(padEdit(edit.text, edit.start - word.length, edit.end), fix + separator);
}
