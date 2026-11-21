// Replace the provisional generator's candidate pools with the actual safety-
// gated production engine output. Runs an isolated local Vite/Chromium session.
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {createServer} from 'vite';

const path = 'docs/implementation/2026-11-21/writing-aid-adaptive/dataset.json';
const data = JSON.parse(await readFile(path, 'utf8'));
const server = await createServer({server: {host: '127.0.0.1', port: 0}, logLevel: 'error', clearScreen: false});
await server.listen();
const address = server.httpServer.address();
const base = `http://127.0.0.1:${address.port}${server.config.base}`;
const browser = await chromium.launch({headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  args: ['--no-sandbox']});
try {
  const page = await browser.newPage();
  await page.goto(base);
  data.cases = await page.evaluate(async ({cases, base}) => {
    const {predictWritingAidPool} = await import(new URL('src/features/tutor/writingAid/engine.ts', base).href);
    const {writingAidFeatures} = await import(new URL('src/features/tutor/writingAid/learning.ts', base).href);
    const {padEdit} = await import(new URL('src/features/pad/padEdit.ts', base).href);
    function firstOpportunity(row, before, target, mode) {
      let last = null;
      for (let n = 1; n < target.length; n++) {
        const prefix = target.slice(0, n);
        const learnerDraft = row.initial + before + prefix;
        const anchor = {text: learnerDraft, start: row.initial.length};
        const request = {cursor: padEdit(learnerDraft), anchor, mode, composing: false, readOnly: false,
          target: {scopeKey: row.id, mountId: 'experiment', editorRevision: 0, selectionRevision: 0, modeRevision: 0},
          surfaces: {words: true, ghost: false, replace: false, correction: false}};
        const proposals = predictWritingAidPool(request).words;
        if (!proposals.length) continue;
        if (proposals.some(p => p.before !== prefix || p.snapshot.anchor.text !== anchor.text ||
            p.snapshot.anchor.start !== anchor.start)) throw new Error('Engine changed anchor or replacement range');
        last = {prefix, learnerDraft, anchor, candidates: proposals.map(p => p.label),
          previous: writingAidFeatures(proposals[0]).previous.toLocaleLowerCase(), intendedWord: target};
        if (last.candidates.includes(target)) return last;
      }
      return last;
    }
    return cases.map(row => {
      const authored = row.intent.slice(row.initial.length);
      let targets;
      if (row.intendedWord) {
        const at = authored.indexOf(row.intendedWord);
        if (at < 0) throw new Error(`Target missing from ${row.id}`);
        targets = [{before: authored.slice(0, at), word: row.intendedWord}];
      } else {
        targets = [...authored.matchAll(/[A-Za-z]{4,}/gu)].map(m => ({before: authored.slice(0, m.index), word: m[0]}));
      }
      const modes = Object.fromEntries(['balanced','fast','strict','off'].map(mode => {
        for (const target of targets) {
          const opportunity = firstOpportunity(row, target.before, target.word, mode);
          if (opportunity) return [mode, opportunity];
        }
        return [mode, null];
      }));
      return {...row, modes};
    });
  }, {cases: data.cases, base});
  data.generatedBy = ['scripts/adaptive-writing-dataset.mjs', 'scripts/adaptive-writing-engine-pool.mjs'];
  data.stage = 'production-engine';
  data.candidateProvenance = 'Production predictWritingAidPool, model omitted, called locally in Chromium; no vocabulary-added candidates.';
  const sources = ['src/features/tutor/writingAid/engine.ts', 'src/features/tutor/writingAid/learning.ts',
    'src/features/tutor/writingAid/policy.ts', 'src/features/tutor/input/completionPolicy.ts',
    'src/features/tutor/input/symbolEdit.ts', 'src/features/pad/padEdit.ts',
    ...['study_input.mjs', 'accelerator.mjs', 'facade.mjs', 'commitment.mjs', 'phrases.mjs', 'shortcuts.mjs',
      'words.mjs', 'compact-ranks.json', 'wordlist.txt', 'word-assets.json', 'speed-policy.json',
      'legacy/cohort.mjs', 'legacy/complete.mjs', 'legacy/edits.mjs', 'legacy/linear_guard.mjs',
      'legacy/policy.json', 'legacy/revision.mjs', 'legacy/runtime-phrases.json', 'legacy/runtime-veto.json'].map(x =>
      `src/features/tutor/writingAid/vendor/${x}`)];
  data.sourceSha256 = Object.fromEntries(await Promise.all(sources.map(async source =>
    [source, createHash('sha256').update(await readFile(source)).digest('hex')])));
  await writeFile(path, JSON.stringify(data, null, 2) + '\n');
  console.log(JSON.stringify({cases: data.cases.length, offered: Object.fromEntries(['balanced','fast','strict','off'].map(mode =>
    [mode, data.cases.filter(row => row.modes[mode]).length]))}));
} finally {
  await browser.close();
  await server.close();
}
