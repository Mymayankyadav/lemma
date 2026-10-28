'use strict';
// UI-02 SHIP-B1: optional D-owned modules must not break the existing UI.
// This test injects only the documented StudyPlan/StudyView interface into
// the assembled app, without mocking backend approvals or writing user data.
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const seed = require('./seed.js');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'test-output', 'ui');
fs.mkdirSync(OUT, { recursive: true });
const HTML = fs.readFileSync(path.join(ROOT, 'dist', 'test.html'), 'utf8');
const MOCK = fs.readFileSync(path.join(__dirname, 'mock_claude.js'), 'utf8');
const MARKER = '/* ===== main.js ===== */';
assert(HTML.includes(MARKER), 'bundled main marker required');
const LIBS = {
  'katex.min.js': 'katex/dist/katex.min.js',
  'marked.umd.js': 'marked/lib/marked.umd.js',
  'purify.min.js': 'dompurify/dist/purify.min.js',
};
const docs = Object.fromEntries(seed.map(n => ['data/users/u_test/profile/notes/' + n.id, n]));
const problems = [];
const fixture = (ready) => {
  const mockPlan = `{
    ready: ${ready},
    activeContext() {
      return new Promise((resolve, reject) => window.__studyResolvers.push({ resolve, reject }));
    }
  }`;
  const mockView = `{
    ready: ${ready},
    render(params) {
      const page = document.createElement('section');
      page.className = 'page study-fixture';
      page.textContent = 'Study checkpoint ' + (params?.checkpointId || '');
      return page;
    }
  }`;
  const planScript = HTML.includes('/* ===== study_plan.js ===== */')
    ? `StudyPlan.ready = ${ready}; StudyPlan.activeContext = ${mockPlan}.activeContext;`
    : `const StudyPlan = ${mockPlan};`;
  const viewScript = HTML.includes('/* ===== view_study.js ===== */')
    ? `StudyView.ready = ${ready}; StudyView.render = ${mockView}.render;`
    : `const StudyView = ${mockView};`;
  return HTML.replace(MARKER,
    `window.__studyResolvers = [];\n${planScript}\n${viewScript}\n${MARKER}`);
};
async function open(browser, ready, size, scheme, hash = '') {
  const ctx = await browser.newContext({
    viewport: size === 'mobile' ? { width: 390, height: 844 } : { width: 1280, height: 800 },
    colorScheme: scheme, reducedMotion: 'reduce', serviceWorkers: 'block',
  });
  const testHTML = fixture(ready);
  await ctx.route('**/*', async route => {
    const url = route.request().url();
    if (url.startsWith('https://lemma.test/'))
      return route.fulfill({ status: 200, contentType: 'text/html', body: testHTML });
    for (const [file, pkg] of Object.entries(LIBS))
      if (url.endsWith(file)) return route.fulfill({ status: 200, contentType: 'application/javascript',
        body: fs.readFileSync(path.join(ROOT, 'node_modules', pkg), 'utf8') });
    if (url.includes('fonts.googleapis.com'))
      return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    if (url.startsWith('blob:') || url.startsWith('data:')) return route.continue();
    return route.abort();
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => problems.push(e.message));
  page.on('console', m => { if (m.type() === 'error') problems.push(m.text()); });
  await page.addInitScript(({ docs, mock }) => {
    window.__SEED__ = docs; (0, eval)(mock);
  }, { docs, mock: MOCK });
  await page.goto('https://lemma.test/' + hash);
  await page.waitForSelector(ready && hash === '#study' ? '.study-fixture' : '.today', { timeout: 15000 });
  return { page, ctx };
}
async function resolveCurrent(page, result, reject = false) {
  await page.waitForFunction(() => window.__studyResolvers.length > 0);
  await page.evaluate(({ result, reject }) => {
    const pending = window.__studyResolvers.shift();
    if (reject) pending.reject(new Error('knowledge unavailable'));
    else pending.resolve(result);
  }, { result, reject });
}

(async () => {
  const browser = await chromium.launch();
  try {
    for (const size of ['mobile', 'desktop']) for (const scheme of ['light', 'dark']) {
      const hidden = await open(browser, false, size, scheme, '#study');
      try {
        assert.equal(await hidden.page.locator('[data-go="study"]').count(), 0, 'unready Study stays hidden');
        assert.equal(await hidden.page.locator('.today').count(), 1, 'hidden #study route returns Today');
        assert.equal(await hidden.page.locator('.tabbar .tb').count(), 4, 'old four-tab bar preserved');
        assert.equal(await hidden.page.locator('.today .study-btn').textContent(), 'Study',
          'due reviews remain primary while unready');
        await hidden.page.screenshot({ path: path.join(OUT, `ship-b1-hidden-${size}-${scheme}.png`) });
      } finally { await hidden.ctx.close(); }

      const ready = await open(browser, true, size, scheme);
      try {
        assert.equal(await ready.page.locator('.tabbar .tb').count(), 5, 'ready Study has five mobile tabs');
        assert.equal(await ready.page.locator('[data-go="study"]').count(), 2, 'both navigations expose Study');
        assert.equal(await ready.page.locator('.today .study-btn').textContent(), 'Study',
          'due reviews usable until context read resolves');
        await resolveCurrent(ready.page, {
          planId: 'plan-1', planRevision: 3,
          checkpoint: { id: 'checkpoint-2', objective: 'Induction' },
        });
        await ready.page.getByRole('button', { name: 'Continue study' }).waitFor();
        assert.equal(await ready.page.locator('.today .study-btn').isDisabled(), false);
        await ready.page.screenshot({ path: path.join(OUT, `ship-b1-ready-${size}-${scheme}.png`) });
        // Model refresh can replace Today asynchronously after the screenshot.
        // Resolve the newest context again rather than clicking a fallback review CTA.
        if (await ready.page.locator('.today .study-btn').textContent() !== 'Continue study') {
          await resolveCurrent(ready.page, {
            planId: 'plan-1', planRevision: 3,
            checkpoint: { id: 'checkpoint-2', objective: 'Induction' },
          });
          await ready.page.getByRole('button', { name: 'Continue study' }).waitFor();
        }
        // The mock account continually re-renders Today during startup. Click
        // the currently mounted CTA atomically, rather than Playwright's
        // stability wait on a node which may be immediately replaced.
        await ready.page.evaluate(() => {
          const btn = document.querySelector('.today .study-btn');
          if (!btn?.textContent.includes('Continue study') || btn.disabled)
            throw new Error('Approved checkpoint CTA is not currently actionable');
          btn.click();
        });
        try {
          await ready.page.locator('.study-fixture').waitFor({ timeout: 5000 });
        } catch (err) {
          const current = await ready.page.evaluate(() => ({
            content: document.querySelector('#main')?.textContent?.slice(0, 180),
            selected: [...document.querySelectorAll('[aria-current=page]')].map(x => x.dataset.go),
            primary: document.querySelector('.today .study-btn')?.textContent,
          }));
          throw new Error('Study action did not route to StudyView: ' + JSON.stringify(current) + ' · ' + err.message);
        }
        assert.equal(await ready.page.locator('.study-fixture').textContent(), 'Study checkpoint checkpoint-2');
        await ready.page.locator('[data-go="home"]:visible').first().click();
        await resolveCurrent(ready.page, null);
        assert.equal(await ready.page.locator('.today .study-btn').textContent(), 'Study',
          'missing approved checkpoint preserves due review action');
        await ready.page.locator('[data-go="browse"]:visible').first().click();
        await ready.page.locator('[data-go="home"]:visible').first().click();
        await resolveCurrent(ready.page, null, true);
        assert.equal(await ready.page.locator('.today .study-btn').textContent(), 'Study',
          'unavailable backend keeps review fallback');

        // Older in-flight responses cannot modify a view that was replaced.
        await ready.page.locator('[data-go="browse"]:visible').first().click();
        await ready.page.locator('[data-go="home"]:visible').first().click();
        const staleButton = await ready.page.locator('.today .study-btn').elementHandle();
        await ready.page.locator('[data-go="browse"]:visible').first().click();
        await ready.page.locator('[data-go="home"]:visible').first().click();
        assert.equal(await staleButton.evaluate(el => el.isConnected), false);
        await resolveCurrent(ready.page, {
          planId: 'plan-stale', planRevision: 1, checkpoint: { id: 'stale' },
        });
        assert.equal(await ready.page.locator('.today .study-btn').textContent(), 'Study');
        await resolveCurrent(ready.page, {
          planId: 'plan-fresh', planRevision: 4, checkpoint: { id: 'fresh' },
        });
        await ready.page.getByRole('button', { name: 'Continue study' }).waitFor();
        if (size === 'mobile') {
          const overflow = await ready.page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
          assert.equal(overflow, false, 'five-tab layout must not cause page-wide overflow');
        }
      } finally { await ready.ctx.close(); }
    }
    // The deployed bundle currently has no Study modules at all: it still boots.
    if (!HTML.includes('/* ===== view_study.js ===== */')) {
      assert(!/const StudyView\b/.test(HTML), 'absence scenario contains no StudyView declaration');
    }
    assert.deepEqual(problems, [], 'no browser script or console errors');
    console.log('UI-02 SHIP-B1: guarded navigation, live CTA, fallback, stale reads and 8 screenshots passed');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
