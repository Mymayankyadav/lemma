import {test,expect} from '@playwright/test';

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
   return {border:card.borderTopWidth,radius:card.borderTopLeftRadius,
    shadow:card.boxShadow,background:ground.backgroundImage,font:title.fontFamily};
  });
  expect(material.border).toBe('1.5px');
  expect(material.radius).toBe('6px');
  expect(material.shadow).toContain('3px 3px 0px');
  expect(material.background).toContain('linear-gradient');
  expect(material.font).toContain('Newsreader');
  const button=page.locator('.ui-button').first();
  await expect(button).toBeVisible();
  expect(await button.evaluate(element=>getComputedStyle(element).boxShadow)).toContain('2px 2px 0px');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({path:`test-results/screens/review/ui6a-material-${world}.png`,fullPage:true});
 });
}
