import {describe,expect,it} from 'vitest';
import {enforceStressBudgets,unfinishedStressGates} from '../../scripts/stress-gate';
import type {StressMeasurement} from '../../scripts/stress-limits';

const base:StressMeasurement={
 route:'/atlas',nodes:1200,horizontalOverflow:0,smallText:0,smallMath:0,
 smallTargets:0,minCircleGap:8,durationMs:500,cpuThrottle:1,
 requestCount:0,transferBytes:0,
};

describe('FIX #507 hard-budget CI gate',()=>{
 it('fails on every hard-budget counterexample without an explicitly documented open issue',()=>{
  const failures:Partial<StressMeasurement>[]=[
   {smallText:1},{smallMath:1},{smallTargets:1},{minCircleGap:0},
   {nodes:1500},{horizontalOverflow:2},
   {durationMs:1500,cpuThrottle:4},
   {route:"/",requestCount:4},{route:"/insights",requestCount:2},
   {route:"/",transferBytes:200_001},
  ];
  for(const violation of failures){
   expect(()=>enforceStressBudgets([{...base,...violation}],{pending:[]}))
    .toThrow(/stress budget failed/);
  }
 });
 it('only defers an exact failure/route pair to a named issue',()=>{
  const pending=[{issue:485,failure:'maths below 16px',routes:['/atlas']}] as const;
  expect(()=>enforceStressBudgets([{...base,smallMath:1}],{pending})).not.toThrow();
  expect(()=>enforceStressBudgets([{...base,route:'/cards',smallMath:1}],{pending}))
   .toThrow(/maths below 16px/);
  expect(()=>enforceStressBudgets([{...base,smallMath:1,smallTargets:1}],{pending}))
   .toThrow(/tap target below 44px/);
 });
 it('fails QA-3 release even when a known issue is temporarily deferred in the baseline',()=>{
  const pending=[{issue:485,failure:'maths below 16px',routes:['/atlas']}] as const;
  expect(()=>enforceStressBudgets([{...base,smallMath:1}],{pending,release:true}))
   .toThrow(/#485/);
 });
 it('rejects silent/unnumbered exceptions and has a finite issue-linked pending list',()=>{
  // The list may become empty once Auditor closes every outstanding gate.
  expect(unfinishedStressGates.length).toBeLessThanOrEqual(12);
  expect(new Set(unfinishedStressGates.map(g=>g.issue+":"+g.failure+":"+g.routes.join(","))).size)
   .toBe(unfinishedStressGates.length);
  for(const item of unfinishedStressGates){
   expect(item.issue).toBeGreaterThan(0);
   expect(item.failure.length).toBeGreaterThan(0);
   expect(item.routes.length).toBeGreaterThan(0);
   expect(item.routes,'no wildcard exceptions: each deferred failure must name finite routes').not.toContain('*');
  }
  expect(()=>enforceStressBudgets([{...base,smallMath:1}],{
   pending:[{issue:0,failure:'maths below 16px',routes:['/atlas']}]
  })).toThrow(/invalid pending stress gate/);
  expect(()=>enforceStressBudgets([{...base,smallMath:1}],{
   pending:[{issue:485,failure:'maths below 16px',routes:['*']}]
  })).toThrow(/invalid pending stress gate/);
 });

 it('fails closed when first-render timing evidence is missing or non-finite',()=>{
  // A missing browser Performance mark must never turn a 4x CPU budget into
  // NaN < 1500 and silently pass the release gate.
  for(const durationMs of [Number.NaN,Number.POSITIVE_INFINITY,Number.NEGATIVE_INFINITY,-1]){
   expect(()=>enforceStressBudgets([{...base,route:'/',cpuThrottle:4,durationMs}],{pending:[]}))
    .toThrow(/invalid first render timing/);
  }
 });
 it('does not exempt already merged and Auditor-closed stress fixes',()=>{
  // Closed #506/#485/#510 and merged ST-4 #433 must not silently forgive
  // regressions in chart text, Atlas maths, Sources taps or Cards DOM.
  for(const issue of [506,485,510,433])
   expect(unfinishedStressGates.some(g=>g.issue===issue),
    'stale stress exemption for #'+issue).toBe(false);
  const examples:StressMeasurement[]=[
   {...base,route:'/insights',smallText:1},
   {...base,route:'/atlas',smallMath:1},
   {...base,route:'/p/real-analysis',smallTargets:1},
   {...base,route:'/cards',nodes:1500},
  ];
  for(const example of examples)
   expect(()=>enforceStressBudgets([example])).toThrow(/stress budget failed/);
 });
 it('closed audit #489 never exempts overlapping count marks from the default gate',()=>{
  expect(unfinishedStressGates.some(g=>g.issue===489)).toBe(false);
  expect(()=>enforceStressBudgets([{...base,route:'/atlas',minCircleGap:0}]))
   .toThrow(/marks closer than 8px/);
 });

});
