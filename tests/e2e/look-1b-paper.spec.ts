import {expect,test} from '@playwright/test';

for(const profile of ['stress','extreme'] as const)
for(const theme of ['graph','graph-night'] as const)
for(const width of [360,390] as const){
 test(`LOOK-1b paper is one layer ${profile} ${theme} ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:width===360?740:844});
  await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}));
  await page.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}));
  await page.goto(`./?demo=${profile}&theme=${theme}#/`);
  await expect(page.locator('#main-content')).toBeVisible();
  // A nested component is a semantic group, not a second paper card.
  await expect(page.locator(':is(.card,.slab,.tile) :is(.card,.slab,.tile)')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({path:`test-results/screens/look-1b-${profile}-${theme}-${width}.png`});
 });
}
