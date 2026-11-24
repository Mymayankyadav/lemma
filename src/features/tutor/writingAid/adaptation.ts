import type {CalibrationOutcome} from './calibration';
import type {WritingAidProposal} from './policy';

const MAX_CONTEXTS = 64;
const MAX_WORDS = 16;
const MAX_PARTS = 32;
const WEEK = 7 * 24 * 60 * 60 * 1000;
type CountRow = Record<string, number>;
export interface WeeklyWritingAid {
  readonly week: number;
  impressions: number;
  accepts: number;
  retained: number;
  undos: number;
  keysSaved: number;
}
export interface WritingAdaptation {
  observations: number;
  rank: number[];
  context: Record<string, CountRow>;
  weeks: WeeklyWritingAid[];
  calibration: Record<string, {successes: number; trials: number}>;
}

const FEATURES = 12;
export function createAdaptation(): WritingAdaptation {
  return {observations: 0, rank: Array<number>(FEATURES).fill(0), context: Object.create(null), weeks: [], calibration: Object.create(null)};
}

const known = (value: unknown, maximum: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(maximum, Math.max(0, Math.trunc(value))) : 0;
const lexical = (word: string) => /^[\p{L}\p{M}]{1,32}$/u.test(word);
const subjectId = (subject?: string) => subject && /^[a-z0-9-]{1,50}$/u.test(subject) ? subject : '*';

export function parseAdaptation(input: unknown): WritingAdaptation {
  const adaptation = createAdaptation();
  if (!input || typeof input !== 'object') return adaptation;
  const value = input as Partial<WritingAdaptation>;
  adaptation.observations = known(value.observations, 10000);
  if (Array.isArray(value.rank)) for (let index = 0; index < FEATURES; index++) {
    if (Number.isFinite(value.rank[index])) adaptation.rank[index] = Math.max(-2, Math.min(2, value.rank[index]));
  }
  if (value.context && typeof value.context === 'object') for (const [key, raw] of Object.entries(value.context).slice(-MAX_CONTEXTS)) {
    const [subject, previous, extra] = key.split(':');
    if (extra !== undefined || subject !== subjectId(subject) || !lexical(previous ?? '') || !raw || typeof raw !== 'object') continue;
    const row: CountRow = Object.create(null);
    for (const [word, count] of Object.entries(raw).slice(-MAX_WORDS)) if (lexical(word) && known(count, 30)) row[word] = known(count, 30);
    adaptation.context[key] = row;
  }
  if (Array.isArray(value.weeks)) for (const row of value.weeks.slice(-MAX_PARTS)) {
    if (!row || !Number.isInteger(row.week) || row.week < 0 || row.week > Math.floor(Date.now() / WEEK)) continue;
    adaptation.weeks.push({week: row.week, impressions: known(row.impressions, 100000), accepts: known(row.accepts, 100000),
      retained: known(row.retained, 100000), undos: known(row.undos, 100000), keysSaved: known(row.keysSaved, 1000000)});
  }
  if (value.calibration && typeof value.calibration === 'object') for (const [key, row] of Object.entries(value.calibration).slice(-128)) {
    if (!/^(?:exact|accept|retain):[a-z]+:[012]:[01]$/u.test(key) || !row) continue;
    const trials = known(row.trials, 1000);
    if (trials) adaptation.calibration[key] = {trials, successes: known(row.successes, trials)};
  }
  return adaptation;
}

function recordRow(adaptation: WritingAdaptation, key: string, next: string): void {
  let row = adaptation.context[key];
  if (!row) row = Object.create(null) as CountRow;
  // Bounded recency, preserving frequently repeated successors within a row.
  delete adaptation.context[key];
  adaptation.context[key] = row;
  row[next] = Math.min(30, (row[next] ?? 0) + 1);
  const words = Object.keys(row);
  if (words.length > MAX_WORDS) {
    const least = words.filter(word => word !== next).sort((a, b) => row[a] - row[b])[0];
    delete row[least];
  }
  const keys = Object.keys(adaptation.context);
  if (keys.length > MAX_CONTEXTS) delete adaptation.context[keys[0]];
}

export function countPersonalTransition(adaptation: WritingAdaptation, previous: string, next: string, subject?: string): void {
  const before = previous.toLowerCase(), after = next.toLowerCase();
  if (!lexical(before) || !lexical(after)) return;
  recordRow(adaptation, '*:' + before, after);
  const scoped = subjectId(subject);
  if (scoped !== '*') recordRow(adaptation, scoped + ':' + before, after);
}

export function personalContext(adaptation: WritingAdaptation, before: string, subject?: string) {
  const previous = /([\p{L}\p{M}]{1,32})[ \t]*$/u.exec(before.toLowerCase())?.[1];
  if (!previous) return undefined;
  const general = adaptation.context['*:' + previous], local = adaptation.context[subjectId(subject) + ':' + previous];
  const counts = new Map(Object.entries(general ?? {}));
  const globalCount = [...counts.values()].reduce((sum, count) => sum + count, 0);
  if (subjectId(subject) !== '*' && local) {
    const localCount = Object.values(local).reduce((sum, count) => sum + count, 0);
    for (const [word, count] of Object.entries(local)) counts.set(word, (counts.get(word) ?? 0) + count * localCount / (localCount + 8));
  }
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  return total ? {cache: {counts, total}, weight: .4 * globalCount / (globalCount + 30)} : undefined;
}

const SOURCES = ['decoder', 'bank', 'personal', 'symbol', 'neural', 'notation', 'equation'] as const;
function features(proposal: WritingAidProposal, position: number): readonly number[] {
  return [
    Math.tanh((proposal.score ?? -12) / 8),
    Math.min(1, proposal.before.length / Math.max(1, proposal.label.length)),
    Math.min(1, Math.max(0, proposal.insert.length - proposal.before.length) / 12),
    Number(proposal.kind === 'ghost'),
    Math.min(1, position / 2),
    ...SOURCES.map(source => Number(proposal.source === source)),
  ];
}

export function learnedRank(adaptation: WritingAdaptation, proposal: WritingAidProposal): number {
  const x = features(proposal, 0);
  const shrink = adaptation.observations / (adaptation.observations + 30);
  return shrink * x.reduce((sum, feature, index) => sum + feature * adaptation.rank[index], 0);
}

export function learnSlateChoice(adaptation: WritingAdaptation, winner: WritingAidProposal,
  displayed: readonly WritingAidProposal[], duration: (item: WritingAidProposal) => number = () => 1000): void {
  const winnerAt = displayed.indexOf(winner);
  if (winnerAt < 0 || displayed.length < 2) return;
  const positive = features(winner, winner.menuPosition ?? winnerAt);
  const gradient = Array<number>(FEATURES).fill(0);
  let observed = 0;
  for (const [position, proposal] of displayed.entries()) {
    if (position === winnerAt) continue;
    const negative = features(proposal, proposal.menuPosition ?? position);
    const difference = positive.map((value, index) => value - negative[index]);
    const base = (winner.score ?? 0) - (proposal.score ?? 0);
    const score = difference.reduce((sum, value, index) => sum + value * adaptation.rank[index], base);
    const evidence = Math.min(1, Math.max(0, duration(proposal) / 400));
    if (!evidence) continue;
    observed++;
    const error = evidence / (1 + Math.exp(score));
    difference.forEach((value, index) => {gradient[index] += error * value;});
  }
  if (!observed) return;
  adaptation.rank = adaptation.rank.map((weight, index) => Math.max(-2, Math.min(2,
    weight + .08 * (gradient[index] / (displayed.length - 1) - .01 * weight))));
  adaptation.observations = Math.min(10000, adaptation.observations + 1);
}

export function writingAidWeek(adaptation: WritingAdaptation, now = Date.now()): WeeklyWritingAid {
  const week = Math.floor(now / WEEK);
  let row = adaptation.weeks.find(value => value.week === week);
  if (!row) {
    row = {week, impressions: 0, accepts: 0, retained: 0, undos: 0, keysSaved: 0};
    adaptation.weeks.push(row);
    if (adaptation.weeks.length > MAX_PARTS) adaptation.weeks.shift();
  }
  return row;
}

export function readWritingAidWeek(adaptation: WritingAdaptation, now = Date.now()): WeeklyWritingAid | undefined {
  return adaptation.weeks.find(row => row.week === Math.floor(now / WEEK));
}


function calibrationKey(proposal: WritingAidProposal, outcome: CalibrationOutcome) {
  const length = Math.max(0, proposal.insert.length - proposal.before.length);
  return [outcome, proposal.source ?? 'legacy', length < 8 ? 0 : length < 16 ? 1 : 2, Number(Boolean(proposal.before))].join(':');
}

/** Local observations are outcome-specific and contain only coarse buckets, never text. */
export function observeLocalCalibration(model: WritingAdaptation, proposal: WritingAidProposal, outcome: CalibrationOutcome, label: boolean): void {
  const key = calibrationKey(proposal, outcome);
  const row = model.calibration[key] ?? {successes: 0, trials: 0};
  if (row.trials >= 1000) {row.successes *= .95; row.trials *= .95;}
  row.trials++;
  row.successes += Number(label);
  model.calibration[key] = row;
  const keys = Object.keys(model.calibration);
  if (keys.length > 128) delete model.calibration[keys[0]];
}

export function localCalibrationEstimate(model: WritingAdaptation, proposal: WritingAidProposal, outcome: CalibrationOutcome,
  prior: number): number {
  const row = model.calibration[calibrationKey(proposal, outcome)];
  return row ? (row.successes + 40 * prior) / (row.trials + 40) : prior;
}
