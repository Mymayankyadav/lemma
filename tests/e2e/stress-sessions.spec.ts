import {test, expect} from '@playwright/test';
import {mkdirSync} from 'node:fs';

for (const [profile, theme, width, height] of [
  ['stress', 'graph', 390, 844],
  ['extreme', 'graph-night', 360, 740],
] as const) {
  test(`ST-0 session detail: ${profile} renders populated reasoning history`, async ({page}) => {
    test.setTimeout(180_000);
    await page.setViewportSize({width, height});
    await page.route('https://fonts.googleapis.com/**', route => route.fulfill({body:''}));
    await page.route('https://fonts.gstatic.com/**', route => route.fulfill({body:''}));
    await page.goto(`/lemma/?demo=${profile}&theme=${theme}#/s/real-analysis/7`, {waitUntil:'domcontentloaded', timeout:90_000});
    await expect(page.getByRole('heading', {name:'Session record', exact:true})).toBeVisible({timeout:90_000});
    await expect(page.getByRole('heading', {name:'Reasoning', exact:true})).toBeVisible();
    await expect(page.getByText('No reasoning events recorded for this session.')).toHaveCount(0);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    mkdirSync('test-results/screens/stress', {recursive:true});
    await page.screenshot({path:`test-results/screens/stress/session-events-${profile}-${theme}-${width}.png`, fullPage:false});
  });
}
