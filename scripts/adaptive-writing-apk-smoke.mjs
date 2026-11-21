import {execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import {copyFile, mkdtemp, readFile, rm, stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, extname, join, resolve} from 'node:path';
import {chromium, expect} from '@playwright/test';
import {demoStartPath} from './android-writing-aid-fixture.mjs';

const apk = process.argv[2] && resolve(process.argv[2]);
if (!apk?.endsWith('.apk')) throw new Error('Pass the writing-aid test APK path');
const preview = apk.replace(/\.apk$/, '-preview.png');
const ghostPreview = apk.replace(/\.apk$/, '-ghost.png');
const tutorPreview = apk.replace(/\.apk$/, '-tutor.png');
const unpacked = await mkdtemp(join(tmpdir(), 'lemma-adaptive-apk-smoke-'));
let browser, server;
try {
  execFileSync('unzip', ['-q', apk, 'assets/*', '-d', unpacked]);
  const root = join(unpacked, 'assets/public');
  const bootstrap = JSON.parse(await readFile(join(unpacked, 'assets/capacitor.config.json'), 'utf8'));
  if (bootstrap.appId !== 'io.github.mymayankyadav.lemma.writingaidtest' || bootstrap.server.appStartPath !== demoStartPath) {
    throw new Error('Unexpected package identity or default launch path');
  }
  const mime = new Map([
    ['.html', 'text/html'], ['.js', 'application/javascript'], ['.css', 'text/css'], ['.json', 'application/json'],
    ['.svg', 'image/svg+xml'], ['.woff', 'font/woff'], ['.woff2', 'font/woff2'], ['.wasm', 'application/wasm'],
  ]);
  server = createServer(async (request, response) => {
    try {
      const {pathname} = new URL(request.url, 'http://localhost');
      const requested = resolve(root, '.' + decodeURI(pathname));
      if (requested !== root && !requested.startsWith(root + '/')) throw new Error('Path outside APK web root');
      const path = (await stat(requested)).isDirectory() ? join(requested, 'index.html') : requested;
      response.writeHead(200, {'Content-Type': mime.get(extname(path)) ?? 'application/octet-stream'});
      response.end(await readFile(path));
    } catch {
      response.writeHead(404);
      response.end();
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium'});
  const context = await browser.newContext({viewport: {width: 390, height: 844}, deviceScaleFactor: 2,
    isMobile: true, hasTouch: true, reducedMotion: 'reduce', serviceWorkers: 'block'});
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  // The local server represents packaged assets. All external requests are unavailable.
  await page.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort());
  await page.goto(origin + bootstrap.server.appStartPath);
  const log = page.getByRole('log', {name: 'Conversation', exact: true});
  const sample = 'The question asks about the original wording of the previous sentence';
  await expect(log).toContainText('Demo tutor sample for testing writing assistance.');
  await expect(log).toContainText(sample);
  await expect(log).not.toContainText('lemma-writing-v1');
  const answer = page.getByRole('textbox', {name: 'Your answer', exact: true});
  await expect(answer).toHaveJSProperty('tagName', 'TEXTAREA');
  expect(await page.evaluate(() => {
    const data = localStorage.getItem('lemma.demo-tutor.writing-aid-model.v1:default');
    return data ? JSON.parse(data).model.autoTrust?.['teh-to-the']?.accepts ?? 0 : 0;
  })).toBe(0);
  const type = async text => {
    await answer.fill('');
    await answer.focus();
    await page.keyboard.type(text);
    await expect(answer).toHaveValue(text);
  };
  await type('The question asks about the');
  const fromTutor = page.getByRole('button', {name: 'Accept continuation original wording of the previous sentence, from tutor', exact: true});
  await expect(fromTutor).toBeVisible();
  await expect(fromTutor).toContainText('From tutor');
  await page.screenshot({path: join(unpacked, 'tutor.png'), animations: 'disabled'});
  await fromTutor.tap();
  await expect(answer).toHaveValue(sample);
  await page.getByRole('button', {name: 'Undo suggestion', exact: true}).tap();
  await expect(answer).toHaveValue('The question asks about the');

  // The bootstrap is one-shot with respect to an existing checkpoint thread.
  await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('lemma-demo-tutor', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction('checkpoint-threads', 'readwrite'), store = tx.objectStore('checkpoint-threads');
        const key = ['default', 'real-analysis', 'project-analysis-cp-4'], request = store.get(key);
        request.onsuccess = () => {
          const thread = request.result;
          thread.turns[0].snapshot.question = 'Show me a sample writing suggestion. (preserved)';
          store.put(thread, key);
        };
        tx.oncomplete = resolve;
        tx.onabort = tx.onerror = () => reject(tx.error);
      });
    } finally { db.close(); }
  });
  await page.reload();
  await expect(log).toContainText('Show me a sample writing suggestion. (preserved)');

  await page.goto(origin + '/lemma/?demo=1#/settings?section=tutor');
  const settings = page.getByRole('region', {name: 'Writing aid settings'});
  await expect(settings.getByRole('radio', {name: /^Balanced\b/})).toBeChecked();
  await expect(settings.getByRole('group', {name: 'Tutor hints'}).getByRole('radio', {name: 'Wording', exact: true})).toBeChecked();
  await expect(settings.getByRole('switch', {name: 'Personalize suggestions', exact: true})).toBeChecked();
  await expect(settings.getByRole('switch', {name: 'Correct common typos automatically', exact: true})).toBeChecked();
  for (const name of ['Keyboard word suggestions', 'Notation replacements', 'Spelling corrections', 'Faded continuations']) {
    await expect(settings.getByRole('switch', {name, exact: true})).toBeChecked();
  }

  await page.goto(origin + bootstrap.server.appStartPath);
  await expect(answer).toHaveJSProperty('tagName', 'TEXTAREA');
  await type('We wrote teh');
  const correction = page.getByRole('button', {name: 'Replace teh with the', exact: true});
  await expect(correction).toBeVisible();
  const marked = page.locator('.writing-editor-mirror [data-writing-aid-source]');
  await expect(marked).toHaveText('teh');
  await expect(marked).toHaveCSS('text-decoration-line', 'line-through');
  await page.screenshot({path: join(unpacked, 'preview.png'), animations: 'disabled'});
  await correction.tap();
  await expect(answer).toHaveValue('We wrote the');
  await page.getByRole('button', {name: 'Undo suggestion', exact: true}).tap();
  await expect(answer).toHaveValue('We wrote teh');

  await type('nota');
  const words = page.getByRole('group', {name: 'Word suggestions', exact: true});
  await expect(words.getByRole('button', {name: 'Insert notation', exact: true})).toBeVisible();
  const labels = () => words.locator('button:enabled').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label')));
  const before = await labels();
  await page.getByRole('button', {name: 'Refresh suggestions', exact: true}).tap();
  await expect.poll(async () => (await labels()).join('|')).not.toBe(before.join('|'));
  await expect(answer).toHaveValue('nota');

  // Cold typos remain manual. Two explicitly accepted corrections qualify the
  // exact personal pair for the third occurrence, which stays undoable.
  await type('I read teh');
  for (let accepted = 0; accepted < 2; accepted++) {
    await correction.tap();
    if (accepted === 0) await page.keyboard.type(' I read teh');
  }
  await expect(answer).toHaveValue('I read the I read the');
  await page.keyboard.type(' I read teh ');
  await expect(answer).toHaveValue('I read the I read the I read the ');
  const automatic = page.locator('.writing-aid-auto-correction');
  await expect(automatic).toContainText('Corrected');
  await expect(automatic.locator('del')).toHaveText('teh');
  await expect(automatic.locator('strong')).toHaveText('the');
  await page.getByRole('button', {name: 'Undo suggestion', exact: true}).tap();
  await expect(answer).toHaveValue('I read the I read the I read teh ');

  const cdp = await context.newCDPSession(page);
  async function drag(distance) {
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
    const box = await answer.boundingBox();
    const x = Math.round(box.x + box.width / 2 - distance / 2), y = Math.round(box.y + box.height / 2);
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x, y, id: 1}]});
    // A real finger moves through intermediate points. A single instant jump
    // also makes a plain Chromium page suppress its next tap as a fling stop.
    for (let step = 1; step <= 4; step++) {
      await cdp.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x: x + Math.round(distance * step / 4), y, id: 1}]});
      await new Promise(resolve => setTimeout(resolve, 45));
    }
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
  }
  await type('could you restate');
  const continuation = page.getByRole('button', {name: 'Accept continuation the question', exact: true});
  await expect(continuation).toBeVisible();
  await expect(page.locator('.writing-editor-mirror')).toHaveText('could you restate the question');
  await expect.poll(() => page.locator('.writing-editor-mirror').evaluate(node => {
    const range = document.createRange();
    range.selectNodeContents(node.lastChild);
    const bounds = node.getBoundingClientRect();
    const rects = Array.from(range.getClientRects()).filter(rect => rect.height > 0);
    return rects.length ? Math.max(0, ...rects.map(rect => Math.max(bounds.top - rect.top, rect.bottom - bounds.bottom))) : Infinity;
  })).toBeLessThanOrEqual(1);
  await page.screenshot({path: join(unpacked, 'ghost.png'), animations: 'disabled'});
  await page.evaluate(() => history.pushState({}, '', location.href));
  await drag(90);
  await expect(answer).toHaveValue('could you restate');
  await type('could you restate');
  await continuation.tap();
  await expect(answer).toHaveValue('could you restate the question');
  await page.getByRole('button', {name: 'Undo suggestion', exact: true}).tap();
  await expect(answer).toHaveValue('could you restate');
  await type('could you restate');
  await continuation.tap();
  await page.getByRole('group', {name: 'Answer keyboard', exact: true}).getByRole('button', {name: 'q', exact: true}).tap();
  await expect(answer).toHaveValue('could you restate the questionq');
  if (pageErrors.length) throw new Error('App errors: ' + pageErrors.join('; '));
  await copyFile(join(unpacked, 'preview.png'), preview);
  await copyFile(join(unpacked, 'ghost.png'), ghostPreview);
  await copyFile(join(unpacked, 'tutor.png'), tutorPreview);
  console.log('Packaged default demo passed with external requests blocked: first-run sample and preserved existing thread, tutor-backed continuation/tap/Undo, Balanced and personalization defaults, textarea strike-through, correction/undo, keyboard refresh, qualified personal autocorrection/undo, no drag acceptance, and explicit continuation tap/Undo.');
} finally {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
  await rm(unpacked, {recursive: true, force: true});
}
