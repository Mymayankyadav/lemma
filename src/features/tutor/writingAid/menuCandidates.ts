import {effectiveAidLevel, type TutorAnswerAid} from '../../../../supabase/functions/_shared/tutor-answer-aids';
import {scanPad} from '../../pad/padEdit';
import {trailingSpace} from '../input/completionPolicy';
import {learnerAuthored, proseSymbol} from './menuEdit';
import {type AidRankingContext} from './answerAids';
import {type WritingAidRequest} from './policy';

const TOKEN = /(?<![\p{L}\p{M}\p{N}_\\])\p{L}[\p{L}\p{M}]*(?:['’\p{Pd}][\p{L}\p{M}]+)*(?![\p{L}\p{M}\p{N}_])/gu;
const PUNCTUATION = /^[,.;:!?…]/u;
const MAX_LITERAL = 32;
const MAX_TERMS = 48;
const MAX_COPY = 12;
const COPY_WINDOW = 640;

export interface MenuCandidate {
  readonly text: string;
  readonly word: string;
  readonly insert: string;
  readonly source: 'question' | 'paragraph' | 'literal' | 'declared';
}

interface LiteralRemainder {
  readonly text: string;
  readonly first: string;
}

// The worker sees a newly cloned aid on each edit. Keep only the current turn's
// openings. Keys contain the supplied bytes through the separator before a word.
let cachedWording: {key: string; openings: Map<string, LiteralRemainder[]>} | undefined;
function wordingOpenings(aid: TutorAnswerAid): ReadonlyMap<string, readonly LiteralRemainder[]> {
  const wording = aid.wording.slice(0, 24);
  const key = JSON.stringify([aid.turnId, aid.id, aid.version, wording]);
  if (cachedWording?.key === key) return cachedWording.openings;
  const openings = new Map<string, LiteralRemainder[]>();
  for (const item of wording) {
    const phrase = item.trim().slice(0, 80);
    const words = [...phrase.matchAll(/\S+/gu)];
    for (let i = 1; i < Math.min(5, words.length); i++) {
      const first = words[i][0];
      if (!/^\p{L}/u.test(first)) continue;
      const opening = phrase.slice(0, words[i].index);
      const entries = openings.get(opening) ?? [];
      for (let j = i; j < Math.min(i + 3, words.length); j++) {
        const text = phrase.slice(words[i].index, words[j].index + words[j][0].length);
        if (text.length <= MAX_LITERAL) entries.push({text, first});
      }
      openings.set(opening, entries);
    }
  }
  cachedWording = {key, openings};
  return openings;
}

function candidateInsert(text: string, suffix: string): string | undefined {
  const punctuated = PUNCTUATION.test(text.slice(-1));
  if (punctuated && PUNCTUATION.test(suffix.trimStart())) return;
  // A middle edit may end just before an existing occurrence. Do not duplicate
  // that word or punctuation or consume either one's range.
  const tail = text.trimEnd().split(/\s+/u).at(-1)?.replace(/[,.!?;:…]+$/u, '');
  const next = /^\s*([\p{L}\p{M}\p{N}_]+)/u.exec(suffix)?.[1];
  if (tail && next && tail === next) return;
  return text + (punctuated && !suffix ? '' : trailingSpace(suffix));
}

export function literalMenuCandidates(request: WritingAidRequest, context: AidRankingContext): MenuCandidate[] {
  const {aid, before, prefix, mastery} = context;
  if (!aid || effectiveAidLevel(aid.level, mastery) !== 'scaffold' || request.anchor?.continuation) return [];
  const result: MenuCandidate[] = [];
  const openings = wordingOpenings(aid);
  const window = before.slice(-81);
  const matched = [...window.matchAll(/(?<![\p{L}\p{M}\p{N}_])\p{L}/gu)].slice(-40);
  const suffix = request.cursor.text.slice(request.cursor.end);
  for (const mark of matched) {
    const start = before.length - window.length + mark.index;
    const opening = before.slice(start);
    const rows = openings.get(opening);
    if (!rows || start < (context.anchorStart ?? 0) ||
        !learnerAuthored(request.acceptedSpans, start, request.cursor.end)) continue;
    for (const {text, first} of rows) {
      if (!first.startsWith(prefix) || text === prefix) continue;
      const insert = candidateInsert(text, suffix);
      if (insert !== undefined) result.push({text, word: first.replace(/[,.!?;:…]+$/u, ''), insert, source: 'literal'});
      if (result.length >= MAX_COPY) return result;
    }
  }
  return result;
}

function collectCopyTerms(value: string, start: number, request: WritingAidRequest, source: 'question' | 'paragraph',
  prefix: string, suffix: string, output: Map<string, MenuCandidate>, counts: Map<string, number>) {
  let offset = start, inspected = 0;
  for (const part of scanPad(value)) {
    if (part.kind === 'text') for (const match of part.source.matchAll(TOKEN)) {
      const word = match[0], from = offset + match.index;
      if (++inspected > MAX_TERMS) return;
      if (word.length < 2 || word.length > MAX_LITERAL) continue;
      if (source === 'question' || learnerAuthored(request.acceptedSpans, from, from + word.length)) {
        const key = word.toLowerCase();
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      if (!word.startsWith(prefix) || word === prefix) continue;
      const punctuation = part.source.slice(match.index + word.length).match(PUNCTUATION)?.[0] ?? '';
      for (const text of punctuation ? [word, word + punctuation] : [word]) {
        if (source === 'paragraph' && !learnerAuthored(request.acceptedSpans, from, from + text.length)) continue;
        const insert = candidateInsert(text, suffix);
        if (insert !== undefined && !output.has(insert)) output.set(insert, {text, word, insert, source});
      }
    }
    offset += part.source.length;
  }
}

/** Bound local copies to visible text and the independently authored current paragraph. */
export function prepareMenuCopies(request: WritingAidRequest, before: string, prefix: string, score: (word: string) => number) {
  const suffix = request.cursor.text.slice(request.cursor.end);
  const question = new Map<string, MenuCandidate>(), paragraph = new Map<string, MenuCandidate>();
  const questionCounts = new Map<string, number>(), paragraphCounts = new Map<string, number>();
  for (const text of request.question?.slice(0, 3) ?? []) {
    if (text) collectCopyTerms(text.slice(0, COPY_WINDOW), 0, request, 'question', prefix, suffix, question, questionCounts);
  }
  const breaks = [...before.matchAll(/\n[ \t]*\n/gu)];
  const prior = breaks.at(-1);
  const start = prior ? prior.index + prior[0].length : 0;
  const bounded = Math.max(start, before.length - COPY_WINDOW);
  const edge = bounded === start ? 0 : (before.slice(bounded).search(/\s/u) + 1 || before.length - bounded);
  collectCopyTerms(before.slice(bounded + edge), bounded + edge, request, 'paragraph', prefix, suffix, paragraph, paragraphCounts);
  const best = (items: Map<string, MenuCandidate>) => [...items.values()].map(item => ({
    item, prior: score(item.word.toLowerCase()) - Number(item.word !== item.text) * Math.log(4),
  })).sort((a, b) => b.prior - a.prior).slice(0, MAX_COPY).map(row => row.item);
  return {
    candidates: [...best(question), ...best(paragraph)],
    recurrence(word: string): readonly [number, number] {
      const key = word.toLowerCase().match(TOKEN)?.[0] ?? '';
      return [questionCounts.get(key) ?? 0, paragraphCounts.get(key) ?? 0];
    },
  };
}

/** Only a unique, unbound declaration may extend a prose identifier. */
export function declaredMenuCandidates(request: WritingAidRequest, context: AidRankingContext): MenuCandidate[] {
  const {aid, before, prefix, mastery} = context;
  if (!prefix || !aid || effectiveAidLevel(aid.level, mastery) === 'none' ||
      !learnerAuthored(request.acceptedSpans, request.cursor.end - prefix.length, request.cursor.end)) return [];
  const declarations = aid.ranking?.declaredSymbols ?? [];
  const counts = new Map<string, number>();
  for (const item of declarations) counts.set(item.symbol, (counts.get(item.symbol) ?? 0) + 1);
  const suffix = request.cursor.text.slice(request.cursor.end);
  if (/^\s*(?:[_^$\\]|\p{Math})/u.test(suffix)) return [];
  return declarations.filter(({symbol, binder}) =>
    !binder && counts.get(symbol) === 1 && symbol.startsWith(prefix) && symbol !== prefix)
    .slice(0, 8).map(({symbol}) => ({text: symbol, word: symbol,
      insert: proseSymbol(before, symbol, trailingSpace(suffix), request.acceptedSpans), source: 'declared'}));
}
