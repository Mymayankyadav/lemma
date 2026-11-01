import {afterProjectPaint} from '../../../src/features/project/afterPaint';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';

describe('Project checkpoint-detail work starts only after the visible route paints',()=>{
 let nextId=1;
 let frames=new Map<number,FrameRequestCallback>();
 const flushFrame=()=>{
  const current=[...frames.values()];
  frames.clear();
  for(const callback of current)callback(performance.now());
 };
 beforeEach(()=>{
  nextId=1;
  frames=new Map();
  vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>{
   const id=nextId++;
   frames.set(id,callback);
   return id;
  });
  vi.stubGlobal('cancelAnimationFrame',(id:number)=>{frames.delete(id)});
 });
 afterEach(()=>{
  vi.unstubAllGlobals();
  vi.useRealTimers();
 });

 it('does not start the expensive detail query before two animation frames and a post-paint task',()=>{
  const query=vi.fn();
  const cancel=afterProjectPaint(query);
  expect(query).not.toHaveBeenCalled();
  flushFrame();
  vi.runOnlyPendingTimers();
  expect(query).not.toHaveBeenCalled();
  flushFrame();
  expect(query).not.toHaveBeenCalled();
  vi.runOnlyPendingTimers();
  expect(query).toHaveBeenCalledTimes(1);
  cancel();
 });

 it('cancels the pending query on route changes, even after the second frame',()=>{
  const query=vi.fn();
  const cancel=afterProjectPaint(query);
  flushFrame();
  cancel();
  flushFrame();
  vi.runAllTimers();
  expect(query).not.toHaveBeenCalled();

  const second=afterProjectPaint(query);
  flushFrame();
  flushFrame();
  second();
  vi.runAllTimers();
  expect(query).not.toHaveBeenCalled();
 });
});
