import {test, expect} from '@playwright/test';
import {mkdirSync} from 'node:fs';

for (const profile of ['stress','extreme'] as const)
for (const theme of ['graph','graph-night'] as const)
for (const [width,height] of [[390,844],[360,740]] as const) {
  test(`ST-0 session detail: ${profile} ${theme} ${width}px has stored and lazy reasoning histories`, async ({page}) => {
    test.setTimeout(180_000);
    await page.setViewportSize({width, height});
    await page.route('https://fonts.googleapis.com/**', route => route.fulfill({body:''}));
    await page.route('https://fonts.gstatic.com/**', route => route.fulfill({body:''}));
    await page.goto(`/lemma/?demo=${profile}&theme=${theme}#/s/real-analysis/7`, {waitUntil:'domcontentloaded', timeout:90_000});
    await expect(page.getByRole('heading', {name:'Session record', exact:true})).toBeVisible({timeout:90_000});
    await expect(page.getByRole('heading', {name:'Reasoning', exact:true})).toBeVisible();
    await expect(page.getByText('No reasoning events recorded for this session.')).toHaveCount(0);
    const bounds=async()=>page.evaluate(()=>({
      overflow:document.documentElement.scrollWidth-innerWidth,
      nodes:document.querySelectorAll('*').length,
    }));
    const stored=await bounds();
    expect(stored.overflow).toBeLessThanOrEqual(1);
    expect(stored.nodes).toBeLessThan(1500);
    mkdirSync('test-results/screens/stress', {recursive:true});
    await page.screenshot({path:`test-results/screens/stress/session-events-${profile}-${theme}-${width}.png`, fullPage:false});
    // S8 is not materialised in the fixture: getSession synthesises its
    // 150/400 events only on navigation and keeps the same nine-hint folding.
    await page.evaluate(() => { location.hash = '/s/real-analysis/8'; });
    await expect(page.getByRole('heading', {name:'Session 8', exact:true})).toBeVisible({timeout:90_000});
    const reasoning = page.getByRole('region', {name:'Reasoning'});
    await expect(reasoning.getByRole('button', {name:/9 hints/}).first()).toBeVisible({timeout:90_000});
    const lazy=await bounds();
    expect(lazy.overflow).toBeLessThanOrEqual(1);
    expect(lazy.nodes).toBeLessThan(1500);
    await page.screenshot({path:`test-results/screens/stress/session-lazy-${profile}-${theme}-${width}.png`, fullPage:false});
  });
}
