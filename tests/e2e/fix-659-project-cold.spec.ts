import {test,expect} from '@playwright/test';
import {mkdirSync} from 'node:fs';

// FIX #659 Project path must paint real data, not only the h1 or a skeleton.
// Independent of the New project sheet regression, and no retries.
test.describe.configure({retries:0});
for(const profile of ['stress','extreme'] as const)
for(const theme of ['graph','graph-night'] as const)
for(const width of [360,390] as const){
 test('FIX #659 real Project cold 4x: '+profile+' '+theme+' '+width,async({page})=>{
  test.setTimeout(90_000);
  await page.setViewportSize({width,height:width===360?740:844});
  await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}));
  await page.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}));
  await page.addInitScript(()=>{
   let scheduled=false;
   const observer=new MutationObserver(()=>{
    if(scheduled||!document.querySelector('[aria-label="Project timeline"]')||
       !document.querySelector('[aria-label="Stages"] [data-stage-card]'))return;
    scheduled=true;
    observer.disconnect();
    requestAnimationFrame(()=>requestAnimationFrame(()=>performance.mark('lemma-fix-659-project-first-paint')));
   });
   observer.observe(document,{childList:true,subtree:true});
  });
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  await page.goto('/lemma/?demo='+profile+'&theme='+theme+'#/p/real-analysis',{waitUntil:'domcontentloaded',timeout:90_000});
  await expect(page.getByRole('heading',{name:'Project',exact:true,level:1})).toBeVisible({timeout:90_000});
  await expect(page.getByRole('region',{name:'Project timeline'})).toBeVisible();
  await expect(page.getByRole('region',{name:'Stages'})).toBeVisible();
  await expect(page.locator('[data-stage-card]').first()).toBeVisible();
  await page.waitForFunction(()=>performance.getEntriesByName('lemma-fix-659-project-first-paint','mark').length===1);
  const metrics=await page.evaluate(()=>({
   ms:performance.getEntriesByName('lemma-fix-659-project-first-paint','mark')[0].startTime,
   nodes:document.querySelectorAll('*').length,
   panelOpacity:Number(getComputedStyle(document.querySelector('[data-project-tab-panel]')!).opacity),
   overflow:document.documentElement.scrollWidth-innerWidth,
   dataPhases:Object.fromEntries(performance.getEntriesByType('measure')
    .filter(entry=>entry.name.startsWith('lemma-stress-project-'))
    .map(entry=>[entry.name.slice('lemma-stress-project-'.length),Math.round(entry.duration*10)/10]))
  }));
  console.info('FIX #659 cold Project 4x',JSON.stringify({profile,theme,width,...metrics,
   postQueryMs:Math.round((metrics.ms-(metrics.dataPhases.prequery??0)-(metrics.dataPhases.total??0))*10)/10}));
  expect(Number.isFinite(metrics.ms)).toBe(true);
  expect(metrics.ms,'First real Project Route and Stages at 4x CPU').toBeLessThan(1500);
  expect(metrics.nodes).toBeLessThan(1500);
  expect(metrics.panelOpacity,'Cold Project Path is visibly painted, not under a nested fade').toBe(1);
  expect(metrics.overflow).toBeLessThanOrEqual(0);
  mkdirSync('test-results/screens/fix-659',{recursive:true});
  await page.screenshot({path:'test-results/screens/fix-659/project-'+profile+'-'+theme+'-'+width+'.png',animations:'disabled'});
  await cdp.detach();
 });
}

// Deferring the heavy PDF/transcription module must not break the Sources tab.
test('FIX #659 Sources tab stays functional after deferred module loading',async({page})=>{
 await page.goto('/lemma/?demo=stress&theme=graph#/p/real-analysis',{waitUntil:'domcontentloaded'});
 await expect(page.getByRole('region',{name:'Project timeline'})).toBeVisible();
 await page.getByRole('group',{name:'Choose view'}).getByRole('button',{name:/Sources/}).click();
 await expect(page.getByRole('region',{name:'Sources'})).toBeVisible();
 await expect(page.getByRole('group',{name:'Source storage'})).toBeVisible();
 await expect(page.getByText(/Add sources/)).toBeVisible();
 await page.getByRole('group',{name:'Choose view'}).getByRole('button',{name:/Path/}).click();
 await expect(page.getByRole('region',{name:'Stages'})).toBeVisible();
});
