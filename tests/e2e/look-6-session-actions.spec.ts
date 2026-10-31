import {test,expect} from '@playwright/test';
import {mkdirSync} from 'node:fs';

for(const profile of ['1','stress','extreme'] as const)
for(const theme of ['graph','graph-night'] as const)
for(const width of [360,390] as const){
 test('LOOK-6 Session keeps one primary action and quiet text actions '+profile+' '+theme+' '+width,async({page})=>{
  test.setTimeout(180_000);
  await page.setViewportSize({width,height:844});
  await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:''}));
  await page.route('https://fonts.gstatic.com/**',r=>r.fulfill({body:''}));
  await page.goto('./?demo='+profile+'&theme='+theme+'#/s/real-analysis/7',{waitUntil:'domcontentloaded',timeout:90_000});
  await expect(page.getByRole('heading',{name:'Session record',level:1})).toBeVisible({timeout:90_000});
  const actions=page.getByRole('group',{name:'Session actions'});
  await expect(actions).toBeVisible();
  await expect(actions.getByRole('button',{name:'Start studying'})).toHaveCount(1);
  await expect(actions.getByRole('button',{name:'Copy session summary'})).toBeVisible();
  await expect(actions.getByRole('link',{name:'Review'})).toHaveAttribute('href','#/proposals');
  await expect(actions.getByRole('button',{name:'Pages'})).toBeVisible();
  await expect(actions.locator('.lit')).toHaveCount(1);
  await expect(actions.locator('.tile')).toHaveCount(0);
  await expect(actions.getByRole('link',{name:'Review'})).not.toHaveClass(/lit|tile/);
  for(const target of await actions.locator('button,a[href]').all()){
   const box=await target.boundingBox();
   expect(box?.height??0).toBeGreaterThanOrEqual(44);
   expect(box?.width??0).toBeGreaterThanOrEqual(44);
  }
  // Secondary actions must use quiet ink, never the red-pencil primary accent.
  const ink=await page.evaluate(()=>{
   const probe=document.createElement('span');
   probe.style.color='var(--ink-2)';
   document.body.appendChild(probe);
   const value=getComputedStyle(probe).color;
   probe.remove();
   return value;
  });
  for(const control of [
   actions.getByRole('button',{name:'Copy session summary'}),
   actions.getByRole('link',{name:'Review'}),
   actions.getByRole('button',{name:'Pages'}),
  ])expect(await control.evaluate(el=>getComputedStyle(el).color)).toBe(ink);
  mkdirSync('test-results/screens/look-6a',{recursive:true});
  await actions.scrollIntoViewIfNeeded();
  await page.screenshot({path:`test-results/screens/look-6a/session-actions-${profile}-${theme}-${width}.png`});
  await actions.getByRole('button',{name:'Pages'}).click();
  await expect(page.getByRole('dialog',{name:'Session pages'})).toBeVisible();
  await page.screenshot({path:`test-results/screens/look-6a/session-pages-${profile}-${theme}-${width}.png`});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
 });
}
