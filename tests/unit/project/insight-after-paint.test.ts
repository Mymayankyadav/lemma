import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {scheduleProjectInsightAfterPaint} from '../../../src/features/project/useProjectInsight';

describe('FIX-659k supplemental Project insights',()=>{
 let frames:Map<number,FrameRequestCallback>;
 let next:number;
 const fire=(id:number)=>{
  const callback=frames.get(id);
  expect(callback,'frame '+id+' should be pending').toBeDefined();
  frames.delete(id);
  callback!(id*16);
 };
 beforeEach(()=>{
  vi.useFakeTimers();
  frames=new Map();next=1;
  vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>{
   const id=next++;frames.set(id,callback);return id;
  });
  vi.stubGlobal('cancelAnimationFrame',(id:number)=>{frames.delete(id)});
 });
 afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals()});
 it('does not run the insight query in either of the first two paint frames',()=>{
  const run=vi.fn();
  const cancel=scheduleProjectInsightAfterPaint(run);
  expect(run).not.toHaveBeenCalled();
  fire(1);expect(run).not.toHaveBeenCalled();
  fire(2);expect(run).not.toHaveBeenCalled();
  vi.runAllTimers();
  expect(run).toHaveBeenCalledTimes(1);
  cancel();
 });
 it('cancels a pending query on route unmount before the second frame',()=>{
  const run=vi.fn();
  const cancel=scheduleProjectInsightAfterPaint(run);
  fire(1);cancel();
  expect(frames.size).toBe(0);
  vi.runAllTimers();expect(run).not.toHaveBeenCalled();
 });
 it('cancels a queued post-paint task after the second frame',()=>{
  const run=vi.fn();
  const cancel=scheduleProjectInsightAfterPaint(run);
  fire(1);fire(2);cancel();
  vi.runAllTimers();expect(run).not.toHaveBeenCalled();
 });
});
