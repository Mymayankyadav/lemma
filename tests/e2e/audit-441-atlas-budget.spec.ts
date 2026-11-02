import {test,expect} from '@playwright/test';
import {mkdirSync} from 'node:fs';

// Measure a real extreme-profile Atlas route transition, not a screenshot
// counter or an unthrottled Today route. Initial 30k-card fixture load is
// outside this interactive Atlas budget; the fixture remains mounted.
for(const theme of ['graph','graph-night'] as const)
for(const [width,height] of [[390,844],[360,740]] as const){
 test('AUDIT #441 extreme Atlas opens within 2s at 4x CPU, '+theme+' '+width+'px',async({page},testInfo)=>{
  await page.setViewportSize({width,height});
  await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:''}));
  await page.route('https://fonts.gstatic.com/**',r=>r.fulfill({body:''}));
  await page.goto('/lemma/?demo=extreme&theme='+theme+'#/projects',{waitUntil:'domcontentloaded',timeout:90_000});
  await expect(page.getByRole('heading',{name:'Paths',level:1})).toBeVisible({timeout:90_000});
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  try{
   await page.evaluate(()=>{
    (window as typeof window&{__atlasStart:number}).__atlasStart=performance.now();
    location.hash='/atlas';
   });
   await page.waitForFunction(()=>{
    const tree=document.querySelector('[role="tree"][aria-label="Ideas and their links"]');
    return !!tree&&tree.querySelectorAll('[role="treeitem"]').length>0;
   },null,{timeout:90_000});
   const metrics=await page.evaluate(()=>({
    durationMs:performance.now()-(window as typeof window&{__atlasStart:number}).__atlasStart,
    nodes:document.querySelectorAll('*').length,
    overflow:Math.max(0,document.documentElement.scrollWidth-innerWidth),
   }));
   // Keep exact cold-route measurements in the CI artifacts, including
   // successful runs, so variance across Graph themes/phone widths is visible.
   const evidence={...metrics,theme,width,profile:'extreme',cpuThrottle:4};
   await testInfo.attach('atlas-c2-cold-measurement',{
    body:JSON.stringify(evidence,null,2),contentType:'application/json',
   });
   console.info('Atlas C2 cold 4x: '+JSON.stringify(evidence));
   mkdirSync('test-results/screens/audit-441',{recursive:true});
   await page.screenshot({path:'test-results/screens/audit-441/atlas-'+theme+'-'+width+'.png'});
   expect(metrics.nodes,'Atlas DOM element budget').toBeLessThan(1500);
   expect(metrics.overflow,'Atlas horizontal scroll').toBeLessThanOrEqual(1);
   expect(metrics.durationMs,'Atlas first interactive render at 4x CPU').toBeLessThan(2000);
  }finally{
   await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});
   await cdp.detach();
  }
 });
}
