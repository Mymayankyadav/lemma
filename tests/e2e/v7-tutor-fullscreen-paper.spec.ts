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
