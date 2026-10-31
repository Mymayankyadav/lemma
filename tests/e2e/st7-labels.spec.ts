import {test,expect} from '@playwright/test';

// ST-7 I3: long project labels cannot widen the seven-day review section.
for(const theme of ['graph','graph-night'] as const){
 test(`ST-7 review legend clips unbroken project names on a 360px phone (${theme})`,async({page})=>{
  await page.setViewportSize({width:360,height:740});
  await page.goto(`/lemma/?demo=1&theme=${theme}#/`);
  const legend=page.getByLabel('Due cards by project');
  await expect(legend).toBeVisible();
  const name=legend.locator('[data-due-group-name]').first();
  expect((await name.getAttribute('title'))?.length).toBeGreaterThan(0);
  // Simulate the 80-character/unbroken-token owner stress case without
  // mutating the fixture or adding production-only test hooks.
  await name.evaluate(node=>{node.textContent='A'.repeat(160)});
  await expect(name).toHaveCSS('white-space','nowrap');
  await expect(name).toHaveCSS('text-overflow','ellipsis');
  const bounds=await page.evaluate(()=>{
   const name=document.querySelector('[data-due-group-name]')!;
   return {page:document.documentElement.scrollWidth,viewport:window.innerWidth,
    labelScroll:name.scrollWidth,labelWidth:name.clientWidth};
  });
  expect(bounds.labelScroll).toBeGreaterThan(bounds.labelWidth);
  expect(bounds.page).toBeLessThanOrEqual(bounds.viewport);
  // Keep the tested legend in the captured viewport; the original screenshot
  // only showed the top of Today, leaving this regression visually unreviewable.
  await name.scrollIntoViewIfNeeded();
  await expect(name).toBeInViewport();
  await page.screenshot({path:`test-results/screens/st-7-legend-360-${theme}.png`});
 });
}
