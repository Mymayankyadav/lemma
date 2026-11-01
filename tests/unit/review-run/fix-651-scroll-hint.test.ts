import {afterEach,describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {scheduleScrollHintMeasure} from '../../../src/features/review-run/scrollHint';

// FIX #651: the first real card must not synchronously read scrollHeight or
// force a second React render before its first usable paint. The hint may
// appear shortly afterward; user-initiated scrolling remains immediate.
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals()});

describe('FIX #651 defer noncritical scroll overflow hint',()=>{
 it('uses the deferred helper for the actual first-card effect',()=>{
  const page=readFileSync('src/features/review-run/Page.tsx','utf8');
  expect(page).toContain('return scheduleScrollHintMeasure(measure);');
  expect(page).not.toContain('requestAnimationFrame(measure)');
 });
 it('defers the fallback layout read and supports cleanup',()=>{
  vi.stubGlobal('requestIdleCallback',undefined);
  vi.useFakeTimers();
  const measure=vi.fn();
  const cancel=scheduleScrollHintMeasure(measure);
  expect(measure).not.toHaveBeenCalled();
  vi.advanceTimersByTime(79);
  expect(measure).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(measure).toHaveBeenCalledTimes(1);
  cancel();
  vi.runAllTimers();
  expect(measure).toHaveBeenCalledTimes(1);
 });
 it('cancels a pending hint when the review card changes',()=>{
  vi.stubGlobal('requestIdleCallback',undefined);
  vi.useFakeTimers();
  const measure=vi.fn();
  const cancel=scheduleScrollHintMeasure(measure);
  cancel();
  vi.advanceTimersByTime(500);
  expect(measure).not.toHaveBeenCalled();
 });
 it('prefers idle time in supported browsers and cancels the idle task',()=>{
  const callbacks:Array<()=>void>=[];
  const request=vi.fn((callback:()=>void)=>{callbacks.push(callback);return 17});
  const cancelIdle=vi.fn();
  vi.stubGlobal('requestIdleCallback',request);
  vi.stubGlobal('cancelIdleCallback',cancelIdle);
  const measure=vi.fn();
  const cancel=scheduleScrollHintMeasure(measure);
  expect(request).toHaveBeenCalledWith(expect.any(Function),{timeout:300});
  expect(measure).not.toHaveBeenCalled();
  callbacks[0]();
  expect(measure).toHaveBeenCalledTimes(1);
  cancel();
  expect(cancelIdle).toHaveBeenCalledWith(17);
 });
});
