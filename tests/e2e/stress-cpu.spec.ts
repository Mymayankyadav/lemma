import {test,expect} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {QA3_ROUTES} from '../../scripts/qa3-report';
import {auditCpuCoverage,type CpuRouteSample} from '../../scripts/stress-cpu-coverage';
import {analyzeQa3Cpu,renderQa3CpuMarkdown} from '../../scripts/qa3-cpu-report';

/** AUDIT #540: a new document, not a cached HashRouter transition, for each route.
 * The existing eight-case ST-0 suite still checks S/X layout and screenshots.
 * This worst-case extreme/night/360px pass adds missing 4x route-specific proof.
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

test('AUDIT #540 all 18 routes cold-render at 4x CPU, extreme/night/360px',async({page},testInfo)=>{
 test.setTimeout(600_000);
 await page.setViewportSize({width:360,height:740});
 await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:''}));
 await page.route('https://fonts.gstatic.com/**',r=>r.fulfill({body:''}));
 const cdp=await page.context().newCDPSession(page);
 await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
 const samples:CpuRouteSample[]=[];
 mkdirSync('test-results/screens/stress-cpu',{recursive:true});
 for(const route of QA3_ROUTES){
  // Explicitly leave the app document before each route. A URL differing only
  // by #hash is same-document navigation and does NOT test a cold first render.
  await page.goto('about:blank');
  const start=Date.now();
  await page.goto('/lemma/?demo=extreme&theme=graph-night#'+route,{
   waitUntil:'domcontentloaded',timeout:90_000,
  });
  await expect(page.getByRole('heading',{name:headings[route],exact:true,level:1}))
   .toBeVisible({timeout:90_000});
  await page.waitForFunction(()=>(document.querySelector('#main-content')?.textContent?.trim().length??0)>40,
   null,{timeout:90_000});
  if(route==='/proposals/proposal-6'){
   await expect(page.getByRole('heading',{name:'Plan change',exact:true,level:2})).toBeVisible();
   await expect(page.getByRole('region',{name:'Plan errata'})).toBeVisible();
   await expect(page.getByRole('region',{name:'Ideas in this plan'})).toBeVisible();
   await expect(page.getByText('This proposal could not be loaded.')).toHaveCount(0);
  }
  const durationMs=Date.now()-start;
  const nodes=await page.locator('*').count();
  const navigationType=await page.evaluate(()=>
   (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming|undefined)?.type??'unknown');
  const screenshot='test-results/screens/stress-cpu/'+
   (route==='/'?'today':route.replaceAll('/','-').replace(/^-/,''))+'.png';
  await page.screenshot({path:screenshot,fullPage:false,timeout:30_000});
  samples.push({
   route,actualRoute:await page.evaluate(()=>location.hash.slice(1)),
   profile:'extreme',theme:'graph-night',width:360,
   cpuThrottle:4,durationMs,navigationType:navigationType==='navigate'?'document':navigationType,
   ready:true,nodes,screenshot,
  });
 }
 await cdp.detach();
 mkdirSync('test-results/stress-cpu',{recursive:true});
 writeFileSync('test-results/stress-cpu/extreme-graph-night-360.json',JSON.stringify(samples,null,2));
 await testInfo.attach('4x-cold-route-evidence',{body:JSON.stringify(samples,null,2),contentType:'application/json'});
 const qa3=analyzeQa3Cpu(samples);
 const markdown=renderQa3CpuMarkdown(qa3);
 mkdirSync('test-results/qa3',{recursive:true});
 writeFileSync('test-results/qa3/cpu-route-report.md',markdown);
 await testInfo.attach('qa3-4x-cold-route-report',{body:markdown,contentType:'text/markdown'});
 const failures=auditCpuCoverage(samples);
 expect(failures,'All routes must have 4x cold render under 1500ms with screenshot and DOM evidence')
  .toEqual([]);
 expect(qa3.status).toBe('PASS');
});
