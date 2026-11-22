/**
 * Fresh development regression replay. This does not recover the prior chat's
 * uncommitted replay, estimate user speed, certify autocorrection, or measure a phone.
 * Run from the repository root: node --import tsx scripts/writing-decoder/replay.ts
 */
import {createHash} from 'node:crypto';
import {mkdir, readFile, readdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import type {WritingAidMode} from '../../src/features/tutor/writingAid/policy';

interface Fixture {
  id: string;
  text: string;
  intended?: string;
  mode?: WritingAidMode;
  modes?: WritingAidMode[];
  expect?: 'empty' | 'emptyWords' | 'neutralWords';
  forbidden?: string[];
  anchor?: 'none';
  anchorStart?: number;
  composing?: boolean;
  readOnly?: boolean;
  caret?: number;
  surfacesOff?: boolean;
  sameOtherSurfaces?: boolean;
}
interface Fixtures {
  schemaVersion: number;
  suite: string;
  provenance: string;
  completionCases: Fixture[];
  safetyCases: Fixture[];
}

const root = fileURLToPath(new URL('../..', import.meta.url));
const output = 'docs/implementation/2026-11-22/ngram-spatial-decoder/replay';
const fixturePath = `${output}/fixtures.json`;
const fixtures = JSON.parse(await readFile(resolve(root, fixturePath), 'utf8')) as Fixtures;
const baselineOnly = process.argv.includes('--baseline-only');
if (fixtures.schemaVersion !== 1 || !fixtures.completionCases.length || !fixtures.safetyCases.length) {
  throw new Error('Missing or unsupported replay fixtures');
}
const ids = [...fixtures.completionCases, ...fixtures.safetyCases].map(row => row.id);
if (new Set(ids).size !== ids.length) throw new Error('Duplicate replay fixture id');

// Vite transforms the existing ?raw and TypeScript imports in process. No
// browser, listening socket, account, transcript, or browser storage participates.
const server = await createServer({
  root, configFile: false, appType: 'custom', logLevel: 'error',
  optimizeDeps: {noDiscovery: true, include: []},
  server: {middlewareMode: true, hmr: false, watch: null},
});
let retrievalLimit: number | null = null;
try {
  const rows = await (async () => {
    const {predictWritingAidPool, selectWritingAidPool, writingDecoderPrefix} = await server.ssrLoadModule(
      '/src/features/tutor/writingAid/engine.ts') as typeof import('../../src/features/tutor/writingAid/engine');
    const {applyWritingAidProposal} = await server.ssrLoadModule(
      '/src/features/tutor/writingAid/policy.ts') as typeof import('../../src/features/tutor/writingAid/policy');
    const {padEdit} = await server.ssrLoadModule(
      '/src/features/pad/padEdit.ts') as typeof import('../../src/features/pad/padEdit');
    const {wordAtCaret} = await server.ssrLoadModule(
      '/src/features/tutor/input/completionPolicy.ts') as typeof import('../../src/features/tutor/input/completionPolicy');
    const decoder = baselineOnly ? null : await server.ssrLoadModule(
      '/src/features/tutor/writingAid/decoder/lexicon.ts') as typeof import('../../src/features/tutor/writingAid/decoder/lexicon');
    let index: ReturnType<NonNullable<typeof decoder>['createDecoderLexicon']> | undefined;
    if (decoder) {
      retrievalLimit = decoder.MAX_DECODER_CANDIDATES;
      const asset = JSON.parse(await readFile(resolve(root, 'public/models/writing-decoder/unigram-v1/lexicon.json'), 'utf8'));
      index = decoder.createDecoderLexicon(decoder.parseDecoderLexicon(asset));
    }
    const neutral = new Set(['a', 'an', 'the', 'i', 'we', 'of', 'to', 'in', 'for', 'with', 'at', 'as', 'on', 'from']);
    const expanded = [
      ...fixtures.completionCases.map(row => ({...row, category: 'completion' as const, mode: row.mode ?? 'balanced'})),
      ...fixtures.safetyCases.flatMap(row => (row.modes ?? ['balanced', 'fast', 'strict']).map(mode =>
        ({...row, category: 'safety' as const, mode: mode as WritingAidMode}))),
    ];
    return expanded.map(row => {
      const request: import('../../src/features/tutor/writingAid/policy').WritingAidRequest = {
        cursor: padEdit(row.text, row.caret ?? row.text.length),
        anchor: row.anchor === 'none' ? null : {text: row.text, start: row.anchorStart ?? 0},
        target: {scopeKey: `replay:${row.id}`, mountId: 'fresh-development-replay',
          editorRevision: 1, selectionRevision: 1, modeRevision: 1},
        mode: row.mode, composing: row.composing ?? false, readOnly: row.readOnly ?? false,
        ...(row.surfacesOff ? {surfaces: {words: false, replace: false, correction: false, ghost: false}} : {}),
      };
      const snapshot = JSON.stringify(request);
      const before = predictWritingAidPool(request);
      const prefix = wordAtCaret(request.cursor) ?? '';
      const decoderPrefix = writingDecoderPrefix(request);
      const retrieved = decoder && index && decoderPrefix
        ? decoder.searchDecoderLexicon(index, decoderPrefix, decoder.MAX_DECODER_CANDIDATES) : [];
      const after = baselineOnly ? before : predictWritingAidPool(request, undefined, retrieved);
      // Enabled safety applies to the first paint and failure fallback, before any worker reply.
      const fallback = baselineOnly ? before : predictWritingAidPool(request, undefined, []);
      const beforeSelected = selectWritingAidPool(before, undefined, undefined, 0);
      const afterSelected = selectWritingAidPool(after, undefined, undefined, 0);
      const fallbackSelected = selectWritingAidPool(fallback, undefined, undefined, 0);
      type Pool = typeof before;
      const words = (pool: Pool) => pool.words.map(proposal => proposal.label);
      const summarize = (pool: Pool, selected: typeof beforeSelected) => ({
        pool: words(pool), top3: selected.words.map(proposal => proposal.label),
        intendedPoolRank: row.intended ? words(pool).indexOf(row.intended) + 1 || null : null,
        intendedTop3Rank: row.intended ? selected.words.findIndex(proposal => proposal.label === row.intended) + 1 || null : null,
        edit: pool.edit.map(proposal => ({kind: proposal.kind, before: proposal.before, insert: proposal.insert})),
        ghost: pool.ghost.map(proposal => proposal.insert),
      });
      function safetyErrors(pool: Pool): string[] {
        const errors: string[] = [];
        if (row.expect === 'empty' && (pool.words.length || pool.edit.length || pool.ghost.length)) errors.push('expected an empty pool');
        if (row.expect === 'emptyWords' && pool.words.length) errors.push('expected no word proposals');
        if (row.expect === 'neutralWords' && pool.words.some(proposal => !neutral.has(proposal.label.toLowerCase()))) {
          errors.push('next-word pool contains a non-neutral word');
        }
        for (const word of row.forbidden ?? []) {
          if (pool.words.some(proposal => proposal.label.toLowerCase() === word)) errors.push(`weak evidence offered ${word}`);
        }
        return errors;
      }
      const baseline = summarize(before, beforeSelected);
      const candidate = summarize(after, afterSelected);
      const guardedFallback = summarize(fallback, fallbackSelected);
      const contractErrors: string[] = [];
      if (JSON.stringify(request) !== snapshot) contractErrors.push('prediction mutated the request');
      if (afterSelected.words.length > 3) contractErrors.push('more than three selected words');
      if (JSON.stringify(candidate.edit) !== JSON.stringify(baseline.edit) ||
          JSON.stringify(candidate.ghost) !== JSON.stringify(baseline.ghost)) contractErrors.push('prefix lookup changed another surface');
      if (JSON.stringify(guardedFallback.edit) !== JSON.stringify(baseline.edit) ||
          JSON.stringify(guardedFallback.ghost) !== JSON.stringify(baseline.ghost)) contractErrors.push('guarded fallback changed another surface');
      let checkedApplications = 0, checkedStaleApplications = 0;
      for (const proposal of [...afterSelected.words, ...after.edit, ...after.ghost]) {
        checkedApplications++;
        const accepted = applyWritingAidProposal(request, proposal);
        if (!accepted || accepted.text !== row.text.slice(0, proposal.start) + proposal.insert + row.text.slice(proposal.end)) {
          contractErrors.push(`explicit acceptance failed: ${proposal.label}`);
        }
        const stale = [
          {...request, cursor: padEdit(`${row.text}x`)},
          {...request, target: {...request.target, editorRevision: 2}},
          {...request, target: {...request.target, selectionRevision: 2}},
          {...request, target: {...request.target, modeRevision: 2}},
          {...request, target: {...request.target, scopeKey: 'another-owner:another-checkpoint'}},
          {...request, target: {...request.target, mountId: 'another-composer'}},
          {...request, composing: true},
          {...request, readOnly: true},
          {...request, anchor: null},
        ];
        for (const changed of stale) {
          checkedStaleApplications++;
          if (applyWritingAidProposal(changed, proposal) !== null) contractErrors.push(`stale acceptance allowed: ${proposal.label}`);
        }
      }
      if (JSON.stringify(request) !== snapshot) contractErrors.push('acceptance mutated the original request');
      return {id: `${row.id}/${row.mode}`, category: row.category, mode: row.mode, text: row.text,
        ...(row.intended ? {intended: row.intended} : {}), prefix, decoderPrefix,
        retrieved: retrieved.map(item => ({word: item.word, frequency: item.frequency, riskTags: item.riskTags ?? []})),
        baseline, candidate, guardedFallback, baselineSafetyErrors: safetyErrors(before),
        candidateSafetyErrors: safetyErrors(after), fallbackSafetyErrors: safetyErrors(fallback),
        contractErrors, checkedApplications, checkedStaleApplications};
    });
  })();

  const completions = rows.filter(row => row.category === 'completion');
  const safety = rows.filter(row => row.category === 'safety');
  const metrics = (engine: 'baseline' | 'candidate') => ({
    oraclePoolHits: completions.filter(row => row[engine].intendedPoolRank !== null).length,
    top1Hits: completions.filter(row => row[engine].intendedTop3Rank === 1).length,
    top3Hits: completions.filter(row => row[engine].intendedTop3Rank !== null).length,
  });
  const regressions = completions.filter(row => row.baseline.intendedTop3Rank !== null && row.candidate.intendedTop3Rank === null).map(row => row.id);
  const gains = completions.filter(row => row.baseline.intendedTop3Rank === null && row.candidate.intendedTop3Rank !== null).map(row => row.id);
  const safetyFailures = rows.filter(row => row.candidateSafetyErrors.length).map(row => ({id: row.id, errors: row.candidateSafetyErrors}));
  const fallbackSafetyFailures = rows.filter(row => row.fallbackSafetyErrors.length).map(row => ({id: row.id, errors: row.fallbackSafetyErrors}));
  const baselineSafetyFailures = rows.filter(row => row.baselineSafetyErrors.length).map(row => ({id: row.id, errors: row.baselineSafetyErrors}));
  const contractFailures = rows.filter(row => row.contractErrors.length).map(row => ({id: row.id, errors: row.contractErrors}));
  const summary = {
    completionCases: completions.length, safetyCases: safety.length,
    baseline: metrics('baseline'), candidate: metrics('candidate'), top3Gains: gains, top3Regressions: regressions,
    baselineSafetyFailures, safetyFailures, fallbackSafetyFailures, contractFailures,
    explicitApplications: rows.reduce((sum, row) => sum + row.checkedApplications, 0),
    staleApplicationsRejected: rows.reduce((sum, row) => sum + row.checkedStaleApplications, 0),
    gatesPassed: !regressions.length && !safetyFailures.length && !fallbackSafetyFailures.length && !contractFailures.length,
  };
  console.log(JSON.stringify({baselineOnly, retrievalLimit, ...summary}, null, 2));
  if (baselineOnly) {
    // Diagnostic mode does not overwrite the paired result or its frozen inputs.
    process.exitCode = baselineSafetyFailures.length || contractFailures.length ? 1 : 0;
  } else {
    async function sourcePaths(directory: string): Promise<string[]> {
      const entries = await readdir(resolve(root, directory), {withFileTypes: true});
      const paths: string[] = [];
      for (const entry of entries.sort((a, b) => a.name < b.name ? -1 : 1)) {
        const path = `${directory}/${entry.name}`;
        paths.push(...(entry.isDirectory() ? await sourcePaths(path) : [path]));
      }
      return paths;
    }
    const sources = [fixturePath, 'scripts/writing-decoder/replay.ts',
      'src/features/tutor/writingAid/engine.ts', 'src/features/tutor/writingAid/policy.ts',
      'src/features/tutor/writingAid/learning.ts', 'src/features/tutor/input/completionPolicy.ts',
      'src/features/tutor/input/symbolEdit.ts', 'src/features/pad/padEdit.ts',
      ...await sourcePaths('src/features/tutor/writingAid/vendor'),
      ...await sourcePaths('src/features/tutor/writingAid/decoder'),
      ...await sourcePaths('public/models/writing-decoder/unigram-v1')];
    const sourceSha256 = Object.fromEntries(await Promise.all(sources.sort().map(async path =>
      [path, createHash('sha256').update(await readFile(resolve(root, path))).digest('hex')])));
    const report = {schemaVersion: 1, suite: fixtures.suite, provenance: fixtures.provenance,
      comparison: 'Existing predictWritingAidPool(request), versus the same policy with verified lexicon prefix candidates as argument 3. Both omit personalization. Guarded fallback passes an empty candidate list. Top3 arrays are ranked selection order; the historical oraclePoolHits field counts eligible pool presence at one selected prefix per fixture, not any-prefix oracle recall or a learned oracle ranker.',
      execution: 'Deterministic Node/Vite source replay in process, without a browser or network. No latency, memory, physical-device, human typing, or autocorrection certification claims.',
      retrievalLimit, summary, sourceSha256, rows};
    await mkdir(resolve(root, output), {recursive: true});
    await writeFile(resolve(root, output, 'results.json'), JSON.stringify(report, null, 2) + '\n');
    const table = completions.map(row => `| ${row.id} | ${row.intended} | ${row.baseline.intendedPoolRank ?? '—'} | ${row.candidate.intendedPoolRank ?? '—'} | ${row.baseline.intendedTop3Rank ?? '—'} | ${row.candidate.intendedTop3Rank ?? '—'} |`).join('\n');
    const failures = [...regressions.map(id => `${id}: intended completion fell out of the displayed three`),
      ...safetyFailures.map(row => `${row.id}: ${row.errors.join('; ')}`),
      ...fallbackSafetyFailures.map(row => `${row.id}: guarded fallback: ${row.errors.join('; ')}`),
      ...contractFailures.map(row => `${row.id}: ${row.errors.join('; ')}`)];
    const markdown = `# Fresh decoder development replay\n\n${fixtures.provenance}\n\n` +
      `Run \`node --import tsx scripts/writing-decoder/replay.ts\` from the repository root. The script exits nonzero if a baseline displayed intended completion is lost, a listed safety condition fails in the warm or guarded-fallback path, another suggestion surface changes, or explicit/stale acceptance fails. \`--baseline-only\` diagnoses the existing path without replacing paired results.\n\n` +
      `## Result\n\n**Gate: ${summary.gatesPassed ? 'PASS' : 'FAIL'}.** ${completions.length} completion probes and ${safety.length} safety requests.\n\n` +
      `| Metric | Existing path | Lexicon path |\n| --- | ---: | ---: |\n` +
      `| Intended word in eligible pool | ${summary.baseline.oraclePoolHits}/${completions.length} | ${summary.candidate.oraclePoolHits}/${completions.length} |\n` +
      `| Intended word ranked first | ${summary.baseline.top1Hits}/${completions.length} | ${summary.candidate.top1Hits}/${completions.length} |\n` +
      `| Intended word in displayed three | ${summary.baseline.top3Hits}/${completions.length} | ${summary.candidate.top3Hits}/${completions.length} |\n\n` +
      `${gains.length} displayed-completion gains; ${regressions.length} losses. ${safetyFailures.length} candidate safety failures; ${fallbackSafetyFailures.length} guarded-fallback safety failures; ${baselineSafetyFailures.length} baseline safety failures. ${contractFailures.length} proposal-contract failures. ${summary.explicitApplications} explicit proposal applications checked; ${summary.staleApplicationsRejected} changed-request applications checked for rejection.\n\n` +
      `These pool counts use one fixed prefix per fixture. The historical JSON field \`oraclePoolHits\` is not the plan's any-prefix oracle recall. The separately versioned [measurement protocol](../evaluation/protocol-v1.md) reports all-prefix and per-prefix metrics without changing these frozen inputs.\n\n` +
      `## Per-case intended-word ranks\n\nA dash means absent. Pool ranks are after eligibility guards; displayed ranks use the existing three-slot selector. All retrieved words, eligible pools, displayed lists, risk tags, and failures are in [results.json](results.json).\n\n` +
      `| Case / mode | Intended word | Existing pool | Lexicon pool | Existing top 3 | Lexicon top 3 |\n| --- | --- | ---: | ---: | ---: | ---: |\n${table}\n\n` +
      `## Failures\n\n${failures.length ? failures.map(failure => `- ${failure}`).join('\n') : 'None in the bounded gates above.'}\n\n` +
      `## Scope and limits\n\nThe fixture was written for development and can inform fixes. It must not be described as a held-out evaluation or a recovery of the lost prior replay. No fitting or split-leakage claim is made. The existing path is invoked with no third argument; the lexicon path passes real asset lookup candidates through the same runtime guards. Both omit the learned personalization model. Source and asset hashes identify the evaluated bytes.\n\n` +
      `Each lookup requests at most ${retrievalLimit} candidates (\`MAX_DECODER_CANDIDATES\`), matching the worker's retrieval limit before the main-thread policy filters.\n\n` +
      `This replay covers prediction and application contracts. Worker transport, loading/failure fallback, flag-off UI behavior, tap/Tab acceptance and Undo require the separate unit/browser checks. It does not measure speed, touch accuracy, latency, memory, or physical-phone usability. New autocorrection remains disabled.\n`;
    await writeFile(resolve(root, output, 'REPORT.md'), markdown);
    process.exitCode = summary.gatesPassed ? 0 : 1;
  }
} finally {
  await server.close();
}
