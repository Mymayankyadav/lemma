import {expect, test} from 'vitest';
import {AUTO_INSERT_THRESHOLD} from '../../../src/features/pad/latentInk/costModel';
import {
  adaptiveThreshold, BOUNDARY_FLOOR, continuesDrawing, IDLE_COMMIT_MS, decideOnPenUp, extensionsOf, insertsOnIdle, insertsOnMove,
  isExtendable, readAutoInsertRecord, readLatentInk, SETTLE_MS, writeAutoInsertRecord,
} from '../../../src/features/pad/latentInk/latentInkPolicy';
import type {InkInferenceResult} from '../../../src/features/tutor/input/types';

function inference(scores: Record<string, number>, kind: 'probability' | 'logit' = 'probability'): InkInferenceResult {
  return {
    target: {scopeKey: 's', mountId: 'm', editorRevision: 0, selectionRevision: 0, modeRevision: 0},
    sessionId: 's', inkEpoch: 1, inkRevision: 1, sampledAtMs: 0, assetSetVersion: 'v', scoreKind: kind,
    rawScores: Object.entries(scores).map(([id, score]) => ({classId: id, score, ...(id.startsWith('x-') ? {} : {symbolId: id})})),
  };
}

test('readings are catalogue probabilities; shapes outside the catalogue lower the top one', () => {
  const reading = readLatentInk(inference({forall: .7, exists: .1, 'x-digit-4': .2}));
  expect(reading.choices.map(choice => choice.symbol.id)).toEqual(['forall', 'exists']);
  expect(reading.confidence).toBeCloseTo(.7);
  expect(reading.unknownMass).toBeCloseTo(.2);
  const logits = readLatentInk(inference({forall: 3, exists: 0}, 'logit'));
  expect(logits.confidence).toBeCloseTo(Math.exp(3) / (Math.exp(3) + 1));
  expect(readLatentInk(undefined).choices).toEqual([]);
});

test('geometry-only shapes are offered first but never go in by themselves', () => {
  const reading = readLatentInk(inference({forall: .9, 'x-other': .1}), {
    completionDecision: 'finished', possibleCompletions: [], finishedSymbols: ['equal'],
    exactMatches: [{source: 'geometry', symbolId: 'equal', geometryScore: .95}],
  });
  expect(reading.choices[0].symbol.id).toBe('equal');
  expect(decideOnPenUp(reading)).toBe('choose');
});

test('grid logic, catalogue families and handwriting prefixes mark a reading as extendable', () => {
  expect(extensionsOf('less-than')).toContain('less-than-or-equal');
  expect(extensionsOf('element-of')).toContain('not-element-of');
  expect(extensionsOf('equal')).toContain('not-equal');
  expect(extensionsOf('set-minus')).toContain('times');
  expect(extensionsOf('minus')).toContain('plus');
  expect(isExtendable('forall')).toBe(false);
  expect(isExtendable('not-element-of')).toBe(false);
});

test('probability and logic decide together', () => {
  expect(decideOnPenUp(readLatentInk(inference({forall: .95, exists: .05})))).toBe('insert-after-settle');
  expect(decideOnPenUp(readLatentInk(inference({'element-of': .95, epsilon: .05})))).toBe('insert-on-move');
  expect(decideOnPenUp(readLatentInk(inference({forall: .6, exists: .4})))).toBe('choose');
  expect(decideOnPenUp(readLatentInk(inference({forall: .2, 'x-a': .8})))).toBe('none');
  expect(decideOnPenUp(readLatentInk(inference({forall: .95, exists: .05})), Infinity)).toBe('choose');
  expect(insertsOnMove('choose')).toBe(true);
  expect(insertsOnIdle('choose')).toBe(false);
  expect(insertsOnMove('none')).toBe(false);
  expect(BOUNDARY_FLOOR).toBeLessThan(.6);
});

test('a stroke continues the drawing right after a lift, or near a drawing that still looks unfinished', () => {
  const box = {left: 100, top: 100, right: 140, bottom: 140};
  expect(continuesDrawing(box, {x: 400, y: 400}, SETTLE_MS - 1)).toBe(true);
  expect(continuesDrawing(box, {x: 150, y: 120}, 2000, 'insert-on-move')).toBe(true);
  expect(continuesDrawing(box, {x: 200, y: 120}, 2000, 'insert-on-move')).toBe(false);
  expect(continuesDrawing(box, {x: 120, y: 120}, SETTLE_MS + 10, 'choose')).toBe(true);
  expect(continuesDrawing(box, {x: 120, y: 120}, IDLE_COMMIT_MS + 10, 'choose')).toBe(false);
  // The next symbol written on the same spot as a finished one.
  expect(continuesDrawing(box, {x: 120, y: 120}, SETTLE_MS + 10, 'insert-after-settle')).toBe(false);
  expect(continuesDrawing(undefined, {x: 0, y: 0}, 0)).toBe(false);
});

test('the online guard raises the threshold for a learner who keeps correcting automatic inserts', () => {
  expect(adaptiveThreshold(undefined)).toBe(AUTO_INSERT_THRESHOLD);
  expect(adaptiveThreshold({inserted: 100, corrected: 3})).toBe(AUTO_INSERT_THRESHOLD);
  expect(adaptiveThreshold({inserted: 100, corrected: 20})).toBe(.95);
  expect(adaptiveThreshold({inserted: 100, corrected: 50})).toBe(Infinity);
  const store = new Map<string, string>();
  const storage = {getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => void store.set(key, value)};
  writeAutoInsertRecord(storage, {inserted: 4, corrected: 1});
  expect(readAutoInsertRecord(storage)).toEqual({inserted: 4, corrected: 1});
  store.set('lemma.pad.latentInk.v1', '{bad');
  expect(readAutoInsertRecord(storage)).toBeUndefined();
});
