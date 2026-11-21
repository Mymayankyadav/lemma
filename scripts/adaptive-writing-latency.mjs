import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdir, readFile, readdir, writeFile} from 'node:fs/promises';
import os from 'node:os';
import {dirname, resolve} from 'node:path';
import {chromium} from 'playwright';

const base = process.env.WRITING_AID_CAPTURE_URL ?? 'http://127.0.0.1:4191/lemma/';
const route = new URL('?demo=1&flags=v7Shell,v6Shell#/p/real-analysis/cp/CP4/tutor', base);
const output = resolve(process.env.WRITING_AID_LATENCY_OUTPUT ?? 'docs/implementation/2026-11-21/writing-aid-tutor/ui-latency.json');
const cases = [
  {surface: 'word', prefix: 'not', key: 'a', selector: '[data-writing-aid-word][title="notation"]'},
  {surface: 'spelling', prefix: 'We wrote te', key: 'h', selector: '[data-writing-aid-edit][aria-label="Replace teh with the"]'},
  {surface: 'notation', prefix: 'Let ep', key: 's', selector: '[data-writing-aid-edit][aria-label="Replace eps with ε"]'},
  {surface: 'continuation', prefix: 'could you restat', key: 'e', selector: '.writing-editor-mirror'},
];
const rounds = 16;
const round = n => Math.round(n * 100) / 100;
const percentile = (values, p) => values.toSorted((a, b) => a - b)[Math.ceil(values.length * p) - 1];
const observations = [];
const assets = {};
const sourcePaths = ['src/features/tutor/TutorComposer.tsx', 'src/features/tutor/TutorAnswerEditor.tsx',
  'src/features/tutor/WritingAidBar.tsx', 'src/features/tutor/writing-aid.css', 'src/features/tutor/writingAid/engine.ts',
  'src/features/tutor/writingAid/useWritingAid.ts', 'src/features/tutor/writingAid/policy.ts',
  'src/features/tutor/writingAid/learning.ts', 'src/features/tutor/writingAid/autoCorrect.ts',
  'src/features/tutor/writingAid/tutorContext.ts', 'scripts/adaptive-writing-latency.mjs'];
const sourceSha256 = Object.fromEntries(await Promise.all(sourcePaths.map(async path => [path,
  createHash('sha256').update(await readFile(path)).digest('hex')])));
for (const name of (await readdir('dist/assets')).filter(name => /^(?:DemoCheckpointTutor|TutorPage|WritingAidSettings|engine)-.*\.(?:js|css)$/.test(name)).sort()) {
  assets[name] = createHash('sha256').update(await readFile('dist/assets/' + name)).digest('hex');
}

const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || undefined});
try {
  for (const cpuRate of [1, 6]) {
    const context = await browser.newContext({viewport: {width: 390, height: 844}, reducedMotion: 'reduce', serviceWorkers: 'block'});
    try {
      const page = await context.newPage();
      page.setDefaultTimeout(15_000);
      await page.addInitScript(() => {
        // The Android bundle has no service worker registration.
        for (let proto = navigator; proto; proto = Object.getPrototypeOf(proto)) {
          if (Object.prototype.hasOwnProperty.call(proto, 'serviceWorker')) Reflect.deleteProperty(proto, 'serviceWorker');
        }
      });
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', {rate: cpuRate});
      await page.goto(route.href);
      await page.getByRole('button', {name: 'Write a question', exact: true}).click();
      const answer = page.getByRole('textbox', {name: 'Your answer', exact: true});
      if (await answer.evaluate(node => node.tagName) !== 'TEXTAREA') throw new Error('Expected the Android-default textarea');
      // Warm the lazy engine and rendering path before the measured observations.
      await answer.focus();
      await page.keyboard.type('nota');
      await page.locator(cases[0].selector).waitFor();
      for (let iteration = 0; iteration < rounds; iteration++) {
        for (let index = 0; index < cases.length; index++) {
          const {surface, prefix, key, selector} = cases[(index + iteration) % cases.length];
          await answer.fill('');
          await answer.focus();
          await page.keyboard.insertText(prefix);
          // The timed character starts from a settled prefix, not from a cold app.
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          await page.evaluate(({selector, surface}) => {
            const matched = () => {
              const node = document.querySelector(selector);
              return Boolean(node && (surface !== 'continuation' || node.firstElementChild?.textContent === 'could you restate' &&
                node.lastChild?.textContent === ' the question'));
            };
            if (matched()) throw new Error(`Already displayed ${selector}`);
            window.writingAidReadyTime = new Promise((resolve, reject) => {
              let inputAt;
              const observer = new MutationObserver(() => {
                if (inputAt === undefined || !matched()) return;
                observer.disconnect();
                clearTimeout(timer);
                requestAnimationFrame(() => resolve(performance.now() - inputAt));
              });
              const timedInput = () => {
                inputAt = performance.now();
                observer.observe(document.body, {childList: true, subtree: true, attributes: true});
              };
              const timer = setTimeout(() => {
                document.removeEventListener('input', timedInput, true);
                observer.disconnect();
                reject(new Error(`Timed out waiting for ${selector}`));
              }, 10_000);
              document.addEventListener('input', timedInput, {capture: true, once: true});
            });
          }, {selector, surface});
          await page.keyboard.press(key);
          const elapsed = await page.evaluate(() => window.writingAidReadyTime);
          observations.push({cpuRate, surface, sample: iteration + 1, ms: round(elapsed)});
        }
      }
    } finally {
      await context.close();
    }
  }
  const summary = [1, 6].flatMap(cpuRate => cases.map(({surface}) => {
    const times = observations.filter(row => row.cpuRate === cpuRate && row.surface === surface).map(row => row.ms);
    if (times.length !== rounds) throw new Error(`Incomplete ${cpuRate}x ${surface}: ${times.length} samples`);
    return {cpuRate, surface, samples: times.length, p50Ms: percentile(times, .5), p95Ms: percentile(times, .95),
      maxMs: Math.max(...times), under400Ms: times.filter(ms => ms < 400).length};
  }));
  const report = {
    scope: 'Warm production build on the development host with the Android-default textarea, from captured native input to the next animation-frame opportunity after the matching suggestion appears. Chromium CPU throttling is not Android WebView or a phone measurement.',
    generatedAt: new Date().toISOString(), browser: browser.version(), viewport: {width: 390, height: 844},
    machine: {platform: process.platform, architecture: process.arch, cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length},
    balancedMode: true, samplesPerSurfacePerRate: rounds,
    baseCommit: execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim(), sourceSha256,
    builtAssetsSha256: assets, summary, observations,
  };
  await mkdir(dirname(output), {recursive: true});
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(summary, null, 2));
  console.log('Evidence: ' + output);
} finally {
  await browser.close();
}
