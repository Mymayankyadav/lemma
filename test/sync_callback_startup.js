'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Observe the actual device-store startup signal; never retry the OTP, inject
// a session, or replace the signed-in/owner assertions in the real-stack test.
async function waitForDeviceBoot(page, timeout = 40000) {
  await page.waitForFunction(
    () => document.querySelector('#sync')?.textContent?.includes('Saved on device'),
    null, { timeout });
}
module.exports = { waitForDeviceBoot };

async function run() {
  const { chromium } = require('playwright');
  const root = path.resolve(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'dist/test.html'), 'utf8');
  const marker = '/* ===== main.js ===== */';
  assert.ok(html.includes(marker), 'test must exercise the assembled App.boot');
  // A controllable slow Store.init makes the real callback startup ordering
  // deterministic. This hook exists only in the intercepted test document.
  const fixture = html.replace(marker, `
    window.LEMMA_CONFIG = {};
    const originalInit = Store.init.bind(Store);
    let releaseBoot;
    const bootGate = new Promise(resolve => { releaseBoot = resolve; });
    Store.init = async (...args) => { await bootGate; return originalInit(...args); };
    window.__callbackStartup = {
      release: releaseBoot,
      get loading() { return App.loading; },
      get view() { return App.view; }
    };
    ${marker}`);
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === 'https://lemma-startup.test')
        return route.fulfill({ contentType: 'text/html', body: fixture });
      if (url.hostname === 'fonts.googleapis.com')
        return route.fulfill({ contentType: 'text/css', body: '' });
      return route.abort();
    });
    const problems = [];
    const page = await context.newPage();
    page.on('pageerror', error => problems.push(error.message));
    const settings = () => page.locator('.tabs button[data-go="settings"]');

    // Negative control: the old callback ordering really loses Settings when
    // the actual App.boot() resumes. No fake router or DOM stand-in is used.
    await page.goto('https://lemma-startup.test/?code=synthetic-startup-only');
    assert.equal(await page.evaluate(() => __callbackStartup.loading), true);
    await settings().click();
    await page.locator('#set-data').waitFor();
    await page.evaluate(() => __callbackStartup.release());
    await page.waitForFunction(() => !__callbackStartup.loading && __callbackStartup.view === 'home');
    assert.equal(await page.locator('#set-data').count(), 0,
      'early Settings navigation is replaced by the final boot route');

    // Positive control: the shared login wait stays pending while IndexedDB
    // startup is held, then opens a stable Settings view after boot completes.
    await page.reload();
    let ready = false;
    const boot = waitForDeviceBoot(page).then(() => { ready = true; });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
    assert.equal(ready, false, 'startup cannot be reported ready while the store is held');
    assert.equal(await page.evaluate(() => __callbackStartup.loading), true);
    await page.evaluate(() => __callbackStartup.release());
    await boot;
    assert.equal(await page.evaluate(() => __callbackStartup.loading), false);
    await settings().click();
    await page.locator('#set-data').waitFor();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
    assert.equal(await page.evaluate(() => __callbackStartup.view), 'settings');
    assert.deepEqual(problems, [], 'startup must not raise browser exceptions');
    await context.close();
    console.log('ok: delayed real App.boot replaces early Settings; callback boot wait preserves navigation');
  } finally { await browser.close(); }
}
if (require.main === module) run().catch(error => { console.error(error); process.exitCode = 1; });
