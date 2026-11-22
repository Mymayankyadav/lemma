import {expect, test, type Page} from '@playwright/test';

// N221 (Owner task): equations are inline components that show rendered TeX and open for editing on a tap; the strip
// switches between the ways to write (Keys, Symbol, Write, Scratch) without moving the keyboard.
const url = '/lemma/?demo=1&flags=v7Shell,tutorScratch#/p/real-analysis/cp/CP4/tutor';

async function openAnswer(page: Page) {
  await page.setViewportSize({width: 393, height: 873});
  await page.goto(url);
  await page.getByRole('button', {name: 'Write a question'}).click();
  const answer = page.getByRole('textbox', {name: 'Your answer', exact: true});
  await answer.focus();
  return {answer, keyboard: page.getByRole('group', {name: 'Answer keyboard', exact: true})};
}

test('a typed $…$ becomes a rendered equation that opens for editing and removal', async ({page}) => {
  const {answer} = await openAnswer(page);
  await page.keyboard.type('The circle $x^2+y^2=1$ has radius 1.');
  const chip = answer.getByRole('button', {name: 'Edit equation x^2+y^2=1', exact: true});
  await expect(chip).toBeVisible();
  await expect(chip.locator('.katex')).toBeVisible();
  await expect(page.locator('.composer-preview')).toHaveCount(0);

  await chip.click();
  const sheet = page.getByRole('dialog', {name: 'Equation'});
  const latex = sheet.getByRole('textbox', {name: 'LaTeX'});
  await expect(latex).toHaveValue('x^2+y^2=1');
  await latex.fill('x^2+y^2=4');
  await expect(sheet.locator('.tutor-equation-preview .katex')).toBeVisible();
  await sheet.getByRole('button', {name: 'Done', exact: true}).click();
  const edited = answer.getByRole('button', {name: 'Edit equation x^2+y^2=4', exact: true});
  await expect(edited).toBeVisible();
  // Typing goes on right after the equation, not at the start of the answer.
  await page.keyboard.type(' ok');
  await expect(answer).toContainText('=4 ok has radius 1.');

  // Write by hand reopens it in equation mode, to be written again.
  await edited.click();
  await sheet.getByRole('button', {name: 'Write by hand', exact: true}).click();
  const equationMode = page.getByRole('region', {name: 'Equation mode'});
  await expect(equationMode).toContainText('Write the equation again');
  await equationMode.getByRole('button', {name: 'Keys', exact: true}).click();

  await edited.click();
  await sheet.getByRole('button', {name: 'Remove', exact: true}).click();
  await expect(answer.getByRole('button', {name: /^Edit equation/})).toHaveCount(0);
  await expect(answer).toHaveJSProperty('textContent', 'The circle  ok has radius 1.');
});

test('the equation composer frames its paper with keys, and autoeq reads what is written there', async ({page}) => {
  const {answer, keyboard} = await openAnswer(page);
  const height = (await keyboard.boundingBox())!.height;
  // Gboard's frame: the right end of the strip is Equation mode (Refresh moved to Answer actions).
  const toggle = keyboard.getByRole('button', {name: 'Equation mode', exact: true});
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(keyboard.getByRole('button', {name: 'Refresh suggestions', exact: true})).toHaveCount(0);
  await toggle.click();
  const panel = page.getByRole('region', {name: 'Equation mode'});
  await expect(panel).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  const suggestions = panel.getByRole('group', {name: 'Equation suggestions'});
  await expect(suggestions).toContainText('Type or draw an equation');
  // Only the keys' place changes, and the band under it gives its room back.
  expect((await keyboard.boundingBox())!.height).toBeLessThanOrEqual(height + 1);
  await expect(keyboard.getByRole('button', {name: 'Hide keyboard', exact: true})).toBeHidden();
  // Operations along the top, variables down the left, digits on the right, symbols along the bottom.
  const [operations, variables, digits, symbols, paper] = await Promise.all(['Operations', 'Variables', 'Digits', 'Symbols']
    .map(name => panel.getByRole('group', {name, exact: true}).boundingBox())
    .concat(panel.locator('.tutor-equation-paper').boundingBox()));
  expect(operations!.y + operations!.height).toBeLessThanOrEqual(paper!.y);
  expect(variables!.x + variables!.width).toBeLessThanOrEqual(paper!.x);
  expect(digits!.x).toBeGreaterThanOrEqual(paper!.x + paper!.width);
  expect(symbols!.y).toBeGreaterThanOrEqual(paper!.y + paper!.height);
  // The paper is larger than its window and scrolls both ways.
  expect(await panel.locator('.tutor-equation-paper').evaluate(node =>
    [node.scrollWidth > node.clientWidth, node.scrollHeight > node.clientHeight])).toEqual([true, true]);

  // Written as said, x1 + y1 = 1; autoeq offers its readings, subscripts first with no other context.
  for (const name of ['x', '1', '+', 'y', '1', 'Equals', '1']) await panel.getByRole('button', {name, exact: true}).click();
  const composition = panel.getByRole('status', {name: 'Composition'});
  await expect(composition).toHaveText('x1 + y1 = 1');
  const readings = suggestions.getByRole('button');
  await expect(readings.first()).toHaveAccessibleName('Insert equation x_{1}+y_{1}=1');
  await expect(suggestions.getByRole('button', {name: 'Insert equation x^{1}+y^{1}=1', exact: true})).toBeVisible();
  await expect(suggestions.getByRole('button', {name: 'Insert equation 1x+1y=1', exact: true})).toBeVisible();
  await expect(suggestions.getByRole('button', {name: 'Insert equation x1+y1=1', exact: true})).toBeVisible();
  // Delete takes back one written token; with nothing composed it deletes in the answer.
  await panel.getByRole('button', {name: 'Delete', exact: true}).click();
  await expect(composition).toHaveText('x1 + y1 =');
  await panel.getByRole('button', {name: '1', exact: true}).click();
  await panel.getByRole('button', {name: 'Insert equation', exact: true}).click();
  await expect(answer.getByRole('button', {name: 'Edit equation x_{1}+y_{1}=1', exact: true})).toBeVisible();
  await expect(composition).not.toContainText('x1');

  // The keys can be hidden: the composition and paper then fill the composer.
  const narrow = (await panel.locator('.tutor-equation-paper').boundingBox())!.width;
  await panel.getByRole('button', {name: 'Hide equation keys', exact: true}).click();
  for (const name of ['Operations', 'Variables', 'Digits', 'Symbols']) await expect(panel.getByRole('group', {name, exact: true})).toHaveCount(0);
  expect((await panel.locator('.tutor-equation-paper').boundingBox())!.width).toBeGreaterThan(narrow * 1.5);
  await panel.getByRole('button', {name: 'Show equation keys', exact: true}).click();
  await expect(panel.getByRole('group', {name: 'Digits', exact: true})).toBeVisible();

  await panel.getByRole('button', {name: 'Keys', exact: true}).click();
  await expect(keyboard.getByRole('button', {name: 'q', exact: true})).toBeVisible();
  expect((await keyboard.boundingBox())!.height).toBeCloseTo(height, 0);
});

test('the words before the caret order autoeq\'s readings', async ({page}) => {
  const {keyboard} = await openAnswer(page);
  await page.keyboard.type('The circle ');
  await keyboard.getByRole('button', {name: 'Equation mode', exact: true}).click();
  const panel = page.getByRole('region', {name: 'Equation mode'});
  for (const name of ['x', '2', '+', 'y', '2', 'Equals', '1']) await panel.getByRole('button', {name, exact: true}).click();
  await expect(panel.getByRole('group', {name: 'Equation suggestions'}).getByRole('button').first())
    .toHaveAccessibleName('Insert equation x^{2}+y^{2}=1');
});

test('the composer\'s pencil opens equation mode on a tap and the scratch pad on a double tap', async ({page}) => {
  const {keyboard} = await openAnswer(page);
  const pencil = page.getByRole('button', {name: 'Write by hand', exact: true});
  await pencil.click();
  await expect(page.getByRole('region', {name: 'Equation mode'})).toBeVisible();
  await page.waitForTimeout(400);
  await pencil.click();
  await expect(keyboard.getByRole('button', {name: 'q', exact: true})).toBeVisible();
  await page.waitForTimeout(400);
  await pencil.dblclick();
  const pad = page.getByRole('region', {name: 'Scratch pad'});
  await expect(pad).toBeVisible();
  // One row of tools, the way back to the keys at its left end; the rest is paper that scrolls both ways.
  const tools = pad.getByRole('group', {name: 'Drawing tools'}).getByRole('button');
  await expect(tools.first()).toHaveAccessibleName('Keys');
  const rows = new Set(await tools.evaluateAll(nodes => nodes.map(node => Math.round(node.getBoundingClientRect().top))));
  expect(rows.size).toBe(1);
  const scroll = await pad.getByRole('region', {name: 'Drawing paper'}).evaluate(node => [node.scrollWidth > node.clientWidth, node.scrollHeight > node.clientHeight]);
  expect(scroll).toEqual([true, true]);
  await tools.first().click();
  await expect(page.getByRole('group', {name: 'Answer keyboard', exact: true}).getByRole('button', {name: 'q', exact: true})).toBeVisible();
});

async function writeOnPaper(page: Page, strokes: number[][][]) {
  // Strokes are given in a 200 × 100 frame, scaled into the paper's window.
  const box = (await page.locator('.tutor-equation-paper').boundingBox())!;
  const at = ([x, y]: number[]) => [box.x + 8 + x / 200 * (box.width - 16), box.y + 6 + y / 100 * (box.height - 12)] as const;
  for (const [first, ...rest] of strokes) {
    await page.mouse.move(...at(first));
    await page.mouse.down();
    for (const point of rest) await page.mouse.move(...at(point), {steps: 6});
    await page.mouse.up();
  }
}

test('Equation mode offers its one-time download in the strip and says so when it fails', async ({page, context}) => {
  const requests: string[] = [];
  await context.route('https://huggingface.co/**', route => {
    requests.push(route.request().url());
    return route.fulfill({status: 503, body: 'unavailable', headers: {'access-control-allow-origin': '*'}});
  });
  const {keyboard} = await openAnswer(page);
  await keyboard.getByRole('button', {name: 'Equation mode', exact: true}).click();
  await writeOnPaper(page, [[[30, 10], [30, 90]], [[60, 50], [110, 50]], [[85, 25], [85, 75]], [[150, 10], [150, 90]]]);
  const download = page.getByRole('button', {name: 'Read equations on this device (one-time download, 118 MB)', exact: true});
  await expect(download).toBeVisible();
  expect(requests).toEqual([]);
  await download.click();
  const suggestions = page.getByRole('group', {name: 'Equation suggestions'});
  await expect(suggestions.getByRole('alert')).toContainText('could not be downloaded (503)');
  await expect(suggestions.getByRole('button', {name: 'Try again'})).toBeVisible();
  await expect(page.getByRole('img', {name: 'Write an equation'}).locator('path')).toHaveCount(4);
});

test('with Draw single symbols on, a drawn symbol joins the composition, and Search symbol hands the ink to Draw symbol', async ({page}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({width: 393, height: 873});
  await page.goto('/lemma/?demo=1&flags=v7Shell,tutorScratch#/settings?section=tutor');
  await page.getByRole('switch', {name: 'Draw single symbols', exact: true}).click();
  await page.goto(url);
  await page.reload();
  await page.getByRole('button', {name: 'Write a question'}).click();
  const answer = page.getByRole('textbox', {name: 'Your answer', exact: true});
  await answer.focus();
  await page.getByRole('group', {name: 'Answer keyboard', exact: true}).getByRole('button', {name: 'Equation mode', exact: true}).click();
  const panel = page.getByRole('region', {name: 'Equation mode'});
  await panel.getByRole('button', {name: 'Hide equation keys', exact: true}).click();
  const forAll = [[[20, 10], [50, 90], [80, 10]], [[32, 45], [68, 45]]];
  await writeOnPaper(page, forAll);
  const suggestions = panel.getByRole('group', {name: 'Equation suggestions'});
  const add = suggestions.getByRole('button', {name: 'Add symbol For all', exact: true});
  await expect(add).toBeEnabled({timeout: 25_000});
  await add.click();
  // The paper is cleared and the symbol is part of the composition, inserted as an equation.
  await expect(page.getByRole('img', {name: 'Write an equation'}).locator('path')).toHaveCount(0);
  await expect(panel.getByRole('status', {name: 'Composition'})).toHaveText('∀');
  await suggestions.getByRole('button', {name: 'Insert equation \\forall', exact: true}).click();
  await expect(answer.getByRole('button', {name: 'Edit equation \\forall', exact: true})).toBeVisible();

  // Search symbol: the same ink in Draw symbol, whose choice comes back to the composition.
  await writeOnPaper(page, forAll);
  await panel.getByRole('button', {name: 'Search symbol', exact: true}).click();
  const recognition = page.getByRole('region', {name: 'Symbol recognition'});
  await expect(recognition).toBeVisible();
  const match = recognition.getByRole('button', {name: 'Matches For all', exact: true});
  await expect(match).toBeEnabled({timeout: 25_000});
  await match.click();
  await expect(page.getByRole('region', {name: 'Equation mode'}).getByRole('status', {name: 'Composition'})).toHaveText('∀');
});
