import {test,expect} from '@playwright/test';

/**
 * QA-1 post-Euclid journey: a visual theme is not a data mutation.
 * Navigate through every primary destination, approve exactly one proposal,
 * and verify that the Home count updates without a reload or implicit approval.
 */
for (const world of ['graph','graph-night'] as const) {
 test(`QA-1 Euclid cross-screen study loop and explicit approval: ${world}`,async({page})=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:390,height:844});
  await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}));
  await page.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}));
  await page.goto(`/lemma/?demo=1&theme=${world}&effects=calm#/`);
  const nav=page.getByRole('navigation',{name:'Main navigation'});
  await expect(page.locator('html')).toHaveAttribute('data-theme',world);
  await expect(nav.getByRole('link')).toHaveCount(4);
  await expect(nav.getByRole('link',{name:'Today'})).toHaveAttribute('aria-current','page');
  await expect(page.getByRole('link',{name:/Review 6 tutor proposals/})).toBeVisible();

  await nav.getByRole('link',{name:'Paths'}).click();
  await expect(nav.getByRole('link',{name:'Paths'})).toHaveAttribute('aria-current','page');
  await expect(page.getByRole('heading',{name:'Paths',level:1})).toBeVisible();
  await expect(page.locator('[data-project-row="real-analysis"]')).toContainText('Real Analysis');

  await nav.getByRole('link',{name:'Review'}).click();
  await expect(nav.getByRole('link',{name:'Review'})).toHaveAttribute('aria-current','page');
  await expect(page.getByRole('region',{name:'Review summary'}).getByText('23',{exact:true})).toBeVisible();

  await nav.getByRole('link',{name:'Insights'}).click();
  await expect(nav.getByRole('link',{name:'Insights'})).toHaveAttribute('aria-current','page');
  await expect(page.getByRole('heading',{name:'Insights',level:1})).toBeVisible();
  await expect(page.getByRole('group',{name:'Study totals'}).or(page.locator('[aria-label="Study totals"]'))).toBeVisible();

  await nav.getByRole('link',{name:'Today'}).click();
  await expect(page.getByRole('link',{name:/Review 6 tutor proposals/})).toBeVisible();
  await page.getByRole('navigation',{name:'Desk actions'}).getByRole('link',{name:'Open proposals'}).click();
  await expect(page.getByRole('button',{name:/Cards 5/})).toBeVisible();
  await page.getByRole('button',{name:'Approve card'}).click();
  await expect(page.getByRole('button',{name:/Cards 4/})).toBeVisible();
  // Hash-router back keeps the in-memory demo adapter; a full reload would
  // hide a missing Home query invalidation by resetting the fixture.
  await page.goBack();
  await expect(page.getByRole('link',{name:/Review 5 tutor proposals/})).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme',world);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect(errors).toEqual([]);
  await page.screenshot({path:`test-results/screens/review/qa1-euclid-journey-${world}.png`,fullPage:true});
 });
}
