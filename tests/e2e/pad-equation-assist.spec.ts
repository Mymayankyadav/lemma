import {expect, test, type Locator} from '@playwright/test';

const pad = './?demo=1&flags=v7Shell,equationAssist#/pad?path=real-analysis&checkpoint=CP4';

async function select(notes: Locator, value: string, selection = value) {
  await notes.fill(value);
  await notes.evaluate((element: HTMLTextAreaElement, selected) => {
    const start = element.value.indexOf(selected);
    element.setSelectionRange(start, start + selected.length);
    element.dispatchEvent(new Event('select', {bubbles:true}));
  }, selection);
}

test.beforeEach(async ({page}) => {
  await page.route('https://**/*', route => route.abort());
});

test('Equation Assist waits for a choice and makes one undoable edit', async ({page}) => {
  await page.goto(pad);
  const notes = page.getByRole('textbox', {name:'Pad notes'});
  await page.getByRole('button', {name:'Equation Assist', exact:true}).click();
  const chooser = page.getByRole('group', {name:'Equation Assist candidates'});
  await expect(chooser.getByRole('status')).toHaveText('Select text in your notes to convert it.');

  const line = 'The equation of a circle is x2+y2=2.';
  await select(notes, line, 'x2+y2=2');
  await expect(chooser.getByRole('button').first()).toHaveText(/^Powers/);
  await expect(chooser.getByRole('button', {name:/^Subscripts/})).toBeVisible();
  await expect(chooser.getByRole('button', {name:/^Trailing coefficients/})).toBeVisible();
  await expect(notes).toHaveValue(line);
  await chooser.getByRole('button', {name:/^Powers/}).click();
  await expect(notes).toHaveValue('The equation of a circle is \\(x^{2}+y^{2}=2\\).');
  await expect(chooser).toHaveCount(0);
  await notes.press('Control+z');
  await expect(notes).toHaveValue(line);

  await select(notes, 'let p be a polynomial in x with real coefficients');
  await page.getByRole('button', {name:'Equation Assist', exact:true}).click();
  await chooser.getByRole('button', {name:/^Polynomial ring/}).click();
  await expect(notes).toHaveValue('let \\(p\\in\\mathbb{R}[x]\\)');
});

test('autocomplete offers only notation slots and does not load the model', async ({page}) => {
  await page.goto(pad);
  const requests: string[] = [];
  page.context().on('request', request => {
    if (request.url().includes('/models/equation-assist/')) requests.push(request.url());
  });
  const notes = page.getByRole('textbox', {name:'Pad notes'});
  const notation = page.getByRole('group', {name:'Notation suggestions'});
  await notes.fill('sin^2 x +');
  await expect(notation).toHaveCount(0);
  await expect(notes).toHaveValue('sin^2 x +');
  await notes.fill('sqrt(');
  await expect(notation.getByRole('button', {name:'Square root slot'})).toBeVisible();
  await expect(notation.locator('math')).toHaveCount(0);
  await expect(notes).toHaveValue('sqrt(');
  await notation.getByRole('button', {name:'Square root slot'}).click();
  await expect(notes).toHaveValue('\\(\\sqrt{\\padslot}\\)');
  expect(await notes.evaluate((node: HTMLTextAreaElement) => node.value.slice(node.selectionStart, node.selectionEnd))).toBe('\\padslot');
  await notes.press('Control+z');
  await expect(notes).toHaveValue('sqrt(');
  expect(requests).toEqual([]);
});

test('the packaged autoeq worker offers both fraction readings and works from cache', async ({page, context}) => {
  await page.goto(pad);
  const chooser = page.getByRole('group', {name:'Equation Assist candidates'});
  const notes = page.getByRole('textbox', {name:'Pad notes'});
  const candidates = async () => {
    await select(notes, 'a+b/c');
    await page.getByRole('button', {name:'Equation Assist', exact:true}).click();
    await expect(chooser.getByRole('button', {name:/^Interpretation 2/})).toBeVisible({timeout:15000});
    return chooser.locator('annotation[encoding="application/x-tex"]').allTextContents();
  };
  const weights = page.waitForResponse(response =>
    response.url().endsWith('/models/equation-assist/autoeq-v1.4/encoder.int8.onnx') && response.ok());
  expect(await candidates()).toEqual(expect.arrayContaining(['a+\\frac{b}{c}', '\\frac{a+b}{c}']));
  await weights;
  await page.evaluate(async () => {await navigator.serviceWorker.ready;});
  await context.setOffline(true);
  await page.reload();
  expect(await candidates()).toEqual(expect.arrayContaining(['a+\\frac{b}{c}', '\\frac{a+b}{c}']));
});

test('moving the selection cancels a pending model conversion', async ({page, context}) => {
  await page.goto(pad);
  let release: () => void = () => {};
  const unblock = new Promise<void>(resolve => {release = resolve;});
  const modelUrl = '**/models/equation-assist/autoeq-v1.4/encoder.int8.onnx';
  await context.route(modelUrl, async route => {await unblock; await route.continue();}, {times:1});
  const notes = page.getByRole('textbox', {name:'Pad notes'});
  const chooser = page.getByRole('group', {name:'Equation Assist candidates'});
  const requested = context.waitForEvent('request', request => request.url().endsWith('/encoder.int8.onnx'));
  try {
    const line = 'a+b/c and root 2';
    await select(notes, line, 'a+b/c');
    await page.getByRole('button', {name:'Equation Assist', exact:true}).click();
    await requested;
    await select(notes, line, 'root 2');
    await expect(chooser.getByRole('button', {name:/^Square root/})).toBeVisible();
    const completed = context.waitForEvent('response', response => response.url().endsWith('/encoder.int8.onnx'));
    release();
    await completed;
    await chooser.getByRole('button', {name:/^Square root/}).click();
    await expect(notes).toHaveValue('a+b/c and \\(\\sqrt{2}\\)');
    await expect(chooser).toHaveCount(0);
  } finally {
    release();
  }
});
