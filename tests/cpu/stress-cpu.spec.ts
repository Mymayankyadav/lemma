import {test,expect} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {QA3_ROUTES} from '../../scripts/qa3-report';
import {CPU_CASES,auditCpuMatrix,cpuMatrixTimeoutMs,type CpuRouteSample} from '../../scripts/stress-cpu-coverage';
import {assertRouteLoaded,type ReadinessPhase} from '../e2e/stress-cpu-readiness';

/** AUDIT #540: all 144 S/X x Graph day/night x phone-width x visual-route
 * cells use a NEW DOCUMENT at 4x CPU. The existing ST-0 1x hash-navigation
 * layout matrix remains separate. No render/DOM threshold is relaxed.
 */
const headings:Record<string,string>={
 '/':'Home','/projects':'Paths','/projects/new':'New project',
 '/p/real-analysis':'Project','/p/real-analysis/cp/CP4':'Checkpoint',
 '/s/real-analysis/7':'Session record','/proposals':'Approve',
 '/proposals/proposal-6':'Plan proposal','/review':'Review',
 '/review/run':'Card review','/review/done':'Review complete',
 '/cards':'Cards','/cards/31':'Card detail','/atlas':'Atlas',
 '/insights':'Insights','/settings':'Settings','/sign-in':'Sign in',
 '/kit':'Component kit',
};
for(const matrix of CPU_CASES){
 test('AUDIT #540 cold 4x '+matrix.profile+' '+matrix.theme+' '+matrix.width+'px all 18 routes',
 async({page},testInfo)=>{
  // This watchdog permits collecting every slow extreme route; the audit
  // still rejects each route at >=4,000ms. Never confuse test runtime with
  // the per-route hard performance acceptance threshold.
  test.setTimeout(cpuMatrixTimeoutMs(matrix.profile));
  await page.setViewportSize({width:matrix.width,height:matrix.width===360?740:844});
  await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:''}));
  await page.route('https://fonts.gstatic.com/**',r=>r.fulfill({body:''}));
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  const samples:CpuRouteSample[]=[];
  mkdirSync('test-results/screens/stress-cpu',{recursive:true});
  for(const route of QA3_ROUTES){
   // #hash alone is same-document navigation and cannot certify cold rendering.
   await page.goto('about:blank');
   const start=Date.now();
   const readinessPhases:ReadinessPhase[]=[];
   // The prior diagnostics began only AFTER the heading appeared, obscuring
   // the 50–100s extreme-fixture wait despite fast post-heading checks.
   // These timings are diagnostic only: the original wall clock, real-data
   // assertions and strict 4,000ms budget remain unchanged.
   const measured=async(name:string,check:()=>Promise<unknown>)=>{
    const started=Date.now();
    try {await check();}
    finally {readinessPhases.push({name,elapsedMs:Date.now()-started});}
   };
   await measured('document-navigation',()=>page.goto(
    '/lemma/?demo='+matrix.profile+'&theme='+matrix.theme+'#'+route,{
     waitUntil:'domcontentloaded',timeout:90_000,
    }));
   // A query label is not proof that the intended Graph world rendered.
   await measured('theme-ready',()=>expect(page.locator('html'))
    .toHaveAttribute('data-theme',matrix.theme,{timeout:90_000}));
   await measured('heading-ready',()=>expect(page.getByRole('heading',{
    name:headings[route],exact:true,level:1,
   })).toBeVisible({timeout:90_000}));
   // A heading and >40 text characters can be visible on an empty skeleton.
   // Wait for the route's actual S/X data and paint BEFORE stopping the clock.
   let ready=false;
   try {
    await assertRouteLoaded(page,route,matrix.profile,12_000,readinessPhases);
    ready=true;
   } catch (error) {
    // A failed cold route must identify the precise fixture and loaded state;
    // otherwise a cancelled long matrix hides the first actionable failure.
    const diagnostic=await page.evaluate(()=>({
     route:location.hash.slice(1),
     skeletons:document.querySelectorAll('.animate-pulse.bg-fill-2').length,
     cardRows:document.querySelectorAll('[data-card-row]').length,
     mainText:document.querySelector('#main-content')?.textContent?.slice(0,180)??'',
    })).catch(()=>null);
    console.error('[AUDIT #540 cold 4x route failure]',JSON.stringify({
     ...matrix,route,elapsedMs:Date.now()-start,readinessPhases,diagnostic,
    }));
    throw error;
   }
   const paintStarted=Date.now();
   await page.evaluate(()=>new Promise<void>(resolve=>
    requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
   readinessPhases.push({name:'two-paint-frames',elapsedMs:Date.now()-paintStarted});
   const durationMs=Date.now()-start;
   // Diagnostic only: distinguish actual browser navigation/paint work from
   // Playwright's cross-process polling and loaded-state assertions. FCP is
   // NOT data-backed readiness, and cannot certify the strict 4000ms gate.
   // The private goal-paint mark is present only on builds that instrument it.
   const browserTiming=await page.evaluate(()=>{
    const nav=performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming|undefined;
    const fcp=performance.getEntriesByType('paint').find(entry=>
     entry.name==='first-contentful-paint');
    const goal=performance.getEntriesByName('lemma-stress-first-goal-paint','mark').at(-1);
    return {
     elapsedMs:performance.now(),
     navigationResponseEndMs:nav?.responseEnd??null,
     domContentLoadedMs:nav?.domContentLoadedEventEnd??null,
     firstContentfulPaintMs:fcp?.startTime??null,
     firstStressGoalPaintMs:goal?.startTime??null,
    };
   });
   const nodes=await page.locator('*').count();
   const navigationType=await page.evaluate(()=>
    (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming|undefined)?.type??'unknown');
   const screenshot='test-results/screens/stress-cpu/'+matrix.profile+'-'+matrix.theme+'-'+matrix.width+'-'+
    (route==='/'?'today':route.replaceAll('/','-').replace(/^-/,''))+'.png';
   await page.screenshot({path:screenshot,fullPage:false,timeout:30_000});
   console.info('[AUDIT #540 cold 4x route]',JSON.stringify({
    ...matrix,route,durationMs,nodes,navigationType,browserTiming,readinessPhases,
   }));
   samples.push({
    route,actualRoute:await page.evaluate(()=>location.hash.slice(1)),
    profile:matrix.profile,theme:matrix.theme,width:matrix.width,
    cpuThrottle:4,durationMs,navigationType:navigationType==='navigate'?'document':navigationType,
    ready,nodes,screenshot,browserTiming,readinessPhases,
   });
  }
  await cdp.detach();
  mkdirSync('test-results/stress-cpu',{recursive:true});
  const filename='test-results/stress-cpu/'+matrix.profile+'-'+matrix.theme+'-'+matrix.width+'.json';
  writeFileSync(filename,JSON.stringify(samples,null,2));
  await testInfo.attach('4x-cold-route-evidence',{body:JSON.stringify(samples,null,2),contentType:'application/json'});
  expect(auditCpuMatrix(samples,matrix),
   'All 18 routes in this matrix must cold-render under 4000ms with screenshot and DOM evidence')
   .toEqual([]);
 });
}
