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
  const viewPages=row.locator('[data-source-view-pages]');
  await expect(viewPages).toBeVisible();
  expect(await viewPages.evaluate(node=>getComputedStyle(node).color)).toBe(tokens.ink);
  const viewBox=await viewPages.boundingBox();
  expect(viewBox?.height??0).toBeGreaterThanOrEqual(44);
  expect(viewBox?.width??0).toBeGreaterThanOrEqual(44);
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

/** The small seeded project has a real unchecked transcription and a
 * "New · not yet used in a plan" source. Assert these states explicitly;
 * the large S/X fixture is not allowed to make the checks vacuous.
 */
for(const theme of ['graph','graph-night'] as const)
for(const width of [360,390] as const){
 test('FIX #600 seeded Sources secondary and warning ink '+theme+' '+width,async({page})=>{
  await page.setViewportSize({width,height:844});
  await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}));
  await page.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}));
  await page.goto('/lemma/?demo=1&theme='+theme+'#/p/real-analysis?tab=sources');
  const sources=page.getByRole('region',{name:'Sources'});
  const colors=await page.evaluate(()=>{
   const probe=(name:string)=>{
    const el=document.createElement('span');
    el.style.color='var('+name+')';
    document.body.appendChild(el);
    const color=getComputedStyle(el).color;
    el.remove();
    return color;
   };
   return {ink:probe('--ink-2'),late:probe('--late'),accent:probe('--accent')};
  });
  expect(colors.ink).not.toBe(colors.accent);
  expect(colors.late).not.toBe(colors.accent);
  const newSource=sources.locator('[data-source-new]:visible').first();
  await expect(newSource).toBeVisible();
  expect(await newSource.evaluate(el=>getComputedStyle(el).color)).toBe(colors.ink);
  const rudin=sources.getByRole('group',{name:'Principles of Mathematical Analysis'});
  await expect(rudin).toBeVisible();
  const view=rudin.locator('[data-source-view-pages]');
  await expect(view).toBeVisible();
  expect(await view.evaluate(el=>getComputedStyle(el).color)).toBe(colors.ink);
  await view.click();
  const viewer=rudin.getByRole('region',{name:/Page transcription for Principles of Mathematical Analysis/});
  await expect(viewer).toBeVisible();
  const check=viewer.getByText('Check',{exact:true});
  await expect(check).toBeVisible();
  expect(await check.evaluate(el=>getComputedStyle(el).color)).toBe(colors.late);
  const edit=viewer.getByRole('button',{name:'Edit page'});
  const mark=viewer.getByRole('button',{name:'Mark checked'});
  for(const control of [edit,mark]){
   await expect(control).toBeVisible();
   expect(await control.evaluate(el=>getComputedStyle(el).color)).toBe(colors.ink);
   const box=await control.boundingBox();
   expect(box?.width??0).toBeGreaterThanOrEqual(44);
   expect(box?.height??0).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  mkdirSync('test-results/screens/fix-600',{recursive:true});
  await page.screenshot({path:'test-results/screens/fix-600/seeded-'+theme+'-'+width+'.png'});
 });
}
