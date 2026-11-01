import {test,expect} from '@playwright/test';
import {mkdirSync} from 'node:fs';

// The Project's real plan and Route must be visible without waiting for
// the supplemental 30-day Insights request. This complements the strict
// first-attempt CPU acceptance owned by FIX-659b #670.
test.describe.configure({retries:0});
for(const profile of ['stress','extreme'] as const)
for(const theme of ['graph','graph-night'] as const)
for(const width of [360,390] as const){
 test('FIX-659k Project Route before supplemental insights '+profile+' '+theme+' '+width,async({page})=>{
  test.setTimeout(90_000);
  await page.setViewportSize({width,height:width===360?740:844});
  await page.goto('/lemma/?demo='+profile+'&theme='+theme+'#/p/real-analysis',{waitUntil:'domcontentloaded'});
  await expect(page.getByRole('region',{name:'Goal and distance'})).toBeVisible();
  await expect(page.getByRole('region',{name:'Project timeline'})).toBeVisible();
  await expect(page.locator('[data-route-now] [data-code]')).toContainText(/CP\d+/);
  await expect(page.getByRole('region',{name:'Stages'})).toBeVisible();
  const metrics=await page.evaluate(()=>({
   overflow:Math.max(0,document.documentElement.scrollWidth-innerWidth),
   nodes:document.querySelectorAll('*').length,
  }));
  expect(metrics.overflow).toBeLessThanOrEqual(1);
  expect(metrics.nodes).toBeLessThan(1500);
  mkdirSync('test-results/screens/fix-659k',{recursive:true});
  await page.screenshot({path:'test-results/screens/fix-659k/'+profile+'-'+theme+'-'+width+'.png'});
 });
}
