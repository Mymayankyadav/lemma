import {expect, test} from 'vitest';
import {eraseStrokesPartial} from '../../../src/ui/v7/ink/pixelEraser';
import {initializePadInk, PAD_INK_LIMIT, padStrokePath, replacePadStrokes, undoPadInk, type PadPoint, type PadStrokes} from '../../../src/ui/v7/ink/ink';

const p = (x: number, y = 100): PadPoint => ({x, y});
const line = [p(0), p(200)];

test('splits a sparse segment, retaining both sides and untouched references', () => {
  const untouched = [p(0, 300), p(200, 300)];
  const strokes = [line, untouched];
  const result = eraseStrokesPartial(strokes, p(100), p(100), 10);
  expect(result).toEqual([[p(0), p(90)], [p(110), p(200)], untouched]);
  expect(result[0][0]).toBe(line[0]);
  expect(result[1][1]).toBe(line[1]);
  expect(result[2]).toBe(untouched);
  expect(strokes).toEqual([line, untouched]);
});

test('sweeps the full contact path even if neither pointer endpoint touches ink', () => {
  const result = eraseStrokesPartial([line], p(100, 0), p(100, 200), 10);
  expect(result).toEqual([[p(0), p(90)], [p(110), p(200)]]);
  expect(eraseStrokesPartial([line], p(100, 200), p(100, 0), 10)).toEqual(result);
});

test('clips collinear sweeps, endpoint caps and diagonal sweeps', () => {
  expect(eraseStrokesPartial([line], p(50), p(150), 10)).toEqual([[p(0), p(40)], [p(160), p(200)]]);
  expect(eraseStrokesPartial([line], p(0), p(0), 10)).toEqual([[p(10), p(200)]]);
  expect(eraseStrokesPartial([line], p(50, 50), p(150, 150), 10)).toEqual([[p(0), p(86)], [p(114), p(200)]]);
});

test('does not allocate a changed snapshot for misses, tangencies or invalid input', () => {
  const strokes = [line];
  expect(eraseStrokesPartial(strokes, p(100, 300), p(100, 350), 10)).toBe(strokes);
  expect(eraseStrokesPartial(strokes, p(100, 110), p(100, 110), 10)).toBe(strokes);
  expect(eraseStrokesPartial(strokes, p(50, 110), p(150, 110), 10)).toBe(strokes);
  expect(eraseStrokesPartial(strokes, p(100), p(100), 0)).toBe(strokes);
  expect(eraseStrokesPartial(strokes, p(NaN), p(100), 10)).toBe(strokes);
});

test('erases dots and zero-length segments without losing other ink', () => {
  const away = [p(300)];
  expect(eraseStrokesPartial([[p(100)], [p(100), p(100)], away], p(50), p(150), 10)).toEqual([away]);
  expect(eraseStrokesPartial([line], p(0), p(200), 10)).toEqual([]);
});

test('keeps separate fragments of a looping stroke and valid integer SVG geometry', () => {
  const stroke = [p(0, 80), p(200, 80), p(200, 120), p(0, 120)];
  const result = eraseStrokesPartial([stroke], p(100, 0), p(100, 200), 10);
  expect(result).toEqual([[p(0, 80), p(90, 80)], [p(110, 80), p(200, 80), p(200, 120), p(110, 120)], [p(90, 120), p(0, 120)]]);
  expect(initializePadInk(result)).not.toBeNull();
  expect(result.every(stroke => padStrokePath(stroke).length > 0)).toBe(true);
});

test('rejects an over-budget split atomically rather than discard unrelated strokes', () => {
  const strokes = [line, ...Array.from({length: PAD_INK_LIMIT.strokes - 1}, () => [p(300)])];
  expect(eraseStrokesPartial(strokes, p(100), p(100), 10)).toBe(strokes);
  // A deletion frees capacity in the same step, even when it occurs after the split.
  const canDelete = [...strokes.slice(0, -1), [p(100)]];
  const result = eraseStrokesPartial(canDelete, p(100), p(100), 10);
  expect(result).toHaveLength(PAD_INK_LIMIT.strokes);
  expect(result[2]).toBe(canDelete[1]);
  expect(initializePadInk(result)).not.toBeNull();
});

test('multiple preview steps commit as one undo and leave the original snapshot unchanged', () => {
  const original = initializePadInk([line])!;
  let preview: PadStrokes = original.strokes;
  preview = eraseStrokesPartial(preview, p(50), p(50), 10);
  preview = eraseStrokesPartial(preview, p(150), p(150), 10);
  const committed = replacePadStrokes(original, preview);
  expect(committed.strokes).toHaveLength(3);
  expect(committed.undo).toHaveLength(1);
  expect(undoPadInk(committed).strokes).toBe(original.strokes);
  expect(original.strokes).toEqual([line]);
  expect(original.undo).toEqual([]);
});

test('dense strokes remain within the point limit and survive persistence', () => {
  const dense = Array.from({length: PAD_INK_LIMIT.points}, (_, x) => p(x));
  const result = eraseStrokesPartial([dense], p(128), p(128), 0.6);
  expect(result.length).toBe(2);
  expect(result.every(stroke => stroke.length <= PAD_INK_LIMIT.points)).toBe(true);
  expect(initializePadInk(result)).not.toBeNull();
});


test('repeated diagonal contact is stable after integer boundary rounding', () => {
  const from = p(50, 50), to = p(150, 150);
  const once = eraseStrokesPartial([line], from, to, 10);
  expect(eraseStrokesPartial(once, from, to, 10)).toBe(once);
});


test('cached distant bounds preserve identity and still allow a later nearby hit', () => {
  const strokes = Object.freeze([Object.freeze(line)]);
  expect(eraseStrokesPartial(strokes, p(100, 300), p(200, 300), 10)).toBe(strokes);
  expect(eraseStrokesPartial(strokes, p(100, 300), p(200, 300), 10)).toBe(strokes);
  expect(eraseStrokesPartial(strokes, p(100), p(100), 10)).toEqual([[p(0), p(90)], [p(110), p(200)]]);
});
