'use strict';
// UI-01: screenshot and browser-state acceptance harness. It checks accessible
// status/keyboard paths without modifying saved user data or production transport.
// Output: test-output/ui/<screen>-<size>-<scheme>.png (git-ignored; never commit PNGs).
process.env.TZ = process.env.TZ || 'Asia/Kolkata';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const seed = require('./seed.js');

const ROOT = path.resolve(__dirname, '..');
const OUT = process.argv[2] || path.join(ROOT, 'test-output', 'ui');
fs.mkdirSync(OUT, { recursive: true });
const distHtml = path.join(ROOT, 'dist', 'test.html');
if (!fs.existsSync(distHtml)) { console.error('dist/test.html missing; run "npm run build" first'); process.exit(1); }
const HTML = fs.readFileSync(distHtml, 'utf8');
// Install a test-only read/write hook in the same inline script lexical scope as
// App. Top-level const declarations are not window globals in Chromium.
const MARKER = '/* ===== main.js ===== */';
if (!HTML.includes(MARKER)) throw new Error('UI test app marker missing');
const TEST_HTML = HTML.replace(MARKER,
  'window.__uiAcceptance = { get App() { return App; }, get Store() { return Store; }, get Sync() { return LemmaSync; } };\n' + MARKER);
const MOCK = fs.readFileSync(path.join(__dirname, 'mock_claude.js'), 'utf8');
const LIBS = {
  'katex.min.js': path.join(ROOT, 'node_modules/katex/dist/katex.min.js'),
  'marked.umd.js': path.join(ROOT, 'node_modules/marked/lib/marked.umd.js'),
  'purify.min.js': path.join(ROOT, 'node_modules/dompurify/dist/purify.min.js'),
};
const SIZES = { mobile: { width: 390, height: 844 }, desktop: { width: 1280, height: 800 } };
const SCHEMES = ['light', 'dark'];
const docs = Object.fromEntries(seed.map(n => ['data/users/u_test/profile/notes/' + n.id, n]));
const problems = [];
let shots = 0;

async function open(browser, size, scheme) {
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: SIZES[size],
    colorScheme: scheme, timezoneId: 'Asia/Kolkata', reducedMotion: 'reduce', hasTouch: size === 'mobile' });
  await ctx.route('**/*', async route => {
    const url = route.request().url();
    if (url.startsWith('https://lemma.test/')) return route.fulfill({ status: 200, contentType: 'text/html', body: TEST_HTML });
    for (const [name, file] of Object.entries(LIBS))
      if (url.endsWith(name)) return route.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(file, 'utf8') });
    if (url.includes('fonts.googleapis.com')) return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    if (url.startsWith('blob:') || url.startsWith('data:')) return route.continue();
    return route.abort();
  });
  const page = await ctx.newPage();
  const label = size + '-' + scheme;
  page.on('console', m => {
    if ((m.type() === 'error' || m.type() === 'warning') && m.text() !== 'Service Worker registration blocked by Playwright')
      problems.push(`[${label}] console.${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', e => problems.push(`[${label}] pageerror: ${e.message}`));
  await page.addInitScript(({ d, mockSrc }) => { window.__SEED__ = d; (0, eval)(mockSrc); }, { d: docs, mockSrc: MOCK });
  await page.goto('https://lemma.test/');
  await page.waitForSelector('.today', { timeout: 15000 });
  return { ctx, page };
}

// Desktop shows `.tab` buttons; mobile hides them and shows the bottom `.tb` bar. Click whichever is visible.
async function goTo(page, route) {
  await page.locator(`[data-go="${route}"]:visible`).first().click();
}

async function shot(page, name, size, scheme) {
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(OUT, `${name}-${size}-${scheme}.png`), fullPage: name !== 'review' });
  shots++;
}

(async () => {
  const browser = await chromium.launch();
  for (const size of Object.keys(SIZES)) for (const scheme of SCHEMES) {
    const { ctx, page } = await open(browser, size, scheme);
    try {
      await shot(page, 'home', size, scheme);
      await goTo(page, 'browse');
      await page.waitForSelector('#browse-q');
      await shot(page, 'cards', size, scheme);
      await goTo(page, 'home');
      await page.locator('.stats-link').click();
      await page.waitForTimeout(500);
      await shot(page, 'stats', size, scheme);
      await goTo(page, 'home');
      await page.waitForSelector('.today');
      await page.keyboard.press('n');
      await page.waitForSelector('#ed-front');
      await page.fill('#ed-front', 'State the Mean Value Theorem: $f\'(c)=\\frac{f(b)-f(a)}{b-a}$.');
      await shot(page, 'editor', size, scheme);
      if (size === 'mobile') {
        // A deliberately oversized mathematical display scrolls *inside* the
        // formula, without forcing the editor or whole page to pan sideways.
        const displayFence = String.fromCharCode(36, 36);
        const longMath = displayFence + Array.from({ length: 70 }, (_, i) => 'x_{' + i + '}').join('+') + displayFence;
        await page.fill('#ed-back', longMath);
        await page.locator('.ed-mtabs [role="tab"]').nth(1).click();
        await page.locator('.pv-tabs [role="tab"]').nth(1).click();
        await page.waitForTimeout(250);
        if (await page.locator('.ed-preview .katex-display').count() === 0) {
          const diag = await page.evaluate(() => ({
            editor: document.querySelector('.editor')?.className,
            tabs: [...document.querySelectorAll('.pv-tabs button')].map(b => [b.textContent, b.className]),
            preview: document.querySelector('.ed-preview')?.innerHTML.slice(-350),
            warning: document.querySelector('.ed-warn')?.textContent,
          }));
          throw new Error('Oversized math preview missing: ' + JSON.stringify(diag));
        }
        const mathLayout = await page.locator('.ed-preview .katex-display').first().evaluate(el => ({
          overflow: getComputedStyle(el).overflowX,
          pageWidth: document.documentElement.scrollWidth,
          viewport: window.innerWidth,
        }));
        if (mathLayout.overflow !== 'auto' || mathLayout.pageWidth > mathLayout.viewport + 1)
          throw new Error('Oversized math did not remain locally scrollable: ' + JSON.stringify(mathLayout));
      }
      await page.keyboard.press('Escape');
      await page.waitForSelector('.today');
      await page.click('.today .btn-primary');
      await page.waitForSelector('.btn-reveal, .grades, .done');
      await shot(page, 'review', size, scheme);

      // UI-01 gate: native keyboard activation of the advanced statistics panels.
      await page.keyboard.press('Escape');
      await page.waitForSelector('.today');
      if (size === 'mobile' && (await page.locator('.stats-link').boundingBox()).height < 44)
        throw new Error('Statistics mobile touch target is under 44px');
      await page.locator('.stats-link').focus();
      await page.keyboard.press('Enter');
      await page.waitForSelector('.tiles');
      const panels = page.locator('details.disclosure');
      if (await panels.count() !== 2 || await panels.first().evaluate(el => el.open))
        throw new Error('Statistics advanced sections must initially be collapsed');
      if (size === 'mobile' && (await panels.first().locator('summary').boundingBox()).height < 44)
        throw new Error('Advanced statistics mobile touch target is under 44px');
      await panels.first().locator('summary').focus();
      await page.keyboard.press('Enter');
      if (!await panels.first().evaluate(el => el.open))
        throw new Error('Statistics disclosure must open with the keyboard');

      if (size === 'mobile') {
        // Mobile navigation labels are part of the UI contract, not tooltips.
        const labels = await page.locator('.tabbar .tb-label:visible').allTextContents();
        if (labels.join('|') !== 'Today|Cards|New|Settings')
          throw new Error('Mobile navigation labels missing or out of order: ' + labels.join(', '));
        const targets = await page.locator('.tabbar .tb').evaluateAll(items => items.map(el => {
          const r = el.getBoundingClientRect(); return { width: r.width, height: r.height };
        }));
        if (targets.some(r => r.width < 44 || r.height < 44))
          throw new Error('Mobile navigation has an action smaller than 44×44px');
        // Prevent an unused grid track when a top-level nav item is removed.
        const gaps = await page.locator('.tabbar').evaluate(bar => {
          const items = [...bar.querySelectorAll('.tb')];
          if (items.length !== 4) return null;
          const centres = items.map(el => { const r = el.getBoundingClientRect(); return r.left + r.width / 2; });
          return centres.slice(1).map((x, i) => x - centres[i]);
        });
        if (!gaps || Math.max(...gaps) - Math.min(...gaps) > 5)
          throw new Error('Mobile bottom navigation should distribute all four actions evenly');
      }
      if (size === 'desktop' && scheme === 'light') {
        // 640 CSS pixels = the available layout width at 200% zoom on a 1280px desktop.
        await page.setViewportSize({ width: 640, height: 800 });
        for (const route of ['home', 'browse', 'stats']) {
          if (route === 'stats') {
            await goTo(page, 'home');
            await page.locator('.stats-link').click();
          } else await goTo(page, route);
          const widths = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
          if (widths[0] > widths[1] + 1)
            throw new Error(`200%-equivalent ${route} reflow overflows horizontally: ${widths.join(' > ')}`);
        }
      }
      if (size === 'desktop' && scheme === 'light') {
        // Stress text/layout scaling at 200% using Chromium's CSS zoom.
        // This exercises the actual rendering with doubled text, not just a
        // narrower viewport; browser chrome zoom still needs a manual check.
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.evaluate(() => { document.body.style.zoom = '200%'; });
        for (const route of ['home', 'browse', 'stats']) {
          if (route === 'stats') {
            await goTo(page, 'home');
            await page.locator('.stats-link').click();
          } else await goTo(page, route);
          const state = await page.evaluate(() => ({
            scrollWidth: document.documentElement.scrollWidth,
            viewport: window.innerWidth,
            zoom: getComputedStyle(document.body).zoom,
          }));
          if (state.scrollWidth > state.viewport + 1)
            throw new Error('200% zoom horizontal page overflow on ' + route + ': ' + JSON.stringify(state));
          if (route === 'home')
            await page.screenshot({ path: path.join(OUT, 'home-zoom200-desktop-light.png') });
        }
        await page.evaluate(() => { document.body.style.zoom = ''; });
      }
      if (size === 'mobile' && scheme === 'light') {
        // The empty-filter state should be useful and keyboard-focusable.
        await goTo(page, 'browse');
        await page.fill('#browse-q', '__UI01_UNMATCHABLE_CARD_FILTER__');
        await page.waitForSelector('.empty-title');
        const emptyTitle = await page.locator('.empty-title').innerText();
        if (emptyTitle.trim() !== 'No cards match')
          throw new Error('Incorrect filtered Cards empty state: ' + emptyTitle);
        const hint = await page.locator('.empty').innerText();
        if (!hint.includes('clear filters'))
          throw new Error('Filtered Cards state lacks recovery guidance');
        await page.screenshot({ path: path.join(OUT, 'cards-empty-mobile-light.png') });
        await page.fill('#browse-q', '');
        await page.waitForSelector('.note-row');
        // Render the actual Home loading skeleton without altering cached data.
        const loading = await page.evaluate(() => {
          const app = window.__uiAcceptance && window.__uiAcceptance.App;
          if (!app) return false;
          app.loading = true;
          app.go('home');
          const el = document.querySelector('.loading-card[role="status"][aria-label="Loading"]');
          app.loading = false;
          app.go('home');
          return !!el;
        });
        if (!loading) throw new Error('Home loading state is missing its accessible status');

        // Read-only rendering audit: force representative account transport
        // status *projections*, not server calls. Real transport/fault suites
        // remain separately covered by SYNC-04's disposable local stack.
        const statuses = await page.evaluate(() => {
          const { App, Store, Sync } = window.__uiAcceptance;
          const oldStatus = Store.status;
          const oldSync = Object.getOwnPropertyDescriptor(Sync, 'status');
          if (!oldSync?.configurable) throw new Error('Sync status cannot be stubbed for UI acceptance');
          const cases = [
            { phase: 'offline', pending: 0, failed: 0, expected: 'Offline · changes queued on device', cls: 'pending', visible: 'Offline' },
            { phase: 'error', pending: 0, failed: 0, expected: 'Sync failed · local changes retained', cls: 'warn', visible: 'Sync failed' },
            { phase: 'conflict', pending: 0, failed: 0, expected: 'Account conflict · review needed', cls: 'warn', visible: 'Conflict' },
            { phase: 'ready', pending: 1, failed: 0, expected: 'Saved on device · queued for cloud', cls: 'pending', visible: 'Queued' },
            { phase: 'ready', pending: 0, failed: 0, expected: 'Saved to cloud', cls: '', visible: '' },
            { phase: 'ready', pending: 0, failed: 1, expected: 'Could not save to device · export a backup', cls: 'warn', visible: 'Save failed' },
          ];
          const results = [];
          try {
            for (const scenario of cases) {
              Store.status = () => ({ mode: 'account', pending: 0, failed: scenario.failed, offline: false });
              Object.defineProperty(Sync, 'status', { configurable: true, get: () => ({ phase: scenario.phase, pending: scenario.pending }) });
              App.render();
              const element = document.querySelector('#sync');
              const label = element?.querySelector('.sr-only')?.textContent;
              results.push({
                scenario: scenario.phase, expected: scenario.expected, observed: label,
                visibleExpected: scenario.visible, visibleObserved: element?.querySelector('.sync-label')?.textContent || '',
                role: element?.getAttribute('role'), title: element?.title,
                classOk: scenario.cls ? element?.classList.contains(scenario.cls) : !element?.classList.contains('warn') && !element?.classList.contains('pending'),
              });
            }
          } finally {
            Store.status = oldStatus;
            Object.defineProperty(Sync, 'status', oldSync);
            App.render();
          }
          return results;
        });
        for (const s of statuses)
          if (s.role !== 'status' || s.observed !== s.expected || s.title !== s.expected || !s.classOk || s.visibleObserved !== s.visibleExpected)
            throw new Error('Account status accessibility/recovery regression: ' + JSON.stringify(s));

        // Both shortcut-driven and focus/Enter routes must work without a mouse.
        await goTo(page, 'home');
        await page.keyboard.press('/');
        await page.waitForSelector('#browse-q:focus');
        await page.locator('.tabbar [data-go="settings"]:visible').focus();
        await page.keyboard.press('Enter');
        await page.waitForSelector('.tabbar [data-go="settings"][aria-current="page"]:visible');
        await goTo(page, 'home');
      }
      if (size === 'mobile' && scheme === 'dark') {
        // Existing seeded cards remain browsable when the browser is offline.
        await ctx.setOffline(true);
        await goTo(page, 'browse');
        await page.waitForSelector('.note-row');
        if (await page.locator('.note-row').count() === 0)
          throw new Error('Offline Cards view lost the device-local notes');
        await ctx.setOffline(false);
      }
      // The sync indicator previously conveyed critical problems only via a
      // hover title. Capture visible chips across both sizes and color schemes.
      // These are isolated presentation projections, not live transport evidence.
      await goTo(page, 'home');
      for (const scenario of [
        { name: 'offline', phase: 'offline', visible: 'Offline', full: 'Offline · changes queued on device', cls: 'pending' },
        { name: 'error', phase: 'error', visible: 'Sync failed', full: 'Sync failed · local changes retained', cls: 'warn' },
        { name: 'conflict', phase: 'conflict', visible: 'Conflict', full: 'Account conflict · review needed', cls: 'warn' },
      ]) {
        await page.evaluate(({ phase }) => {
          const { App, Store, Sync } = window.__uiAcceptance;
          const descriptor = Object.getOwnPropertyDescriptor(Sync, 'status');
          if (!descriptor?.configurable || window.__uiStatusRestore)
            throw new Error('Cannot isolate status screenshot projection');
          window.__uiStatusRestore = { status: Store.status, descriptor };
          Store.status = () => ({ mode: 'account', pending: 0, failed: 0, offline: false });
          Object.defineProperty(Sync, 'status', { configurable: true, get: () => ({ phase, pending: 0 }) });
          App.render();
        }, { phase: scenario.phase });
        try {
          const state = await page.locator('#sync').evaluate(el => {
            const label = el.querySelector('.sync-label');
            const rect = label?.getBoundingClientRect();
            return {
              visible: label?.textContent, hiddenFromAT: label?.getAttribute('aria-hidden'),
              full: el.querySelector('.sr-only')?.textContent,
              role: el.getAttribute('role'), className: el.className,
              fits: !!rect && rect.width > 0 && rect.height > 0 && rect.right <= innerWidth - 4,
              pageWidth: document.documentElement.scrollWidth, viewport: innerWidth,
            };
          });
          if (state.visible !== scenario.visible || state.hiddenFromAT !== 'true' ||
              state.full !== scenario.full || state.role !== 'status' ||
              !state.className.includes(scenario.cls) || !state.fits ||
              state.pageWidth > state.viewport + 1)
            throw new Error('Visible sync status regression: ' + JSON.stringify({ scenario, state }));
          await shot(page, 'status-' + scenario.name, size, scheme);
        } finally {
          await page.evaluate(() => {
            const saved = window.__uiStatusRestore;
            if (!saved) return;
            const { App, Store, Sync } = window.__uiAcceptance;
            Store.status = saved.status;
            Object.defineProperty(Sync, 'status', saved.descriptor);
            delete window.__uiStatusRestore;
            App.render();
          });
        }
      }
    } catch (e) {
      problems.push(`[${size}-${scheme}] could not capture: ${e.stack || e.message}`);
    }
    await ctx.close();
  }
  await browser.close();
  if (problems.length) { console.error('FAIL\n' + problems.join('\n')); process.exit(1); }
  console.log(`ok: ${shots} UI screenshots written to ${path.relative(ROOT, OUT)}`);
})();
