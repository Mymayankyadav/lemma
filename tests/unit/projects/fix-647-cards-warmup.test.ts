import {describe,expect,it,vi,afterEach} from 'vitest';
import {scheduleCardsWarmup} from '../../../src/features/projects/cardsWarmup';

// FIX #647: speculative Cards module loading must not compete with an
// immediate Paths → Atlas transition under strict 4× CPU cold-route budget.
// The real Cards route remains lazy and functional on direct navigation.
describe('FIX #647 speculative Cards warmup does not block Atlas',()=>{
 afterEach(()=>{vi.useRealTimers()});
 it('waits until the Paths screen has been idle for 1.2s',()=>{
  vi.useFakeTimers();
  const warm=vi.fn();
  const cancel=scheduleCardsWarmup(warm);
  vi.advanceTimersByTime(1199);
  expect(warm).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(warm).toHaveBeenCalledTimes(1);
  cancel();
 });
 it('cancels pending speculative work when Paths unmounts for Atlas',()=>{
  vi.useFakeTimers();
  const warm=vi.fn();
  const cancel=scheduleCardsWarmup(warm);
  vi.advanceTimersByTime(600);
  cancel();
  vi.advanceTimersByTime(2000);
  expect(warm).not.toHaveBeenCalled();
 });
});
