import {test,expect} from '@playwright/test';
import {mkdirSync} from 'node:fs';

test.describe.configure({retries:0});

// FIX #656: cold plan-change rendering must retain every required region.
// The independent 144-route FIX #540 matrix enforces the 4x CPU <1500ms
// budget; these eight cases protect the real content during optimization.
for(const profile of ['stress','extreme'] as const)
for(const theme of ['graph','graph-night'] as const)
for(const width of [390,360] as const){
 test('FIX #656 cold plan change retains map, amendments and ideas: '+profile+' '+theme+' '+width,async({page})=>{
  test.setTimeout(120_000);
  await page.setViewportSize({width,height:width===360?740:844});
  await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:''}));
  await page.route('https://fonts.gstatic.com/**',r=>r.fulfill({body:''}));
  await page.addInitScript(()=>{
   const errata=()=>document.querySelector('section[aria-label="Plan errata"]');
   const ideas=()=>document.querySelector('[data-idea-graph] [role="tree"]');
   const map=()=>document.querySelector('[aria-label="Checkpoint prerequisites"]');
   const loaded=()=>!!errata()&&!!ideas()&&!!map();
   const visible=(element:Element|null)=>{
    if(!element)return false;
    const bounds=element.getBoundingClientRect();
    if(bounds.width<=0||bounds.height<=0)return false;
    for(let node:Element|null=element;node;node=node.parentElement){
     const style=getComputedStyle(node);
     if(style.display==='none'||style.visibility==='hidden'||Number(style.opacity)===0)return false;
    }
    return true;
   };
   let scheduled=false;
   const observer=new MutationObserver(()=>{
    if(scheduled||!loaded())return;
    scheduled=true;
    observer.disconnect();
    // A mutation is a DOM commit, not a painted frame. Wait for at least one
    // browser paint and for the real map/errata/Ideas to have visible geometry.
    const afterPaint=()=>requestAnimationFrame(()=>requestAnimationFrame(()=>{
     if(visible(errata())&&visible(ideas())&&visible(map())){
      performance.mark('lemma-proposal-loaded');
     }else{
      afterPaint();
     }
    }));
    afterPaint();
   });
   observer.observe(document,{childList:true,subtree:true});
  });
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  await page.goto('/lemma/?demo='+profile+'&theme='+theme+'#/proposals/proposal-6',{waitUntil:'domcontentloaded',timeout:90_000});
  await expect(page.getByRole('heading',{name:'Plan proposal',level:1})).toBeVisible({timeout:90_000});
  await expect(page.getByRole('heading',{name:'Plan change',level:2})).toBeVisible({timeout:90_000});
  await expect(page.getByRole('region',{name:'Plan errata'})).toBeVisible({timeout:90_000});
  await expect(page.getByRole('region',{name:'Ideas in this plan'}).getByRole('tree',{name:'Ideas in this plan'})).toBeVisible({timeout:90_000});
  await expect(page.getByLabel('Checkpoint prerequisites')).toBeVisible({timeout:90_000});
  await expect(page.getByText('This proposal could not be loaded.')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  expect(await page.locator('*').count()).toBeLessThan(1500);
  await page.waitForFunction(()=>performance.getEntriesByName('lemma-proposal-loaded','mark').length===1,null,{timeout:90_000});
  const readyMs=await page.evaluate(()=>performance.getEntriesByName('lemma-proposal-loaded','mark')[0]?.startTime??NaN);
  console.info('FIX #656 proposal cold 4x',JSON.stringify({profile,theme,width,readyMs}));
  expect(Number.isFinite(readyMs)).toBe(true);
  expect(readyMs,'First real plan map, errata and Ideas at 4x CPU').toBeLessThan(1500);
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});
  await cdp.detach();
  mkdirSync('test-results/screens/fix-656',{recursive:true});
  await page.screenshot({path:'test-results/screens/fix-656/'+profile+'-'+theme+'-'+width+'.png'});
 });
}
