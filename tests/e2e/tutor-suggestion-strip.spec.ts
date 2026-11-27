import {expect, test, type Page} from '@playwright/test';

test.use({viewport: {width: 393, height: 873}, serviceWorkers: 'block'});

async function openComposer(page: Page, expanded = false) {
  await page.addInitScript(() => document.addEventListener('DOMContentLoaded', () => {document.documentElement.dataset.nativeApp = '';}));
  const flags = 'v7Shell,v6Shell,tutorScratch' + (expanded ? ',typeaheadV2' : ',-typeaheadV2');
  await page.goto('/lemma/?demo=1&flags=' + flags + '#/p/real-analysis/cp/CP4/tutor');
  await page.getByRole('button', {name: 'Write a question', exact: true}).click();
  return page.getByRole('textbox', {name: 'Your answer', exact: true});
}

for (const expanded of [false, true]) {
  test((expanded ? 'Expanded' : 'Standard') + ' strip echoes the live word while the dictionary is loading', async ({page, context}) => {
    let release!: () => void, fetching = false;
    const gate = new Promise<void>(resolve => {release = resolve;});
    await context.route('**/unigram-v2/lexicon.tsv', async route => {fetching = true; await gate; await route.continue();});
    const answer = await openComposer(page, expanded);
    const keyboard = page.getByRole('group', {name: 'Answer keyboard', exact: true});
    const strip = keyboard.getByRole('group', {name: expanded ? 'Answer suggestions' : 'Word suggestions', exact: true});
    try {
      // Preload on entry to the chat, before focusing or sending any text to the worker.
      await expect.poll(() => fetching).toBe(true);
      await expect(keyboard).toHaveCount(0);
      await answer.focus();
      await page.keyboard.type('repres');
      await expect(strip.getByRole('button').first()).toHaveAccessibleName('Keep repres');
      await expect(strip.locator('button:disabled')).toHaveCount(2);
      await page.keyboard.press('Backspace');
      await expect(strip.getByRole('button').first()).toHaveText('repre');
      await keyboard.getByRole('button', {name: 's', exact: true}).click();
      await expect(strip.getByRole('button').first()).toHaveText('repres');
      await expect(keyboard).not.toHaveAttribute('data-decoder', 'ready');
    } finally {release();}
    await expect(keyboard).toHaveAttribute('data-decoder', 'ready', {timeout: 15_000});
    await expect(strip.locator('[data-typeahead-insert]')).toHaveCount(2);
    const values = await strip.getByRole('button').evaluateAll(buttons => buttons.map(button => ({
      text: button.textContent, color: getComputedStyle(button).color, width: button.getBoundingClientRect().width,
    })));
    expect(values[0].text).toBe('repres');
    expect(new Set(values.map(value => value.text)).size).toBe(3);
    expect(new Set(values.map(value => value.color)).size).toBe(1);
    for (const value of values) expect(value.width).toBeCloseTo(values[0].width, 0);
    const literal = strip.getByRole('button').first();
    const box = (await literal.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.keyboard.type('e');
    await page.mouse.up();
    await expect(answer).toHaveJSProperty('textContent', 'represe');
    await literal.click();
    await expect(answer).toHaveJSProperty('textContent', 'represe ');
  });
}

test('a long spelling retains both ends and its full accessible name on a narrow screen', async ({page}) => {
  await page.setViewportSize({width: 320, height: 640});
  const answer = await openComposer(page);
  await answer.focus();
  const word = 'electroencephalographically';
  await page.keyboard.type(word);
  const key = page.getByRole('button', {name: 'Keep ' + word, exact: true});
  await expect(key).toHaveText(word);
  const parts = key.locator('.writing-aid-word-label > span');
  expect(await parts.first().evaluate(node => node.scrollWidth > node.clientWidth && getComputedStyle(node).textOverflow === 'ellipsis')).toBe(true);
  await expect(parts.last()).toHaveText('ally');
  const [button, tail] = await Promise.all([key.boundingBox(), parts.last().boundingBox()]);
  expect(tail!.x + tail!.width).toBeLessThanOrEqual(button!.x + button!.width);
  await key.click();
  await expect(answer).toHaveJSProperty('textContent', word + ' ');
});

test('brief keyboard closes reuse the worker, idle and leaving the tutor release it', async ({page}) => {
  const proseWorkers = () => page.workers().filter(worker => worker.url().includes('ngram.worker'));
  const answer = await openComposer(page);
  await answer.focus();
  const keyboard = page.getByRole('group', {name: 'Answer keyboard', exact: true});
  await expect(keyboard).toHaveAttribute('data-decoder', 'ready', {timeout: 15_000});
  const [first] = proseWorkers();
  expect(first).toBeDefined();
  await page.clock.install();
  const hide = keyboard.getByRole('button', {name: 'Hide keyboard', exact: true});
  await hide.click();
  await answer.click();
  await expect(keyboard).toHaveAttribute('data-decoder', 'ready');
  expect(proseWorkers()).toEqual([first]);
  await hide.click();
  await page.clock.fastForward(31_000);
  await expect.poll(() => proseWorkers().length).toBe(0);
  await answer.click();
  await expect(keyboard).toHaveAttribute('data-decoder', 'ready', {timeout: 15_000});
  expect(proseWorkers()).toHaveLength(1);
  expect(proseWorkers()[0]).not.toBe(first);
  await page.evaluate(() => {location.hash = '/today';});
  await expect(keyboard).toHaveCount(0);
  await expect.poll(() => proseWorkers().length).toBe(0);
});
