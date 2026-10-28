// RELEASE-01 R1: real service worker install, offline shell, update and IndexedDB retention.
// Serves only built dist/ over Chromium's trustworthy localhost origin. No cloud account.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const worker = fs.readFileSync(path.join(dist, 'service-worker.js'), 'utf8');
const tag = /lemma-shell-([a-f0-9]{12})/.exec(worker);
assert(tag, 'built service worker must contain a versioned shell cache');
const oldName = tag[0];
const newName = 'lemma-shell-' + (tag[1] === 'ffffffffffff' ? 'eeeeeeeeeeee' : 'ffffffffffff');
const nextHtml = html.replace('</title>', ' — PWA upgrade</title>');
const nextWorker = worker.replace(oldName, newName);
assert(nextHtml !== html && nextWorker !== worker, 'simulate an actual new app build');

let next = false;
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };
const resources = new Map([
  ['/', () => [next ? nextHtml : html, mime['.html']]],
  ['/index.html', () => [next ? nextHtml : html, mime['.html']]],
  ['/service-worker.js', () => [next ? nextWorker : worker, mime['.js']]],
  ['/manifest.webmanifest', () => [fs.readFileSync(path.join(dist, 'manifest.webmanifest')), mime['.webmanifest']]],
  ['/icons/icon.svg', () => [fs.readFileSync(path.join(dist, 'icons/icon.svg')), mime['.svg']]]
]);
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const key = pathname.startsWith('/lemma/') ? pathname.slice('/lemma'.length) : null;
  const asset = key && resources.get(key);
  if (req.method !== 'GET' || !asset) { res.writeHead(404); res.end('not found'); return; }
  const [body, type] = asset();
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store',
    'Service-Worker-Allowed': '/lemma/' });
  res.end(body);
});
const listen = () => new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const close = () => new Promise(resolve => server.close(resolve));
const wait = 20000;
async function saved(page) {
  await page.waitForFunction(() =>
    (document.querySelector('#sync .sr-only')?.textContent || '').includes('Saved on device'),
    null, { timeout: wait });
}
async function snapshot(page, front) {
  return page.evaluate(front => new Promise((resolve, reject) => {
    const req = indexedDB.open('lemma-flashcards', 1);
    req.onerror = () => reject(req.error?.message || 'IndexedDB open failed');
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction('notes', 'readonly');
      const query = tx.objectStore('notes').getAll();
      query.onsuccess = () => resolve(query.result.find(note => note.front === front) || null);
      query.onerror = () => reject(query.error?.message || 'IndexedDB read failed');
      tx.oncomplete = () => db.close();
    };
  }), front);
}
async function assertCard(page, title) {
  await page.locator('[data-go="browse"]:visible').first().click();
  await page.locator('#browse-q').fill(title);
  await page.waitForFunction(title => {
    const rows = [...document.querySelectorAll('.note-row')];
    return rows.length === 1 && rows[0].textContent.includes(title);
  }, title, { timeout: wait });
  assert.strictEqual(await page.locator('.note-row').count(), 1, 'restored exactly one card');
}
async function run() {
  assert(fs.existsSync(path.join(dist, 'index.html')), 'run npm run build first');
  await listen();
  const url = 'http://127.0.0.1:' + server.address().port + '/lemma/';
  let browser, context;
  try {
    browser = await chromium.launch();
    context = await browser.newContext({ serviceWorkers: 'allow',
      viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.locator('.onboard').waitFor({ timeout: wait });
    assert(await page.evaluate(() => window.isSecureContext), 'localhost is secure for SW');
    // The production boot registers over HTTPS. Explicit registration exercises
    // the same built worker on secure-equivalent http://127.0.0.1.
    await page.evaluate(async () => {
      await navigator.serviceWorker.register('./service-worker.js');
      await navigator.serviceWorker.ready;
    });
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: wait });
    await page.waitForFunction(name => caches.keys().then(keys => keys.includes(name)), oldName, { timeout: wait });

    const title = 'PWA offline and upgrade evidence';
    const front = 'A local card retained through service-worker upgrade';
    await page.locator('.tb-add:visible').click();
    await page.locator('#ed-front').waitFor({ timeout: wait });
    await page.locator('#ed-title').fill(title);
    await page.locator('#ed-front').fill(front);
    await page.locator('#ed-back').fill('Proof remains stored in IndexedDB.');
    await page.locator('.sheet-foot .btn-primary').click();
    await saved(page);
    const before = await snapshot(page, front);
    assert(before && before.title === title, 'card saved to actual IndexedDB');
    console.log('PASS initial service worker install + durable local card');

    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('.today').waitFor({ timeout: wait });
    await assertCard(page, title);
    assert.deepEqual(await snapshot(page, front), before, 'offline reload preserves full card');
    console.log('PASS offline navigation through cached shell and IndexedDB');

    await context.setOffline(false);
    next = true; // Replace served build and worker version without clearing any data.
    await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      await reg.update();
    });
    // Cache retirement may precede activation. Do not navigate while the old
    // worker can still own fetch events and accidentally recreate its cache.
    await page.waitForFunction(async () => {
      const reg = await navigator.serviceWorker.ready;
      return reg.active?.state === 'activated' &&
        navigator.serviceWorker.controller === reg.active;
    }, null, { timeout: wait });
    await page.waitForFunction(names => caches.keys().then(keys =>
      keys.includes(names.next) && !keys.includes(names.old)), { old: oldName, next: newName },
    { timeout: wait });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('.today').waitFor({ timeout: wait });
    // Navigation can occur during an activation handoff. Require the final
    // controller to settle before asserting cache-retirement invariants.
    await page.waitForFunction(async () => {
      const reg = await navigator.serviceWorker.ready;
      return reg.active?.state === 'activated' &&
        navigator.serviceWorker.controller === reg.active;
    }, null, { timeout: wait });
    const diagnostics = await page.evaluate(async cacheName => {
      const names = await caches.keys();
      const cache = await caches.open(cacheName);
      const reply = await cache.match(new URL('./', location.href));
      const cachedText = reply ? await reply.text() : '';
      const reg = await navigator.serviceWorker.ready;
      return { keys: names, controlled: !!navigator.serviceWorker.controller,
        controllerState: navigator.serviceWorker.controller?.state,
        activeState: reg.active?.state, cachedNewHtml: cachedText.includes('PWA upgrade'),
        cachedTitle: cachedText.includes('<title>') ? cachedText.split('<title>')[1].split('</title>')[0] : '(missing)',
        shownTitle: document.title };
    }, newName);
    assert(diagnostics.controlled && diagnostics.activeState === 'activated', 'replacement worker controls updated page');
    assert(!diagnostics.keys.includes(oldName), 'outdated shell cache must not reappear after update');
    assert.match(await page.title(), /PWA upgrade/, 'new build replaces stale cached HTML');
    await assertCard(page, title);
    assert.deepEqual(await snapshot(page, front), before, 'upgrade preserves complete IndexedDB record');
    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('.today').waitFor({ timeout: wait });
    assert.match(await page.title(), /PWA upgrade/, 'updated shell remains offline-available');
    assert.deepEqual(await snapshot(page, front), before, 'updated offline shell retains card');
    assert.deepEqual(pageErrors, [], 'no page JavaScript errors in PWA lifecycle');
    console.log('PASS SW versioned update, old cache retirement, offline upgrade and IndexedDB retention');
  } finally {
    if (context) await context.close();
    if (browser) await browser.close();
    await close();
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
