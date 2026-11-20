import {expect, test} from '@playwright/test';

test('a Pad selection enters the checkpoint tutor only after review and preserves its exact text', async ({page}) => {
  const excerpt = '  $x^2$ is increasing.\nOn the positive half-line.  ';
  const prefix = 'Private worksheet before the selection.';
  const suffix = 'Private remainder after the selection.';
  await page.goto('./?demo=1&flags=v7Shell,padLocal,tutorManualDemo#/p/real-analysis/cp/CP4');
  await page.getByRole('button', {name:'Open Local Pad'}).click();
  const pad = page.getByRole('textbox', {name:'Pad notes'});
  await pad.fill(prefix + excerpt + suffix);
  await pad.evaluate((node: HTMLTextAreaElement, range) => {
    node.focus(); node.setSelectionRange(range.start, range.end); node.dispatchEvent(new Event('select', {bubbles:true}));
  }, {start:prefix.length, end:prefix.length + excerpt.length});
  await page.getByRole('button', {name:'Send selection to tutor'}).click();
  const dialog = page.getByRole('dialog', {name:'Manual tutor'});
  const preview = dialog.getByRole('region', {name:'Local excerpt preview'});
  await expect(preview).toBeVisible();
  expect(await preview.locator('p').textContent()).toBe(excerpt);
  await expect(dialog.getByText('Local excerpt added')).toHaveCount(0);
  await dialog.getByLabel('Question', {exact:true}).fill('Check this step.');
  await expect(dialog.getByRole('button', {name:'Save question'})).toBeDisabled();
  await dialog.getByRole('button', {name:'Add local excerpt'}).click();
  await dialog.getByRole('button', {name:'Save question'}).click();
  const expected = 'Check this step.\n\nLocal excerpt (learner-provided; not a citation):\n' + excerpt;
  await expect(dialog.getByLabel('Text for your tutor')).toHaveValue(expected);
  await page.keyboard.press('Escape');
  await pad.fill('Changed my original notes.');
  await page.getByRole('button', {name:'Open manual tutor'}).click();
  await expect(dialog.getByLabel('Text for your tutor')).toHaveValue(expected);
});
