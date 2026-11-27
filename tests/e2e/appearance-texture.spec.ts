import {test, expect, type Page} from '@playwright/test';

// Sample the empty right page gutter, not a swatch, card or the controls themselves.
// Use CSS pixels and a tall strip to include multiple repeats of even the sparse star field.
test.use({viewport: {width: 1024, height: 960}, deviceScaleFactor: 1});

async function paintedRange(page: Page) {
  const bytes = await page.screenshot({clip: {x: 1000, y: 200, width: 24, height: 420}});
  return page.evaluate(async encoded => {
    const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
    const image = await createImageBitmap(new Blob([bytes], {type: 'image/png'}));
    const canvas = document.createElement('canvas');
    canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(image, 0, 0); image.close();
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let min = 255, max = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      min = Math.min(min, pixels[i]); max = Math.max(max, pixels[i]);
    }
    return max - min;
  }, bytes.toString('base64'));
}

async function openAppearance(page: Page) {
  await page.goto('/lemma/?demo=1&flags=v6Shell,v7Shell#/settings');
  await page.getByRole('link', {name: /Appearance/}).click();
  await expect(page.getByRole('radiogroup', {name: 'Theme'})).toBeVisible();
}

test('Night Clear removes the graph; Stars are visible at their intended size and survive reload', async ({page}) => {
  await openAppearance(page);
  const group = page.getByRole('radiogroup', {name: 'Sky by night'});
  const choose = (name: string) => group.getByRole('radio', {name, exact: true}).click();
  await page.getByRole('radiogroup', {name: 'Theme'}).getByRole('radio', {name: /^Night/}).click();
  await expect(group.getByRole('radio', {name: 'Graph', exact: true})).toBeChecked();
  await choose('Clear');
  expect(await paintedRange(page)).toBe(0);
  await choose('Stars');
  expect(await paintedRange(page)).toBeGreaterThan(8);
  await page.reload();
  await expect(group.getByRole('radio', {name: 'Stars'})).toBeChecked();
  expect(await paintedRange(page)).toBeGreaterThan(8);
  const reduce = page.getByRole('switch', {name: 'Reduce effects'});
  await reduce.click();
  expect(await paintedRange(page)).toBe(0);
  await page.reload();
  await expect(reduce).toBeChecked();
  expect(await paintedRange(page)).toBe(0);
  await reduce.click();
  expect(await paintedRange(page)).toBeGreaterThan(8);
  await choose('Graph');
  await expect(page.locator('body')).toHaveCSS('background-image', /linear-gradient/);
  await choose('Clear');
  await page.reload();
  await expect(group.getByRole('radio', {name: 'Clear'})).toBeChecked();
  expect(await paintedRange(page)).toBe(0);
});

test('Day paper renders each choice and keeps it separate from the Night choice', async ({page}) => {
  await openAppearance(page);
  const theme = page.getByRole('radiogroup', {name: 'Theme'});
  const paper = page.getByRole('radiogroup', {name: 'Paper by day'});
  const sky = page.getByRole('radiogroup', {name: 'Sky by night'});
  await theme.getByRole('radio', {name: /^Day/}).click();
  await expect(paper.getByRole('radio', {name: 'Graph', exact: true})).toBeChecked();
  await paper.getByRole('radio', {name: 'Plain'}).click();
  expect(await paintedRange(page)).toBe(0);
  await sky.getByRole('radio', {name: 'Stars'}).click();
  expect(await paintedRange(page)).toBe(0);
  const images = new Set<string>();
  for (const name of ['Graph', 'Ruled', 'Dot']) {
    await paper.getByRole('radio', {name, exact: true}).click();
    expect(await paintedRange(page)).toBeGreaterThan(0);
    images.add(await page.locator('body').evaluate(body => getComputedStyle(body).backgroundImage));
  }
  expect(images.size).toBe(3);
  await theme.getByRole('radio', {name: /^Night/}).click();
  await sky.getByRole('radio', {name: 'Clear'}).click();
  expect(await paintedRange(page)).toBe(0);
  await theme.getByRole('radio', {name: /^Day/}).click();
  await page.reload();
  await expect(paper.getByRole('radio', {name: 'Dot'})).toBeChecked();
  expect(await paintedRange(page)).toBeGreaterThan(0);
});
