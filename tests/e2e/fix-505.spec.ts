import {test,expect} from '@playwright/test';
import {mkdirSync} from 'node:fs';

// A 12px token alone is not sufficient: measure actual visible informative
// labels after Graph styling at the two phone widths and both stress scales.
for(const profile of ['stress','extreme'] as const)
for(const theme of ['graph','graph-night'] as const)
for(const width of [360,390] as const){
 test('FIX #505 informative caption and micro text >=12px: '+profile+' '+theme+' '+width,async({page})=>{
  test.setTimeout(180_000);
  await page.setViewportSize({width,height:width===360?740:844});
  await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:''}));
  await page.route('https://fonts.gstatic.com/**',r=>r.fulfill({body:''}));
  await page.goto('/lemma/?demo='+profile+'&theme='+theme+'#/atlas',{waitUntil:'domcontentloaded',timeout:90_000});
  const routes=[
   {hash:'/atlas',heading:'Atlas'},
   {hash:'/p/real-analysis',heading:'Project'},
   {hash:'/insights',heading:'Insights'},
   {hash:'/review',heading:'Review'},
   {hash:'/proposals',heading:'Approve'},
  ];
  let informative=0;
  for(const route of routes){
   await page.evaluate(hash=>{location.hash=hash},route.hash);
   await expect(page.getByRole('heading',{name:route.heading,level:1,exact:true})).toBeVisible({timeout:90_000});
   const result=await page.evaluate(()=>{
    const labels=[...document.querySelectorAll<HTMLElement>('.text-caption,.text-micro')];
    const visible=labels.filter(el=>{
     const rect=el.getBoundingClientRect(),style=getComputedStyle(el);
     return rect.width>0&&rect.height>0&&style.visibility!=='hidden'&&style.display!=='none'&&!!el.textContent?.trim();
    });
    return {
     count:visible.length,
     bad:visible.filter(el=>parseFloat(getComputedStyle(el).fontSize)<12)
      .map(el=>({text:el.textContent?.trim().slice(0,70),size:getComputedStyle(el).fontSize})),
     overflow:Math.max(0,document.documentElement.scrollWidth-innerWidth),
    };
   });
   informative+=result.count;
   expect(result.bad,'undersized labels on '+route.hash).toEqual([]);
   expect(result.overflow,'horizontal overflow on '+route.hash).toBeLessThanOrEqual(1);
  }
  expect(informative,'test must exercise real informative labels').toBeGreaterThan(0);
  mkdirSync('test-results/screens/fix-505',{recursive:true});
  await page.screenshot({path:'test-results/screens/fix-505/'+profile+'-'+theme+'-'+width+'.png'});
 });
}
