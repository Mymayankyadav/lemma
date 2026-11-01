import {test,expect} from '@playwright/test';

// ST-7 I3 survives the v4 removal of the stacked due-by-project legend:
// a long, unbroken mathematical Continue title must still clip within 360px.
for(const theme of ['graph','graph-night'] as const){
 test(`ST-7 Continue clips unbroken mathematical titles on a 360px phone (${theme})`,async({page})=>{
  await page.setViewportSize({width:360,height:740});
  await page.goto(`/lemma/?demo=1&theme=${theme}#/`);
  const handoff=page.getByRole('region',{name:'Resume where you stopped'});
  await expect(handoff).toBeVisible();
  const name=handoff.locator('[data-resume-meta]');
  await expect(name).toBeVisible();
  expect((await name.getAttribute('title'))?.length).toBeGreaterThan(0);
  // Simulate the 80-character/unbroken-token stress case without mutating
  // the demo fixture or adding production-only test hooks.
  await name.evaluate(node=>{node.textContent='A'.repeat(160)});
  await expect(name).toHaveCSS('white-space','nowrap');
  await expect(name).toHaveCSS('text-overflow','ellipsis');
  const bounds=await page.evaluate(()=>{
   const name=document.querySelector('[data-resume-meta]')!;
   return {page:document.documentElement.scrollWidth,viewport:window.innerWidth,
    labelScroll:name.scrollWidth,labelWidth:name.clientWidth};
  });
  expect(bounds.labelScroll).toBeGreaterThan(bounds.labelWidth);
  expect(bounds.page).toBeLessThanOrEqual(bounds.viewport);
  await name.scrollIntoViewIfNeeded();
  await expect(name).toBeInViewport();
  await page.screenshot({path:`test-results/screens/st-7-continue-360-${theme}.png`});
 });
}
