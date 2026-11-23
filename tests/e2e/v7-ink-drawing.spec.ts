import {expect, test, type CDPSession, type Locator, type Page} from '@playwright/test';

// N228 (Owner: "drawing in both the scratch pads is laggy and unreliable. fix it"): scratch pad and equation paper.
const url = '/lemma/?demo=1&flags=v7Shell,tutorScratch#/p/real-analysis/cp/CP4/tutor';
type Surface = {name: string; open: (page: Page) => Promise<void>; paper: string};
const surfaces: Surface[] = [
  {name: 'scratch pad', paper: '.tutor-scratch-paper', open: async page => {
    await page.getByRole('button', {name: 'Scratch', exact: true}).click();
  }},
  {name: 'equation paper', paper: '.tutor-equation-paper', open: async page => {
    await page.getByRole('group', {name: 'Answer keyboard', exact: true}).getByRole('button', {name: 'Equation mode', exact: true}).click();
  }},
];

async function openSurface(page: Page, surface: Surface) {
  await page.setViewportSize({width: 393, height: 873});
  await page.goto(url);
  await page.getByRole('button', {name: 'Write a question'}).click();
  await page.getByRole('textbox', {name: 'Your answer', exact: true}).focus();
  await surface.open(page);
  const svg = page.locator('svg[data-ink-canvas]');
  await expect(svg).toBeVisible();
  const view = (await page.locator(surface.paper).boundingBox())!;
  const client = await page.context().newCDPSession(page);
  return {svg, view, client};
}
const touch = (client: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel', points: {x: number; y: number; id: number}[] = []) =>
  client.send('Input.dispatchTouchEvent', {type, touchPoints: points});
const strokes = (svg: Locator) => svg.evaluate(node => [...node.querySelectorAll('path:not([data-live-stroke])')]
  .map(path => (path.getAttribute('d') ?? '').replace(/[ML]/g, ' ').trim().split(/\s+/).map(Number))
  .map(numbers => numbers.reduce<{x: number; y: number}[]>((out, value, i) => i % 2 ? (out[out.length - 1].y = value, out) : [...out, {x: value, y: 0}], [])));

for (const surface of surfaces) {
  test.describe(surface.name, () => {
    test('a long, slow stroke is kept to its end instead of stopping at 256 points', async ({page}) => {
      const {svg, view, client} = await openSurface(page, surface);
      const x0 = view.x + 8, y0 = view.y + 60, length = Math.min(330, view.width - 24);
      await touch(client, 'touchStart', [{x: x0, y: y0, id: 0}]);
      for (let i = 1; i <= length; i++) await touch(client, 'touchMove', [{x: x0 + i, y: y0 + Math.round(Math.sin(i / 20) * 12), id: 0}]);
      await touch(client, 'touchEnd');
      const [stroke] = await strokes(svg);
      const box = (await svg.boundingBox())!, unit = 640 / box.width;
      // Its last point is where the finger lifted, not where a point limit ran out.
      expect(stroke.at(-1)!.x).toBeGreaterThan((x0 + length - 4 - box.x) * unit);
      expect(stroke.length).toBeLessThan(256);
    });

    test('a stroke is not cancelled by a second finger resting on the paper, a palm beside the pen, or a cancelled pointer', async ({page}) => {
      const {svg, view, client} = await openSurface(page, surface);
      const x0 = view.x + 20, y0 = view.y + 40;
      const finger = (id: number, x: number, y: number) => ({x, y, id});
      if (surface.name === 'scratch pad') {
        // Two fingers are fewer than the pan count here (three): the first keeps drawing.
        await touch(client, 'touchStart', [finger(0, x0, y0)]);
        for (let i = 1; i <= 10; i++) await touch(client, 'touchMove', [finger(0, x0 + i * 8, y0)]);
        await touch(client, 'touchStart', [finger(0, x0 + 80, y0), finger(1, x0 + 200, y0 + 90)]);
        for (let i = 11; i <= 20; i++) await touch(client, 'touchMove', [finger(0, x0 + i * 8, y0), finger(1, x0 + 200, y0 + 90)]);
        await touch(client, 'touchEnd');
        const drawn = await strokes(svg);
        expect(drawn).toHaveLength(1);
        expect(drawn[0].at(-1)!.x).toBeGreaterThan(drawn[0][0].x + 100);
      }
      // A pointer the system cancels keeps what was drawn so far.
      const before = (await strokes(svg)).length;
      await touch(client, 'touchStart', [finger(0, x0, y0 + 50)]);
      for (let i = 1; i <= 12; i++) await touch(client, 'touchMove', [finger(0, x0 + i * 6, y0 + 50)]);
      await touch(client, 'touchCancel');
      const after = await strokes(svg);
      expect(after).toHaveLength(before + 1);
      expect(after.at(-1)![0].x).toBeLessThan(after.at(-1)!.at(-1)!.x);
      // A touch beside the pen is a palm: it neither draws nor cancels the pen's stroke.
      const mouse = (type: string, x: number, y: number) => client.send('Input.dispatchMouseEvent', {type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, pointerType: 'pen'});
      await mouse('mousePressed', x0, y0 + 100);
      for (let i = 1; i <= 6; i++) await mouse('mouseMoved', x0 + i * 10, y0 + 100);
      await touch(client, 'touchStart', [finger(7, x0 + 150, y0 + 120)]);
      await touch(client, 'touchMove', [finger(7, x0 + 170, y0 + 125)]);
      await touch(client, 'touchEnd');
      for (let i = 7; i <= 12; i++) await mouse('mouseMoved', x0 + i * 10, y0 + 100);
      await mouse('mouseReleased', x0 + 120, y0 + 100);
      const final = await strokes(svg);
      expect(final).toHaveLength(after.length + 1);
      expect(final.at(-1)!.at(-1)!.x).toBeGreaterThan(final.at(-1)![0].x + 40);
    });

    test('drawing a new stroke leaves the strokes already on the paper untouched', async ({page}) => {
      const {svg, view, client} = await openSurface(page, surface);
      const x0 = view.x + 12, y0 = view.y + 20;
      for (let s = 0; s < 30; s++) {
        await touch(client, 'touchStart', [{x: x0, y: y0 + (s % 8) * 14, id: 0}]);
        for (let i = 1; i <= 8; i++) await touch(client, 'touchMove', [{x: x0 + i * 10, y: y0 + (s % 8) * 14 + (i % 2) * 5, id: 0}]);
        await touch(client, 'touchEnd');
      }
      expect(await strokes(svg)).toHaveLength(30);
      await svg.evaluate(node => {
        const w = window as unknown as {__redrawn: number};
        w.__redrawn = 0;
        new MutationObserver(records => {
          for (const record of records) if (record.target instanceof SVGPathElement && !record.target.hasAttribute('data-live-stroke')) w.__redrawn++;
        }).observe(node, {subtree: true, attributes: true, attributeFilter: ['d'], childList: true});
      });
      await touch(client, 'touchStart', [{x: x0, y: y0 + 130, id: 0}]);
      for (let i = 1; i <= 120; i++) await touch(client, 'touchMove', [{x: x0 + i * 2, y: y0 + 130 + Math.round(Math.sin(i / 5) * 8), id: 0}]);
      expect(await page.evaluate(() => (window as unknown as {__redrawn: number}).__redrawn)).toBe(0);
      await touch(client, 'touchEnd');
      expect(await strokes(svg)).toHaveLength(31);
    });

    test('a full paper says so when a stroke is started, instead of dropping it afterwards', async ({page}) => {
      const {svg, view} = await openSurface(page, surface);
      const x = view.x + 30, y = view.y + 30;
      for (let s = 0; s < 96; s++) await page.mouse.click(x + (s % 8) * 12, y + Math.floor(s / 8) * 10);
      expect(await strokes(svg)).toHaveLength(96);
      await page.mouse.click(x + 200, y + 100);
      expect(await strokes(svg)).toHaveLength(96);
      await expect(page.getByRole('status').filter({hasText: /full/i})).toBeVisible();
    });
  });
}
