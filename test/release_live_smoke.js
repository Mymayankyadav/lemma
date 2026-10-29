// RELEASE-01 SHIP-F0: real Pages health, isolated anonymous browser, no fixtures in production.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const OUT = path.resolve(__dirname, '../test-output/release-live');
const DEFAULT_URL = 'https://mymayankyadav.github.io/lemma/';
const timeout = 20000;

async function smoke(url) {
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Invalid release smoke URL');
  // A fresh, ephemeral browser context must NEVER authenticate or use the owner's account.
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    serviceWorkers: 'block', viewport: { width: 390, height: 844 },
    colorScheme: 'light', reducedMotion: 'reduce'
  });
  const page = await ctx.newPage();
  const errors = [];
  let stage = 'navigation';
  const sameOrigin = (u) => { try { return new URL(u).origin === parsed.origin; } catch { return false; } };
  page.on('pageerror', e => errors.push('JavaScript: ' + e.message));
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push('console: ' + msg.text());
  });
  page.on('requestfailed', req => {
    if (sameOrigin(req.url())) errors.push('request failed: ' + req.url() + ' (' + req.failure()?.errorText + ')');
  });
  page.on('response', res => {
    if (sameOrigin(res.url()) && res.status() >= 400) errors.push('HTTP ' + res.status() + ': ' + res.url());
  });
  const capture = async (name) => {
    fs.mkdirSync(OUT, { recursive: true });
    await page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: true });
  };
  const nav = async (route, selector) => {
    await page.locator('[data-go="' + route + '"]:visible').first().click();
    await page.locator(selector).first().waitFor({ timeout });
  };
  const saved = async () => {
    await page.waitForFunction(() =>
      (document.querySelector('#sync .sr-only')?.textContent || '').includes('Saved on device'), null, { timeout });
  };
  try {
    const response = await page.goto(parsed.href, { waitUntil: 'domcontentloaded', timeout: 45000 });
    assert(response && response.ok(), 'Pages entry must respond HTTP 2xx');
    assert.strictEqual(new URL(page.url()).origin, parsed.origin, 'unexpected origin redirect');
    await page.locator('.onboard, .today').first().waitFor({ timeout });
    assert.match(await page.title(), /Lemma/, 'correct application loaded');
    stage = 'home';
    await capture('01-today');

    // SHIP-F1: hidden-until-ready is an acceptance property of the *deployed*
    // site, not just a unit-test assertion about a source-code boolean.
    stage = 'feature-readiness';
    const flags = await page.evaluate(() => ({
      study: typeof StudyView !== 'undefined' && StudyView.ready === true,
      plan: typeof StudyPlan !== 'undefined' && StudyPlan.ready === true,
      tutor: typeof TutorHandoff !== 'undefined' && TutorHandoff.ready === true
    }));
    const studyNav = await page.locator('nav [data-go="study"]:visible').count();
    assert.equal(studyNav > 0, flags.study,
      'visible Study navigation must agree with StudyView.ready');
    if (!flags.tutor) {
      assert.equal(await page.getByRole('button', { name: /handoff|send to tutor/i }).count(), 0,
        'unaccepted tutor handoff must not expose an action');
      assert.equal(await page.locator('.tutor-handoff-sheet:visible').count(), 0,
        'unaccepted tutor handoff sheet must be hidden');
    }
    if (flags.study) {
      // A ready Study tab must actually render both via navigation and through
      // a fresh deep-link boot. This anonymous test must NEVER sign in, import
      // student data, or record evidence. Real owner acceptance remains separate.
      stage = 'ready-study-navigation';
      assert(flags.plan, 'ready Study view requires the approved StudyPlan API to be ready');
      await nav('study', '.study-page');
      await page.getByRole('heading', { name: 'Study checkpoint' }).waitFor({ timeout });
      await page.locator('.study-page .study-message').filter({
        hasText: 'Sign in to open an approved study checkpoint.'
      }).waitFor({ timeout });
      assert.equal(await page.locator('.study-page button').filter({
        hasText: /save proof attempt|record hint|record evidence/i
      }).count(), 0, 'signed-out users must never see evidence-write controls');
      await capture('01b-ready-study-signed-out');

      stage = 'ready-study-deep-link';
      const guarded = new URL(parsed.href);
      guarded.hash = 'study';
      await page.goto(guarded.href, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.locator('.study-page:visible').first().waitFor({ timeout });
      await page.locator('.study-page .study-message').filter({
        hasText: 'Sign in to open an approved study checkpoint.'
      }).waitFor({ timeout });
      await page.getByRole('button', { name: 'Back to Today' }).click();
      await page.locator('.today, .onboard').first().waitFor({ timeout });
    } else {
      // A manually entered URL fragment must not bypass the Study readiness
      // guard. Full reload is essential: the app reads the hash at boot.
      const guarded = new URL(parsed.href);
      guarded.hash = 'study';
      await page.goto(guarded.href, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.locator('.today, .onboard').first().waitFor({ timeout });
      assert.equal(await page.locator('.study-page:visible').count(), 0,
        'direct #study navigation must fall back to Today while not ready');
      await capture('01a-hidden-study-route');
      await page.goto(parsed.href, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.locator('.today, .onboard').first().waitFor({ timeout });
    }

    stage = 'settings-auth';
    await nav('settings', '.page.settings, .settings');
    // Render the sign-in UI, but never click a provider or enter account credentials.
    await page.getByRole('button', { name: 'Continue with Google' }).waitFor({ timeout });
    await capture('02-settings-sign-in');

    stage = 'cards';
    await nav('browse', '#browse-q');
    await capture('03-cards');
    await nav('home', '.today, .onboard');

    stage = 'create-card';
    await page.locator('.tb-add:visible').click();
    await page.locator('#ed-front').waitFor({ timeout });
    const front = 'Lemma release smoke: prove that 2 + 2 = 4';
    const title = 'Release smoke local round trip';
    await page.locator('#ed-deck').fill('Release smoke');
    await page.locator('#ed-title').fill(title);
    await page.locator('#ed-front').fill(front);
    await page.locator('#ed-back').fill('In the natural numbers, 2 + 2 = 4.');
    await page.locator('.sheet-foot .btn-primary').click();
    await page.locator('#ed-front').waitFor({ state: 'detached', timeout });
    await saved();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('.today').waitFor({ timeout });
    await nav('browse', '#browse-q');
    await page.locator('#browse-q').fill(title);
    await page.waitForFunction(value => {
      const rows = [...document.querySelectorAll('.note-row')];
      return rows.length === 1 && rows[0].textContent.includes(value);
    }, title, { timeout });
    assert.strictEqual(await page.locator('.note-row').count(), 1, 'card survives reload exactly once');
    await capture('04-card-after-reload');

    stage = 'review';
    await page.locator('.note-row').first().click();
    await page.getByRole('button', { name: 'Study with prerequisites' }).click();
    await page.locator('.btn-reveal').waitFor({ timeout });
    assert((await page.locator('.card-front').innerText()).includes(front), 'created card is reviewed');
    await capture('05-review-front');
    await page.locator('.btn-reveal').click();
    await page.locator('.grades .grade').first().waitFor({ timeout });
    await capture('06-review-answer');
    // Third grading button is "Good" in the original FSRS review UI.
    await page.locator('.grades .grade').nth(2).click();
    await saved();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('.today').waitFor({ timeout });
    await nav('browse', '#browse-q');
    await page.locator('#browse-q').fill(title);
    await page.waitForFunction(value => {
      const rows = [...document.querySelectorAll('.note-row')];
      return rows.length === 1 && rows[0].textContent.includes(value);
    }, title, { timeout });
    assert.strictEqual(await page.locator('.note-row').count(), 1, 'review did not duplicate card');
    assert.strictEqual(await page.locator('.note-row .sd-new').count(), 0, 'review schedule persisted after reload');
    await capture('07-reviewed-after-reload');

    // Wait for browser events to settle, then enforce zero errors from all visited screens.
    await page.waitForTimeout(350);
    assert.deepEqual(errors, [], 'Pages console and same-origin network must be clean');
    console.log('PASS live Pages smoke: ' + parsed.href + ' (anonymous, create/review/reload)');
  } catch (e) {
    try { await capture('FAIL-' + stage.replace(/[^a-z0-9-]/gi, '_')); } catch (_) {}
    throw new Error('Release smoke failed at ' + stage + ': ' + e.message +
      (errors.length ? '\nBrowser errors: ' + errors.join('\n') : ''), { cause: e });
  } finally {
    await ctx.close();
    await browser.close();
  }
}

async function negativeSelfTest() {
  const server = http.createServer((_req, res) => { res.writeHead(404); res.end('missing'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let rejected = false;
  try {
    await smoke('http://127.0.0.1:' + server.address().port + '/broken/');
  } catch (e) {
    rejected = /HTTP 2xx/.test(e.message);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
  assert(rejected, 'intentionally broken release URL must fail closed');
  fs.rmSync(OUT, { recursive: true, force: true }); // negative fixture is not live evidence
  console.log('PASS negative smoke: HTTP 404 release URL is rejected');
}
// Exercise the R9 *ready* path before it becomes user-visible. This modifies
// only the HTML served to a disposable, signed-out Chromium context; it never
// changes the checked-in source, the deployed site, or any account workspace.
function readyFixture(html) {
  function enable(source, startMarker, endMarker, flag) {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start + startMarker.length);
    if (start < 0 || end < 0 || end <= start) throw Error('Missing ready-fixture module boundary');
    const slice = source.slice(start, end);
    const matches = [...slice.matchAll(flag)];
    if (matches.length !== 1) throw Error('Missing or ambiguous ready-fixture flag');
    return source.slice(0, start) +
      slice.replace(flag, s => s.replace(/false/, 'true')) + source.slice(end);
  }
  const plan = enable(html, '/* ===== study_plan.js ===== */',
    '/* ===== tutor_handoff.js ===== */', /return [{] ready:(?:true|false), activeContext/g);
  return enable(plan, '/* ===== view_study.js ===== */',
    '/* ===== main.js ===== */', /const ready = (?:true|false);/g);
}
async function readySelfTest() {
  const original = fs.readFileSync(path.resolve(__dirname, '../dist/index.html'), 'utf8');
  assert.throws(() => readyFixture('invalid HTML'), /module boundary/,
    'missing source markers must fail closed');
  assert.throws(() => readyFixture(original.replace('const ready = false;',
    'const readinessFlag = false;')), /ambiguous ready-fixture flag/,
    'missing StudyView ready declaration must fail closed');
  const injected = readyFixture(original);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    serviceWorkers: 'block', viewport: { width: 390, height: 844 },
    colorScheme: 'light', reducedMotion: 'reduce'
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  const origin = 'http://127.0.0.1:42999/';
  await ctx.route(origin + '**', route => route.fulfill({
    status: 200, contentType: 'text/html', body: injected
  }));
  try {
    await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.locator('.today, .onboard').first().waitFor({ timeout });
    const ready = await page.evaluate(() => StudyView.ready && StudyPlan.ready);
    assert.equal(ready, true, 'the real built modules must both be ready in fixture');
    await page.locator('nav [data-go="study"]:visible').first().click();
    await page.locator('.study-page:visible').first().waitFor({ timeout });
    await page.locator('.study-page .study-message').filter({
      hasText: 'Sign in to open an approved study checkpoint.'
    }).waitFor({ timeout });
    assert.equal(await page.locator('.study-page button').filter({
      hasText: /save proof attempt|record hint|record evidence/i
    }).count(), 0, 'signed-out Study must not show evidence writes');
    await page.goto(origin + '#study', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.locator('.study-page:visible').first().waitFor({ timeout });
    await page.locator('.study-page .study-message').filter({
      hasText: 'Sign in to open an approved study checkpoint.'
    }).waitFor({ timeout });
    await page.getByRole('button', { name: 'Back to Today' }).click();
    await page.locator('.today, .onboard').first().waitFor({ timeout });
    assert.deepEqual(errors, [], 'injected ready Study must not cause browser exceptions');
    console.log('PASS ready-Study fixture: real StudyPlan/StudyView, anonymous navigation, deep link and return');
  } finally {
    await ctx.close();
    await browser.close();
  }
}
(async () => {
  if (process.argv.includes('--negative-self-test')) return negativeSelfTest();
  if (process.argv.includes('--ready-self-test')) return readySelfTest();
  if (!process.env.LEMMA_LIVE_URL) {
    console.log('SKIP live Pages smoke: LEMMA_LIVE_URL unset (offline npm test)');
    return;
  }
  const url = process.env.LEMMA_LIVE_URL;
  if (url === DEFAULT_URL || /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(url)) return smoke(url);
  throw new Error('Release URL must be canonical Pages or explicit local test URL');
})().catch(err => { console.error(err); process.exitCode = 1; });
