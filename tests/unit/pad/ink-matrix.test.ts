import {describe, expect, it} from 'vitest';
import {matrixPoint, paperDelta, paperPoint} from '../../../src/ui/v7/ink/ink';

// N228 (Owner: landscape in full screen): touches land on the paper's own upright coordinates when it is turned.
describe('a turned paper', () => {
  // A 640×400 paper shown 1.5× on screen, turned a quarter clockwise, its top-left corner at screen (600, 0):
  // paper (x, y) is on screen at (600 - 1.5y, 1.5x).
  const screen = {a: 0, b: 1.5, c: -1.5, d: 0, e: 600, f: 0};
  const inverse = {a: 0, b: -1 / 1.5, c: 1 / 1.5, d: 0, e: 0, f: 400};
  it('maps a touch to the paper\'s own coordinates, rounded and kept on the paper', () => {
    expect(matrixPoint(inverse, 600, 0)).toEqual({x: 0, y: 0});
    expect(matrixPoint(inverse, 600 - 1.5 * 100, 1.5 * 200)).toEqual({x: 200, y: 100});
    expect(matrixPoint(inverse, -5000, 5000)).toEqual({x: 640, y: 400});
    expect(matrixPoint({...inverse, e: NaN}, 1, 1)).toBeNull();
  });
  it('is the same as the upright mapping when the paper is not turned', () => {
    const box = {left: 10, top: 20, width: 320, height: 200};
    const upright = {a: 2, b: 0, c: 0, d: 2, e: -20, f: -40};
    expect(matrixPoint(upright, 170, 120)).toEqual(paperPoint(170, 120, box));
  });
  it('carries a movement on the screen into the paper\'s own axes', () => {
    // Down the screen is along the paper's x; left on the screen is down the paper.
    expect(paperDelta(screen, 0, 10)).toEqual([10, 0]);
    expect(paperDelta(screen, -10, 0)).toEqual([0, 10]);
    expect(paperDelta({a: 2, b: 0, c: 0, d: 2, e: 0, f: 0}, 7, -3)).toEqual([7, -3]);
  });
});
