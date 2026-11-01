import {test,expect} from '@playwright/test';
import {mkdirSync} from 'node:fs';

// The merged FastTex primitive must preserve the real Route and stage UI,
// including mathematical titles, without eagerly importing the rich renderer.
test.describe.configure({retries:0});
for(const profile of ['stress','extreme'] as const)
for(const theme of ['graph','graph-night'] as const)
for(const width of [360,390] as const){
 test('FIX-659n Project FastTex Route '+profile+' '+theme+' '+width,async({page})=>{
  test.setTimeout(90_000);
  await page.setViewportSize({width,height:width===360?740:844});
  await page.goto('/lemma/?demo='+profile+'&theme='+theme+'#/p/real-analysis',{waitUntil:'domcontentloaded'});
  await expect(page.getByRole('region',{name:'Project timeline'})).toBeVisible();
  await expect(page.getByRole('region',{name:'Stages'})).toBeVisible();
  await expect(page.locator('[data-stage-card]').first()).toBeVisible();
  const next=page.getByRole('button',{name:'Next checkpoint'});
  await expect(next).toBeVisible();
  const box=await next.boundingBox();
  expect(box?.width??0).toBeGreaterThanOrEqual(44);
  expect(box?.height??0).toBeGreaterThanOrEqual(44);
  const metrics=await page.evaluate(()=>({
   nodes:document.querySelectorAll('*').length,
   overflow:document.documentElement.scrollWidth-innerWidth,
  }));
  expect(metrics.nodes).toBeLessThan(1500);
  expect(metrics.overflow).toBeLessThanOrEqual(1);
  mkdirSync('test-results/screens/fix-659n',{recursive:true});
  await page.screenshot({path:'test-results/screens/fix-659n/'+profile+'-'+theme+'-'+width+'.png',animations:'disabled'});
 });
}

test('FIX-659n retains rich KaTeX stage names and 16px maths at 360px',async({page})=>{
 await page.setViewportSize({width:360,height:740});
 await page.goto('/lemma/?demo=extreme&theme=graph-night#/p/stress-project-3',{waitUntil:'domcontentloaded'});
 await expect(page.getByRole('region',{name:'Stages'})).toBeVisible();
 const jumps=page.getByRole('navigation',{name:'Jump to stage'});
 await expect(jumps).toBeVisible();
 for(const stageIndex of [13,14]){
  const chip=jumps.locator('[data-stage-chip="'+stageIndex+'"]');
  const math=chip.locator('.katex');
  await expect(math).toBeVisible();
  const size=await math.evaluate(element=>parseFloat(getComputedStyle(element).fontSize));
  expect(size).toBeGreaterThanOrEqual(16);
 }
 await expect(page.locator('[data-stage-card]')).toHaveCount(15);
});
