import {expect, test, type Locator, type Page} from '@playwright/test';
import {liveTutorFixtureResponse, prepareLiveTutor} from './helpers/live-tutor';

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

const wordStrip = (page: Page) => page.getByRole('group', {name: 'Word suggestions', exact: true});
const editPreview = (page: Page) => page.locator('[data-writing-aid-edit]');
const ghostPreview = (page: Page) => page.locator('[data-writing-aid-ghost]');
const moreButton = (page: Page) => page.getByRole('button', {name: 'More writing suggestions', exact: true});
const undoButton = (page: Page) => page.getByRole('button', {name: 'Undo suggestion', exact: true});

async function openAlternatives(page: Page) {
  await moreButton(page).click();
  const choices = page.getByRole('group', {name: 'Writing suggestions', exact: true});
  await expect(choices).toBeVisible();
  return choices;
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

test('spelling stays literal as the learner types and offers visible replace, keep and undo actions', async ({page}) => {
  const answer = await openAnswer(page);
  await typeDraft(page, answer, 'We wrote teh');
  const replacement = editPreview(page);
  await expect(replacement).toHaveAccessibleName('Replace teh with the');
  await expect(replacement.locator('del')).toHaveText('teh');
  await page.getByRole('group', {name: 'Answer keyboard', exact: true}).getByRole('button', {name: 'Space', exact: true}).click();
  await expect(answer).toHaveJSProperty('textContent', 'We wrote teh ');
  await expect(replacement).toHaveAccessibleName('Replace teh with the');
  await replacement.click();
  await expect(answer).toHaveJSProperty('textContent', 'We wrote the ');
  await undoButton(page).click();
  await expect(answer).toHaveJSProperty('textContent', 'We wrote teh ');

  await typeDraft(page, answer, 'We wrote teh');
  await expect(replacement).toBeVisible();
  const choices = await openAlternatives(page);
  await expect(choices.getByRole('button', {name: 'teh the', exact: true})).toBeVisible();
  await expect(answer).toHaveJSProperty('textContent', 'We wrote teh');
  await choices.getByRole('button', {name: 'Keep what I typed', exact: true}).click();
  await expect(choices).toHaveCount(0);
  await expect(replacement).toHaveCount(0);
  await expect(answer).toBeFocused();
  await page.keyboard.type(' today');
  await expect(answer).toHaveJSProperty('textContent', 'We wrote teh today');
  await expect(replacement).toHaveCount(0);
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
  await typeDraft(page, answer, 'We wrote teh');
  await expect(editPreview(page)).toBeVisible();
  const ime = await context.newCDPSession(page);
  await ime.send('Input.imeSetComposition', {text: '証', selectionStart: 1, selectionEnd: 1});
  await expect(answer).toHaveJSProperty('textContent', 'We wrote teh証');
  await expect(editPreview(page)).toHaveCount(0);
  await expect(ghostPreview(page)).toHaveCount(0);
  await expect(enabledWords).toHaveCount(0);
  await ime.send('Input.imeSetComposition', {text: '証明', selectionStart: 2, selectionEnd: 2});
  await ime.send('Input.insertText', {text: '証明'});
  await expect(answer).toHaveJSProperty('textContent', 'We wrote teh証明');
  await answer.press('Control+z');
  await expect(answer).toHaveJSProperty('textContent', 'We wrote teh');
});

test('the writing switches and full Off setting persist while manual typing and math stay usable', async ({page}) => {
  const answer = await openAnswer(page);
  await typeDraft(page, answer, 'We wrote teh');
  await expect(editPreview(page)).toBeVisible();
  const choices = await openAlternatives(page);
  await choices.getByRole('button', {name: 'Writing assistance', exact: true}).click();
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
  await settings.getByRole('radio', {name: /^Off\b/}).check();
  await expect(spelling).toBeDisabled();
  await page.keyboard.press('Escape');
  await answer.fill('');
  await page.reload();
  await page.getByRole('button', {name: 'Write a question', exact: true}).click();
  await typeDraft(page, answer, 'Let eps');
  await expect(editPreview(page)).toHaveCount(0);
  await expect(wordStrip(page).locator('button:enabled')).toHaveCount(0);
  await expect(page.locator('[data-writing-aid-review]')).toContainText('Writing aid off');
  await answer.press('Tab');
  await expect(page.getByRole('button', {name: 'Edit answer', exact: true})).toBeFocused();
  await page.getByRole('group', {name: 'Answer keyboard', exact: true}).getByRole('button', {name: 'Space', exact: true}).click();
  await page.getByRole('group', {name: 'Quick math symbols'}).getByRole('button', {name: '∈', exact: true}).click();
  await expect(answer).toHaveJSProperty('textContent', 'Let eps ∈');

  await page.goto(routes + '/settings?section=tutor');
  await expect(page.getByRole('radio', {name: /^Off\b/})).toBeChecked();
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
});

const layouts = [
  {width: 320, height: 640, textSize: 160, colorScheme: 'light'},
  {width: 390, height: 844, textSize: 100, colorScheme: 'dark'},
  {width: 844, height: 390, textSize: 100, colorScheme: 'light'},
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
    for (const target of [header, board, answer, conversation, moreButton(page)]) await expect(target).toBeInViewport({ratio: 1});
    const slots = wordStrip(page).getByRole('button');
    const first = await slots.evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().toJSON()));
    expect(first).toHaveLength(3);
    for (const box of first) {
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }

    await typeDraft(page, answer, 'We wrote teh');
    await expect(editPreview(page)).toBeInViewport({ratio: 1});
    const second = await slots.evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().toJSON()));
    expect(second).toEqual(first);
    const alternatives = await openAlternatives(page);
    await expect(alternatives).toBeInViewport({ratio: 1});
    await expect(alternatives.getByRole('button', {name: 'Keep what I typed', exact: true})).toBeInViewport({ratio: 1});
    await alternatives.getByRole('button', {name: 'Close suggestions', exact: true}).click();
    await expect(alternatives).toHaveCount(0);
    await expect(page.locator('html')).toHaveAttribute('data-theme', colorScheme === 'light' ? 'graph' : 'graph-night');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    if (width > height && height < 560) {
      const [chatBox, boardBox] = await Promise.all([conversation.boundingBox(), board.boundingBox()]);
      expect(chatBox!.x + chatBox!.width).toBeLessThanOrEqual(boardBox!.x);
      expect(chatBox!.height).toBeGreaterThan(height / 2);
    }
  });
}
