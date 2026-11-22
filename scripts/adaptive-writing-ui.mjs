import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';

const output = resolve(process.env.WRITING_AID_OUTPUT ?? 'docs/implementation/2026-11-21/writing-aid-adaptive');
const base = process.env.WRITING_AID_URL ?? 'http://127.0.0.1:4190/lemma/';
const route = new URL('?demo=1&flags=v7Shell,v6Shell,tutorScratch#/p/real-analysis/cp/CP4/tutor', base);
const baseline = JSON.parse(await readFile('docs/implementation/2026-11-21/writing-aid/simulation.json', 'utf8'));
const profiles = [
  {id: 'narrow-day', width: 320, height: 640, scale: 160, scheme: 'light', touch: true},
  {id: 'phone-night', width: 390, height: 844, scale: 100, scheme: 'dark', touch: true},
  {id: 'landscape-day', width: 844, height: 390, scale: 100, scheme: 'light', touch: true},
  {id: 'desktop-night', width: 1280, height: 800, scale: 100, scheme: 'dark', touch: false},
];
const assumptions = {wpm: 30, charactersPerWord: 5, msPerCharacter: 400,
  fittsInterceptMs: 130, fittsSlopeMs: 65, scanMs: 75, swipeDistancePx: 56,
  swipeSpeedPxPerSecond: [150, 300, 600], releaseMs: 80, mistakePenaltyMs: [1000, 2000, 4000]};
const rounded = number => Math.round(number * 100) / 100;
const box = async locator => {
  await locator.waitFor();
  const result = await locator.boundingBox();
  if (!result) throw new Error('Missing control bounds');
  return result;
};
const center = b => ({x: b.x + b.width / 2, y: b.y + b.height / 2});
function motion(a, b) {
  const from = center(a), to = center(b), dx = Math.abs(from.x - to.x), dy = Math.abs(from.y - to.y);
  const distance = Math.hypot(dx, dy);
  const width = distance ? Math.min(b.width * distance / dx, b.height * distance / dy) : b.width;
  return {distancePx: rounded(distance), ms: rounded(assumptions.fittsInterceptMs + assumptions.fittsSlopeMs * Math.log2(1 + distance / width))};
}
const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const button = (page, name) => page.getByRole('button', {name, exact: true});
const editor = page => page.getByRole('textbox', {name: 'Your answer', exact: true});
async function enter(page, value) {
  await editor(page).fill('');
  await editor(page).focus();
  await page.keyboard.type(value);
}

async function measure(browser, profile) {
  const context = await browser.newContext({viewport: {width: profile.width, height: profile.height},
    hasTouch: profile.touch, colorScheme: profile.scheme, reducedMotion: 'reduce', serviceWorkers: 'block'});
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    await page.addInitScript(scale => {
      document.addEventListener('DOMContentLoaded', () => {document.documentElement.style.fontSize = `${scale}%`;});
      localStorage.setItem('lemma.demo-tutor.writing-aid-model.v1:default', JSON.stringify({version: 1, enabled: false,
        model: {version: 1, weights: {}, vocabulary: {}}}));
    }, profile.scale);
    await page.goto(route.href);
    await button(page, 'Write a question').click();
    const paths = {};
    const keys = () => page.locator('[data-v7-keyboard] .row .k');
    async function path(name, text, actions, expected) {
      await enter(page, text);
      const keyName = text.at(-1) === ' ' ? 'Space' : text.at(-1).toLowerCase();
      const boxes = [await box(keys().and(button(page, keyName)))];
      for (const getLocator of actions) {
        const locator = getLocator();
        boxes.push(await box(locator));
        if (profile.touch) await locator.tap(); else await locator.click();
      }
      if (await editor(page).textContent() !== expected) throw new Error(`${profile.id}/${name}: unexpected draft`);
      const moves = boxes.slice(1).map((to, i) => motion(boxes[i], to));
      paths[name] = {taps: moves.length, boxes, travelPx: rounded(moves.reduce((sum, m) => sum + m.distancePx, 0)),
        modeledMs: rounded(moves.reduce((sum, m) => sum + m.ms + assumptions.scanMs, 0))};
    }
    await path('word', 'notat', [() => button(page, 'Insert notation')], 'notation ');
    await path('undo', 'notat', [() => button(page, 'Insert notation'), () => button(page, 'Undo suggestion')], 'notat');
    await path('spelling', 'We wrote teh', [() => button(page, 'Replace teh with the')], 'We wrote the');
    await path('dismiss', 'We wrote teh', [() => button(page, 'Dismiss suggestion')], 'We wrote teh');
    await path('refreshWords', 'notat', [() => button(page, 'Refresh suggestions')], 'notat');
    await path('refreshReplacement', 'We wrote teh', [() => button(page, 'Refresh replacement')], 'We wrote teh');
    await path('notation', 'Let eps', [() => button(page, 'Replace eps with ε')], 'Let ε');
    await path('continuation', 'could you restate', [() => page.locator('[data-writing-aid-ghost]')], 'could you restate the question');
    await path('refreshContinuation', 'could you explain', [() => button(page, 'Refresh continuation')], 'could you explain');

    await enter(page, 'could you restate');
    await page.locator('[data-writing-aid-ghost]').waitFor();
    await page.evaluate(() => document.fonts.ready);
    const input = await box(editor(page)), floating = await box(page.locator('[data-writing-aid-review]'));
    const keyboard = await box(page.locator('[data-v7-keyboard]'));
    const slots = await page.locator('[data-writing-aid-word]').evaluateAll(nodes => nodes.map(node => {
      const b = node.getBoundingClientRect(); return {x: b.x, y: b.y, width: b.width, height: b.height};
    }));
    const key = await box(keys().and(button(page, 'e')));
    const start = {x: input.x + Math.max(2, (input.width - 56) / 2) - 12, y: input.y, width: 24, height: input.height};
    const reach = motion(key, start);
    const swipe = assumptions.swipeSpeedPxPerSecond.map(speed => ({speedPxPerSecond: speed,
      modeledMs: rounded(reach.ms + assumptions.scanMs + 1000 * 56 / speed + assumptions.releaseMs)}));
    const geometry = {input, floating, keyboard, slots, overlapsKeyboard: overlaps(floating, keyboard),
      horizontalOverflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      floatingWithinViewport: floating.x >= 0 && floating.y >= 0 && floating.x + floating.width <= profile.width && floating.y + floating.height <= profile.height};
    if (geometry.overlapsKeyboard || geometry.horizontalOverflow || !geometry.floatingWithinViewport) throw new Error(`Invalid geometry: ${profile.id}`);
    await page.screenshot({path: resolve(output, `${profile.id}.png`), animations: 'disabled'});
    await enter(page, 'We wrote teh');
    await page.locator('[data-writing-aid-source]').waitFor();
    await page.screenshot({path: resolve(output, `${profile.id}-replacement.png`), animations: 'disabled'});
    if (errors.length) throw new Error(errors.join('\n'));
    const old = baseline.profiles.find(item => item.id === profile.id)?.paths;
    return {...profile, geometry, paths, swipe, baseline: old && {continuationMs: old.continuation.modeledMs,
      spellingMs: old.spelling.modeledMs, dismissViaMoreMs: old.keepTyped.modeledMs},
      correctionBreakEvenMs: assumptions.mistakePenaltyMs.map(penalty => ({penaltyMs: penalty,
        // Compare saving five characters with acceptance/scan plus a wrong-choice penalty.
        maximumErrorFraction: rounded(Math.min(1, Math.max(0, (5 * 400 - paths.continuation.modeledMs) / penalty)))}))};
  } finally {await context.close();}
}

await mkdir(output, {recursive: true});
const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium'});
const report = {browser: browser.version(), captureBuild: 'source server', assumptions, profiles: []};
try {
  for (const profile of profiles) {
    const result = await measure(browser, profile);
    report.profiles.push(result);
    console.log(profile.id, JSON.stringify({tapMs: result.paths.continuation.modeledMs, swipeMs: result.swipe,
      dismissMs: result.paths.dismiss.modeledMs, baseline: result.baseline}));
  }
} finally {await browser.close();}
await writeFile(resolve(output, 'ui-motion.json'), JSON.stringify(report, null, 2) + '\n');
