import {expect, test} from '@playwright/test';

// N222 (Owner task): equation mode turns typed maths into symbols as each piece is finished; an ambiguous equation
// such as x2+y2=1 offers both readings in the strip instead of being changed by itself.
test('equation mode converts typed maths, undoes with Backspace and offers both readings of x2+y2=1', async ({page}) => {
  await page.setViewportSize({width: 393, height: 873});
  await page.goto('/lemma/?demo=1&flags=v7Shell,v6Shell,tutorScratch#/p/real-analysis/cp/CP4/tutor');
  await page.getByRole('button', {name: 'Write a question', exact: true}).click();
  const answer = page.getByRole('textbox', {name: 'Your answer', exact: true});
  await answer.focus();
  const keyboard = page.getByRole('group', {name: 'Answer keyboard', exact: true});
  const geometry = () => Promise.all([keyboard.boundingBox(), keyboard.getByRole('button', {name: 'q', exact: true}).boundingBox(),
    keyboard.getByRole('button', {name: 'Space', exact: true}).boundingBox(), page.locator('.kb .strip').boundingBox()]);
  const before = await geometry();
  const toggle = keyboard.getByRole('button', {name: 'Equation mode', exact: true});
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  // The keyboard's layout does not move.
  expect(await geometry()).toEqual(before);

  await page.keyboard.type('root 2 + x^2 <= 1/2 ');
  await expect(answer).toHaveJSProperty('textContent', '√2 + x² ≤ ½ ');
  await page.keyboard.press('Backspace');
  await expect(answer).toHaveJSProperty('textContent', '√2 + x² ≤ 1/2 ');

  await answer.fill('');
  await page.keyboard.type('x2+y2=1');
  await expect(answer).toHaveJSProperty('textContent', 'x2+y2=1');
  const choices = keyboard.getByRole('group', {name: 'Equation suggestions', exact: true});
  const quadratic = choices.getByRole('button', {name: 'Insert x²+y²=1', exact: true});
  await expect(quadratic).toHaveClass(/preferred/);
  await expect(choices.getByRole('button', {name: 'Insert x₂+y₂=1', exact: true})).toBeVisible();
  await quadratic.click();
  await expect(answer).toHaveJSProperty('textContent', 'x²+y²=1');

  // After a variable, its square and indices; Off again leaves ordinary typing alone.
  await page.keyboard.type(' = y');
  await choices.getByRole('button', {name: 'Insert y²', exact: true}).click();
  await expect(answer).toHaveJSProperty('textContent', 'x²+y²=1 = y²');
  await toggle.click();
  await expect(choices).toHaveCount(0);
  await page.keyboard.type(' root 2 ');
  await expect(answer).toHaveJSProperty('textContent', 'x²+y²=1 = y² root 2 ');
  expect(await geometry()).toEqual(before);
});
