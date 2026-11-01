import {test,expect} from '@playwright/test';

interface PaintedBox{left:number;right:number;top:number;bottom:number}
function paintedGap(a:PaintedBox,b:PaintedBox){
 const dx=Math.max(0,a.left-b.right,b.left-a.right);
 const dy=Math.max(0,a.top-b.bottom,b.top-a.bottom);
 return Math.hypot(dx,dy);
}

for (const profile of ['stress','extreme'] as const) {
 for (const theme of ['graph','graph-night'] as const) {
  for (const width of [360,390] as const) {
   test(`FIX #483 ${profile} ${theme} ${width}px bundle labels remain readable`,async({page})=>{
    await page.setViewportSize({width,height:844});
    await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}));
    await page.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}));
    await page.goto(`./?demo=${profile}&theme=${theme}#/atlas`);
    await expect(page.getByRole('tree',{name:'Ideas and their links'})).toBeVisible();
    const areas=page.getByRole('group',{name:'Fold to depth'}).getByRole('button',{name:'Areas',exact:true});
    await areas.click();
    await expect(areas).toHaveAttribute('aria-pressed','true');
    const labels=page.locator('[data-atlas-bundle-count]');
    await expect.poll(()=>labels.count()).toBeGreaterThan(0);
    const sizes=await labels.evaluateAll(elements=>elements.map(element=>parseFloat(getComputedStyle(element).fontSize)));
    expect(sizes.every(size=>size>=12)).toBe(true);
    // v4 replaces circular badges with 16px pills. Keep the original
    // readability and painted-mark spacing contract, measuring the actual
    // stroked rectangles rather than a circle radius that no longer exists.
    const fits=await labels.evaluateAll(elements=>elements.every(element=>{
     const pill=element.previousElementSibling;
     if(!pill?.hasAttribute('data-atlas-bundle-pill'))return false;
     const text=element.getBoundingClientRect(),paint=pill.getBoundingClientRect();
     return paint.height===16&&paint.width>=text.width+6;
    }));
    expect(fits).toBe(true);
    const pills=await page.locator('[data-atlas-bundle-pill]').evaluateAll(elements=>elements.map(element=>{
     const b=element.getBoundingClientRect();
     return {left:b.left,right:b.right,top:b.top,bottom:b.bottom};
    }));
    expect(pills.length).toBe(await labels.count());
    for(let i=0;i<pills.length;i++)for(let j=i+1;j<pills.length;j++){
     expect(paintedGap(pills[i],pills[j]),'bundle pills '+i+' and '+j+' overlap').toBeGreaterThanOrEqual(8);
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
  // The visual focus outline extends beyond the element's hit rectangle.
  // Measure that painted extent, not merely document.scrollWidth/box width.
  const focusRing=await summary.evaluate(el=>{
   const box=el.getBoundingClientRect(),css=getComputedStyle(el);
   const protrusion=Math.max(0,parseFloat(css.outlineWidth)+parseFloat(css.outlineOffset));
   return {left:box.left-protrusion,right:box.right+protrusion,style:css.outlineStyle};
  });
  expect(focusRing.style).not.toBe('none');
  expect(focusRing.left).toBeGreaterThanOrEqual(0);
  expect(focusRing.right).toBeLessThanOrEqual(width);
  await page.keyboard.press('Enter');
  await expect(overflow).toHaveAttribute('open','');
  const hidden=overflow.locator('li');
  const visible=page.locator('[data-atlas-bundle-count]');
  const laneHidden=page.locator('[data-atlas-lane-overflow] li');
  // Every original bundle remains reachable through a painted pill, the
  // finite-gutter badge disclosure or the independent lane disclosure.
  expect(await hidden.count()+await visible.count()+await laneHidden.count()).toBe(20);
  expect(await hidden.count()).toBeGreaterThan(0);
  expect((await hidden.allTextContents()).every(t=>/rows \d+–\d+: 2 links/.test(t))).toBe(true);
  const fontSizes=await hidden.evaluateAll(items=>items.map(el=>parseFloat(getComputedStyle(el).fontSize)));
  expect(fontSizes.every(size=>size>=12)).toBe(true);
  const boxes=await page.locator('[data-atlas-bundle-pill], [data-atlas-overflow-count]').evaluateAll(els=>els.map(el=>{
   const b=el.getBoundingClientRect();
   return {left:b.left,right:b.right,top:b.top,bottom:b.bottom};
  }));
  for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++)
   expect(paintedGap(boxes[i],boxes[j])).toBeGreaterThanOrEqual(8);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await summary.scrollIntoViewIfNeeded();
  await page.screenshot({path:`test-results/screens/stress/fix-483-dense-${theme}-${width}.png`});
 });
}
