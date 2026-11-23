import {expect, test, type Page} from '@playwright/test';

// N228 (Owner: "full screen scratch pad editing for both scratch and equation").
const url = '/lemma/?demo=1&flags=v7Shell,tutorScratch#/p/real-analysis/cp/CP4/tutor';
const surfaces = [
  {name: 'scratch pad', frame: 'Scratch pad, full screen', open: (page: Page) => page.getByRole('button', {name: 'Scratch', exact: true}).click(),
    inline: (page: Page) => page.getByRole('region', {name: 'Scratch pad'})},
  {name: 'equation mode', frame: 'Equation mode, full screen', open: (page: Page) =>
    page.getByRole('group', {name: 'Answer keyboard', exact: true}).getByRole('button', {name: 'Equation mode', exact: true}).click(),
    inline: (page: Page) => page.getByRole('region', {name: 'Equation mode'})},
];

for (const surface of surfaces) {
  test(`${surface.name}: keeps controls inside the insets as Android rotates`, async ({page}) => {
    await page.setViewportSize({width: 393, height: 873});
    await page.addInitScript(() => {
      document.addEventListener('DOMContentLoaded',()=>{
        document.documentElement.dataset.nativeApp='';
        document.documentElement.style.setProperty('--safe-area-inset-top', '34px');
        document.documentElement.style.setProperty('--safe-area-inset-left', '26px');
        document.documentElement.style.setProperty('--safe-area-inset-right', '20px');
      },{once:true});
    });
    await page.goto(url);
    await page.getByRole('button', {name: 'Write a question'}).click();
    await page.getByRole('textbox', {name: 'Your answer', exact: true}).focus();
    await surface.open(page);
    await page.getByRole('button', {name: 'Full screen', exact: true}).click();
    const frame=page.getByRole('dialog',{name:surface.frame});
    await expect(frame).toBeVisible();
    await expect(frame.getByRole('button',{name:'Landscape',exact:true})).toHaveCount(0);
    const exit=frame.getByRole('button',{name:'Exit full screen',exact:true});
    expect((await exit.boundingBox())!.y).toBeGreaterThanOrEqual(34);
    const canvas=frame.locator('svg[data-ink-canvas]');
    const before=(await frame.locator('.tutor-paper-full').boundingBox())!;
    await page.mouse.move(120,250);
    await page.mouse.down();
    await page.mouse.move(182,282,{steps:5});
    await page.mouse.up();
    const saved=await canvas.locator('path').getAttribute('d');
    await page.setViewportSize({width:844,height:390});
    const after=(await frame.locator('.tutor-paper-full').boundingBox())!;
    expect(before.width).toBeLessThan(before.height);
    expect(after.width).toBeGreaterThan(after.height);
    expect(after.x).toBeGreaterThanOrEqual(26);
    expect(after.x+after.width).toBeLessThanOrEqual(824);
    await expect(canvas.locator('path')).toHaveAttribute('d',saved!);
    await exit.click();
    await expect(frame).toHaveCount(0);
  });
  for (const size of [{width: 393, height: 873}, {width: 844, height: 390}]) {
    test(`${surface.name} fills the screen at ${size.width}×${size.height}, keeps its drawing both ways, and Escape leaves`, async ({page}) => {
      await page.setViewportSize(size);
      await page.goto(url);
      await page.getByRole('button', {name: 'Write a question'}).click();
      const answer = page.getByRole('textbox', {name: 'Your answer', exact: true});
      await answer.focus();
      await surface.open(page);
      const inline = surface.inline(page);
      await expect(inline).toBeVisible();
      const expand = page.getByRole('button', {name: 'Full screen', exact: true});
      await expand.click();

      const frame = page.getByRole('dialog', {name: surface.frame});
      await expect(frame).toBeVisible();
      const box = (await frame.boundingBox())!;
      expect([box.x, box.y, box.width, box.height]).toEqual([0, 0, size.width, size.height]);
      // The paper keeps its own proportions at one scale, large enough to cover the screen, so what is drawn is what is sent.
      const canvas = frame.locator('svg[data-ink-canvas]');
      const canvasBox = (await canvas.boundingBox())!;
      expect(canvasBox.width / canvasBox.height).toBeCloseTo(1.6, 1);
      expect(canvasBox.width).toBeGreaterThanOrEqual(size.width - 30);
      expect(canvasBox.height).toBeGreaterThanOrEqual(size.height * 0.6);
      // It is the kit's modal Sheet: the page behind cannot be reached, and focus is inside it.
      expect(await frame.evaluate(dialog => dialog.matches(':modal'))).toBe(true);
      expect(await frame.evaluate(dialog => dialog.contains(document.activeElement))).toBe(true);

      // Draw in full screen: a stroke on the visible paper.
      const x = Math.max(canvasBox.x, 0) + 40, y = Math.max(canvasBox.y, 0) + 120;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + 60, y + 30, {steps: 6});
      await page.mouse.move(x + 120, y, {steps: 6});
      await page.mouse.up();
      await expect(canvas.locator('path')).toHaveCount(1);

      // Escape leaves; the stroke is still there, and the page works again.
      await page.keyboard.press('Escape');
      await expect(frame).toHaveCount(0);
      await expect(inline).toBeVisible();
      await expect(inline.locator('svg[data-ink-canvas] path')).toHaveCount(1);
      await expect(expand).toBeFocused();

      // And back in again with the button, then out with the button.
      await expand.click();
      await expect(frame.locator('svg[data-ink-canvas] path')).toHaveCount(1);
      await frame.getByRole('button', {name: 'Exit full screen', exact: true}).click();
      await expect(frame).toHaveCount(0);
      await expect(inline.locator('svg[data-ink-canvas] path')).toHaveCount(1);
    });
  }
}

// N228 (Owner: "add landscape mode too in both scratch pads (when in full screen) which means they are rotated before
// sending to the model"): on a portrait screen the paper can be turned a quarter either way; its strokes stay upright in
// the paper's own frame, so what is read and sent is upright.
for (const surface of surfaces) {
  test(`${surface.name}: landscape turns the paper a quarter either way and keeps what is drawn upright`, async ({page}) => {
    await page.setViewportSize({width: 393, height: 873});
    await page.goto(url);
    await page.getByRole('button', {name: 'Write a question'}).click();
    await page.getByRole('textbox', {name: 'Your answer', exact: true}).focus();
    await surface.open(page);
    await page.getByRole('button', {name: 'Full screen', exact: true}).click();
    const frame = page.getByRole('dialog', {name: surface.frame});
    const canvas = frame.locator('svg[data-ink-canvas]');
    const points = async () => (await canvas.locator('path').last().getAttribute('d'))!.replace(/[ML]/g, ' ').trim().split(/\s+/).map(Number);

    // Portrait: a swipe to the right is a stroke with growing x.
    const turn = frame.getByRole('button', {name: 'Landscape', exact: true});
    await expect(turn).toBeVisible();
    const draw = async (dx: number, dy: number) => {
      const box = (await frame.locator('.tutor-paper-full').boundingBox())!;
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + dx / 2, y + dy / 2, {steps: 5});
      await page.mouse.move(x + dx, y + dy, {steps: 5});
      await page.mouse.up();
    };
    await draw(80, 0);
    let [x1, y1, x2, y2] = (await points()).slice(0, 4).concat((await points()).slice(-2));
    expect(x2 - x1).toBeGreaterThan(20);
    expect(Math.abs(y2 - y1)).toBeLessThan(6);

    // Landscape: the surface is a quarter turn, as wide as the screen is tall. A swipe DOWN the screen is now along the
    // paper's own x axis, so it is stored as growing x and the same y: upright, as it looked to the writer.
    await turn.click();
    await expect(frame.locator('.tutor-paper-full')).toHaveAttribute('data-turn', '90');
    const rotated = (await frame.locator('.tutor-paper-full').boundingBox())!;
    expect(rotated.width).toBeCloseTo(393, 0);
    expect(rotated.height).toBeCloseTo(873, 0);
    await draw(0, 80);
    const down = await points();
    expect(down.at(-2)! - down[0]).toBeGreaterThan(20);
    expect(Math.abs(down.at(-1)! - down[1])).toBeLessThan(6);
    // The other way round, the same swipe runs the other way along the paper.
    await frame.getByRole('button', {name: 'Landscape, other way', exact: true}).click();
    await expect(frame.locator('.tutor-paper-full')).toHaveAttribute('data-turn', '270');
    await draw(0, 80);
    const up = await points();
    expect(up.at(-2)! - up[0]).toBeLessThan(-20);
    expect(Math.abs(up.at(-1)! - up[1])).toBeLessThan(6);
    // Back to portrait, and the strokes are all still there.
    await frame.getByRole('button', {name: 'Portrait', exact: true}).click();
    await expect(frame.locator('.tutor-paper-full')).not.toHaveAttribute('data-turn', /.*/);
    await expect(canvas.locator('path')).toHaveCount(3);
  });
}
