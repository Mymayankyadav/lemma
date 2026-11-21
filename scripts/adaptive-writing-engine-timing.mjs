// Host-only warm engine timing, using production word pools and the empty
// production ranker. This is not Android, end-to-end UI, or human latency.
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {createServer} from 'vite';

const directory = 'docs/implementation/2026-11-21/writing-aid-adaptive';
const data = JSON.parse(await readFile(`${directory}/dataset.json`, 'utf8'));
for (const [source, expected] of Object.entries(data.sourceSha256)) {
  if (createHash('sha256').update(await readFile(source)).digest('hex') !== expected) {
    throw new Error(`${source} changed; regenerate dataset and rerun the experiment`);
  }
}
const server = await createServer({server: {host: '127.0.0.1', port: 0}, logLevel: 'error', clearScreen: false});
await server.listen();
const base = `http://127.0.0.1:${server.httpServer.address().port}${server.config.base}`;
const browser = await chromium.launch({headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  args: ['--no-sandbox']});
try {
  const page = await browser.newPage();
  await page.goto(base);
  const measurements = await page.evaluate(async ({cases, base}) => {
    const {predictWritingAidPool, selectWritingAidPool} = await import(new URL('src/features/tutor/writingAid/engine.ts', base).href);
    const {createWritingAidModel} = await import(new URL('src/features/tutor/writingAid/learning.ts', base).href);
    const {padEdit} = await import(new URL('src/features/pad/padEdit.ts', base).href);
    const model = createWritingAidModel();
    const observations = Object.fromEntries(['balanced','fast','strict'].map(mode => [mode, []]));
    for (let pass = 0; pass < 4; pass++) {
      for (const row of cases) for (const mode of ['balanced','fast','strict']) {
        const slot = row.modes[mode];
        if (!slot) continue;
        const request = {cursor: padEdit(slot.learnerDraft), anchor: slot.anchor, mode, composing: false, readOnly: false,
          target: {scopeKey: row.id, mountId: 'timing', editorRevision: 0, selectionRevision: 0, modeRevision: 0},
          surfaces: {words: true, ghost: false, replace: false, correction: false}};
        const start = performance.now();
        const pool = predictWritingAidPool(request, model);
        selectWritingAidPool(pool, model, undefined, 1_700_000_000_000);
        const elapsed = performance.now() - start;
        if (pass) observations[mode].push(elapsed);
      }
    }
    return Object.fromEntries(Object.entries(observations).map(([mode, values]) => {
      values.sort((a,b) => a-b);
      const at = p => values[Math.min(values.length - 1, Math.floor(values.length * p))];
      return [mode, {samples: values.length, medianMs: at(.5), p95Ms: at(.95), p99Ms: at(.99), maxMs: values.at(-1)}];
    }));
  }, {cases: data.cases, base});
  const result = {scope: 'Warm Chromium host: word-only predictWritingAidPool plus selectWritingAidPool, empty contextual model; excludes rendering and device latency.',
    warmupPasses: 1, measuredPasses: 3, measurements};
  await writeFile(`${directory}/engine-timing.json`, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
  await server.close();
}
