import {test,expect} from '@playwright/test';
import {mkdirSync} from 'node:fs';

for(const profile of ['stress','extreme'] as const)
for(const theme of ['graph','graph-night'] as const)
for(const [width,height] of [[390,844],[360,740]] as const){
 test('LOOK-3a mini Route stays one readable bar: '+profile+' '+theme+' '+width,async({page},testInfo)=>{
  test.setTimeout(120_000);
  await page.setViewportSize({width,height});
  await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}));
  await page.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}));
  await page.goto('/lemma/?demo='+profile+'&theme='+theme+'#/projects',{waitUntil:'domcontentloaded',timeout:90_000});
  await expect(page.getByRole('heading',{name:'Paths',level:1})).toBeVisible({timeout:90_000});
  await expect(page.locator('[data-mini-route]').first()).toBeVisible({timeout:90_000});
  await expect.poll(async()=>page.locator('[data-mini-route]').first().evaluate(bar=>{
   const segments=[...bar.querySelectorAll('[data-stage-segment]')];
   return segments.length>0&&segments.every(segment=>segment.getBoundingClientRect().width>=7.99);
  }),{timeout:15_000}).toBe(true);
  const metrics=await page.locator('[data-mini-route]').evaluateAll(bars=>bars.filter(bar=>{
   const r=bar.getBoundingClientRect();return r.width>0&&r.height>0;
  }).map(bar=>{
   const segments=[...bar.querySelectorAll('[data-stage-segment]')];
   const track=bar.querySelector('[data-stage-bar]')!;
   return {
    width:track.getBoundingClientRect().width,
    totalWidth:segments.reduce((sum,segment)=>sum+segment.getBoundingClientRect().width,0),
    minWidth:Math.min(...segments.map(segment=>segment.getBoundingClientRect().width)),
    count:segments.length,
    ticks:bar.querySelectorAll('[data-mini-tick]').length,
    extraMarks:[...bar.children].filter(child=>child!==track).length,
   };
  }));
  expect(metrics.length).toBeGreaterThan(0);
  for(const m of metrics){
   expect(m.minWidth,'stage capsule minimum width').toBeGreaterThanOrEqual(7.99);
   expect(m.totalWidth,'all groups fit on one bar').toBeLessThanOrEqual(m.width+1);
   expect(m.ticks,'no individual checkpoint ticks').toBe(0);
   expect(m.extraMarks,'no standalone marker outside bar').toBe(0);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  mkdirSync('test-results/screens/look-3a',{recursive:true});
  const path='test-results/screens/look-3a/paths-'+profile+'-'+theme+'-'+width+'.png';
  await page.screenshot({path});
  await testInfo.attach('mini-route-geometry',{body:JSON.stringify(metrics,null,2),contentType:'application/json'});
 });
}
