import {test,expect} from '@playwright/test';
import {mkdirSync} from 'node:fs';

// FIX-659m: the Project Route never displays an empty-state illustration
// when data is available. Its four SVG/motion art modules must stay off the
// cold import graph, while a genuine error still shows the full illustration.
test.describe.configure({retries:0});
for(const profile of ['stress','extreme'] as const)
for(const theme of ['graph','graph-night'] as const)
for(const width of [360,390] as const){
 test('FIX-659m on-demand empty-state art '+profile+' '+theme+' '+width,async({page})=>{
  test.setTimeout(90_000);
  const artRequests:string[]=[];
  page.on('request',request=>{
   if(/(?:\/|\-)(?:CompassArt|CardFanArt|PlugArt|DoneBurst)(?:[.\-]|$)/i.test(new URL(request.url()).pathname))
    artRequests.push(request.url());
  });
  await page.setViewportSize({width,height:width===360?740:844});
  await page.goto('/lemma/?demo='+profile+'&theme='+theme+'#/p/real-analysis',{waitUntil:'domcontentloaded'});
  await expect(page.getByRole('region',{name:'Project timeline'})).toBeVisible();
  await expect(page.getByRole('region',{name:'Stages'})).toBeVisible();
  expect(artRequests,'Unused EmptyState art must not be fetched on a real Project').toEqual([]);

  // A genuinely unavailable Project must still render its error copy, action
  // and the exact accessible PlugArt illustration, with stable reserved space.
  await page.goto('/lemma/?demo='+profile+'&theme='+theme+'#/p/missing-project-659m',{waitUntil:'domcontentloaded'});
  await expect(page.getByRole('heading',{name:'Project unavailable'})).toBeVisible();
  await expect(page.getByRole('img',{name:'Disconnected tutor illustration'})).toBeVisible();
  // The error toast also offers Try again; assert the EmptyState's own
  // accessible action rather than an ambiguous page-global locator.
  const retry=page.getByRole('heading',{name:'Project unavailable'})
   .locator('..').getByRole('button',{name:'Try again'});
  await expect(retry).toBeVisible();
  const size=await retry.boundingBox();
  expect(size?.height??0).toBeGreaterThanOrEqual(44);
  expect(size?.width??0).toBeGreaterThanOrEqual(44);
  expect(artRequests.length,'PlugArt should load on demand for the actual error').toBeGreaterThan(0);
  const metrics=await page.evaluate(()=>({
   nodes:document.querySelectorAll('*').length,
   overflow:document.documentElement.scrollWidth-innerWidth,
  }));
  expect(metrics.nodes).toBeLessThan(1500);
  expect(metrics.overflow).toBeLessThanOrEqual(1);
  mkdirSync('test-results/screens/fix-659m',{recursive:true});
  await page.screenshot({path:'test-results/screens/fix-659m/'+profile+'-'+theme+'-'+width+'.png',animations:'disabled'});
 });
}
