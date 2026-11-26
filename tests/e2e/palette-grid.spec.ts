import {test, expect} from '@playwright/test';

for (const width of [390, 1280]) {
  test(`paper grid is painted in both themes without moving the shell at ${width}px`, async ({page}) => {
    await page.setViewportSize({width, height: 844});
    await page.clock.setFixedTime(new Date('2026-11-09T08:13:00Z'));
    let dayGeometry: unknown;
    for (const mode of ['day', 'night']) {
      await page.goto(`/lemma/?demo=1&flags=v7Shell,v6Shell&mode=${mode}#/projects`);
      await expect(page.getByRole('heading', {name: 'Paths', exact: true})).toBeVisible();
      await page.waitForLoadState('networkidle');
      await page.evaluate(() => document.fonts.ready);
      const paint = await page.evaluate(() => {
        const body = getComputedStyle(document.body);
        const shell = getComputedStyle(document.querySelector('.v7-shell')!);
        return {background: body.backgroundColor, image: body.backgroundImage, size: body.backgroundSize, shell: shell.backgroundColor};
      });
      expect(paint.background).toBe(mode === 'day' ? 'rgb(250, 249, 245)' : 'rgb(38, 38, 36)');
      // Before the fix, Night forced background-image:none and the opaque shell hid the paper.
      expect(paint.image).toContain('linear-gradient');
      expect(paint.image).toContain(mode === 'day' ? 'rgb(232, 230, 220)' : 'rgb(61, 61, 58)');
      expect(paint.size.split(', ')).toEqual(['24px 24px', '24px 24px']);
      expect(paint.shell).toBe('rgba(0, 0, 0, 0)');
      const geometry = await page.locator('.v7-shell, .v7-page, .v7-dock, .v7-hub-title').evaluateAll(nodes => nodes.map(node => {
        const {x, y, width, height} = node.getBoundingClientRect();
        return {x, y, width, height};
      }));
      if (mode === 'day') dayGeometry = geometry;
      else expect(geometry).toEqual(dayGeometry);
    }
    await page.evaluate(() => document.documentElement.setAttribute('data-v7-reduce-effects', ''));
    await expect(page.locator('body')).toHaveCSS('background-image', 'none');
  });
}
