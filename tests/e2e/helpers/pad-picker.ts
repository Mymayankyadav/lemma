import type {Page} from '@playwright/test';

export function padPicker(page: Page, label: 'Path' | 'Checkpoint') {
  return page.getByRole('region', {name: 'Choose a Pad checkpoint'})
    .getByRole('button', {name: new RegExp(`^${label}: `)});
}

export async function choosePadOption(page: Page, label: 'Path' | 'Checkpoint', name: string | RegExp) {
  const picker = padPicker(page, label);
  await picker.click();
  if (await picker.getAttribute('aria-haspopup') === 'listbox') {
    await page.getByRole('listbox', {name: label, exact: true}).getByRole('option', {name, exact: true}).click();
  } else {
    await page.getByRole('dialog', {name: label, exact: true}).getByRole('radio', {name, exact: true}).click();
  }
}

export function choosePadCheckpoint(page: Page, code: string) {
  return choosePadOption(page, 'Checkpoint', new RegExp(`^${code} · `));
}
