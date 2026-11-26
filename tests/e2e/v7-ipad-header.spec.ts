import {expect, test, type Page} from '@playwright/test';

// N252 (Owner, with screenshots of Today and of the Claude app on an iPad: "for iPad you might have to add proper
// padding in the header"). An iPad shows the page under its status bar; iPadOS apps put their navigation bar right
// beneath it and leave room before the content.

const IPAD_UA = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

async function open(page: Page, iPad: boolean, hash: string) {
  if (iPad) await page.addInitScript(userAgent => {
    Object.defineProperties(navigator, {userAgent: {get: () => userAgent}, platform: {get: () => 'iPad'}, maxTouchPoints: {get: () => 5}});
  }, IPAD_UA);
  await page.setViewportSize({width: 820, height: 1180});
  await page.goto('/lemma/?demo=1&flags=v7Shell,v6Shell' + hash);
}
const box = (page: Page, selector: string) => page.locator(selector).first().boundingBox().then(found => found!);

test('on an iPad, Today\'s header sits right under the status bar with room before the title, the rail\'s + on its row', async ({page}) => {
  await open(page, true, '#/');
  await expect(page.locator('html')).toHaveAttribute('data-ipad', '');
  const row = await box(page, '.v7-hub-header > .v7-hub-row');
  const title = await box(page, '.v7-hub-header > .v7-hub-title');
  const capture = await box(page, '.v7-dock .v7-capture');
  // The row: 48 px, 4 px from the top of the page (the Claude app's bar is centred about 22 pt under the status bar).
  expect(row.y).toBeCloseTo(4, 0);
  expect(row.height).toBeCloseTo(48, 0);
  // The day's title has 24 px of room under the row (it had 8).
  expect(title.y - (row.y + row.height)).toBeCloseTo(24, 0);
  // The rail's + is centred on the header row, as before.
  expect(Math.abs((capture.y + capture.height / 2) - (row.y + row.height / 2))).toBeLessThanOrEqual(2);
  // The other hubs' bars share the row's height and place.
  await page.goto('/lemma/?demo=1&flags=v7Shell,v6Shell#/review');
  const bar = await box(page, '.v7-hub-bar .v7-hub-row');
  expect(bar.y + bar.height / 2).toBeCloseTo(row.y + row.height / 2, 0);
});

test('other tablets and desktops keep Today\'s header as it was', async ({page}) => {
  await open(page, false, '#/');
  await expect(page.locator('html')).not.toHaveAttribute('data-ipad', '');
  const row = await box(page, '.v7-hub-header > .v7-hub-row');
  const title = await box(page, '.v7-hub-header > .v7-hub-title');
  expect(row.y).toBeCloseTo(8, 0);
  expect(row.height).toBeCloseTo(56, 0);
  expect(title.y - (row.y + row.height)).toBeCloseTo(8, 0);
});
