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
  const lexicon = page.waitForResponse(response => response.url().endsWith('/lexicon.tsv') && response.ok());
  await page.goto('/lemma/?demo=1&flags=v7Shell,v6Shell,tutorScratch#/p/real-analysis/cp/CP4/tutor');
  await page.getByRole('button', {name: 'Write a question', exact: true}).click();
  const answer = page.getByRole('textbox', {name: 'Your answer', exact: true});
  await answer.focus();
  const keyboard = page.getByRole('group', {name: 'Answer keyboard', exact: true});
  await expect(keyboard).toBeVisible();
  // The decoder is ready once the complete lexicon has loaded and been checked.
  const decoderReady = async () => {
    await lexicon;
    await expect(keyboard).toHaveAttribute('data-decoder', 'ready', {timeout: 15_000});
  };
  return {answer, keyboard, decoderReady};
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
  const {keyboard, decoderReady} = await openKeyboard(page, true);
  await decoderReady();
  const strip = page.locator('.kb .strip');
  const icons = await strip.locator('.sbtn:visible').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().width));
  // ∀ ∈ ⇒, Equation mode and Draw symbol.
  expect(icons).toHaveLength(5);
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
  const {answer, keyboard, decoderReady} = await openKeyboard(page, true);
  await decoderReady();
  await page.keyboard.type('We ');
  // "hsve": the second tap lands on s, beside a.
  for (const letter of 'hsve') await keyboard.getByRole('button', {name: letter, exact: true}).click();
  const have = keyboard.getByRole('group', {name: 'Word suggestions', exact: true}).getByRole('button', {name: 'Insert have', exact: true});
  await expect(have).toBeVisible();
  await expect(answer).toHaveJSProperty('textContent', 'We hsve');
  await have.click();
  await expect(answer).toHaveJSProperty('textContent', 'We have ');
});

test('a fix takes the strip like a Gboard correction and steps aside while a new word is typed', async ({page}) => {
  await page.setViewportSize({width: 393, height: 873});
  const {answer, keyboard, decoderReady} = await openKeyboard(page, true);
  await decoderReady();
  const strip = page.locator('.kb .strip');
  await page.keyboard.type('We wrote teh');
  const fix = page.getByRole('button', {name: 'Replace teh with the', exact: true});
  await expect(fix).toBeVisible();
  // One row in the strip: ✕ at the left, the word in the middle, Refresh at the right, above the keys.
  const [fixBox, stripBox, q] = await Promise.all([fix.boundingBox(), strip.boundingBox(),
    keyboard.getByRole('button', {name: 'q', exact: true}).boundingBox()]);
  expect(fixBox!.y).toBeGreaterThanOrEqual(stripBox!.y - 1);
  expect(fixBox!.y + fixBox!.height).toBeLessThanOrEqual(q!.y + 1);
  expect(fixBox!.x + fixBox!.width / 2).toBeCloseTo(stripBox!.x + stripBox!.width / 2, -1);
  // Typing a new word with its own suggestions: the words return; the earlier fix waits, still marked in the answer.
  await page.keyboard.type(' and the nota');
  await expect(keyboard.getByRole('group', {name: 'Word suggestions', exact: true})
    .getByRole('button', {name: 'Insert notation', exact: true})).toBeVisible();
  await expect(fix).toHaveCount(0);
  await expect(answer.locator('[data-writing-aid-source]')).toHaveText('teh');
  // At the next word boundary the fix comes back.
  await page.keyboard.type('tion ');
  await expect(fix).toBeVisible();
});

test('LaTeX commands and short forms offer symbols in the strip; tapping inserts the glyph in prose', async ({page}) => {
  await page.setViewportSize({width: 393, height: 873});
  const {answer, keyboard} = await openKeyboard(page, true);
  await page.keyboard.type('Let \\al');
  const symbols = keyboard.getByRole('group', {name: 'Symbol suggestions', exact: true});
  await expect(symbols).toBeVisible();
  const alpha = symbols.getByRole('button', {name: /^Insert α/});
  await expect(alpha).toBeVisible();
  await alpha.click();
  await expect(answer).toHaveJSProperty('textContent', 'Let α');
});

test('equation mode turns typed maths into symbols, keeps the strip geometry and undoes with Backspace', async ({page}) => {
  await page.setViewportSize({width: 393, height: 873});
  const {answer, keyboard} = await openKeyboard(page, true);
  const strip = page.locator('.kb .strip');
  const before = await strip.boundingBox();
  const toggle = keyboard.getByRole('button', {name: 'Equation mode', exact: true});
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  expect(await strip.boundingBox()).toEqual(before);
  await page.keyboard.type('root 2 + x^2 <= 1/2 ');
  await expect(answer).toHaveJSProperty('textContent', '√2 + x² ≤ ½ ');
  // Backspace straight after a change puts the typed text back, as after a Gboard autocorrection.
  await page.keyboard.press('Backspace');
  await expect(answer).toHaveJSProperty('textContent', '√2 + x² ≤ 1/2 ');
  // The strip offers the usual next pieces; after a variable, its square and indices.
  await page.keyboard.type('= y');
  const choices = keyboard.getByRole('group', {name: 'Equation suggestions', exact: true});
  await choices.getByRole('button', {name: 'Insert y²', exact: true}).click();
  await expect(answer).toHaveJSProperty('textContent', '√2 + x² ≤ 1/2 = y²');
  // Keep, in the strip's left slot, also puts back what was changed.
  await page.keyboard.type(' alpha ');
  await expect(answer).toHaveJSProperty('textContent', '√2 + x² ≤ 1/2 = y² α ');
  await choices.getByRole('button', {name: 'Keep alpha', exact: true}).click();
  await expect(answer).toHaveJSProperty('textContent', '√2 + x² ≤ 1/2 = y² alpha ');
  // Off again: ordinary typing is untouched.
  await toggle.click();
  await page.keyboard.type('root 2 ');
  await expect(answer).toHaveJSProperty('textContent', '√2 + x² ≤ 1/2 = y² alpha root 2 ');
});
