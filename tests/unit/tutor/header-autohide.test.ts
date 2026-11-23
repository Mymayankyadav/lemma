import {describe, expect, it} from 'vitest';
import {flingSpeed, REVEAL_SPEED} from '../../../src/features/tutor/useAutoHideHeader';

// N227 (Owner: "reappear only after upward scroll (make only after scroll speed only)").
describe('the fling that brings the tutor header back', () => {
  it('measures the finger over the last 200 ms only, positive when it moves down', () => {
    expect(flingSpeed([])).toBe(0);
    expect(flingSpeed([{y: 100, t: 0}])).toBe(0);
    // A slow drag that speeds up at the end counts only its quick end.
    const slowThenQuick = [{y: 0, t: 0}, {y: 20, t: 400}, {y: 40, t: 800}, {y: 160, t: 900}];
    expect(flingSpeed(slowThenQuick)).toBeCloseTo(1.2);
    expect(flingSpeed(slowThenQuick)).toBeGreaterThanOrEqual(REVEAL_SPEED);
    expect(flingSpeed([{y: 0, t: 0}, {y: 30, t: 150}, {y: 60, t: 300}])).toBeLessThan(REVEAL_SPEED);
    expect(flingSpeed([{y: 200, t: 0}, {y: 100, t: 100}])).toBeLessThan(0);
  });
});
