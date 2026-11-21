import {expect, test, type CDPSession, type Locator, type Page} from '@playwright/test';
import {liveTutorFixtureResponse, prepareLiveTutor} from './helpers/live-tutor';
import {createWritingAidModel, updateWritingAidModel} from '../../src/features/tutor/writingAid/learning';
import {packTutorWritingReply} from '../../supabase/functions/_shared/tutor-writing';

const routes = '/lemma/?demo=1&flags=v7Shell,v6Shell,tutorScratch#';
const tutor = routes + '/p/real-analysis/cp/CP4/tutor';

async function openAnswer(page: Page) {
  await page.goto(tutor);
  await page.getByRole('button', {name: 'Write a question', exact: true}).click();
  const answer = page.getByRole('textbox', {name: 'Your answer', exact: true});
  await expect(answer).toHaveAttribute('contenteditable', 'true');
  return answer;
}

async function typeDraft(page: Page, answer: Locator, text: string) {
  await answer.fill('');
  await answer.focus();
  await page.keyboard.type(text);
  await expect(answer).toHaveJSProperty('textContent', text);
}

// Send trusted touch events so Chromium performs its normal selection and scroll
// handling as well as dispatching the composer's pointer events.
async function touchDrag(client: CDPSession, answer: Locator, dx: number, dy: number, cancel = false) {
  await client.send('Emulation.setTouchEmulationEnabled', {enabled: true, maxTouchPoints: 1});
  // Wait until the displayed offer has actually had a paint opportunity.
  await answer.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
  const box = await answer.boundingBox();
  expect(box).not.toBeNull();
  const x = Math.round(box!.x + Math.max(8, Math.min(box!.width - 8, box!.width / 2 - dx / 2)));
  const y = Math.round(box!.y + Math.max(8, Math.min(box!.height - 8, box!.height / 2 - dy / 2)));
  await client.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x, y, id: 1}]});
  await client.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x: x + dx, y: y + dy, id: 1}]});
  await client.send('Input.dispatchTouchEvent', {type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: []});
}

// Test selection/composition guards without invoking Chromium's native Back
// gesture when no completion is offered.
async function guardedPointerDrag(answer: Locator) {
  const box = (await answer.boundingBox())!;
  for (const [type, dx] of [['pointerdown', 0], ['pointermove', 90], ['pointerup', 90]] as const) {
    await answer.dispatchEvent(type, {pointerId: 17, pointerType: 'touch', isPrimary: true,
      clientX: box.x + 20 + dx, clientY: box.y + box.height / 2, bubbles: true});
  }
}

const wordStrip = (page: Page) => page.getByRole('group', {name: 'Word suggestions', exact: true});
const editPreview = (page: Page) => page.locator('[data-writing-aid-edit]');
const ghostPreview = (page: Page) => page.locator('[data-writing-aid-ghost]');
const undoButton = (page: Page) => page.getByRole('button', {name: 'Undo suggestion', exact: true});
const floating = (page: Page) => page.locator('.writing-aid-floating');
const dismissButton = (page: Page) => page.getByRole('button', {name: 'Dismiss suggestion', exact: true});
const ghostClipping = (page: Page) => page.locator('.writing-editor-mirror').evaluate(node => {
  const range = document.createRange();
  range.selectNodeContents(node.lastChild!);
  const bounds = node.getBoundingClientRect();
  const rects = Array.from(range.getClientRects()).filter(rect => rect.height > 0);
  return rects.length ? Math.max(0, ...rects.map(rect => Math.max(bounds.top - rect.top, rect.bottom - bounds.bottom))) : Infinity;
});

async function storedModel(page: Page) {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find(item => item.includes('writing-aid-model'));
    return key ? JSON.parse(localStorage.getItem(key)!) as {
      enabled: boolean;
      model: {weights: Record<string, {value: number}>; vocabulary: Record<string, {uses: number}>;
        autoTrust?: Record<string, {accepts: number}>};
    } : null;
  });
}

async function useFasterTyping(page: Page) {
  await page.getByRole('button', {name: 'Edit answer', exact: true}).click();
  await page.getByRole('dialog', {name: 'Answer actions', exact: true})
    .getByRole('button', {name: 'Writing assistance', exact: true}).click();
  await page.getByRole('dialog', {name: 'Writing assistance', exact: true})
    .getByRole('radio', {name: /^Faster typing\b/}).check();
  await page.keyboard.press('Escape');
}

const offeredWords = async (page: Page) => wordStrip(page).locator('button:enabled').evaluateAll(nodes =>
  nodes.map(node => node.getAttribute('aria-label')!.replace(/^Insert /, '')));
const surfaceItemWeight = (model: Awaited<ReturnType<typeof storedModel>>, surface: string) =>
  Object.entries(model?.model.weights ?? {}).filter(([key]) => key.startsWith('item:' + surface + ':'))
    .reduce((sum, [, weight]) => sum + weight.value, 0);
function contrastRatio(foreground: string, background: string) {
  const luminance = (color: string) => {
    const rgb = color.match(/[\d.]+/g)!.slice(0, 3).map(value => Number(value) / 255)
      .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  const [high, low] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (high + 0.05) / (low + 0.05);
}

test('a word slot accepts one explicit edit and keeps its position during a stale pointer press', async ({page}) => {
  const answer = await openAnswer(page);
  const slots = wordStrip(page).getByRole('button');
  const notation = wordStrip(page).getByRole('button', {name: 'Insert notation', exact: true});
  await typeDraft(page, answer, 'nota');
  await expect(slots).toHaveCount(3);
  await expect(notation).toBeEnabled();
  const position = await notation.boundingBox();
  await page.mouse.move(position!.x + position!.width / 2, position!.y + position!.height / 2);
  await page.mouse.down();
  await page.keyboard.type('t');
  await expect(answer).toHaveJSProperty('textContent', 'notat');
  await expect(notation).toBeEnabled();
  expect(await notation.boundingBox()).toEqual(position);
  await page.mouse.up();
  await expect(answer).toHaveJSProperty('textContent', 'notat');
  await expect(undoButton(page)).toHaveCount(0);

  await notation.click();
  await expect(answer).toHaveJSProperty('textContent', 'notation ');
  await expect(answer).toBeFocused();
  await undoButton(page).click();
  await expect(answer).toHaveJSProperty('textContent', 'notat');
});

test('keyboard refresh replaces the displayed words and records feedback on those words', async ({page}) => {
  const answer = await openAnswer(page);
  await useFasterTyping(page);
  await typeDraft(page, answer, 'I think the re');
  await expect.poll(async () => (await offeredWords(page)).length).toBe(3);
  const first = await offeredWords(page);
  expect(new Set(first).size).toBe(3);
  const before = await storedModel(page);
  await page.getByRole('button', {name: 'Refresh suggestions', exact: true}).click();
  await expect.poll(async () => (await offeredWords(page)).join('|')).not.toBe(first.join('|'));
  const next = await offeredWords(page);
  expect(next.length).toBeGreaterThan(0);
  expect(next.every(word => !first.includes(word))).toBe(true);
  await expect(answer).toHaveJSProperty('textContent', 'I think the re');
  await expect(answer).toBeFocused();
  for (const word of first) {
    const key = 'item:word:' + word.toLowerCase();
    await expect.poll(async () => (await storedModel(page))?.model.weights[key]?.value ?? 0)
      .toBeLessThan(before?.model.weights[key]?.value ?? 0);
  }
});

test('a typed different word revokes its earlier visible offers and records weak feedback', async ({page}) => {
  const answer = await openAnswer(page);
  await useFasterTyping(page);
  await typeDraft(page, answer, 'I think the re');
  await expect.poll(async () => (await offeredWords(page)).length).toBe(3);
  const first = await offeredWords(page);
  const before = await storedModel(page);
  // Exposure requires a short dwell before continuing to type.
  await page.waitForTimeout(350);
  await page.keyboard.type('vised ');
  await expect(answer).toHaveJSProperty('textContent', 'I think the revised ');
  for (const word of first) {
    const key = 'item:word:' + word.toLowerCase();
    await expect.poll(async () => (await storedModel(page))?.model.weights[key]?.value ?? 0)
      .toBeLessThan(before?.model.weights[key]?.value ?? 0);
  }
  expect((await offeredWords(page)).every(word => !first.includes(word))).toBe(true);
  expect(JSON.stringify(await storedModel(page))).not.toContain('I think the revised');
});

test('a divergent typed continuation revokes the shown ghost and gives it weak feedback', async ({page}) => {
  const answer = await openAnswer(page);
  await typeDraft(page, answer, 'could you restate');
  await expect(answer).toHaveAttribute('data-completion', ' the question');
  const before = await storedModel(page);
  // Derive the opaque candidate key through the production model instead of
  // storing the continuation text in the browser model or duplicating its hash.
  const probe = createWritingAidModel();
  updateWritingAidModel(probe, 'divergent', {kind: 'ghost', candidate: ' the question', prefix: '', previous: '', mode: 'balanced'});
  const key = Object.keys(probe.weights).find(item => item.startsWith('item:ghost:'))!;
  await page.waitForTimeout(350);
  await page.keyboard.type(' the graph ');
  await expect(answer).toHaveJSProperty('textContent', 'could you restate the graph ');
  await expect(answer).not.toHaveAttribute('data-completion', ' the question');
  const previous = before?.model.weights[key]?.value ?? 0;
  await expect.poll(async () => (await storedModel(page))?.model.weights[key]?.value ?? 0).toBeLessThan(previous);
  expect(((await storedModel(page))?.model.weights[key]?.value ?? 0) - previous).toBeGreaterThan(-0.1);
});

test('refreshing a floating replacement does not edit the draft or penalize the word surface', async ({page}) => {
  const answer = await openAnswer(page);
  await typeDraft(page, answer, 'We wrote teh');
  await expect(editPreview(page)).toHaveAccessibleName('Replace teh with the');
  const before = await storedModel(page);
  await page.getByRole('button', {name: 'Refresh replacement', exact: true}).click();
  await expect.poll(async () => await editPreview(page).count() ? editPreview(page).getAttribute('aria-label') : null)
    .not.toBe('Replace teh with the');
  await expect(answer).toHaveJSProperty('textContent', 'We wrote teh');
  await expect(answer).toBeFocused();
  await expect.poll(async () => surfaceItemWeight(await storedModel(page), 'correction'))
    .toBeLessThan(surfaceItemWeight(before, 'correction'));
  const after = await storedModel(page);
  const wordWeights = (model: typeof after) => Object.fromEntries(Object.entries(model?.model.weights ?? {})
    .filter(([key]) => key.startsWith('item:word:')));
  expect(wordWeights(after)).toEqual(wordWeights(before));
});

test('refreshed and dismissed replacements stay gone for that occurrence, but can return after retyping it', async ({page}) => {
  const answer = await openAnswer(page);
  for (const action of ['Refresh replacement', 'Dismiss suggestion']) {
    await typeDraft(page, answer, 'We wrote teh');
    await expect(editPreview(page)).toHaveAccessibleName('Replace teh with the');
    await page.getByRole('button', {name: action, exact: true}).click();
    await page.keyboard.type(' today');
    await expect(answer).toHaveJSProperty('textContent', 'We wrote teh today');
    await expect(editPreview(page)).toHaveCount(0);
  }
  await typeDraft(page, answer, 'We wrote teh');
  await expect(editPreview(page)).toHaveAccessibleName('Replace teh with the');
});

test('learned writing preferences can be paused and forgotten without changing the draft', async ({page}) => {
  const answer = await openAnswer(page);
  await useFasterTyping(page);
  await typeDraft(page, answer, 'I think the re');
  await expect.poll(async () => (await offeredWords(page)).length).toBe(3);
  await page.getByRole('button', {name: 'Refresh suggestions', exact: true}).click();
  await expect.poll(async () => Object.keys((await storedModel(page))?.model.weights ?? {}).length).toBeGreaterThan(0);
  await page.getByRole('button', {name: 'Edit answer', exact: true}).click();
  await page.getByRole('dialog', {name: 'Answer actions', exact: true})
    .getByRole('button', {name: 'Writing assistance', exact: true}).click();
  const settings = page.getByRole('dialog', {name: 'Writing assistance', exact: true});
  const personalize = settings.getByRole('switch', {name: 'Personalize suggestions', exact: true});
  await expect(personalize).toBeChecked();
  await personalize.click();
  await expect(personalize).not.toBeChecked();
  await settings.getByRole('button', {name: 'Forget learned writing preferences', exact: true}).click();
  await expect.poll(async () => Object.keys((await storedModel(page))?.model.weights ?? {}).length).toBe(0);
  expect((await storedModel(page))?.model.vocabulary).toEqual({});
  await expect(personalize).not.toBeChecked();
  await page.keyboard.press('Escape');
  await expect(answer).toHaveJSProperty('textContent', 'I think the re');
  await page.reload();
  await expect(answer).toHaveJSProperty('textContent', 'I think the re');
  await page.getByRole('button', {name: 'Edit answer', exact: true}).click();
  await page.getByRole('dialog', {name: 'Answer actions', exact: true})
    .getByRole('button', {name: 'Writing assistance', exact: true}).click();
  await expect(personalize).not.toBeChecked();
  await personalize.click();
  await expect(personalize).toBeChecked();
});

test('spelling stays literal as the learner types and offers visible replace, keep and undo actions', async ({page}) => {
  const answer = await openAnswer(page);
  await typeDraft(page, answer, 'We wrote teh');
  const replacement = editPreview(page);
  await expect(replacement).toHaveAccessibleName('Replace teh with the');
  await expect(replacement.locator('del')).toHaveText('teh');
  const source = answer.locator('[data-writing-aid-source]');
  await expect(source).toHaveText('teh');
  await expect(source).toHaveCSS('text-decoration-line', 'line-through');
  await expect(answer).toHaveJSProperty('textContent', 'We wrote teh');
  await page.getByRole('group', {name: 'Answer keyboard', exact: true}).getByRole('button', {name: 'Space', exact: true}).click();
  await expect(answer).toHaveJSProperty('textContent', 'We wrote teh ');
  await expect(replacement).toHaveAccessibleName('Replace teh with the');
  await replacement.click();
  await expect(answer).toHaveJSProperty('textContent', 'We wrote the ');
  await expect(answer).toBeFocused();
  const textBeforeCaret = await answer.evaluate(node => {
    const selection = node.ownerDocument.getSelection()!;
    const range = node.ownerDocument.createRange();
    range.selectNodeContents(node);
    range.setEnd(selection.focusNode!, selection.focusOffset);
    return {collapsed: selection.isCollapsed, text: range.toString()};
  });
  expect(textBeforeCaret).toEqual({collapsed: true, text: 'We wrote the '});
  await undoButton(page).click();
  await expect(answer).toHaveJSProperty('textContent', 'We wrote teh ');

  await typeDraft(page, answer, 'We wrote teh');
  await expect(replacement).toBeVisible();
  await expect(answer).toHaveJSProperty('textContent', 'We wrote teh');
  await dismissButton(page).click();
  await expect(replacement).toHaveCount(0);
  await expect(answer).toBeFocused();
  await page.keyboard.type(' today');
  await expect(answer).toHaveJSProperty('textContent', 'We wrote teh today');
  await expect(replacement).toHaveCount(0);
});

for (const editorKind of ['rich', 'textarea'] as const) {
  test(`personally trusted corrections can be undone by button or Backspace in the ${editorKind} editor`, async ({page}) => {
    let answer: Locator;
    if (editorKind === 'rich') answer = await openAnswer(page);
    else {
      await page.goto('/lemma/?demo=1&flags=v7Shell,v6Shell#/p/real-analysis/cp/CP4/tutor');
      await page.getByRole('button', {name: 'Write a question', exact: true}).click();
      answer = page.getByRole('textbox', {name: 'Your answer', exact: true});
      await expect(answer).toHaveJSProperty('tagName', 'TEXTAREA');
    }
    const value = async () => editorKind === 'rich' ? answer.textContent() : answer.inputValue();
    const type = async (text: string) => {
      await answer.fill('');
      await answer.focus();
      await page.keyboard.type(text);
    };
    // Cold rules preserve literal text until this learner has explicitly chosen the pair twice.
    await type('I read teh ');
    expect(await value()).toBe('I read teh ');
    await type('');
    for (const method of ['button', 'Backspace'] as const) {
      for (let count = 1; count <= 2; count++) {
        const previous = (await value()) ?? '';
        const separator = previous && !previous.endsWith(' ') ? ' ' : '';
        await page.keyboard.type(separator + 'I read teh');
        await expect(editPreview(page)).toHaveAccessibleName('Replace teh with the');
        await editPreview(page).click();
        expect(await value()).toBe(previous + separator + 'I read the');
        await expect.poll(async () => (await storedModel(page))?.model.autoTrust?.['teh-to-the']?.accepts ?? 0).toBe(count);
      }
      const previous = (await value()) ?? '';
      const separator = previous && !previous.endsWith(' ') ? ' ' : '';
      await page.keyboard.type(separator + 'I read teh');
      await page.keyboard.type(' ');
      await expect.poll(value).toBe(previous + separator + 'I read the ');
      const notice = page.locator('.writing-aid-auto-correction');
      await expect(notice).toBeVisible();
      await expect(notice.getByRole('status')).toContainText('Corrected');
      await expect(notice.locator('del')).toHaveText('teh');
      await expect(notice.locator('strong')).toHaveText('the');
      if (method === 'button') await undoButton(page).click(); else await answer.press('Backspace');
      await expect.poll(value).toBe(previous + separator + 'I read teh ');
      await expect(notice).toHaveCount(0);
      await expect.poll(async () => (await storedModel(page))?.model.autoTrust?.['teh-to-the']?.accepts ?? 0).toBe(0);
      await type('I read teh ');
      expect(await value()).toBe('I read teh ');
      await type('');
    }
  });
}

test('clearing a completed draft preserves explicit correction trust', async ({page}) => {
  await page.goto('/lemma/?demo=1&flags=v7Shell,v6Shell#/p/real-analysis/cp/CP4/tutor');
  await page.getByRole('button', {name: 'Write a question', exact: true}).click();
  const answer = page.getByRole('textbox', {name: 'Your answer', exact: true});
  for (let count = 1; count <= 2; count++) {
    await answer.fill('');
    await answer.focus();
    await page.keyboard.type('I read teh');
    await editPreview(page).click();
    await expect(answer).toHaveValue('I read the');
    await expect.poll(async () => (await storedModel(page))?.model.autoTrust?.['teh-to-the']?.accepts ?? 0).toBe(count);
  }
  await answer.fill('');
  await answer.focus();
  await page.keyboard.type('I read teh ');
  await expect(answer).toHaveValue('I read the ');
  await expect(page.locator('.writing-aid-auto-correction')).toBeVisible();
});

test('editing an earlier accepted correction revokes trust after text shifts', async ({page}) => {
  await page.goto('/lemma/?demo=1&flags=v7Shell,v6Shell#/p/real-analysis/cp/CP4/tutor');
  await page.getByRole('button', {name: 'Write a question', exact: true}).click();
  const answer = page.getByRole('textbox', {name: 'Your answer', exact: true});
  await answer.focus();
  for (let count = 1; count <= 2; count++) {
    await page.keyboard.type((count === 1 ? '' : ' ') + 'I read teh');
    await editPreview(page).click();
    await expect.poll(async () => (await storedModel(page))?.model.autoTrust?.['teh-to-the']?.accepts ?? 0).toBe(count);
  }
  await expect(answer).toHaveValue('I read the I read the');
  await answer.evaluate((node: HTMLTextAreaElement) => node.setSelectionRange(0, 0));
  await page.keyboard.type('Well, ');
  await expect(answer).toHaveValue('Well, I read the I read the');
  await expect.poll(async () => (await storedModel(page))?.model.autoTrust?.['teh-to-the']?.accepts ?? 0).toBe(2);
  await answer.evaluate((node: HTMLTextAreaElement) => node.setSelectionRange(15, 16));
  await page.keyboard.type('u');
  await expect(answer).toHaveValue('Well, I read thu I read the');
  await expect.poll(async () => (await storedModel(page))?.model.autoTrust?.['teh-to-the']?.accepts ?? 0).toBe(0);
  await answer.press('End');
  await page.keyboard.type(' I read teh ');
  await expect(answer).toHaveValue('Well, I read thu I read the I read teh ');
  await expect(page.locator('.writing-aid-auto-correction')).toHaveCount(0);
});

test('notation and faded continuation are explicit and undo restores the authored text', async ({page}) => {
  const answer = await openAnswer(page);
  await typeDraft(page, answer, 'Let eps');
  await expect(editPreview(page)).toHaveAccessibleName('Replace eps with ε');
  await editPreview(page).click();
  await expect(answer).toHaveJSProperty('textContent', 'Let ε');
  await answer.press('Control+z');
  await expect(answer).toHaveJSProperty('textContent', 'Let eps');

  await typeDraft(page, answer, 'could you restate');
  await expect(ghostPreview(page)).toHaveAccessibleName('Accept continuation the question');
  await expect(answer).toHaveAttribute('data-completion', ' the question');
  await expect(answer).toHaveJSProperty('textContent', 'could you restate');
  await answer.press('Tab');
  await expect(answer).toHaveJSProperty('textContent', 'could you restate the question');
  await expect(answer).toBeFocused();
  await undoButton(page).click();
  await expect(answer).toHaveJSProperty('textContent', 'could you restate');
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`suggestion categories use distinct, labelled theme colors in ${colorScheme}`, async ({page}) => {
    await page.emulateMedia({colorScheme, reducedMotion: 'reduce'});
    const answer = await openAnswer(page);
    const colors: string[] = [];
    for (const [draft, kind, label] of [
      ['We wrote teh', 'correction', 'Spelling'], ['Let eps', 'notation', 'Notation'],
      ['could you restate', 'continuation', 'Continuation'],
    ] as const) {
      await typeDraft(page, answer, draft);
      const choice = page.locator(`.writing-aid-floating-choice[data-kind="${kind}"]`);
      const preview = choice.locator('.writing-aid-preview');
      await expect(preview).toBeVisible();
      await expect(preview.locator('small')).toContainText(label);
      await expect(preview.locator('small svg')).toHaveCount(1);
      const style = await preview.evaluate(node => ({background: getComputedStyle(node).backgroundColor,
        foreground: getComputedStyle(node.querySelector('small')!).color}));
      colors.push(style.foreground);
      expect(contrastRatio(style.foreground, style.background)).toBeGreaterThanOrEqual(4.5);
      await preview.hover();
      const hoverStyle = await preview.evaluate(node => ({background: getComputedStyle(node).backgroundColor,
        foreground: getComputedStyle(node.querySelector('small')!).color}));
      expect(contrastRatio(hoverStyle.foreground, hoverStyle.background)).toBeGreaterThanOrEqual(4.5);
      for (const target of [preview, choice.locator('.writing-aid-refresh'), dismissButton(page)]) {
        const box = (await target.boundingBox())!;
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
    }
    await typeDraft(page, answer, 'nota');
    const preferred = wordStrip(page).locator('button.preferred');
    await expect(preferred).toBeEnabled();
    const wordStyle = await preferred.evaluate(node => ({foreground: getComputedStyle(node).color,
      background: getComputedStyle(node).backgroundColor}));
    colors.push(wordStyle.foreground);
    expect(contrastRatio(wordStyle.foreground, wordStyle.background), JSON.stringify(wordStyle)).toBeGreaterThanOrEqual(4.5);
    await preferred.hover();
    const hoverWordStyle = await preferred.evaluate(node => ({foreground: getComputedStyle(node).color,
      background: getComputedStyle(node).backgroundColor}));
    expect(contrastRatio(hoverWordStyle.foreground, hoverWordStyle.background)).toBeGreaterThanOrEqual(4.5);
    expect(new Set(colors).size).toBe(4);
  });
}

test('a horizontal touch drag never accepts a continuation; tapping it still works', async ({page, context}) => {
  const answer = await openAnswer(page);
  const client = await context.newCDPSession(page);
  for (const distance of [56, 90]) {
    await typeDraft(page, answer, 'could you restate');
    await expect(answer).toHaveAttribute('data-completion', ' the question');
    // Native Chromium may treat an unhandled horizontal touch as Back. Keep
    // that navigation on the same route while checking that no text is applied.
    await page.evaluate(() => history.pushState({}, '', location.href));
    await touchDrag(client, answer, distance, 0);
    await expect(answer).toHaveJSProperty('textContent', 'could you restate');
    await expect(undoButton(page)).toHaveCount(0);
  }
  await typeDraft(page, answer, 'could you restate');
  await ghostPreview(page).click();
  await expect(answer).toHaveJSProperty('textContent', 'could you restate the question');
  await undoButton(page).click();
  await expect(answer).toHaveJSProperty('textContent', 'could you restate');
});

test('touching and dragging the answer does not capture the composer or accept a continuation', async ({page, context}) => {
  const answer = await openAnswer(page);
  await typeDraft(page, answer, 'could you restate');
  await expect(answer).toHaveAttribute('data-completion', ' the question');
  await page.evaluate(() => {
    history.pushState({}, '', location.href);
    document.addEventListener('pointerdown', event => {
      (window as Window & {testPointerId: number}).testPointerId = event.pointerId;
    }, {once: true, capture: true});
  });
  const client = await context.newCDPSession(page);
  await client.send('Emulation.setTouchEmulationEnabled', {enabled: true, maxTouchPoints: 1});
  const box = (await answer.boundingBox())!;
  const x = Math.round(box.x + 20), y = Math.round(box.y + box.height / 2);
  await client.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x, y, id: 1}]});
  await client.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x: x + 90, y, id: 1}]});
  const pointerId = await page.evaluate(() => (window as Window & {testPointerId: number}).testPointerId);
  expect(await page.locator('.writing-composer-card').evaluate((node, id) => node.hasPointerCapture(id), pointerId)).toBe(false);
  await client.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
  await expect(answer).toHaveJSProperty('textContent', 'could you restate');
  await expect(undoButton(page)).toHaveCount(0);
});

test('short, leftward, vertical, cancelled and stale gestures do not accept a continuation', async ({page, context}) => {
  const answer = await openAnswer(page);
  const client = await context.newCDPSession(page);
  await typeDraft(page, answer, 'could you restate');
  await expect(answer).toHaveAttribute('data-completion', ' the question');
  await guardedPointerDrag(floating(page));
  await expect(answer).toHaveJSProperty('textContent', 'could you restate');
  await expect(answer).toHaveAttribute('data-completion', ' the question');
  for (const [dx, dy, cancel] of [[55, 0, false], [-90, 0, false], [0, 70, false], [56, 19, false], [90, 0, true]] as const) {
    await typeDraft(page, answer, 'could you restate');
    await expect(answer).toHaveAttribute('data-completion', ' the question');
    await page.evaluate(() => history.pushState({}, '', location.href));
    await touchDrag(client, answer, dx, dy, cancel);
    await expect(answer).toHaveJSProperty('textContent', 'could you restate');
    await expect(undoButton(page)).toHaveCount(0);
  }

  await typeDraft(page, answer, 'could you restate');
  await expect(answer).toHaveAttribute('data-completion', ' the question');
  await page.evaluate(() => history.pushState({}, '', location.href));
  const box = (await answer.boundingBox())!;
  const x = Math.round(box.x + 15), y = Math.round(box.y + box.height / 2);
  await client.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x, y, id: 1}]});
  await page.keyboard.type('x');
  await client.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x: x + 90, y, id: 1}]});
  await client.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
  const edited = await answer.textContent();
  expect(edited).toContain('x');
  expect(edited!.replace('x', '')).toBe('could you restate');
  await expect(undoButton(page)).toHaveCount(0);

  await typeDraft(page, answer, 'could you restate');
  await expect(answer).toHaveAttribute('data-completion', ' the question');
  await page.evaluate(() => history.pushState({}, '', location.href));
  await client.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x, y, id: 1}]});
  await page.waitForTimeout(700);
  await client.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x: x + 90, y, id: 1}]});
  await client.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
  await expect(answer).toHaveJSProperty('textContent', 'could you restate');
  await expect(undoButton(page)).toHaveCount(0);
});

test('ordinary text selection and vertical scrolling remain available', async ({page, context}) => {
  const answer = await openAnswer(page);
  await typeDraft(page, answer, 'could you restate');
  await expect(answer).toHaveAttribute('data-completion', ' the question');
  const points = await answer.evaluate(node => {
    const text = node.firstChild!;
    const at = (offset: number) => {
      const range = document.createRange();
      range.setStart(text, offset);
      range.collapse(true);
      const rect = range.getBoundingClientRect();
      return {x: rect.x, y: rect.y + rect.height / 2};
    };
    return [at(1), at(10)];
  });
  await page.mouse.move(points[0].x, points[0].y);
  await page.mouse.down();
  await page.mouse.move(points[1].x, points[1].y, {steps: 5});
  await page.mouse.up();
  expect((await page.evaluate(() => window.getSelection()?.toString()))?.length).toBeGreaterThan(0);
  await expect(answer).toHaveJSProperty('textContent', 'could you restate');
  await expect(undoButton(page)).toHaveCount(0);

  const draft = 'Explanation '.repeat(18) + '. could you restate';
  await typeDraft(page, answer, draft);
  await expect(answer).toHaveAttribute('data-completion', ' the question');
  await expect.poll(() => answer.evaluate(node => node.scrollHeight - node.clientHeight)).toBeGreaterThan(20);
  await answer.evaluate(node => {node.scrollTop = 0;});
  await touchDrag(await context.newCDPSession(page), answer, 0, -70);
  await expect.poll(() => answer.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
  await expect(answer).toHaveJSProperty('textContent', draft);
  await expect(undoButton(page)).toHaveCount(0);
});

test('proof choices and non-typing input preserve authored text and IME composition', async ({page, context}) => {
  const answer = await openAnswer(page);
  const enabledWords = wordStrip(page).locator('button:enabled');
  for (const literal of ['Let X and Y be sets. Take a in ', 'Every bounded sequence converges.']) {
    await typeDraft(page, answer, literal);
    await expect(enabledWords).toHaveCount(0);
    await expect(editPreview(page)).toHaveCount(0);
    await expect(ghostPreview(page)).toHaveCount(0);
    await expect(answer).toHaveJSProperty('textContent', literal);
  }

  await answer.fill('');
  await answer.evaluate(node => {
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain', 'We wrote teh');
    node.dispatchEvent(new ClipboardEvent('paste', {clipboardData, bubbles: true, cancelable: true}));
  });
  await expect(answer).toHaveJSProperty('textContent', 'We wrote teh');
  await expect(editPreview(page)).toHaveCount(0);

  await typeDraft(page, answer, 'could you restate');
  await expect(ghostPreview(page)).toBeVisible();
  await answer.press('Shift+ArrowLeft');
  await expect(ghostPreview(page)).toHaveCount(0);
  await expect(answer).toHaveJSProperty('textContent', 'could you restate');
  const ime = await context.newCDPSession(page);
  const selectedText = await page.evaluate(() => window.getSelection()?.toString());
  await guardedPointerDrag(answer);
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(selectedText);
  await expect(answer).toHaveJSProperty('textContent', 'could you restate');
  await expect(undoButton(page)).toHaveCount(0);
  await typeDraft(page, answer, 'We wrote teh');
  await expect(editPreview(page)).toBeVisible();
  await ime.send('Input.imeSetComposition', {text: '証', selectionStart: 1, selectionEnd: 1});
  await expect(answer).toHaveJSProperty('textContent', 'We wrote teh証');
  await expect(editPreview(page)).toHaveCount(0);
  await expect(ghostPreview(page)).toHaveCount(0);
  await expect(enabledWords).toHaveCount(0);
  await guardedPointerDrag(answer);
  await expect(answer).toHaveJSProperty('textContent', 'We wrote teh証');
  await ime.send('Input.imeSetComposition', {text: '証明', selectionStart: 2, selectionEnd: 2});
  await ime.send('Input.insertText', {text: '証明'});
  await expect(answer).toHaveJSProperty('textContent', 'We wrote teh証明');
  await answer.press('Control+z');
  await expect(answer).toHaveJSProperty('textContent', 'We wrote teh');
});

test('Faster typing does not offer an unchosen logical connector', async ({page}) => {
  const answer = await openAnswer(page);
  await page.getByRole('button', {name: 'Edit answer', exact: true}).click();
  await page.getByRole('dialog', {name: 'Answer actions', exact: true})
    .getByRole('button', {name: 'Writing assistance', exact: true}).click();
  await page.getByRole('dialog', {name: 'Writing assistance', exact: true})
    .getByRole('group', {name: 'Suggestion mode'}).getByRole('radio', {name: /^Faster typing\b/}).check();
  await page.keyboard.press('Escape');
  const connector = wordStrip(page).getByRole('button', {name: 'Insert because', exact: true});
  for (const prefix of ['I b', 'I becau']) {
    await typeDraft(page, answer, prefix);
    await expect(answer).toHaveJSProperty('textContent', prefix);
    if (prefix === 'I b') await expect(wordStrip(page).locator('button:enabled').first()).toBeVisible();
    // Allow the cached engine import and the scheduled render to settle before
    // making an absence assertion for the longer, possibly empty word pool.
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(connector).toHaveCount(0);
  }
  await typeDraft(page, answer, 'I believe because');
  await expect(answer).toHaveJSProperty('textContent', 'I believe because');
  await expect(connector).toHaveCount(0);
});

test('the writing switches and full Off setting persist while manual typing and math stay usable', async ({page}) => {
  const answer = await openAnswer(page);
  await typeDraft(page, answer, 'We wrote teh');
  await expect(editPreview(page)).toBeVisible();
  await page.getByRole('button', {name: 'Edit answer', exact: true}).click();
  await page.getByRole('dialog', {name: 'Answer actions', exact: true})
    .getByRole('button', {name: 'Writing assistance', exact: true}).click();
  const settings = page.getByRole('dialog', {name: 'Writing assistance', exact: true});
  const spelling = settings.getByRole('switch', {name: 'Spelling corrections', exact: true});
  await expect(spelling).toBeChecked();
  await spelling.click();
  await expect(spelling).not.toBeChecked();
  await page.keyboard.press('Escape');
  await typeDraft(page, answer, 'We wrote teh');
  await expect(editPreview(page)).toHaveCount(0);
  await typeDraft(page, answer, 'Let eps');
  await expect(editPreview(page)).toBeVisible();

  await page.getByRole('button', {name: 'Edit answer', exact: true}).click();
  await page.getByRole('dialog', {name: 'Answer actions', exact: true})
    .getByRole('button', {name: 'Writing assistance', exact: true}).click();
  await settings.getByRole('group', {name: 'Suggestion mode'}).getByRole('radio', {name: /^Off\b/}).check();
  await expect(spelling).toBeDisabled();
  await page.keyboard.press('Escape');
  await answer.fill('');
  await page.reload();
  await page.getByRole('button', {name: 'Write a question', exact: true}).click();
  await typeDraft(page, answer, 'Let eps');
  await expect(editPreview(page)).toHaveCount(0);
  await expect(wordStrip(page).locator('button:enabled')).toHaveCount(0);
  await expect(floating(page)).toHaveCount(0);
  await answer.press('Tab');
  await expect(page.getByRole('button', {name: 'Edit answer', exact: true})).toBeFocused();
  await page.getByRole('group', {name: 'Answer keyboard', exact: true}).getByRole('button', {name: 'Space', exact: true}).click();
  await page.getByRole('group', {name: 'Quick math symbols'}).getByRole('button', {name: '∈', exact: true}).click();
  await expect(answer).toHaveJSProperty('textContent', 'Let eps ∈');

  await page.goto(routes + '/settings?section=tutor');
  await expect(page.getByRole('group', {name: 'Suggestion mode'}).getByRole('radio', {name: /^Off\b/})).toBeChecked();
});

test('Off stops recording typing and retires an unfinished acceptance timer', async ({page}) => {
  const answer = await openAnswer(page);
  await typeDraft(page, answer, 'We wrote teh');
  await editPreview(page).click();
  await expect(answer).toHaveJSProperty('textContent', 'We wrote the');
  await page.getByRole('button', {name: 'Edit answer', exact: true}).click();
  await page.getByRole('dialog', {name: 'Answer actions', exact: true})
    .getByRole('button', {name: 'Writing assistance', exact: true}).click();
  await page.getByRole('dialog', {name: 'Writing assistance', exact: true})
    .getByRole('group', {name: 'Suggestion mode'}).getByRole('radio', {name: /^Off\b/}).check();
  const before = await storedModel(page);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(3200);
  await typeDraft(page, answer, 'Testing words ');
  expect(await storedModel(page)).toEqual(before);
  await expect(floating(page)).toHaveCount(0);
});

test('a read-only tutor draft remains intact with a saved Balanced preference', async ({page}) => {
  const {owner, cpId, threadId, payload} = await prepareLiveTutor(page, false);
  const draft = 'We wrote teh';
  await page.addInitScript(({owner, cpId, draft}) => {
    localStorage.setItem('lemma.tutor.draft:' + JSON.stringify([owner, 'logic', cpId]) + ':question', draft);
    localStorage.setItem('lemma.tutor.draft:' + JSON.stringify([owner, 'input', 'preferences']) + ':writing-aid', 'balanced:15');
  }, {owner, cpId, draft});
  await page.route('**/rest/v1/**', route => {
    const request = route.request();
    const path = new URL(request.url()).pathname.split('/rest/v1/')[1];
    if (path === 'rpc/tutor_thread_state') return route.fulfill({json: {head: {threadId, pendingTurnId: null, lastSequence: 0},
      canSubmit: false, canConnect: false, recoveredDrafts: [], turns: []}});
    return route.fulfill({json: liveTutorFixtureResponse(payload, path, request.headers().accept)});
  });
  await page.goto('/lemma/?demo=0&flags=v7Shell,tutorThreads#/p/logic/cp/CP1/tutor');
  const answer = page.getByRole('textbox', {name: 'Your answer', exact: true});
  await expect(answer).toHaveJSProperty('readOnly', true);
  await answer.click();
  await page.keyboard.type('x');
  await expect(answer).toHaveValue(draft);
  await expect(wordStrip(page)).toHaveCount(0);
  await expect(editPreview(page)).toHaveCount(0);
  await expect(ghostPreview(page)).toHaveCount(0);
  await guardedPointerDrag(answer);
  await expect(answer).toHaveValue(draft);
});

test('only the current connector reply can ground a labelled continuation', async ({page}) => {
  const {owner, cpId, threadId, payload} = await prepareLiveTutor(page);
  const phrase = 'The question asks about the original wording of the previous sentence';
  const prefix = 'The question asks about the';
  const messageId = 'fixture-connector-message';
  const packet = packTutorWritingReply({body: phrase, writingAid: {version: 1, revision: 'fixture-revision', signals: [
    {id: 'private-signal-id', sourceId: messageId, role: 'suggested-wording', text: phrase},
  ]}}).body as string;
  await page.addInitScript(owner => {
    localStorage.setItem('lemma.tutor.draft:' + JSON.stringify([owner, 'input', 'preferences']) + ':writing-aid', 'balanced:15');
  }, owner);
  const turn = (body: string, provenance: object, replyId: string, version: number) => ({
    id: 'fixture-turn', threadId, sequence: 1, version, status: 'completed',
    snapshot: {question: 'Explain the current question.', selectedContext: []},
    finalReply: {turnId: 'fixture-turn', messageId: replyId, body, provenance, citations: [], suggestions: []},
  });
  const connector = {kind: 'connector', reportedHost: null, hostVerified: false};
  let currentTurn = turn(packet, connector, messageId, 2);
  await page.route('**/rest/v1/**', route => {
    const request = route.request();
    const path = new URL(request.url()).pathname.split('/rest/v1/')[1];
    if (path === 'rpc/tutor_thread_state') return route.fulfill({json: {head: {threadId, pendingTurnId: null, lastSequence: 1},
      canSubmit: true, canConnect: false, recoveredDrafts: [], turns: [currentTurn]}});
    return route.fulfill({json: liveTutorFixtureResponse(payload, path, request.headers().accept)});
  });
  await page.goto('/lemma/?demo=0&flags=v7Shell,tutorThreads#/p/logic/cp/CP1/tutor');
  const log = page.getByRole('log', {name: 'Conversation', exact: true});
  await expect(log).toContainText(phrase);
  await expect(log).not.toContainText('lemma-writing-v1');
  await expect(log).not.toContainText('private-signal-id');
  const answer = page.getByRole('textbox', {name: 'Your answer', exact: true});
  await answer.focus();
  await page.keyboard.type(prefix);
  await expect(answer).toHaveValue(prefix);
  const proposal = page.getByRole('button', {name: 'Accept continuation original wording of the previous sentence, from tutor', exact: true});
  await expect(proposal).toBeVisible();
  await expect(proposal).toContainText('From tutor');
  await expect(page.locator('.writing-editor-mirror')).toHaveText(phrase);
  await expect.poll(() => ghostClipping(page)).toBeLessThanOrEqual(1);

  // Changing tutor-hint scope invalidates an offer even while it is held.
  const settingsButton = page.getByRole('button', {name: 'Edit answer', exact: true});
  const openSettings = async () => {
    await settingsButton.dispatchEvent('click');
    await page.getByRole('dialog', {name: 'Answer actions', exact: true})
      .getByRole('button', {name: 'Writing assistance', exact: true}).dispatchEvent('click');
    return page.getByRole('dialog', {name: 'Writing assistance', exact: true})
      .getByRole('group', {name: 'Tutor hints', exact: true});
  };
  const original = (await proposal.boundingBox())!;
  await page.mouse.move(original.x + original.width / 2, original.y + original.height / 2);
  await page.mouse.down();
  const hints = await openSettings();
  await expect(hints.getByRole('radio', {name: 'Wording', exact: true})).toBeChecked();
  await hints.getByRole('radio', {name: 'Off', exact: true}).dispatchEvent('click');
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(answer).toHaveValue(prefix);
  await expect(proposal).toHaveCount(0);
  const restored = await openSettings();
  await restored.getByRole('radio', {name: 'Wording', exact: true}).dispatchEvent('click');
  await expect(restored.getByRole('radio', {name: 'Wording', exact: true})).toBeChecked();
  await page.keyboard.press('Escape');
  await answer.fill('');
  await answer.focus();
  await page.keyboard.type(prefix);
  await expect(proposal).toBeVisible();

  // Hold the offered text while a newer reply arrives; release must not apply it.
  const box = (await proposal.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  currentTurn = turn('A newer reply has no suggested wording.', connector, 'newer-message', 3);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(log).toContainText('A newer reply has no suggested wording.');
  await page.mouse.up();
  await expect(answer).toHaveValue(prefix);
  await expect(proposal).toHaveCount(0);

  // Imported text cannot claim connector provenance, even if it carries a valid suffix.
  currentTurn = turn(packet, {kind: 'manual-import', label: 'Imported by you'}, messageId, 4);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(log).toContainText(phrase);
  await expect(proposal).toHaveCount(0);
  await expect(answer).toHaveValue(prefix);

  for (const [index, role] of ['hint', 'proof', 'solution'].entries()) {
    const replyId = `unsafe-${role}-reply`, visible = `${role.toUpperCase()}: ${phrase}`;
    const unsafePacket = packTutorWritingReply({body: visible, writingAid: {version: 1, revision: `unsafe-${role}`, signals: [
      {id: `unsafe-${role}-signal`, sourceId: replyId, role, text: phrase},
    ]}}).body as string;
    currentTurn = turn(unsafePacket, connector, replyId, 5 + index);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(log).toContainText(visible);
    await expect(page.getByRole('button', {name: /from tutor$/})).toHaveCount(0);
    await expect(answer).toHaveValue(prefix);
  }
});

test('a tutor-grounded word identifies its source on a narrow enlarged layout', async ({page}) => {
  await page.setViewportSize({width: 320, height: 640});
  const {owner, threadId, payload} = await prepareLiveTutor(page);
  const messageId = 'fixture-word-reply';
  const phrase = 'Please explain the metaphrasingzz';
  const packet = packTutorWritingReply({body: phrase, writingAid: {version: 1, revision: 'word-revision', signals: [
    {id: 'word-signal', sourceId: messageId, role: 'given', text: phrase},
  ]}}).body as string;
  await page.addInitScript(owner => {
    document.addEventListener('DOMContentLoaded', () => {document.documentElement.style.fontSize = '160%';});
    localStorage.setItem('lemma.tutor.draft:' + JSON.stringify([owner, 'input', 'preferences']) + ':writing-aid', 'balanced:15');
  }, owner);
  await page.route('**/rest/v1/**', route => {
    const request = route.request(), path = new URL(request.url()).pathname.split('/rest/v1/')[1];
    if (path === 'rpc/tutor_thread_state') return route.fulfill({json: {head: {threadId, pendingTurnId: null, lastSequence: 1},
      canSubmit: true, canConnect: false, recoveredDrafts: [], turns: [{id: 'word-turn', threadId, sequence: 1, version: 2,
        status: 'completed', snapshot: {question: 'Explain the notation.', selectedContext: []}, finalReply: {
          turnId: 'word-turn', messageId, body: packet, provenance: {kind: 'connector', reportedHost: null, hostVerified: false},
          citations: [], suggestions: [],
        }}]}});
    return route.fulfill({json: liveTutorFixtureResponse(payload, path, request.headers().accept)});
  });
  await page.goto('/lemma/?demo=0&flags=v7Shell,tutorThreads#/p/logic/cp/CP1/tutor');
  await page.getByRole('button', {name: 'Edit answer', exact: true}).click();
  await page.getByRole('dialog', {name: 'Answer actions', exact: true})
    .getByRole('button', {name: 'Writing assistance', exact: true}).click();
  const hints = page.getByRole('dialog', {name: 'Writing assistance', exact: true})
    .getByRole('group', {name: 'Tutor hints', exact: true});
  await expect(hints.getByRole('radio', {name: 'Wording', exact: true})).toBeChecked();
  await hints.getByRole('radio', {name: 'Wording and notation', exact: true}).check();
  await page.keyboard.press('Escape');
  const answer = page.getByRole('textbox', {name: 'Your answer', exact: true});
  await answer.focus();
  await page.keyboard.type('metaphrasingz');
  const word = wordStrip(page).getByRole('button', {name: 'Insert metaphrasingzz, from tutor', exact: true});
  await expect(word).toBeInViewport({ratio: 1});
  await expect(word.locator('.writing-aid-word-origin')).toHaveText('Tutor');
  const [target, source] = await Promise.all([word.boundingBox(), word.locator('.writing-aid-word-origin').boundingBox()]);
  expect(target!.width).toBeGreaterThanOrEqual(44);
  expect(target!.height).toBeGreaterThanOrEqual(44);
  expect(source!.y + source!.height).toBeLessThanOrEqual(target!.y + target!.height);
  await word.click();
  await expect(answer).toHaveValue('metaphrasingzz ');
  await undoButton(page).click();
  await expect(answer).toHaveValue('metaphrasingz');
});

test('the default demo textarea supports visible edits, refresh, tap and Balanced personalization', async ({page, context}) => {
  await page.goto('/lemma/?demo=1&flags=v7Shell,v6Shell#/p/real-analysis/cp/CP4/tutor');
  await page.getByRole('button', {name: 'Write a question', exact: true}).click();
  const answer = page.getByRole('textbox', {name: 'Your answer', exact: true});
  await expect(answer).toHaveJSProperty('tagName', 'TEXTAREA');
  const type = async (value: string) => {
    await answer.fill('');
    await answer.focus();
    await page.keyboard.type(value);
    await expect(answer).toHaveValue(value);
  };

  await type('We wrote teh');
  await expect(editPreview(page)).toHaveAccessibleName('Replace teh with the');
  const marked = page.locator('.writing-editor-mirror [data-writing-aid-source]');
  await expect(marked).toHaveText('teh');
  await expect(marked).toHaveCSS('text-decoration-line', 'line-through');
  await editPreview(page).click();
  await expect(answer).toHaveValue('We wrote the');
  await undoButton(page).click();
  await expect(answer).toHaveValue('We wrote teh');

  await type('nota');
  await expect(wordStrip(page).getByRole('button', {name: 'Insert notation', exact: true})).toBeVisible();
  const wordsBefore = await offeredWords(page);
  await page.getByRole('button', {name: 'Refresh suggestions', exact: true}).click();
  await expect.poll(async () => (await offeredWords(page)).join('|')).not.toBe(wordsBefore.join('|'));
  await expect(answer).toHaveValue('nota');

  await type('could you restate');
  await expect(ghostPreview(page)).toHaveAccessibleName('Accept continuation the question');
  await expect(page.locator('.writing-editor-mirror')).toHaveText('could you restate the question');
  await expect.poll(() => ghostClipping(page)).toBeLessThanOrEqual(1);
  await page.evaluate(() => history.pushState({}, '', location.href));
  await touchDrag(await context.newCDPSession(page), answer, 90, 0);
  await expect(answer).toHaveValue('could you restate');
  await type('could you restate');
  await ghostPreview(page).click();
  await expect(answer).toHaveValue('could you restate the question');
  await undoButton(page).click();
  await expect(answer).toHaveValue('could you restate');

  await page.getByRole('button', {name: 'Edit answer', exact: true}).click();
  await page.getByRole('dialog', {name: 'Answer actions', exact: true})
    .getByRole('button', {name: 'Writing assistance', exact: true}).click();
  const settings = page.getByRole('dialog', {name: 'Writing assistance', exact: true});
  await expect(settings.getByRole('radio', {name: /^Balanced\b/})).toBeChecked();
  await expect(settings.getByRole('switch', {name: 'Personalize suggestions', exact: true})).toBeChecked();
});

test('a capped textarea shows the continuation at its end and still scrolls normally', async ({page, context}) => {
  await page.goto('/lemma/?demo=1&flags=v7Shell,v6Shell#/p/real-analysis/cp/CP4/tutor');
  await page.getByRole('button', {name: 'Write a question', exact: true}).click();
  const answer = page.getByRole('textbox', {name: 'Your answer', exact: true});
  const draft = 'Explanation '.repeat(18) + '. could you restate';
  await answer.focus();
  await page.keyboard.type(draft);
  await expect(answer).toHaveValue(draft);
  await expect(ghostPreview(page)).toBeVisible();
  await expect.poll(() => ghostClipping(page)).toBeLessThanOrEqual(1);
  await expect.poll(() => answer.evaluate(node => node.scrollTop)).toBeGreaterThan(20);
  const before = await answer.evaluate(node => node.scrollTop);
  await touchDrag(await context.newCDPSession(page), answer, 0, 70);
  await expect.poll(() => answer.evaluate(node => node.scrollTop)).toBeLessThan(before);
  await expect(answer).toHaveValue(draft);
  await expect(undoButton(page)).toHaveCount(0);
});

for (const {width, height, textSize} of [{width: 320, height: 640, textSize: 160}, {width: 844, height: 390, textSize: 100}]) {
  test(`the default textarea shows its full short continuation at ${width}×${height}, ${textSize}% text`, async ({page}) => {
    await page.setViewportSize({width, height});
    await page.addInitScript(size => {
      document.addEventListener('DOMContentLoaded', () => {document.documentElement.style.fontSize = `${size}%`;});
    }, textSize);
    await page.goto('/lemma/?demo=1&flags=v7Shell,v6Shell#/p/real-analysis/cp/CP4/tutor');
    await page.getByRole('button', {name: 'Write a question', exact: true}).click();
    const answer = page.getByRole('textbox', {name: 'Your answer', exact: true});
    await answer.focus();
    await page.keyboard.type('could you restate');
    await expect(answer).toHaveValue('could you restate');
    await expect(ghostPreview(page)).toBeVisible();
    const mirror = page.locator('.writing-editor-mirror');
    await expect(mirror).toHaveText('could you restate the question');
    await expect.poll(() => ghostClipping(page)).toBeLessThanOrEqual(1);
    await expect(answer).toBeInViewport({ratio: 1});
    const board = page.getByRole('group', {name: 'Answer keyboard', exact: true});
    await expect(board).toBeInViewport({ratio: 1});
    await expect(floating(page)).toBeInViewport({ratio: 1});
    const [suggestionBox, inputBox, keyboardBox] = await Promise.all([floating(page).boundingBox(), answer.boundingBox(), board.boundingBox()]);
    const overlaps = (a: NonNullable<typeof suggestionBox>, b: NonNullable<typeof inputBox>) =>
      a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
    expect(overlaps(suggestionBox!, inputBox!)).toBe(false);
    expect(overlaps(suggestionBox!, keyboardBox!)).toBe(false);
  });
}

const layouts = [
  {width: 320, height: 640, textSize: 160, colorScheme: 'light'},
  {width: 390, height: 844, textSize: 100, colorScheme: 'dark'},
  {width: 844, height: 390, textSize: 100, colorScheme: 'light'},
  {width: 1280, height: 800, textSize: 100, colorScheme: 'light'},
  {width: 1280, height: 800, textSize: 100, colorScheme: 'dark'},
] as const;

for (const {width, height, textSize, colorScheme} of layouts) {
  test(`writing targets and conversation remain reachable at ${width}×${height}, ${textSize}% text, ${colorScheme}`, async ({page}) => {
    await page.setViewportSize({width, height});
    await page.emulateMedia({colorScheme, reducedMotion: 'reduce'});
    await page.addInitScript(textSize => {
      document.addEventListener('DOMContentLoaded', () => { document.documentElement.style.fontSize = `${textSize}%`; });
    }, textSize);
    const answer = await openAnswer(page);
    await typeDraft(page, answer, 'nota');
    await expect(wordStrip(page).getByRole('button', {name: 'Insert notation', exact: true})).toBeVisible();
    const header = page.locator('.tutor-header');
    const board = page.getByRole('group', {name: 'Answer keyboard', exact: true});
    const conversation = page.getByRole('log', {name: 'Conversation', exact: true});
    for (const target of [header, board, answer, conversation]) await expect(target).toBeInViewport({ratio: 1});
    const slots = wordStrip(page).getByRole('button');
    const first = await slots.evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().toJSON()));
    expect(first).toHaveLength(3);
    for (const box of first) {
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }

    await typeDraft(page, answer, 'We wrote teh');
    await expect(editPreview(page)).toBeInViewport({ratio: 1});
    await expect(floating(page)).toBeInViewport({ratio: 1});
    const second = await slots.evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().toJSON()));
    expect(second).toEqual(first);
    await expect(dismissButton(page)).toBeInViewport({ratio: 1});
    const [cardBox, boardBox] = await Promise.all([floating(page).boundingBox(), board.boundingBox()]);
    const intersects = (a: NonNullable<typeof cardBox>, b: NonNullable<typeof boardBox>) =>
      a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
    expect(intersects(cardBox!, boardBox!)).toBe(false);
    const caretBox = await page.evaluate(() => {
      const selection = window.getSelection();
      if (!selection?.rangeCount) return null;
      const range = selection.getRangeAt(0).cloneRange();
      range.collapse(false);
      const rect = range.getBoundingClientRect();
      return {x: rect.x, y: rect.y, width: Math.max(1, rect.width), height: rect.height};
    });
    expect(caretBox).not.toBeNull();
    expect(intersects(cardBox!, caretBox!)).toBe(false);
    await expect(page.locator('html')).toHaveAttribute('data-theme', colorScheme === 'light' ? 'graph' : 'graph-night');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    if (width > height && height < 560) {
      const [chatBox, boardBox] = await Promise.all([conversation.boundingBox(), board.boundingBox()]);
      expect(chatBox!.x + chatBox!.width).toBeLessThanOrEqual(boardBox!.x);
      expect(chatBox!.height).toBeGreaterThan(height / 2);
    }
  });
}
