import qualification from './phrase-ghost-qualification.json';

export const PHRASE_GHOST_DEADLINE_MS = 60;
export const PHRASE_GHOST_FINGERPRINT = 'phrase-trie-v1:7824d55d316d13cebbee060ed821aad3be4227b7d1ecaaa85feb8d6b5f4e8a75:c6ee15a41c3f55d8133366b67eba1476b510b410c8d80c3fca1403789f9d096a';

export type PhraseGhostMode = 'shadow' | 'lab' | 'qualified';
export type PhraseGhostLane = 'approved' | 'repetition';
export type PhraseGhostContext = 'boundary' | 'prefix';
export type PhraseGhostGroup = `${PhraseGhostLane}:${PhraseGhostContext}:${'short' | 'medium' | 'long'}`;

interface ExactnessRow {
  readonly group: PhraseGhostGroup;
  readonly count: number;
  readonly slope: number;
  readonly intercept: number;
}

interface Qualification {
  readonly fingerprint: string;
  readonly decision: 'hold' | 'qualified';
  readonly operatingPoint: number | null;
  readonly rows: readonly ExactnessRow[];
  readonly held: Readonly<{
    displays: number;
    displayThreads: number;
    coverage: number;
    exactLower95: number;
    incrementalKsrLower95: number;
    greyPaintP90Ms: number;
    testedProhibitions: number;
    prohibited: number;
  }> | null;
}

const receipt: Qualification = qualification as Qualification;
export function phraseGhostQualified(): boolean {
  const held = receipt.held;
  return receipt.fingerprint === PHRASE_GHOST_FINGERPRINT && receipt.decision === 'qualified' &&
    receipt.operatingPoint !== null && receipt.operatingPoint >= .7 && receipt.operatingPoint <= 1 && Boolean(held &&
      held.displays >= 200 && held.displayThreads >= 50 && held.coverage >= .05 && held.exactLower95 >= .7 &&
      held.incrementalKsrLower95 > 0 && held.greyPaintP90Ms > 0 && held.greyPaintP90Ms <= PHRASE_GHOST_DEADLINE_MS &&
      held.testedProhibitions > 0 && held.prohibited === 0);
}

export function phraseGhostGroup(lane: PhraseGhostLane, context: PhraseGhostContext, length: number): PhraseGhostGroup {
  return `${lane}:${context}:${length < 8 ? 'short' : length < 16 ? 'medium' : 'long'}`;
}

/** Exact case, whitespace, punctuation and caret are the only outcome here. */
export function phraseGhostExactness(group: PhraseGhostGroup, score: number): number | undefined {
  if (receipt.fingerprint !== PHRASE_GHOST_FINGERPRINT || !Number.isFinite(score)) return;
  const row = receipt.rows.find(row => row.group === group);
  if (!row || row.count < 100 || row.slope < 0 || !Number.isFinite(row.slope) || !Number.isFinite(row.intercept)) return;
  return 1 / (1 + Math.exp(-(row.slope * score + row.intercept)));
}

export function meetsPhraseGhostOperatingPoint(exactness: number | undefined): boolean {
  return phraseGhostQualified() && exactness !== undefined && exactness >= receipt.operatingPoint!;
}
