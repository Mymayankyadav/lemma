import {expect,test} from '@playwright/test';
import katex from 'katex';

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
  // A 100× fixture must not mount the entire outline on cold open.
  expect(await tree.locator('[data-atlas-row]').count()).toBeLessThanOrEqual(60);
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

test('LOOK-4b long mathematical row names remain scrollable without viewport overflow',async({page})=>{
 await page.setViewportSize({width:360,height:740});
 await page.goto('./?demo=1&theme=graph-night#/atlas');
 const row=page.locator('[data-level="cluster"]').first();
 const name=row.getByRole('button').last().locator('span[title]').first();
 // The app bundles KaTeX as an ES module; it does not expose window.katex.
 // Render genuine KaTeX markup in the test runner, then measure it in Chromium.
 const mathHtml=katex.renderToString(String.raw`\sum_{n=1}^{100}\frac{1}{n^2}+\int_{0}^{1}\frac{dx}{1+x^2}+\mathbb{R}^{100}`,{throwOnError:false});
 await name.evaluate((el,html)=>{el.innerHTML=html},mathHtml);
 const metrics=await name.evaluate(el=>{
  el.scrollLeft=el.scrollWidth;
  return {scrollWidth:el.scrollWidth,clientWidth:el.clientWidth,scrollLeft:el.scrollLeft,
   font:parseFloat(getComputedStyle(el.querySelector('.katex')!).fontSize)};
 });
 expect(metrics.scrollWidth).toBeGreaterThan(metrics.clientWidth);
 expect(metrics.scrollLeft).toBeGreaterThan(0);
 expect(metrics.font).toBeGreaterThanOrEqual(16);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
});

test('LOOK-4b Field context remains 56px and correct after deep virtual scroll',async({page})=>{
 await page.setViewportSize({width:360,height:740});
 await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}));
 await page.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}));
 await page.goto('./?demo=extreme&theme=graph-night#/atlas');
 const tree=page.getByRole('tree',{name:'Ideas and their links'});
 await expect(tree).toBeVisible();
 await page.getByRole('group',{name:'Fold to depth'}).getByRole('button',{name:'All'}).click();
 await page.getByRole('button',{name:'Unfold all'}).click();
 await expect.poll(async()=>Number(await tree.getAttribute('data-atlas-row-count'))).toBeGreaterThan(1000);
 const stage=page.locator('[data-atlas-stage]');
 await stage.evaluate(el=>{el.scrollTop=4000;el.dispatchEvent(new Event('scroll',{bubbles:true}))});
 const sticky=page.locator('[data-atlas-sticky-field]');
 await expect(sticky).toBeVisible();
 expect((await sticky.boundingBox())?.height).toBe(56);
 await expect(sticky.locator('.font-serif')).not.toBeEmpty();
 await expect(sticky.locator('.rounded-full').first()).toBeVisible();
 const firstField=await sticky.locator('.font-serif').innerText();
 await stage.evaluate(el=>{el.scrollTop=el.scrollHeight*.8;el.dispatchEvent(new Event('scroll',{bubbles:true}))});
 await expect(sticky).toBeVisible();
 await expect.poll(async()=>sticky.locator('.font-serif').innerText()).not.toBe(firstField);
 expect((await sticky.boundingBox())?.height).toBe(56);
 expect(await tree.locator('[data-atlas-row]').count()).toBeLessThanOrEqual(60);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
 await page.screenshot({path:'test-results/screens/look-4b-extreme-deep-field-360.png'});
});
