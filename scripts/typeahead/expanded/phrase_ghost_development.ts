import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {cpus} from 'node:os';
import {resolve} from 'node:path';
import {padEdit} from '../../../src/features/pad/padEdit';
import {findPhraseGhost, phraseGhostProposal, type PhraseGhostCandidate} from '../../../src/features/tutor/writingAid/phraseGhost';
import {PHRASE_GHOST_DEADLINE_MS, PHRASE_GHOST_FINGERPRINT, type PhraseGhostGroup} from '../../../src/features/tutor/writingAid/phraseGhostConfig';
import {applyWritingAidProposal, type WritingAidRequest} from '../../../src/features/tutor/writingAid/policy';

const freeze = JSON.parse(readFileSync(new URL('../../../docs/implementation/typeahead-evidence/natural-replay-freeze.json', import.meta.url), 'utf8'));
const bank = readFileSync(new URL('../../../src/features/tutor/writingAid/phrase-ghost-bank.json', import.meta.url));
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const sources = ['phraseGhost.ts', 'eligibility.ts', 'usePhraseGhost.ts', 'decoder/phraseGhost.worker.ts'];
const algorithm = createHash('sha256');
for (const path of sources) algorithm.update(readFileSync(new URL('../../../src/features/tutor/writingAid/' + path, import.meta.url)));
if (PHRASE_GHOST_FINGERPRINT !== 'phrase-trie-v1:' + sha256(bank) + ':' + algorithm.digest('hex')) throw new Error('Phrase provider fingerprint changed');

type Split = 'fit' | 'validation';
type Answer = {answerId: string; answer: string; source: string; documentGroup: string};
type Observation = {eventId: string; answerId: string; prefix: string};
type Scored = {candidate: PhraseGhostCandidate; exact: boolean; thread: Answer; elapsedMs: number};
type CalibratedRow = {group: PhraseGhostGroup; count: number; slope: number; intercept: number};

const [root, output] = process.argv.slice(2);
if (!root || !output) throw new Error('Usage: node --import tsx scripts/typeahead/expanded/phrase_ghost_development.ts <frozen schedule root> <receipt.json>');
function frozenRows<T>(split: Split, name: 'events.jsonl' | 'answers.jsonl'): T[] {
  const raw = readFileSync(resolve(root, split, name));
  if (sha256(raw) !== freeze.frozen.splits[split].files[name]) throw new Error(`Unexpected ${split}/${name} digest`);
  return raw.toString().trimEnd().split('\n').map(line => JSON.parse(line));
}

function request(row: Observation): WritingAidRequest {
  return {cursor: padEdit(row.prefix), anchor: row.prefix ? {text: row.prefix, start: 0} : null,
    target: {scopeKey: row.answerId, mountId: row.answerId, editorRevision: 1, selectionRevision: 1, modeRevision: 0},
    expanded: true, fasterTyping: true, phraseGhost: 'shadow', mode: 'balanced', composing: false, readOnly: false};
}

function score(split: Split) {
  const rows = frozenRows<Observation>(split, 'events.jsonl');
  const blind = rows.map(row => {
    const snapshot = request(row);
    const started = performance.now();
    const result = findPhraseGhost(snapshot);
    return {row, snapshot, result, elapsedMs: performance.now() - started};
  });
  const answers = frozenRows<Answer>(split, 'answers.jsonl');
  const byId = new Map(answers.map(row => [row.answerId, row]));
  const scored: Scored[] = [];
  const statuses: Record<string, number> = {ineligible: 0, expired: 0, superseded: 0, eligible: 0, candidate: 0, abstained: 0};
  const reasons: Record<string, number> = {};
  for (const {row, snapshot, result, elapsedMs} of blind) {
    const thread = byId.get(row.answerId);
    if (!thread || !thread.answer.startsWith(row.prefix)) throw new Error(`Misaligned frozen event ${row.eventId}`);
    if (result.status !== 'ineligible') statuses.eligible++;
    if (elapsedMs > PHRASE_GHOST_DEADLINE_MS) {statuses.expired++; continue;}
    statuses[result.status]++;
    if (result.status !== 'candidate') {reasons[result.reason] = (reasons[result.reason] ?? 0) + 1; continue;}
    const {candidate} = result;
    const proposal = phraseGhostProposal(snapshot, candidate.edit.insert);
    const applied = proposal && applyWritingAidProposal(snapshot, proposal);
    const {start, end, caret, insert} = candidate.edit;
    const exact = Boolean(applied && start === row.prefix.length && end === start && caret === start + insert.length &&
      applied.start === caret && applied.end === caret && applied.text === row.prefix + insert && thread.answer.startsWith(applied.text));
    scored.push({thread, candidate, exact, elapsedMs});
  }
  return {answers, scored, statuses, reasons, opportunities: rows.length, timing: blind.map(item => item.elapsedMs)};
}

const fitted = score('fit');
const development = score('validation');
const fitGroups = new Set(fitted.answers.map(answer => answer.documentGroup));
if (development.answers.some(answer => fitGroups.has(answer.documentGroup))) throw new Error('Thread groups overlap');

const sigmoid = (value: number) => 1 / (1 + Math.exp(-value));
function fitRows(rows: Scored[]): CalibratedRow[] {
  const groups = Map.groupBy(rows, row => row.candidate.group);
  return [...groups].flatMap(([group, rows]) => {
    const positives = rows.filter(row => row.exact).length;
    // Sparse or single-class groups abstain. The intercept prior and L2 term
    // stabilize fitting without treating the raw ranking score as a probability.
    if (rows.length < 100 || positives < 10 || rows.length - positives < 10) return [];
    let slope = 0, intercept = Math.log((positives + 1) / (rows.length - positives + 1));
    for (let pass = 0; pass < 600; pass++) {
      let slopeError = slope / 100, interceptError = 0;
      for (const row of rows) {
        const error = (sigmoid(slope * row.candidate.score + intercept) - Number(row.exact)) / rows.length;
        slopeError += error * row.candidate.score;
        interceptError += error;
      }
      slope = Math.max(0, slope - .05 * slopeError);
      intercept -= .05 * interceptError;
    }
    return [{group, count: rows.length, slope, intercept}];
  });
}

const calibrated = fitRows(fitted.scored);
const probability = (row: Scored) => {
  const model = calibrated.find(model => model.group === row.candidate.group);
  return model && sigmoid(model.slope * row.candidate.score + model.intercept);
};
const ratio = (numerator: number, denominator: number) => denominator ? numerator / denominator : null;
const percentile = (values: readonly number[], p: number) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1] ?? null;

function clusterInterval(answers: Answer[], selected: Scored[]) {
  if (!selected.length) return null;
  const perThread = Map.groupBy(selected, row => row.thread.documentGroup);
  const strata = Map.groupBy(answers, row => `${row.source}:${row.answer.length < 150 ? 'short' : row.answer.length < 500 ? 'medium' : 'long'}`);
  const populations = [...strata.values()].map(stratum => stratum.map(row => {
    const observations = perThread.get(row.documentGroup) ?? [];
    return {total: observations.length, exact: observations.filter(row => row.exact).length};
  }));
  let seed = 253074;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const draws: number[] = [];
  for (let index = 0; index < 10_000; index++) {
    let numerator = 0, denominator = 0;
    for (const population of populations) {
      for (let row = 0; row < population.length; row++) {
        const replaced = population[Math.floor(random() * population.length)];
        numerator += replaced.exact;
        denominator += replaced.total;
      }
    }
    if (denominator) draws.push(numerator / denominator);
  }
  return {lo: percentile(draws, .025), hi: percentile(draws, .975), nonemptyDraws: draws.length};
}

function summarize(split: ReturnType<typeof score>) {
  const {answers, scored, statuses, timing, opportunities} = split;
  function operatingPoint(rows: Scored[]) {
    const exact = rows.filter(row => row.exact).length;
    return {offers: rows.length, threads: new Set(rows.map(row => row.thread.documentGroup)).size, exact,
      precision: ratio(exact, rows.length), allCoverage: ratio(rows.length, opportunities), eligibleCoverage: ratio(rows.length, statuses.eligible),
      cluster95: clusterInterval(answers, rows)};
  }
  const support = [...Map.groupBy(scored, row => row.candidate.group)].map(([group, rows]) => ({group, ...operatingPoint(rows)}));
  const calibratedRows = scored.flatMap(row => {
    const p = probability(row);
    return p === undefined ? [] : [{p, exact: row.exact}];
  });
  const reliability = [...Map.groupBy(calibratedRows, row => Math.min(9, Math.floor(row.p * 10)))].map(([bin, rows]) => ({
    bin, n: rows.length, mean: rows.reduce((sum, row) => sum + row.p, 0) / rows.length,
    exact: rows.filter(row => row.exact).length,
  }));
  return {threads: answers.length, opportunities, statuses, reasons: split.reasons, support, allCandidates: operatingPoint(scored),
    labRule: operatingPoint(scored.filter(row => row.candidate.labAdmitted)),
    rankingCurve: [-4, -3, -2, -1, 0].map(score => ({score, ...operatingPoint(scored.filter(row => row.candidate.score >= score))})),
    exactnessCurve: [.7, .75, .8, .85, .9, .95].map(p => ({p, ...operatingPoint(scored.filter(row => (probability(row) ?? 0) >= p))})),
    brier: ratio(calibratedRows.reduce((sum, row) => sum + (row.p - Number(row.exact)) ** 2, 0), calibratedRows.length), reliability,
    cpuP90Ms: percentile(timing, .9), cpuP99Ms: percentile(timing, .99), cpuCandidateP90Ms: percentile(scored.map(row => row.elapsedMs), .9)};
}

const receipt = {fingerprint: PHRASE_GHOST_FINGERPRINT, node: process.version,
  cpuHost: {platform: process.platform, architecture: process.arch, model: cpus()[0]?.model}, decision: 'hold', operatingPoint: null,
  splitDigests: Object.fromEntries((['fit', 'validation'] as const).map(split => [split, freeze.frozen.splits[split].files])),
  scope: 'Fixed public fit and development draft observations with uniformly learner-authored prefixes and no live Tutor aids. CPU timings are synchronous provider calls on a shared host.',
  interval: {method: 'Stratified whole-thread bootstrap, conditional on a resample with at least one offer',
    strata: 'site × answer length (under 150, 150–499, 500+ UTF-16 units)', draws: 10000, seed: 253074},
  calibratedRows: calibrated, fit: summarize(fitted), development: summarize(development),
  held: {exactness: null, pairedIncrementalKsr: null, paint: null, phone: null, humanTime: null}};
writeFileSync(output, JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({fingerprint: receipt.fingerprint, fit: {opportunities: receipt.fit.opportunities, ...receipt.fit.labRule},
  development: {opportunities: receipt.development.opportunities, ...receipt.development.labRule}, calibrationRows: calibrated.length}));
