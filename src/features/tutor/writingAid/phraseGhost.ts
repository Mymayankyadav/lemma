import phrases from './phrase-ghost-bank.json';
import {hasProofChoiceGap} from './eligibility';
import {learnerAuthored, type MenuEdit} from './menuEdit';
import {eligibleGhostContext, proposalEdit, proposalEligible, WRITING_AID_LIMIT, writingAidProposal,
  type WritingAidProposal, type WritingAidRequest} from './policy';
import {phraseGhostGroup, type PhraseGhostContext, type PhraseGhostGroup, type PhraseGhostLane} from './phraseGhostConfig';

interface Literal {text: string; lane: PhraseGhostLane; count: number}
interface Trie {count: number; children: Map<string, Trie>; literals: Literal[]}
const newNode = (): Trie => ({count: 0, children: new Map(), literals: []});
const LIMIT = 12;
const MIN_STEM = 7;
// Repetition is limited to connective vocabulary. A previously typed claim or identifier is not a phrase template.
const NEUTRAL_WORDS = new Set(('a about closer comparison detail different for hand here in look more note on other point ' +
  'reference related same side similar the this to view way with words worth').split(' '));

function addLiteral(root: Trie, literal: Literal): void {
  let node = root;
  for (const char of literal.text) {
    node.count += literal.count;
    let next = node.children.get(char);
    if (!next) node.children.set(char, next = newNode());
    node = next;
  }
  node.count += literal.count;
  node.literals.push(literal);
}

let cachedBank: {root: Trie; text: ReadonlySet<string>} | undefined;
function bank() {
  if (cachedBank) return cachedBank;
  const root = newNode();
  const texts = new Set(phrases.flatMap(text => [text, text[0].toLowerCase() + text.slice(1)]));
  for (const text of texts) addLiteral(root, {text, lane: 'approved', count: 1});
  cachedBank = {root, text: texts};
  return cachedBank;
}

function lookup(root: Trie, stem: string): Trie | undefined {
  let node: Trie | undefined = root;
  for (const char of stem) node = node?.children.get(char);
  return node;
}

function enumerate(node: Trie, list: Literal[]): void {
  for (const entry of node.literals) list.push(entry);
  for (const next of node.children.values()) {
    if (list.length > LIMIT) return;
    enumerate(next, list);
  }
}

type Context = {stem: string; start: number; paragraphStart: number; context: PhraseGhostContext};
export function phraseGhostContext(request: WritingAidRequest): Context | undefined {
  const {cursor, anchor} = request;
  // This lane has its own opt-in. Its edit still runs through the shared prose policy.
  if (!eligibleGhostContext(request) || !anchor || request.aid?.guardsUnavailable) return;
  const before = cursor.text;
  const lineStart = before.lastIndexOf('\n') + 1;
  const endSentence = [...before.slice(lineStart).matchAll(/[.!?][ \t]+/gu)].at(-1);
  const start = endSentence ? lineStart + endSentence.index + endSentence[0].length : lineStart;
  const stem = before.slice(start);
  if (stem.length < MIN_STEM || !/^[A-Za-z]+(?: [a-z]+)* ?$/u.test(stem) || !stem.includes(' ') ||
      start < anchor.start || !learnerAuthored(request.acceptedSpans, start, before.length) || hasProofChoiceGap(before.slice(0, start))) return;
  const paragraph = [...before.matchAll(/\n[ \t]*\n/gu)].at(-1);
  return {stem, start, paragraphStart: paragraph ? paragraph.index + paragraph[0].length : 0,
    context: stem.endsWith(' ') ? 'boundary' : 'prefix'};
}

function repeatedText(request: WritingAidRequest, context: Context, approvedText: ReadonlySet<string>): Trie {
  const repeated = newNode();
  const counts = new Map<string, number>();
  const prior = request.cursor.text.slice(context.paragraphStart, context.start);
  for (const match of prior.matchAll(/(?:^|[.!?][ \t]+|\n)(?=((?:[A-Z][a-z]*|[a-z]+)(?: [a-z]+){1,5}[,.!?]))/gu)) {
    const text = match[1];
    const start = context.paragraphStart + match.index + match[0].length;
    if (!text.startsWith(context.stem) || approvedText.has(text) || !learnerAuthored(request.acceptedSpans, start, start + text.length) ||
        !text.slice(0, -1).toLowerCase().split(' ').every(word => NEUTRAL_WORDS.has(word))) continue;
    counts.set(text, (counts.get(text) ?? 0) + 1);
  }
  for (const [text, count] of counts) addLiteral(repeated, {text, count, lane: 'repetition'});
  return repeated;
}

function meanTokenLog(node: Trie, insert: string): number {
  let current = node, log = 0, words = 0;
  // A unit of escape mass is retained at each trie node, including when
  // only one literal survives. The result is a ranking feature.
  for (const token of insert.match(/ ?[^ ]+/gu) ?? []) {
    words++;
    for (const char of token) {
      const child = current.children.get(char)!;
      log += Math.log((child.count + .25) / (current.count + 1 + .25 * current.children.size));
      current = child;
    }
  }
  return log / Math.max(1, words);
}

export interface PhraseGhostCandidate {
  readonly edit: MenuEdit;
  readonly lane: PhraseGhostLane;
  readonly context: PhraseGhostContext;
  readonly group: PhraseGhostGroup;
  readonly score: number;
  readonly meanTokenLog: number;
  readonly margin: number | null;
  readonly repetitions: number;
  readonly authoredLength: number;
  readonly labAdmitted: boolean;
}

export type PhraseGhostSearch =
  | {status: 'ineligible'; reason: 'context'}
  | {status: 'abstained'; reason: 'no-literal' | 'candidate-cap' | 'policy' | 'ambiguous'; rawCount: number; rawScore?: number}
  | {status: 'candidate'; candidate: PhraseGhostCandidate; rawCount: number; rawScore: number};

function proposal(request: WritingAidRequest, insert: string): WritingAidProposal {
  const {end} = request.cursor;
  return {...writingAidProposal(request, 'ghost', end, end, insert), source: 'phrase'};
}

function bounded(request: WritingAidRequest, insert: string) {
  return insert.length >= 5 && insert.length <= 32 && (insert.match(/[A-Za-z]+/gu)?.length ?? 0) <= 3 &&
    request.cursor.text.length + insert.length <= WRITING_AID_LIMIT;
}

export function phraseGhostProposal(request: WritingAidRequest, insert: string): WritingAidProposal | undefined {
  const candidate = proposal(request, insert);
  if (phraseGhostContext(request) && bounded(request, insert) && proposalEligible(request, candidate)) return candidate;
}

/** The worker sees the typed prefix only. Scores and ambiguity are computed before policy filtering. */
export function findPhraseGhost(request: WritingAidRequest): PhraseGhostSearch {
  const context = phraseGhostContext(request);
  if (!context) return {status: 'ineligible', reason: 'context'};
  const approved = bank();
  const raw = [approved.root, repeatedText(request, context, approved.text)].flatMap(root => {
    const node = lookup(root, context.stem);
    if (!node) return [];
    const literals: Literal[] = [];
    enumerate(node, literals);
    return literals.flatMap(literal => {
      const insert = literal.text.slice(context.stem.length);
      if (!insert) return [];
      const mean = meanTokenLog(node, insert);
      const score = mean + Math.min(context.stem.length, 24) * .05 - insert.length * .025 +
        (literal.lane === 'repetition' ? Math.log1p(literal.count) * .6 - .6 : 0);
      return [{...literal, insert, mean, score}];
    });
  }).sort((a, b) => b.score - a.score || a.text.localeCompare(b.text, 'en'));
  const rawCount = raw.length;
  if (!rawCount) return {status: 'abstained', reason: 'no-literal', rawCount};
  if (rawCount > LIMIT) return {status: 'abstained', reason: 'candidate-cap', rawCount};
  const best = raw[0];
  const rawScore = best.score;
  const next = raw.find(entry => entry.insert !== best.insert);
  const margin = next ? best.score - next.score : null;
  if (margin !== null && margin < .3) return {status: 'abstained', reason: 'ambiguous', rawCount, rawScore};
  if (!bounded(request, best.insert) || !proposalEligible(request, proposal(request, best.insert))) {
    return {status: 'abstained', reason: 'policy', rawCount, rawScore};
  }
  const repetitions = best.lane === 'repetition' ? best.count : 0;
  return {status: 'candidate', rawCount, rawScore, candidate: {
    edit: proposalEdit(proposal(request, best.insert)), lane: best.lane, context: context.context,
    group: phraseGhostGroup(best.lane, context.context, best.insert.length),
    score: best.score + Math.min(margin ?? .7, .7) * .4, meanTokenLog: best.mean, margin, repetitions,
    authoredLength: context.stem.length,
    labAdmitted: context.stem.length >= 9 && (margin === null || margin >= .7) &&
      (best.lane === 'approved' || repetitions >= 2),
  }};
}

export function typedPhraseProgress(old: WritingAidRequest, next: WritingAidRequest, insert: string): string | undefined {
  const {cursor: before, target: left} = old;
  const {cursor: after, target: right} = next;
  if (!eligibleGhostContext(next) || old.phraseGhost !== next.phraseGhost || old.contextKey !== next.contextKey ||
      old.aid !== next.aid || old.mastery !== next.mastery || old.mode !== next.mode || left.scopeKey !== right.scopeKey || left.mountId !== right.mountId ||
      left.modeRevision !== right.modeRevision || right.editorRevision !== left.editorRevision + 1 ||
      right.selectionRevision !== left.selectionRevision + 1 || after.end <= before.end || !after.text.startsWith(before.text) ||
      !learnerAuthored(next.acceptedSpans, before.end, after.end)) return;
  const typed = after.text.slice(before.end);
  if (insert.startsWith(typed)) return insert.slice(typed.length);
}
