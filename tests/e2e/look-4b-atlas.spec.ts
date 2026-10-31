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
  // The 8px breathing room is outside the 56/44px interactive row target,
  // and must be present in actual browser geometry, not just the data model.
  const boundaryGaps=await tree.locator('[data-atlas-row]').evaluateAll(elements=>elements.flatMap((el,i)=>{
   if(i===0||!['cluster','galaxy'].includes(el.getAttribute('data-level')??''))return [];
   return [el.getBoundingClientRect().top-elements[i-1].getBoundingClientRect().bottom];
  }));
  expect(boundaryGaps.length).toBeGreaterThan(0);
  for(const gap of boundaryGaps)expect(Math.abs(gap-8)).toBeLessThanOrEqual(.5);
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

for(const profile of ['stress','extreme'] as const)
for(const theme of ['graph','graph-night'] as const)
for(const width of [360,390] as const){
 test(`LOOK-4b sticky Field context survives deep scroll ${profile} ${theme} ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:740});
  await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}));
  await page.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}));
  await page.goto(`./?demo=${profile}&theme=${theme}#/atlas`);
  const tree=page.getByRole('tree',{name:'Ideas and their links'});
  await expect(tree).toBeVisible();
  await page.getByRole('group',{name:'Fold to depth'}).getByRole('button',{name:'All'}).click();
  await page.getByRole('button',{name:'Unfold all'}).click();
  await expect.poll(async()=>Number(await tree.getAttribute('data-atlas-row-count'))).toBeGreaterThan(profile==='extreme'?1000:100);
  const stage=page.locator('[data-atlas-stage]');
  const sticky=page.locator('[data-atlas-sticky-field]');
  await stage.evaluate(el=>{el.scrollTop=1;el.dispatchEvent(new Event('scroll',{bubbles:true}))});
  await expect(sticky).toBeVisible();
  // The Field stays pinned from the first pixel, not only after its entire
  // original row leaves the virtual window.
  await stage.evaluate(el=>{el.scrollTop=4000;el.dispatchEvent(new Event('scroll',{bubbles:true}))});
  await expect(sticky).toBeVisible();
  expect((await sticky.boundingBox())?.height).toBe(56);
  const label=sticky.locator('.font-serif');
  await expect(label).not.toBeEmpty();
  const css=await label.evaluate(el=>({size:parseFloat(getComputedStyle(el).fontSize),style:getComputedStyle(el).fontStyle}));
  expect(css.size).toBeGreaterThanOrEqual(21);
  expect(css.style).toBe('italic');
  await expect(sticky.locator('.rounded-full').first()).toBeVisible();
  const firstField=await label.innerText();
  await stage.evaluate(el=>{el.scrollTop=el.scrollHeight*.8;el.dispatchEvent(new Event('scroll',{bubbles:true}))});
  await expect(sticky).toBeVisible();
  await expect.poll(async()=>sticky.locator('.font-serif').innerText()).not.toBe(firstField);
  expect((await sticky.boundingBox())?.height).toBe(56);
  expect(await tree.locator('[data-atlas-row]').count()).toBeLessThanOrEqual(60);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({path:`test-results/screens/look-4b-sticky-${profile}-${theme}-${width}.png`});
 });
}

test('LOOK-4b preserves all moderate Fields while extreme outlines remain windowed',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('./?demo=1&theme=graph#/atlas');
 const tree=page.getByRole('tree',{name:'Ideas and their links'});
 await expect(tree).toBeVisible();
 // FIX #519b's moderate-outline exception keeps the third Field available
 // to screen readers and keyboard users even below the first viewport.
 await expect(tree.locator('[data-level="cluster"]')).toHaveCount(3);
 await page.getByRole('group',{name:'Fold to depth'}).getByRole('button',{name:'All'}).click();
 const logicalRows=Number(await tree.getAttribute('data-atlas-row-count'));
 expect(logicalRows).toBeGreaterThan(60);
 // All three Fields remain mounted and keyboard-accessible, but the 82
 // logical children cannot bypass the shared 60-row DOM budget.
 await expect(tree.locator('[data-level="cluster"]')).toHaveCount(3);
 const fieldOrder=await tree.locator('[data-level="cluster"]').allTextContents();
 expect(await tree.locator('[data-atlas-row]').count()).toBeLessThanOrEqual(60);
 const stage=page.locator('[data-atlas-stage]');
 await stage.evaluate(el=>{el.scrollTop=el.scrollHeight*.7;el.dispatchEvent(new Event('scroll',{bubbles:true}))});
 await expect(tree.locator('[data-level="cluster"]')).toHaveCount(3);
 expect(await tree.locator('[data-level="cluster"]').allTextContents()).toEqual(fieldOrder);
 expect(await tree.locator('[data-atlas-row]').count()).toBeLessThanOrEqual(60);
});


/** Compact prose labels may be 13.5/15px, but mathematical glyphs may not.
 * Mount genuine KaTeX in all four compact row levels and measure the actual
 * browser font, rather than trusting the outer prose span's font size.
 */
for(const profile of ['stress','extreme'] as const)
for(const theme of ['graph','graph-night'] as const)
for(const width of [360,390] as const){
 test(`LOOK-4b compact Atlas maths floor ${profile} ${theme} ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:740});
  await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}));
  await page.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}));
  await page.goto(`./?demo=${profile}&theme=${theme}#/atlas`);
  const tree=page.getByRole('tree',{name:'Ideas and their links'});
  await expect(tree).toBeVisible();
  await page.getByRole('group',{name:'Fold to depth'}).getByRole('button',{name:'All'}).click();
  await page.getByRole('button',{name:'Unfold all'}).click();
  const formula=katex.renderToString(String.raw`\mathbb{R}^{n}\cong\sum_{k=1}^{n}k`,{throwOnError:false});
  for(const level of ['galaxy','system','planet','moon']){
   const row=tree.locator(`[data-level="${level}"]`).first();
   await expect(row).toBeVisible();
   const name=row.locator('button span[title]').first();
   await expect(name).toBeVisible();
   await name.evaluate((el,html)=>{
    const wrapper=document.createElement('span');
    wrapper.className='lemma-math lemma-tex-inline';
    wrapper.innerHTML=html;
    el.replaceChildren(wrapper);
   },formula);
   const metrics=await name.evaluate(el=>{
    const math=el.querySelector('.katex');
    if(!math)throw new Error('Real KaTeX element missing');
    return {size:parseFloat(getComputedStyle(math).fontSize),height:el.getBoundingClientRect().height};
   });
   expect(metrics.size,`math floor in ${level}`).toBeGreaterThanOrEqual(16);
   expect(metrics.height).toBeLessThanOrEqual(44);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({path:`test-results/screens/look-4b-math-${profile}-${theme}-${width}.png`});
 });
}
