import {test,expect} from '@playwright/test';
import {mkdirSync} from 'node:fs';

/** FIX #536: the unit test injects mathematical stage names; the stress
 * browser fixture verifies real stage-jump tap targets and clipping on phones.
 */
for(const theme of ['graph','graph-night'] as const)
for(const width of [360,390] as const){
 test('FIX #536 stage jumps keep 44px targets '+theme+' '+width,async({page})=>{
  await page.setViewportSize({width,height:740});
  await page.goto('/lemma/?demo=stress&theme='+theme+'#/p/stress-project-1');
  const nav=page.locator('[data-stage-jumps]');
  await expect(nav).toBeVisible();
  const chips=nav.locator('[data-stage-chip]');
  expect(await chips.count()).toBeGreaterThan(5);
  const bounds=await chips.evaluateAll(elements=>elements.map(element=>{
   const rect=element.getBoundingClientRect();
   return {width:rect.width,height:rect.height};
  }));
  for(const rect of bounds){
   expect(rect.width).toBeGreaterThanOrEqual(44);
   expect(rect.height).toBeGreaterThanOrEqual(44);
  }
  mkdirSync('test-results/screens/fix-536',{recursive:true});
  await page.screenshot({path:'test-results/screens/fix-536/'+theme+'-'+width+'.png',fullPage:false});
 });
}
