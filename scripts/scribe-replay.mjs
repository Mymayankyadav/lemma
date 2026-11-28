import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {notationSuggestions} from '../src/features/tutor/notation.ts';
import {padEdit} from '../src/features/pad/padEdit.ts';

const base = '289838d6ec33c51515b9fea624fb92cb6cb55193';
const sourceBlobs = {
  '../src/features/tutor/notation.ts': 'f041e90db11ff37861de8764c4e7d67c1b14b168',
  '../src/features/pad/padEdit.ts': '74dc57a0094fe64350198dbbdd6990b693cc2d57',
};
const neutral = new Set(['a', 'an', 'are', 'is', 'of', 'the', 'that']);
const logical = new Set(['because', 'therefore', 'since', 'if', 'iff', 'hence', 'thus', 'contradiction', 'induction']);
const cap = 3;
const seed = 'scribe-n217-v1-43289';
const hash = s => createHash('sha256').update(s).digest('hex');

export const fixtures = Object.freeze([
  {id: 'six-first', occurrence: 'prove', p: 1, input: 'p', target: 'prove'},
  {id: 'six-last', occurrence: 'preimage', p: 1, input: 'p', target: 'preimage'},
  {id: 'co-1', occurrence: 'continuous', p: 1, input: 'A c', target: 'continuous'},
  {id: 'co-2', occurrence: 'continuous', p: 2, input: 'A co', target: 'continuous'},
  {id: 'co-3', occurrence: 'continuous', p: 3, input: 'A con', target: 'continuous'},
  {id: 'cm-2', occurrence: 'compact', p: 2, input: 'A co', target: 'compact'},
  {id: 'ex-2', occurrence: 'exists', p: 2, input: 'It ex', target: 'exists'},
  {id: 'fi-3', occurrence: 'finite', p: 3, input: 'A fin', target: 'finite'},
  {id: 'zz-3', occurrence: 'absent', p: 3, input: 'zzz', target: 'zzzet'},
  {id: 'next-a', occurrence: 'article', p: 0, input: 'is ', target: 'a'},
  {id: 'next-the', occurrence: 'article-2', p: 0, input: 'is ', target: 'the'},
  {id: 'hidden', occurrence: 'suppressed', p: 3, input: 'A fin', target: 'finite', suppressed: true},
  {id: 'weak', p: 1, input: 'b', blocked: ['because']},
  {id: 'method', p: 0, input: 'by ', blocked: ['induction', 'contradiction']},
  {id: 'quantifier', p: 0, input: 'for ', blocked: ['all', 'some', 'every', 'each']},
].map(row => Object.freeze({...row, ...(row.blocked ? {blocked: Object.freeze(row.blocked)} : {})})));

export function policyAllows({input, p}, {text, start, kind}) {
  if (p === 0) return kind === 'next' && start === input.length && neutral.has(text);
  const prefix = input.slice(-p).toLowerCase();
  const word = text.toLowerCase();
  return kind === 'word' && start === input.length - p && /^[a-z]+$/.test(word)
    && /^[a-z]+$/.test(prefix) && word.length > p && word.startsWith(prefix)
    && (!logical.has(word) || p >= 5);
}

export function capture(fixture) {
  // Original engine, no truth, tutor context, preference, planner or network.
  const rawEngine = notationSuggestions(padEdit(fixture.input), [], []);
  const engineOrder = rawEngine.map(c => c.text);
  const safePool = rawEngine.filter(c => policyAllows(fixture, c)).map(c => c.text);
  return Object.freeze({engineOrder: Object.freeze(engineOrder), safePool: Object.freeze(safePool)});
}

export function top(ranked, suppressed) {
  return suppressed ? [] : ranked.slice(0, cap);
}

// Integer units (MRR multiplied by 6) let the final report preserve exact fractions.
export function rankMetrics(shown, target) {
  const rank = shown.indexOf(target) + 1;
  return [rank === 1 ? 1 : 0, rank > 0 && rank <= cap ? 1 : 0, rank > 0 && rank <= cap ? 6 / rank : 0];
}

const gcd = (a, b) => b === 0n ? a : gcd(b, a % b);
const fraction = (a, b) => {
  const divisor = gcd(BigInt(a), BigInt(b));
  return [BigInt(a) / divisor, BigInt(b) / divisor];
};
const plus = ([a, b], [c, d]) => fraction(a * d + b * c, b * d);
const format = ([a, b]) => b === 1n ? String(a) : a + '/' + b;
export function expectedRandom(pool, target, suppressed = false) {
  if (suppressed || !pool.includes(target)) return [fraction(0, 1), fraction(0, 1), fraction(0, 1)];
  const n = pool.length;
  const m = Math.min(cap, n);
  return [fraction(1, n), fraction(m, n), fraction([0, 6, 9, 11][m], 6 * n)];
}

const orderedBy = (pool, key) => [...pool].sort((a, b) => {
  const [left, right] = [key(a), key(b)];
  return left < right ? -1 : left > right ? 1 : a < b ? -1 : a > b ? 1 : 0;
});

export function displays(fixture, {engineOrder, safePool}) {
  const shuffled = orderedBy(safePool, text => hash(JSON.stringify([seed, 'shuffle', fixture.id, text])));
  const oracle = safePool.includes(fixture.target)
    ? [fixture.target, ...safePool.filter(text => text !== fixture.target)] : safePool;
  return {
    unfilteredEngineOrder: fixture.suppressed ? [] : engineOrder,
    safeBaseline: top(safePool, fixture.suppressed),
    shuffled: top(shuffled, fixture.suppressed),
    oracle: top(oracle, fixture.suppressed),
  };
}

const names = ['top1', 'top3', 'mrr3'];
const table = values => Object.fromEntries(names.map((name, i) => [name, values[i]]));
function aggregate(rows) {
  const n = rows.length;
  const scoring = rows.map(({fixture, pool, shown}) => scoreRow(fixture, pool, shown));
  const scores = Object.fromEntries(['unfilteredEngineOrder', 'safeBaseline', 'shuffled', 'oracle'].map(mode => {
    const totals = [0, 0, 0];
    for (const row of scoring) row[mode].forEach((value, i) => { totals[i] += value; });
    return [mode, table(totals.map((value, i) => format(fraction(value, n * (i === 2 ? 6 : 1)))))];
  }));
  const chance = names.map((_, i) => {
    const [numerator, denominator] = scoring.map(row => row.chance[i]).reduce(plus, fraction(0, 1));
    return format(fraction(numerator, denominator * BigInt(n)));
  });
  return {opportunities: n, targetInPool: rows.filter(row => row.pool.includes(row.fixture.target)).length,
    suppressed: rows.filter(row => row.fixture.suppressed).length, ...scores, exactUniformChance: table(chance)};
}
const scoreRow = (fixture, pool, shown) => ({
  ...Object.fromEntries(Object.entries(shown).map(([mode, list]) => [mode, rankMetrics(list, fixture.target)])),
  chance: expectedRandom(pool, fixture.target, fixture.suppressed),
});

const sliceBy = (rows, key) => Object.fromEntries([...new Set(rows.map(key))].sort((a, b) => a - b)
  .map(value => [value, aggregate(rows.filter(row => key(row) === value))]));

export function makeReport() {
  const rows = fixtures.map(fixture => {
    const result = capture(fixture);
    return {fixture, pool: result.safePool, shown: displays(fixture, result)};
  });
  const scored = rows.filter(row => row.fixture.target != null);
  const allOccurrences = new Set(scored.map(row => row.fixture.occurrence));
  const reachableOccurrences = new Set(scored.filter(row => row.pool.includes(row.fixture.target))
    .map(row => row.fixture.occurrence));
  const probes = rows.filter(row => row.fixture.blocked);
  const leaks = mode => probes.filter(({fixture, shown}) => shown[mode].some(text => fixture.blocked.includes(text))).length;
  return {
    version: 'n217-replay-v1-synthetic', engine: 'N201 notationSuggestions', sourceCommit: base, sourceBlobs,
    fixtureSha256: hash(JSON.stringify(fixtures)),
    all: aggregate(scored), byPrefix: sliceBy(scored, row => row.fixture.p),
    byEligiblePoolSize: sliceBy(scored, row => row.pool.length),
    occurrencePoolRecall: {reachable: reachableOccurrences.size, total: allOccurrences.size},
    labelledProbes: {
      total: probes.length, unfilteredEngineOpportunities: leaks('unfilteredEngineOrder'),
      filteredOpportunities: leaks('safeBaseline'),
    },
    notMeasured: ['N202 C0', 'full upstream candidate universe', 'actual browser paint/viewport',
      'real learner safety', 'WPM', 'device performance'],
  };
}

function assertSourcePin() {
  for (const [module, pin] of Object.entries(sourceBlobs)) {
    const bytes = readFileSync(new URL(module, import.meta.url));
    const actual = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    if (actual !== pin) throw new Error(`Baseline file drifted: ${module}; pin a new protocol before comparing.`);
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  assertSourcePin();
  console.log(JSON.stringify(makeReport(), null, 2));
}
