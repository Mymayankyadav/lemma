import type {Page} from '@playwright/test';

/**
 * N227 (Owner: "wire the scratch pad to the pencil in the suggestion strip and remove the pencil from the input box"):
 * the scratch pad opens from the keyboard strip's pencil, so the keyboard is opened first when it is down.
 */
export async function openScratch(page: Page) {
  const button = page.getByRole('group', {name: 'Answer keyboard', exact: true}).getByRole('button', {name: 'Scratch', exact: true});
  if (!(await button.isVisible())) await page.getByRole('textbox', {name: 'Your answer', exact: true}).focus();
  await button.click();
}
