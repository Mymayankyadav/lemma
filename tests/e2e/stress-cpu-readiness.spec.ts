import {test,expect} from '@playwright/test';
import {QA3_ROUTES} from '../../scripts/qa3-report';
import {CPU_CASES,auditCpuMatrix,type CpuRouteSample} from '../../scripts/stress-cpu-coverage';
import {assertRouteLoaded} from './stress-cpu-readiness';

test('AUDIT #540 rejects a 4x Cards skeleton even when heading and text exist',async({page})=>{
 await page.setContent('<main id="main-content"><h1>Cards</h1><p aria-live="polite">50 loaded · more available</p><div class="animate-pulse bg-fill-2">Loading cards</div></main>');
 await expect(assertRouteLoaded(page,'/cards','extreme',200)).rejects.toThrow();
});

test('AUDIT #540 counts delayed real card rows against the unchanged 1500ms limit',async({page})=>{
 await page.setContent('<main id="main-content"><h1>Cards</h1><p aria-live="polite">50 loaded · more available</p><div class="animate-pulse bg-fill-2">Loading cards</div></main>');
 const started=Date.now();
 await page.evaluate(()=>{
  setTimeout(()=>{
   const main=document.querySelector('#main-content');
   if(main)main.innerHTML='<h1>Cards</h1><p aria-live="polite">50 loaded · more available</p><div data-card-virtual-list><a data-card-row href="#/cards/30000">Real loaded card</a></div>';
  },1700);
 });
 await assertRouteLoaded(page,'/cards','extreme',4000);
 const durationMs=Date.now()-started;
 expect(durationMs).toBeGreaterThanOrEqual(1500);
 const matrix=CPU_CASES.find(c=>c.profile==='extreme'&&c.theme==='graph'&&c.width===360)!;
 const samples:CpuRouteSample[]=QA3_ROUTES.map(route=>({
  route,actualRoute:route,profile:matrix.profile,theme:matrix.theme,width:matrix.width,
  cpuThrottle:4,durationMs:route==='/cards'?durationMs:100,
  navigationType:'document',ready:true,nodes:300,screenshot:'test-results/screens/'+route+'.png',
 }));
 expect(auditCpuMatrix(samples,matrix)).toContain('/cards [extreme/graph/360]: 4x CPU first render >= 1.5s');
});


test('AUDIT #540 accepts the component-kit skeleton example as real gallery content',async({page})=>{
 await page.setContent('<main id="main-content"><h2>Surfaces</h2><div class="animate-pulse bg-fill-2">Skeleton example</div></main>');
 await assertRouteLoaded(page,'/kit','stress',250);
});
