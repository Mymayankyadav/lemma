import {describe, expect, it, vi} from 'vitest';
import {controlOrder, deriveWordTargets, displayedRank, meanMetrics, measureWordReplays,
  type PrefixOpportunity, type WordReplay} from '../../../scripts/writing-decoder/metrics';

function replay(target: string, changes: Record<number, Omit<PrefixOpportunity, 'prefixLength'>> = {}, id = target): WordReplay {
  return {id, target, opportunities: Array.from({length: target.length}, (_, prefixLength) =>
    ({prefixLength, pool: [], displayed: [], ...changes[prefixLength]}))};
}

describe('all-prefix development measurement', () => {
  it('derives complete word tasks without changing the original fixture or its mode', () => {
    const probe = Object.freeze({id: 'one', text: 'The notat', intended: 'notation', mode: 'strict' as const});
    expect(deriveWordTargets([probe])).toEqual([{
      id: 'one', context: 'The ', target: 'notation', mode: 'strict', originalPrefixLength: 5,
    }]);
    expect(probe.text).toBe('The notat');
    expect(() => deriveWordTargets([probe, probe])).toThrow(/duplicate/u);
    expect(() => deriveWordTargets([{...probe, intended: 'numerator'}])).toThrow(/Invalid/u);
    expect(() => deriveWordTargets([{...probe, text: 'The notation'}])).toThrow(/Invalid/u);
  });

  it('distinguishes any-prefix pool presence, displayed rank, and the acceptance tap cost', () => {
    const data = replay('abc', {
      1: {pool: ['other', 'abc'], displayed: ['other', 'abc']},
      2: {pool: ['abc', 'other'], displayed: ['abc', 'other']},
    });
    const result = measureWordReplays([data]);
    expect(result.anyPrefixPoolRecall).toBe(1);
    expect(result.byPrefix[1]).toMatchObject({opportunities: 1, top1Accuracy: 0, top3Accuracy: 1, mrrAt3: .5});
    expect(result.byPrefix[2]).toMatchObject({opportunities: 1, top1Accuracy: 1, top3Accuracy: 1, mrrAt3: 1});
    expect(result.byPrefix[3]).toMatchObject({opportunities: 0, top1Accuracy: null, mrrAt3: null});
    expect(result.overallMrrAt3).toBe(.5);
    expect(result.idealSavings[0]).toEqual({k: 1, targetCharacters: 3,
      charactersNotTyped: 1, acceptanceTaps: 1, netTapsSaved: 0, savingsFraction: 0});
    expect(result.idealSavings[1]).toEqual({k: 3, targetCharacters: 3,
      charactersNotTyped: 2, acceptanceTaps: 1, netTapsSaved: 1, savingsFraction: 1 / 3});
  });

  it('keeps missing tasks and shorter-word denominators instead of scoring only opportunities that offered', () => {
    const result = measureWordReplays([
      replay('abc', {1: {pool: ['abc'], displayed: ['abc']}}),
      replay('wxyz'),
    ]);
    expect(result).toMatchObject({targetTasks: 2, prefixOpportunities: 7, anyPrefixPoolHits: 1, anyPrefixPoolRecall: .5});
    expect(result.byPrefix[1]).toMatchObject({opportunities: 2, top1Hits: 1, top1Accuracy: .5, mrrAt3: .5});
    expect(result.byPrefix[3]).toMatchObject({opportunities: 1, top1Accuracy: 0});
    expect(result.idealSavings[0]).toMatchObject({targetCharacters: 7, netTapsSaved: 1, savingsFraction: 1 / 7});
    expect(result.overallMrrAt3).toBe(1 / 7);
  });

  it('does not equate candidate-pool recall with displayed accuracy or saved taps', () => {
    const input = replay('word', {1: {pool: ['a', 'b', 'c', 'word'], displayed: ['a', 'b', 'c']}});
    const result = measureWordReplays([input]);
    expect(result.anyPrefixPoolRecall).toBe(1);
    expect(result.overallMrrAt3).toBe(0);
    expect(result.idealSavings.every(row => row.netTapsSaved === 0)).toBe(true);
    expect(displayedRank(input.opportunities[1], 'word')).toBe(0);
  });

  it('makes deliberate ranking degradation change MRR, top-k accuracy and savings', () => {
    const pool = Object.freeze(['word', 'a', 'b', 'c']);
    const make = (ordering: readonly string[]) => replay('word', {1: {pool, displayed: ordering.slice(0, 3)}});
    const actual = measureWordReplays([make(pool)]);
    const degraded = measureWordReplays([make(controlOrder(pool, item => item, 'word', 'degraded'))]);
    const oracle = measureWordReplays([make(controlOrder([...pool].reverse(), item => item, 'word', 'oracle'))]);
    expect(actual.byPrefix[1].top3Accuracy).toBe(1);
    expect(degraded.byPrefix[1].top3Accuracy).toBe(0);
    expect(actual.overallMrrAt3).toBeGreaterThan(degraded.overallMrrAt3);
    expect(actual.idealSavings[1].netTapsSaved).toBeGreaterThan(degraded.idealSavings[1].netTapsSaved);
    expect(oracle).toEqual(actual);
    expect(pool).toEqual(['word', 'a', 'b', 'c']);
  });

  it('keeps oracle recall bounded by its original pool and random controls reproducible', () => {
    const pool = Object.freeze(['a', 'b', 'c', 'd', 'e', 'f']);
    const random = vi.spyOn(Math, 'random').mockImplementation(() => {throw new Error('ambient randomness forbidden');});
    try {
      const first = controlOrder(pool, item => item, 'missing', 'random', 17, 'task/2');
      expect(controlOrder(pool, item => item, 'missing', 'random', 17, 'task/2')).toEqual(first);
      expect([...first].sort()).toEqual(pool);
      expect(controlOrder(pool, item => item, 'missing', 'oracle')).toEqual(pool);
      expect(controlOrder(pool, item => item, 'd', 'oracle')[0]).toBe('d');
      expect(pool).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    } finally {random.mockRestore();}
  });

  it('rejects incomplete trajectories and oracle-like hallucinated displays', () => {
    expect(() => measureWordReplays([{...replay('abc'), opportunities: []}])).toThrow(/every prefix/u);
    expect(() => measureWordReplays([replay('abc', {1: {pool: ['other'], displayed: ['abc']}})])).toThrow(/outside/u);
    expect(() => measureWordReplays([replay('abc'), replay('abc')])).toThrow(/distinct/u);
    expect(() => measureWordReplays([replay('abc', {1: {pool: ['abc', 'abc'], displayed: ['abc']}})])).toThrow(/Invalid/u);
  });

  it('averages reorderings without treating random seeds as extra independent tasks', () => {
    const pool = ['abc', 'other'];
    const first = measureWordReplays([replay('abc', {1: {pool, displayed: ['abc', 'other']}})]);
    const second = measureWordReplays([replay('abc', {1: {pool, displayed: ['other', 'abc']}})]);
    const mean = meanMetrics([first, second]);
    expect(mean).toMatchObject({targetTasks: 1, prefixOpportunities: 3, anyPrefixPoolHits: 1});
    expect(mean.byPrefix[1]).toMatchObject({opportunities: 1, top1Hits: .5, top1Accuracy: .5, top3Accuracy: 1, mrrAt3: .75});
  });

  it('rejects controls with changed eligible-pool coverage or denominators', () => {
    const original = measureWordReplays([replay('abc')]);
    const differentPool = measureWordReplays([replay('abc', {1: {pool: ['abc'], displayed: ['abc']}})]);
    expect(() => meanMetrics([original, differentPool])).toThrow(/eligible-pool/u);
    const differentPrefix = structuredClone(original);
    differentPrefix.byPrefix[1].opportunities = 2;
    expect(() => meanMetrics([original, differentPrefix])).toThrow(/denominators/u);
    const differentCharacters = structuredClone(original);
    differentCharacters.idealSavings[0].targetCharacters = 10;
    expect(() => meanMetrics([original, differentCharacters])).toThrow(/denominators/u);
  });
});
