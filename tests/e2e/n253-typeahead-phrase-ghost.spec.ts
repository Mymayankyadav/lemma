import {expect, test, type Locator, type Page} from '@playwright/test';
import type {PhraseGhostSample} from '../../src/features/tutor/writingAid/usePhraseGhost';

test.use({hasTouch: true});

const flags = 'v7Shell,v6Shell,tutorScratch,-tutorKeyInk';
const route = '#/p/real-analysis/cp/CP4/tutor';
const ghost = (page: Page) => page.locator('[data-writing-aid-ghost]');
const undo = (page: Page) => page.getByRole('button', {name: 'Undo suggestion', exact: true});
const keyboard = (page: Page) => page.getByRole('group', {name: 'Answer keyboard'});
const read = (page: Page) => page.evaluate(() => {
  let value: PhraseGhostSample | null = null;
  window.dispatchEvent(new CustomEvent('lemma-typeahead-read-phrase-ghost', {detail: (sample: PhraseGhostSample) => {value = sample;}}));
  return value as PhraseGhostSample | null;
});
const counts = (page: Page) => page.evaluate(() => {
  let value: Record<string, number> = {};
  window.dispatchEvent(new CustomEvent('lemma-typeahead-read-phrase-ghost-counts', {detail: (counts: Record<string, number>) => {value = counts;}}));
  return value;
});

async function open(page: Page, mode: 'shadow' | 'lab' | 'held' | 'legacy', optedIn = true) {
  await page.addInitScript(on => {
    if (on) localStorage.setItem('lemma.demo-tutor.writing-aid.v1:default', 'balanced:15:experiment');
    else localStorage.removeItem('lemma.demo-tutor.writing-aid.v1:default');
    sessionStorage.clear();
  }, optedIn);
  const experiment = mode === 'held' ? ',typeaheadPhraseGhost' : mode === 'legacy' ? ',proofAssistGhost' : '';
  const preview = mode === 'shadow' || mode === 'lab' ? `&typeahead-phrase-ghost=${mode}` : '';
  await page.goto(`/lemma/?demo=1&flags=${flags}${experiment}&typeahead-arm=expanded-kn&typeahead-frozen-profile=1${preview}${route}`);
  await page.getByRole('button', {name: 'Write a question', exact: true}).click();
  const answer = page.getByRole('textbox', {name: 'Your answer', exact: true});
  await expect(answer).toBeVisible();
  return answer;
}

async function type(answer: Locator, text: string) {
  await answer.fill('');
  await answer.focus();
  await answer.pressSequentially(text);
  await expect(answer).toHaveJSProperty('textContent', text);
}

async function onTime(page: Page, answer: Locator, mode: 'shadow' | 'lab') {
  // A busy CI frame may genuinely expire. Retry fresh typing for the UI
  // behavior and keep the production deadline for every attempt.
  const wanted = mode === 'lab' ? 'shown' : 'candidate';
  for (let attempt = 0; attempt < 5; attempt++) {
    await type(answer, 'On the o');
    await expect.poll(async () => (await read(page))?.status, {timeout: 1500}).toMatch(/^(candidate|expired)$/u);
    await answer.pressSequentially('t');
    await expect.poll(async () => (await read(page))?.status, {timeout: 1500}).toMatch(new RegExp(`^(${wanted}|expired)$`, 'u'));
    if ((await read(page))?.status === wanted) return;
  }
  throw new Error('No on-time phrase offer in five attempts');
}

const keyboardGeometry = (page: Page) => keyboard(page).evaluate(node => ({
  x: node.getBoundingClientRect().x, y: node.getBoundingClientRect().y,
  width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height,
  slots: [...node.querySelectorAll('.sugg button')].map(button => {
    const rect = button.getBoundingClientRect(), bounds = node.getBoundingClientRect();
    return {x: rect.x - bounds.x, y: rect.y - bounds.y, width: rect.width, height: rect.height};
  }),
}));

test('a local phrase stays out of shadow and keeps the three word slots usable in the lab', async ({page}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({width: 320, height: 820});
  const shadow = await open(page, 'shadow');
  await onTime(page, shadow, 'shadow');
  await expect(ghost(page)).toHaveCount(0);
  const before = (await read(page))!;
  expect(before).toMatchObject({eligible: true, candidate: {edit: {start: 9, end: 9, caret: 18, insert: 'her hand,'}}});
  expect(before.exactness).toBeUndefined();
  await expect(keyboard(page).locator('[data-slots="unified"] .sugg button')).toHaveCount(3);
  const regular = await keyboardGeometry(page);

  const lab = await open(page, 'lab');
  await onTime(page, lab, 'lab');
  await expect(ghost(page)).toBeVisible();
  await expect(lab).toHaveAttribute('data-completion', 'her hand,');
  expect((await read(page))?.frameMs).toBeLessThanOrEqual(60);
  await expect(keyboard(page).locator('[data-slots="unified"] .sugg button')).toHaveCount(3);
  expect(await keyboardGeometry(page)).toEqual(regular);
  await lab.press('Tab');
  await expect(lab).toHaveJSProperty('textContent', 'On the other hand,');
  expect(await lab.evaluate(node => {
    const selection = window.getSelection()!;
    const range = document.createRange();
    range.selectNodeContents(node);
    range.setEnd(selection.focusNode!, selection.focusOffset);
    return {collapsed: selection.isCollapsed, before: range.toString()};
  })).toEqual({collapsed: true, before: 'On the other hand,'});
  await expect.poll(() => page.evaluate(() => Object.values(sessionStorage).some(value => value.includes('"start":9,"end":18,"text":"her hand,","source":"phrase"')))).toBe(true);
  await undo(page).click();
  await expect(lab).toHaveJSProperty('textContent', 'On the ot');
  await expect(ghost(page)).toHaveCount(0);
  expect(await counts(page)).toMatchObject({accepted: 1, undone: 1});

  await onTime(page, lab, 'lab');
  await ghost(page).tap();
  await expect(lab).toHaveJSProperty('textContent', 'On the other hand,');
  await expect.poll(async () => (await counts(page)).retained, {timeout: 4000}).toBe(1);
});

test('the live preview revokes a stale pointer, survives exact typing only, and requires Faster Typing', async ({page, context}) => {
  test.setTimeout(60_000);
  const lab = await open(page, 'lab');
  await onTime(page, lab, 'lab');
  await ghost(page).dispatchEvent('pointerdown', {pointerType: 'touch', pointerId: 1, isPrimary: true});
  await lab.pressSequentially('h');
  await expect(ghost(page)).toHaveAttribute('data-typeahead-insert', 'er hand,');
  expect((await read(page))?.reused).toBe(true);
  await ghost(page).dispatchEvent('click', {detail: 1});
  await expect(lab).toHaveJSProperty('textContent', 'On the oth');
  await lab.pressSequentially('er hand,');
  await expect(lab).toHaveJSProperty('textContent', 'On the other hand,');
  await expect(ghost(page)).toHaveCount(0);
  expect(await counts(page)).toMatchObject({accepted: 0, typedThrough: 1});

  await onTime(page, lab, 'lab');
  await lab.press('ArrowLeft');
  await expect(ghost(page)).toHaveCount(0);
  await onTime(page, lab, 'lab');
  await lab.dispatchEvent('compositionstart');
  await expect(ghost(page)).toHaveCount(0);
  await lab.dispatchEvent('compositionend');
  await expect(ghost(page)).toHaveCount(0);

  await onTime(page, lab, 'lab');
  await keyboard(page).getByRole('button', {name: 'Equation mode', exact: true}).click();
  await expect(ghost(page)).toHaveCount(0);

  const optedOut = await context.newPage();
  const regular = await open(optedOut, 'lab', false);
  await type(regular, 'On the ot');
  expect(await read(optedOut)).toBeNull();
  await expect(ghost(optedOut)).toHaveCount(0);
});

test('the held release flag keeps Faster Typing silent and the legacy flag uses its original path', async ({page, context}) => {
  const held = await open(page, 'held');
  await type(held, 'On the ot');
  await expect(ghost(page)).toHaveCount(0);
  expect(await read(page)).toBeNull();

  const legacyPage = await context.newPage();
  const legacy = await open(legacyPage, 'legacy', false);
  await type(legacy, 'could you clarify the ');
  await expect(keyboard(legacyPage).locator('.strip [data-writing-aid-ghost]')).toBeVisible();
  expect(await read(legacyPage)).toBeNull();
});
