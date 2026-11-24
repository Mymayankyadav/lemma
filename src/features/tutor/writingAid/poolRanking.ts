import {plainProse, trailingSpace, wordAtCaret} from '../input/completionPolicy';
import {tutorHint} from './answerAids';
import {scoreWritingAidProposal, type WritingAidModel} from './learning';
import {proposalEligible, writingAidProposal, writingAidProposalKey, WRITING_AID_LIMIT,
  type WritingAidProposal, type WritingAidRequest, type WritingAidSuggestions} from './policy';

const LEXICAL_WORD = /^[\p{L}\p{M}]+(?:['’\p{Pd}][\p{L}\p{M}]+)*$/u;

export interface WritingAidPool {
  readonly words: readonly WritingAidProposal[];
  readonly ghost: readonly WritingAidProposal[];
  readonly edit: readonly WritingAidProposal[];
}
/** A small morphological family heuristic avoids showing three near-identical endings. */
function family(proposal: WritingAidProposal): string {
  return proposal.label.toLocaleLowerCase().replace(/(?:ing|ers?|ed|es|s|ly|ment|ions?|al)$/u, '').slice(0, 5);
}

export function selectWritingAidPool(
  pool: WritingAidPool, model?: WritingAidModel,
  excluded: Readonly<Record<'words' | 'ghost' | 'edit', ReadonlySet<string>>> = {
    words: new Set(), ghost: new Set(), edit: new Set(),
  }, now = Date.now(),
): WritingAidSuggestions {
  function ranked(items: readonly WritingAidProposal[], omit: ReadonlySet<string>): WritingAidProposal[] {
    return items.map((proposal, index) => ({proposal, index,
      score: (proposal.score ?? 0) + (model ? scoreWritingAidProposal(model, proposal, now) : 0)}))
      .filter(({proposal}) => !omit.has(writingAidProposalKey(proposal)))
      .sort((a, b) => b.score - a.score || a.index - b.index).map(row => row.proposal);
  }
  const candidates = ranked(pool.words, excluded.words);
  const words: WritingAidProposal[] = [], families = new Set<string>();
  const unified = candidates.some(proposal => proposal.score !== undefined);
  // N221: a decoder word yields its family's slot to the existing engine's word (notation, not notate), and can still
  // fill a slot left over below.
  const engineFamilies = new Set(unified ? [] : candidates.filter(proposal => proposal.source !== 'decoder').map(family));
  for (const proposal of candidates) {
    const key = family(proposal);
    if (families.has(key) || proposal.source === 'decoder' && engineFamilies.has(key)) continue;
    words.push(proposal);
    families.add(key);
    if (words.length === 3) break;
  }
  for (const proposal of candidates) {
    if (words.length === 3) break;
    if (!words.includes(proposal)) words.push(proposal);
  }
  return {words, edit: ranked(pool.edit, excluded.edit)[0] ?? null, ghost: ranked(pool.ghost, excluded.ghost)[0] ?? null};
}

/** Neural log events cover complete word extensions, including a boundary. */
export function applyNeuralReply(pool: WritingAidPool, request: WritingAidRequest,
  reply: import('./decoder/neural.worker').NeuralReply): WritingAidPool {
  const scoreMap = new Map(reply.scores?.map(([word, score]) => [word.toLowerCase(), score]));
  const matched = pool.words.filter(item => item.source !== 'symbol' && scoreMap.has(item.label.toLowerCase()));
  // Partial worker replies never penalize an unscored candidate. Unscored
  // entries keep their language score and a covered group reranks in place.
  const weight = reply.blendWeight ?? .5;
  const mixed = (item: WritingAidProposal, neural: number) => {
    const tutor = item.tutorAdjustment ?? 0;
    return (1 - weight) * ((item.score ?? -16) - tutor) + weight * neural + tutor;
  };
  const rescored = matched.map(item => ({...item, score: mixed(item, scoreMap.get(item.label.toLowerCase())!)}));
  const offset = rescored.length ? (matched.reduce((sum, item) => sum + (item.score ?? -16), 0) -
    rescored.reduce((sum, item) => sum + item.score, 0)) / rescored.length : 0;
  const changed = new Map(rescored.map(item => [writingAidProposalKey(item), {...item, score: item.score + offset}]));
  const words = pool.words.map(item => changed.get(writingAidProposalKey(item)) ?? item);
  if (request.anchor && rescored.length >= 2) {
    const {cursor} = request;
    const prefix = wordAtCaret(cursor) ?? '';
    const start = cursor.end - prefix.length;
    const before = cursor.text.slice(0, start);
    const existing = new Set(pool.words.map(item => item.label.toLowerCase()));
    const lexiconPrior = Math.min(-12, ...matched.map(item => item.score ?? -16));
    for (const [word, neural] of reply.scores ?? []) {
      if (existing.has(word.toLowerCase()) || !LEXICAL_WORD.test(word) || !word.toLowerCase().startsWith(prefix.toLowerCase()) ||
          word.length <= prefix.length || start < request.anchor.start || !prefix && !/\s$/u.test(before) ||
          prefix && !plainProse(cursor, prefix) || request.mode === 'strict' && prefix.length < 4) continue;
      const hint = tutorHint({aid: request.aid, mastery: request.mastery, subject: request.subject, step: request.step,
        mode: 'prose', before, prefix}, word);
      const insert = word + trailingSpace(cursor.text.slice(cursor.end));
      const candidate: WritingAidProposal = {...writingAidProposal(request, 'word', start, cursor.end, insert, word),
        source: 'neural', role: hint.role, tutorAdjustment: hint.adjustment,
        score: (1 - weight) * lexiconPrior + weight * neural + hint.adjustment + offset};
      if (cursor.text.length - prefix.length + insert.length <= WRITING_AID_LIMIT && proposalEligible(request, candidate)) words.push(candidate);
    }
  }
  let ghost = pool.ghost;
  if (reply.continuation && request.cursor.end === request.cursor.text.length && request.anchor && !request.anchor.continuation && request.mode !== 'strict') {
    const {end} = request.cursor;
    const proposal: WritingAidProposal = {...writingAidProposal(request, 'ghost', end, end, reply.continuation.text),
      source: 'neural', score: reply.continuation.logProbability};
    if (proposalEligible(request, proposal)) ghost = [proposal];
  }
  return {words: words.sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity)).slice(0, 64), ghost, edit: pool.edit};
}
