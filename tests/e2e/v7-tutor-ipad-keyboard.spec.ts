import {expect, test, type Page} from '@playwright/test';

// N252 (Owner: "This is how the native keyboard looks on iPad. I understand that keyboard layout should depend on the
// device. Keep the current layout for android devices."): on an iPad the tutor's keys follow iPadOS's full-size
// keyboard; Android, phones and desktops keep Gboard's layout (N220/N221).

const IPAD_UA = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

async function openKeyboard(page: Page, device: {userAgent: string; platform: string} | null) {
  if (device) await page.addInitScript(({userAgent, platform}) => {
    Object.defineProperties(navigator, {userAgent: {get: () => userAgent}, platform: {get: () => platform}, maxTouchPoints: {get: () => 5}});
  }, device);
  await page.goto('/lemma/?demo=1&flags=v7Shell,v6Shell,tutorScratch#/p/real-analysis/cp/CP4/tutor');
  await page.getByRole('button', {name: 'Write a question', exact: true}).click();
  const answer = page.getByRole('textbox', {name: 'Your answer', exact: true});
  await answer.focus();
  const keyboard = page.getByRole('group', {name: 'Answer keyboard', exact: true});
  await expect(keyboard).toBeVisible();
  return {answer, keyboard};
}
const iPad = {userAgent: IPAD_UA, platform: 'iPad'};

/** Each key's visible cap (its ::before), and where its grey secondary character and its label sit. */
const geometry = (page: Page) => page.evaluate(() => {
  const key = (label: string) => {
    const button = document.querySelector<HTMLElement>(`.kb .k[aria-label="${label}"]`)!;
    const cell = button.getBoundingClientRect(), cap = getComputedStyle(button, '::before');
    const sup = button.querySelector('sup')?.getBoundingClientRect(), text = button.querySelector('.kl')!;
    const range = document.createRange(); range.selectNodeContents(text);
    const glyph = range.getBoundingClientRect();
    return {cell: cell.width, x: cell.left + parseFloat(cap.left), y: cell.top + parseFloat(cap.top),
      width: cell.width - parseFloat(cap.left) - parseFloat(cap.right), height: cell.height - parseFloat(cap.top) - parseFloat(cap.bottom),
      supBottom: sup?.bottom, glyphTop: glyph.top, glyphBottom: glyph.bottom};
  };
  const rows = [...document.querySelectorAll('.kb .rows > .row')].map(row => row.getBoundingClientRect().width);
  const dock = document.querySelector('.kb')!.getBoundingClientRect();
  return {q: key('q'), a: key('a'), z: key('z'), tab: key('Tab'), space: key('Space'), rows,
    left: dock.left, right: innerWidth - dock.right, bottom: innerHeight - dock.bottom, top: dock.top};
});

for (const [name, size] of [['portrait', {width: 820, height: 1110}], ['landscape', {width: 1180, height: 760}]] as const) {
  test(`on an iPad (${name}) the keys follow iPadOS: staggered as the iPad's, near-square caps, grey characters clear of their letters`, async ({page}) => {
    await page.setViewportSize(size);
    const {keyboard} = await openKeyboard(page, iPad);
    await expect(keyboard.locator('.rows')).toHaveAttribute('data-layout', 'ipad');
    for (const label of ['Tab', 'Delete', 'Caps lock', 'Return', 'Maths symbols', 'Space', 'Hide keyboard']) {
      await expect(keyboard.getByRole('button', {name: label, exact: true})).toHaveCount(1);
    }
    await expect(keyboard.getByRole('button', {name: 'Shift', exact: true})).toHaveCount(2);
    await expect(keyboard.getByRole('button', {name: '.?123', exact: true})).toHaveCount(2);
    // Gboard's keys are gone, and the strip's hide button gives way to the key.
    await expect(keyboard.getByRole('button', {name: 'New line', exact: true})).toHaveCount(0);
    await expect(keyboard.getByRole('button', {name: '?123', exact: true})).toHaveCount(0);
    const g = await geometry(page);
    expect(Math.abs(g.left)).toBeLessThan(1);
    expect(Math.abs(g.right)).toBeLessThan(1);
    expect(Math.abs(g.bottom)).toBeLessThan(1);
    expect(g.q.y - g.top).toBeCloseTo(63, -1);
    expect(g.tab.x).toBeCloseTo(2 * Math.min(5, Math.max(4, size.width * .0056)), 0);
    expect(g.space.cell / g.q.cell).toBeCloseTo(6.35, 1);
    expect(size.height - g.space.y - g.space.height).toBeCloseTo(28, -1);
    // iPadOS's stagger: tab 1.25 keys, caps lock 1.55 and shift 2 (A 0.3 and Z 0.75 of a key past Q).
    expect((g.a.x - g.q.x) / g.q.cell).toBeCloseTo(.3, 1);
    expect((g.z.x - g.q.x) / g.q.cell).toBeCloseTo(.75, 1);
    expect(g.tab.cell / g.q.cell).toBeCloseTo(1.25, 1);
    for (const width of g.rows) expect(width).toBeCloseTo(g.rows[0]!, 0);
    // Near-square caps, larger than Gboard's phone caps.
    expect(g.q.height).toBeGreaterThan(40);
    expect(g.q.height / g.q.width).toBeGreaterThan(.6);
    expect(g.q.height / g.q.width).toBeLessThan(1.15);
    // The grey secondary character stands above its letter without touching it.
    for (const key of [g.q, g.a, g.z]) {
      expect(key.supBottom!).toBeLessThanOrEqual(key.glyphTop + 1);
      expect(key.glyphBottom).toBeLessThan(key.y + key.height - 3);
    }
  });
}

test('the keyboard switch preserves a middle selection and the separate pin keeps Lemma open', async ({page}) => {
  await page.setViewportSize({width: 820, height: 1180});
  const {answer, keyboard} = await openKeyboard(page, iPad);
  await page.keyboard.type('ring');
  await answer.press('ArrowLeft');
  await answer.press('Shift+ArrowLeft');
  await page.getByRole('button', {name: 'Use device keyboard', exact: true}).click();
  await expect(keyboard).toHaveCount(0);
  await expect(answer).toHaveAttribute('inputmode', 'text');
  await expect(answer).not.toHaveAttribute('autocorrect', 'off');
  await expect(answer).toBeFocused();
  await expect.poll(() => page.evaluate(() => getSelection()?.toString())).toBe('n');
  await page.keyboard.type('sin');
  await expect(answer).toHaveText('rising');
  await page.getByRole('button', {name: 'Use Lemma keyboard', exact: true}).click();
  await expect(answer).toHaveAttribute('inputmode', 'none');
  const pin = keyboard.getByRole('button', {name: 'Keep keyboard open', exact: true});
  await pin.click();
  await page.getByRole('log', {name: 'Conversation'}).click({position: {x: 8, y: 8}});
  await expect(pin).toHaveAttribute('aria-pressed', 'true');
  await expect(answer).toBeFocused();
  await keyboard.getByRole('button', {name: 'Maths symbols', exact: true}).click();
  await expect(pin).toHaveAttribute('aria-pressed', 'true');
  await pin.click();
  await page.getByRole('log', {name: 'Conversation'}).click({position: {x: 8, y: 8}});
  await expect(keyboard).toHaveCount(0);
});

test('on an iPad the keys type, hold for their grey characters, lock caps, tab to the next □, and hide the keyboard', async ({page}) => {
  await page.setViewportSize({width: 820, height: 1110});
  const {answer, keyboard} = await openKeyboard(page, iPad);
  const press = (label: string, index = 0) => keyboard.getByRole('button', {name: label, exact: true}).nth(index).click();
  await press('Shift', 1);
  for (const letter of ['H', 'i']) await press(letter);
  await press(',');
  await press('Space');
  // Holding a key types its grey character (iPadOS flicks; a flick here would draw over the keys).
  const a = keyboard.getByRole('button', {name: 'a', exact: true});
  const box = (await a.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(600);
  await page.mouse.up();
  await press('Caps lock');
  for (const letter of ['X', 'Y']) await press(letter);
  await press('Caps lock');
  await press('z');
  await expect(answer).toHaveJSProperty('textContent', 'Hi, @XYz');
  // No enlarged preview, as on iPadOS.
  await expect(keyboard.locator('.tutor-key-preview')).toBeHidden();

  // The numbers page keeps Lemma's maths symbols in the iPad's frame.
  await press('.?123');
  await expect(keyboard.getByRole('button', {name: '#+=', exact: true})).toHaveCount(2);
  await press('÷');
  await press('#+=');
  await press('∞');
  await press('ABC', 1);
  await expect(answer).toHaveJSProperty('textContent', 'Hi, @XYz÷∞');

  // Tab goes to the next □, as Tab on a hardware keyboard does here.
  await answer.fill('a □ b □');
  await answer.focus();
  await page.keyboard.press('Home');
  await press('Tab');
  await expect.poll(() => page.evaluate(() => getSelection()?.toString())).toBe('□');

  await press('Hide keyboard');
  await expect(keyboard).toHaveCount(0);
});

for (const [name, device, size] of [
  ['Android', null, {width: 393, height: 873}],
  ['iPhone', {userAgent: IPHONE_UA, platform: 'iPhone'}, {width: 393, height: 852}],
  ['an iPad in a narrow window (Slide Over)', iPad, {width: 507, height: 1110}],
] as const) {
  test(`${name} keeps Gboard's layout`, async ({page}) => {
    await page.setViewportSize(size);
    const {keyboard} = await openKeyboard(page, device);
    await expect(keyboard.locator('.rows')).not.toHaveAttribute('data-layout', 'ipad');
    await expect(keyboard.getByRole('button', {name: 'Tab', exact: true})).toHaveCount(0);
    await expect(keyboard.getByRole('button', {name: 'New line', exact: true})).toHaveCount(1);
    await expect(keyboard.getByRole('button', {name: '?123', exact: true})).toHaveCount(1);
    await expect(keyboard.getByRole('button', {name: 'Hide keyboard', exact: true})).toHaveCount(1);
  });
}
