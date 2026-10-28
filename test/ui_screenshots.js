'use strict';
// UI-01: screenshot and browser-state acceptance harness. It checks accessible
// status/keyboard paths without modifying saved user data or production transport.
// Output: test-output/ui/<screen>-<size>-<scheme>.png (git-ignored; never commit PNGs).
process.env.TZ = process.env.TZ || 'Asia/Kolkata';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const checkBrowserZoom = require('./ui_browser_zoom.js');
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
  'window.__uiAcceptance = { get App() { return App; }, get Store() { return Store; }, get Sync() { return LemmaSync; }, get Account() { return LemmaAccount; }, get Bridge() { return LemmaCloudBridge; } };\n' + MARKER);
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

async function open(browser, size, scheme, native = false) {
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
  if (native) await page.addInitScript(() => {
    // Test-only Capacitor shell; no physical Android permission or alarm.
    let permission = 'prompt';
    let requestResult = 'denied';
    let requests = 0;
    let pending = [];
    const notifications = {
      async checkPermissions() { return { display: permission }; },
      async requestPermissions() {
        requests++;
        permission = requestResult;
        return { display: permission };
      },
      async getPending() { return { notifications: pending }; },
      async cancel({ notifications: items }) {
        pending = pending.filter(item => !items.some(other => other.id === item.id));
      },
      async schedule({ notifications: items }) { pending.push(...items); },
      async createChannel() {},
      async addListener() { return { remove() {} }; },
    };
    const app = {
      async addListener() { return { remove() {} }; },
      async getLaunchUrl() { return {}; },
      async exitApp() {},
    };
    window.__nativeReminderMock = {
      setRequestResult(value) { requestResult = value; },
      setPermission(value) { permission = value; },
      get requests() { return requests; },
      get pending() { return pending; },
    };
    window.Capacitor = {
      isNativePlatform() { return true; },
      isPluginAvailable(name) { return name === 'App' || name === 'LocalNotifications'; },
      registerPlugin(name) {
        if (name === 'App') return app;
        if (name === 'LocalNotifications') return notifications;
        throw new Error('Unexpected plugin');
      },
    };
  });
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

        // Real Chromium offline event, with only the account *phase* held at
        // connecting. This reproduces the local-stack UI failure seen in
        // PR #46: navigator.onLine=false but the phase has not caught up.
        // Unlike the status projections above, browser network loss is real.
        await page.evaluate(() => {
          const { App, Store, Sync } = window.__uiAcceptance;
          window.__offlineStatusRestore = {
            store: Store.status, sync: Object.getOwnPropertyDescriptor(Sync, 'status'),
          };
          Store.status = () => ({ mode: 'account', pending: 0, failed: 0, offline: false });
          Object.defineProperty(Sync, 'status', {
            configurable: true, get: () => ({ phase: 'connecting', pending: 0 }),
          });
          App.render();
        });
        try {
          if ((await page.locator('#sync .sr-only').textContent()) !== 'Saved on device · checking cloud')
            throw new Error('Offline fallback precondition is not the connecting status');
          await ctx.setOffline(true);
          await page.waitForFunction(() =>
            navigator.onLine === false &&
            document.querySelector('#sync .sr-only')?.textContent === 'Offline · changes queued on device' &&
            document.querySelector('#sync .sync-label')?.textContent === 'Offline');
          const offlineState = await page.locator('#sync').evaluate(el => ({
            role: el.getAttribute('role'), cls: el.className, label: el.querySelector('.sync-label')?.textContent,
          }));
          if (offlineState.role !== 'status' || !offlineState.cls.includes('pending') ||
              offlineState.label !== 'Offline')
            throw new Error('Connecting account lost its visible offline cue: ' + JSON.stringify(offlineState));
          await shot(page, 'status-offline-connecting', size, scheme);
          await ctx.setOffline(false);
          await page.waitForFunction(() =>
            navigator.onLine === true &&
            document.querySelector('#sync .sr-only')?.textContent === 'Saved on device · checking cloud' &&
            !document.querySelector('#sync .sync-label'));
        } finally {
          await ctx.setOffline(false);
          await page.evaluate(() => {
            const saved = window.__offlineStatusRestore;
            if (!saved) return;
            const { App, Store, Sync } = window.__uiAcceptance;
            Store.status = saved.store;
            Object.defineProperty(Sync, 'status', saved.sync);
            delete window.__offlineStatusRestore;
            App.render();
          });
        }

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
      if (size === 'desktop' && scheme === 'light') {
        // Reproduce the plain Pages environment, without the host downloads
        // bridge. A browser download must contain the *exact* visible backup.
        await goTo(page, 'settings');
        await page.evaluate(() => { delete window.claude; });
        await page.getByRole('button', { name: 'Export', exact: true }).click();
        await page.waitForSelector('#exp-text');
        await shot(page, 'export', size, scheme);
        const expectedBackup = await page.locator('#exp-text').inputValue();
        const pendingDownload = page.waitForEvent('download', { timeout: 10000 });
        await page.getByRole('button', { name: 'Download', exact: true }).click();
        const download = await pendingDownload;
        if (!/^lemma-all-\d{4}-\d{2}-\d{2}\.json$/.test(download.suggestedFilename()))
          throw new Error('Unexpected backup download filename: ' + download.suggestedFilename());
        const actualBackup = fs.readFileSync(await download.path(), 'utf8');
        if (actualBackup !== expectedBackup || JSON.parse(actualBackup).app !== 'lemma')
          throw new Error('Browser download does not match the visible Lemma JSON backup');
        // An empty readback must never be described as a successful copy.
        await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', {
          configurable: true, value: { writeText: async () => {}, readText: async () => '' },
        }));
        await page.getByRole('button', { name: 'Copy', exact: true }).click();
        await page.waitForFunction(() => {
          const el = document.querySelector('#exp-text');
          return document.activeElement === el && el.selectionStart === 0 &&
            el.selectionEnd === el.value.length;
        });
        if (!await page.getByText('Copy not verified. Copy the selected text manually.').count())
          throw new Error('Clipboard mismatch was not reported');
        // A matching readback is the only route to the success toast.
        await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', {
          configurable: true, value: {
            writeText: async text => { window.__exportCopied = text; },
            readText: async () => window.__exportCopied,
          },
        }));
        await page.getByRole('button', { name: 'Copy', exact: true }).click();
        await page.getByText('Copied and verified', { exact: true }).waitFor();
        if (await page.evaluate(() => window.__exportCopied) !== expectedBackup)
          throw new Error('Clipboard copy differed from the exported backup');
      }
    } catch (e) {
      problems.push(`[${size}-${scheme}] could not capture: ${e.stack || e.message}`);
    }
    await ctx.close();
  }
  // Native-only Settings acceptance: default-off, explicit permission gesture,
  // denial, persistence, opt-out and no horizontal clipping in both schemes.
  for (const size of Object.keys(SIZES)) for (const scheme of SCHEMES) {
    const { ctx, page } = await open(browser, size, scheme, true);
    try {
      await goTo(page, 'settings');
      await page.waitForSelector('#set-reminders');
      const toggle = page.locator('#s-reminder-toggle');
      const time = page.locator('#s-reminder-time');
      const status = page.locator('#s-reminder-status');
      if (await toggle.textContent() !== 'Enable reminders' ||
          await time.inputValue() !== '09:00')
        throw new Error('Native reminders must default to off at 09:00');
      const geometry = await page.locator('#set-reminders').evaluate(el => {
        const controls = [...el.querySelectorAll('button,input')];
        return { heights: controls.map(c => c.getBoundingClientRect().height),
          pageWidth: document.documentElement.scrollWidth, viewport: innerWidth };
      });
      if (geometry.heights.some(h => h < 44) || geometry.pageWidth > geometry.viewport + 1)
        throw new Error('Reminder controls are clipped or smaller than 44px: ' + JSON.stringify(geometry));
      await shot(page, 'reminders-off', size, scheme);
      const initialRequests = await page.evaluate(() => window.__nativeReminderMock.requests);
      if (initialRequests !== 0) throw new Error('Native permission was requested without a gesture');
      await toggle.click();
      await page.waitForFunction(() => document.querySelector('#s-reminder-status')?.textContent.includes('Permission was not granted'));
      if (await page.evaluate(() => window.__nativeReminderMock.requests) !== 1 ||
          await toggle.textContent() !== 'Enable reminders')
        throw new Error('Denied permission must not persist consent');
      await page.evaluate(() => {
        window.__nativeReminderMock.setPermission('prompt'); // OS setting changed after denial
        window.__nativeReminderMock.setRequestResult('granted');
      });
      await toggle.click();
      await page.waitForFunction(() => document.querySelector('#s-reminder-toggle')?.textContent === 'Turn off reminders');
      const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('lemma-due-reminder-v1')));
      if (!persisted.optedIn || persisted.localTime !== '09:00' ||
          await page.evaluate(() => window.__nativeReminderMock.requests) !== 2)
        throw new Error('Explicit granted consent was not persisted');
      await shot(page, 'reminders-enabled', size, scheme);
      // Revocation is observed on foreground without another permission prompt.
      await page.evaluate(() => {
        window.__nativeReminderMock.setPermission('denied');
        window.dispatchEvent(new Event('focus'));
      });
      await page.waitForFunction(() => document.querySelector('#s-reminder-status')?.textContent.includes('Android permission denied'));
      if (await page.evaluate(() => window.__nativeReminderMock.requests) !== 2)
        throw new Error('Permission refresh prompted without a user gesture');
      await shot(page, 'reminders-revoked', size, scheme);
      await time.fill('10:30');
      await time.dispatchEvent('change');
      await page.waitForFunction(() => JSON.parse(localStorage.getItem('lemma-due-reminder-v1'))?.localTime === '10:30');
      await toggle.click();
      await page.waitForFunction(() => document.querySelector('#s-reminder-toggle')?.textContent === 'Enable reminders');
      const disabled = await page.evaluate(() => ({
        pref: JSON.parse(localStorage.getItem('lemma-due-reminder-v1')),
        pending: window.__nativeReminderMock.pending,
      }));
      if (disabled.pref.optedIn || disabled.pref.localTime !== '10:30' ||
          disabled.pending.some(n => n.id === 24001))
        throw new Error('Opt-out did not persist and cancel the Lemma alarm');
      await page.reload();
      await page.waitForSelector('.today');
      await goTo(page, 'settings');
      if (await page.locator('#s-reminder-toggle').textContent() !== 'Enable reminders' ||
          await page.locator('#s-reminder-time').inputValue() !== '10:30')
        throw new Error('Opt-out/time preference did not survive a native restart');
    } catch (e) {
      problems.push('[native-reminders-' + size + '-' + scheme + '] ' + (e.stack || e.message));
    }
    await ctx.close();
  }
  // K3a presentation-only account projection. All account/cache data here is
  // disposable browser memory; no production sign-in, cloud RPC or approval.
  for (const size of Object.keys(SIZES)) for (const scheme of SCHEMES) {
    const { ctx, page } = await open(browser, size, scheme);
    try {
      await goTo(page, 'settings');
      await page.evaluate(() => {
        const { App, Store, Sync, Account, Bridge } = window.__uiAcceptance;
        const old = {
          mode: Object.getOwnPropertyDescriptor(Store, 'mode'),
          user: Object.getOwnPropertyDescriptor(Account, 'user'),
          client: Object.getOwnPropertyDescriptor(Account, 'client'),
          accountHandle: Sync.accountHandle,
          read: Bridge.readKnowledgeDraft,
          save: Bridge.saveKnowledgeDraft,
          compare: Bridge.inspectKnowledgeConflict,
          reopen: Bridge.reopenReviewedKnowledgeConflict,
        };
        const owner = '00000000-0000-4000-8000-000000000001';
        const handle = { userId: owner };
        const rows = new Map();
        Object.defineProperty(Store, 'mode', { configurable: true, get: () => 'account' });
        Object.defineProperty(Account, 'user', { configurable: true,
          get: () => ({ id: owner, email: 'student@example.invalid' }) });
        Object.defineProperty(Account, 'client', { configurable: true, get: () => ({}) });
        Sync.accountHandle = () => handle;
        Bridge.readKnowledgeDraft = async id => rows.get(id) || null;
        Bridge.saveKnowledgeDraft = async data => {
          const previous = rows.get(data.contextId);
          if ((previous?.localRevision || 0) !== data.expectedLocalRevision)
            throw Error('Knowledge draft changed; reload before editing');
          const result = { ...data, status: 'draft',
            localRevision: data.expectedLocalRevision + 1 };
          rows.set(data.contextId, result);
          return result;
        };
        const counters = { compares: 0, reopens: 0 };
        Bridge.inspectKnowledgeConflict = async contextId => {
          counters.compares++;
          const local = rows.get(contextId);
          if (local?.status !== 'needs_review') throw Error('No stale intent');
          return { status: 'needs_review', contextId,
            local: structuredClone(local),
            accepted: { context_id: contextId, revision: 4,
              title: 'Current accepted context', context_markdown: 'Latest accepted proof',
              accepted_json: {schema_version:1,summary:'Accepted goal'} } };
        };
        Bridge.reopenReviewedKnowledgeConflict = async (contextId, localRevision,
          requestId, acceptedRevision, studentReviewed) => {
          counters.reopens++;
          const row = rows.get(contextId);
          if (studentReviewed !== true || row?.status !== 'needs_review' ||
              row.localRevision !== localRevision || row.requestId !== requestId ||
              acceptedRevision !== 4) throw Error('Invalid student conflict review');
          const next = { ...row, status:'draft', localRevision:localRevision+1,
            expectedRevision:acceptedRevision, reopenedFromRequestId:requestId };
          delete next.requestId; delete next.approvedBy;
          rows.set(contextId, next);
          return next;
        };
        window.__knowledgeMock = { rows, counters };
        window.__knowledgeRestore = () => {
          Object.defineProperty(Store, 'mode', old.mode);
          Object.defineProperty(Account, 'user', old.user);
          Object.defineProperty(Account, 'client', old.client);
          Sync.accountHandle = old.accountHandle;
          Bridge.readKnowledgeDraft = old.read;
          Bridge.saveKnowledgeDraft = old.save;
          Bridge.inspectKnowledgeConflict = old.compare;
          Bridge.reopenReviewedKnowledgeConflict = old.reopen;
          App.render();
        };
        App.render();
      });
      await page.waitForSelector('#set-knowledge-drafts');
      await page.locator('#set-knowledge-drafts button:text-is("New draft")').click();
      await page.locator('#s-knowledge-title').fill('Topology and compactness');
      await page.locator('#s-knowledge-summary').fill('Study compactness and connectedness');
      await page.locator('#s-knowledge-goals').fill('Prove Heine-Borel\nUnderstand quotient maps');
      await page.locator('#s-knowledge-markdown').fill('## Proof notes\nCompact subsets of Hausdorff spaces are closed.');
      await page.locator('#set-knowledge-drafts button:text-is("Save draft on this device")').click();
      await page.waitForFunction(() =>
        document.querySelector('#s-knowledge-status')?.textContent.includes('Local draft revision 1'));
      const check = await page.locator('#set-knowledge-drafts').evaluate(el => ({
        width: el.scrollWidth, client: el.clientWidth,
        controls: [...el.querySelectorAll('button')].map(x => x.getBoundingClientRect().height),
        state: el.querySelector('[role=status]')?.textContent
      }));
      if (check.width > check.client + 1 || check.controls.some(x => x < 44) ||
          !check.state.includes('Not accepted or sent to cloud'))
        throw Error('K3a private draft visual/consent contract failed: ' + JSON.stringify(check));
      await page.locator('#set-knowledge-drafts').screenshot({
        path: path.join(OUT, `knowledge-draft-${size}-${scheme}.png`),
        animations: 'disabled'
      });
      shots++;
      await page.locator('#set-knowledge-drafts button:text-is("Open saved draft")').click();
      await page.waitForFunction(() =>
        document.querySelector('#s-knowledge-status')?.textContent.includes('Local draft revision 1'));
      if (await page.locator('#s-knowledge-title').inputValue() !== 'Topology and compactness')
        throw Error('K3a local draft did not reopen from the account cache projection');
      // K3a1: a stale approved intent is visibly immutable and cannot be
      // mistaken for an editable draft. This synthetic state is not a live RPC.
      const conflictId = await page.locator('#s-knowledge-id').inputValue();
      await page.evaluate(id => {
        const row = window.__knowledgeMock.rows.get(id);
        window.__knowledgeMock.rows.set(id, {
          ...row, status: 'needs_review', approvedBy: 'student',
          requestId: '11111111-2222-4333-8444-555555555555'
        });
      }, conflictId);
      await page.locator('#set-knowledge-drafts button:text-is("Open saved draft")').click();
      await page.waitForFunction(() =>
        document.querySelector('#s-knowledge-status')?.textContent.includes('revision conflict'));
      const conflict = await page.locator('#set-knowledge-drafts').evaluate(el => ({
        width: el.scrollWidth, client: el.clientWidth,
        locked: [...el.querySelectorAll('.knowledge-draft-fields input, .knowledge-draft-fields textarea')]
          .every(input => input.disabled),
        saveLocked: el.querySelector('button.btn-primary')?.disabled,
        state: el.querySelector('[role=status]')?.textContent
      }));
      if (conflict.width > conflict.client + 1 || !conflict.locked || !conflict.saveLocked ||
          !conflict.state.includes('not applied to the cloud'))
        throw Error('K3a1 private conflict lock contract failed: ' + JSON.stringify(conflict));
      await page.locator('#set-knowledge-drafts').screenshot({
        path: path.join(OUT, `knowledge-conflict-${size}-${scheme}.png`),
        animations: 'disabled'
      });
      shots++;
      // K3b: compare only after click; cancel leaves the original intent.
      await page.locator('#s-knowledge-compare').click();
      await page.waitForSelector('#s-knowledge-review:not([hidden])');
      const comparison = await page.locator('#s-knowledge-review').evaluate(el => ({
        width: el.scrollWidth, client: el.clientWidth, text: el.textContent
      }));
      if (comparison.width > comparison.client + 1 ||
          !comparison.text.includes('Latest accepted proof') ||
          !comparison.text.includes('Compact subsets of Hausdorff spaces'))
        throw Error('K3b read-only comparison overflow/content failed: ' + JSON.stringify(comparison));
      if (await page.evaluate(() => window.__knowledgeMock.counters.reopens) !== 0)
        throw Error('K3b comparison reopened a draft without consent');
      await page.locator('#s-knowledge-review').screenshot({
        path: path.join(OUT, `knowledge-comparison-${size}-${scheme}.png`),
        animations: 'disabled'
      });
      shots++;
      await page.locator('#s-knowledge-reopen').click();
      await page.waitForSelector('#sheets .confirm-msg');
      await page.locator('#sheets button:text-is("Cancel")').click();
      if (await page.evaluate(() => window.__knowledgeMock.counters.reopens) !== 0)
        throw Error('K3b cancelling confirmation modified conflict');
      await page.locator('#s-knowledge-reopen').click();
      await page.waitForSelector('#sheets .confirm-msg');
      await page.locator('#sheets button:text-is("Reopen draft")').click();
      await page.waitForFunction(() =>
        document.querySelector('#s-knowledge-status')?.textContent.includes('Local draft revision 2'));
      if (await page.evaluate(() => window.__knowledgeMock.counters.reopens) !== 1 ||
          await page.locator('#s-knowledge-title').isDisabled())
        throw Error('K3b deliberate reopen did not restore an editable, unapproved draft');
    } catch (e) {
      problems.push('[knowledge-draft-' + size + '-' + scheme + '] ' + (e.stack || e.message));
    } finally {
      await page.evaluate(() => { window.__knowledgeRestore?.(); }).catch(() => {});
      await ctx.close();
    }
  }
  await browser.close();
  // True tab-level Chromium zoom (via a disposable MV3 extension), separate
  // from the earlier CSS-zoom and narrow-viewport approximations.
  try {
    shots += await checkBrowserZoom({
      out: OUT, html: TEST_HTML, mock: MOCK, libs: LIBS, docs,
    });
  } catch (e) {
    problems.push('[native Chromium zoom] ' + (e.stack || e.message));
  }
  if (problems.length) { console.error('FAIL\n' + problems.join('\n')); process.exit(1); }
  console.log(`ok: ${shots} UI screenshots written to ${path.relative(ROOT, OUT)}`);
})();
