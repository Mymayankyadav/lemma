import {describe, expect, it} from 'vitest';
import {PAD_INK_LIMIT, simplifyPadStroke, type PadStroke} from '../../../src/ui/v7/ink/ink';

// N228 (Owner: "drawing in both the scratch pads is laggy and unreliable"): a long slow stroke is simplified, not cut off.
const line = (n: number): PadStroke => Array.from({length: n}, (_, i) => ({x: i, y: 40}));
describe('simplifying a drawn stroke', () => {
  it('keeps both ends and drops points that lie on the line between its neighbours', () => {
    const simple = simplifyPadStroke(line(300));
    expect(simple).toEqual([{x: 0, y: 40}, {x: 299, y: 40}]);
    expect(simplifyPadStroke([{x: 5, y: 5}])).toEqual([{x: 5, y: 5}]);
    expect(simplifyPadStroke([{x: 5, y: 5}, {x: 9, y: 9}])).toHaveLength(2);
  });
  it('keeps a corner, and any point further than the tolerance from the line', () => {
    const corner = [...line(100), ...Array.from({length: 100}, (_, i) => ({x: 99, y: 40 + i + 1}))];
    expect(simplifyPadStroke(corner)).toEqual([{x: 0, y: 40}, {x: 99, y: 40}, {x: 99, y: 140}]);
    const bump: PadStroke = [{x: 0, y: 0}, {x: 10, y: 0}, {x: 20, y: 3}, {x: 30, y: 0}, {x: 40, y: 0}];
    expect(simplifyPadStroke(bump)).toContainEqual({x: 20, y: 3});
    expect(simplifyPadStroke(bump, 5)).toEqual([{x: 0, y: 0}, {x: 40, y: 0}]);
  });
  it('brings a slow curve of 330 distinct points inside the per-stroke limit, within the tolerance', () => {
    const curve: PadStroke = Array.from({length: 330}, (_, i) => ({x: Math.round(i * 1.9), y: Math.round(100 + Math.sin(i / 20) * 40)}));
    const simple = simplifyPadStroke(curve);
    expect(curve.length).toBeGreaterThan(PAD_INK_LIMIT.points);
    expect(simple.length).toBeLessThan(PAD_INK_LIMIT.points / 2);
    // Every original point is within the tolerance of the simplified line.
    for (const p of curve) {
      const near = Math.min(...simple.slice(1).map((b, i) => {
        const a = simple[i], dx = b.x - a.x, dy = b.y - a.y, len = dx * dx + dy * dy;
        const t = len ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len)) : 0;
        return Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y);
      }));
      expect(near).toBeLessThanOrEqual(0.6 + 1e-9);
    }
  });
});
