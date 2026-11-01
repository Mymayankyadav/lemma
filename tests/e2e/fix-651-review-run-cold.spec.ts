import {test,expect} from '@playwright/test';

// FIX #651: Review/run must render a real extreme/stress card, not merely
// its shell or a skeleton, within the unchanged 1,500ms cold 4x CPU budget.
// First attempts are authoritative: never turn a slow first paint green by
// retrying it or by starting the clock after fixture hydration.
test.describe.configure({mode:'default',retries:0});
for(const profile of ['stress','extreme'] as const)
for(const theme of ['graph','graph-night'] as const)
for(const [width,height] of [[390,844],[360,740]] as const){
 test('FIX #651 cold Review runner '+profile+' '+theme+' '+width+'px',async({page},testInfo)=>{
  test.setTimeout(90_000);
  await page.setViewportSize({width,height});
  await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}));
  await page.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}));
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  try{
   const started=Date.now();
   await page.goto('/lemma/?demo='+profile+'&theme='+theme+'#/review/run',{
    waitUntil:'domcontentloaded',timeout:90_000,
   });
   const navigationMs=Date.now()-started;
   await expect(page.locator('html')).toHaveAttribute('data-theme',theme,{timeout:60_000});
   const themeReadyMs=Date.now()-started;
   await expect(page.getByRole('heading',{name:'Card review',exact:true,level:1}))
    .toBeVisible({timeout:60_000});
   const headingReadyMs=Date.now()-started;
   await expect(page.locator('[data-review-card-scroll]')).toBeVisible({timeout:60_000});
   const cardReadyMs=Date.now()-started;
   await expect(page.locator('.animate-pulse.bg-fill-2')).toHaveCount(0,{timeout:60_000});
   await page.evaluate(()=>new Promise<void>(resolve=>
    requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
   const durationMs=Date.now()-started;
   const nodes=await page.locator('*').count();
   const browserTiming=await page.evaluate(()=>{
    const nav=performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming|undefined;
    const fcp=performance.getEntriesByType('paint').find(entry=>entry.name==='first-contentful-paint');
    const marks=performance.getEntriesByType('mark')
     .filter(entry=>entry.name.startsWith('review-run-')||entry.name.startsWith('lemma-stress-fixture-'))
     .map(entry=>({name:entry.name,atMs:Math.round(entry.startTime)}));
    const measures=performance.getEntriesByType('measure')
     .filter(entry=>entry.name.startsWith('review-run-')||entry.name.startsWith('lemma-stress-fixture-'))
     .map(entry=>({name:entry.name,durationMs:Math.round(entry.duration)}));
    return {domContentLoadedMs:nav?.domContentLoadedEventEnd??null,firstContentfulPaintMs:fcp?.startTime??null,marks,measures};
   });
   const phases={navigationMs,themeReadyMs,headingReadyMs,cardReadyMs,browserTiming};
   await testInfo.attach('review-run-cold-4x',{
    body:JSON.stringify({profile,theme,width,durationMs,nodes,cpuThrottle:4,firstAttempt:true,phases},null,2),
    contentType:'application/json',
   });
   console.info('FIX #651 Review-run cold 4x: '+JSON.stringify({profile,theme,width,durationMs,nodes,phases}));
   expect(nodes,'Review runner DOM budget').toBeLessThan(1500);
   expect(durationMs,'Review runner first real cold render at 4x CPU').toBeLessThan(1500);
  }finally{
   await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});
   await cdp.detach();
  }
 });
}
