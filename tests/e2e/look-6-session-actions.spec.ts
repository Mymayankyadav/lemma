import {test,expect} from '@playwright/test';

for(const theme of ['graph','graph-night'] as const)
for(const width of [360,390] as const){
 test('LOOK-6 Session keeps one primary action and quiet text actions '+theme+' '+width,async({page})=>{
  await page.setViewportSize({width,height:844});
  await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:''}));
  await page.route('https://fonts.gstatic.com/**',r=>r.fulfill({body:''}));
  await page.goto('./?demo=1&theme='+theme+'#/s/real-analysis/7');
  await expect(page.getByRole('heading',{name:'Session record',level:1})).toBeVisible();
  const actions=page.getByRole('group',{name:'Session actions'});
  await expect(actions).toBeVisible();
  await expect(actions.getByRole('button',{name:'Start studying'})).toHaveCount(1);
  await expect(actions.getByRole('button',{name:'Copy session summary'})).toBeVisible();
  await expect(actions.getByRole('link',{name:'Review'})).toHaveAttribute('href','#/proposals');
  await expect(actions.getByRole('button',{name:'Pages'})).toBeVisible();
  await expect(actions.locator('.tile,.lit')).toHaveCount(0);
  for(const target of await actions.locator('button,a[href]').all()){
   const box=await target.boundingBox();
   expect(box?.height??0).toBeGreaterThanOrEqual(44);
  }
  await actions.getByRole('button',{name:'Pages'}).click();
  await expect(page.getByRole('dialog',{name:'Session pages'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
 });
}
