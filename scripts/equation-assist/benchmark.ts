import {readFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import * as ort from 'onnxruntime-web/wasm';
import {algebraReadingKey} from '../../src/features/pad/equationAssist/algebra';
import {
  autoeqInput, equationCandidateKey, localEquationCandidates, modelEquationCandidates,
} from '../../src/features/pad/equationAssist/candidates';
import {decodeEquation} from '../../src/features/pad/equationAssist/decode';
import {beamSearch, encodeInput, normalizeLatex, OrtStepper, type Vocabulary} from '../../src/features/pad/equationAssist/upstreamDecoder.js';

interface Case {
  input: string;
  context?: string;
  readings: string[];
  requireEveryReading?: boolean;
}

const cases: Record<'algebra' | 'selection', Case[]> = JSON.parse(readFileSync(new URL('./cases.json', import.meta.url), 'utf8'));
const assets = new URL('../../public/models/equation-assist/autoeq-v1.4/', import.meta.url);
const vocabulary: Vocabulary = JSON.parse(readFileSync(new URL('vocab.json', assets), 'utf8'));
const bytes = (name: string) => new Uint8Array(readFileSync(new URL(name, assets)));
ort.env.wasm.numThreads = 1;
const encoder = await ort.InferenceSession.create(bytes('encoder.int8.onnx'));
const decoder = await ort.InferenceSession.create(bytes('decoder.int8.onnx'));
const stepper = new OrtStepper(ort, encoder, decoder);

const stock = async ({input}: Case) => (await beamSearch(stepper, encodeInput(input, vocabulary), vocabulary, {k:3, maxLen:vocabulary.max_output}))?.map(c => c.latex) ?? [];
const refined = async ({input}: Case) => (await decodeEquation(stepper, vocabulary, input))?.map(c => c.latex) ?? [];
const assist = async ({input, context = ''}: Case) => {
  const local = localEquationCandidates({text:input, context, start:0, end:input.length, inMath:false});
  if (local.length) return local.map(c => c.latex);
  if (!autoeqInput(input)) return [];
  return modelEquationCandidates(input, await refined({input, readings:[]})).map(c => c.latex);
};

const key = (latex: string) => algebraReadingKey(latex) ?? equationCandidateKey(latex);
function percentile(values: number[], p: number) {
  const sorted = [...values].sort((a,b) => a - b);
  return Math.round(sorted[Math.ceil(p * sorted.length) - 1] * 10) / 10;
}

async function compare(rows: Case[], after: (row: Case) => Promise<string[]>, rounds: number) {
  const runs = [{name:'stock', run:stock}, {name:'refined', run:after}];
  const samples: number[][] = [[], []];
  const output: Array<{row: Case; stock: string[]; refined: string[]}> = [];
  for (let round=0; round<rounds; round++) {
    for (const [index, row] of rows.entries()) {
      if (round === 0) output.push({row, stock:[], refined:[]});
      // Alternate which decoder runs first on each case.
      for (const offset of [0, 1]) {
        const slot = (index + round + offset) % 2;
        const {name, run} = runs[slot];
        const started = performance.now();
        const candidates = await run(row);
        samples[slot].push(performance.now() - started);
        if (round === 0) output[index][name as 'stock' | 'refined'] = candidates;
      }
    }
  }
  const ambiguous = rows.filter(row => row.requireEveryReading).length;
  const counts = runs.map(({name}, slot) => {
    let top1 = 0, every = 0, outside = 0, suggestions = 0;
    for (const result of output) {
      const expected = result.row.readings.map(key);
      const actual = result[name as 'stock' | 'refined'].map(key);
      top1 += Number(expected[0] === actual[0]);
      if (result.row.requireEveryReading) every += Number(expected.every(reading => actual.includes(reading)));
      outside += actual.filter(reading => !expected.includes(reading)).length;
      suggestions += actual.length;
    }
    return {name, top1, total:rows.length, every, ambiguous, outside, suggestions,
      medianMs:percentile(samples[slot], .5), p95Ms:percentile(samples[slot], .95)};
  });
  return {counts, output};
}

async function upstreamRegression() {
  type Upstream = {id: string; plain: string; top1: string};
  const suite: Upstream[] = readFileSync(new URL('./upstream-cases.jsonl', import.meta.url), 'utf8')
    .trim().split('\n').map(line => JSON.parse(line));
  const complete = suite.filter(row => !row.id.startsWith('A30'));
  const regressions: string[] = [];
  let stockTop1 = 0, refinedTop1 = 0;
  for (const row of complete) {
    const testCase = {input:row.plain, readings:[row.top1]};
    const expected = normalizeLatex(row.top1);
    const before = await stock(testCase), after = await refined(testCase);
    const matchedStock = normalizeLatex(before[0] ?? '') === expected;
    const matchedRefined = normalizeLatex(after[0] ?? '') === expected;
    stockTop1 += Number(matchedStock);
    refinedTop1 += Number(matchedRefined);
    if (matchedStock && !matchedRefined) regressions.push(row.plain);
  }
  return {cases:complete.length, stockTop1, refinedTop1, regressions};
}

try {
  await stock({input:'a+b/2', readings:[]});
  await refined({input:'a+b/2', readings:[]});
  const algebra = await compare(cases.algebra, refined, 5);
  const selection = await compare(cases.selection, assist, 1);
  const upstream = await upstreamRegression();
  if (process.argv.includes('--json')) console.log(JSON.stringify({algebra, selection, upstream}, null, 2));
  else {
    console.log('Typed algebra, real decoder');
    console.table(algebra.counts);
    console.log('Selected text and optional context, complete algorithm');
    console.table(selection.counts);
    console.log('Upstream suite, complete expressions', upstream);
  }
  if (upstream.regressions.length) process.exitCode = 1;
} finally {
  await decoder.release();
  await encoder.release();
}
