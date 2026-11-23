import {expect, test} from '@playwright/test';

// N227 (Owner: "add an optional view for v3 type links and use colour coding for it, inside the filter menu").
const url = '/lemma/?demo=1&flags=v7Shell,v6Shell,atlasV3#/atlas?view=map';

test('Typed links is an optional, colour-coded view in the Layers sheet, kept on this device', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  await page.goto(url);
  const sky = page.locator('.v7-atlas-sky');
  await expect(sky).toBeVisible();
  await expect(sky).not.toHaveAttribute('data-typed-links', /.*/);
  await page.getByRole('button', {name: 'Layers', exact: true}).click();
  const sheet = page.getByRole('dialog', {name: 'Layers', exact: true});
  const typed = sheet.getByRole('switch', {name: /^Typed links/});
  await expect(typed).toBeEnabled();
  await expect(typed).not.toBeChecked();
  await typed.click();
  await expect(typed).toBeChecked();
  const key = sheet.getByRole('list', {name: 'Typed links'});
  await expect(key.getByRole('listitem').filter({hasText: 'Analogous'})).toContainText('1');
  await expect(key).toContainText('proposed');
  // Each kind's colour in the key is its role token.
  expect(await key.locator('.v7-atlas-typed-mark path').first().evaluate(node => (node as SVGPathElement).style.stroke)).toContain('--v7-role-');
  await sheet.getByRole('button', {name: 'Close', exact: true}).click();
  await expect(sky).toHaveAttribute('data-typed-links', '1');
  await page.reload();
  await expect(page.locator('.v7-atlas-sky')).toHaveAttribute('data-typed-links', '1');
  await page.getByRole('button', {name: 'Layers', exact: true}).click();
  await page.getByRole('dialog', {name: 'Layers', exact: true}).getByRole('switch', {name: /^Typed links/}).click();
  await page.getByRole('dialog', {name: 'Layers', exact: true}).getByRole('button', {name: 'Close', exact: true}).click();
  await expect(page.locator('.v7-atlas-sky')).not.toHaveAttribute('data-typed-links', /.*/);
});
