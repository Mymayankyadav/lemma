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
   await expect(page.locator('html')).toHaveAttribute('data-theme',theme,{timeout:60_000});
   await expect(page.getByRole('heading',{name:'Card review',exact:true,level:1}))
    .toBeVisible({timeout:60_000});
   await expect(page.locator('[data-review-card-scroll]')).toBeVisible({timeout:60_000});
   await expect(page.locator('.animate-pulse.bg-fill-2')).toHaveCount(0,{timeout:60_000});
   await page.evaluate(()=>new Promise<void>(resolve=>
    requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
   const durationMs=Date.now()-started;
   const nodes=await page.locator('*').count();
   await testInfo.attach('review-run-cold-4x',{
    body:JSON.stringify({profile,theme,width,durationMs,nodes,cpuThrottle:4,firstAttempt:true},null,2),
    contentType:'application/json',
   });
   console.info('FIX #651 Review-run cold 4x: '+JSON.stringify({profile,theme,width,durationMs,nodes}));
   expect(nodes,'Review runner DOM budget').toBeLessThan(1500);
   expect(durationMs,'Review runner first real cold render at 4x CPU').toBeLessThan(1500);
  }finally{
   await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});
   await cdp.detach();
  }
 });
}
