import {expect, test} from '@playwright/test';

const route = (suffix = '') => './?demo=1&flags=v7Shell#/pad' + suffix;

test('Lemma Pad is discoverable from More and opens a full checkpoint workspace', async ({page}) => {
  await page.route('https://**/*', route => route.abort());
  await page.goto('./?demo=1&flags=v7Shell#/');
  await page.getByRole('button', {name: 'More destinations'}).click();
  await page.getByRole('menuitem', {name: 'Lemma Pad'}).click();
  await expect(page.getByRole('heading', {name: 'Lemma Pad', level: 1})).toBeVisible();
  await page.getByLabel('Path', {exact: true}).selectOption('real-analysis');
  await page.getByLabel('Checkpoint', {exact: true}).selectOption('CP4');
  const notes = page.getByRole('textbox', {name: 'Pad notes'});
  await expect(notes).toBeVisible();
  await expect(page.getByRole('region', {name: 'Math keyboard'}).getByRole('button', {name: 'Hide math keyboard'})).toBeVisible();
  await expect(page.getByRole('button', {name: 'Open Local Pad', exact: true})).toHaveCount(0);
  await notes.fill('A full-page compactness proof.');
  await page.getByRole('button', {name: 'Save draft'}).click();
  await expect(page.getByText('Saved on this device.', {exact: true})).toBeVisible();
  await page.reload();
  await expect(notes).toHaveValue('A full-page compactness proof.');
  await page.getByLabel('Checkpoint', {exact: true}).selectOption('CP2');
  await expect(notes).toHaveValue('');
  await page.getByLabel('Checkpoint', {exact: true}).selectOption('CP4');
  await expect(notes).toHaveValue('A full-page compactness proof.');
});

test('direct full-page Pad remains usable at narrow and landscape sizes', async ({page, context}) => {
  await page.route('https://**/*', route => route.abort());
  await page.goto(route('?path=real-analysis&checkpoint=CP4'));
  const notes = page.getByRole('textbox', {name: 'Pad notes'});
  await expect(notes).toBeVisible();
  await notes.fill('Unsaved local work survives a connection change.');
  await context.setOffline(true);
  await expect(notes).toHaveValue('Unsaved local work survives a connection change.');
  for (const viewport of [{width: 320, height: 640}, {width: 390, height: 844}, {width: 844, height: 390}]) {
    await page.setViewportSize(viewport);
    await expect(page.getByRole('heading', {name: 'Lemma Pad', level: 1})).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await notes.scrollIntoViewIfNeeded();
    await notes.focus();
    await page.keyboard.press('End');
    await page.keyboard.type(' More.');
    await page.getByRole('button', {name: 'Save draft'}).click();
    await expect(page.getByText('Saved on this device.', {exact: true})).toBeVisible();
  }
});

test('an empty Pad page gives a path to create checkpoints and the build flag still gates entry', async ({page}) => {
  await page.route('https://**/*', route => route.abort());
  await page.goto('./?demo=first-use&flags=v7Shell,padLocal#/pad');
  await expect(page.getByText('No checkpoints yet. Create a path and approve its plan to start a Pad.')).toBeVisible();
  await expect(page.getByRole('link', {name: 'Open Paths'})).toBeVisible();
  await expect(page.getByRole('textbox', {name: 'Pad notes'})).toHaveCount(0);
  await page.goto('./?demo=1&flags=v7Shell,-padLocal#/pad');
  await expect(page.getByRole('heading', {name: 'Lemma Pad', level: 1})).toHaveCount(0);
});
