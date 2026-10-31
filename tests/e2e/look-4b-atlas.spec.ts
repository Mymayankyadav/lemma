import {expect,test} from '@playwright/test';

for(const profile of ['stress','extreme'] as const)
for(const theme of ['graph','graph-night'] as const)
for(const width of [360,390] as const){
 test(`LOOK-4b Atlas hierarchy ${profile} ${theme} ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:740});
  await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}));
  await page.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}));
  await page.goto(`./?demo=${profile}&theme=${theme}#/atlas`);
  const tree=page.getByRole('tree',{name:'Ideas and their links'});
  await expect(tree).toBeVisible();
  const field=tree.locator('[data-level="cluster"]').first();
  const child=tree.locator('[data-level]:not([data-level="cluster"])').first();
  await expect(field).toBeVisible();
  await expect(child).toBeVisible();
  expect((await field.boundingBox())?.height).toBe(56);
  expect((await child.boundingBox())?.height).toBe(44);
  const fold=field.getByRole('button',{name:/^(Fold|Unfold)/});
  expect((await fold.boundingBox())?.width).toBeGreaterThanOrEqual(44);
  expect((await fold.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  const bg=await page.locator('[data-atlas-stage]').evaluate(el=>getComputedStyle(el).backgroundColor);
  expect(bg).not.toBe('rgba(0, 0, 0, 0)');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({path:`test-results/screens/look-4b-${profile}-${theme}-${width}.png`});
 });
}

test('LOOK-4b default Atlas Area labels use small caps and readable mathematical sizing',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('./?demo=1&theme=graph#/atlas');
 const area=page.locator('[data-level="galaxy"]').first();
 await expect(area).toBeVisible();
 expect((await area.boundingBox())?.height).toBe(44);
 const label=area.getByRole('button').last();
 const css=await label.locator('span').first().evaluate(el=>({
  variant:getComputedStyle(el).fontVariant,
  size:parseFloat(getComputedStyle(el).fontSize),
 }));
 expect(css.variant).toContain('small-caps');
 expect(css.size).toBeGreaterThanOrEqual(12);
});
