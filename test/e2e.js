// End-to-end smoke test of dist/test.html in headless Chromium with a mocked window.claude.
process.env.TZ = process.env.TZ || 'Asia/Kolkata';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const FSRS = require(require('path').resolve(__dirname, '../src/') + '/fsrs.js');
const seed = require('./seed.js');
const SHOTS = process.argv[2] || require('path').resolve(__dirname, '../test-output');
fs.mkdirSync(SHOTS, { recursive: true });
const HTML = fs.readFileSync(require('path').resolve(__dirname, '../dist/') + '/test.html', 'utf8');
const MOCK = fs.readFileSync(path.join(__dirname, 'mock_claude.js'), 'utf8');
const LIBS = {
  'katex.min.js': require('path').resolve(__dirname, '../node_modules/katex/dist/katex.min.js'),
  'marked.umd.js': require('path').resolve(__dirname, '../node_modules/marked/lib/marked.umd.js'),
  'purify.min.js': require('path').resolve(__dirname, '../node_modules/dompurify/dist/purify.min.js'),
};
const problems = [];
let failures = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) failures++; };

async function newPage(browser, { seedDocs, mock = true, viewport = { width: 1280, height: 860 }, dark = false, label, editorHooks = false }) {
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport, colorScheme: dark ? 'dark' : 'light', timezoneId: 'Asia/Kolkata' });
  await ctx.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.startsWith('https://lemma.test/')) return route.fulfill({ status: 200, contentType: 'text/html', body: editorHooks ? HTML.replace('/* ===== main.js ===== */', 'window.__editor = { Store, Model, EditorSheet, ImportSheet, Sheets, LemmaAccount, LemmaSync, LemmaCloud, LemmaOutboxCore, get App() { return App; } };\n/* ===== main.js ===== */') : HTML });
    for (const [name, file] of Object.entries(LIBS)) if (url.endsWith(name)) return route.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(file, 'utf8') });
    if (url.includes('fonts.googleapis.com')) return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    if (url.startsWith('blob:') || url.startsWith('data:')) return route.continue();
    return route.abort();
  });
  const page = await ctx.newPage();
  page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && m.text() !== 'Service Worker registration blocked by Playwright') problems.push(`[${label}] console.${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`[${label}] pageerror: ${e.message}\n${(e.stack || '').split('\n').slice(0, 4).join('\n')}`));
  if (mock) {
    await page.addInitScript(({ docs, mockSrc }) => { window.__SEED__ = docs; (0, eval)(mockSrc); }, { docs: seedDocs || {}, mockSrc: MOCK });
  }
  await page.goto('https://lemma.test/');
  return { ctx, page };
}
const seedDocs = (notes) => Object.fromEntries(notes.map((n) => ['data/users/u_test/profile/notes/' + n.id, n]));

function syntheticHistory() {
  // 160 cards reviewed over ~120 days by a simulated learner
  const clock = FSRS.makeClock(4);
  const cfg = { w: FSRS.DEFAULT_W, retention: 0.9, maxIvl: 36500, learn: [1, 10], relearn: [10], fuzz: true, loadBalance: false };
  const R = FSRS.rng(5);
  const DAY = 86400000;
  const now = Date.now();
  const start = now - 120 * DAY;
  const notes = [];
  for (let i = 0; i < 160; i++) {
    const id = 'syn' + i;
    let card = { st: 0, due: start + Math.floor(i / 4) * DAY, s: 0, d: 0, last: 0, step: 0, reps: 0, lapses: 0 };
    const log = [];
    let t = card.due;
    while (true) {
      t = Math.max(t, card.due) + Math.floor(R() * 3 * 3600000);
      if (t > now - 3600000) break;
      let g;
      if (card.st === 0) g = R() < 0.25 ? 1 : 3;
      else { const p = FSRS.retrievability(FSRS.DEFAULT_W, (t - card.last) / DAY, card.s); g = R() < p ? (R() < 0.15 ? 2 : R() < 0.9 ? 3 : 4) : 1; }
      const pv = FSRS.preview(card, t, cfg, { clock, key: id });
      log.push([t, 1, g, card.st, 4000 + Math.floor(R() * 9000), 0]);
      card = pv[g].card;
    }
    notes.push({ id, deck: 'History::Topology', type: 'basic', title: i < 8 ? 'Lemma ' + i : '', front: `Synthetic card ${i}: state the $T_${i % 4}$ separation axiom.`, back: 'A space where …', tags: ['synthetic'], requires: i > 0 && i < 8 ? ['syn' + (i - 1)] : [], media: {}, created: start + i * 1000, modified: start + i * 1000, cards: { 1: card }, log });
  }
  return notes;
}

(async () => {
  const browser = await chromium.launch();
  // ---------- A: account with the example deck ----------
  {
    const { ctx, page } = await newPage(browser, { seedDocs: seedDocs(seed), label: 'A' });
    await page.waitForSelector('.today', { timeout: 15000 });
    const hero = await page.textContent('.hero-num');
    ok(hero.trim() === '9', `home shows 9 new cards available (prerequisites gate the rest), got ${hero}`);
    ok(await page.isVisible('text=Example cards'), 'example banner visible');
    ok((await page.$$('.deck-row')).length >= 4, 'deck tree rows rendered');
    ok((await page.textContent('#sync')).includes('Saved to your account'), 'sync status says account');
    await page.screenshot({ path: SHOTS + '/A1-home-desktop.png', fullPage: true });

    // review session
    await page.click('.today .btn-primary');
    await page.waitForSelector('.btn-reveal, .grades, .done');
    const front1 = await page.textContent('.card-front');
    ok(front1.length > 5, 'first card front rendered');
    ok(await page.isVisible('.btn-reveal'), 'Show answer button');
    await page.waitForTimeout(350);
    await page.screenshot({ path: SHOTS + '/A2-review-front.png' });
    await page.keyboard.press('Space');
    await page.waitForSelector('.grades');
    const ivls = await page.$$eval('.grade-ivl', (els) => els.map((e) => e.textContent));
    ok(ivls.length === 4 && ivls.every(Boolean), 'four grade buttons with intervals: ' + ivls.join(' | '));
    ok(!(await page.textContent('.card-meta')).includes('null'), 'card meta has no stray text');
    await page.waitForTimeout(350);
    await page.screenshot({ path: SHOTS + '/A3-review-back.png' });
    // answer a run of cards
    let answered = 0, sawSteps = false, sawHint = false, sawCloze = false;
    for (let i = 0; i < 40; i++) {
      const phase = await page.evaluate(() => (document.querySelector('.grades') ? 'back' : document.querySelector('.btn-reveal') ? 'front' : 'other'));
      if (phase === 'front') {
        if (await page.$('.card-front details.env-hint')) { sawHint = true; await page.keyboard.press('h'); }
        if (await page.$('.card-front .czq')) sawCloze = true;
        await page.keyboard.press('Space');
        await page.waitForSelector('.grades', { timeout: 3000 });
      } else if (phase === 'back') {
        if (await page.$('.btn-step')) { sawSteps = true; await page.keyboard.press('n'); }
        const g = [3, 3, 1, 4, 2, 3][i % 6];
        await page.keyboard.press(String(g));
        answered++;
        await page.waitForTimeout(260);
      } else break;
    }
    ok(answered >= 9, `answered ${answered} cards in the session`);
    ok(sawHint, 'hint card seen and hint revealed');
    ok(sawCloze, 'cloze placeholder seen on a front');
    const after = await page.evaluate(() => document.querySelector('.review') ? (document.querySelector('.done') ? 'done/wait' : 'card') : 'left');
    ok(after !== 'left', 'session still on review screen: ' + after);
    // undo
    const writesBefore = await page.evaluate(() => window.__mockWrites.length);
    ok(writesBefore >= answered, `each answer was written to the account store (${writesBefore} writes)`);
    await page.keyboard.press('Escape');
    await page.waitForSelector('.today');

    // study path (prerequisites) for the MVT
    await page.click('.tab[data-go="browse"]');
    await page.fill('#browse-q', 'mean value');
    await page.waitForTimeout(300);
    const rows = await page.$$('.note-row');
    ok(rows.length >= 1, 'search finds the Mean Value Theorem');
    await rows[0].click();
    await page.waitForSelector('.detail');
    await page.click('[aria-label="Study with prerequisites"]');
    await page.waitForSelector('.btn-reveal, .grades, .done');
    let sawMVT = false;
    const trail = [];
    for (let i = 0; i < 30; i++) {
      const phase = await page.evaluate(() => (document.querySelector('.grades') ? 'back' : document.querySelector('.btn-reveal') ? 'front' : 'other'));
      trail.push(phase + ':' + (await page.evaluate(() => { const f = document.querySelector('.card-front'); return f ? f.textContent.slice(0, 30) : (document.querySelector('.done') || {}).textContent || '?'; })));
      if (phase === 'front') { await page.keyboard.press('Space'); await page.waitForSelector('.grades', { timeout: 3000 }); }
      else if (phase === 'back') {
        if (await page.$('[data-steps]')) {
          sawMVT = true;
          const hidden0 = await page.$$eval('.step-hidden', (e) => e.length);
          await page.keyboard.press('Space');
          const hidden1 = await page.$$eval('.step-hidden', (e) => e.length);
          ok(hidden1 === hidden0 - 1, `Space reveals one proof step (${hidden0} → ${hidden1} hidden)`);
          await page.waitForTimeout(350);
          await page.screenshot({ path: SHOTS + '/A4-steps.png' });
        }
        await page.keyboard.press('3');
        await page.waitForTimeout(260);
      } else break;
    }
    ok(sawMVT, 'study path reached the Mean Value Theorem (after its prerequisites)');
    if (!sawMVT) console.log('   trail:', trail.join(' | '));
    // AI: check with typed answer on a fresh card if available
    await page.keyboard.press('Escape');
    await page.waitForSelector('.today');

    // editor
    await page.keyboard.press('n');
    await page.waitForSelector('#ed-front');
    await page.fill('#ed-deck', 'Examples::Real Analysis');
    await page.fill('#ed-title', 'Squeeze theorem');
    await page.fill('#ed-front', 'State the squeeze theorem for sequences.');
    await page.fill('#ed-back', ':::theorem[Squeeze]\nIf $a_n\\le b_n\\le c_n$ and $a_n, c_n\\to L$, then $b_n\\to L$.\n:::');
    await page.waitForTimeout(300);
    await page.click('.pv-tabs button:nth-child(2)');
    await page.waitForTimeout(200);
    ok((await page.$$('.ed-preview .katex')).length >= 2, 'editor preview renders math');
    ok(await page.isVisible('.ed-preview .env-plain'), 'editor preview shows the theorem block');
    // autocomplete
    await page.click('#ed-front');
    await page.keyboard.press('End');
    await page.keyboard.type(' $\\fr');
    await page.waitForTimeout(150);
    ok(await page.isVisible('.ed-suggest'), 'LaTeX autocomplete suggestions appear');
    await page.keyboard.press('Tab');
    const val = await page.inputValue('#ed-front');
    ok(val.includes('\\frac{}{}'), 'Tab accepts \\frac snippet');
    await page.screenshot({ path: SHOTS + '/A5-editor.png' });
    await page.keyboard.press('Control+Enter');
    await page.waitForTimeout(300);
    const saved = await page.evaluate(() => [...window.__mockStore.values()].some((d) => d.title === 'Squeeze theorem'));
    ok(saved, 'new card saved to the account store');

    // generate with Claude (mocked)
    await page.click('.tab[data-go="home"]');
    await page.waitForSelector('.today');
    await page.click('[aria-label="Generate with Claude"]');
    await page.waitForSelector('#gen-text');
    await page.fill('#gen-text', 'Heine–Borel: a subset of R^n is compact iff closed and bounded.');
    await page.click('.sheet-foot >> text=Generate');
    await page.waitForSelector('.gen-item', { timeout: 5000 });
    ok((await page.$$('.gen-item')).length === 2, 'generated cards listed for review');
    await page.click('.sheet-foot >> text=/Add 2 cards/');
    await page.waitForTimeout(300);
    const genSaved = await page.evaluate(() => [...window.__mockStore.values()].filter((d) => d.tags && d.tags.includes('topology')).length);
    ok(genSaved === 2, 'generated cards saved');
    const linked = await page.evaluate(() => { const v = [...window.__mockStore.values()]; const c = v.find((d) => d.front && d.front.startsWith('A continuous image')); const hb = v.find((d) => d.title === 'Compactness (Heine–Borel)'); return c && hb && c.requires.includes(hb.id); });
    ok(linked, 'generated prerequisite titles resolved to links');

    // answer check flow (typed) in a new session
    await page.click('.today .btn-primary');
    await page.waitForSelector('.btn-reveal');
    const hasCheck = await page.$('.tool-ai');
    ok(!!hasCheck, 'Claude Check tool shown on the front');
    await page.keyboard.press('t');
    await page.keyboard.type('Continuous on [a,b] attains max and min');
    await page.click('.tool-ai');
    await page.waitForSelector('.ai-verdict', { timeout: 5000 });
    ok(await page.isVisible('.grade.suggested'), 'suggested grade highlighted after check');
    await page.screenshot({ path: SHOTS + '/A6-check.png' });
    await page.click('.grade-hard');
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');

    // export
    await page.waitForSelector('.today');
    await page.click('.head-actions [aria-label="Export"]');
    await page.waitForSelector('#exp-text');
    const exp = await page.inputValue('#exp-text');
    ok(exp.includes('"app": "lemma"'), 'export backup JSON produced');
    await page.click('.radio-row:nth-of-type(2) input');
    const md = await page.inputValue('#exp-text');
    ok(md.includes('<!-- lemma:card'), 'markdown export produced');
    await page.click('.sheet-foot >> text=Download');
    await page.waitForTimeout(100);
    ok((await page.evaluate(() => window.__downloads.length)) === 1, 'download requested through the downloads capability');
    await page.keyboard.press('Escape');

    // import Q/A text
    await page.click('.head-actions [aria-label="Import"]');
    await page.waitForSelector('#imp-text');
    await page.fill('#imp-text', 'Q: What is $e^{i\\pi}$?\nA: $-1$\n\nQ: Define a group.\nA: A set with an associative operation, identity and inverses.');
    await page.waitForTimeout(350);
    ok((await page.textContent('.imp-summary')).includes('2 cards'), 'import detects 2 Q/A cards');
    await page.click('.sheet-foot .btn-primary');
    await page.waitForTimeout(300);
    ok(await page.evaluate(() => [...window.__mockStore.values()].some((d) => d.deck === 'Imported')), 'imported cards saved');

    // graph view
    await page.click('.tab[data-go="browse"]');
    await page.fill('#browse-q', '');
    await page.waitForTimeout(250);
    await page.click('[aria-label="Graph view"]');
    await page.waitForSelector('.graph-canvas');
    await page.waitForTimeout(300);
    const box = await page.$eval('.graph-canvas', (c) => [c.width, c.height]);
    ok(box[0] > 100 && box[1] > 100, 'graph canvas drawn ' + box.join('x'));
    await page.screenshot({ path: SHOTS + '/A7-graph.png', fullPage: true });

    // stats + settings
    await page.click('.tab[data-go="stats"]');
    await page.waitForSelector('.tiles');
    await page.waitForTimeout(300);
    await page.screenshot({ path: SHOTS + '/A8-stats.png', fullPage: true });
    await page.click('.tab[data-go="settings"]');
    await page.waitForSelector('#s-ret');
    await page.click('text=Estimate workload');
    await page.waitForSelector('.sweep-charts', { timeout: 15000 });
    ok(true, 'workload simulation ran in a worker and drew charts');
    await page.fill('#s-preamble', '\\newcommand{\\R}{\\mathbb{R}}\n\\newcommand{\\bad}{\\frac{1}');
    await page.dispatchEvent('#s-preamble', 'change');
    await page.waitForTimeout(100);
    ok((await page.textContent('#set-math')).includes('Line 2'), 'preamble errors are reported by line');
    await page.screenshot({ path: SHOTS + '/A9-settings.png', fullPage: true });
    await ctx.close();
  }

  // ---------- B: history, optimizer, calibration (mobile, dark) ----------
  {
    const notes = syntheticHistory();
    const { ctx, page } = await newPage(browser, { seedDocs: seedDocs(notes), viewport: { width: 390, height: 844 }, dark: true, label: 'B' });
    await page.waitForSelector('.today', { timeout: 15000 });
    await page.screenshot({ path: SHOTS + '/B1-home-mobile-dark.png', fullPage: true });
    await page.click('.tb[data-go="stats"]');
    await page.waitForSelector('.tiles');
    await page.waitForTimeout(400);
    ok(await page.isVisible('text=FSRS accuracy'), 'calibration section rendered');
    await page.screenshot({ path: SHOTS + '/B2-stats-mobile-dark.png', fullPage: true });
    await page.click('.tb[data-go="settings"]');
    await page.waitForSelector('#fsrs-opt');
    const disabled = await page.$eval('#fsrs-opt .btn-primary', (b) => b.disabled);
    ok(!disabled, 'optimizer enabled with history');
    await page.click('#fsrs-opt .btn-primary');
    await page.waitForSelector('#fsrs-opt .data-table', { timeout: 30000 });
    const table = await page.textContent('#fsrs-opt .data-table');
    ok(/Optimized/.test(table), 'optimizer result table shown');
    await page.click('text=Use optimized parameters');
    await page.waitForTimeout(300);
    ok((await page.textContent('#fsrs-opt')).includes('Personalized on'), 'optimized parameters applied');
    await page.screenshot({ path: SHOTS + '/B3-settings-opt-mobile-dark.png', fullPage: true });
    // review on mobile
    await page.click('.tb[data-go="home"]');
    await page.waitForSelector('.today');
    const overflow = async (label) => {
      const w = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
      ok(w[0] <= w[1], `${label}: no horizontal scroll (${w[0]} <= ${w[1]})`);
    };
    await overflow('mobile home');
    const canStudy = await page.$eval('.today .btn-primary', (b) => !b.disabled);
    if (!canStudy) {
      await page.click('.deck-row .icon-btn[aria-label^="Deck options"]');
      await page.click('.ig-item >> text=Practice');
    }
    {
      if (canStudy) await page.click('.today .btn-primary');
      await page.waitForSelector('.btn-reveal');
      await page.waitForSelector('.btn-reveal');
      await page.waitForTimeout(350);
      await page.screenshot({ path: SHOTS + '/B4a-review-front-mobile-dark.png' });
      await page.click('.btn-reveal');
      await page.waitForSelector('.grades');
      await page.waitForTimeout(350);
      await page.screenshot({ path: SHOTS + '/B4-review-mobile-dark.png' });
      await page.click('[aria-label="Scratchpad"]');
      await page.waitForSelector('.scratch-canvas');
      const cb = await page.$eval('.scratch-canvas', (c) => { const r = c.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; });
      await page.mouse.move(cb[0] + 50, cb[1] + 80);
      await page.mouse.down();
      for (let i = 0; i < 20; i++) await page.mouse.move(cb[0] + 50 + i * 8, cb[1] + 80 + Math.sin(i / 3) * 30);
      await page.mouse.up();
      await page.screenshot({ path: SHOTS + '/B5-scratch.png' });
      await page.click('.scratch .btn-primary');
      await page.waitForSelector('.scratch', { state: 'hidden' });
      await overflow('mobile review');
    }
    await page.keyboard.press('Escape');
    await page.click('.tb[data-go="browse"]');
    await page.waitForSelector('.note-row');
    await overflow('mobile browse');
    await page.click('.tb[data-go="settings"]');
    await page.waitForSelector('#s-ret');
    await overflow('mobile settings');
    await page.click('.tb[data-go="stats"]');
    await page.waitForSelector('.tiles');
    await overflow('mobile stats');
    await ctx.close();
  }

  // ---------- C: no Claude account (local browser storage) ----------
  {
    const { ctx, page } = await newPage(browser, { mock: false, label: 'C', viewport: { width: 390, height: 844 } });
    await page.waitForSelector('.onboard, .today', { timeout: 15000 });
    ok(await page.isVisible('.onboard'), 'empty state shows onboarding with a rendered example');
    ok((await page.textContent('#app')).includes('Saved on this device only'), 'local-storage banner explains where data lives');
    await page.screenshot({ path: SHOTS + '/C1-onboarding-mobile.png', fullPage: true });
    await page.click('.onboard .btn-primary');
    await page.waitForSelector('#ed-front');
    await page.click('.seg button:nth-child(3)');
    await page.fill('#ed-front', 'The derivative of $\\sin x$ is {{c1::$\\cos x$}}.');
    await page.waitForTimeout(250);
    await page.click('.sheet-foot .btn-primary');
    await page.waitForTimeout(400);
    await page.reload();
    await page.waitForSelector('.today', { timeout: 15000 });
    ok((await page.textContent('.hero-num')).trim() === '1', 'card persisted in IndexedDB across reload');
    await page.click('.today .btn-primary');
    await page.click('.btn-reveal');
    await page.click('.grade-good');
    const persistedReviews = async expected => page.waitForFunction(async count => {
      const db = await new Promise((resolve,reject) => {
        const r=indexedDB.open('lemma-flashcards'); r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error);
      });
      const notes = await new Promise((resolve,reject) => {
        const r=db.transaction('notes').objectStore('notes').getAll(); r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error);
      });
      db.close();
      return notes.length === 1 && notes[0].log.length === count && (count === 0 || /^[0-9a-f-]{36}$/i.test(notes[0].log[0][6]));
    }, expected);
    await persistedReviews(1);
    ok(true, 'review snapshot and stable event ID committed to IndexedDB');
    await page.waitForTimeout(300);
    await page.keyboard.press('u');
    await persistedReviews(0);
    ok(true, 'Undo durably removes the local review');
    await page.reload();
    await page.waitForSelector('.today');
    ok((await page.textContent('.hero-num')).trim() === '1', 'Undo scheduling survives reload');

    // An interrupted editor session keeps its unsaved draft across browser
    // reload; the anonymous draft key must not be rewritten by stale callbacks.
    await page.keyboard.press('n');
    await page.waitForSelector('#ed-front');
    await page.fill('#ed-front', 'Unfinished topology proof draft');
    await page.fill('#ed-back', 'Attempt: use compact Hausdorff separation.');
    await page.click('.sheet-head .icon-btn[aria-label="Close"]');
    await page.waitForTimeout(650);
    const draft = await page.evaluate(() => JSON.parse(localStorage.getItem('lemma.draft.v1') || 'null'));
    ok(draft?.front === 'Unfinished topology proof draft', 'unsaved local draft retained when editor closes');
    await page.reload();
    await page.waitForSelector('.today');
    await page.keyboard.press('n');
    await page.waitForSelector('#ed-front');
    ok((await page.inputValue('#ed-front')) === 'Unfinished topology proof draft', 'unsaved draft restored after browser restart');
    await page.fill('#ed-front', 'Complete topology statement');
    await page.click('.sheet-foot .btn-primary');
    await page.waitForTimeout(250);
    ok((await page.evaluate(() => localStorage.getItem('lemma.draft.v1'))) === null,
      'successfully committed card clears only its draft');

    await page.click('.tb[data-go="browse"]');
    await page.waitForSelector('.note-row');
    await page.locator('.note-row').first().click();
    await page.waitForSelector('.detail-actions');
    await page.click('.detail-actions >> text=Edit');
    await page.waitForSelector('#ed-front');
    const editBase = await page.inputValue('#ed-front');
    await page.fill('#ed-front', 'Draft: proof of the Bolzano–Weierstrass theorem');
    await page.click('.sheet-head .icon-btn[aria-label="Close"]');
    await page.waitForTimeout(600);
    const edits = await page.evaluate(() => Object.keys(localStorage)
      .filter(k => k.startsWith('lemma.draft.edit.')));
    ok(edits.length === 1, 'unsaved edit saved under a note-specific local key');
    await page.reload();
    await page.waitForSelector('.today');
    await page.click('.tb[data-go="browse"]');
    await page.waitForSelector('.note-row');
    await page.locator('.note-row').first().click();
    await page.waitForSelector('.detail-actions');
    await page.click('.detail-actions >> text=Edit');
    await page.waitForSelector('#ed-front');
    ok(await page.inputValue('#ed-front') === 'Draft: proof of the Bolzano–Weierstrass theorem',
      'unfinished existing-note edit restored after browser reload');
    await page.click('.sheet-head .icon-btn[aria-label="Close"]');

    // A queued file-read completion cannot overwrite the next import sheet.
    await page.click('.tb[data-go="home"]');
    await page.waitForSelector('.today');
    await page.click('.head-actions [aria-label="Import"]');
    await page.waitForSelector('#imp-file');
    await page.setInputFiles('#imp-file', { name:'delayed.txt', mimeType:'text/plain',
      buffer:Buffer.from('Q: Stale editor import\\nA: Do not import') });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    ok(!(await page.evaluate(() => document.body.textContent)).includes('Stale editor import'),
      'file reader callback does not write into a discarded import sheet');
    await ctx.close();
  }

  // ---------- D: editor durability with real browser IndexedDB ----------
  {
    const { ctx, page } = await newPage(browser, { mock: false, label: 'D', editorHooks: true });
    await page.waitForSelector('.onboard');
    await page.keyboard.press('n');
    await page.waitForSelector('#ed-front');
    await page.fill('#ed-front', 'Aborted editor transaction');
    await page.fill('#ed-back', 'Keep this proof attempt');
    await page.evaluate(() => {
      const put = IDBObjectStore.prototype.put;
      const add = IDBObjectStore.prototype.add;
      const abortMatching = (method) => function (value, ...args) {
        const request = method.call(this, value, ...args);
        if (value.front === 'Aborted editor transaction')
          request.addEventListener('success', () => this.transaction.abort());
        return request;
      };
      IDBObjectStore.prototype.put = abortMatching(put);
      IDBObjectStore.prototype.add = abortMatching(add);
    });
    await page.click('.sheet-foot .btn-primary');
    await page.waitForFunction(() => document.querySelector('.ed-warn')?.textContent.includes('Could not save'));
    ok(await page.inputValue('#ed-back') === 'Keep this proof attempt', 'aborted editor write retains editable input');
    ok(await page.evaluate(() => __editor.Model.notes.size === 0), 'aborted editor creation is absent from the Model');
    ok(await page.evaluate(() => JSON.parse(localStorage.getItem('lemma.draft.v1')).back === 'Keep this proof attempt'),
      'Save flushes recovery draft before awaiting the write');
    await page.screenshot({ path: SHOTS + '/D1-editor-storage-error.png' });
    await page.reload();
    await page.waitForSelector('.onboard');
    await page.keyboard.press('n');
    await page.waitForSelector('#ed-front');
    ok(await page.inputValue('#ed-front') === 'Aborted editor transaction', 'failed save draft survives a browser reload');

    // Delay the receipt after an actual transaction commits, including Ctrl+Enter.
    const holdReceipt = () => page.evaluate(() => {
      const original = __editor.Store.saveNote;
      window.__editorCalls = 0;
      window.__editorStored = false;
      let release;
      const gate = new Promise(resolve => { release = resolve; });
      window.__releaseEditor = () => { __editor.Store.saveNote = original; release(); };
      __editor.Store.saveNote = async (...args) => {
        window.__editorCalls++;
        await original(...args);
        window.__editorStored = true;
        await gate;
      };
    });
    await holdReceipt();
    await page.click('.sheet-foot .btn-primary');
    await page.waitForFunction(() => document.querySelector('.sheet-foot .btn-primary').textContent === 'Saving…');
    await page.keyboard.press('Control+Enter');
    ok(await page.evaluate(() => __editorCalls === 1 && __editor.Model.notes.size === 0),
      'pending save is single-flight and not yet projected');
    ok(await page.evaluate(() => !!localStorage.getItem('lemma.draft.v1')), 'pending receipt does not clear the draft');
    await page.evaluate(() => __releaseEditor());
    await page.waitForSelector('#ed-front', { state: 'hidden' });
    ok(await page.evaluate(() => __editor.Model.notes.size === 1 && localStorage.getItem('lemma.draft.v1') === null),
      'successful commit projects exactly one note and clears its draft');

    // Commit finished in IndexedDB, but the browser dies before receiving the
    // receipt. Reopening must recognize the ID without writing over reviews.
    await page.keyboard.press('n');
    await page.waitForSelector('#ed-front');
    await page.fill('#ed-front', 'Committed before receipt crash');
    await holdReceipt();
    await page.click('.sheet-foot .btn-primary');
    await page.waitForFunction(() => __editorStored);
    const recoveredId = await page.evaluate(() => JSON.parse(localStorage.getItem('lemma.draft.v1')).pendingSave.id);
    await page.reload();
    await page.waitForSelector('.today');
    await page.evaluate(async id => {
      const note = __editor.Model.notes.get(id);
      note.cards['1'].reps = 9;
      note.log.push([Date.now(),1,3,0,200,0]);
      await __editor.Store.saveNote(note);
    }, recoveredId);
    await page.reload();
    await page.waitForSelector('.today');
    await page.keyboard.press('n');
    await page.waitForSelector('#ed-front');
    ok(await page.inputValue('#ed-front') === '' && await page.isVisible('.ed-restored'),
      'reload reconciles the committed draft as a saved card');
    ok(await page.evaluate(id => __editor.Model.notes.size === 2 &&
        __editor.Model.notes.get(id).cards['1'].reps === 9 &&
        __editor.Model.notes.get(id).log.length === 1 &&
        localStorage.getItem('lemma.draft.v1') === null, recoveredId),
      'recovery does not duplicate a card or overwrite later review history');

    await page.fill('#ed-front', 'Add and next waits');
    await holdReceipt();
    await page.getByRole('button', { name: 'Add & next', exact: true }).click();
    ok(await page.inputValue('#ed-front') === 'Add and next waits', 'Add & next retains content while saving');
    await page.evaluate(() => __releaseEditor());
    await page.waitForFunction(() => document.querySelector('#ed-front').value === '' && !document.querySelector('#ed-front').disabled);
    ok(await page.evaluate(() => __editor.Model.notes.size === 3), 'Add & next resets only after the committed creation');

    await page.fill('#ed-front', 'Closed editor pending receipt');
    await holdReceipt();
    await page.click('.sheet-foot .btn-primary');
    await page.click('.sheet-head .icon-btn[aria-label="Close"]');
    await page.evaluate(() => __releaseEditor());
    await page.waitForFunction(() => __editor.Model.notes.size === 4);
    ok(true, 'closing a pending editor still projects a committed card in the same workspace');
    await page.waitForSelector('#ed-front', { state: 'hidden' });
    await page.keyboard.press('n');
    await page.waitForSelector('#ed-front');

    await page.fill('#ed-front', 'Old workspace pending receipt');
    await holdReceipt();
    await page.click('.sheet-foot .btn-primary');
    await page.waitForFunction(() => __editorCalls === 1);
    await page.evaluate(() => {
      __editor.App.lockWorkspace(true); // actual forced-close/epoch path
      __editor.Model.replaceAll(new Map());
      __editor.App.lockWorkspace(false);
      __releaseEditor();
    });
    await page.waitForSelector('#ed-front', { state: 'hidden' });
    ok(await page.evaluate(() => __editor.Model.notes.size === 0), 'late save cannot repopulate a replacement workspace');
    ok(await page.evaluate(() => JSON.parse(localStorage.getItem('lemma.draft.v1')).front === 'Old workspace pending receipt'),
      'forced-close draft remains under its origin key after a late save');
    await ctx.close();
  }

  await require('./workspace_browser.js')({ browser, newPage, ok });

  await browser.close();
  console.log('\n' + (problems.length ? problems.join('\n') : 'no console errors'));
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  if (failures || problems.length) process.exitCode = 1;
})().catch((e) => { console.error('E2E crashed:', e); console.log(problems.join('\n')); process.exit(1); });

