import {test,expect} from '@playwright/test';
import {mkdirSync} from 'node:fs';

// AUDIT #686: v4 Project stages form ONE paper list with hairline
// section separators, not a stack of nested bordered cards. Checkpoint
// status words remain accessible but are represented visually by icons.
test.describe.configure({retries:0});
for(const profile of ['stress','extreme'] as const)
for(const theme of ['graph','graph-night'] as const)
for(const width of [360,390] as const){
 test('FIX #686 single Project stage paper '+profile+' '+theme+' '+width,async({page})=>{
  test.setTimeout(90_000);
  await page.setViewportSize({width,height:width===360?740:844});
  await page.goto('/lemma/?demo='+profile+'&theme='+theme+'#/p/real-analysis',{waitUntil:'domcontentloaded'});
  const region=page.getByRole('region',{name:'Stages'});
  await expect(region).toBeVisible();
  const paper=region.locator('[data-stage-paper]');
  await expect(paper,'all stages share one paper surface').toHaveCount(1);
  const stages=paper.locator('[data-stage-card]');
  expect(await stages.count()).toBeGreaterThan(1);
  await expect(paper.locator('[data-stage-card][data-card]')).toHaveCount(0);
  const expanded=stages.locator(':scope > button[aria-expanded="true"]');
  await expect(expanded).toHaveCount(1);
  const rows=paper.locator('[data-cp-row]');
  await expect(rows.first()).toBeVisible();
  for(const row of await rows.all()){
   await expect(row.locator('[data-cp-status-icon]')).toHaveCount(1);
   expect((await row.locator('[data-cp-status-icon]').textContent())??'').not.toMatch(/up next|locked|re-check|in progress|proposed|done/i);
   expect(await row.getAttribute('aria-label')).toMatch(/, (done|re-check|in progress|up next|locked|proposed)$/);
  }
  // Keep a stable stage index: an aria-expanded=true locator disappears
  // after collapsing and cannot be clicked a second time.
  const activeIndex=await stages.evaluateAll(nodes=>nodes.findIndex(node=>node.querySelector(':scope > button[aria-expanded="true"]')));
  expect(activeIndex).toBeGreaterThanOrEqual(0);
  const toggle=stages.nth(activeIndex).locator('button[aria-expanded]').first();
  expect((await toggle.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded','false');
  await expect(paper.locator('[data-cp-row]')).toHaveCount(0);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded','true');
  await expect(rows.first()).toBeVisible();
  expect(await page.locator('*').count()).toBeLessThan(1500);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  mkdirSync('test-results/screens/fix-686',{recursive:true});
  await page.screenshot({path:'test-results/screens/fix-686/stages-'+profile+'-'+theme+'-'+width+'.png',animations:'disabled'});
 });
}
