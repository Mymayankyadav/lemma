import {expect, test} from '@playwright/test';

test('the web suggestion model uses an explicit HTTPS download and can retry after failure', async ({page}) => {
  const url = 'https://models.example/verified-suggestion-model.pack?download=example';
  let requests = 0;
  await page.route(url, async route => {
    if (++requests === 1) await route.abort();
    else await route.fulfill({body: 'invalid package', contentType: 'application/octet-stream',
      headers: {'access-control-allow-origin': '*'}});
  });
  await page.goto('/lemma/?demo=1&flags=v7Shell,v6Shell#/settings?section=tutor');
  await expect(page.getByRole('group', {name: 'Suggestion model'})).toContainText('Turn on Try faster typing');
  expect(requests).toBe(0);
  await page.getByRole('switch', {name: 'Try faster typing'}).click();
  const model = page.getByRole('group', {name: 'Optional FP16 model'});
  const field = model.getByRole('textbox', {name: 'Custom model download link'});
  await field.fill('http://models.example/unverified.pack');
  await model.getByRole('button', {name: 'Download from link'}).click();
  await expect(model).toContainText('Enter a direct HTTPS download link');
  expect(requests).toBe(0);
  await field.fill(url);
  await model.getByRole('button', {name: 'Download from link'}).click();
  await expect(model).toContainText('Could not reach the download');
  await model.getByRole('button', {name: 'Retry custom download'}).click();
  await expect(model).toContainText('Model size does not match the pinned package');
  expect(requests).toBe(2);
  await expect(model.getByRole('button', {name: 'Remove model'})).toHaveCount(0);
  await page.reload();
  await expect(model.getByRole('textbox', {name: 'Custom model download link'})).toHaveValue('');
  expect(requests).toBe(2);
});
