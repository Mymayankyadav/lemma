import { describe, expect, it, vi } from 'vitest';
import { haptic } from '../../../src/ui/v7/haptics';
import { routeMotion } from '../../../src/ui/v7/motion';

describe('v7 interaction helpers', () => {
  it('honours the setting and device support', () => {
    const vibrate = vi.fn(() => true);
    expect(haptic('grade', false, { vibrate })).toBe(false);
    expect(vibrate).not.toHaveBeenCalled();
    expect(haptic('gradeAgain', true, { vibrate })).toBe(true);
    expect(vibrate).toHaveBeenCalledWith([8, 40, 8]);
    expect(haptic('complete', true, { vibrate })).toBe(true);
    expect(vibrate).toHaveBeenLastCalledWith([12, 40, 20]);
    expect(haptic('snap', true, {} as Pick<Navigator, 'vibrate'>)).toBe(false);
  });
  it('uses only opacity for reduced motion', () => {
    const motion = routeMotion(true);
    expect(motion.initial).toEqual({ opacity: 0 });
    expect(motion.transition.duration).toBeLessThanOrEqual(0.16);
  });
});

it('keeps the phase chime silent until enabled and tolerates unavailable audio', async () => {
  const {playPhaseChime} = await import('../../../src/ui/v7/chime');
  const Audio = vi.fn();
  expect(await playPhaseChime(false, Audio as unknown as typeof AudioContext)).toBe(false);
  expect(Audio).not.toHaveBeenCalled();
  expect(await playPhaseChime(true, undefined)).toBe(false);
});

it('keeps number changes still with reduced motion and respects sheet thresholds', async () => {
 const {interpolateNumber,dismissSheet}=await import('../../../src/ui/v7/motion');
 expect(interpolateNumber(0,100,.5)).toBe(50);
 expect(interpolateNumber(0,100,.5,true)).toBe(100);
 expect(dismissSheet(29,100,0)).toBe(false);
 expect(dismissSheet(30,100,0)).toBe(true);
 expect(dismissSheet(5,100,650)).toBe(true);
});
