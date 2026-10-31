import {test, expect} from '@playwright/test';
import {mkdirSync} from 'node:fs';

// Every source-page stress profile must remain usable in both Graph worlds
// and at both supported phone widths, not only the two diagonal cases.
for (const [profile, sourceCount, pageCount] of [
  ['stress', 30, 1200],
  ['extreme', 100, 3000],
] as const)
for (const theme of ['graph', 'graph-night'] as const)
for (const [width, height] of [[390, 844], [360, 740]] as const) {
  test(`ST-0 Sources fixture: ${profile} has ${sourceCount} sources and ${pageCount}-page navigation`, async ({page}) => {
    test.setTimeout(180_000);
    await page.setViewportSize({width, height});
    await page.route('https://fonts.googleapis.com/**', route => route.fulfill({body:''}));
    await page.route('https://fonts.gstatic.com/**', route => route.fulfill({body:''}));
    await page.goto(`/lemma/?demo=${profile}&theme=${theme}#/p/real-analysis?tab=sources`, {waitUntil:'domcontentloaded', timeout:90_000});
    const sources = page.getByRole('region', {name:'Sources'});
    // SourcesPanel is a section, not a region until an accessible name is present.
    await expect(sources.getByRole('group', {name:'Source storage'})).toContainText(`${sourceCount} sources`, {timeout:90_000});
    // ST-6 folds large source groups; open Notes when the fold control exists.
    const notesFold = sources.getByRole('button', {name:/notes ·/i});
    if (await notesFold.count()) await notesFold.click();
    const source = sources.getByText('Source 5: mathematical notes and proofs');
    await expect(source).toBeVisible();
    const tile = source.locator('xpath=ancestor::*[contains(concat(" ",normalize-space(@class)," ")," tile ")][1]');
    await tile.getByRole('button', {name:'View pages'}).click();
    const viewer = tile.getByRole('region', {name:/Page transcription for Source 5/});
    await expect(viewer).toBeVisible();
    await expect(viewer).toContainText(`of ${pageCount}`);
    await expect(viewer).toContainText('Synthetic mathematics notes, page 1');
    await viewer.getByRole('spinbutton', {name:'PDF page number'}).fill(String(pageCount));
    await expect(viewer).toContainText(`Synthetic mathematics notes, page ${pageCount}`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    mkdirSync('test-results/screens/stress', {recursive:true});
    await page.screenshot({path:`test-results/screens/stress/source-pages-${profile}-${theme}-${width}.png`, fullPage:false});
  });
}
