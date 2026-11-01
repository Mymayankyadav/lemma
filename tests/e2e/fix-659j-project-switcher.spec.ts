import {test,expect} from '@playwright/test';
import {mkdirSync} from 'node:fs';

// FIX-659j: an unopened Project switcher must not be in the cold Route
// import graph. It must remain keyboard accessible and functional on demand.
test.describe.configure({retries:0});
for(const profile of ['stress','extreme'] as const)
for(const theme of ['graph','graph-night'] as const)
for(const width of [360,390] as const){
 test('FIX-659j lazy Project switcher '+profile+' '+theme+' '+width,async({page})=>{
  test.setTimeout(90_000);
  const chunks:string[]=[];
  page.on('request',request=>{
   if(/(?:\/|-)ProjectSwitcher(?:[.-]|$)/i.test(new URL(request.url()).pathname))
    chunks.push(request.url());
  });
  await page.setViewportSize({width,height:width===360?740:844});
  await page.goto('/lemma/?demo='+profile+'&theme='+theme+'#/p/real-analysis',{waitUntil:'domcontentloaded'});
  await expect(page.getByRole('region',{name:'Project timeline'})).toBeVisible();
  await expect(page.getByRole('region',{name:'Stages'})).toBeVisible();
  expect(chunks,'Project switcher must not load on unopened Path').toEqual([]);
  const switchButton=page.getByRole('button',{name:/Switch project from/});
  await expect(switchButton).toBeVisible();
  await switchButton.click();
  const dialog=page.getByRole('dialog',{name:'Switch project'});
  await expect(dialog).toBeVisible();
  await expect.poll(()=>chunks.length,{message:'ProjectSwitcher module should load on demand'}).toBeGreaterThan(0);
  await expect(dialog.getByRole('searchbox',{name:'Find a project'})).toBeVisible();
  await expect(dialog.getByRole('link',{name:'All paths'})).toBeVisible();
  const metrics=await page.evaluate(()=>({
   overflow:Math.max(0,document.documentElement.scrollWidth-innerWidth),
   nodes:document.querySelectorAll('*').length,
  }));
  expect(metrics.overflow).toBeLessThanOrEqual(1);
  expect(metrics.nodes).toBeLessThan(1500);
  mkdirSync('test-results/screens/fix-659j',{recursive:true});
  await page.screenshot({path:'test-results/screens/fix-659j/'+profile+'-'+theme+'-'+width+'.png'});
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(switchButton).toBeFocused();
 });
}
