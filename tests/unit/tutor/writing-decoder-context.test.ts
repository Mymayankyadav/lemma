import {describe, expect, it} from 'vitest';
import {readFileSync} from 'node:fs';
import {padEdit} from '../../../src/features/pad/padEdit';
import {predictWritingAidPool, selectWritingAidPool, writingDecoderPrefix} from '../../../src/features/tutor/writingAid/engine';
import {createDecoderLexicon, parseDecoderLexicon, searchDecoderLexicon} from '../../../src/features/tutor/writingAid/decoder/lexicon';
import type {WritingAidRequest} from '../../../src/features/tutor/writingAid/policy';
import lexicon from '../../../public/models/writing-decoder/unigram-v1/lexicon.json';
import {createCorpusContextScorer, type CorpusContextConfig, type CorpusContextRanks} from '../../../src/features/tutor/writingAid/vendor/corpus-context.mjs';
import {candidates as wordCandidates} from '../../../src/features/tutor/writingAid/vendor/words.mjs';

const index = createDecoderLexicon(parseDecoderLexicon(lexicon));
const request = (text: string, overrides: Partial<WritingAidRequest> = {}): WritingAidRequest => ({
  cursor: padEdit(text), anchor: {text, start: 0}, mode: 'fast', composing: false, readOnly: false,
  target: {scopeKey: 'context-regression', mountId: 'test', editorRevision: 1, selectionRevision: 1, modeRevision: 1},
  ...overrides,
});
const candidates = (input: WritingAidRequest) => searchDecoderLexicon(index, writingDecoderPrefix(input)!, 64);
const labels = (input: WritingAidRequest, expanded = true) => selectWritingAidPool(
  predictWritingAidPool(input, undefined, expanded ? candidates(input) : undefined),
).words.map(item => item.label);

describe('decoder preservation of existing context ranking', () => {
  it('keeps the existing contextual winner when a larger unigram prior would reverse it', () => {
    const input = request('I think the res');
    const retrieved = new Map(candidates(input).map(item => [item.word, item.frequency]));
    expect(retrieved.get('respect')).toBeGreaterThan(retrieved.get('result')!);
    expect(labels(input, false)[0]).toBe('result');
    expect(labels(input)[0]).toBe('result');
  });
  it.each([
    ['The, res', 'result'], ['THE RES', 'RESULT'], ['With resp', 'respect'],
    ['For exam', 'example'], ['res', 'respect'], ['Zebra res', 'respect'],
  ])('uses existing context, capitalization and absent-context behavior for %s', (text, expected) => {
    expect(labels(request(text))[0]).toBe(expected);
  });
  it('never reaches before the learner-owned start or beyond the existing 1024-character window', () => {
    const text = 'the res';
    expect(labels(request(text))[0]).toBe('result');
    expect(labels(request(text, {anchor: {text, start: 4}}))[0]).toBe('respect');
    const beyondWindow = 'the ' + ' '.repeat(1024) + 'res';
    expect(labels(request(beyondWindow))[0]).toBe('respect');
  });
  it('retains vetted lane priority even when another admitted word has a much larger prior', () => {
    const input = request('Could you expl');
    const pool = predictWritingAidPool(input, undefined, [
      {word: 'explicit', frequency: 1_000_000}, {word: 'explain', frequency: 1},
    ]);
    expect(selectWritingAidPool(pool).words[0].label).toBe('explain');
  });
  it('changes ordering without changing the existing admitted candidate sets', () => {
    // Captured before this correction; these are implementation regressions, not held-out evaluation.
    const before = [
      ['I think the res', ['result', 'respect', 'restrict', 'respectively', 'residue']],
      ['With resp', ['respect', 'response', 'respectively', 'respond', 'respire', 'respell']],
      ['I am reco', ['record', 'recorded', 'recording', 'recognize', 'reconcile', 'recon', 'recompile', 'recoin', 'recomb']],
      ['For exam', ['example', 'examples', 'examined', 'examine', 'examiner', 'examinee', 'examinant']],
    ] as const;
    for (const [text, expected] of before) {
      const input = request(text);
      expect(predictWritingAidPool(input, undefined, candidates(input)).words.map(item => item.label).sort()).toEqual([...expected].sort());
    }
  });
  it('does not let strong context evidence admit a weakly typed proof property', () => {
    const input = request('The function is cont');
    const pool = predictWritingAidPool(input, undefined, candidates(input));
    for (const word of ['continuous', 'continuity', 'continuously']) {
      expect(pool.words.map(item => item.label)).not.toContain(word);
    }
  });
});

// Literal pre-refactor arithmetic, kept independent of the shared helper.
function oldContextScore(left: string, word: string, prior: number, ranks?: CorpusContextRanks | null,
  config: CorpusContextConfig = {}) {
  const ranker = config.ranker ?? 'manual', contextWords = config.contextWords ?? 1;
  const previousWords = ranker === 'corpus' && contextWords > 0 ? (left.toLocaleLowerCase().match(/[\p{L}\p{M}]+/gu) || []) : [];
  const lastPair = previousWords.slice(-2).join(' ');
  let score = prior;
  if (ranker === 'corpus' && ranks) {
    if (contextWords >= 1 && previousWords.length) score += Math.log1p(ranks.bigram?.[previousWords.at(-1)! + ' ' + word] || 0) * 28;
    if (contextWords >= 2 && previousWords.length >= 2) score += Math.log1p(ranks.trigram?.[lastPair + ' ' + word] || 0) * 35;
  }
  return score;
}

const contextRanks = {
  bigram: {'the result': 234, 'the respect': 0, 'with respect': 675, 'é result': 17},
  trigram: {'with the result': 100, 'with the respect': 4, 'café é result': 8},
};
const contexts = ['', 'the ', 'with ', 'with the ', 'WITH, THE!\n', 'the 123 ', 'CAFÉ é '];
describe('shared context formula and original-engine parity', () => {
  it.each(contexts)('matches the literal original formula bit for bit for left context %j', left => {
    const configs = [{}, {ranker: 'corpus'}, {ranker: null, contextWords: null},
      ...['manual', 'off', 'corpus'].flatMap(ranker => [0, 1, 2].map(contextWords => ({ranker, contextWords})))];
    for (const config of configs) for (const ranks of [undefined, null, {}, contextRanks]) {
      const score = createCorpusContextScorer(left, ranks, config);
      for (const word of ['result', 'respect', 'missing', 'RESULT']) for (const prior of [0, 153, Math.log1p(595) * 14, 2 ** 53]) {
        expect(score(word, prior)).toBe(oldContextScore(left, word, prior, ranks, config));
      }
    }
  });
  it('uses the previous one or two complete tokens and never turns the typed stem into context', () => {
    const prior = 153;
    expect(createCorpusContextScorer('with the ', contextRanks, {ranker: 'corpus', contextWords: 1})('result', prior))
      .toBe(prior + Math.log1p(234) * 28);
    expect(createCorpusContextScorer('with the ', contextRanks, {ranker: 'corpus', contextWords: 2})('result', prior))
      .toBe((prior + Math.log1p(234) * 28) + Math.log1p(100) * 35);
    expect(createCorpusContextScorer('the ', contextRanks, {ranker: 'corpus', contextWords: 2})('result', prior))
      .toBe(prior + Math.log1p(234) * 28);
  });
  it('preserves whole baseline predictions against the immutable original source across config and punctuation cases', async () => {
    const source = readFileSync('scripts/writing-decoder/sources/baseline-words.mjs.txt');
    const original = await import(/* @vite-ignore */ 'data:text/javascript;base64,' + source.toString('base64'));
    const vocabulary = ['recast', 'record', 'recount', 'recreate', 'recruit', 'recycle'];
    const assets = {words: vocabulary, common: vocabulary, next: {the: ['record', 'recount']},
      ranks: {unigram: {recast: 4, record: 12, recount: 2, recreate: 7, recruit: 0, recycle: 2},
        bigram: {'the recast': 200, 'the record': 1, 'with record': 20, 'the reconstruct': 1_000_000},
        trigram: {'with the recreate': 300, 'café é recycle': 20}}};
    for (const left of contexts) for (const prefix of ['rec', 'REC']) for (const ranker of ['manual', 'off', 'corpus']) {
      for (const contextWords of [0, 1, 2]) {
        const config = {ranker, contextWords, researchPool: true, maxCandidates: 6};
        const opts = {mode: 'fast', authoredText: '', recent: ['record']};
        const actual = wordCandidates(left + prefix, opts, assets, config);
        expect(actual).toEqual(original.candidates(left + prefix, opts, assets, config));
        expect(actual.keys.map((item: {word: string}) => item.word.toLowerCase())).not.toContain('reconstruct');
      }
    }
  });
});
