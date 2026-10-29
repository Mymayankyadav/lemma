// RELEASE-01 SHIP-F0: real Pages health, isolated anonymous browser, no fixtures in production.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { chromium } = require('playwright');

const OUT = path.resolve(__dirname, '../test-output/release-live');
const DEFAULT_URL = 'https://mymayankyadav.github.io/lemma/';
const timeout = 20000;
const SHELL_ASSETS = Object.freeze(['service-worker.js', 'manifest.webmanifest', 'icons/icon.svg']);
// Prove the published document is exactly the built source on deploy/tag runs.
function parityEnabled(value) {
  if (value === undefined || value === 'false') return false;
  if (value === 'true') return true;
  throw Error('Invalid LEMMA_REQUIRE_DEPLOYED_PARITY setting');
}
function assertDeployedHtmlParity(served, expected) {
  assert(Buffer.isBuffer(served) && Buffer.isBuffer(expected),
    'Pages parity requires raw HTML byte buffers');
  assert(served.length > 0 && expected.length > 0,
    'Pages parity requires nonempty deployed and built HTML');
  const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
  assert.strictEqual(digest(served), digest(expected),
    'Deployed Pages HTML does not match exact checked-out build');
}


function assertDeployedShellAsset(name, status, served, expected) {
  assert(SHELL_ASSETS.includes(name), 'Only approved public shell assets may be attested');
  assert.equal(status, 200, 'Deployed Pages ' + name + ' must respond HTTP 200');
  try {
    assertDeployedHtmlParity(served, expected);
  } catch (e) {
    throw new Error('Deployed Pages ' + name + ' mismatch: ' + e.message, { cause:e });
  }
}

// Derive readiness from the exact app bundle actually served, not nonexistent
// globals outside build.js's private IIFE. Reject missing/ambiguous declarations
// instead of silently interpreting an unparseable module as disabled.
function bundleReadiness(source) {
  function moduleText(startMarker, endMarker) {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start + startMarker.length);
    if (start < 0 || end <= start || source.indexOf(startMarker, start + startMarker.length) !== -1)
      throw Error('Missing or ambiguous built app module: ' + startMarker);
    return source.slice(start, end);
  }
  function flag(text, expression, name) {
    const found = [...text.matchAll(expression)];
    if (found.length !== 1) throw Error('Missing or ambiguous readiness flag: ' + name);
    return found[0][1] === 'true';
  }
  const plan = moduleText('/* ===== study_plan.js ===== */',
    '/* ===== tutor_handoff.js ===== */');
  const tutor = moduleText('/* ===== tutor_handoff.js ===== */',
    '/* ===== view_study.js ===== */');
  const study = moduleText('/* ===== view_study.js ===== */',
    '/* ===== main.js ===== */');
  return {
    study: flag(study, /const ready = (true|false);/g, 'StudyView'),
    plan: flag(plan, /return [{] ready:(true|false), activeContext/g, 'StudyPlan'),
    tutor: flag(tutor, /return [{] ready:(true|false), exportPacket/g, 'TutorHandoff')
  };
}

// Anonymous Pages acceptance: both the currently available backup-only section
// and the future full recovery UI contain private owner data. Neither may mount
// even a hidden download link, file picker, consent box or action while signed out.
// This must remain true with recovery disabled or later enabled by B.
async function assertSignedOutRecoveryHidden(page) {
  for (const selector of ['#set-account-backup', '#set-account-recovery',
    'a[download^="lemma-account-backup-"]', '#account-recovery-file',
    '#account-recovery-consent']) {
    assert.equal(await page.locator(selector).count(), 0,
      'signed-out Settings must not mount private recovery node ' + selector);
  }
  for (const label of ['Download account backup', 'Restore account backup',
    'Check restore', 'Resume account sync']) {
    assert.equal(await page.locator('button').filter({
      hasText: new RegExp('^\\s*' + label + '\\s*$')
    }).count(), 0, 'signed-out Settings must not expose recovery action ' + label);
  }
}

// Tutor acceptance preview requires a real signed-in Study checkpoint.
// Neither navigation nor direct hash reload may mount the preview or sheet
// for an anonymous visitor, even while general Tutor readiness is false.
async function assertSignedOutTutorHidden(page) {
  for (const selector of ['.study-acceptance-entry', '.study-acceptance-warning',
    '.tutor-handoff-sheet', '.tutor-handoff-acceptance-notice']) {
    assert.equal(await page.locator(selector).count(), 0,
      'signed-out Study must not mount tutor acceptance node ' + selector);
  }
  for (const label of ['Test tutor handoff (unreleased)', 'Open tutor handoff',
    'Copy packet', 'Save selected study events']) {
    assert.equal(await page.getByRole('button', { name:label, exact:true }).count(), 0,
      'signed-out Study must not expose tutor action ' + label);
  }
}

async function smoke(url) {
  const parsed = new URL(url);
  const requireParity = parityEnabled(process.env.LEMMA_REQUIRE_DEPLOYED_PARITY);
  if (requireParity && parsed.href !== DEFAULT_URL)
    throw Error('Deployment parity may only verify canonical Pages');
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
    if (requireParity) {
      stage = 'deployed-html-parity';
      const expected = fs.readFileSync(path.resolve(__dirname, '../dist/index.html'));
      assertDeployedHtmlParity(await response.body(), expected);
      stage = 'deployed-shell-assets';
      for (const name of SHELL_ASSETS) {
        const assetResponse = await ctx.request.get(new URL(name, parsed.href).href, {
          timeout: 45000, maxRedirects: 0
        });
        const builtAsset = fs.readFileSync(path.resolve(__dirname, '../dist', name));
        assertDeployedShellAsset(name, assetResponse.status(), await assetResponse.body(), builtAsset);
      }
      stage = 'navigation';
    }
    assert.strictEqual(new URL(page.url()).origin, parsed.origin, 'unexpected origin redirect');
    await page.locator('.onboard, .today').first().waitFor({ timeout });
    assert.match(await page.title(), /Lemma/, 'correct application loaded');
    stage = 'home';
    await capture('01-today');

    // SHIP-F1: hidden-until-ready is an acceptance property of the *deployed*
    // site, not just a unit-test assertion about a source-code boolean.
    stage = 'feature-readiness';
    // build.js encloses app modules in an IIFE. Their lexical bindings are
    // intentionally NOT browser globals; reading typeof StudyView from
    // page.evaluate would always return undefined and misreport readiness.
    const script = await page.evaluate(() =>
      [...document.scripts].map(s => s.textContent || '').join('\n'));
    const flags = bundleReadiness(script);
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
      await assertSignedOutTutorHidden(page);
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
      await assertSignedOutTutorHidden(page);
      await page.getByRole('button', { name: 'Back to Today' }).click();
      await page.locator('.today, .onboard').first().waitFor({ timeout });
      // In-app navigation does not rewrite a deep-link fragment. The later
      // card-persistence reload must begin from the normal app URL.
      const normal = new URL(parsed.href);
      normal.hash = '';
      await page.goto(normal.href, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.locator('.today, .onboard').first().waitFor({ timeout });
      assert.equal(new URL(page.url()).hash, '', 'normal smoke URL must not retain the Study deep link');
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
    await assertSignedOutRecoveryHidden(page);
    // Booting directly into Settings must not bypass the signed-out guard.
    const settingsUrl = new URL(parsed.href);
    settingsUrl.hash = 'settings';
    await page.goto(settingsUrl.href, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.locator('.page.settings, .settings').first().waitFor({ timeout });
    await page.getByRole('button', { name: 'Continue with Google' }).waitFor({ timeout });
    await assertSignedOutRecoveryHidden(page);
    await capture('02-settings-sign-in');

    stage = 'cards';
    // Restore the canonical root before card/review reload assertions.
    const normalSettingsExit = new URL(parsed.href);
    normalSettingsExit.hash = '';
    await page.goto(normalSettingsExit.href, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.locator('.today, .onboard').first().waitFor({ timeout });
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

function paritySelfTest() {
  const built = fs.readFileSync(path.resolve(__dirname, '../dist/index.html'));
  assert(built.length > 1000, 'Actual built app required for parity self-test');
  assertDeployedHtmlParity(Buffer.from(built), built);
  const stale = Buffer.from(built);
  stale[stale.length - 1] ^= 1;
  assert.throws(() => assertDeployedHtmlParity(stale, built), /does not match/);
  assert.throws(() => assertDeployedHtmlParity(Buffer.alloc(0), built), /nonempty/);
  assert.throws(() => assertDeployedHtmlParity('string', built), /raw HTML byte/);
  assert.equal(parityEnabled('true'), true);
  assert.equal(parityEnabled('false'), false);
  assert.equal(parityEnabled(undefined), false);
  assert.throws(() => parityEnabled('yes'), /Invalid LEMMA/);
  for (const name of SHELL_ASSETS) {
    const bytes = fs.readFileSync(path.resolve(__dirname, '../dist', name));
    assert(bytes.length > 0, 'Built public shell asset must not be empty: ' + name);
    assertDeployedShellAsset(name, 200, Buffer.from(bytes), bytes);
    const staleAsset = Buffer.from(bytes);
    staleAsset[0] ^= 1;
    assert.throws(() => assertDeployedShellAsset(name, 200, staleAsset, bytes),
      /Deployed Pages .* mismatch/, 'stale public shell asset must fail');
    assert.throws(() => assertDeployedShellAsset(name, 404, bytes, bytes),
      /must respond HTTP 200/, 'missing public shell asset must fail');
  }
  assert.throws(() => assertDeployedShellAsset('private.json', 200, built, built),
    /Only approved public shell assets/, 'no private route can become a release artifact');
  console.log('PASS release deployed HTML and PWA shell asset parity self-test');
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
// Test the future B activation in a disposable signed-out build without
// changing the real Pages bundle or granting account-recovery consent.
function enabledRecoveryFixture(html) {
  const start = html.indexOf('/* ===== view_settings.js ===== */');
  const end = html.indexOf('/* ===== sheets.js ===== */', start);
  if (start < 0 || end <= start) throw Error('Missing Settings fixture module boundary');
  const part = html.slice(start, end);
  const flag = /const ACCOUNT_RECOVERY_READY = (?:true|false);/g;
  if ([...part.matchAll(flag)].length !== 1)
    throw Error('Missing or ambiguous Settings recovery readiness flag');
  return html.slice(0, start) +
    part.replace(flag, 'const ACCOUNT_RECOVERY_READY = true;') + html.slice(end);
}

async function readySelfTest() {
  const original = fs.readFileSync(path.resolve(__dirname, '../dist/index.html'), 'utf8');
  assert.throws(() => readyFixture('invalid HTML'), /module boundary/,
    'missing source markers must fail closed');
  const viewStart = original.indexOf('/* ===== view_study.js ===== */');
  const viewEnd = original.indexOf('/* ===== main.js ===== */', viewStart);
  assert(viewStart >= 0 && viewEnd > viewStart, 'built StudyView module markers required');
  const view = original.slice(viewStart, viewEnd);
  const invalidView = view.replace(/const ready = (?:true|false);/,
    'const missingReadiness = false;');
  assert.notEqual(invalidView, view, 'StudyView readiness declaration required');
  assert.throws(() => readyFixture(original.slice(0, viewStart) + invalidView +
    original.slice(viewEnd)), /ambiguous ready-fixture flag/,
    'missing StudyView ready declaration must fail closed');
  assert.throws(() => enabledRecoveryFixture('invalid HTML'), /module boundary/);
  const injected = enabledRecoveryFixture(readyFixture(original));
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
    const script = await page.evaluate(() =>
      [...document.scripts].map(s => s.textContent || '').join('\n'));
    const flags = bundleReadiness(script);
    assert.equal(flags.study && flags.plan, true,
      'the real built StudyPlan and StudyView modules must both be ready in fixture');
    assert.equal(flags.tutor, bundleReadiness(original).tutor,
      'the fixture must not change Tutor readiness');
    await page.locator('nav [data-go="study"]:visible').first().click();
    await page.locator('.study-page:visible').first().waitFor({ timeout });
    await page.locator('.study-page .study-message').filter({
      hasText: 'Sign in to open an approved study checkpoint.'
    }).waitFor({ timeout });
    assert.equal(await page.locator('.study-page button').filter({
      hasText: /save proof attempt|record hint|record evidence/i
    }).count(), 0, 'signed-out Study must not show evidence writes');
    await assertSignedOutTutorHidden(page);
    // Deliberately inject an anonymous acceptance action to prove this
    // guard fails rather than simply passing when Study is signed out.
    await page.evaluate(() => {
      const leak=document.createElement('button');
      leak.textContent='Test tutor handoff (unreleased)';
      leak.dataset.tutorLeak='yes';
      document.querySelector('.study-page').append(leak);
    });
    await assert.rejects(assertSignedOutTutorHidden(page),
      /signed-out Study must not expose tutor action/);
    await page.locator('[data-tutor-leak]').evaluate(node=>node.remove());
    await assertSignedOutTutorHidden(page);
    await page.goto(origin + '#study', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.locator('.study-page:visible').first().waitFor({ timeout });
    await page.locator('.study-page .study-message').filter({
      hasText: 'Sign in to open an approved study checkpoint.'
    }).waitFor({ timeout });
    await assertSignedOutTutorHidden(page);
    await page.getByRole('button', { name: 'Back to Today' }).click();
    await page.locator('.today, .onboard').first().waitFor({ timeout });
    // Recovery is explicitly enabled in this synthetic bundle. Its entire
    // Settings section must nevertheless be absent without an authenticated owner.
    await page.goto(origin + '#settings', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.locator('.page.settings, .settings').first().waitFor({ timeout });
    // The disposable fixture does not initialize the production OAuth entry;
    // the Settings data panel is a stable proof that the route actually rendered.
    await page.locator('#set-data:visible').waitFor({ timeout });
    await assertSignedOutRecoveryHidden(page);
    // Negative control: the same assertion must detect an accidentally mounted
    // recovery section. This is a local DOM probe, not a real backup or restore.
    await page.evaluate(() => {
      const leak = document.createElement('section');
      leak.id = 'set-account-recovery';
      document.querySelector('.settings').append(leak);
    });
    await assert.rejects(assertSignedOutRecoveryHidden(page),
      /signed-out Settings must not mount private recovery node/);
    await page.locator('#set-account-recovery').evaluate(node => node.remove());
    await assertSignedOutRecoveryHidden(page);
    // Backup-only is a distinct shipped UI path while recovery stays gated.
    // A leaked section or even a detached private download link must fail.
    await page.evaluate(() => {
      const leak = document.createElement('section');
      leak.id = 'set-account-backup';
      document.querySelector('.settings').append(leak);
    });
    await assert.rejects(assertSignedOutRecoveryHidden(page),
      /signed-out Settings must not mount private recovery node.*set-account-backup/);
    await page.locator('#set-account-backup').evaluate(node => node.remove());
    await page.evaluate(() => {
      const leak = document.createElement('a');
      leak.download = 'lemma-account-backup-leaked.json';
      leak.href = 'data:application/json,fixture';
      document.querySelector('.settings').append(leak);
    });
    await assert.rejects(assertSignedOutRecoveryHidden(page),
      /signed-out Settings must not mount private recovery node.*download/);
    await page.locator('a[download^="lemma-account-backup-"]').evaluate(node => node.remove());
    await assertSignedOutRecoveryHidden(page);
    assert.deepEqual(errors, [], 'injected ready Study/recovery must not cause browser exceptions');
    console.log('PASS ready-Study/recovery fixture: signed-out tutor isolation, Study/Settings direct links and leak negative controls');
  } finally {
    await ctx.close();
    await browser.close();
  }
}
(async () => {
  if (process.argv.includes('--parity-self-test')) return paritySelfTest();
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
