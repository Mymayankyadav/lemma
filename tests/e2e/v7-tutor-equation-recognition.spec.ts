import {expect, test, type Page} from '@playwright/test';
import {openScratch} from './helpers/scratch';

// N221 (Owner task): handwritten equation recognition in the scratch pad. The model (Pix2Text MFR, MIT, 118 MB) only
// downloads when the learner asks; these tests never download it: Hugging Face is answered by the test.
const url = '/lemma/?demo=1&flags=v7Shell,tutorScratch#/p/real-analysis/cp/CP4/tutor';
const pad = (page: Page) => page.getByRole('region', {name: 'Scratch pad'});
const recognize = (page: Page) => pad(page).getByRole('button', {name: 'Recognize equation', exact: true});

async function drawOnePlusOne(page: Page) {
  const box = (await page.getByRole('region', {name: 'Drawing paper'}).boundingBox())!;
  for (const stroke of [[[50, 30], [50, 100]], [[80, 65], [130, 65]], [[105, 40], [105, 90]], [[160, 30], [160, 100]]]) {
    await page.mouse.move(box.x + stroke[0][0], box.y + stroke[0][1]);
    await page.mouse.down();
    await page.mouse.move(box.x + stroke[1][0], box.y + stroke[1][1], {steps: 4});
    await page.mouse.up();
  }
}

test('Recognize equation asks before its one-time download and keeps the drawing when the download fails', async ({page, context}) => {
  const requests: string[] = [];
  await context.route('https://huggingface.co/**', route => {
    requests.push(new URL(route.request().url()).pathname);
    return route.fulfill({status: 503, body: 'unavailable', headers: {'access-control-allow-origin': '*'}});
  });
  await page.goto(url);
  await page.getByRole('button', {name: 'Write a question'}).click();
  await openScratch(page);
  await expect(recognize(page)).toBeDisabled();
  await drawOnePlusOne(page);
  await expect(recognize(page)).toBeEnabled();

  await recognize(page).click();
  const sheet = page.getByRole('dialog', {name: 'Recognize equation'});
  await expect(sheet).toContainText('about 118 MB');
  await expect(sheet).toContainText('Pix2Text MFR (MIT licence)');
  expect(requests).toEqual([]);
  await sheet.getByRole('button', {name: 'Not now', exact: true}).click();
  await expect(sheet).toHaveCount(0);

  await recognize(page).click();
  await sheet.getByRole('button', {name: 'Download and recognize', exact: true}).click();
  await expect(sheet.getByRole('alert')).toContainText('could not be downloaded (503)');
  await expect(sheet.getByRole('alert')).toContainText('Your drawing is still here.');
  expect(requests.every(path => path.startsWith('/breezedeus/pix2text-mfr/resolve/bea257edb2653f2ae413b084f2ac0e8299d08df0/'))).toBe(true);
  await sheet.getByRole('button', {name: 'Not now', exact: true}).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByRole('img', {name: 'Draw your answer'}).locator('path')).toHaveCount(4);
});

test('a model file that does not match its checksum is refused', async ({page, context}) => {
  await context.route('https://huggingface.co/**', route =>
    route.fulfill({status: 200, body: 'not the model', headers: {'access-control-allow-origin': '*'}}));
  await page.goto(url);
  await page.getByRole('button', {name: 'Write a question'}).click();
  await openScratch(page);
  await drawOnePlusOne(page);
  await recognize(page).click();
  const sheet = page.getByRole('dialog', {name: 'Recognize equation'});
  await sheet.getByRole('button', {name: 'Download and recognize', exact: true}).click();
  await expect(sheet.getByRole('alert')).toContainText('did not match its checksum');
  await expect(sheet.getByRole('button', {name: 'Insert into answer'})).toHaveCount(0);
});
