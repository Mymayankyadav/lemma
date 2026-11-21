import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import manifest from '../../public/models/tutor-symbols/detypify-0.3.0-lemma-v1/manifest.json' with { type: 'json' };

const base = '/lemma/?demo=1&flags=v7Shell,v6Shell,tutorScratch#';
const tutorUrl = `${base}/p/real-analysis/cp/CP4/tutor`;
const modelPath = `/lemma/models/tutor-symbols/${manifest.assetSetVersion}`;
const runtimeFiles = Object.values(manifest.files).map(file => `${modelPath}/${file.path}`).sort();
const cacheName = `lemma-tutor-symbol-assets-v${manifest.cacheGeneration}-${manifest.assetSetVersion}`;
const answer = (page: Page) => page.getByRole('textbox', { name: 'Your answer', exact: true });
const drawButton = (page: Page) => page.getByRole('button', { name: 'Draw symbol', exact: true });

async function enableDrawing(page: Page) {
  await page.goto(`${base}/settings?section=tutor`, { waitUntil: 'domcontentloaded' });
  const preference = page.getByRole('switch', { name: 'Draw single symbols', exact: true });
  await expect(preference).not.toBeChecked();
  await preference.click();
  await expect(preference).toBeChecked();
}

async function openComposer(page: Page) {
  const open = page.getByRole('button', { name: 'Write a question', exact: true });
  await expect(open.or(answer(page))).toBeVisible();
  if (await open.isVisible()) await open.click();
  await answer(page).click();
}

async function drawForAll(page: Page) {
  await drawButton(page).click();
  const pad = page.getByRole('img', { name: 'Draw one symbol', exact: true });
  await expect(pad).toBeVisible();
  const box = (await pad.boundingBox())!;
  const scale = Math.min(box.width / 320, box.height / 116);
  const left = box.x + (box.width - 320 * scale) / 2;
  const top = box.y + (box.height - 116 * scale) / 2;
  const strokes = [[[128, 26], [160, 91], [192, 26]], [[141, 52], [179, 52]]];
  for (const [first, ...rest] of strokes) {
    await page.mouse.move(left + first[0] * scale, top + first[1] * scale);
    await page.mouse.down();
    for (const [x, y] of rest) await page.mouse.move(left + x * scale, top + y * scale, { steps: 6 });
    await page.mouse.up();
  }
}

async function acceptForAll(page: Page, expected = '∀') {
  const match = page.getByRole('button', { name: 'Matches For all', exact: true });
  await expect(match).toBeEnabled({ timeout: 25_000 });
  const header = page.locator('.tutor-header');
  await expect(header).toBeInViewport({ ratio: 1 });
  await expect(answer(page)).toBeInViewport({ ratio: 1 });
  const recognition = page.getByRole('region', { name: 'Symbol recognition' });
  await expect(recognition).toBeInViewport({ ratio: 1 });
  await expect(recognition.getByRole('group', { name: 'Matches', exact: true }).getByRole('button')).toHaveCount(3);
  expect(await recognition.getByRole('group', { name: 'Could become', exact: true }).getByRole('button').count()).toBeLessThanOrEqual(3);
  const [headerBox, answerBox, recognitionBox] = await Promise.all([header.boundingBox(), answer(page).boundingBox(), recognition.boundingBox()]);
  expect(answerBox!.y).toBeGreaterThanOrEqual(headerBox!.y + headerBox!.height);
  expect(recognitionBox!.y).toBeGreaterThanOrEqual(answerBox!.y + answerBox!.height);
  expect(await page.locator('.lemma-tutor').evaluate(node => node.scrollTop)).toBe(0);
  await match.click();
  await expect(answer(page)).toHaveText(expected);
  await expect(drawButton(page)).toBeVisible();
}

test('Opt-in Draw uses real local model assets after an offline restart', async ({ page, context }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await enableDrawing(page);
  await page.goto(tutorUrl, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  if (!(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)))) {
    await page.reload({ waitUntil: 'domcontentloaded' });
  }
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  expect(await page.evaluate(name => caches.has(name), cacheName)).toBe(false);

  await openComposer(page);
  await drawForAll(page);
  await expect(answer(page)).toHaveText('');
  await acceptForAll(page);
  await expect.poll(() => page.evaluate(async name => {
    const cache = await caches.open(name);
    return (await cache.keys()).map(request => new URL(request.url).pathname).sort();
  }, cacheName)).toEqual(runtimeFiles);

  await context.setOffline(true);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await openComposer(page);
  await answer(page).fill('Let ');
  await answer(page).press('End');
  await drawForAll(page);
  await expect(answer(page)).toHaveText('Let ');
  await acceptForAll(page, 'Let ∀');
});

for (const defect of ['missing model', 'mismatched metadata'] as const) {
  test(`Draw reports ${defect} and Symbols accepts an explicit choice`, async ({ page, context }) => {
    await enableDrawing(page);
    if (defect === 'missing model') {
      await context.route(`**${modelPath}/${manifest.files.model.path}`, route => route.fulfill({ status: 404 }));
    } else {
      const metadata = readFileSync(new URL(
        `../../public/models/tutor-symbols/${manifest.assetSetVersion}/${manifest.files.classes.path}`, import.meta.url,
      ), 'utf8');
      const changed = metadata.replace('"quote.double"', '"quote.doublE"');
      expect(changed).not.toEqual(metadata);
      expect(Buffer.byteLength(changed)).toBe(manifest.files.classes.bytes);
      await context.route(`**${modelPath}/${manifest.files.classes.path}`, route => route.fulfill({
        contentType: 'application/json', body: changed,
      }));
    }
    await page.goto(tutorUrl, { waitUntil: 'domcontentloaded' });
    await openComposer(page);
    await answer(page).fill('Let ');
    await drawButton(page).click();
    await expect(page.getByText('Recognition unavailable. Browse symbols.', { exact: true })).toBeVisible();
    await expect(answer(page)).toHaveText('Let ');
    await page.getByRole('button', { name: 'Browse symbols', exact: true }).click();
    const symbols = page.getByRole('dialog', { name: 'Symbols', exact: true });
    await symbols.getByRole('searchbox', { name: 'Search symbols' }).fill('forall');
    await symbols.getByRole('button', { name: 'For all', exact: true }).click();
    await expect(answer(page)).toHaveText('Let ∀');
  });
}
