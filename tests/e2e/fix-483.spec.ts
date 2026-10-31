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
    // Count circles are actual marks, not just 12px numerals: adjacent
    // bundles need at least 8px of visible separation in both stress modes.
    const circles=await page.locator('[data-atlas-bundle-circle]').evaluateAll(elements=>elements.map(element=>{
     const box=element.getBoundingClientRect();
     return {x:box.x+box.width/2,y:box.y+box.height/2,r:box.width/2};
    }));
    expect(circles.length).toBe(await labels.count());
    for(let i=0;i<circles.length;i++)for(let j=i+1;j<circles.length;j++){
     const a=circles[i],b=circles[j];
     const edgeGap=Math.hypot(a.x-b.x,a.y-b.y)-a.r-b.r;
     expect(edgeGap,'bundle circles '+i+' and '+j+' overlap').toBeGreaterThanOrEqual(7.5);
    }
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({path:`test-results/screens/stress/fix-483-${profile}-${theme}-${width}.png`});
   });
  }
 }
}


for(const theme of ['graph','graph-night'] as const)for(const width of [360,390] as const){
 test(`FIX #483 dense 20-bundle overflow is keyboard accessible ${theme} ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:844});
  await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}));
  await page.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}));
  await page.goto(`./?demo=stress&theme=${theme}&atlasDenseFixture=1#/atlas`);
  await expect(page.getByRole('tree',{name:'Ideas and their links'})).toBeVisible();
  const overflow=page.locator('[data-atlas-hidden-bundles]');
  const summary=overflow.locator('summary');
  await expect(summary).toBeVisible();
  const hit=await summary.boundingBox();
  expect(hit).not.toBeNull();
  expect(hit!.width).toBeGreaterThanOrEqual(44);
  expect(hit!.height).toBeGreaterThanOrEqual(44);
  expect(await summary.evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12);
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(overflow).toHaveAttribute('open','');
  const hidden=overflow.locator('li');
  const visible=page.locator('[data-atlas-bundle-count]');
  expect(await hidden.count()+await visible.count()).toBe(20);
  expect(await hidden.count()).toBeGreaterThan(0);
  expect((await hidden.allTextContents()).every(t=>/rows \d+–\d+: 2 links/.test(t))).toBe(true);
  const fontSizes=await hidden.evaluateAll(items=>items.map(el=>parseFloat(getComputedStyle(el).fontSize)));
  expect(fontSizes.every(size=>size>=12)).toBe(true);
  const boxes=await page.locator('[data-atlas-bundle-circle], [data-atlas-overflow-count]').evaluateAll(els=>els.map(el=>{
   const b=el.getBoundingClientRect();
   return {x:b.x+b.width/2,y:b.y+b.height/2,r:b.width/2};
  }));
  for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
   const a=boxes[i],b=boxes[j];
   expect(Math.hypot(a.x-b.x,a.y-b.y)-a.r-b.r).toBeGreaterThanOrEqual(7.5);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await summary.scrollIntoViewIfNeeded();
  await page.screenshot({path:`test-results/screens/stress/fix-483-dense-${theme}-${width}.png`});
 });
}
