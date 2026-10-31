import {expect,test} from '@playwright/test';
import {mkdirSync} from 'node:fs';

// AUDIT #600: v4 reserves the red pencil for selection and primary actions.
// Verify actual computed colours, not merely utility class names, across S/X.
for(const profile of ['stress','extreme'] as const)
for(const theme of ['graph','graph-night'] as const)
for(const width of [360,390] as const){
 test('FIX #600 Sources passive ink '+profile+' '+theme+' '+width,async({page})=>{
  test.setTimeout(180_000);
  await page.setViewportSize({width,height:844});
  await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}));
  await page.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}));
  await page.goto('/lemma/?demo='+profile+'&theme='+theme+'#/p/real-analysis?tab=sources',
   {waitUntil:'domcontentloaded',timeout:90_000});
  const sources=page.getByRole('region',{name:'Sources'});
  await expect(sources.getByRole('group',{name:'Source storage'})).toContainText(/sources/,{timeout:90_000});
  const row=sources.locator('[data-source-row]').first();
  await expect(row).toBeVisible();
  const tokens=await page.evaluate(()=>{
   const probe=(value:string)=>{
    const node=document.createElement('span');
    node.style.color='var('+value+')';
    document.body.appendChild(node);
    const color=getComputedStyle(node).color;
    node.remove();
    return color;
   };
   return {ink:probe('--ink-2'),accent:probe('--accent')};
  });
  expect(tokens.ink).not.toBe(tokens.accent);
  for(const target of [
   sources.locator('[data-source-fold]').first(),
   row.locator('[data-source-icon]'),
   row.locator('[data-source-edit]'),
  ]){
   await expect(target).toBeVisible();
   const color=await target.evaluate(node=>getComputedStyle(node).color);
   expect(color).toBe(tokens.ink);
   expect(color).not.toBe(tokens.accent);
  }
  const newLabels=sources.locator('[data-source-new]:visible');
  if(await newLabels.count()){
   const label=newLabels.first();
   await expect(label).toBeVisible();
   expect(await label.evaluate(node=>getComputedStyle(node).color)).toBe(tokens.ink);
  }
  const fill=sources.locator('[data-source-storage-fill]');
  await expect(fill).toHaveCount(1);
  expect(await fill.evaluate(node=>getComputedStyle(node).backgroundColor)).toBe(tokens.ink);
  const pagination=sources.locator('[data-source-page]');
  for(const target of await pagination.all()){
   if(!await target.isVisible())continue;
   expect(await target.evaluate(node=>getComputedStyle(node).color)).toBe(tokens.ink);
  }
  const edit=row.locator('[data-source-edit]');
  await edit.click();
  const save=row.getByRole('button',{name:'Save'});
  const cancel=row.getByRole('button',{name:'Cancel'});
  await expect(save).toBeVisible();
  expect(await save.evaluate(node=>getComputedStyle(node).color)).toBe(tokens.accent);
  expect(await cancel.evaluate(node=>getComputedStyle(node).color)).toBe(tokens.ink);
  for(const control of [sources.locator('[data-source-fold]').first().locator('..'),edit,save,cancel]){
   const box=await control.boundingBox();
   expect(box?.height??0).toBeGreaterThanOrEqual(44);
   expect(box?.width??0).toBeGreaterThanOrEqual(44);
  }
  for(const informative of [row.locator('strong').first(),row.locator('p').first(),edit]){
   const fontSize=await informative.evaluate(node=>parseFloat(getComputedStyle(node).fontSize));
   expect(fontSize).toBeGreaterThanOrEqual(12);
  }
  const math=row.locator('.katex').first();
  if(await math.count())expect(await math.evaluate(node=>parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(16);
  const metrics=await page.evaluate(()=>({
   overflow:document.documentElement.scrollWidth-innerWidth,
   nodes:document.querySelectorAll('*').length,
  }));
  expect(metrics.overflow).toBeLessThanOrEqual(1);
  expect(metrics.nodes).toBeLessThan(1500);
  mkdirSync('test-results/screens/fix-600',{recursive:true});
  await page.screenshot({path:'test-results/screens/fix-600/'+profile+'-'+theme+'-'+width+'.png',fullPage:false});
 });
}
