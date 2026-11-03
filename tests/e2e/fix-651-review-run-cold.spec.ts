import {test,expect} from '@playwright/test';

// FIX #651: Review/run must render a real extreme/stress card, not merely
// its shell or a skeleton, within the unchanged 4,000ms cold 4x CPU budget.
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
    // Diagnostic-only: collect the slowest module fetches after the strict
    // first-card duration has already been captured. Do not move the start,
    // add retries, or alter the first-attempt CPU/DOM assertions.
    const topModuleResources=performance.getEntriesByType('resource')
     .filter(entry=>/\.(?:js|ts|tsx)(?:\?|$)/.test(entry.name))
     .sort((a,b)=>b.duration-a.duration).slice(0,12)
     .map(entry=>({path:new URL(entry.name).pathname,
      startMs:Math.round(entry.startTime),durationMs:Math.round(entry.duration),
      transferBytes:(entry as PerformanceResourceTiming).transferSize}));
    return {domContentLoadedMs:nav?.domContentLoadedEventEnd??null,firstContentfulPaintMs:fcp?.startTime??null,marks,measures,topModuleResources};
   });
   const phases={navigationMs,themeReadyMs,headingReadyMs,cardReadyMs,browserTiming};
   await testInfo.attach('review-run-cold-4x',{
    body:JSON.stringify({profile,theme,width,durationMs,nodes,cpuThrottle:4,firstAttempt:true,phases},null,2),
    contentType:'application/json',
   });
   console.info('FIX #651 Review-run cold 4x: '+JSON.stringify({profile,theme,width,durationMs,nodes,phases}));
   // Evidence collection occurs after the strict first-paint clock is frozen.
   await expect(page.locator('[data-review-card-scroll] .review-front')).not.toBeEmpty();
   // Stress/extreme fixtures can select a different project/checkpoint from the\n   // v4 example Real Analysis · CP4. Verify the actual displayed label uses\n   // title case rather than assuming a fixed queue item.\n   const reviewLabel=page.locator('header span.truncate');\n   await expect(reviewLabel).toBeVisible();\n   const labelText=(await reviewLabel.textContent())?.trim()??'';\n   expect(labelText).toMatch(/^.+ · CP\\d+$/);\n   const projectTitle=labelText.split(' · ')[0];\n   expect(projectTitle.split(/\\s+/).every(word=>word.length>0&&word[0]===word[0].toLocaleUpperCase()),\n    'Review-run project display title should be title-cased').toBe(true);
   await testInfo.attach(`review-run-${profile}-${theme}-${width}px`,{
    body:await page.screenshot({fullPage:true}),contentType:'image/png',
   });
   expect(nodes,'Review runner DOM budget').toBeLessThan(1500);
   expect(durationMs,'Review runner first real cold render at 4x CPU').toBeLessThan(4000);
  }finally{
   await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});
   await cdp.detach();
  }
 });
}
