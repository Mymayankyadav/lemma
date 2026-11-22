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

test('Equation mode takes only the keys\' place: paper, the strip\'s frame and a row of equation keys', async ({page}) => {
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
  await expect(panel.getByRole('group', {name: 'Equation suggestions'})).toContainText('Write a symbol or an equation');
  expect((await keyboard.boundingBox())!.height).toBeCloseTo(height, 0);
  // The paper is larger than the panel and scrolls both ways.
  const scroll = await panel.locator('.tutor-equation-paper').evaluate(node =>
    [node.scrollWidth > node.clientWidth, node.scrollHeight > node.clientHeight]);
  expect(scroll).toEqual([true, true]);
  const keys = panel.getByRole('group', {name: 'Equation keys'});
  for (const name of ['x', '=', 'y']) await keys.getByRole('button', {name, exact: true}).click();
  await expect(answer).toHaveJSProperty('textContent', 'x = y');
  await panel.getByRole('button', {name: 'Delete', exact: true}).click();
  await expect(answer).toHaveJSProperty('textContent', 'x = ');
  await panel.getByRole('button', {name: 'Keys', exact: true}).click();
  await expect(keyboard.getByRole('button', {name: 'q', exact: true})).toBeVisible();
  expect((await keyboard.boundingBox())!.height).toBeCloseTo(height, 0);
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
  const box = (await page.locator('.tutor-equation-paper').boundingBox())!;
  for (const [first, ...rest] of strokes) {
    await page.mouse.move(box.x + first[0], box.y + first[1]);
    await page.mouse.down();
    for (const [x, y] of rest) await page.mouse.move(box.x + x, box.y + y, {steps: 6});
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
  await writeOnPaper(page, [[[30, 30], [30, 100]], [[60, 65], [110, 65]], [[85, 40], [85, 90]], [[140, 30], [140, 100]]]);
  const download = page.getByRole('button', {name: 'Read equations on this device (one-time download, 118 MB)', exact: true});
  await expect(download).toBeVisible();
  expect(requests).toEqual([]);
  await download.click();
  const suggestions = page.getByRole('group', {name: 'Equation suggestions'});
  await expect(suggestions.getByRole('alert')).toContainText('could not be downloaded (503)');
  await expect(suggestions.getByRole('button', {name: 'Try again'})).toBeVisible();
  await expect(page.getByRole('img', {name: 'Write an equation'}).locator('path')).toHaveCount(4);
});

test('with Draw single symbols on, the same drawing is offered as a symbol too', async ({page}) => {
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
  await writeOnPaper(page, [[[40, 30], [70, 100], [100, 30]], [[52, 62], [88, 62]]]);
  const forAll = page.getByRole('group', {name: 'Equation suggestions'}).getByRole('button', {name: 'Insert symbol For all', exact: true});
  await expect(forAll).toBeEnabled({timeout: 25_000});
  await forAll.click();
  await expect(answer).toHaveJSProperty('textContent', '∀');
  // The paper is cleared for the next symbol, and equation mode stays open.
  await expect(page.getByRole('img', {name: 'Write an equation'}).locator('path')).toHaveCount(0);
  await expect(page.getByRole('region', {name: 'Equation mode'})).toBeVisible();
});
