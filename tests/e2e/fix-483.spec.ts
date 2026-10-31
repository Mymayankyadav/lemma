import {test,expect} from '@playwright/test';

for (const profile of ['stress','extreme'] as const) {
 for (const theme of ['graph','graph-night'] as const) {
  for (const width of [360,390] as const) {
   test(`FIX #483 ${profile} ${theme} ${width}px bundle labels remain readable`,async({page})=>{
    await page.setViewportSize({width,height:844});
    await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}));
    await page.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}));
    await page.goto(`./?demo=${profile}&theme=${theme}#/atlas`);
    await expect(page.getByRole('tree',{name:'Ideas and their links'})).toBeVisible();
    await page.getByRole('group',{name:'Fold to depth'}).getByRole('button',{name:'2',exact:true}).click();
    const labels=page.locator('[data-atlas-bundle-count]');
    await expect.poll(()=>labels.count()).toBeGreaterThan(0);
    const sizes=await labels.evaluateAll(elements=>elements.map(element=>parseFloat(getComputedStyle(element).fontSize)));
    expect(sizes.every(size=>size>=12)).toBe(true);
    const radii=await labels.evaluateAll(elements=>elements.map(element=>Number(element.previousElementSibling?.getAttribute('r'))));
    expect(radii.every(radius=>radius>=11)).toBe(true);
    const fits=await labels.evaluateAll(elements=>elements.every(element=>
     Number(element.previousElementSibling?.getAttribute('r'))>=Math.max(11.5,6+(element.textContent?.trim().length??0)*4)));
    expect(fits).toBe(true);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({path:`test-results/screens/stress/fix-483-${profile}-${theme}-${width}.png`});
   });
  }
 }
}
