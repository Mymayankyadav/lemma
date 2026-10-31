import {test,expect} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {QA3_ROUTES} from '../../scripts/qa3-report';
import {CPU_CASES,auditCpuMatrix,type CpuRouteSample} from '../../scripts/stress-cpu-coverage';
import {assertRouteLoaded} from './stress-cpu-readiness';

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
  test.setTimeout(600_000);
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
   await page.goto('/lemma/?demo='+matrix.profile+'&theme='+matrix.theme+'#'+route,{
    waitUntil:'domcontentloaded',timeout:90_000,
   });
   await expect(page.getByRole('heading',{name:headings[route],exact:true,level:1}))
    .toBeVisible({timeout:90_000});
   // A heading and >40 text characters can be visible on an empty skeleton.
   // Wait for the route's actual S/X data and paint BEFORE stopping the clock.
   await assertRouteLoaded(page,route,matrix.profile,12_000);
   await page.evaluate(()=>new Promise<void>(resolve=>
    requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
   const durationMs=Date.now()-start;
   const nodes=await page.locator('*').count();
   const navigationType=await page.evaluate(()=>
    (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming|undefined)?.type??'unknown');
   const screenshot='test-results/screens/stress-cpu/'+matrix.profile+'-'+matrix.theme+'-'+matrix.width+'-'+
    (route==='/'?'today':route.replaceAll('/','-').replace(/^-/,''))+'.png';
   await page.screenshot({path:screenshot,fullPage:false,timeout:30_000});
   samples.push({
    route,actualRoute:await page.evaluate(()=>location.hash.slice(1)),
    profile:matrix.profile,theme:matrix.theme,width:matrix.width,
    cpuThrottle:4,durationMs,navigationType:navigationType==='navigate'?'document':navigationType,
    ready:true,nodes,screenshot,
   });
  }
  await cdp.detach();
  mkdirSync('test-results/stress-cpu',{recursive:true});
  const filename='test-results/stress-cpu/'+matrix.profile+'-'+matrix.theme+'-'+matrix.width+'.json';
  writeFileSync(filename,JSON.stringify(samples,null,2));
  await testInfo.attach('4x-cold-route-evidence',{body:JSON.stringify(samples,null,2),contentType:'application/json'});
  expect(auditCpuMatrix(samples,matrix),
   'All 18 routes in this matrix must cold-render under 1500ms with screenshot and DOM evidence')
   .toEqual([]);
 });
}
