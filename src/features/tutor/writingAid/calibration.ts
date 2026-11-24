export type CalibrationOutcome = 'exact' | 'accept' | 'retain';
export interface CalibrationRow {
  readonly outcome: CalibrationOutcome;
  readonly length: 'short' | 'medium' | 'long';
  readonly source: string;
  readonly context: 'boundary' | 'prefix';
  readonly slope: number;
  readonly intercept: number;
  readonly count: number;
  readonly operatingPoint?: number;
  readonly displayedPrecision?: number;
}

const lengthGroup = (length: number) => length < 8 ? 'short' : length < 16 ? 'medium' : 'long';
const sigmoid = (score: number) => 1 / (1 + Math.exp(-score));

export function calibratedEvent(rows: readonly CalibrationRow[], outcome: CalibrationOutcome, score: number,
  length: number, source: string, context: CalibrationRow['context']): number | undefined {
  const options = rows.filter(row => row.outcome === outcome && row.length === lengthGroup(length) &&
    row.source === source && row.context === context && row.count > 0);
  const specific = options[0];
  if (!specific || !Number.isFinite(score)) return undefined;
  const prior = rows.find(row => row.outcome === outcome && row.source === '*' && row.length === lengthGroup(length) &&
    row.context === context && row.count > 0);
  const own = sigmoid(specific.slope * score + specific.intercept);
  const shrink = specific.count / (specific.count + 100);
  return prior ? shrink * own + (1 - shrink) * sigmoid(prior.slope * score + prior.intercept) :
    specific.count >= 100 ? own : undefined;
}

export function ghostBreakEven(length: number): number {
  return (.25 + .03 * length + .3) / ((length - 1) * .33 + .3);
}

/** Economics and the measured operating point are independent requirements. */
export function ghostQualified(rows: readonly CalibrationRow[], score: number, length: number,
  context: CalibrationRow['context'], elapsed: number): boolean {
  if (length < 5 || length > 32 || elapsed > 60) return false;
  const row = rows.find(row => row.outcome === 'exact' && row.length === lengthGroup(length) &&
    row.source === 'neural' && row.context === context);
  const exact = calibratedEvent(rows, 'exact', score, length, 'neural', context);
  const accepted = calibratedEvent(rows, 'accept', score, length, 'neural', context);
  // Acceptance is fitted on displayed offers. Retention is fitted only among
  // accepted offers, so the product estimates their joint event.
  const retainedGivenAcceptance = calibratedEvent(rows, 'retain', score, length, 'neural', context);
  return row?.displayedPrecision !== undefined && row.displayedPrecision >= .7 && row.operatingPoint !== undefined &&
    exact !== undefined && accepted !== undefined && retainedGivenAcceptance !== undefined &&
    exact >= row.operatingPoint && accepted * retainedGivenAcceptance >= ghostBreakEven(length);
}
