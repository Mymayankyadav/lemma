import {test,expect} from '@playwright/test';
import {mkdirSync} from 'node:fs';

// FIX #656: cold plan-change rendering must retain every required region.
// The independent 144-route FIX #540 matrix enforces the 4x CPU <1500ms
// budget; these eight cases protect the real content during optimization.
for(const profile of ['stress','extreme'] as const)
for(const theme of ['graph','graph-night'] as const)
for(const width of [390,360] as const){
 test('FIX #656 cold plan change retains map, amendments and ideas: '+profile+' '+theme+' '+width,async({page})=>{
  test.setTimeout(120_000);
  await page.setViewportSize({width,height:width===360?740:844});
  await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:''}));
  await page.route('https://fonts.gstatic.com/**',r=>r.fulfill({body:''}));
  await page.goto('/lemma/?demo='+profile+'&theme='+theme+'#/proposals/proposal-6',{waitUntil:'domcontentloaded',timeout:90_000});
  await expect(page.getByRole('heading',{name:'Plan proposal',level:1})).toBeVisible({timeout:90_000});
  await expect(page.getByRole('heading',{name:'Plan change',level:2})).toBeVisible({timeout:90_000});
  await expect(page.getByRole('region',{name:'Plan errata'})).toBeVisible({timeout:90_000});
  await expect(page.getByRole('region',{name:'Ideas in this plan'}).getByRole('tree',{name:'Ideas in this plan'})).toBeVisible({timeout:90_000});
  await expect(page.getByLabel('Checkpoint prerequisites')).toBeVisible({timeout:90_000});
  await expect(page.getByText('This proposal could not be loaded.')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  expect(await page.locator('*').count()).toBeLessThan(1500);
  mkdirSync('test-results/screens/fix-656',{recursive:true});
  await page.screenshot({path:'test-results/screens/fix-656/'+profile+'-'+theme+'-'+width+'.png'});
 });
}
