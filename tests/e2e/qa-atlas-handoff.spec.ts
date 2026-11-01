import {test,expect} from '@playwright/test';

/** QA-1: prove the new Atlas is part of the study loop, not an isolated demo. */
for(const world of ['graph','graph-night'] as const){
 test(`QA-1 Atlas-to-checkpoint handoff: ${world}`,async({page})=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:390,height:844});
  await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}));
  await page.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}));
  await page.goto(`/lemma/?demo=1&theme=${world}&effects=calm#/`);
  await expect(page.getByRole('link',{name:/Review 6 tutor proposals/})).toBeVisible();
  await page.getByRole('navigation',{name:'Desk actions'}).getByRole('link',{name:'Open the Atlas'}).click();
  await expect(page).toHaveURL(/#\/atlas$/);
  await expect(page.getByRole('heading',{name:'Atlas',level:1})).toBeVisible();
  await expect(page.locator('[data-level="cluster"]')).toHaveCount(3);
  await expect(page.getByRole('tree',{name:'Ideas and their links'})).toHaveAttribute('data-atlas-field-count','3');
  await expect(page.locator('[data-atlas-details]')).toHaveCount(0);
  await page.getByRole('button',{name:'Find an idea'}).click();
  await page.getByRole('textbox',{name:'Find an idea'}).fill('Compactness');
  await page.getByRole('button',{name:/^Compactness, /}).click();
  await page.locator('[data-atlas-peek]').getByRole('button',{name:'Details'}).click();
  await expect(page.getByRole('heading',{name:'Compactness'})).toBeVisible();
  await page.getByRole('link',{name:'Checkpoint CP4'}).click();
  await expect(page).toHaveURL(/#\/p\/real-analysis\/cp\/CP4$/);
  await expect(page.getByText('Compactness',{exact:true}).first()).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme',world);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect(errors).toEqual([]);
  await page.screenshot({path:`test-results/screens/review/qa1-atlas-checkpoint-${world}.png`,fullPage:true});
 });
}
