import {describe,expect,it} from 'vitest';
import {layoutMiniRoute} from '../../../src/ui/timeline/miniRoute';

const stages=(count:number)=>Array.from({length:count},(_,i)=>({
 label:'Stage '+(i+1),total:i%3+1,done:i%2,schedule:i%5===0?'behind' as const:'unscheduled' as const,
}));

describe('LOOK-3a mini Route geometry',()=>{
 it.each([48,120,200,360,390])('keeps every segment at least 8px at %ipx',width=>{
  for(const count of [1,9,15,36,100]){
   const input=stages(count),layout=layoutMiniRoute(input,width);
   expect(layout.length).toBeLessThanOrEqual(Math.floor(width/8));
   expect(layout.reduce((sum,s)=>sum+s.total,0)).toBe(input.reduce((sum,s)=>sum+s.total,0));
   expect(layout.reduce((sum,s)=>sum+s.done,0)).toBe(input.reduce((sum,s)=>sum+s.done,0));
   expect(layout.reduce((sum,s)=>sum+s.widthPercent,0)).toBeCloseTo(100,5);
   for(const s of layout)expect(width*s.widthPercent/100).toBeGreaterThanOrEqual(7.999);
  }
 });
 it('preserves stage order and folds excess stages into contiguous groups',()=>{
  const result=layoutMiniRoute(stages(100),120);
  expect(result.length).toBeLessThanOrEqual(15);
  expect(result[0].label).toMatch(/^Stage 1/);
  expect(result.at(-1)?.label).toMatch(/Stage 100$/);
  expect(result.some(s=>s.groupedCount>1)).toBe(true);
  expect(result.some(s=>s.schedule==='behind')).toBe(true);
 });
 it('never allocates a tick or extra mark for a zero-checkpoint plan',()=>{
  expect(layoutMiniRoute([],360)).toEqual([]);
 });
});
