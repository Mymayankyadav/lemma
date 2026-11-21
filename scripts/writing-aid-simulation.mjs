import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';

const evidence = 'docs/implementation/2026-11-21/writing-aid';
const output = resolve(process.env.WRITING_AID_OUTPUT ?? evidence);
const base = process.env.WRITING_AID_URL ?? 'http://localhost:5173/lemma/';
const route = new URL('?demo=1&flags=v7Shell,v6Shell,tutorScratch#/p/real-analysis/cp/CP4/tutor', base);
const captureRoute = new URL(route.search + route.hash, process.env.WRITING_AID_CAPTURE_URL ?? base);
const drafts = (await readFile(new URL(`../${evidence}/replay-drafts.jsonl`, import.meta.url), 'utf8'))
  .trim().split('\n').map(line => JSON.parse(line));
const profiles = [
  {id: 'narrow-day', width: 320, height: 640, scale: 160, scheme: 'light', touch: true},
  {id: 'phone-night', width: 390, height: 844, scale: 100, scheme: 'dark', touch: true},
  {id: 'landscape-day', width: 844, height: 390, scale: 100, scheme: 'light', touch: true},
  {id: 'desktop-night', width: 1280, height: 800, scale: 100, scheme: 'dark', touch: false},
];
const assumptions = {
  baselineWpm: 30,
  charactersPerWord: 5,
  manualMsPerCharacter: 400,
  uptake: 0.75,
  fixedSelectionScanMs: 75,
  addedReorientationMs: [0, 25, 75, 125],
  ignoredListScanMs: [0, 15, 40],
  wrongTapFraction: [0, 0.02, 0.05],
  pointingInterceptMs: 130,
  pointingSlopeMs: 65,
  overlayGapPx: 4,
  overlayMaxWidthPx: 120,
};
const words = page => page.getByRole('group', {name: 'Word suggestions', exact: true});
const editPreview = page => page.locator('[data-writing-aid-edit]');
const ghostPreview = page => page.locator('[data-writing-aid-ghost]');
const more = page => page.getByRole('button', {name: 'More writing suggestions', exact: true});
const answerText = page => page.getByRole('textbox', {name: 'Your answer', exact: true});

const rounded = value => Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
const average = values => values.reduce((sum, value) => sum + value, 0) / values.length;
const percentile = (values, fraction) => values.toSorted((a, b) => a - b)[Math.ceil(values.length * fraction) - 1];
const center = box => ({x: box.x + box.width / 2, y: box.y + box.height / 2});

function motion(from, to) {
  const a = center(from), b = center(to);
  const dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y);
  const distance = Math.hypot(dx, dy);
  // The chord through the center is the available target width along this approach.
  const width = distance ? Math.min(to.width * distance / dx, to.height * distance / dy) : to.width;
  const time = assumptions.pointingInterceptMs + assumptions.pointingSlopeMs * Math.log2(1 + distance / width);
  return {distance, time};
}

function overlap(a, b) {
  return Math.min(a.x + a.width, b.x + b.width) > Math.max(a.x, b.x)
    && Math.min(a.y + a.height, b.y + b.height) > Math.max(a.y, b.y);
}

function nearerSlot(key, slots) {
  return slots.map((box, index) => ({index, distance: motion(key, box).distance}))
    .reduce((best, item) => item.distance < best.distance ? item : best).index;
}

function activeKey(character) {
  return {' ': 'Space', '\n': 'New line'}[character] ?? character?.toLowerCase();
}

export async function collectReplay(browser, source = base, pageUrl = route.href) {
  const context = await browser.newContext({serviceWorkers: 'block'});
  const page = await context.newPage();
  try {
    await page.goto(pageUrl);
    return await page.evaluate(async ({drafts, base, uptake}) => {
      // Vite loads the exact app modules and resolves the engine's bundled dictionary imports.
      const {predictWritingAid} = await import(new URL('src/features/tutor/writingAid/engine.ts', base).href);
      const {advanceWritingAidAnchor, applyWritingAidProposal, continueWritingAidAnchor} =
        await import(new URL('src/features/tutor/writingAid/policy.ts', base).href);
      const {padEdit} = await import(new URL('src/features/pad/padEdit.ts', base).href);
      function accepts(id, offset) {
        let hash = 2166136261;
        for (const char of `${id}/${offset}/use`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
        return (hash >>> 0) / 2 ** 32 < uptake;
      }
      function replayDraft({id, initial, target, truth}, mode) {
        const events = [], transitions = [];
        const intended = initial + target;
        let cursor = padEdit(initial), anchor = null, lastCharacter, previousPrimary, previousList;
        let offset = 0, resumeOffersAt = 0, ignoredLists = 0, eligible = 0;
        while (offset < target.length) {
          const request = {cursor, anchor, mode, composing: false, readOnly: false,
            target: {scopeKey: id, mountId: 'simulation', editorRevision: events.length, selectionRevision: events.length, modeRevision: 0}};
          const {words} = predictWritingAid(request);
          const slots = [words[1], words[0], words[2]];
          const primary = slots[1];
          if (primary && previousPrimary?.label === primary.label) {
            transitions.push({before: previousPrimary.lastCharacter, after: lastCharacter});
          }
          previousPrimary = primary ? {label: primary.label, lastCharacter} : undefined;
          const list = words.map(proposal => proposal.label).join('|');
          const newList = Boolean(list && list !== previousList);
          previousList = list;
          const choice = slots.map((proposal, rank) => ({proposal, rank, after: proposal && applyWritingAidProposal(request, proposal)}))
            .find(({after}) => after && after.text.startsWith(cursor.text) && after.text.length - cursor.text.length >= 2
              && intended.startsWith(after.text));
          if (choice && offset >= resumeOffersAt) {
            eligible++;
            const skipped = choice.after.text.length - cursor.text.length;
            if (accepts(id, offset)) {
              events.push({kind: 'accept', offset, rank: choice.rank, word: choice.proposal.label, skipped, hasAlternative: words.length > 1});
              anchor = continueWritingAidAnchor(anchor, choice.proposal, choice.after);
              cursor = choice.after;
              offset += skipped;
              previousPrimary = undefined;
              continue;
            }
            // A skipped offer leaves the rest of this intended word to manual entry.
            resumeOffersAt = offset + skipped;
          }
          if (newList) ignoredLists++;
          lastCharacter = target[offset];
          events.push({kind: 'type', character: lastCharacter, previousCharacter: target[offset - 1]});
          const next = padEdit(cursor.text + lastCharacter);
          anchor = advanceWritingAidAnchor(cursor, next, anchor);
          cursor = next;
          offset++;
        }
        if (cursor.text !== intended) throw new Error(`Replay diverged at ${id} in ${mode}`);
        return {id, truth, eligible, ignoredLists, events, transitions};
      }
      return Object.fromEntries(['balanced', 'fast', 'strict'].map(mode => [mode, drafts.map(row => replayDraft(row, mode))]));
    }, {drafts, base: source, uptake: assumptions.uptake});
  } finally {
    await context.close();
  }
}

function destinations(name, slot, last, geometry) {
  const {slots, keyboard} = geometry;
  if (name === 'nearest-slot') {
    const nearest = nearerSlot(last, slots);
    return slots[slot === 1 ? nearest : slot === nearest ? 1 : slot];
  }
  if (name === 'floating' && slot === 1) {
    const width = Math.min(slots[1].width, assumptions.overlayMaxWidthPx);
    const height = slots[1].height;
    const x = Math.max(keyboard.x, Math.min(center(last).x - width / 2, keyboard.x + keyboard.width - width));
    return {x, y: last.y - height - assumptions.overlayGapPx, width, height};
  }
  return slots[slot];
}

export function score(geometry, episodes, paths) {
  const {keys, slots} = geometry;
  const baselineMs = drafts.reduce((total, draft) => total + draft.target.length * assumptions.manualMsPerCharacter, 0);
  const ignoredLists = episodes.reduce((total, episode) => total + episode.ignoredLists, 0);
  const changes = episodes.flatMap(episode => episode.transitions).map(({before, after}) => ({before: keys[activeKey(before)], after: keys[activeKey(after)]}))
    .filter(({before, after}) => before && after);
  const primaryMoves = changes.filter(({before, after}) => nearerSlot(before, slots) !== nearerSlot(after, slots));
  const speed = totalMs => ({totalMs: rounded(totalMs), timeSavedPercent: rounded((1 - totalMs / baselineMs) * 100),
    modeledWpm: rounded(assumptions.baselineWpm * baselineMs / totalMs)});
  const placement = Object.fromEntries(['fixed', 'nearest-slot', 'floating'].map(name => {
    const trips = [];
    for (const {events} of episodes) {
      let lastKey, finger, previousAccept;
      for (const event of events) {
        if (event.kind === 'type') {
          const next = keys[activeKey(event.character)];
          const manualPrevious = keys[activeKey(event.previousCharacter)];
          // Only charge the change in approach. The baseline already includes the next manual tap.
          if (previousAccept && next && manualPrevious) {
            previousAccept.returnDelta = motion(finger, next).time - motion(manualPrevious, next).time;
          }
          previousAccept = null;
          lastKey = next;
          finger = next;
          continue;
        }
        if (!lastKey || !slots[event.rank]) throw new Error(`Missing key or slot ${event.rank + 1} geometry`);
        const destination = destinations(name, event.rank, lastKey, geometry);
        const out = motion(finger, destination);
        const floating = name === 'floating' && event.rank === 1;
        const cover = boxes => floating ? boxes.filter(box => overlap(box, destination)).length : 0;
        previousAccept = {distance: out.distance, pointing: out.time, returnDelta: 0, avoided: event.skipped * assumptions.manualMsPerCharacter,
          hasAlternative: event.hasAlternative, floating, moved: name === 'nearest-slot' && destination !== slots[event.rank],
          coveredKeys: cover(Object.values(keys)), coveredSlots: cover(slots.filter((_, index) => index !== 1))};
        trips.push(previousAccept);
        finger = destination;
      }
    }
    const motor = trip => trip.pointing + trip.returnDelta;
    const successfulTime = trips.reduce((total, trip) => total + motor(trip) + assumptions.fixedSelectionScanMs - trip.avoided, baselineMs);
    const sensitivity = assumptions.addedReorientationMs.map(extra => {
      return {extraMs: extra, ...speed(successfulTime + (name === 'fixed' ? 0 : extra * trips.length))};
    });
    const glanceSensitivity = assumptions.ignoredListScanMs.map(scanMs => ({scanMs, ...speed(successfulTime + scanMs * ignoredLists)}));
    const riskTrips = trips.filter(trip => trip.hasAlternative);
    const mistakePenalty = riskTrips.reduce((sum, trip) => sum + paths.differentWordThenUndo.modeledMs + trip.avoided
      - motor(trip) - assumptions.fixedSelectionScanMs, 0);
    // Sensitivity only: one sampled wrong tap and undo path, followed by manual retyping of the remaining word.
    const wrongTapSensitivity = assumptions.wrongTapFraction.map(wrongTapFraction => ({wrongTapFraction,
      ...speed(successfulTime + wrongTapFraction * mistakePenalty)}));
    const primaryTrips = trips.filter(trip => trip.floating);
    return [name, {averageTravelPx: rounded(average(trips.map(trip => trip.distance))),
      p90TravelPx: rounded(percentile(trips.map(trip => trip.distance), 0.9)),
      averagePointingMs: rounded(average(trips.map(trip => trip.pointing))),
      averageReturnChangeMs: rounded(average(trips.map(trip => trip.returnDelta))),
      averageMotorMs: rounded(average(trips.map(motor))),
      accepts: trips.length, acceptsWithAlternative: riskTrips.length, ignoredLists,
      movedAcceptTargets: trips.filter(trip => trip.moved).length,
      floatingPrimaryTargets: primaryTrips.length,
      primaryTargetsCoveringKeys: primaryTrips.filter(trip => trip.coveredKeys).length,
      primaryTargetsCoveringStrip: primaryTrips.filter(trip => trip.coveredSlots).length,
      maximumCoveredKeys: Math.max(0, ...trips.map(trip => trip.coveredKeys)),
      sensitivity, glanceSensitivity, wrongTapSensitivity}];
  }));
  return {sameWordSuccessiveKeystrokes: changes.length, nearestPrimarySlotMoves: primaryMoves.length, placement};
}

async function enter(page, text) {
  const answer = answerText(page);
  await answer.fill('');
  await answer.focus();
  await page.keyboard.type(text);
}

async function geometry(page) {
  return page.evaluate(() => {
    const required = selector => {
      const node = document.querySelector(selector);
      if (!node) throw new Error(`Missing ${selector}`);
      return node;
    };
    const rect = node => {
      const box = node.getBoundingClientRect();
      return {x: box.x, y: box.y, width: box.width, height: box.height};
    };
    const keyboard = required('[data-v7-keyboard]');
    const rail = required('.writing-aid-words');
    const slots = [...rail.children].slice(0, 3);
    if (slots.length !== 3) throw new Error(`Expected three word slots, found ${slots.length}`);
    return {
      keyboard: rect(keyboard),
      keys: Object.fromEntries([...keyboard.querySelectorAll('.row .k')].map(key => [key.getAttribute('aria-label'), rect(key)])),
      slots: slots.map(rect),
      header: rect(required('.tutor-header')),
      transcript: rect(required('.chat')),
      answer: rect(required('.composer .field')),
      theme: document.documentElement.dataset.theme,
      horizontalOverflow: document.documentElement.scrollWidth - innerWidth,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    };
  });
}

async function captureInteractionPaths(page, profile, {keys}) {
  const paths = {};
  async function action(name, locator, boxes, expectedDraft) {
    await locator.waitFor();
    const box = await locator.boundingBox();
    if (!box) throw new Error(`Missing visible control for ${name}`);
    boxes.push(box);
    if (profile.touch) await locator.tap();
    else await locator.click();
    if (expectedDraft !== undefined) {
      const actual = await answerText(page).textContent();
      if (actual !== expectedDraft) throw new Error(`${name} produced ${JSON.stringify(actual)} instead of ${JSON.stringify(expectedDraft)}`);
    }
  }
  function path(name, boxes) {
    const moves = boxes.slice(1).map((to, index) => motion(boxes[index], to));
    paths[name] = {taps: moves.length, travelPx: rounded(moves.reduce((sum, move) => sum + move.distance, 0)),
      modeledMs: rounded(moves.reduce((sum, move) => sum + move.time + assumptions.fixedSelectionScanMs, 0)), boxes};
  }
  const alternativeGroup = page.getByRole('group', {name: 'Writing suggestions', exact: true});
  const preferredWord = words(page).getByRole('button', {name: 'Insert notation', exact: true});

  await enter(page, 'notat');
  const direct = [keys.t];
  await action('word', preferredWord, direct, 'notation ');
  path('word', direct);

  await enter(page, 'notat');
  const correctionOfChoice = [keys.t];
  const differentWord = words(page).getByRole('button', {name: 'Insert notate', exact: true});
  const undo = page.getByRole('button', {name: 'Undo suggestion', exact: true});
  await action('different word', differentWord, correctionOfChoice, 'notate ');
  await action('undo different word', undo, correctionOfChoice, 'notat');
  path('differentWordThenUndo', correctionOfChoice);

  await enter(page, 'notat');
  const alternative = [keys.t];
  await action('more', more(page), alternative, 'notat');
  await action('word from more', alternativeGroup.getByRole('button', {name: 'notation', exact: true}), alternative, 'notation ');
  path('wordFromMore', alternative);

  await enter(page, 'We wrote teh');
  const spelling = [keys.h];
  await action('spelling', editPreview(page), spelling, 'We wrote the');
  path('spelling', spelling);

  await enter(page, 'We wrote teh');
  const keep = [keys.h];
  await action('more', more(page), keep, 'We wrote teh');
  if (profile.id === 'phone-night' || profile.id === 'landscape-day') {
    const file = profile.id === 'phone-night' ? 'phone-alternatives.png' : 'landscape-alternatives.png';
    await page.screenshot({path: resolve(output, file), animations: 'disabled'});
  }
  await action('keep', alternativeGroup.getByRole('button', {name: 'Keep what I typed', exact: true}), keep, 'We wrote teh');
  path('keepTyped', keep);

  await enter(page, 'Let eps');
  const notation = [keys.s];
  await action('notation', editPreview(page), notation, 'Let ε');
  path('notation', notation);

  await enter(page, 'could you restate');
  const continuation = [keys.e];
  await ghostPreview(page).waitFor();
  if (profile.id === 'phone-night') {
    await page.screenshot({path: resolve(output, 'phone-ghost.png'), animations: 'disabled'});
  }
  await action('continuation', ghostPreview(page), continuation, 'could you restate the question');
  path('continuation', continuation);
  return paths;
}

async function measureReadyTime(browser) {
  const cases = [
    {surface: 'word', prefix: 'not', key: 'a', selector: '[data-writing-aid-word][title="notation"]'},
    {surface: 'spelling', prefix: 'We wrote te', key: 'h', selector: '[data-writing-aid-edit][aria-label="Replace teh with the"]'},
    {surface: 'notation', prefix: 'Let ep', key: 's', selector: '[data-writing-aid-edit][aria-label="Replace eps with ε"]'},
    {surface: 'continuation', prefix: 'could you restat', key: 'e', selector: '.tutor-answer-editor[data-completion=" the question"]'},
  ];
  const observations = [];
  for (const cpuRate of [1, 6]) {
    const context = await browser.newContext({viewport: {width: 390, height: 844}, reducedMotion: 'reduce', serviceWorkers: 'block'});
    try {
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', {rate: cpuRate});
      await page.goto(captureRoute.href);
      await page.getByRole('button', {name: 'Write a question', exact: true}).click();
      await enter(page, 'nota');
      await page.locator(cases[0].selector).waitFor();
      for (let round = 0; round < 4; round++) {
        for (let index = 0; index < cases.length; index++) {
          const {surface, prefix, key, selector} = cases[(index + round) % cases.length];
          await answerText(page).fill('');
          await answerText(page).focus();
          await page.keyboard.insertText(prefix);
          // Let the already typed prefix settle before timing the last key.
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          await page.evaluate(selector => {
            if (document.querySelector(selector)) throw new Error(`Already displayed ${selector}`);
            window.writingAidReadyTime = new Promise((resolve, reject) => {
              const observer = new MutationObserver(() => {
                if (!document.querySelector(selector)) return;
                observer.disconnect();
                clearTimeout(timer);
                requestAnimationFrame(() => resolve(performance.now() - inputAt));
              });
              let inputAt;
              const timedInput = () => {
                inputAt = performance.now();
                observer.observe(document.body, {childList: true, subtree: true, attributes: true});
              };
              const timer = setTimeout(() => {
                document.removeEventListener('input', timedInput, true);
                observer.disconnect();
                reject(new Error(`Timed out waiting for ${selector}`));
              }, 2500);
              document.addEventListener('input', timedInput, {capture: true, once: true});
            });
          }, selector);
          await page.keyboard.press(key);
          const elapsed = await page.evaluate(() => window.writingAidReadyTime);
          observations.push({cpuRate, surface, round: round + 1, ms: rounded(elapsed)});
        }
      }
    } finally {
      await context.close();
    }
  }
  const summary = [1, 6].map(cpuRate => {
    const times = observations.filter(row => row.cpuRate === cpuRate).map(row => row.ms);
    return {cpuRate, samples: times.length, p50Ms: percentile(times, 0.5), p95Ms: percentile(times, 0.95),
      within30WpmInterval: times.filter(ms => ms < assumptions.manualMsPerCharacter).length};
  });
  return {observations, summary};
}

async function capture(browser, profile) {
  const context = await browser.newContext({viewport: {width: profile.width, height: profile.height},
    colorScheme: profile.scheme, hasTouch: profile.touch, reducedMotion: 'reduce'});
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error)));
  try {
    await page.addInitScript(size => {
      document.addEventListener('DOMContentLoaded', () => { document.documentElement.style.fontSize = `${size}%`; });
    }, profile.scale);
    await page.goto(captureRoute.href);
    await page.getByRole('button', {name: 'Write a question', exact: true}).click();
    if (profile.id === 'phone-night') await enter(page, 'We wrote teh');
    else await enter(page, 'The nota');
    await page.locator(profile.id === 'phone-night' ? '[data-writing-aid-edit]' : '[data-writing-aid-word]:enabled').first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    const measured = await geometry(page);
    await page.screenshot({path: resolve(output, `${profile.id}.png`), animations: 'disabled'});
    const paths = await captureInteractionPaths(page, profile, measured);
    if (pageErrors.length) throw new Error(pageErrors.join('\n'));
    return {measured, paths};
  } finally {
    await context.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await mkdir(output, {recursive: true});
  const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH});
  const report = {browser: browser.version(), captureBuild: process.env.WRITING_AID_CAPTURE_URL ? 'separate preview' : 'vite source server',
    assumptions, drafts: drafts.length, deliberatelyIncorrect: drafts.filter(draft => !draft.truth).length,
    typedCharacters: drafts.reduce((total, draft) => total + draft.target.length, 0), profiles: []};
  try {
    const replay = await collectReplay(browser);
    report.replay = Object.fromEntries(Object.entries(replay).map(([mode, episodes]) => [mode, episodes.map(({events, transitions, ...summary}) =>
      ({...summary, accepts: events.filter(event => event.kind === 'accept'), sameWordSuccessiveKeystrokes: transitions.length}))]));
    for (const profile of profiles) {
      const {measured, paths} = await capture(browser, profile);
      const modes = Object.fromEntries(Object.entries(replay).map(([mode, episodes]) => [mode, score(measured, episodes, paths)]));
      report.profiles.push({...profile, geometry: measured, paths, modes});
      console.log(profile.id, Object.fromEntries(Object.entries(modes.balanced.placement).map(([name, result]) => [name, result.averageMotorMs])));
    }
    report.inputToNextFrame = await measureReadyTime(browser);
    console.log('Input to next frame opportunity', report.inputToNextFrame.summary);
  } finally {
    await browser.close();
  }
  await writeFile(resolve(output, 'simulation.json'), JSON.stringify(report, null, 2) + '\n');
}
