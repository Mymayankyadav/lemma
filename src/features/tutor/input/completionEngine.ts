import {insertPadText, padEdit, type PadEdit} from '../../pad/padEdit';
import {aliasCompletions, plainProse, suppliedShorthand, trailingSpace, wordAtCaret,
  type ApprovedCompletion} from './completionPolicy';
import {symbolById} from './symbolCatalog';
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
const WORD_BANK = new Set((
  'the a an is are be by of to in on at for from with that this then thus hence so since because if iff and or not '
  + 'let suppose assume take consider fix choose given define defined denote write we have get show prove proof claim '
  + 'it its there exists exist every each all any some no none only unique uniquely both either neither other another '
  + 'such where which when while whenever therefore conversely similarly likewise moreover furthermore however indeed '
  + 'follows following implies implying means meaning gives giving yields yielding shows showing proves proving '
  + 'contradiction contradicts absurd case cases otherwise first second finally next now note recall observe '
  + 'definition lemma theorem corollary proposition hypothesis assumption induction base step inductive '
  + 'function map maps mapping image images preimage preimages inverse injective surjective bijective injection surjection bijection '
  + 'identity composition composite restriction extension domain codomain range kernel fibre fibres fiber fibers '
  + 'set sets subset subsets superset element elements member members union intersection complement difference empty '
  + 'finite infinite countable uncountable family indexed collection partition partitions class classes representative '
  + 'relation relations equivalence reflexive symmetric transitive antisymmetric order ordering partial total chain chains '
  + 'generated generates smallest largest least greatest minimal maximal upper lower bound bounds supremum infimum '
  + 'quotient quotients projection canonical natural well-defined independent choice axiom zorn '
  + 'topology topological space spaces open closed closure interior boundary dense neighbourhood neighborhood basis base '
  + 'subspace product continuous continuity homeomorphism homeomorphic compact compactness connected connectedness '
  + 'path hausdorff metric distance ball limit limits converges convergent convergence sequence sequences subsequence '
  + 'cauchy bounded unbounded increasing decreasing monotone positive negative zero nonzero integer integers real reals '
  + 'number numbers rational irrational even odd prime divides divisible multiple greater less equal equals than at most least '
  + 'group groups subgroup normal homomorphism isomorphism isomorphic ring field vector linear module '
  + 'true false holds hold satisfies satisfy satisfying contains contain containing belongs belong lies lie '
  + 'arbitrary fixed given same different distinct disjoint nonempty pairwise mutually exactly unique '
  + 'need want check verify suffices enough remains left right side direction inclusion inclusions both '
  + 'hint stuck think sure why how what yes ok okay'
).split(' '));
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
  for (const word of WORD_BANK) {
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
  if (WORD_BANK.has(lower)) return [];
  const spellings = lexicalSources(edit, prefix, context);
  const range = {start: edit.start - prefix.length, end: edit.end};
  const trail = trailingSpace(edit.text.slice(edit.end));
  const make = (text: string, kind: ApprovedCompletion['kind'], policyRuleId: ApprovedCompletion['policyRuleId']): ApprovedCompletion =>
    ({text, kind, policyRuleId, replace: range, replacement: text + trail, sourceRanges: [range]});
  const prefixMatches = [...new Set([...WORD_BANK, ...spellings.keys()])].filter(word => word.startsWith(lower));
  const fix = !keptWords.includes(lower) && !prefixMatches.length ? offeredCorrection(lower) : undefined;
  if (fix) return [make(prefix, 'keep', 'keep-original'), make(caseLike(prefix, fix), 'fix', 'spelling-correction')];
  return prefixMatches.filter(word => word.length > lower.length).slice(0, 2)
    .map(word => make(caseLike(prefix, WORD_BANK.has(word) ? word : spellings.get(word)!), 'word', 'word-prefix'));
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
