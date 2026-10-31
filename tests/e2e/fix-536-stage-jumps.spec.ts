import {test,expect} from '@playwright/test';
import {mkdirSync} from 'node:fs';

/** FIX #536: the unit test injects mathematical stage names; the stress
 * browser fixture verifies real stage-jump tap targets and clipping on phones.
 */
for(const theme of ['graph','graph-night'] as const)
for(const width of [360,390] as const){
 test('FIX #536 stage jumps keep 44px targets '+theme+' '+width,async({page})=>{
  await page.setViewportSize({width,height:740});
  await page.goto('/lemma/?demo=stress&theme='+theme+'#/p/stress-project-3');
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
  // Exercise the actual React/KaTeX stage renderer, not injected plain
  // text. The stress fixture contains one inline-dollar mathematical stage
  // and one long backslash-delimited stage on this real project.
  const mathLabels=nav.locator('[data-stage-chip-label]:has(.katex)');
  await expect(mathLabels).toHaveCount(2);
  const mathSizes=await mathLabels.evaluateAll(elements=>elements.map(element=>
   parseFloat(getComputedStyle(element.querySelector('.katex')!).fontSize)));
  expect(mathSizes.every(px=>px>=16),JSON.stringify(mathSizes)).toBe(true);
  const longMath=mathLabels.last();
  const scrollable=await longMath.evaluate(el=>({width:el.clientWidth,content:el.scrollWidth}));
  expect(scrollable.content).toBeGreaterThan(scrollable.width+8);
  await longMath.evaluate(el=>{el.scrollLeft=el.scrollWidth;});
  expect(await longMath.evaluate(el=>el.scrollLeft)).toBeGreaterThan(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);

  // Graph's global .truncate override must not spill a long mathematical
  // stage label across neighboring 44px controls. Unit tests supply actual
  // KaTeX; here we exercise the rendered CSS under both Graph worlds.
  const label=nav.locator('[data-stage-chip="0"] [data-stage-chip-label]');
  await expect(label).toBeVisible();
  await label.evaluate(el=>{const span=document.createElement('span');span.textContent='verylongmathematicalstage'.repeat(12);el.appendChild(span);});
  const geometry=await label.evaluate(el=>{
   const css=getComputedStyle(el),chip=el.closest('[data-stage-chip]')!.getBoundingClientRect();
   return {overflowX:css.overflowX,whiteSpace:css.whiteSpace,mask:css.maskImage,
    content:el.scrollWidth,frame:el.clientWidth,chipWidth:chip.width};
  });
  expect(geometry.overflowX).toBe('auto');
  expect(geometry.whiteSpace).toBe('nowrap');
  expect(geometry.mask).toContain('linear-gradient');
  expect(geometry.content).toBeGreaterThan(geometry.frame+8);
  expect(geometry.chipWidth).toBeLessThanOrEqual(176);
  await label.evaluate(el=>{el.scrollLeft=el.scrollWidth;});
  expect(await label.evaluate(el=>el.scrollLeft)).toBeGreaterThan(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  mkdirSync('test-results/screens/fix-536',{recursive:true});
  await page.screenshot({path:'test-results/screens/fix-536/'+theme+'-'+width+'.png',fullPage:false});
 });
}
