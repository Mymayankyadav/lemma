'use strict';
// UI-01 S1: capture existing screens for before/after review. No assertions on look;
// it fails only if a screen cannot be reached or the page logs errors.
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
    colorScheme: scheme, timezoneId: 'Asia/Kolkata', reducedMotion: 'reduce' });
  await ctx.route('**/*', async route => {
    const url = route.request().url();
    if (url.startsWith('https://lemma.test/')) return route.fulfill({ status: 200, contentType: 'text/html', body: HTML });
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
      await page.click('.tab[data-go="browse"]');
      await page.waitForSelector('#browse-q');
      await shot(page, 'cards', size, scheme);
      await page.click('.tab[data-go="stats"]');
      await page.waitForTimeout(500);
      await shot(page, 'stats', size, scheme);
      await page.click('.tab[data-go="home"]');
      await page.waitForSelector('.today');
      await page.keyboard.press('n');
      await page.waitForSelector('#ed-front');
      await page.fill('#ed-front', 'State the Mean Value Theorem: $f\'(c)=\\frac{f(b)-f(a)}{b-a}$.');
      await shot(page, 'editor', size, scheme);
      await page.keyboard.press('Escape');
      await page.waitForSelector('.today');
      await page.click('.today .btn-primary');
      await page.waitForSelector('.btn-reveal, .grades, .done');
      await shot(page, 'review', size, scheme);
    } catch (e) {
      problems.push(`[${size}-${scheme}] could not capture: ${e.message.split('\n')[0]}`);
    }
    await ctx.close();
  }
  await browser.close();
  if (problems.length) { console.error('FAIL\n' + problems.join('\n')); process.exit(1); }
  console.log(`ok: ${shots} UI screenshots written to ${path.relative(ROOT, OUT)}`);
})();
