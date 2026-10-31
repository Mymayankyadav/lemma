import {test,expect} from '@playwright/test';

for(const [profile,total,width] of [['stress',50000,390],['extreme',300000,360]] as const)
for(const theme of ['graph','graph-night'] as const){
 test('FIX #460 Insights renders bounded '+total+'-review history: '+profile+' '+theme,async({page})=>{
  test.setTimeout(180_000);
  await page.setViewportSize({width,height:740});
  await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}));
  await page.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}));
  await page.goto('/lemma/?demo='+profile+'&theme='+theme+'#/insights',{waitUntil:'domcontentloaded',timeout:90_000});
  await expect(page.getByRole('heading',{name:'Insights',level:1})).toBeVisible({timeout:90_000});
  await page.getByRole('group',{name:'Time range'}).getByRole('button',{name:'90 days'}).click();
  await expect(page.getByLabel('Study totals').locator('strong').nth(2)).toHaveText(total.toLocaleString('en-US').replaceAll(',',' '),{timeout:90_000});
  const bars=page.locator('svg[aria-label^="Reviews by day:"]');
  await expect(bars).toHaveAttribute('aria-label',new RegExp('and '+total+' reviews\\.'));
  expect(await bars.locator('rect[data-review-grade]').count()).toBeGreaterThan(0);
  const size=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth-innerWidth,nodes:document.querySelectorAll('*').length}));
  expect(size.overflow).toBeLessThanOrEqual(0);
  expect(size.nodes).toBeLessThan(1500);
 });
}
