import {test,expect} from '@playwright/test';

// Phone-class DPR retains the intended 1.5 CSS-pixel hairline (3 device pixels).
test.use({deviceScaleFactor:2});

for(const world of ['graph','graph-night'] as const){
 test(`UI-6a graph-paper material and type in ${world}`,async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}));
  await page.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}));
  await page.goto(`./?demo=1&theme=${world}#/`);
  await expect(page.locator('html')).toHaveAttribute('data-theme',world);
  const slab=page.locator('.slab').first();
  await expect(slab).toBeVisible();
  const material=await slab.evaluate(element=>{
   const card=getComputedStyle(element);
   const ground=getComputedStyle(document.querySelector('.ground')!);
   const title=getComputedStyle(document.querySelector('h1')!);
   const edgeProbe=document.createElement('span');
   edgeProbe.style.border='1px solid var(--edge)';
   document.body.appendChild(edgeProbe);
   const edgeColor=getComputedStyle(edgeProbe).borderTopColor;
   edgeProbe.remove();
   return {border:card.borderTopWidth,borderColor:card.borderTopColor,edgeColor,
    borderToken:getComputedStyle(document.documentElement).getPropertyValue('--card-border').trim(),
    radius:card.borderTopLeftRadius,shadow:card.boxShadow,
    background:ground.backgroundImage,font:title.fontFamily};
  });
  // Chromium snaps fractional borders to device pixels; the token keeps the exact 1.5px design value.
  expect(material.borderToken).toContain('1.5px solid');
  expect(Number.parseFloat(material.border)).toBeGreaterThanOrEqual(1);
  // Owner-approved v4 overrides the old 1.5px bright night border with a
  // 1px dim --edge hairline; day keeps its original graph-paper material.
  expect(material.borderColor).toBe(world==='graph'?'rgb(27, 42, 65)':material.edgeColor);
  if(world==='graph-night')expect(material.border).toBe('1px');
  expect(material.radius).toBe('6px');
  expect(material.shadow).toContain('3px 3px 0px');
  expect(material.background).toContain('linear-gradient');
  expect(material.font).toContain('Newsreader');
  // Today has no heavy action button after FIX #350; inspect the shared button material in the kit.
  await page.goto(`./?demo=1&theme=${world}#/kit`);
  const button=page.locator('.ui-button').first();
  await expect(button).toBeVisible();
  expect(await button.evaluate(element=>getComputedStyle(element).boxShadow)).toContain('2px 2px 0px');
  await page.goto(`./?demo=1&theme=${world}#/`);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({path:`test-results/screens/review/ui6a-material-${world}.png`,fullPage:true});
 });
}

test('UI-6a plotted curves are static, route-specific and never cover controls',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 for(const [route,kind] of [['/','today'],['/projects','paths'],['/review','review'],['/insights','insights'],['/settings','unit']] as const){
  await page.goto(`./?demo=1&theme=graph#${route}`);
  const sketch=page.locator('[data-graph-sketch]');
  await expect(sketch).toHaveAttribute('data-graph-sketch',kind);
  expect(await sketch.evaluate(el=>getComputedStyle(el).pointerEvents)).toBe('none');
  expect(await sketch.evaluate(el=>el.getAnimations().length)).toBe(0);
  await page.screenshot({path:`test-results/screens/review/ui6a-curve-${kind}.png`,fullPage:true});
 }
 for(const route of ['/atlas','/review/run']){
  await page.goto(`./?demo=1&theme=graph#${route}`);
  await expect(page.locator('[data-graph-sketch]')).toHaveCount(0);
 }
});
