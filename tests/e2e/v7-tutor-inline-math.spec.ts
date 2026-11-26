import {expect, test, type Page} from '@playwright/test';

// N221 and N223 (Owner tasks): equations are inline components that show rendered TeX and open for editing on a tap; one
// strip suggests words, symbols and readings of a typed equation; equation mode is paper for writing by hand.
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

test('one strip: a typed equation is read by autoeq and goes in as an equation, ranked by the words before it', async ({page}) => {
  const {answer, keyboard} = await openAnswer(page);
  await page.keyboard.type('Let x1 + x2 = 4');
  const readings = keyboard.getByRole('group', {name: 'Equation suggestions', exact: true});
  // Best in the middle, as Gboard: subscripts first with no other context, then powers, then coefficients.
  await expect(readings.getByRole('button').nth(1)).toHaveAccessibleName('Insert equation x_{1}+x_{2}=4');
  await expect(readings.getByRole('button', {name: 'Insert equation x^{1}+x^{2}=4', exact: true})).toBeVisible();
  // Review of #1830: the equation as written keeps the third slot.
  await expect(readings.getByRole('button', {name: 'Insert equation x1+x2=4', exact: true})).toBeVisible();
  await expect(keyboard.getByRole('group', {name: 'Word suggestions', exact: true})).toHaveCount(0);
  await readings.getByRole('button', {name: 'Insert equation x_{1}+x_{2}=4', exact: true}).click();
  await expect(answer.getByRole('button', {name: 'Edit equation x_{1}+x_{2}=4', exact: true})).toBeVisible();
  await expect(answer).toContainText('Let ');
  await expect(readings).toHaveCount(0);
});

test('the words before a typed equation order its readings', async ({page}) => {
  const {keyboard} = await openAnswer(page);
  await page.keyboard.type('The circle x2+y2=1');
  await expect(keyboard.getByRole('group', {name: 'Equation suggestions', exact: true}).getByRole('button').nth(1))
    .toHaveAccessibleName('Insert equation x^{2}+y^{2}=1');
});

test('symbol names can take the slots while idle prose keeps the strip clear of symbols', async ({page}) => {
  const {keyboard} = await openAnswer(page);
  const symbols = keyboard.getByRole('group', {name: 'Symbol suggestions', exact: true});
  const quick = keyboard.getByRole('group', {name: 'Quick math symbols', exact: true});
  await expect(quick).toHaveCount(0);
  await page.keyboard.type('For eps');
  await expect(symbols.getByRole('button', {name: 'Insert ε (Epsilon)', exact: true})).toBeVisible();
  await expect(quick).toHaveCount(0);
  await expect(keyboard.getByRole('button', {name: 'Scratch', exact: true})).toBeVisible();
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await page.keyboard.type('x ');
  // At a word boundary with next words, the words have the slots and ∀ ∈ ⇒ are not squeezed beside them.
  await expect(quick).toHaveCount(0);
});

test('equation mode is paper in the keys\' place: symbols as they are drawn, the equation on Read', async ({page, context}) => {
  const requests: string[] = [];
  await context.route('https://huggingface.co/**', route => {
    requests.push(route.request().url());
    return route.fulfill({status: 503, body: 'unavailable', headers: {'access-control-allow-origin': '*'}});
  });
  const {keyboard} = await openAnswer(page);
  const height = (await keyboard.boundingBox())!.height;
  const toggle = keyboard.getByRole('button', {name: 'Equation mode', exact: true});
  await expect(keyboard.getByRole('button', {name: 'Refresh suggestions', exact: true})).toHaveCount(0);
  await toggle.click();
  const panel = page.getByRole('region', {name: 'Equation mode'});
  await expect(panel).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(panel.getByRole('group', {name: 'Equation suggestions'})).toContainText('Write a symbol or an equation');
  // No keys around the paper: it takes the keys' place, and the band under it gives its room back.
  expect((await keyboard.boundingBox())!.height).toBeLessThanOrEqual(height + 1);
  await expect(panel.getByRole('button', {name: 'x', exact: true})).toHaveCount(0);
  const paper = panel.locator('.tutor-equation-paper');
  expect((await paper.boundingBox())!.height).toBeGreaterThan(height * 0.55);
  expect(await paper.evaluate(node => [node.scrollWidth > node.clientWidth, node.scrollHeight > node.clientHeight])).toEqual([true, true]);
  // Writing never starts a reading by itself; Read asks before the one-time download, and says when it fails.
  const read = panel.getByRole('button', {name: 'Read equation', exact: true});
  await expect(read).toBeDisabled();
  await writeOnPaper(page, [[[30, 10], [30, 90]], [[60, 50], [110, 50]], [[85, 25], [85, 75]], [[150, 10], [150, 90]]]);
  await page.waitForTimeout(1000);
  expect(requests).toEqual([]);
  await expect(panel.getByRole('group', {name: 'Equation suggestions'}).getByRole('button', {name: /^Read equations on this device/})).toHaveCount(0);
  await read.click();
  const download = panel.getByRole('button', {name: 'Read equations on this device (one-time download, 118 MB)', exact: true});
  await expect(download).toBeVisible();
  expect(requests).toEqual([]);
  await download.click();
  const suggestions = panel.getByRole('group', {name: 'Equation suggestions'});
  await expect(suggestions.getByRole('alert')).toContainText('could not be downloaded (503)');
  await expect(suggestions.getByRole('button', {name: 'Try again'})).toBeVisible();
  await expect(page.getByRole('img', {name: 'Write an equation'}).locator('path')).toHaveCount(4);
  await panel.getByRole('button', {name: 'Keys', exact: true}).click();
  await expect(keyboard.getByRole('button', {name: 'q', exact: true})).toBeVisible();
  expect((await keyboard.boundingBox())!.height).toBeCloseTo(height, 0);
});

test('the strip\'s pencil opens the scratch pad, the answer box has no pencil, and the pad\'s tools are one row', async ({page}) => {
  // N227 (Owner): the scratch pad is wired to the pencil in the suggestion strip, and the pencil left the answer box.
  await openAnswer(page);
  await expect(page.locator('.composer').getByRole('button', {name: 'Scratch', exact: true})).toHaveCount(0);
  const keyboard = page.getByRole('group', {name: 'Answer keyboard', exact: true});
  const pencil = keyboard.getByRole('button', {name: 'Scratch', exact: true});
  const [pencilBox, stripBox] = [(await pencil.boundingBox())!, (await keyboard.locator('.strip').boundingBox())!];
  expect(pencilBox.x - stripBox.x).toBeLessThan(10);
  await expect(keyboard.getByRole('button', {name: 'Draw symbol', exact: true})).toHaveCount(0);
  await pencil.click();
  const pad = page.getByRole('region', {name: 'Scratch pad'});
  await expect(pad).toBeVisible();
  await expect(page.getByRole('region', {name: 'Symbol recognition'})).toHaveCount(0);
  const tools = pad.getByRole('group', {name: 'Drawing tools'}).getByRole('button');
  await expect(tools.first()).toHaveAccessibleName('Keys');
  const rows = new Set(await tools.evaluateAll(nodes => nodes.map(node => Math.round(node.getBoundingClientRect().top))));
  expect(rows.size).toBe(1);
  expect(await pad.getByRole('region', {name: 'Drawing paper'}).evaluate(node => [node.scrollWidth > node.clientWidth, node.scrollHeight > node.clientHeight]))
    .toEqual([true, true]);
  await tools.first().click();
  await expect(pad).toHaveCount(0);
  await expect(keyboard.getByRole('button', {name: 'q', exact: true})).toBeVisible();
});

test('equation mode: the paper takes the whole place, its tools float and step aside while drawing, and it grows', async ({page}) => {
  // N227 (Owner: "these options waste the row"; "expandable as in the scratch pad").
  const {keyboard} = await openAnswer(page);
  await keyboard.getByRole('button', {name: 'Equation mode', exact: true}).click();
  const panel = page.getByRole('region', {name: 'Equation mode'});
  const paper = panel.locator('.tutor-equation-paper');
  const tools = panel.getByRole('group', {name: 'Paper tools'});
  const [paperBox, toolsBox] = [(await paper.boundingBox())!, (await tools.boundingBox())!];
  // Floating over the paper's corner, not a row above it.
  expect(toolsBox.y).toBeGreaterThanOrEqual(paperBox.y);
  expect(toolsBox.x + toolsBox.width).toBeLessThanOrEqual(paperBox.x + paperBox.width);
  // While a stroke is drawn the tools step aside; they return when it ends.
  const start = [paperBox.x + 30, paperBox.y + paperBox.height - 30];
  await page.mouse.move(start[0], start[1]);
  await page.mouse.down();
  await page.mouse.move(start[0] + 60, start[1] - 10, {steps: 4});
  await expect(tools).toHaveCSS('opacity', '0');
  await page.mouse.up();
  await expect(tools).toHaveCSS('opacity', '1');
  await expect(panel.getByRole('button', {name: 'Read equation', exact: true})).toBeEnabled();
  // The grip on the paper's top edge drags it taller; the keyboard grows with it.
  const before = (await keyboard.boundingBox())!.height;
  const grip = panel.getByRole('separator', {name: 'Resize writing paper'});
  const gripBox = (await grip.boundingBox())!;
  await page.mouse.move(gripBox.x + gripBox.width / 2, gripBox.y + gripBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(gripBox.x + gripBox.width / 2, gripBox.y + gripBox.height / 2 - 80, {steps: 6});
  await page.mouse.up();
  await expect.poll(async () => (await paper.boundingBox())!.height).toBeGreaterThan(paperBox.height + 60);
  expect((await keyboard.boundingBox())!.height).toBeGreaterThan(before + 60);
  await grip.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect.poll(async () => (await paper.boundingBox())!.height).toBeLessThan(paperBox.height + 20);
});

test('two fingers scroll the equation paper both ways; three scroll the chat', async ({page}) => {
  // N227 (Owner: "three finger scroll is not working in it, add two finger scroll in eq composer").
  const {keyboard} = await openAnswer(page);
  await keyboard.getByRole('button', {name: 'Equation mode', exact: true}).click();
  const paper = page.getByRole('region', {name: 'Equation mode'}).locator('.tutor-equation-paper');
  const box = (await paper.boundingBox())!;
  const client = await page.context().newCDPSession(page);
  const swipe = async (fingers: number, dx: number, dy: number) => {
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    const points = (ox: number, oy: number) => Array.from({length: fingers}, (_, i) => ({x: cx - 40 + i * 40 + ox, y: cy + oy, id: i}));
    await client.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: points(0, 0)});
    for (let step = 1; step <= 6; step++) {
      await client.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: points(dx * step / 6, dy * step / 6)});
    }
    await client.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
  };
  await swipe(2, -90, -50);
  await expect.poll(() => paper.evaluate(node => [node.scrollLeft > 30, node.scrollTop > 20])).toEqual([true, true]);
  // No stroke was drawn by the fingers.
  await expect(page.getByRole('img', {name: 'Write an equation'}).locator('path')).toHaveCount(0);
  const chat = page.getByRole('log', {name: 'Conversation'});
  const [scrollLeft, scrollTop] = await paper.evaluate(node => [node.scrollLeft, node.scrollTop]);
  // Room to scroll: the demo conversation is short.
  await chat.evaluate(node => {const room = document.createElement('div'); room.style.height = '1200px'; room.style.flex = 'none'; node.prepend(room); node.scrollTop = node.scrollHeight;});
  const chatBefore = await chat.evaluate(node => node.scrollTop);
  await swipe(3, 0, 60);
  await expect.poll(() => chat.evaluate(node => node.scrollTop)).toBeLessThan(chatBefore);
  expect(await paper.evaluate(node => [node.scrollLeft, node.scrollTop])).toEqual([scrollLeft, scrollTop]);
});

async function writeOnPaper(page: Page, strokes: number[][][]) {
  // Strokes are given in a 200 × 100 frame, scaled into the paper's window left of its floating tools (top right).
  const box = (await page.locator('.tutor-equation-paper').boundingBox())!;
  const at = ([x, y]: number[]) => [box.x + 8 + x / 200 * (box.width * .6 - 16), box.y + 6 + y / 100 * (box.height - 12)] as const;
  for (const [first, ...rest] of strokes) {
    await page.mouse.move(...at(first));
    await page.mouse.down();
    for (const point of rest) await page.mouse.move(...at(point), {steps: 6});
    await page.mouse.up();
  }
}

test('with Draw single symbols on, a symbol drawn in equation mode goes into the answer as an equation', async ({page}) => {
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
  await writeOnPaper(page, [[[20, 10], [50, 90], [80, 10]], [[32, 45], [68, 45]]]);
  const forAll = panel.getByRole('group', {name: 'Equation suggestions'}).getByRole('button', {name: 'Insert symbol For all', exact: true});
  await expect(forAll).toBeEnabled({timeout: 25_000});
  await forAll.click();
  await expect(answer.getByRole('button', {name: 'Edit equation \\forall', exact: true})).toBeVisible();
  // The paper is cleared for the next one, and equation mode stays open.
  await expect(page.getByRole('img', {name: 'Write an equation'}).locator('path')).toHaveCount(0);
  await expect(panel).toBeVisible();
});

test('drawing more while the reader downloads returns Read, and the next Read continues the download', async ({page, context}) => {
  // Review of #1830: the download used to leave the strip "downloading" and Read disabled once new ink made it stale.
  let requests = 0;
  await context.route('https://huggingface.co/**', () => {requests++;});   // never answered: the download hangs
  const {keyboard} = await openAnswer(page);
  await keyboard.getByRole('button', {name: 'Equation mode', exact: true}).click();
  const panel = page.getByRole('region', {name: 'Equation mode'});
  await writeOnPaper(page, [[[30, 10], [30, 90]], [[60, 50], [110, 50]]]);
  const read = panel.getByRole('button', {name: 'Read equation', exact: true});
  await read.click();
  await panel.getByRole('button', {name: 'Read equations on this device (one-time download, 118 MB)', exact: true}).click();
  await expect(panel.getByRole('progressbar', {name: 'Equation reader download'})).toBeVisible();
  await expect(read).toBeDisabled();
  await writeOnPaper(page, [[[150, 10], [150, 90]]]);
  await expect(panel.getByRole('progressbar', {name: 'Equation reader download'})).toHaveCount(0);
  await expect(read).toBeEnabled();
  // The learner already agreed: Read goes straight back to the download instead of asking again.
  await read.click();
  await expect(panel.getByRole('progressbar', {name: 'Equation reader download'})).toBeVisible();
  await expect(panel.getByRole('button', {name: /^Read equations on this device/})).toHaveCount(0);
  expect(requests).toBeGreaterThan(0);
});

test('a symbol written by hand for an equation in the answer replaces it as an equation', async ({page}) => {
  // Review of #1830: a handwritten symbol used to go in as a glyph, leaving the equation being rewritten unchanged.
  test.setTimeout(60_000);
  await page.setViewportSize({width: 393, height: 873});
  await page.goto('/lemma/?demo=1&flags=v7Shell,tutorScratch#/settings?section=tutor');
  await page.getByRole('switch', {name: 'Draw single symbols', exact: true}).click();
  await page.goto(url);
  await page.reload();
  await page.getByRole('button', {name: 'Write a question'}).click();
  const answer = page.getByRole('textbox', {name: 'Your answer', exact: true});
  await answer.focus();
  await page.keyboard.type('Take $y$ here');
  await answer.getByRole('button', {name: 'Edit equation y', exact: true}).click();
  await page.getByRole('dialog', {name: 'Equation'}).getByRole('button', {name: 'Write by hand', exact: true}).click();
  const panel = page.getByRole('region', {name: 'Equation mode'});
  await expect(panel).toContainText('Write the equation again');
  await writeOnPaper(page, [[[20, 10], [50, 90], [80, 10]], [[32, 45], [68, 45]]]);
  const forAll = panel.getByRole('group', {name: 'Equation suggestions'}).getByRole('button', {name: 'Insert symbol For all', exact: true});
  await expect(forAll).toBeEnabled({timeout: 25_000});
  await forAll.click();
  await expect(answer.getByRole('button', {name: 'Edit equation \\forall', exact: true})).toBeVisible();
  await expect(answer.getByRole('button', {name: 'Edit equation y', exact: true})).toHaveCount(0);
  await expect(answer).toContainText('Take');
  await expect(answer).toContainText('here');
});

test('the keys follow the answer: a touch on the chat closes them, unless the keyboard icon keeps them up', async ({page}) => {
  // N227 (Owner: "auto close and open the keyboard when input is not selected or selected respectively"; "an icon of
  // keyboard … keep the keyboard on and input selected as this allows user to scroll through the chat while typing").
  const {answer, keyboard} = await openAnswer(page);
  await expect(keyboard).toBeVisible();
  const chat = page.getByRole('log', {name: 'Conversation'});
  await chat.click({position: {x: 12, y: 12}});
  await expect(keyboard).toHaveCount(0);
  await answer.click();
  await expect(keyboard).toBeVisible();

  const keep = page.getByRole('button', {name: 'Keep keyboard open', exact: true});
  await keep.click();
  await expect(keep).toHaveAttribute('aria-pressed', 'true');
  await chat.click({position: {x: 12, y: 12}});
  const box = (await chat.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -200);
  await expect(keyboard).toBeVisible();
  await expect(answer).toBeFocused();
  await page.keyboard.type('still here');
  await expect(answer).toContainText('still here');

  await keep.click();
  await expect(keep).toHaveAttribute('aria-pressed', 'false');
  await chat.click({position: {x: 12, y: 12}});
  await expect(keyboard).toHaveCount(0);
});
