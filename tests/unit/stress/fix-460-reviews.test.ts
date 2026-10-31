import {describe,it,expect} from 'vitest';
import {makeStressInsightAggregate} from '../../../src/data/demo/stress';
import {buildInsights} from '../../../src/lib/insights';
import type {DemoStore} from '../../../src/data/demo/model';

const now=Date.UTC(2026,9,31,12);
function store(seed:number):DemoStore {
 return {seed,stressReviewCount:seed===2026103101?50000:seed===2026103102?300000:undefined,sessions:[],projects:[],subjects:[],checkpointEvents:[],misconceptions:[]} as unknown as DemoStore;
}

describe('FIX #460 bounded review-history stress aggregates',()=>{
 for(const [seed,total] of [[2026103101,50000],[2026103102,300000]] as const){
  it('represents '+total+' reviews without sending raw history to React',()=>{
   const aggregate=makeStressInsightAggregate(store(seed),90,now,'UTC',4);
   expect(aggregate).not.toBeNull();
   expect(aggregate!.reviews).toBe(total);
   expect(aggregate!.reviewDays).toHaveLength(90);
   expect(aggregate!.reviewDays.reduce((n,d)=>n+d.count,0)).toBe(total);
   expect(aggregate!.reviewDays.every(d=>d.count>0&&d.again+d.hard+d.good+d.easy===d.count&&d.right===d.count-d.again)).toBe(true);
   expect(aggregate!.calibration.reduce((n,c)=>n+c.total,0)).toBe(total);
   expect(aggregate!.calibration.reduce((n,c)=>n+c.right,0)).toBe(aggregate!.right);
   const view=buildInsights({aggregate:aggregate!,reviews:[],sessions:[],checkpointEvents:[],projects:[],misconceptions:[]},90);
   expect(view.reviews).toBe(total);
   expect(view.reviewBuckets.reduce((n,d)=>n+d.count,0)).toBe(total);
   expect(view.recall).toBeGreaterThan(0);
   expect(view.recall).toBeLessThan(1);
  });
  it('returns bounded 7- and 30-day windows with populated trends',()=>{
   for(const days of [7,30] as const){
    const aggregate=makeStressInsightAggregate(store(seed),days,now,'UTC',4)!;
    expect(aggregate.reviewDays).toHaveLength(days);
    expect(aggregate.reviews).toBeGreaterThan(0);
    expect(aggregate.reviews).toBeLessThan(total);
    expect(aggregate.reviewDays.reduce((n,d)=>n+d.count,0)).toBe(aggregate.reviews);
   }
  });
 }
 it('does not synthesize history for ordinary demo fixtures',()=>{
  expect(makeStressInsightAggregate(store(123),90,now,'UTC',4)).toBeNull();
 });
});
