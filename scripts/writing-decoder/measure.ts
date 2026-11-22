/** All-prefix development measurement; never selects a model or qualifies a release. */
import {createHash} from 'node:crypto';
import {mkdir, readFile, readdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import {controlOrder, deriveWordTargets, displayedRank, meanMetrics, measureWordReplays,
  type CompletionProbe, type Control, type ReplayMetrics, type WordReplay} from './metrics';

const root = fileURLToPath(new URL('../..', import.meta.url));
const output = 'docs/implementation/2026-11-22/ngram-spatial-decoder/evaluation';
const protocolPath = `${output}/protocol-v1.json`;
const protocol = JSON.parse(await readFile(resolve(root, protocolPath), 'utf8')) as {
  id: string; fixturePath: string; fixtureSha256: string; randomSeeds: number[];
  retrievalLimit: number; humanQualification: string; winnerSelection: string; heldOut: boolean;
  prefixLengthsReported: number[]; kValues: number[];
  missingQualificationInputs: string[];
};
const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const fixtureBytes = await readFile(resolve(root, protocol.fixturePath));
if (hash(fixtureBytes) !== protocol.fixtureSha256 || protocol.humanQualification !== 'blocked' ||
    protocol.winnerSelection !== 'prohibited' || protocol.heldOut !== false ||
    JSON.stringify(protocol.prefixLengthsReported) !== '[0,1,2,3]' || JSON.stringify(protocol.kValues) !== '[1,3]' ||
    protocol.randomSeeds.length !== 16 || new Set(protocol.randomSeeds).size !== 16 ||
    protocol.randomSeeds.some(seed => !Number.isSafeInteger(seed))) {
  throw new Error('Development protocol or its pinned input changed; version the protocol before rerunning');
}
const targets = deriveWordTargets((JSON.parse(fixtureBytes.toString('utf8')) as {
  completionCases: CompletionProbe[];
}).completionCases);
const server = await createServer({root, configFile: false, logLevel: 'error',
  optimizeDeps: {noDiscovery: true, include: []}, server: {middlewareMode: true, hmr: false, watch: null}});

try {
  const engine = await server.ssrLoadModule('/src/features/tutor/writingAid/engine.ts') as
    typeof import('../../src/features/tutor/writingAid/engine');
  const lexicon = await server.ssrLoadModule('/src/features/tutor/writingAid/decoder/lexicon.ts') as
    typeof import('../../src/features/tutor/writingAid/decoder/lexicon');
  const {padEdit} = await server.ssrLoadModule('/src/features/pad/padEdit.ts') as
    typeof import('../../src/features/pad/padEdit');
  if (protocol.retrievalLimit !== lexicon.MAX_DECODER_CANDIDATES) {
    throw new Error('Worker retrieval limit differs from the fixed development protocol');
  }
  const assetDirectory = 'public/models/writing-decoder/unigram-v1';
  const manifest = JSON.parse(await readFile(resolve(root, assetDirectory, 'manifest.json'), 'utf8'));
  const assetBytes = await readFile(resolve(root, assetDirectory, 'lexicon.json'));
  if (assetBytes.byteLength !== manifest.file.bytes || hash(assetBytes) !== manifest.file.sha256) {
    throw new Error('Lexicon bytes differ from their pinned manifest');
  }
  const index = lexicon.createDecoderLexicon(lexicon.parseDecoderLexicon(JSON.parse(assetBytes.toString('utf8'))));
  const paths = ['baseline', 'decoder'] as const;
  const controlSpecs: {key: string; control: Control; seed: number}[] = [
    {key: 'actual', control: 'actual', seed: 0},
    {key: 'degraded', control: 'degraded', seed: 0},
    {key: 'oracle', control: 'oracle', seed: 0},
    ...protocol.randomSeeds.map(seed => ({key: `random:${seed}`, control: 'random' as const, seed})),
  ];
  const runs = Object.fromEntries(paths.map(path => [path,
    Object.fromEntries(controlSpecs.map(control => [control.key, [] as WordReplay[]]))])) as
    Record<typeof paths[number], Record<string, WordReplay[]>>;
  for (const target of targets) {
    const words = Object.fromEntries(paths.map(path => [path, Object.fromEntries(controlSpecs.map(control =>
      [control.key, {id: target.id, target: target.target, opportunities: []} as WordReplay]))])) as
      Record<typeof paths[number], Record<string, WordReplay>>;
    for (let prefixLength = 0; prefixLength < target.target.length; prefixLength++) {
      const text = target.context + target.target.slice(0, prefixLength);
      const request: import('../../src/features/tutor/writingAid/policy').WritingAidRequest = {
        cursor: padEdit(text), anchor: text ? {text, start: 0} : null, mode: target.mode,
        composing: false, readOnly: false,
        target: {scopeKey: `measurement:${target.id}`, mountId: 'all-prefix-development',
          editorRevision: prefixLength, selectionRevision: 0, modeRevision: 0},
      };
      const prefix = engine.writingDecoderPrefix(request);
      const candidates = prefix ? lexicon.searchDecoderLexicon(index, prefix, lexicon.MAX_DECODER_CANDIDATES) : [];
      const pools = {baseline: engine.predictWritingAidPool(request),
        decoder: engine.predictWritingAidPool(request, undefined, candidates)};
      for (const path of paths) {
        const pool = pools[path];
        for (const spec of controlSpecs) {
          const ordered = controlOrder(pool.words, item => item.label, target.target,
            spec.control, spec.seed, `${target.id}/${prefixLength}`);
          const selected = engine.selectWritingAidPool({...pool, words: ordered}, undefined, undefined, 0);
          // All controls retain the original eligible pool; only ranking/selection changes.
          (words[path][spec.key].opportunities as Array<WordReplay['opportunities'][number]>).push({
            prefixLength, pool: pool.words.map(item => item.label), displayed: selected.words.map(item => item.label),
          });
        }
      }
    }
    for (const path of paths) for (const spec of controlSpecs) runs[path][spec.key].push(words[path][spec.key]);
  }

  const results = Object.fromEntries(paths.map(path => {
    const actual = measureWordReplays(runs[path].actual);
    const degraded = measureWordReplays(runs[path].degraded);
    const oracle = measureWordReplays(runs[path].oracle);
    const randomRuns = protocol.randomSeeds.map(seed => ({seed, metrics: measureWordReplays(runs[path][`random:${seed}`])}));
    const randomMean = meanMetrics(randomRuns.map(run => run.metrics));
    const close = (left: number, right: number) => Math.abs(left - right) <= 1e-12;
    const sanityChecks = {
      randomMrrBelowActual: randomMean.overallMrrAt3 < actual.overallMrrAt3 - 1e-12,
      actualMrrBelowOracle: actual.overallMrrAt3 < oracle.overallMrrAt3 - 1e-12,
      reversedRankingChangesMrr: !close(degraded.overallMrrAt3, actual.overallMrrAt3),
      oracleAtLeastActual: oracle.overallMrrAt3 + 1e-12 >= actual.overallMrrAt3 &&
        oracle.byPrefix.every((row, index) => (row.top1Accuracy ?? 0) + 1e-12 >= (actual.byPrefix[index].top1Accuracy ?? 0) &&
          (row.top3Accuracy ?? 0) + 1e-12 >= (actual.byPrefix[index].top3Accuracy ?? 0)) &&
        oracle.idealSavings.every((row, index) => row.netTapsSaved >= actual.idealSavings[index].netTapsSaved),
      controlsPreservePoolRecall: [degraded, oracle, ...randomRuns.map(run => run.metrics)]
        .every(control => control.anyPrefixPoolHits === actual.anyPrefixPoolHits),
    };
    if (!sanityChecks.oracleAtLeastActual || !sanityChecks.controlsPreservePoolRecall) {
      throw new Error('A metric/control invariant failed');
    }
    return [path, {actual, degraded, oracle, random: {mean: randomMean, runs: randomRuns}, sanityChecks}];
  })) as Record<typeof paths[number], {actual: ReplayMetrics; degraded: ReplayMetrics; oracle: ReplayMetrics;
    random: {mean: ReplayMetrics; runs: {seed: number; metrics: ReplayMetrics}[]}; sanityChecks: Record<string, boolean>}>;

  type RankingLoss = {taskId: string; mode: string; target: string; prefixLength: number; typedPrefix: string;
    baselineRank: number; decoderRank: number | null; baselineDisplayed: readonly string[]; decoderDisplayed: readonly string[]};
  const trajectoryRegressions: {top1Losses: RankingLoss[]; top3Losses: RankingLoss[]} = {top1Losses: [], top3Losses: []};
  for (let task = 0; task < targets.length; task++) {
    const target = targets[task], before = runs.baseline.actual[task], after = runs.decoder.actual[task];
    for (let prefixLength = 0; prefixLength < target.target.length; prefixLength++) {
      const oldOpportunity = before.opportunities[prefixLength], newOpportunity = after.opportunities[prefixLength];
      const baselineRank = displayedRank(oldOpportunity, target.target);
      const decoderRank = displayedRank(newOpportunity, target.target);
      const loss: RankingLoss = {taskId: target.id, mode: target.mode, target: target.target, prefixLength,
        typedPrefix: target.target.slice(0, prefixLength), baselineRank, decoderRank: decoderRank || null,
        baselineDisplayed: oldOpportunity.displayed, decoderDisplayed: newOpportunity.displayed};
      if (baselineRank === 1 && decoderRank !== 1) trajectoryRegressions.top1Losses.push(loss);
      if (baselineRank > 0 && decoderRank === 0) trajectoryRegressions.top3Losses.push(loss);
    }
  }

  async function pathsIn(directory: string): Promise<string[]> {
    const entries = await readdir(resolve(root, directory), {withFileTypes: true});
    const files: string[] = [];
    for (const entry of entries.sort((a, b) => a.name < b.name ? -1 : 1)) {
      const path = `${directory}/${entry.name}`;
      files.push(...(entry.isDirectory() ? await pathsIn(path) : [path]));
    }
    return files;
  }
  const sources = [protocolPath, `${output}/protocol-v1.md`, protocol.fixturePath,
    'scripts/writing-decoder/metrics.ts', 'scripts/writing-decoder/measure.ts',
    'package.json', 'package-lock.json',
    'src/features/tutor/writingAid/engine.ts', 'src/features/tutor/writingAid/policy.ts',
    'src/features/tutor/writingAid/useWritingAid.ts', 'src/flags.ts',
    'src/features/tutor/writingAid/learning.ts', 'src/features/tutor/input/completionPolicy.ts',
    'src/features/tutor/input/symbolEdit.ts', 'src/features/pad/padEdit.ts',
    ...await pathsIn('src/features/tutor/writingAid/vendor'),
    ...await pathsIn('src/features/tutor/writingAid/decoder'), ...await pathsIn(assetDirectory)];
  const sourceSha256 = Object.fromEntries(await Promise.all(sources.sort().map(async path =>
    [path, hash(await readFile(resolve(root, path)))])));
  const report = {
    protocolId: protocol.id, protocolSha256: sourceSha256[protocolPath],
    dataset: {kind: 'synthetic development probes derived from the unchanged fresh replay',
      source: protocol.fixturePath, sha256: protocol.fixtureSha256, targetTasks: targets.length,
      targetCharacters: targets.reduce((sum, row) => sum + row.target.length, 0),
      trainingSplit: null, validationSplit: null, heldOutSplit: null},
    retrievalLimit: protocol.retrievalLimit,
    qualification: {humanQualification: 'blocked', winnerSelection: 'prohibited', heldOut: false,
      confidenceIntervals: 'not estimated; these reused authored tasks are not independent learner observations',
      missingInputs: protocol.missingQualificationInputs},
    notMeasured: ['real learner accuracy', 'learner-choice certification', 'correction precision/recall',
      'notation precision/recall', 'fitted behavior', 'full-passage effort', 'latency', 'memory', 'battery', 'human preference'],
    execution: 'Node/Vite in-process; no browser, network, account, personal log, or live feature change',
    integrationSourcesRecordedButNotExecuted: ['src/features/tutor/writingAid/useWritingAid.ts', 'src/flags.ts'],
    sourceSha256, results, trajectoryRegressions,
    actualTrajectories: Object.fromEntries(paths.map(path => [path, runs[path].actual])),
  };
  const decimal = (value: number | null) => value === null ? '—' : value.toFixed(4);
  const percent = (value: number | null) => value === null ? '—' : `${(100 * value).toFixed(2)}%`;
  const controlsFor = (path: typeof paths[number]) => [
    ['Actual', results[path].actual], ['Random mean', results[path].random.mean],
    ['Degraded', results[path].degraded], ['Oracle', results[path].oracle],
  ] as const;
  const summaries = paths.flatMap(path => controlsFor(path).map(([control, value]) =>
    `| ${path} | ${control} | ${value.anyPrefixPoolHits}/${value.targetTasks} | ${decimal(value.overallMrrAt3)} | ${percent(value.idealSavings[0].savingsFraction)} | ${percent(value.idealSavings[1].savingsFraction)} |`)).join('\n');
  const prefixRows = paths.flatMap(path => controlsFor(path).flatMap(([control, value]) => value.byPrefix.map(row =>
    `| ${path} | ${control} | ${row.prefixLength} | ${row.opportunities} | ${percent(row.top1Accuracy)} | ${percent(row.top3Accuracy)} | ${decimal(row.mrrAt3)} |`))).join('\n');
  const sanityRows = paths.flatMap(path => Object.entries(results[path].sanityChecks).map(([check, passed]) =>
    `| ${path} | ${check} | ${passed ? 'Pass' : 'Not met'} |`)).join('\n');
  const savingsRows = paths.flatMap(path => results[path].actual.idealSavings.map(row =>
    `| ${path} | ${row.k} | ${row.targetCharacters} | ${row.charactersNotTyped} | ${row.acceptanceTaps} | ${row.netTapsSaved} | ${percent(row.savingsFraction)} |`)).join('\n');
  const describeLoss = (loss: RankingLoss) => `- \`${loss.taskId}\` (${loss.mode}, prefix ${loss.prefixLength}, \`${loss.typedPrefix}\`): ` +
    `\`${loss.target}\` moved from rank ${loss.baselineRank} to ${loss.decoderRank ?? 'absent'}. ` +
    `Existing display: ${JSON.stringify(loss.baselineDisplayed)}; decoder display: ${JSON.stringify(loss.decoderDisplayed)}.`;
  const lossDescription = `**${trajectoryRegressions.top1Losses.length} top-one loss(es); ${trajectoryRegressions.top3Losses.length} top-three loss(es)** across all prefixes. ` +
    `Aggregate gains do not erase these individual regressions.\n\n` +
    (trajectoryRegressions.top1Losses.length ? trajectoryRegressions.top1Losses.map(describeLoss).join('\n') + '\n\n' : '') +
    (trajectoryRegressions.top3Losses.length ? 'Top-three losses:\n\n' + trajectoryRegressions.top3Losses.map(describeLoss).join('\n') + '\n\n' : 'No intended word that was in the existing displayed three drops out of the decoder displayed three.\n\n');
  const markdown = `# All-prefix development measurement\n\n` +
    `| Experiment | Protocol | Data hash | Engine/model hash | Primary diagnostic (95% CI) | Secondary | Leaks | False corrections | Latency p95 | Memory | Not measured |\n` +
    `| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n` +
    `| N219 all-prefix development | ${protocol.id} | ${protocol.fixtureSha256.slice(0, 12)}… | ${sourceSha256['src/features/tutor/writingAid/engine.ts'].slice(0, 12)}… | Overall MRR@3: existing ${decimal(results.baseline.actual.overallMrrAt3)}, decoder ${decimal(results.decoder.actual.overallMrrAt3)}; CI not estimated | Prefix accuracy, pool recall, ideal target-word taps | Not certified; separate regression suite | Not evaluated; no new autocorrection | Not measured | Not measured | Learner, device, and human qualification |\n\n` +
    `**Human qualification: blocked. Winner selection: prohibited.** These are the same ${targets.length} hand-authored completion tasks, expanded deterministically to ${results.baseline.actual.prefixOpportunities} prefixes. They contain ${report.dataset.targetCharacters} target-word characters. They are not a held-out corpus or independent learner documents.\n\n` +
    `Run \`node --import tsx scripts/writing-decoder/measure.ts\`. Definitions and fixed settings are in [protocol-v1.md](protocol-v1.md) and [protocol-v1.json](protocol-v1.json). Exact source hashes, all actual prefix trajectories, and the 16 seeded random-control runs are in [results.json](results.json). Retrieval uses ${protocol.retrievalLimit} candidates, matching the worker.\n\n` +
    `## What changed from the earlier replay\n\nThe earlier replay measured one selected prefix per task. This protocol measures every prefix before the word is complete, adds MRR@3 and same-pool ranker controls, and counts one tap per ideal acceptance. Its numbers have different denominators and must not be presented as a continuation of the earlier fixed-prefix score table. No source fixture changed and no research qualification was added. No deviation from this development protocol.\n\n` +
    `## Whole-trajectory diagnostics\n\n| Path | Ordering | Any-prefix pool hits | Overall MRR@3 | Ideal target-word savings k=1 | Ideal target-word savings k=3 |\n| --- | --- | ---: | ---: | ---: | ---: |\n${summaries}\n\n` +
    `## Observed ranking regressions\n\n${lossDescription}` +
    `## Accuracy and reciprocal rank at prefixes 0–3\n\n| Path | Ordering | Prefix | Opportunities | Top-1 | Top-3 | MRR@3 |\n| --- | --- | ---: | ---: | ---: | ---: | ---: |\n${prefixRows}\n\n` +
    `## Sensitivity checks\n\n| Path | Check | Result |\n| --- | --- | --- |\n${sanityRows}\n\n` +
    `A tied or unmet strict ordering means this small dataset does not provide that diagnostic. It is recorded without changing the fixture. Random results are means over fixed reorderings of identical eligible pools, not extra independent data or confidence bounds. The oracle only promotes an already eligible intended word.\n\n` +
    `## Exact ideal-tap accounting for the actual order\n\n| Path | k | Target characters | Characters not typed | Acceptance taps | Net taps saved | Fraction |\n| --- | ---: | ---: | ---: | ---: | ---: | ---: |\n${savingsRows}\n\n` +
    `These are target-word upper bounds. The denominator excludes repeated context, punctuation and separators; the numerator gives no credit for inserted trailing spaces. Attention, page switches, missed or wrong accepts, and recovery are not modeled. These fractions are not full-passage effort, WPM, or evidence that suggestions make the learner faster.\n\n` +
    `## Remaining qualification\n\n${protocol.missingQualificationInputs.map(input => `- ${input}`).join('\n')}\n\n` +
    `No learner-choice certificate, correction certificate, phone performance claim, human preference claim, or model-selection decision follows from this report. The separate safety replay and hook/browser tests remain required.\n`;
  await mkdir(resolve(root, output), {recursive: true});
  await writeFile(resolve(root, output, 'results.json'), JSON.stringify(report, null, 2) + '\n');
  await writeFile(resolve(root, output, 'REPORT.md'), markdown);
  console.log(JSON.stringify({protocol: protocol.id, targetTasks: targets.length,
    prefixOpportunities: results.baseline.actual.prefixOpportunities, retrievalLimit: protocol.retrievalLimit,
    humanQualification: 'blocked', winnerSelection: 'prohibited',
    trajectoryRegressions,
    paths: Object.fromEntries(paths.map(path => [path, {actual: results[path].actual,
      randomMrr: results[path].random.mean.overallMrrAt3, degradedMrr: results[path].degraded.overallMrrAt3,
      oracleMrr: results[path].oracle.overallMrrAt3, sanityChecks: results[path].sanityChecks}]))}, null, 2));
} finally {
  await server.close();
}
