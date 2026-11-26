import {expect, test, type Page} from '@playwright/test';

// N252 · the iPad layout (docs/v7/ipad-audit-2026-11-26.md), at the Owner's iPad: 820 × 1180 pt, the page under a 32 pt
// status bar (820 × 1148 in portrait, 1180 × 788 in landscape). Owner: "proper padding in the header", "Almost all the
// screens have this empty space therefore waste of space, fix the layout in landscape mode too", "This looks very oddly
// placed".

const IPAD_UA = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const PORTRAIT = {width: 820, height: 1148}, LANDSCAPE = {width: 1180, height: 788};

async function asIPad(page: Page, size = PORTRAIT) {
  await page.addInitScript(userAgent => {
    Object.defineProperties(navigator, {userAgent: {get: () => userAgent}, platform: {get: () => 'iPad'}, maxTouchPoints: {get: () => 5}});
  }, IPAD_UA);
  await page.setViewportSize(size);
}
async function open(page: Page, hash: string) {
  await page.goto('/lemma/?demo=1&flags=v7Shell,v6Shell' + hash);
  await expect(page.locator('html')).toHaveAttribute('data-ipad', '');
}
const box = async (page: Page, selector: string) => {
  const target = page.locator(selector).first();
  await expect(target).toBeVisible();
  return (await target.boundingBox())!;
};
/** The highest line of text in the page's top bar (headers and the tutor's header). */
const topText = (page: Page) => page.evaluate(() => {
  let top = Infinity;
  for (const header of document.querySelectorAll('.v7-hub-header > .v7-hub-row, .v7-hub-bar, .v7-detail-header, .v7-immersive-header, .tutor-header')) {
    const walker = document.createTreeWalker(header, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode, parent = node.parentElement!;
      if (!node.textContent!.trim() || parent.closest('.v7-sr-only, .v7-count-badge')) continue;
      const range = document.createRange(); range.selectNodeContents(node);
      const rect = range.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) top = Math.min(top, rect.top);
    }
  }
  return top;
});

test.describe('on an iPad', () => {
  for (const [name, hash] of [['Today', '#/'], ['Paths', '#/projects'], ['Review', '#/review'], ['Calendar', '#/calendar'],
    ['Progress', '#/insights'], ['Settings', '#/settings'], ['a Path', '#/p/real-analysis'], ['a checkpoint', '#/p/real-analysis/cp/CP4'],
    ['Inbox', '#/proposals'], ['the tutor', '#/p/real-analysis/cp/CP4/tutor'], ['Focus', '#/focus']] as const) {
    test(`C1 · ${name}'s header text starts at least 24 pt under the status bar, clear of iPadOS's blur`, async ({page}) => {
      await asIPad(page);
      await open(page, hash);
      await expect.poll(() => topText(page)).toBeLessThan(80);
      // The line box; the letters themselves start a few points lower (the blur reaches about 25 pt).
      expect(await topText(page)).toBeGreaterThanOrEqual(24);
    });
  }

  test('C1–C2 · Today: a 48 pt row 20 pt down, the rail\'s + on it, and 24 pt above the title', async ({page}) => {
    await asIPad(page);
    await open(page, '#/');
    const row = await box(page, '.v7-hub-header > .v7-hub-row');
    const title = await box(page, '.v7-hub-header > .v7-hub-title');
    const capture = await box(page, '.v7-dock .v7-capture');
    expect(row.y).toBeCloseTo(20, 0);
    expect(row.height).toBeCloseTo(48, 0);
    expect(title.y - (row.y + row.height)).toBeCloseTo(24, 0);
    expect(Math.abs((capture.y + capture.height / 2) - (row.y + row.height / 2))).toBeLessThanOrEqual(2);
    // The other hubs' bars sit on the same line.
    await open(page, '#/review');
    const bar = await box(page, '.v7-hub-bar .v7-hub-row');
    expect(bar.y + bar.height / 2).toBeCloseTo(row.y + row.height / 2, 0);
  });

  test('C3 · Calendar\'s view switch never clips a label', async ({page}) => {
    for (const size of [PORTRAIT, LANDSCAPE]) {
      await asIPad(page, size);
      await open(page, '#/calendar?view=day');
      const segments = page.locator('.v7-cal-toolbar > .v7-segmented button');
      await expect(segments).toHaveCount(4);
      const clipped = await segments.evaluateAll(buttons => buttons.filter(button => button.scrollWidth > button.clientWidth + 1).map(button => button.textContent));
      expect(clipped).toEqual([]);
    }
  });

  test('C4 + C13 · Paths: cards at least 320 pt wide in two columns, step lines on up to two lines', async ({page}) => {
    for (const size of [PORTRAIT, LANDSCAPE]) {
      await asIPad(page, size);
      await open(page, '#/projects');
      const cards = page.locator('.v7-paths-card');
      await expect(cards.first()).toBeVisible();
      const boxes = await cards.evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect()).map(rect => ({x: Math.round(rect.left), w: rect.width})));
      for (const card of boxes) expect(card.w).toBeGreaterThanOrEqual(320);
      expect(new Set(boxes.map(card => card.x)).size).toBe(2);
      await expect(page.locator('.v7-paths-now').first()).toHaveCSS('white-space', 'normal');
    }
  });

  test('C5 · small links have a 44 pt hit area and the Path\'s rows are 44 pt tall', async ({page}) => {
    await asIPad(page);
    await open(page, '#/');
    const link = page.locator('.v7-card-heading > a').first();
    await expect(link).toBeVisible();
    const hit = await link.evaluate(node => {
      const rect = node.getBoundingClientRect(), x = rect.left + rect.width / 2;
      return [rect.top + rect.height / 2 - 20, rect.top + rect.height / 2 + 20].map(y => node.contains(document.elementFromPoint(x, y)));
    });
    expect(hit).toEqual([true, true]);
    await open(page, '#/p/real-analysis');
    await expect(page.locator('.v7-path-body').first()).toBeVisible();
    const rows = await page.locator('.v7-path-body').evaluateAll(nodes => nodes.filter(node => node.getBoundingClientRect().height > 0).map(node => node.getBoundingClientRect().height));
    expect(rows.length).toBeGreaterThan(0);
    for (const height of rows) expect(height).toBeGreaterThanOrEqual(44);
  });

  test('C6 + C12 · the review run: the empty state stands mid-page and the answer bar spans the card', async ({page}) => {
    await asIPad(page);
    await open(page, '#/review/run');
    const title = await box(page, '.v7-review-state .v7-hub-title');
    expect(Math.abs(title.y - PORTRAIT.height / 2)).toBeLessThan(PORTRAIT.height * .2);
    await open(page, '#/review');
    await page.getByRole('button', {name: /^Start review/}).click();
    const card = await box(page, '.v7-review-card');
    const dock = await box(page, '.v7-review-dock');
    expect(dock.width).toBeGreaterThan(card.width * .95);
  });

  test('C7 · pages use the width: hubs, Path, checkpoint, tutor and Close the day, in portrait and landscape', async ({page}) => {
    for (const size of [PORTRAIT, LANDSCAPE]) {
      await asIPad(page, size);
      await open(page, '#/insights');
      const rail = (await box(page, '.v7-dock')).width;
      const hub = await box(page, '.v7-hub-bar .v7-hub-row');
      expect(hub.width).toBeGreaterThan((size.width - rail) * .9);
      for (const hash of ['#/p/real-analysis', '#/p/real-analysis/cp/CP4', '#/today/close']) {
        await open(page, hash);
        const main = await box(page, 'main');
        expect(main.width, hash).toBeGreaterThan(size.width * .95);
        // The content starts at the page margin (24 or 32 pt), not in a centred phone column.
        const left = await page.locator('main').first().evaluate(node => node.getBoundingClientRect().left + parseFloat(getComputedStyle(node).paddingLeft));
        expect(left, hash).toBeLessThanOrEqual(40);
      }
      // Close the day's button bar spans the screen.
      const footer = await box(page, '.v7-cd-footer');
      expect(footer.width).toBeGreaterThan(size.width * .95);
      // The Path's floating bar spans the page.
      await open(page, '#/p/real-analysis');
      expect((await box(page, '.v7-path-bar')).width).toBeGreaterThan(size.width * .9);
      // The tutor's composer and keys.
      await open(page, '#/p/real-analysis/cp/CP4/tutor');
      await page.getByRole('button', {name: 'Write a question', exact: true}).click();
      await page.getByRole('textbox', {name: 'Your answer', exact: true}).focus();
      expect((await box(page, '.kb')).width).toBeGreaterThan(size.width * .9);
    }
  });

  test('C8 · in the wide rail Capture is a full-width row under Search, not a lone square', async ({page}) => {
    await asIPad(page, LANDSCAPE);
    await open(page, '#/');
    const search = await box(page, '.v7-rail-head button');
    const capture = await box(page, '.v7-dock .v7-capture');
    expect(capture.x).toBeCloseTo(search.x, 0);
    expect(capture.width).toBeCloseTo(search.width, 0);
    expect(capture.y).toBeGreaterThan(search.y + search.height);
    await expect(page.locator('.v7-dock .v7-capture .v7-capture-label')).toBeVisible();
    await expect(page.getByRole('button', {name: 'Capture', exact: true})).toBeVisible();
  });

  test('C9 · the Path\'s tabs start at the left with even gaps', async ({page}) => {
    for (const size of [PORTRAIT, LANDSCAPE]) {
      await asIPad(page, size);
      await open(page, '#/p/real-analysis');
      await expect(page.getByRole('tab')).toHaveCount(5);
      const tabs = await page.getByRole('tab').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect()).map(rect => ({x: rect.left, right: rect.right})));
      expect(tabs.length).toBe(5);
      const heading = await box(page, 'main h1');
      expect(tabs[0]!.x).toBeLessThan(heading.x + 24);
      const gaps = tabs.slice(1).map((tab, index) => tab.x - tabs[index]!.right);
      expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThanOrEqual(2);
      expect(tabs.at(-1)!.right).toBeLessThan(size.width * .75);
    }
  });

  test('C11 · Welcome is a wider column in the middle of the page', async ({page}) => {
    await asIPad(page, LANDSCAPE);
    await open(page, '#/welcome');
    const welcome = await box(page, 'main.v7-welcome');
    expect(welcome.width).toBeCloseTo(680, 0);
    const head = await box(page, '.v7-welcome-head');
    expect(head.y).toBeGreaterThan(LANDSCAPE.height * .1);
  });
});

test('other tablets keep the layout they had', async ({page}) => {
  await page.setViewportSize(PORTRAIT);
  await page.goto('/lemma/?demo=1&flags=v7Shell,v6Shell#/');
  await expect(page.locator('html')).not.toHaveAttribute('data-ipad', '');
  const row = await box(page, '.v7-hub-header > .v7-hub-row');
  const title = await box(page, '.v7-hub-header > .v7-hub-title');
  expect(row.y).toBeCloseTo(8, 0);
  expect(row.height).toBeCloseTo(56, 0);
  expect(title.y - (row.y + row.height)).toBeCloseTo(8, 0);
  await page.goto('/lemma/?demo=1&flags=v7Shell,v6Shell#/p/real-analysis');
  expect((await box(page, 'main')).width).toBeCloseTo(640, 0);
  await page.setViewportSize(LANDSCAPE);
  await page.goto('/lemma/?demo=1&flags=v7Shell,v6Shell#/');
  expect((await box(page, '.v7-dock .v7-capture')).width).toBeCloseTo(48, 0);
});
