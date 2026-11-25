import {describe, expect, test} from 'vitest';
import {
  AUTO_INSERT_THRESHOLD, autoCost, boundaryFloor, breakEvenConfidence, chooseCost, chooseRobustThreshold, DETEXIFY_PROFILE,
  evaluateThreshold, ROBUSTNESS_SCENARIOS, sampleReadings,
} from '../../../src/features/pad/latentInk/costModel';
import {
  cellCount, collisionsAt, extensionTable, gridFromKey, gridKey, isStrictSubGrid, occupancyGrid, smallestInjectiveN,
} from '../../../src/features/pad/latentInk/symbolGrid';
import grids from '../../../src/features/pad/latentInk/symbolGrids.json';
import {SYMBOL_CATALOG} from '../../../src/features/tutor/input/symbolCatalog';

describe('N248 cost model', () => {
  test('a right auto-insert costs a glance; a wrong one costs more than choosing', () => {
    expect(autoCost(true, true)).toBeLessThan(chooseCost(true));
    expect(autoCost(false, true)).toBeGreaterThan(chooseCost(true));
    expect(autoCost(false, false)).toBeGreaterThan(autoCost(false, true));
  });

  test('sampled readings reproduce the published Detexify-family accuracy', () => {
    const readings = sampleReadings(DETEXIFY_PROFILE, 20_000);
    const top1 = readings.filter(reading => reading.correct).length / readings.length;
    const top3 = readings.filter(reading => reading.inTop3).length / readings.length;
    expect(top1).toBeCloseTo(.825, 1);
    expect(top3).toBeCloseTo(.96, 1);
  });

  test('the ROC is monotone: a higher threshold auto-inserts fewer readings and errs less', () => {
    const readings = sampleReadings(DETEXIFY_PROFILE, 10_000);
    const points = [.5, .7, .83, .95].map(threshold => evaluateThreshold(readings, threshold));
    for (let index = 1; index < points.length; index++) {
      expect(points[index].truePositiveRate).toBeLessThanOrEqual(points[index - 1].truePositiveRate);
      expect(points[index].falsePositiveRate).toBeLessThanOrEqual(points[index - 1].falsePositiveRate);
      expect(points[index].autoErrorRate).toBeLessThanOrEqual(points[index - 1].autoErrorRate + 1e-9);
    }
  });

  test('the shipped threshold is the simulation’s robust choice and gains in every scenario', () => {
    const choice = chooseRobustThreshold(ROBUSTNESS_SCENARIOS, undefined, 8_000);
    expect(Math.abs(choice.threshold - AUTO_INSERT_THRESHOLD)).toBeLessThanOrEqual(.03);
    expect(choice.worstGain).toBeGreaterThan(.2);
    for (const point of choice.perScenario) expect(point.gainPerSymbol).toBeGreaterThan(0);
    expect(AUTO_INSERT_THRESHOLD).toBeGreaterThan(breakEvenConfidence());
  });

  test('auto-insert is switched off when choosing is cheap and fixing is dear', () => {
    const choice = chooseRobustThreshold(ROBUSTNESS_SCENARIOS.slice(0, 2),
      {scan: .05, tap: .05, glance: .25, notice: 2, noticeRate: .3, lateFix: 30, miss: 4}, 4_000);
    expect(choice.threshold).toBe(1);
  });

  test('moving on inserts a doubtful reading only above the floor', () => {
    expect(boundaryFloor()).toBeGreaterThanOrEqual(.35);
    expect(boundaryFloor()).toBeLessThan(AUTO_INSERT_THRESHOLD);
  });
});

function square(size: number, paint: (x: number, y: number) => boolean) {
  return Array.from({length: size * size}, (_, index) => paint(index % size, Math.floor(index / size)) ? 255 : 0);
}

describe('N248 symbol grids', () => {
  test('a cell is on when enough of it is inked', () => {
    const grid = occupancyGrid(square(8, x => x < 4), 8, 2);
    expect(grid.cells).toEqual([true, false, true, false]);
    expect(gridFromKey(gridKey(grid), 2)).toEqual(grid);
    expect(() => occupancyGrid([0, 0, 0], 2, 1)).toThrow();
  });

  test('a part is a strict sub-grid of the symbol it starts', () => {
    const minus = occupancyGrid(square(12, (_, y) => y >= 5 && y <= 6), 12, 4);
    const plus = occupancyGrid(square(12, (x, y) => (y >= 5 && y <= 6) || (x >= 5 && x <= 6)), 12, 4);
    expect(isStrictSubGrid(minus, plus)).toBe(true);
    expect(isStrictSubGrid(plus, minus)).toBe(false);
    expect(isStrictSubGrid(plus, plus)).toBe(false);
    expect(extensionTable({minus, plus})).toEqual({minus: ['plus']});
  });

  test('n is the smallest size that keeps different glyphs apart', () => {
    const left = square(16, x => x < 2), right = square(16, x => x >= 14), mid = square(16, x => x >= 6 && x < 8);
    const glyphs = [{id: 'left', bitmap: left}, {id: 'right', bitmap: right}, {id: 'mid', bitmap: mid}, {id: 'same', bitmap: left}];
    const n = smallestInjectiveN(glyphs, 16)!;
    expect(collisionsAt(glyphs, 16, n)).toEqual([]);
    expect(collisionsAt(glyphs, 16, n - 1).length).toBeGreaterThan(0);
  });

  test('the generated table covers the catalogue at an injective n, with collisions just below it', () => {
    expect(Object.keys(grids.grids).sort()).toEqual(SYMBOL_CATALOG.map(symbol => symbol.id).sort());
    const decoded = Object.fromEntries(Object.entries(grids.grids).map(([id, key]) => [id, gridFromKey(key, grids.n)]));
    const keys = new Set(Object.values(grids.grids));
    expect(keys.size).toBe(Object.keys(grids.grids).length - grids.aliases.reduce((sum, group) => sum + group.length - 1, 0));
    expect(grids.collisionsBelow.length).toBeGreaterThan(0);
    for (const value of Object.values(decoded)) expect(cellCount(value)).toBeGreaterThan(0);
    expect(extensionTable(decoded, grids.minimumPartShare)).toEqual(grids.extends);
  });
});
