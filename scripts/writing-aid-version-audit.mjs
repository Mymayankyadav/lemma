// Replays immutable engines under two fixed workloads. Run from the repository root.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {createServer} from 'vite';
import {replayTutorStudy} from './tutor-writing-regression.mjs';
import {collectReplay, score} from './writing-aid-simulation.mjs';

const versions = {
  'first-ui': '9a84cf4fd7cac502fee14b0712fb38a1c6372235',
  'prior-adaptive': 'bc7f012d4b6a108585a822318eb3fe6641a8d789',
  'tutor-apk': '894fa52d049101b822ec043fbc58b7285d891356',
};
const study = 'docs/implementation/2026-11-21';
const tutor = study + '/writing-aid-tutor';
const dataset = await readFile(tutor + '/dataset.json');
const cases = JSON.parse(dataset).cases.filter(row => row.split === 'test');
const manifest = JSON.parse(await readFile(tutor + '/manifest.json'));
const archived = JSON.parse(await readFile(tutor + '/regression.json'));
const geometryStudy = JSON.parse(await readFile(study + '/writing-aid/simulation.json'));
const drafts = (await readFile(study + '/writing-aid/replay-drafts.jsonl', 'utf8')).trim().split('\n').map(line => JSON.parse(line));
const phone = geometryStudy.profiles.find(profile => profile.id === 'phone-night');
const modes = ['balanced', 'fast', 'strict'];
const round = x => Math.round(x * 1000) / 1000;
const sum = (rows, key) => rows.reduce((total, row) => total + row[key], 0);
const millis = row => 400 * (row.manualChars + row.backspaces) + 300 * row.taps +
  40 * row.glances + 1000 * row.extraRecoverySeconds;
const wpm = rows => sum(rows, 'targetChars') * 12000 / rows.reduce((ms, row) => ms + millis(row), 0);

function proofScores(episodes, id) {
  const result = {};
  for (const mode of modes) {
    const rows = episodes[mode];
    const fixed = score(phone.geometry, rows, phone.paths).placement.fixed;
    if (id === 'first-ui') assert.deepEqual(fixed, phone.modes[mode].placement.fixed);
    result[mode] = {
      wpm: fixed.sensitivity[0].modeledWpm,
      wpmAt40msIgnored: fixed.glanceSensitivity.find(s => s.scanMs === 40).modeledWpm,
      accepts: fixed.accepts, ignoredLists: fixed.ignoredLists,
      savedCharacters: rows.flatMap(r => r.events).reduce((total, event) => total + (event.skipped ?? 0), 0),
    };
  }
  return result;
}

function changedAccepts(before, after) {
  return Object.fromEntries(modes.map(mode => {
    const changes = [];
    for (const [i, draft] of drafts.entries()) {
      const at = event => event.offset + '/' + event.word;
      const accepts = run => run[mode][i].events.filter(event => event.kind === 'accept');
      const describe = event => {
        const text = draft.initial + draft.target.slice(0, event.offset);
        const prefix = text.match(/[\p{L}\p{M}]+$/u)?.[0] ?? '';
        return {at: event.offset, prefix, word: event.word, savedChars: event.skipped};
      };
      const a = accepts(before), b = accepts(after);
      const previousOnly = a.filter(x => !b.some(y => at(x) === at(y))).map(describe);
      const apkOnly = b.filter(x => !a.some(y => at(x) === at(y))).map(describe);
      if (previousOnly.length || apkOnly.length) changes.push({draft: draft.id, previousOnly, apkOnly});
    }
    return [mode, changes];
  }));
}

function tutorScores(result) {
  return Object.fromEntries(Object.entries(result).map(([mode, run]) => [mode, {
    ...run.byRegime.all, consecutiveWordAccepts: sum(run.records, 'consecutiveAccepts'),
    punctuationAccepts: sum(run.records, 'punctuationAccepts'),
    bySurface: Object.fromEntries(Object.entries(run.surfaces).map(([surface, v]) => [surface, v.accepted])),
  }]));
}

function paired(prior, current) {
  const results = {};
  for (const mode of modes) {
    const before = prior[mode].records, after = current[mode].records;
    assert.deepEqual(after.map(r => r.id), before.map(r => r.id));
    const delta = after.map((row, i) => Math.round(millis(row) - millis(before[i])));
    const byKind = {};
    for (const kind of new Set(before.map(r => r.kind))) {
      const a = before.filter(r => r.kind === kind), b = after.filter(r => r.kind === kind);
      byKind[kind] = {tasks: a.length, priorWpm: round(wpm(a)), apkWpm: round(wpm(b)),
        extraSecondsInApk: round(b.reduce((s, r, i) => s + millis(r) - millis(a[i]), 0) / 1000)};
    }
    results[mode] = {faster: delta.filter(x => x < 0).length, tied: delta.filter(x => x === 0).length,
      slower: delta.filter(x => x > 0).length, deltaWpm: round(wpm(after) - wpm(before)), byKind};
  }
  return results;
}

const root = await mkdtemp(join(tmpdir(), 'lemma-writing-audit-'));
let server, browser;
try {
  await writeFile(join(root, 'index.html'), '<!doctype html><title>Frozen engine comparison</title>');
  for (const [id, sha] of Object.entries(versions)) {
    const dir = join(root, id);
    await mkdir(dir);
    const paths = id === 'tutor-apk' ? ['src', 'scripts/tutor-writing-kernel.mjs'] : ['src'];
    const archive = execFileSync('git', ['archive', sha, ...paths], {maxBuffer: 32 * 1024 ** 2});
    execFileSync('tar', ['-x', '-C', dir], {input: archive});
  }
  server = await createServer({root, configFile: false, logLevel: 'error',
    server: {host: '127.0.0.1', port: 0, hmr: false}, optimizeDeps: {noDiscovery: true}});
  await server.listen();
  const entry = 'http://127.0.0.1:' + server.httpServer.address().port + '/';
  browser = await chromium.launch({headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium'});
  const page = await browser.newPage();
  await page.goto(entry);
  const proof = {}, proofEvents = {}, runs = {archived: {}, composer: {}};
  for (const id of Object.keys(versions)) {
    const base = entry + id + '/';
    proofEvents[id] = await collectReplay(browser, base, entry);
    proof[id] = proofScores(proofEvents[id], id);
    if (id === 'first-ui') continue;
    const candidate = id === 'prior-adaptive' ? 'contextual' : 'tutor-wording';
    for (const [protocol, profiles] of Object.entries(runs)) {
      const args = {base, scoringBase: entry + 'tutor-apk/', cases, manifest, trained: {models: {}},
        composerActions: protocol === 'composer', audit: modes.map(mode => ({candidate, mode}))};
      profiles[id] = await page.evaluate(replayTutorStudy, args);
      if (id === 'tutor-apk') {
        const off = await page.evaluate(replayTutorStudy, {...args, audit: [{candidate: 'off', mode: 'balanced'}]});
        profiles.off = off.balanced.byRegime.all;
        assert.deepEqual(profiles.off, archived.test.off.byRegime.all);
      }
    }
  }
  // The unmodified behavioral protocol must reproduce the published APK figures exactly.
  const original = runs.archived['tutor-apk'];
  for (const mode of modes) {
    const recorded = mode === 'balanced' ? archived.test[archived.winner] : archived.modeSafety[mode];
    assert.deepEqual(original[mode].byRegime, recorded.byRegime);
    assert.deepEqual(original[mode].surfaces, recorded.surfaces);
  }
  const tutorTasks = {};
  for (const [protocol, profiles] of Object.entries(runs)) {
    const prior = profiles['prior-adaptive'], current = profiles['tutor-apk'];
    tutorTasks[protocol] = {off: profiles.off, 'prior-adaptive': tutorScores(prior),
      'tutor-apk': tutorScores(current), paired: paired(prior, current)};
  }
  const report = {versions, datasetSha256: createHash('sha256').update(dataset).digest('hex'),
    proofPassages: {tasks: geometryStudy.drafts, targetChars: geometryStudy.typedCharacters,
      touchProfile: phone.id, ...proof, changedAccepts: changedAccepts(proofEvents['prior-adaptive'], proofEvents['tutor-apk'])},
    tutorWorkload: {tasks: cases.length, uniqueIntents: new Set(cases.map(r => r.intent)).size,
      uniqueManualStrings: new Set(cases.map(r => r.manualText)).size,
      users: new Set(cases.map(r => r.user)).size, ...tutorTasks}};
  await writeFile(tutor + '/version-comparison.json', JSON.stringify(report, null, 2) + '\n');
  for (const [id, scores] of Object.entries(proof)) console.log('16 passages', id, modes.map(m => scores[m].wpm));
  for (const [protocol, scores] of Object.entries(tutorTasks)) {
    for (const id of ['prior-adaptive', 'tutor-apk']) console.log(protocol, id, modes.map(m => round(scores[id][m].wpm40)));
  }
} finally {
  try { await browser?.close(); } finally {
    try { await server?.close(); } finally { await rm(root, {recursive: true, force: true}); }
  }
}
