/**
 * N248 · When a symbol drawn on the Pad's keys goes in by itself.
 *
 * Probability (the recogniser's confidence, against the thresholds from costModel.ts) and logic (whether the
 * reading could still be the start of a larger symbol, from the n × n grids and the catalogue's families) decide
 * together:
 *
 *  - confident and complete:   insert once the pen has been up for SETTLE_MS (quick succession, nothing to tap);
 *  - confident but extendable: hold; insert when the learner moves on (another key, a new symbol elsewhere) or
 *                              after IDLE_COMMIT_MS without a stroke;
 *  - not confident:            offer three choices; insert the first only when the learner moves on without
 *                              choosing (the cheaper outcome then, see boundaryFloor), never on idle;
 *  - no usable reading:        offer what there is; moving on leaves the drawing out and says so.
 *
 * A stroke that starts on or near a drawing that still looks unfinished continues it. A stroke on a symbol that
 * went in a moment ago only because it was extendable and the learner paused takes it back and continues its
 * drawing, so a slow `<` can still become `≤`.
 */
import {SYMBOL_CATALOG, symbolById, type SymbolDefinition} from '../symbolCatalog';
import type {PartialMatch} from '../partialSymbolMatcher';
import type {InkInferenceResult} from '../types';
import {AUTO_INSERT_THRESHOLD, boundaryFloor, breakEvenConfidence} from './costModel';
import grids from './symbolGrids.json';

export const SETTLE_MS = 350;
export const IDLE_COMMIT_MS = 1200;
export const RETRACT_WINDOW_MS = 2000;
/** A new stroke starting within this share of the held drawing's size around it continues it. */
export const NEARBY_MARGIN = .3;
export const BOUNDARY_FLOOR = boundaryFloor();

/** Stroke prefixes the font-rendered grids miss, because a hand draws them differently from the font (the bars of
 *  `≠` sit further apart than `=`'s, `×` is two separate diagonals). Each is a real way of starting the symbol. */
const HANDWRITING_PREFIXES: Readonly<Record<string, readonly string[]>> = {
  'equal': ['not-equal', 'identical'],
  'set-minus': ['times'],
  'minus': ['plus', 'equal', 'plus-minus', 'minus-plus', 'division'],
  'plus': ['plus-minus', 'direct-sum'],
  'integral': ['double-integral', 'triple-integral', 'contour-integral'],
  'double-integral': ['triple-integral'],
  'similar': ['similar-or-equal', 'approximately-equal', 'congruent'],
  'composition': ['direct-sum', 'tensor-product', 'empty-set'],
  'divides': ['not-divides', 'parallel'],
  'or': ['forall'],
  'right-arrow': ['maps-to', 'two-way-arrow', 'hook-arrow', 'two-head-arrow'],
  'left-arrow': ['two-way-arrow'],
};

function buildExtensions() {
  const table = new Map<string, Set<string>>();
  const add = (part: string, whole: string) => {
    if (part === whole || !symbolById(part) || !symbolById(whole)) return;
    table.set(part, (table.get(part) ?? new Set()).add(whole));
  };
  for (const [part, wholes] of Object.entries(grids.extends as Record<string, string[]>)) for (const whole of wholes) add(part, whole);
  for (const symbol of SYMBOL_CATALOG) for (const whole of symbol.extensionFamilyIds) add(symbol.id, whole);
  for (const [part, wholes] of Object.entries(HANDWRITING_PREFIXES)) for (const whole of wholes) add(part, whole);
  return table;
}
const extensions = buildExtensions();

/** Symbols the drawing could still become, if `symbolId` is only its start. */
export const extensionsOf = (symbolId: string): readonly string[] => [...(extensions.get(symbolId) ?? [])].sort();
export const isExtendable = (symbolId: string) => (extensions.get(symbolId)?.size ?? 0) > 0;

export type LatentChoice = Readonly<{symbol: SymbolDefinition; confidence: number}>;
export type LatentReading = Readonly<{choices: readonly LatentChoice[]; confidence: number; unknownMass: number}>;

/** Softmax over every class; mass of classes outside the catalogue (digits, letters, …) is unknown and counts
 *  against the top choice. Geometry-only shapes the model lacks (=, <, >, ≠) are offered, never auto-inserted. */
export function readLatentInk(inference: InkInferenceResult | undefined, partial?: PartialMatch): LatentReading {
  const scores = inference?.rawScores ?? [];
  const bySymbol = new Map<string, number>();
  let unknownMass = 1;
  if (scores.length && scores.every(item => Number.isFinite(item.score))) {
    const logits = scores.map(item => inference!.scoreKind === 'logit' ? item.score : Math.log(Math.max(item.score, 1e-12)));
    const largest = Math.max(...logits);
    const weights = logits.map(value => Math.exp(value - largest));
    const total = weights.reduce((sum, value) => sum + value, 0);
    unknownMass = 0;
    scores.forEach((item, index) => {
      const value = weights[index] / total;
      if (item.symbolId && symbolById(item.symbolId)) bySymbol.set(item.symbolId, (bySymbol.get(item.symbolId) ?? 0) + value);
      else unknownMass += value;
    });
  }
  const ranked: LatentChoice[] = [...bySymbol].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([id, confidence]) => ({symbol: symbolById(id)!, confidence}));
  const geometry = (partial?.exactMatches ?? []).map(match => symbolById(match.symbolId)).filter(Boolean) as SymbolDefinition[];
  // A geometry match is shown first, held just under the auto threshold: it is a choice, not an automatic insert.
  const geometryChoices = geometry.map(symbol => ({symbol, confidence: Math.min(AUTO_INSERT_THRESHOLD - .01, Math.max(BOUNDARY_FLOOR, 1 - unknownMass))}));
  const choices = [...geometryChoices, ...ranked.filter(choice => !geometry.includes(choice.symbol))].slice(0, 3);
  return {choices, confidence: choices[0]?.confidence ?? 0, unknownMass};
}

export type HoldDecision = 'insert-after-settle' | 'insert-on-move' | 'choose' | 'none';

/** What to do with a reading once the pen is up. */
export function decideOnPenUp(reading: LatentReading, threshold = AUTO_INSERT_THRESHOLD): HoldDecision {
  const top = reading.choices[0];
  if (!top || reading.confidence < BOUNDARY_FLOOR) return 'none';
  if (reading.confidence < threshold) return 'choose';
  return isExtendable(top.symbol.id) ? 'insert-on-move' : 'insert-after-settle';
}

/** Moving on (another key, or a new symbol elsewhere) inserts the held reading unless it was unusable. */
export const insertsOnMove = (decision: HoldDecision) => decision !== 'none';
/** Waiting inserts only a confident reading. */
export const insertsOnIdle = (decision: HoldDecision) => decision === 'insert-on-move' || decision === 'insert-after-settle';

export type Box = Readonly<{left: number; top: number; right: number; bottom: number}>;

export function boxOf(points: readonly Readonly<{x: number; y: number}>[]): Box | undefined {
  if (!points.length) return;
  return points.reduce<Box>((box, point) => ({
    left: Math.min(box.left, point.x), top: Math.min(box.top, point.y),
    right: Math.max(box.right, point.x), bottom: Math.max(box.bottom, point.y),
  }), {left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity});
}

/** Does a stroke starting at `point` continue the drawing in `box`? Within SETTLE_MS of the last lift it always
 *  does (a hand moving to its next stroke). Later it must start on or near the drawing, and the drawing must still
 *  look unfinished: extendable, or unclear and lifted less than IDLE_COMMIT_MS ago. Learners write one symbol after
 *  another in the same small spot over the keys, so a finished-looking symbol is never continued. */
export function continuesDrawing(box: Box | undefined, point: Readonly<{x: number; y: number}>, sinceLiftMs: number,
  decision?: HoldDecision, minimumSize = 24) {
  if (!box) return false;
  if (sinceLiftMs < SETTLE_MS) return true;
  const unfinished = decision === 'insert-on-move' || ((decision === 'choose' || decision === 'none') && sinceLiftMs < IDLE_COMMIT_MS);
  if (!unfinished) return false;
  const margin = NEARBY_MARGIN * Math.max(box.right - box.left, box.bottom - box.top, minimumSize);
  return point.x >= box.left - margin && point.x <= box.right + margin && point.y >= box.top - margin && point.y <= box.bottom + margin;
}

/** Corrections a learner made to automatic inserts (a replace from the strip, or Undo straight after). */
export type AutoInsertRecord = Readonly<{inserted: number; corrected: number}>;
export const AUTO_INSERT_STORAGE_KEY = 'lemma.pad.latentInk.v1';

/**
 * The online guard. The simulation's worst scenario errs on about 12 % of automatic inserts at the threshold; a
 * learner whose own record (with a prior of 1 correction in 12) is worse gets a stricter threshold, and one above
 * the break-even error rate gets choices only.
 */
export function adaptiveThreshold(record: AutoInsertRecord | undefined) {
  if (!record) return AUTO_INSERT_THRESHOLD;
  const inserted = Math.max(0, record.inserted), corrected = Math.min(Math.max(0, record.corrected), inserted);
  const errorRate = (corrected + 1) / (inserted + 12);
  if (errorRate > 1 - breakEvenConfidence()) return Infinity;
  if (errorRate > .12) return .95;
  return AUTO_INSERT_THRESHOLD;
}

export function readAutoInsertRecord(storage: Pick<Storage, 'getItem'> | undefined): AutoInsertRecord | undefined {
  try {
    const value = JSON.parse(storage?.getItem(AUTO_INSERT_STORAGE_KEY) ?? 'null') as AutoInsertRecord | null;
    return value && Number.isSafeInteger(value.inserted) && Number.isSafeInteger(value.corrected) ? value : undefined;
  } catch {return undefined;}
}

export function writeAutoInsertRecord(storage: Pick<Storage, 'setItem'> | undefined, record: AutoInsertRecord) {
  try {storage?.setItem(AUTO_INSERT_STORAGE_KEY, JSON.stringify(record));} catch {/* per-device convenience only */}
}
