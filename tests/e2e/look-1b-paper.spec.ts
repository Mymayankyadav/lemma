import {expect,test} from '@playwright/test';

for(const profile of ['stress','extreme'] as const)
for(const theme of ['graph','graph-night'] as const)
for(const width of [360,390] as const){
 test(`LOOK-1b paper is one layer ${profile} ${theme} ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:width===360?740:844});
  await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}));
  await page.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}));
  await page.goto(`./?demo=${profile}&theme=${theme}#/`);
  await expect(page.locator('#main-content')).toBeVisible();
  // A nested component is a semantic group, not a second paper card.
  await expect(page.locator(':is(.card,.slab,.tile) :is(.card,.slab,.tile)')).toHaveCount(0);
  const nestedStyles=await page.locator('[data-paper-group]').evaluateAll(nodes=>nodes.map(el=>({
   background:getComputedStyle(el).backgroundColor,shadow:getComputedStyle(el).boxShadow,
  })));
  for(const style of nestedStyles){
   expect(style.background).toBe('rgba(0, 0, 0, 0)');
   expect(style.shadow).toBe('none');
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({path:`test-results/screens/look-1b-${profile}-${theme}-${width}.png`});
 });
}


// AUDIT BLOCK: the Today screen has no nested surfaces, so its lack of
// nested .card/.slab/.tile cannot alone prove the context flattening works.
// Exercise a real Card > Slab > Tile > Card in the mounted component kit.
for(const profile of ['stress','extreme'] as const)
for(const theme of ['graph','graph-night'] as const)
for(const width of [360,390] as const){
 test(`LOOK-1b nested-paper browser fixture ${profile} ${theme} ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:740});
  await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}));
  await page.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}));
  await page.goto(`./?demo=${profile}&theme=${theme}#/kit`);
  const outer=page.getByRole('article',{name:'Nested paper example'});
  await expect(outer).toBeVisible();
  await expect(outer.getByRole('region',{name:'Nested proof group'})).toBeVisible();
  await expect(outer.getByRole('article',{name:'Nested proof detail'})).toBeVisible();
  await expect(outer.getByRole('region',{name:'Nested conclusion'})).toBeVisible();
  await expect(outer).toContainText('Every open cover admits a finite subcover.');
  const groups=outer.locator('[data-paper-group]');
  await expect(groups).toHaveCount(3);
  await expect(outer.locator('[data-card]')).toHaveCount(1);
  const styles=await groups.evaluateAll(nodes=>nodes.map(el=>{
   const css=getComputedStyle(el);
   return {background:css.backgroundColor,shadow:css.boxShadow,
    border:parseFloat(css.borderTopWidth),width:el.getBoundingClientRect().width};
  }));
  expect(styles.length).toBe(3);
  for(const style of styles){
   expect(style.background).toBe('rgba(0, 0, 0, 0)');
   expect(style.shadow).toBe('none');
   expect(style.border).toBe(0);
   expect(style.width).toBeGreaterThan(0);
  }
  const action=outer.getByRole('button',{name:'Inspect proof'});
  const box=await action.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  await outer.scrollIntoViewIfNeeded();
  await outer.screenshot({path:`test-results/screens/look-1b-nested-${profile}-${theme}-${width}.png`});
  await action.click();
  await expect(page.getByText('Nested proof selected')).toBeVisible();
 });
}
