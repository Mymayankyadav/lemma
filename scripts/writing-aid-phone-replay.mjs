// Fixed, reproducible engine comparison. Run from the repository root.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {cp, mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {createServer} from 'vite';
import {replayTutorStudy} from './tutor-writing-regression.mjs';
import {collectReplay, score} from './writing-aid-simulation.mjs';

const run = promisify(execFile);
const baseline = '232a29fd07b4588a09a706f63e220147fdcc9128';
const dir = 'docs/implementation/2026-11-21/writing-aid-tutor';
const data = await readFile(`${dir}/dataset.json`);
const cases = JSON.parse(data).cases.filter(row => row.split === 'test');
const manifest = JSON.parse(await readFile(`${dir}/manifest.json`));
const geometryStudy = JSON.parse(await readFile('docs/implementation/2026-11-21/writing-aid/simulation.json'));
const phone = geometryStudy.profiles.find(row => row.id === 'phone-night');
const probes = [
  ['phone-prefix', 'In the sample for testing jok', 'joke'],
  ['phone-boundary', 'In the sample for testing ', 'joke'],
  ['generic-boundary', 'This is ', 'a'],
  ['everyday-document', 'Please send the docum', 'document'],
  ['everyday-tomorrow', 'I will meet you tomor', 'tomorrow'],
  ['study-converges', 'The sequence conver', 'converges'],
  ['study-function', 'Suppose the funct', 'function'],
  ['study-arbitrary', 'Let epsilon be arbit', 'arbitrary'],
  ['proof-sequence', 'We conclude that ', 'sequence'],
  ['proof-convergence', 'By the definition of ', 'convergence'],
  ['proof-epsilon', 'For every ', 'epsilon'],
  ['proof-limit', 'Therefore the ', 'limit'],
  ['neutral-yesterday', 'I saw it yesterday ', null],
  ['neutral-notebook', 'I opened my notebook ', null],
  ['neutral-constructor', 'Call the constructor ', null],
  ['neutral-banana', 'I ate a banana ', null],
].map(([id,text,desired]) => ({id,text,desired, category: id.startsWith('proof-') ? 'open-proof-choice' : id.includes('boundary') || id.startsWith('neutral-') ? 'boundary-observation' : 'authored-prefix'}));
const modes = ['balanced', 'fast', 'strict'];
const root = await mkdtemp(join(tmpdir(), 'writing-phone-'));
let server, browser;
try {
  await writeFile(join(root, 'index.html'), '<!doctype html><title>Writing aid replay</title>');
  await mkdir(join(root, 'baseline'));
  const archive = join(root, 'baseline.tar');
  await run('git', ['archive', '--output', archive, baseline, 'src', 'scripts/tutor-writing-kernel.mjs']);
  await run('tar', ['-xf', archive, '-C', join(root, 'baseline')]);
  await mkdir(join(root, 'working', 'scripts'), {recursive: true});
  await cp('src', join(root, 'working', 'src'), {recursive: true});
  await cp('scripts/tutor-writing-kernel.mjs', join(root, 'working', 'scripts', 'tutor-writing-kernel.mjs'));
  server = await createServer({root, configFile: false, logLevel: 'error', server: {host: '127.0.0.1', port: 0, hmr: false}, optimizeDeps: {noDiscovery: true}});
  await server.listen();
  const entry = `http://127.0.0.1:${server.httpServer.address().port}/`;
  browser = await chromium.launch({headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium'});
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);
  await page.goto(entry);
  const report = {baseline, datasetSha256: createHash('sha256').update(data).digest('hex'), probes, versions: {}};
  const tutorRuns = {};
  for (const id of ['baseline', 'working']) {
    const base = entry + id + '/';
    const raw = await page.evaluate(async ({base, probes}) => {
      const {predictWritingAid} = await import(new URL('src/features/tutor/writingAid/engine.ts', base).href);
      const {padEdit} = await import(new URL('src/features/pad/padEdit.ts', base).href);
      const {advanceWritingAidAnchor} = await import(new URL('src/features/tutor/writingAid/policy.ts', base).href);
      return probes.map(({id,text,desired,category}) => {
        let cursor = padEdit(''), anchor = null;
        for (const char of text) { const next = padEdit(cursor.text + char); anchor = advanceWritingAidAnchor(cursor, next, anchor); cursor = next; }
        const request = {cursor, anchor, mode: 'balanced', composing: false, readOnly: false,
          target: {scopeKey: id, mountId: 'phone-replay', editorRevision: 0, selectionRevision: 0, modeRevision: 0}};
        const words = predictWritingAid(request).words.map(word => word.label);
        const match = desired && words.some(word => word.toLowerCase() === desired.toLowerCase());
        return {id, words, ...(category === 'authored-prefix' ? {desiredCovered: !!match} : category === 'open-proof-choice' ? {prohibitedTargetExposed: !!match, abstained: words.length === 0} : {})};
      });
    }, {base, probes});
    const episodes = await collectReplay(browser, base, entry);
    const geometry = Object.fromEntries(modes.map(mode => {
      const result = score(phone.geometry, episodes[mode], phone.paths).placement.fixed;
      return [mode, {wpm: result.sensitivity[0].modeledWpm, wpmAt40msIgnored: result.glanceSensitivity.find(x => x.scanMs === 40).modeledWpm, accepts: result.accepts, ignoredLists: result.ignoredLists}];
    }));
    const tutor = await page.evaluate(replayTutorStudy, {base, cases, manifest, trained: {models: {}}, composerActions: true, audit: modes.map(mode => ({candidate: 'tutor-wording', mode}))});
    tutorRuns[id] = tutor;
    const tutorSummary = Object.fromEntries(modes.map(mode => [mode, {...tutor[mode].byRegime.all, bySurface: Object.fromEntries(Object.entries(tutor[mode].surfaces).map(([surface, value]) => [surface, value.accepted]))}]));
    report.versions[id] = {raw, desiredCoverage: {covered: raw.filter(x => x.desiredCovered).length, total: raw.filter(x => 'desiredCovered' in x).length}, geometry, tutor: tutorSummary};
    console.log(id, JSON.stringify({coverage: report.versions[id].desiredCoverage, geometry, tutor: Object.fromEntries(modes.map(m => [m, tutorSummary[m].wpm40]))}));
  }
  const millis = row => 400 * (row.manualChars + row.backspaces) + 300 * row.taps + 40 * row.glances + 1000 * row.extraRecoverySeconds;
  report.pairedTutor = Object.fromEntries(modes.map(mode => {
    const before = tutorRuns.baseline[mode].records, after = tutorRuns.working[mode].records;
    if (before.length !== after.length || before.some((row, i) => row.id !== after[i].id)) throw new Error('Unpaired tutor records');
    const deltas = after.map((row, i) => millis(row) - millis(before[i]));
    return [mode, {faster: deltas.filter(x => x < 0).length, tied: deltas.filter(x => x === 0).length, slower: deltas.filter(x => x > 0).length, totalDeltaSeconds: deltas.reduce((a,b) => a+b, 0) / 1000}];
  }));
  report.workingSourceSha256 = {};
  for (const path of ['src/features/tutor/writingAid/engine.ts', 'src/features/tutor/input/proofVocabulary.ts']) {
    report.workingSourceSha256[path] = createHash('sha256').update(await readFile(path)).digest('hex');
  }
  report.protocol = {tutorTasks: cases.length, composerActions: true, candidate: 'tutor-wording', passages: geometryStudy.drafts, phoneProfile: phone.id, probes: 'authored prefixes use exact-label desired coverage; open proof choices report named prohibited targets and abstention; boundaries are observational; no tutor context or learned model'};
  await writeFile(`${dir}/phone-replay.json`, JSON.stringify(report, null, 2) + '\n');
} finally {
  await browser?.close();
  await server?.close();
  await rm(root, {recursive: true, force: true});
}
