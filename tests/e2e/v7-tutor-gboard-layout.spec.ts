import {expect, test, type Page} from '@playwright/test';

// N221 (Owner task): the answer keyboard uses Gboard's portrait geometry, measured on the Owner's Gboard screenshot
// (1080 px wide at 2.75 px per dp, so 393 × 873 CSS px) and AOSP LatinIME's 205.6 dp keyboard height.

async function openKeyboard(page: Page, nativeApp: boolean) {
  await page.addInitScript(native => {
    document.addEventListener('DOMContentLoaded', () => {
      if (native) document.documentElement.dataset.nativeApp = '';
      // The Android app's gesture inset (Capacitor's SystemBars injects it as a CSS variable).
      if (native) document.documentElement.style.setProperty('--safe-area-inset-bottom', '16px');
    });
  }, nativeApp);
  const lexicon = page.waitForResponse(response => response.url().endsWith('/lexicon.json') && response.ok());
  await page.goto('/lemma/?demo=1&flags=v7Shell,v6Shell,tutorScratch#/p/real-analysis/cp/CP4/tutor');
  await page.getByRole('button', {name: 'Write a question', exact: true}).click();
  const answer = page.getByRole('textbox', {name: 'Your answer', exact: true});
  await answer.focus();
  const keyboard = page.getByRole('group', {name: 'Answer keyboard', exact: true});
  await expect(keyboard).toBeVisible();
  return {answer, keyboard, lexicon};
}

/** Each key's visible cap (its ::before) and its touch cell. */
const geometry = (page: Page) => page.evaluate(() => {
  const keyboard = document.querySelector('.kb')!.getBoundingClientRect();
  const key = (label: string) => {
    const button = document.querySelector<HTMLElement>(`.kb .k[aria-label="${label}"]`)!;
    const cell = button.getBoundingClientRect(), cap = getComputedStyle(button, '::before');
    return {cell: cell.width, x: cell.left + parseFloat(cap.left), y: cell.top + parseFloat(cap.top),
      width: cell.width - parseFloat(cap.left) - parseFloat(cap.right), height: cell.height - parseFloat(cap.top) - parseFloat(cap.bottom),
      radius: cap.borderTopLeftRadius};
  };
  return {top: keyboard.top, bottom: innerHeight, q: key('q'), a: key('a'), z: key('z'), space: key('Space'), comma: key(','),
    symbols: key('?123'), enter: key('New line')};
});

test('in the Android app the keys sit where Gboard puts them on the Owner\'s phone', async ({page}) => {
  await page.setViewportSize({width: 393, height: 873});
  await openKeyboard(page, true);
  const g = await geometry(page);
  // Gboard: 92 × 113 px caps at 2.75 px per dp, 141.3 px rows, Q's cap 13 px from the edge.
  expect(g.q.width).toBeGreaterThan(33);
  expect(g.q.width).toBeLessThan(34.5);
  expect(g.q.height).toBeCloseTo(41, 0);
  expect(g.q.height).toBeGreaterThan(g.q.width);
  expect(g.q.x).toBeCloseTo(4.7, 0);
  expect(g.q.radius).toBe('5px');
  expect(g.a.y - g.q.y).toBeCloseTo(51.4, 0);
  expect(g.space.y - g.q.y).toBeCloseTo(154.2, 0);
  // Staggered rows: A half a key in, Z a key and a half in.
  expect(g.a.x - g.q.x).toBeCloseTo(g.q.cell / 2, 0);
  expect(g.z.x - g.q.x).toBeCloseTo(g.q.cell * 1.5, 0);
  // Bottom row: ?123 and Enter a key and a half, comma one key, the space bar four.
  expect(g.symbols.cell / g.q.cell).toBeCloseTo(1.5, 1);
  expect(g.enter.cell / g.q.cell).toBeCloseTo(1.5, 1);
  expect(g.comma.cell / g.q.cell).toBeCloseTo(1, 1);
  expect(g.space.cell / g.q.cell).toBeCloseTo(4, 1);
  // 53.8 px from the top of the keyboard (its strip) to the first cap, and 58.9 px under the last cap.
  expect(g.q.y - g.top).toBeCloseTo(53.8, 0);
  expect(g.bottom - (g.space.y + g.space.height)).toBeCloseTo(58.9, 0);
});

test('in a browser the caps keep Gboard\'s shape and layout with shorter rows and band', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  await openKeyboard(page, false);
  const g = await geometry(page);
  expect(g.q.height).toBeGreaterThan(g.q.width);
  expect(g.a.y - g.q.y).toBeCloseTo(44, 0);
  expect(g.space.cell / g.q.cell).toBeCloseTo(4, 1);
  const below = g.bottom - (g.space.y + g.space.height);
  expect(below).toBeGreaterThanOrEqual(13);
  expect(below).toBeLessThan(24);
  // Hide keyboard stays in the strip; the band button is the Android app's.
  await expect(page.locator('.kb .strip').getByRole('button', {name: 'Hide keyboard', exact: true})).toBeVisible();
});

test('the strip spreads its icons when idle and frames three word slots while typing, as Gboard', async ({page}) => {
  await page.setViewportSize({width: 393, height: 873});
  const {keyboard, lexicon} = await openKeyboard(page, true);
  await lexicon;
  const strip = page.locator('.kb .strip');
  const icons = await strip.locator('.sbtn:visible').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().width));
  expect(icons).toHaveLength(4);
  expect(Math.max(...icons) - Math.min(...icons)).toBeLessThan(2);
  // In the app, Hide keyboard sits in the band under the keys, where Gboard draws its chevron.
  const hide = keyboard.getByRole('button', {name: 'Hide keyboard', exact: true});
  await expect(hide).toHaveCount(1);
  const hideBox = (await hide.boundingBox())!, space = (await keyboard.getByRole('button', {name: 'Space', exact: true}).boundingBox())!;
  expect(hideBox.y).toBeGreaterThan(space.y + space.height);
  expect(hideBox.x + hideBox.width / 2).toBeCloseTo(44, 0);
  await page.keyboard.type('This is automati');
  const words = keyboard.getByRole('group', {name: 'Word suggestions', exact: true}).getByRole('button');
  await expect(words).toHaveCount(3);
  await expect(words.and(page.locator(':enabled'))).toHaveCount(3);
  const boxes = await words.evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().toJSON()));
  for (const box of boxes) expect(box.width).toBeCloseTo(boxes[0].width, 0);
  const [first, last] = [boxes[0], boxes[2]], stripBox = (await strip.boundingBox())!;
  // One icon at each end: the slots start and end about 48 px in.
  expect(first.x - stripBox.x).toBeCloseTo(48, -1);
  expect(stripBox.x + stripBox.width - (last.x + last.width)).toBeCloseTo(48, -1);
  // Words stay on one line.
  for (const height of await words.locator('.writing-aid-word-label').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().height))) {
    expect(height).toBeLessThan(30);
  }
});

test('near-miss taps decode to the intended word, offered in the strip and applied only when tapped', async ({page}) => {
  await page.setViewportSize({width: 393, height: 873});
  const {answer, keyboard, lexicon} = await openKeyboard(page, true);
  await lexicon;
  await page.keyboard.type('We ');
  // "hsve": the second tap lands on s, beside a.
  for (const letter of 'hsve') await keyboard.getByRole('button', {name: letter, exact: true}).click();
  const have = keyboard.getByRole('group', {name: 'Word suggestions', exact: true}).getByRole('button', {name: 'Insert have', exact: true});
  await expect(have).toBeVisible();
  await expect(answer).toHaveJSProperty('textContent', 'We hsve');
  await have.click();
  await expect(answer).toHaveJSProperty('textContent', 'We have ');
});
