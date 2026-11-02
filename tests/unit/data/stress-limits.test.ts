import { describe, expect, it } from 'vitest';
import { stressViolations, type StressMeasurement } from '../../../scripts/stress-limits';

const healthy: StressMeasurement = {
 route:'/', nodes:1200, horizontalOverflow:0, smallText:0, smallMath:0,
 smallTargets:0, minCircleGap:9, durationMs:1200, cpuThrottle:4,
 requestCount:3, transferBytes:180_000,
};

describe('ST-0 hard acceptance budgets', () => {
 it('accepts a route meeting all limits', () => {
  expect(stressViolations(healthy)).toEqual([]);
 });
 it('reports every independent layout and performance violation', () => {
  expect(stressViolations({
   ...healthy, nodes:1500, horizontalOverflow:2, smallText:1,
   smallMath:1, smallTargets:1, minCircleGap:7,
   durationMs:4000, requestCount:4, transferBytes:200_001,
  })).toEqual([
   'horizontal overflow', '1500 DOM nodes', 'text below 12px',
   'maths below 16px', 'tap target below 44px',
   'marks closer than 8px', '4x CPU first render >= 4s',
   'Today exceeds 3 API requests', 'aggregate transfer exceeds 200kB',
  ]);
 });
 it('applies the one-request budget to Insights and not unrelated routes', () => {
  expect(stressViolations({...healthy, route:'/insights', requestCount:2}))
   .toContain('Insights exceeds 1 API request');
  expect(stressViolations({...healthy, route:'/atlas', requestCount:20, transferBytes:300_000}))
   .toEqual([]);
 });
 it('only enforces 4x CPU timing on throttled samples', () => {
  expect(stressViolations({...healthy, durationMs:2000, cpuThrottle:1})).toEqual([]);
 });
});
