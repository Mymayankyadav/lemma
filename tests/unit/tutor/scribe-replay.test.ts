import {describe, expect, it} from 'vitest';
import {padEdit} from '../../../src/features/pad/padEdit';
import {notationSuggestions} from '../../../src/features/tutor/notation';
import {capture, displays, expectedRandom, fixtures, makeReport, rankMetrics, top} from '../../../scripts/scribe-replay.mjs';

const row = (id: string) => fixtures.find((entry: {id: string}) => entry.id === id)!;

describe('N217 synthetic rank replay', () => {
  it('captures the actual shipped N201 engine order without telling it the target', () => {
    for (const fixture of fixtures) {
      const captureResult = capture(fixture);
      expect(captureResult.engineOrder).toEqual(notationSuggestions(padEdit(fixture.input), [], []).map(c => c.text));
      expect(capture({...fixture, target: 'unrelated', blocked: ['invented']})).toEqual(captureResult);
      expect(Object.isFrozen(captureResult.safePool)).toBe(true);
    }
  });

  it('distinguishes recall from the final top three and catches a deliberate rank mutation', () => {
    const fixture = row('six-first');
    const result = capture(fixture);
    expect(result.safePool).toEqual(['prove', 'proof', 'proves', 'proving', 'proposition', 'preimage']);
    expect(rankMetrics(displays(fixture, result).safeBaseline, 'prove')).toEqual([1, 1, 6]);
    expect(rankMetrics(displays(fixture, result).safeBaseline, 'preimage')).toEqual([0, 0, 0]);
    expect(rankMetrics(top([...result.safePool].reverse(), false), 'prove')).toEqual([0, 0, 0]);
    expect(rankMetrics(top(['proof', 'proves', 'prove'], false), 'prove')).toEqual([0, 1, 2]);
    expect(rankMetrics(displays(row('six-last'), result).oracle, 'preimage')).toEqual([1, 1, 6]);
  });

  it('matches exact chance against exhaustive permutations of the six real candidates', () => {
    function* permute(values: string[]): Generator<string[]> {
      if (!values.length) yield [];
      for (const value of values) {
        for (const tail of permute(values.filter(item => item !== value))) yield [value, ...tail];
      }
    }
    const pool: readonly string[] = capture(row('six-first')).safePool;
    let permutations = 0;
    const totals = [0, 0, 0];
    for (const list of permute([...pool])) {
      rankMetrics(top(list, false), 'prove').forEach((value: number, index: number) => { totals[index] += value; });
      permutations += 1;
    }
    expect(permutations).toBe(720);
    expect(totals).toEqual([120, 360, 1320]); // Third total is MRR scaled by 6.
    expect(expectedRandom(pool, 'prove')).toEqual([[1n, 6n], [1n, 2n], [11n, 36n]]);
    expect(makeReport().byEligiblePoolSize['6'].exactUniformChance).toEqual({top1: '1/6', top3: '1/2', mrr3: '11/36'});
  });

  it('handles smaller pools, empty pools, missing targets and suppression without changing denominators', () => {
    expect(expectedRandom(['x'], 'x')).toEqual([[1n, 1n], [1n, 1n], [1n, 1n]]);
    expect(expectedRandom(['x', 'y'], 'x')).toEqual([[1n, 2n], [1n, 1n], [3n, 4n]]);
    const miss = [[0n, 1n], [0n, 1n], [0n, 1n]];
    expect(expectedRandom([], 'x')).toEqual(miss);
    expect(expectedRandom(['y'], 'x')).toEqual(miss);
    expect(expectedRandom(['x'], 'x', true)).toEqual(miss);
    const fixture = row('hidden');
    const result = capture(fixture);
    expect(result.safePool).toContain('finite');
    expect(Object.values(displays(fixture, result)).every(list => (list as string[]).length === 0)).toBe(true);
    expect(makeReport().byEligiblePoolSize['2'].suppressed).toBe(1);
  });

  it('checks known blocked proof choices before any experimental suggestion is shown', () => {
    expect(makeReport().labelledProbes).toEqual({total: 3, unfilteredEngineOpportunities: 3, filteredOpportunities: 0});
    for (const fixture of fixtures.filter((entry: {blocked?: string[]}) => entry.blocked)) {
      const result = capture(fixture);
      const output = displays(fixture, result);
      expect(fixture.blocked.some((text: string) => result.engineOrder.includes(text))).toBe(true);
      for (const lane of [result.safePool, output.safeBaseline, output.shuffled, output.oracle]) {
        expect(fixture.blocked.some((text: string) => lane.includes(text))).toBe(false);
      }
    }
  });

  it('reports fixed, disjoint denominators and deterministic controlled shuffles', () => {
    const result = makeReport();
    expect(result).toEqual(makeReport());
    expect(result.all.opportunities).toBe(12);
    expect(result.occurrencePoolRecall).toEqual({reachable: 8, total: 10});
    expect(Object.keys(result.byPrefix)).toEqual(['0', '1', '2', '3']);
    expect(result.all.shuffled).not.toEqual(result.all.safeBaseline);
  });
});
