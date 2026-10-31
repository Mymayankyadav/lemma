import {test,expect} from '@playwright/test';

for(const profile of ['stress','extreme'] as const)
 for(const theme of ['graph','graph-night'] as const)
  for(const width of [390,360] as const)
   test(`FIX #522 sheet and Metro agree: ${profile} ${theme} ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:740});
    await page.goto(`/lemma/?demo=${profile}&theme=${theme}#/p/real-analysis`);
    const timeline=page.getByRole('region',{name:'Project timeline'}).locator('[data-schedule-detail]').first();
    await expect(timeline).toBeVisible();
    const expected=(await timeline.innerText()).trim();
    await page.goto(`/lemma/?demo=${profile}&theme=${theme}#/p/real-analysis/cp/CP4`);
    const sheet=page.getByLabel('Checkpoint schedule');
    await expect(sheet).toBeVisible();
    expect((await sheet.innerText()).trim()).toBe(expected);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width+1);
    await page.screenshot({path:`test-results/screens/fix-522-${profile}-${theme}-${width}.png`,fullPage:true});
   });
