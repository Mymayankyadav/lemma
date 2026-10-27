'use strict';
// UI-01 acceptance: real Chromium tab zoom, not CSS zoom or viewport approximation.
// An ephemeral MV3 extension invokes chrome.tabs.setZoom() using Playwright's
// documented persistent Chromium extension test mode. Never shipped in the app.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

module.exports = async function checkBrowserZoom({ out, html, mock, libs, docs }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lemma-chrome-zoom-'));
  const extension = path.join(dir, 'extension');
  fs.mkdirSync(extension);
  fs.writeFileSync(path.join(extension, 'manifest.json'), JSON.stringify({
    manifest_version: 3, name: 'Lemma CI zoom fixture', version: '1.0',
    permissions: ['tabs'], host_permissions: ['https://lemma.test/*'],
    background: { service_worker: 'background.js' },
  }));
  fs.writeFileSync(path.join(extension, 'background.js'),
    'chrome.runtime.onInstalled.addListener(() => {});\n');
  let context;
  try {
    context = await chromium.launchPersistentContext(path.join(dir, 'profile'), {
      channel: 'chromium', headless: true,
      args: ['--disable-extensions-except=' + extension, '--load-extension=' + extension],
      viewport: { width: 1280, height: 800 }, colorScheme: 'light',
      timezoneId: 'Asia/Kolkata', reducedMotion: 'reduce', serviceWorkers: 'allow',
    });
    await context.route('**/*', async route => {
      const url = route.request().url();
      if (url.startsWith('chrome-extension://')) return route.continue();
      if (url.startsWith('https://lemma.test/'))
        return route.fulfill({ status: 200, contentType: 'text/html', body: html });
      for (const [name, file] of Object.entries(libs))
        if (url.endsWith(name)) return route.fulfill({
          status: 200, contentType: 'application/javascript', body: fs.readFileSync(file, 'utf8'),
        });
      if (url.includes('fonts.googleapis.com'))
        return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
      if (url.startsWith('blob:') || url.startsWith('data:')) return route.continue();
      return route.abort();
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(({ seedDocs, mockSrc }) => {
      window.__SEED__ = seedDocs;
      (0, eval)(mockSrc);
    }, { seedDocs: docs, mockSrc: mock });
    await page.goto('https://lemma.test/');
    await page.waitForSelector('.today', { timeout: 15000 });
    const baseline = await page.evaluate(() => ({
      cssWidth: innerWidth, dpr: devicePixelRatio,
      cssZoom: document.body.style.zoom,
    }));
    await page.screenshot({ path: path.join(out, 'home-chrome-zoom100-desktop-light.png') });
    const worker = context.serviceWorkers()[0] ||
      await context.waitForEvent('serviceworker', { timeout: 15000 });
    const zoom = await worker.evaluate(async () => {
      const tabs = await chrome.tabs.query({});
      const tab = tabs.find(t => t.url && t.url.startsWith('https://lemma.test/'));
      if (!tab) throw new Error('Cannot locate isolated Lemma tab to zoom');
      const before = await chrome.tabs.getZoom(tab.id);
      await chrome.tabs.setZoom(tab.id, 2.0);
      const after = await chrome.tabs.getZoom(tab.id);
      return { before, after };
    });
    if (Math.abs(zoom.before - 1) > 0.01 || Math.abs(zoom.after - 2) > 0.01)
      throw new Error('Chromium native zoom did not reach 200%: ' + JSON.stringify(zoom));
    await page.waitForTimeout(250);
    const measure = () => page.evaluate(() => ({
      cssWidth: innerWidth, dpr: devicePixelRatio,
      docWidth: document.documentElement.scrollWidth,
      cssZoom: document.body.style.zoom,
      visible: !!document.querySelector('#main'),
    }));
    const enlarged = await measure();
    if (enlarged.cssZoom || (! (enlarged.cssWidth < baseline.cssWidth * 0.75) &&
      !(enlarged.dpr > baseline.dpr * 1.6)))
      throw new Error('Native tab zoom did not change text/layout scale: ' +
        JSON.stringify({ baseline, enlarged, zoom }));
    for (const route of ['home', 'browse', 'stats']) {
      if (route === 'stats') {
        await page.locator('[data-go="home"]:visible').first().click();
        await page.locator('.stats-link').click();
      } else {
        await page.locator('[data-go="' + route + '"]:visible').first().click();
      }
      const state = await measure();
      if (!state.visible || state.docWidth > state.cssWidth + 1)
        throw new Error('Native 200% zoom overflows ' + route + ': ' + JSON.stringify(state));
    }
    await page.locator('[data-go="home"]:visible').first().click();
    await page.screenshot({ path: path.join(out, 'home-chrome-zoom200-desktop-light.png') });
    // Keyboard shortcut and an oversized mathematical editor preview remain usable.
    await page.keyboard.press('n');
    await page.waitForSelector('#ed-front');
    const mathFence = String.fromCharCode(36, 36);
    await page.fill('#ed-back', mathFence +
      Array.from({ length: 70 }, (_, i) => 'x_{' + i + '}').join('+') + mathFence);
    await page.locator('.ed-mtabs [role="tab"]').nth(1).click();
    await page.locator('.pv-tabs [role="tab"]').nth(1).click();
    await page.locator('.ed-preview .katex-display').first().waitFor();
    const math = await page.locator('.ed-preview .katex-display').first().evaluate(el => ({
      overflow: getComputedStyle(el).overflowX,
      docWidth: document.documentElement.scrollWidth, viewport: innerWidth,
    }));
    if (math.overflow !== 'auto' || math.docWidth > math.viewport + 1)
      throw new Error('Native zoom mathematical preview overflow: ' + JSON.stringify(math));
    if (errors.length) throw new Error('Browser page errors: ' + errors.join(' | '));
    console.log('ok: genuine Chromium 200% tab zoom (' +
      JSON.stringify({ zoom, baseline, enlarged }) + '), reflow/keyboard/math');
    return 2;
  } finally {
    if (context) await context.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
};
